import { TAU, clamp, mulberry32, rgba } from './draw-utils.js';

/**
 * Cached procedural Shibuya-at-night backdrop with three parallax-ish city
 * layers. Everything is generated once per resize and drawn with a small
 * tilt/parallax offset each frame.
 */
export class World {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
  }

  resize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.ceil(w * dpr));
    this.canvas.height = Math.max(1, Math.ceil(h * dpr));
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    this.build(ctx, w, h);
  }

  build(ctx, W, H) {
    const rng = mulberry32(0x5a70f0);
    const horizon = H * 0.69;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#03030b');
    sky.addColorStop(0.28, '#080617');
    sky.addColorStop(0.54, '#170b2d');
    sky.addColorStop(0.72, '#36113c');
    sky.addColorStop(0.84, '#1b0a25');
    sky.addColorStop(1, '#070410');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // stars
    const starCount = Math.round(clamp(W * H / 9000, 40, 150));
    for (let i = 0; i < starCount; i++) {
      const x = rng() * W;
      const y = rng() * horizon * 0.9;
      const a = 0.12 + rng() * 0.5;
      const size = rng() < 0.85 ? 0.7 : 1.4;
      ctx.fillStyle = rgba(rng() < 0.2 ? '#ffd9ec' : '#d8f4ff', a);
      ctx.fillRect(x, y, size, size);
      if (rng() < 0.06) {
        ctx.strokeStyle = rgba('#d8f4ff', a * 0.4);
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(x - 3, y);
        ctx.lineTo(x + 3, y);
        ctx.moveTo(x, y - 3);
        ctx.lineTo(x, y + 3);
        ctx.stroke();
      }
    }

    // moon and halo
    const mx = W * 0.73;
    const my = H * 0.16;
    const mr = clamp(Math.min(W, H) * 0.058, 20, 62);
    const halo = ctx.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 5.4);
    halo.addColorStop(0, 'rgba(206,232,255,0.18)');
    halo.addColorStop(0.35, 'rgba(150,180,255,0.07)');
    halo.addColorStop(1, 'rgba(150,180,255,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 5.4, 0, TAU);
    ctx.fill();

    const moon = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.34, 2, mx, my, mr);
    moon.addColorStop(0, '#ffffff');
    moon.addColorStop(0.55, '#e5f1ff');
    moon.addColorStop(0.9, '#b7cdf2');
    moon.addColorStop(1, '#8fa9d9');
    ctx.fillStyle = moon;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(120,145,190,0.16)';
    for (let i = 0; i < 6; i++) {
      const a = rng() * TAU;
      const d = rng() * mr * 0.65;
      const cr = mr * (0.05 + rng() * 0.09);
      ctx.beginPath();
      ctx.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d, cr, 0, TAU);
      ctx.fill();
    }

    // wispy clouds
    for (let i = 0; i < 5; i++) {
      const cx = rng() * W;
      const cy = H * (0.1 + rng() * 0.32);
      const cw = W * (0.18 + rng() * 0.25);
      const ch = H * (0.015 + rng() * 0.025);
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, cw * 0.6);
      cg.addColorStop(0, rgba(i % 2 ? '#9a7bd6' : '#6c8bd8', 0.055));
      cg.addColorStop(1, rgba('#6c8bd8', 0));
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ch / (cw * 0.7));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, cw * 0.6, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // distant Tokyo Tower silhouette
    this.drawTower(ctx, W * 0.87, H * 0.585, H * 0.3, H);

    // city layers
    this.cityLayer(ctx, W, H, {
      base: H * 0.705,
      minH: H * 0.025,
      maxH: H * 0.12,
      color: 'rgba(12,10,30,0.9)',
      seed: 991,
      window: 'rgba(168,206,255,0.28)',
      windowChance: 0.2,
      width: [10, 30],
      gap: 2,
    });

    const neon = [];
    this.cityLayer(ctx, W, H, {
      base: H * 0.79,
      minH: H * 0.05,
      maxH: H * 0.22,
      color: 'rgba(8,7,20,0.96)',
      seed: 1427,
      window: 'rgba(255,214,150,0.44)',
      windowChance: 0.28,
      width: [16, 44],
      gap: 2,
      neon,
    });

    this.drawNeon(ctx, neon, W, H);

    // power poles and wires
    this.drawPowerLines(ctx, W, H);

    this.cityLayer(ctx, W, H, {
      base: H * 1.01,
      minH: H * 0.07,
      maxH: H * 0.24,
      color: 'rgba(4,3,10,0.98)',
      seed: 8123,
      window: 'rgba(120,190,255,0.2)',
      windowChance: 0.12,
      width: [22, 60],
      gap: 3,
    });

    // horizon fog
    const fog = ctx.createLinearGradient(0, H * 0.62, 0, H * 0.93);
    fog.addColorStop(0, 'rgba(74,32,102,0)');
    fog.addColorStop(0.42, 'rgba(74,32,102,0.2)');
    fog.addColorStop(1, 'rgba(10,6,22,0.66)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, H * 0.62, W, H * 0.31);

    // ground haze and neon reflections
    const ground = ctx.createLinearGradient(0, H * 0.87, 0, H);
    ground.addColorStop(0, 'rgba(5,4,12,0)');
    ground.addColorStop(1, 'rgba(3,2,8,0.92)');
    ctx.fillStyle = ground;
    ctx.fillRect(0, H * 0.87, W, H * 0.13);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const x = W * (0.08 + i * 0.13 + rng() * 0.03);
      const w = 2 + rng() * 8;
      const col = i % 2 ? '#ff3d9a' : '#55b8ff';
      const g = ctx.createLinearGradient(0, H * 0.8, 0, H);
      g.addColorStop(0, rgba(col, 0.07));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x, H * 0.8, w, H * 0.2);
    }
    ctx.restore();

    // gentle top darkening for the HUD
    const top = ctx.createLinearGradient(0, 0, 0, H * 0.16);
    top.addColorStop(0, 'rgba(2,2,8,0.72)');
    top.addColorStop(1, 'rgba(2,2,8,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, H * 0.16);
  }

  cityLayer(ctx, W, H, opts) {
    const rng = mulberry32(opts.seed);
    let x = -30;
    while (x < W + 30) {
      const w = opts.width[0] + rng() * (opts.width[1] - opts.width[0]);
      const h = opts.minH + rng() * (opts.maxH - opts.minH);
      const y = opts.base - h;
      ctx.fillStyle = opts.color;
      ctx.fillRect(x, y, w, h + 10);

      // rooftop details
      if (rng() < 0.3) {
        ctx.fillRect(x + w * 0.25, y - H * 0.008, w * 0.12, H * 0.008);
      }
      if (rng() < 0.18) {
        ctx.strokeStyle = 'rgba(120,150,205,0.25)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.7, y);
        ctx.lineTo(x + w * 0.7, y - H * 0.025);
        ctx.stroke();
        ctx.fillStyle = 'rgba(120,200,255,0.3)';
        ctx.fillRect(x + w * 0.7 - 0.8, y - H * 0.025, 1.6, 1.6);
      }

      const cols = Math.max(1, Math.floor(w / 6));
      const rows = Math.max(2, Math.floor(h / 9));
      for (let cx = 0; cx < cols; cx++) {
        for (let cy = 0; cy < rows; cy++) {
          if (rng() > opts.windowChance) continue;
          const wx = x + 3 + (cx / cols) * (w - 5);
          const wy = y + 5 + (cy / rows) * (h - 8);
          ctx.fillStyle = opts.window;
          ctx.fillRect(wx, wy, 1.4, 2);
        }
      }

      if (opts.neon && rng() < 0.34 && h > H * 0.12) {
        opts.neon.push({
          x: x + w * (0.25 + rng() * 0.5),
          y: y + h * (0.15 + rng() * 0.3),
          w: 5 + rng() * 5,
          h: 22 + rng() * 34,
          color: rng() < 0.45 ? '#ff3d9a' : rng() < 0.6 ? '#55b8ff' : '#b07bff',
          char: ['呪', '術', '領', '域', '渋', '谷'][Math.floor(rng() * 6)],
        });
      }

      x += w + opts.gap + rng() * 5;
    }
  }

  drawNeon(ctx, signs, W, H) {
    for (const s of signs) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(6,5,14,0.9)';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeStyle = rgba(s.color, 0.7);
      ctx.lineWidth = 0.8;
      ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);

      ctx.shadowColor = s.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = s.color;
      ctx.font = `700 ${Math.max(5, s.w * 1.05)}px "Noto Sans JP", "Yu Gothic", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const total = s.h - 6;
      const chars = Math.max(1, Math.min(3, Math.floor(total / (s.w * 1.1))));
      for (let i = 0; i < chars; i++) {
        ctx.fillText(s.char, s.x + s.w / 2, s.y + 4 + (i + 0.5) * (total / chars));
      }
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  drawTower(ctx, x, baseY, height, H) {
    ctx.save();
    ctx.strokeStyle = 'rgba(16,10,30,0.96)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - height * 0.16, baseY);
    ctx.quadraticCurveTo(x - height * 0.05, baseY - height * 0.55, x - 3, baseY - height);
    ctx.quadraticCurveTo(x + height * 0.05, baseY - height * 0.55, x + height * 0.16, baseY);
    ctx.stroke();

    ctx.lineWidth = 0.8;
    const rungs = 5;
    for (let i = 1; i < rungs; i++) {
      const t = i / rungs;
      const y = baseY - height * t;
      const spread = height * 0.16 * (1 - t) + 3;
      ctx.beginPath();
      ctx.moveTo(x - spread, y);
      ctx.lineTo(x + spread, y);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,80,110,0.65)';
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      const y = baseY - height * (0.1 + t * 0.82);
      const spread = height * 0.16 * (1 - t);
      ctx.beginPath();
      ctx.arc(x - spread + 2, y, 0.9, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + spread - 2, y, 0.9, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawPowerLines(ctx, W, H) {
    ctx.save();
    ctx.strokeStyle = 'rgba(7,6,16,0.92)';
    ctx.lineWidth = 2;
    const poleXs = [W * 0.065, W * 0.935];
    for (const px of poleXs) {
      ctx.beginPath();
      ctx.moveTo(px, H * 0.42);
      ctx.lineTo(px, H * 0.84);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px - W * 0.018, H * 0.47);
      ctx.lineTo(px + W * 0.018, H * 0.47);
      ctx.moveTo(px - W * 0.014, H * 0.51);
      ctx.lineTo(px + W * 0.014, H * 0.51);
      ctx.stroke();
      ctx.lineWidth = 2;
    }
    ctx.strokeStyle = 'rgba(9,8,20,0.82)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 2; i++) {
      const y = H * (0.472 + i * 0.04);
      ctx.beginPath();
      ctx.moveTo(poleXs[0], y);
      ctx.bezierCurveTo(W * 0.35, y + H * 0.055, W * 0.65, y + H * 0.055, poleXs[1], y);
      ctx.stroke();
    }
    ctx.restore();
  }

  draw(ctx, W, H, opts) {
    const tx = clamp(opts.tiltX || 0, -1, 1);
    const ty = clamp(opts.tiltY || 0, -1, 1);
    const ox = -W * 0.018 + tx * W * 0.012;
    const oy = -H * 0.014 + ty * H * 0.01;
    ctx.drawImage(this.canvas, ox, oy, W * 1.036, H * 1.028);
  }
}
