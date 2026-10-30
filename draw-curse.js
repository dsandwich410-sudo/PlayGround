import {
  TAU,
  clamp,
  easeOutCubic,
  glow,
  mulberry32,
  rgba,
  smoothClosed,
} from './draw-utils.js';

const PALETTES = [
  { body: ['#4b2a78', '#1a0a2c', '#06020c'], rim: '#c08bff', eye: '#ffd166', glow: '#9a5cff', mouth: '#1a0410' },
  { body: ['#662338', '#240913', '#080206'], rim: '#ff6b8a', eye: '#ffe8a3', glow: '#ff2e63', mouth: '#1c0308' },
  { body: ['#1b4d42', '#071915', '#020706'], rim: '#77ffd4', eye: '#ffe066', glow: '#2ee6a8', mouth: '#02100c' },
  { body: ['#33306b', '#0d0b24', '#03020a'], rim: '#7df9ff', eye: '#ff7ab8', glow: '#55b8ff', mouth: '#060316' },
  { body: ['#55215f', '#1d0724', '#06020a'], rim: '#ff8ae8', eye: '#ffd166', glow: '#e879f9', mouth: '#160214' },
];

export function makeCurseLook(level, info) {
  const seed = (level * 2654435761 + 0x9e3779b9) >>> 0;
  const rng = mulberry32(seed);
  const paletteIndex = (info.index + (level % 3)) % PALETTES.length;
  const eyeCount = 2 + Math.floor(rng() * 4);
  const eyes = [];
  const tries = [];
  for (let i = 0; i < eyeCount; i++) {
    for (let attempt = 0; attempt < 24; attempt++) {
      const x = (rng() * 1.24 - 0.62) * 0.9;
      const y = (rng() * 0.86 - 0.62);
      if (y > 0.2) continue;
      if (Math.hypot(x, y) > 0.6) continue;
      const tooClose = eyes.some((e) => Math.hypot(e.x - x, e.y - y) < 0.19);
      if (!tooClose) {
        eyes.push({
          x,
          y,
          rx: 0.075 + rng() * 0.045,
          ry: 0.055 + rng() * 0.03,
          tilt: (rng() - 0.5) * 0.5,
          blinkPhase: rng() * TAU,
        });
        break;
      }
    }
  }
  if (!eyes.length) eyes.push({ x: -0.22, y: -0.18, rx: 0.1, ry: 0.07, tilt: 0, blinkPhase: 0 });

  const hornCount = info.index >= 4 ? (info.boss ? 3 : 2) : info.boss ? 2 : 0;
  return {
    seed,
    rng,
    palette: PALETTES[paletteIndex],
    eyes,
    hornCount,
    tendrilCount: 5 + Math.floor(rng() * 4),
    bodyWobble: 0.06 + rng() * 0.06,
    lookX: 0,
    lookY: 0,
    seedValue: rng(),
  };
}

function coreOffset(r) {
  return { x: r * 0.1, y: r * 0.07 };
}

export function drawCurse(ctx, target, now, opts = {}) {
  if (!target) return;
  const r = target.r;
  const time = now / 1000;
  const palette = target.look.palette;
  const spawn = clamp((now - target.spawnT) / 520, 0, 1);
  const spawnEase = easeOutCubic(spawn);
  const death = target.dying ? clamp((now - target.deathAt) / 480, 0, 1) : 0;
  const deathEase = easeOutCubic(death);
  const scale = (0.62 + 0.38 * easeOutCubic(spawn)) * (1 - deathEase * 0.62);
  const alpha = clamp(spawn * 1.4, 0, 1) * (1 - deathEase);

  const bob = Math.sin(time * 1.15 + target.look.seed * 0.001) * r * 0.045;
  const cx = target.x;
  const cy = target.y + bob;
  const sway = Math.sin(time * 0.6 + target.look.seedValue * 10) * 0.06;

  target.drawnCore = {
    x: cx + r * 0.1 * scale,
    y: cy + r * 0.07 * scale,
    r: r * 0.2 * scale,
  };

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.rotate(sway);

  // outer cursed aura
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, 0, 0, r * 2.1, palette.glow, 0.19 + Math.sin(time * 1.8) * 0.03, 0.1);
  glow(ctx, 0, 0, r * 1.5, palette.glow, 0.08, 0.15);
  ctx.restore();

  // tendrils behind the body
  const rng = mulberry32(target.look.seed ^ 0x1234abcd);
  for (let i = 0; i < target.look.tendrilCount; i++) {
    const base = Math.PI * 0.18 + (i / target.look.tendrilCount) * Math.PI * 1.64;
    const bx = Math.cos(base) * r * 0.72;
    const by = Math.sin(base) * r * 0.55 + r * 0.2;
    const len = r * (0.45 + rng() * 0.5);
    const drift = Math.sin(time * 1.3 + i * 1.7) * r * 0.18;
    const cx1 = bx + Math.cos(base) * len * 0.45 + drift;
    const cy1 = by + Math.sin(base) * len * 0.55 + r * 0.12;
    const ex = bx + Math.cos(base) * len + drift * 1.4;
    const ey = by + Math.sin(base) * len + r * 0.18;
    ctx.strokeStyle = rgba(palette.rim, 0.16);
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(cx1, cy1, ex, ey);
    ctx.stroke();
    ctx.strokeStyle = rgba('#07030c', 0.85);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(cx1, cy1, ex, ey);
    ctx.stroke();
  }

  // wobbling body silhouette
  const pts = [];
  const count = 32;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const wobble =
      1 +
      Math.sin(a * 3 + time * 0.9 + target.look.seed) * target.look.bodyWobble +
      Math.sin(a * 5 - time * 0.7 + target.look.seed * 2) * 0.035 +
      Math.sin(a * 7 + time * 1.1) * 0.018;
    pts.push({
      x: Math.cos(a) * r * 0.96 * wobble,
      y: Math.sin(a) * r * 0.84 * wobble + Math.sin(a * 2) * r * 0.04,
    });
  }

  smoothClosed(ctx, pts);
  const bodyGrad = ctx.createRadialGradient(-r * 0.22, -r * 0.28, r * 0.1, 0, 0, r * 1.1);
  bodyGrad.addColorStop(0, palette.body[0]);
  bodyGrad.addColorStop(0.55, palette.body[1]);
  bodyGrad.addColorStop(1, palette.body[2]);
  ctx.fillStyle = bodyGrad;
  ctx.save();
  ctx.shadowColor = rgba(palette.glow, 0.7);
  ctx.shadowBlur = 28;
  ctx.fill();
  ctx.restore();

  // rim light along the body
  ctx.strokeStyle = rgba(palette.rim, 0.36);
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // interior haze and veins
  ctx.save();
  ctx.clip();
  const haze = ctx.createRadialGradient(r * 0.15, r * 0.1, 0, r * 0.1, r * 0.05, r * 0.9);
  haze.addColorStop(0, rgba(palette.glow, 0.28));
  haze.addColorStop(0.55, rgba(palette.glow, 0.06));
  haze.addColorStop(1, rgba(palette.glow, 0));
  ctx.fillStyle = haze;
  ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);

  ctx.strokeStyle = rgba(palette.rim, 0.1);
  ctx.lineWidth = r * 0.018;
  for (let i = 0; i < 5; i++) {
    const a = i * 1.7 + target.look.seed * 0.1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15);
    ctx.quadraticCurveTo(
      Math.cos(a + 0.5) * r * 0.5,
      Math.sin(a + 0.5) * r * 0.45,
      Math.cos(a + 0.8) * r * 0.85,
      Math.sin(a + 0.8) * r * 0.7,
    );
    ctx.stroke();
  }
  ctx.restore();

  // horns
  for (let i = 0; i < target.look.hornCount; i++) {
    const dir = i % 2 === 0 ? -1 : 1;
    const off = Math.floor(i / 2) * 0.14;
    const hx = dir * r * (0.36 + off);
    const hy = -r * 0.72;
    ctx.fillStyle = rgba(palette.body[2], 0.96);
    ctx.strokeStyle = rgba(palette.rim, 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hx - dir * r * 0.1, hy + r * 0.1);
    ctx.quadraticCurveTo(hx + dir * r * 0.32, hy - r * 0.16, hx + dir * r * 0.12, hy - r * 0.48);
    ctx.quadraticCurveTo(hx + dir * r * 0.02, hy - r * 0.2, hx + dir * r * 0.07, hy + r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // eyes
  const activeBlink = Math.sin(time * 0.85 + target.look.seed * 0.01) > 0.985 ? 0.08 : 1;
  for (const eye of target.look.eyes) {
    const ex = eye.x * r + target.look.lookX * r * 0.035;
    const ey = eye.y * r + target.look.lookY * r * 0.025;
    const erx = eye.rx * r;
    const ery = eye.ry * r * activeBlink;

    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(eye.tilt);

    ctx.fillStyle = 'rgba(2,1,5,0.82)';
    ctx.beginPath();
    ctx.ellipse(0, 0, erx * 1.36, ery * 1.5, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, 0, erx * 2.5, palette.eye, 0.22, 0);
    ctx.restore();

    const iris = ctx.createRadialGradient(-erx * 0.2, -ery * 0.25, 1, 0, 0, erx);
    iris.addColorStop(0, '#fffbe8');
    iris.addColorStop(0.35, palette.eye);
    iris.addColorStop(0.85, palette.glow);
    iris.addColorStop(1, rgba(palette.glow, 0.55));
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.ellipse(0, 0, erx, ery, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(4,2,8,0.92)';
    ctx.beginPath();
    ctx.ellipse(target.look.lookX * erx * 0.16, 0, erx * 0.16, ery * 0.72, 0, 0, TAU);
    ctx.fill();

    if (activeBlink > 0.5) {
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath();
      ctx.arc(-erx * 0.32, -ery * 0.3, Math.max(1, erx * 0.14), 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // jagged mouth
  const mouthY = r * 0.34;
  const mouthW = r * 0.52;
  const open = 1 + Math.sin(time * 1.2 + 1) * 0.12;
  ctx.fillStyle = '#050107';
  ctx.beginPath();
  ctx.moveTo(-mouthW, mouthY);
  ctx.quadraticCurveTo(-mouthW * 0.5, mouthY + r * 0.04, 0, mouthY - r * 0.01);
  ctx.quadraticCurveTo(mouthW * 0.5, mouthY + r * 0.04, mouthW, mouthY);
  ctx.quadraticCurveTo(mouthW * 0.5, mouthY + r * 0.22 * open, 0, mouthY + r * 0.27 * open);
  ctx.quadraticCurveTo(-mouthW * 0.5, mouthY + r * 0.22 * open, -mouthW, mouthY);
  ctx.closePath();
  ctx.fill();

  const inner = ctx.createRadialGradient(0, mouthY + r * 0.08, 1, 0, mouthY + r * 0.1, mouthW);
  inner.addColorStop(0, rgba(palette.glow, 0.45));
  inner.addColorStop(1, 'rgba(2,0,4,0)');
  ctx.fillStyle = inner;
  ctx.fill();

  // teeth
  ctx.fillStyle = 'rgba(228,224,214,0.78)';
  const teeth = 7;
  for (let i = 0; i < teeth; i++) {
    const tx = -mouthW * 0.82 + (i / (teeth - 1)) * mouthW * 1.64;
    const size = r * (0.045 + (i % 2) * 0.022);
    ctx.beginPath();
    ctx.moveTo(tx - size * 0.7, mouthY + r * 0.02);
    ctx.lineTo(tx + size * 0.7, mouthY + r * 0.02);
    ctx.lineTo(tx, mouthY + r * 0.02 + size * 1.6);
    ctx.closePath();
    ctx.fill();
  }

  // exposed weak-point core
  const core = coreOffset(r);
  const pulse = 0.5 + Math.sin(time * 3.4) * 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, core.x, core.y, r * (0.34 + pulse * 0.06), palette.eye, 0.4, 0);
  ctx.strokeStyle = rgba(palette.eye, 0.65);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 2; i++) {
    const rr = r * (0.12 + i * 0.07 + pulse * 0.02);
    ctx.beginPath();
    ctx.arc(core.x, core.y, rr, time * (1.2 + i) + i, time * (1.2 + i) + i + Math.PI * 1.4);
    ctx.stroke();
  }
  const coreGrad = ctx.createRadialGradient(core.x, core.y, 0, core.x, core.y, r * 0.1);
  coreGrad.addColorStop(0, '#ffffff');
  coreGrad.addColorStop(0.35, palette.eye);
  coreGrad.addColorStop(1, rgba(palette.eye, 0));
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(core.x, core.y, r * 0.1, 0, TAU);
  ctx.fill();
  ctx.restore();

  // hit flash
  if (target.flash > 0.01) {
    ctx.save();
    smoothClosed(ctx, pts);
    ctx.globalAlpha = Math.min(0.72, target.flash * 0.72);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
  }

  // death dissolve ring
  if (target.dying) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(palette.rim, (1 - deathEase) * 0.5);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1 + deathEase * 0.9), 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();

  // ground shadow, drawn outside scaling for stability
  ctx.save();
  ctx.globalAlpha = alpha * 0.45;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.92, r * 0.7, r * 0.12, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
