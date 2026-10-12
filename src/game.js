// Núcleo del juego: crea todos los sistemas, ejecuta el bucle principal
// y ofrece consultas compartidas (visibilidad, línea de visión, rutas...).

import * as THREE from 'three';
import { World } from './world/world.js';
import { Input } from './core/input.js';
import { CameraRig } from './core/camera.js';
import { audio } from './core/audio.js';
import { radio, STATIONS } from './core/radio.js';
import { events } from './core/events.js';
import { rand, dist2, clamp, formatMoney } from './core/utils.js';
import { Player } from './entities/player.js';
import { VehicleManager } from './entities/traffic.js';
import { PedManager } from './entities/peds.js';
import { Combat } from './systems/combat.js';
import { Police } from './systems/police.js';
import { Pickups, Markers } from './systems/pickups.js';
import { Economy, PROPERTIES } from './systems/economy.js';
import { Missions, CONTACTS, MISSIONS } from './systems/missions.js';
import { Activities } from './systems/activities.js';
import { Ambient } from './systems/ambient.js';
import { SaveSystem } from './systems/save.js';
import { HUD, Blips, GPS, BigMap, UI } from './ui/hud.js';
import { LaneDriver } from './entities/traffic.js';
import { VEHICLE_TYPES } from './entities/vehicle.js';

/** Niveles de calidad gráfica. */
export const QUALITY = {
  baja: { name: 'Baja', ratio: 0.75, shadow: 0, view: 0.6, traffic: 18, peds: 24, lamps: 0 },
  media: { name: 'Media', ratio: 1, shadow: 1024, view: 0.85, traffic: 26, peds: 34, lamps: 4 },
  alta: { name: 'Alta', ratio: 'max', shadow: 2048, view: 1, traffic: 30, peds: 42, lamps: 8 },
};
const QUALITY_ORDER = ['baja', 'media', 'alta'];

const HOSPITALS = [
  { name: 'Hospital del Mar', x: 606, z: 296 },
  { name: 'Hospital Clínic', x: -250, z: -180 },
  { name: 'Hospital de Sant Pau', x: 520, z: -560 },
];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera3 = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.3, 4500);
    this.input = new Input(canvas);
    this.paused = true;
    this.modalOpen = false;
    this.pauseOpen = false;
    this.dt = 0;
    this.simTime = 0;
    this.frustum = new THREE.Frustum();
    this.projScreen = new THREE.Matrix4();
    this.settings = { quality: 'alta', autoQuality: true, radio: 0.5, volume: 0.6, sensitivity: 1, traffic: 1, view: 1, invertY: false, shadows: true };
    this.stats = {
      earned: 0, kills: 0, carsStolen: 0, carsSold: 0, taxiFares: 0, deliveries: 0, racesWon: 0, robberies: 0, criminals: 0,
      goodDeeds: 0, busted: 0, wasted: 0, longestJump: 0, distance: 0, time: 0, missions: 0, properties: 0, weaponsBought: 0,
    };
    this.missionData = { CONTACTS, MISSIONS };
    window.addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.camera3.aspect = innerWidth / innerHeight;
      this.camera3.updateProjectionMatrix();
    });
  }

  async init(progress) {
    this.world = new World(this.scene, this.renderer);
    await this.world.build(progress);
    progress('Llenando las calles de vida…', 0.92);
    await new Promise((r) => setTimeout(r, 0));
    this.blips = new Blips();
    this.gps = new GPS(this);
    this.hud = new HUD(this);
    this.ui = new UI(this);
    this.bigmap = new BigMap(this);
    this.camera = new CameraRig(this.camera3, this);
    this.combat = new Combat(this);
    this.player = new Player(this);
    this.vehicles = new VehicleManager(this);
    this.peds = new PedManager(this);
    this.police = new Police(this);
    this.pickups = new Pickups(this);
    this.markers = new Markers(this);
    this.economy = new Economy(this);
    this.missions = new Missions(this);
    this.activities = new Activities(this);
    this.ambient = new Ambient(this);
    this.save = new SaveSystem(this);
    this.hud.buildMapCanvas();
    this.economy.setup();
    this.missions.setup();
    this.activities.setup();
    this.setupHospitals();
    this.setupWorldPickups();
    this.bindKeys();
    events.on('pedKilled', (e) => { if (e.ped.role === 'police' && e.killer === this.player) this.stats.copsKilled = (this.stats.copsKilled || 0) + 1; });
  }

  setupHospitals() {
    for (const h of HOSPITALS) {
      const p = this.world.sidewalkPoint(h.x, h.z);
      h.x = p.x; h.z = p.z;
      this.blips.add({ x: h.x, z: h.z, icon: '🏥', label: h.name, kind: 'service' });
    }
    this.blips.add({ x: 215, z: 230, icon: '🚔', label: 'Comisaría', kind: 'service' });
  }

  /** Botiquines, chalecos y armas escondidos por la ciudad. */
  setupWorldPickups() {
    const spots = [
      ['health', 600, 290], ['health', -250, -170], ['health', 520, -540], ['health', -760, -200], ['health', 60, 300],
      ['armor', -440, 330], ['armor', 1100, -300], ['armor', -1100, 800], ['armor', 300, 640],
    ];
    for (const [k, x, z] of spots) {
      const p = this.world.sidewalkPoint(x, z);
      this.pickups.add(k, p.x, p.z);
    }
    const weapons = [['bat', 150, -900], ['knife', -200, 400], ['pistol', -1200, 900], ['shotgun', 1150, 380], ['smg', -478, 300]];
    for (const [w, x, z] of weapons) {
      const p = this.world.sidewalkPoint(x, z);
      this.pickups.add('weapon', p.x, p.z, { weapon: w, ammo: w === 'pistol' ? 36 : w === 'smg' ? 90 : 16, life: Infinity });
    }
  }

  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.started) return;
      if (e.code === 'KeyM' && !this.modalOpen) { this.bigmap.toggle(); audio.play('ui'); }
      if ((e.code === 'Escape' || e.code === 'KeyP') && !this.modalOpen) {
        if (this.bigmap.open) this.bigmap.close();
        else this.ui.pause();
      }
      if (e.code === 'KeyT' && !this.modalOpen && !this.bigmap.open) this.ui.phone();
    });
  }

  applySettings() {
    const s = this.settings;
    audio.setVolume(s.volume);
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    const Q = QUALITY[s.quality] || QUALITY.media;
    this.vehicles.trafficTarget = Math.round(Q.traffic * s.traffic);
    this.peds.target = Q.peds;
    const shadows = s.shadows && Q.shadow > 0;
    this.renderer.shadowMap.enabled = shadows;
    const sun = this.world.sky.sun;
    sun.castShadow = shadows;
    if (shadows && sun.shadow.mapSize.x !== Q.shadow) {
      sun.shadow.mapSize.set(Q.shadow, Q.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    this.renderer.setPixelRatio(Q.ratio === 'max' ? Math.min(window.devicePixelRatio, 1.5) : Q.ratio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.world.maxLampLights = Q.lamps;
    this.viewFactor = s.view * Q.view;
    this.scene.traverse((o) => { if (o.material) { const m = Array.isArray(o.material) ? o.material : [o.material]; m.forEach((x) => (x.needsUpdate = true)); } });
  }

  // -------------------------------------------------------------------------
  newGame() {
    const st = this.world.sidewalkPoint(-760, -186);
    this.player.placeAt(st.x, st.z, Math.PI);
    this.economy.money = 300;
    this.world.sky.time = 9.5;
    // Coche viejo del primo, aparcado frente a la estación
    const ne = this.world.roads.nearestEdge(st.x + 12, st.z, 60, (e) => !e.noTraffic);
    if (ne) {
      const e = ne.edge;
      const off = e.w / 2 - 1.3;
      const v = this.vehicles.spawn('compact', ne.x - e.dz * off, ne.z + e.dx * off, Math.atan2(e.dx, e.dz), { color: 0xc8a050, persistent: true });
      v.playerOwned = true;
      v.parked = true;
      this.blips.add({ x: v.x, z: v.z, follow: v, icon: '🚗', label: 'Coche de tu primo', kind: 'mission', temp: true });
      this.cousinCar = v;
    }
    this.start();
    this.hud.big('BARCELONA', 'Estació de Sants · 09:30', true, 4);
    const M = CONTACTS.marta;
    this.gps.set(M.x, M.z, false);
    setTimeout(() => this.hud.subtitle('Tú', 'Barcelona… Por fin. 300 euros en el bolsillo y el número de Marta, la amiga de mi primo.', 5), 1500);
    setTimeout(() => this.hud.notify('Tu primo te ha dejado su viejo <b>Cubic Ona</b> aparcado delante de la estación. Pulsa <kbd>F</kbd> para subir.', 9), 4000);
    setTimeout(() => this.hud.notify('Ve a ver a <b>Marta</b> al Bar La Gavina (Raval). Sigue la ruta del GPS en el minimapa. <kbd>M</kbd> abre el mapa.', 9), 9000);
    setTimeout(() => this.hud.notify('Barcelona es libre: misiones, trabajos (<kbd>J</kbd>), carreras, negocios, panots escondidos… Pulsa <kbd>Esc</kbd> para ver los controles.', 9), 16000);
  }

  continueGame() {
    if (!this.save.load()) { this.newGame(); return; }
    this.economy.refreshBlips();
    this.missions.refresh();
    this.activities.refreshPanots();
    this.applySettings();
    this.start();
    this.hud.money(this.economy.money);
    this.hud.notify('Partida cargada.');
  }

  start() {
    this.started = true;
    this.paused = false;
    this.hud.show();
    this.hud.money(this.economy.money);
    this.applySettings();
    this.camera.yaw = this.player.heading;
    audio.init();
    audio.setVolume(this.settings.volume);
    this.input.requestLock();
  }

  // -------------------------------------------------------------------------
  // Consultas compartidas
  focus() {
    const p = this.player;
    return p.vehicle ? { x: p.vehicle.x, y: p.vehicle.y, z: p.vehicle.z } : { x: p.x, y: p.y, z: p.z };
  }

  isVisible(x, y, z, r = 2) {
    const d = dist2(x, z, this.camera3.position.x, this.camera3.position.z);
    if (d > this.world.sky.fog.far) return false;
    return this.frustum.intersectsSphere(new THREE.Sphere(new THREE.Vector3(x, y, z), r));
  }

  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const l = Math.hypot(dx, dy, dz);
    if (l < 0.1) return true;
    const t = this.world.collision.raycast(ax, ay, az, dx / l, dy / l, dz / l, l);
    return t >= l - 0.5;
  }

  /** Obstáculo más cercano delante de un vehículo (para la IA de tráfico). */
  obstacleAhead(v, range, halfW) {
    let best = null;
    const fx = v.fx, fz = v.fz;
    const check = (x, z, isPlayer, len = 0) => {
      const dx = x - v.x, dz = z - v.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > range + len / 2) return;
      const lat = Math.abs(dx * -fz + dz * fx);
      if (lat > halfW + 0.8) return;
      const d = along - len / 2;
      if (!best || d < best.dist) best = { dist: d, isPlayer };
    };
    for (const o of this.vehicles.list) {
      if (o === v) continue;
      if (Math.abs(o.x - v.x) > range + 6 || Math.abs(o.z - v.z) > range + 6) continue;
      check(o.x, o.z, o === this.player.vehicle, o.T.len);
    }
    const p = this.player;
    if (!p.vehicle && !p.dead) check(p.x, p.z, true);
    for (const ped of this.peds.list) {
      if (!ped.inScene || ped.state === 'inVehicle') continue;
      if (Math.abs(ped.x - v.x) > range || Math.abs(ped.z - v.z) > range) continue;
      check(ped.x, ped.z, false);
    }
    return best;
  }

  /** Ruta por calles entre dos puntos como lista de puntos. */
  routePoints(ax, az, bx, bz, includeEnd = true) {
    const R = this.world.roads;
    const car = (e) => !e.noTraffic;
    const na = R.nearestNode(ax, az, car), nb = R.nearestNode(bx, bz, car);
    const path = R.findPath(na.id, nb.id, { car: true });
    const pts = [{ x: ax, z: az }];
    if (path) for (const id of path) pts.push({ x: R.nodes[id].x, z: R.nodes[id].z });
    if (includeEnd) pts.push({ x: bx, z: bz });
    return pts;
  }

  trafficDensity() {
    const t = this.world.sky.time;
    const night = t < 6 ? 0.35 : t < 7.5 ? 0.6 : t > 23 ? 0.5 : 1;
    const d = this.world.districtId(this.player.x, this.player.z);
    const zone = ['gotic', 'raval', 'born', 'barceloneta', 'montjuic'].includes(d) ? 0.55 : 1;
    return night * zone * (this.settings.traffic ?? 1);
  }

  pedDensity() {
    const t = this.world.sky.time;
    const night = t < 6 ? 0.3 : t < 8 ? 0.6 : t > 23 ? 0.6 : 1;
    const d = this.world.districtId(this.player.x, this.player.z);
    const zone = { gotic: 1.4, raval: 1.2, born: 1.3, barceloneta: 1.3, eixample: 1.1, gracia: 1.15, zonafranca: 0.35, montjuic: 0.6, lescorts: 0.8 }[d] ?? 1;
    const rain = 1 - this.world.sky.rain * 0.5;
    return night * zone * rain;
  }

  reportCrime(type, x, z, victim) { this.police.reportCrime(type, x, z, victim); }

  onVehicleDamaged(v, amt, attacker) {
    if (attacker === this.player && v.T.police && !v.destroyed) this.reportCrime('shootCop', v.x, v.z, v);
  }

  onVehicleCollision(a, b, impact) {
    const pv = this.player.vehicle;
    if (!pv || (a !== pv && b !== pv)) return;
    const other = a === pv ? b : a;
    if (impact > 4) this.camera.shake(Math.min(0.5, impact * 0.03), 0.3);
    if (other.T.police && impact > 4 && !(other.ai && (other.ai.kind === 'pursuit' || other.ai.kind === 'boatchase'))) this.reportCrime('assaultCop', other.x, other.z, other);
    // El conductor afectado reacciona
    const d = other.driver;
    if (d && d.isPed && d.alive && other.ai && other.ai.kind === 'lane' && impact > 5 && !other.T.police) {
      if (d.brave && rand() < 0.5 && pv.speed < 6) {
        setTimeout(() => { if (d.alive && other.driver === d && !other.removed) { this.peds.ejectFrom(other, d, 'fight'); other.ai = null; } }, 900);
      } else {
        audio.play('horn', other.x, other.z);
        other.ai.panicT = 8;
      }
    }
  }

  onEnterVehicle(v) {
    if (!v.isBike && !v.T.police) {
      if (v.radioStation === undefined) v.radioStation = Math.floor(Math.random() * (STATIONS.length + 1)) - 1;
      radio.index = v.radioStation;
      const st = radio.station;
      if (st) setTimeout(() => this.hud.notify(`📻 <b>${st.name}</b> · ${st.desc} <small>(<kbd>N</kbd> cambiar)</small>`, 4), 600);
    } else radio.index = -1;
    this.hud.notify(`<b>${v.T.name}</b>${v.T.taxi ? ' · Pulsa <kbd>J</kbd> para hacer de taxista' : v.type === 'scooter' ? ' · Pulsa <kbd>J</kbd> para repartir comida' : v.T.police ? ' · <kbd>J</kbd> vigilante · <kbd>G</kbd> sirena' : ''}`, 4);
    if (v === this.cousinCar) this.blips.removeTemp();
  }

  onExitVehicle(v) {}

  onPlayerDeath(attacker, cause) {
    const pl = this.player;
    this.stats.wasted++;
    if (pl.vehicle) { const v = pl.vehicle; pl.vehicle = null; v.driver = null; pl.model.root.visible = true; }
    audio.setEngine(false);
    this.missions.abort('Has caído');
    if (this.activities.job) this.activities.endJob();
    if (this.activities.race) this.activities.endRace(false, 'Has caído');
    this.hud.big('FUERA DE COMBATE', cause === 'drown' ? 'Te has ahogado' : '', false, 4);
    this.respawnSequence(() => {
      const h = HOSPITALS.reduce((a, b) => (dist2(pl.x, pl.z, a.x, a.z) < dist2(pl.x, pl.z, b.x, b.z) ? a : b));
      const bill = Math.min(this.economy.money, Math.max(100, Math.round(this.economy.money * 0.08)));
      pl.placeAt(h.x, h.z, 0);
      pl.dead = false;
      pl.health = pl.maxHealth;
      pl.armor = 0;
      this.economy.money -= bill;
      this.hud.money(this.economy.money);
      this.police.clear();
      this.world.sky.time = (this.world.sky.time + 6) % 24;
      this.hud.notify(`${h.name}: factura médica de <b>${formatMoney(bill)}</b>.`);
    });
  }

  onBusted() {
    const pl = this.player;
    pl.busted = true;
    this.stats.busted++;
    if (pl.vehicle) pl.exitVehicle(true);
    this.missions.abort('Te han detenido');
    if (this.activities.job) this.activities.endJob();
    if (this.activities.race) this.activities.endRace(false, 'Detenido');
    this.hud.big('DETENIDO', 'Mans enlaire!', false, 4);
    this.respawnSequence(() => {
      const fine = Math.min(this.economy.money, Math.max(100, Math.round(this.economy.money * 0.1)));
      const p = this.world.sidewalkPoint(215, 228);
      pl.placeAt(p.x, p.z, 0);
      pl.busted = false;
      pl.health = pl.maxHealth;
      pl.clearWeapons();
      this.economy.money -= fine;
      this.hud.money(this.economy.money);
      this.police.clear();
      this.world.sky.time = (this.world.sky.time + 12) % 24;
      this.hud.notify(`Sales de la comisaría de Via Laietana. Multa: <b>${formatMoney(fine)}</b>. Te han requisado las armas.`);
    });
  }

  respawnSequence(fn) {
    const fade = document.getElementById('fade');
    setTimeout(() => fade.classList.add('on'), 2500);
    setTimeout(() => {
      fn();
      // Limpia el entorno
      for (const v of [...this.vehicles.list]) if (!v.playerOwned) this.vehicles.remove(v);
      for (const p of [...this.peds.list]) if (!p.persistent || p.role === 'police' || p.role === 'gang') this.peds.remove(p);
      this.police.units = []; this.police.officers = [];
      this.camera.yaw = this.player.heading;
      fade.classList.remove('on');
    }, 3600);
  }

  sleep(property) {
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    setTimeout(() => {
      const sky = this.world.sky;
      if (sky.time > 8) this.economy.day++;
      sky.time = 8;
      this.player.health = this.player.maxHealth;
      this.save.save();
      fade.classList.remove('on');
      this.hud.notify('Has dormido hasta las 8:00. Partida guardada.');
    }, 1200);
  }

  spawnStoredVehicle(p, stored) {
    const ne = this.world.roads.nearestEdge(p.x, p.z, 60, (e) => !e.noTraffic);
    if (!ne) return;
    const v = this.vehicles.spawn(stored.type, ne.x, ne.z, Math.atan2(ne.edge.dx, ne.edge.dz), { color: stored.color, persistent: true });
    v.playerOwned = true;
    this.hud.notify(`Tu ${VEHICLE_TYPES[stored.type].name} está en la calle.`);
  }

  fastTravel() {
    const tg = this.gps.user;
    if (!tg || !this.economy.spend(50, 'Taxi')) return;
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    setTimeout(() => {
      const p = this.world.sidewalkPoint(tg.x, tg.z);
      this.player.placeAt(p.x, p.z, 0);
      this.world.sky.time = (this.world.sky.time + 0.5) % 24;
      this.gps.clear(false);
      fade.classList.remove('on');
    }, 1200);
  }

  // -------------------------------------------------------------------------
  loop() {
    let last = performance.now();
    const frame = (now) => {
      requestAnimationFrame(frame);
      if (this.manual) { last = now; return; }
      const rawDt = (now - last) / 1000;
      const realDt = Math.max(0, Math.min(0.05, rawDt));
      this.monitorFps(rawDt);
      last = now;
      this.step(realDt);
    };
    requestAnimationFrame(frame);
  }

  /** Baja la calidad automáticamente si el juego va lento. */
  monitorFps(dt) {
    if (!this.started || this.paused || !this.settings.autoQuality || dt <= 0 || dt > 1) { this.fpsAcc = 0; this.fpsN = 0; return; }
    this.fpsAcc = (this.fpsAcc || 0) + dt;
    this.fpsN = (this.fpsN || 0) + 1;
    this.playT = (this.playT || 0) + dt;
    if (this.fpsAcc < 4) return;
    const fps = this.fpsN / this.fpsAcc;
    this.fpsAcc = 0; this.fpsN = 0;
    this.fps = fps;
    if (this.playT < 3) return;
    const i = QUALITY_ORDER.indexOf(this.settings.quality);
    if (fps < 26 && i > 0) {
      this.settings.quality = QUALITY_ORDER[i - 1];
      this.applySettings();
      this.hud.notify(`Rendimiento bajo (${Math.round(fps)} FPS): calidad gráfica ajustada a <b>${QUALITY[this.settings.quality].name}</b>. Puedes cambiarla en Ajustes.`, 6);
    }
  }

  /** Simula sin renderizar (pruebas automáticas). */
  simulate(seconds, dt = 1 / 30) {
    for (let t = 0; t < seconds; t += dt) this.step(dt, false);
  }

  step(realDt, render = true) {
    const dt = this.paused ? 0 : realDt;
    this.dt = dt;
    this.simTime += dt;
    const pl = this.player;
    const focus = this.focus();
    this.camera3.updateMatrixWorld();
    this.projScreen.multiplyMatrices(this.camera3.projectionMatrix, this.camera3.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    this.world.update(dt, focus, this.simTime);
    if (this.viewFactor && this.viewFactor !== 1) { this.world.sky.fog.far *= this.viewFactor; this.world.sky.fog.near *= this.viewFactor; }
    if (!this.paused && this.started) {
      const px = pl.x, pz = pl.z;
      pl.update(dt, this.input);
      this.stats.distance += Math.min(5, dist2(px, pz, pl.x, pl.z));
      this.stats.time += dt;
      this.vehicles.populate(dt);
      this.vehicles.update(dt);
      if (pl.vehicle) { const v = pl.vehicle; pl.x = v.x; pl.y = v.y; pl.z = v.z; pl.syncModel(); }
      if (pl.vehicle && this.input.hit('KeyN') && !pl.vehicle.isBike) {
        const st = radio.next();
        pl.vehicle.radioStation = radio.index;
        this.hud.notify(st ? `📻 <b>${st.name}</b> · ${st.desc}` : '📻 Radio apagada', 3);
      }
      this.peds.populate(dt);
      this.peds.update(dt);
      this.police.update(dt);
      this.combat.update(dt);
      this.pickups.update(dt);
      this.markers.update(dt);
      this.missions.update(dt);
      this.activities.update(dt);
      this.ambient.update(dt);
      this.economy.update(dt);
      this.gps.update(dt);
      audio.listener.x = focus.x; audio.listener.z = focus.z;
      const d = this.world.districtId(focus.x, focus.z);
      const coast = Math.max(0, 1 - Math.abs(focus.z - 440) / 120);
      audio.setAmbient(d === 'montjuic' ? 0.4 : 1, coast);
    }
    if (this.started) {
      this.camera.update(realDt, this.input);
      this.hud.update(realDt);
      this.bigmap.draw();
    }
    radio.volume = this.settings.radio ?? 0.5;
    radio.setActive(this.started && !this.paused && !!pl.vehicle && !pl.dead);
    if (render) this.renderer.render(this.scene, this.camera3);
    this.input.endFrame();
  }
}
