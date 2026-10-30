/* ================================================================
   Mochi's Room
   A self-contained pocket-cat simulator for phones and tablets.
   ================================================================ */

(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const STORAGE_KEY = "mochi-room-v1";
  const DEFAULTS = {
    name: "Mochi",
    hunger: 78,
    happiness: 82,
    energy: 74,
    clean: 88,
    xp: 0,
    level: 1,
    muted: false,
    seenCoach: false,
    petCount: 0,
    careCount: 0,
    createdAt: Date.now(),
    lastSeen: Date.now(),
  };

  const NEED_KEYS = ["hunger", "happiness", "energy", "clean"];
  const NEED_LABELS = {
    hunger: "fullness",
    happiness: "happiness",
    energy: "energy",
    clean: "cleanliness",
  };

  /* ----------------------------------------------------------------
     Elements
     ---------------------------------------------------------------- */
  const app = $("#app");
  const scene = $("#scene");
  const catWrap = $("#catWrap");
  const catAnchor = $("#catAnchor");
  const particles = $("#particles");
  const moodBubble = $("#moodBubble");
  const bubbleText = $("#bubbleText");
  const bubbleIcon = $("#bubbleIcon");
  const toasts = $("#toasts");
  const bowl = $("#bowl");
  const brush = $("#brush");
  const featherToy = $("#featherToy");
  const ball = $("#ball");
  const napBtn = $("#napBtn");
  const tiltBtn = $("#tiltBtn");
  const soundBtn = $("#soundBtn");
  const helpBtn = $("#helpBtn");
  const helpSheet = $("#helpSheet");
  const closeHelp = $("#closeHelp");
  const soundRow = $("#soundRow");
  const resetBtn = $("#resetBtn");
  const intro = $("#intro");
  const startBtn = $("#startBtn");
  const nameInput = $("#nameInput");
  const levelNum = $("#levelNum");
  const xpFill = $("#xpFill");
  const clockHour = $("#clockHour");
  const clockMinute = $("#clockMinute");
  const needEls = new Map(NEED_KEYS.map((key) => [key, $(`[data-need="${key}"]`)]));
  const actionEls = new Map($$("[data-action]").map((el) => [el.dataset.action, el]));

  /* ----------------------------------------------------------------
     Sound — tiny synthesized kitty noises, no assets needed
     ---------------------------------------------------------------- */
  class SoundKit {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.muted = false;
      this.purr = null;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume();
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      try {
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.72;
        this.master.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
      }
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(muted ? 0 : 0.72, this.ctx.currentTime, 0.03);
      }
    }

    get ready() {
      return Boolean(this.ctx && this.master && !this.muted);
    }

    tone(freq, to, duration, { type = "sine", gain = 0.1, delay = 0 } = {}) {
      if (!this.ready) return;
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (to && to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(gain, t + 0.015);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(amp);
      amp.connect(this.master);
      osc.start(t);
      osc.stop(t + duration + 0.03);
    }

    noise(duration, { freq = 900, q = 1, gain = 0.06, delay = 0 } = {}) {
      if (!this.ready) return;
      const rate = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, Math.max(1, rate * duration), rate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = freq;
      filter.Q.value = q;
      const amp = this.ctx.createGain();
      const t = this.ctx.currentTime + delay;
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(gain, t + 0.02);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      source.connect(filter);
      filter.connect(amp);
      amp.connect(this.master);
      source.start(t);
    }

    meow() {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1800;
      osc.type = "sawtooth";
      osc2.type = "triangle";
      osc.frequency.setValueAtTime(430, t);
      osc.frequency.exponentialRampToValueAtTime(760, t + 0.1);
      osc.frequency.exponentialRampToValueAtTime(530, t + 0.32);
      osc2.frequency.setValueAtTime(433, t);
      osc2.frequency.exponentialRampToValueAtTime(770, t + 0.1);
      osc2.frequency.exponentialRampToValueAtTime(540, t + 0.32);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.08, t + 0.04);
      amp.gain.setValueAtTime(0.08, t + 0.17);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(amp);
      amp.connect(this.master);
      osc.start(t);
      osc2.start(t);
      osc.stop(t + 0.44);
      osc2.stop(t + 0.44);
    }

    purrStart() {
      if (!this.ready || this.purr) return;
      const rate = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, rate * 2, rate);
      const data = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i += 1) {
        last = (last + (Math.random() * 2 - 1) * 0.06) * 0.985;
        data[i] = last;
      }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 210;
      const amp = this.ctx.createGain();
      amp.gain.value = 0.0001;
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 24;
      lfoGain.gain.value = 0.03;
      lfo.connect(lfoGain);
      lfoGain.connect(amp.gain);
      source.connect(filter);
      filter.connect(amp);
      amp.connect(this.master);
      const t = this.ctx.currentTime;
      amp.gain.setTargetAtTime(0.05, t, 0.08);
      source.start(t);
      lfo.start(t);
      this.purr = { source, lfo, amp };
    }

    purrStop() {
      if (!this.purr || !this.ctx) return;
      const { source, lfo, amp } = this.purr;
      this.purr = null;
      const t = this.ctx.currentTime;
      amp.gain.cancelScheduledValues(t);
      amp.gain.setTargetAtTime(0.0001, t, 0.08);
      source.stop(t + 0.4);
      lfo.stop(t + 0.4);
    }

    pop() {
      this.tone(620, 940, 0.1, { type: "sine", gain: 0.05 });
    }

    chime() {
      [523.25, 659.25, 783.99].forEach((freq, i) => {
        this.tone(freq, freq, 0.32, { type: "triangle", gain: 0.045, delay: i * 0.08 });
      });
    }

    levelUp() {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        this.tone(freq, freq, 0.45, { type: "triangle", gain: 0.06, delay: i * 0.09 });
      });
    }

    crunch() {
      this.noise(0.09, { freq: 1500, q: 0.8, gain: 0.08 });
      this.noise(0.08, { freq: 1100, q: 0.7, gain: 0.06, delay: 0.14 });
      this.noise(0.07, { freq: 1300, q: 0.8, gain: 0.05, delay: 0.3 });
    }

    brush() {
      this.noise(0.22, { freq: 2400, q: 0.6, gain: 0.025 });
    }

    sleepy() {
      this.tone(392, 261.63, 0.8, { type: "sine", gain: 0.04 });
      this.tone(261.63, 196, 1.1, { type: "sine", gain: 0.03, delay: 0.35 });
    }

    wake() {
      [392, 523.25, 659.25].forEach((freq, i) => {
        this.tone(freq, freq, 0.3, { type: "sine", gain: 0.035, delay: i * 0.1 });
      });
    }
  }

  const sounds = new SoundKit();

  /* ----------------------------------------------------------------
     State
     ---------------------------------------------------------------- */
  let state = loadState();
  let started = false;
  let sleeping = false;
  let playing = false;
  let petting = false;
  let petSessionXp = 0;
  let lastTick = Date.now();
  let lastSave = Date.now();
  let bubbleTimer = null;
  let poseTimer = null;
  let bowlTimer = null;
  let playTimer = null;
  let groomTimer = null;
  let sparkleTimer = null;
  let zzzTimer = null;
  let resetArmed = false;
  let resetTimer = null;
  let offlineNote = "";

  function loadState() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") || {};
    } catch {
      saved = {};
    }
    const next = { ...DEFAULTS, ...saved };
    next.name = cleanName(next.name);
    NEED_KEYS.forEach((key) => {
      next[key] = clamp(Number.isFinite(+next[key]) ? +next[key] : DEFAULTS[key], 0, 100);
    });
    next.level = clamp(Math.round(+next.level || 1), 1, 99);
    next.xp = Math.max(0, +next.xp || 0);
    next.muted = Boolean(next.muted);
    next.seenCoach = Boolean(next.seenCoach);

    if (saved.lastSeen) {
      const minutes = clamp((Date.now() - +saved.lastSeen) / 60000, 0, 10080);
      if (minutes > 18) {
        const before = NEED_KEYS.map((key) => next[key]);
        next.hunger = clamp(next.hunger - Math.min(minutes * 0.1, 32), 0, 100);
        next.happiness = clamp(next.happiness - Math.min(minutes * 0.07, 24), 0, 100);
        next.energy = clamp(next.energy - Math.min(minutes * 0.05, 18), 0, 100);
        next.clean = clamp(next.clean - Math.min(minutes * 0.06, 20), 0, 100);
        if (NEED_KEYS.some((key, i) => before[i] - next[key] > 6)) {
          offlineNote = "Mochi missed you — a little snack would be lovely.";
        }
      }
    }
    return next;
  }

  function cleanName(value) {
    const name = String(value ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 12);
    return name || "Mochi";
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...state, lastSeen: Date.now() })
      );
      lastSave = Date.now();
    } catch {
      /* private mode / storage full — the game still works */
    }
  }

  function xpNeeded(level = state.level) {
    return 45 + (level - 1) * 40;
  }

  function awardXp(amount) {
    state.xp += Math.max(0, amount);
    let leveled = false;
    while (state.xp >= xpNeeded()) {
      state.xp -= xpNeeded();
      state.level += 1;
      leveled = true;
    }
    if (leveled) {
      renderHeader();
      renderAccessories();
      sounds.levelUp();
      burstConfetti();
      const unlock =
        state.level === 2 ? " A daisy appeared!" :
        state.level === 4 ? " A bow appeared!" :
        state.level === 6 ? " A tiny crown appeared!" : "";
      showBubble(`${state.name} is level ${state.level}!${unlock}`, "i-sparkle", 4200);
      toast(`Level ${state.level}!${unlock}`, "gold", "i-sparkle");
      vibrate([12, 40, 18]);
    }
    renderHeader();
    return leveled;
  }

  /* ----------------------------------------------------------------
     Rendering
     ---------------------------------------------------------------- */
  function renderAll() {
    renderName();
    renderHeader();
    renderStats();
    renderAccessories();
    renderSleep();
    renderTilt();
    renderSound();
    updateAlerts();
  }

  function renderName() {
    $$(".js-name").forEach((el) => { el.textContent = state.name; });
    $(".cat-svg")?.setAttribute("aria-label", `${state.name} the cat`);
    nameInput.value = state.name;
    const feed = actionEls.get("feed");
    const play = actionEls.get("play");
    const groom = actionEls.get("groom");
    if (feed) feed.setAttribute("aria-label", `Feed ${state.name}`);
    if (play) play.setAttribute("aria-label", `Play with ${state.name}`);
    if (groom) groom.setAttribute("aria-label", `Brush ${state.name}`);
  }

  function renderHeader() {
    levelNum.textContent = String(state.level);
    xpFill.style.width = `${clamp((state.xp / xpNeeded()) * 100, 0, 100)}%`;
  }

  function renderStats() {
    NEED_KEYS.forEach((key) => {
      const el = needEls.get(key);
      if (!el) return;
      const value = clamp(state[key], 0, 100);
      const rounded = Math.round(value);
      const valueEl = $("[data-val]", el);
      const bar = $(".need-bar i", el);
      if (valueEl) valueEl.textContent = String(rounded);
      if (bar) bar.style.width = `${value}%`;
      el.classList.toggle("is-low", value < 26);
      el.setAttribute("aria-label", `${NEED_LABELS[key]} ${rounded} percent`);
      el.setAttribute("role", "meter");
      el.setAttribute("aria-valuemin", "0");
      el.setAttribute("aria-valuemax", "100");
      el.setAttribute("aria-valuenow", String(rounded));
    });
    catWrap.classList.toggle("dirty", state.clean < 38);
  }

  function renderAccessories() {
    catWrap.classList.toggle("show-flower", state.level >= 2);
    catWrap.classList.toggle("show-bow", state.level >= 4);
    catWrap.classList.toggle("show-crown", state.level >= 6);
  }

  function renderSleep() {
    scene.classList.toggle("sleeping", sleeping);
    napBtn.classList.toggle("is-sleeping", sleeping);
    const label = $(".action-label", napBtn);
    if (label) label.textContent = sleeping ? "Wake" : "Nap";
    napBtn.setAttribute("aria-label", sleeping ? `Wake ${state.name}` : `Let ${state.name} nap`);
    napBtn.setAttribute("aria-pressed", sleeping ? "true" : "false");
  }

  function renderTilt() {
    scene.classList.toggle("tilt-on", tiltOn);
    tiltBtn.setAttribute("aria-pressed", tiltOn ? "true" : "false");
    tiltBtn.setAttribute("aria-label", tiltOn ? "Turn off motion tilt" : "Turn on motion tilt for the toy");
  }

  function renderSound() {
    soundBtn.setAttribute("aria-pressed", state.muted ? "true" : "false");
    soundBtn.setAttribute("aria-label", state.muted ? "Unmute sound" : "Mute sound");
    soundRow.setAttribute("aria-pressed", state.muted ? "false" : "true");
  }

  function updateAlerts() {
    const flags = {
      feed: state.hunger < 32,
      play: state.happiness < 32,
      groom: state.clean < 32,
      sleep: state.energy < 24,
    };
    actionEls.forEach((el, action) => {
      el.classList.toggle("alert", Boolean(flags[action]));
    });
  }

  function pose(name, duration = 0) {
    catWrap.dataset.pose = name;
    clearTimeout(poseTimer);
    if (duration > 0) {
      poseTimer = setTimeout(() => {
        if (!sleeping) catWrap.dataset.pose = "idle";
      }, duration);
    }
  }

  /* ----------------------------------------------------------------
     Bubble, toasts, particles
     ---------------------------------------------------------------- */
  function showBubble(text, icon = "i-heart", duration = 2800) {
    bubbleText.textContent = text;
    if (icon) {
      bubbleIcon.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${icon}"></use></svg>`;
    } else {
      bubbleIcon.innerHTML = "";
    }
    moodBubble.classList.add("show");
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => moodBubble.classList.remove("show"), duration);
  }

  function toast(text, tone = "", icon = "i-check") {
    const el = document.createElement("div");
    el.className = `toast ${tone}`.trim();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", `#${icon}`);
    svg.append(use);
    const span = document.createElement("span");
    span.textContent = text;
    el.append(svg, span);
    toasts.append(el);
    while (toasts.children.length > 2) toasts.firstElementChild.remove();
    setTimeout(() => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 340);
    }, 2500);
  }

  function scenePoint(clientX, clientY) {
    const rect = scene.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top, w: rect.width, h: rect.height };
  }

  function catCenter() {
    const rect = $(".cat-svg").getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height * 0.3, w: rect.width, h: rect.height };
  }

  function makeParticle(kind, x, y, size, content, color) {
    const el = document.createElement("span");
    el.className = `particle ${kind}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    if (color) el.style.background = color;
    if (content) el.innerHTML = content;
    particles.append(el);
    return el;
  }

  function heartBurst(clientX, clientY, count = 5, source = "pet") {
    const point = scenePoint(clientX, clientY);
    const body = catCenter();
    const cx = Number.isFinite(point.x) ? point.x : body.x;
    const cy = Number.isFinite(point.y) ? point.y : body.y;
    for (let i = 0; i < count; i += 1) {
      const size = rand(14, 25);
      const el = makeParticle(
        "heart",
        cx + rand(-34, 34),
        cy + rand(-14, 18),
        size,
        `<svg viewBox="0 0 24 24"><path d="M12 20.4S3.7 15.7 3.7 9.9c0-2.8 2.1-4.8 4.7-4.8 1.7 0 3 .9 3.6 2.1.6-1.2 1.9-2.1 3.6-2.1 2.6 0 4.7 2 4.7 4.8 0 5.8-8.3 10.5-8.3 10.5Z"/></svg>`
      );
      const dx = rand(-52, 52);
      const dy = rand(-90, -46);
      const rot = rand(-24, 24);
      const duration = reduceMotion ? 450 : rand(850, 1350);
      el.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.25)", opacity: 0 },
          { transform: "translate(-50%, -50%) scale(1)", opacity: 1, offset: 0.14 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.75) rotate(${rot}deg)`, opacity: 0 },
        ],
        { duration, easing: "cubic-bezier(.18,.7,.35,1)" }
      ).onfinish = () => el.remove();
    }
    if (source === "pet") sounds.pop();
  }

  function sparkleBurst(clientX, clientY, count = 6, color = "#ffd15c") {
    const point = scenePoint(clientX, clientY);
    for (let i = 0; i < count; i += 1) {
      const size = rand(10, 19);
      const el = makeParticle(
        "star",
        point.x + rand(-30, 30),
        point.y + rand(-22, 22),
        size,
        `<svg viewBox="0 0 24 24"><path d="M12 2.8c.6 4.8 1.8 6.4 6.7 7.2-4.9.8-6.1 2.4-6.7 7.2-.6-4.8-1.8-6.4-6.7-7.2 4.9-.8 6.1-2.4 6.7-7.2Z"/></svg>`
      );
      el.style.color = color;
      const dx = rand(-40, 40);
      const dy = rand(-46, 30);
      const duration = reduceMotion ? 400 : rand(650, 1050);
      el.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.2) rotate(0deg)", opacity: 0 },
          { transform: "translate(-50%, -50%) scale(1.1) rotate(35deg)", opacity: 1, offset: 0.25 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4) rotate(95deg)`, opacity: 0 },
        ],
        { duration, easing: "cubic-bezier(.2,.7,.3,1)" }
      ).onfinish = () => el.remove();
    }
  }

  function spawnZzz() {
    if (!sleeping) return;
    const body = catCenter();
    const make = (offsetX, offsetY, delay, small) => {
      if (!sleeping) return;
      const el = makeParticle("zzz", body.x + body.w * 0.24 + offsetX, body.y - body.h * 0.06 + offsetY, 24, "z");
      el.style.fontSize = `${small ? rand(14, 18) : rand(22, 30)}px`;
      const dx = rand(16, 46);
      const dy = rand(-88, -126);
      el.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.4) rotate(-10deg)", opacity: 0 },
          { transform: "translate(-50%, -50%) scale(1) rotate(4deg)", opacity: 0.92, offset: 0.18 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.8) rotate(14deg)`, opacity: 0 },
        ],
        { duration: rand(2200, 3100), easing: "ease-out", delay }
      ).onfinish = () => el.remove();
    };
    make(0, 0, 0, false);
    make(18, 14, 420, true);
  }

  function burstConfetti() {
    const colors = ["#f4b54a", "#f18ea1", "#7fc3b6", "#8c7ab8", "#ff8f6d"];
    const center = catCenter();
    for (let i = 0; i < 26; i += 1) {
      const el = makeParticle(
        "confetti",
        center.x + rand(-70, 70),
        center.y - 60 + rand(-30, 30),
        rand(5, 9),
        "",
        pick(colors)
      );
      const dx = rand(-130, 130);
      const dy = rand(-120, 90);
      el.animate(
        [
          { transform: "translate(-50%, -50%) scale(0.4) rotate(0deg)", opacity: 0 },
          { transform: "translate(-50%, -50%) scale(1) rotate(40deg)", opacity: 1, offset: 0.15 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.7) rotate(240deg)`, opacity: 0 },
        ],
        { duration: rand(900, 1600), easing: "cubic-bezier(.2,.7,.3,1)" }
      ).onfinish = () => el.remove();
    }
  }

  function sparkleBurstFromElement(element, count = 4) {
    const rect = element.getBoundingClientRect();
    if (!rect.width) return;
    sparkleBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, count, "#bdf3ea");
  }

  function crumbsFromBowl() {
    const rect = bowl.getBoundingClientRect();
    if (!rect.width) return;
    sparkleBurst(rect.left + rect.width / 2, rect.top + rect.height * 0.45, 4, "#c58c5c");
  }

  /* ----------------------------------------------------------------
     Game tick
     ---------------------------------------------------------------- */
  function tick() {
    if (!started) return;
    const now = Date.now();
    const dt = clamp((now - lastTick) / 1000, 0, 2);
    lastTick = now;

    if (sleeping) {
      state.energy = clamp(state.energy + 4.2 * dt, 0, 100);
      state.hunger = clamp(state.hunger - 0.035 * dt, 0, 100);
      if (state.energy >= 100) {
        wakeUp(true);
      }
    } else {
      state.hunger = clamp(state.hunger - 0.085 * dt, 0, 100);
      state.happiness = clamp(state.happiness - 0.07 * dt, 0, 100);
      state.energy = clamp(state.energy - 0.055 * dt, 0, 100);
      state.clean = clamp(state.clean - 0.045 * dt, 0, 100);
      if (playing) {
        state.happiness = clamp(state.happiness + 0.035 * dt, 0, 100);
      }
    }

    renderStats();
    updateAlerts();
    if (now - lastSave > 6500) saveState();
  }

  setInterval(tick, 1000);

  function nudge() {
    if (!started || sleeping) return;
    if (moodBubble.classList.contains("show")) return;
    if (state.hunger < 22) showBubble("Tummy rumbling…", "i-fish", 3800);
    else if (state.energy < 20) showBubble("So sleepy…", "i-bolt", 3800);
    else if (state.clean < 22) showBubble("A little dusty…", "i-sparkle", 3800);
    else if (state.happiness < 22) showBubble("Play with me?", "i-heart", 3800);
  }

  setInterval(nudge, 24000);

  /* ----------------------------------------------------------------
     Care actions
     ---------------------------------------------------------------- */
  function feed() {
    if (sleeping) wakeUp();
    if (state.hunger >= 97) {
      showBubble("Too full for snacks!", "i-fish", 2600);
      sounds.pop();
      return;
    }
    const before = state.hunger;
    state.hunger = clamp(state.hunger + 30, 0, 100);
    state.happiness = clamp(state.happiness + 5, 0, 100);
    state.clean = clamp(state.clean - 1.5, 0, 100);
    state.careCount += 1;
    awardXp(12);
    pose("eat", 2800);
    bowl.classList.add("show");
    clearTimeout(bowlTimer);
    bowlTimer = setTimeout(() => bowl.classList.remove("show"), 2900);
    showBubble(pick(["Yum yum!", "Crunch crunch!", "More please?"]), "i-fish", 2400);
    toast(`Snack time · +${Math.round(state.hunger - before)} fullness`, "", "i-bowl");
    sounds.crunch();
    setTimeout(crumbsFromBowl, 480);
    vibrate(10);
    renderStats();
    updateAlerts();
    saveState();
  }

  function startPlay() {
    if (sleeping) wakeUp();
    if (playing) {
      showBubble("Wheee!", "i-feather", 1400);
      return;
    }
    if (state.energy < 12) {
      showBubble("Too sleepy to play…", "i-bolt", 2800);
      sounds.pop();
      return;
    }
    playing = true;
    state.energy = clamp(state.energy - 8, 0, 100);
    state.happiness = clamp(state.happiness + 18, 0, 100);
    state.clean = clamp(state.clean - 2, 0, 100);
    state.careCount += 1;
    awardXp(15);
    scene.classList.add("playing");
    pose("play");
    const rect = catAnchor.getBoundingClientRect();
    featherToy.style.left = `${rect.width * 0.68}px`;
    featherToy.style.top = `${rect.height * 0.12}px`;
    showBubble("Catch the feather!", "i-feather", 2200);
    toast("Tap the room to make the feather fly", "", "i-feather");
    sounds.pop();
    vibrate(8);
    clearTimeout(playTimer);
    playTimer = setTimeout(endPlay, 14000);
    renderStats();
    updateAlerts();
    saveState();
  }

  function endPlay() {
    if (!playing) return;
    playing = false;
    clearTimeout(playTimer);
    scene.classList.remove("playing");
    if (!sleeping) pose("happy", 1300);
    state.happiness = clamp(state.happiness + 4, 0, 100);
    showBubble("That was fun!", "i-heart", 1900);
    renderStats();
    saveState();
  }

  function pounce(clientX, clientY) {
    if (!playing) return;
    const rect = catAnchor.getBoundingClientRect();
    featherToy.style.left = `${clientX - rect.left}px`;
    featherToy.style.top = `${clientY - rect.top}px`;
    state.happiness = clamp(state.happiness + 1.4, 0, 100);
    awardXp(0.5);
    heartBurst(clientX, clientY, 2);
    sparkleBurst(clientX, clientY, 3, "#7fc3b6");
    if (!reduceMotion) {
      catWrap.animate(
        [
          { transform: "translateY(0) scale(1, 1)" },
          { transform: "translateY(-11px) scale(1.02, 0.98)", offset: 0.35 },
          { transform: "translateY(1px) scale(0.99, 1.01)", offset: 0.7 },
          { transform: "translateY(0) scale(1, 1)" },
        ],
        { duration: 420, easing: "cubic-bezier(.3,1.4,.5,1)" }
      );
    }
    sounds.tone(720, 980, 0.09, { type: "sine", gain: 0.04 });
    renderStats();
  }

  function groom() {
    if (sleeping) wakeUp();
    if (state.clean >= 97) {
      showBubble("Already fluffy!", "i-sparkle", 2400);
      sounds.pop();
      return;
    }
    state.clean = clamp(state.clean + 32, 0, 100);
    state.happiness = clamp(state.happiness + 5, 0, 100);
    state.careCount += 1;
    awardXp(10);
    scene.classList.add("grooming");
    pose("groom", 3200);
    showBubble(pick(["So shiny!", "Purrfect.", "Fluffy again!"]), "i-sparkle", 2400);
    toast("Brushed and fluffy", "", "i-sparkle");
    sounds.brush();
    clearInterval(sparkleTimer);
    clearTimeout(groomTimer);
    let pulses = 0;
    sparkleTimer = setInterval(() => {
      const center = catCenter();
      sparkleBurst(center.x + rand(-60, 60), center.y + rand(-20, 70), 2, pick(["#ffd15c", "#fff4cf", "#f7a9a5"]));
      pulses += 1;
      if (pulses > 8) clearInterval(sparkleTimer);
    }, 260);
    groomTimer = setTimeout(() => {
      scene.classList.remove("grooming");
      if (!sleeping) pose("idle");
    }, 3200);
    vibrate(8);
    renderStats();
    updateAlerts();
    saveState();
  }

  function nap() {
    if (sleeping) {
      wakeUp();
      return;
    }
    if (state.energy >= 98) {
      showBubble("Not sleepy yet!", "i-bolt", 2400);
      sounds.pop();
      return;
    }
    if (playing) endPlay();
    sleeping = true;
    lastTick = Date.now();
    renderSleep();
    pose("sleep");
    showBubble("Zzz…", "i-moon", 2600);
    toast("Naptime · energy is refilling", "", "i-moon");
    sounds.sleepy();
    vibrate(6);
    clearInterval(zzzTimer);
    zzzTimer = setInterval(spawnZzz, 1500);
    setTimeout(spawnZzz, 300);
    saveState();
  }

  function wakeUp(auto = false) {
    if (!sleeping) return;
    sleeping = false;
    clearInterval(zzzTimer);
    renderSleep();
    if (!auto) pose("happy", 1400);
    else pose("happy", 1200);
    showBubble(auto ? "All rested!" : "Mornin'!", "i-sun", 2200);
    sounds.wake();
    if (auto) toast("Mochi woke up full of beans", "teal", "i-sun");
    renderStats();
    updateAlerts();
    saveState();
  }

  function tapCat(clientX, clientY) {
    if (sleeping) {
      wakeUp();
      return;
    }
    state.happiness = clamp(state.happiness + 1.8, 0, 100);
    state.petCount += 1;
    awardXp(0.8);
    pose("happy", 1300);
    sounds.meow();
    heartBurst(clientX, clientY, 3);
    showBubble(pick(["Mrrp!", "Purrr…", "Hi human!", "Prrrp?", "That's the spot."]), "i-heart", 1900);
    vibrate(8);
    markCoachSeen();
    renderStats();
  }

  /* ----------------------------------------------------------------
     Petting
     ---------------------------------------------------------------- */
  let petLast = { x: 0, y: 0 };
  let petTravel = 0;
  let petTotal = 0;
  let petPointerId = null;
  let lastHaptic = 0;

  function beginPet(event) {
    if (event.button !== undefined && event.button > 0) return;
    if (sleeping) {
      wakeUp();
      return;
    }
    petting = true;
    petPointerId = event.pointerId;
    petSessionXp = 0;
    petTravel = 0;
    petTotal = 0;
    petLast = { x: event.clientX, y: event.clientY };
    pose("pet", 1800);
    sounds.purrStart();
    markCoachSeen();
    event.preventDefault();
  }

  function movePet(event) {
    if (!petting || event.pointerId !== petPointerId) return;
    const dx = event.clientX - petLast.x;
    const dy = event.clientY - petLast.y;
    const dist = Math.hypot(dx, dy);
    petLast = { x: event.clientX, y: event.clientY };
    petTravel += dist;
    petTotal += dist;
    if (dist < 1) return;
    if (petTravel > 22) {
      petTravel = 0;
      state.happiness = clamp(state.happiness + 0.55, 0, 100);
      if (petSessionXp < 12) {
        awardXp(0.4);
        petSessionXp += 0.4;
      }
      heartBurst(event.clientX, event.clientY, 1);
      pose("pet", 1800);
      const now = performance.now();
      if (now - lastHaptic > 240) {
        vibrate(6);
        lastHaptic = now;
      }
      renderStats();
    }
  }

  function endPet(event) {
    if (!petting || event.pointerId !== petPointerId) return;
    petting = false;
    petPointerId = null;
    sounds.purrStop();
    if (petTotal < 14) {
      tapCat(event.clientX, event.clientY);
    } else {
      state.petCount += 1;
      showBubble(pick(["Purrrr…", "More pets, please.", "Best human."]), "i-heart", 1700);
      saveState();
    }
    if (!sleeping) pose("happy", 1600);
  }

  function markCoachSeen() {
    if (!state.seenCoach) {
      state.seenCoach = true;
      saveState();
    }
  }

  /* ----------------------------------------------------------------
     Look-at tracking
     ---------------------------------------------------------------- */
  let lookTimer = null;
  function lookAt(clientX, clientY) {
    if (sleeping) return;
    const rect = $(".cat-svg").getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height * 0.3;
    const nx = clamp((clientX - cx) / Math.max(160, rect.width * 0.7), -1, 1);
    const ny = clamp((clientY - cy) / Math.max(140, rect.height * 0.6), -1, 1);
    catWrap.style.setProperty("--look-x", `${(nx * 7).toFixed(2)}px`);
    catWrap.style.setProperty("--look-y", `${(ny * 4).toFixed(2)}px`);
    catWrap.style.setProperty("--pupil-x", `${(nx * 2.6).toFixed(2)}px`);
    catWrap.style.setProperty("--pupil-y", `${(ny * 2).toFixed(2)}px`);
    clearTimeout(lookTimer);
    if (!playing) {
      lookTimer = setTimeout(resetLook, 1300);
    }
  }

  function resetLook() {
    catWrap.style.setProperty("--look-x", "0px");
    catWrap.style.setProperty("--look-y", "0px");
    catWrap.style.setProperty("--pupil-x", "0px");
    catWrap.style.setProperty("--pupil-y", "0px");
  }

  /* ----------------------------------------------------------------
     Pointer plumbing
     ---------------------------------------------------------------- */
  catWrap.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".ball")) return;
    beginPet(event);
  });
  window.addEventListener("pointermove", (event) => {
    if (petting) {
      movePet(event);
      return;
    }
    if (dragBall) {
      if (event.pointerId === ballPointerId) moveBallTo(event.clientX, event.clientY);
      return;
    }
    if (playing) {
      const rect = catAnchor.getBoundingClientRect();
      featherToy.style.left = `${event.clientX - rect.left}px`;
      featherToy.style.top = `${event.clientY - rect.top}px`;
      lookAt(event.clientX, event.clientY);
    } else if (event.pointerType === "mouse") {
      lookAt(event.clientX, event.clientY);
    }
  }, { passive: true });
  window.addEventListener("pointerup", (event) => {
    if (petting) endPet(event);
    if (dragBall) endBallDrag(event);
  });
  window.addEventListener("pointercancel", (event) => {
    if (petting) {
      petting = false;
      sounds.purrStop();
      if (!sleeping) pose("idle", 600);
    }
    if (dragBall) endBallDrag();
  });
  catWrap.addEventListener("contextmenu", (event) => event.preventDefault());
  ball.addEventListener("contextmenu", (event) => event.preventDefault());

  scene.addEventListener("pointerdown", (event) => {
    if (!playing) return;
    if (event.target.closest(".cat-wrap, .ball, .dock, .hud-top")) return;
    pounce(event.clientX, event.clientY);
  });

  scene.addEventListener("pointermove", (event) => {
    if (!playing) return;
    if (event.target.closest(".ball")) return;
    lookAt(event.clientX, event.clientY);
  }, { passive: true });

  scene.addEventListener("pointerleave", () => {
    if (!playing) resetLook();
  });

  /* ----------------------------------------------------------------
     Ball + tilt
     ---------------------------------------------------------------- */
  let tiltOn = false;
  let tiltSeen = false;
  let tiltBase = null;
  let tiltX = 0;
  let tiltY = 0;
  let ballX = 85;
  let ballY = 83;
  let ballVX = 0;
  let ballVY = 0;
  let dragBall = false;
  let ballPointerId = null;
  let ballOffset = { x: 0, y: 0 };
  let lastFrame = performance.now();
  let ballRoll = 0;
  let lastBallLook = 0;

  function placeBall() {
    ball.style.left = `${ballX}%`;
    ball.style.top = `${ballY}%`;
  }

  function homeBall() {
    if (dragBall) return;
    const sr = scene.getBoundingClientRect();
    const cr = catAnchor.getBoundingClientRect();
    if (!sr.width || !cr.width) return;
    ballX = clamp(((cr.right - sr.left + 44) / sr.width) * 100, 62, 90);
    ballY = clamp(((cr.bottom - sr.top - 42) / sr.height) * 100, 58, 84);
    ballVX = 0;
    ballVY = 0;
    placeBall();
  }

  function moveBallTo(clientX, clientY) {
    const point = scenePoint(clientX, clientY);
    ballX = clamp(((point.x - ballOffset.x) / point.w) * 100, 6, 94);
    ballY = clamp(((point.y - ballOffset.y) / point.h) * 100, 24, 86);
    ballVX = 0;
    ballVY = 0;
    placeBall();
    lookAt(clientX, clientY);
  }

  function startBallDrag(event) {
    event.preventDefault();
    const point = scenePoint(event.clientX, event.clientY);
    const rect = ball.getBoundingClientRect();
    const sceneRect = scene.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 - sceneRect.left;
    const centerY = rect.top + rect.height / 2 - sceneRect.top;
    ballOffset = { x: point.x - centerX, y: point.y - centerY };
    dragBall = true;
    ballPointerId = event.pointerId;
    ball.setPointerCapture?.(event.pointerId);
    ball.style.cursor = "grabbing";
    if (!tiltSeen && !state.seenCoach) showBubble("Drag me to play!", "i-paw", 1500);
    sounds.pop();
  }

  function endBallDrag(event) {
    if (dragBall && event && event.pointerId !== ballPointerId) return;
    dragBall = false;
    ballPointerId = null;
    ball.style.cursor = "";
    saveState();
  }

  ball.addEventListener("pointerdown", startBallDrag);
  ball.addEventListener("pointerup", (event) => endBallDrag(event));

  ball.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 8 : 4;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") ballX = clamp(ballX - step, 6, 94);
    if (event.key === "ArrowRight") ballX = clamp(ballX + step, 6, 94);
    if (event.key === "ArrowUp") ballY = clamp(ballY - step, 24, 86);
    if (event.key === "ArrowDown") ballY = clamp(ballY + step, 24, 86);
    ballVX = 0;
    ballVY = 0;
    placeBall();
    sounds.pop();
  });

  function onOrientation(event) {
    if (event.beta == null && event.gamma == null) return;
    if (!tiltBase) {
      tiltBase = { beta: event.beta || 0, gamma: event.gamma || 0 };
    }
    if (!tiltSeen) {
      tiltSeen = true;
      // The tap feedback already explained tilt; a second toast would stack.
      sparkleBurstFromElement(ball, 4);
    }
    const beta = (event.beta || 0) - tiltBase.beta;
    const gamma = (event.gamma || 0) - tiltBase.gamma;
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    if (Math.abs(angle) === 90) {
      tiltX = clamp(beta, -28, 28);
      tiltY = clamp(-gamma, -28, 28);
    } else {
      tiltX = clamp(gamma, -28, 28);
      tiltY = clamp(beta, -28, 28);
    }
  }

  function animateBall(now) {
    const dt = clamp((now - lastFrame) / 1000, 0, 0.05);
    lastFrame = now;
    if (tiltOn && !dragBall) {
      ballVX += (tiltX / 28) * 34 * dt;
      ballVY += (tiltY / 28) * 30 * dt;
      const friction = Math.pow(0.965, dt * 60);
      ballVX *= friction;
      ballVY *= friction;
      ballVX = clamp(ballVX, -46, 46);
      ballVY = clamp(ballVY, -40, 40);
      ballX += ballVX * dt;
      ballY += ballVY * dt;
      if (ballX < 6) { ballX = 6; ballVX = Math.abs(ballVX) * 0.55; }
      if (ballX > 94) { ballX = 94; ballVX = -Math.abs(ballVX) * 0.55; }
      if (ballY < 24) { ballY = 24; ballVY = Math.abs(ballVY) * 0.55; }
      if (ballY > 86) { ballY = 86; ballVY = -Math.abs(ballVY) * 0.55; }
      placeBall();
      if (Math.abs(ballVX) + Math.abs(ballVY) > 1.2) {
        ballRoll += ballVX * dt * 7;
        ball.style.setProperty("--ball-roll", `${ballRoll.toFixed(1)}deg`);
        if (now - lastBallLook > 130) {
          const br = ball.getBoundingClientRect();
          lookAt(br.left + br.width / 2, br.top + br.height / 2);
          lastBallLook = now;
        }
      }
    }
    requestAnimationFrame(animateBall);
  }

  placeBall();
  homeBall();
  requestAnimationFrame(animateBall);
  window.addEventListener("resize", () => {
    if (!tiltOn && !dragBall) setTimeout(homeBall, 60);
  });

  async function toggleTilt() {
    if (tiltOn) {
      tiltOn = false;
      window.removeEventListener("deviceorientation", onOrientation);
      tiltBase = null;
      tiltSeen = false;
      renderTilt();
      showBubble("Drag the ball instead!", "i-paw", 1900);
      toast("Tilt off · the ball still works by touch", "", "i-gyro");
      return;
    }

    let granted = true;
    try {
      // Must stay inside the tap gesture for iOS: request before any await.
      if (typeof DeviceOrientationEvent !== "undefined" &&
          typeof DeviceOrientationEvent.requestPermission === "function") {
        const result = await DeviceOrientationEvent.requestPermission();
        granted = result === "granted";
      } else if (typeof DeviceOrientationEvent === "undefined") {
        granted = false;
      }
    } catch {
      granted = false;
    }

    if (!granted) {
      showBubble("Motion is off — drag the ball!", "i-paw", 3200);
      toast("Motion access is off. Drag the ball instead.", "", "i-gyro");
      vibrate(8);
      return;
    }

    tiltOn = true;
    tiltBase = null;
    tiltSeen = false;
    window.addEventListener("deviceorientation", onOrientation);
    renderTilt();
    showBubble("Tilt me!", "i-gyro", 1800);
    toast("Move your phone to roll the ball", "teal", "i-gyro");
    vibrate(8);
    setTimeout(() => {
      if (tiltOn && !tiltSeen) {
        toast("No tilt sensor here — drag the ball instead", "", "i-paw");
      }
    }, 2400);
  }

  /* ----------------------------------------------------------------
     Intro / start
     ---------------------------------------------------------------- */
  function updateIntroName() {
    const name = cleanName(nameInput.value);
    $$(".js-name").forEach((el) => { el.textContent = name || "Mochi"; });
  }

  nameInput.addEventListener("input", updateIntroName);
  nameInput.addEventListener("blur", () => {
    nameInput.value = cleanName(nameInput.value);
    updateIntroName();
  });
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      startGame();
    }
  });

  function startGame() {
    if (started) return;
    started = true;
    const name = cleanName(nameInput.value) || state.name || "Mochi";
    state.name = name;
    nameInput.value = name;
    sounds.init();
    sounds.setMuted(state.muted);
    intro.classList.add("is-leaving");
    app.classList.remove("is-blurred");
    setTimeout(() => {
      intro.hidden = true;
    }, 700);
    renderAll();
    homeBall();
    lastTick = Date.now();
    saveState();
    setTimeout(() => {
      if (!state.muted) sounds.meow();
      if (offlineNote) {
        showBubble(offlineNote, "i-heart", 4600);
        offlineNote = "";
      } else {
        showBubble(`Hi, I'm ${state.name}!`, "i-heart", 2800);
      }
    }, 800);
    if (!state.seenCoach) {
      setTimeout(() => {
        if (!state.seenCoach && !sleeping && !moodBubble.classList.contains("show")) {
          showBubble("Drag across me to pet", "i-paw", 4800);
        }
      }, 4200);
    }
    if (state.energy < 18) {
      setTimeout(() => showBubble("I'm sleepy…", "i-bolt", 3000), 3600);
    }
  }

  startBtn.addEventListener("click", startGame);

  /* ----------------------------------------------------------------
     Buttons
     ---------------------------------------------------------------- */
  actionEls.get("feed")?.addEventListener("click", feed);
  actionEls.get("play")?.addEventListener("click", startPlay);
  actionEls.get("groom")?.addEventListener("click", groom);
  napBtn.addEventListener("click", nap);
  tiltBtn.addEventListener("click", toggleTilt);

  function setMuted(muted, announce = true) {
    state.muted = muted;
    sounds.setMuted(muted);
    renderSound();
    saveState();
    if (announce) {
      toast(muted ? "Sound off" : "Sound on", "", muted ? "i-muted" : "i-sound");
    }
  }

  soundBtn.addEventListener("click", () => setMuted(!state.muted));
  soundRow.addEventListener("click", () => setMuted(!state.muted));

  helpBtn.addEventListener("click", () => {
    if (typeof helpSheet.showModal === "function") {
      if (!helpSheet.open) helpSheet.showModal();
    } else {
      helpSheet.setAttribute("open", "");
    }
    renderSound();
  });

  closeHelp.addEventListener("click", closeHelpSheet);
  function closeHelpSheet() {
    if (typeof helpSheet.close === "function") helpSheet.close();
    else helpSheet.removeAttribute("open");
    resetArmed = false;
    resetBtn.classList.remove("confirm");
    resetBtn.textContent = "Start over";
    clearTimeout(resetTimer);
  }

  helpSheet.addEventListener("click", (event) => {
    if (event.target === helpSheet) closeHelpSheet();
  });

  resetBtn.addEventListener("click", () => {
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.classList.add("confirm");
      resetBtn.textContent = "Tap again to reset";
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        resetArmed = false;
        resetBtn.classList.remove("confirm");
        resetBtn.textContent = "Start over";
      }, 3200);
      return;
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
    location.reload();
  });

  /* ----------------------------------------------------------------
     Toasts / haptics helpers
     ---------------------------------------------------------------- */
  function vibrate(pattern) {
    if (!("vibrate" in navigator)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }

  /* ----------------------------------------------------------------
     Room clock
     ---------------------------------------------------------------- */
  function setTimeOfDay() {
    const hour = new Date().getHours();
    const time = hour >= 20 || hour < 6 ? "night" : hour >= 17 ? "dusk" : "day";
    scene.dataset.time = time;
  }

  function setClock() {
    const now = new Date();
    const minutes = now.getMinutes();
    const hours = now.getHours() % 12;
    clockHour?.style.setProperty("--rot", `${hours * 30 + minutes * 0.5}deg`);
    clockMinute?.style.setProperty("--rot", `${minutes * 6}deg`);
  }

  setTimeOfDay();
  setClock();
  setInterval(setTimeOfDay, 60000);
  setInterval(setClock, 30000);

  /* ----------------------------------------------------------------
     Persistence + lifecycle
     ---------------------------------------------------------------- */
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      saveState();
      sounds.purrStop();
      if (petting) {
        petting = false;
        if (!sleeping) pose("idle", 600);
      }
    } else {
      lastTick = Date.now();
      setTimeOfDay();
    }
  });
  window.addEventListener("pagehide", saveState);
  window.addEventListener("beforeunload", saveState);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && moodBubble.classList.contains("show")) {
      moodBubble.classList.remove("show");
    }
  });

  /* ----------------------------------------------------------------
     Boot
     ---------------------------------------------------------------- */
  sounds.setMuted(state.muted);
  if (state.name) nameInput.value = state.name;
  renderAll();
  renderName();
  placeBall();
  setInterval(saveState, 10000);
  window.addEventListener("load", () => {
    setTimeout(() => { sounds.setMuted(state.muted); }, 60);
  });

  // Keep the title current without leaking the player's chosen name into storage
  // until they actually start.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !started && document.activeElement !== nameInput) startGame();
  });
})();
