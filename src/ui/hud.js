// Interfaz: HUD, minimapa, mapa grande, GPS, iconos (blips) y menús.

import * as THREE from 'three';
import { formatMoney, clamp, dist2 } from '../core/utils.js';
import { MAP, isWater, isBeach, DISTRICTS, districtAt, montjuicDist } from '../world/terrain.js';
import { zoneAt } from '../world/layout.js';
import { audio } from '../core/audio.js';
import { WEAPONS } from '../systems/combat.js';

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
export class Blips {
  constructor() { this.list = []; }
  add(b) { const o = { color: '#ffffff', ...b }; this.list.push(o); return o; }
  remove(b) { const i = this.list.indexOf(b); if (i >= 0) this.list.splice(i, 1); }
  removeTemp() { this.list = this.list.filter((b) => !b.temp); }
  pos(b) {
    if (b.follow) {
      if (b.follow.removed || b.follow.alive === false) return null;
      return { x: b.follow.x, z: b.follow.z };
    }
    return { x: b.x, z: b.z };
  }
}

/** GPS: ruta por la red viaria hasta el destino. */
export class GPS {
  constructor(game) {
    this.game = game;
    this.user = null;
    this.mission = null;
    this.path = [];
    this.t = 0;
  }
  get target() { return this.mission || this.user; }
  set(x, z, mission = false) {
    if (mission) this.mission = { x, z }; else this.user = { x, z };
    this.t = 0;
  }
  clear(mission = false) {
    if (mission) this.mission = null; else this.user = null;
    if (!this.target) this.path = [];
    this.t = 0;
  }
  update(dt) {
    const tg = this.target;
    if (!tg) { this.path = []; return; }
    const p = this.game.focus();
    if (!this.mission && this.user && dist2(p.x, p.z, tg.x, tg.z) < 15) { this.clear(false); this.game.hud.notify('Has llegado a tu destino.'); return; }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.5;
    this.path = this.game.routePoints(p.x, p.z, tg.x, tg.z, true);
  }
}

// ---------------------------------------------------------------------------
export class HUD {
  constructor(game) {
    this.game = game;
    this.notes = $('notifications');
    this.mini = $('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.bubbles = $('bubbles');
    this.bubbleEls = [];
    this.bigT = 0;
    this.districtT = 0;
    this.lastDistrict = null;
    this.flashEl = null;
    this.moneyShown = 0;
    this.externalPrompt = '';
    this._wanted = -1;
    this.mapCanvas = null;
    this.subT = 0;
  }

  show() { $('hud').classList.remove('hidden'); }
  hide() { $('hud').classList.add('hidden'); }

  notify(html, time = 5) {
    const el = document.createElement('div');
    el.className = 'note';
    el.innerHTML = html;
    this.notes.appendChild(el);
    while (this.notes.children.length > 4) this.notes.firstChild.remove();
    setTimeout(() => el.remove(), time * 1000);
  }

  money(v, delta) {
    const el = $('money');
    el.textContent = formatMoney(v);
    if (delta) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 250); }
  }

  objective(html) { $('objective').innerHTML = html || ''; }

  subtitle(who, text, dur = 3) {
    $('subtitle').innerHTML = `<span class="who">${who}:</span>${text}`;
    this.subT = dur;
  }

  prompt(html) { $('prompt').innerHTML = html || ''; }

  crosshair(on, hit = false) {
    const c = $('crosshair');
    c.classList.toggle('on', !!on);
    c.classList.toggle('hit', !!hit);
  }

  hitMarker(kill) {
    const c = $('crosshair');
    c.textContent = kill ? '✖' : '×';
    clearTimeout(this._hm);
    this._hm = setTimeout(() => (c.textContent = '+'), 160);
  }

  big(title, sub = '', good = false, dur = 3) {
    const el = $('bigmessage');
    el.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
    el.classList.toggle('good', !!good);
    el.classList.add('show');
    this.bigT = dur;
  }

  timer(sec, up = false) {
    const el = $('timer');
    if (sec === '' || sec === null || sec === undefined) { el.textContent = ''; return; }
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    el.textContent = `${up ? '' : '⏱ '}${m}:${String(s).padStart(2, '0')}${up ? '.' + Math.floor((sec % 1) * 10) : ''}`;
    el.style.color = !up && sec < 15 ? '#ff5a4a' : '#fff';
  }

  setWanted(level, blink) {
    const key = level + (blink ? 'b' : '');
    if (key === this._wanted) return;
    this._wanted = key;
    const el = $('wanted');
    el.innerHTML = level > 0 ? Array.from({ length: 5 }, (_, i) => `<span class="star ${i < level ? 'on' : ''}">★</span>`).join('') : '';
    el.classList.toggle('blink', !!blink && level > 0);
  }

  damageFlash(amount) {
    if (!this.flashEl) {
      this.flashEl = document.createElement('div');
      Object.assign(this.flashEl.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 5, transition: 'opacity 0.4s',
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(200,0,0,0.55))', opacity: 0 });
      document.body.appendChild(this.flashEl);
    }
    this.flashEl.style.opacity = Math.min(1, 0.3 + amount / 40);
    clearTimeout(this._df);
    this._df = setTimeout(() => (this.flashEl.style.opacity = 0), 180);
  }

  // -------------------------------------------------------------------------
  update(dt) {
    const g = this.game, pl = g.player;
    $('clock').textContent = g.world.sky.clockString() + (g.world.sky.rain > 0.3 ? ' 🌧' : '');
    $('healthbar').style.width = `${clamp(pl.health / pl.maxHealth, 0, 1) * 100}%`;
    $('armorbar').style.width = `${clamp(pl.armor / 100, 0, 1) * 100}%`;
    $('staminabar').style.width = `${pl.stamina}%`;
    const W = pl.weapon;
    $('weapon-name').textContent = W.name;
    const w = pl.weapons[pl.current];
    $('weapon-ammo').textContent = W.ranged ? (pl.reloadT > 0 ? 'recargando…' : `${w.clip} / ${w.ammo}`) : '';
    if (this.bigT > 0) { this.bigT -= dt; if (this.bigT <= 0) $('bigmessage').classList.remove('show'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) $('subtitle').innerHTML = ''; }
    // Vehículo
    const v = pl.vehicle;
    $('vehicle-info').style.display = v ? '' : 'none';
    if (v) {
      $('vehicle-name').textContent = v.T.name;
      $('speed').textContent = `${Math.round(v.kmh)} km/h`;
    }
    // Barrio
    const d = g.world.districtId(pl.x, pl.z);
    if (d !== this.lastDistrict) {
      this.lastDistrict = d;
      const el = $('district');
      const street = g.world.roads.nearestEdge(pl.x, pl.z, 40);
      el.innerHTML = `${DISTRICTS[d].name}${street && street.edge.name ? `<small>${street.edge.name}</small>` : ''}`;
      el.classList.add('show');
      this.districtT = 4;
    }
    if (this.districtT > 0) { this.districtT -= dt; if (this.districtT <= 0) $('district').classList.remove('show'); }
    this.drawMinimap();
    this.drawBubbles();
  }

  /** Bocadillos de diálogo sobre los peatones. */
  drawBubbles() {
    const g = this.game;
    const cam = g.camera.camera;
    const W = innerWidth, H = innerHeight;
    let i = 0;
    const v = new THREE.Vector3();
    for (const p of g.peds.list) {
      if (!p.bubble || !p.inScene) continue;
      if (dist2(p.x, p.z, g.player.x, g.player.z) > 30) continue;
      v.set(p.x, p.y + 2.25, p.z).project(cam);
      if (v.z > 1 || v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1) continue;
      let el = this.bubbleEls[i];
      if (!el) { el = document.createElement('div'); el.className = 'bubble'; this.bubbles.appendChild(el); this.bubbleEls.push(el); }
      el.style.display = '';
      el.textContent = p.bubble.text;
      el.style.left = `${(v.x * 0.5 + 0.5) * W}px`;
      el.style.top = `${(-v.y * 0.5 + 0.5) * H}px`;
      i++;
      if (i >= 8) break;
    }
    for (; i < this.bubbleEls.length; i++) this.bubbleEls[i].style.display = 'none';
  }

  // -------------------------------------------------------------------------
  // Mapa prerenderizado
  buildMapCanvas() {
    const g = this.game;
    const S = 0.75; // píxeles por metro
    const w = Math.ceil((MAP.maxX - MAP.minX) * S), h = Math.ceil((MAP.maxZ - MAP.minZ) * S);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const tint = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const step = 4;
    for (let py = 0; py < h; py += step) {
      for (let px = 0; px < w; px += step) {
        const x = MAP.minX + px / S, z = MAP.minZ + py / S;
        let c;
        if (isWater(x, z)) c = [38, 84, 128];
        else if (isBeach(x, z)) c = [222, 200, 150];
        else {
          const zn = zoneAt(x, z, ['park', 'plaza']);
          if ((zn && zn.kind === 'park') || montjuicDist(x, z) < 215) c = [92, 128, 76];
          else if (zn) c = [150, 140, 120];
          else {
            const dc = tint(DISTRICTS[districtAt(x, z)].color);
            c = [52 + dc[0] * 0.12, 56 + dc[1] * 0.12, 62 + dc[2] * 0.12];
          }
        }
        for (let yy = 0; yy < step && py + yy < h; yy++) for (let xx = 0; xx < step && px + xx < w; xx++) {
          const k = ((py + yy) * w + px + xx) * 4;
          img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    const T = (x, z) => [(x - MAP.minX) * S, (z - MAP.minZ) * S];
    // Edificios
    ctx.fillStyle = 'rgba(20,22,26,0.55)';
    for (const b of g.world.city.buildings) {
      ctx.beginPath();
      for (let i = 0; i < b.poly.length; i += 2) { const [px, py] = T(b.poly[i], b.poly[i + 1]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.fill();
    }
    // Calles
    const R = g.world.roads;
    ctx.lineCap = 'round';
    const types = ['narrow', 'local', 'mountain', 'street', 'promenade', 'avenue', 'highway'];
    for (const t of types) {
      ctx.strokeStyle = t === 'highway' ? '#e8c060' : t === 'avenue' ? '#e8e2d0' : t === 'promenade' ? '#c8b896' : '#b8b4aa';
      for (const e of R.edges) {
        if (e.type !== t) continue;
        const A = R.nodes[e.a], B = R.nodes[e.b];
        ctx.lineWidth = Math.max(1.2, e.w * S * 0.8);
        ctx.beginPath();
        ctx.moveTo(...T(A.x, A.z)); ctx.lineTo(...T(B.x, B.z));
        ctx.stroke();
      }
    }
    this.mapCanvas = cv;
    this.mapScale = S;
  }

  w2m(x, z) { return [(x - MAP.minX) * this.mapScale, (z - MAP.minZ) * this.mapScale]; }

  drawMinimap() {
    if (!this.mapCanvas) return;
    const g = this.game, pl = g.player;
    const ctx = this.miniCtx;
    const W = this.mini.width, H = this.mini.height;
    const v = pl.vehicle;
    const zoom = v ? clamp(1.6 - v.speed * 0.02, 0.85, 1.6) : 2.0; // px por píxel de mapa
    const rot = g.camera.yaw - Math.PI; // el mapa gira con la cámara
    ctx.save();
    ctx.fillStyle = '#20262c';
    ctx.fillRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); ctx.clip();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(rot);
    ctx.scale(zoom, zoom);
    const [mx, my] = this.w2m(pl.x, pl.z);
    ctx.drawImage(this.mapCanvas, -mx, -my);
    // Ruta GPS
    const path = g.gps.path;
    if (path.length > 1) {
      ctx.strokeStyle = g.gps.mission ? '#f2b33d' : '#b05ae8';
      ctx.lineWidth = 3.2 / zoom;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      path.forEach((p, i) => { const [x, y] = this.w2m(p.x, p.z); i ? ctx.lineTo(x - mx, y - my) : ctx.moveTo(x - mx, y - my); });
      ctx.stroke();
    }
    // Zona de búsqueda policial
    if (g.police.level > 0) {
      const lk = g.police.lastKnown;
      const [x, y] = this.w2m(lk.x, lk.z);
      const blink = Math.floor(performance.now() / 400) % 2;
      ctx.fillStyle = blink ? 'rgba(220,40,40,0.18)' : 'rgba(40,80,220,0.18)';
      ctx.beginPath(); ctx.arc(x - mx, y - my, g.police.searchRadius * this.mapScale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // Blips (sin rotar los iconos)
    const toScreen = (x, z) => {
      const [bx, by] = this.w2m(x, z);
      let dx = (bx - mx) * zoom, dy = (by - my) * zoom;
      const c = Math.cos(rot), s = Math.sin(rot);
      return [dx * c - dy * s, dx * s + dy * c];
    };
    const R = W / 2 - 10;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const b of g.blips.list) {
      if (b.hidden) continue;
      const p = g.blips.pos(b);
      if (!p) continue;
      let [sx, sy] = toScreen(p.x, p.z);
      const d = Math.hypot(sx, sy);
      const important = b.kind === 'mission' || b.kind === 'enemy' || b.kind === 'contact';
      if (d > R) { if (!important && !b.route) continue; sx = sx / d * R; sy = sy / d * R; }
      this.drawBlip(ctx, b, sx, sy, 1);
    }
    // Policía
    for (const u of g.vehicles.list) {
      if (!u.T.police || u.destroyed) continue;
      let [sx, sy] = toScreen(u.x, u.z);
      const d = Math.hypot(sx, sy);
      if (d > R) continue;
      ctx.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#ff3030' : '#3060ff';
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
    }
    if (g.police.heli) {
      const [sx, sy] = toScreen(g.police.heli.x, g.police.heli.z);
      if (Math.hypot(sx, sy) < R) { ctx.fillStyle = '#ff3030'; ctx.fillText('✚', sx, sy); }
    }
    // Jugador
    ctx.rotate(-(pl.vehicle ? pl.vehicle.heading : pl.heading) + rot + Math.PI);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // Norte
    const [nx, ny] = [Math.sin(rot) * (W / 2 - 12), -Math.cos(rot) * (W / 2 - 12)];
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', W / 2 + nx, H / 2 + ny);
  }

  drawBlip(ctx, b, x, y, scale) {
    ctx.globalAlpha = b.dim ? 0.45 : 1;
    const icon = b.icon || '●';
    if (icon.length === 1 && /[A-Z●◆✖★?]/.test(icon)) {
      ctx.fillStyle = b.color || '#fff';
      if (/[A-Z]/.test(icon)) {
        ctx.beginPath(); ctx.arc(x, y, 8 * scale, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.font = `bold ${11 * scale}px sans-serif`; ctx.fillText(icon, x, y + 0.5);
      } else {
        ctx.font = `bold ${14 * scale}px sans-serif`;
        ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeText(icon, x, y);
        ctx.fillText(icon, x, y);
      }
    } else {
      ctx.font = `${13 * scale}px sans-serif`;
      ctx.fillText(icon, x, y);
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// Mapa grande
export class BigMap {
  constructor(game) {
    this.game = game;
    this.el = $('bigmap');
    this.cv = $('bigmap-canvas');
    this.ctx = this.cv.getContext('2d');
    this.open = false;
    this.zoom = 0.5;
    this.cx = 0; this.cz = 0;
    let drag = null;
    this.cv.addEventListener('mousedown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false }; });
    window.addEventListener('mousemove', (e) => {
      if (!drag || !this.open) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      const S = this.game.hud.mapScale * this.zoom;
      this.cx = drag.cx - dx / S; this.cz = drag.cz - dy / S;
    });
    window.addEventListener('mouseup', (e) => {
      if (drag && !drag.moved && this.open) this.click(e);
      drag = null;
    });
    this.cv.addEventListener('wheel', (e) => { if (this.open) { this.zoom = clamp(this.zoom * (e.deltaY > 0 ? 0.85 : 1.18), 0.25, 4); e.preventDefault(); } }, { passive: false });
  }

  toggle() {
    this.open ? this.close() : this.show();
  }

  show() {
    const g = this.game;
    this.open = true;
    this.el.classList.remove('hidden');
    this.cx = g.player.x; this.cz = g.player.z;
    g.input.exitLock();
    g.paused = true;
    this.legend();
  }

  close() {
    this.open = false;
    this.el.classList.add('hidden');
    this.game.paused = false;
  }

  legend() {
    const g = this.game;
    const found = g.activities.panotFound.size;
    $('bigmap-legend').innerHTML = `
      <b>Barcelona</b><br>
      M · Misión / contacto &nbsp; 🏠 Propiedad &nbsp; 💼 Negocio<br>
      🔫 Armería &nbsp; 🛒 Tienda &nbsp; 👕 Ropa &nbsp; 🔧 Taller &nbsp; 🚗 Concesionario<br>
      🏁 Carrera &nbsp; ⤴ Salto &nbsp; ✿ Panot (${found}/30)<br>
      <br>Misiones completadas: ${g.missions.done.size}/${g.missionData.MISSIONS.length}<br>
      Dinero: ${formatMoney(g.economy.money)}`;
  }

  click(e) {
    const g = this.game;
    const r = this.cv.getBoundingClientRect();
    const S = g.hud.mapScale * this.zoom;
    const x = this.cx + (e.clientX - r.left - r.width / 2) / S;
    const z = this.cz + (e.clientY - r.top - r.height / 2) / S;
    if (g.gps.user && dist2(g.gps.user.x, g.gps.user.z, x, z) < 30 / this.zoom) { g.gps.clear(false); g.hud.notify('Destino eliminado.'); }
    else { g.gps.set(x, z, false); g.hud.notify(`Destino marcado: <b>${g.world.district(x, z).name}</b>`); }
    audio.play('ui');
  }

  draw() {
    if (!this.open) return;
    const g = this.game, hud = g.hud;
    const cv = this.cv;
    if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; }
    const ctx = this.ctx;
    ctx.fillStyle = '#16324d';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const z = this.zoom;
    const [mx, my] = hud.w2m(this.cx, this.cz);
    ctx.save();
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.scale(z, z);
    ctx.drawImage(hud.mapCanvas, -mx, -my);
    const path = g.gps.path;
    if (path.length > 1) {
      ctx.strokeStyle = g.gps.mission ? '#f2b33d' : '#b05ae8';
      ctx.lineWidth = 4 / z;
      ctx.beginPath();
      path.forEach((p, i) => { const [x, y] = hud.w2m(p.x, p.z); i ? ctx.lineTo(x - mx, y - my) : ctx.moveTo(x - mx, y - my); });
      ctx.stroke();
    }
    ctx.restore();
    const toS = (x, zz) => { const [bx, by] = hud.w2m(x, zz); return [(bx - mx) * z + cv.width / 2, (by - my) * z + cv.height / 2]; };
    // Etiquetas de barrios y monumentos
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const labels = { eixample: [100, -380], gotic: [100, 260], raval: [-150, 280], born: [320, 330], barceloneta: [420, 600], gracia: [-20, -700], poblenou: [960, -200], sants: [-850, -280], montjuic: [-480, 270], zonafranca: [-1000, 780], lescorts: [-1000, -900], vilaolimpica: [740, 270], poblesec: [-380, 120] };
    ctx.font = `bold ${Math.round(13 + z * 6)}px "Arial Black", sans-serif`;
    for (const [id, [x, zz]] of Object.entries(labels)) {
      const [sx, sy] = toS(x, zz);
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 4;
      ctx.strokeText(DISTRICTS[id].name.toUpperCase(), sx, sy);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(DISTRICTS[id].name.toUpperCase(), sx, sy);
    }
    if (z > 0.9) {
      ctx.font = '12px sans-serif';
      for (const l of g.world.landmarks.labels) {
        const [sx, sy] = toS(l.x, l.z);
        ctx.fillStyle = '#ffe9b0';
        ctx.fillText((l.icon ? l.icon + ' ' : '') + l.name, sx, sy + 14);
      }
    } else {
      for (const l of g.world.landmarks.labels) {
        if (!l.icon) continue;
        const [sx, sy] = toS(l.x, l.z);
        ctx.font = '14px sans-serif';
        ctx.fillText(l.icon, sx, sy);
      }
    }
    for (const b of g.blips.list) {
      if (b.hidden) continue;
      const p = g.blips.pos(b);
      if (!p) continue;
      const [sx, sy] = toS(p.x, p.z);
      hud.drawBlip(ctx, b, sx, sy, 1.2);
      if (z > 1.2 && b.label) { ctx.font = '11px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(b.label, sx, sy + 16); }
    }
    if (g.gps.user) {
      const [sx, sy] = toS(g.gps.user.x, g.gps.user.z);
      ctx.fillStyle = '#b05ae8'; ctx.font = 'bold 22px sans-serif'; ctx.fillText('⬇', sx, sy - 10);
    }
    // Jugador
    const pl = g.player;
    const [px, py] = toS(pl.x, pl.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-(pl.vehicle ? pl.vehicle.heading : pl.heading) + Math.PI);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // Brújula
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif';
    ctx.fillText('N ↑', cv.width - 40, 30);
    ctx.font = '12px sans-serif';
    ctx.fillText('Mar Mediterrània ↓', cv.width - 90, cv.height - 40);
  }
}

// ---------------------------------------------------------------------------
// Menús modales
export class UI {
  constructor(game) {
    this.game = game;
    this.el = $('modal');
    this.box = $('modal-box');
    this.opts = [];
    this.sel = 0;
    window.addEventListener('keydown', (e) => {
      if (this.el.classList.contains('hidden')) return;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.move(1); e.preventDefault(); }
      else if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.move(-1); e.preventDefault(); }
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE') { if (this.justOpened) return; this.choose(this.sel); e.preventDefault(); }
      else if (e.code === 'Escape' || e.code === 'Backspace') { if (this.closable) this.close(); e.preventDefault(); }
    });
  }

  get open() { return !this.el.classList.contains('hidden'); }

  menu({ title, text = '', options = [], closable = true, html = '' }) {
    const g = this.game;
    this.opts = options;
    this.closable = closable;
    this.sel = options.findIndex((o) => !o.disabled);
    if (this.sel < 0) this.sel = 0;
    this.box.innerHTML = `<h2>${title}</h2>${text ? `<p>${text}</p>` : ''}${html}<div class="opts"></div>`;
    const wrap = this.box.querySelector('.opts');
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'modal-btn';
      b.disabled = !!o.disabled;
      b.innerHTML = `${o.label}${o.price ? `<span class="price">${formatMoney(o.price)}</span>` : ''}`;
      if (o.danger) b.style.borderLeftColor = '#d6402e';
      b.addEventListener('click', () => this.choose(i));
      b.addEventListener('mouseenter', () => { this.sel = i; this.highlight(); });
      wrap.appendChild(b);
    });
    this.el.classList.remove('hidden');
    this.highlight();
    g.input.exitLock();
    g.paused = true;
    g.modalOpen = true;
    this.justOpened = true;
    setTimeout(() => (this.justOpened = false), 200);
    audio.play('ui');
  }

  highlight() {
    [...this.box.querySelectorAll('.modal-btn')].forEach((b, i) => b.classList.toggle('sel', i === this.sel));
  }

  move(d) {
    if (!this.opts.length) return;
    let i = this.sel;
    for (let k = 0; k < this.opts.length; k++) {
      i = (i + d + this.opts.length) % this.opts.length;
      if (!this.opts[i].disabled) break;
    }
    this.sel = i;
    this.highlight();
    audio.play('ui');
  }

  choose(i) {
    const o = this.opts[i];
    if (!o || o.disabled) return;
    const r = o.action ? o.action() : 'close';
    if (r === 'stay') {
      // Refresca el menú si la acción lo modificó
      if (this._last) this._last();
      else this.renderMoney();
    } else if (r !== 'keep') this.close();
  }

  renderMoney() {}

  close() {
    this.el.classList.add('hidden');
    this.game.paused = this.game.bigmap.open || this.game.pauseOpen;
    this.game.modalOpen = false;
    this.opts = [];
  }

  // Menú de pausa
  pause() {
    const g = this.game;
    g.pauseOpen = true;
    this.menu({
      title: 'Pausa', text: `${g.world.district(g.player.x, g.player.z).name} · ${g.world.sky.clockString()}`, options: [
        { label: 'Continuar', action: () => { g.pauseOpen = false; return 'close'; } },
        { label: 'Controles', action: () => { this.controls(true); return 'keep'; } },
        { label: 'Estadísticas', action: () => { this.stats(); return 'keep'; } },
        { label: 'Ajustes', action: () => { this.settings(); return 'keep'; } },
        { label: 'Guardar partida (solo en tus propiedades)', disabled: true },
        { label: 'Salir al menú principal', action: () => { location.reload(); return 'keep'; } },
      ],
    });
  }

  controls(fromPause = false) {
    const rows = [
      ['W A S D', 'Moverse / conducir'], ['Ratón', 'Cámara'], ['Shift', 'Esprintar'], ['Espacio', 'Saltar / freno de mano'],
      ['F', 'Entrar / salir / robar vehículo'], ['E', 'Interactuar (tiendas, contactos)'], ['Clic izq.', 'Atacar / disparar'], ['Clic der.', 'Apuntar (también desde el coche)'],
      ['Q · 1-7', 'Cambiar de arma'], ['R', 'Recargar'], ['H', 'Claxon'], ['N', 'Cambiar emisora de radio'], ['G', 'Sirena (coche patrulla)'], ['L', 'Luces'],
      ['J', 'Trabajo: taxi / reparto / vigilante'], ['M', 'Mapa (clic para marcar destino GPS)'], ['T', 'Teléfono'], ['Rueda', 'Zoom de cámara'], ['Esc / P', 'Pausa'],
    ];
    this.menu({
      title: 'Controles', html: `<table>${rows.map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}</table><p>También compatible con mando (sticks, gatillos para acelerar/frenar).</p>`,
      options: [{ label: 'Volver', action: () => { if (fromPause) this.pause(); return fromPause ? 'keep' : 'close'; } }],
    });
  }

  stats() {
    const g = this.game, s = g.stats;
    const rows = [
      ['Misiones completadas', `${g.missions.done.size} / ${g.missionData.MISSIONS.length}`], ['Dinero ganado', formatMoney(s.earned)], ['Propiedades', g.economy.owned.size], ['Negocios', g.economy.businesses.size],
      ['Panots encontrados', `${g.activities.panotFound.size} / 30`], ['Saltos únicos', `${g.activities.jumpsDone.size} / 6`], ['Coches robados', s.carsStolen], ['Coches vendidos', s.carsSold],
      ['Carreras de taxi', s.taxiFares], ['Repartos', s.deliveries], ['Carreras ganadas', s.racesWon], ['Atracos', s.robberies], ['Delincuentes detenidos', s.criminals],
      ['Buenas acciones', s.goodDeeds], ['Bajas', s.kills], ['Detenciones sufridas', s.busted], ['Veces hospitalizado', s.wasted],
      ['Salto más largo', `${s.longestJump.toFixed(0)} m`], ['Distancia recorrida', `${(s.distance / 1000).toFixed(1)} km`], ['Tiempo jugado', `${Math.floor(s.time / 60)} min`],
    ];
    this.menu({ title: 'Estadísticas', html: `<table>${rows.map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${v}</td></tr>`).join('')}</table>`, options: [{ label: 'Volver', action: () => { this.pause(); return 'keep'; } }] });
  }

  settings() {
    const g = this.game, st = g.settings;
    const html = `
      <div class="row">Calidad gráfica <select id="set-quality">${['baja', 'media', 'alta'].map((q) => `<option value="${q}" ${st.quality === q ? 'selected' : ''}>${q[0].toUpperCase() + q.slice(1)}</option>`).join('')}</select>
        <label><input id="set-auto" type="checkbox" ${st.autoQuality ? 'checked' : ''}> automática</label></div>
      <div class="row">Volumen <input id="set-vol" type="range" min="0" max="1" step="0.05" value="${st.volume}"></div>
      <div class="row">Volumen de la radio <input id="set-radio" type="range" min="0" max="1" step="0.05" value="${st.radio ?? 0.5}"></div>
      <div class="row">Sensibilidad del ratón <input id="set-sens" type="range" min="0.3" max="2.5" step="0.1" value="${st.sensitivity}"></div>
      <div class="row">Densidad de tráfico <input id="set-traffic" type="range" min="0.2" max="1.5" step="0.1" value="${st.traffic}"></div>
      <div class="row">Distancia de visión <input id="set-fog" type="range" min="0.5" max="1.5" step="0.1" value="${st.view}"></div>
      <div class="row"><label><input id="set-inv" type="checkbox" ${st.invertY ? 'checked' : ''}> Invertir eje Y</label></div>
      <div class="row"><label><input id="set-shadows" type="checkbox" ${st.shadows ? 'checked' : ''}> Sombras</label></div>`;
    this.menu({ title: 'Ajustes', html, options: [{ label: 'Guardar y volver', action: () => {
      st.quality = $('set-quality').value; st.autoQuality = $('set-auto').checked;
      st.volume = +$('set-vol').value; st.radio = +$('set-radio').value; st.sensitivity = +$('set-sens').value; st.traffic = +$('set-traffic').value;
      st.view = +$('set-fog').value; st.invertY = $('set-inv').checked; st.shadows = $('set-shadows').checked;
      g.applySettings();
      this.pause();
      return 'keep';
    } }] });
  }

  /** Teléfono: contactos y actividades. */
  phone() {
    const g = this.game;
    const { CONTACTS, MISSIONS } = g.missionData;
    const html = Object.entries(CONTACTS).map(([id, c]) => {
      const next = g.missions.nextFor(id);
      const done = MISSIONS.filter((m) => m.giver === id && g.missions.done.has(m.id)).length;
      const total = MISSIONS.filter((m) => m.giver === id).length;
      const unlocked = next || done;
      return `<p><b style="color:#${c.color.toString(16).padStart(6, '0')}">${c.name}</b> — ${unlocked ? (next ? `Tiene un encargo: <i>${next.title}</i>` : 'Sin encargos por ahora') : '<i>Desconocido</i>'} (${done}/${total})</p>`;
    }).join('') + `<p style="opacity:.75">Trabajos: sube a un taxi, una moto o un coche patrulla y pulsa <kbd>J</kbd>. Carreras 🏁 y saltos ⤴ en el mapa.</p>`;
    this.menu({
      title: '📱 Teléfono', html, options: [
        ...Object.entries(CONTACTS).filter(([id]) => g.missions.nextFor(id)).map(([id, c]) => ({ label: `Marcar ruta a ${c.name}`, action: () => { g.gps.set(c.x, c.z, false); g.hud.notify(`GPS: ${c.name}`); return 'close'; } })),
        { label: 'Llamar a un taxi (50 €, te lleva al destino marcado)', disabled: !g.gps.user || !!g.player.vehicle, price: 50, action: () => { g.fastTravel(); return 'close'; } },
        { label: 'Colgar', action: () => 'close' },
      ],
    });
  }

  ending() {
    const g = this.game;
    this.menu({
      title: 'Barcelona es tuya',
      text: 'Llegaste sin nada a la Estació de Sants. Hoy conoces cada calle, cada plaza y cada secreto de la ciudad.<br><br>La historia principal ha terminado, pero Barcelona sigue viva: negocios, carreras, panots escondidos y mil maneras más de vivirla.',
      options: [{ label: 'Seguir jugando', action: () => 'close' }],
    });
  }
}
