// Jugador: movimiento a pie, natación, armas, entrar/salir/robar vehículos, conducción.

import * as THREE from 'three';
import { Humanoid } from './humanoid.js';
import { WEAPONS, WEAPON_ORDER } from '../systems/combat.js';
import { clamp, damp, dampAngle, dist2, rand } from '../core/utils.js';
import { audio } from '../core/audio.js';
import { isWater, SEA_LEVEL, MAP } from '../world/terrain.js';

export const DEFAULT_LOOK = {
  skin: 0xd9a07a, hair: 0x2a1a10, shirt: 0x2e4a6e, pants: 0x2a2a30, shoes: 0x1a1a1a, hairStyle: 0, height: 1, build: 1.05, hat: null,
};

export class Player {
  constructor(game) {
    this.game = game;
    this.isPlayer = true;
    this.look = { ...DEFAULT_LOOK };
    this.model = new Humanoid(this.look);
    game.scene.add(this.model.root);
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.heading = 0;
    this.health = 100; this.maxHealth = 100;
    this.armor = 0;
    this.stamina = 100;
    this.onGround = true;
    this.vehicle = null;
    this.dead = false;
    this.busted = false;
    this.aiming = false;
    this.aimingAt = null;
    this.swimming = false;
    this.weapons = { fists: { ammo: Infinity, clip: Infinity } };
    this.current = 'fists';
    this.fireT = 0;
    this.reloadT = 0;
    this.hurtT = 99;
    this.enterT = 0;
    this.enterTarget = null;
    this.speed = 0;
    this.invulnerable = false;
    this.aimCheckT = 0;
    this.controlsLocked = false;
  }

  get alive() { return !this.dead; }
  get weapon() { return WEAPONS[this.current]; }

  setLook(look) {
    this.look = { ...this.look, ...look };
    this.model.root.removeFromParent();
    this.model = new Humanoid(this.look);
    this.model.setHeld(this.weapon.held || null);
    this.game.scene.add(this.model.root);
    this.model.root.visible = !this.vehicle || this.vehicle.isBike;
  }

  placeAt(x, z, heading = 0) {
    this.x = x; this.z = z;
    this.y = this.game.world.groundHeight(x, z);
    this.vx = this.vz = this.vy = 0;
    this.heading = heading;
    this.syncModel();
  }

  giveWeapon(id, ammo = 0) {
    const W = WEAPONS[id];
    if (!this.weapons[id]) this.weapons[id] = { ammo: 0, clip: 0 };
    const w = this.weapons[id];
    if (W.ranged) {
      w.ammo += ammo;
      if (w.clip === 0) { const take = Math.min(W.mag, w.ammo); w.clip = take; w.ammo -= take; }
    } else { w.ammo = Infinity; w.clip = Infinity; }
    if (this.current === 'fists') this.selectWeapon(id);
  }

  clearWeapons() {
    this.weapons = { fists: { ammo: Infinity, clip: Infinity } };
    this.selectWeapon('fists');
  }

  selectWeapon(id) {
    if (!this.weapons[id]) return;
    this.current = id;
    this.reloadT = 0;
    this.model.setHeld(WEAPONS[id].held || null);
  }

  cycleWeapon(dir = 1) {
    const owned = WEAPON_ORDER.filter((w) => this.weapons[w]);
    const i = owned.indexOf(this.current);
    this.selectWeapon(owned[(i + dir + owned.length) % owned.length]);
    audio.play('ui');
  }

  damage(amount, attacker = null, cause = 'misc') {
    if (this.dead || this.invulnerable || this.game.paused) return;
    if (this.armor > 0 && cause !== 'fall' && cause !== 'drown') {
      const a = Math.min(this.armor, amount * 0.75);
      this.armor -= a;
      amount -= a;
    }
    this.health -= amount;
    this.hurtT = 0;
    this.game.hud.damageFlash(amount);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.game.onPlayerDeath(attacker, cause);
    }
  }

  // -------------------------------------------------------------------------
  update(dt, input) {
    const g = this.game;
    if (this.dead || this.busted) {
      this.model.animate(dt, this.busted ? 'surrender' : 'dead', 0);
      this.syncModel();
      return;
    }
    this.hurtT += dt;
    if (this.hurtT > 8 && this.health < 50) this.health = Math.min(50, this.health + dt * 2);
    this.fireT -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload();
    }
    const locked = this.controlsLocked;

    // Cambio de arma
    if (!locked) {
      if (input.hit('KeyQ')) this.cycleWeapon(1);
      for (let i = 0; i < WEAPON_ORDER.length; i++) if (input.hit('Digit' + (i + 1))) { if (this.weapons[WEAPON_ORDER[i]]) { this.selectWeapon(WEAPON_ORDER[i]); audio.play('ui'); } }
      if (input.hit('KeyR')) this.startReload();
    }

    // Entrar / salir de vehículos
    if (!locked && input.hit('KeyF')) {
      if (this.vehicle) this.exitVehicle();
      else this.tryEnterVehicle();
    }
    if (this.enterT > 0) {
      this.enterT -= dt;
      const v = this.enterTarget;
      this.vx = damp(this.vx, 0, 10, dt); this.vz = damp(this.vz, 0, 10, dt);
      if (!v || v.removed || dist2(v.x, v.z, this.x, this.z) > 6) { this.enterT = 0; this.enterTarget = null; g.hud.prompt(''); }
      else if (this.enterT <= 0) this.enterVehicle(v);
      this.model.animate(dt, 'idle', 0);
      this.syncModel();
      return;
    }

    if (this.vehicle) this.updateDriving(dt, input, locked);
    else this.updateOnFoot(dt, input, locked);
    this.syncModel();
  }

  updateOnFoot(dt, input, locked) {
    const g = this.game, W = g.world;
    const cam = g.camera;
    const ax = locked ? { x: 0, y: 0 } : input.axis();
    const yaw = cam.yaw;
    const fwdX = Math.sin(yaw), fwdZ = Math.cos(yaw);
    const rightX = -Math.cos(yaw), rightZ = Math.sin(yaw);
    let mx = fwdX * ax.y + rightX * ax.x, mz = fwdZ * ax.y + rightZ * ax.x;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    this.aiming = !locked && !this.swimming && (input.mouse(2) || (input.gamepad()?.buttons[6]?.pressed ?? false));
    const sprint = !locked && input.down('ShiftLeft') && ml > 0.1 && this.stamina > 1 && !this.aiming;
    let speed = this.swimming ? (sprint ? 3.4 : 2.2) : this.aiming ? 2.3 : sprint ? 7.6 : 4.5;
    if (this.game.encumbered) speed *= 0.8;
    if (sprint) this.stamina = Math.max(0, this.stamina - dt * (this.swimming ? 14 : 16));
    else this.stamina = Math.min(100, this.stamina + dt * 12);
    const tvx = mx * speed, tvz = mz * speed;
    const accel = this.onGround || this.swimming ? 12 : 2.5;
    this.vx = damp(this.vx, tvx, accel, dt);
    this.vz = damp(this.vz, tvz, accel, dt);
    if (this.aiming) this.heading = dampAngle(this.heading, yaw, 20, dt);
    else if (ml > 0.1) this.heading = dampAngle(this.heading, Math.atan2(mx, mz), 12, dt);

    // Salto
    if (!locked && input.hit('Space') && this.onGround && !this.swimming) {
      this.vy = 5.4;
      this.onGround = false;
    }
    // Integración
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.x = clamp(this.x, MAP.minX + 3, MAP.maxX - 3);
    this.z = clamp(this.z, MAP.minZ + 3, MAP.maxZ - 3);
    const gh = W.groundHeight(this.x, this.z);
    const top = W.collision.topAt(this.x, this.z, this.y, 0.6);
    const floor = Math.max(gh, top);
    const wasGround = this.onGround;
    this.vy -= 18 * dt;
    this.y += this.vy * dt;
    if (this.y <= floor) {
      if (!wasGround && this.vy < -13) this.damage((-this.vy - 13) * 9, null, 'fall');
      this.y = floor; this.vy = 0; this.onGround = true;
    } else if (this.y > floor + 0.25) this.onGround = false;
    else if (this.vy <= 0) { this.y = floor; this.vy = 0; this.onGround = true; }

    // Agua
    const water = isWater(this.x, this.z) && gh < SEA_LEVEL - 1.0;
    if (water && this.y < SEA_LEVEL - 0.6) {
      if (!this.swimming) { audio.play('splash', this.x, this.z); this.game.combat.dust(this.x, SEA_LEVEL, this.z, 6); }
      this.swimming = true;
      this.y = SEA_LEVEL - 1.15;
      this.vy = 0;
      this.onGround = false;
      if (this.stamina <= 0) this.damage(dt * 6, null, 'drown');
    } else if (this.swimming && !water) {
      this.swimming = false;
    }
    if (!water) this.swimming = false;

    // Colisiones
    const r = W.collision.resolveCircle(this.x, this.z, 0.34, this.y + 0.35, 1.5);
    if (r.hit) { this.x = r.x; this.z = r.z; }
    // Colisión con vehículos
    for (const v of g.vehicles.list) {
      const dx = this.x - v.x, dz = this.z - v.z;
      if (dx * dx + dz * dz > (v.T.len / 2 + 1) ** 2 || Math.abs(this.y - v.y) > v.T.hei + 0.5) continue;
      const lf = dx * v.fx + dz * v.fz, ls = dx * -v.fz + dz * v.fx;
      const hw = (v.isBike ? 0.4 : v.T.wid / 2) + 0.3, hl = v.T.len / 2 + 0.3;
      if (Math.abs(lf) < hl && Math.abs(ls) < hw) {
        // Atropello
        if (v.speed > 4 && this.y < v.y + 1) {
          this.damage(v.speed * v.speed * 0.25, v.driver, 'vehicle');
          this.vx = v.vx * 0.8; this.vz = v.vz * 0.8; this.vy = 4; this.onGround = false;
          this.game.camera.shake(0.4);
          continue;
        }
        const px = hw - Math.abs(ls), pz = hl - Math.abs(lf);
        if (px < pz) { const s = Math.sign(ls) || 1; this.x += -v.fz * s * px; this.z += v.fx * s * px; }
        else { const s = Math.sign(lf) || 1; this.x += v.fx * s * pz; this.z += v.fz * s * pz; }
      }
    }
    this.speed = Math.hypot(this.vx, this.vz);

    // Combate
    if (!locked && !this.swimming) this.handleWeapons(dt, input);

    // Animación
    let anim = 'idle';
    if (this.swimming) anim = 'swim';
    else if (!this.onGround) anim = 'jump';
    else if (this.speed > 6) anim = 'sprint';
    else if (this.speed > 3) anim = 'run';
    else if (this.speed > 0.3) anim = 'walk';
    const pitchAim = -cam.pitch * 0.9;
    this.model.animate(dt, anim, this.speed, { aim: this.aiming && this.weapon.ranged, aimPitch: pitchAim });
  }

  handleWeapons(dt, input) {
    const g = this.game;
    const W = this.weapon;
    const wantFire = input.mouse(0) || (input.gamepad()?.buttons[7]?.pressed ?? false);
    const fireHit = input.mouseHit(0);
    // ¿A quién apunto?
    this.aimCheckT -= dt;
    if (this.aiming && this.aimCheckT <= 0) {
      this.aimCheckT = 0.12;
      const c = g.camera.camera.position, d = g.camera.forward();
      const hit = g.combat.raycast(c.x, c.y, c.z, d.x, d.y, d.z, 60, this);
      this.aimingAt = hit.kind === 'ped' ? hit.obj : null;
      g.hud.crosshair(true, !!this.aimingAt && this.aimingAt.alive);
    } else if (!this.aiming) {
      this.aimingAt = null;
      g.hud.crosshair(false);
    }
    if (W.ranged) {
      if ((W.auto ? wantFire : fireHit) && this.fireT <= 0 && this.reloadT <= 0) {
        const w = this.weapons[this.current];
        if (w.clip <= 0) { this.startReload(); return; }
        w.clip--;
        this.fireT = W.rate;
        if (!this.aiming) this.heading = g.camera.yaw;
        const muzzle = this.muzzlePos();
        g.combat.playerShoot(this.current, muzzle, g.camera.forward());
        this.model.recoil();
        g.camera.pitch += 0.008 + (W.pellets ? 0.02 : 0);
        if (w.clip <= 0 && w.ammo > 0) this.startReload();
      }
    } else if (fireHit && this.fireT <= 0) {
      this.fireT = W.rate;
      this.model.punch();
      // Orienta el golpe hacia el peatón más cercano delante
      const target = g.peds.nearest(this.x, this.z, 2.6, (p) => p.alive);
      if (target) this.heading = Math.atan2(target.x - this.x, target.z - this.z);
      setTimeout(() => { if (!this.dead && !this.vehicle) g.combat.playerMelee(this.current); }, 140);
    }
  }

  muzzlePos() {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = -fz, rz = fx;
    if (this.vehicle) {
      const v = this.vehicle;
      return new THREE.Vector3(v.x - v.fz * 0.0 + rx * 0, v.y + v.T.hei + 0.2, v.z);
    }
    return new THREE.Vector3(this.x + fx * 0.6 + rx * 0.28, this.y + 1.45, this.z + fz * 0.6 + rz * 0.28);
  }

  startReload() {
    const W = this.weapon;
    if (!W.ranged || this.reloadT > 0) return;
    const w = this.weapons[this.current];
    if (w.ammo <= 0 || w.clip >= W.mag) return;
    this.reloadT = W.id === 'shotgun' ? 1.8 : 1.3;
    audio.play('reload');
  }

  finishReload() {
    const W = this.weapon;
    const w = this.weapons[this.current];
    const need = W.mag - w.clip;
    const take = Math.min(need, w.ammo);
    w.clip += take; w.ammo -= take;
  }

  // -------------------------------------------------------------------------
  tryEnterVehicle() {
    const g = this.game;
    let best = null, bd = 4.2;
    for (const v of g.vehicles.list) {
      if (v.destroyed && !v.isBike) continue;
      if (v.sinkT > 0) continue;
      const d = v.doorPos();
      const dd = Math.min(dist2(d.x, d.z, this.x, this.z), dist2(v.x, v.z, this.x, this.z) - v.T.len * 0.3);
      if (dd < bd) { bd = dd; best = v; }
    }
    if (!best) return;
    const v = best;
    if (v.destroyed) return;
    if (v.mission && v.mission.noEnter) { g.hud.notify(v.mission.noEnter); return; }
    // Robo con conductor
    if (v.driver && v.driver.isPed && v.driver.alive) {
      const drv = v.driver;
      const reaction = drv.role === 'police' ? 'fight' : drv.brave && rand() < 0.5 ? 'fight' : 'flee';
      g.peds.ejectFrom(v, drv, reaction);
      if (drv.role === 'police') {
        drv.setWeapon('pistol', 60);
        g.reportCrime('assaultCop', v.x, v.z, drv);
      }
      g.reportCrime('carjack', v.x, v.z, drv);
      g.stats.carsStolen++;
      v.ai = null;
      this.enterT = 0.5;
      this.enterTarget = v;
      audio.play('door', v.x, v.z);
      return;
    }
    if (v.driver && v.driver.isPed && !v.driver.alive) { v.driver = null; }
    // Aparcado y cerrado: forzar la cerradura
    if (v.locked) {
      this.enterT = 1.6;
      this.enterTarget = v;
      g.hud.prompt('Forzando la cerradura…');
      if (rand() < 0.45) { v.alarm = true; audio.play('alarm', v.x, v.z); }
      g.reportCrime('carTheft', v.x, v.z, null);
      g.stats.carsStolen++;
      v.locked = false;
      return;
    }
    if (v.parked && !v.playerOwned && !v.mission) g.reportCrime('carTheft', v.x, v.z, null);
    this.enterT = 0.35;
    this.enterTarget = v;
  }

  enterVehicle(v) {
    const g = this.game;
    g.hud.prompt('');
    this.enterTarget = null;
    if (v.driver && v.driver.isPed && v.driver.alive) { g.peds.ejectFrom(v, v.driver, 'flee'); }
    this.vehicle = v;
    v.driver = this;
    v.ai = null;
    v.parked = false;
    v.traffic = false;
    v.lightsOn = g.world.sky.night > 0.5;
    this.swimming = false;
    this.aiming = false;
    this.model.root.visible = v.isBike;
    audio.play('door', v.x, v.z);
    g.onEnterVehicle(v);
  }

  exitVehicle(force = false) {
    const v = this.vehicle;
    if (!v) return;
    if (!force && Math.abs(v.vF) > 8) {
      // Saltar en marcha
      this.game.hud.notify('Saltas del vehículo en marcha');
    }
    const g = this.game;
    const W = g.world;
    let d = v.doorPos();
    if (W.collision.resolveCircle(d.x, d.z, 0.35, v.y + 0.3, 1.5).hit) {
      // Prueba el otro lado
      const side = v.T.wid / 2 + 0.7;
      d = { x: v.x - v.fz * side, z: v.z + v.fx * side };
    }
    this.vehicle = null;
    v.driver = null;
    this.x = d.x; this.z = d.z;
    this.y = Math.max(W.groundHeight(d.x, d.z), v.y);
    this.vx = v.vx * 0.5; this.vz = v.vz * 0.5;
    if (Math.abs(v.vF) > 8) { this.vy = 2; this.onGround = false; this.damage(Math.abs(v.vF) * 0.8, null, 'fall'); }
    this.heading = v.heading + Math.PI / 2;
    v.input = { throttle: 0, brake: 0, steer: 0, handbrake: 1 };
    this.model.root.visible = true;
    this.model.pivot.rotation.z = 0;
    audio.setEngine(false);
    audio.play('door', v.x, v.z);
    g.onExitVehicle(v);
  }

  updateDriving(dt, input, locked) {
    const g = this.game;
    const v = this.vehicle;
    const ax = locked ? { x: 0, y: 0 } : input.axis();
    const gp = input.gamepad();
    let throttle = Math.max(0, ax.y), brake = Math.max(0, -ax.y);
    if (gp) { throttle = Math.max(throttle, gp.buttons[7]?.value || 0); brake = Math.max(brake, gp.buttons[6]?.value || 0); }
    this.aiming = !locked && input.mouse(2) && this.weapon.ranged && (this.current === 'pistol' || this.current === 'smg');
    v.input.throttle = throttle;
    v.input.brake = brake;
    v.input.steer = ax.x;
    v.input.handbrake = !locked && input.down('Space') ? 1 : 0;
    if (!locked && input.hit('KeyH')) audio.play('horn', v.x, v.z);
    if (!locked && input.hit('KeyL')) v.lightsOn = !v.lightsOn;
    if (v.T.police && !locked && input.hit('KeyG')) v.siren = !v.siren;
    this.x = v.x; this.y = v.y; this.z = v.z;
    this.vx = v.vx; this.vz = v.vz;
    this.speed = v.speed;
    this.heading = v.heading;
    // Tiroteo desde el vehículo
    if (this.aiming) {
      g.hud.crosshair(true, false);
      const W = this.weapon;
      if (input.mouse(0) && this.fireT <= 0 && this.reloadT <= 0) {
        const w = this.weapons[this.current];
        if (w.clip <= 0) this.startReload();
        else {
          w.clip--;
          this.fireT = W.rate * 1.3;
          const m = new THREE.Vector3(v.x, v.y + v.T.hei + 0.2, v.z);
          const f = g.camera.forward();
          m.addScaledVector(f, v.T.wid * 0.7);
          g.combat.playerShoot(this.current, m, f);
        }
      }
    } else g.hud.crosshair(false);
    audio.setEngine(true, clamp(Math.abs(v.vF) / v.T.maxSpeed, 0, 1) + throttle * 0.15, throttle, v.isBike ? 'bike' : v.T.heavy ? 'heavy' : 'car');
    if (v.isBike) {
      this.model.animate(dt, 'ride', 0);
    }
    if (v.destroyed && !this.dead) {
      // Salir del coche en llamas
      if (v.burnT > 0.2) this.exitVehicle(true);
    }
    if (v.sinkT > 1.5) this.exitVehicle(true);
  }

  syncModel() {
    const m = this.model.root;
    if (this.vehicle && this.vehicle.isBike) {
      const v = this.vehicle;
      m.position.set(v.x - v.fx * 0.25, v.y + 0.05, v.z - v.fz * 0.25);
      m.rotation.set(0, v.heading, 0);
      this.model.pivot.rotation.z = v.roll;
      return;
    }
    m.position.set(this.x, this.y, this.z);
    m.rotation.set(0, this.heading, 0);
  }
}
