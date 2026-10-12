// Objetos recogibles (dinero, armas, salud, blindaje, coleccionables) y marcadores del mundo.

import * as THREE from 'three';
import { dist2, rand } from '../core/utils.js';
import { audio } from '../core/audio.js';
import { WEAPONS } from './combat.js';
import { GeoBuilder } from '../world/geom.js';

const GEO = {};
function geo(kind) {
  if (GEO[kind]) return GEO[kind];
  let g;
  switch (kind) {
    case 'cash': g = new THREE.BoxGeometry(0.5, 0.12, 0.28); break;
    case 'health': { const b = new GeoBuilder(); b.box(0, -0.12, 0, 0.6, 0.24, 0.2, 0xf0f0f0); b.box(0, -0.06, 0.11, 0.38, 0.12, 0.02, 0xe02020); b.box(0, -0.19, 0.11, 0.12, 0.38, 0.02, 0xe02020); g = b.toGeometry(); break; }
    case 'armor': { const b = new GeoBuilder(); b.box(0, -0.3, 0, 0.5, 0.6, 0.18, 0x3a6ad8); g = b.toGeometry(); break; }
    case 'panot': {
      // Baldosa de flor de Barcelona
      const b = new GeoBuilder();
      b.box(0, -0.04, 0, 0.7, 0.08, 0.7, 0xc8c4bc);
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        b.box(Math.cos(a) * 0.15, 0.04, Math.sin(a) * 0.15, 0.16, 0.04, 0.16, 0xd84a3a, a);
      }
      b.box(0, 0.04, 0, 0.1, 0.05, 0.1, 0xf0c030);
      g = b.toGeometry();
      break;
    }
    default: g = new THREE.BoxGeometry(0.6, 0.18, 0.18);
  }
  GEO[kind] = g;
  return g;
}
const MATS = {
  cash: new THREE.MeshLambertMaterial({ color: 0x3fae4a, emissive: 0x0a3010 }),
  weapon: new THREE.MeshLambertMaterial({ color: 0x333333, emissive: 0x202020 }),
  vc: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x222222 }),
};

export class Pickups {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.t = 0;
  }

  add(kind, x, z, data = {}) {
    const W = this.game.world;
    const mat = kind === 'cash' ? MATS.cash : kind === 'weapon' ? MATS.weapon : MATS.vc;
    const mesh = new THREE.Mesh(geo(kind), mat);
    const y = W.groundHeight(x, z) + (data.y || 0) + 0.8;
    mesh.position.set(x, y, z);
    this.game.scene.add(mesh);
    // Halo
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 16), new THREE.MeshBasicMaterial({ color: data.halo || (kind === 'panot' ? 0xf0c030 : kind === 'cash' ? 0x40ff60 : 0xffffff), transparent: true, opacity: 0.35 }));
    halo.position.set(x, y - 0.75, z);
    this.game.scene.add(halo);
    const p = { kind, x, z, y, mesh, halo, data, life: data.life ?? (kind === 'cash' || kind === 'weapon' ? 60 : Infinity) };
    this.list.push(p);
    return p;
  }

  spawnCash(x, z, amount) { if (amount > 0) this.add('cash', x + rand.range(-0.4, 0.4), z + rand.range(-0.4, 0.4), { amount }); }
  spawnWeapon(x, z, weapon, ammo) { this.add('weapon', x, z, { weapon, ammo }); }

  remove(p) {
    p.mesh.removeFromParent(); p.halo.removeFromParent();
    this.list.splice(this.list.indexOf(p), 1);
  }

  update(dt) {
    const g = this.game, pl = g.player;
    this.t += dt;
    for (const p of [...this.list]) {
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = p.y + Math.sin(this.t * 3 + p.x) * 0.1;
      p.life -= dt;
      if (p.life <= 0) { this.remove(p); continue; }
      if (pl.dead) continue;
      const r = pl.vehicle ? 2.5 : 1.2;
      if (Math.abs(pl.y - p.y) < 3 && dist2(pl.x, pl.z, p.x, p.z) < r) this.collect(p);
    }
  }

  collect(p) {
    const g = this.game, pl = g.player;
    switch (p.kind) {
      case 'cash': g.economy.add(p.data.amount, 'Dinero recogido'); audio.play('cash'); break;
      case 'weapon':
        pl.giveWeapon(p.data.weapon, p.data.ammo);
        g.hud.notify(`Recogido: <b>${WEAPONS[p.data.weapon].name}</b>`);
        audio.play('pickup');
        break;
      case 'health':
        if (pl.health >= pl.maxHealth) return;
        pl.health = pl.maxHealth; audio.play('pickup'); g.hud.notify('Salud recuperada'); p.respawn = true; break;
      case 'armor':
        if (pl.armor >= 100) return;
        pl.armor = 100; audio.play('pickup'); g.hud.notify('Chaleco antibalas'); p.respawn = true; break;
      case 'panot':
        g.activities.collectPanot(p.data.id);
        break;
    }
    this.remove(p);
    if (p.respawn) setTimeout(() => this.add(p.kind, p.x, p.z, p.data), 120000);
  }
}

/** Marcadores circulares de interacción (misiones, tiendas, destinos). */
export class Markers {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.geo = new THREE.CylinderGeometry(1, 1, 1.4, 24, 1, true);
    this.arrowGeo = new THREE.ConeGeometry(0.5, 1, 4);
    this.arrowGeo.rotateX(Math.PI);
  }

  /**
   * opts: {color, radius, label, blip, onEnter, onInteract, prompt, vehicleOnly, footOnly, visible}
   */
  add(x, z, opts = {}) {
    const W = this.game.world;
    const y = opts.y ?? W.groundHeight(x, z);
    const color = opts.color ?? 0xf2b33d;
    const r = opts.radius ?? 1.5;
    const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    mesh.scale.set(r, opts.height ?? 1, r);
    mesh.position.set(x, y + 0.7 * (opts.height ?? 1), z);
    const arrow = new THREE.Mesh(this.arrowGeo, new THREE.MeshBasicMaterial({ color }));
    arrow.position.set(x, y + 3, z);
    this.game.scene.add(mesh, arrow);
    const m = { x, z, y, r, mesh, arrow, opts, inside: false, active: true };
    this.list.push(m);
    return m;
  }

  remove(m) {
    if (!m) return;
    m.mesh.removeFromParent(); m.arrow.removeFromParent();
    m.mesh.material.dispose(); m.arrow.material.dispose();
    const i = this.list.indexOf(m);
    if (i >= 0) this.list.splice(i, 1);
  }

  update(dt) {
    const g = this.game, pl = g.player;
    const t = performance.now() * 0.003;
    let prompt = null;
    for (const m of [...this.list]) {
      m.arrow.position.y = m.y + 3 + Math.sin(t) * 0.25;
      m.arrow.rotation.y += dt * 2;
      const vis = m.opts.visible !== false;
      m.mesh.visible = m.arrow.visible = vis;
      if (!m.active || pl.dead || pl.busted) continue;
      const inR = Math.abs(pl.y - m.y) < 4 && dist2(pl.x, pl.z, m.x, m.z) < m.r + (pl.vehicle ? 1.5 : 0.3);
      const okMode = (!m.opts.vehicleOnly || pl.vehicle) && (!m.opts.footOnly || !pl.vehicle);
      if (inR && okMode) {
        if (!m.inside) { m.inside = true; if (m.opts.onEnter) m.opts.onEnter(m); }
        if (m.opts.onInteract && !g.modalOpen) {
          prompt = m.opts.prompt || 'Pulsa <kbd>E</kbd> para interactuar';
          if (g.input.hit('KeyE')) m.opts.onInteract(m);
        }
      } else if (m.inside) {
        m.inside = false;
        if (m.opts.onExit) m.opts.onExit(m);
      }
    }
    g.hud.prompt(prompt || (g.hud.externalPrompt || ''));
  }
}
