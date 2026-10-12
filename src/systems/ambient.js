// Vida ambiental: palomas, artistas callejeros, grupos charlando y gente sentada.

import * as THREE from 'three';
import { rand, dist2 } from '../core/utils.js';
import { events } from '../core/events.js';
import { audio } from '../core/audio.js';
import { GeoBuilder } from '../world/geom.js';

const FLOCKS = [
  { x: 0, z: 12, n: 26 }, { x: 49, z: 319, n: 12 }, { x: 116, z: 245, n: 10 }, { x: 286, z: -372, n: 12 },
  { x: -580, z: -40, n: 10 }, { x: 0, z: 150, n: 8 }, { x: 536, z: 230, n: 10 }, { x: -75, z: -607, n: 8 },
];

const PERFORMERS = [
  { x: 4.5, z: 120, kind: 'statue', name: 'Estatua humana' },
  { x: -4.5, z: 205, kind: 'play', name: 'Guitarrista' },
  { x: 4.5, z: 290, kind: 'statue', name: 'Estatua humana' },
  { x: 40, z: 312, kind: 'dance', name: 'Bailarín' },
  { x: 352, z: -335, kind: 'play', name: 'Músico' },
  { x: 610, z: 432, kind: 'dance', name: 'Bailarina' },
];

const GROUP_SPOTS = [[-20, 20], [25, 0], [100, 240], [60, 330], [-120, 300], [-70, -600], [55, -480], [536, 200], [300, -360], [-580, 110], [700, 440], [-130, 160]];

export class Ambient {
  constructor(game) {
    this.game = game;
    this.pigeons = [];
    this.t = 0;
    this.spawnT = 0;
    this.performers = PERFORMERS;
    this.groups = [];
    this.sitters = [];
    this.buildPigeons();
    events.on('gunshot', (e) => this.scare(e.x, e.z, 45));
    events.on('explosion', (e) => this.scare(e.x, e.z, 90));
  }

  buildPigeons() {
    const b = new GeoBuilder();
    b.box(0, 0.08, 0, 0.12, 0.12, 0.24, 0x8a8f98);
    b.box(0, 0.2, 0.11, 0.08, 0.09, 0.09, 0x6a7a8a);
    b.box(0, 0.19, 0.17, 0.03, 0.03, 0.05, 0xd8a040);
    b.box(0.09, 0.12, -0.02, 0.06, 0.03, 0.18, 0x7a7f88);
    b.box(-0.09, 0.12, -0.02, 0.06, 0.03, 0.18, 0x7a7f88);
    const total = FLOCKS.reduce((a, f) => a + f.n, 0);
    this.pMesh = new THREE.InstancedMesh(b.toGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), total);
    this.pMesh.frustumCulled = false;
    this.game.scene.add(this.pMesh);
    const W = this.game.world;
    for (const f of FLOCKS) {
      for (let i = 0; i < f.n; i++) {
        const x = f.x + rand.range(-8, 8), z = f.z + rand.range(-8, 8);
        this.pigeons.push({ flock: f, hx: x, hz: z, x, z, y: W.groundHeight(x, z), h: rand() * 6.28, state: 'ground', t: rand() * 3, vy: 0, a: rand() * 6.28 });
      }
    }
  }

  scare(x, z, r) {
    for (const p of this.pigeons) {
      if (p.state === 'ground' && dist2(p.x, p.z, x, z) < r) { p.state = 'fly'; p.t = rand.range(6, 12); p.vy = rand.range(3, 5); }
    }
  }

  updatePigeons(dt) {
    const g = this.game, pl = g.player;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    let flap = false;
    this.pigeons.forEach((p, i) => {
      const near = dist2(pl.x, pl.z, p.flock.x, p.flock.z) < 150;
      if (near) {
        const W = g.world;
        if (p.state === 'ground') {
          const dp = dist2(p.x, p.z, pl.x, pl.z);
          if (dp < (pl.speed > 3 ? 6 : 2.5) || (pl.vehicle && dp < 12 && pl.vehicle.speed > 3)) { p.state = 'fly'; p.t = rand.range(5, 10); p.vy = rand.range(3, 5); flap = true; }
          p.t -= dt;
          if (p.t <= 0) {
            // Pequeño paso o picoteo
            p.t = rand.range(0.4, 2.5);
            p.h += rand.range(-1.5, 1.5);
            const step = rand.range(0, 0.4);
            const nx = p.x + Math.sin(p.h) * step, nz = p.z + Math.cos(p.h) * step;
            if (dist2(nx, nz, p.hx, p.hz) < 10) { p.x = nx; p.z = nz; }
          }
          p.y = W.groundHeight(p.x, p.z);
        } else {
          p.t -= dt;
          p.a += dt * 0.8;
          const tx = p.flock.x + Math.cos(p.a) * 18, tz = p.flock.z + Math.sin(p.a) * 18;
          const gy = W.groundHeight(p.x, p.z);
          const ty = p.t > 0 ? gy + 12 + Math.sin(p.a * 3) * 2 : W.groundHeight(p.hx, p.hz);
          p.h = Math.atan2(tx - p.x, tz - p.z);
          const sp = p.t > 0 ? 7 : 4;
          if (p.t > 0) { p.x += Math.sin(p.h) * sp * dt; p.z += Math.cos(p.h) * sp * dt; }
          else { p.x += (p.hx - p.x) * dt * 0.8; p.z += (p.hz - p.z) * dt * 0.8; p.h = Math.atan2(p.hx - p.x, p.hz - p.z); }
          p.y += (ty - p.y) * Math.min(1, dt * 1.5);
          if (p.t <= 0 && dist2(p.x, p.z, p.hx, p.hz) < 0.6 && Math.abs(p.y - ty) < 0.3) { p.state = 'ground'; p.t = 1; }
        }
      }
      v.set(p.x, p.y + (p.state === 'fly' ? Math.sin(this.t * 25 + i) * 0.05 : 0), p.z);
      q.setFromAxisAngle(up, p.h);
      m.compose(v, q, s);
      this.pMesh.setMatrixAt(i, m);
    });
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (flap) audio.play('swing', pl.x, pl.z);
  }

  // -------------------------------------------------------------------------
  update(dt) {
    const g = this.game, pl = g.player;
    this.t += dt;
    this.updatePigeons(dt);
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1.5; this.manage(); }
    // Propinas a los artistas
    let prompt = '';
    for (const pf of this.performers) {
      const p = pf.ped;
      if (!p || !p.alive || p.removed || pl.vehicle) continue;
      if (dist2(p.x, p.z, pl.x, pl.z) < 2.2 && p.pose) {
        prompt = `<kbd>E</kbd> Dar propina a ${pf.name} (2 €)`;
        if (g.input.hit('KeyE') && !g.modalOpen) {
          if (g.economy.spend(2)) {
            p.say(rand.pick(['Moltes gràcies!', '¡Gracias, guapo!', 'Merci!', 'Grazie!']), 2.5);
            if (pf.kind === 'statue') { p.pose = 'dance'; setTimeout(() => { if (!p.removed && p.pose) p.pose = 'statue'; }, 2500); }
            g.stats.goodDeeds++;
          }
        }
      }
    }
    g.hud.externalPrompt = prompt;
  }

  /** Crea y retira artistas, grupos y gente sentada cerca del jugador. */
  manage() {
    const g = this.game, pl = g.player, P = g.peds;
    const night = g.world.sky.night > 0.6;
    // Artistas
    for (const pf of PERFORMERS) {
      const d = dist2(pl.x, pl.z, pf.x, pf.z);
      if (d < 90 && !pf.ped && !night) {
        const look = pf.kind === 'statue'
          ? { skin: 0xc0c4c8, hair: 0xc0c4c8, shirt: 0xb8bcc0, pants: 0xb0b4b8, shoes: 0xa8acb0, hairStyle: 2, height: 1, build: 1, hat: 0xc8ccd0 }
          : undefined;
        const p = P.create('civil', pf.x, pf.z, { look, heading: Math.PI / 2 });
        p.pose = pf.kind;
        p.faceTo = { x: pf.x + (pf.x > 0 ? -5 : 5), z: pf.z };
        if (pf.kind === 'play') p.model.setHeld('guitar');
        if (pf.kind === 'statue') {
          p.baseOffset = 0.6;
          if (!pf.box) {
            const y = g.world.groundHeight(pf.x, pf.z);
            pf.box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), new THREE.MeshLambertMaterial({ color: 0x8a8a90 }));
            pf.box.position.set(pf.x, y + 0.3, pf.z);
            g.scene.add(pf.box);
          }
        }
        p.onScare = () => { pf.ped = null; };
        pf.ped = p;
      } else if (pf.ped && (d > 140 || night)) {
        P.remove(pf.ped);
        pf.ped = null;
      }
      if (pf.ped && pf.ped.removed) pf.ped = null;
      // Música del guitarrista
      if (pf.ped && pf.kind === 'play' && d < 25 && audio.ctx && Math.random() < 0.7) {
        const notes = [220, 247, 262, 294, 330, 349, 392];
        audio._tone(notes[Math.floor(Math.random() * notes.length)] * (Math.random() < 0.3 ? 2 : 1), 0.6, 0.06 * (1 - d / 25), 'triangle');
      }
    }
    // Grupos charlando
    this.groups = this.groups.filter((gr) => gr.peds.some((p) => !p.removed && p.alive && p.pose));
    if (this.groups.length < 3) {
      const spot = rand.pick(GROUP_SPOTS);
      const d = dist2(pl.x, pl.z, spot[0], spot[1]);
      if (d > 30 && d < 110 && !this.groups.some((gr) => gr.spot === spot) && !g.isVisible(spot[0], 1, spot[1], 3)) {
        const n = rand.int(2, 4);
        const peds = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const x = spot[0] + Math.cos(a) * 0.9, z = spot[1] + Math.sin(a) * 0.9;
          if (g.world.collision.resolveCircle(x, z, 0.4, g.world.groundHeight(x, z), 1.7).hit) continue;
          const p = P.create(rand() < 0.3 ? 'tourist' : 'civil', x, z, { lookKind: rand() < 0.3 ? 'tourist' : rand() < 0.2 ? 'elder' : 'civil' });
          p.pose = rand() < 0.7 ? 'chat' : 'idle';
          p.faceTo = { x: spot[0], z: spot[1] };
          p.heading = Math.atan2(spot[0] - x, spot[1] - z);
          peds.push(p);
        }
        if (peds.length) this.groups.push({ spot, peds });
      }
    }
    // Gente sentada en bancos
    this.sitters = this.sitters.filter((p) => !p.removed && p.alive && p.pose === 'sit');
    const benches = g.world.city.benchPositions || [];
    if (this.sitters.length < 6 && benches.length) {
      for (let k = 0; k < 6; k++) {
        const bpos = benches[Math.floor(Math.random() * benches.length)];
        const [bx, bz, a] = bpos;
        const d = dist2(pl.x, pl.z, bx, bz);
        if (d < 25 || d > 100 || bpos.taken || g.isVisible(bx, 1, bz, 2)) continue;
        // El banco mira hacia la acera: el peatón se sienta de espaldas al eje local z
        const fx = Math.sin(a), fz = Math.cos(a);
        const p = P.create(rand() < 0.35 ? 'elder' : 'civil', bx - fx * 0.15, bz - fz * 0.15, { lookKind: rand() < 0.35 ? 'elder' : 'civil' });
        p.radius = 0.1;
        p.pose = 'sit';
        p.heading = Math.atan2(fx, fz);
        p.onScare = () => { bpos.taken = false; };
        bpos.taken = true;
        this.sitters.push(p);
        break;
      }
    }
  }
}
