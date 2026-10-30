/* ────────────────────────────────────────────────────────────────────────
   FRONTLINE 32 — game rules, turn flow and opponent AI
   ──────────────────────────────────────────────────────────────────────── */

import {
  W, H, MAP_SIZE, TERRAIN, reachable, pathTo, distanceField,
  generateMap, key, spawnTiles,
} from './map.js';

export const UNIT_TYPES = {
  inf: {
    key: 'inf', name: 'Rifle Squad', short: 'INF', category: 'INFANTRY',
    cost: 90, move: 3, atk: 46, def: 22, hp: 100, range: 1, minRange: 1,
    blurb: 'Cheap, sure-footed, holds ground.',
  },
  tank: {
    key: 'tank', name: 'Battle Tank', short: 'ARM', category: 'VEHICLE',
    cost: 220, move: 4, atk: 82, def: 50, hp: 120, range: 1, minRange: 1,
    blurb: 'Heavy punch. Breaks infantry lines.',
  },
  arty: {
    key: 'arty', name: 'Artillery', short: 'ART', category: 'SUPPORT',
    cost: 260, move: 2, atk: 64, def: 10, hp: 90, range: 3, minRange: 2,
    blurb: 'Indirect fire, range 2–3. No counter.',
  },
  scout: {
    key: 'scout', name: 'Recon', short: 'RCN', category: 'RECON',
    cost: 120, move: 5, atk: 34, def: 18, hp: 80, range: 1, minRange: 1,
    blurb: 'Fast flanker. Snatches empty cities.',
  },
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const pad = (n) => String(n).padStart(2, '0');

/* ──────────────────────────────────────────────────────────────────────── */
export class Game extends EventTarget {
  constructor(seed) {
    super();
    this._seed = seed ?? ((Math.random() * 1e9) | 0);
    this.nextId = 1;
    this.started = false;
    this.newGame(this._seed, { intro: true });
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /* ── Setup ───────────────────────────────────────────────────────────── */
  newGame(seed = (Math.random() * 1e9) | 0, { intro = false } = {}) {
    this.seed = seed;
    this.map = generateMap(seed);
    this.units = [];
    this.nextId = 1;
    this.gold = { player: 240, enemy: 240 };
    this.turn = 1;
    this.side = 'player';
    this.busy = false;
    this.over = false;
    this.started = !intro;
    this.selectedId = null;
    this.inspectedId = null;
    this.buildCityId = null;
    this.reach = new Map();
    this.attackTiles = new Map();
    this.hoverTile = null;
    this.stats = {
      attacks: { player: 0, enemy: 0 },
      kills: { player: 0, enemy: 0 },
      captures: { player: 0, enemy: 0 },
      built: { player: 0, enemy: 0 },
      lost: { player: 0, enemy: 0 },
    };
    this.lastEvent = null;

    for (const side of ['player', 'enemy']) {
      for (const s of spawnTiles(this.map, side)) {
        this.units.push(this.makeUnit(s.type, s.x, s.y, side));
      }
    }

    // Start-of-game income + readiness for both sides.
    this.startUpkeep('player', { initial: true });
    this.startUpkeep('enemy', { initial: true });
    this.emit('newgame', { intro, seed });
    this.emit('change');
  }

  makeUnit(type, x, y, side) {
    const t = UNIT_TYPES[type];
    return {
      id: this.nextId++,
      type, side,
      x, y, px: x, py: y,
      hp: t.hp, maxHp: t.hp,
      hasMoved: false,
      hasAttacked: false,
      done: false,
      dead: false,
      deploying: false,
      pathQueue: null,
      facing: side === 'player' ? 1 : -1,
    };
  }

  begin() {
    if (this.started) return;
    this.started = true;
    this.emit('change');
    this.banner('YOUR TURN', `ROUND ${pad(this.turn)} · TAKE THE INITIATIVE`, 'player');
  }

  /* ── Queries ─────────────────────────────────────────────────────────── */
  get selected() { return this.byId(this.selectedId); }
  get inspected() { return this.byId(this.inspectedId); }
  get buildCity() { return this.map.cities.find(c => c.id === this.buildCityId) || null; }

  byId(id) { return this.units.find(u => u.id === id && !u.dead) || null; }
  unitAt(x, y) { return this.units.find(u => !u.dead && u.x === x && u.y === y) || null; }
  sideUnits(side) { return this.units.filter(u => !u.dead && u.side === side); }
  cityUnits(city) { return this.unitAt(city.x, city.y); }
  citiesOf(side) { return this.map.cities.filter(c => c.owner === side); }

  unitState(u) {
    if (!u) return '';
    if (u.done) return 'SPENT';
    if (u.hasMoved) return 'MOVED';
    return 'READY';
  }

  unitName(u) {
    if (!u) return 'Field Command';
    const T = UNIT_TYPES[u.type];
    return u.side === 'player' ? T.name : `Enemy ${T.name}`;
  }

  incomeFor(side) {
    return 10 + this.citiesOf(side).reduce((sum, c) => sum + c.income, 0);
  }

  canAct(u) {
    return !!u && !this.over && !this.busy && this.side === 'player' && u.side === 'player' && !u.done;
  }

  canAttack(a, d) {
    if (!a || !d || a.dead || d.dead || a.side === d.side || a.hasAttacked || a.done) return false;
    const T = UNIT_TYPES[a.type];
    const range = dist(a, d);
    return range >= T.minRange && range <= T.range;
  }

  blockedFor(u) {
    const set = new Set();
    for (const other of this.units) {
      if (other.dead || other.id === u.id) continue;
      set.add(key(other.x, other.y));
    }
    return set;
  }

  /* ── Selection ───────────────────────────────────────────────────────── */
  selectUnit(u) {
    if (!u || u.side !== 'player' || !this.started || this.over) return;
    this.selectedId = u.id;
    this.inspectedId = null;
    this.refreshSelection();
    this.emit('change');
  }

  inspectUnit(u) {
    if (!u) return;
    this.selectedId = null;
    this.inspectedId = u.id;
    this.reach = new Map();
    this.attackTiles = new Map();
    this.emit('change');
  }

  clearSelection() {
    this.selectedId = null;
    this.inspectedId = null;
    this.reach = new Map();
    this.attackTiles = new Map();
    this.emit('change');
  }

  refreshSelection() {
    const u = this.selected;
    this.reach = new Map();
    this.attackTiles = new Map();
    if (!u || this.side !== 'player' || this.over) return;
    const T = UNIT_TYPES[u.type];
    if (!u.hasMoved && !u.done) {
      this.reach = reachable(this.map, u, T.move, this.blockedFor(u));
    }
    if (!u.hasAttacked && !u.done) {
      for (const e of this.sideUnits('enemy')) {
        const range = dist(u, e);
        if (range >= T.minRange && range <= T.range) {
          this.attackTiles.set(key(e.x, e.y), e);
        }
      }
    }
  }

  isReachable(x, y) {
    const u = this.selected;
    if (!u || u.hasMoved) return false;
    if (x === u.x && y === u.y) return false;
    return this.reach.has(key(x, y));
  }

  isAttackable(x, y) {
    return this.attackTiles.has(key(x, y));
  }

  /* ── Touch / tap routing ─────────────────────────────────────────────── */
  tap(x, y) {
    if (!this.started || this.over || this.busy || this.side !== 'player') return;
    if (!this.map.tile(x, y)) return;
    const u = this.unitAt(x, y);
    const city = this.map.city(x, y);
    const sel = this.selected;

    if (sel) {
      if (u && u.side === 'enemy') {
        if (this.canAttack(sel, u)) { this.playerAttack(sel, u); return; }
        this.emit('toast', { text: 'Out of range — move closer or reposition.', kind: 'warn' });
        return;
      }
      if (u && u.side === 'player') {
        if (u.id === sel.id) return;
        this.selectUnit(u);
        return;
      }
      if (this.isReachable(x, y)) { this.playerMove(sel, x, y); return; }
      if (city && city.owner === 'player' && !u) {
        this.openBuild(city);
        return;
      }
      if (u && u.side === 'player') { this.selectUnit(u); return; }
      this.clearSelection();
      return;
    }

    if (u && u.side === 'player') { this.selectUnit(u); return; }
    if (u && u.side === 'enemy') { this.inspectUnit(u); return; }
    if (city && city.owner === 'player') {
      if (!u) this.openBuild(city);
      else this.emit('toast', { text: 'City garrison is full.', kind: 'warn' });
      return;
    }
    if (city) {
      this.emit('toast', {
        text: city.owner === 'enemy'
          ? `Enemy-held ${city.name}. Break the garrison to take it.`
          : `${city.name} is neutral. Move a unit onto it to capture.`,
        kind: 'warn',
      });
      this.emit('change');
      return;
    }
    this.clearSelection();
  }

  /* ── Movement ────────────────────────────────────────────────────────── */
  async playerMove(u, x, y) {
    if (this.busy || !this.isReachable(x, y)) return;
    const path = pathTo(this.reach, key(x, y));
    if (!path.length) return;
    this.busy = true;
    this.emit('change');
    const captured = await this.performMove(u, path);
    if (this.over) { this.busy = false; return; }

    u.hasMoved = true;
    if (captured) {
      u.done = true;
      this.clearSelection();
      this.busy = false;
      this.emit('change');
      return;
    }

    this.refreshSelection();
    if (this.attackTiles.size === 0) {
      u.done = true;
      this.clearSelection();
    } else {
      this.emit('toast', { text: 'Target in range — tap an enemy to fire.', kind: 'good' });
      this.emit('change');
    }
    this.busy = false;
    this.emit('change');
  }

  async performMove(u, path) {
    const dest = path[path.length - 1];
    u.pathQueue = path.slice(1);
    u.moving = true;
    this.emit('fx', { kind: 'move', unitId: u.id, path: path.map(p => ({ x: p.x, y: p.y })) });
    const travel = Math.max(130, (path.length - 1) * 78 + 90);
    await sleep(travel);
    u.x = dest.x; u.y = dest.y; u.px = dest.x; u.py = dest.y;
    u.pathQueue = null; u.moving = false;
    const city = this.map.city(dest.x, dest.y);
    if (city && city.owner !== u.side) {
      this.captureCity(city, u);
      return true;
    }
    return false;
  }

  captureCity(city, u) {
    const previous = city.owner;
    city.owner = u.side;
    this.stats.captures[u.side]++;
    this.gold[u.side] += 30;
    u.done = true;
    u.hasMoved = true;
    u.hasAttacked = true;
    this.emit('fx', {
      kind: 'capture',
      x: city.x, y: city.y, side: u.side, type: city.type,
      name: city.name,
    });
    this.emit('toast', {
      text: u.side === 'player'
        ? `Captured ${city.name} — sector income secured.`
        : `Enemy captured ${city.name}!`,
      kind: u.side === 'player' ? 'good' : 'bad',
    });
    this.emit('change');

    if (city.type === 'hq') {
      this.endGame(u.side === 'player' ? 'win' : 'lose', `${city.name} has fallen.`);
    }
  }

  /* ── Combat ──────────────────────────────────────────────────────────── */
  damageEstimate(a, d, mult = 1) {
    if (!a || !d) return 0;
    const A = UNIT_TYPES[a.type], D = UNIT_TYPES[d.type];
    const terr = this.map.defenseAt(d.x, d.y);
    const mitigation = 1 - Math.min(0.66, terr * 0.82);
    const armor = 1 - D.def / 230;
    return Math.max(5, Math.round(A.atk * 0.97 * mitigation * armor * mult));
  }

  rollDamage(a, d, mult = 1) {
    const A = UNIT_TYPES[a.type], D = UNIT_TYPES[d.type];
    const terr = this.map.defenseAt(d.x, d.y);
    const mitigation = 1 - Math.min(0.66, terr * 0.82);
    const armor = 1 - D.def / 230;
    const roll = 0.9 + Math.random() * 0.2;
    return Math.max(5, Math.round(A.atk * roll * mitigation * armor * mult));
  }

  async resolveAttack(a, d, { counter = true } = {}) {
    if (!a || !d || a.dead || d.dead) return;
    const ranged = dist(a, d) > 1;
    const A = UNIT_TYPES[a.type];
    this.emit('fx', {
      kind: 'attack',
      from: { x: a.px, y: a.py }, to: { x: d.px, y: d.py },
      side: a.side, type: a.type, ranged,
    });
    this.stats.attacks[a.side]++;

    await sleep(ranged ? 190 : 110);
    const dmg = this.rollDamage(a, d);
    d.hp = Math.max(0, d.hp - dmg);
    this.emit('fx', {
      kind: 'damage', x: d.px, y: d.py, amount: dmg,
      side: d.side, target: d.type, targetId: d.id, ranged,
    });

    if (d.hp <= 0) {
      this.killUnit(d, a.side);
    } else if (counter && !ranged && d.type !== 'arty') {
      await sleep(130);
      const back = this.rollDamage(d, a, 0.45);
      a.hp = Math.max(0, a.hp - back);
      this.emit('fx', {
        kind: 'damage', x: a.px, y: a.py, amount: back,
        side: a.side, target: a.type, targetId: a.id, counter: true,
      });
      if (a.hp <= 0) this.killUnit(a, d.side);
    }

    a.hasAttacked = true;
    a.done = true;
    this.checkElimination();
    this.emit('change');
  }

  killUnit(u, bySide) {
    if (u.dead) return;
    u.dead = true;
    this.units = this.units.filter(x => x.id !== u.id);
    if (this.selectedId === u.id) { this.selectedId = null; this.reach = new Map(); this.attackTiles = new Map(); }
    if (this.inspectedId === u.id) this.inspectedId = null;
    this.stats.kills[bySide]++;
    this.stats.lost[u.side]++;
    if (bySide === 'player' && u.side === 'enemy') this.gold.player += 35;
    if (bySide === 'enemy' && u.side === 'player') this.gold.enemy += 35;
    this.emit('fx', { kind: 'death', x: u.px, y: u.py, side: u.side, target: u.type });
    this.emit('toast', {
      text: u.side === 'player'
        ? `${UNIT_TYPES[u.type].name} lost.`
        : `Enemy ${UNIT_TYPES[u.type].name} destroyed.`,
      kind: u.side === 'player' ? 'bad' : 'good',
    });
    this.checkElimination();
  }

  async playerAttack(a, d) {
    if (this.busy || !this.canAttack(a, d)) return;
    this.busy = true;
    this.clearSelection();
    this.emit('change');
    await this.resolveAttack(a, d);
    this.busy = false;
    this.emit('change');
  }

  /* ── Construction ────────────────────────────────────────────────────── */
  openBuild(city) {
    if (!city || city.owner !== 'player' || !this.started || this.over || this.busy || this.side !== 'player') return;
    if (this.unitAt(city.x, city.y)) {
      this.emit('toast', { text: 'Garrison already occupies this city.', kind: 'warn' });
      return;
    }
    this.buildCityId = city.id;
    this.selectedId = null;
    this.inspectedId = null;
    this.reach = new Map();
    this.attackTiles = new Map();
    this.emit('city', { city });
    this.emit('change');
  }

  closeBuild() {
    if (this.buildCityId === null) return;
    this.buildCityId = null;
    this.emit('cityclose');
    this.emit('change');
  }

  buildUnit(cityId, type, { silent = false } = {}) {
    const city = this.map.cities.find(c => c.id === cityId);
    const T = UNIT_TYPES[type];
    if (!city || !T) return false;
    if (this.over || this.busy && !silent) return false;
    if (this.unitAt(city.x, city.y)) return false;
    const side = city.owner;
    if (side !== 'player' && side !== 'enemy') return false;
    if (this.gold[side] < T.cost) {
      if (!silent) this.emit('toast', { text: `Need ◈${T.cost - this.gold[side]} more funds.`, kind: 'warn' });
      return false;
    }
    this.gold[side] -= T.cost;
    const u = this.makeUnit(type, city.x, city.y, side);
    u.done = true;
    u.hasMoved = true;
    u.hasAttacked = true;
    u.deploying = true;
    this.units.push(u);
    this.stats.built[side]++;
    this.emit('fx', { kind: 'spawn', x: city.x, y: city.y, side, unit: type });
    this.emit('change');
    if (!silent) {
      this.emit('toast', { text: `${T.name} deployed at ${city.name}. Ready next turn.`, kind: 'good' });
      this.closeBuild();
    }
    return true;
  }

  /* ── Turn cycle ──────────────────────────────────────────────────────── */
  startUpkeep(side, { initial = false } = {}) {
    const income = this.incomeFor(side);
    this.gold[side] += income;
    let healed = 0;
    for (const u of this.sideUnits(side)) {
      const city = this.map.city(u.x, u.y);
      if (city && city.owner === side && u.hp < u.maxHp) {
        u.hp = Math.min(u.maxHp, u.hp + 25);
        healed++;
        this.emit('fx', { kind: 'heal', x: u.x, y: u.y, side, targetId: u.id });
      }
      u.hasMoved = false;
      u.hasAttacked = false;
      u.done = false;
      u.deploying = false;
      u.pathQueue = null;
    }
    this.emit('upkeep', { side, income, healed, initial });
  }

  async endPlayerTurn() {
    if (!this.started || this.over || this.busy || this.side !== 'player') return;
    this.closeBuild();
    this.clearSelection();
    this.busy = true;
    this.side = 'enemy';
    this.emit('change');
    this.startUpkeep('enemy');
    this.emit('change');
    this.banner('ENEMY TURN', 'OPPOSITION IS MOVING · HOLD THE LINE', 'enemy');
    await sleep(820);
    if (this.over) return;

    await this.runEnemyTurn();
    if (this.over) return;

    this.turn++;
    this.side = 'player';
    this.startUpkeep('player');
    this.busy = false;
    this.emit('change');
    this.banner('YOUR TURN', `ROUND ${pad(this.turn)} · COMMAND IS YOURS`, 'player');
  }

  banner(title, subtitle, side) {
    this.emit('banner', { title, subtitle, side });
  }

  /* ── Opponent AI ─────────────────────────────────────────────────────── */
  async runEnemyTurn() {
    await this.aiDeploy();
    if (this.over) return;

    const order = { arty: 0, tank: 1, scout: 2, inf: 3 };
    const units = [...this.sideUnits('enemy')].sort((a, b) => order[a.type] - order[b.type]);
    for (const u of units) {
      if (this.over) return;
      if (u.dead || u.done) continue;
      await this.aiAct(u);
      this.emit('change');
      if (this.over) return;
      await sleep(240);
    }
  }

  async aiDeploy() {
    const free = this.map.cities.filter(c => c.owner === 'enemy' && !this.unitAt(c.x, c.y));
    if (!free.length) return;
    const counts = { inf: 0, tank: 0, arty: 0, scout: 0 };
    for (const u of this.sideUnits('enemy')) counts[u.type]++;
    let pick = 'inf';
    if (counts.inf < 2) pick = 'inf';
    else if (counts.tank < 2) pick = 'tank';
    else if (counts.arty < 2) pick = 'arty';
    else if (counts.scout < 1) pick = 'scout';
    else pick = 'inf';

    if (this.gold.enemy < UNIT_TYPES[pick].cost) {
      const affordable = ['inf', 'scout', 'tank', 'arty'].find(k => this.gold.enemy >= UNIT_TYPES[k].cost);
      if (!affordable) return;
      pick = affordable;
    }

    // Deploy at the city nearest the player's advance.
    const playerUnits = this.sideUnits('player');
    const front = playerUnits.length
      ? playerUnits.reduce((a, b) => (a.x + a.y < b.x + b.y ? a : b))
      : this.map.cities.find(c => c.owner === 'player');
    const city = free.sort((a, b) => {
      const da = Math.abs(a.x - front.x) + Math.abs(a.y - front.y);
      const db = Math.abs(b.x - front.x) + Math.abs(b.y - front.y);
      return da - db;
    })[0];

    if (this.buildUnit(city.id, pick, { silent: true })) {
      this.emit('fx', { kind: 'deploy', x: city.x, y: city.y, side: 'enemy', unit: pick });
      this.emit('toast', { text: `Enemy deployed ${UNIT_TYPES[pick].name} at ${city.name}.`, kind: 'bad' });
      await sleep(460);
    }
  }

  chooseAIAttack(u) {
    const T = UNIT_TYPES[u.type];
    let best = null, bestScore = -Infinity;
    for (const p of this.sideUnits('player')) {
      const range = dist(u, p);
      if (range < T.minRange || range > T.range) continue;
      const dmg = this.damageEstimate(u, p);
      let score = dmg;
      if (dmg >= p.hp) score += 240;
      if (p.type === 'arty') score += 40;
      if (p.type === 'inf') score += 10;
      const counter = (!range || range === 1) && p.type !== 'arty'
        ? this.damageEstimate(p, u, 0.45) : 0;
      score -= counter * 0.5;
      // Prefer finishing a city garrison, opening the city for capture.
      const city = this.map.city(p.x, p.y);
      if (city && city.owner === 'player') score += 30;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  async aiAct(u) {
    const T = UNIT_TYPES[u.type];
    const playerUnits = this.sideUnits('player');
    const capturable = this.map.cities.filter(c => c.owner !== 'enemy');
    const blocked = this.blockedFor(u);
    const reach = reachable(this.map, u, T.move, blocked);
    const cityField = distanceField(this.map, capturable.length ? capturable : this.citiesOf('player'), null);
    const unitField = distanceField(this.map, playerUnits, null);
    const nearestPlayer = playerUnits.length
      ? Math.min(...playerUnits.map(p => dist(u, p))) : 99;

    let best = null, bestScore = -Infinity;
    for (const node of reach.values()) {
      const k = key(node.x, node.y);
      const city = this.map.city(node.x, node.y);
      let score = 0;

      if (city && city.owner !== 'enemy') {
        score += city.type === 'hq' ? 700 : (city.central ? 150 : 115);
      } else if (city) {
        score += 14;
      }

      score += this.map.defenseAt(node.x, node.y) * 42;
      const cf = cityField[k], uf = unitField[k];
      if (u.type === 'inf' || u.type === 'scout') {
        score += (Number.isFinite(cf) ? -cf * 7.2 : -60);
        score += (Number.isFinite(uf) ? -uf * 1.1 : 0);
      } else if (u.type === 'arty') {
        score += (Number.isFinite(cf) ? -cf * 3.0 : -40);
        score += (Number.isFinite(uf) ? -uf * 4.2 : 0);
      } else {
        score += (Number.isFinite(cf) ? -cf * 3.4 : -40);
        score += (Number.isFinite(uf) ? -uf * 5.6 : 0);
      }

      // What can we hit from this tile?
      for (const p of playerUnits) {
        const range = Math.abs(node.x - p.x) + Math.abs(node.y - p.y);
        if (range < T.minRange || range > T.range) continue;
        const dmg = this.damageEstimate(u, p);
        score += dmg * 1.25;
        if (dmg >= p.hp) score += 210;
        if (p.type === 'arty') score += 34;
        if (range === 1 && p.type !== 'arty') score -= this.damageEstimate(p, u, 0.45) * 0.32;
      }

      if (u.type === 'arty') {
        const closest = playerUnits.length
          ? Math.min(...playerUnits.map(p => Math.abs(node.x - p.x) + Math.abs(node.y - p.y))) : 9;
        if (closest < 2) score -= 110;
        else if (closest > 4) score -= 12;
      }

      if (node.cost === 0) score += 1.5;
      score += Math.random() * 2.2;

      if (score > bestScore) { bestScore = score; best = node; }
    }

    if (!best) { u.done = true; return; }

    if (best.x !== u.x || best.y !== u.y) {
      const path = pathTo(reach, key(best.x, best.y));
      if (path.length > 1) {
        const captured = await this.performMove(u, path);
        this.emit('change');
        if (this.over) return;
        if (captured) { u.done = true; return; }
      }
    }

    const target = this.chooseAIAttack(u);
    if (target) {
      await this.resolveAttack(u, target);
      if (this.over) return;
    } else {
      u.done = true;
    }
    this.emit('change');
  }

  /* ── Finish / victory ────────────────────────────────────────────────── */
  holdUnit() {
    const u = this.selected;
    if (!u || !this.canAct(u)) return;
    u.done = true;
    u.hasMoved = true;
    u.hasAttacked = true;
    this.clearSelection();
    this.emit('change');
  }

  checkElimination() {
    if (this.over) return;
    const enemyUnits = this.sideUnits('enemy');
    const enemyCities = this.citiesOf('enemy');
    const playerUnits = this.sideUnits('player');
    const playerCities = this.citiesOf('player');
    if (enemyUnits.length === 0 && enemyCities.length === 0) this.endGame('win', 'The opposition is spent.');
    else if (playerUnits.length === 0 && playerCities.length === 0) this.endGame('lose', 'Your command is spent.');
  }

  endGame(result, reason = '') {
    if (this.over) return;
    this.over = true;
    this.side = 'over';
    this.busy = false;
    this.buildCityId = null;
    this.selectedId = null;
    this.inspectedId = null;
    this.reach = new Map();
    this.attackTiles = new Map();
    const enemyUnits = this.sideUnits('enemy');
    const playerUnits = this.sideUnits('player');
    const score = this.stats.kills.player * 90 +
      this.stats.captures.player * 150 +
      Math.max(0, 30 - this.turn) * 40 +
      this.gold.player;
    this.emit('gameover', {
      result, reason,
      turns: this.turn,
      score,
      kills: this.stats.kills.player,
      lost: this.stats.lost.player,
      captures: this.stats.captures.player,
      units: playerUnits.length,
      enemyUnits: enemyUnits.length,
      gold: this.gold.player,
    });
    this.emit('change');
  }

  /* ── Camera focus helpers for the UI ─────────────────────────────────── */
  playerHQ() { return this.map.cities.find(c => c.type === 'hq' && c.owner === 'player'); }
  enemyHQ() { return this.map.cities.find(c => c.type === 'hq' && c.owner === 'enemy'); }
}
