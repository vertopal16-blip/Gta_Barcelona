// IA de conducción y gestión de vehículos (tráfico, aparcados, colisiones entre coches).

import { Vehicle, VEHICLE_TYPES } from './vehicle.js';
import { clamp, wrapAngle, rand, weightedPick, dist2 } from '../core/utils.js';
import { events } from '../core/events.js';
import { audio } from '../core/audio.js';

// ---------------------------------------------------------------------------
// Conductores
// ---------------------------------------------------------------------------

/** Conducción por carriles siguiendo la red viaria, respetando semáforos. */
export class LaneDriver {
  constructor(v, game, edge, fromNode, opts = {}) {
    this.v = v;
    this.game = game;
    this.roads = game.world.roads;
    this.edge = edge;
    this.from = fromNode;
    this.to = this.roads.otherNode(edge, fromNode);
    this.next = null;
    this.cruise = opts.cruise ?? rand.range(0.82, 1.02);
    this.laneIdx = edge.lanes >= 2 ? (rand() < 0.5 ? 0 : 1) : 0;
    this.stuckT = 0;
    this.reverseT = 0;
    this.panicT = 0;
    this.honkT = 0;
    this.kind = 'lane';
    this.pickNext();
  }

  laneOffset(e) {
    if (e.lanes >= 2) return (e.w / 4) * (this.laneIdx === 0 ? 0.55 : 1.45);
    return clamp(e.w / 4, 1.4, 2.6);
  }

  pickNext() {
    const n = this.roads.nodes[this.to];
    const opts = n.edges.map((id) => this.roads.edges[id]).filter((e) => e.id !== this.edge.id && !e.noTraffic);
    if (!opts.length) { this.next = this.edge; return; }
    // Prefiere seguir recto o calles importantes
    const ang = Math.atan2(this.dirX(), this.dirZ());
    const weighted = opts.map((e) => {
      const nn = this.roads.otherNode(e, this.to);
      const B = this.roads.nodes[nn];
      const a2 = Math.atan2(B.x - n.x, B.z - n.z);
      const turn = Math.abs(wrapAngle(a2 - ang));
      return [e, (turn < 0.4 ? 2.2 : 1) * (e.lanes >= 2 ? 1.5 : 1) * (e.type === 'narrow' ? 0.35 : 1)];
    });
    this.next = weightedPick(rand, weighted);
  }

  dirX() { const A = this.roads.nodes[this.from], B = this.roads.nodes[this.to]; return (B.x - A.x) / this.edge.len; }
  dirZ() { const A = this.roads.nodes[this.from], B = this.roads.nodes[this.to]; return (B.z - A.z) / this.edge.len; }

  /** Punto del carril a una distancia s desde el nodo origen (puede pasar al siguiente tramo). */
  lanePoint(s) {
    const R = this.roads;
    let e = this.edge, from = this.from, to = this.to;
    if (s > e.len) {
      s -= e.len;
      from = to; e = this.next; to = R.otherNode(e, from);
      s = Math.min(s, e.len);
    }
    const A = R.nodes[from], B = R.nodes[to];
    const dx = (B.x - A.x) / e.len, dz = (B.z - A.z) / e.len;
    const off = this.laneOffset(e);
    return { x: A.x + dx * s - dz * off, z: A.z + dz * s + dx * off };
  }

  advance() {
    this.from = this.to;
    this.edge = this.next;
    this.to = this.roads.otherNode(this.edge, this.from);
    if (this.edge.lanes < 2) this.laneIdx = 0;
    this.pickNext();
  }

  update(dt) {
    const v = this.v, R = this.roads;
    const A = R.nodes[this.from], B = R.nodes[this.to];
    const dx = (B.x - A.x) / this.edge.len, dz = (B.z - A.z) / this.edge.len;
    let s = (v.x - A.x) * dx + (v.z - A.z) * dz;
    if (s >= this.edge.len - 0.5) { this.advance(); return this.update(dt); }
    // ¿Perdido? (tras un choque)
    const lat = Math.abs((v.x - A.x) * -dz + (v.z - A.z) * dx);
    if (lat > 14 || s < -15) { this.relocate(); return; }

    const spd = v.vF;
    const look = 5 + Math.max(0, spd) * 0.55;
    const tp = this.lanePoint(Math.max(0, s) + look);
    const targetH = Math.atan2(tp.x - v.x, tp.z - v.z);
    const diff = wrapAngle(targetH - v.heading);
    let steer = clamp(-diff * 2.2, -1, 1);

    // Velocidad deseada
    let desired = this.edge.speed * this.cruise * (this.panicT > 0 ? 1.45 : 1);
    if (this.game.world.sky.rain > 0.4) desired *= 0.85;
    const remain = this.edge.len - s;
    // Giro en el próximo cruce
    const nA = R.nodes[this.to];
    const nB = R.nodes[R.otherNode(this.next, this.to)];
    const turn = Math.abs(wrapAngle(Math.atan2(nB.x - nA.x, nB.z - nA.z) - Math.atan2(dx, dz)));
    if (turn > 0.5 && remain < 25) desired = Math.min(desired, 5 + (remain / 25) * 6 + (turn < 1.2 ? 2 : 0));
    // Semáforos
    const stopDist = remain - (nA.radius || 4) - 3.5;
    if (nA.signal && this.panicT <= 0 && !R.signalGreen(nA, this.edge, this.game.simTime) && stopDist > -1 && stopDist < 35) {
      desired = Math.min(desired, Math.max(0, stopDist - 0.5) * 0.45);
      if (stopDist < 1) desired = 0;
    }
    // Obstáculos delante
    const obst = this.game.obstacleAhead(v, 7 + Math.max(0, spd) * 1.25, v.T.wid / 2 + 0.6);
    if (obst) {
      const free = obst.dist - (v.T.len / 2 + 2.5);
      desired = Math.min(desired, Math.max(0, free * 0.7));
      if (obst.isPlayer && spd < 1 && desired < 0.5) {
        this.honkT -= dt;
        if (this.honkT <= 0) { audio.play('horn', v.x, v.z); this.honkT = rand.range(2, 5); }
      }
    }

    // Atasco: marcha atrás
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      v.input.throttle = 0; v.input.brake = 1; v.input.steer = -steer; v.input.handbrake = 0;
      return;
    }
    if (desired > 3 && Math.abs(spd) < 0.4 && !obst) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 3) { this.stuckT = 0; this.reverseT = 1.4; }

    this.panicT = Math.max(0, this.panicT - dt);
    const err = desired - spd;
    v.input.steer = steer;
    v.input.throttle = err > 0 ? clamp(err * 0.4, 0, 1) : 0;
    v.input.brake = err < -0.5 ? clamp(-err * 0.35, 0, 1) : (desired === 0 && spd > 0.1 ? 1 : 0);
    v.input.handbrake = 0;
  }

  relocate() {
    const v = this.v;
    const ne = this.roads.nearestEdge(v.x, v.z, 80, (e) => !e.noTraffic);
    if (!ne) return;
    this.edge = ne.edge;
    const toB = ne.edge.dx * v.fx + ne.edge.dz * v.fz > 0;
    this.from = toB ? ne.edge.a : ne.edge.b;
    this.to = this.roads.otherNode(ne.edge, this.from);
    this.pickNext();
  }
}

/** Sigue una lista de puntos (persecuciones lejanas, carreras, rutas de misión). */
export class PathDriver {
  constructor(v, game, points, opts = {}) {
    this.v = v; this.game = game; this.points = points; this.i = 0;
    this.speed = opts.speed ?? 20;
    this.loop = !!opts.loop;
    this.reach = opts.reach ?? 9;
    this.onDone = opts.onDone || null;
    this.aggressive = !!opts.aggressive;
    this.kind = 'path';
    this.stuckT = 0; this.reverseT = 0;
  }

  setPoints(points) { this.points = points; this.i = 0; }

  update(dt) {
    const v = this.v;
    if (!this.points.length) { v.input.throttle = 0; v.input.brake = 1; return; }
    let p = this.points[this.i];
    while (p && Math.hypot(p.x - v.x, p.z - v.z) < this.reach) {
      this.i++;
      if (this.i >= this.points.length) {
        if (this.loop) this.i = 0;
        else { this.i = this.points.length - 1; if (this.onDone) { const f = this.onDone; this.onDone = null; f(); } break; }
      }
      p = this.points[this.i];
    }
    p = this.points[this.i];
    const q = this.points[Math.min(this.i + 1, this.points.length - 1)];
    const dist = Math.hypot(p.x - v.x, p.z - v.z);
    const th = Math.atan2(p.x - v.x, p.z - v.z);
    const diff = wrapAngle(th - v.heading);
    let desired = this.speed;
    // Frena antes de curvas cerradas
    const th2 = Math.atan2(q.x - p.x, q.z - p.z);
    const corner = Math.abs(wrapAngle(th2 - th));
    if (corner > 0.6 && dist < 30) desired = Math.min(desired, 8 + dist * 0.4 + (1.6 - Math.min(corner, 1.6)) * 8);
    if (Math.abs(diff) > 1.2) desired = Math.min(desired, 7);
    if (!this.aggressive) {
      const obst = this.game.obstacleAhead(v, 6 + Math.max(0, v.vF) * 1.0, v.T.wid / 2 + 0.5);
      if (obst) desired = Math.min(desired, Math.max(0, (obst.dist - v.T.len / 2 - 2) * 0.7));
    }
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      v.input.throttle = 0; v.input.brake = 1; v.input.steer = clamp(diff * 2, -1, 1); v.input.handbrake = 0;
      return;
    }
    if (desired > 3 && Math.abs(v.vF) < 0.5) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 2.2) { this.stuckT = 0; this.reverseT = 1.3; }
    const err = desired - v.vF;
    v.input.steer = clamp(-diff * 2.4, -1, 1);
    v.input.throttle = err > 0 ? clamp(err * 0.35, 0, 1) : 0;
    v.input.brake = err < -1 ? clamp(-err * 0.3, 0, 1) : 0;
    v.input.handbrake = Math.abs(diff) > 1.4 && v.vF > 10 ? 1 : 0;
  }
}

/** Persigue a un objetivo: ruta por calles si está lejos, directo si está cerca. */
export class PursuitDriver {
  constructor(v, game, getTarget, opts = {}) {
    this.v = v; this.game = game; this.getTarget = getTarget;
    this.path = new PathDriver(v, game, [], { speed: opts.speed ?? 30, reach: 10, aggressive: true });
    this.replanT = 0;
    this.ram = !!opts.ram;
    this.stopDist = opts.stopDist ?? 9;
    this.kind = 'pursuit';
    this.stuckT = 0; this.reverseT = 0;
    this.maxSpeed = opts.speed ?? 30;
  }

  update(dt) {
    const v = this.v;
    const t = this.getTarget();
    if (!t) { v.input.throttle = 0; v.input.brake = 1; return; }
    const d = Math.hypot(t.x - v.x, t.z - v.z);
    if (d > 55) {
      this.replanT -= dt;
      if (this.replanT <= 0) {
        this.replanT = 2.5;
        this.path.setPoints(this.game.routePoints(v.x, v.z, t.x, t.z));
      }
      this.path.speed = this.maxSpeed;
      this.path.update(dt);
      return;
    }
    // Directo, con predicción
    const tvx = t.vx || 0, tvz = t.vz || 0;
    const lead = Math.min(1.2, d / 25);
    const px = t.x + tvx * lead, pz = t.z + tvz * lead;
    const th = Math.atan2(px - v.x, pz - v.z);
    const diff = wrapAngle(th - v.heading);
    const tSpeed = Math.hypot(tvx, tvz);
    let desired = this.ram ? this.maxSpeed : Math.min(this.maxSpeed, tSpeed + (d - this.stopDist) * 0.8);
    if (!this.ram && d < this.stopDist && tSpeed < 3) desired = 0;
    if (Math.abs(diff) > 1.3) desired = Math.min(desired, 9);
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      v.input.throttle = 0; v.input.brake = 1; v.input.steer = clamp(diff * 2, -1, 1);
      return;
    }
    if (desired > 3 && Math.abs(v.vF) < 0.6) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 1.8) { this.stuckT = 0; this.reverseT = 1.2; }
    const err = desired - v.vF;
    v.input.steer = clamp(-diff * 2.6, -1, 1);
    v.input.throttle = err > 0 ? clamp(err * 0.4, 0, 1) : 0;
    v.input.brake = err < -1 ? clamp(-err * 0.3, 0, 1) : 0;
    v.input.handbrake = Math.abs(diff) > 1.5 && v.vF > 12 ? 1 : 0;
  }
}

/** Huye del jugador (conductor asustado). */
export class FleeDriver extends LaneDriver {
  constructor(v, game, edge, from) {
    super(v, game, edge, from, { cruise: 1.6 });
    this.panicT = 9999;
    this.kind = 'flee';
  }
}

// ---------------------------------------------------------------------------
// Gestor de vehículos
// ---------------------------------------------------------------------------
const TRAFFIC_MIX = {
  default: [['compact', 30], ['sedan', 22], ['taxi', 16], ['van', 9], ['suv', 9], ['scooter', 10], ['moto', 3], ['sports', 2], ['bus', 3]],
  zonafranca: [['truck', 30], ['van', 25], ['compact', 15], ['sedan', 15], ['suv', 10]],
  poblenou: [['compact', 25], ['van', 18], ['sedan', 15], ['taxi', 10], ['scooter', 14], ['truck', 6], ['suv', 8], ['moto', 4]],
  montjuic: [['compact', 25], ['sedan', 25], ['moto', 12], ['sports', 8], ['taxi', 10], ['suv', 10], ['bus', 5]],
};

export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.trafficTarget = 30;
    this.parkedTarget = 14;
    this.spawnT = 0;
  }

  spawn(type, x, z, heading, opts = {}) {
    const v = new Vehicle(type, x, z, heading, opts);
    this.list.push(v);
    this.game.scene.add(v.root);
    v.onDamage = (amt, attacker) => this.game.onVehicleDamaged(v, amt, attacker);
    return v;
  }

  remove(v) {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
    v.root.removeFromParent();
    if (v.driver && v.driver.isPed) this.game.peds.remove(v.driver);
    for (const p of v.passengers) if (p.isPed) this.game.peds.remove(p);
    v.removed = true;
  }

  /** Crea un coche de tráfico con conductor en una calle. */
  spawnTraffic(edge, fromNode, s, type = null) {
    const R = this.game.world.roads;
    const A = R.nodes[fromNode], B = R.nodes[R.otherNode(edge, fromNode)];
    const dx = (B.x - A.x) / edge.len, dz = (B.z - A.z) / edge.len;
    if (!type) {
      const mix = TRAFFIC_MIX[edge.district] || TRAFFIC_MIX.default;
      type = weightedPick(rand, mix);
      if (type === 'bus' && edge.lanes < 2) type = 'sedan';
      if ((VEHICLE_TYPES[type].heavy) && edge.type === 'narrow') type = 'compact';
    }
    const lanes = edge.lanes >= 2;
    const off = lanes ? edge.w / 4 * (rand() < 0.5 ? 0.55 : 1.45) : clamp(edge.w / 4, 1.4, 2.6);
    const x = A.x + dx * s - dz * off, z = A.z + dz * s + dx * off;
    if (this.isOccupied(x, z, 6)) return null;
    const v = this.spawn(type, x, z, Math.atan2(dx, dz));
    const drv = this.game.peds.createDriver(v);
    v.driver = drv;
    v.ai = new LaneDriver(v, this.game, edge, fromNode);
    v.vx = dx * edge.speed * 0.6; v.vz = dz * edge.speed * 0.6;
    v.traffic = true;
    v.lightsOn = this.game.world.sky.night > 0.5;
    return v;
  }

  spawnParked(edge, s, side, type = null) {
    const R = this.game.world.roads;
    const A = R.nodes[edge.a];
    const off = (edge.w / 2 - 1.3) * side;
    const x = A.x + edge.dx * s - edge.dz * off, z = A.z + edge.dz * s + edge.dx * off;
    if (this.isOccupied(x, z, 5)) return null;
    if (this.game.world.collision.resolveCircle(x, z, 1.2, this.game.world.groundHeight(x, z) + 0.3, 1.2).hit) return null;
    type = type || weightedPick(rand, [['compact', 30], ['sedan', 25], ['van', 10], ['suv', 12], ['scooter', 14], ['moto', 4], ['sports', 3]]);
    const head = Math.atan2(edge.dx, edge.dz) + (side > 0 ? 0 : Math.PI);
    const v = this.spawn(type, x, z, head, { locked: rand() < 0.6 });
    v.parked = true;
    return v;
  }

  isOccupied(x, z, r) {
    for (const v of this.list) if (Math.abs(v.x - x) < r + 3 && Math.abs(v.z - z) < r + 3 && dist2(v.x, v.z, x, z) < r + v.T.len / 2) return true;
    const p = this.game.player;
    if (p && dist2(p.x, p.z, x, z) < r) return true;
    return false;
  }

  /** Mantiene la densidad de tráfico alrededor del jugador. */
  populate(dt) {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 0.25;
    const g = this.game;
    const p = g.focus();
    const R = g.world.roads;
    // Despawn
    for (const v of [...this.list]) {
      const d = dist2(v.x, v.z, p.x, p.z);
      const keep = v.persistent || v.mission || v === g.player.vehicle || v.police || v.playerOwned;
      if (!keep && (d > 300 || (v.destroyed && v.burnT > 40 && d > 60))) {
        if (!g.isVisible(v.x, v.y, v.z, 6) || d > 380) this.remove(v);
      }
    }
    const traffic = this.list.filter((v) => v.traffic && !v.destroyed).length;
    const parked = this.list.filter((v) => v.parked).length;
    const density = g.trafficDensity();
    if (traffic < this.trafficTarget * density) {
      for (let tries = 0; tries < 4; tries++) {
        const a = rand() * Math.PI * 2, r = rand.range(110, 240);
        const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
        const ne = R.nearestEdge(x, z, 60, (e) => !e.noTraffic && e.len > 25);
        if (!ne) continue;
        const s = ne.t * ne.edge.len;
        if (s < 10 || s > ne.edge.len - 10) continue;
        const sx = R.nodes[ne.edge.a].x + ne.edge.dx * s, sz = R.nodes[ne.edge.a].z + ne.edge.dz * s;
        if (dist2(sx, sz, p.x, p.z) < 100 || g.isVisible(sx, g.world.groundHeight(sx, sz) + 1, sz, 4) && dist2(sx, sz, p.x, p.z) < 180) continue;
        const from = rand() < 0.5 ? ne.edge.a : ne.edge.b;
        const sAlong = from === ne.edge.a ? s : ne.edge.len - s;
        if (this.spawnTraffic(ne.edge, from, sAlong)) break;
      }
    }
    if (parked < this.parkedTarget * Math.min(1, density + 0.2)) {
      const a = rand() * Math.PI * 2, r = rand.range(60, 160);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      const ne = R.nearestEdge(x, z, 40, (e) => !e.noTraffic && (e.type === 'street' || e.type === 'local') && e.len > 30);
      if (ne && !g.isVisible(x, g.world.groundHeight(x, z) + 1, z, 4)) {
        const s = clamp(ne.t * ne.edge.len, 12, ne.edge.len - 12);
        this.spawnParked(ne.edge, s, rand() < 0.5 ? 1 : -1);
      }
    }
  }

  update(dt) {
    const col = this.game.world.collision;
    const p = this.game.focus();
    for (const v of this.list) {
      const d = Math.abs(v.x - p.x) + Math.abs(v.z - p.z);
      // Simplificación lejana: los coches lejanos se actualizan con menos detalle
      if (v.ai && v.driver && !v.destroyed && v.driver.alive !== false) v.ai.update(dt);
      else if (v !== this.game.player.vehicle) { v.input.throttle = 0; v.input.brake = v.speed > 0.2 ? 0.6 : 0; v.input.steer = 0; v.input.handbrake = v.parked ? 1 : 0; }
      v.wet = this.game.world.sky.rain > 0.3;
      v.update(dt, d < 400 ? col : null);
      if (v.explodePending) {
        v.explodePending = false;
        this.game.combat.explode(v.x, v.y + 1, v.z, 9, v.lastAttacker, v);
        v.setBurnt();
        events.emit('vehicleDestroyed', { vehicle: v });
      }
      if (v.sinkT > 4 && !v.sunk) {
        v.sunk = true;
        v.destroyed = true;
        if (v.driver && v.driver.isPed) this.game.peds.ejectFrom(v, v.driver);
      }
    }
    this.collideVehicles();
  }

  collideVehicles() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        const maxR = (a.T.len + b.T.len) / 2 + 0.5;
        if (Math.abs(a.x - b.x) > maxR || Math.abs(a.z - b.z) > maxR) continue;
        if (Math.abs(a.y - b.y) > 3) continue;
        const ca = a.circles(), cb = b.circles();
        let best = null;
        for (const p of ca) for (const q of cb) {
          const dx = p.x - q.x, dz = p.z - q.z;
          const d = Math.hypot(dx, dz);
          const pen = p.r + q.r - d;
          if (pen > 0 && (!best || pen > best.pen)) best = { pen, nx: d > 1e-4 ? dx / d : 1, nz: d > 1e-4 ? dz / d : 0 };
        }
        if (!best) continue;
        const ma = a.T.mass, mb = b.T.mass;
        const wa = mb / (ma + mb), wb = ma / (ma + mb);
        a.x += best.nx * best.pen * wa; a.z += best.nz * best.pen * wa;
        b.x -= best.nx * best.pen * wb; b.z -= best.nz * best.pen * wb;
        const rvx = a.vx - b.vx, rvz = a.vz - b.vz;
        const vn = rvx * best.nx + rvz * best.nz;
        if (vn < 0) {
          const e = 0.3;
          const jimp = -(1 + e) * vn / (1 / ma + 1 / mb);
          a.vx += best.nx * jimp / ma; a.vz += best.nz * jimp / ma;
          b.vx -= best.nx * jimp / mb; b.vz -= best.nz * jimp / mb;
          const impact = -vn;
          if (impact > 2.5) {
            const dmg = impact * impact * 1.6;
            const pa = this.game.player.vehicle === a, pb = this.game.player.vehicle === b;
            a.damage(dmg * wa * 2, pb ? this.game.player : b.driver, 'crash');
            b.damage(dmg * wb * 2, pa ? this.game.player : a.driver, 'crash');
            if (impact > 5) audio.play('crash', (a.x + b.x) / 2, (a.z + b.z) / 2);
            this.game.onVehicleCollision(a, b, impact);
          }
        }
      }
    }
  }

  nearest(x, z, maxD = 5, filter = null) {
    let best = null, bd = maxD;
    for (const v of this.list) {
      if (filter && !filter(v)) continue;
      const d = dist2(v.x, v.z, x, z) - v.T.len * 0.25;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
}
