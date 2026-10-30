// Pure game rules for Satoru Gojo: Infinity Clicker.
// Kept free of DOM access so the balance can be tested and tuned in Node.

export const CFG = {
  hpBase: 10,
  hpGrowth: 1.38,
  hpLinear: 8,
  energyPerDamage: 0.6,
  critBaseChance: 0.04,
  critChancePerLevel: 0.04,
  critBaseMult: 2.2,
  critMultPerLevel: 0.12,
  comboStep: 0.01,
  comboCap: 80,
  domainPerHit: 1.15,
  domainPerKill: 10,
  domainMax: 100,
  domainDuration: 8,
  domainTick: 0.2,
  domainMultiplier: 1.8,
  blackFlashBase: 0.035,
  blackFlashPerCombo: 0.0011,
  blackFlashMax: 0.2,
  coreBonus: 1.5,
  tiltBonus: 1.35,
  coreRadius: 0.62,
  tapRateAssumption: 3.2,
};

export const UPGRADES = [
  {
    id: 'power',
    name: 'Cursed Output',
    tag: 'TAP',
    desc: 'Raw cursed energy behind every strike.',
    effect: '+50% tap damage',
    baseCost: 28,
    growth: 1.7,
    max: 80,
  },
  {
    id: 'focus',
    name: 'Six Eyes',
    tag: 'CRIT',
    desc: 'See the flow of cursed energy itself.',
    effect: '+4% critical chance',
    baseCost: 85,
    growth: 1.9,
    max: 12,
  },
  {
    id: 'flow',
    name: 'Limitless',
    tag: 'AUTO',
    desc: 'Infinity strikes while you breathe.',
    effect: '+auto damage / sec',
    baseCost: 120,
    growth: 1.8,
    max: 40,
  },
  {
    id: 'chain',
    name: 'Blue Pull',
    tag: 'COMBO',
    desc: 'Technique amplifies an unbroken chain.',
    effect: '+18% combo scaling',
    baseCost: 220,
    growth: 2.0,
    max: 15,
  },
];

export const CURSE_NAMES = [
  ['Fly Head', 'GRADE 4'],
  ['Curse Womb', 'GRADE 4'],
  ['Rot Hound', 'GRADE 3'],
  ['Veil Maw', 'GRADE 3'],
  ['Finger Bearer', 'GRADE 2'],
  ['Cursed Canvas', 'GRADE 2'],
  ['Mirror Wraith', 'GRADE 1'],
  ['Grade One Curse', 'GRADE 1'],
  ['SPECIAL GRADE', 'SPECIAL'],
];

export function getUpgrade(id) {
  return UPGRADES.find((u) => u.id === id);
}

export function upgradeCost(id, level) {
  const def = getUpgrade(id);
  if (!def) throw new Error(`Unknown upgrade: ${id}`);
  return Math.round(def.baseCost * Math.pow(def.growth, Math.max(0, level)));
}

export function tapDamage(upgrades) {
  return Math.pow(1.5, upgrades.power || 0);
}

export function autoDps(upgrades) {
  return tapDamage(upgrades) * (upgrades.flow || 0) * 0.25;
}

export function critChance(upgrades) {
  return Math.min(0.65, CFG.critBaseChance + (upgrades.focus || 0) * CFG.critChancePerLevel);
}

export function critMultiplier(upgrades) {
  return CFG.critBaseMult + (upgrades.focus || 0) * CFG.critMultPerLevel;
}

export function comboMultiplier(combo, upgrades) {
  const scale = 1 + (upgrades.chain || 0) * 0.18;
  return 1 + Math.min(combo, CFG.comboCap) * CFG.comboStep * scale;
}

export function blackFlashChance(combo) {
  return Math.min(CFG.blackFlashMax, CFG.blackFlashBase + combo * CFG.blackFlashPerCombo);
}

export function curseMaxHp(level) {
  return Math.round(CFG.hpBase * Math.pow(CFG.hpGrowth, Math.max(0, level - 1)) + CFG.hpLinear * level);
}

export function killReward(level) {
  return Math.round(10 + level * 5 + curseMaxHp(level) * 0.02);
}

export function curseInfo(level) {
  const idx = Math.min(CURSE_NAMES.length - 1, Math.floor((level - 1) / 3));
  const [name, grade] = CURSE_NAMES[idx];
  return { name, grade, boss: level % 5 === 0, index: idx };
}

export function domainReady(charge) {
  return charge >= CFG.domainMax;
}

export function statsFor(upgrades) {
  return {
    tap: tapDamage(upgrades),
    dps: autoDps(upgrades),
    crit: critChance(upgrades),
    critMult: critMultiplier(upgrades),
    comboScale: 1 + (upgrades.chain || 0) * 0.18,
  };
}

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd'];

export function formatNumber(value) {
  if (!Number.isFinite(value)) return '∞';
  const n = Math.max(0, value);
  if (n < 1000) {
    return n < 10 && n % 1 !== 0 ? n.toFixed(1) : Math.floor(n).toString();
  }
  let tier = Math.floor(Math.log10(n) / 3);
  tier = Math.min(tier, SUFFIXES.length - 1);
  let scaled = n / Math.pow(1000, tier);
  const decimals = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  let text = scaled.toFixed(decimals);
  if (text.includes('.')) text = text.replace(/\.?0+$/, '');
  if (Number(text) >= 1000 && tier < SUFFIXES.length - 1) {
    tier += 1;
    scaled = n / Math.pow(1000, tier);
    text = scaled.toFixed(0);
  }
  return `${text}${SUFFIXES[tier]}`;
}

export function formatCompact(value) {
  return formatNumber(value);
}

export function sanitizeSave(raw, fresh) {
  const base = fresh();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base };
  out.level = clampInt(raw.level, 1, 100000, 1);
  out.energy = clampNum(raw.energy, 0, 1e30, 0);
  out.exorcised = clampInt(raw.exorcised, 0, 1e9, 0);
  out.bestCombo = clampInt(raw.bestCombo, 0, 1e9, 0);
  out.totalDamage = clampNum(raw.totalDamage, 0, 1e30, 0);
  out.upgrades = { ...base.upgrades };
  for (const def of UPGRADES) {
    out.upgrades[def.id] = clampInt(raw.upgrades?.[def.id], 0, def.max, 0);
  }
  out.sound = raw.sound !== false;
  out.tiltPreferred = raw.tiltPreferred === true;
  out.introSeen = raw.introSeen === true;
  out.domainCharge = clampNum(raw.domainCharge, 0, CFG.domainMax, 0);
  out.hp = Math.min(
    curseMaxHp(out.level),
    clampNum(raw.hp, 1, curseMaxHp(out.level), curseMaxHp(out.level)),
  );
  return out;
}

export function freshSave() {
  return {
    level: 1,
    hp: curseMaxHp(1),
    energy: 0,
    exorcised: 0,
    bestCombo: 0,
    totalDamage: 0,
    upgrades: { power: 0, focus: 0, flow: 0, chain: 0 },
    sound: true,
    tiltPreferred: false,
    introSeen: false,
    domainCharge: 0,
  };
}

function clampInt(value, min, max, fallback) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
