import { clamp } from './config.js';
import { cam, screenToTile, zoomAt, clampCam } from './world.js';
import { els } from './ui.js';
import { setHover } from './render.js';

const $ = (id) => document.getElementById(id);

export function bindInput(handlers) {
  const canvas = els.field;

  /* ---------------------------- Buttons ---------------------------- */
  const bind = (id, fn) => {
    const el = $(id);
    if (el) el.addEventListener('click', (e) => { e.preventDefault(); fn(); });
  };

  bind('deployBtn', handlers.deploy);
  bind('redeployBtn', handlers.redeploy);
  bind('endTurn', handlers.endTurn);
  bind('menuBtn', handlers.openPause);
  bind('resumeBtn', handlers.closePause);
  bind('restartBtn', handlers.restart);
  bind('soundBtn', handlers.toggleSound);
  bind('tiltToggle', handlers.toggleTilt);
  bind('tiltBtn', handlers.toggleTilt);
  bind('pauseTiltBtn', handlers.toggleTilt);
  bind('zoomIn', () => handlers.zoomBy(1.25));
  bind('zoomOut', () => handlers.zoomBy(1 / 1.25));
  bind('recenter', handlers.recenter);
  bind('waitBtn', handlers.wait);
  bind('deselectBtn', handlers.deselect);
  bind('closeRecruit', handlers.closeRecruit);

  els.recruitList.addEventListener('click', (e) => {
    const card = e.target.closest('.recruit-card');
    if (card && !card.disabled) handlers.buy(card.dataset.type);
  });

  /* ---------------------------- Pointer ---------------------------- */
  const pointers = new Map();
  const gesture = {
    mode: null,
    startX: 0, startY: 0,
    lastX: 0, lastY: 0,
    midX: 0, midY: 0,
    pinchDist: 0,
    moved: false,
    time: 0,
  };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  canvas.addEventListener('pointerdown', (e) => {
    if (!els.intro.classList.contains('hidden') || !els.result.classList.contains('hidden')) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      gesture.mode = 'pan';
      gesture.startX = e.clientX;
      gesture.startY = e.clientY;
      gesture.lastX = e.clientX;
      gesture.lastY = e.clientY;
      gesture.moved = false;
      gesture.time = performance.now();
      cam.tween = null;
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      gesture.mode = 'pinch';
      gesture.pinchDist = dist(pts[0], pts[1]);
      gesture.midX = (pts[0].x + pts[1].x) / 2;
      gesture.midY = (pts[0].y + pts[1].y) / 2;
      gesture.moved = true;
      cam.tween = null;
    }
    setHover(null);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') setHover(screenToTile(e.clientX, e.clientY));
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (gesture.mode === 'pinch' && pointers.size >= 2) {
      const pts = [...pointers.values()];
      const nd = dist(pts[0], pts[1]);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      if (gesture.pinchDist > 0) zoomAt(midX, midY, clamp(nd / gesture.pinchDist, 0.75, 1.35));
      gesture.pinchDist = nd;
      const s = cam.base * cam.zoom;
      cam.cx -= (midX - gesture.midX) / s;
      cam.cy -= (midY - gesture.midY) / s;
      gesture.midX = midX;
      gesture.midY = midY;
      clampCam();
      return;
    }

    if (gesture.mode === 'pan') {
      const dx = e.clientX - gesture.lastX;
      const dy = e.clientY - gesture.lastY;
      if (Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) > 8) gesture.moved = true;
      const s = cam.base * cam.zoom;
      cam.cx -= dx / s;
      cam.cy -= dy / s;
      clampCam();
      gesture.lastX = e.clientX;
      gesture.lastY = e.clientY;
    }
  });

  const endPointer = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const wasMode = gesture.mode;
    const moved = gesture.moved;
    const elapsed = performance.now() - gesture.time;
    pointers.delete(e.pointerId);

    if (wasMode === 'pinch') {
      if (pointers.size === 1) {
        const p = [...pointers.values()][0];
        gesture.mode = 'pan';
        gesture.lastX = p.x;
        gesture.lastY = p.y;
        gesture.startX = p.x;
        gesture.startY = p.y;
        gesture.moved = true;
        gesture.time = performance.now();
      } else if (pointers.size === 0) {
        gesture.mode = null;
      }
      return;
    }

    if (wasMode === 'pan' && pointers.size === 0) {
      if (!moved && elapsed < 700) {
        const t = screenToTile(e.clientX, e.clientY);
        handlers.handleTap(t.x, t.y);
      }
      gesture.mode = null;
    }
  };

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    gesture.mode = null;
  });
  canvas.addEventListener('pointerleave', () => {
    if (pointers.size === 0) setHover(null);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0016);
    zoomAt(e.clientX, e.clientY, clamp(factor, 0.8, 1.25));
  }, { passive: false });

  /* ---------------------------- Minimap ---------------------------- */
  els.minimapWrap.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = els.minimap.getBoundingClientRect();
    const tx = ((e.clientX - rect.left) / rect.width) * 32;
    const ty = ((e.clientY - rect.top) / rect.height) * 32;
    handlers.minimapJump(tx, ty);
  });

  /* ---------------------------- Keyboard --------------------------- */
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (!els.result.classList.contains('hidden')) return;
    const key = e.key;
    const lower = key.toLowerCase();

    if (key === 'Escape') {
      if (!els.pause.classList.contains('hidden')) { handlers.closePause(); return; }
      if (!els.recruit.classList.contains('hidden')) { handlers.closeRecruit(); return; }
      handlers.deselect();
      return;
    }
    if (lower === 'p') {
      if (!els.pause.classList.contains('hidden')) handlers.closePause();
      else handlers.openPause();
      return;
    }
    if (!els.pause.classList.contains('hidden')) return;
    if (lower === 'e' || key === 'Enter') { e.preventDefault(); handlers.endTurn(); return; }
    if (lower === 'w') { handlers.wait(); return; }
    if (lower === 't') { handlers.toggleTilt(); return; }
    if (lower === 'm') { handlers.toggleSound(); return; }
    if (lower === 'r') { handlers.recenter(); return; }
    if (key === '+' || key === '=') { handlers.zoomBy(1.25); return; }
    if (key === '-' || key === '_') { handlers.zoomBy(1 / 1.25); return; }
    if (key === ' ') { e.preventDefault(); handlers.recenter(); return; }

    const step = 1.1;
    if (key === 'ArrowLeft') { cam.cx -= step; cam.tween = null; clampCam(); e.preventDefault(); }
    if (key === 'ArrowRight') { cam.cx += step; cam.tween = null; clampCam(); e.preventDefault(); }
    if (key === 'ArrowUp') { cam.cy -= step; cam.tween = null; clampCam(); e.preventDefault(); }
    if (key === 'ArrowDown') { cam.cy += step; cam.tween = null; clampCam(); e.preventDefault(); }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setHover(null);
  });
}
