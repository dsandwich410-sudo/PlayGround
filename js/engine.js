import {
  W, H, SIDES, UNIT_TYPES, MAX_UNITS, MAP_SEED, pad2, sleep, manhattan, idx, clamp,
} from './config.js';
import {
  game, cam, view, newBattle, unitAt, cityAt, makeUnit, computeVisibility,
  computeReach, pathFrom, getAttackTargets, canCounter, calcDamage, coverAt,
  unitsOf, citiesOf, incomeFor, hqOf, flyTo, zoomAt, visibleTo,
} from './world.js';
import {
  updateAll, showBanner, toast, hideToast, showResult, hideResult, showPause, hidePause,
  openRecruit, closeRecruit, setTiltUI, setSoundUI, els,
} from './ui.js';
import {
  initRender, animateMove, addShake, addTracer, addExplosion, addFloat, addRing,
  addFlash, onFrame,
} from './render.js';
import { Sound, Tilt } from './systems.js';
import { bindInput } from './input.js';

let resultToken = 0;

/* ------------------------------------------------------------------ */
/*  Selection & orders                                                 */
/* ------------------------------------------------------------------ */

function clearSelection() {
  game.sel = null;
  game.inspect = null;
  game.reach = null;
  game.attackTargets = [];
  updateAll();
}

function selectUnit(unit) {
  if (!unit || unit.side !== 0 || game.phase !== 'player' || game.busy || game.over) return;
  if (!game.units.includes(unit)) return;
  game.sel = unit;
  game.inspect = null;
  game.reach = unit.moved ? null : computeReach(unit);
  game.attackTargets = getAttackTargets(unit);
  Sound.select();
  updateAll();
}

function inspectUnit(unit) {
  if (!unit) return;
  game.inspect = unit;
  game.sel = null;
  game.reach = null;
  game.attackTargets = [];
  Sound.click();
  updateAll();
}

function waitSelected() {
  if (!game.sel || game.phase !== 'player' || game.busy) return;
  game.sel.moved = true;
  game.sel.attacked = true;
  Sound.click();
  clearSelection();
}

/* ------------------------------------------------------------------ */
/*  Movement, capture, combat                                          */
/* ------------------------------------------------------------------ */

function captureCity(city, side) {
  if (game.over || city.owner === side) return;
  city.owner = side;
  addRing(city.x, city.y, SIDES[side].color, 0.95, 0.9);
  addExplosion(city.x, city.y, SIDES[side].color, 0.7);
  addFloat(city.x, city.y, side === 0 ? '+' + city.name.split(' ')[1] : 'LOST', SIDES[side].soft, 13);
  Sound.capture();
  game.fogDirty = true;
  if (city.hq) {
    endGame(side);
    return;
  }
  if (side === 0) {
    showBanner('CITY SECURED', 'good', 1300);
    toast('CITY INCOME +◈8 / TURN');
  } else {
    showBanner('CITY LOST', 'enemy', 1300);
    toast(`${city.name} SEIZED BY THE COALITION`);
  }
  updateAll();
}

async function moveUnitAlong(unit, path, silent = false) {
  if (!path || path.length < 2) {
    unit.moved = true;
    return;
  }
  if (!silent) Sound.move();
  await animateMove(unit, path);
  unit.moved = true;
  if (UNIT_TYPES[unit.type].key === 'ART') unit.attacked = true;
  const city = cityAt(unit.x, unit.y);
  if (city && city.owner !== unit.side) captureCity(city, unit.side);
  computeVisibility(0);
  computeVisibility(1);
  game.fogDirty = true;
}

async function playerMove(unit, x, y) {
  if (!game.reach) return;
  const dest = idx(x, y);
  if (!Number.isFinite(game.reach.dist[dest])) return;
  const path = pathFrom(game.reach.prev, game.reach.start, dest);
  if (path.length < 2) return;

  game.busy = true;
  game.sel = null;
  game.inspect = null;
  game.reach = null;
  game.attackTargets = [];
  updateAll();

  await moveUnitAlong(unit, path);
  game.busy = false;

  if (game.over) { updateAll(); return; }
  if (game.units.includes(unit) && unit.hp > 0) {
    selectUnit(unit);
    if (game.attackTargets.length) toast('TARGET IN RANGE · TAP THE MARKED UNIT');
    else if (unit.attacked && unit.moved) toast(`${UNIT_TYPES[unit.type].name.toUpperCase()} IS SPENT`);
  } else {
    clearSelection();
  }
  updateAll();
}

async function resolveAttack(attacker, target) {
  if (!attacker || !target || attacker.attacked || target.hp <= 0 || game.over) return;
  if (!game.units.includes(attacker) || !game.units.includes(target)) return;
  if (!getAttackTargets(attacker).includes(target)) return;

  attacker.attacked = true;
  const type = UNIT_TYPES[attacker.type];
  const isArt = type.key === 'ART';
  const side = SIDES[attacker.side];

  addTracer(attacker, target, side.soft, isArt ? 'shell' : 'line');
  Sound.fire(type.key);
  addShake(isArt ? 5 : 3);
  if (attacker.side === 0 && navigator.vibrate) navigator.vibrate(18);
  updateAll();

  await sleep(isArt ? 250 : 110);

  const dmg = calcDamage(attacker, target);
  target.hp -= dmg;
  addExplosion(target.x, target.y, '#ffc857', 1);
  addFloat(target.x, target.y, `-${dmg}`, '#ffd27a', 15);
  Sound.impact();
  addShake(4);
  if (target.side === 0 && navigator.vibrate) navigator.vibrate(24);
  updateAll();

  await sleep(300);

  if (target.hp <= 0) {
    destroyUnit(target);
  } else if (canCounter(target, attacker)) {
    const cd = calcDamage(target, attacker, true);
    addTracer(target, attacker, SIDES[target.side].soft, 'line');
    await sleep(90);
    attacker.hp -= cd;
    addExplosion(attacker.x, attacker.y, '#ffc857', 0.7);
    addFloat(attacker.x, attacker.y, `-${cd}`, '#ff9c8e', 13);
    Sound.impact();
    addShake(3);
    if (attacker.side === 0 && navigator.vibrate) navigator.vibrate(26);
    await sleep(260);
    if (attacker.hp <= 0) destroyUnit(attacker);
  }

  computeVisibility(0);
  computeVisibility(1);
  checkVictory();
  updateAll();
}

function destroyUnit(unit) {
  if (!unit) return;
  addExplosion(unit.x, unit.y, SIDES[unit.side].color, 1.35);
  addRing(unit.x, unit.y, SIDES[unit.side].color, 0.75, 0.55);
  addFloat(unit.x, unit.y, 'DESTROYED', unit.side === 0 ? '#ff9c8e' : '#ffd27a', 13);
  Sound.explode();
  addShake(6);
  if (navigator.vibrate) navigator.vibrate([18, 30, 18]);
  game.units = game.units.filter((u) => u !== unit);
  if (game.sel === unit) game.sel = null;
  if (game.inspect === unit) game.inspect = null;
  if (unit.side === 0) toast(`${UNIT_TYPES[unit.type].name.toUpperCase()} LOST`);
  game.fogDirty = true;
  checkVictory();
  updateAll();
}

async function playerAttack(unit, target) {
  game.busy = true;
  updateAll();
  await resolveAttack(unit, target);
  game.busy = false;
  if (game.over) { updateAll(); return; }
  if (game.units.includes(unit) && unit.hp > 0) selectUnit(unit);
  else clearSelection();
  updateAll();
}

/* ------------------------------------------------------------------ */
/*  Victory                                                            */
/* ------------------------------------------------------------------ */

function checkVictory() {
  if (game.over) return;
  if (!hqOf(1)) { endGame(0); return; }
  if (!hqOf(0)) { endGame(1); return; }
}

function endGame(winner) {
  if (game.over) return;
  game.over = true;
  game.winner = winner;
  game.phase = 'over';
  game.busy = true;
  game.sel = null;
  game.inspect = null;
  game.reach = null;
  game.attackTargets = [];
  if (game.recruitCity) closeRecruit();
  addFlash(winner === 0 ? '#8ccaff' : '#ff5f4a', 0.32);
  addShake(9);
  if (winner === 0) Sound.victory();
  else Sound.defeat();
  showBanner(winner === 0 ? 'VICTORY' : 'DEFEAT', winner === 0 ? 'good' : 'enemy', 2000);
  updateAll();
  const token = ++resultToken;
  setTimeout(() => {
    if (token === resultToken && game.over) showResult(winner);
  }, 1300);
}

/* ------------------------------------------------------------------ */
/*  Turn flow                                                          */
/* ------------------------------------------------------------------ */

function beginSide(side, { income = true } = {}) {
  game.side = side;
  let gain = 0;
  if (income) {
    gain = incomeFor(side);
    game.funds[side] += gain;
  }
  for (const u of unitsOf(side)) {
    u.moved = false;
    u.attacked = false;
    const city = cityAt(u.x, u.y);
    if (city && city.owner === side && u.hp < u.maxHp) {
      const heal = Math.min(14, u.maxHp - u.hp);
      u.hp += heal;
      if (side === 0) addFloat(u.x, u.y, `+${heal}`, '#66e3a3', 12);
    }
  }
  computeVisibility(side);
  game.fogDirty = true;
  updateAll();
  return gain;
}

function startPlayerTurn(increment) {
  if (increment) game.turn++;
  game.phase = 'player';
  game.busy = false;
  const gain = beginSide(0, { income: true });
  updateAll();
  showBanner(`TURN ${pad2(game.turn)} · ALLIANCE`, 'good', 1500);
  if (gain > 0) setTimeout(() => toast(`+◈${gain} COMMAND CREDITS`), 360);
}

async function endPlayerTurn() {
  if (game.phase !== 'player' || game.busy || game.over) return;
  if (game.recruitCity) closeRecruit();
  game.sel = null;
  game.inspect = null;
  game.reach = null;
  game.attackTargets = [];
  game.phase = 'enemy';
  game.busy = true;
  updateAll();
  showBanner('ENEMY TURN', 'enemy', 1400);
  Sound.turn();
  await sleep(620);
  await runEnemyTurn();
  if (game.over) return;
  game.busy = false;
  startPlayerTurn(true);
}

async function runEnemyTurn() {
  beginSide(1, { income: true });
  await sleep(240);
  aiReinforce();
  updateAll();
  await sleep(260);
  const queue = unitsOf(1);
  for (const unit of queue) {
    if (game.over) return;
    if (!game.units.includes(unit) || unit.hp <= 0) continue;
    await aiAct(unit);
    updateAll();
    await sleep(150);
  }
}

/* ------------------------------------------------------------------ */
/*  Enemy AI                                                           */
/* ------------------------------------------------------------------ */

function aiVisibleEnemies() {
  return game.units.filter((u) => u.side === 0 && game.vis[1][idx(u.x, u.y)] === 1);
}

function aiBestTarget(unit) {
  const list = getAttackTargets(unit).filter((t) => game.vis[1][idx(t.x, t.y)] === 1);
  if (!list.length) return null;
  return list.sort((a, b) => a.hp - b.hp)[0];
}

function aiObjective(unit) {
  const enemies = aiVisibleEnemies();
  let enemy = null;
  let enemyDist = Infinity;
  for (const e of enemies) {
    const d = manhattan(unit, e);
    if (d < enemyDist) { enemyDist = d; enemy = e; }
  }
  let city = null;
  let cityDist = Infinity;
  for (const c of game.cities) {
    if (c.owner === 1) continue;
    let d = manhattan(unit, c);
    if (c.hq) d -= 1.5;
    if (c.owner === 0) d -= 0.75;
    if (d < cityDist) { cityDist = d; city = c; }
  }

  const hq = hqOf(1);
  const threat = enemy && hq && manhattan(enemy, hq) <= 8;
  if (threat && enemy) return { kind: 'unit', x: enemy.x, y: enemy.y };

  if ((unit.type === 'INF' || unit.type === 'REC') && city) {
    if (!enemy || cityDist <= enemyDist + 4) return { kind: 'city', x: city.x, y: city.y };
  }
  if (enemy) return { kind: 'unit', x: enemy.x, y: enemy.y };
  if (city) return { kind: 'city', x: city.x, y: city.y };
  return null;
}

async function aiAct(unit) {
  if (game.over || !game.units.includes(unit) || unit.hp <= 0) return;
  computeVisibility(1);

  const immediate = aiBestTarget(unit);
  if (immediate) {
    await resolveAttack(unit, immediate);
    return;
  }

  const objective = aiObjective(unit);
  if (!objective) return;

  const reach = computeReach(unit);
  let best = null;
  let bestScore = -Infinity;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = idx(x, y);
      const d = reach.dist[k];
      if (!Number.isFinite(d) || d > reach.max) continue;
      if (unitAt(x, y) && !(x === unit.x && y === unit.y)) continue;
      let score = -manhattan({ x, y }, objective) * 10;
      score += coverAt(x, y) * 22;
      const city = cityAt(x, y);
      if (city) score += city.owner === 1 ? 7 : 18;
      if (objective.kind === 'city' && x === objective.x && y === objective.y) score += 500;
      if (unit.type === 'ART') {
        const dd = manhattan({ x, y }, objective);
        if (dd >= 2 && dd <= 4) score += 60;
        else if (dd < 2) score -= 70;
      }
      if (unit.type === 'INF' || unit.type === 'REC') {
        if (city && city.owner !== 1) score += 25;
      }
      if (x === unit.x && y === unit.y) score -= 5;
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
  }

  if (best && (best.x !== unit.x || best.y !== unit.y)) {
    const path = pathFrom(reach.prev, reach.start, idx(best.x, best.y));
    await moveUnitAlong(unit, path, true);
    updateAll();
    await sleep(110);
  }

  if (game.over) return;
  computeVisibility(1);
  const target = aiBestTarget(unit);
  if (target) await resolveAttack(unit, target);
}

function aiReinforce() {
  if (game.over) return;
  if (unitsOf(1).length >= MAX_UNITS) return;
  const spots = citiesOf(1).filter((c) => !unitAt(c.x, c.y));
  if (!spots.length) return;
  if (game.funds[1] < 20) return;

  const units = unitsOf(1);
  let type = 'INF';
  if (game.funds[1] >= 55 && units.filter((u) => u.type === 'TNK').length < 2) type = 'TNK';
  else if (game.funds[1] >= 50 && units.filter((u) => u.type === 'ART').length < 1) type = 'ART';
  else if (game.funds[1] >= 30 && Math.random() < 0.35) type = 'REC';

  const def = UNIT_TYPES[type];
  if (game.funds[1] < def.cost) {
    type = 'INF';
    if (game.funds[1] < UNIT_TYPES.INF.cost) return;
  }

  const blues = unitsOf(0);
  const centre = blues.length
    ? {
        x: blues.reduce((s, u) => s + u.x, 0) / blues.length,
        y: blues.reduce((s, u) => s + u.y, 0) / blues.length,
      }
    : hqOf(0) || { x: W / 2, y: H / 2 };
  const spot = spots.sort((a, b) => manhattan(a, centre) - manhattan(b, centre))[0];

  game.funds[1] -= UNIT_TYPES[type].cost;
  const unit = makeUnit(type, 1, spot.x, spot.y);
  unit.moved = true;
  unit.attacked = true;
  unit.born = performance.now();
  game.units.push(unit);
  addRing(spot.x, spot.y, SIDES[1].color, 0.95, 0.8);
  addExplosion(spot.x, spot.y, SIDES[1].color, 0.6);
  Sound.deploy();
  if (visibleTo(0, spot.x, spot.y)) toast(`COALITION ${UNIT_TYPES[type].name.toUpperCase()} DEPLOYED`);
  updateAll();
}

/* ------------------------------------------------------------------ */
/*  Recruitment                                                        */
/* ------------------------------------------------------------------ */

function openRecruitFor(city) {
  if (game.phase !== 'player' || game.busy || game.over) return;
  if (!city || city.owner !== 0 || unitAt(city.x, city.y)) return;
  game.sel = null;
  game.inspect = null;
  game.reach = null;
  game.attackTargets = [];
  Sound.click();
  openRecruit(city);
}

function buyUnit(typeKey) {
  const city = game.recruitCity;
  if (!city || game.phase !== 'player' || game.busy) return;
  const def = UNIT_TYPES[typeKey];
  if (!def) return;
  if (unitAt(city.x, city.y)) { toast('DEPOT OCCUPIED'); return; }
  if (unitsOf(0).length >= MAX_UNITS) { toast('UNIT CAP REACHED'); return; }
  if (game.funds[0] < def.cost) { toast('INSUFFICIENT COMMAND CREDITS'); return; }

  game.funds[0] -= def.cost;
  const unit = makeUnit(typeKey, 0, city.x, city.y);
  unit.moved = true;
  unit.attacked = true;
  unit.born = performance.now();
  game.units.push(unit);
  addRing(city.x, city.y, SIDES[0].color, 1, 0.75);
  addExplosion(city.x, city.y, SIDES[0].color, 0.6);
  Sound.deploy();
  computeVisibility(0);
  closeRecruit();
  toast(`${def.name.toUpperCase()} DEPLOYED AT ${city.name}`);
  updateAll();
}

/* ------------------------------------------------------------------ */
/*  Tap routing                                                        */
/* ------------------------------------------------------------------ */

async function handleTap(fx, fy) {
  if (!game.started || game.busy || game.over || game.phase !== 'player') return;
  hideToast();
  if (game.recruitCity) { closeRecruit(); return; }

  const x = Math.floor(fx);
  const y = Math.floor(fy);
  if (x < 0 || y < 0 || x >= W || y >= H) { clearSelection(); return; }

  const u = unitAt(x, y);
  const c = cityAt(x, y);
  const sel = game.sel;

  if (sel && game.units.includes(sel)) {
    if (u === sel) { clearSelection(); return; }
    if (u && u.side === 0) { selectUnit(u); return; }
    if (u && u.side === 1 && game.attackTargets.includes(u)) { await playerAttack(sel, u); return; }
    if (!u && game.reach) {
      const k = idx(x, y);
      const d = game.reach.dist[k];
      if (Number.isFinite(d) && d > 0) { await playerMove(sel, x, y); return; }
    }
    if (c && c.owner === 0 && !u) { openRecruitFor(c); return; }
    if (u && u.side === 1 && visibleTo(0, x, y)) { inspectUnit(u); return; }
    if (u && u.side === 1) { toast('ENEMY CONTACT · OUT OF SIGHT'); return; }
    clearSelection();
    return;
  }

  if (u && u.side === 0) { selectUnit(u); return; }
  if (u && u.side === 1 && visibleTo(0, x, y)) { inspectUnit(u); return; }
  if (c && c.owner === 0 && !u) { openRecruitFor(c); return; }
  if (c) {
    const who = c.owner === 0 ? 'ALLIANCE' : c.owner === 1 ? 'COALITION' : 'NEUTRAL';
    toast(`${c.name} · ${c.hq ? 'COMMAND POST' : 'CITY'} · ${who}`);
    return;
  }
  if (u && u.side === 1) { toast('ENEMY CONTACT · OUT OF SIGHT'); return; }
  clearSelection();
}

/* ------------------------------------------------------------------ */
/*  Camera & system actions                                            */
/* ------------------------------------------------------------------ */

function recenter() {
  const u = game.sel;
  const target = u || hqOf(0) || unitsOf(0)[0] || { x: W / 2, y: H / 2 };
  flyTo(target.x + 0.5, target.y + 0.5, cam.zoom, 480);
  Tilt.calibrate();
  Sound.click();
}

function zoomBy(factor) {
  zoomAt(view.w / 2, view.h / 2, factor);
  Sound.click();
}

function minimapJump(tx, ty) {
  flyTo(clamp(tx, 0, W), clamp(ty, 0, H), cam.zoom, 360);
  Sound.click();
}

function toggleTilt() {
  Tilt.toggle().then(() => updateAll());
}

function toggleSound() {
  Sound.init();
  const muted = Sound.toggle();
  setSoundUI(muted);
  if (!muted) Sound.click();
  toast(`AUDIO ${muted ? 'MUTED' : 'ON'}`);
}

function openPause() {
  if (!game.started || game.phase === 'menu') return;
  if (game.phase === 'enemy') { toast('ENEMY COMMAND IN PROGRESS'); return; }
  if (game.over) return;
  if (game.recruitCity) closeRecruit();
  showPause();
  Sound.click();
}

function closePause() {
  hidePause();
  Sound.click();
}

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

function battleFraming() {
  const landscape = view.w > view.h;
  const zoom = landscape ? 0.76 : view.w < 560 ? 0.95 : 0.86;
  const s = cam.base * zoom;
  const half = view.h / (2 * s);
  // Place the alliance line around two-thirds down the screen, above the dock.
  const want = 26 - 0.12 * (view.h / s);
  return { zoom, y: clamp(want, half - 1.2, H - half + 1.2) };
}

function startBattle() {
  resultToken++;
  hideResult();
  hidePause();
  if (game.recruitCity) closeRecruit();
  newBattle(MAP_SEED);
  game.started = true;
  game.over = false;
  game.winner = null;
  game.phase = 'player';
  game.turn = 1;
  game.busy = false;
  els.intro.classList.add('hidden');
  beginSide(0, { income: false });
  game.sel = null;
  game.inspect = null;
  game.reach = null;
  game.attackTargets = [];
  updateAll();
  const frame = battleFraming();
  flyTo(16, frame.y, frame.zoom, 680);
  showBanner('TURN 01 · ALLIANCE', 'good', 1600);
  setTimeout(() => toast('SELECT A BLUE UNIT · DRAG TO PAN'), 500);
  Sound.deploy();
}

function deploy() {
  Sound.init();
  Sound.resume();
  if (!game.started || game.over) startBattle();
  else {
    els.intro.classList.add('hidden');
    game.phase = 'player';
    updateAll();
  }
}

function restart() {
  Sound.init();
  startBattle();
}

const handlers = {
  deploy,
  redeploy: restart,
  restart,
  handleTap,
  endTurn: endPlayerTurn,
  wait: waitSelected,
  deselect: clearSelection,
  closeRecruit: () => { closeRecruit(); Sound.click(); },
  buy: buyUnit,
  openPause,
  closePause,
  toggleTilt,
  toggleSound,
  zoomBy,
  recenter,
  minimapJump,
};

function boot() {
  newBattle(MAP_SEED);
  game.phase = 'menu';
  game.started = false;
  setTiltUI(false);
  setSoundUI(false);
  Tilt.onState = (on) => setTiltUI(on);
  Tilt.onMessage = (msg) => toast(msg);
  updateAll();
  initRender();
  bindInput(handlers);
  onFrame((dt) => Tilt.update(dt));

  window.GRIDFRONT = {
    game,
    cam,
    deploy: startBattle,
    endTurn: endPlayerTurn,
    handlers,
    selectFirst: () => selectUnit(unitsOf(0)[0]),
    tap: handleTap,
    tilt: Tilt,
    sound: Sound,
  };

  // A tiny pause keeps the menu's blurred battlefield calm before deployment.
  requestAnimationFrame(() => {
    if (!game.started) game.phase = 'menu';
  });
}

boot();
