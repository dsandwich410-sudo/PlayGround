import { cam, clampCam } from './world.js';

/* ------------------------------------------------------------------ */
/*  Procedural audio                                                   */
/* ------------------------------------------------------------------ */

export const Sound = {
  ctx: null,
  master: null,
  muted: false,
  noiseBuffer: null,

  init() {
    if (this.ctx) {
      this.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.7);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
    } catch {
      this.ctx = null;
    }
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },

  setMuted(muted) {
    this.muted = muted;
  },

  toggle() {
    this.setMuted(!this.muted);
    return this.muted;
  },

  tone(freq, dur = 0.08, type = 'square', vol = 0.035, delay = 0, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  },

  noise(dur = 0.18, vol = 0.06, freq = 900, delay = 0) {
    if (!this.ctx || this.muted || !this.noiseBuffer) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 0.35), t0 + dur);
    filter.Q.value = 0.9;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  },

  click() { this.tone(540, 0.045, 'square', 0.025); },
  select() { this.tone(680, 0.05, 'triangle', 0.03); this.tone(940, 0.06, 'triangle', 0.018, 0.04); },
  move() { this.tone(220, 0.05, 'triangle', 0.03); this.tone(300, 0.06, 'triangle', 0.022, 0.06); },
  fire(kind) {
    if (kind === 'ART') {
      this.noise(0.2, 0.06, 500);
      this.tone(90, 0.22, 'sawtooth', 0.045, 0, -45);
    } else {
      this.noise(0.1, 0.055, 1600);
      this.tone(160, 0.12, 'square', 0.04, 0, -100);
    }
  },
  impact() { this.noise(0.24, 0.07, 420); this.tone(70, 0.2, 'sine', 0.045, 0, -30); },
  explode() { this.noise(0.4, 0.09, 320); this.tone(55, 0.35, 'sine', 0.06, 0, -25); },
  deploy() { this.tone(330, 0.08, 'square', 0.03); this.tone(495, 0.1, 'square', 0.028, 0.08); this.tone(660, 0.14, 'triangle', 0.03, 0.17); },
  capture() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.045, i * 0.09)); },
  turn() { this.tone(300, 0.1, 'square', 0.025); this.tone(225, 0.14, 'square', 0.022, 0.12); },
  victory() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.05, i * 0.14)); },
  defeat() { [330, 277, 220, 165].forEach((f, i) => this.tone(f, 0.34, 'sawtooth', 0.035, i * 0.16)); },
};

/* ------------------------------------------------------------------ */
/*  Tilt camera                                                        */
/* ------------------------------------------------------------------ */

export const Tilt = {
  enabled: false,
  supported: typeof window !== 'undefined' && 'DeviceOrientationEvent' in window,
  base: null,
  tx: 0,
  ty: 0,
  vx: 0,
  vy: 0,
  samples: 0,
  sumX: 0,
  sumY: 0,
  got: false,
  onState: null,
  onMessage: null,
  _handler: null,
  _check: 0,

  calibrate() {
    this.base = null;
    this.samples = 0;
    this.sumX = 0;
    this.sumY = 0;
    this.vx = 0;
    this.vy = 0;
  },

  async toggle() {
    if (this.enabled) {
      this.disable();
      this.onMessage?.('TILT PAN OFF');
      return false;
    }
    return this.enable();
  },

  async enable() {
    if (!this.supported) {
      this.onMessage?.('NO TILT SENSOR · DRAG TO PAN');
      return false;
    }
    try {
      if (typeof DeviceOrientationEvent !== 'undefined'
        && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') {
          this.onMessage?.('MOTION ACCESS DENIED · CHECK SETTINGS');
          return false;
        }
      }
    } catch {
      this.onMessage?.('MOTION ACCESS UNAVAILABLE');
      return false;
    }

    this.enabled = true;
    this.got = false;
    this.calibrate();
    if (!this._handler) this._handler = (e) => this.handle(e);
    window.addEventListener('deviceorientation', this._handler, true);
    this.onState?.(true);
    this.onMessage?.('TILT PAN ACTIVE · LEAN TO SURVEY');
    clearTimeout(this._check);
    this._check = setTimeout(() => {
      if (this.enabled && !this.got) {
        this.disable();
        this.onMessage?.('NO TILT DATA · USE DRAG TO PAN');
      }
    }, 2400);
    return true;
  },

  disable() {
    this.enabled = false;
    if (this._handler) window.removeEventListener('deviceorientation', this._handler, true);
    this.base = null;
    this.vx = 0;
    this.vy = 0;
    clearTimeout(this._check);
    this.onState?.(false);
  },

  handle(e) {
    if (!this.enabled) return;
    if (e.gamma == null && e.beta == null) return;
    this.got = true;
    const gamma = e.gamma || 0;
    const beta = e.beta || 0;
    const angle = (screen.orientation && screen.orientation.angle != null)
      ? screen.orientation.angle
      : (window.orientation || 0);
    let x;
    let y;
    if (angle === 90) { x = beta; y = -gamma; }
    else if (angle === -90 || angle === 270) { x = -beta; y = gamma; }
    else if (angle === 180) { x = -gamma; y = -beta; }
    else { x = gamma; y = beta; }
    this.tx = x;
    this.ty = y;
    if (this.base === null) {
      this.sumX += x;
      this.sumY += y;
      this.samples++;
      if (this.samples >= 5) {
        this.base = { x: this.sumX / this.samples, y: this.sumY / this.samples };
      }
    }
  },

  update(dt) {
    if (!this.enabled || !this.base) return;
    const dead = (v) => (Math.abs(v) < 2.5 ? 0 : v - Math.sign(v) * 2.5);
    const dx = dead(this.tx - this.base.x);
    const dy = dead(this.ty - this.base.y);
    const targetVx = dx * 0.115;
    const targetVy = dy * 0.115;
    const k = Math.min(1, dt * 5);
    this.vx += (targetVx - this.vx) * k;
    this.vy += (targetVy - this.vy) * k;
    cam.cx += this.vx * dt;
    cam.cy += this.vy * dt;
    clampCam();
  },
};
