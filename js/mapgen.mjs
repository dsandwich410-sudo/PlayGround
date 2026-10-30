// Deterministic, 180°-rotationally symmetric battlefield generator.
export const W = 32;
export const H = 32;

export const PLAINS = 0;
export const FOREST = 1;
export const HILLS = 2;
export const WATER = 3;

export const HQ_BLUE = { x: 16, y: 27 };
export const HQ_RED = { x: 15, y: 4 };

// Each pair is mirrored through the centre of the field.
export const CITY_PAIRS = [
  [{ x: 10, y: 26 }, { x: 21, y: 5 }],
  [{ x: 7, y: 20 }, { x: 24, y: 11 }],
  [{ x: 15, y: 17 }, { x: 16, y: 14 }],
  [{ x: 6, y: 11 }, { x: 25, y: 20 }],
  [{ x: 16, y: 8 }, { x: 15, y: 23 }],
  [{ x: 11, y: 5 }, { x: 20, y: 26 }],
];

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed, size) {
  const rnd = mulberry32(seed);
  const g = new Float32Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (x, y) => {
    const fx = Math.min(size - 1.001, Math.max(0, x * (size - 1)));
    const fy = Math.min(size - 1.001, Math.max(0, y * (size - 1)));
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = g[y0 * size + x0];
    const b = g[y0 * size + x0 + 1];
    const c = g[(y0 + 1) * size + x0];
    const d = g[(y0 + 1) * size + x0 + 1];
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
}

function fbm(noiseA, noiseB, x, y) {
  return noiseA(x, y) * 0.62 + noiseB(x, y) * 0.38;
}

function idx(x, y) {
  return y * W + x;
}

function passable(t) {
  return t !== WATER;
}

function carvePath(terrain, from, to) {
  // A* that strongly prefers land but will bridge water when necessary.
  const open = [from];
  const came = new Map();
  const gScore = new Map([[from.y * W + from.x, 0]]);
  const key = (n) => n.y * W + n.x;
  const h = (n) => Math.abs(n.x - to.x) + Math.abs(n.y - to.y);
  const closed = new Set();
  while (open.length) {
    let best = 0;
    for (let i = 1; i < open.length; i++) {
      const a = open[i];
      const b = open[best];
      if (gScore.get(key(a)) + h(a) < gScore.get(key(b)) + h(b)) best = i;
    }
    const cur = open.splice(best, 1)[0];
    const ck = key(cur);
    if (closed.has(ck)) continue;
    closed.add(ck);
    if (cur.x === to.x && cur.y === to.y) {
      const path = [cur];
      let c = ck;
      while (came.has(c)) {
        const p = came.get(c);
        path.push(p);
        c = key(p);
      }
      for (const n of path) {
        if (terrain[key(n)] === WATER) terrain[key(n)] = PLAINS;
      }
      return true;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (closed.has(k)) continue;
      const cost = terrain[k] === WATER ? 9 : 1;
      const ng = gScore.get(ck) + cost;
      if (!gScore.has(k) || ng < gScore.get(k)) {
        gScore.set(k, ng);
        came.set(k, cur);
        open.push({ x: nx, y: ny });
      }
    }
  }
  return false;
}

function mirrorTile(terrain, x, y, value) {
  terrain[idx(x, y)] = value;
  terrain[idx(W - 1 - x, H - 1 - y)] = value;
}

export function generateMap(seed = 70421) {
  const rnd = mulberry32(seed);
  const nA = makeNoise(seed, 9);
  const nB = makeNoise(seed ^ 0x9e3779b9, 15);
  const nC = makeNoise(seed ^ 0x51ed270b, 6);
  const terrain = new Uint8Array(W * H);
  const elev = new Float32Array(W * H);
  const moist = new Float32Array(W * H);
  const basin = new Float32Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Average a tile with its rotational twin so the field is perfectly fair.
      const mx = W - 1 - x;
      const my = H - 1 - y;
      let e = (fbm(nA, nB, x / W, y / H) + fbm(nA, nB, mx / W, my / H)) / 2;
      let m = (fbm(nB, nA, x / W + 0.31, y / H + 0.17) + fbm(nB, nA, mx / W + 0.31, my / H + 0.17)) / 2;
      const b = (nC(x / W, y / H) + nC(mx / W, my / H)) / 2;
      // Gentle central ridge line running NE-SW.
      const ridge = Math.exp(-Math.pow((x + y - 31) / 7.5, 2));
      e += ridge * 0.08;
      elev[idx(x, y)] = e;
      moist[idx(x, y)] = m;
      basin[idx(x, y)] = b;
    }
  }

  // Percentile classification keeps every seed readable: lakes, ridges, woods.
  const sortedElev = Array.from(elev).sort((a, b) => a - b);
  const sortedBasin = Array.from(basin).sort((a, b) => a - b);
  const sortedMoist = Array.from(moist).sort((a, b) => a - b);
  const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  const waterCut = pct(sortedBasin, 0.12);
  const hillCut = pct(sortedElev, 0.85);
  const forestCut = pct(sortedMoist, 0.72);
  for (let i = 0; i < W * H; i++) {
    let t = PLAINS;
    if (basin[i] < waterCut) t = WATER;
    else if (elev[i] > hillCut) t = HILLS;
    else if (moist[i] > forestCut) t = FOREST;
    terrain[i] = t;
  }

  // A little scattered roughness so open ground does not read as empty.
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (terrain[idx(x, y)] !== PLAINS) continue;
      if (rnd() < 0.018 && terrain[idx(x + 1, y)] === PLAINS) {
        mirrorTile(terrain, x, y, FOREST);
      }
    }
  }

  const cities = [];
  for (const [a, b] of CITY_PAIRS) {
    cities.push({ x: a.x, y: a.y, hq: false });
    cities.push({ x: b.x, y: b.y, hq: false });
  }
  // Clear city footprints and HQ compounds.
  for (const c of cities) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = Math.max(0, Math.min(W - 1, c.x + dx));
        const y = Math.max(0, Math.min(H - 1, c.y + dy));
        terrain[idx(x, y)] = PLAINS;
      }
    }
  }
  for (const hq of [HQ_BLUE, HQ_RED]) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.max(0, Math.min(W - 1, hq.x + dx));
        const y = Math.max(0, Math.min(H - 1, hq.y + dy));
        if (Math.abs(dx) + Math.abs(dy) <= 3) terrain[idx(x, y)] = PLAINS;
      }
    }
  }

  // Guarantee every objective can be reached from both headquarters.
  for (const target of cities) {
    carvePath(terrain, HQ_BLUE, target);
    carvePath(terrain, HQ_RED, target);
  }

  // Reapply clearing in case a carved path cut through a compound.
  for (const c of cities) {
    terrain[idx(c.x, c.y)] = PLAINS;
  }

  return {
    seed,
    terrain,
    cities: cities.map((c, i) => ({ id: i, x: c.x, y: c.y, hq: false, owner: -1 })),
    hq: [
      { id: 'hq0', x: HQ_BLUE.x, y: HQ_BLUE.y, hq: true, owner: 0 },
      { id: 'hq1', x: HQ_RED.x, y: HQ_RED.y, hq: true, owner: 1 },
    ],
  };
}

export function tileAt(map, x, y) {
  if (x < 0 || y < 0 || x >= W || y >= H) return WATER;
  return map.terrain[idx(x, y)];
}
