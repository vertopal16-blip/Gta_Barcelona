// Modelo humano procedural (low-poly) con animación por articulaciones.

import * as THREE from 'three';
import { GeoBuilder } from '../world/geom.js';
import { damp, clamp, rand } from '../core/utils.js';

const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
const geoCache = new Map();

const SKINS = [0xf1c8a5, 0xe0ac85, 0xc68b5e, 0x8d5a3b, 0x5c3a24, 0xf5d3b8, 0xd9a07a];
const HAIRS = [0x1d1510, 0x3b2516, 0x6b4a2a, 0xc8a060, 0x8a8a8a, 0x101010, 0xa0402a, 0xe8d8b0];
const SHIRTS = [0xd83a3a, 0x3a6ad8, 0x2fa860, 0xf0f0f0, 0x202020, 0xe8c030, 0x8a3ab8, 0xf08030, 0x50b0c8, 0x7a7a7a, 0xd890b0, 0x3a3a6a, 0xa8d8a0];
const PANTS = [0x2a3550, 0x1e1e1e, 0x5a4a3a, 0x3a5a8a, 0x8a7a60, 0x4a4a4a, 0xd0c8b0, 0x22324a];
const SHOES = [0x1a1a1a, 0xf0f0f0, 0x5a3a20, 0x8a2020, 0x2a2a6a];

export function randomLook(kind = 'civil', rng = rand) {
  const look = {
    skin: rng.pick(SKINS), hair: rng.pick(HAIRS), shirt: rng.pick(SHIRTS), pants: rng.pick(PANTS), shoes: rng.pick(SHOES),
    hairStyle: rng.int(0, 3), height: rng.range(0.92, 1.08), build: rng.range(0.9, 1.15), hat: null,
  };
  if (kind === 'tourist') {
    look.shirt = rng.pick([0xf04848, 0xf0d040, 0x40c0f0, 0xf080c0, 0xffffff, 0x80e080]);
    look.pants = rng.pick([0xd0c8b0, 0x8ab0d0, 0xf0f0f0]);
    if (rng() < 0.5) look.hat = rng.pick([0xf0f0f0, 0xd84040, 0x203060]);
    look.backpack = rng() < 0.5;
  } else if (kind === 'police') {
    look.shirt = 0x1f3a6e; look.pants = 0x1a2540; look.shoes = 0x111111; look.hat = 0x1f3a6e; look.vest = 0xe8e000;
  } else if (kind === 'gang') {
    look.shirt = rng.pick([0x202020, 0x6a1010, 0x103a20]); look.pants = 0x1e1e1e; look.hat = rng() < 0.6 ? 0x111111 : null;
  } else if (kind === 'beach') {
    look.shirt = look.skin; look.pants = rng.pick([0xd83a3a, 0x3a6ad8, 0x2fa860, 0xf0c030]); look.shoes = look.skin;
  } else if (kind === 'worker') {
    look.shirt = rng.pick([0xf08030, 0x3a6ad8, 0x6a6a6a]); look.pants = 0x2a3550; look.vest = rng() < 0.6 ? 0xf0e020 : null; look.hat = rng() < 0.5 ? 0xf0f0f0 : null;
  } else if (kind === 'elder') {
    look.hair = rng.pick([0xd8d8d8, 0xb0b0b0, 0xf0f0f0]); look.shirt = rng.pick([0x6a5a4a, 0x4a5a6a, 0x8a7a6a]); look.pants = 0x4a4a4a;
  }
  return look;
}

function keyOf(look) {
  return [look.skin, look.hair, look.shirt, look.pants, look.shoes, look.hairStyle, look.hat, look.vest, look.backpack].join('|');
}

function buildGeos(look) {
  const k = keyOf(look);
  if (geoCache.has(k)) return geoCache.get(k);
  // Torso + cabeza + pelo
  const body = new GeoBuilder();
  body.box(0, 0, 0, 0.42, 0.58, 0.24, look.shirt);
  if (look.vest) body.box(0, 0.08, 0, 0.44, 0.42, 0.26, look.vest);
  body.box(0, 0.58, 0, 0.12, 0.08, 0.12, look.skin); // cuello
  body.box(0, 0.66, 0, 0.24, 0.27, 0.25, look.skin); // cabeza
  // Ojos
  body.box(-0.06, 0.78, 0.126, 0.04, 0.03, 0.01, 0x111111);
  body.box(0.06, 0.78, 0.126, 0.04, 0.03, 0.01, 0x111111);
  if (look.hat) {
    body.box(0, 0.9, 0, 0.27, 0.08, 0.28, look.hat);
    body.box(0, 0.9, 0.12, 0.25, 0.03, 0.14, look.hat);
  } else if (look.hairStyle === 0) {
    body.box(0, 0.87, -0.01, 0.26, 0.08, 0.27, look.hair);
  } else if (look.hairStyle === 1) {
    body.box(0, 0.85, -0.02, 0.26, 0.11, 0.27, look.hair);
    body.box(0, 0.62, -0.12, 0.26, 0.3, 0.05, look.hair); // melena
  } else if (look.hairStyle === 2) {
    body.box(0, 0.88, 0, 0.25, 0.04, 0.26, look.hair);
  }
  if (look.backpack) body.box(0, 0.05, -0.2, 0.34, 0.42, 0.16, 0x3a4a5a);
  // Brazo (pivote en el hombro, cuelga hacia -Y)
  const arm = new GeoBuilder();
  arm.box(0, -0.42, 0, 0.12, 0.42, 0.13, look.shirt);
  arm.box(0, -0.62, 0, 0.1, 0.2, 0.11, look.skin);
  // Pierna (pivote en la cadera)
  const leg = new GeoBuilder();
  leg.box(0, -0.82, 0, 0.16, 0.82, 0.18, look.pants);
  leg.box(0, -0.9, 0.04, 0.15, 0.09, 0.26, look.shoes);
  const g = { body: body.toGeometry(), arm: arm.toGeometry(), leg: leg.toGeometry() };
  geoCache.set(k, g);
  return g;
}

const WEAPON_GEO = {};
function weaponMesh(kind) {
  if (!WEAPON_GEO[kind]) {
    const b = new GeoBuilder();
    if (kind === 'pistol') { b.box(0, -0.05, 0.05, 0.05, 0.12, 0.08, 0x222222); b.box(0, 0.02, 0.1, 0.05, 0.06, 0.24, 0x2a2a2a); }
    else if (kind === 'smg') { b.box(0, -0.06, 0.05, 0.05, 0.15, 0.08, 0x222222); b.box(0, 0.02, 0.14, 0.07, 0.09, 0.42, 0x2a2a2a); }
    else if (kind === 'shotgun') { b.box(0, 0.02, 0.18, 0.06, 0.08, 0.75, 0x3a2a1a); b.box(0, 0.04, 0.35, 0.05, 0.05, 0.5, 0x2a2a2a); }
    else if (kind === 'rifle') { b.box(0, 0.02, 0.2, 0.06, 0.1, 0.8, 0x2a2a2a); b.box(0, -0.08, 0.1, 0.05, 0.14, 0.08, 0x2a2a2a); }
    else if (kind === 'bat') { b.cylinder(0, -0.1, 0.0, 0.025, 0.045, 0.8, 0xc8a060, 6); }
    else if (kind === 'knife') { b.box(0, 0, 0.1, 0.02, 0.03, 0.2, 0xd0d0d0); }
    else if (kind === 'phone') { b.box(0, 0, 0.04, 0.06, 0.1, 0.012, 0x111111); }
    else if (kind === 'bag') { b.box(0, -0.15, 0, 0.3, 0.25, 0.12, 0x6a3a2a); }
    else return null;
    WEAPON_GEO[kind] = b.toGeometry();
  }
  const m = new THREE.Mesh(WEAPON_GEO[kind], mat);
  m.castShadow = true;
  return m;
}

export class Humanoid {
  constructor(look) {
    this.look = look;
    const g = buildGeos(look);
    this.root = new THREE.Group();
    this.pivot = new THREE.Group(); // para caídas / inclinaciones
    this.root.add(this.pivot);
    const s = look.height || 1;
    this.pivot.scale.set(look.build || 1, s, look.build || 1);
    this.hips = new THREE.Group();
    this.hips.position.y = 0.92;
    this.pivot.add(this.hips);
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    this.body = new THREE.Mesh(g.body, mat);
    this.torso.add(this.body);
    this.armL = new THREE.Group(); this.armL.position.set(-0.28, 0.54, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.28, 0.54, 0);
    this.armL.add(new THREE.Mesh(g.arm, mat));
    this.armR.add(new THREE.Mesh(g.arm, mat));
    this.torso.add(this.armL, this.armR);
    this.legL = new THREE.Group(); this.legL.position.set(-0.11, 0.0, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.11, 0.0, 0);
    this.legL.add(new THREE.Mesh(g.leg, mat));
    this.legR.add(new THREE.Mesh(g.leg, mat));
    this.hips.add(this.legL, this.legR);
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.phase = Math.random() * 10;
    this.held = null;
    this.heldKind = null;
    this.fall = 0; // 0 de pie, 1 tumbado
    this.punchT = 0;
    this.recoilT = 0;
  }

  setHeld(kind) {
    if (this.heldKind === kind) return;
    if (this.held) { this.armR.remove(this.held); this.held = null; }
    this.heldKind = kind;
    if (!kind || kind === 'fists') return;
    const m = weaponMesh(kind);
    if (!m) return;
    m.position.set(0, -0.7, 0.02);
    this.held = m;
    this.armR.add(m);
  }

  punch() { this.punchT = 0.3; }
  recoil() { this.recoilT = 0.12; }

  /**
   * Anima según el estado.
   * state: idle | walk | run | sprint | aim | sit | fall | dead | swim | cower | surrender | jump | ride
   */
  animate(dt, state, speed = 0, opts = {}) {
    const k = 12;
    let la = 0, ra = 0, ll = 0, rl = 0, lean = 0, armSideL = 0, armSideR = 0, hipsY = 0.92, pitch = 0, torsoYaw = 0;
    const amp = clamp(speed / 6, 0, 1.15);
    this.phase += dt * (2.2 + speed * 1.35);
    const s = Math.sin(this.phase);
    let fallTarget = 0;
    switch (state) {
      case 'walk': case 'run': case 'sprint': case 'aimwalk':
        ll = s * 0.75 * amp; rl = -s * 0.75 * amp;
        la = -s * 0.65 * amp; ra = s * 0.65 * amp;
        lean = state === 'sprint' ? 0.22 : state === 'run' ? 0.1 : 0.02;
        hipsY = 0.92 + Math.abs(Math.cos(this.phase)) * 0.05 * amp;
        break;
      case 'jump':
        ll = -0.5; rl = 0.3; la = -0.8; ra = -0.8; armSideL = 0.3; armSideR = 0.3;
        break;
      case 'sit':
        ll = -1.45; rl = -1.45; la = -0.6; ra = -0.6; hipsY = 0.5;
        break;
      case 'ride':
        ll = -1.1; rl = -1.1; la = -1.0; ra = -1.0; lean = 0.25; hipsY = 0.75; armSideL = -0.15; armSideR = -0.15;
        break;
      case 'swim':
        lean = 1.35; ll = s * 0.4; rl = -s * 0.4; la = -2.5 + s * 1.2; ra = -2.5 - s * 1.2; hipsY = 0.4;
        break;
      case 'cower':
        hipsY = 0.55; ll = -1.2; rl = -1.2; la = -2.6; ra = -2.6; armSideL = 0.4; armSideR = 0.4; lean = 0.4;
        break;
      case 'surrender':
        la = -3.0; ra = -3.0; armSideL = 0.25; armSideR = 0.25;
        break;
      case 'dead': case 'fall':
        fallTarget = 1;
        la = -0.3; ra = 0.4; ll = 0.15; rl = -0.1; armSideL = 0.6; armSideR = 0.8;
        break;
      case 'idle': default:
        la = Math.sin(this.phase * 0.3) * 0.03; ra = -la;
        break;
    }
    // Brazo de apuntar / golpear
    if (opts.aim) {
      ra = -Math.PI / 2 + (opts.aimPitch || 0);
      if (this.heldKind && this.heldKind !== 'pistol' && this.heldKind !== 'bat' && this.heldKind !== 'knife') { la = -1.3 + (opts.aimPitch || 0); armSideL = -0.5; }
      torsoYaw = 0.0;
      if (this.recoilT > 0) ra -= this.recoilT * 2.5;
    }
    if (this.punchT > 0) {
      const t = this.punchT / 0.3;
      if (this.heldKind === 'bat') { ra = -2.6 + (1 - t) * 3.2; armSideR = -0.3; }
      else ra = -Math.PI / 2 * Math.sin(t * Math.PI) - 0.2;
      this.punchT -= dt;
    }
    if (opts.phone) { ra = -1.9; armSideR = -0.6; }
    if (opts.carry) { la = -0.25; armSideL = 0.15; }
    this.recoilT = Math.max(0, this.recoilT - dt);

    const L = (cur, tgt) => damp(cur, tgt, k, dt);
    this.legL.rotation.x = L(this.legL.rotation.x, ll);
    this.legR.rotation.x = L(this.legR.rotation.x, rl);
    this.armL.rotation.x = L(this.armL.rotation.x, la);
    this.armR.rotation.x = L(this.armR.rotation.x, ra);
    this.armL.rotation.z = L(this.armL.rotation.z, -armSideL);
    this.armR.rotation.z = L(this.armR.rotation.z, armSideR);
    this.torso.rotation.x = L(this.torso.rotation.x, lean);
    this.torso.rotation.y = L(this.torso.rotation.y, torsoYaw);
    this.hips.position.y = L(this.hips.position.y, hipsY);
    this.fall = damp(this.fall, fallTarget, fallTarget ? 7 : 4, dt);
    this.pivot.rotation.x = -this.fall * Math.PI / 2;
    this.pivot.position.y = this.fall * 0.15;
    this.pivot.position.z = -this.fall * 0.9;
    void pitch;
  }

  dispose() {
    this.root.removeFromParent();
  }
}
