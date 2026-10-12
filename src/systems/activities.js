// Actividades secundarias y eventos espontáneos:
// taxi, reparto en moto, desguace, carreras, saltos, coleccionables (panots),
// atracos, vigilante y sucesos callejeros aleatorios.

import * as THREE from 'three';
import { rand, makeRng, dist2, formatMoney, clamp } from '../core/utils.js';
import { audio } from '../core/audio.js';
import { RAMPS, isWater } from '../world/terrain.js';
import { GeoBuilder } from '../world/geom.js';
import { PathDriver, FleeDriver } from '../entities/traffic.js';
import { CONTACTS } from './missions.js';

const DESTINATIONS = [
  ['Sagrada Família', 352, -330], ['Plaça de Catalunya', 0, -25], ['Park Güell', 90, -860], ['Estació de Sants', -760, -170],
  ['Hospital del Mar', 606, 290], ['Barceloneta', 420, 470], ['Arc de Triomf', 512, -60], ['Plaça d\'Espanya', -580, -30],
  ['Torre Glòries', 712, -110], ['Vila Olímpica', 700, 330], ['Plaça del Sol', -75, -560], ['Catedral', 105, 140],
  ['Mercat del Born', 360, 120], ['MACBA', -130, 180], ['Les Corts', -900, -640], ['Poblenou', 1000, 100], ['Passeig de Gràcia', 0, -200],
  ['Port Vell', -60, 425], ['Font Màgica', -580, 95], ['Rambla del Raval', -128, 250], ['Diagonal Mar', 1150, 160],
];

const RACES = [
  { id: 'montjuic', name: 'Circuit de Montjuïc', fee: 200, prize: 1500, laps: 1,
    pts: () => { const pts = []; for (let i = 0; i <= 16; i++) { const a = -2.05 - (i / 16) * Math.PI * 2; pts.push([-480 + Math.cos(a) * 238, 330 + Math.sin(a) * 238]); } return pts; } },
  { id: 'diagonal', name: 'Sprint de la Diagonal', fee: 150, prize: 900, laps: 1,
    pts: () => { const pts = []; for (let x = -1150; x <= 600; x += 175) pts.push([x, -760 + (x + 1000) * 0.4122]); pts.push([640, -40], [640, 200]); return pts; } },
  { id: 'litoral', name: 'Ronda del Litoral', fee: 250, prize: 1800, laps: 1,
    pts: () => [[1200, 415], [900, 415], [640, 415], [450, 420], [200, 430], [-140, 430], [-200, 520], [-260, 640], [-500, 690], [-800, 670], [-1150, 670]] },
];

export class Activities {
  constructor(game) {
    this.game = game;
    this.job = null;
    this.race = null;
    this.panots = [];
    this.panotFound = new Set();
    this.jumpsDone = new Set();
    this.eventT = 60;
    this.event = null;
    this.robbery = null;
    this.taxiFares = 0;
    this.deliveries = 0;
  }

  setup() {
    const g = this.game;
    this.setupDocks();
    this.setupMetro();
    this.setupPanots();
    this.setupRamps();
    // Carreras
    for (const r of RACES) {
      const pts = r.pts().map(([x, z]) => { const ne = g.world.roads.nearestEdge(x, z, 80, (e) => !e.noTraffic); return ne ? { x: ne.x, z: ne.z } : { x, z }; });
      r.points = pts;
      const s = pts[0];
      r.marker = g.markers.add(s.x, s.z, { color: 0xff6020, radius: 4, vehicleOnly: true, prompt: `<kbd>E</kbd> Carrera: ${r.name} (${formatMoney(r.fee)})`, onInteract: () => this.startRace(r) });
      g.blips.add({ x: s.x, z: s.z, icon: '🏁', label: r.name, kind: 'race' });
    }
    // Desguace de Quim
    const Q = CONTACTS.quim;
    const ne = g.world.roads.nearestEdge(Q.x + 15, Q.z, 80, (e) => !e.noTraffic);
    this.chop = g.markers.add(ne.x, ne.z, {
      color: 0x40a0ff, radius: 4, vehicleOnly: true,
      prompt: '<kbd>E</kbd> Vender el vehículo en el desguace',
      onInteract: () => this.sellCar(),
    });
    this.chop.active = false;
    this.chopBlip = g.blips.add({ x: ne.x, z: ne.z, icon: '💰', label: 'Desguace de Quim', kind: 'shop', hidden: true });
  }

  // -------------------------------------------------------------------------
  // Amarres de barcos
  setupDocks() {
    const g = this.game, W = g.world;
    const spots = [
      { x: -110, z: 466, h: 0, types: ['speedboat', 'dinghy'], name: 'Port Vell' },
      { x: 700, z: 482, h: 0, types: ['dinghy', 'speedboat'], name: 'Platja de la Barceloneta' },
      { x: 910, z: 505, h: 0, types: ['speedboat', 'speedboat'], name: 'Port Olímpic' },
      { x: -600, z: 970, h: 0, types: ['speedboat'], name: 'Moll de la Zona Franca' },
    ];
    this.docks = [];
    for (const d of spots) {
      // Busca agua profunda cerca
      let ok = null;
      for (let k = 0; k < 40 && !ok; k++) {
        const x = d.x + (k % 7 - 3) * 6, z = d.z + Math.floor(k / 7) * 6;
        if (W.isWater(x, z) && W.groundHeight(x, z) < -2.5 && W.groundHeight(x, z + 4) < -2.5) ok = { x, z };
      }
      if (!ok) continue;
      Object.assign(d, ok);
      this.docks.push(d);
      g.blips.add({ x: d.x, z: d.z, icon: '⚓', label: 'Barcos: ' + d.name, kind: 'service' });
    }
    this.dockT = 0;
  }

  updateDocks(dt) {
    const g = this.game, pl = g.player;
    this.dockT -= dt;
    if (this.dockT > 0) return;
    this.dockT = 5;
    for (const d of this.docks) {
      const dp = dist2(pl.x, pl.z, d.x, d.z);
      if (dp > 250 || dp < 40) continue;
      d.types.forEach((t, i) => {
        const x = d.x + i * 5, z = d.z;
        if (g.vehicles.list.some((v) => v.isBoat && dist2(v.x, v.z, x, z) < 4)) return;
        if (!g.world.isWater(x, z) || g.world.groundHeight(x, z) > -2) return;
        const v = g.vehicles.spawn(t, x, z, d.h);
        v.parked = true;
      });
    }
  }

  // -------------------------------------------------------------------------
  // Metro de Barcelona: viaje rápido entre estaciones
  setupMetro() {
    const g = this.game;
    this.stations = [
      ['Sants Estació', -760, -150, 'L3 L5'], ['Espanya', -560, -40, 'L1 L3'], ['Paral·lel', -150, 400, 'L2 L3'],
      ['Catalunya', 30, -30, 'L1 L3'], ['Liceu', 10, 230, 'L3'], ['Jaume I', 200, 180, 'L4'], ['Barceloneta', 330, 420, 'L4'],
      ['Passeig de Gràcia', 10, -200, 'L2 L3 L4'], ['Diagonal', 10, -360, 'L3 L5'], ['Fontana', 20, -640, 'L3'],
      ['Sagrada Família', 300, -330, 'L2 L5'], ['Glòries', 600, -40, 'L1'], ['Ciutadella | Vila Olímpica', 650, 330, 'L4'],
      ['Poblenou', 960, 80, 'L4'], ['Les Corts', -880, -580, 'L3'], ['Drassanes', -20, 410, 'L3'],
    ].map(([name, x, z, lines]) => {
      const p = g.world.sidewalkPoint(x, z);
      return { name, x: p.x, z: p.z, lines };
    });
    const b = new GeoBuilder();
    for (const st of this.stations) {
      const y = g.world.groundHeight(st.x, st.z);
      // Poste con el rombo rojo de la "M"
      b.cylinder(st.x, y, st.z, 0.07, 0.07, 3.2, 0x2a2a2a, 6);
      b.box(st.x, y + 3.1, st.z, 0.85, 0.85, 0.1, 0xd8202a, Math.PI / 4);
      b.box(st.x, y + 3.1, st.z, 0.45, 0.45, 0.12, 0xffffff, Math.PI / 4);
      // Barandilla de la boca de metro
      b.box(st.x + 1.6, y, st.z, 0.08, 1.0, 3.0, 0x3a3a3a);
      b.box(st.x - 1.6, y, st.z, 0.08, 1.0, 3.0, 0x3a3a3a);
      st.marker = g.markers.add(st.x, st.z, { color: 0xd8202a, radius: 1.4, footOnly: true, prompt: `<kbd>E</kbd> Metro · ${st.name} (${st.lines})`, onInteract: () => this.openMetro(st) });
      g.blips.add({ x: st.x, z: st.z, icon: 'Ⓜ', label: 'Metro ' + st.name, kind: 'metro', color: '#d8202a' });
    }
    g.scene.add(b.toMesh(new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  openMetro(from) {
    const g = this.game;
    const fare = 2.55;
    const opts = this.stations.filter((s) => s !== from).map((s) => ({
      label: `${s.name} <small style="opacity:.6">${s.lines}</small>`, price: null,
      action: () => {
        if (g.police.level > 0) { g.hud.notify('La policía vigila el metro. ¡Piérdelos antes!'); return 'close'; }
        if (!g.economy.spend(fare, 'Billete de metro')) return 'close';
        const fade = document.getElementById('fade');
        fade.classList.add('on');
        const mins = Math.max(4, Math.round(dist2(from.x, from.z, s.x, s.z) / 120));
        setTimeout(() => {
          g.player.placeAt(s.x + 1, s.z + 1, 0);
          g.world.sky.time = (g.world.sky.time + mins / 60) % 24;
          g.stats.metroTrips = (g.stats.metroTrips || 0) + 1;
          fade.classList.remove('on');
          g.hud.notify(`🚇 Has llegado a <b>${s.name}</b> (${mins} min)`);
        }, 1300);
        return 'close';
      },
    }));
    g.ui.menu({ title: `Ⓜ Metro · ${from.name}`, text: `Billete sencillo: 2,55 €. ¿A qué estación vas?`, options: opts });
  }

  // -------------------------------------------------------------------------
  // Coleccionables: 30 baldosas panot escondidas por toda la ciudad
  setupPanots() {
    const g = this.game;
    const rng = makeRng(2024);
    const W = g.world;
    const districts = ['eixample', 'gotic', 'raval', 'born', 'barceloneta', 'gracia', 'poblenou', 'sants', 'montjuic', 'zonafranca', 'lescorts', 'vilaolimpica', 'poblesec'];
    let id = 0, tries = 0;
    while (this.panots.length < 30 && tries++ < 5000) {
      const d = districts[id % districts.length];
      const x = rng.range(-1200, 1200), z = rng.range(-950, 900);
      if (W.districtId(x, z) !== d || isWater(x, z)) continue;
      if (W.collision.resolveCircle(x, z, 1, W.groundHeight(x, z), 2).hit) continue;
      if (W.roads.roadDistance(x, z) < 2 || W.roads.roadDistance(x, z) > 25) continue;
      if (this.panots.some((p) => dist2(p.x, p.z, x, z) < 120)) continue;
      this.panots.push({ id, x, z, d });
      id++;
    }
    for (const p of this.panots) if (!this.panotFound.has(p.id)) p.pickup = g.pickups.add('panot', p.x, p.z, { id: p.id });
  }

  refreshPanots() {
    const g = this.game;
    for (const p of this.panots) {
      if (this.panotFound.has(p.id) && p.pickup && g.pickups.list.includes(p.pickup)) g.pickups.remove(p.pickup);
    }
  }

  collectPanot(id) {
    const g = this.game;
    if (this.panotFound.has(id)) return;
    this.panotFound.add(id);
    const n = this.panotFound.size;
    audio.play('pickup');
    g.economy.add(150, `Panot ${n}/30`);
    if (n === 30) { g.economy.add(10000, '¡Todos los panots!'); g.hud.big('COLECCIÓN COMPLETA', 'Conoces cada rincón de Barcelona', true); audio.play('success'); }
    else g.hud.notify(`Has encontrado una <b>baldosa panot</b> (${n}/30)`);
    for (const p of this.panots) if (p.id === id && p.blip) { g.blips.remove(p.blip); p.blip = null; }
  }

  revealPanots(x, z, r) {
    const g = this.game;
    let n = 0;
    for (const p of this.panots) {
      if (this.panotFound.has(p.id) || p.blip || dist2(p.x, p.z, x, z) > r) continue;
      p.blip = g.blips.add({ x: p.x, z: p.z, icon: '✿', label: 'Panot', color: '#f0c030', kind: 'collectible' });
      n++;
    }
    g.hud.notify(n ? `Se han marcado ${n} panots en el mapa.` : 'No quedan panots por esta zona.');
  }

  // -------------------------------------------------------------------------
  // Saltos acrobáticos
  setupRamps() {
    const g = this.game;
    const spots = [[300, -84, 'Gran Via'], [-1050, 670, 'Litoral'], [1080, 415, 'Passeig Marítim'], [-900, 300, 'Zona Franca'], [640, 100, 'Wellington'], [-1000, -300, 'Sants']];
    const b = new GeoBuilder();
    for (const [x, z, name] of spots) {
      const ne = g.world.roads.nearestEdge(x, z, 60, (e) => !e.noTraffic && e.len > 50);
      if (!ne) continue;
      const e = ne.edge;
      const s = clamp(ne.t * e.len, 20, e.len - 20);
      const A = g.world.roads.nodes[e.a];
      const off = -e.w / 4;
      const rx = A.x + e.dx * s - e.dz * off, rz = A.z + e.dz * s + e.dx * off;
      const ramp = { x: rx, z: rz, h: Math.atan2(e.dx, e.dz), len: 9, wid: 3.6, height: 1.9, name };
      const y0 = g.world.groundHeight(rx, rz);
      RAMPS.push(ramp);
      // Cuña visual
      const fx = Math.sin(ramp.h), fz = Math.cos(ramp.h), px = -fz, pz = fx;
      const P = (lf, ls, h) => [rx + fx * lf + px * ls, y0 + h + 0.05, rz + fz * lf + pz * ls];
      const L = ramp.len / 2, Wd = ramp.wid / 2;
      b.quad(P(-L, Wd, 0), P(-L, -Wd, 0), P(L, -Wd, ramp.height), P(L, Wd, ramp.height), 0xe8c030);
      b.quad(P(L, -Wd, 0), P(L, Wd, 0), P(L, Wd, ramp.height), P(L, -Wd, ramp.height), 0x3a3a3a);
      b.quad(P(-L, -Wd, 0), P(L, -Wd, 0), P(L, -Wd, ramp.height), P(-L, -Wd, 0), 0x8a8a8a);
      b.quad(P(L, Wd, 0), P(-L, Wd, 0), P(-L, Wd, 0), P(L, Wd, ramp.height), 0x8a8a8a);
      for (let k = 0; k < 4; k++) b.quad(P(-L + k * 2.2, Wd + 0.01, 0.05), P(-L + k * 2.2 + 1, -Wd - 0.01, 0.05), P(-L + k * 2.2 + 1, -Wd - 0.01, 0.06), P(-L + k * 2.2, Wd + 0.01, 0.06), 0x111111);
      g.blips.add({ x: rx, z: rz, icon: '⤴', label: 'Salto: ' + name, kind: 'jump', dim: true });
    }
    const m = b.toMesh(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.castShadow = true;
    g.scene.add(m);
  }

  checkJump(dt) {
    const g = this.game, v = g.player.vehicle;
    if (!v) { this.air = null; return; }
    if (!v.onGround) {
      if (!this.air) {
        const ramp = RAMPS.find((r) => dist2(r.x, r.z, v.x, v.z) < 14);
        this.air = { t: 0, x: v.x, z: v.z, ramp };
      }
      this.air.t += dt;
    } else if (this.air) {
      const a = this.air;
      this.air = null;
      const d = dist2(a.x, a.z, v.x, v.z);
      if (a.t > 0.9 && d > 15) {
        const pay = Math.round(d * 6);
        g.hud.notify(`¡Salto de <b>${d.toFixed(0)} m</b>! (${a.t.toFixed(1)} s en el aire)`);
        if (a.ramp && !this.jumpsDone.has(a.ramp.name) && d > 22) {
          this.jumpsDone.add(a.ramp.name);
          g.hud.big('SALTO ÚNICO', `${a.ramp.name} · ${this.jumpsDone.size}/${RAMPS.length}`, true);
          g.economy.add(500, 'Salto único');
          audio.play('success');
        } else if (pay > 100) g.economy.add(Math.min(pay, 400), 'Acrobacia');
        g.stats.longestJump = Math.max(g.stats.longestJump, d);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Trabajos (pulsa J dentro del vehículo adecuado)
  toggleJob() {
    const g = this.game, v = g.player.vehicle;
    if (this.job) { this.endJob('Has terminado tu turno.'); return; }
    if (g.missions.active) { g.hud.notify('Termina primero la misión actual.'); return; }
    if (!v) { g.hud.notify('Sube a un <b>taxi</b>, a una <b>moto</b> (reparto) o a un <b>coche patrulla</b> (vigilante) y pulsa <kbd>J</kbd>.'); return; }
    if (v.T.taxi) this.startTaxi();
    else if (v.type === 'scooter') this.startDelivery();
    else if (v.T.police) this.startVigilante();
    else g.hud.notify('Con este vehículo no hay trabajo disponible.');
  }

  endJob(msg) {
    const g = this.game;
    const j = this.job;
    if (!j) return;
    if (j.marker) g.markers.remove(j.marker);
    if (j.blip) g.blips.remove(j.blip);
    if (j.ped && !j.ped.removed) { j.ped.persistent = false; j.ped.controller = null; j.ped.task = null; if (j.ped.state === 'inVehicle' && j.ped.vehicle) { g.peds.ejectFrom(j.ped.vehicle, j.ped, 'none'); } }
    if (j.target && j.target.blip) g.blips.remove(j.target.blip);
    g.gps.clear(true);
    g.hud.objective('');
    g.hud.timer('');
    this.job = null;
    if (msg) g.hud.notify(msg);
  }

  startTaxi() {
    this.job = { type: 'taxi', stage: 'find', streak: 0 };
    this.game.hud.notify('<b>Turno de taxi</b>. Recoge clientes y llévalos a su destino. <kbd>J</kbd> para terminar.');
    this.nextFare();
  }

  nextFare() {
    const g = this.game, pl = g.player, j = this.job;
    const a = rand() * Math.PI * 2;
    const sp = g.world.sidewalkPoint(pl.x + Math.cos(a) * rand.range(120, 260), pl.z + Math.sin(a) * rand.range(120, 260));
    const ped = g.peds.create(rand() < 0.5 ? 'tourist' : 'civil', sp.x, sp.z, { persistent: true });
    ped.task = { type: 'stand', face: pl };
    ped.say('¡Taxi!', 6);
    j.ped = ped; j.stage = 'pickup';
    j.blip = g.blips.add({ x: sp.x, z: sp.z, follow: ped, icon: '🙋', label: 'Cliente', color: '#40e0ff', kind: 'mission', route: true });
    g.gps.set(sp.x, sp.z, true);
    g.hud.objective('Recoge al <b>cliente</b>.');
  }

  updateTaxi(dt) {
    const g = this.game, pl = g.player, j = this.job, v = pl.vehicle;
    if (!v || !v.T.taxi) { this.endJob('Has dejado el taxi. Fin del turno.'); return; }
    if (!j.ped.alive) { this.endJob('El cliente ha… tenido un problema.'); return; }
    if (j.stage === 'pickup') {
      if (dist2(v.x, v.z, j.ped.x, j.ped.z) < 7 && v.speed < 2) {
        j.ped.task = { type: 'goto', x: v.x, z: v.z, r: 2.2, onArrive: () => {
          j.ped.state = 'inVehicle'; j.ped.vehicle = v; v.passengers.push(j.ped); j.ped.model.root.removeFromParent(); j.ped.inScene = false;
          const [name, dx, dz] = rand.pick(DESTINATIONS.filter((d) => dist2(d[1], d[2], v.x, v.z) > 250));
          const dp = g.world.sidewalkPoint(dx, dz);
          const dist = dist2(v.x, v.z, dp.x, dp.z);
          j.dest = { name, x: dp.x, z: dp.z, dist };
          j.time = 25 + dist / 9;
          j.stage = 'ride';
          g.blips.remove(j.blip);
          j.blip = g.blips.add({ x: dp.x, z: dp.z, icon: '🏁', label: name, kind: 'mission', route: true });
          j.marker = g.markers.add(dp.x, dp.z, { color: 0x40e0ff, radius: 4 });
          g.gps.set(dp.x, dp.z, true);
          g.hud.subtitle('Cliente', rand.pick([`A ${name}, por favor.`, `¿Me lleva a ${name}? Tengo prisa.`, `To ${name}, please!`, `${name}, i no corris gaire.`]), 3);
          g.hud.objective(`Lleva al cliente a <b>${name}</b>.`);
        } };
      }
    } else if (j.stage === 'ride') {
      j.time -= dt;
      g.hud.timer(Math.max(0, j.time));
      if (dist2(v.x, v.z, j.dest.x, j.dest.z) < 6 && v.speed < 2.5) {
        const base = Math.round(15 + j.dest.dist * 0.18);
        const tip = j.time > 0 ? Math.round(base * 0.4 + j.time * 0.8) : 0;
        j.streak = j.time > 0 ? j.streak + 1 : 0;
        const bonus = j.streak > 0 && j.streak % 5 === 0 ? 300 : 0;
        g.peds.ejectFrom(v, j.ped, 'none');
        j.ped.persistent = false; j.ped.task = null;
        g.markers.remove(j.marker); g.blips.remove(j.blip); j.marker = null;
        g.economy.add(base + tip + bonus, j.time > 0 ? `Carrera de taxi (+${tip} € propina)` : 'Carrera de taxi (tarde, sin propina)');
        if (bonus) g.hud.notify(`¡Racha de ${j.streak} carreras! Bonus de ${bonus} €`);
        this.taxiFares++;
        g.stats.taxiFares++;
        g.hud.timer('');
        this.nextFare();
      }
    }
  }

  startDelivery() {
    this.job = { type: 'delivery', stage: 'pickup', count: 0 };
    this.game.hud.notify('<b>Repartidor</b>: recoge pedidos en restaurantes y entrégalos a tiempo. <kbd>J</kbd> para terminar.');
    this.nextDelivery();
  }

  nextDelivery() {
    const g = this.game, pl = g.player, j = this.job;
    const a = rand() * Math.PI * 2;
    const r = g.world.sidewalkPoint(pl.x + Math.cos(a) * 140, pl.z + Math.sin(a) * 140);
    j.stage = 'pickup';
    j.marker = g.markers.add(r.x, r.z, { color: 0x40c060, radius: 3 });
    j.blip = g.blips.add({ x: r.x, z: r.z, icon: '🍕', label: 'Restaurante', kind: 'mission', route: true });
    j.point = r;
    g.gps.set(r.x, r.z, true);
    g.hud.objective('Recoge el <b>pedido</b> en el restaurante.');
  }

  updateDelivery(dt) {
    const g = this.game, pl = g.player, j = this.job, v = pl.vehicle;
    if (!v || !v.isBike) { this.endJob('Has dejado la moto. Fin del reparto.'); return; }
    if (j.stage === 'drop') { j.time -= dt; g.hud.timer(Math.max(0, j.time)); }
    if (dist2(v.x, v.z, j.point.x, j.point.z) < 5 && v.speed < 4) {
      g.markers.remove(j.marker); g.blips.remove(j.blip);
      if (j.stage === 'pickup') {
        const a = rand() * Math.PI * 2, rr = rand.range(180, 380);
        const d = g.world.sidewalkPoint(pl.x + Math.cos(a) * rr, pl.z + Math.sin(a) * rr);
        j.stage = 'drop'; j.point = d;
        j.time = 20 + dist2(pl.x, pl.z, d.x, d.z) / 8;
        j.marker = g.markers.add(d.x, d.z, { color: 0x40c060, radius: 3 });
        j.blip = g.blips.add({ x: d.x, z: d.z, icon: '🏠', label: 'Cliente', kind: 'mission', route: true });
        g.gps.set(d.x, d.z, true);
        g.hud.objective(`Entrega el pedido en <b>${g.world.district(d.x, d.z).name}</b>.`);
        audio.play('checkpoint');
      } else {
        const pay = j.time > 0 ? Math.round(25 + j.time * 1.2) : 8;
        g.economy.add(pay, j.time > 0 ? 'Entrega a tiempo' : 'Entrega tarde');
        this.deliveries++;
        g.stats.deliveries++;
        g.hud.timer('');
        this.nextDelivery();
      }
    }
  }

  startVigilante() {
    this.job = { type: 'vigilante', level: 1 };
    this.game.hud.notify('<b>Vigilante</b>: detén a los delincuentes que huyen. <kbd>J</kbd> para terminar.');
    this.nextCriminal();
  }

  nextCriminal() {
    const g = this.game, pl = g.player, j = this.job;
    const R = g.world.roads;
    const a = rand() * Math.PI * 2;
    const ne = R.nearestEdge(pl.x + Math.cos(a) * 200, pl.z + Math.sin(a) * 200, 80, (e) => !e.noTraffic && e.len > 30);
    if (!ne) return;
    const v = g.vehicles.spawn(rand.pick(['sedan', 'sports', 'compact', 'suv']), ne.x, ne.z, Math.atan2(ne.edge.dx, ne.edge.dz), { persistent: true });
    v.driver = g.peds.createDriver(v);
    v.driver.role = 'gang';
    v.driver.setWeapon('pistol', 60);
    v.health = v.maxHealth = 700 + j.level * 100;
    v.ai = new FleeDriver(v, g, ne.edge, ne.edge.a);
    j.target = v;
    v.blip = g.blips.add({ x: v.x, z: v.z, follow: v, icon: '●', color: '#ff4040', kind: 'enemy', route: true });
    g.hud.objective(`Nivel ${j.level}: detén el <b>vehículo sospechoso</b>.`);
    j.time = 120;
  }

  updateVigilante(dt) {
    const g = this.game, pl = g.player, j = this.job, v = pl.vehicle;
    if (!v || !v.T.police) { this.endJob('Has dejado el coche patrulla.'); return; }
    const t = j.target;
    if (!t) return;
    j.time -= dt;
    g.hud.timer(Math.max(0, j.time));
    if (t.blip) g.gps.set(t.x, t.z, true);
    const stopped = t.destroyed || !t.driver || !t.driver.alive || (t.speed < 1 && dist2(t.x, t.z, v.x, v.z) < 10);
    if (stopped) {
      g.blips.remove(t.blip);
      t.persistent = false;
      if (t.driver && t.driver.alive) { g.peds.ejectFrom(t, t.driver, 'down'); }
      g.economy.add(150 * j.level, `Vigilante nivel ${j.level}`);
      j.level++;
      g.stats.criminals++;
      this.nextCriminal();
    } else if (j.time <= 0 || dist2(t.x, t.z, v.x, v.z) > 400) {
      g.blips.remove(t.blip);
      t.persistent = false;
      this.endJob('El sospechoso ha escapado. Fin del turno.');
    }
  }

  // -------------------------------------------------------------------------
  sellCar() {
    const g = this.game, v = g.player.vehicle;
    if (!v) return;
    if (v.T.police) { g.hud.subtitle('Quim', '¿Un coche patrulla? ¿Estás loco? Llévatelo de aquí.', 3); return; }
    if (v.playerOwned) { g.hud.subtitle('Quim', 'Este es tuyo, ¿no? No te lo compro, no seas tonto.', 3); return; }
    if (g.police.level > 0) { g.hud.subtitle('Quim', '¡Con la poli detrás no! Piérdelos primero.', 3); return; }
    const value = g.economy.chopValue(v);
    g.ui.menu({
      title: 'Desguace de Quim', text: `«${v.T.name}… Te doy <b>${formatMoney(value)}</b>, ni un euro más.»`,
      options: [
        { label: 'Vender', price: null, action: () => { g.player.exitVehicle(true); g.vehicles.remove(v); g.economy.add(value, 'Venta en el desguace'); g.stats.carsSold++; return 'close'; } },
        { label: 'Mejor no', action: () => 'close' },
      ],
    });
  }

  // -------------------------------------------------------------------------
  // Carreras callejeras
  startRace(r) {
    const g = this.game, pl = g.player;
    if (this.race || g.missions.active || this.job) { g.hud.notify('Ahora no puedes empezar una carrera.'); return; }
    if (g.police.level > 0) { g.hud.notify('Nadie corre contigo con la policía detrás.'); return; }
    if (!g.economy.spend(r.fee, 'Inscripción ' + r.name)) return;
    const v = pl.vehicle;
    const racers = [];
    const s = r.points[0], n = r.points[1];
    const h = Math.atan2(n.x - s.x, n.z - s.z);
    for (let i = 0; i < 3; i++) {
      const off = (i + 1) * 3.2 * (i % 2 ? 1 : -1);
      const rx = s.x - Math.cos(h) * off - Math.sin(h) * (4 + i * 4), rz = s.z + Math.sin(h) * off - Math.cos(h) * (4 + i * 4);
      const car = g.vehicles.spawn(rand.pick(['sports', 'sports', 'moto', 'sedan']), rx, rz, h, { persistent: true });
      car.driver = g.peds.createDriver(car);
      car.racer = true;
      racers.push(car);
    }
    v.x = s.x; v.z = s.z; v.heading = h; v.vx = v.vz = 0;
    this.race = { r, racers, i: 1, countdown: 3.5, start: 0, t: 0, done: false, progress: racers.map(() => 0) };
    pl.controlsLocked = true;
    this.showCheckpoint();
    g.hud.objective(`<b>${r.name}</b>: llega primero a la meta.`);
  }

  showCheckpoint() {
    const g = this.game, R = this.race;
    if (R.marker) g.markers.remove(R.marker);
    if (R.blip) g.blips.remove(R.blip);
    const p = R.r.points[R.i];
    const last = R.i === R.r.points.length - 1;
    R.marker = g.markers.add(p.x, p.z, { color: last ? 0xffffff : 0xff6020, radius: 7, height: 3 });
    R.blip = g.blips.add({ x: p.x, z: p.z, icon: last ? '🏁' : '◆', label: 'Control', kind: 'mission', route: true });
    g.gps.set(p.x, p.z, true);
  }

  updateRace(dt) {
    const g = this.game, pl = g.player, R = this.race;
    if (R.countdown > 0) {
      const before = Math.ceil(R.countdown);
      R.countdown -= dt;
      const now = Math.ceil(R.countdown);
      for (const c of R.racers) { c.input = { throttle: 0, brake: 1, steer: 0, handbrake: 1 }; }
      if (now !== before && now > 0) { g.hud.big(String(now), '', true, 0.8); audio.play('checkpoint'); }
      if (R.countdown <= 0) {
        g.hud.big('¡YA!', '', true, 0.8);
        audio.play('success');
        pl.controlsLocked = false;
        R.racers.forEach((c, i) => { c.ai = new PathDriver(c, g, R.r.points.slice(1), { speed: c.T.maxSpeed * rand.range(0.62, 0.75), reach: 12, aggressive: true, onDone: () => { R.finishers = (R.finishers || 0) + 1; } }); });
      }
      return;
    }
    R.t += dt;
    g.hud.timer(R.t, true);
    if (!pl.vehicle) { this.endRace(false, 'Has abandonado el vehículo.'); return; }
    const p = R.r.points[R.i];
    if (dist2(pl.x, pl.z, p.x, p.z) < 9) {
      audio.play('checkpoint');
      R.i++;
      if (R.i >= R.r.points.length) {
        const pos = (R.finishers || 0) + 1;
        this.endRace(pos === 1, pos === 1 ? `¡Primer puesto! ${R.t.toFixed(1)} s` : `Has llegado ${pos}º`, pos);
        return;
      }
      this.showCheckpoint();
    }
  }

  endRace(win, msg, pos) {
    const g = this.game, R = this.race;
    g.markers.remove(R.marker); g.blips.remove(R.blip);
    for (const c of R.racers) { c.persistent = false; c.racer = false; c.ai = null; }
    g.player.controlsLocked = false;
    g.gps.clear(true);
    g.hud.objective(''); g.hud.timer('');
    if (win) { g.economy.add(R.r.prize, R.r.name); g.hud.big('¡VICTORIA!', msg, true); audio.play('success'); g.stats.racesWon++; }
    else { g.hud.big(pos ? `${pos}º PUESTO` : 'CARRERA PERDIDA', msg, false); if (pos === 2) g.economy.add(Math.round(R.r.fee * 1.5), 'Segundo puesto'); }
    this.race = null;
  }

  // -------------------------------------------------------------------------
  // Atracos a comercios
  startRobbery(shop) {
    const g = this.game;
    this.robbery = { shop, t: 0, total: 0, alarm: false };
    g.hud.objective('Mantén el arma apuntando al dependiente… ¡no te muevas del local!');
    g.hud.subtitle('Dependiente', rand.pick(['¡No dispare! ¡Tome, tome!', '¡Por favor, tengo hijos!', 'Vale, vale, la caja es suya…']), 3);
  }

  updateRobbery(dt) {
    const g = this.game, pl = g.player, R = this.robbery;
    if (dist2(pl.x, pl.z, R.shop.x, R.shop.z) > 6 || pl.vehicle) {
      g.hud.objective('');
      if (R.total > 0) { g.economy.add(R.total, 'Botín del atraco'); g.stats.robberies++; }
      else g.hud.notify('Has abandonado el atraco.');
      this.robbery = null;
      return;
    }
    R.t += dt;
    if (R.t > 2.5 && !R.alarm) { R.alarm = true; audio.play('alarm', pl.x, pl.z); g.police.applyCrime({ add: 0, min: 2, label: 'Atraco a mano armada' }, pl.x, pl.z); }
    if (R.t < 10) R.total = Math.round(R.t * rand.range(60, 90));
    g.hud.objective(`Vaciando la caja… <b>${formatMoney(R.total)}</b> ${R.t >= 10 ? '— ¡Lárgate de ahí!' : ''}`);
  }

  // -------------------------------------------------------------------------
  // Sucesos aleatorios
  updateEvents(dt) {
    const g = this.game, pl = g.player;
    if (g.missions.active || this.race) return;
    if (this.event) { this.event.update(dt); return; }
    this.eventT -= dt;
    if (this.eventT > 0) return;
    this.eventT = rand.range(90, 180);
    if (pl.vehicle && pl.vehicle.speed > 15) return;
    const r = rand();
    if (r < 0.45) this.snatcher();
    else if (r < 0.75) this.lostTourist();
    else this.streetFight();
  }

  snatcher() {
    const g = this.game, pl = g.player;
    const victim = g.peds.nearest(pl.x, pl.z, 50, (p) => p.alive && !p.persistent && (p.role === 'tourist' || p.role === 'civil') && dist2(p.x, p.z, pl.x, pl.z) > 12);
    if (!victim) return;
    const thief = g.peds.create('gang', victim.x + 1, victim.z, { lookKind: 'gang', persistent: true });
    thief.health = thief.maxHealth = 70;
    thief.model.setHeld('bag');
    victim.say('¡Al ladrón! ¡Mi bolso!', 4);
    victim.persistent = true;
    victim.task = { type: 'stand', face: thief };
    let a = rand() * Math.PI * 2;
    thief.controller = (dt, ped) => {
      a += (rand() - 0.5) * dt;
      const away = Math.atan2(ped.x - pl.x, ped.z - pl.z);
      return { x: ped.x + Math.sin(away + Math.sin(a) * 0.6) * 10, z: ped.z + Math.cos(away + Math.sin(a) * 0.6) * 10, speed: 6.1 };
    };
    const blip = g.blips.add({ x: thief.x, z: thief.z, follow: thief, icon: '●', color: '#ff4040', kind: 'enemy' });
    g.hud.notify('<b>¡Un ladrón!</b> Atrapa al carterista.');
    let t = 60;
    this.event = {
      update: (dt) => {
        t -= dt;
        const caught = !thief.alive || thief.state === 'down';
        if (caught) {
          thief.controller = null;
          thief.model.setHeld(null);
          g.blips.remove(blip);
          const bag = g.pickups.add('cash', thief.x, thief.z, { amount: 0, halo: 0xf2b33d, life: 60 });
          g.hud.notify('Recoge el bolso. ¿Se lo devuelves a la víctima o te lo quedas?');
          this.event = {
            update: () => {
              if (g.pickups.list.includes(bag)) return;
              this.event = {
                update: () => {
                  if (victim.alive && dist2(pl.x, pl.z, victim.x, victim.z) < 2.5) {
                    victim.say('¡Moltes gràcies! Es usted un ángel.', 3);
                    g.economy.add(120, 'Recompensa');
                    g.stats.goodDeeds++;
                    this.finishEvent([thief, victim]);
                  } else if (!victim.alive || dist2(pl.x, pl.z, victim.x, victim.z) > 120) {
                    g.economy.add(220, 'Contenido del bolso');
                    this.finishEvent([thief, victim]);
                  }
                  g.hud.prompt('Devuelve el bolso a la víctima (o aléjate para quedártelo)');
                },
              };
            },
          };
        } else if (t <= 0 || dist2(thief.x, thief.z, pl.x, pl.z) > 160) {
          g.blips.remove(blip);
          g.hud.notify('El ladrón ha escapado.');
          this.finishEvent([thief, victim]);
        }
      },
    };
  }

  lostTourist() {
    const g = this.game, pl = g.player;
    const t = g.peds.nearest(pl.x, pl.z, 40, (p) => p.alive && p.role === 'tourist' && !p.persistent);
    if (!t) return;
    const [name, dx, dz] = rand.pick(DESTINATIONS.filter((d) => dist2(d[1], d[2], pl.x, pl.z) > 300));
    t.persistent = true;
    t.task = { type: 'stand', face: pl };
    t.say(`Excuse me! ${name}?`, 6);
    const blip = g.blips.add({ x: t.x, z: t.z, follow: t, icon: '?', color: '#40e0ff', kind: 'mission' });
    g.hud.notify(`Un turista busca <b>${name}</b>. Llévalo en coche si quieres (acércate con un vehículo).`);
    let stage = 0, time = 40, car = null, marker = null, dp = null;
    this.event = {
      update: (dt) => {
        if (!t.alive) { g.blips.remove(blip); if (marker) g.markers.remove(marker); this.finishEvent([t]); return; }
        if (stage === 0) {
          time -= dt;
          const v = pl.vehicle;
          if (v && !v.isBike && dist2(v.x, v.z, t.x, t.z) < 7 && v.speed < 2) {
            stage = 1; car = v;
            t.state = 'inVehicle'; t.vehicle = v; v.passengers.push(t); t.model.root.removeFromParent(); t.inScene = false;
            dp = g.world.sidewalkPoint(dx, dz);
            marker = g.markers.add(dp.x, dp.z, { color: 0x40e0ff, radius: 4 });
            blip.follow = null; blip.x = dp.x; blip.z = dp.z; blip.route = true;
            g.gps.set(dp.x, dp.z, true);
            g.hud.objective(`Lleva al turista a <b>${name}</b>.`);
          } else if (time <= 0 || dist2(pl.x, pl.z, t.x, t.z) > 90) { g.blips.remove(blip); this.finishEvent([t]); }
        } else if (stage === 1) {
          if (pl.vehicle !== car) { g.peds.ejectFrom(car, t, 'none'); g.blips.remove(blip); g.markers.remove(marker); g.hud.objective(''); g.gps.clear(true); this.finishEvent([t]); return; }
          if (dist2(car.x, car.z, dp.x, dp.z) < 7 && car.speed < 2.5) {
            g.peds.ejectFrom(car, t, 'none');
            t.say('Thank you! Gràcies!', 3);
            g.economy.add(rand.int(60, 180), 'Propina del turista');
            g.blips.remove(blip); g.markers.remove(marker); g.hud.objective(''); g.gps.clear(true);
            g.stats.goodDeeds++;
            this.finishEvent([t]);
          }
        }
      },
    };
  }

  streetFight() {
    const g = this.game, pl = g.player;
    const sp = g.world.sidewalkPoint(pl.x + rand.range(-40, 40), pl.z + rand.range(-40, 40));
    const a = g.peds.create('gang', sp.x, sp.z, { lookKind: 'gang', persistent: true, weapon: 'bat' });
    const b = g.peds.create('civil', sp.x + 2, sp.z, { persistent: true });
    b.brave = true;
    a.task = { type: 'attack', target: b };
    b.task = { type: 'attack', target: a };
    a.say('gang'); b.say('angry');
    let t = 40;
    this.event = { update: (dt) => { t -= dt; if (t <= 0 || !a.alive || !b.alive) { if (a.alive && a.task?.target === b) a.task = null; this.finishEvent([a, b]); } } };
  }

  finishEvent(peds) {
    for (const p of peds) { if (p && !p.removed) { p.persistent = false; p.controller = null; if (p.task && p.task.type === 'stand') p.task = null; } }
    this.game.hud.prompt('');
    this.event = null;
  }

  // -------------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    if (g.input.hit('KeyJ')) this.toggleJob();
    if (this.job) {
      if (this.job.type === 'taxi') this.updateTaxi(dt);
      else if (this.job.type === 'delivery') this.updateDelivery(dt);
      else if (this.job.type === 'vigilante') this.updateVigilante(dt);
    }
    if (this.race) this.updateRace(dt);
    if (this.robbery) this.updateRobbery(dt);
    this.checkJump(dt);
    this.updateEvents(dt);
    this.updateDocks(dt);
    // Estela de los barcos
    for (const v of g.vehicles.list) {
      if (!v.isBoat || v.speed < 3 || dist2(v.x, v.z, g.player.x, g.player.z) > 150) continue;
      if (Math.random() < dt * v.speed * 2) {
        const bx = v.x - v.fx * v.T.len * 0.5, bz = v.z - v.fz * v.T.len * 0.5;
        g.combat.smoke.emit(bx + (Math.random() - 0.5), v.y + 0.1, bz + (Math.random() - 0.5), -v.fz * (Math.random() - 0.5) * 3, 0.5, v.fx * (Math.random() - 0.5) * 3, 1.6, 0.8, 0.95, 0.97, 1, 0.75, 1.5, 0.5);
      }
    }
    // Desguace disponible tras la primera misión de Quim
    const unlocked = g.missions.done.has('quim1');
    this.chop.active = unlocked;
    this.chop.opts.visible = unlocked && !!g.player.vehicle;
    this.chopBlip.hidden = !unlocked;
  }
}
