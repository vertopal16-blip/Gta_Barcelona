// Radio del coche con música generada en tiempo real (WebAudio).
// Emisoras ficticias: rumba catalana, lo-fi mediterráneo y techno de Poblenou.

import { audio } from './audio.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

export const STATIONS = [
  { id: 'rumba', name: 'Ràdio Rumba 98.3', desc: 'Rumba catalana del Raval', bpm: 112 },
  { id: 'lofi', name: 'Mediterrània FM', desc: 'Lo-fi para mirar el mar', bpm: 80 },
  { id: 'techno', name: 'Ona 22@', desc: 'Techno desde las naves de Poblenou', bpm: 124 },
  { id: 'sardana', name: 'Cobla Clàssica', desc: 'Sardanes i havaneres', bpm: 96 },
];

export class Radio {
  constructor() {
    this.index = -1; // -1 = apagada
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.gain = null;
    this.volume = 0.5;
    this.bar = 0;
    this.seed = 1;
  }

  get station() { return this.index >= 0 ? STATIONS[this.index] : null; }

  ensure() {
    const c = audio.ctx;
    if (!c) return false;
    if (!this.gain) {
      this.gain = c.createGain();
      this.gain.gain.value = 0;
      // Un poco de "radio": filtro paso banda suave
      this.filter = c.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 7000;
      this.gain.connect(this.filter).connect(audio.master);
    }
    return true;
  }

  /** Cambia de emisora (con -1 = apagar). */
  next() {
    this.index = this.index + 1 >= STATIONS.length ? -1 : this.index + 1;
    this.step = 0; this.bar = 0;
    this.seed = Math.floor(Math.random() * 1000);
    return this.station;
  }

  setActive(on) {
    if (!this.ensure()) return;
    const want = on && this.index >= 0;
    const t = audio.ctx.currentTime;
    this.gain.gain.setTargetAtTime(want ? this.volume * 0.35 : 0, t, 0.15);
    if (want && !this.playing) {
      this.playing = true;
      this.nextTime = t + 0.05;
      this.timer = setInterval(() => this.schedule(), 40);
    } else if (!want && this.playing) {
      this.playing = false;
      clearInterval(this.timer);
    }
  }

  rnd() { this.seed = (this.seed * 9301 + 49297) % 233280; return this.seed / 233280; }

  schedule() {
    const c = audio.ctx;
    const st = this.station;
    if (!st) return;
    const stepDur = 60 / st.bpm / 4;
    while (this.nextTime < c.currentTime + 0.2) {
      this.playStep(st, this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
      this.nextTime += stepDur;
    }
  }

  // --- Instrumentos -------------------------------------------------------
  env(node, t, a, d, peak) {
    const g = audio.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    node.connect(g).connect(this.gain);
    return g;
  }

  osc(type, freq, t, dur, peak, a = 0.005, filterF = null) {
    const c = audio.ctx;
    const o = c.createOscillator();
    o.type = type; o.frequency.value = freq;
    let n = o;
    if (filterF) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterF; o.connect(f); n = f; }
    this.env(n, t, a, dur, peak);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
  }

  pluck(freq, t, peak = 0.12) {
    // Guitarra: diente de sierra filtrado con caída rápida
    const c = audio.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq;
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.25);
    o.connect(f);
    this.env(f, t, 0.003, 0.35, peak);
    o.start(t); o.stop(t + 0.45);
  }

  strum(notes, t, down = true, peak = 0.07) {
    const ns = down ? notes : [...notes].reverse();
    ns.forEach((n, i) => this.pluck(NOTE(n), t + i * 0.012, peak));
  }

  noise(t, dur, freq, type, peak) {
    const c = audio.ctx;
    const s = c.createBufferSource(); s.buffer = audio.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 1.2;
    s.connect(f);
    this.env(f, t, 0.002, dur, peak);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  kick(t, peak = 0.6) {
    const c = audio.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(o, t, 0.002, 0.25, peak);
    o.start(t); o.stop(t + 0.3);
  }

  clap(t, peak = 0.25) { this.noise(t, 0.12, 1600, 'bandpass', peak); this.noise(t + 0.012, 0.1, 1800, 'bandpass', peak * 0.7); }
  hat(t, peak = 0.06, open = false) { this.noise(t, open ? 0.18 : 0.04, 8000, 'highpass', peak); }

  // --- Patrones ------------------------------------------------------------
  playStep(st, s, t, dur) {
    switch (st.id) {
      case 'rumba': return this.rumba(s, t, dur);
      case 'lofi': return this.lofi(s, t, dur);
      case 'techno': return this.techno(s, t, dur);
      case 'sardana': return this.sardana(s, t, dur);
    }
  }

  rumba(s, t, dur) {
    // Cadencia andaluza: Am - G - F - E
    const prog = [[57, 64, 69, 72, 76], [55, 62, 67, 71, 74], [53, 60, 65, 69, 72], [52, 59, 64, 68, 71]];
    const roots = [45, 43, 41, 40];
    const ch = this.bar % 4;
    // Ventilador: rasgueo característico
    const pattern = { 0: 'D', 2: 'U', 3: 'D', 4: 'D', 6: 'U', 7: 'D', 8: 'D', 10: 'U', 11: 'D', 12: 'D', 14: 'U', 15: 'U' };
    if (pattern[s]) this.strum(prog[ch], t, pattern[s] === 'D', s % 4 === 0 ? 0.08 : 0.05);
    if (s === 4 || s === 12) { this.noise(t, 0.05, 900, 'bandpass', 0.25); } // golpe de caja
    if (s % 4 === 2) this.clap(t, 0.12); // palmas
    if (s === 0 || s === 6 || s === 8 || s === 14) this.osc('triangle', NOTE(roots[ch] - (s === 6 || s === 14 ? -7 : 0)), t, 0.25, 0.22, 0.005, 900);
    // Melodía en modo frigio dominante
    const scale = [64, 65, 68, 69, 71, 72, 74, 76];
    if ((s % 2 === 0) && this.rnd() < 0.45) this.osc('square', NOTE(scale[Math.floor(this.rnd() * scale.length)] + 12), t, dur * 1.6, 0.035, 0.01, 2500);
  }

  lofi(s, t, dur) {
    const prog = [[50, 57, 60, 64, 65], [55, 59, 62, 65, 69], [48, 55, 59, 62, 64], [57, 61, 64, 67, 71]];
    const ch = this.bar % 4;
    if (s === 0) prog[ch].forEach((n) => this.osc('sine', NOTE(n), t, 2.6, 0.05, 0.08));
    if (s === 0) this.osc('triangle', NOTE(prog[ch][0] - 12), t, 1.2, 0.25, 0.01, 600);
    if (s === 0 || s === 10) this.kick(t, 0.45);
    if (s === 4 || s === 12) this.noise(t, 0.15, 1200, 'bandpass', 0.12);
    if (s % 2 === 0) this.hat(t + (s % 4 === 2 ? dur * 0.25 : 0), 0.035);
    // Piano eléctrico
    if ((s === 3 || s === 7 || s === 11 || s === 14) && this.rnd() < 0.7) {
      const n = prog[ch][1 + Math.floor(this.rnd() * 4)] + 12;
      this.osc('sine', NOTE(n), t, 0.8, 0.06, 0.01);
      this.osc('sine', NOTE(n) * 2.01, t, 0.3, 0.015, 0.005);
    }
    // Crepitar de vinilo
    if (this.rnd() < 0.3) this.noise(t, 0.01, 4000, 'highpass', 0.015);
  }

  techno(s, t, dur) {
    if (s % 4 === 0) this.kick(t, 0.6);
    if (s % 4 === 2) this.hat(t, 0.08, true);
    if (s === 4 || s === 12) this.clap(t, 0.15);
    const bassLine = [33, 33, 45, 33, 36, 33, 45, 40, 33, 33, 45, 33, 43, 33, 45, 38];
    const c = audio.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(bassLine[s]);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 12;
    const sweep = 300 + 1600 * (0.5 + 0.5 * Math.sin(this.bar * 0.4 + s * 0.05));
    f.frequency.setValueAtTime(sweep, t); f.frequency.exponentialRampToValueAtTime(200, t + dur * 0.9);
    o.connect(f);
    this.env(f, t, 0.003, dur * 0.9, 0.12);
    o.start(t); o.stop(t + dur);
    if (this.bar % 8 >= 4 && s % 8 === 6) this.osc('square', NOTE(69 + (this.bar % 2 ? 3 : 0)), t, dur * 2, 0.03, 0.005, 3000);
  }

  sardana(s, t, dur) {
    // Tenora y tible (aproximación con ondas cuadradas y triangulares)
    const melody = [72, 74, 76, 77, 79, 77, 76, 74, 72, 71, 72, 74, 76, 74, 72, 67];
    const harm = [60, 60, 65, 65, 67, 67, 60, 60];
    if (s % 2 === 0) this.osc('square', NOTE(melody[(s / 2 + this.bar * 8) % 16]), t, dur * 1.8, 0.04, 0.02, 2200);
    if (s % 4 === 0) this.osc('triangle', NOTE(harm[(this.bar * 4 + s / 4) % 8] - 12), t, dur * 3, 0.15, 0.01, 800);
    if (s % 4 === 0) this.noise(t, 0.04, 2500, 'bandpass', 0.08); // flabiol y tamborí
  }
}

export const radio = new Radio();
