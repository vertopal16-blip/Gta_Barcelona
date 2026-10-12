// Cámara en tercera persona: órbita libre, modo apuntado sobre el hombro, seguimiento de vehículos.

import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle } from './utils.js';

export class CameraRig {
  constructor(camera, game) {
    this.camera = camera;
    this.game = game;
    this.yaw = Math.PI; // mira hacia -z (norte)
    this.pitch = 0.25;
    this.dist = 5;
    this.curDist = 5;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.shakeT = 0;
    this.shakeAmp = 0;
    this.idleLook = 0;
    this.zoomLevel = 1;
    this.fovBase = 65;
    this.cinematic = null;
  }

  shake(amount = 0.2, time = 0.4) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
    this.shakeT = Math.max(this.shakeT, time);
  }

  /** Dirección de la vista (para disparar). */
  forward() {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return d;
  }

  update(dt, input) {
    const g = this.game;
    const p = g.player;
    if (this.cinematic) {
      const c = this.cinematic;
      c.t += dt;
      this.camera.position.lerp(c.pos, 1 - Math.exp(-dt * 2));
      this.camera.lookAt(c.look);
      return;
    }
    const look = input.locked || input.gamepad() ? input.look(dt) : { dx: 0, dy: 0 };
    if (input.wheel && !p.weaponWheelUsed) this.zoomLevel = clamp(this.zoomLevel + input.wheel * 0.15, 0.6, 1.8);
    this.yaw -= look.dx;
    this.pitch = clamp(this.pitch + look.dy, -0.9, 1.25);
    const moved = Math.abs(look.dx) + Math.abs(look.dy) > 0.0005;
    this.idleLook = moved ? 0 : this.idleLook + dt;

    const v = p.vehicle;
    let tx, ty, tz, wantDist, height;
    const aiming = p.aiming && !v;
    if (v) {
      tx = v.x; ty = v.y + v.T.hei * 0.8 + 0.6; tz = v.z;
      wantDist = (v.T.len * 1.1 + 4.5) * this.zoomLevel;
      // Recentrar detrás del coche cuando no se mueve el ratón
      if (this.idleLook > 1.2 && Math.abs(v.vF) > 3) {
        const behind = v.vF >= 0 ? v.heading + Math.PI : v.heading;
        this.yaw = dampAngle(this.yaw, behind + Math.PI, 2.5, dt);
        this.pitch = damp(this.pitch, 0.22, 2, dt);
      }
    } else {
      tx = p.x; ty = p.y + 1.55; tz = p.z;
      wantDist = (aiming ? 2.4 : 4.6) * this.zoomLevel;
      if (p.swimming) ty = p.y + 0.6;
    }
    height = 0;
    this.target.set(tx, ty, tz);
    if (this.smoothTarget.lengthSq() === 0) this.smoothTarget.copy(this.target);
    this.smoothTarget.x = damp(this.smoothTarget.x, tx, v ? 14 : 20, dt);
    this.smoothTarget.y = damp(this.smoothTarget.y, ty, 10, dt);
    this.smoothTarget.z = damp(this.smoothTarget.z, tz, v ? 14 : 20, dt);

    // Vector cámara -> objetivo
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, -sp, Math.cos(this.yaw) * cp); // dirección de la mirada
    const shoulder = aiming ? 0.7 : 0;
    const right = new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const pivot = this.smoothTarget.clone().addScaledVector(right, shoulder);
    // Colisión de cámara con edificios
    let dist = wantDist;
    const W = g.world;
    const hit = W.collision.raycast(pivot.x, pivot.y, pivot.z, -dir.x, -dir.y, -dir.z, wantDist + 0.3);
    if (hit < dist + 0.3) dist = Math.max(0.6, hit - 0.35);
    this.curDist = dist < this.curDist ? dist : damp(this.curDist, dist, 4, dt);
    const pos = pivot.clone().addScaledVector(dir, -this.curDist);
    // No atravesar el suelo
    const gh = W.groundHeight(pos.x, pos.z) + 0.4;
    if (pos.y < gh) pos.y = gh;
    pos.y += height;
    // Temblor
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT);
      pos.x += (Math.random() - 0.5) * a; pos.y += (Math.random() - 0.5) * a; pos.z += (Math.random() - 0.5) * a;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    this.camera.position.copy(pos);
    this.camera.lookAt(pos.clone().add(dir));
    // FOV dinámico con la velocidad
    const spd = v ? Math.abs(v.vF) : 0;
    const fov = (aiming ? 52 : this.fovBase) + clamp((spd - 15) * 0.35, 0, 14);
    this.camera.fov = damp(this.camera.fov, fov, 5, dt);
    this.camera.updateProjectionMatrix();
  }

  /** Orientación horizontal de la cámara (para mover al personaje). */
  get heading() { return wrapAngle(this.yaw); }
}
