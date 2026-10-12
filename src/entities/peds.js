// Peatones: navegación por aceras, reacciones, combate y tareas de IA.

import * as THREE from 'three';
import { Humanoid, randomLook } from './humanoid.js';
import { clamp, wrapAngle, rand, dist2, dampAngle, damp, weightedPick } from '../core/utils.js';
import { events } from '../core/events.js';
import { audio } from '../core/audio.js';
import { isBeach, isWater, SEA_LEVEL } from '../world/terrain.js';
import { zoneAt } from '../world/layout.js';

const LINES = {
  greet: ['Bon dia!', 'Hola!', 'Bona tarda', 'Ei, què tal?', 'Adéu!', '¡Buenas!'],
  bump: ['Ei, compte!', '¡Mira por dónde vas!', 'Perdona?!', 'Vigila, home!', 'Ep!'],
  scared: ['¡Socorro!', 'Ajuda!', 'Policia!', '¡Corred!', '¡Está loco!', 'Mare meva!'],
  angry: ['Què fas?!', '¡Te vas a enterar!', 'Vine aquí!', '¡Ven si te atreves!'],
  tourist: ['Where is the beach?', 'Sagrada Família?', 'Qué bonita ciudad', 'Une photo?', 'Wo ist die Rambla?', 'Paella, paella!'],
  chatter: ['Quina calor avui...', 'Has vist el Barça?', 'El metro va fatal', 'Els lloguers són impossibles', 'Anem a fer un vermut?', 'Quina cua per entrar...', 'Demà plourà'],
  surrender: ['¡No dispares!', 'Tranquil, tranquil!', '¡Toma, toma, llévatelo!'],
  police: ['¡Alto, policía!', '¡Al suelo!', '¡Quieto!', 'Mans enlaire!'],
  gang: ['Aquí no pintes res', '¡A por él!', 'Mal lloc, amic', '¡Este es nuestro barrio!'],
  hurt: ['Ai!', '¡Ay!', 'Uf...'],
};
export function line(kind) { return rand.pick(LINES[kind]); }

let nextPedId = 1;

export class Ped {
  constructor(game, look, role = 'civil') {
    this.id = nextPedId++;
    this.isPed = true;
    this.game = game;
    this.look = look;
    this.role = role;
    this.model = new Humanoid(look);
    this.x = 0; this.z = 0; this.y = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.heading = 0;
    this.health = role === 'police' ? 120 : role === 'gang' ? 110 : 100;
    this.maxHealth = this.health;
    this.armor = 0;
    this.alive = true;
    this.state = 'walk';
    this.task = null;
    this.walkSpeed = rand.range(1.1, 1.6) * (role === 'elder' ? 0.7 : 1);
    this.weapon = null;
    this.ammo = 0;
    this.fireT = 0;
    this.downT = 0;
    this.deadT = 0;
    this.sayT = 0;
    this.bubble = null;
    this.vehicle = null;
    this.edge = null; this.from = 0; this.to = 0; this.side = 1;
    this.brave = rand() < (role === 'gang' ? 1 : role === 'police' ? 1 : 0.12);
    this.wanderTarget = null;
    this.idleT = 0;
    this.persistent = false;
    this.inScene = false;
    this.radius = 0.32;
    this.aimed = 0;
    this.phone = rand() < 0.15;
    this.money = rand.int(5, 60);
    this.speed = 0;
  }

  get pos() { return { x: this.x, y: this.y, z: this.z }; }

  say(kind, dur = 2.2) {
    const text = LINES[kind] ? line(kind) : kind;
    this.bubble = { text, t: dur };
  }

  setWeapon(w, ammo = 60) {
    this.weapon = w;
    this.ammo = ammo;
    this.model.setHeld(w);
  }

  placeAt(x, z, heading = 0) {
    this.x = x; this.z = z;
    this.y = this.game.world.groundHeight(x, z);
    this.heading = heading;
    this.model.root.position.set(x, this.y, z);
  }
}

export class PedManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.target = 42;
    this.spawnT = 0;
    this.bubbleEls = new Map();
    events.on('gunshot', (e) => this.panic(e.x, e.z, 55, e.shooter));
    events.on('explosion', (e) => this.panic(e.x, e.z, 80, null));
    events.on('melee', (e) => this.panic(e.x, e.z, 12, e.attacker, 0.5));
  }

  add(ped, inScene = true) {
    this.list.push(ped);
    if (inScene) { this.game.scene.add(ped.model.root); ped.inScene = true; }
    return ped;
  }

  remove(ped) {
    const i = this.list.indexOf(ped);
    if (i >= 0) this.list.splice(i, 1);
    ped.model.root.removeFromParent();
    ped.inScene = false;
    ped.removed = true;
  }

  create(role, x, z, opts = {}) {
    const kind = opts.lookKind || role;
    const ped = new Ped(this.game, opts.look || randomLook(kind), role);
    ped.placeAt(x, z, opts.heading ?? rand() * Math.PI * 2);
    if (opts.weapon) ped.setWeapon(opts.weapon, opts.ammo ?? 90);
    if (opts.persistent) ped.persistent = true;
    this.add(ped);
    return ped;
  }

  /** Conductor (no visible hasta que sale del coche). */
  createDriver(v) {
    const role = v.T.police ? 'police' : 'civil';
    const ped = new Ped(this.game, randomLook(role === 'police' ? 'police' : rand() < 0.15 ? 'worker' : 'civil'), role);
    ped.state = 'inVehicle';
    ped.vehicle = v;
    ped.x = v.x; ped.z = v.z;
    this.add(ped, false);
    return ped;
  }

  /** Saca a un ocupante del vehículo (robo de coche o huida). */
  ejectFrom(v, ped, reaction = 'flee') {
    if (!ped || !ped.isPed) return;
    const d = v.doorPos();
    ped.vehicle = null;
    if (v.driver === ped) v.driver = null;
    v.passengers = v.passengers.filter((p) => p !== ped);
    ped.placeAt(d.x, d.z, v.heading + Math.PI / 2);
    if (!ped.inScene) { this.game.scene.add(ped.model.root); ped.inScene = true; }
    ped.state = 'walk';
    if (reaction === 'flee') { this.setFlee(ped, this.game.player.x, this.game.player.z, 14); ped.say('scared'); }
    else if (reaction === 'fight') { ped.task = { type: 'attack', target: this.game.player }; ped.say('angry'); }
    else if (reaction === 'down') { this.knock(ped, (d.x - v.x) * 2, (d.z - v.z) * 2, 0); }
  }

  setFlee(ped, fx, fz, t = 10) {
    if (!ped.alive || ped.role === 'police' || ped.role === 'gang' || ped.task?.type === 'attack' || ped.persistent) return;
    ped.task = { type: 'flee', fx, fz, t };
    ped.state = 'run';
  }

  /** Pánico general ante disparos o explosiones. */
  panic(x, z, radius, source, chance = 1) {
    for (const p of this.list) {
      if (!p.alive || p.state === 'inVehicle' || p.persistent) continue;
      const d = dist2(p.x, p.z, x, z);
      if (d > radius || rand() > chance) continue;
      if (p.role === 'civil' || p.role === 'tourist' || p.role === 'worker' || p.role === 'elder' || p.role === 'beach') {
        if (rand() < 0.25 && d < radius * 0.5) { p.task = { type: 'cower', t: rand.range(4, 8) }; }
        else this.setFlee(p, x, z, rand.range(8, 15));
        if (rand() < 0.3) p.say('scared');
      }
    }
    // Los conductores también aceleran
    for (const v of this.game.vehicles.list) {
      if (v.ai && v.ai.kind === 'lane' && dist2(v.x, v.z, x, z) < radius) v.ai.panicT = 15;
    }
  }

  /** Atropello o empujón fuerte. */
  knock(ped, vx, vz, damage, attacker = null, cause = 'vehicle') {
    if (!ped.alive) return;
    ped.vx = vx; ped.vz = vz;
    ped.vy = Math.min(6, Math.hypot(vx, vz) * 0.25);
    ped.state = 'down';
    ped.downT = rand.range(2.2, 3.5);
    ped.task = null;
    if (damage > 0) this.damage(ped, damage, attacker, cause);
  }

  damage(ped, amount, attacker = null, cause = 'misc') {
    if (!ped.alive) return;
    if (ped.invulnerable) return;
    if (ped.armor > 0) { const a = Math.min(ped.armor, amount * 0.7); ped.armor -= a; amount -= a; }
    ped.health -= amount;
    ped.lastAttacker = attacker;
    if (ped.onDamage) ped.onDamage(amount, attacker, cause);
    if (ped.health <= 0) {
      this.kill(ped, attacker, cause);
      return;
    }
    if (amount > 4) ped.say('hurt', 1);
    // Reacción
    if (attacker && attacker === this.game.player) {
      if (ped.role === 'police' || ped.role === 'gang' || ped.brave) {
        if (!ped.task || ped.task.type !== 'attack') { ped.task = { type: 'attack', target: attacker }; if (ped.role !== 'police') ped.say('angry'); }
      } else if (ped.state !== 'down') {
        this.setFlee(ped, attacker.x, attacker.z, 15);
        ped.say('scared');
      }
      this.game.reportCrime(ped.role === 'police' ? 'assaultCop' : 'assault', ped.x, ped.z, ped);
    }
  }

  kill(ped, killer = null, cause = 'misc') {
    if (!ped.alive) return;
    ped.alive = false;
    ped.health = 0;
    ped.state = 'dead';
    ped.deadT = 0;
    ped.task = null;
    ped.model.setHeld(null);
    if (ped.vehicle) {
      const v = ped.vehicle;
      if (v.driver === ped) v.driver = null;
      ped.vehicle = null;
      if (!ped.inScene) { const d = v.doorPos(); ped.placeAt(d.x, d.z); this.game.scene.add(ped.model.root); ped.inScene = true; }
    }
    events.emit('pedKilled', { ped, killer, cause, x: ped.x, z: ped.z });
    if (killer === this.game.player) {
      this.game.reportCrime(ped.role === 'police' ? 'killCop' : 'murder', ped.x, ped.z, ped);
      this.game.stats.kills++;
      // Botín
      if (ped.role !== 'police' && rand() < 0.7) this.game.pickups.spawnCash(ped.x, ped.z, ped.money);
      if (ped.weapon && ped.weapon !== 'bat' && ped.weapon !== 'knife') this.game.pickups.spawnWeapon(ped.x + 0.5, ped.z, ped.weapon, Math.max(12, Math.floor(ped.ammo / 3)));
    }
  }

  // -------------------------------------------------------------------------
  populate(dt) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 0.3;
    const g = this.game;
    const p = g.focus();
    for (const ped of [...this.list]) {
      if (ped.persistent || ped.state === 'inVehicle') continue;
      const d = dist2(ped.x, ped.z, p.x, p.z);
      if (d > 150 || (!ped.alive && ped.deadT > 45 && d > 30)) {
        if (!g.isVisible(ped.x, ped.y + 1, ped.z, 1.5) || d > 200) this.remove(ped);
      }
    }
    const walking = this.list.filter((q) => q.state !== 'inVehicle' && !q.persistent && q.role !== 'police').length;
    const want = Math.round(this.target * g.pedDensity());
    if (walking >= want) return;
    for (let tries = 0; tries < 5; tries++) {
      const a = rand() * Math.PI * 2, r = rand.range(35, 110);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (this.spawnAround(x, z, p)) break;
    }
  }

  spawnAround(x, z, p) {
    const g = this.game;
    const W = g.world;
    const dist = W.districtId(x, z);
    // Playa: bañistas
    if (isBeach(x, z)) {
      if (g.isVisible(x, 1, z, 1.5) && dist2(x, z, p.x, p.z) < 60) return false;
      const ped = this.create('beach', x, z, { lookKind: 'beach' });
      ped.wanderZone = 'beach';
      ped.walkSpeed *= 0.7;
      return true;
    }
    if (isWater(x, z)) return false;
    // Parques y plazas: paseantes
    const zn = zoneAt(x, z, ['park', 'plaza']);
    if (zn && W.collision.resolveCircle(x, z, 0.5, W.groundHeight(x, z), 1.7).hit === false) {
      if (g.isVisible(x, W.groundHeight(x, z) + 1, z, 1.5) && dist2(x, z, p.x, p.z) < 70) return false;
      const role = rand() < 0.4 ? 'tourist' : rand() < 0.2 ? 'elder' : 'civil';
      const ped = this.create(role, x, z, { lookKind: role });
      ped.wanderZone = zn;
      return true;
    }
    const R = W.roads;
    const ne = R.nearestEdge(x, z, 50, (e) => e.type !== 'highway' && e.type !== 'mountain' || rand() < 0.1);
    if (!ne) return false;
    const e = ne.edge;
    const side = rand() < 0.5 ? 1 : -1;
    const off = e.type === 'promenade' ? rand.range(-e.w / 2 + 1.5, e.w / 2 - 1.5) : (e.w / 2 + Math.max(0.7, e.sidewalk * 0.55)) * side;
    const s = ne.t * e.len;
    const A = R.nodes[e.a];
    const sx = A.x + e.dx * s - e.dz * off, sz = A.z + e.dz * s + e.dx * off;
    if (dist2(sx, sz, p.x, p.z) < 30) return false;
    if (g.isVisible(sx, W.groundHeight(sx, sz) + 1, sz, 1.5) && dist2(sx, sz, p.x, p.z) < 75) return false;
    if (W.collision.resolveCircle(sx, sz, 0.35, W.groundHeight(sx, sz), 1.7).hit) return false;
    const touristy = ['gotic', 'barceloneta', 'born'].includes(dist) || e.name === 'La Rambla' || e.name === 'Passeig de Gràcia' || dist2(sx, sz, 352, -372) < 120;
    const role = weightedPick(rand, [
      ['civil', 60], ['tourist', touristy ? 55 : 6], ['worker', dist === 'zonafranca' || dist === 'poblenou' ? 30 : 6], ['elder', 9],
    ]);
    const ped = this.create(role, sx, sz, { lookKind: role });
    ped.edge = e;
    const forward = rand() < 0.5;
    ped.from = forward ? e.a : e.b; ped.to = forward ? e.b : e.a;
    ped.offset = off * (forward ? 1 : -1);
    ped.state = 'walk';
    return true;
  }

  // -------------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    const player = g.player;
    const vehicles = g.vehicles.list;
    for (const ped of this.list) {
      if (ped.state === 'inVehicle') {
        if (ped.vehicle) { ped.x = ped.vehicle.x; ped.z = ped.vehicle.z; ped.y = ped.vehicle.y; }
        continue;
      }
      if (ped.bubble) { ped.bubble.t -= dt; if (ped.bubble.t <= 0) ped.bubble = null; }
      if (!ped.alive) {
        ped.deadT += dt;
        this.physics(ped, dt, true);
        ped.model.animate(dt, 'dead', 0);
        continue;
      }
      if (ped.state === 'down') {
        ped.downT -= dt;
        this.physics(ped, dt, true);
        ped.model.animate(dt, 'fall', 0);
        if (ped.downT <= 0) {
          ped.state = 'walk';
          if (ped.brave && ped.lastAttacker === player) ped.task = { type: 'attack', target: player };
          else this.setFlee(ped, player.x, player.z, 10);
        }
        continue;
      }
      const d2p = dist2(ped.x, ped.z, player.x, player.z);
      if (d2p > 160 && !ped.persistent && !ped.task) {
        // LOD: peatones lejanos casi no se simulan
        ped.model.root.visible = false;
        continue;
      }
      ped.model.root.visible = true;
      this.think(ped, dt, d2p);
      this.physics(ped, dt, false);
      // Atropellos
      for (const v of vehicles) {
        const dx = ped.x - v.x, dz = ped.z - v.z;
        const R = v.T.len / 2 + 0.5;
        if (dx * dx + dz * dz > R * R) continue;
        if (Math.abs(ped.y - v.y) > 2.5) continue;
        const fx = v.fx, fz = v.fz;
        const lf = dx * fx + dz * fz, ls = dx * -fz + dz * fx;
        const hw = (v.isBike ? 0.45 : v.T.wid / 2) + ped.radius, hl = v.T.len / 2 + ped.radius;
        if (Math.abs(lf) > hl || Math.abs(ls) > hw) continue;
        const spd = v.speed;
        if (spd > 3.2) {
          const driverIsPlayer = player.vehicle === v;
          this.knock(ped, v.vx * 0.8 + (ls > 0 ? -fz : fz) * 2, v.vz * 0.8 + (ls > 0 ? fx : -fx) * 2, spd * spd * 0.55, driverIsPlayer ? player : v.driver, 'vehicle');
          audio.play('punch', ped.x, ped.z);
          if (driverIsPlayer) { g.reportCrime('runOver', ped.x, ped.z, ped); g.camera.shake(0.15); }
          if (v.ai && v.ai.kind === 'lane') v.ai.panicT = 4;
          break;
        } else {
          // Empuje lateral
          const push = hw - Math.abs(ls) + 0.05;
          ped.x += -fz * Math.sign(ls || 1) * push;
          ped.z += fx * Math.sign(ls || 1) * push;
        }
      }
      // Animación
      const spd = Math.hypot(ped.vx, ped.vz);
      ped.speed = spd;
      let anim = spd > 3.5 ? 'run' : spd > 0.3 ? 'walk' : 'idle';
      if (ped.state === 'cower') anim = 'cower';
      if (ped.state === 'surrender') anim = 'surrender';
      if (ped.state === 'swim') anim = 'swim';
      const aiming = ped.task && ped.task.type === 'attack' && ped.weapon && ped.weapon !== 'bat' && ped.weapon !== 'knife' && ped.aimingNow;
      ped.model.animate(dt, anim, spd, { aim: aiming, phone: ped.phone && anim === 'walk' && !ped.task, carry: false });
    }
    this.separate();
  }

  /** Decide qué hace cada peatón. */
  think(ped, dt, d2p) {
    const g = this.game, player = g.player;
    ped.aimingNow = false;
    let tx = null, tz = null, speed = 0;
    const T = ped.task;
    if (ped.controller) {
      const r = ped.controller(dt, ped);
      if (r) { tx = r.x; tz = r.z; speed = r.speed; }
    } else if (T) {
      switch (T.type) {
        case 'flee': {
          T.t -= dt;
          const dx = ped.x - T.fx, dz = ped.z - T.fz;
          const l = Math.hypot(dx, dz) || 1;
          tx = ped.x + dx / l * 10; tz = ped.z + dz / l * 10;
          speed = 5.5;
          ped.state = 'run';
          if (T.t <= 0) { ped.task = null; ped.state = 'walk'; this.reattach(ped); }
          break;
        }
        case 'cower':
          T.t -= dt;
          ped.state = 'cower';
          if (T.t <= 0) { ped.task = null; ped.state = 'walk'; this.setFlee(ped, player.x, player.z, 8); }
          break;
        case 'surrender':
          T.t -= dt;
          ped.state = 'surrender';
          if (T.t <= 0) { ped.task = null; ped.state = 'walk'; this.setFlee(ped, player.x, player.z, 10); }
          break;
        case 'goto': {
          const d = dist2(ped.x, ped.z, T.x, T.z);
          if (d < (T.r || 1.2)) { const cb = T.onArrive; ped.task = T.then || null; ped.state = 'idle'; if (cb) cb(ped); }
          else { tx = T.x; tz = T.z; speed = T.run ? 5 : ped.walkSpeed; }
          break;
        }
        case 'follow': {
          const t = T.target;
          const d = dist2(ped.x, ped.z, t.x, t.z);
          if (d > (T.dist || 2.5)) { tx = t.x; tz = t.z; speed = d > 8 ? 5.5 : 2.5; }
          break;
        }
        case 'stand':
          if (T.face) ped.heading = dampAngle(ped.heading, Math.atan2(T.face.x - ped.x, T.face.z - ped.z), 4, dt);
          break;
        case 'attack': {
          const r = this.combat(ped, T.target, dt);
          if (r) { tx = r.x; tz = r.z; speed = r.speed; }
          break;
        }
      }
    } else if (ped.wanderZone) {
      // Paseo libre en playas, parques y plazas
      if (!ped.wanderTarget || dist2(ped.x, ped.z, ped.wanderTarget.x, ped.wanderTarget.z) < 1) {
        ped.idleT -= dt;
        if (ped.idleT <= 0) {
          const a = rand() * Math.PI * 2, r = rand.range(5, 25);
          const nx = ped.x + Math.cos(a) * r, nz = ped.z + Math.sin(a) * r;
          const ok = ped.wanderZone === 'beach' ? isBeach(nx, nz) : !!zoneAt(nx, nz, ['park', 'plaza']);
          if (ok) ped.wanderTarget = { x: nx, z: nz };
          ped.idleT = rand.range(1, 6);
        }
      } else { tx = ped.wanderTarget.x; tz = ped.wanderTarget.z; speed = ped.walkSpeed; }
    } else if (ped.edge) {
      // Caminar por la acera
      const R = g.world.roads;
      const A = R.nodes[ped.from], B = R.nodes[ped.to];
      const e = ped.edge;
      const dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len;
      const s = (ped.x - A.x) * dx + (ped.z - A.z) * dz;
      if (s > e.len - 1) {
        // Siguiente tramo (prefiere seguir recto)
        const n = B;
        const opts = n.edges.map((id) => R.edges[id]).filter((x) => x.id !== e.id && x.type !== 'highway');
        if (opts.length) {
          const ne = rand.pick(opts);
          const from = ped.to;
          ped.from = from; ped.to = R.otherNode(ne, from); ped.edge = ne;
          const sign = ne.a === from ? 1 : -1;
          ped.offset = ne.type === 'promenade' ? rand.range(-ne.w / 2 + 1.5, ne.w / 2 - 1.5) : (ne.w / 2 + Math.max(0.7, ne.sidewalk * 0.55)) * Math.sign(ped.offset || 1);
          void sign;
        } else { const t = ped.from; ped.from = ped.to; ped.to = t; ped.offset = -ped.offset; }
      } else {
        const look = Math.min(e.len, s + 3);
        tx = A.x + dx * look - dz * ped.offset;
        tz = A.z + dz * look + dx * ped.offset;
        speed = ped.walkSpeed;
      }
      // Paradas ocasionales
      ped.idleT -= dt;
      if (ped.idleT < -rand.range(8, 30)) ped.idleT = rand.range(1.5, 5);
      if (ped.idleT > 0) speed = 0;
    } else {
      this.reattach(ped);
    }

    // Reacciones al jugador
    if (!T && !ped.controller && ped.alive) {
      if (player.aimingAt === ped && d2p < 18 && player.weapon.ranged) {
        ped.aimed += dt;
        if (ped.aimed > 0.4 && ped.role !== 'police' && ped.role !== 'gang') {
          if (ped.brave && rand() < 0.3) ped.task = { type: 'attack', target: player };
          else { ped.task = { type: 'surrender', t: 4 }; ped.say('surrender'); }
        }
      } else ped.aimed = 0;
      // Esquivar coches que se acercan rápido
      if (player.vehicle && d2p < 9 && player.vehicle.speed > 8) {
        const v = player.vehicle;
        const rel = (ped.x - v.x) * v.fx + (ped.z - v.z) * v.fz;
        if (rel > 0 && rand() < dt * 4) {
          const side = ((ped.x - v.x) * -v.fz + (ped.z - v.z) * v.fx) > 0 ? 1 : -1;
          ped.vx += -v.fz * side * 6; ped.vz += v.fx * side * 6;
          ped.say('scared', 1.2);
        }
      }
      // Saludos y charla
      ped.sayT -= dt;
      if (ped.sayT <= 0) {
        ped.sayT = rand.range(8, 25);
        if (d2p < 8 && !player.vehicle && rand() < 0.4) ped.say(ped.role === 'tourist' ? 'tourist' : 'greet');
        else if (d2p < 20 && rand() < 0.08) ped.say(ped.role === 'tourist' ? 'tourist' : 'chatter', 3);
      }
    }

    // Movimiento hacia el objetivo
    if (tx !== null && speed > 0) {
      const th = Math.atan2(tx - ped.x, tz - ped.z);
      ped.heading = dampAngle(ped.heading, th, 8, dt);
      const vx = Math.sin(ped.heading) * speed, vz = Math.cos(ped.heading) * speed;
      ped.vx = damp(ped.vx, vx, 6, dt);
      ped.vz = damp(ped.vz, vz, 6, dt);
    } else {
      ped.vx = damp(ped.vx, 0, 8, dt);
      ped.vz = damp(ped.vz, 0, 8, dt);
    }
  }

  /** Combate a pie: armas de fuego a distancia, cuerpo a cuerpo de cerca. */
  combat(ped, target, dt) {
    const g = this.game;
    if (!target || target.alive === false || (target.isPlayer && (target.dead || target.busted))) { ped.task = null; return null; }
    const tx = target.x, tz = target.z;
    const d = dist2(ped.x, ped.z, tx, tz);
    const ranged = ped.weapon && ped.weapon !== 'bat' && ped.weapon !== 'knife' && ped.ammo > 0;
    ped.fireT -= dt;
    if (ranged) {
      const ideal = ped.role === 'police' ? 11 : 9;
      const los = g.lineOfSight(ped.x, ped.y + 1.5, ped.z, tx, (target.y || 0) + 1.2, tz);
      ped.heading = dampAngle(ped.heading, Math.atan2(tx - ped.x, tz - ped.z), 10, dt);
      if (d < 35 && los) {
        ped.aimingNow = true;
        if (ped.fireT <= 0 && (ped.allowFire !== false)) {
          g.combat.npcShoot(ped, target);
          ped.fireT = ped.weapon === 'smg' ? 0.14 : ped.weapon === 'shotgun' ? 1.2 : ped.weapon === 'rifle' ? 0.25 : rand.range(0.6, 1.1);
          if (ped.weapon === 'smg' && rand() < 0.15) ped.fireT = 1.0;
        }
        if (d > ideal + 6) return { x: tx, z: tz, speed: 3 };
        if (d < 4) return { x: ped.x - (tx - ped.x), z: ped.z - (tz - ped.z), speed: 2.5 };
        // Movimiento lateral ocasional
        if (!ped.strafe || ped.strafe.t <= 0) ped.strafe = { t: rand.range(1, 2.5), dir: rand() < 0.5 ? 1 : -1, move: rand() < 0.5 };
        ped.strafe.t -= dt;
        if (ped.strafe.move) {
          const px = -(tz - ped.z) / d * ped.strafe.dir, pz = (tx - ped.x) / d * ped.strafe.dir;
          return { x: ped.x + px * 3, z: ped.z + pz * 3, speed: 2.2 };
        }
        return null;
      }
      return { x: tx, z: tz, speed: 5 };
    }
    // Cuerpo a cuerpo
    if (d > 1.3) return { x: tx, z: tz, speed: d > 4 ? 5.2 : 3 };
    ped.heading = dampAngle(ped.heading, Math.atan2(tx - ped.x, tz - ped.z), 10, dt);
    if (ped.fireT <= 0) {
      ped.fireT = rand.range(0.7, 1.2);
      ped.model.punch();
      audio.play('swing', ped.x, ped.z);
      setTimeout(() => {
        if (!ped.alive || ped.state === 'down') return;
        if (dist2(ped.x, ped.z, target.x, target.z) < 1.8) {
          const dmg = ped.weapon === 'bat' ? 14 : ped.weapon === 'knife' ? 18 : 7;
          g.combat.applyDamage(target, dmg, ped, 'melee', { x: target.x - ped.x, z: target.z - ped.z });
          audio.play('punch', target.x, target.z);
        }
      }, 150);
    }
    return null;
  }

  reattach(ped) {
    const R = this.game.world.roads;
    const ne = R.nearestEdge(ped.x, ped.z, 60, (e) => e.type !== 'highway');
    if (!ne) return;
    const e = ne.edge;
    ped.edge = e;
    const fwd = rand() < 0.5;
    ped.from = fwd ? e.a : e.b; ped.to = fwd ? e.b : e.a;
    const side = ((ped.x - ne.x) * -e.dz + (ped.z - ne.z) * e.dx) >= 0 ? 1 : -1;
    const off = e.type === 'promenade' ? rand.range(-3, 3) : (e.w / 2 + Math.max(0.7, e.sidewalk * 0.55)) * side;
    ped.offset = off * (fwd ? 1 : -1);
  }

  physics(ped, dt, sliding) {
    const W = this.game.world;
    if (sliding) {
      ped.vx = damp(ped.vx, 0, ped.alive ? 3 : 4, dt);
      ped.vz = damp(ped.vz, 0, ped.alive ? 3 : 4, dt);
    }
    ped.x += ped.vx * dt;
    ped.z += ped.vz * dt;
    const gh = W.groundHeight(ped.x, ped.z);
    if (ped.y > gh + 0.05 || ped.vy > 0) {
      ped.vy -= 18 * dt;
      ped.y += ped.vy * dt;
      if (ped.y < gh) { ped.y = gh; ped.vy = 0; }
    } else ped.y = gh;
    // Agua
    if (isWater(ped.x, ped.z) && gh < SEA_LEVEL - 0.6) {
      ped.y = SEA_LEVEL - 0.9;
      if (ped.alive && ped.state !== 'down') { ped.state = 'swim'; }
    } else if (ped.state === 'swim') ped.state = 'walk';
    const r = W.collision.resolveCircle(ped.x, ped.z, ped.radius, ped.y + 0.2, 1.6);
    if (r.hit) {
      ped.x = r.x; ped.z = r.z;
      if (!sliding && ped.edge && !ped.task && rand() < 0.02) this.reattach(ped);
    }
    ped.model.root.position.set(ped.x, ped.y, ped.z);
    ped.model.root.rotation.y = ped.heading;
  }

  /** Separación simple entre peatones y con el jugador. */
  separate() {
    const L = this.list;
    const pl = this.game.player;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.state === 'inVehicle' || !a.alive) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.state === 'inVehicle' || !b.alive) continue;
        const dx = a.x - b.x, dz = a.z - b.z;
        if (Math.abs(dx) > 0.7 || Math.abs(dz) > 0.7) continue;
        const d = Math.hypot(dx, dz);
        if (d < 0.6 && d > 1e-4) {
          const p = (0.6 - d) / 2;
          a.x += dx / d * p; a.z += dz / d * p;
          b.x -= dx / d * p; b.z -= dz / d * p;
        }
      }
      if (!pl.vehicle && !pl.dead) {
        const dx = a.x - pl.x, dz = a.z - pl.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.65 && d > 1e-4) {
          const p = 0.65 - d;
          a.x += dx / d * p; a.z += dz / d * p;
          if (pl.speed > 4 && !a.bumpCD) {
            a.bumpCD = true;
            setTimeout(() => (a.bumpCD = false), 2000);
            if (pl.speed > 6.5 && rand() < 0.35) this.knock(a, dx / d * 3, dz / d * 3, 0);
            a.say('bump', 1.5);
          }
        }
      }
    }
  }

  nearest(x, z, maxD, filter = null) {
    let best = null, bd = maxD;
    for (const p of this.list) {
      if (p.state === 'inVehicle') continue;
      if (filter && !filter(p)) continue;
      const d = dist2(p.x, p.z, x, z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}

export { THREE };
