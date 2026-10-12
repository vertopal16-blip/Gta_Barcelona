// Armas, balística (hitscan), efectos de partículas y explosiones.

import * as THREE from 'three';
import { clamp, rand, dist2 } from '../core/utils.js';
import { events } from '../core/events.js';
import { audio } from '../core/audio.js';

export const WEAPONS = {
  fists: { id: 'fists', name: 'Puños', ranged: false, damage: 9, rate: 0.42, range: 1.6 },
  bat: { id: 'bat', name: 'Bate', ranged: false, damage: 24, rate: 0.7, range: 2.1, held: 'bat', price: 120 },
  knife: { id: 'knife', name: 'Navaja', ranged: false, damage: 32, rate: 0.5, range: 1.7, held: 'knife', price: 150 },
  pistol: { id: 'pistol', name: 'Pistola', ranged: true, damage: 30, rate: 0.3, range: 90, spread: 0.012, mag: 12, held: 'pistol', price: 900, ammoPrice: 3, ammoPack: 36, sound: 'gunshot' },
  smg: { id: 'smg', name: 'Subfusil', ranged: true, damage: 17, rate: 0.085, range: 65, spread: 0.032, mag: 30, auto: true, held: 'smg', price: 3200, ammoPrice: 2, ammoPack: 90, sound: 'smg' },
  shotgun: { id: 'shotgun', name: 'Escopeta', ranged: true, damage: 15, pellets: 8, rate: 0.95, range: 32, spread: 0.075, mag: 6, held: 'shotgun', price: 2600, ammoPrice: 8, ammoPack: 24, sound: 'shotgun' },
  rifle: { id: 'rifle', name: 'Fusil de asalto', ranged: true, damage: 34, rate: 0.12, range: 130, spread: 0.014, mag: 30, auto: true, held: 'rifle', price: 7500, ammoPrice: 5, ammoPack: 90, sound: 'smg' },
};
export const WEAPON_ORDER = ['fists', 'bat', 'knife', 'pistol', 'smg', 'shotgun', 'rifle'];

// ---------------------------------------------------------------------------
// Sistema de partículas (shader propio: tamaño y alfa por partícula)
// ---------------------------------------------------------------------------
class Particles {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 600 } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vC; uniform float scale;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; gl_FragColor = vec4(vC.rgb, vC.a * smoothstep(0.5, 0.15, r)); }`,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.baseCol = new Float32Array(max * 4);
  }

  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, grow = 0, grav = 0) {
    const i = this.i;
    this.i = (this.i + 1) % this.max;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size;
    this.grow[i] = grow;
    this.grav[i] = grav;
    this.baseCol.set([r, g, b, a], i * 4);
    this.col.set([r, g, b, a], i * 4);
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { if (this.col[i * 4 + 3] !== 0) this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 1 - dt * 0.8; this.vel[i * 3 + 2] *= 1 - dt * 0.8;
      this.size[i] += this.grow[i] * dt;
      this.col[i * 4 + 3] = this.baseCol[i * 4 + 3] * t;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
export class Combat {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.fx = new Particles(scene, 1500, true);
    this.smoke = new Particles(scene, 1500, false);
    // Trazadoras
    this.tracers = [];
    const tg = new THREE.BufferGeometry();
    this.tracerPos = new Float32Array(32 * 6);
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3));
    this.tracerLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85 }));
    this.tracerLines.frustumCulled = false;
    scene.add(this.tracerLines);
    this.tracerI = 0;
    this.tracerLife = new Float32Array(32);
    // Destello
    this.flash = new THREE.PointLight(0xffb060, 0, 25, 2);
    scene.add(this.flash);
    this.flashT = 0;
    this.fireballs = [];
    this.fireGeo = new THREE.SphereGeometry(1, 12, 8);
  }

  addTracer(ax, ay, az, bx, by, bz) {
    const i = this.tracerI;
    this.tracerI = (this.tracerI + 1) % 32;
    this.tracerPos.set([ax, ay, az, bx, by, bz], i * 6);
    this.tracerLife[i] = 0.06;
  }

  muzzle(x, y, z) {
    for (let k = 0; k < 4; k++) this.fx.emit(x, y, z, rand.range(-2, 2), rand.range(-1, 2), rand.range(-2, 2), 0.06, 0.35, 1, 0.75, 0.3, 1);
    this.flash.position.set(x, y, z);
    this.flash.intensity = 30;
    this.flashT = 0.05;
  }

  sparks(x, y, z, n = 6, color = [1, 0.8, 0.4]) {
    for (let k = 0; k < n; k++) this.fx.emit(x, y, z, rand.range(-4, 4), rand.range(0, 5), rand.range(-4, 4), rand.range(0.15, 0.35), 0.12, color[0], color[1], color[2], 1, 0, 12);
  }

  dust(x, y, z, n = 4) {
    for (let k = 0; k < n; k++) this.smoke.emit(x, y, z, rand.range(-1, 1), rand.range(0.5, 1.5), rand.range(-1, 1), rand.range(0.4, 0.8), 0.3, 0.6, 0.57, 0.5, 0.6, 1.2);
  }

  blood(x, y, z, n = 8) {
    for (let k = 0; k < n; k++) this.smoke.emit(x, y, z, rand.range(-2, 2), rand.range(0, 3), rand.range(-2, 2), rand.range(0.3, 0.6), 0.14, 0.55, 0.02, 0.02, 0.95, 0, 9);
  }

  /** Humo de vehículos dañados. */
  vehicleSmoke(v, dt) {
    const hp = v.health / v.maxHealth;
    if (hp > 0.35 && !v.destroyed) return;
    const f = v.destroyed ? (v.burnT < 30 ? 1 : 0.3) : hp < 0.15 ? 0.8 : 0.35;
    if (Math.random() > f * dt * 30) return;
    const x = v.x + v.fx * v.T.len * 0.35, z = v.z + v.fz * v.T.len * 0.35, y = v.y + v.T.hei * 0.8;
    const dark = v.destroyed || hp < 0.15;
    this.smoke.emit(x, y, z, rand.range(-0.4, 0.4), rand.range(1.5, 3), rand.range(-0.4, 0.4), rand.range(1.5, 2.8), 0.6, dark ? 0.12 : 0.6, dark ? 0.12 : 0.6, dark ? 0.12 : 0.6, 0.55, 1.6, -0.4);
    if (v.destroyed && v.burnT < 25 || hp < 0.15) this.fx.emit(x, y - 0.2, z, rand.range(-0.5, 0.5), rand.range(1, 2.5), rand.range(-0.5, 0.5), rand.range(0.3, 0.7), 0.7, 1, 0.45, 0.1, 0.9, 0.8, -1);
  }

  update(dt) {
    this.fx.update(dt);
    this.smoke.update(dt);
    for (let i = 0; i < 32; i++) {
      if (this.tracerLife[i] > 0) {
        this.tracerLife[i] -= dt;
        if (this.tracerLife[i] <= 0) this.tracerPos.fill(0, i * 6, i * 6 + 6);
      }
    }
    this.tracerLines.geometry.attributes.position.needsUpdate = true;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.intensity = 0; }
    for (const fb of [...this.fireballs]) {
      fb.t += dt;
      const k = fb.t / 0.9;
      fb.mesh.scale.setScalar(fb.r * (0.3 + k * 1.2));
      fb.mesh.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { fb.mesh.removeFromParent(); fb.mesh.material.dispose(); this.fireballs.splice(this.fireballs.indexOf(fb), 1); }
    }
    for (const v of this.game.vehicles.list) {
      if (Math.abs(v.x - this.game.player.x) + Math.abs(v.z - this.game.player.z) < 250) this.vehicleSmoke(v, dt);
    }
  }

  // -------------------------------------------------------------------------
  // Balística
  // -------------------------------------------------------------------------
  /**
   * Lanza un rayo contra mundo, suelo, peatones, vehículos y jugador.
   * Devuelve {t, kind, obj, x, y, z, head}
   */
  raycast(ox, oy, oz, dx, dy, dz, maxD, ignore = null) {
    const g = this.game;
    let best = { t: maxD, kind: 'none' };
    const wt = g.world.collision.raycast(ox, oy, oz, dx, dy, dz, maxD);
    if (wt < best.t) best = { t: wt, kind: 'world' };
    // Suelo
    if (dy < 0) {
      let prev = 0;
      for (let t = 1.5; t < best.t; t += 1.5) {
        const y = oy + dy * t, gh = g.world.groundHeight(ox + dx * t, oz + dz * t);
        if (y < gh) {
          let lo = prev, hi = t;
          for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (oy + dy * m < g.world.groundHeight(ox + dx * m, oz + dz * m)) hi = m; else lo = m; }
          best = { t: hi, kind: 'ground' };
          break;
        }
        prev = t;
      }
    }
    // Peatones (cilindros verticales)
    for (const p of g.peds.list) {
      if (p === ignore || p.state === 'inVehicle' || !p.inScene) continue;
      const lying = !p.alive || p.state === 'down';
      const r = lying ? 0.7 : 0.38;
      const t = rayCylinder(ox, oz, dx, dz, p.x, p.z, r, best.t);
      if (t === null) continue;
      const hy = oy + dy * t;
      const top = p.y + (lying ? 0.5 : 1.85 * (p.look.height || 1));
      if (hy < p.y - 0.1 || hy > top) continue;
      if (t < best.t) best = { t, kind: 'ped', obj: p, head: !lying && hy > p.y + 1.55 };
    }
    // Jugador
    const pl = g.player;
    if (pl !== ignore && !pl.vehicle && !pl.dead) {
      const t = rayCylinder(ox, oz, dx, dz, pl.x, pl.z, 0.38, best.t);
      if (t !== null) { const hy = oy + dy * t; if (hy > pl.y - 0.1 && hy < pl.y + 1.85 && t < best.t) best = { t, kind: 'player', obj: pl }; }
    }
    // Vehículos (cajas orientadas)
    for (const v of g.vehicles.list) {
      if (ignore && (ignore === v || ignore.vehicle === v)) continue;
      const maxR = v.T.len / 2 + 1;
      const cx = ox + dx * Math.min(best.t, Math.max(0, (v.x - ox) * dx + (v.z - oz) * dz));
      const cz = oz + dz * Math.min(best.t, Math.max(0, (v.x - ox) * dx + (v.z - oz) * dz));
      if (Math.abs(cx - v.x) > maxR + 2 || Math.abs(cz - v.z) > maxR + 2) continue;
      const t = rayOBB(ox, oy, oz, dx, dy, dz, v);
      if (t !== null && t < best.t) best = { t, kind: 'vehicle', obj: v };
    }
    // Helicóptero policial (esfera)
    const h = g.police && g.police.heli;
    if (h && ignore !== h) {
      const fx = ox - h.x, fy = oy - h.y, fz = oz - h.z;
      const b = fx * dx + fy * dy + fz * dz, c = fx * fx + fy * fy + fz * fz - 3.5 * 3.5;
      const disc = b * b - c;
      if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < best.t) best = { t, kind: 'heli', obj: h }; }
    }
    best.x = ox + dx * best.t; best.y = oy + dy * best.t; best.z = oz + dz * best.t;
    return best;
  }

  applyDamage(target, amount, attacker, cause, dir = null) {
    const g = this.game;
    if (!target) return;
    if (target.isPlayer) { target.damage(amount, attacker, cause); return; }
    if (target.isPed) {
      g.peds.damage(target, amount, attacker, cause);
      if (cause === 'melee' && dir && target.alive && amount > 15 && rand() < 0.5) {
        const l = Math.hypot(dir.x, dir.z) || 1;
        g.peds.knock(target, dir.x / l * 3, dir.z / l * 3, 0, attacker, cause);
      }
      return;
    }
    if (target.T) target.damage(amount, attacker, cause);
  }

  /** Procesa el impacto de una bala. */
  bulletHit(hit, damage, attacker, ox, oy, oz) {
    const g = this.game;
    switch (hit.kind) {
      case 'ped': {
        const p = hit.obj;
        const dmg = damage * (hit.head ? 2.6 : 1);
        this.blood(hit.x, hit.y, hit.z, 6);
        this.applyDamage(p, dmg, attacker, 'bullet');
        if (p.alive && dmg > 25 && rand() < 0.3) g.peds.knock(p, (hit.x - ox) * 0.05, (hit.z - oz) * 0.05, 0);
        if (attacker === g.player) g.hud.hitMarker(!p.alive);
        break;
      }
      case 'player':
        this.blood(hit.x, hit.y, hit.z, 4);
        this.applyDamage(hit.obj, damage, attacker, 'bullet');
        break;
      case 'vehicle': {
        const v = hit.obj;
        this.sparks(hit.x, hit.y, hit.z, 5);
        v.damage(damage * 0.9, attacker, 'bullet');
        // Posibilidad de herir al conductor
        if (v.driver && rand() < (v.isBike ? 0.6 : 0.12)) this.applyDamage(v.driver, damage * 0.8, attacker, 'bullet');
        if (attacker === g.player) {
          g.hud.hitMarker(false);
          if (v.police) g.reportCrime('shootCop', v.x, v.z, v);
          if (v.ai && v.driver && v.driver.alive && v.ai.kind === 'lane') v.ai.panicT = 20;
        }
        break;
      }
      case 'heli':
        this.sparks(hit.x, hit.y, hit.z, 5);
        if (attacker === g.player) { g.police.heliHit(hit, damage); g.hud.hitMarker(false); }
        break;
      case 'world': case 'ground':
        this.sparks(hit.x, hit.y, hit.z, 3, [1, 0.9, 0.6]);
        this.dust(hit.x, hit.y, hit.z, 2);
        break;
    }
  }

  /** Disparo del jugador hacia la mira. */
  playerShoot(weapon, muzzle, aimDir) {
    const g = this.game;
    const W = WEAPONS[weapon];
    const pellets = W.pellets || 1;
    const moving = g.player.speed > 2 ? 1.8 : 1;
    const spread = W.spread * moving * (g.player.vehicle ? 2 : 1);
    // Punto al que apunta la cámara
    const cam = g.camera.camera.position;
    for (let k = 0; k < pellets; k++) {
      const d = aimDir.clone();
      d.x += rand.range(-spread, spread); d.y += rand.range(-spread, spread); d.z += rand.range(-spread, spread);
      d.normalize();
      const aim = this.raycast(cam.x, cam.y, cam.z, d.x, d.y, d.z, W.range + 10, g.player);
      // Rayo real desde el arma hasta el punto apuntado
      let tx = aim.x - muzzle.x, ty = aim.y - muzzle.y, tz = aim.z - muzzle.z;
      const l = Math.hypot(tx, ty, tz) || 1;
      tx /= l; ty /= l; tz /= l;
      const hit = this.raycast(muzzle.x, muzzle.y, muzzle.z, tx, ty, tz, Math.min(W.range, l + 1), g.player);
      this.addTracer(muzzle.x, muzzle.y, muzzle.z, hit.x, hit.y, hit.z);
      if (hit.kind !== 'none') this.bulletHit(hit, W.damage, g.player, muzzle.x, muzzle.y, muzzle.z);
    }
    this.muzzle(muzzle.x, muzzle.y, muzzle.z);
    audio.play(W.sound || 'gunshot', muzzle.x, muzzle.z);
    events.emit('gunshot', { x: muzzle.x, z: muzzle.z, shooter: g.player });
    g.reportCrime('shooting', muzzle.x, muzzle.z, null);
  }

  /** Disparo de un PNJ a su objetivo, con precisión según distancia. */
  npcShoot(ped, target) {
    const g = this.game;
    const W = WEAPONS[ped.weapon] || WEAPONS.pistol;
    const mx = ped.x + Math.sin(ped.heading) * 0.5, my = ped.y + 1.4, mz = ped.z + Math.cos(ped.heading) * 0.5;
    const tv = target.vehicle;
    let tx = tv ? tv.x : target.x, ty = (tv ? tv.y + 0.9 : (target.y || 0) + 1.1), tz = tv ? tv.z : target.z;
    const d = Math.hypot(tx - mx, tz - mz);
    const skill = ped.role === 'police' ? 0.75 : ped.role === 'gang' ? 0.6 : 0.4;
    const tSpeed = tv ? tv.speed : (target.speed || 0);
    const miss = (1 - skill) * 0.08 + d * 0.0035 + tSpeed * 0.006;
    const pellets = W.pellets || 1;
    for (let k = 0; k < pellets; k++) {
      let dx = tx - mx, dy = ty - my, dz = tz - mz;
      const l = Math.hypot(dx, dy, dz) || 1;
      dx = dx / l + rand.range(-miss, miss); dy = dy / l + rand.range(-miss, miss) * 0.5; dz = dz / l + rand.range(-miss, miss);
      const l2 = Math.hypot(dx, dy, dz);
      dx /= l2; dy /= l2; dz /= l2;
      const hit = this.raycast(mx, my, mz, dx, dy, dz, W.range, ped);
      this.addTracer(mx, my, mz, hit.x, hit.y, hit.z);
      if (hit.kind !== 'none') this.bulletHit(hit, W.damage * (ped.role === 'police' ? 0.5 : 0.6), ped, mx, my, mz);
    }
    ped.ammo--;
    ped.model.recoil();
    this.muzzle(mx, my, mz);
    audio.play(W.sound || 'gunshot', mx, mz);
    events.emit('gunshot', { x: mx, z: mz, shooter: ped });
  }

  /** Golpe cuerpo a cuerpo del jugador. */
  playerMelee(weapon) {
    const g = this.game;
    const p = g.player;
    const W = WEAPONS[weapon];
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    let hitSomething = false;
    for (const ped of g.peds.list) {
      if (!ped.alive || ped.state === 'inVehicle') continue;
      const dx = ped.x - p.x, dz = ped.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > W.range + 0.3 || Math.abs(ped.y - p.y) > 1.5) continue;
      if ((dx * fx + dz * fz) / (d || 1) < 0.35) continue;
      const dmg = W.damage * rand.range(0.85, 1.2);
      this.applyDamage(ped, dmg, p, 'melee', { x: dx, z: dz });
      if (weapon !== 'fists' && weapon !== 'knife' && ped.alive) g.peds.knock(ped, dx / d * 4, dz / d * 4, 0, p);
      this.blood(ped.x, ped.y + 1.3, ped.z, weapon === 'fists' ? 2 : 5);
      hitSomething = true;
      break;
    }
    if (!hitSomething) {
      const v = g.vehicles.nearest(p.x + fx * 1.2, p.z + fz * 1.2, 1.4);
      if (v) { v.damage(W.damage * 0.6, p, 'melee'); this.sparks(p.x + fx, p.y + 1, p.z + fz, 3); hitSomething = true; if (v.parked && !v.alarm && rand() < 0.5) { v.alarm = true; audio.play('alarm', v.x, v.z); } }
    }
    audio.play(hitSomething ? 'punch' : 'swing', p.x, p.z);
    events.emit('melee', { x: p.x, z: p.z, attacker: p });
    if (hitSomething) g.reportCrime('assault', p.x, p.z, null);
    return hitSomething;
  }

  /** Explosión con daño en área. */
  explode(x, y, z, radius, attacker = null, source = null) {
    const g = this.game;
    audio.play('explosion', x, z);
    const m = new THREE.Mesh(this.fireGeo, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 1, depthWrite: false }));
    m.position.set(x, y, z);
    g.scene.add(m);
    this.fireballs.push({ mesh: m, t: 0, r: radius * 0.6 });
    for (let k = 0; k < 40; k++) this.fx.emit(x, y, z, rand.range(-8, 8), rand.range(2, 12), rand.range(-8, 8), rand.range(0.4, 1.0), rand.range(0.6, 1.4), 1, rand.range(0.4, 0.7), 0.1, 1, 1.5, 6);
    for (let k = 0; k < 25; k++) this.smoke.emit(x + rand.range(-2, 2), y + rand.range(0, 2), z + rand.range(-2, 2), rand.range(-2, 2), rand.range(2, 5), rand.range(-2, 2), rand.range(2, 4), rand.range(1.5, 2.5), 0.15, 0.14, 0.13, 0.7, 2, -0.5);
    this.flash.position.set(x, y + 2, z);
    this.flash.intensity = 300;
    this.flashT = 0.25;
    const pd = dist2(g.player.x, g.player.z, x, z);
    g.camera.shake(clamp(1.2 - pd / 60, 0, 1.2), 0.8);
    // Daños
    for (const p of g.peds.list) {
      if (p.state === 'inVehicle') continue;
      const d = dist2(p.x, p.z, x, z);
      if (d < radius) {
        const f = 1 - d / radius;
        g.peds.knock(p, (p.x - x) / (d || 1) * 10 * f, (p.z - z) / (d || 1) * 10 * f, 140 * f, attacker, 'explosion');
      }
    }
    if (!g.player.vehicle && pd < radius) g.player.damage(130 * (1 - pd / radius), attacker, 'explosion');
    for (const v of g.vehicles.list) {
      if (v === source) continue;
      const d = dist2(v.x, v.z, x, z);
      if (d < radius * 1.3) {
        const f = 1 - d / (radius * 1.3);
        v.damage(900 * f, attacker, 'explosion');
        const l = d || 1;
        v.vx += (v.x - x) / l * 8 * f; v.vz += (v.z - z) / l * 8 * f;
        v.onGround = false; v.vy = 4 + 5 * f;
        if (v === g.player.vehicle) g.player.damage(40 * f, attacker, 'explosion');
      }
    }
    if (source && source.T) {
      source.vy = 6; source.onGround = false;
      if (source === g.player.vehicle) g.player.damage(200, attacker, 'explosion');
      if (source.driver && source.driver.isPed) g.peds.kill(source.driver, attacker, 'explosion');
    }
    events.emit('explosion', { x, z, radius });
    if (attacker === g.player) g.reportCrime('explosion', x, z, null);
  }
}

function rayCylinder(ox, oz, dx, dz, cx, cz, r, maxT) {
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const fx = ox - cx, fz = oz - cz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxT) return null;
  return t;
}

function rayOBB(ox, oy, oz, dx, dy, dz, v) {
  // A espacio local del vehículo
  const c = Math.cos(-v.heading), s = Math.sin(-v.heading);
  const lx = (ox - v.x) * c + (oz - v.z) * s, lz = -(ox - v.x) * s + (oz - v.z) * c, ly = oy - v.y;
  const ldx = dx * c + dz * s, ldz = -dx * s + dz * c, ldy = dy;
  const hw = v.isBike ? 0.4 : v.T.wid / 2, hl = v.T.len / 2;
  let tmin = 0, tmax = Infinity;
  for (const [o, d, lo, hi] of [[lx, ldx, -hw, hw], [ly, ldy, 0, v.T.hei], [lz, ldz, -hl, hl]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
