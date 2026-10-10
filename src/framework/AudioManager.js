/**
 * Procedural Web Audio API sound synthesizer
 * Zero external asset dependencies - instant, lightweight, and low-latency.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.enabled = true;
    this.volume = 0.7;
    this._initOnGesture = this._initOnGesture.bind(this);
    window.addEventListener('pointerdown', this._initOnGesture, { once: true });
    window.addEventListener('keydown', this._initOnGesture, { once: true });
  }

  _initContext() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch (e) {
      console.warn('Web Audio not supported:', e);
    }
  }

  _initOnGesture() {
    this._initContext();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleSound() {
    this._initContext();
    this.enabled = !this.enabled;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.05);
    }
    return this.enabled;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && this.enabled) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  laser(freq = 880, duration = 0.18) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + duration);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration);
  }

  missileLaunch() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(700, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.35);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  explosion(intensity = 1.0) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const dur = 0.55 * intensity;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.8);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.exponentialRampToValueAtTime(60, now + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.45 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
    noise.stop(now + dur);
  }

  hit() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.12);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  chime() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);

      gain.gain.setValueAtTime(0.15, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.25);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.25);
    });
  }

  victory() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [
      { f: 440, t: 0.0, d: 0.15 },
      { f: 554.37, t: 0.15, d: 0.15 },
      { f: 659.25, t: 0.3, d: 0.2 },
      { f: 880, t: 0.5, d: 0.5 }
    ];
    notes.forEach(n => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, now + n.t);

      gain.gain.setValueAtTime(0.3, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now + n.t);
      osc.stop(now + n.t + n.d);
    });
  }

  click() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.03);

    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.03);
  }

  // -------------------------------------------------------------------------
  // Building blocks for richer game audio (all synthesized, no asset files)
  // -------------------------------------------------------------------------
  _noise(dur) {
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  /** A short tone, for countdowns and UI blips. */
  beep(freq = 660, dur = 0.12, type = 'square', vol = 0.22) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + dur);
  }

  /** Air rushing past: band-passed noise sweeping between two frequencies. */
  whoosh(dur = 0.28, from = 2400, to = 500, vol = 0.25) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const src = this._noise(dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(from, now);
    filter.frequency.exponentialRampToValueAtTime(to, now + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(now);
    src.stop(now + dur);
  }

  /** A cartoon bonk: a low thud with a springy boing on top. */
  thump() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.2);
    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.22);
    this.beep(520, 0.1, 'triangle', 0.18);
  }

  /** A crash: a noise burst plus a falling tone. */
  crash() {
    if (!this.enabled || !this.ctx) return;
    this.explosion(0.8);
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  /** A rising sweep for a speed boost. */
  boostSweep() {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.4);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.4);
    this.whoosh(0.4, 600, 3200, 0.18);
  }

  // A continuous engine whose pitch follows speed (0..1) and boost (0..1)
  startEngine() {
    this._initContext();
    if (!this.ctx || this._engine) return;
    const now = this.ctx.currentTime;
    const a = this.ctx.createOscillator();
    const b = this.ctx.createOscillator();
    a.type = 'sawtooth';
    b.type = 'square';
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.05, now + 0.4);
    a.connect(filter);
    b.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    a.start(now);
    b.start(now);
    this._engine = { a, b, filter, gain };
  }

  setEngine(speed, boost = 0) {
    const e = this._engine;
    if (!e || !this.ctx) return;
    const now = this.ctx.currentTime;
    const f = 52 + speed * 120 + boost * 38;
    e.a.frequency.setTargetAtTime(f, now, 0.06);
    e.b.frequency.setTargetAtTime(f * 1.5, now, 0.06);
    e.filter.frequency.setTargetAtTime(380 + speed * 1500 + boost * 700, now, 0.08);
    e.gain.gain.setTargetAtTime(0.045 + speed * 0.04, now, 0.1);
  }

  stopEngine() {
    const e = this._engine;
    if (!e || !this.ctx) return;
    this._engine = null;
    const now = this.ctx.currentTime;
    e.gain.gain.setTargetAtTime(0.0001, now, 0.08);
    e.a.stop(now + 0.4);
    e.b.stop(now + 0.4);
  }

  // A cheerful looping chiptune: kick, bass, arpeggio and melody over C - Am - F - G
  startMusic(bpm = 128) {
    this._initContext();
    if (!this.ctx || this._music) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.55;
    out.connect(this.masterGain);
    const stepDur = 60 / bpm / 4;
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    const chords = [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]];
    const roots = [0, -3, -7, -5];
    const melody = [
      { 0: 0, 3: 4, 4: 7, 8: 12, 10: 7, 12: 4 },
      { 0: 9, 3: 12, 4: 9, 8: 16, 10: 12, 12: 9 },
      { 0: 5, 3: 9, 4: 12, 8: 9, 10: 5, 12: 9 },
      { 0: 7, 3: 11, 4: 14, 8: 11, 10: 7, 12: 2 }
    ];
    const tone = (type, freq, t, dur, vol) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const kick = t => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + 0.16);
    };
    const schedule = (step, t) => {
      const bar = Math.floor(step / 16) % 4;
      const s = step % 16;
      if (s % 4 === 0) kick(t);
      if (s % 2 === 0) tone('triangle', mtof(36 + roots[bar] + (s % 8 === 6 ? 12 : 0)), t, stepDur * 1.8, 0.28);
      const chord = chords[bar];
      tone('square', mtof(72 + chord[[0, 1, 2, 1][s % 4]]), t, stepDur * 0.9, 0.05);
      const m = melody[bar][s];
      if (m !== undefined) tone('triangle', mtof(72 + m), t, stepDur * 2.4, 0.2);
    };
    const state = { step: 0, next: ctx.currentTime + 0.1 };
    const timer = setInterval(() => {
      while (state.next < ctx.currentTime + 0.3) {
        schedule(state.step, state.next);
        state.next += stepDur;
        state.step++;
      }
    }, 60);
    this._music = { timer, out };
  }

  stopMusic() {
    const m = this._music;
    if (!m) return;
    this._music = null;
    clearInterval(m.timer);
    if (this.ctx) m.out.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.12);
  }
}
