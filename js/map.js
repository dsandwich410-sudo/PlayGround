/* ────────────────────────────────────────────────────────────────────────
   FRONTLINE 32 — map generation, terrain rules and pathfinding
   A deterministic procedural river valley on a 32 × 32 grid.
   ──────────────────────────────────────────────────────────────────────── */

export const W = 32;
export const H = 32;
export const MAP_SIZE = W * H;

export const TERRAIN = {
  grass:   { name: 'Open ground', cost: 1, def: 0.05, pass: true },
  sand:    { name: 'River sand',  cost: 1, def: 0.02, pass: true },
  forest:  { name: 'Forest',      cost: 2, def: 0.22, pass: true },
  hills:   { name: 'Hills',       cost: 2, def: 0.30, pass: true },
  mountain:{ name: 'Mountain',    cost: Infinity, def: 0.40, pass: false },
  water:   { name: 'River',       cost: Infinity, def: 0.00, pass: false },
  road:    { name: 'Road',        cost: 1, def: 0.02, pass: true },
  bridge:  { name: 'Bridge',      cost: 1, def: 0.02, pass: true },
  plaza:   { name: 'City',        cost: 1, def: 0.06, pass: true },
};

export const CITY_DEF = { city: 0.32, hq: 0.42 };

export function key(x, y) { return y * W + x; }
export function inBounds(x, y) { return x >= 0 && x < W && y >= 0 && y < H; }

/* ── Seeded randomness ─────────────────────────────────────────────────── */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x, y, seed) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothNoise(x, y, scale, seed) {
  const fx = x / scale, fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

function fractal(x, y, seed) {
  return smoothNoise(x, y, 7, seed) * 0.62 +
         smoothNoise(x, y, 3.2, seed + 7) * 0.28 +
         smoothNoise(x, y, 1.7, seed + 19) * 0.10;
}

/* ── City layout ───────────────────────────────────────────────────────── */
const CITY_BLUEPRINT = [
  { x: 4,  y: 26, name: 'Alder Base',       type: 'hq',   owner: 'player', income: 55 },
  { x: 27, y: 5,  name: 'Vulkan Redoubt',   type: 'hq',   owner: 'enemy',  income: 55 },
  { x: 8,  y: 22, name: 'Millbrook',        type: 'city', owner: null,     income: 35 },
  { x: 6,  y: 12, name: 'Westgate',         type: 'city', owner: null,     income: 35 },
  { x: 16, y: 16, name: 'Meridian',         type: 'city', owner: null,     income: 55, central: true },
  { x: 24, y: 25, name: 'Saltworks',        type: 'city', owner: null,     income: 35 },
  { x: 25, y: 12, name: 'Highpass',         type: 'city', owner: null,     income: 35 },
  { x: 20, y: 6,  name: 'Northgate',        type: 'city', owner: null,     income: 35 },
];

const ROAD_ROUTES = [
  [0, 2], [2, 4], [4, 6], [6, 1], [3, 4], [7, 6], [5, 4], [3, 0],
];

/* ── Generation ───────────────────────────────────────────────────────── */
export function generateMap(seed = (Math.random() * 1e9) | 0) {
  const rnd = mulberry32(seed);
  const tiles = new Array(MAP_SIZE);
  const cities = CITY_BLUEPRINT.map((c, i) => ({ ...c, id: i }));

  const cityAt = new Map();
  for (const c of cities) cityAt.set(key(c.x, c.y), c);

  const distToCity = (x, y, radius) => {
    for (const c of cities) {
      const dx = x - c.x, dy = y - c.y;
      if (dx * dx + dy * dy <= radius * radius) return true;
    }
    return false;
  };

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = fractal(x, y, seed);
      let type = 'grass';
      if (n > 0.665 && rnd() < 0.72) type = 'forest';
      else if (n > 0.585 && rnd() < 0.40) type = 'hills';
      else if (n < 0.285 && rnd() < 0.28) type = 'sand';
      tiles[key(x, y)] = {
        x, y, type,
        v: rnd(),
        v2: rnd(),
        tint: (rnd() - 0.5) * 0.14,
        city: cityAt.get(key(x, y)) || null,
      };
    }
  }

  // A wide, winding river splits the valley north to south.
  let riverX = 16.2;
  for (let y = 0; y < H; y++) {
    riverX += Math.sin(y * 0.42 + 1.25) * 0.34 + (rnd() - 0.5) * 0.55;
    riverX = Math.max(12.5, Math.min(20.5, riverX));
    const cx = Math.round(riverX);
    const width = (y > 5 && y < 27 && hash2(y, 3, seed + 4) > 0.58) ? 2 : 1;
    for (let w = 0; w < width; w++) {
      const tx = cx + w;
      if (!inBounds(tx, y)) continue;
      const t = tiles[key(tx, y)];
      t.type = 'water';
      t.v = rnd();
    }
  }

  // Banks: a thin sand edge makes the water read on small screens.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tiles[key(x, y)];
      if (t.type !== 'grass' && t.type !== 'forest' && t.type !== 'hills') continue;
      let nearWater = false;
      for (let oy = -1; oy <= 1 && !nearWater; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const n = tiles[key(x + ox, y + oy)];
          if (n && n.type === 'water') { nearWater = true; break; }
        }
      }
      if (nearWater && rnd() < 0.78) { t.type = 'sand'; }
    }
  }

  // Mountain ridges in the quiet corners.
  const ridges = [
    { x: 1, y: 2, dir: 0.75, len: 12 },
    { x: 28, y: 28, dir: -2.45, len: 11 },
    { x: 23, y: 1, dir: 1.9, len: 7 },
  ];
  for (const ridge of ridges) {
    let rx = ridge.x, ry = ridge.y;
    for (let i = 0; i < ridge.len; i++) {
      const ix = Math.round(rx), iy = Math.round(ry);
      if (inBounds(ix, iy) && !distToCity(ix, iy, 2.6)) {
        const t = tiles[key(ix, iy)];
        if (t.type !== 'water') t.type = 'mountain';
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = ix + ox, ny = iy + oy;
          if (inBounds(nx, ny) && !distToCity(nx, ny, 2.2)) {
            const nt = tiles[key(nx, ny)];
            if (nt.type === 'grass' || nt.type === 'sand') nt.type = 'hills';
          }
        }
      }
      rx += Math.cos(ridge.dir) * (0.7 + rnd() * 0.8);
      ry += Math.sin(ridge.dir) * (0.7 + rnd() * 0.8);
    }
  }

  // Lakes in two corners add visual anchors and impassable pockets.
  for (const lake of [{ x: 24.5, y: 25.4, r: 2.0 }, { x: 3.2, y: 4.2, r: 1.5 }]) {
    for (let y = Math.floor(lake.y - lake.r - 1); y <= Math.ceil(lake.y + lake.r + 1); y++) {
      for (let x = Math.floor(lake.x - lake.r - 1); x <= Math.ceil(lake.x + lake.r + 1); x++) {
        if (!inBounds(x, y)) continue;
        const d = Math.hypot(x + 0.5 - lake.x, y + 0.5 - lake.y);
        if (d < lake.r + (rnd() - 0.5) * 0.5 && !distToCity(x, y, 2.2)) {
          tiles[key(x, y)].type = 'water';
        }
      }
    }
  }

  // Guarantee a buildable, walkable pocket around every city and HQ.
  for (const c of cities) {
    const radius = c.type === 'hq' ? 2.35 : 1.55;
    for (let y = Math.floor(c.y - radius); y <= Math.ceil(c.y + radius); y++) {
      for (let x = Math.floor(c.x - radius); x <= Math.ceil(c.x + radius); x++) {
        if (!inBounds(x, y)) continue;
        const d = Math.hypot(x - c.x, y - c.y);
        if (d > radius) continue;
        const t = tiles[key(x, y)];
        if (t.type === 'water' || t.type === 'mountain') {
          t.type = d < 1.2 ? 'plaza' : (rnd() < 0.5 ? 'grass' : 'sand');
        }
        if (d < 0.4) t.type = 'plaza';
      }
    }
  }

  const map = {
    seed, W, H, tiles, cities, cityAt,
    size: MAP_SIZE,
    tile(x, y) { return inBounds(x, y) ? tiles[key(x, y)] : null; },
    city(x, y) { return this.cityAt.get(key(x, y)) || null; },
    get(x, y) { return tiles[key(x, y)]; },
    isPassable(x, y) { const t = this.tile(x, y); return !!t && TERRAIN[t.type].pass; },
    moveCost(x, y) { const t = this.tile(x, y); return t ? TERRAIN[t.type].cost : Infinity; },
    defenseAt(x, y) {
      const t = this.tile(x, y);
      if (!t) return 0;
      const c = this.cityAt.get(key(x, y));
      return TERRAIN[t.type].def + (c ? CITY_DEF[c.type] : 0);
    },
  };

  // Roads connect the whole valley. A* may bridge water or cut through hills.
  for (const [a, b] of ROAD_ROUTES) {
    carveRoad(map, cities[a], cities[b], rnd);
  }

  // Small road stubs from each city for a lived-in look (never block).
  for (const c of cities) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (rnd() < 0.55) {
        const x = c.x + dx, y = c.y + dy;
        const t = map.tile(x, y);
        if (t && (t.type === 'grass' || t.type === 'sand')) t.type = 'road';
      }
    }
  }

  // Make sure the city tiles themselves are plazas.
  for (const c of cities) {
    const t = map.get(c.x, c.y);
    t.type = 'plaza';
    t.city = c;
  }

  return map;
}

/* ── Road carving ──────────────────────────────────────────────────────── */
const ROAD_COST = { grass: 1, sand: 1.1, forest: 2.7, hills: 2.8, mountain: 8, water: 15, plaza: 1, road: 0.55, bridge: 0.55 };

function carveRoad(map, a, b, rnd) {
  if (!a || !b) return;
  const start = key(a.x, a.y), goal = key(b.x, b.y);
  const open = [{ k: start, g: 0, f: 0 }];
  const came = new Map();
  const cost = new Map([[start, 0]]);
  const closed = new Set();

  const h = (x, y) => Math.abs(x - b.x) + Math.abs(y - b.y) + rnd() * 0.01;

  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
    const cur = open.splice(best, 1)[0];
    if (cur.k === goal) break;
    if (closed.has(cur.k)) continue;
    closed.add(cur.k);
    const cx = cur.k % W, cy = (cur.k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      const t = map.get(nx, ny);
      let step = ROAD_COST[t.type] ?? 1;
      if (t.city) step = 0.55;
      const g = cur.g + step;
      if (g < (cost.get(nk) ?? Infinity)) {
        cost.set(nk, g);
        came.set(nk, cur.k);
        open.push({ k: nk, g, f: g + h(nx, ny) });
      }
    }
  }

  let k = goal;
  const path = [];
  let guard = 0;
  while (k !== undefined && guard++ < MAP_SIZE * 2) {
    path.push(k);
    if (k === start) break;
    k = came.get(k);
  }
  for (const pk of path) {
    const x = pk % W, y = (pk / W) | 0;
    const t = map.get(x, y);
    if (t.city) { t.type = 'plaza'; continue; }
    if (t.type === 'water') t.type = 'bridge';
    else if (t.type === 'mountain') t.type = 'hills';
    else if (t.type !== 'road' && t.type !== 'bridge') t.type = 'road';
  }
}

/* ── Movement / distance helpers ───────────────────────────────────────── */
export function reachable(map, unit, budget, blocked) {
  const start = key(unit.x, unit.y);
  const out = new Map([[start, { k: start, x: unit.x, y: unit.y, cost: 0, prev: null }]]);
  const open = [{ k: start, x: unit.x, y: unit.y, cost: 0, prev: null }];
  const best = new Map([[start, 0]]);

  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.cost > (best.get(cur.k) ?? Infinity)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      const nk = key(nx, ny);
      const t = map.get(nx, ny);
      const def = TERRAIN[t.type];
      if (!def.pass) continue;
      if (blocked && blocked.has(nk) && nk !== start) continue;
      const nc = cur.cost + def.cost;
      if (nc > budget) continue;
      if (nc < (best.get(nk) ?? Infinity)) {
        best.set(nk, nc);
        const node = { k: nk, x: nx, y: ny, cost: nc, prev: cur.k };
        out.set(nk, node);
        open.push(node);
      }
    }
  }
  return out;
}

export function pathTo(reach, targetKey) {
  const path = [];
  let k = targetKey;
  let guard = 0;
  while (k !== null && k !== undefined && guard++ < MAP_SIZE * 2) {
    const node = reach.get(k);
    if (!node) break;
    path.push({ x: node.x, y: node.y, cost: node.cost });
    if (node.prev === null) break;
    k = node.prev;
  }
  return path.reverse();
}

export function distanceField(map, targets, blocked) {
  const dist = new Float32Array(MAP_SIZE).fill(Infinity);
  const open = [];
  for (const t of targets) {
    if (!inBounds(t.x, t.y)) continue;
    const k = key(t.x, t.y);
    if (dist[k] > 0) { dist[k] = 0; open.push({ x: t.x, y: t.y, cost: 0 }); }
  }
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.cost > dist[key(cur.x, cur.y)]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (!inBounds(nx, ny)) continue;
      const t = map.get(nx, ny);
      const def = TERRAIN[t.type];
      if (!def.pass) continue;
      const nk = key(nx, ny);
      if (blocked && blocked.has(nk)) continue;
      const nc = cur.cost + def.cost;
      if (nc < dist[nk]) { dist[nk] = nc; open.push({ x: nx, y: ny, cost: nc }); }
    }
  }
  return dist;
}

/* ── Starting positions ────────────────────────────────────────────────── */
export const START_LAYOUT = {
  player: [
    { type: 'inf',   dx: -1, dy: 1 },
    { type: 'inf',   dx: 1,  dy: 0 },
    { type: 'tank',  dx: -1, dy: -1 },
    { type: 'arty',  dx: 1,  dy: 1 },
  ],
  enemy: [
    { type: 'inf',   dx: -1, dy: 1 },
    { type: 'inf',   dx: 1,  dy: 0 },
    { type: 'tank',  dx: 1,  dy: -1 },
    { type: 'arty',  dx: -1, dy: -1 },
  ],
};

export function spawnTiles(map, side) {
  const hq = map.cities.find(c => c.type === 'hq' && c.owner === side);
  const list = START_LAYOUT[side];
  const out = [];
  for (const s of list) {
    let x = hq.x + s.dx, y = hq.y + s.dy;
    if (!map.isPassable(x, y) || map.city(x, y)) {
      let found = false;
      for (let r = 1; r <= 4 && !found; r++) {
        for (let oy = -r; oy <= r && !found; oy++) {
          for (let ox = -r; ox <= r && !found; ox++) {
            const nx = hq.x + ox, ny = hq.y + oy;
            if (map.isPassable(nx, ny) && !map.city(nx, ny)) {
              x = nx; y = ny; found = true;
            }
          }
        }
      }
    }
    out.push({ type: s.type, x, y });
  }
  return out;
}
