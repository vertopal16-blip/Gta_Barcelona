// Vehículos: catálogo ficticio (marcas inspiradas en los vientos catalanes),
// modelos procedurales y física arcade con derrapes, saltos, daños y colisiones.

import * as THREE from 'three';
import { GeoBuilder } from '../world/geom.js';
import { clamp, damp, wrapAngle, rand } from '../core/utils.js';
import { groundHeight, SEA_LEVEL, MAP, isWater } from '../world/terrain.js';

export const VEHICLE_TYPES = {
  compact: { name: 'Cubic Ona', kind: 'car', len: 3.9, wid: 1.75, hei: 1.45, mass: 1100, maxSpeed: 40, accel: 8.5, brake: 15, grip: 11, steer: 0.62, value: 900,
    colors: [0xd83a3a, 0xf0f0f0, 0x3a6ad8, 0x2a2a2a, 0xe8c030, 0x8a8a8a, 0x5ab0a0, 0xe08040] },
  sedan: { name: 'Xaloc Berlina', kind: 'car', len: 4.7, wid: 1.85, hei: 1.45, mass: 1450, maxSpeed: 46, accel: 9, brake: 16, grip: 11.5, steer: 0.58, value: 1400,
    colors: [0x2a2a2a, 0xc8c8c8, 0x1f3a6e, 0x6a1a1a, 0xf0f0f0, 0x4a5a4a, 0x8a6a4a] },
  taxi: { name: 'Taxi Xaloc', kind: 'car', len: 4.7, wid: 1.85, hei: 1.5, mass: 1450, maxSpeed: 45, accel: 9, brake: 16, grip: 11.5, steer: 0.58, value: 1100, colors: [0x151515], taxi: true },
  van: { name: 'Mestral Furgo', kind: 'car', len: 5.3, wid: 2.0, hei: 2.35, mass: 2300, maxSpeed: 34, accel: 6, brake: 12, grip: 9.5, steer: 0.55, value: 1200,
    colors: [0xf0f0f0, 0xd8d8d8, 0x3a5a8a, 0xc83a2a] },
  sports: { name: 'Garbí GT', kind: 'car', len: 4.4, wid: 1.95, hei: 1.18, mass: 1300, maxSpeed: 66, accel: 15, brake: 20, grip: 13.5, steer: 0.6, value: 5200,
    colors: [0xd81e1e, 0xf0c010, 0x101010, 0xf0f0f0, 0x1e5ad8, 0x30c060] },
  suv: { name: 'Tramuntana 4x4', kind: 'car', len: 4.8, wid: 2.0, hei: 1.8, mass: 2000, maxSpeed: 44, accel: 9, brake: 15, grip: 11, steer: 0.55, value: 2600,
    colors: [0x2a2a2a, 0xf0f0f0, 0x4a5a6a, 0x6a5a3a, 0x2a4a3a] },
  bus: { name: 'Bus urbà', kind: 'car', len: 12, wid: 2.55, hei: 3.2, mass: 11000, maxSpeed: 24, accel: 3.5, brake: 8, grip: 8, steer: 0.5, value: 600, colors: [0xc8202a], heavy: true },
  truck: { name: 'Camió Llebeig', kind: 'car', len: 8, wid: 2.5, hei: 3.4, mass: 8000, maxSpeed: 28, accel: 4, brake: 9, grip: 8.5, steer: 0.5, value: 1800,
    colors: [0xf0f0f0, 0x3a6ad8, 0xe8a020, 0x2a7a3a], heavy: true },
  police: { name: 'Patrulla', kind: 'car', len: 4.7, wid: 1.9, hei: 1.5, mass: 1500, maxSpeed: 56, accel: 12.5, brake: 18, grip: 12.5, steer: 0.6, value: 0, colors: [0xf4f4f4], police: true },
  ambulance: { name: 'Ambulància', kind: 'car', len: 5.4, wid: 2.1, hei: 2.5, mass: 2600, maxSpeed: 40, accel: 7, brake: 13, grip: 10, steer: 0.55, value: 0, colors: [0xf4f4f4], ambulance: true },
  scooter: { name: 'Llevant 125', kind: 'bike', len: 1.9, wid: 0.75, hei: 1.2, mass: 140, maxSpeed: 27, accel: 8, brake: 13, grip: 11, steer: 0.75, value: 350,
    colors: [0xf0f0f0, 0xd83a3a, 0x3a3a3a, 0x60c0e0, 0xf0c030] },
  moto: { name: 'Ponent 750', kind: 'bike', len: 2.1, wid: 0.8, hei: 1.25, mass: 220, maxSpeed: 62, accel: 15, brake: 18, grip: 13, steer: 0.7, value: 2800,
    colors: [0x101010, 0xd81e1e, 0x1e5ad8, 0xf0a010] },
};

const sharedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const burntMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const geoCache = new Map();
let wheelGeo = null, bikeWheelGeo = null;

function buildBody(type, color) {
  const key = type + ':' + color;
  if (geoCache.has(key)) return geoCache.get(key);
  const T = VEHICLE_TYPES[type];
  const b = new GeoBuilder();
  const L = T.len, W = T.wid, H = T.hei;
  const glass = 0x1d2630;
  const trim = 0x202020;
  if (T.kind === 'bike') {
    b.box(0, 0.35, 0, 0.25, 0.4, L * 0.75, color);
    b.box(0, 0.75, -0.25, 0.32, 0.12, 0.7, 0x1a1a1a); // asiento
    if (type === 'scooter') {
      b.box(0, 0.3, 0.45, 0.5, 0.12, 0.6, color); // plataforma
      b.box(0, 0.55, 0.7, 0.32, 0.65, 0.18, color); // escudo frontal
      b.box(0, 0.75, -0.75, 0.38, 0.3, 0.38, 0x2a2a2a); // baúl
    } else {
      b.box(0, 0.6, 0.35, 0.34, 0.32, 0.7, color); // depósito
    }
    b.box(0, 1.08, 0.72, 0.65, 0.05, 0.05, 0x2a2a2a); // manillar
    b.box(0, 0.88, 0.72, 0.05, 0.4, 0.05, 0x2a2a2a);
  } else if (type === 'bus') {
    b.box(0, 0.35, 0, W, H - 0.35, L, color);
    b.box(0, 1.25, 0, W + 0.02, 1.0, L - 1.2, glass);
    b.box(0, 1.1, L / 2 - 0.1, W - 0.3, 1.4, 0.25, glass);
    b.box(0, 0.35, 0, W + 0.04, 0.35, L + 0.04, 0x2a2a2a);
    b.box(0, H, 0, W - 0.3, 0.25, L * 0.4, 0xd8d8d8);
  } else if (type === 'truck') {
    b.box(0, 0.5, L / 2 - 1.1, W, 2.2, 2.0, color); // cabina
    b.box(0, 1.6, L / 2 - 0.1, W - 0.2, 0.9, 0.1, glass);
    b.box(0, 0.6, -0.9, W, H - 0.6, L - 2.4, 0xd8d8d8); // caja
    b.box(0, 0.35, 0, W - 0.4, 0.3, L, 0x2a2a2a);
  } else if (type === 'van' || type === 'ambulance') {
    b.box(0, 0.35, 0, W, H - 0.35, L, color);
    b.box(0, 1.35, L / 2 - 0.55, W + 0.02, 0.7, 0.9, glass);
    b.box(0, 1.25, L / 2 + 0.01, W - 0.2, 0.75, 0.02, glass);
    if (type === 'ambulance') {
      b.box(0, 0.9, 0, W + 0.03, 0.3, L - 0.5, 0xe8d020);
      b.box(0, 1.5, -0.5, W + 0.04, 0.6, 0.15, 0xd02020);
      b.box(0, H, 0.4, 1.2, 0.15, 0.4, 0xd02020);
    }
  } else {
    // Turismo: chasis + habitáculo
    const bodyH = type === 'sports' ? 0.55 : type === 'suv' ? 0.85 : 0.65;
    const base = type === 'suv' ? 0.42 : 0.3;
    b.box(0, base, 0, W, bodyH, L, color);
    const cabL = L * (type === 'sports' ? 0.42 : type === 'compact' ? 0.55 : 0.5);
    const cabZ = type === 'compact' ? -0.25 : -0.1;
    const cabH = H - base - bodyH;
    b.box(0, base + bodyH, cabZ, W - 0.16, cabH, cabL, glass);
    b.box(0, base + bodyH + cabH - 0.06, cabZ, W - 0.14, 0.08, cabL - 0.3, color); // techo
    b.box(0, base + bodyH, cabZ + cabL / 2 - 0.05, W - 0.4, cabH - 0.05, 0.1, color); // pilar
    b.box(0, base + 0.05, 0, W + 0.04, 0.12, L + 0.06, trim); // parachoques
    if (T.taxi) {
      // Taxi de Barcelona: negro con puertas amarillas
      b.box(0, base + 0.08, cabZ, W + 0.02, bodyH - 0.1, cabL * 0.9, 0xf2c200);
      b.box(0, H + 0.02, cabZ, 0.5, 0.14, 0.22, 0xf0f0f0);
      b.box(0, H + 0.08, cabZ + 0.1, 0.1, 0.06, 0.06, 0x30e030);
    }
    if (T.police) {
      b.box(0, base + 0.12, 0, W + 0.02, 0.22, L - 0.4, 0x1f3a8e);
      b.box(0, base + 0.36, 0, W + 0.021, 0.08, L - 0.4, 0xe8e000);
    }
    if (type === 'sports') b.box(0, base + bodyH + 0.05, -L / 2 + 0.2, W - 0.2, 0.06, 0.3, 0x111111); // alerón
  }
  // Faros y pilotos
  if (T.kind !== 'bike') {
    b.box(W / 2 - 0.3, 0.6, L / 2 + 0.01, 0.35, 0.16, 0.04, 0xfff6d8);
    b.box(-W / 2 + 0.3, 0.6, L / 2 + 0.01, 0.35, 0.16, 0.04, 0xfff6d8);
  } else {
    b.box(0, 0.9, L / 2 - 0.05, 0.18, 0.14, 0.06, 0xfff6d8);
  }
  const g = b.toGeometry();
  geoCache.set(key, g);
  return g;
}

let nextId = 1;

export class Vehicle {
  constructor(type, x, z, heading = 0, opts = {}) {
    this.id = nextId++;
    this.type = type;
    this.T = VEHICLE_TYPES[type];
    this.color = opts.color ?? rand.pick(this.T.colors);
    this.x = x; this.z = z;
    this.y = groundHeight(x, z);
    this.heading = heading;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.vF = 0; this.vS = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: 0 };
    this.health = this.T.heavy ? 2000 : this.T.kind === 'bike' ? 500 : 1000;
    this.maxHealth = this.health;
    this.driver = null; // ped o jugador
    this.passengers = [];
    this.ai = null;
    this.destroyed = false;
    this.burnT = 0;
    this.onGround = true;
    this.pitch = 0; this.roll = 0;
    this.siren = false;
    this.locked = !!opts.locked;
    this.persistent = !!opts.persistent;
    this.mission = opts.mission || null;
    this.sinkT = 0;
    this.lastHitT = 0;
    this.wheelSpin = 0;
    this.radius = this.T.wid / 2;
    this.isBike = this.T.kind === 'bike';
    this.alarm = false;
    this.buildModel();
  }

  buildModel() {
    const T = this.T;
    this.root = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.root.add(this.bodyGroup);
    this.bodyMesh = new THREE.Mesh(buildBody(this.type, this.color), sharedMat);
    this.bodyMesh.castShadow = true;
    this.bodyGroup.add(this.bodyMesh);
    // Pilotos traseros (material propio para frenadas)
    this.tailMat = new THREE.MeshBasicMaterial({ color: 0x600000 });
    const tailG = new THREE.BoxGeometry(this.isBike ? 0.16 : 0.32, 0.14, 0.04);
    const tl = [];
    if (this.isBike) tl.push([0, 0.85, -T.len / 2 + 0.05]);
    else tl.push([T.wid / 2 - 0.3, 0.65, -T.len / 2 - 0.01], [-T.wid / 2 + 0.3, 0.65, -T.len / 2 - 0.01]);
    for (const p of tl) { const m = new THREE.Mesh(tailG, this.tailMat); m.position.set(...p); this.bodyGroup.add(m); }
    // Rotativos de policía
    if (T.police || T.ambulance) {
      this.lightA = new THREE.MeshBasicMaterial({ color: 0x2040ff });
      this.lightB = new THREE.MeshBasicMaterial({ color: T.police ? 0xff2020 : 0x2040ff });
      const g = new THREE.BoxGeometry(0.5, 0.14, 0.25);
      const a = new THREE.Mesh(g, this.lightA); a.position.set(-0.32, T.hei + 0.07, -0.1);
      const b = new THREE.Mesh(g, this.lightB); b.position.set(0.32, T.hei + 0.07, -0.1);
      this.bodyGroup.add(a, b);
    }
    // Ruedas
    if (!wheelGeo) {
      wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
      wheelGeo.rotateZ(Math.PI / 2);
      bikeWheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 12);
      bikeWheelGeo.rotateZ(Math.PI / 2);
    }
    this.wheels = [];
    const addWheel = (x, z, front, g = wheelGeo, r = 0.34) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, r, z);
      const w = new THREE.Mesh(g, wheelMat);
      w.castShadow = true;
      pivot.add(w);
      this.bodyGroup.add(pivot);
      this.wheels.push({ pivot, w, front });
    };
    if (this.isBike) {
      addWheel(0, T.len / 2 - 0.3, true, bikeWheelGeo, 0.32);
      addWheel(0, -T.len / 2 + 0.3, false, bikeWheelGeo, 0.32);
    } else {
      const wx = T.wid / 2 - 0.12, wz = T.len / 2 - (T.len > 7 ? 1.6 : 0.8);
      addWheel(wx, wz, true); addWheel(-wx, wz, true);
      addWheel(wx, -wz, false); addWheel(-wx, -wz, false);
      if (T.len > 7) { addWheel(wx, -wz + 1.4, false); addWheel(-wx, -wz + 1.4, false); }
    }
    this.syncModel(0);
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get fx() { return Math.sin(this.heading); }
  get fz() { return Math.cos(this.heading); }
  get kmh() { return Math.abs(this.vF) * 3.6; }

  /** Puntos de colisión a lo largo del vehículo. */
  circles() {
    const T = this.T;
    const r = this.isBike ? 0.45 : T.wid / 2;
    const n = this.isBike ? 2 : Math.max(2, Math.round(T.len / (T.wid * 0.9)));
    const out = [];
    const span = T.len / 2 - r;
    for (let i = 0; i < n; i++) {
      const o = n === 1 ? 0 : -span + (2 * span * i) / (n - 1);
      out.push({ x: this.x + this.fx * o, z: this.z + this.fz * o, r, o });
    }
    return out;
  }

  /** Posición de la puerta del conductor (lado izquierdo). */
  doorPos() {
    const side = this.isBike ? 0.9 : this.T.wid / 2 + 0.7;
    // izquierda = -derecha; derecha = (-fz, fx)
    return { x: this.x + this.fz * side, z: this.z - this.fx * side };
  }

  update(dt, collision) {
    const T = this.T;
    if (this.destroyed) {
      this.input.throttle = 0; this.input.brake = 1; this.input.steer = 0;
    }
    const inp = this.input;
    const fx = this.fx, fz = this.fz;
    const rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vS = this.vx * rx + this.vz * rz;

    // Dirección suavizada
    this.steer = damp(this.steer, clamp(inp.steer, -1, 1), 8, dt);
    const inWater = this.y < SEA_LEVEL - 0.3 && isWater(this.x, this.z);
    const grounded = this.onGround && !inWater;

    if (grounded) {
      let a = 0;
      const engineOn = !this.destroyed && this.health > 0;
      if (engineOn && inp.throttle > 0) {
        if (vF < -0.5) a += T.brake * inp.throttle;
        else a += T.accel * inp.throttle * Math.max(0.05, 1 - (vF / T.maxSpeed) ** 2);
      }
      if (inp.brake > 0) {
        if (vF > 0.5) a -= T.brake * inp.brake;
        else if (engineOn) a -= T.accel * 0.6 * inp.brake * Math.max(0, 1 + vF / (T.maxSpeed * 0.3));
      }
      // Rozamiento
      a -= vF * 0.04 + Math.sign(vF) * (inp.throttle > 0 || inp.brake > 0 ? 0.1 : 0.9);
      if (inp.handbrake) a -= Math.sign(vF) * 7;
      // Pendiente
      const hF = groundHeight(this.x + fx * 1.5, this.z + fz * 1.5), hB = groundHeight(this.x - fx * 1.5, this.z - fz * 1.5);
      a -= 9.8 * ((hF - hB) / 3);
      const prev = vF;
      vF += a * dt;
      if (Math.sign(prev) !== Math.sign(vF) && inp.throttle === 0 && Math.abs(vF) < 0.6 && !(inp.brake > 0 && prev <= 0.5)) vF = 0;
      // Agarre lateral
      const gripMax = (inp.handbrake ? T.grip * 0.28 : T.grip) * (this.wet ? 0.8 : 1);
      const dv = clamp(-vS, -gripMax * dt, gripMax * dt);
      vS += dv;
      this.drifting = Math.abs(vS) > 2.5;
      // Giro
      const wheelBase = T.len * 0.6;
      const steerAng = T.steer * this.steer / (1 + Math.abs(vF) / 28);
      let targetYaw = -(vF / wheelBase) * Math.tan(steerAng);
      if (inp.handbrake && Math.abs(vF) > 4) targetYaw *= 1.6;
      this.yawRate = damp(this.yawRate, targetYaw, 10, dt);
    } else if (inWater) {
      vF *= Math.exp(-dt * 2);
      vS *= Math.exp(-dt * 2);
      this.yawRate *= Math.exp(-dt * 2);
    } else {
      this.yawRate *= Math.exp(-dt * 0.5);
    }

    this.vF = vF; this.vS = vS;
    this.vx = fx * vF + rx * vS;
    this.vz = fz * vF + rz * vS;
    this.heading = wrapAngle(this.heading + this.yawRate * dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // Límites del mapa
    if (this.x < MAP.minX + 5 || this.x > MAP.maxX - 5 || this.z < MAP.minZ + 5 || this.z > MAP.maxZ - 5) {
      this.x = clamp(this.x, MAP.minX + 5, MAP.maxX - 5);
      this.z = clamp(this.z, MAP.minZ + 5, MAP.maxZ - 5);
      this.vx *= -0.3; this.vz *= -0.3;
    }

    // Altura, saltos y agua
    const gh = groundHeight(this.x, this.z);
    if (this.onGround) {
      const vyTerrain = (gh - this.y) / Math.max(dt, 1e-3);
      const vyFall = this.vy - 9.8 * dt;
      if (vyTerrain < vyFall - 2.5 && Math.abs(vF) > 12) {
        this.onGround = false;
        this.vy = Math.max(vyFall, this.prevVyTerrain || 0);
        this.airT = 0;
      } else {
        this.y = gh;
        this.vy = clamp(vyTerrain, -30, 30);
      }
      this.prevVyTerrain = this.vy;
    } else {
      this.airT = (this.airT || 0) + dt;
      this.vy -= 9.8 * dt;
      this.y += this.vy * dt;
      if (this.y <= gh) {
        const impact = -this.vy;
        this.y = gh;
        this.onGround = true;
        this.landImpact = impact;
        if (impact > 9) this.damage((impact - 9) * 25, null, 'fall');
        this.vy = 0;
      }
    }
    if (inWater) {
      this.sinkT += dt;
      this.y = Math.max(gh, SEA_LEVEL - 0.5 - this.sinkT * 0.6);
    } else this.sinkT = 0;

    // Colisiones con el mundo
    if (collision) this.collideWorld(collision);

    // Inclinación visual
    const L = T.len * 0.45, Wd = Math.max(0.6, T.wid * 0.45);
    if (this.onGround) {
      const hF = groundHeight(this.x + fx * L, this.z + fz * L), hB = groundHeight(this.x - fx * L, this.z - fz * L);
      const hR = groundHeight(this.x + rx * Wd, this.z + rz * Wd), hL = groundHeight(this.x - rx * Wd, this.z - rz * Wd);
      const tp = Math.atan2(hF - hB, 2 * L);
      const tr = Math.atan2(hR - hL, 2 * Wd);
      const accelPitch = clamp((vF - (this.prevVF || 0)) / Math.max(dt, 1e-3), -12, 12) * 0.004;
      const turnRoll = this.isBike ? clamp(-this.yawRate * vF * 0.06, -0.7, 0.7) : clamp(this.yawRate * vF * 0.006, -0.08, 0.08);
      this.pitch = damp(this.pitch, -tp + accelPitch, 8, dt);
      this.roll = damp(this.roll, (this.isBike ? 0 : tr) + turnRoll, 8, dt);
    } else {
      this.pitch = damp(this.pitch, -this.vy * 0.015, 2, dt);
    }
    this.prevVF = vF;
    if (this.destroyed) this.burnT += dt;
    this.syncModel(dt);
  }

  collideWorld(collision) {
    const h = this.T.hei;
    let pushX = 0, pushZ = 0, hits = 0, bestN = null, bestDepth = 0, bestO = 0;
    for (const c of this.circles()) {
      const res = collision.resolveCircle(c.x, c.z, c.r, this.y + 0.3, h);
      if (res.hit) {
        pushX += res.x - c.x; pushZ += res.z - c.z; hits++;
        if (res.depth > bestDepth) { bestDepth = res.depth; bestN = res; bestO = c.o; }
      }
    }
    if (!hits) return;
    this.x += pushX / hits;
    this.z += pushZ / hits;
    const nx = bestN.nx, nz = bestN.nz;
    const vn = this.vx * nx + this.vz * nz;
    if (vn < 0) {
      const impact = -vn;
      const rest = 0.25;
      this.vx -= nx * vn * (1 + rest);
      this.vz -= nz * vn * (1 + rest);
      // Fricción tangencial
      this.vx *= 0.9; this.vz *= 0.9;
      // Par de giro por impacto descentrado
      const rx = -this.fz, rz = this.fx;
      const side = rx * nx + rz * nz;
      this.yawRate += side * Math.sign(bestO) * impact * 0.08;
      if (impact > 3) {
        this.damage(impact * impact * 2.2, null, 'crash');
        this.lastImpact = { speed: impact, x: this.x, z: this.z, t: performance.now() };
      }
    }
  }

  damage(amount, attacker = null, cause = 'misc') {
    if (this.destroyed) return;
    this.health -= amount;
    this.lastAttacker = attacker || this.lastAttacker;
    if (this.onDamage) this.onDamage(amount, attacker, cause);
    if (this.health <= 0) {
      this.health = 0;
      this.destroyed = true;
      this.explodePending = true;
    }
  }

  repair() {
    this.health = this.maxHealth;
    this.destroyed = false;
    this.bodyMesh.material = sharedMat;
  }

  setBurnt() {
    this.bodyMesh.material = burntMat;
  }

  syncModel(dt) {
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(0, this.heading, 0);
    this.bodyGroup.rotation.set(this.pitch, 0, this.roll);
    this.wheelSpin += this.vF * dt / 0.34;
    for (const w of this.wheels) {
      w.w.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = this.steer * this.T.steer * 0.8;
    }
    const braking = (this.input.brake > 0 && this.vF > 0.5) || this.input.handbrake;
    this.tailMat.color.setHex(braking ? 0xff2020 : this.lightsOn ? 0xa00000 : 0x500000);
    if (this.lightA) {
      const on = this.siren;
      const t = performance.now() * 0.008;
      const ph = Math.sin(t) > 0;
      this.lightA.color.setHex(on ? (ph ? 0x3060ff : 0x08104a) : 0x1a2a6a);
      this.lightB.color.setHex(on ? (!ph ? (this.T.police ? 0xff2020 : 0x3060ff) : 0x400808) : 0x4a1a1a);
    }
  }
}
