// Sistema de búsqueda policial: testigos, nivel de estrellas, zona de búsqueda,
// patrullas que persiguen, agentes a pie que detienen o disparan, y helicóptero.

import * as THREE from 'three';
import { clamp, rand, dist2, wrapAngle, damp, dampAngle } from '../core/utils.js';
import { PursuitDriver, LaneDriver } from '../entities/traffic.js';
import { audio } from '../core/audio.js';
import { events } from '../core/events.js';

const CRIMES = {
  shooting: { add: 0, min: 1, witness: true, label: 'Disparos en la vía pública' },
  assault: { add: 0, min: 1, witness: true, label: 'Agresión' },
  assaultCop: { add: 1, min: 2, witness: false, label: 'Agresión a un agente' },
  shootCop: { add: 0, min: 2, witness: false, label: 'Disparos contra la policía' },
  carjack: { add: 0, min: 1, witness: true, label: 'Robo de vehículo con violencia' },
  carTheft: { add: 0, min: 1, witness: true, policeOnly: true, label: 'Robo de vehículo' },
  runOver: { add: 0, min: 1, witness: true, label: 'Atropello' },
  murder: { add: 1, min: 2, witness: true, label: 'Homicidio' },
  killCop: { add: 1, min: 3, witness: false, label: 'Agente abatido' },
  explosion: { add: 0, min: 2, witness: true, label: 'Explosión' },
  robbery: { add: 0, min: 2, witness: false, label: 'Atraco' },
  trespass: { add: 0, min: 1, witness: false, label: 'Allanamiento' },
};

const DISPATCH = [
  'Central: sospechoso visto en {d}.',
  'Central a todas las unidades: {c} en {d}.',
  'Unidad 12, diríjanse a {d}.',
  'Central: el sospechoso huye. Último avistamiento en {d}.',
];

export class Police {
  constructor(game) {
    this.game = game;
    this.level = 0;
    this.heat = 0; // tiempo acumulado para subir de nivel
    this.lastKnown = { x: 0, z: 0 };
    this.seenT = 0;
    this.unseenT = 0;
    this.evadeT = 0;
    this.units = []; // vehículos policiales activos
    this.officers = [];
    this.pending = [];
    this.spawnT = 0;
    this.heli = null;
    this.patrolT = 10;
    this.dispatchT = 0;
    this.blink = false;
  }

  get searchRadius() { return 60 + this.level * 35; }

  reportCrime(type, x, z, victim) {
    const g = this.game;
    if (g.player.dead || g.player.busted || g.noCrime) return;
    const C = CRIMES[type];
    if (!C) return;
    // ¿Lo ha visto algún agente?
    const copSees = this.copsSee(x, z, 55);
    if (copSees) { this.applyCrime(C, x, z); return; }
    if (C.policeOnly && rand() < 0.75) {
      // Los robos de coches sin testigos policiales pocas veces se denuncian
      if (!this.civiliansNear(x, z, 18, victim)) return;
    }
    if (!C.witness) { this.applyCrime(C, x, z); return; }
    if (this.civiliansNear(x, z, 28, victim)) {
      this.pending.push({ C, x, z, t: rand.range(2, 4) });
    }
  }

  civiliansNear(x, z, r, exclude) {
    for (const p of this.game.peds.list) {
      if (p === exclude || !p.alive || p.state === 'inVehicle' || p.role === 'gang') continue;
      if (dist2(p.x, p.z, x, z) < r) return true;
    }
    for (const v of this.game.vehicles.list) if (v.driver && v.driver.isPed && v.driver.alive && dist2(v.x, v.z, x, z) < r) return true;
    return false;
  }

  copsSee(x, z, r) {
    const g = this.game;
    for (const p of g.peds.list) {
      if (p.role !== 'police' || !p.alive) continue;
      const pv = p.vehicle || p;
      if (dist2(pv.x, pv.z, x, z) < r && g.lineOfSight(pv.x, (pv.y || 0) + 1.6, pv.z, x, g.player.y + 1.2, z)) return true;
    }
    if (this.heli && dist2(this.heli.x, this.heli.z, x, z) < 120) return true;
    return false;
  }

  applyCrime(C, x, z) {
    const before = this.level;
    let lvl = Math.max(this.level + C.add, C.min);
    if (C.add === 0 && this.level >= C.min) lvl = this.level;
    this.setLevel(Math.min(5, lvl));
    this.lastKnown = { x, z };
    this.unseenT = 0;
    this.evadeT = 0;
    if (this.level > before) {
      this.game.hud.notify(`<b>${'★'.repeat(this.level)}</b> ${C.label}. La policía te busca.`);
      this.dispatch(C.label.toLowerCase());
    }
  }

  setLevel(l) {
    const prev = this.level;
    this.level = l;
    if (l === 0 && prev > 0) {
      this.game.hud.notify('Has despistado a la policía.');
      this.standDown();
      events.emit('wantedCleared', {});
    }
    if (l > 0 && prev === 0) events.emit('wantedStarted', { level: l });
    this.game.hud.setWanted(l, false);
  }

  clear() { this.setLevel(0); this.pending = []; this.heat = 0; }

  dispatch(crime = 'actividad sospechosa') {
    const g = this.game;
    const d = g.world.district(g.player.x, g.player.z).name;
    g.hud.subtitle('Radio policial', rand.pick(DISPATCH).replace('{d}', d).replace('{c}', crime), 3.5);
  }

  /** Las patrullas vuelven a la normalidad. */
  standDown() {
    for (const v of this.units) {
      v.siren = false;
      if (v.driver && v.driver.isPed && v.driver.alive) {
        const ne = this.game.world.roads.nearestEdge(v.x, v.z, 80, (e) => !e.noTraffic);
        if (ne) v.ai = new LaneDriver(v, this.game, ne.edge, ne.edge.a);
      } else v.police = false;
      v.persistent = false;
      v.traffic = !!v.driver;
    }
    for (const o of this.officers) {
      if (!o.alive) continue;
      o.controller = null;
      o.task = null;
      o.persistent = false;
      o.allowFire = true;
    }
    this.units = [];
    this.officers = [];
    if (this.heli) { this.heli.leaving = true; }
  }

  // -------------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    const pl = g.player;
    for (const c of [...this.pending]) {
      c.t -= dt;
      if (c.t <= 0) { this.pending.splice(this.pending.indexOf(c), 1); this.applyCrime(c.C, c.x, c.z); }
    }
    this.updatePatrols(dt);
    this.updateHeli(dt);
    // Limpieza de unidades
    this.units = this.units.filter((v) => !v.removed);
    this.officers = this.officers.filter((o) => !o.removed);

    if (this.level === 0 || pl.dead || pl.busted) { g.hud.setWanted(this.level, false); audio.updateSirens(this.sirenList()); return; }

    // ¿Me ven?
    const seen = this.copsSee(pl.x, pl.z, 70 + this.level * 10);
    if (seen) {
      this.lastKnown = { x: pl.x, z: pl.z };
      this.unseenT = 0;
      this.evadeT = 0;
    } else {
      this.unseenT += dt;
      const out = dist2(pl.x, pl.z, this.lastKnown.x, this.lastKnown.z) > this.searchRadius;
      if (out || this.unseenT > 25 + this.level * 6) this.evadeT += dt;
      if (this.evadeT > 5 + this.level * 2.5) this.setLevel(0);
    }
    g.hud.setWanted(this.level, !seen);

    // Mantener unidades
    this.spawnT -= dt;
    const wantCars = [0, 1, 2, 3, 4, 5][this.level];
    let activeCars = this.units.filter((v) => !v.destroyed && v.driver && v.driver.alive).length;
    if (this.spawnT <= 0 && activeCars < wantCars) {
      this.spawnT = 4;
      this.spawnUnit();
    }
    if (this.level >= 4 && !this.heli) this.spawnHeli();
    // Patrullas cercanas que no son nuestras se unen
    for (const v of g.vehicles.list) {
      if (activeCars >= wantCars) break;
      if (v.T.police && !v.isBoat && !v.destroyed && v.driver && v.driver.isPed && v.driver.alive && !this.units.includes(v) && dist2(v.x, v.z, pl.x, pl.z) < 120) { this.recruit(v); activeCars++; }
    }
    // Las unidades sobrantes o destruidas dejan de contar
    this.units = this.units.filter((v) => !v.destroyed || dist2(v.x, v.z, pl.x, pl.z) < 150);
    this.updateUnits(dt);
    this.updateOfficers(dt);
    this.dispatchT -= dt;
    if (this.dispatchT <= 0) { this.dispatchT = rand.range(18, 35); this.dispatch(); }
    audio.updateSirens(this.sirenList());
  }

  sirenList() {
    return this.units.filter((v) => v.siren && !v.destroyed).slice(0, 4).map((v) => ({ id: v.id, x: v.x, z: v.z }));
  }

  /** Crea un coche patrulla con dos agentes cerca del jugador, fuera de la vista. */
  spawnUnit() {
    const g = this.game;
    const R = g.world.roads;
    const pl = g.player;
    for (let k = 0; k < 8; k++) {
      const a = rand() * Math.PI * 2, r = rand.range(90, 170);
      const x = pl.x + Math.cos(a) * r, z = pl.z + Math.sin(a) * r;
      const ne = R.nearestEdge(x, z, 60, (e) => !e.noTraffic && e.type !== 'narrow');
      if (!ne) continue;
      if (g.isVisible(ne.x, g.world.groundHeight(ne.x, ne.z) + 1, ne.z, 3) && dist2(ne.x, ne.z, pl.x, pl.z) < 130) continue;
      if (g.vehicles.isOccupied(ne.x, ne.z, 5)) continue;
      const toward = Math.atan2(pl.x - ne.x, pl.z - ne.z);
      const v = g.vehicles.spawn('police', ne.x, ne.z, toward);
      v.driver = g.peds.createDriver(v);
      v.driver.setWeapon('pistol', 120);
      const partner = g.peds.createDriver(v);
      partner.setWeapon(this.level >= 4 ? 'smg' : this.level >= 3 && rand() < 0.5 ? 'shotgun' : 'pistol', 160);
      v.passengers.push(partner);
      this.recruit(v);
      return v;
    }
    return null;
  }

  recruit(v) {
    const g = this.game;
    v.police = true;
    v.persistent = true;
    v.traffic = false;
    v.siren = true;
    v.ai = new PursuitDriver(v, g, () => (g.player.vehicle || g.player), { ram: this.level >= 3, speed: 34 + this.level * 3, stopDist: 10 });
    this.units.push(v);
    if (v.driver && v.driver.isPed) this.officers.includes(v.driver) || this.officers.push(v.driver);
    for (const p of v.passengers) if (!this.officers.includes(p)) this.officers.push(p);
  }

  updateUnits(dt) {
    const g = this.game, pl = g.player;
    for (const v of this.units) {
      if (v.destroyed || !v.driver || !v.driver.isPed || !v.driver.alive) continue;
      if (v.ai) v.ai.ram = this.level >= 3;
      const d = dist2(v.x, v.z, pl.x, pl.z);
      const plSlow = !pl.vehicle || pl.vehicle.speed < 3;
      // Los agentes bajan del coche si el sospechoso está cerca y a pie (o detenido)
      if (d < 16 && plSlow && v.speed < 4) {
        const crew = [v.driver, ...v.passengers].filter((p) => p && p.isPed && p.alive);
        for (const c of crew) {
          g.peds.ejectFrom(v, c, 'none');
          c.persistent = true;
          c.homeCar = v;
          if (!this.officers.includes(c)) this.officers.push(c);
        }
        v.ai = null;
        v.input = { throttle: 0, brake: 1, steer: 0, handbrake: 1 };
      }
    }
  }

  /** IA de los agentes a pie: detener o disparar. */
  updateOfficers(dt) {
    const g = this.game, pl = g.player;
    for (const o of this.officers) {
      if (!o.alive || o.state === 'inVehicle') continue;
      o.persistent = true;
      if (!o.weapon) o.setWeapon('pistol', 120);
      const d = dist2(o.x, o.z, pl.x, pl.z);
      const armed = pl.weapon.ranged && (pl.aiming || pl.fireT > -2);
      const lethal = this.level >= 2 || armed || (pl.vehicle && pl.vehicle.speed > 6 && this.level >= 2);
      // Volver al coche si el jugador escapa en vehículo
      if (pl.vehicle && pl.vehicle.speed > 8 && d > 25 && o.homeCar && !o.homeCar.destroyed && !o.homeCar.removed) {
        const car = o.homeCar;
        o.controller = null;
        o.task = { type: 'goto', x: car.doorPos().x, z: car.doorPos().z, run: true, r: 1.8, onArrive: (p) => this.board(p, car) };
        continue;
      }
      if (lethal) {
        o.controller = null;
        o.allowFire = true;
        if (!o.task || o.task.type !== 'attack') { o.task = { type: 'attack', target: pl }; if (rand() < 0.5) o.say('police'); }
      } else {
        // Intento de detención
        o.task = null;
        o.controller = (dt2, ped) => {
          const dd = dist2(ped.x, ped.z, pl.x, pl.z);
          if (dd > 1.5) return { x: pl.x, z: pl.z, speed: dd > 6 ? 5.4 : 2.5 };
          ped.heading = dampAngle(ped.heading, Math.atan2(pl.x - ped.x, pl.z - ped.z), 10, dt2);
          if (!pl.vehicle && pl.speed < 1.8) {
            ped.arrestT = (ped.arrestT || 0) + dt2;
            if (ped.arrestT > 1.3) this.bust();
          } else ped.arrestT = 0;
          return null;
        };
        if (d < 12 && rand() < dt * 0.3) o.say('police');
      }
    }
  }

  board(ped, car) {
    if (!ped.alive || car.destroyed || car.removed) return;
    if (!car.driver || !car.driver.alive) {
      car.driver = ped;
    } else car.passengers.push(ped);
    ped.vehicle = car;
    ped.state = 'inVehicle';
    ped.task = null;
    ped.model.root.removeFromParent();
    ped.inScene = false;
    if (car.driver === ped) this.recruit(car);
    if (!this.units.includes(car)) this.units.push(car);
  }

  bust() {
    const g = this.game;
    if (g.player.busted || g.player.dead) return;
    g.onBusted();
  }

  // -------------------------------------------------------------------------
  // Patrullas rutinarias (nivel 0)
  updatePatrols(dt) {
    const g = this.game;
    this.patrolT -= dt;
    if (this.patrolT > 0) return;
    this.patrolT = 20;
    const patrols = g.vehicles.list.filter((v) => v.T.police && v.traffic).length;
    if (patrols >= 2) return;
    const R = g.world.roads;
    const pl = g.player;
    const a = rand() * Math.PI * 2, r = rand.range(120, 200);
    const ne = R.nearestEdge(pl.x + Math.cos(a) * r, pl.z + Math.sin(a) * r, 60, (e) => !e.noTraffic && e.lanes >= 1 && e.type !== 'narrow');
    if (!ne || g.isVisible(ne.x, 1, ne.z, 3)) return;
    const v = g.vehicles.spawnTraffic(ne.edge, ne.edge.a, ne.t * ne.edge.len, 'police');
    if (v) {
      v.driver.setWeapon('pistol', 100);
      const partner = g.peds.createDriver(v);
      partner.setWeapon('pistol', 100);
      v.passengers.push(partner);
    }
  }

  // -------------------------------------------------------------------------
  // Helicóptero
  spawnHeli() {
    const g = this.game, pl = g.player;
    const root = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 5), new THREE.MeshLambertMaterial({ color: 0x1f3a8e }));
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 5), new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }));
    tail.position.set(0, 0.4, -4.5);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.08, 0.4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    rotor.position.y = 1.2;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 1.6), new THREE.MeshPhongMaterial({ color: 0x223344, shininess: 80 }));
    glass.position.set(0, 0.2, 2.2);
    root.add(body, tail, rotor, glass);
    const spot = new THREE.SpotLight(0xffffff, 0, 120, 0.25, 0.5, 1);
    spot.position.set(0, -1, 1);
    root.add(spot, spot.target);
    g.scene.add(root);
    const a = rand() * Math.PI * 2;
    this.heli = { root, rotor, spot, x: pl.x + Math.cos(a) * 200, z: pl.z + Math.sin(a) * 200, y: 70, heading: 0, health: 1500, fireT: 2, leaving: false, vx: 0, vz: 0 };
    g.hud.notify('Un helicóptero policial se une a la persecución.');
  }

  updateHeli(dt) {
    const h = this.heli;
    if (!h) return;
    const g = this.game, pl = g.player;
    h.rotor.rotation.y += dt * 30;
    let tx = pl.x, tz = pl.z;
    if (h.leaving) { tx = h.x + Math.sin(h.heading) * 100; tz = h.z + Math.cos(h.heading) * 100; }
    else {
      const t = performance.now() * 0.0003;
      tx += Math.cos(t) * 30; tz += Math.sin(t) * 30;
    }
    const dx = tx - h.x, dz = tz - h.z;
    const d = Math.hypot(dx, dz);
    const sp = Math.min(32, d * 0.6);
    h.vx = damp(h.vx, dx / (d || 1) * sp, 1.2, dt);
    h.vz = damp(h.vz, dz / (d || 1) * sp, 1.2, dt);
    h.x += h.vx * dt; h.z += h.vz * dt;
    const gy = g.world.groundHeight(h.x, h.z);
    h.y = damp(h.y, gy + 42, 1, dt);
    h.heading = dampAngle(h.heading, Math.atan2(h.vx, h.vz), 2, dt);
    h.root.position.set(h.x, h.y, h.z);
    h.root.rotation.set(clamp(Math.hypot(h.vx, h.vz) * 0.01, 0, 0.25), h.heading, 0);
    // Foco
    h.spot.intensity = g.world.sky.night > 0.4 ? 400 : 0;
    h.spot.target.position.set(0, -50, 8);
    // Dispara a nivel 5
    if (!h.leaving && this.level >= 5) {
      h.fireT -= dt;
      if (h.fireT <= 0 && d < 70) {
        h.fireT = 0.25;
        const fake = { x: h.x, y: h.y - 2, z: h.z, heading: Math.atan2(pl.x - h.x, pl.z - h.z), weapon: 'smg', role: 'police', ammo: 999, model: { recoil() {} } };
        g.combat.npcShoot(fake, pl);
      }
    }
    if (h.health <= 0) {
      g.combat.explode(h.x, h.y, h.z, 10, g.player);
      h.root.removeFromParent();
      this.heli = null;
      g.hud.notify('¡Helicóptero derribado!');
      return;
    }
    if (h.leaving && d > 300 || (h.leaving && dist2(h.x, h.z, pl.x, pl.z) > 350)) { h.root.removeFromParent(); this.heli = null; }
  }

  /** Para el sistema de disparos: ¿la bala ha alcanzado el helicóptero? */
  heliHit(hit, dmg) { if (this.heli) this.heli.health -= dmg; }
}

export { wrapAngle };
