// Bandas y territorios: grupos en sus esquinas, guerras de bandas y conquista de barrios.

import { rand, dist2, formatMoney } from '../core/utils.js';
import { events } from '../core/events.js';
import { audio } from '../core/audio.js';
import { randomLook } from '../entities/humanoid.js';

export const GANGS = {
  llops: { name: 'Els Llops del Port', color: '#3fa860', shirt: [0x103a20, 0x1a1a1a, 0x204a2a], weapons: ['pistol', 'smg', 'bat'] },
  corbs: { name: 'Els Corbs del Raval', color: '#d8402a', shirt: [0x6a1010, 0x202020, 0x8a1a1a], weapons: ['knife', 'pistol', 'bat'] },
  banda22: { name: 'La Banda del 22@', color: '#3a7ad8', shirt: [0x1a2a5a, 0x202020, 0x2a4a8a], weapons: ['bat', 'pistol', 'shotgun'] },
  player: { name: 'Tu gente', color: '#f2b33d', shirt: [0xd8a020, 0x2a2a2a], weapons: ['pistol'] },
};

export const TERRITORIES = [
  { id: 'zf', name: 'Zona Franca', x: -980, z: 640, r: 200, owner: 'llops', spots: [[-950, 560], [-1080, 760], [-820, 700]] },
  { id: 'moll', name: 'Muelles del Port', x: -450, z: 720, r: 140, owner: 'llops', spots: [[-420, 690], [-560, 700]] },
  { id: 'raval', name: 'El Raval', x: -160, z: 280, r: 120, owner: 'corbs', spots: [[-200, 220], [-100, 360], [-240, 330]] },
  { id: 'poblesec', name: 'Poble-sec', x: -380, z: 90, r: 100, owner: 'corbs', spots: [[-400, 60], [-330, 140]] },
  { id: 'pn', name: 'Poblenou industrial', x: 1010, z: 160, r: 170, owner: 'banda22', spots: [[1050, 100], [930, 260], [1120, 300]] },
  { id: 'sants', name: 'La Bordeta', x: -1000, z: -120, r: 140, owner: 'banda22', spots: [[-1040, -60], [-950, -200]] },
];

export class Gangs {
  constructor(game) {
    this.game = game;
    this.groups = new Map(); // clave spot -> {peds}
    this.t = 0;
    this.war = null;
    for (const t of TERRITORIES) { t.heat = 0; t.spots = t.spots.map(([x, z]) => { const p = game.world.sidewalkPoint(x, z); return { x: p.x, z: p.z }; }); }
    events.on('pedKilled', (e) => this.onKill(e));
    this.lastIncomeDay = 0;
  }

  get territories() { return TERRITORIES; }
  gangColor(id) { return GANGS[id].color; }
  gangName(id) { return GANGS[id].name; }

  territoryAt(x, z) {
    return TERRITORIES.find((t) => dist2(x, z, t.x, t.z) < t.r) || null;
  }

  owned() { return TERRITORIES.filter((t) => t.owner === 'player'); }

  look(gang) {
    const G = GANGS[gang];
    return { shirt: rand.pick(G.shirt), pants: 0x1e1e1e, hat: rand() < 0.4 ? rand.pick(G.shirt) : null, lookKind: 'gang' };
  }

  spawnMember(gang, x, z, territory) {
    const g = this.game;
    const G = GANGS[gang];
    const friendly = gang === 'player';
    const lk = this.look(gang);
    const look = { ...randomLook('gang'), shirt: lk.shirt, pants: lk.pants, hat: lk.hat };
    const p = g.peds.create(friendly ? 'civil' : 'gang', x, z, { look, weapon: rand.pick(G.weapons), ammo: 120 });
    p.gangId = gang;
    p.territory = territory;
    p.brave = true;
    p.pose = rand() < 0.6 ? 'chat' : 'idle';
    p.health = p.maxHealth = 110;
    return p;
  }

  /** Grupos en las esquinas de cada territorio cuando el jugador se acerca. */
  manage() {
    const g = this.game, pl = g.player;
    for (const t of TERRITORIES) {
      for (const s of t.spots) {
        const key = t.id + ':' + s.x.toFixed(0);
        const d = dist2(pl.x, pl.z, s.x, s.z);
        let grp = this.groups.get(key);
        if (grp) grp.peds = grp.peds.filter((p) => !p.removed);
        if (!grp && d < 110 && d > 35 && !g.isVisible(s.x, 1, s.z, 3)) {
          const n = t.owner === 'player' ? 2 : rand.int(3, 5);
          const peds = [];
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const x = s.x + Math.cos(a) * 1.2, z = s.z + Math.sin(a) * 1.2;
            if (g.world.collision.resolveCircle(x, z, 0.4, g.world.groundHeight(x, z), 1.7).hit) continue;
            const p = this.spawnMember(t.owner, x, z, t);
            p.faceTo = { x: s.x, z: s.z };
            p.heading = Math.atan2(s.x - x, s.z - z);
            peds.push(p);
          }
          this.groups.set(key, { peds, spot: s, t, warned: false });
        } else if (grp && d > 170) {
          for (const p of grp.peds) if (p.alive) g.peds.remove(p);
          this.groups.delete(key);
        }
      }
    }
  }

  /** Reacción de los grupos: aviso, luego ataque. */
  behave(dt) {
    const g = this.game, pl = g.player;
    for (const grp of this.groups.values()) {
      if (grp.t.owner === 'player') {
        for (const p of grp.peds) if (p.alive && !p.greeted && dist2(p.x, p.z, pl.x, pl.z) < 5) { p.greeted = true; p.say(rand.pick(['¡Jefe!', 'Todo tranquilo por aquí, jefe.', 'El barrio es nuestro.']), 2.5); }
        continue;
      }
      const alive = grp.peds.filter((p) => p.alive);
      if (!alive.length) continue;
      const d = Math.min(...alive.map((p) => dist2(p.x, p.z, pl.x, pl.z)));
      const hostile = alive.some((p) => p.task && p.task.type === 'attack');
      if (hostile) {
        for (const p of alive) if (!p.task || p.task.type !== 'attack') { p.pose = null; p.task = { type: 'attack', target: pl }; }
        continue;
      }
      const armed = pl.weapon.ranged && (pl.aiming || pl.fireT > -1.5);
      if (d < 10 && !grp.warned) { grp.warned = true; alive[0].say('gang', 3); }
      if (d < 3.5 || (armed && d < 18) || (pl.vehicle && pl.vehicle.speed > 8 && d < 6)) {
        for (const p of alive) { p.pose = null; p.task = { type: 'attack', target: pl }; }
        alive[0].say('¡A por él!', 2);
      }
    }
  }

  onKill(e) {
    const p = e.ped;
    if (!p.gangId || p.gangId === 'player' || e.killer !== this.game.player) return;
    const t = p.territory || this.territoryAt(p.x, p.z);
    if (!t || t.owner === 'player') return;
    t.heat += 1;
    t.heatT = 180;
    if (this.war && this.war.t === t) this.war.killed++;
    else if (t.heat >= 6 && !this.war && !this.game.missions.active) this.startWar(t);
    else if (t.heat === 3) this.game.hud.notify(`<b style="color:${GANGS[t.owner].color}">${GANGS[t.owner].name}</b> te tienen fichado. Sigue y empezará una guerra por <b>${t.name}</b>.`);
  }

  startWar(t) {
    const g = this.game;
    this.war = { t, wave: 0, killed: 0, enemies: [], waveT: 3 };
    g.hud.big('GUERRA DE BANDAS', `${GANGS[t.owner].name} defienden ${t.name}`, false, 3.5);
    audio.play('alarm');
  }

  updateWar(dt) {
    const g = this.game, pl = g.player, w = this.war;
    const t = w.t;
    if (pl.dead || pl.busted || dist2(pl.x, pl.z, t.x, t.z) > t.r * 1.8) {
      g.hud.big('GUERRA PERDIDA', `Has abandonado ${t.name}`, false);
      for (const e of w.enemies) if (e.alive) { e.task = null; e.persistent = false; }
      t.heat = 0;
      this.war = null;
      g.hud.objective('');
      return;
    }
    w.enemies = w.enemies.filter((e) => !e.removed);
    const alive = w.enemies.filter((e) => e.alive);
    if (!alive.length) {
      w.waveT -= dt;
      if (w.waveT > 0) { g.hud.objective(`Guerra por <b>${t.name}</b>: prepárate para la oleada ${w.wave + 1}/3`); return; }
      if (w.wave >= 3) { this.conquer(t); return; }
      w.wave++;
      w.waveT = 6;
      const n = 3 + w.wave * 2;
      for (let i = 0; i < n; i++) {
        const a = rand() * Math.PI * 2, r = rand.range(35, 55);
        const sp = g.world.sidewalkPoint(pl.x + Math.cos(a) * r, pl.z + Math.sin(a) * r);
        const e = this.spawnMember(t.owner, sp.x, sp.z, t);
        e.persistent = true;
        e.pose = null;
        e.task = { type: 'attack', target: pl };
        if (w.wave === 3 && i === 0) { e.health = e.maxHealth = 260; e.setWeapon('rifle', 400); e.say('¡Este barrio no es tuyo!', 3); }
        w.enemies.push(e);
        g.blips.add({ x: e.x, z: e.z, follow: e, icon: '●', color: GANGS[t.owner].color, kind: 'enemy', temp: true, war: true });
      }
      audio.play('checkpoint');
    }
    g.hud.objective(`Guerra por <b>${t.name}</b> · oleada ${w.wave}/3 · enemigos: ${alive.length}`);
  }

  conquer(t) {
    const g = this.game;
    const prev = t.owner;
    t.owner = 'player';
    t.heat = 0;
    this.war = null;
    g.blips.list = g.blips.list.filter((b) => !b.war);
    g.hud.objective('');
    g.hud.big('TERRITORIO CONQUISTADO', `${t.name} ya no es de ${GANGS[prev].name}`, true, 4);
    audio.play('success');
    g.economy.add(2500, 'Botín de la guerra');
    g.stats.territories = this.owned().length;
    // Los grupos rivales desaparecen; los tuyos ocuparán las esquinas
    for (const [k, grp] of this.groups) if (grp.t === t) { for (const p of grp.peds) if (p.alive) g.peds.remove(p); this.groups.delete(k); }
    g.save.save();
  }

  update(dt) {
    const g = this.game;
    this.t -= dt;
    if (this.t <= 0) { this.t = 1.2; this.manage(); }
    this.behave(dt);
    if (this.war) this.updateWar(dt);
    for (const t of TERRITORIES) if (t.heat > 0 && !this.war) { t.heatT -= dt; if (t.heatT <= 0) t.heat = 0; }
    // Ingresos diarios de los territorios propios
    const sky = g.world.sky;
    if (sky.time >= 8 && sky.time < 8.5 && this.lastIncomeDay !== g.economy.day) {
      this.lastIncomeDay = g.economy.day;
      const n = this.owned().length;
      if (n) g.economy.add(n * 700, `Protección de ${n} territorio${n > 1 ? 's' : ''}`);
    }
  }

  serialize() { return Object.fromEntries(TERRITORIES.map((t) => [t.id, t.owner])); }
  load(o) { if (o) for (const t of TERRITORIES) if (o[t.id]) t.owner = o[t.id]; }
}

export { formatMoney };
