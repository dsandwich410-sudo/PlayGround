/* ────────────────────────────────────────────────────────────────────────
   FRONTLINE 32 — bootstrap, camera input and optional motion controls
   ──────────────────────────────────────────────────────────────────────── */

import { Game } from './game.js';
import { Renderer } from './renderer.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';
import { W, H } from './map.js';

const canvas = document.getElementById('board');
const minimap = document.getElementById('minimap');

const game = new Game();
const sound = new Sound();
const renderer = new Renderer(canvas, minimap, game);
const ui = new UI(game, renderer, sound);

renderer.setTilt(0, 0);

/* ── Pointer / touch camera + taps ─────────────────────────────────────── */
const pointers = new Map();
let gesture = null;
let pinch = null;
let clickGuardUntil = 0;

function beginPinch() {
  const pts = [...pointers.values()];
  if (pts.length < 2) { pinch = null; return; }
  const [a, b] = pts;
  pinch = {
    dist: Math.hypot(b.x - a.x, b.y - a.y),
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2,
  };
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  sound.unlock();
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  pointers.set(e.pointerId, {
    x: e.clientX, y: e.clientY,
    startX: e.clientX, startY: e.clientY,
    startTime: performance.now(),
    pointerType: e.pointerType,
  });

  if (pointers.size === 1) {
    gesture = { mode: 'pending', moved: 0 };
  } else if (pointers.size === 2) {
    if (gesture) gesture.mode = 'pinch';
    beginPinch();
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x;
  const dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;

  if (pointers.size >= 2) {
    if (!pinch) beginPinch();
    const pts = [...pointers.values()];
    const [a, b] = pts;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    if (pinch) {
      if (pinch.dist > 1 && dist > 1) renderer.zoomAt(midX, midY, dist / pinch.dist);
      renderer.panBy(midX - pinch.midX, midY - pinch.midY);
    }
    pinch = { dist, midX, midY };
    if (gesture) gesture.mode = 'pinch';
    return;
  }

  if (!gesture) return;
  gesture.moved += Math.hypot(dx, dy);
  if (gesture.mode === 'pending' && gesture.moved > 8) gesture.mode = 'pan';
  if (gesture.mode === 'pan') renderer.panBy(dx, dy);
});

function endPointer(e, cancelled = false) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const wasSingle = pointers.size === 1;
  pointers.delete(e.pointerId);

  if (wasSingle && !cancelled && gesture && gesture.mode === 'pending') {
    const elapsed = performance.now() - p.startTime;
    const travel = Math.hypot(p.x - p.startX, p.y - p.startY);
    if (elapsed < 650 && travel < 10) {
      const world = renderer.screenToWorld(p.x, p.y);
      const tx = Math.floor(world.x);
      const ty = Math.floor(world.y);
      if (tx >= 0 && tx < W && ty >= 0 && ty < H) {
        const hadSheet = game.buildCityId !== null;
        game.tap(tx, ty);
        // Opening the deployment sheet under the finger must not let the
        // browser's synthesized click activate a build card in the same tap.
        if (!hadSheet && game.buildCityId !== null) clickGuardUntil = performance.now() + 400;
      }
    }
  }

  if (pointers.size === 1) {
    gesture = { mode: 'pan', moved: 99 };
    pinch = null;
  } else if (pointers.size === 0) {
    gesture = null;
    pinch = null;
  } else {
    beginPinch();
  }
}

canvas.addEventListener('pointerup', (e) => endPointer(e));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* Swallow the compatibility click that immediately follows a canvas tap which
   opened a sheet. Without this, that click can land on a card that just
   appeared under the finger and deploy a unit unintentionally. */
document.addEventListener('click', (e) => {
  if (performance.now() < clickGuardUntil && e.target.closest?.('#citySheet, #sheetScrim')) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0016);
  renderer.zoomAt(e.clientX, e.clientY, factor);
}, { passive: false });

/* Minimap: tap or drag to jump the field camera. */
let miniDrag = false;
function miniJump(e) {
  const rect = minimap.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W;
  const y = ((e.clientY - rect.top) / rect.height) * H;
  renderer.jumpTo(Math.max(0, Math.min(W, x)), Math.max(0, Math.min(H, y)));
}
minimap.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  e.stopPropagation();
  miniDrag = true;
  minimap.setPointerCapture(e.pointerId);
  sound.unlock();
  miniJump(e);
});
minimap.addEventListener('pointermove', (e) => { if (miniDrag) miniJump(e); });
minimap.addEventListener('pointerup', (e) => {
  miniDrag = false;
  try { minimap.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
});
minimap.addEventListener('pointercancel', () => { miniDrag = false; });

/* Keyboard support for desktop play. */
window.addEventListener('keydown', (e) => {
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const step = 90;
  if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') renderer.panBy(step, 0);
  else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') renderer.panBy(-step, 0);
  else if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') renderer.panBy(0, step);
  else if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') renderer.panBy(0, -step);
  else if (e.key === '+' || e.key === '=') renderer.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.18);
  else if (e.key === '-') renderer.zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.85);
  else if (e.code === 'Space') {
    e.preventDefault();
    if (game.side === 'player' && !game.busy && !game.over && game.started) game.endPlayerTurn();
  } else if (e.key === 'Escape') {
    if (!ui.el.manual.hidden) ui.closeManual();
    else if (!ui.el.citySheet.hidden) game.closeBuild();
    else if (game.selectedId || game.inspectedId) game.clearSelection();
  } else if (e.key.toLowerCase() === 'f') {
    const hq = game.playerHQ();
    if (hq) renderer.jumpTo(hq.x + 1.5, hq.y - 1.5);
  } else return;
  e.preventDefault();
});

/* ── Optional motion controls ──────────────────────────────────────────── */
class MotionControls {
  constructor(button, toast) {
    this.button = button;
    this.toast = toast;
    this.enabled = false;
    this.calibrated = false;
    this.calib = { beta: 0, gamma: 0 };
    this.heard = false;
    this.watchdog = null;
    this.onOrient = this.onOrient.bind(this);
    button.addEventListener('click', () => this.toggle());
  }

  async toggle() {
    sound.unlock();
    if (this.enabled) { this.disable(true); return; }

    if (!window.DeviceOrientationEvent) {
      this.toast('Motion sensors are not available on this device.', 'warn');
      return;
    }

    try {
      if (typeof window.DeviceOrientationEvent.requestPermission === 'function') {
        const result = await window.DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') {
          this.toast('Motion access was not granted. Touch controls remain active.', 'warn');
          return;
        }
      }
    } catch {
      this.toast('Motion access was blocked. Check browser permissions.', 'warn');
      return;
    }

    this.enabled = true;
    this.calibrated = false;
    this.heard = false;
    window.addEventListener('deviceorientation', this.onOrient, true);
    this.button.classList.add('active');
    this.button.setAttribute('aria-pressed', 'true');
    this.button.setAttribute('aria-label', 'Disable tilt controls');
    this.toast('Tilt enabled — move your device to look around.', 'good');
    sound.click();

    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(() => {
      if (this.enabled && !this.heard) {
        this.disable(false);
        this.toast('No motion readings detected — tilt switched off.', 'warn');
      }
    }, 2200);
  }

  disable(announce) {
    this.enabled = false;
    window.removeEventListener('deviceorientation', this.onOrient, true);
    this.button.classList.remove('active');
    this.button.setAttribute('aria-pressed', 'false');
    this.button.setAttribute('aria-label', 'Enable tilt controls');
    renderer.setTilt(0, 0);
    clearTimeout(this.watchdog);
    if (announce) {
      this.toast('Tilt controls off. Drag to pan instead.', '');
      sound.click();
    }
  }

  onOrient(e) {
    if (!this.enabled) return;
    if (e.beta == null && e.gamma == null) return;
    this.heard = true;
    const beta = e.beta || 0;
    const gamma = e.gamma || 0;
    if (!this.calibrated) {
      this.calib = { beta, gamma };
      this.calibrated = true;
    }
    let dtBeta = beta - this.calib.beta;
    let dtGamma = gamma - this.calib.gamma;
    const angle = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    let x = dtGamma, y = dtBeta;
    if (angle === 90) { x = -dtBeta; y = dtGamma; }
    else if (angle === -90 || angle === 270) { x = dtBeta; y = -dtGamma; }

    const dead = (v) => {
      const a = Math.abs(v);
      if (a < 3) return 0;
      const s = Math.sign(v);
      return s * Math.min(1, (a - 3) / 26);
    };
    renderer.setTilt(dead(x), dead(y));
  }
}

const motion = new MotionControls(ui.el.tilt, (text, kind) => ui.toast(text, kind));

/* ── Sound + tactile feedback hookups ──────────────────────────────────── */
game.addEventListener('fx', (e) => {
  const fx = e.detail;
  sound.fx(fx);
  if (fx.side === 'player' && navigator.vibrate) {
    if (fx.kind === 'attack') navigator.vibrate(fx.ranged ? 22 : 12);
    else if (fx.kind === 'capture') navigator.vibrate([14, 30, 22]);
    else if (fx.kind === 'death') navigator.vibrate(30);
  }
});

/* Keep the audio context responsive after mobile tab switches. */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) sound.unlock();
});

/* Exposed for debugging and for automated field inspection. */
window.__frontline = { game, renderer, ui, sound, motion };
