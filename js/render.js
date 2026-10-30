import {
  W, H, FOREST, HILLS, WATER, TERRAIN, SIDES, UNIT_TYPES,
  clamp, lerp, hash2, rgba, ownerColor, idx,
} from './config.js';
import {
  game, cam, view, scale, clampCam, setViewport, worldToScreen, unitAt, pathFrom,
} from './world.js';
import { els } from './ui.js';

/* ------------------------------------------------------------------ */
/*  Canvas plumbing                                                    */
/* ------------------------------------------------------------------ */

const canvas = els.field;
const ctx = canvas.getContext('2d', { alpha: false });
const mini = els.minimap;
const mctx = mini.getContext('2d');

const fogCanvas = document.createElement('canvas');
fogCanvas.width = W;
fogCanvas.height = H;
const fctx = fogCanvas.getContext('2d');
const fogImage = fctx.createImageData(W, H);

const miniBase = document.createElement('canvas');
miniBase.width = 220;
miniBase.height = 220;
const mbctx = miniBase.getContext('2d');
let miniBaseSeed = null;

const hooks = [];
let last = 0;
let miniLast = 0;
let started = false;

export const fx = {
  tracers: [],
  shells: [],
  particles: [],
  floats: [],
  rings: [],
  flash: 0,
  flashColor: '#ffffff',
};

export function onFrame(fn) {
  hooks.push(fn);
}

export function resizeRender() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  setViewport(w, h, dpr);
}

export function initRender() {
  resizeRender();
  window.addEventListener('resize', resizeRender);
  window.addEventListener('orientationchange', () => setTimeout(resizeRender, 180));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeRender);
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/*  Effects                                                            */
/* ------------------------------------------------------------------ */

export function addShake(power = 4) {
  cam.shake = Math.max(cam.shake, power);
}

export function addTracer(from, to, color, kind = 'line') {
  if (kind === 'shell') {
    fx.shells.push({
      x1: from.x + 0.5, y1: from.y + 0.5, x2: to.x + 0.5, y2: to.y + 0.5,
      t: 0, dur: 0.34, color,
    });
  } else {
    fx.tracers.push({
      x1: from.x + 0.5, y1: from.y + 0.5, x2: to.x + 0.5, y2: to.y + 0.5,
      life: 0.2, max: 0.2, color,
    });
  }
}

export function addExplosion(x, y, color = '#ffc857', big = 1) {
  const n = Math.round(12 * big);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.45 + Math.random() * 1.5 * big;
    fx.particles.push({
      x: x + 0.5, y: y + 0.5,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.35 + Math.random() * 0.45, max: 0.8,
      color, size: 0.03 + Math.random() * 0.05,
    });
  }
  fx.rings.push({ x: x + 0.5, y: y + 0.5, t: 0, dur: 0.42, color, max: 0.55 * big });
  fx.flash = Math.max(fx.flash, 0.1 * big);
  fx.flashColor = color;
}

export function addFloat(x, y, text, color = '#ffffff', size = 12) {
  fx.floats.push({ x: x + 0.5, y: y + 0.35, text, color, life: 1.15, max: 1.15, size });
}

export function addRing(x, y, color = '#4aa8ff', max = 0.6, dur = 0.6) {
  fx.rings.push({ x: x + 0.5, y: y + 0.5, t: 0, dur, color, max });
}

export function addFlash(color = '#ffffff', amount = 0.2) {
  fx.flash = Math.max(fx.flash, amount);
  fx.flashColor = color;
}

/* ------------------------------------------------------------------ */
/*  Main loop                                                          */
/* ------------------------------------------------------------------ */

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
  last = now;
  if (cam.tween) {
    const t = clamp((now - cam.tween.start) / cam.tween.dur, 0, 1);
    const e = 1 - Math.pow(1 - t, 3);
    cam.cx = lerp(cam.tween.fromX, cam.tween.toX, e);
    cam.cy = lerp(cam.tween.fromY, cam.tween.toY, e);
    cam.zoom = lerp(cam.tween.fromZ, cam.tween.toZ, e);
    clampCam();
    if (t >= 1) cam.tween = null;
  }
  updateAnims(now);
  for (const fn of hooks) fn(dt, now);
  cam.shake *= Math.pow(0.004, dt);
  if (cam.shake < 0.08) cam.shake = 0;
  updateEffects(dt);
  draw(now);
  requestAnimationFrame(frame);
}

function updateAnims(now) {
  for (const u of game.units) {
    if (!u.anim) continue;
    if ((now - u.anim.start) / u.anim.dur >= 1) {
      const a = u.anim;
      const end = a.path[a.path.length - 1];
      u.anim = null;
      u.x = end.x;
      u.y = end.y;
      a.resolve();
    }
  }
}

function updateEffects(dt) {
  for (const t of fx.tracers) t.life -= dt;
  fx.tracers = fx.tracers.filter((t) => t.life > 0);
  for (const s of fx.shells) s.t += dt / s.dur;
  fx.shells = fx.shells.filter((s) => s.t < 1);
  for (const p of fx.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt;
  }
  fx.particles = fx.particles.filter((p) => p.life > 0);
  for (const f of fx.floats) {
    f.y -= dt * 0.45;
    f.life -= dt;
  }
  fx.floats = fx.floats.filter((f) => f.life > 0);
  for (const r of fx.rings) r.t += dt / r.dur;
  fx.rings = fx.rings.filter((r) => r.t < 1);
  fx.flash *= Math.pow(0.003, dt);
  if (fx.flash < 0.01) fx.flash = 0;
}

export function animateMove(unit, path) {
  if (!path || path.length < 2) return Promise.resolve();
  return new Promise((resolve) => {
    unit.anim = {
      path,
      start: performance.now(),
      dur: Math.max(120, (path.length - 1) * 82),
      resolve,
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Drawing                                                            */
/* ------------------------------------------------------------------ */

function draw(now) {
  const w = view.w;
  const h = view.h;
  const dpr = view.dpr || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bg = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.8);
  bg.addColorStop(0, '#0a1418');
  bg.addColorStop(0.6, '#060d10');
  bg.addColorStop(1, '#030608');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const s = scale();
  let ox = 0;
  let oy = 0;
  if (cam.shake > 0.1) {
    ox = (Math.random() * 2 - 1) * cam.shake;
    oy = (Math.random() * 2 - 1) * cam.shake;
  }

  ctx.save();
  ctx.translate(w / 2 + ox, h / 2 + oy);
  ctx.scale(s, s);
  ctx.translate(-cam.cx, -cam.cy);

  const bounds = {
    x0: Math.max(0, Math.floor(cam.cx - w / (2 * s)) - 1),
    x1: Math.min(W - 1, Math.ceil(cam.cx + w / (2 * s)) + 1),
    y0: Math.max(0, Math.floor(cam.cy - h / (2 * s)) - 1),
    y1: Math.min(H - 1, Math.ceil(cam.cy + h / (2 * s)) + 1),
  };

  drawTerrain(now, s, bounds);
  drawGrid(s, bounds);
  drawCities(now, s, bounds);
  drawFog(s);
  drawGhostCities(s);
  drawCityMarkers(now);
  drawOverlays(now, s);
  drawUnits(now, s);
  drawWorldEffects();
  ctx.restore();

  drawFloats();
  drawFlash(w, h);
  drawVignette(w, h);
  drawMinimap(now);
}

/* ------------------------------------------------------------------ */
/*  Terrain                                                            */
/* ------------------------------------------------------------------ */

function drawTerrain(now, s, b) {
  const t = now * 0.001;
  const detail = s > 12;

  // Map body / border shadow.
  ctx.fillStyle = '#04090b';
  ctx.fillRect(-0.25, -0.25, W + 0.5, H + 0.5);

  for (let y = b.y0; y <= b.y1; y++) {
    for (let x = b.x0; x <= b.x1; x++) {
      const i = idx(x, y);
      const type = game.terrain[i];
      const pal = TERRAIN[type].colors;
      const hv = hash2(x, y);
      ctx.fillStyle = pal[(hv * pal.length) | 0];
      ctx.fillRect(x, y, 1.005, 1.005);

      if (!detail) continue;
      if (type === WATER) {
        ctx.strokeStyle = `rgba(120, 205, 236, ${0.09 + hv * 0.07})`;
        ctx.lineWidth = 0.028;
        for (let k = 0; k < 3; k++) {
          const wy = y + 0.24 + k * 0.28 + Math.sin(t * 1.2 + x * 0.65 + k * 2.1) * 0.045;
          ctx.beginPath();
          ctx.moveTo(x + 0.1, wy);
          ctx.quadraticCurveTo(x + 0.5, wy - 0.09, x + 0.9, wy);
          ctx.stroke();
        }
      } else if (type === FOREST) {
        for (let k = 0; k < 5; k++) {
          const hx = hash2(x * 5 + k, y * 7 + 3);
          const hy = hash2(x * 7 + 1, y * 5 + k);
          const px = x + 0.14 + hx * 0.72;
          const py = y + 0.25 + hy * 0.56;
          const sz = 0.11 + hx * 0.07;
          ctx.fillStyle = 'rgba(3, 12, 7, 0.78)';
          ctx.beginPath();
          ctx.moveTo(px, py - sz);
          ctx.lineTo(px - sz * 0.66, py + sz * 0.55);
          ctx.lineTo(px + sz * 0.66, py + sz * 0.55);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = `rgba(104, 174, 118, ${0.18 + hy * 0.16})`;
          ctx.beginPath();
          ctx.moveTo(px, py - sz);
          ctx.lineTo(px - sz * 0.34, py + sz * 0.16);
          ctx.lineTo(px, py + sz * 0.2);
          ctx.closePath();
          ctx.fill();
        }
      } else if (type === HILLS) {
        ctx.strokeStyle = 'rgba(222, 208, 158, 0.2)';
        ctx.lineWidth = 0.03;
        for (let k = 0; k < 3; k++) {
          const px = x + 0.5 + (k - 1) * 0.14;
          const py = y + 0.66 - k * 0.13;
          ctx.beginPath();
          ctx.arc(px, py, 0.16 + k * 0.09, Math.PI * 1.08, Math.PI * 1.92);
          ctx.stroke();
        }
      } else if (s > 20 && hv > 0.55) {
        ctx.strokeStyle = 'rgba(158, 208, 172, 0.14)';
        ctx.lineWidth = 0.022;
        const px = x + 0.25 + hv * 0.5;
        const py = y + 0.4 + hash2(x + 9, y + 7) * 0.25;
        ctx.beginPath();
        ctx.moveTo(px - 0.035, py + 0.06);
        ctx.lineTo(px, py);
        ctx.lineTo(px + 0.035, py + 0.07);
        ctx.stroke();
      }
    }
  }

  // Broad directional light keeps the field from reading as a flat dark grid.
  const lit = ctx.createLinearGradient(W * 0.1, 0, W * 0.9, H);
  lit.addColorStop(0, 'rgba(178, 226, 210, 0.07)');
  lit.addColorStop(0.45, 'rgba(120, 180, 170, 0.015)');
  lit.addColorStop(0.8, 'rgba(0, 0, 0, 0.03)');
  lit.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
  ctx.fillStyle = lit;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(126, 205, 235, 0.16)';
  ctx.lineWidth = 0.06;
  ctx.strokeRect(0.03, 0.03, W - 0.06, H - 0.06);
}

function drawGrid(s, b) {
  const top = Math.max(0, b.y0);
  const bottom = Math.min(H, b.y1 + 1);
  const left = Math.max(0, b.x0);
  const right = Math.min(W, b.x1 + 1);
  ctx.strokeStyle = 'rgba(158, 218, 238, 0.075)';
  ctx.lineWidth = Math.max(0.6 / s, 0.015);
  ctx.beginPath();
  for (let x = left; x <= right; x++) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = top; y <= bottom; y++) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/*  Cities                                                             */
/* ------------------------------------------------------------------ */

function drawCities(now, s, b) {
  for (const c of game.cities) {
    if (c.x < b.x0 - 1 || c.x > b.x1 + 1 || c.y < b.y0 - 1 || c.y > b.y1 + 1) continue;
    const accent = ownerColor(c.owner);
    const x = c.x;
    const y = c.y;
    const visible = game.vis[0][idx(x, y)] === 1;
    const alpha = visible ? 1 : 0.74;
    ctx.save();
    ctx.globalAlpha = alpha;

    // Control wash.
    ctx.fillStyle = rgba(accent, c.owner === -1 ? 0.06 : 0.16);
    ctx.fillRect(x + 0.03, y + 0.03, 0.94, 0.94);
    ctx.strokeStyle = rgba(accent, c.owner === -1 ? 0.36 : 0.85);
    ctx.lineWidth = 0.03;
    ctx.strokeRect(x + 0.06, y + 0.06, 0.88, 0.88);

    ctx.translate(x, y);

    if (c.owner !== -1) {
      const glow = ctx.createRadialGradient(0.5, 0.5, 0.08, 0.5, 0.5, 0.56);
      glow.addColorStop(0, rgba(accent, 0.24));
      glow.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, 1, 1);
    }

    if (c.hq) {
      // Fortified command post.
      ctx.fillStyle = 'rgba(14, 24, 28, 0.95)';
      ctx.fillRect(0.18, 0.34, 0.64, 0.42);
      ctx.strokeStyle = rgba(accent, 0.95);
      ctx.lineWidth = 0.034;
      ctx.strokeRect(0.18, 0.34, 0.64, 0.42);
      ctx.fillStyle = rgba(accent, 0.72);
      for (let k = 0; k < 4; k++) ctx.fillRect(0.2 + k * 0.16, 0.28, 0.08, 0.08);
      ctx.fillStyle = '#060d10';
      ctx.fillRect(0.44, 0.56, 0.12, 0.2);
      // Flag.
      ctx.strokeStyle = 'rgba(230, 245, 252, 0.9)';
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(0.76, 0.08);
      ctx.lineTo(0.76, 0.3);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0.76, 0.08);
      ctx.lineTo(0.96, 0.14);
      ctx.lineTo(0.76, 0.21);
      ctx.closePath();
      ctx.fill();
      // Star.
      drawStar(ctx, 0.5, 0.55, 0.1, 'rgba(255,255,255,0.85)');
      drawStar(ctx, 0.5, 0.55, 0.072, accent);
    } else {
      // Town blocks.
      ctx.fillStyle = 'rgba(20, 34, 40, 0.97)';
      ctx.strokeStyle = 'rgba(178, 210, 220, 0.62)';
      ctx.lineWidth = 0.022;
      ctx.fillRect(0.16, 0.42, 0.26, 0.32);
      ctx.strokeRect(0.16, 0.42, 0.26, 0.32);
      ctx.fillRect(0.47, 0.3, 0.17, 0.44);
      ctx.strokeRect(0.47, 0.3, 0.17, 0.44);
      ctx.fillRect(0.55, 0.62, 0.26, 0.12);
      ctx.strokeRect(0.55, 0.62, 0.26, 0.12);

      ctx.fillStyle = rgba(accent, 0.98);
      ctx.fillRect(0.16, 0.42, 0.26, 0.05);
      ctx.fillRect(0.47, 0.3, 0.17, 0.05);
      ctx.fillRect(0.55, 0.62, 0.26, 0.05);

      if (s > 20) {
        ctx.fillStyle = 'rgba(255, 208, 110, 0.8)';
        ctx.fillRect(0.22, 0.52, 0.045, 0.045);
        ctx.fillRect(0.31, 0.52, 0.045, 0.045);
        ctx.fillRect(0.51, 0.4, 0.045, 0.045);
        ctx.fillRect(0.57, 0.4, 0.045, 0.045);
      }

      // Flag mast.
      ctx.strokeStyle = 'rgba(226, 244, 252, 0.72)';
      ctx.lineWidth = 0.024;
      ctx.beginPath();
      ctx.moveTo(0.72, 0.18);
      ctx.lineTo(0.72, 0.36);
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0.72, 0.18);
      ctx.lineTo(0.88, 0.225);
      ctx.lineTo(0.72, 0.27);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

  }
}

function drawStar(ctx, cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    const px = cx + Math.cos(a) * rr;
    const py = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/* ------------------------------------------------------------------ */
/*  Fog                                                                */
/* ------------------------------------------------------------------ */

function drawFog(s) {
  if (!game.started) return;
  if (game.fogDirty) {
    const data = fogImage.data;
    for (let i = 0; i < W * H; i++) {
      const visible = game.vis[0][i] === 1;
      const seen = game.seen[i] === 1;
      const a = visible ? 0 : seen ? 56 : 150;
      const p = i * 4;
      data[p] = 3;
      data[p + 1] = 7;
      data[p + 2] = 9;
      data[p + 3] = a;
    }
    fctx.putImageData(fogImage, 0, 0);
    game.fogDirty = false;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(fogCanvas, 0, 0, W, H);
  ctx.restore();
  // A faint coordinate grid reads through the fog.
  ctx.strokeStyle = 'rgba(120, 190, 220, 0.035)';
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 1) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 0; y <= H; y += 1) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
}

function drawGhostCities(s) {
  if (!game.started) return;
  for (const c of game.cities) {
    if (game.vis[0][idx(c.x, c.y)]) continue;
    const accent = ownerColor(c.owner);
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.strokeStyle = rgba(accent, 0.7);
    ctx.lineWidth = 0.025;
    ctx.setLineDash([0.09, 0.07]);
    ctx.strokeRect(c.x + 0.2, c.y + 0.2, 0.6, 0.6);
    ctx.setLineDash([]);
    // Small intel flag.
    ctx.strokeStyle = 'rgba(235, 248, 255, 0.7)';
    ctx.lineWidth = 0.024;
    ctx.beginPath();
    ctx.moveTo(c.x + 0.5, c.y + 0.42);
    ctx.lineTo(c.x + 0.5, c.y + 0.6);
    ctx.stroke();
    ctx.fillStyle = rgba(accent, 0.82);
    ctx.beginPath();
    ctx.moveTo(c.x + 0.5, c.y + 0.42);
    ctx.lineTo(c.x + 0.68, c.y + 0.47);
    ctx.lineTo(c.x + 0.5, c.y + 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawCityMarkers(now) {
  if (!game.started || game.phase !== 'player' || game.over) return;
  for (const c of game.cities) {
    if (c.owner !== 0 || unitAt(c.x, c.y)) continue;
    if (!game.vis[0][idx(c.x, c.y)]) continue;
    const pulse = 0.65 + 0.35 * Math.sin(now * 0.004);
    ctx.save();
    ctx.translate(c.x + 0.82, c.y + 0.2);
    ctx.fillStyle = `rgba(255, 200, 87, ${0.16 * pulse})`;
    ctx.beginPath();
    ctx.arc(0, 0, 0.19, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 200, 87, ${0.8 * pulse})`;
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.arc(0, 0, 0.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.055, 0);
    ctx.lineTo(0.055, 0);
    ctx.moveTo(0, -0.055);
    ctx.lineTo(0, 0.055);
    ctx.stroke();
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/*  Orders overlays                                                    */
/* ------------------------------------------------------------------ */

function drawOverlays(now, s) {
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.005);

  if (game.sel && game.reach && game.phase === 'player') {
    const { dist, max } = game.reach;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        const d = dist[i];
        if (!Number.isFinite(d) || d <= 0 || d > max) continue;
        if (unitAt(x, y)) continue;
        ctx.fillStyle = `rgba(74, 168, 255, ${0.07 + 0.03 * (1 - d / max)})`;
        ctx.fillRect(x + 0.05, y + 0.05, 0.9, 0.9);
        ctx.strokeStyle = 'rgba(140, 202, 255, 0.14)';
        ctx.lineWidth = 0.018;
        ctx.strokeRect(x + 0.08, y + 0.08, 0.84, 0.84);
      }
    }

    if (game.hover) {
      const hx = Math.floor(game.hover.x);
      const hy = Math.floor(game.hover.y);
      if (hx >= 0 && hy >= 0 && hx < W && hy < H) {
        const k = idx(hx, hy);
        const d = game.reach.dist[k];
        if (Number.isFinite(d) && d <= max && d > 0 && !unitAt(hx, hy)) {
          const path = pathFrom(game.reach.prev, game.reach.start, k);
          if (path.length > 1) {
            ctx.save();
            ctx.strokeStyle = 'rgba(185, 230, 255, 0.75)';
            ctx.lineWidth = 0.035;
            ctx.setLineDash([0.1, 0.12]);
            ctx.lineDashOffset = -now * 0.0015;
            ctx.beginPath();
            ctx.moveTo(path[0].x + 0.5, path[0].y + 0.5);
            for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x + 0.5, path[i].y + 0.5);
            ctx.stroke();
            ctx.restore();
            ctx.strokeStyle = 'rgba(185, 230, 255, 0.85)';
            ctx.lineWidth = 0.025;
            ctx.beginPath();
            ctx.arc(hx + 0.5, hy + 0.5, 0.17, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    }
  }

  if (game.sel) {
    const targets = game.attackTargets;
    for (const t of targets) {
      const ux = t.x + 0.5;
      const uy = t.y + 0.5;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 95, 74, ${0.16 + pulse * 0.2})`;
      ctx.lineWidth = 0.03;
      ctx.setLineDash([0.12, 0.16]);
      ctx.lineDashOffset = now * 0.002;
      ctx.beginPath();
      ctx.moveTo(game.sel.x + 0.5, game.sel.y + 0.5);
      ctx.lineTo(ux, uy);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Units                                                              */
/* ------------------------------------------------------------------ */

function unitPos(u) {
  if (!u.anim) return { x: u.x, y: u.y };
  const t = clamp((performance.now() - u.anim.start) / u.anim.dur, 0, 1);
  const path = u.anim.path;
  const seg = path.length - 1;
  const p = t * seg;
  const i = Math.min(seg - 1, Math.floor(p));
  const f = p - i;
  return { x: lerp(path[i].x, path[i + 1].x, f), y: lerp(path[i].y, path[i + 1].y, f) };
}

function drawUnits(now, s) {
  const order = [...game.units].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  for (const u of order) {
    if (u.side === 1 && !game.vis[0][idx(u.x, u.y)]) continue;
    drawUnit(now, u, s);
  }
}

function drawUnit(now, u, s) {
  const def = UNIT_TYPES[u.type];
  const side = SIDES[u.side];
  const pos = unitPos(u);
  const selected = game.sel && game.sel.id === u.id;
  const inspected = game.inspect && game.inspect.id === u.id;
  const targeted = game.attackTargets.some((t) => t.id === u.id);
  const spent = u.side === 0 && u.moved && u.attacked;
  const pulse = 0.5 + 0.5 * Math.sin(now * 0.006);

  const cx = pos.x + 0.5;
  const cy = pos.y + 0.5;
  const w = 0.72;
  const h = 0.6;

  ctx.save();
  ctx.translate(cx, cy);

  // Ground shadow.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
  ctx.beginPath();
  ctx.ellipse(0.03, 0.29, 0.34, 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  if (selected) {
    ctx.globalAlpha = 0.5 + pulse * 0.4;
    brackets(0.45, '#ffc857', 0.035);
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = spent ? 0.62 : 1;

  // Counter body.
  const body = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  body.addColorStop(0, u.side === 0 ? '#3d8fd4' : '#c44b38');
  body.addColorStop(0.55, u.side === 0 ? '#2569a4' : '#98362a');
  body.addColorStop(1, u.side === 0 ? '#173f63' : '#5d2018');
  roundRect(-w / 2, -h / 2, w, h, 0.055);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 0.028;
  ctx.strokeStyle = u.side === 0 ? 'rgba(170, 220, 255, 0.9)' : 'rgba(255, 178, 164, 0.92)';
  ctx.stroke();

  // Bevel highlight.
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 0.012;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 0.05, -h / 2 + 0.045);
  ctx.lineTo(w / 2 - 0.05, -h / 2 + 0.045);
  ctx.stroke();

  // Side notch.
  ctx.fillStyle = rgba(side.color, 0.95);
  ctx.beginPath();
  ctx.moveTo(w / 2 - 0.14, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2 + 0.13);
  ctx.closePath();
  ctx.fill();

  drawUnitSymbol(def.key);

  // Health bar.
  const ratio = clamp(u.hp / u.maxHp, 0, 1);
  const barW = 0.66;
  ctx.fillStyle = 'rgba(2, 7, 9, 0.85)';
  ctx.fillRect(-barW / 2, h / 2 + 0.055, barW, 0.075);
  ctx.fillStyle = ratio > 0.6 ? '#66e3a3' : ratio > 0.3 ? '#ffc857' : '#ff5f4a';
  ctx.fillRect(-barW / 2, h / 2 + 0.055, barW * ratio, 0.075);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 0.008;
  ctx.strokeRect(-barW / 2, h / 2 + 0.055, barW, 0.075);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  for (let k = 1; k < 4; k++) ctx.fillRect(-barW / 2 + (barW * k) / 4, h / 2 + 0.055, 0.008, 0.075);

  ctx.globalAlpha = 1;

  if (targeted) {
    ctx.globalAlpha = 0.55 + pulse * 0.45;
    brackets(0.47, '#ff5f4a', 0.038);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ff5f4a';
    ctx.beginPath();
    ctx.arc(0, 0, 0.028, 0, Math.PI * 2);
    ctx.fill();
  }

  if (inspected) {
    ctx.globalAlpha = 0.6 + pulse * 0.25;
    brackets(0.44, '#ffffff', 0.022);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawUnitSymbol(type) {
  ctx.save();
  ctx.strokeStyle = 'rgba(242, 250, 255, 0.94)';
  ctx.fillStyle = 'rgba(242, 250, 255, 0.94)';
  ctx.lineWidth = 0.045;
  ctx.lineJoin = 'miter';
  if (type === 'INF') {
    ctx.strokeRect(-0.17, -0.12, 0.34, 0.24);
    ctx.beginPath();
    ctx.moveTo(-0.17, -0.12);
    ctx.lineTo(0.17, 0.12);
    ctx.moveTo(0.17, -0.12);
    ctx.lineTo(-0.17, 0.12);
    ctx.stroke();
  } else if (type === 'TNK') {
    roundRect(-0.2, -0.1, 0.4, 0.2, 0.06);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -0.02);
    ctx.lineTo(0.02, -0.19);
    ctx.stroke();
  } else if (type === 'ART') {
    ctx.beginPath();
    ctx.arc(0, 0, 0.095, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 0.17, 0.2, Math.PI * 1.3);
    ctx.stroke();
  } else if (type === 'REC') {
    ctx.strokeRect(-0.17, -0.12, 0.34, 0.24);
    ctx.beginPath();
    ctx.moveTo(-0.16, 0.12);
    ctx.lineTo(0.16, -0.12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0.12, 0.07, 0.028, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function brackets(size, color, width) {
  const a = size;
  const b = size * 0.42;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(-a, -a + b);
  ctx.lineTo(-a, -a);
  ctx.lineTo(-a + b, -a);
  ctx.moveTo(a - b, -a);
  ctx.lineTo(a, -a);
  ctx.lineTo(a, -a + b);
  ctx.moveTo(a, a - b);
  ctx.lineTo(a, a);
  ctx.lineTo(a - b, a);
  ctx.moveTo(-a + b, a);
  ctx.lineTo(-a, a);
  ctx.lineTo(-a, a - b);
  ctx.stroke();
}

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/*  World effects                                                      */
/* ------------------------------------------------------------------ */

function drawWorldEffects() {
  for (const t of fx.tracers) {
    const a = clamp(t.life / t.max, 0, 1);
    ctx.save();
    ctx.strokeStyle = rgba(t.color, a * 0.22);
    ctx.lineWidth = 0.09;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 250, 235, ${a * 0.9})`;
    ctx.lineWidth = 0.024;
    ctx.beginPath();
    ctx.moveTo(t.x1, t.y1);
    ctx.lineTo(t.x2, t.y2);
    ctx.stroke();
    ctx.restore();
  }

  for (const sh of fx.shells) {
    const t = sh.t;
    const mx = lerp(sh.x1, sh.x2, t);
    const my = lerp(sh.y1, sh.y2, t);
    const arc = Math.sin(t * Math.PI) * Math.min(1.1, Math.abs(sh.x2 - sh.x1) + Math.abs(sh.y2 - sh.y1)) * 0.18;
    ctx.save();
    ctx.globalAlpha = 1 - Math.max(0, (t - 0.85) / 0.15);
    ctx.fillStyle = '#ffe0a0';
    ctx.shadowColor = sh.color;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(mx, my - arc, 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const p of fx.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = rgba(p.color, a);
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }

  for (const r of fx.rings) {
    const a = 1 - r.t;
    ctx.strokeStyle = rgba(r.color, a * 0.7);
    ctx.lineWidth = 0.035 * (1 - r.t) + 0.01;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.max * (0.2 + r.t * 0.8), 0, Math.PI * 2);
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ */
/*  Screen overlays                                                    */
/* ------------------------------------------------------------------ */

function drawFloats() {
  const s = scale();
  const size = Math.round(clamp(s * 0.42, 12, 20));
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${size}px "SFMono-Regular", "SF Mono", "Roboto Mono", monospace`;
  for (const f of fx.floats) {
    const a = clamp((f.life / f.max) * 1.8, 0, 1);
    const p = worldToScreen(f.x, f.y);
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(0,0,0,.95)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, p.x, p.y - (1 - f.life / f.max) * 26);
  }
  ctx.restore();
}

function drawFlash(w, h) {
  if (fx.flash <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = clamp(fx.flash, 0, 0.5);
  ctx.fillStyle = fx.flashColor;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawVignette(w, h) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.78);
  g.addColorStop(0, 'rgba(0, 0, 0, 0)');
  g.addColorStop(0.72, 'rgba(0, 0, 0, 0.13)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0.48)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/* ------------------------------------------------------------------ */
/*  Minimap                                                            */
/* ------------------------------------------------------------------ */

function buildMiniBase() {
  const size = 220;
  const cw = size / W;
  mbctx.clearRect(0, 0, size, size);
  mbctx.fillStyle = '#050a0c';
  mbctx.fillRect(0, 0, size, size);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = game.terrain[idx(x, y)];
      mbctx.fillStyle = TERRAIN[t].colors[0];
      mbctx.fillRect(x * cw, y * cw, cw + 0.5, cw + 0.5);
    }
  }
  miniBaseSeed = game.seed;
}

function drawMinimap(now) {
  if (now - miniLast < 70) return;
  miniLast = now;
  if (miniBaseSeed !== game.seed || !game.terrain) buildMiniBase();
  const size = 220;
  const cw = size / W;
  mctx.clearRect(0, 0, size, size);
  mctx.drawImage(miniBase, 0, 0);

  // Fog remains faint on the tactical map.
  mctx.save();
  mctx.globalAlpha = 0.4;
  mctx.imageSmoothingEnabled = true;
  mctx.drawImage(fogCanvas, 0, 0, size, size);
  mctx.restore();

  for (const c of game.cities) {
    const accent = ownerColor(c.owner);
    const r = c.hq ? 7 : 5;
    mctx.fillStyle = accent;
    mctx.fillRect(c.x * cw + cw / 2 - r / 2, c.y * cw + cw / 2 - r / 2, r, r);
    if (c.hq) {
      mctx.strokeStyle = 'rgba(255,255,255,.75)';
      mctx.lineWidth = 1;
      mctx.strokeRect(c.x * cw + cw / 2 - r / 2 - 1, c.y * cw + cw / 2 - r / 2 - 1, r + 2, r + 2);
    }
  }

  for (const u of game.units) {
    if (u.side === 1 && !game.vis[0][idx(u.x, u.y)]) continue;
    mctx.fillStyle = SIDES[u.side].color;
    mctx.fillRect(u.x * cw + 1.2, u.y * cw + 1.2, cw - 1.2, cw - 1.2);
  }

  // Viewport.
  const s = scale();
  const left = clamp(cam.cx - view.w / (2 * s), 0, W);
  const top = clamp(cam.cy - view.h / (2 * s), 0, H);
  const vw = clamp(view.w / s, 0, W - left);
  const vh = clamp(view.h / s, 0, H - top);
  mctx.fillStyle = 'rgba(255,255,255,.05)';
  mctx.fillRect(left * cw, top * cw, vw * cw, vh * cw);
  mctx.strokeStyle = 'rgba(220, 240, 255, 0.55)';
  mctx.lineWidth = 1.2;
  mctx.strokeRect(left * cw + 0.5, top * cw + 0.5, vw * cw - 1, vh * cw - 1);

  // Scan line.
  const sy = ((now * 0.025) % size);
  const grad = mctx.createLinearGradient(0, sy - 18, 0, sy + 18);
  grad.addColorStop(0, 'rgba(74,168,255,0)');
  grad.addColorStop(0.5, 'rgba(74,168,255,0.12)');
  grad.addColorStop(1, 'rgba(74,168,255,0)');
  mctx.fillStyle = grad;
  mctx.fillRect(0, sy - 18, size, 36);
}

/* ------------------------------------------------------------------ */
/*  Export hover helper                                                */
/* ------------------------------------------------------------------ */

export function setHover(world) {
  game.hover = world;
}

