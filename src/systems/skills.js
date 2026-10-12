// Habilidades que mejoran con el uso: conducción, puntería y resistencia.

import { audio } from '../core/audio.js';

const LEVELS = [0, 60, 180, 420, 850, 1600];
export const SKILL_INFO = {
  conduccion: { name: 'Conducción', desc: 'Más agarre y mejor giro.' },
  punteria: { name: 'Puntería', desc: 'Menos dispersión y recarga más rápida.' },
  resistencia: { name: 'Resistencia', desc: 'Más salud máxima y aguante.' },
};

export class Skills {
  constructor(game) {
    this.game = game;
    this.xp = { conduccion: 0, punteria: 0, resistencia: 0 };
  }

  level(k) {
    let l = 0;
    for (let i = 0; i < LEVELS.length; i++) if (this.xp[k] >= LEVELS[i]) l = i;
    return l;
  }

  progress(k) {
    const l = this.level(k);
    if (l >= LEVELS.length - 1) return 1;
    return (this.xp[k] - LEVELS[l]) / (LEVELS[l + 1] - LEVELS[l]);
  }

  add(k, amount) {
    const before = this.level(k);
    this.xp[k] += amount;
    const after = this.level(k);
    if (after > before) {
      this.game.hud.big(`${SKILL_INFO[k].name.toUpperCase()} ${after}`, SKILL_INFO[k].desc, true, 3);
      audio.play('success');
      this.apply();
    }
  }

  apply() {
    const pl = this.game.player;
    pl.maxHealth = 100 + this.level('resistencia') * 8;
  }

  update(dt) {
    const pl = this.game.player;
    if (pl.dead) return;
    const v = pl.vehicle;
    if (v && !v.isBoat && !v.isHeli) {
      if (v.T.pedal) this.add('resistencia', dt * 0.8 * Math.min(1, v.speed / 5));
      else if (v.speed > 14) this.add('conduccion', dt * (v.speed / 25) * (v.drifting ? 2 : 1));
    } else if (!v) {
      if (pl.speed > 6 || (pl.swimming && pl.speed > 1)) this.add('resistencia', dt * 0.7);
    }
  }

  get driveMul() { return 1 + this.level('conduccion') * 0.05; }
  get spreadMul() { return 1 - this.level('punteria') * 0.11; }
  get reloadMul() { return 1 - this.level('punteria') * 0.08; }
  get staminaMul() { return 1 - this.level('resistencia') * 0.12; }

  serialize() { return { ...this.xp }; }
  load(o) { Object.assign(this.xp, o || {}); this.apply(); }
}
