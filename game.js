import {
  CFG,
  UPGRADES,
  freshSave,
  sanitizeSave,
  curseMaxHp,
  curseInfo,
  killReward,
  upgradeCost,
  tapDamage,
  autoDps,
  critChance,
  critMultiplier,
  comboMultiplier,
  blackFlashChance,
  formatNumber,
  formatCompact,
} from './logic.js';
import { drawGojo, GOJO_HAND, GOJO_DESIGN_HEIGHT } from './draw-gojo.js';
import { drawCurse, makeCurseLook } from './draw-curse.js';
import { World } from './draw-world.js';
import { Effects } from './fx.js';
import { Sfx } from './audio.js';
import { clamp, lerp, rgba, glow, TAU, mulberry32 } from './draw-utils.js';

/* ------------------------------------------------------------------ *
 *  Satoru Gojo — Infinity Clicker
 *  Touch-first canvas clicker. All art and audio are procedural.
 * ------------------------------------------------------------------ */

const SAVE_KEY = 'gojo-infinity-clicker-v1';
const TAP_WINDOW = 2.4;
const $ = (id) => document.getElementById(id);
const app = $('app');
const canvas = $('stage');
const ctx = canvas.getContext('2d', { alpha: false });
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);

const ui = {
  energy: $('energyVal'),
  sheetEnergy: $('sheetEnergy'),
  tapDmg: $('tapDmg'),
  dps: $('dpsVal'),
  exorcised: $('exorcised'),
  grade: $('grade'),
  curseName: $('curseName'),
  curseLv: $('curseLv'),
  hpFill: $('hpFill'),
  hpLag: $('hpLag'),
  hpText: $('hpText'),
  combo: $('combo'),
  comboVal: $('comboVal'),
  comboHits: $('comboHits'),
  comboBest: $('comboBest'),
  comboBar: $('comboBar'),
  hint: $('hint'),
  upgradesBtn: $('upgradesBtn'),
  upgradeNotify: $('upgradeNotify'),
  upgradeList: $('upgradeList'),
  sheetWrap: $('sheetWrap'),
  bestChain: $('bestChain'),
  domainBtn: $('domainBtn'),
  domainPct: $('domainPct'),
  domainCallout: $('domainCallout'),
  blackflash: $('blackflash'),
  killcallout: $('killcallout'),
  toast: $('toast'),
  intro: $('intro'),
  introSave: $('introSave'),
  startBtn: $('startBtn'),
  startLabel: $('startLabel'),
  introTiltBtn: $('introTiltBtn'),
  introTiltLabel: $('introTiltLabel'),
  tiltNote: $('tiltNote'),
  tiltBtn: $('tiltBtn'),
  soundBtn: $('soundBtn'),
  resetBtn: $('resetBtn'),
};

function loadSave() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return sanitizeSave(raw, freshSave);
  } catch {
    return freshSave();
  }
}

const save = loadSave();
const audio = new Sfx();
audio.enabled = save.sound;
const fx = new Effects();
const world = new World();

const game = {
  save,
  started: false,
  introOpen: true,
  sheetOpen: false,
  combo: 0,
  comboTimer: 0,
  domainCharge: clamp(save.domainCharge || 0, 0, CFG.domainMax),
  domainActive: false,
  domainStart: 0,
  domainEnd: 0,
  domainNext: 0,
  domainCalloutTimer: 0,
  target: null,
  pendingSpawn: 0,
  kick: 0,
  shake: 0,
  flash: 0,
  flashColor: '#ffffff',
  flashDir: 1,
  time: 0,
  idleTimer: 0,
  saveTimer: 0,
  hudTimer: 0,
  hintTaps: 0,
  lastNow: performance.now(),
  lastStrikeAt: 0,
  tilt: {
    status: 'off', // off | pending | on
    mode: 'none', // none | motion | keys
    nx: 0,
    ny: 0,
    baseG: 0,
    baseB: 0,
    rawG: 0,
    rawB: 0,
    hasData: false,
    locked: false,
    x: 0,
    y: 0,
    requestedAt: 0,
  },
};

const lay = {
  W: 0,
  H: 0,
  dpr: 1,
  portrait: true,
  curse: { x: 0, y: 0, r: 0 },
  gojo: { x: 0, y: 0, height: 0 },
  gojoTarget: { x: 0, y: 0, height: 0 },
  hand: { x: 0, y: 0 },
};

let toastTimer = 0;
let resizeQueued = false;

/* ------------------------------------------------------------------ *
 *  Layout & target creation
 * ------------------------------------------------------------------ */

function makeTarget(level, hp, spawnT) {
  const info = curseInfo(level);
  return {
    level,
    max: curseMaxHp(level),
    hp: clamp(hp, 1, curseMaxHp(level)),
    info,
    look: makeCurseLook(level, info),
    spawnT: spawnT ?? performance.now() - 900,
    deathAt: 0,
    dying: false,
    flash: 0,
    x: 0,
    y: 0,
    r: 0,
    drawnCore: { x: 0, y: 0, r: 0 },
  };
}

function applyTargetLayout() {
  const t = game.target;
  if (!t) return;
  t.x = lay.curse.x;
  t.y = lay.curse.y;
  t.r = lay.curse.r * (t.info.boss ? 1.12 : 1);
  if (!t.drawnCore) t.drawnCore = { x: t.x, y: t.y, r: t.r * 0.2 };
}

function computeLayout() {
  const rect = app.getBoundingClientRect();
  const W = Math.max(320, rect.width);
  const H = Math.max(320, rect.height);
  lay.W = W;
  lay.H = H;
  lay.dpr = Math.min(2, window.devicePixelRatio || 1);
  lay.portrait = W / H < 0.98;

  if (game.introOpen) {
    if (lay.portrait) {
      lay.gojoTarget = {
        x: W * 0.79,
        y: H * 1.055,
        height: Math.min(H * 0.64, W * 1.12),
      };
    } else {
      lay.gojoTarget = {
        x: W * 0.75,
        y: H * 1.075,
        height: Math.min(H * 0.98, W * 0.5),
      };
    }
  } else if (lay.portrait) {
    lay.gojoTarget = {
      x: W * 0.5,
      y: H * 1.01,
      height: Math.min(H * 0.52, W * 0.92),
    };
  } else {
    lay.gojoTarget = {
      x: W * 0.29,
      y: H * 1.08,
      height: Math.min(H * 0.82, W * 0.37),
    };
  }

  if (lay.portrait) {
    lay.curse = {
      x: W * 0.5,
      y: H * 0.325,
      r: Math.min(W * 0.205, H * 0.102),
    };
  } else {
    lay.curse = {
      x: W * 0.66,
      y: H * 0.47,
      r: Math.min(W * 0.14, H * 0.2),
    };
  }

  if (!lay.gojo.height) {
    lay.gojo = { ...lay.gojoTarget };
  }

  applyTargetLayout();
  ui.hint.style.setProperty('--hint-x', `${(lay.curse.x / W) * 100}%`);
  ui.hint.style.setProperty('--hint-y', `${((lay.curse.y + lay.curse.r * 1.25) / H) * 100}%`);
}

function syncHand() {
  const s = lay.gojo.height / GOJO_DESIGN_HEIGHT;
  lay.hand.x = lay.gojo.x + GOJO_HAND.x * s;
  lay.hand.y = lay.gojo.y + GOJO_HAND.y * s;
}

function resize() {
  resizeQueued = false;
  computeLayout();
  const { W, H, dpr } = lay;
  canvas.width = Math.max(1, Math.round(W * dpr));
  canvas.height = Math.max(1, Math.round(H * dpr));
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  world.resize(W, H, dpr);
  syncHand();
  if (!game.tilt.x) {
    game.tilt.x = lay.curse.x;
    game.tilt.y = lay.curse.y;
  }
}

function queueResize() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(resize);
}

/* ------------------------------------------------------------------ *
 *  HUD
 * ------------------------------------------------------------------ */

function addEnergy(amount) {
  save.energy += amount;
  updateEnergy();
}

function updateEnergy() {
  const value = formatNumber(Math.floor(save.energy));
  ui.energy.textContent = value;
  ui.sheetEnergy.textContent = value;
}

function effectsClone(upgrades, id, level) {
  return { ...upgrades, [id]: level };
}

function statEffects(id, level) {
  const up = effectsClone(save.upgrades, id, level);
  switch (id) {
    case 'power':
      return `tap power ×${formatNumber(Math.pow(1.5, level))} → ×${formatNumber(Math.pow(1.5, level + 1))}`;
    case 'focus':
      return `${Math.round(critChance(up) * 100)}% crit · ×${critMultiplier(up).toFixed(1)} damage`;
    case 'flow':
      return `${formatNumber(autoDps(up))} damage / sec`;
    case 'chain':
      return `at 80 hits: ×${comboMultiplier(CFG.comboCap, up).toFixed(2)}`;
    default:
      return '';
  }
}

function updateStats() {
  ui.tapDmg.textContent = formatNumber(tapDamage(save.upgrades));
  const dps = autoDps(save.upgrades);
  ui.dps.textContent = dps > 0 ? formatNumber(dps) : '0';
  ui.exorcised.textContent = formatNumber(save.exorcised);
  ui.bestChain.textContent = `Best chain: ${save.bestCombo}`;
  if (game.combo < 2) ui.comboBest.textContent = save.bestCombo ? `BEST ${save.bestCombo}` : '';
}

function updateTargetUI(instant = false) {
  const t = game.target;
  if (!t) return;
  ui.grade.textContent = t.info.grade;
  ui.curseName.textContent = t.info.name;
  ui.curseLv.textContent = `LV.${t.level}`;
  const ratio = clamp(t.hp / t.max, 0, 1);
  if (instant) {
    ui.hpFill.style.transition = 'none';
    ui.hpLag.style.transition = 'none';
  }
  ui.hpFill.style.transform = `scaleX(${t.dying ? 0 : ratio})`;
  ui.hpLag.style.transform = `scaleX(${t.dying ? 0 : ratio})`;
  ui.hpText.textContent = t.dying ? 'EXORCISED' : `${formatCompact(Math.max(0, t.hp))} / ${formatCompact(t.max)}`;
  if (instant) {
    // force style flush, then restore the CSS transitions
    void ui.hpFill.offsetWidth;
    ui.hpFill.style.transition = '';
    ui.hpLag.style.transition = '';
  }
}

function updateComboUI() {
  const visible = game.started && !game.introOpen && game.combo >= 2;
  ui.combo.classList.toggle('show', visible);
  ui.combo.classList.toggle('hot', game.combo >= 20 && game.combo < 45);
  ui.combo.classList.toggle('blazing', game.combo >= 45);
  ui.comboVal.textContent = comboMultiplier(game.combo, save.upgrades).toFixed(2);
  ui.comboHits.textContent = `${game.combo} HIT CHAIN`;
  ui.comboBest.textContent = save.bestCombo ? `BEST ${save.bestCombo}` : '';
  ui.comboBar.style.transform = `scaleX(${clamp(game.comboTimer / TAP_WINDOW, 0, 1)})`;
}

function updateDomainUI(now) {
  let pct;
  let label;
  if (game.domainActive) {
    pct = clamp(((game.domainEnd - now) / (CFG.domainDuration * 1000)) * 100, 0, 100);
    label = `${Math.max(0, (game.domainEnd - now) / 1000).toFixed(1)}s`;
  } else {
    pct = clamp(game.domainCharge, 0, 100);
    label = `${Math.floor(pct)}%`;
  }
  ui.domainBtn.style.setProperty('--p', pct.toFixed(1));
  ui.domainPct.textContent = label;
  ui.domainBtn.classList.toggle('ready', !game.domainActive && pct >= 100);
  ui.domainBtn.classList.toggle('active', game.domainActive);
  ui.domainBtn.setAttribute('aria-disabled', !game.domainActive && pct < 100 ? 'true' : 'false');
}

function buildUpgradeCards() {
  ui.upgradeList.innerHTML = UPGRADES.map(
    (def) => `
    <article class="up-card" data-id="${def.id}">
      <div class="up-top">
        <span class="up-tag">${def.tag}</span>
        <span class="up-level" data-level>LV.0</span>
      </div>
      <h3 class="up-name">${def.name}</h3>
      <p class="up-desc">${def.desc}</p>
      <div class="up-effect" data-effect></div>
      <button class="buy" type="button" data-buy="${def.id}">
        <span class="cost"></span><small>ENHANCE</small>
      </button>
    </article>`,
  ).join('');
}

function refreshUpgrades() {
  let anyAffordable = false;
  for (const def of UPGRADES) {
    const card = ui.upgradeList.querySelector(`[data-id="${def.id}"]`);
    if (!card) continue;
    const level = save.upgrades[def.id] || 0;
    const maxed = level >= def.max;
    const cost = upgradeCost(def.id, level);
    const affordable = !maxed && save.energy >= cost;
    if (affordable) anyAffordable = true;

    card.classList.toggle('affordable', affordable);
    card.classList.toggle('maxed', maxed);
    card.querySelector('[data-level]').textContent = `LV.${level}`;
    card.querySelector('[data-effect]').textContent = statEffects(def.id, level);
    const buy = card.querySelector('.buy');
    buy.disabled = !affordable;
    buy.querySelector('.cost').textContent = maxed ? 'MAXED' : `◈ ${formatNumber(cost)}`;
    buy.querySelector('small').textContent = maxed ? 'MASTERED' : 'ENHANCE';
  }
  ui.upgradesBtn.classList.toggle('has-notify', anyAffordable && !game.sheetOpen);
}

function flashComboBump() {
  if (game.combo < 2) return;
  ui.combo.classList.remove('bump');
  void ui.combo.offsetWidth;
  ui.combo.classList.add('bump');
}

/* ------------------------------------------------------------------ *
 *  Feedback
 * ------------------------------------------------------------------ */

function toast(message, kind = '') {
  ui.toast.textContent = message;
  ui.toast.className = `toast show ${kind}`.trim();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    ui.toast.className = `toast ${kind}`.trim();
  }, 2200);
}

function showKillCallout(text) {
  ui.killcallout.textContent = text;
  ui.killcallout.classList.remove('show');
  void ui.killcallout.offsetWidth;
  ui.killcallout.classList.add('show');
}

function showBlackFlash() {
  ui.blackflash.classList.remove('show');
  void ui.blackflash.offsetWidth;
  ui.blackflash.classList.add('show');
  setTimeout(() => ui.blackflash.classList.remove('show'), 640);
}

function showDomainCallout() {
  ui.domainCallout.classList.add('show');
  clearTimeout(game.domainCalloutTimer);
  game.domainCalloutTimer = setTimeout(() => ui.domainCallout.classList.remove('show'), 2900);
}

function haptic(pattern) {
  if (!save.sound) return;
  if (navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }
}

function screenFlash(color, strength = 0.5) {
  game.flashColor = color;
  game.flash = Math.max(game.flash, strength);
}

/* ------------------------------------------------------------------ *
 *  Save
 * ------------------------------------------------------------------ */

function persist() {
  try {
    save.hp = game.target && !game.target.dying ? Math.max(1, game.target.hp) : curseMaxHp(save.level);
    save.domainCharge = game.domainCharge;
    save.sound = audio.enabled;
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* storage may be unavailable */
  }
}

/* ------------------------------------------------------------------ *
 *  Combat
 * ------------------------------------------------------------------ */

function tiltActive() {
  return game.tilt.status === 'on';
}

function handPos() {
  syncHand();
  return lay.hand;
}

function corePoint(target) {
  if (target.drawnCore && target.drawnCore.r) return target.drawnCore;
  return { x: target.x, y: target.y, r: target.r * 0.2 };
}

function addDomainCharge(amount) {
  if (game.domainActive) return;
  game.domainCharge = clamp(game.domainCharge + amount, 0, CFG.domainMax);
}

function strike(x, y) {
  if (!game.started || game.introOpen || game.sheetOpen) return;
  const t = game.target;
  if (!t || t.dying) return;

  const core = corePoint(t);
  const coreHit = Math.hypot(x - core.x, y - core.y) < t.r * CFG.coreRadius;
  const tiltLock = tiltActive() && game.tilt.locked;
  const black = Math.random() < blackFlashChance(game.combo) && !game.domainActive;
  let crit = black || Math.random() < critChance(save.upgrades);

  let damage = tapDamage(save.upgrades);
  damage *= comboMultiplier(game.combo, save.upgrades);
  if (crit) damage *= critMultiplier(save.upgrades);
  if (black) damage *= 4;
  if (coreHit) damage *= CFG.coreBonus;
  if (tiltLock) damage *= CFG.tiltBonus;
  if (game.domainActive) damage *= 1.65;
  damage = Math.max(1, Math.round(damage * rnd(0.92, 1.08)));

  game.combo += 1;
  game.comboTimer = TAP_WINDOW;
  save.bestCombo = Math.max(save.bestCombo, game.combo);
  game.kick = 1;
  addDomainCharge(CFG.domainPerHit + (black ? 4 : 0));
  t.look.lookX = clamp((x - core.x) / t.r, -1, 1);
  t.look.lookY = clamp((y - core.y) / t.r, -1, 1);
  damageTarget(damage, {
    x,
    y,
    crit,
    black,
    coreHit,
    tiltLock,
    source: 'tap',
    shake: black ? 18 : crit ? 8 : coreHit ? 6 : 4,
  });

  const hand = handPos();
  const boltColor = black ? '#ff2d55' : crit ? '#ffd166' : tiltLock ? '#b8ffe8' : '#8ffcff';
  fx.bolt(hand.x, hand.y, x, y, boltColor, black ? 0.32 : 0.17, black ? 3.4 : crit ? 2.6 : 1.8);
  if (black) {
    fx.bolt(hand.x, hand.y, x + rnd(-70, 70), y + rnd(-70, 70), '#ffffff', 0.3, 2);
    screenFlash('#ff2d55', 0.34);
    showBlackFlash();
    game.shake = Math.max(game.shake, 18);
    haptic([14, 30, 55, 20, 30]);
  } else {
    haptic(crit ? [10, 18, 10] : 7);
  }

  audio.tap(game.combo, crit, black);
  flashComboBump();
  updateComboUI();
  updateTargetUI();

  game.hintTaps += 1;
  if (game.hintTaps === 7) ui.hint.classList.add('hide');
  game.saveTimer = Math.max(0, game.saveTimer - 0.15);
}

function damageTarget(damage, opts = {}) {
  const t = game.target;
  if (!t || t.dying) return;
  t.hp -= damage;
  t.flash = Math.max(t.flash, opts.black ? 1 : opts.crit ? 0.9 : 0.7);
  addEnergy(damage * CFG.energyPerDamage);

  if (opts.shake) game.shake = Math.min(20, Math.max(game.shake, opts.shake));

  const color = opts.black
    ? '#ff617e'
    : opts.crit
      ? '#ffd166'
      : opts.tiltLock
        ? '#b8ffe8'
        : opts.color || '#e8fbff';
  const size = opts.tiny ? 15 : opts.domain ? 18 : opts.black ? 36 : opts.crit ? 30 : opts.coreHit ? 26 : 24;
  const label = opts.black
    ? 'BLACK FLASH'
    : opts.domain
      ? ''
      : opts.crit
        ? 'CRITICAL'
        : opts.coreHit
          ? 'CORE'
          : opts.tiltLock
            ? 'SIX EYES'
            : opts.tiny
              ? 'AUTO'
              : '';
  fx.number(opts.x ?? t.x, (opts.y ?? t.y) - 14, formatCompact(damage), color, size, {
    crit: !!opts.crit || !!opts.black,
    label,
    domain: !!opts.domain,
  });
  if (opts.domain) {
    if (Math.random() < 0.3) fx.ring(opts.x ?? t.x, opts.y ?? t.y, '#bff3ff', 34, 0.24, 1);
  } else if (!opts.tiny) {
    fx.hit(opts.x ?? t.x, opts.y ?? t.y, {
      color: opts.black ? '#ff2d55' : opts.crit ? '#ffd166' : '#8ffcff',
      count: opts.black ? 28 : opts.crit ? 18 : 12,
      crit: !!opts.crit,
      black: !!opts.black,
    });
  }

  if (t.hp <= 0) {
    killTarget();
  } else {
    updateTargetUI();
  }
  updateDomainUI(performance.now());
}

function killTarget() {
  const t = game.target;
  if (!t || t.dying) return;
  const now = performance.now();
  t.dying = true;
  t.deathAt = now;
  t.hp = 0;
  const reward = killReward(t.level);

  save.exorcised += 1;
  save.level = t.level + 1;
  save.hp = curseMaxHp(save.level);
  addEnergy(reward);
  addDomainCharge(CFG.domainPerKill);
  game.pendingSpawn = now + 620;
  game.combo = 0;
  game.comboTimer = 0;
  game.shake = Math.max(game.shake, 13);

  fx.burst(t.x, t.y, t.look.palette.rim, t.info.boss ? 52 : 34);
  fx.smoke(t.x, t.y, t.look.palette.glow, 12);
  fx.number(t.x, t.y - t.r * 0.55, `+${formatCompact(reward)} CE`, '#ffd166', 22, {});
  screenFlash('#bff3ff', 0.28);
  showKillCallout(
    t.info.boss ? `SPECIAL GRADE EXORCISED · +${formatCompact(reward)} CE` : `CURSE EXORCISED · +${formatCompact(reward)} CE`,
  );
  audio.kill();
  haptic([12, 34, 18]);
  if (t.info.boss) showBlackFlash();

  updateTargetUI();
  updateComboUI();
  updateStats();
  persist();
}

function spawnTarget() {
  const now = performance.now();
  const level = save.level;
  game.target = makeTarget(level, curseMaxHp(level), now);
  applyTargetLayout();
  game.pendingSpawn = 0;
  save.hp = game.target.hp;
  updateTargetUI(true);
  updateStats();
  updateDomainUI(now);
  if (game.target.info.boss) {
    toast(`LV.${level} · SPECIAL GRADE CURSE`, 'warn');
    haptic([18, 40, 18]);
  }
}

function domainHit(now) {
  const t = game.target;
  if (!t || t.dying) return;
  const core = corePoint(t);
  const damage = Math.max(
    1,
    Math.round(
      tapDamage(save.upgrades) * CFG.domainMultiplier * critMultiplier(save.upgrades) * rnd(0.94, 1.06),
    ),
  );
  const x = core.x + rnd(-t.r * 0.45, t.r * 0.45);
  const y = core.y + rnd(-t.r * 0.38, t.r * 0.38);
  const hand = handPos();
  fx.bolt(hand.x, hand.y, x, y, Math.random() < 0.5 ? '#bff3ff' : '#b07bff', 0.11, 1.2);
  damageTarget(damage, { x, y, domain: true, source: 'domain', shake: 2 });
  updateTargetUI();
}

function activateDomain() {
  if (!game.started || game.introOpen) return;
  if (game.domainActive) return;
  if (game.domainCharge < CFG.domainMax) {
    toast(`DOMAIN ${Math.floor(game.domainCharge)}% · KEEP STRIKING`, 'warn');
    audio.deny();
    haptic(20);
    return;
  }
  const now = performance.now();
  game.domainActive = true;
  game.domainStart = now;
  game.domainEnd = now + CFG.domainDuration * 1000;
  game.domainNext = now + 120;
  game.domainCharge = 0;
  game.shake = 22;
  screenFlash('#eafcff', 0.62);
  showDomainCallout();
  ui.hint.classList.add('hide');
  audio.domain();
  haptic([20, 50, 30, 50, 60]);
  domainHit(now);
  updateDomainUI(now);
  persist();
}

function endDomain() {
  game.domainActive = false;
  game.domainCharge = 0;
  ui.domainCallout.classList.remove('show');
  clearTimeout(game.domainCalloutTimer);
  screenFlash('#9f7bff', 0.24);
  audio.domainEnd();
  toast('UNLIMITED VOID CLOSED');
  updateDomainUI(performance.now());
  persist();
}

/* ------------------------------------------------------------------ *
 *  Six Eyes tilt control
 * ------------------------------------------------------------------ */

function updateTiltUI() {
  const t = game.tilt;
  const on = t.status === 'on';
  ui.tiltBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  ui.introTiltBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  ui.tiltBtn.setAttribute('aria-label', on ? 'Turn off Six Eyes tilt control' : 'Enable Six Eyes tilt control');

  if (t.status === 'on' && t.mode === 'motion') {
    ui.introTiltLabel.textContent = 'TILT ENABLED';
    ui.tiltNote.textContent = 'Six Eyes online. Tilt your device to move the lock. Strikes inside the lock deal +35%.';
    ui.tiltNote.className = 'intro-tilt-note ok';
  } else if (t.status === 'on' && t.mode === 'keys') {
    ui.introTiltLabel.textContent = 'SIX EYES ARMED';
    ui.tiltNote.textContent = 'No gyroscope detected. Drag the stage or use ← → to move the Six Eyes lock (+35% damage).';
    ui.tiltNote.className = 'intro-tilt-note ok';
  } else if (t.status === 'pending') {
    ui.introTiltLabel.textContent = 'REQUESTING…';
    ui.tiltNote.textContent = 'Waiting for motion permission / sensor data…';
    ui.tiltNote.className = 'intro-tilt-note';
  } else {
    ui.introTiltLabel.textContent = 'ENABLE TILT';
    ui.tiltNote.textContent = 'Six Eyes tilt control uses your device motion sensor. iOS asks for permission.';
    ui.tiltNote.className = 'intro-tilt-note';
  }
}

function onOrientation(event) {
  const t = game.tilt;
  if (event.gamma == null && event.beta == null) return;
  const g = Number(event.gamma) || 0;
  const b = Number(event.beta) || 0;
  t.rawG = g;
  t.rawB = b;
  t.hasData = true;

  if (t.status === 'pending') {
    t.status = 'on';
    t.mode = 'motion';
    t.baseG = g;
    t.baseB = b;
    t.nx = 0;
    t.ny = 0;
    save.tiltPreferred = true;
    updateTiltUI();
    toast('SIX EYES ONLINE · TILT TO AIM');
    haptic([10, 30, 10]);
    persist();
    return;
  }
  if (t.status !== 'on' || t.mode !== 'motion') return;
  t.nx = clamp((g - t.baseG) / 22, -1, 1);
  t.ny = clamp((b - t.baseB) / 24, -1, 1);
}

async function enableTilt() {
  const t = game.tilt;
  audio.unlock();
  if (t.status === 'on') {
    disableTilt();
    return;
  }
  if (t.status === 'pending') return;

  const DOE = window.DeviceOrientationEvent;
  if (!DOE) {
    t.status = 'on';
    t.mode = 'keys';
    t.hasData = true;
    save.tiltPreferred = true;
    updateTiltUI();
    toast('SIX EYES ARMED · DRAG OR USE ← →');
    return;
  }

  try {
    if (typeof DOE.requestPermission === 'function') {
      const result = await DOE.requestPermission();
      if (result !== 'granted') {
        ui.tiltNote.textContent = 'Motion permission was denied. Tapping still works perfectly.';
        ui.tiltNote.className = 'intro-tilt-note warn';
        toast('MOTION PERMISSION DENIED', 'warn');
        return;
      }
    }
  } catch {
    ui.tiltNote.textContent = 'Motion permission is unavailable in this browser. Tapping still works.';
    ui.tiltNote.className = 'intro-tilt-note warn';
    toast('MOTION UNAVAILABLE', 'warn');
    return;
  }

  t.status = 'pending';
  t.mode = 'none';
  t.hasData = false;
  t.nx = 0;
  t.ny = 0;
  t.requestedAt = performance.now();
  window.addEventListener('deviceorientation', onOrientation, true);
  updateTiltUI();

  setTimeout(() => {
    if (game.tilt.status !== 'pending') return;
    if (!game.tilt.hasData) {
      window.removeEventListener('deviceorientation', onOrientation, true);
      game.tilt.status = 'on';
      game.tilt.mode = 'keys';
      game.tilt.hasData = true;
      save.tiltPreferred = true;
      updateTiltUI();
      toast('NO GYRO · DRAG OR USE ← → TO AIM');
    }
  }, 1700);
}

function disableTilt() {
  const t = game.tilt;
  window.removeEventListener('deviceorientation', onOrientation, true);
  t.status = 'off';
  t.mode = 'none';
  t.nx = 0;
  t.ny = 0;
  t.locked = false;
  save.tiltPreferred = false;
  updateTiltUI();
  toast('SIX EYES OFF');
  persist();
}

/* ------------------------------------------------------------------ *
 *  Upgrades & sheet
 * ------------------------------------------------------------------ */

function openSheet() {
  if (!game.started || game.introOpen) return;
  game.sheetOpen = true;
  ui.sheetWrap.hidden = false;
  refreshUpgrades();
  audio.ui();
  requestAnimationFrame(() => {
    const close = ui.sheetWrap.querySelector('.sheet-close');
    if (close) close.focus({ preventScroll: true });
  });
}

function closeSheet() {
  if (!game.sheetOpen) return;
  game.sheetOpen = false;
  ui.sheetWrap.hidden = true;
  refreshUpgrades();
  ui.upgradesBtn.focus({ preventScroll: true });
  audio.ui();
}

function buyUpgrade(id) {
  const def = UPGRADES.find((u) => u.id === id);
  if (!def) return;
  const level = save.upgrades[id] || 0;
  if (level >= def.max) {
    toast(`${def.name.toUpperCase()} IS MAXED`);
    audio.deny();
    return;
  }
  const cost = upgradeCost(id, level);
  if (save.energy < cost) {
    toast('NOT ENOUGH CURSED ENERGY', 'warn');
    audio.deny();
    haptic(18);
    return;
  }
  save.energy -= cost;
  save.upgrades[id] = level + 1;
  audio.buy();
  haptic(12);
  updateEnergy();
  updateStats();
  refreshUpgrades();
  updateTargetUI();
  const card = ui.upgradeList.querySelector(`[data-id="${id}"]`);
  if (card && !reduceMotion) {
    card.animate(
      [
        { transform: 'scale(1)', borderColor: 'rgba(143,252,255,0.5)' },
        { transform: 'scale(1.025)', borderColor: 'rgba(143,252,255,0.9)' },
        { transform: 'scale(1)', borderColor: 'rgba(255,255,255,0.1)' },
      ],
      { duration: 260, easing: 'ease-out' },
    );
  }
  persist();
}

let resetArmed = false;
let resetTimer = 0;

function armReset() {
  if (!resetArmed) {
    resetArmed = true;
    ui.resetBtn.textContent = 'CONFIRM RESET';
    ui.resetBtn.classList.add('confirm');
    toast('Tap again to erase this run', 'warn');
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      resetArmed = false;
      ui.resetBtn.textContent = 'Reset run';
      ui.resetBtn.classList.remove('confirm');
    }, 3200);
    return;
  }
  clearTimeout(resetTimer);
  resetArmed = false;
  ui.resetBtn.textContent = 'Reset run';
  ui.resetBtn.classList.remove('confirm');
  resetRun();
}

function resetRun() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
  const fresh = freshSave();
  for (const key of Object.keys(save)) delete save[key];
  Object.assign(save, fresh);
  save.sound = audio.enabled;
  game.combo = 0;
  game.comboTimer = 0;
  game.domainCharge = 0;
  game.domainActive = false;
  game.domainEnd = 0;
  game.pendingSpawn = 0;
  game.kick = 0;
  game.shake = 0;
  game.hintTaps = 0;
  ui.hint.classList.remove('hide');
  ui.domainCallout.classList.remove('show');
  game.target = makeTarget(1, curseMaxHp(1), performance.now() - 900);
  applyTargetLayout();
  updateTargetUI(true);
  updateEnergy();
  updateStats();
  updateComboUI();
  updateDomainUI(performance.now());
  refreshUpgrades();
  closeSheet();
  toast('RUN RESET · THE STRONGEST STARTS AGAIN');
  persist();
}

/* ------------------------------------------------------------------ *
 *  Rendering
 * ------------------------------------------------------------------ */

function updateReticle(dt) {
  const t = game.tilt;
  const active = tiltActive() && game.started && !game.introOpen;
  if (!active) {
    t.locked = false;
    return;
  }
  const target = game.target;
  const tx = target ? target.x + t.nx * target.r * 1.45 : lay.W / 2;
  const ty = target ? target.y + t.ny * target.r * 1.45 : lay.H * 0.4;
  const k = 1 - Math.pow(0.0004, dt);
  t.x = lerp(t.x, tx, k);
  t.y = lerp(t.y, ty, k);
  if (target) {
    const core = corePoint(target);
    t.locked = Math.hypot(t.x - core.x, t.y - core.y) < Math.max(20, target.r * 0.38);
  } else {
    t.locked = false;
  }
}

function drawReticle(now) {
  const t = game.tilt;
  const time = now / 1000;
  const locked = t.locked;
  const color = locked ? '#b8ffe8' : '#8ffcff';
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.globalCompositeOperation = 'lighter';

  if (locked) {
    glow(ctx, 0, 0, 42, '#b8ffe8', 0.2, 0);
  }

  ctx.strokeStyle = rgba(color, locked ? 0.95 : 0.55);
  ctx.lineWidth = locked ? 1.8 : 1.2;
  ctx.setLineDash([5, 7]);
  ctx.lineDashOffset = -time * 24;
  ctx.beginPath();
  ctx.arc(0, 0, 22, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = rgba(color, locked ? 0.9 : 0.45);
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 4; i++) {
    const a = time * 0.6 + i * (Math.PI / 2);
    const r1 = 26;
    const r2 = 32;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.stroke();
  }

  ctx.fillStyle = rgba('#ffffff', locked ? 0.95 : 0.7);
  ctx.beginPath();
  ctx.arc(0, 0, 1.9, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(color, locked ? 0.9 : 0.5);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(-3, 0);
  ctx.moveTo(3, 0);
  ctx.lineTo(7, 0);
  ctx.stroke();

  ctx.font = '700 8px "Rajdhani", "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = rgba(color, locked ? 0.95 : 0.55);
  ctx.fillText('SIX EYES', 0, -38);
  if (locked) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillText('LOCK · +35%', 0, 46);
  }
  ctx.restore();
}

function drawDomain(now) {
  const elapsed = (now - game.domainStart) / 1000;
  const remain = (game.domainEnd - now) / 1000;
  const fadeIn = clamp(elapsed / 0.42, 0, 1);
  const fadeOut = clamp(remain / 0.45, 0, 1);
  const vis = Math.min(fadeIn, fadeOut);
  if (vis <= 0) return;

  const W = lay.W;
  const H = lay.H;
  const cx = W * 0.5;
  const cy = H * 0.4;
  const min = Math.min(W, H);

  ctx.save();
  ctx.fillStyle = `rgba(2,3,10,${0.76 * vis})`;
  ctx.fillRect(-40, -40, W + 80, H + 80);

  const vign = ctx.createRadialGradient(cx, cy, min * 0.05, cx, cy, Math.max(W, H) * 0.72);
  vign.addColorStop(0, `rgba(120,190,255,${0.16 * vis})`);
  vign.addColorStop(0.4, `rgba(80,90,220,${0.08 * vis})`);
  vign.addColorStop(1, 'rgba(1,2,8,0)');
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, W, H);

  ctx.globalCompositeOperation = 'lighter';
  const maxR = Math.hypot(W, H) * 0.62;
  for (let i = 0; i < 140; i++) {
    const angle = i * 2.399 + elapsed * 0.045;
    const phase = (i * 0.618033 + elapsed * 0.17) % 1;
    const r = phase * maxR;
    const len = (26 + phase * 118) * (0.7 + (i % 3) * 0.2);
    const alpha = Math.sin(phase * Math.PI) * 0.34 * vis;
    if (alpha <= 0.005) continue;
    const x1 = cx + Math.cos(angle) * r;
    const y1 = cy + Math.sin(angle) * r * 0.72;
    const x2 = cx + Math.cos(angle) * (r + len);
    const y2 = cy + Math.sin(angle) * (r + len) * 0.72;
    ctx.strokeStyle = rgba(i % 5 === 0 ? '#ffffff' : i % 3 === 0 ? '#b07bff' : '#a9e9ff', alpha);
    ctx.lineWidth = i % 11 === 0 ? 1.7 : 0.8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  const ringPulse = 0.5 + Math.sin(elapsed * 3.2) * 0.5;
  const voidR = min * 0.122 + ringPulse * 2.2;

  // rotating event-horizon arcs
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.86);
  for (let i = 0; i < 4; i++) {
    const rr = min * (0.16 + i * 0.042) + ringPulse * 3;
    const start = elapsed * (i % 2 ? -0.36 : 0.28) + i * 1.7;
    ctx.strokeStyle = rgba(i === 0 ? '#ffffff' : i % 2 ? '#b07bff' : '#8ffcff', (0.34 - i * 0.06) * vis);
    ctx.lineWidth = i === 0 ? 1.9 : 1.1;
    ctx.setLineDash([min * 0.028, min * (0.022 + i * 0.012)]);
    ctx.lineDashOffset = -elapsed * (18 + i * 9);
    ctx.beginPath();
    ctx.arc(0, 0, rr, start, start + 2.1 + i * 0.32);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, rr, start + Math.PI, start + Math.PI + 1.4);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // radial spokes around the void
  for (let i = 0; i < 14; i++) {
    const a = i * (TAU / 14) + elapsed * 0.09;
    const r1 = min * 0.155;
    const r2 = r1 + min * (0.018 + (i % 3) * 0.008);
    ctx.strokeStyle = rgba('#bff3ff', 0.13 * vis);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
    ctx.stroke();
  }
  ctx.restore();

  // halo blooming out of the singularity
  const centerGlow = ctx.createRadialGradient(cx, cy, voidR * 0.3, cx, cy, min * 0.34);
  centerGlow.addColorStop(0, `rgba(232,252,255,${0.34 * vis})`);
  centerGlow.addColorStop(0.3, `rgba(150,220,255,${0.16 * vis})`);
  centerGlow.addColorStop(0.68, `rgba(130,120,255,${0.07 * vis})`);
  centerGlow.addColorStop(1, 'rgba(80,80,255,0)');
  ctx.fillStyle = centerGlow;
  ctx.fillRect(cx - min * 0.4, cy - min * 0.4, min * 0.8, min * 0.8);

  // the void itself: a true black core ringed by white-hot light
  ctx.globalCompositeOperation = 'source-over';
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, voidR);
  core.addColorStop(0, 'rgba(0,0,4,0.98)');
  core.addColorStop(0.72, 'rgba(1,1,7,0.96)');
  core.addColorStop(0.92, `rgba(8,10,26,${0.82 * vis})`);
  core.addColorStop(1, 'rgba(8,10,26,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, voidR, 0, TAU);
  ctx.fill();

  // faint stars suspended inside the event horizon
  for (let i = 0; i < 9; i++) {
    const a = i * 2.1 + elapsed * 0.4;
    const rr = voidR * (0.14 + (i % 4) * 0.18);
    ctx.fillStyle = rgba('#dffbff', (0.25 + (i % 3) * 0.18) * vis);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7, i % 3 === 0 ? 1.4 : 0.9, 0, TAU);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#ffffff', 0.92 * vis);
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(cx, cy, voidR + ringPulse * 1.2, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgba('#8ffcff', 0.4 * vis);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, voidR + 4 + ringPulse * 1.6, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = rgba('#b07bff', 0.28 * vis);
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(cx, cy, voidR + 12, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawFloorLight(now) {
  const W = lay.W;
  const H = lay.H;
  const s = lay.gojo.height / GOJO_DESIGN_HEIGHT;
  const pulse = 0.5 + Math.sin(now / 900) * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, lay.gojo.x, lay.gojo.y - 18 * s, Math.max(120, lay.gojo.height * 0.58), '#4ca8ff', 0.1 + pulse * 0.03, 0);
  glow(ctx, W * 0.72, H * 0.36, Math.min(W, H) * 0.4, '#7a4dff', 0.035, 0);
  ctx.restore();
}

function render(now) {
  const W = lay.W;
  const H = lay.H;
  ctx.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0);
  ctx.fillStyle = '#05040c';
  ctx.fillRect(0, 0, W, H);

  const shake = reduceMotion ? Math.min(game.shake, 3) : game.shake;
  const sx = (Math.random() * 2 - 1) * shake;
  const sy = (Math.random() * 2 - 1) * shake;

  ctx.save();
  ctx.translate(sx, sy);

  world.draw(ctx, W, H, { tiltX: game.tilt.nx, tiltY: game.tilt.ny });
  drawFloorLight(now);

  if (game.domainActive) drawDomain(now);

  if (!game.introOpen && game.target) {
    drawCurse(ctx, game.target, now);
  }

  drawGojo(ctx, lay.gojo, {
    time: now / 1000,
    attack: game.kick,
    domain: game.domainActive,
    intro: game.introOpen,
  });

  if (game.started && !game.introOpen && tiltActive()) drawReticle(now);

  fx.draw(ctx);
  ctx.restore();

  if (game.flash > 0.003) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.62, game.flash);
    ctx.fillStyle = game.flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if (game.domainActive) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, Math.min(W, H) * 0.2, W * 0.5, H * 0.45, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(120,170,255,0)');
    g.addColorStop(1, 'rgba(90,80,220,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

/* ------------------------------------------------------------------ *
 *  Simulation
 * ------------------------------------------------------------------ */

function update(now, dt) {
  game.time += dt;
  game.kick = Math.max(0, game.kick - dt * 3.6);
  game.shake = game.shake > 0.05 ? game.shake * Math.pow(0.002, dt) : 0;
  game.flash = Math.max(0, game.flash - dt * 2.4);

  if (game.comboTimer > 0) {
    game.comboTimer -= dt;
    if (game.comboTimer <= 0) {
      game.comboTimer = 0;
      game.combo = 0;
      updateComboUI();
    }
  }

  if (game.target) {
    game.target.flash = Math.max(0, game.target.flash - dt * 4.5);
  }

  const k = 1 - Math.pow(0.00035, dt);
  lay.gojo.x = lerp(lay.gojo.x, lay.gojoTarget.x, k);
  lay.gojo.y = lerp(lay.gojo.y, lay.gojoTarget.y, k);
  lay.gojo.height = lerp(lay.gojo.height, lay.gojoTarget.height, k);
  syncHand();
  if (game.target) applyTargetLayout();

  if (game.domainActive) {
    if (now >= game.domainEnd) {
      endDomain();
    } else {
      let guard = 0;
      while (now >= game.domainNext && guard < 5) {
        domainHit(now);
        game.domainNext += CFG.domainTick * 1000;
        guard++;
      }
      if (!reduceMotion && Math.random() < dt * 12) {
        fx.ember(rnd(0, lay.W), rnd(lay.H * 0.45, lay.H * 0.95), Math.random() < 0.5 ? '#bff3ff' : '#c4a4ff');
      }
    }
  }

  if (game.pendingSpawn && now >= game.pendingSpawn) spawnTarget();

  if (game.started && !game.introOpen) {
    const dps = autoDps(save.upgrades);
    if (dps > 0 && game.target && !game.target.dying) {
      game.idleTimer += dt;
      if (game.idleTimer >= 1.1) {
        game.idleTimer = 0;
        const t = game.target;
        const damage = Math.max(1, Math.round(dps * 1.1 * rnd(0.9, 1.1)));
        addDomainCharge(0.4);
        damageTarget(damage, {
          x: t.x + rnd(-t.r * 0.4, t.r * 0.4),
          y: t.y + rnd(-t.r * 0.3, t.r * 0.3),
          color: '#8ffcff',
          tiny: true,
          source: 'auto',
        });
      }
    } else {
      game.idleTimer = 0;
    }
  }

  if (!reduceMotion && Math.random() < dt * 2.6) {
    fx.ember(rnd(0, lay.W), lay.H * rnd(0.68, 1.02), Math.random() < 0.25 ? '#ff9fd2' : '#7fe8ff');
  }

  fx.update(dt);
  updateReticle(dt);

  game.hudTimer += dt;
  if (game.hudTimer >= 0.12) {
    game.hudTimer = 0;
    updateEnergy();
    updateComboUI();
    updateDomainUI(now);
    refreshUpgrades();
  }

  game.saveTimer += dt;
  if (game.saveTimer >= 4) {
    game.saveTimer = 0;
    persist();
  }
}

/* ------------------------------------------------------------------ *
 *  Game flow
 * ------------------------------------------------------------------ */

function startGame() {
  if (game.started) return;
  game.started = true;
  game.introOpen = false;
  app.classList.remove('intro-open');
  app.classList.add('playing');
  ui.intro.classList.add('closing');
  setTimeout(() => {
    ui.intro.hidden = true;
  }, 520);
  save.introSeen = true;
  audio.unlock();
  audio.setEnabled(save.sound);
  game.target.spawnT = performance.now();
  game.hintTaps = 0;
  ui.hint.classList.remove('hide');
  computeLayout();
  updateEnergy();
  updateStats();
  updateComboUI();
  updateDomainUI(performance.now());
  persist();
  toast('TAP THE CURSE · CHAIN FOR BLACK FLASH');
}

function updateSoundUI() {
  ui.soundBtn.setAttribute('aria-pressed', audio.enabled ? 'true' : 'false');
  ui.soundBtn.setAttribute('aria-label', audio.enabled ? 'Mute sound' : 'Enable sound');
}

function toggleSound() {
  audio.unlock();
  audio.setEnabled(!audio.enabled);
  save.sound = audio.enabled;
  updateSoundUI();
  if (audio.enabled) audio.ui();
  persist();
}

/* ------------------------------------------------------------------ *
 *  Input
 * ------------------------------------------------------------------ */

function bindEvents() {
  ui.startBtn.addEventListener('click', () => {
    audio.unlock();
    startGame();
  });

  ui.introTiltBtn.addEventListener('click', () => {
    enableTilt();
  });
  ui.tiltBtn.addEventListener('click', () => {
    enableTilt();
  });
  ui.soundBtn.addEventListener('click', toggleSound);
  ui.upgradesBtn.addEventListener('click', openSheet);
  ui.domainBtn.addEventListener('click', activateDomain);
  ui.resetBtn.addEventListener('click', armReset);

  ui.sheetWrap.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-sheet]')) {
      closeSheet();
      return;
    }
    const buy = event.target.closest('[data-buy]');
    if (buy) buyUpgrade(buy.dataset.buy);
  });

  canvas.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button && event.button > 0) return;
      event.preventDefault();
      if (!game.started || game.introOpen || game.sheetOpen) return;
      audio.unlock();
      strike(event.clientX, event.clientY);
    },
    { passive: false },
  );

  canvas.addEventListener('pointermove', (event) => {
    if (!tiltActive() || game.tilt.mode !== 'keys' || !game.started || game.introOpen) return;
    if (event.buttons) return;
    const t = game.target;
    if (!t) return;
    game.tilt.nx = clamp((event.clientX - t.x) / (t.r * 1.45), -1, 1);
    game.tilt.ny = clamp((event.clientY - t.y) / (t.r * 1.45), -1, 1);
  });

  window.addEventListener('keydown', (event) => {
    const key = event.key;
    if (key === 'Escape') {
      if (game.sheetOpen) {
        closeSheet();
        return;
      }
    }

    if (game.introOpen) {
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        startGame();
      }
      return;
    }

    if (game.sheetOpen) return;

    if (key === ' ' || key === 'Enter') {
      event.preventDefault();
      if (event.repeat) return;
      const t = game.target;
      const point = t ? corePoint(t) : { x: lay.W / 2, y: lay.H / 2 };
      strike(point.x + rnd(-12, 12), point.y + rnd(-12, 12));
    } else if (key === 'd' || key === 'D') {
      activateDomain();
    } else if (key === 'u' || key === 'U') {
      openSheet();
    } else if (key === 'm' || key === 'M') {
      toggleSound();
    } else if (key === 't' || key === 'T') {
      enableTilt();
    } else if (tiltActive() && key.startsWith('Arrow')) {
      event.preventDefault();
      const step = event.shiftKey ? 0.16 : 0.09;
      if (key === 'ArrowLeft') game.tilt.nx = clamp(game.tilt.nx - step, -1, 1);
      if (key === 'ArrowRight') game.tilt.nx = clamp(game.tilt.nx + step, -1, 1);
      if (key === 'ArrowUp') game.tilt.ny = clamp(game.tilt.ny - step, -1, 1);
      if (key === 'ArrowDown') game.tilt.ny = clamp(game.tilt.ny + step, -1, 1);
    }
  });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('gesturestart', (event) => event.preventDefault());

  window.addEventListener('resize', queueResize);
  window.addEventListener('orientationchange', () => setTimeout(queueResize, 220));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queueResize);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      persist();
      if (audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend();
    } else {
      game.lastNow = performance.now();
      if (audio.ctx && audio.enabled) audio.ctx.resume();
    }
  });
  window.addEventListener('pagehide', persist);
}

/* ------------------------------------------------------------------ *
 *  Boot
 * ------------------------------------------------------------------ */

function boot() {
  app.classList.add('intro-open');
  game.target = makeTarget(
    save.level,
    save.hp || curseMaxHp(save.level),
    performance.now() - 1200,
  );
  buildUpgradeCards();
  updateSoundUI();
  updateEnergy();
  updateStats();
  updateComboUI();
  updateDomainUI(performance.now());
  updateTiltUI();
  ui.hint.classList.add('hide');

  if (save.exorcised > 0) {
    ui.introSave.hidden = false;
    ui.introSave.textContent = `CONTINUE · LV.${save.level} · ${save.exorcised} EXORCISED · ${formatNumber(Math.floor(save.energy))} CE`;
    ui.startLabel.textContent = 'CONTINUE EXORCISM';
  } else {
    ui.introSave.hidden = true;
    ui.startLabel.textContent = 'START EXORCISM';
  }

  resize();
  bindEvents();
  game.tilt.x = lay.curse.x;
  game.tilt.y = lay.curse.y;
  game.lastNow = performance.now();
  requestAnimationFrame(function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - game.lastNow) / 1000));
    game.lastNow = now;
    update(now, dt);
    render(now);
    requestAnimationFrame(frame);
  });

  // Convenient, testable surface for browser automation. Not used by gameplay.
  window.__gojo = {
    game,
    save,
    layout: lay,
    strike,
    activateDomain,
    enableTilt,
    disableTilt,
    buyUpgrade,
    spawnTarget,
    resetRun,
    start: startGame,
    stats() {
      return {
        started: game.started,
        introOpen: game.introOpen,
        level: save.level,
        energy: save.energy,
        hp: game.target ? game.target.hp : null,
        maxHp: game.target ? game.target.max : null,
        combo: game.combo,
        domainCharge: game.domainCharge,
        domainActive: game.domainActive,
        exorcised: save.exorcised,
        upgrades: { ...save.upgrades },
        tilt: { ...game.tilt },
        target: game.target ? game.target.info.name : null,
      };
    },
  };
  window.__gojoReady = true;
}

boot();
