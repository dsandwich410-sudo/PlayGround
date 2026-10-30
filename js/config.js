import { W, H, PLAINS, FOREST, HILLS, WATER, generateMap } from './mapgen.mjs';

export { W, H, PLAINS, FOREST, HILLS, WATER, generateMap };

export const SIDES = [
  { name: 'ALLIANCE', tag: 'BLUE', color: '#4aa8ff', soft: '#a9d8ff', dark: '#173c5c', glow: 'rgba(74,168,255,.55)' },
  { name: 'COALITION', tag: 'RED', color: '#ff5f4a', soft: '#ffb0a4', dark: '#5c211a', glow: 'rgba(255,95,74,.55)' },
];

export const UNIT_TYPES = {
  INF: {
    key: 'INF', name: 'Infantry', short: 'INF', hp: 100, atk: 31, def: 2, move: 3,
    minRange: 1, maxRange: 1, vision: 4, cost: 20,
    desc: 'Cheap line infantry. Captures cities and fights well in cover.',
  },
  REC: {
    key: 'REC', name: 'Recon', short: 'REC', hp: 70, atk: 21, def: 1, move: 5,
    minRange: 1, maxRange: 1, vision: 7, cost: 30,
    desc: 'Fast scout with exceptional vision. Good for claiming outlying cities.',
  },
  TNK: {
    key: 'TNK', name: 'Armor', short: 'TNK', hp: 140, atk: 49, def: 5, move: 4,
    minRange: 1, maxRange: 1, vision: 3, cost: 55,
    desc: 'Heavy assault unit. Expensive, tough, and strongest in the open.',
  },
  ART: {
    key: 'ART', name: 'Artillery', short: 'ART', hp: 80, atk: 44, def: 2, move: 2,
    minRange: 2, maxRange: 4, vision: 5, cost: 50,
    desc: 'Indirect fire at 2–4 tiles. Cannot shoot on a turn it moved.',
  },
};
export const UNIT_ORDER = ['INF', 'REC', 'TNK', 'ART'];

export const TERRAIN = {
  [PLAINS]: { name: 'Plains', cost: 1, def: 0, colors: ['#33513f', '#375643', '#2f4b3a', '#3b5b47'] },
  [FOREST]: { name: 'Forest', cost: 2, def: 0.15, colors: ['#1d4028', '#20452c', '#1a3923', '#244b30'] },
  [HILLS]: { name: 'Hills', cost: 2, def: 0.22, colors: ['#4f4832', '#554d36', '#49422d', '#5b533b'] },
  [WATER]: { name: 'Water', cost: 99, def: 0, colors: ['#144561', '#123f59', '#174b68', '#103a52'] },
};

export const CITY_DEF = 0.22;
export const HQ_DEF = 0.3;
export const INCOME_CITY = 8;
export const INCOME_HQ = 12;
export const MAX_UNITS = 9;
export const BASE_FUNDS = 80;
export const MAP_SEED = 42;

export const $ = (id) => document.getElementById(id);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const pad2 = (n) => String(n).padStart(2, '0');
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const idx = (x, y) => y * W + x;

export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function rgba(hex, alpha) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function ownerColor(owner) {
  if (owner === 0) return SIDES[0].color;
  if (owner === 1) return SIDES[1].color;
  return '#9aabb2';
}
