// Fuegos artificiales sobre la playa algunas noches (y en la Mercè, cada día 24 del juego).

import { rand } from '../core/utils.js';
import { audio } from '../core/audio.js';

const COLORS = [[1, 0.3, 0.2], [1, 0.85, 0.2], [0.3, 0.6, 1], [0.4, 1, 0.5], [1, 0.4, 0.9], [1, 1, 1]];

export class Fireworks {
  constructor(game) {
    this.game = game;
    this.shells = [];
    this.showT = 0;
    this.day = -1;
  }

  update(dt) {
    const g = this.game, sky = g.world.sky;
    // Espectáculo nocturno: de 23:00 a 23:30, una noche de cada dos (y sin lluvia)
    const day = g.economy.day;
    if (sky.time >= 23 && sky.time < 23.5 && sky.rain < 0.3 && day % 2 === 0) {
      if (this.day !== day) { this.day = day; g.hud.notify('🎆 ¡Fuegos artificiales sobre la playa de la Barceloneta!'); }
      this.showT -= dt;
      if (this.showT <= 0) { this.showT = rand.range(0.4, 1.4); this.launch(); }
    }
    for (const s of [...this.shells]) {
      s.vy -= 9.8 * dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
      g.combat.fx.emit(s.x, s.y, s.z, 0, 0, 0, 0.35, 0.6, 1, 0.8, 0.5, 0.8, -1, 0);
      if (s.vy <= 0) {
        this.shells.splice(this.shells.indexOf(s), 1);
        const c = rand.pick(COLORS);
        const n = 140;
        for (let i = 0; i < n; i++) {
          const th = rand() * Math.PI * 2, ph = Math.acos(rand.range(-1, 1)), sp = rand.range(14, 20);
          g.combat.fx.emit(s.x, s.y, s.z, Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp, rand.range(1.4, 2.4), 7, c[0], c[1], c[2], 0.9, -1.5, 3);
          if (i % 6 === 0) g.combat.fx.emit(s.x, s.y, s.z, Math.sin(ph) * Math.cos(th) * sp * 0.6, Math.cos(ph) * sp * 0.6, Math.sin(ph) * Math.sin(th) * sp * 0.6, 0.6, 5, 1, 1, 1, 0.6, -4, 2);
        }
        audio.play('firework', s.x, s.z);
        const f = g.combat.flash;
        f.position.set(s.x, s.y, s.z); f.color.setRGB(c[0], c[1], c[2]); f.distance = 400; f.intensity = 6000; g.combat.flashT = 0.35;
      }
    }
  }

  launch() {
    const x = rand.range(500, 900), z = rand.range(560, 660);
    this.shells.push({ x, y: 0, z, vx: rand.range(-3, 3), vy: rand.range(42, 55), vz: rand.range(-3, 3) });
  }
}
