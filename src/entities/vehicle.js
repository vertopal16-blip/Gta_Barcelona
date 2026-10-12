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
  speedboat: { name: 'Llanxa Gregal', kind: 'boat', len: 6.5, wid: 2.3, hei: 1.6, mass: 1400, maxSpeed: 32, accel: 7, brake: 6, grip: 2.2, steer: 0.9, value: 4000,
    colors: [0xf4f4f4, 0xd83a3a, 0x1f3a8e, 0xf0c030] },
  dinghy: { name: 'Zodiac Tramuntana', kind: 'boat', len: 4.2, wid: 1.9, hei: 1.0, mass: 500, maxSpeed: 22, accel: 6, brake: 5, grip: 2.6, steer: 1.0, value: 900,
    colors: [0x3a3a3a, 0xe86a20, 0x2a5a8a] },
  policeboat: { name: 'Patrullera', kind: 'boat', len: 7.5, wid: 2.6, hei: 2.0, mass: 2000, maxSpeed: 34, accel: 7.5, brake: 6, grip: 2.4, steer: 0.85, value: 0, colors: [0xf4f4f4], police: true },
  heli: { name: 'Helicòpter Mistral', kind: 'heli', len: 9, wid: 2.4, hei: 2.6, mass: 2200, maxSpeed: 45, accel: 12, brake: 8, grip: 3, steer: 1.2, value: 0, colors: [0xf0f0f0, 0xd83a3a, 0x1f3a8e, 0x2a2a2a] },
  bicing: { name: 'Bicing', kind: 'bike', pedal: true, len: 1.75, wid: 0.6, hei: 1.1, mass: 20, maxSpeed: 9.5, accel: 3.2, brake: 7, grip: 9, steer: 0.8, value: 50, colors: [0xd8202a] },
  scooter: { name: 'Llevant 125', kind: 'bike', len: 1.9, wid: 0.75, hei: 1.2, mass: 140, maxSpeed: 27, accel: 8, brake: 13, grip: 11, steer: 0.75, value: 350,
    colors: [0xf0f0f0, 0xd83a3a, 0x3a3a3a, 0x60c0e0, 0xf0c030] },
  moto: { name: 'Ponent 750', kind: 'bike', len: 2.1, wid: 0.8, hei: 1.25, mass: 220, maxSpeed: 62, accel: 15, brake: 18, grip: 13, steer: 0.7, value: 2800,
    colors: [0x101010, 0xd81e1e, 0x1e5ad8, 0xf0a010] },
};

const sharedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const burntMat = new THREE.MeshLambertMaterial({ color: 0x1c1c1c });
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
const rimMat = new THREE.MeshLambertMaterial({ color: 0xb8bcc0 });
const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.12, 8).rotateZ(Math.PI / 2);
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
  if (T.kind === 'heli') {
    b.box(0, 0.5, 0.6, 2.2, 1.7, 3.2, color); // fuselaje
    b.box(0, 0.75, 2.25, 1.9, 1.3, 0.6, glass); // cabina
    b.box(0, 1.2, -2.6, 0.45, 0.45, 4.2, color); // cola
    b.box(0, 1.4, -4.6, 0.12, 1.3, 0.8, color); // deriva
    b.box(0, 2.2, 0.5, 0.5, 0.5, 0.8, 0x2a2a2a); // eje del rotor
    for (const sx of [1, -1]) { b.box(sx * 0.9, 0, 0.5, 0.1, 0.1, 3.4, 0x2a2a2a); b.box(sx * 0.9, 0.05, -0.3, 0.06, 0.45, 0.06, 0x2a2a2a); b.box(sx * 0.9, 0.05, 1.3, 0.06, 0.45, 0.06, 0x2a2a2a); }
    b.box(0, 0.95, 0.6, 2.22, 0.15, 3.0, 0xf2b33d); // franja
  } else if (T.kind === 'boat') {
    // Casco en cuña + cabina
    const hz = L / 2, hw = W / 2;
    const hull = color, deck = 0xd8cfb8;
    const P = (x, y, z) => [x, y, z];
    const bow = P(0, 0.9, hz), kb = P(0, -0.3, hz - 1.2);
    b.quad(P(hw, 0.9, -hz), P(hw, 0.9, hz - 1.6), P(hw * 0.6, -0.35, hz - 1.6), P(hw * 0.6, -0.35, -hz), hull);
    b.quad(P(-hw * 0.6, -0.35, -hz), P(-hw * 0.6, -0.35, hz - 1.6), P(-hw, 0.9, hz - 1.6), P(-hw, 0.9, -hz), hull);
    b.tri(P(hw, 0.9, hz - 1.6), bow, P(hw * 0.6, -0.35, hz - 1.6), hull);
    b.tri(P(-hw, 0.9, hz - 1.6), P(-hw * 0.6, -0.35, hz - 1.6), bow, hull);
    b.tri(P(hw * 0.6, -0.35, hz - 1.6), bow, kb, hull);
    b.tri(P(-hw * 0.6, -0.35, hz - 1.6), kb, bow, hull);
    b.quad(P(hw * 0.6, -0.35, -hz), P(-hw * 0.6, -0.35, -hz), P(-hw, 0.9, -hz), P(hw, 0.9, -hz), hull); // popa
    b.quad(P(hw, 0.9, -hz), P(-hw, 0.9, -hz), P(-hw, 0.9, hz - 1.6), P(hw, 0.9, hz - 1.6), deck); // cubierta
    b.tri(P(hw, 0.9, hz - 1.6), P(-hw, 0.9, hz - 1.6), bow, deck);
    b.box(0, 0.25, 0, W + 0.04, 0.12, L - 1.8, 0x1a1a1a); // línea de flotación
    if (type !== 'dinghy') {
      b.box(0, 0.9, -0.2, W * 0.7, 0.9, 1.6, T.police ? 0x1f3a8e : 0xf0f0f0);
      b.box(0, 1.5, 0.45, W * 0.66, 0.5, 0.08, glass);
      b.box(0, 1.8, -0.2, W * 0.75, 0.08, 1.8, T.police ? 0x1f3a8e : 0xe8e8e8);
    } else {
      b.box(0, 0.9, -0.6, 0.6, 0.4, 0.6, 0x2a2a2a);
    }
    b.box(0, 0.4, -hz - 0.25, 0.4, 0.9, 0.45, 0x222222); // motor fueraborda
  } else if (type === 'bicing') {
    // Bicicleta pública roja y blanca
    b.box(0, 0.62, 0.05, 0.06, 0.06, 1.0, 0xd8202a, 0); // barra superior
    b.box(0, 0.35, 0.2, 0.06, 0.06, 0.9, 0xf0f0f0); // barra inferior
    b.box(0, 0.35, -0.25, 0.06, 0.55, 0.06, 0xd8202a); // tubo sillín
    b.box(0, 0.92, -0.28, 0.16, 0.06, 0.26, 0x1a1a1a); // sillín
    b.box(0, 0.45, 0.55, 0.06, 0.65, 0.06, 0xf0f0f0); // horquilla
    b.box(0, 1.08, 0.55, 0.6, 0.04, 0.04, 0x2a2a2a); // manillar
    b.box(0, 0.85, 0.75, 0.32, 0.22, 0.26, 0x2a2a2a); // cesta
    b.box(0, 0.32, -0.62, 0.14, 0.18, 0.08, 0xd8202a); // guardabarros
  } else if (T.kind === 'bike') {
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
    // Turismo: chasis perfilado + habitáculo trapezoidal
    const P = {
      compact: { base: 0.3, bodyH: 0.62, cb: -1.75, cf: 0.55, rb: -1.55, rf: -0.15, nose: 0.3 },
      sedan: { base: 0.3, bodyH: 0.6, cb: -1.55, cf: 0.85, rb: -1.1, rf: 0.2, nose: 0.35 },
      taxi: { base: 0.3, bodyH: 0.6, cb: -1.55, cf: 0.85, rb: -1.1, rf: 0.2, nose: 0.35 },
      police: { base: 0.3, bodyH: 0.62, cb: -1.55, cf: 0.85, rb: -1.1, rf: 0.2, nose: 0.35 },
      sports: { base: 0.24, bodyH: 0.5, cb: -1.3, cf: 0.75, rb: -0.85, rf: 0.0, nose: 0.5 },
      suv: { base: 0.42, bodyH: 0.8, cb: -2.25, cf: 0.9, rb: -2.15, rf: 0.3, nose: 0.25 },
    }[type] || { base: 0.3, bodyH: 0.62, cb: -1.5, cf: 0.8, rb: -1.1, rf: 0.2, nose: 0.3 };
    const y0 = P.base, y1 = P.base + P.bodyH, yTop = H;
    const hw = W / 2, hz = L / 2;
    // Perfil lateral del chasis (z, y), sentido antihorario visto desde +x
    const prof = [[-hz, y0], [hz, y0], [hz, y1 - 0.12], [hz - P.nose, y1], [-hz + 0.25, y1], [-hz, y1 - 0.1]];
    const side = (x, flip) => {
      const pts = prof.map(([z, y]) => [x, y, z]);
      for (let i = 1; i < pts.length - 1; i++) {
        if (flip) b.tri(pts[0], pts[i], pts[i + 1], color, [-1, 0, 0]);
        else b.tri(pts[0], pts[i + 1], pts[i], color, [1, 0, 0]);
      }
    };
    side(hw, false);
    side(-hw, true);
    for (let i = 0; i < prof.length; i++) {
      const [za, ya] = prof[i], [zb, yb] = prof[(i + 1) % prof.length];
      b.quad([-hw, ya, za], [hw, ya, za], [hw, yb, zb], [-hw, yb, zb], color);
    }
    // Habitáculo: base ancha, techo estrecho
    const cw = hw - 0.06, tw = hw - 0.24;
    const g0 = [cw, y1, P.cf], g1 = [-cw, y1, P.cf], g2 = [-tw, yTop, P.rf], g3 = [tw, yTop, P.rf];
    const h0 = [cw, y1, P.cb], h1 = [-cw, y1, P.cb], h2 = [-tw, yTop, P.rb], h3 = [tw, yTop, P.rb];
    b.quad(g1, g0, g3, g2, glass); // parabrisas
    b.quad(h0, h1, h2, h3, glass); // luna trasera
    b.quad(g3, h3, h2, g2, color); // techo
    b.quad(g0, h0, h3, g3, glass); // lateral derecho
    b.quad(h1, g1, g2, h2, glass); // lateral izquierdo
    // Pilares B y marcos
    const bz = (P.cf + P.cb) / 2, bzT = (P.rf + P.rb) / 2;
    for (const sx of [1, -1]) {
      const pa = [sx * (cw + 0.01), y1, bz - 0.06], pb = [sx * (cw + 0.01), y1, bz + 0.06], pc = [sx * (tw + 0.01), yTop, bzT + 0.06], pd = [sx * (tw + 0.01), yTop, bzT - 0.06];
      if (sx > 0) b.quad(pb, pa, pd, pc, color, null, [1, 0, 0]); else b.quad(pa, pb, pc, pd, color, null, [-1, 0, 0]);
      b.box(sx * (hw + 0.06), y1 - 0.05, P.cf - 0.15, 0.12, 0.1, 0.18, color); // retrovisor
      b.box(sx * (hw + 0.005), y0 + 0.28, bz, 0.01, 0.02, 1.6, trim); // línea de puertas
      b.box(sx * (hw + 0.01), y0 + 0.36, bz + 0.25, 0.02, 0.04, 0.16, 0x888888); // maneta
    }
    // Pasos de rueda, parachoques y calandra
    const wz = hz - 0.8;
    for (const sz of [wz, -wz]) for (const sx of [1, -1]) b.box(sx * (hw - 0.04), 0.12, sz, 0.1, 0.55, 0.95, 0x141414);
    b.box(0, y0 - 0.02, hz - 0.02, W + 0.04, 0.2, 0.12, trim);
    b.box(0, y0 - 0.02, -hz + 0.02, W + 0.04, 0.2, 0.12, trim);
    b.box(0, y0 + 0.22, hz + 0.01, W * 0.4, 0.14, 0.02, 0x1a1a1a);
    b.box(0, y0 + 0.18, -hz - 0.01, 0.5, 0.11, 0.02, 0xe8e8e0); // matrícula
    b.box(0, y0 + 0.18, hz + 0.02, 0.5, 0.11, 0.02, 0xe8e8e0);
    if (T.taxi) {
      // Taxi de Barcelona: negro con puertas amarillas
      for (const sx of [1, -1]) b.box(sx * (hw + 0.008), y0 + 0.05, bz, 0.01, P.bodyH - 0.12, 1.9, 0xf2c200);
      b.box(0, yTop + 0.01, (P.rf + P.rb) / 2, 0.55, 0.15, 0.24, 0xf0f0f0);
      b.box(0, yTop + 0.1, (P.rf + P.rb) / 2 + 0.1, 0.1, 0.06, 0.06, 0x30e030);
    }
    if (T.police) {
      for (const sx of [1, -1]) {
        b.box(sx * (hw + 0.008), y0 + 0.12, 0, 0.01, 0.22, L - 0.5, 0x1f3a8e);
        b.box(sx * (hw + 0.009), y0 + 0.36, 0, 0.01, 0.07, L - 0.5, 0xe8e000);
      }
      b.box(0, y1 + 0.01, hz - 0.6, W - 0.4, 0.01, 0.6, 0x1f3a8e);
    }
    if (type === 'sports') b.box(0, y1 + 0.12, -hz + 0.25, W - 0.2, 0.05, 0.32, 0x111111), b.box(0, y1, -hz + 0.25, 0.06, 0.14, 0.06, 0x111111);
    if (type === 'suv') { b.box(0, yTop + 0.02, (P.rf + P.rb) / 2, W - 0.5, 0.06, 2, 0x2a2a2a); b.box(0, y1 - 0.1, -hz - 0.15, 0.7, 0.7, 0.25, 0x2a2a2a); }
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
    this.T = { ...VEHICLE_TYPES[type] };
    this.base = VEHICLE_TYPES[type];
    this.upgrades = { engine: 0, brakes: 0, armor: 0, nitro: false, ...(opts.upgrades || {}) };
    this.nitro = 1;
    this.nitroT = 0;
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
    this.isBoat = this.T.kind === 'boat';
    this.isHeli = this.T.kind === 'heli';
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
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.position.x = x > 0 ? 0.07 : -0.07;
      if (g !== bikeWheelGeo) w.add(rim);
      pivot.add(w);
      this.bodyGroup.add(pivot);
      this.wheels.push({ pivot, w, front });
    };
    if (this.isHeli) {
      this.rotor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.06, 0.35), wheelMat);
      this.rotor.position.set(0, 2.5, 0.5);
      const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 10), wheelMat);
      this.rotor.add(r2);
      this.tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.4, 0.2), wheelMat);
      this.tailRotor.position.set(0.18, 1.4, -4.6);
      this.bodyGroup.add(this.rotor, this.tailRotor);
      this.rotorSpeed = 0;
    } else if (this.isBoat) {
      // sin ruedas
    } else if (this.isBike) {
      addWheel(0, T.len / 2 - 0.3, true, bikeWheelGeo, 0.32);
      addWheel(0, -T.len / 2 + 0.3, false, bikeWheelGeo, 0.32);
    } else {
      const wx = T.wid / 2 - 0.12, wz = T.len / 2 - (T.len > 7 ? 1.6 : 0.8);
      addWheel(wx, wz, true); addWheel(-wx, wz, true);
      addWheel(wx, -wz, false); addWheel(-wx, -wz, false);
      if (T.len > 7) { addWheel(wx, -wz + 1.4, false); addWheel(-wx, -wz + 1.4, false); }
    }
    this.applyUpgrades();
    this.syncModel(0);
  }

  /** Activa el nitro si está cargado. */
  useNitro() {
    if (!this.upgrades.nitro || this.nitro < 0.99 || this.destroyed) return false;
    this.nitro = 0;
    this.nitroT = 3;
    return true;
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
    if (this.isBoat) return this.updateBoat(dt, collision);
    if (this.isHeli) return this.updateHeli(dt, collision);
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
      const boosting = this.nitroT > 0;
      const maxS = T.maxSpeed * (boosting ? 1.3 : 1);
      if (engineOn && inp.throttle > 0) {
        if (vF < -0.5) a += T.brake * inp.throttle;
        else a += T.accel * (boosting ? 2.2 : 1) * inp.throttle * Math.max(0.05, 1 - (vF / maxS) ** 2);
      }
      if (boosting) { this.nitroT -= dt; if (this.nitroT <= 0) this.nitroT = 0; }
      else if (this.upgrades.nitro) this.nitro = Math.min(1, this.nitro + dt / 14);
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
      const gripMax = (inp.handbrake ? T.grip * 0.28 : T.grip) * (this.wet ? 0.8 : 1) * (this.driver && this.driver.isPlayer ? this.skillMul || 1 : 1);
      const dv = clamp(-vS, -gripMax * dt, gripMax * dt);
      vS += dv;
      this.drifting = Math.abs(vS) > 2.5;
      // Giro
      const wheelBase = T.len * 0.6;
      const steerAng = T.steer * this.steer / (1 + Math.abs(vF) / (28 * (this.driver && this.driver.isPlayer ? this.skillMul || 1 : 1)));
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

  /** Vuelo simplificado de helicóptero. */
  updateHeli(dt, collision) {
    const T = this.T, inp = this.input;
    const piloted = !!this.driver && !this.destroyed;
    this.rotorSpeed = damp(this.rotorSpeed || 0, piloted ? 1 : 0, piloted ? 0.8 : 0.3, dt);
    const power = this.rotorSpeed;
    const fx = this.fx, fz = this.fz;
    const gh = groundHeight(this.x, this.z);
    // Elevación
    const lift = piloted ? (inp.lift || 0) : 0;
    this.vy += (lift * 9 * power - (power > 0.6 ? 0 : 9.8 * (1 - power))) * dt;
    if (power > 0.6 && !lift) this.vy = damp(this.vy, 0, 2.5, dt);
    this.vy = clamp(this.vy, -18, 10);
    // Avance y giro
    const fwd = piloted && power > 0.6 && this.y > gh + 0.8 ? inp.throttle - inp.brake : 0;
    this.vx += fx * fwd * T.accel * dt;
    this.vz += fz * fwd * T.accel * dt;
    const drag = Math.exp(-dt * 0.6);
    this.vx *= drag; this.vz *= drag;
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > T.maxSpeed) { this.vx *= T.maxSpeed / sp; this.vz *= T.maxSpeed / sp; }
    this.yawRate = damp(this.yawRate, -(inp.steer || 0) * T.steer * power, 4, dt);
    this.heading = wrapAngle(this.heading + this.yawRate * dt);
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    this.x = clamp(this.x, MAP.minX - 200, MAP.maxX + 200);
    this.z = clamp(this.z, MAP.minZ - 200, MAP.maxZ + 600);
    this.y = Math.min(this.y, 320);
    const floor = Math.max(gh, SEA_LEVEL);
    if (this.y <= floor) {
      if (this.vy < -7) this.damage((-this.vy - 7) * 80, null, 'crash');
      this.y = floor; this.vy = Math.max(0, this.vy);
      this.vx *= 0.8; this.vz *= 0.8;
      this.onGround = true;
      if (gh < SEA_LEVEL - 0.5 && !this.destroyed) { this.sinkT += dt; }
    } else this.onGround = false;
    if (collision) {
      const before = Math.hypot(this.vx, this.vz);
      this.collideWorld(collision);
      if (before > 8 && Math.hypot(this.vx, this.vz) < before * 0.7) this.damage(before * 25, null, 'crash');
    }
    this.vF = this.vx * fx + this.vz * fz;
    this.pitch = damp(this.pitch, -fwd * 0.22 + (this.onGround ? 0 : 0), 3, dt);
    this.roll = damp(this.roll, (inp.steer || 0) * 0.15 * power, 3, dt);
    if (this.rotor) { this.rotor.rotation.y += dt * 30 * power; this.tailRotor.rotation.x += dt * 40 * power; }
    if (this.destroyed) { this.vy -= 9.8 * dt; }
    this.syncModel(dt);
  }

  /** Física de lancha: deriva, cabeceo, varado en la costa. */
  updateBoat(dt, collision) {
    const T = this.T, inp = this.input;
    const fx = this.fx, fz = this.fz, rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vS = this.vx * rx + this.vz * rz;
    this.steer = damp(this.steer, clamp(inp.steer, -1, 1), 5, dt);
    const engine = !this.destroyed;
    let a = 0;
    if (engine && inp.throttle > 0) a += T.accel * inp.throttle * Math.max(0.05, 1 - (vF / T.maxSpeed) ** 2);
    if (engine && inp.brake > 0) a -= (vF > 0.5 ? T.brake : T.accel * 0.5) * inp.brake * (vF < -6 ? 0 : 1);
    a -= vF * 0.25;
    vF += a * dt;
    vS -= vS * Math.min(1, T.grip * dt * (inp.handbrake ? 0.4 : 1));
    const turn = -this.steer * T.steer * (0.35 + Math.min(1, Math.abs(vF) / 10)) * Math.sign(vF || 1);
    this.yawRate = damp(this.yawRate, turn, 3, dt);
    this.vF = vF; this.vS = vS;
    this.vx = fx * vF + rx * vS; this.vz = fz * vF + rz * vS;
    this.heading = wrapAngle(this.heading + this.yawRate * dt);
    const nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    // Varado: no puede entrar en tierra
    const ahead = groundHeight(nx + fx * T.len * 0.45, nz + fz * T.len * 0.45);
    if (ahead > SEA_LEVEL - 0.5) {
      const impact = Math.abs(vF);
      if (impact > 6) { this.damage(impact * impact * 2, null, 'crash'); this.lastImpact = { speed: impact, t: performance.now() }; }
      this.vx *= -0.3; this.vz *= -0.3;
    } else { this.x = nx; this.z = nz; }
    this.x = clamp(this.x, MAP.minX - 1500, MAP.maxX + 1500);
    this.z = clamp(this.z, MAP.minZ, MAP.maxZ + 2500);
    if (collision) this.collideWorld(collision);
    this.t = (this.t || 0) + dt;
    const sink = this.destroyed ? Math.min(3, (this.burnT += dt) * 0.3) : 0;
    this.y = SEA_LEVEL - 0.15 + Math.sin(this.t * 1.7 + this.id) * 0.08 - sink;
    this.onGround = true;
    this.pitch = damp(this.pitch, -Math.min(0.18, Math.abs(vF) * 0.008) + Math.sin(this.t * 1.3) * 0.02, 3, dt);
    this.roll = damp(this.roll, clamp(this.yawRate * vF * 0.04, -0.3, 0.3) + Math.sin(this.t * 1.1 + 1) * 0.03, 3, dt);
    this.drifting = Math.abs(vS) > 3;
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

  /** Aplica las mejoras del taller a las estadísticas. */
  applyUpgrades() {
    const u = this.upgrades, B = this.base;
    this.T.accel = B.accel * (1 + 0.16 * u.engine);
    this.T.maxSpeed = B.maxSpeed * (1 + 0.08 * u.engine);
    this.T.brake = B.brake * (1 + 0.22 * u.brakes);
    this.T.grip = B.grip * (1 + 0.06 * u.brakes);
  }

  damage(amount, attacker = null, cause = 'misc') {
    if (this.destroyed) return;
    amount *= 1 - 0.2 * (this.upgrades?.armor || 0);
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
