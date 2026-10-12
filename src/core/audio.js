// Audio procedural con WebAudio: no necesita ficheros externos.

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.6;
    this.listener = { x: 0, z: 0 };
    this.engine = null;
    this.sirens = new Map();
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // Buffer de ruido reutilizable
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._ambient();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  _gainAt(x, z, range = 120) {
    if (x === undefined) return 1;
    const d = Math.hypot(x - this.listener.x, z - this.listener.z);
    return Math.max(0, 1 - d / range) ** 1.5;
  }

  _noiseBurst(dur, freq, gain, q = 1, type = 'lowpass') {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  _tone(freq, dur, gain, type = 'sine', slideTo) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    const t = c.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name, x, z) {
    if (!this.ctx) return;
    const v = this._gainAt(x, z, name === 'explosion' ? 400 : name === 'firework' ? 1500 : name === 'gunshot' ? 250 : 80);
    if (v <= 0.01) return;
    switch (name) {
      case 'gunshot': this._noiseBurst(0.25, 2500, 0.9 * v); this._tone(140, 0.12, 0.5 * v, 'square', 50); break;
      case 'smg': this._noiseBurst(0.12, 3000, 0.6 * v); break;
      case 'shotgun': this._noiseBurst(0.45, 1500, 1.0 * v); this._tone(90, 0.2, 0.6 * v, 'square', 40); break;
      case 'explosion': this._noiseBurst(1.8, 400, 1.5 * v); this._tone(60, 1.2, 0.9 * v, 'sine', 25); break;
      case 'punch': this._noiseBurst(0.08, 600, 0.6 * v); this._tone(110, 0.08, 0.4 * v, 'sine', 60); break;
      case 'crash': this._noiseBurst(0.4, 900, 0.9 * v, 0.7); this._tone(80, 0.25, 0.4 * v, 'sawtooth', 40); break;
      case 'horn': this._tone(420, 0.35, 0.25 * v, 'square'); this._tone(530, 0.35, 0.2 * v, 'square'); break;
      case 'pickup': this._tone(880, 0.12, 0.3, 'triangle'); setTimeout(() => this.ctx && this._tone(1320, 0.18, 0.3, 'triangle'), 90); break;
      case 'cash': this._tone(1200, 0.08, 0.25, 'square'); setTimeout(() => this.ctx && this._tone(1600, 0.15, 0.25, 'square'), 70); break;
      case 'ui': this._tone(660, 0.06, 0.15, 'triangle'); break;
      case 'fail': this._tone(300, 0.6, 0.35, 'sawtooth', 120); break;
      case 'success': [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.ctx && this._tone(f, 0.3, 0.25, 'triangle'), i * 110)); break;
      case 'checkpoint': this._tone(990, 0.15, 0.3, 'sine'); break;
      case 'reload': this._noiseBurst(0.05, 4000, 0.3, 1, 'highpass'); setTimeout(() => this.ctx && this._noiseBurst(0.05, 4000, 0.3, 1, 'highpass'), 200); break;
      case 'swing': this._noiseBurst(0.15, 1200, 0.25 * v, 0.5, 'bandpass'); break;
      case 'alarm': for (let i = 0; i < 6; i++) setTimeout(() => this.ctx && this._tone(i % 2 ? 900 : 700, 0.25, 0.2 * v, 'square'), i * 260); break;
      case 'splash': this._noiseBurst(0.7, 800, 0.6 * v, 0.5); break;
      case 'nitro': this._noiseBurst(1.6, 700, 0.8 * v, 0.6); this._tone(90, 1.2, 0.4 * v, 'sawtooth', 220); break;
      case 'thunder': this._noiseBurst(3.5, 180, 1.2 * v, 0.4); this._tone(45, 2.5, 0.6 * v, 'sine', 30); break;
      case 'firework': this._noiseBurst(0.5, 1800, 0.5 * v); setTimeout(() => this.ctx && this._noiseBurst(1.2, 600, 0.7 * v, 0.5), 120); break;
      case 'door': this._tone(180, 0.1, 0.3 * v, 'square', 90); break;
    }
  }

  /** Sonido de motor continuo del vehículo del jugador. */
  setEngine(active, rpm = 0, throttle = 0, kind = 'car') {
    if (!this.ctx) return;
    if (!this.engine) {
      const c = this.ctx;
      const o1 = c.createOscillator(); o1.type = 'sawtooth';
      const o2 = c.createOscillator(); o2.type = 'square';
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      const g = c.createGain(); g.gain.value = 0;
      o1.connect(f); o2.connect(f); f.connect(g).connect(this.master);
      o1.start(); o2.start();
      this.engine = { o1, o2, f, g };
    }
    const e = this.engine;
    const t = this.ctx.currentTime;
    const base = kind === 'bike' ? 70 : kind === 'heavy' ? 30 : 42;
    const freq = base + rpm * (kind === 'bike' ? 160 : 110);
    e.o1.frequency.setTargetAtTime(freq, t, 0.05);
    e.o2.frequency.setTargetAtTime(freq * 0.5, t, 0.05);
    e.f.frequency.setTargetAtTime(300 + throttle * 900 + rpm * 400, t, 0.05);
    e.g.gain.setTargetAtTime(active ? 0.07 + throttle * 0.07 : 0, t, 0.1);
  }

  /** Sirenas de policía (dos tonos, estilo europeo). */
  updateSirens(list) {
    if (!this.ctx) return;
    const alive = new Set();
    for (const s of list) {
      alive.add(s.id);
      let node = this.sirens.get(s.id);
      if (!node) {
        const o = this.ctx.createOscillator(); o.type = 'triangle';
        const g = this.ctx.createGain(); g.gain.value = 0;
        o.connect(g).connect(this.master); o.start();
        node = { o, g };
        this.sirens.set(s.id, node);
      }
      const t = this.ctx.currentTime;
      const hi = Math.floor(t * 1.4) % 2 === 0;
      node.o.frequency.setTargetAtTime(hi ? 950 : 700, t, 0.01);
      node.g.gain.setTargetAtTime(0.12 * this._gainAt(s.x, s.z, 260), t, 0.1);
    }
    for (const [id, node] of this.sirens) {
      if (!alive.has(id)) {
        node.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        node.o.stop(this.ctx.currentTime + 0.3);
        this.sirens.delete(id);
      }
    }
  }

  /** Ambiente urbano + mar, mezcla según proximidad a la costa. */
  _ambient() {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 350;
    const g = c.createGain(); g.gain.value = 0.04;
    src.connect(f).connect(g).connect(this.master); src.start();
    const s2 = c.createBufferSource(); s2.buffer = this.noise; s2.loop = true;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 500; f2.Q.value = 0.4;
    const g2 = c.createGain(); g2.gain.value = 0;
    s2.connect(f2).connect(g2).connect(this.master); s2.start();
    this.ambient = { g, g2 };
  }

  setAmbient(city, sea) {
    if (!this.ambient) return;
    const t = this.ctx.currentTime;
    this.ambient.g.gain.setTargetAtTime(0.03 * city, t, 0.5);
    const wave = 0.5 + 0.5 * Math.sin(t * 0.6);
    this.ambient.g2.gain.setTargetAtTime(0.06 * sea * (0.4 + wave), t, 0.3);
  }
}

export const audio = new AudioSystem();
