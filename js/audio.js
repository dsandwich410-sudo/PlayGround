/* ────────────────────────────────────────────────────────────────────────
   FRONTLINE 32 — tiny procedural sound design (no external assets)
   ──────────────────────────────────────────────────────────────────────── */

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    try {
      this.enabled = localStorage.getItem('frontline32.sound') !== 'off';
    } catch { /* private mode */ }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.18 : 0;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? 0.18 : 0, this.ctx.currentTime, 0.03);
    }
    try { localStorage.setItem('frontline32.sound', this.enabled ? 'on' : 'off'); } catch { /* ignore */ }
    if (this.enabled) { this.unlock(); this.click(); }
    return this.enabled;
  }

  tone(freq, dur = 0.12, { type = 'sine', vol = 0.3, slide = 0, delay = 0 } = {}) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  noise(dur = 0.2, { vol = 0.25, cutoff = 1200, delay = 0 } = {}) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = 1 - i / len;
      data[i] = (Math.random() * 2 - 1) * env * env;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(t);
  }

  click() { this.tone(420, 0.045, { type: 'square', vol: 0.06 }); }

  move() { this.tone(180, 0.08, { type: 'triangle', vol: 0.07, slide: 40 }); }

  turn() {
    this.tone(132, 0.35, { type: 'triangle', vol: 0.16 });
    this.tone(198, 0.45, { type: 'triangle', vol: 0.12, delay: 0.12 });
  }

  enemyTurn() {
    this.tone(110, 0.4, { type: 'sawtooth', vol: 0.1, slide: -20 });
    this.tone(147, 0.5, { type: 'triangle', vol: 0.09, delay: 0.1, slide: -18 });
  }

  fx(fx) {
    if (!fx || !this.enabled) return;
    switch (fx.kind) {
      case 'attack':
        if (fx.ranged) {
          this.noise(0.36, { vol: 0.34, cutoff: 520 });
          this.tone(72, 0.4, { type: 'sine', vol: 0.28, slide: -32 });
          this.tone(240, 0.22, { type: 'triangle', vol: 0.08, slide: -150 });
        } else {
          this.noise(0.11, { vol: 0.28, cutoff: 1800 });
          this.tone(150, 0.09, { type: 'square', vol: 0.1, slide: -80 });
        }
        break;
      case 'damage':
        this.noise(0.1, { vol: 0.16, cutoff: 900 });
        this.tone(fx.counter ? 210 : 170, 0.1, { type: 'triangle', vol: 0.1, slide: -60 });
        break;
      case 'death':
        this.noise(0.45, { vol: 0.32, cutoff: 450 });
        this.tone(90, 0.5, { type: 'sine', vol: 0.24, slide: -45 });
        break;
      case 'capture':
        this.tone(392, 0.14, { type: 'triangle', vol: 0.16 });
        this.tone(523, 0.18, { type: 'triangle', vol: 0.16, delay: 0.1 });
        this.tone(659, 0.24, { type: 'triangle', vol: 0.14, delay: 0.2 });
        break;
      case 'spawn':
      case 'deploy':
        this.tone(220, 0.14, { type: 'sine', vol: 0.12, slide: 110 });
        this.noise(0.16, { vol: 0.1, cutoff: 600 });
        break;
      case 'heal':
        this.tone(523, 0.1, { type: 'sine', vol: 0.08 });
        this.tone(784, 0.16, { type: 'sine', vol: 0.07, delay: 0.08 });
        break;
      case 'move':
        this.move();
        break;
    }
  }

  victory() {
    [392, 523, 659, 784].forEach((f, i) => {
      this.tone(f, 0.34, { type: 'triangle', vol: 0.16, delay: i * 0.13 });
    });
    this.tone(196, 0.9, { type: 'sine', vol: 0.1, delay: 0.28 });
  }

  defeat() {
    [330, 262, 196, 147].forEach((f, i) => {
      this.tone(f, 0.4, { type: 'triangle', vol: 0.13, delay: i * 0.16 });
    });
    this.noise(0.7, { vol: 0.16, cutoff: 300, delay: 0.2 });
  }
}
