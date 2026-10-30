/* ────────────────────────────────────────────────────────────────────────
   FRONTLINE 32 — canvas renderer, camera, effects and minimap
   ──────────────────────────────────────────────────────────────────────── */

import { W, H, key } from './map.js';
import { UNIT_TYPES as TYPES } from './game.js';

const RES = 48;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

const PALETTE = {
  grass:   { h: 77, s: 19, l: 34 },
  sand:    { h: 40, s: 27, l: 53 },
  forest:  { h: 108, s: 20, l: 25 },
  hills:   { h: 43, s: 22, l: 40 },
  mountain:{ h: 42, s: 7,  l: 39 },
  water:   { h: 188, s: 36, l: 24 },
  road:    { h: 41, s: 17, l: 47 },
  bridge:  { h: 31, s: 25, l: 35 },
  plaza:   { h: 41, s: 11, l: 43 },
};

const MINI = {
  grass: '#5c6943', sand: '#a18d60', forest: '#3a4f36', hills: '#80724a',
  mountain: '#6b675d', water: '#28535a', road: '#8f7f5c', bridge: '#7c6044', plaza: '#84785c',
};

const SIDE = {
  player: { line: '#64e3bd', fill: '#0b2b22', soft: 'rgba(100,227,189,0.18)', icon: '#eafff7' },
  enemy:  { line: '#ff7164', fill: '#2b100e', soft: 'rgba(255,113,100,0.18)', icon: '#ffebe7' },
  neutral:{ line: '#d9d6c4', fill: '#1d221c', soft: 'rgba(217,214,196,0.15)', icon: '#f4f1e2' },
};

const cityColor = (owner) => SIDE[owner || 'neutral'];

/* ──────────────────────────────────────────────────────────────────────── */
export class Renderer {
  constructor(canvas, minimap, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.minimap = minimap;
    this.mctx = minimap.getContext('2d');
    this.game = game;
    this.w = 1; this.h = 1; this.dpr = 1;
    this.cam = { x: 16, y: 16, z: 22 };
    this.target = { x: 16, y: 16, z: 22 };
    this.tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    this.fitZ = 20; this.minZ = 10; this.maxZ = 60;
    this.shake = 0;
    this.time = 0;
    this.last = 0;
    this.initialized = false;
    this.particles = [];
    this.floaters = [];
    this.beams = [];
    this.rings = [];
    this.terrain = null;
    this.backdrop = null;
    this.miniBase = null;

    this.resize();
    this.buildTerrain();
    this.buildBackdrop();
    this.buildMiniBase();

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 220));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.resize());

    game.addEventListener('newgame', (e) => {
      this.buildTerrain();
      this.buildBackdrop();
      this.buildMiniBase();
      this.particles = []; this.floaters = []; this.beams = []; this.rings = [];
      if (!e.detail?.intro) this.resetCamera();
      else this.sizeCamera(true);
    });
    game.addEventListener('fx', (e) => this.handleFx(e.detail));

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  /* ── Sizing / camera ─────────────────────────────────────────────────── */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, rect.width || window.innerWidth);
    this.h = Math.max(1, rect.height || window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.fitZ = Math.min(this.w / (W + 2.5), this.h / (H + 2.5));
    this.minZ = Math.min(this.w / (W + 5), this.h / (H + 5));
    this.maxZ = Math.max(48, this.fitZ * 4.5);
    if (!this.initialized) this.sizeCamera(true);
    else {
      this.target.z = clamp(this.target.z, this.minZ, this.maxZ);
      this.clampTarget(this.target);
      this.cam.z = clamp(this.cam.z, this.minZ, this.maxZ);
      this.clampTarget(this.cam);
    }
    this.initialized = true;
  }

  sizeCamera(snap = false) {
    const hq = this.game.playerHQ ? this.game.playerHQ() : { x: 4, y: 26 };
    if (this.w >= 900) {
      // Keep both command posts in the opening frame, filling the vertical field.
      this.target.z = clamp(Math.min(this.w / 36, (this.h - 205) / 23), this.fitZ, 38);
      this.target.x = 16;
      this.target.y = 17.0;
    } else if (this.h >= this.w) {
      // Portrait: focus on the player's deployment zone, with room to march north.
      this.target.z = clamp(Math.min(this.w, this.h) / 16, this.fitZ * 1.12, 32);
      this.target.x = hq.x + 5.2;
      this.target.y = 16;
    } else {
      // Landscape tablet/phone: player base sits clear of the command dock.
      this.target.z = clamp(Math.min(this.w, this.h) / 16.5, this.fitZ * 1.2, 34);
      this.target.x = 16;
      this.target.y = hq.y - 3.2;
    }
    this.clampTarget(this.target);
    if (snap) {
      this.cam.x = this.target.x;
      this.cam.y = this.target.y;
      this.cam.z = this.target.z;
    }
  }

  resetCamera() {
    this.sizeCamera(false);
    this.cam.z = this.target.z;
    this.cam.x = this.target.x;
    this.cam.y = this.target.y;
  }

  clampTarget(t) {
    const halfW = this.w / (2 * t.z);
    const halfH = this.h / (2 * t.z);
    if (halfW * 2 >= W - 0.4) t.x = W / 2;
    else t.x = clamp(t.x, halfW - 0.4, W - halfW + 0.4);
    if (halfH * 2 >= H - 0.4) t.y = H / 2;
    else t.y = clamp(t.y, halfH - 0.4, H - halfH + 0.4);
  }

  screenToWorld(sx, sy) {
    const z = this.cam.z;
    return {
      x: this.cam.x + this.tilt.x * 2.6 + (sx - this.w / 2) / z,
      y: this.cam.y + this.tilt.y * 2.2 + (sy - this.h / 2) / z,
    };
  }

  worldToScreen(wx, wy) {
    const z = this.cam.z;
    return {
      x: this.w / 2 + (wx - this.cam.x - this.tilt.x * 2.6) * z,
      y: this.h / 2 + (wy - this.cam.y - this.tilt.y * 2.2) * z,
    };
  }

  panBy(dx, dy) {
    this.target.x -= dx / this.cam.z;
    this.target.y -= dy / this.cam.z;
    this.clampTarget(this.target);
  }

  zoomAt(sx, sy, factor) {
    const tiltX = this.tilt.x * 2.6, tiltY = this.tilt.y * 2.2;
    const beforeX = this.cam.x + tiltX + (sx - this.w / 2) / this.cam.z;
    const beforeY = this.cam.y + tiltY + (sy - this.h / 2) / this.cam.z;
    const z = clamp(this.target.z * factor, this.minZ, this.maxZ);
    if (Math.abs(z - this.target.z) < 0.0001) return;
    this.target.z = z;
    this.target.x = beforeX - tiltX - (sx - this.w / 2) / z;
    this.target.y = beforeY - tiltY - (sy - this.h / 2) / z;
    this.clampTarget(this.target);
  }

  jumpTo(wx, wy) {
    this.target.x = wx;
    this.target.y = wy;
    this.clampTarget(this.target);
    this.cam.x = this.target.x;
    this.cam.y = this.target.y;
  }

  setTilt(x, y) {
    this.tilt.tx = clamp(x, -1, 1);
    this.tilt.ty = clamp(y, -1, 1);
  }

  /* ── Static terrain ──────────────────────────────────────────────────── */
  buildTerrain() {
    const c = document.createElement('canvas');
    c.width = W * RES; c.height = H * RES;
    const ctx = c.getContext('2d');
    ctx.scale(RES, RES);
    const map = this.game.map;

    for (const [k, t] of map.tiles.entries()) {
      const x = t.x, y = t.y;
      this.drawTileBase(ctx, t);
    }

    // shoreline foam
    for (const t of map.tiles) {
      if (t.type !== 'water' && t.type !== 'bridge') continue;
      if (t.type === 'bridge') continue;
      const edges = [[0, -1, 0], [0, 1, 1], [-1, 0, 2], [1, 0, 3]];
      for (const [ox, oy, edge] of edges) {
        const n = map.tile(t.x + ox, t.y + oy);
        if (!n || n.type === 'water' || n.type === 'bridge') continue;
        ctx.strokeStyle = 'rgba(176, 225, 214, 0.24)';
        ctx.lineWidth = 0.045;
        ctx.beginPath();
        if (edge === 0) { ctx.moveTo(t.x + 0.03, t.y + 0.02); ctx.lineTo(t.x + 0.97, t.y + 0.02); }
        if (edge === 1) { ctx.moveTo(t.x + 0.03, t.y + 0.98); ctx.lineTo(t.x + 0.97, t.y + 0.98); }
        if (edge === 2) { ctx.moveTo(t.x + 0.02, t.y + 0.03); ctx.lineTo(t.x + 0.02, t.y + 0.97); }
        if (edge === 3) { ctx.moveTo(t.x + 0.98, t.y + 0.03); ctx.lineTo(t.x + 0.98, t.y + 0.97); }
        ctx.stroke();
      }
    }

    this.drawRoads(ctx, map);
    this.drawCityBuildings(ctx, map);

    // Grain over the entire map ties the palette together.
    ctx.globalAlpha = 0.055;
    for (let i = 0; i < 4200; i++) {
      const x = Math.random() * W, y = Math.random() * H;
      ctx.fillStyle = Math.random() > 0.5 ? '#ffffff' : '#000000';
      ctx.fillRect(x, y, 0.025, 0.025);
    }
    ctx.globalAlpha = 1;

    // Hard map edge.
    ctx.strokeStyle = 'rgba(3, 9, 6, 0.85)';
    ctx.lineWidth = 0.22;
    ctx.strokeRect(0.06, 0.06, W - 0.12, H - 0.12);
    ctx.strokeStyle = 'rgba(190, 220, 190, 0.08)';
    ctx.lineWidth = 0.05;
    ctx.strokeRect(0.18, 0.18, W - 0.36, H - 0.36);

    this.terrain = c;
  }

  buildBackdrop() {
    if (!this.terrain) return;
    const c = document.createElement('canvas');
    c.width = 720; c.height = 720;
    const ctx = c.getContext('2d');
    ctx.filter = 'blur(8px) saturate(0.72) brightness(0.62)';
    ctx.drawImage(this.terrain, 0, 0, c.width, c.height);
    ctx.filter = 'none';
    const g = ctx.createRadialGradient(360, 320, 60, 360, 360, 480);
    g.addColorStop(0, 'rgba(4, 10, 7, 0.18)');
    g.addColorStop(1, 'rgba(4, 9, 6, 0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, c.width, c.height);
    this.backdrop = c;
  }

  drawTileBase(ctx, t) {
    const p = PALETTE[t.type] || PALETTE.grass;
    const x = t.x, y = t.y;
    const v = (t.v - 0.5) * 4.2 + t.tint * 16;
    const l = clamp(p.l + v, 10, 70);
    const h = p.h + (t.v2 - 0.5) * 3.2;
    ctx.fillStyle = `hsl(${h}, ${p.s}%, ${l}%)`;
    ctx.fillRect(x - 0.01, y - 0.01, 1.02, 1.02);

    switch (t.type) {
      case 'grass': {
        ctx.strokeStyle = `rgba(220, 235, 185, ${0.08 + t.v * 0.07})`;
        ctx.lineWidth = 0.018;
        for (let i = 0; i < 6; i++) {
          const rx = x + 0.08 + hash(t.x, t.y, i) * 0.84;
          const ry = y + 0.08 + hash(t.y, t.x, i + 9) * 0.84;
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx + (hash(i, t.x, 3) - 0.5) * 0.08, ry - 0.055 - t.v * 0.05);
          ctx.stroke();
        }
        if (t.v > 0.72) {
          ctx.fillStyle = 'rgba(212, 225, 165, 0.11)';
          ctx.beginPath(); ctx.ellipse(x + 0.3 + t.v2 * 0.35, y + 0.3 + t.v * 0.3, 0.22, 0.14, 0.3, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'sand': {
        ctx.fillStyle = 'rgba(255, 240, 195, 0.12)';
        for (let i = 0; i < 7; i++) {
          const rx = x + 0.05 + hash(t.x, i, 3) * 0.9;
          const ry = y + 0.05 + hash(t.y, i, 7) * 0.9;
          ctx.fillRect(rx, ry, 0.025, 0.025);
        }
        ctx.strokeStyle = 'rgba(110, 88, 56, 0.14)';
        ctx.lineWidth = 0.025;
        ctx.beginPath(); ctx.arc(x + 0.5, y + 0.62, 0.28, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        break;
      }
      case 'forest': {
        for (let i = 0; i < 3; i++) {
          const rx = x + 0.22 + hash(t.x, i, 2) * 0.58;
          const ry = y + 0.22 + hash(t.y, i, 8) * 0.6;
          const r = 0.16 + hash(i, t.x, 5) * 0.1;
          ctx.fillStyle = 'rgba(18, 36, 22, 0.42)';
          ctx.beginPath(); ctx.ellipse(rx + 0.04, ry + 0.06, r * 1.05, r * 0.8, 0.2, 0, TAU); ctx.fill();
          ctx.fillStyle = `hsl(${112 + i * 4}, 24%, ${23 + i * 3}%)`;
          ctx.beginPath(); ctx.arc(rx, ry, r, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(170, 200, 145, 0.18)';
          ctx.beginPath(); ctx.arc(rx - r * 0.28, ry - r * 0.3, r * 0.52, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'hills': {
        ctx.strokeStyle = 'rgba(48, 39, 24, 0.28)';
        ctx.lineWidth = 0.03;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(x + 0.48 + (t.v - 0.5) * 0.3, y + 0.6 + i * 0.14, 0.28 - i * 0.04, Math.PI * 1.07, Math.PI * 1.93);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(230, 216, 172, 0.10)';
        ctx.beginPath(); ctx.ellipse(x + 0.3, y + 0.3, 0.2, 0.11, -0.4, 0, TAU); ctx.fill();
        break;
      }
      case 'mountain': {
        ctx.fillStyle = 'rgba(28, 26, 22, 0.26)';
        ctx.beginPath(); ctx.moveTo(x + 0.12, y + 0.82); ctx.lineTo(x + 0.54, y + 0.2); ctx.lineTo(x + 0.92, y + 0.82); ctx.fill();
        ctx.fillStyle = 'hsl(43, 8%, 49%)';
        ctx.beginPath(); ctx.moveTo(x + 0.18, y + 0.82); ctx.lineTo(x + 0.46, y + 0.24); ctx.lineTo(x + 0.72, y + 0.82); ctx.fill();
        ctx.fillStyle = 'rgba(228, 226, 212, 0.78)';
        ctx.beginPath(); ctx.moveTo(x + 0.46, y + 0.24); ctx.lineTo(x + 0.37, y + 0.41); ctx.lineTo(x + 0.46, y + 0.38); ctx.lineTo(x + 0.54, y + 0.45); ctx.fill();
        ctx.strokeStyle = 'rgba(25, 24, 20, 0.3)'; ctx.lineWidth = 0.025;
        ctx.beginPath(); ctx.moveTo(x + 0.46, y + 0.24); ctx.lineTo(x + 0.46, y + 0.82); ctx.stroke();
        break;
      }
      case 'water': {
        const g = ctx.createLinearGradient(x, y, x + 0.3, y + 1);
        g.addColorStop(0, `hsla(188, 36%, ${l + 4}%, 1)`);
        g.addColorStop(1, `hsla(195, 42%, ${l - 5}%, 1)`);
        ctx.fillStyle = g;
        ctx.fillRect(x, y, 1.01, 1.01);
        ctx.strokeStyle = 'rgba(157, 215, 208, 0.17)';
        ctx.lineWidth = 0.022;
        ctx.beginPath();
        ctx.moveTo(x + 0.12, y + 0.3 + t.v * 0.2);
        ctx.quadraticCurveTo(x + 0.4, y + 0.22 + t.v * 0.2, x + 0.78, y + 0.31 + t.v * 0.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 0.25, y + 0.7 - t.v * 0.15);
        ctx.quadraticCurveTo(x + 0.5, y + 0.63 - t.v * 0.15, x + 0.86, y + 0.72 - t.v * 0.15);
        ctx.stroke();
        if (t.v > 0.8) { ctx.fillStyle = 'rgba(190, 235, 225, 0.2)'; ctx.fillRect(x + 0.2, y + 0.5, 0.28, 0.02); }
        break;
      }
      case 'road': {
        ctx.fillStyle = `hsl(${41 + (t.v - 0.5) * 4}, 17%, ${l}%)`;
        ctx.fillRect(x, y, 1.01, 1.01);
        ctx.fillStyle = 'rgba(60, 50, 32, 0.09)';
        ctx.fillRect(x + 0.04, y + 0.1, 0.92, 0.06);
        break;
      }
      case 'bridge': {
        ctx.fillStyle = `hsl(188, 36%, ${l - 2}%)`;
        ctx.fillRect(x, y, 1.01, 1.01);
        ctx.strokeStyle = 'rgba(157, 215, 208, 0.15)'; ctx.lineWidth = 0.02;
        ctx.beginPath(); ctx.moveTo(x + 0.2, y + 0.25); ctx.lineTo(x + 0.8, y + 0.27); ctx.stroke();
        break;
      }
      case 'plaza': {
        ctx.fillStyle = `hsl(41, 12%, ${l}%)`;
        ctx.fillRect(x, y, 1.01, 1.01);
        ctx.strokeStyle = 'rgba(40, 34, 23, 0.16)';
        ctx.lineWidth = 0.018;
        for (let i = 1; i < 4; i++) {
          ctx.beginPath(); ctx.moveTo(x, y + i / 4); ctx.lineTo(x + 1, y + i / 4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + i / 4, y); ctx.lineTo(x + i / 4, y + 1); ctx.stroke();
        }
        break;
      }
    }
  }

  drawRoads(ctx, map) {
    const roadLike = (t) => t && (t.type === 'road' || t.type === 'bridge' || t.type === 'plaza' || !!t.city);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const t of map.tiles) {
      if (t.type !== 'road' && t.type !== 'bridge') continue;
      const cx = t.x + 0.5, cy = t.y + 0.5;
      const dirs = [];
      if (roadLike(map.tile(t.x + 1, t.y))) dirs.push([1, 0]);
      if (roadLike(map.tile(t.x - 1, t.y))) dirs.push([-1, 0]);
      if (roadLike(map.tile(t.x, t.y + 1))) dirs.push([0, 1]);
      if (roadLike(map.tile(t.x, t.y - 1))) dirs.push([0, -1]);

      const isBridge = t.type === 'bridge';
      ctx.strokeStyle = isBridge ? 'rgba(39, 29, 18, 0.8)' : 'rgba(58, 49, 32, 0.6)';
      ctx.lineWidth = isBridge ? 0.48 : 0.4;
      for (const [dx, dy] of dirs) {
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * 0.55, cy + dy * 0.55); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, cy, isBridge ? 0.22 : 0.18, 0, TAU); ctx.fillStyle = isBridge ? 'rgba(39,29,18,.8)' : 'rgba(58,49,32,.6)'; ctx.fill();

      ctx.strokeStyle = isBridge ? '#876643' : '#a39169';
      ctx.lineWidth = isBridge ? 0.36 : 0.3;
      for (const [dx, dy] of dirs) {
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * 0.55, cy + dy * 0.55); ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(cx, cy, isBridge ? 0.17 : 0.14, 0, TAU); ctx.fillStyle = isBridge ? '#876643' : '#a39169'; ctx.fill();

      if (isBridge) {
        ctx.strokeStyle = 'rgba(50, 34, 18, 0.48)';
        ctx.lineWidth = 0.018;
        const vertical = dirs.some(([dx]) => dx !== 0);
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          if (vertical) {
            ctx.moveTo(cx + i * 0.09, cy - 0.34); ctx.lineTo(cx + i * 0.09, cy + 0.34);
          } else {
            ctx.moveTo(cx - 0.34, cy + i * 0.09); ctx.lineTo(cx + 0.34, cy + i * 0.09);
          }
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(210, 177, 128, 0.4)';
        ctx.lineWidth = 0.06;
        if (vertical) {
          ctx.beginPath(); ctx.moveTo(cx - 0.26, cy - 0.4); ctx.lineTo(cx - 0.26, cy + 0.4); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx + 0.26, cy - 0.4); ctx.lineTo(cx + 0.26, cy + 0.4); ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(cx - 0.4, cy - 0.26); ctx.lineTo(cx + 0.4, cy - 0.26); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx - 0.4, cy + 0.26); ctx.lineTo(cx + 0.4, cy + 0.26); ctx.stroke();
        }
      } else {
        // Centre dashes give the roads a tactical-map read.
        ctx.strokeStyle = 'rgba(73, 61, 39, 0.36)';
        ctx.lineWidth = 0.022;
        ctx.setLineDash([0.09, 0.12]);
        for (const [dx, dy] of dirs) {
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * 0.46, cy + dy * 0.46); ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
  }

  drawCityBuildings(ctx, map) {
    for (const c of map.cities) {
      const x = c.x, y = c.y;
      ctx.save();
      // stone platform
      ctx.fillStyle = 'rgba(47, 43, 31, 0.32)';
      roundRect(ctx, x + 0.05, y + 0.13, 0.9, 0.84, 0.1); ctx.fill();
      ctx.fillStyle = '#8e8267';
      roundRect(ctx, x + 0.03, y + 0.05, 0.9, 0.84, 0.1); ctx.fill();
      ctx.strokeStyle = 'rgba(41, 36, 24, 0.4)'; ctx.lineWidth = 0.025; ctx.stroke();

      const hq = c.type === 'hq';
      if (hq) {
        // bunker + command tower
        ctx.fillStyle = '#5d5848';
        roundRect(ctx, x + 0.15, y + 0.35, 0.62, 0.42, 0.04); ctx.fill();
        ctx.fillStyle = '#706a57';
        roundRect(ctx, x + 0.18, y + 0.29, 0.44, 0.42, 0.03); ctx.fill();
        ctx.fillStyle = '#494738';
        roundRect(ctx, x + 0.24, y + 0.22, 0.24, 0.32, 0.02); ctx.fill();
        ctx.fillStyle = '#9a927c';
        ctx.fillRect(x + 0.27, y + 0.25, 0.18, 0.035);
        ctx.fillStyle = '#36352b';
        ctx.fillRect(x + 0.59, y + 0.31, 0.055, 0.2);
        ctx.fillStyle = 'rgba(218, 210, 185, 0.35)';
        ctx.fillRect(x + 0.2, y + 0.6, 0.5, 0.02);
      } else {
        // two or three little blocks
        const blocks = c.central
          ? [[0.16, 0.36, 0.3, 0.36], [0.49, 0.27, 0.29, 0.45]]
          : [[0.13, 0.39, 0.27, 0.33], [0.44, 0.3, 0.25, 0.42], [0.71, 0.44, 0.15, 0.28]];
        for (let i = 0; i < blocks.length; i++) {
          const [bx, by, bw, bh] = blocks[i];
          ctx.fillStyle = 'rgba(42, 37, 25, 0.28)';
          ctx.fillRect(x + bx + 0.025, y + by + 0.035, bw, bh);
          ctx.fillStyle = i % 2 ? '#8e8168' : '#7d735c';
          ctx.fillRect(x + bx, y + by, bw, bh);
          ctx.fillStyle = 'rgba(201, 190, 157, 0.34)';
          ctx.fillRect(x + bx, y + by, bw, 0.035);
          ctx.fillStyle = 'rgba(30, 30, 23, 0.45)';
          ctx.fillRect(x + bx + bw * 0.32, y + by + bh * 0.4, bw * 0.18, 0.06);
        }
      }
      // flag pole
      ctx.strokeStyle = 'rgba(28, 26, 19, 0.8)';
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(x + 0.78, y + 0.2);
      ctx.lineTo(x + 0.78, y + 0.58);
      ctx.stroke();
      ctx.fillStyle = 'rgba(30, 27, 20, 0.5)';
      ctx.beginPath(); ctx.arc(x + 0.78, y + 0.61, 0.05, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  /* ── Minimap base ────────────────────────────────────────────────────── */
  buildMiniBase() {
    const c = document.createElement('canvas');
    c.width = W * 5; c.height = H * 5;
    const ctx = c.getContext('2d');
    for (const t of this.game.map.tiles) {
      ctx.fillStyle = MINI[t.type] || MINI.grass;
      ctx.fillRect(t.x * 5, t.y * 5, 5, 5);
      if (t.type === 'water' && t.v > 0.6) {
        ctx.fillStyle = 'rgba(150,210,205,0.18)';
        ctx.fillRect(t.x * 5 + 1, t.y * 5 + 2, 2, 1);
      }
    }
    this.miniBase = c;
  }

  /* ── Effects ─────────────────────────────────────────────────────────── */
  handleFx(fx) {
    if (!fx) return;
    switch (fx.kind) {
      case 'attack': {
        const ranged = fx.ranged;
        this.beams.push({
          kind: ranged ? 'shell' : 'tracer',
          from: { x: fx.from.x + 0.5, y: fx.from.y + 0.5 },
          to: { x: fx.to.x + 0.5, y: fx.to.y + 0.5 },
          life: ranged ? 0.42 : 0.2, max: ranged ? 0.42 : 0.2,
          side: fx.side,
          type: fx.type,
        });
        this.shake = Math.max(this.shake, ranged ? 7 : 4);
        this.burst(fx.from.x + 0.5, fx.from.y + 0.5, sideTint(fx.side), ranged ? 8 : 5, 1.6, 0.22);
        break;
      }
      case 'damage': {
        const u = this.game.byId(fx.targetId);
        if (u) u.flash = 0.18;
        this.floaters.push({
          x: fx.x + 0.5 + (Math.random() - 0.5) * 0.2,
          y: fx.y + 0.25,
          text: `−${fx.amount}`,
          color: fx.counter ? '#ffd08a' : '#fff3dc',
          life: 0.95, max: 0.95, size: 0.52, vy: -0.9,
        });
        this.burst(fx.x + 0.5, fx.y + 0.5, fx.counter ? '#ffd08a' : (fx.side === 'player' ? '#64e3bd' : '#ff7164'), 10, 2.4, 0.4);
        this.rings.push({ x: fx.x + 0.5, y: fx.y + 0.5, r0: 0.18, r1: 0.62, life: 0.35, max: 0.35, color: fx.counter ? '#ffd08a' : '#ffffff', width: 0.045 });
        this.shake = Math.max(this.shake, 5.5);
        break;
      }
      case 'death': {
        this.burst(fx.x + 0.5, fx.y + 0.5, sideTint(fx.side), 30, 4.2, 0.75);
        this.burst(fx.x + 0.5, fx.y + 0.5, '#ffcf86', 16, 3.0, 0.55);
        this.rings.push({ x: fx.x + 0.5, y: fx.y + 0.5, r0: 0.2, r1: 1.25, life: 0.55, max: 0.55, color: '#ffb27a', width: 0.07 });
        this.shake = Math.max(this.shake, 11);
        break;
      }
      case 'capture': {
        const col = sideTint(fx.side);
        for (let i = 0; i < 3; i++) {
          this.rings.push({
            x: fx.x + 0.5, y: fx.y + 0.5, r0: 0.3 + i * 0.1, r1: 1.2 + i * 0.35,
            life: 0.7 + i * 0.12, max: 0.7 + i * 0.12, color: col, width: 0.06,
          });
        }
        this.burst(fx.x + 0.5, fx.y + 0.5, col, 24, 3.2, 0.85);
        this.floaters.push({
          x: fx.x + 0.5, y: fx.y + 0.1, text: fx.name.toUpperCase(),
          color: col, life: 1.6, max: 1.6, size: 0.34, vy: -0.5,
        });
        this.shake = Math.max(this.shake, 4);
        break;
      }
      case 'spawn':
      case 'deploy': {
        const col = sideTint(fx.side);
        this.rings.push({ x: fx.x + 0.5, y: fx.y + 0.5, r0: 0.1, r1: 0.9, life: 0.55, max: 0.55, color: col, width: 0.05 });
        this.burst(fx.x + 0.5, fx.y + 0.5, col, 14, 2.0, 0.5);
        break;
      }
      case 'heal': {
        this.floaters.push({
          x: fx.x + 0.5, y: fx.y + 0.25, text: '+25', color: '#8bf0b8',
          life: 0.9, max: 0.9, size: 0.4, vy: -0.7,
        });
        this.burst(fx.x + 0.5, fx.y + 0.5, '#8bf0b8', 8, 1.2, 0.5);
        break;
      }
      case 'move': {
        break;
      }
    }
  }

  burst(x, y, color, count, speed, life) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const sp = (0.25 + Math.random()) * speed;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.2,
        life: life * (0.5 + Math.random() * 0.7), max: life,
        size: 0.025 + Math.random() * 0.07,
        color, drag: 2.8, gravity: 2.2, spark: Math.random() > 0.6,
      });
    }
  }

  /* ── Main loop ───────────────────────────────────────────────────────── */
  loop(now) {
    if (!this.last) this.last = now;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    this.update(dt);
    this.draw(now / 1000);
    this.drawMinimap();
    requestAnimationFrame(this.loop);
  }

  update(dt) {
    // camera easing
    const k = 1 - Math.exp(-dt * 13);
    this.cam.x = lerp(this.cam.x, this.target.x, k);
    this.cam.y = lerp(this.cam.y, this.target.y, k);
    this.cam.z = lerp(this.cam.z, this.target.z, 1 - Math.exp(-dt * 16));
    this.tilt.x = lerp(this.tilt.x, this.tilt.tx, 1 - Math.exp(-dt * 6));
    this.tilt.y = lerp(this.tilt.y, this.tilt.ty, 1 - Math.exp(-dt * 6));

    this.shake *= Math.exp(-dt * 11);
    if (this.shake < 0.05) this.shake = 0;

    // unit path animation
    for (const u of this.game.units) {
      u.flash = Math.max(0, (u.flash || 0) - dt);
      if (u.pathQueue && u.pathQueue.length) {
        const next = u.pathQueue[0];
        const dx = next.x - u.px, dy = next.y - u.py;
        const len = Math.hypot(dx, dy);
        const step = 15 * dt;
        if (len <= step || len < 0.001) {
          u.px = next.x; u.py = next.y;
          u.pathQueue.shift();
        } else {
          u.px += dx / len * step;
          u.py += dy / len * step;
          if (Math.abs(dx) > 0.01) u.facing = dx > 0 ? 1 : -1;
        }
        if (Math.random() < dt * 16) {
          this.burst(u.px + 0.5, u.py + 0.78, 'rgba(196,183,145,0.8)', 1, 0.4, 0.32);
        }
      } else {
        if (Math.abs(u.px - u.x) > 0.01 || Math.abs(u.py - u.y) > 0.01) {
          u.px = lerp(u.px, u.x, 1 - Math.exp(-dt * 18));
          u.py = lerp(u.py, u.y, 1 - Math.exp(-dt * 18));
        }
      }
    }

    // effects
    for (const p of this.particles) {
      p.life -= dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= Math.exp(-2 * dt);
    }
    this.floaters = this.floaters.filter(f => f.life > 0);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter(b => b.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter(r => r.life > 0);
  }

  draw(time) {
    const ctx = this.ctx;
    const { w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // background
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    bg.addColorStop(0, '#16251c');
    bg.addColorStop(0.55, '#0b1510');
    bg.addColorStop(1, '#050b07');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (this.backdrop) {
      const scale = Math.max(w / this.backdrop.width, h / this.backdrop.height);
      const dw = this.backdrop.width * scale;
      const dh = this.backdrop.height * scale;
      ctx.globalAlpha = 0.42;
      ctx.drawImage(this.backdrop, (w - dw) / 2, (h - dh) / 2, dw, dh);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(5, 11, 8, 0.48)';
      ctx.fillRect(0, 0, w, h);
    }

    const z = this.cam.z;
    const shakeX = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const shakeY = this.shake ? (Math.random() - 0.5) * this.shake : 0;
    const lookX = this.cam.x + this.tilt.x * 2.6;
    const lookY = this.cam.y + this.tilt.y * 2.2;

    // drop shadow beneath the field
    const topLeft = this.worldToScreen(0, 0);
    const bottomRight = this.worldToScreen(W, H);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 34;
    ctx.fillStyle = 'rgba(3, 8, 5, 0.32)';
    ctx.fillRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    ctx.restore();

    ctx.save();
    ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
    ctx.scale(z, z);
    ctx.translate(-lookX, -lookY);

    // terrain
    if (this.terrain) ctx.drawImage(this.terrain, 0, 0, W, H);

    this.drawWater(ctx, time);
    this.drawGrid(ctx, z);
    this.drawReach(ctx, time);
    this.drawCities(ctx, time);
    this.drawCityLabels(ctx, z);
    this.drawSelectionUnder(ctx, time);
    this.drawUnits(ctx, time);
    this.drawEffects(ctx);
    this.drawMapMarkers(ctx, time);

    ctx.restore();

    // Tactical scanline / grain that moves very slowly.
    ctx.fillStyle = `rgba(160, 220, 185, ${0.012 + Math.sin(time * 0.6) * 0.004})`;
    for (let y = (time * 8) % 4; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  }

  drawWater(ctx, time) {
    const g = this.game;
    const bounds = this.visibleTiles();
    for (let y = bounds.y0; y <= bounds.y1; y++) {
      for (let x = bounds.x0; x <= bounds.x1; x++) {
        const t = g.map.tile(x, y);
        if (!t || t.type !== 'water') continue;
        const ph = t.v * TAU + time * 0.7 + x * 0.3;
        ctx.strokeStyle = `rgba(173, 225, 215, ${0.08 + Math.sin(ph) * 0.045})`;
        ctx.lineWidth = 0.025;
        ctx.beginPath();
        ctx.moveTo(x + 0.18, y + 0.42 + Math.sin(ph) * 0.06);
        ctx.quadraticCurveTo(x + 0.5, y + 0.36 + Math.sin(ph) * 0.06, x + 0.82, y + 0.46 + Math.sin(ph) * 0.06);
        ctx.stroke();
      }
    }
  }

  drawGrid(ctx, z) {
    if (z < 9) return;
    const alpha = clamp((z - 9) / 20, 0, 1) * 0.12;
    ctx.strokeStyle = `rgba(10, 19, 13, ${alpha})`;
    ctx.lineWidth = 1 / z;
    ctx.beginPath();
    for (let i = 1; i < W; i++) { ctx.moveTo(i, 0); ctx.lineTo(i, H); }
    for (let i = 1; i < H; i++) { ctx.moveTo(0, i); ctx.lineTo(W, i); }
    ctx.stroke();
    ctx.strokeStyle = `rgba(210, 235, 210, ${alpha * 0.22})`;
    ctx.beginPath();
    for (let i = 4; i < W; i += 4) { ctx.moveTo(i, 0); ctx.lineTo(i, H); }
    for (let i = 4; i < H; i += 4) { ctx.moveTo(0, i); ctx.lineTo(W, i); }
    ctx.stroke();
  }

  drawReach(ctx, time) {
    const g = this.game;
    const sel = g.selected;
    if (!sel) return;
    const pulse = 0.14 + Math.sin(time * 3.2) * 0.025;
    for (const node of g.reach.values()) {
      if (node.x === sel.x && node.y === sel.y) continue;
      const k = key(node.x, node.y);
      if (g.attackTiles.has(k)) continue;
      ctx.fillStyle = `rgba(100, 227, 189, ${pulse})`;
      roundRect(ctx, node.x + 0.08, node.y + 0.08, 0.84, 0.84, 0.12); ctx.fill();
      ctx.strokeStyle = `rgba(140, 246, 213, ${0.28 + Math.sin(time * 3.2) * 0.05})`;
      ctx.lineWidth = 0.018;
      roundRect(ctx, node.x + 0.08, node.y + 0.08, 0.84, 0.84, 0.12); ctx.stroke();
      if (g.map.city(node.x, node.y)) {
        ctx.strokeStyle = 'rgba(255, 210, 130, 0.7)';
        ctx.lineWidth = 0.035;
        roundRect(ctx, node.x + 0.11, node.y + 0.11, 0.78, 0.78, 0.1); ctx.stroke();
      }
    }

    // Attack tiles and targeting brackets.
    for (const [k, enemy] of g.attackTiles) {
      const x = enemy.x, y = enemy.y;
      ctx.fillStyle = `rgba(255, 88, 74, ${0.14 + Math.sin(time * 4) * 0.03})`;
      roundRect(ctx, x + 0.04, y + 0.04, 0.92, 0.92, 0.12); ctx.fill();
      ctx.strokeStyle = 'rgba(255, 124, 108, 0.85)';
      ctx.lineWidth = 0.035;
      const m = 0.12, l = 0.16;
      for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const px = x + m + sx * (1 - m * 2);
        const py = y + m + sy * (1 - m * 2);
        const dx = sx ? -l : l, dy = sy ? -l : l;
        ctx.beginPath(); ctx.moveTo(px + dx, py); ctx.lineTo(px, py); ctx.lineTo(px, py + dy); ctx.stroke();
      }
    }
  }

  drawSelectionUnder(ctx, time) {
    const g = this.game;
    const u = g.selected || g.inspected;
    if (!u) return;
    const x = u.px + 0.5, y = u.py + 0.5;
    const col = u.side === 'player' ? '#64e3bd' : '#ff7164';
    ctx.save();
    ctx.translate(x, y + 0.28);
    ctx.scale(1, 0.42);
    const grd = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 0.72);
    grd.addColorStop(0, `${col}44`);
    grd.addColorStop(1, `${col}00`);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, 0.72, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawCities(ctx, time) {
    const g = this.game;
    for (const c of g.map.cities) {
      const col = cityColor(c.owner);
      const x = c.x + 0.5, y = c.y + 0.5;
      const pulse = 0.5 + Math.sin(time * 2.2 + c.x) * 0.5;
      const glow = ctx.createRadialGradient(x, y, 0.18, x, y, 0.75);
      glow.addColorStop(0, `${col.line}22`);
      glow.addColorStop(1, `${col.line}00`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, 0.78, 0, TAU); ctx.fill();

      // flag
      const fx = c.x + 0.78, fy = c.y + 0.2;
      const wave = Math.sin(time * 3.3 + c.x * 0.7) * 0.035;
      ctx.strokeStyle = 'rgba(17, 20, 14, 0.85)';
      ctx.lineWidth = 0.026;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + 0.36); ctx.stroke();
      ctx.fillStyle = col.line;
      ctx.beginPath();
      ctx.moveTo(fx, fy + 0.01);
      ctx.quadraticCurveTo(fx + 0.13, fy + 0.035 + wave, fx + 0.22, fy + 0.015 + wave);
      ctx.lineTo(fx + 0.16, fy + 0.105 + wave);
      ctx.quadraticCurveTo(fx + 0.09, fy + 0.09 - wave, fx, fy + 0.13);
      ctx.closePath(); ctx.fill();
      if (c.type === 'hq') {
        ctx.fillStyle = '#0c1610';
        ctx.beginPath(); ctx.arc(fx + 0.065, fy + 0.066 + wave * 0.6, 0.022, 0, TAU); ctx.fill();
      }

      // Can I build here?
      const selectable = c.owner === 'player' && g.side === 'player' && g.started && !g.over &&
        !g.busy && !g.unitAt(c.x, c.y);
      if (selectable) {
        ctx.strokeStyle = `rgba(255, 210, 130, ${0.4 + pulse * 0.35})`;
        ctx.lineWidth = 0.03;
        ctx.beginPath(); ctx.arc(x, y, 0.43 + pulse * 0.04, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(12, 24, 17, 0.9)';
        ctx.beginPath(); ctx.arc(x + 0.37, y - 0.38, 0.14, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(242, 180, 92, ${0.65 + pulse * 0.3})`;
        ctx.lineWidth = 0.028;
        ctx.beginPath();
        ctx.moveTo(x + 0.31, y - 0.38); ctx.lineTo(x + 0.43, y - 0.38);
        ctx.moveTo(x + 0.37, y - 0.44); ctx.lineTo(x + 0.37, y - 0.32);
        ctx.stroke();
      }

      // HQ beacon
      if (c.type === 'hq') {
        ctx.strokeStyle = `${col.line}${c.owner === 'enemy' ? '66' : '33'}`;
        ctx.lineWidth = 0.025;
        ctx.beginPath(); ctx.arc(x, y, 0.5 + pulse * 0.18, 0, TAU); ctx.stroke();
      }
    }
  }

  drawCityLabels(ctx, z) {
    if (z < 15) return;
    const g = this.game;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const c of g.map.cities) {
      const label = c.name.toUpperCase();
      const font = Math.max(0.26, Math.min(0.42, 10.5 / z));
      ctx.font = `700 ${font}px "Arial Narrow", "Helvetica Neue", sans-serif`;
      const w = ctx.measureText(label).width + font * 0.75;
      const h = font * 1.5;
      const x = c.x + 0.5, y = c.y + 1.02;
      ctx.fillStyle = 'rgba(6, 13, 9, 0.78)';
      roundRect(ctx, x - w / 2, y - h / 2, w, h, font * 0.45); ctx.fill();
      ctx.fillStyle = c.owner === 'player' ? 'rgba(155, 244, 216, 0.92)'
        : c.owner === 'enemy' ? 'rgba(255, 169, 159, 0.92)' : 'rgba(226, 226, 210, 0.78)';
      ctx.fillText(label, x, y + font * 0.04);
    }
  }

  drawUnits(ctx, time) {
    const units = [...this.game.units].sort((a, b) => a.py - b.py);
    for (const u of units) this.drawUnit(ctx, u, time);
  }

  drawUnit(ctx, u, time) {
    const T = TYPES[u.type];
    const col = SIDE[u.side];
    const x = u.px + 0.5, y = u.py + 0.5;
    const selected = this.game.selectedId === u.id;
    const inspected = this.game.inspectedId === u.id;
    const alpha = u.done ? 0.62 : 1;
    const bob = selected ? Math.sin(time * 5) * 0.012 : 0;

    ctx.save();
    ctx.globalAlpha = alpha;

    // shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
    ctx.beginPath(); ctx.ellipse(x + 0.04, y + 0.35, 0.34, 0.14, 0, 0, TAU); ctx.fill();

    ctx.translate(x, y + bob);

    if (selected) {
      ctx.strokeStyle = 'rgba(230, 255, 246, 0.9)';
      ctx.lineWidth = 0.035;
      ctx.setLineDash([0.12, 0.1]);
      ctx.lineDashOffset = -time * 0.35;
      ctx.beginPath(); ctx.arc(0, 0, 0.47, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(100, 227, 189, 0.35)';
      ctx.lineWidth = 0.06;
      ctx.beginPath(); ctx.arc(0, 0, 0.5, 0, TAU); ctx.stroke();
    }
    if (inspected) {
      ctx.strokeStyle = 'rgba(255, 150, 138, 0.85)';
      ctx.lineWidth = 0.03;
      ctx.setLineDash([0.1, 0.09]);
      ctx.lineDashOffset = time * 0.3;
      ctx.beginPath(); ctx.arc(0, 0, 0.47, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    }

    // token
    const grd = ctx.createRadialGradient(-0.12, -0.15, 0.04, 0, 0, 0.38);
    grd.addColorStop(0, u.side === 'player' ? '#1d5042' : '#55231f');
    grd.addColorStop(1, col.fill);
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(0, 0, 0.36, 0, TAU); ctx.fill();
    ctx.strokeStyle = u.flash > 0 ? '#ffffff' : col.line;
    ctx.lineWidth = u.flash > 0 ? 0.06 : 0.035;
    ctx.beginPath(); ctx.arc(0, 0, 0.36, 0, TAU); ctx.stroke();

    // inner hairline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 0.012;
    ctx.beginPath(); ctx.arc(0, 0, 0.29, 0, TAU); ctx.stroke();

    drawUnitIcon(ctx, u.type, col.icon);

    // Facing tick for vehicles.
    if (u.type === 'tank' || u.type === 'arty') {
      ctx.strokeStyle = `${col.line}aa`;
      ctx.lineWidth = 0.025;
      const f = u.facing >= 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(f * 0.42, -0.16);
      ctx.lineTo(f * 0.48, 0);
      ctx.lineTo(f * 0.42, 0.16);
      ctx.stroke();
    }

    // hp
    const hp = u.hp / u.maxHp;
    const hw = 0.62, hh = 0.075, hy = 0.39;
    ctx.fillStyle = 'rgba(3, 8, 5, 0.82)';
    roundRect(ctx, -hw / 2 - 0.015, hy - 0.015, hw + 0.03, hh + 0.03, 0.04); ctx.fill();
    ctx.fillStyle = hp > 0.6 ? '#75e3ae' : hp > 0.3 ? '#f2b45c' : '#ff7164';
    roundRect(ctx, -hw / 2, hy, hw * Math.max(0.03, hp), hh, 0.03); ctx.fill();

    // deployed sparkle
    if (u.deploying) {
      ctx.strokeStyle = `rgba(255,255,255,${0.2 + Math.sin(time * 4) * 0.12})`;
      ctx.lineWidth = 0.02;
      ctx.beginPath(); ctx.arc(0, 0, 0.44, 0, TAU); ctx.stroke();
    }

    ctx.restore();

    // Damage flash halo
    if (u.flash > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(u.flash / 0.18, 0, 1) * 0.5;
      ctx.fillStyle = '#fff3dc';
      ctx.beginPath(); ctx.arc(x, y, 0.52, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  drawMapMarkers(ctx, time) {
    const g = this.game;
    if (!g.started || g.over) return;
    const pulse = 0.5 + Math.sin(time * 2.6) * 0.5;
    for (const c of g.map.cities) {
      if (c.type !== 'hq') continue;
      const col = c.owner === 'player' ? '#64e3bd' : '#ff7164';
      const x = c.x + 0.5, y = c.y - 0.34;
      ctx.save();
      ctx.globalAlpha = 0.3 + pulse * 0.35;
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.028;
      const r = 0.1 + pulse * 0.03;
      ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
  }

  drawEffects(ctx) {
    // beams
    for (const b of this.beams) {
      const t = 1 - b.life / b.max;
      if (b.kind === 'shell') {
        const mx = (b.from.x + b.to.x) / 2;
        const my = (b.from.y + b.to.y) / 2 - 1.6;
        const it = Math.min(1, t * 1.6);
        const ix = (1 - it) * (1 - it) * b.from.x + 2 * (1 - it) * it * mx + it * it * b.to.x;
        const iy = (1 - it) * (1 - it) * b.from.y + 2 * (1 - it) * it * my + it * it * b.to.y;
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = b.side === 'player' ? 'rgba(150,255,224,.3)' : 'rgba(255,180,160,.3)';
        ctx.lineWidth = 0.035;
        ctx.beginPath();
        ctx.moveTo(b.from.x, b.from.y);
        ctx.quadraticCurveTo(mx, my, ix, iy);
        ctx.stroke();
        ctx.fillStyle = b.side === 'player' ? '#affff0' : '#ffd0c4';
        ctx.shadowColor = b.side === 'player' ? '#64e3bd' : '#ff7164';
        ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(ix, iy, 0.06, 0, TAU); ctx.fill();
        ctx.restore();
      } else {
        const a = clamp(b.life / b.max, 0, 1);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = b.side === 'player' ? '#b6ffe9' : '#ffc3b9';
        ctx.lineWidth = 0.055;
        ctx.shadowColor = b.side === 'player' ? '#64e3bd' : '#ff7164';
        ctx.shadowBlur = 7;
        ctx.beginPath(); ctx.moveTo(b.from.x, b.from.y); ctx.lineTo(b.to.x, b.to.y); ctx.stroke();
        ctx.restore();
      }
    }

    // rings
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const rad = lerp(r.r0, r.r1, 1 - Math.pow(1 - t, 2));
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t) + 0.01;
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
      ctx.restore();
    }

    // particles
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.spark) {
        ctx.fillRect(p.x, p.y, p.size * 1.8, p.size * 0.5);
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();

    // floaters
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const a = clamp(f.life / f.max, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 1.5);
      ctx.font = `800 ${f.size}px "Arial Narrow", "Helvetica Neue", sans-serif`;
      ctx.fillStyle = 'rgba(3, 8, 5, 0.7)';
      ctx.fillText(f.text, f.x + 0.025, f.y + 0.03);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  /* ── Minimap ─────────────────────────────────────────────────────────── */
  drawMinimap() {
    const ctx = this.mctx;
    const size = this.minimap.width;
    const s = size / W;
    ctx.clearRect(0, 0, size, size);
    if (this.miniBase) {
      ctx.drawImage(this.miniBase, 0, 0, size, size);
    }
    ctx.fillStyle = 'rgba(3, 8, 5, 0.2)';
    ctx.fillRect(0, 0, size, size);

    for (const c of this.game.map.cities) {
      const col = cityColor(c.owner);
      ctx.fillStyle = col.line;
      const cs = c.type === 'hq' ? 7 : 5;
      ctx.fillRect(c.x * s + s / 2 - cs / 2, c.y * s + s / 2 - cs / 2, cs, cs);
      ctx.strokeStyle = 'rgba(4, 9, 6, 0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(c.x * s + s / 2 - cs / 2, c.y * s + s / 2 - cs / 2, cs, cs);
    }

    for (const u of this.game.units) {
      const col = u.side === 'player' ? '#8affdf' : '#ff9b90';
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(u.x * s + s / 2, u.y * s + s / 2, u.id === this.game.selectedId ? 3.2 : 2.2, 0, TAU); ctx.fill();
      if (u.id === this.game.selectedId) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(u.x * s + s / 2, u.y * s + s / 2, 4.5, 0, TAU); ctx.stroke();
      }
    }

    // view rectangle
    const z = this.cam.z;
    const cx = this.cam.x + this.tilt.x * 2.6;
    const cy = this.cam.y + this.tilt.y * 2.2;
    const hw = this.w / (2 * z), hh = this.h / (2 * z);
    const x0 = clamp(cx - hw, 0, W) * s;
    const y0 = clamp(cy - hh, 0, H) * s;
    const x1 = clamp(cx + hw, 0, W) * s;
    const y1 = clamp(cy + hh, 0, H) * s;
    ctx.strokeStyle = 'rgba(240, 250, 240, 0.72)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x0, y0, Math.max(2, x1 - x0), Math.max(2, y1 - y0));
    ctx.strokeStyle = 'rgba(3, 8, 5, 0.7)';
    ctx.lineWidth = 2.2;
    ctx.strokeRect(x0 - 0.5, y0 - 0.5, Math.max(2, x1 - x0) + 1, Math.max(2, y1 - y0) + 1);
  }

  visibleTiles() {
    const hw = this.w / (2 * this.cam.z), hh = this.h / (2 * this.cam.z);
    const cx = this.cam.x + this.tilt.x * 2.6;
    const cy = this.cam.y + this.tilt.y * 2.2;
    return {
      x0: clamp(Math.floor(cx - hw) - 1, 0, W - 1),
      x1: clamp(Math.ceil(cx + hw) + 1, 0, W - 1),
      y0: clamp(Math.floor(cy - hh) - 1, 0, H - 1),
      y1: clamp(Math.ceil(cy + hh) + 1, 0, H - 1),
    };
  }
}

/* ── Drawing helpers ───────────────────────────────────────────────────── */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hash(a, b, c) {
  const h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

function sideTint(side) {
  return side === 'player' ? '#64e3bd' : '#ff7164';
}

function drawUnitIcon(ctx, type, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (type === 'inf') {
    // helmet
    ctx.beginPath();
    ctx.arc(0, -0.02, 0.13, Math.PI, 0);
    ctx.lineTo(0.17, 0.06);
    ctx.lineTo(-0.17, 0.06);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-0.2, 0.1, 0.4, 0.04);
    // rifle chevron
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    ctx.moveTo(-0.14, 0.19); ctx.lineTo(0, 0.08); ctx.lineTo(0.14, 0.19);
    ctx.stroke();
  } else if (type === 'tank') {
    ctx.beginPath();
    roundRectPath(ctx, -0.21, 0.02, 0.42, 0.18, 0.06);
    ctx.fill();
    ctx.fillRect(-0.15, -0.03, 0.3, 0.09);
    ctx.beginPath(); ctx.arc(0, -0.04, 0.11, 0, TAU); ctx.fill();
    ctx.fillRect(0.06, -0.08, 0.25, 0.045);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-0.17, 0.08, 0.06, 0.07);
    ctx.fillRect(0.11, 0.08, 0.06, 0.07);
  } else if (type === 'arty') {
    ctx.beginPath();
    roundRectPath(ctx, -0.19, 0.07, 0.38, 0.15, 0.05);
    ctx.fill();
    ctx.beginPath(); ctx.arc(-0.11, 0.16, 0.06, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(0.11, 0.16, 0.06, 0, TAU); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.moveTo(-0.03, 0.05); ctx.lineTo(0.25, -0.17); ctx.stroke();
    ctx.lineWidth = 0.033;
    ctx.beginPath(); ctx.moveTo(-0.11, 0.02); ctx.lineTo(0.07, -0.04); ctx.stroke();
  } else if (type === 'scout') {
    ctx.beginPath();
    ctx.moveTo(0.03, -0.21);
    ctx.lineTo(-0.15, 0.02);
    ctx.lineTo(-0.01, 0.02);
    ctx.lineTo(-0.06, 0.21);
    ctx.lineTo(0.17, -0.05);
    ctx.lineTo(0.01, -0.05);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
