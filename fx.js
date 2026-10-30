import { TAU, clamp, rgba } from './draw-utils.js';

const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);

export class Effects {
  constructor() {
    this.items = [];
    this.max = 320;
  }

  clear() {
    this.items.length = 0;
  }

  trim() {
    if (this.items.length > this.max) this.items.splice(0, this.items.length - this.max);
  }

  hit(x, y, { color = '#8ffcff', count = 12, speed = 340, crit = false, black = false } = {}) {
    this.ring(x, y, color, crit ? 86 : 52, crit ? 0.5 : 0.36, crit ? 3 : 2);
    this.ring(x, y, '#ffffff', crit ? 40 : 24, 0.22, 1);
    const n = Math.round(count * (crit ? 1.7 : 1));
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU);
      const sp = rnd(speed * 0.25, speed) * (crit ? 1.3 : 1);
      this.items.push({
        type: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        life: rnd(0.22, 0.55),
        max: 0.55,
        size: rnd(1, crit ? 3.2 : 2.4),
        color: Math.random() < 0.3 ? '#ffffff' : color,
        gravity: 420,
        drag: 0.9,
      });
    }
    if (black) {
      for (let i = 0; i < 4; i++) {
        const a = rnd(0, TAU);
        this.bolt(
          x + Math.cos(a) * 10,
          y + Math.sin(a) * 10,
          x + Math.cos(a) * rnd(90, 260),
          y + Math.sin(a) * rnd(90, 260),
          i % 2 ? '#ff2d55' : '#ffffff',
          0.32,
          2.4,
        );
      }
    }
    this.trim();
  }

  ring(x, y, color, radius = 60, life = 0.4, width = 2) {
    this.items.push({ type: 'ring', x, y, color, radius, life, max: life, width });
  }

  bolt(x1, y1, x2, y2, color = '#8ffcff', life = 0.18, width = 2) {
    const points = [{ x: x1, y: y1 }];
    const segs = 7;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const jitter = (Math.random() - 0.5) * Math.min(36, len * 0.22);
      points.push({ x: x1 + dx * t + nx * jitter, y: y1 + dy * t + ny * jitter });
    }
    points.push({ x: x2, y: y2 });
    this.items.push({ type: 'bolt', points, color, life, max: life, width });
    this.trim();
  }

  number(x, y, text, color = '#ffffff', size = 24, opts = {}) {
    const life = opts.domain ? 0.62 : opts.crit ? 1.05 : 0.85;
    this.items.push({
      type: 'number',
      x: x + rnd(-8, 8),
      y,
      vy: opts.domain ? -42 : opts.crit ? -88 : -70,
      vx: opts.domain ? rnd(-26, 26) : rnd(-14, 14),
      text,
      color,
      size,
      life,
      max: life,
      crit: !!opts.crit,
      label: opts.label || '',
    });
    this.trim();
  }

  ember(x, y, color = '#8ffcff') {
    this.items.push({
      type: 'ember',
      x,
      y,
      vx: rnd(-10, 10),
      vy: rnd(-26, -10),
      life: rnd(2.2, 5),
      max: 5,
      size: rnd(0.8, 2.2),
      color,
      phase: rnd(0, TAU),
      sway: rnd(6, 20),
    });
    this.trim();
  }

  smoke(x, y, color = '#9a5cff', count = 7) {
    for (let i = 0; i < count; i++) {
      const a = rnd(0, TAU);
      this.items.push({
        type: 'smoke',
        x: x + Math.cos(a) * rnd(0, 20),
        y: y + Math.sin(a) * rnd(0, 20),
        vx: Math.cos(a) * rnd(15, 80),
        vy: Math.sin(a) * rnd(15, 60) - 20,
        life: rnd(0.5, 1.2),
        max: 1.2,
        size: rnd(10, 26),
        grow: rnd(22, 48),
        color,
      });
    }
    this.trim();
  }

  burst(x, y, color, count = 22) {
    for (let i = 0; i < count; i++) {
      const a = rnd(0, TAU);
      const sp = rnd(80, 460);
      this.items.push({
        type: 'spark',
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rnd(0.3, 0.8),
        max: 0.8,
        size: rnd(1, 3),
        color: Math.random() < 0.4 ? '#ffffff' : color,
        gravity: 260,
        drag: 0.94,
      });
    }
    this.ring(x, y, color, 120, 0.6, 2);
    this.trim();
  }

  update(dt) {
    const list = this.items;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      if (p.life <= 0) {
        list.splice(i, 1);
        continue;
      }
      if (p.type === 'spark') {
        p.vy += (p.gravity || 0) * dt;
        p.vx *= Math.pow(p.drag || 0.94, dt * 60);
        p.vy *= Math.pow(p.drag || 0.94, dt * 60);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      } else if (p.type === 'number') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 58 * dt;
      } else if (p.type === 'ember') {
        p.x += (p.vx + Math.sin(p.phase + p.life * 1.4) * p.sway) * dt;
        p.y += p.vy * dt;
      } else if (p.type === 'smoke') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.size += p.grow * dt;
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.items) {
      if (p.type === 'spark' || p.type === 'ember' || p.type === 'ring' || p.type === 'bolt') {
        const a = clamp(p.life / (p.max || 1), 0, 1);
        ctx.globalAlpha = a;
        if (p.type === 'spark') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.024, p.y - p.vy * 0.024);
          ctx.stroke();
        } else if (p.type === 'ember') {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = a * 0.18;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3, 0, TAU);
          ctx.fill();
        } else if (p.type === 'ring') {
          const t = 1 - p.life / p.max;
          const r = p.radius * (0.18 + t * 0.9);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.width * (1 - t * 0.7);
          ctx.globalAlpha = a * 0.8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, TAU);
          ctx.stroke();
        } else if (p.type === 'bolt') {
          const pts = p.points;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.width * 3;
          ctx.globalAlpha = a * 0.16;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
          ctx.globalAlpha = a;
          ctx.lineWidth = p.width;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // text and smoke on top, normal blending
    for (const p of this.items) {
      if (p.type === 'smoke') {
        const a = clamp(p.life / p.max, 0, 1) * 0.35;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        g.addColorStop(0, rgba(p.color, a));
        g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      } else if (p.type === 'number') {
        const a = clamp(p.life / p.max, 0, 1);
        const pop = p.life / p.max > 0.82 ? 1 + (p.life / p.max - 0.82) * 2.2 : 1;
        ctx.save();
        ctx.globalAlpha = Math.min(1, a * 1.6);
        ctx.translate(p.x, p.y);
        ctx.scale(pop, pop);
        ctx.font = `700 ${p.size}px "Rajdhani", "Segoe UI", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(3, p.size * 0.16);
        ctx.strokeStyle = 'rgba(3,2,8,0.9)';
        ctx.strokeText(p.text, 0, 0);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, 0, 0);
        if (p.crit && p.label) {
          ctx.font = `700 ${Math.max(8, p.size * 0.38)}px "Rajdhani", sans-serif`;
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = a * 0.9;
          ctx.fillText(p.label, 0, -p.size * 0.72);
        }
        ctx.restore();
      }
    }
  }
}
