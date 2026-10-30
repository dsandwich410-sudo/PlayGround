// Tiny procedural sound engine: zero assets, everything synthesized on demand.
export class Sfx {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.ambient = null;
    this.lastTap = 0;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 16;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.22;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? 0.42 : 0;
    this.master.connect(compressor);
    compressor.connect(this.ctx.destination);

    const length = Math.floor(this.ctx.sampleRate * 1.2);
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    this.startAmbient();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master && this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(on ? 0.42 : 0, t, 0.05);
    }
    if (on) this.unlock();
  }

  get t() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  tone({ freq, to, dur = 0.15, type = 'sine', gain = 0.15, delay = 0, attack = 0.006 }) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.t + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  noise({ dur = 0.12, gain = 0.1, freq = 1200, q = 0.8, type = 'highpass', delay = 0, toFreq = null }) {
    if (!this.ctx || !this.enabled || !this.noiseBuffer) return;
    const t0 = this.t + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1 + Math.random() * 0.12;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t0);
    if (toFreq) filter.frequency.exponentialRampToValueAtTime(Math.max(40, toFreq), t0 + dur);
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  tap(combo = 0, crit = false, black = false) {
    if (!this.ctx) return;
    const now = performance.now();
    if (now - this.lastTap < 26 && !black) return;
    this.lastTap = now;
    const pitch = 150 + Math.min(combo, 60) * 2.4;
    this.noise({ dur: 0.055, gain: 0.09, freq: 1900 + Math.min(combo, 40) * 30, type: 'highpass' });
    this.tone({ freq: pitch, to: 68, dur: 0.09, type: 'sine', gain: 0.16 });
    if (crit) {
      this.tone({ freq: 920, to: 1500, dur: 0.1, type: 'triangle', gain: 0.06 });
      this.noise({ dur: 0.16, gain: 0.05, freq: 3200, type: 'bandpass', q: 2.2 });
    }
    if (black) {
      this.tone({ freq: 78, to: 34, dur: 0.5, type: 'sine', gain: 0.42 });
      this.tone({ freq: 155, to: 62, dur: 0.34, type: 'sawtooth', gain: 0.09 });
      this.noise({ dur: 0.36, gain: 0.16, freq: 520, type: 'bandpass', q: 0.8, toFreq: 120 });
      this.noise({ dur: 0.2, gain: 0.08, freq: 4200, type: 'highpass', delay: 0.02 });
    }
  }

  kill() {
    this.tone({ freq: 330, to: 660, dur: 0.14, type: 'triangle', gain: 0.1 });
    this.tone({ freq: 495, to: 990, dur: 0.18, type: 'sine', gain: 0.08, delay: 0.05 });
    this.noise({ dur: 0.26, gain: 0.1, freq: 700, type: 'bandpass', q: 0.7, toFreq: 180 });
  }

  domain() {
    if (!this.ctx) return;
    this.noise({ dur: 1.1, gain: 0.18, freq: 90, type: 'lowpass', toFreq: 1400 });
    this.noise({ dur: 0.4, gain: 0.1, freq: 5000, type: 'highpass', delay: 0.7 });
    this.tone({ freq: 70, to: 200, dur: 1.05, type: 'sawtooth', gain: 0.13 });
    this.tone({ freq: 110, to: 330, dur: 1.2, type: 'sine', gain: 0.12 });
    for (const [f, g] of [[220, 0.06], [330, 0.05], [440, 0.045], [660, 0.03]]) {
      this.tone({ freq: f, dur: 2.2, type: 'sine', gain: g, delay: 0.28, attack: 0.18 });
    }
    this.tone({ freq: 52, to: 28, dur: 1.6, type: 'sine', gain: 0.4, delay: 0.05 });
  }

  domainEnd() {
    this.tone({ freq: 240, to: 60, dur: 0.7, type: 'sine', gain: 0.12 });
    this.noise({ dur: 0.7, gain: 0.08, freq: 2400, type: 'highpass', toFreq: 300 });
  }

  buy() {
    this.tone({ freq: 620, dur: 0.09, type: 'triangle', gain: 0.08 });
    this.tone({ freq: 930, dur: 0.12, type: 'triangle', gain: 0.07, delay: 0.06 });
    this.noise({ dur: 0.08, gain: 0.03, freq: 2600, type: 'highpass' });
  }

  deny() {
    this.tone({ freq: 128, to: 96, dur: 0.13, type: 'square', gain: 0.05 });
  }

  ui() {
    this.tone({ freq: 520, to: 620, dur: 0.07, type: 'sine', gain: 0.06 });
  }

  startAmbient() {
    if (!this.ctx || this.ambient) return;
    const t = this.t;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.026, t + 2.4);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 210;
    filter.Q.value = 2.2;

    const a = this.ctx.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = 55;
    const b = this.ctx.createOscillator();
    b.type = 'sine';
    b.frequency.value = 82.4;
    const c = this.ctx.createOscillator();
    c.type = 'sine';
    c.frequency.value = 110;
    const cg = this.ctx.createGain();
    cg.gain.value = 0.42;

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 60;
    lfo.connect(lfoGain).connect(filter.frequency);

    a.connect(filter);
    b.connect(filter);
    c.connect(cg).connect(filter);
    filter.connect(gain).connect(this.master);
    a.start(t);
    b.start(t);
    c.start(t);
    lfo.start(t);
    this.ambient = { a, b, c, lfo, gain, filter };
  }
}
