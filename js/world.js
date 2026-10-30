import {
  W, H, HILLS, WATER, generateMap,
  UNIT_TYPES, TERRAIN, CITY_DEF, HQ_DEF, INCOME_CITY, INCOME_HQ,
  BASE_FUNDS, MAP_SEED, clamp, idx, manhattan,
} from './config.js';

/* ------------------------------------------------------------------ */
/*  Camera                                                             */
/* ------------------------------------------------------------------ */

export const view = { w: 0, h: 0, dpr: 1 };
export const cam = { cx: 5, cy: 27, zoom: 0.95, base: 36, shake: 0, tween: null };

export function scale() {
  return cam.base * cam.zoom;
}

export function setViewport(w, h, dpr) {
  view.w = w;
  view.h = h;
  view.dpr = dpr;
  cam.base = clamp(Math.min(w, h) / 10.3, 22, 58);
  clampCam();
}

export function clampCam() {
  const s = scale();
  const halfW = view.w / (2 * s);
  const halfH = view.h / (2 * s);
  const clampAxis = (c, half, size) => (half >= size / 2 ? size / 2 : clamp(c, half - 1.2, size - half + 1.2));
  cam.cx = clampAxis(cam.cx, halfW, W);
  cam.cy = clampAxis(cam.cy, halfH, H);
}

export function screenToTile(sx, sy) {
  const s = scale();
  return { x: (sx - view.w / 2) / s + cam.cx, y: (sy - view.h / 2) / s + cam.cy };
}

export function worldToScreen(wx, wy) {
  const s = scale();
  return { x: view.w / 2 + (wx - cam.cx) * s, y: view.h / 2 + (wy - cam.cy) * s };
}

export function zoomAt(sx, sy, factor) {
  const before = screenToTile(sx, sy);
  cam.zoom = clamp(cam.zoom * factor, 0.55, 2.4);
  cam.tween = null;
  clampCam();
  const after = screenToTile(sx, sy);
  cam.cx += before.x - after.x;
  cam.cy += before.y - after.y;
  clampCam();
}

export function flyTo(cx, cy, zoom = cam.zoom, dur = 420) {
  cam.tween = {
    fromX: cam.cx, fromY: cam.cy, fromZ: cam.zoom,
    toX: cx, toY: cy, toZ: clamp(zoom, 0.55, 2.4),
    start: performance.now(), dur,
  };
}

/* ------------------------------------------------------------------ */
/*  Game state                                                         */
/* ------------------------------------------------------------------ */

export const game = {
  phase: 'menu',            // menu | player | enemy | over
  turn: 1,
  side: 0,
  funds: [BASE_FUNDS, BASE_FUNDS],
  units: [],
  cities: [],
  hq: [],
  terrain: null,
  cityMap: new Map(),
  vis: [new Uint8Array(W * H), new Uint8Array(W * H)],
  seen: new Uint8Array(W * H),
  fogDirty: true,
  sel: null,
  inspect: null,
  recruitCity: null,
  reach: null,
  attackTargets: [],
  hover: null,
  busy: false,
  over: false,
  winner: null,
  started: false,
  seed: MAP_SEED,
  lastGain: 0,
};

let nextId = 1;

export function terrainAt(x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return WATER;
  return game.terrain[idx(x, y)];
}

export function unitAt(x, y) {
  return game.units.find((u) => u.x === x && u.y === y);
}

export function unitById(id) {
  return game.units.find((u) => u.id === id) || null;
}

export function cityAt(x, y) {
  return game.cityMap.get(idx(x, y)) || null;
}

export function makeUnit(type, side, x, y) {
  const def = UNIT_TYPES[type];
  return {
    id: nextId++, type, side, x, y,
    hp: def.hp, maxHp: def.hp,
    moved: false, attacked: false,
    anim: null, born: performance.now(), flash: 0,
  };
}

function safeSpot(x, y) {
  if (terrainAt(x, y) !== WATER && !unitAt(x, y)) return { x, y };
  for (let r = 1; r <= 5; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (terrainAt(nx, ny) !== WATER && !unitAt(nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return { x, y };
}

export function newBattle(seed = MAP_SEED) {
  const map = generateMap(seed);
  game.seed = seed;
  game.terrain = map.terrain;
  game.cities = [
    ...map.cities.map((c, i) => ({ ...c, owner: -1, name: `SECTOR ${String(i + 1).padStart(2, '0')}` })),
    ...map.hq.map((c) => ({ ...c, name: c.owner === 0 ? 'ALLIANCE HQ' : 'COALITION HQ' })),
  ];
  game.cityMap = new Map();
  for (const c of game.cities) game.cityMap.set(idx(c.x, c.y), c);
  game.hq = game.cities.filter((c) => c.hq);

  game.units = [];
  game.turn = 1;
  game.side = 0;
  game.funds = [BASE_FUNDS, BASE_FUNDS];
  game.vis.forEach((v) => v.fill(0));
  game.seen.fill(1);
  game.fogDirty = true;
  game.sel = null;
  game.inspect = null;
  game.recruitCity = null;
  game.reach = null;
  game.attackTargets = [];
  game.busy = false;
  game.over = false;
  game.winner = null;
  game.lastGain = 0;
  nextId = 1;

  const blue = [[18, 26, 'INF'], [17, 25, 'INF'], [19, 27, 'TNK'], [15, 26, 'REC']];
  const red = blue.map(([x, y, t]) => [W - 1 - x, H - 1 - y, t]);
  for (const [x, y, t] of blue) {
    const p = safeSpot(x, y);
    game.units.push(makeUnit(t, 0, p.x, p.y));
  }
  for (const [x, y, t] of red) {
    const p = safeSpot(x, y);
    game.units.push(makeUnit(t, 1, p.x, p.y));
  }

  cam.cx = 16;
  cam.cy = 16;
  cam.zoom = 0.62;
  cam.tween = null;
  clampCam();

  computeVisibility(0);
  computeVisibility(1);
}

/* ------------------------------------------------------------------ */
/*  Visibility                                                         */
/* ------------------------------------------------------------------ */

function markCircle(v, cx, cy, radius) {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(W - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(H - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) v[idx(x, y)] = 1;
    }
  }
}

export function computeVisibility(side) {
  const v = game.vis[side];
  v.fill(0);
  for (const u of game.units) {
    if (u.side !== side) continue;
    const def = UNIT_TYPES[u.type];
    const bonus = terrainAt(u.x, u.y) === HILLS ? 1 : 0;
    markCircle(v, u.x, u.y, def.vision + bonus);
  }
  for (const c of game.cities) {
    if (c.owner === side) markCircle(v, c.x, c.y, c.hq ? 6 : 4);
  }
  if (side === 0) {
    for (let i = 0; i < v.length; i++) if (v[i]) game.seen[i] = 1;
    game.fogDirty = true;
  }
}

export function visibleTo(side, x, y) {
  return game.vis[side][idx(x, y)] === 1;
}

/* ------------------------------------------------------------------ */
/*  Movement & combat maths                                            */
/* ------------------------------------------------------------------ */

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function moveCost(x, y) {
  const t = terrainAt(x, y);
  if (t === WATER) return Infinity;
  return TERRAIN[t].cost;
}

export function computeReach(unit) {
  const max = UNIT_TYPES[unit.type].move;
  const dist = new Float32Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const visited = new Uint8Array(W * H);
  const start = idx(unit.x, unit.y);
  dist[start] = 0;
  const open = [start];
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (dist[open[i]] < dist[open[best]]) best = i;
    const cur = open.splice(best, 1)[0];
    if (visited[cur]) continue;
    visited[cur] = 1;
    const cx = cur % W;
    const cy = (cur / W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = idx(nx, ny);
      if (visited[nk]) continue;
      if (unitAt(nx, ny)) continue;
      const cost = moveCost(nx, ny);
      if (!Number.isFinite(cost)) continue;
      const nd = dist[cur] + cost;
      if (nd <= max && nd < dist[nk]) {
        dist[nk] = nd;
        prev[nk] = cur;
        open.push(nk);
      }
    }
  }
  return { dist, prev, max, start };
}

export function pathFrom(prev, start, dest) {
  const path = [];
  let cur = dest;
  while (cur !== -1 && cur !== start) {
    path.push({ x: cur % W, y: (cur / W) | 0 });
    cur = prev[cur];
  }
  if (cur === -1) return [];
  path.push({ x: cur % W, y: (cur / W) | 0 });
  path.reverse();
  return path;
}

export function inRange(attacker, target) {
  const def = UNIT_TYPES[attacker.type];
  const d = manhattan(attacker, target);
  return d >= def.minRange && d <= def.maxRange;
}

export function getAttackTargets(unit) {
  if (unit.attacked) return [];
  const def = UNIT_TYPES[unit.type];
  if (def.key === 'ART' && unit.moved) return [];
  const v = game.vis[unit.side];
  return game.units.filter((o) => {
    if (o.side === unit.side) return false;
    if (!inRange(unit, o)) return false;
    if (unit.side === 0 && !v[idx(o.x, o.y)]) return false;
    return true;
  });
}

export function canCounter(defender, attacker) {
  if (defender.hp <= 0) return false;
  const d = manhattan(defender, attacker);
  const def = UNIT_TYPES[defender.type];
  if (d < def.minRange || d > def.maxRange) return false;
  if (UNIT_TYPES[attacker.type].key === 'ART' && d > 1) return false;
  return true;
}

export function coverAt(x, y) {
  const city = cityAt(x, y);
  if (city) return city.hq ? HQ_DEF : CITY_DEF;
  return TERRAIN[terrainAt(x, y)].def;
}

export function calcDamage(attacker, defender, counter = false) {
  const A = UNIT_TYPES[attacker.type];
  const D = UNIT_TYPES[defender.type];
  const strength = A.atk * (0.5 + 0.5 * (attacker.hp / attacker.maxHp));
  const cover = clamp(D.def * 0.025 + coverAt(defender.x, defender.y), 0, 0.62);
  let dmg = strength * (1 - cover);
  if (counter) dmg *= 0.55;
  dmg *= 0.92 + Math.random() * 0.16;
  return Math.max(3, Math.round(dmg));
}

/* ------------------------------------------------------------------ */
/*  Queries                                                            */
/* ------------------------------------------------------------------ */

export function unitsOf(side) {
  return game.units.filter((u) => u.side === side);
}

export function citiesOf(side, includeHQ = true) {
  return game.cities.filter((c) => c.owner === side && (includeHQ || !c.hq));
}

export function incomeFor(side) {
  return citiesOf(side).reduce((sum, c) => sum + (c.hq ? INCOME_HQ : INCOME_CITY), 0);
}

export function cityCount(side) {
  return citiesOf(side, false).length;
}

export function allOrdersSpent() {
  const mine = unitsOf(0);
  if (!mine.length) return true;
  return mine.every((u) => u.moved && u.attacked);
}

export function hqOf(side) {
  return game.hq.find((c) => c.owner === side) || null;
}
