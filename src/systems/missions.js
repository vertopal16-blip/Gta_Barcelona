// Misiones: marco asíncrono + historia original.
// La campaña es opcional y no lineal: cuatro contactos con encargos que se desbloquean entre sí.

import { rand, dist2, formatMoney } from '../core/utils.js';
import { audio } from '../core/audio.js';
import { PathDriver, PursuitDriver } from '../entities/traffic.js';

class MissionFail extends Error {}

export const CONTACTS = {
  marta: { name: 'Marta Soler', x: -95, z: 222, color: 0xf2b33d, look: { skin: 0xe0ac85, hair: 0x3b2516, shirt: 0x8a1a2a, pants: 0x1e1e1e, shoes: 0x1a1a1a, hairStyle: 1, height: 0.97, build: 0.95 }, blip: 'M', desc: 'Dueña del Bar La Gavina, en el Raval. Conoce a todo el mundo.' },
  quim: { name: 'Quim Ferrer', x: -1010, z: 505, color: 0x40a0ff, look: { skin: 0xc68b5e, hair: 0x8a8a8a, shirt: 0x3a5a8a, pants: 0x22324a, shoes: 0x1a1a1a, hairStyle: 2, height: 1.02, build: 1.15, vest: null }, blip: 'Q', desc: 'Mecánico con un desguace en la Zona Franca. Compra lo que nadie debería vender.' },
  ines: { name: 'Inés Ribas', x: 905, z: -150, color: 0xd060d0, look: { skin: 0xf5d3b8, hair: 0xc8a060, shirt: 0xf0f0f0, pants: 0x1a1a1a, shoes: 0x1a1a1a, hairStyle: 1, height: 1.0, build: 0.92 }, blip: 'I', desc: 'Promotora inmobiliaria en Poblenou. Sonrisa perfecta, métodos discutibles.' },
  dani: { name: 'Dani "Llop"', x: 130, z: 470, color: 0x60c060, look: { skin: 0x8d5a3b, hair: 0x101010, shirt: 0x202020, pants: 0x1e1e1e, shoes: 0xf0f0f0, hairStyle: 2, height: 1.05, build: 1.1 }, blip: 'D', desc: 'Lugarteniente de Els Llops del Port. Contrabando y lealtades cambiantes.' },
};

export const MISSIONS = [
  { id: 'marta1', giver: 'marta', title: 'Benvingut a Barcelona', reward: 250, requires: [], desc: 'Marta necesita a alguien de confianza para un reparto en Gràcia.' },
  { id: 'marta2', giver: 'marta', title: 'Vermut i deutes', reward: 450, requires: ['marta1'], desc: 'Un tal Toni le debe dinero a Marta. Está en la Barceloneta.' },
  { id: 'marta3', giver: 'marta', title: 'La Rambla no dorm', reward: 700, requires: ['marta2'], desc: 'Una banda de carteristas está ahuyentando a los clientes de la Rambla.' },
  { id: 'quim1', giver: 'quim', title: 'Cotxe de luxe', reward: 1500, requires: ['marta1'], desc: 'Quim quiere un Garbí GT aparcado en el Passeig de Gràcia.' },
  { id: 'quim2', giver: 'quim', title: 'Persecució a la Diagonal', reward: 2200, requires: ['quim1'], desc: 'Una furgoneta con piezas robadas a Quim circula por la Diagonal.' },
  { id: 'ines1', giver: 'ines', title: 'Obres a Poblenou', reward: 3000, requires: ['quim1'], desc: 'Inés quiere frenar las obras de un competidor en Poblenou.' },
  { id: 'ines2', giver: 'ines', title: 'Vista al mar', reward: 3500, requires: ['ines1'], desc: 'Lleva a un inversor del Hotel Arts al Castell de Montjuïc. Con cuidado.' },
  { id: 'llop1', giver: 'dani', title: 'Contenidors', reward: 4500, requires: ['marta3', 'quim1'], desc: 'Recupera un paquete de Els Llops en los muelles de la Zona Franca.' },
  { id: 'marta4', giver: 'marta', title: 'Rescat a Poblenou', reward: 2500, requires: ['marta3'], desc: 'Han secuestrado a Pau, el sobrino de Marta, para cobrarle una deuda.' },
  { id: 'quim3', giver: 'quim', title: 'Ral·li de Montjuïc', reward: 3000, requires: ['quim2'], desc: 'Un piloto rival desafía a Quim: dos vueltas al circuito de Montjuïc.' },
  { id: 'dani2', giver: 'dani', title: 'Contraban nocturn', reward: 5000, requires: ['llop1'], desc: 'Recoge un cargamento en alta mar con una lancha y llévalo a la Zona Franca.' },
  { id: 'final', giver: 'dani', title: 'Nit a Montjuïc', reward: 10000, requires: ['ines2', 'llop1'], desc: 'Inés y los Llops han hecho un trato a tus espaldas. Se reúnen en el castillo.' },
];

class Ctx {
  constructor(game, mission, sys) {
    this.game = game; this.mission = mission; this.sys = sys;
    this.cleanup = [];
    this.failChecks = [];
    this.aborted = false;
  }

  check() { if (this.aborted) throw new MissionFail(this.abortReason || 'Misión cancelada'); }

  /** Espera hasta que se cumpla la condición (se comprueba cada frame). */
  until(pred) {
    this.check();
    return new Promise((resolve, reject) => this.sys.waiters.push({ ctx: this, pred, resolve, reject }));
  }

  wait(sec) {
    let t = 0;
    return this.until(() => (t += this.game.dt) >= sec);
  }

  fail(reason) { this.aborted = true; this.abortReason = reason; throw new MissionFail(reason); }
  failIf(pred, reason) { this.failChecks.push({ pred, reason }); }

  objective(text) { this.game.hud.objective(text); }

  async say(who, text, dur = null) {
    const d = dur ?? Math.min(6, 1.8 + text.length * 0.045);
    this.game.hud.subtitle(who, text, d);
    await this.wait(d);
  }

  marker(x, z, opts = {}) {
    const m = this.game.markers.add(x, z, { color: 0xf2b33d, radius: 2.5, ...opts });
    this.cleanup.push(() => this.game.markers.remove(m));
    return m;
  }

  blip(x, z, icon = '◆', label = '', color = '#f2b33d') {
    const b = this.game.blips.add({ x, z, icon, label, color, kind: 'mission', route: true });
    this.cleanup.push(() => this.game.blips.remove(b));
    return b;
  }

  gps(x, z) { this.game.gps.set(x, z, true); this.cleanup.push(() => this.game.gps.clear(true)); }

  /** Ir a un punto (opcionalmente en vehículo). */
  async goTo(x, z, opts = {}) {
    const m = this.marker(x, z, { radius: opts.radius ?? 3, visible: opts.visible });
    const b = this.blip(x, z, opts.icon || '◆', opts.label || '');
    this.game.gps.set(x, z, true);
    if (opts.text) this.objective(opts.text);
    const pl = this.game.player;
    await this.until(() => dist2(pl.x, pl.z, x, z) < (opts.radius ?? 3) + (pl.vehicle ? 2 : 0.5) && (!opts.vehicle || (pl.vehicle && (opts.vehicle === true || opts.vehicle === pl.vehicle))) && (!opts.onFoot || !pl.vehicle) && (!opts.slow || !pl.vehicle || pl.vehicle.speed < 4));
    this.game.markers.remove(m);
    this.game.blips.remove(b);
    this.game.gps.clear(true);
  }

  spawnVehicle(type, x, z, heading = 0, opts = {}) {
    const v = this.game.vehicles.spawn(type, x, z, heading, { ...opts, persistent: true });
    v.mission = this.mission;
    if (!opts.keep) this.cleanup.push(() => { if (!v.removed && v !== this.game.player.vehicle) { v.persistent = false; v.mission = null; } else { v.mission = null; v.persistent = false; } });
    return v;
  }

  spawnPed(role, x, z, opts = {}) {
    const p = this.game.peds.create(role, x, z, { ...opts, persistent: true });
    this.cleanup.push(() => { p.persistent = false; p.controller = null; if (p.alive && p.role === 'gang') p.task = null; });
    return p;
  }

  /** Enemigo que ataca al acercarse. */
  enemy(x, z, weapon = 'pistol', opts = {}) {
    const p = this.spawnPed('gang', x, z, { weapon, lookKind: 'gang', ammo: 200, heading: opts.heading });
    p.health = p.maxHealth = opts.health ?? 110;
    const range = opts.aggro ?? 35;
    p.controller = (dt, ped) => {
      const pl = this.game.player;
      if (dist2(ped.x, ped.z, pl.x, pl.z) < range || ped.health < ped.maxHealth) {
        ped.controller = null;
        ped.task = { type: 'attack', target: pl };
        if (rand() < 0.5) ped.say('gang');
      }
      return null;
    };
    this.game.blips.add({ x, z, follow: p, icon: '●', color: '#ff4040', kind: 'enemy', temp: true });
    return p;
  }

  keep(fn) { this.cleanup.push(fn); }
}

export class Missions {
  constructor(game) {
    this.game = game;
    this.done = new Set();
    this.active = null;
    this.waiters = [];
    this.contactPeds = {};
    this.contactMarkers = {};
  }

  available(m) { return !this.done.has(m.id) && m.requires.every((r) => this.done.has(r)); }
  nextFor(giver) { return MISSIONS.find((m) => m.giver === giver && this.available(m)); }

  setup() {
    const g = this.game;
    for (const [id, c] of Object.entries(CONTACTS)) {
      const sp = g.world.sidewalkPoint(c.x, c.z);
      c.x = sp.x; c.z = sp.z;
      c.blipObj = g.blips.add({ x: c.x, z: c.z, icon: c.blip, label: c.name, color: '#' + c.color.toString(16).padStart(6, '0'), kind: 'contact' });
      c.marker = g.markers.add(c.x, c.z, {
        color: c.color, radius: 1.6,
        prompt: `<kbd>E</kbd> Hablar con ${c.name}`,
        footOnly: true,
        onInteract: () => this.talk(id),
      });
    }
    this.refresh();
  }

  /** Muestra u oculta contactos según haya misiones disponibles. */
  refresh() {
    for (const [id, c] of Object.entries(CONTACTS)) {
      const next = this.nextFor(id);
      const anyDone = MISSIONS.some((m) => m.giver === id && this.done.has(m.id));
      const unlocked = !!next || anyDone;
      c.marker.active = unlocked && !this.active;
      c.marker.opts.visible = !!next && !this.active;
      c.blipObj.hidden = !unlocked;
      c.blipObj.dim = !next;
    }
  }

  talk(id) {
    const g = this.game;
    const c = CONTACTS[id];
    const next = this.nextFor(id);
    if (this.active) return;
    if (!next) { g.hud.subtitle(c.name, rand.pick(['Ahora no tengo nada para ti.', 'Vuelve más tarde.', 'Tranquilo, ya te llamaré.']), 3); return; }
    g.ui.menu({
      title: c.name, text: `${c.desc}<br><br><b>${next.title}</b> — ${next.desc}<br>Recompensa: <b>${formatMoney(next.reward)}</b>`,
      options: [
        { label: 'Aceptar el encargo', action: () => { this.start(next.id); return 'close'; } },
        { label: 'Ahora no', action: () => 'close' },
      ],
    });
  }

  /** Contactos visibles como personajes cuando el jugador está cerca. */
  updateContacts() {
    const g = this.game, pl = g.player;
    for (const [id, c] of Object.entries(CONTACTS)) {
      const near = dist2(pl.x, pl.z, c.x, c.z) < 110;
      let p = this.contactPeds[id];
      if (near && !p && c.marker.active) {
        p = g.peds.create('contact', c.x + 1.2, c.z, { look: { ...c.look }, persistent: true });
        p.invulnerable = true;
        p.task = { type: 'stand', face: pl };
        this.contactPeds[id] = p;
      } else if (p && (!near || !c.marker.active) && !p.missionUse) {
        g.peds.remove(p);
        delete this.contactPeds[id];
      }
    }
  }

  async start(id) {
    const g = this.game;
    const m = MISSIONS.find((x) => x.id === id);
    if (!m || this.active) return;
    const ctx = new Ctx(g, m, this);
    this.active = { m, ctx };
    this.refresh();
    g.hud.big(m.title.toUpperCase(), CONTACTS[m.giver].name, true);
    audio.play('checkpoint');
    try {
      await SCRIPTS[id](ctx, g);
      this.complete(m, ctx);
    } catch (e) {
      if (!(e instanceof MissionFail)) console.error(e);
      this.failMission(m, ctx, e instanceof MissionFail ? e.message : 'Error interno');
    }
  }

  complete(m, ctx) {
    const g = this.game;
    this.end(ctx);
    this.done.add(m.id);
    g.economy.add(m.reward, 'Misión completada');
    g.hud.big('¡MISIÓN SUPERADA!', `${m.title} · +${formatMoney(m.reward)}`, true);
    audio.play('success');
    g.stats.missions++;
    this.refresh();
    g.save.save();
    if (m.id === 'final') setTimeout(() => g.ui.ending(), 3500);
  }

  failMission(m, ctx, reason) {
    const g = this.game;
    this.end(ctx);
    g.hud.big('MISIÓN FALLIDA', reason, false);
    audio.play('fail');
    this.refresh();
  }

  end(ctx) {
    ctx.aborted = true;
    for (const w of this.waiters.filter((w) => w.ctx === ctx)) { /* se descartan */ }
    this.waiters = this.waiters.filter((w) => w.ctx !== ctx);
    for (const fn of ctx.cleanup) { try { fn(); } catch (e) { console.warn(e); } }
    this.game.blips.removeTemp();
    this.game.hud.objective('');
    this.game.hud.timer('');
    this.game.gps.clear(true);
    this.active = null;
    for (const p of Object.values(this.contactPeds)) if (p) p.missionUse = false;
  }

  /** Cancela la misión activa (muerte, detención). */
  abort(reason) {
    if (!this.active) return;
    const { ctx } = this.active;
    ctx.aborted = true;
    ctx.abortReason = reason;
    const ws = this.waiters.filter((w) => w.ctx === ctx);
    this.waiters = this.waiters.filter((w) => w.ctx !== ctx);
    for (const w of ws) w.reject(new MissionFail(reason));
  }

  update() {
    if (this.active) {
      const ctx = this.active.ctx;
      for (const fc of ctx.failChecks) {
        if (fc.pred()) { this.abort(fc.reason); break; }
      }
    }
    for (const w of [...this.waiters]) {
      let ok = false;
      try { ok = w.pred(); } catch (e) { console.error(e); ok = false; }
      if (ok) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.resolve();
      }
    }
    this.updateContacts();
  }
}

// ---------------------------------------------------------------------------
// Guiones de misión
// ---------------------------------------------------------------------------
const roadPoint = (g, x, z) => {
  const ne = g.world.roads.nearestEdge(x, z, 80, (e) => !e.noTraffic);
  return ne ? { x: ne.x, z: ne.z, h: Math.atan2(ne.edge.dx, ne.edge.dz), edge: ne.edge } : { x, z, h: 0 };
};
const parkPoint = (g, x, z) => {
  const ne = g.world.roads.nearestEdge(x, z, 80, (e) => !e.noTraffic);
  if (!ne) return { x, z, h: 0 };
  const e = ne.edge;
  const off = e.w / 2 - 1.3;
  return { x: ne.x - e.dz * off, z: ne.z + e.dx * off, h: Math.atan2(e.dx, e.dz) };
};

const SCRIPTS = {
  async marta4(ctx, g) {
    const pl = g.player;
    await ctx.say('Marta', '¡Se han llevado a Pau, mi sobrino! Unos usureros de Poblenou. Dicen que si no pago, no lo vuelvo a ver.');
    await ctx.say('Marta', 'Lo tienen en una nave abandonada cerca de la Rambla del Poblenou. Tráemelo de vuelta. Por favor.');
    const W = g.world.sidewalkPoint(1100, -200);
    await ctx.goTo(W.x, W.z, { text: 'Ve a la <b>nave abandonada</b> de Poblenou.', radius: 35, visible: false, label: 'Nave' });
    const ws = ['pistol', 'bat', 'smg', 'pistol', 'shotgun'];
    const enemies = ws.map((w, i) => ctx.enemy(W.x + Math.cos(i * 1.3) * 9, W.z + Math.sin(i * 1.3) * 9, w, { aggro: 40 }));
    const pau = ctx.spawnPed('civil', W.x + 2, W.z + 2, { look: { skin: 0xe0ac85, hair: 0x3b2516, shirt: 0xf0f0f0, pants: 0x3a5a8a, shoes: 0xf0f0f0, hairStyle: 0, height: 0.9, build: 0.9 } });
    pau.invulnerable = false;
    pau.health = pau.maxHealth = 200;
    pau.pose = 'cower';
    ctx.failIf(() => !pau.alive, 'Pau ha muerto.');
    ctx.objective('Libera a <b>Pau</b>: acaba con los secuestradores.');
    await ctx.until(() => enemies.every((e) => !e.alive || (e.state === 'down' && e.health < 40)));
    ctx.objective('Desata a <b>Pau</b>.');
    const pb = ctx.blip(pau.x, pau.z, '★', 'Pau', '#40e0ff');
    await ctx.until(() => dist2(pl.x, pl.z, pau.x, pau.z) < 2.5);
    g.blips.remove(pb);
    pau.pose = null;
    pau.controller = null;
    pau.task = { type: 'follow', target: pl, dist: 2 };
    pau.say('¡Gràcies! ¡Sácame de aquí!', 3);
    ctx.objective('Consigue un <b>vehículo</b> y lleva a Pau al <b>Bar La Gavina</b>.');
    await ctx.until(() => pl.vehicle && !pl.vehicle.isBike && dist2(pl.vehicle.x, pl.vehicle.z, pau.x, pau.z) < 7);
    const car = pl.vehicle;
    pau.task = null;
    pau.state = 'inVehicle'; pau.vehicle = car; car.passengers.push(pau); pau.model.root.removeFromParent(); pau.inScene = false;
    ctx.failIf(() => pl.vehicle !== car && dist2(pl.x, pl.z, car.x, car.z) > 30, 'Has abandonado a Pau.');
    const M = CONTACTS.marta;
    await ctx.goTo(M.x, M.z, { text: 'Lleva a Pau al <b>Bar La Gavina</b>.', radius: 7, label: 'La Gavina' });
    g.peds.ejectFrom(car, pau, 'none');
    await ctx.say('Marta', '¡Pau! Ay, Senyor… No sé cómo agradecértelo. Esta casa es tu casa, para siempre.');
  },

  async quim3(ctx, g) {
    const pl = g.player;
    await ctx.say('Quim', 'Un tal "Rata" va diciendo que es el más rápido de Montjuïc. Le he apostado cinco mil a que no.');
    await ctx.say('Quim', 'Te dejo mi Garbí GT. Dos vueltas al circuito. Si ganas, el coche es tuyo.');
    const ring = [];
    for (let i = 0; i <= 20; i++) {
      const a = -2.05 - (i / 20) * Math.PI * 2;
      const p = roadPoint(g, -480 + Math.cos(a) * 238, 330 + Math.sin(a) * 238);
      ring.push({ x: p.x, z: p.z });
    }
    const s0 = ring[0], s1 = ring[1];
    const h = Math.atan2(s1.x - s0.x, s1.z - s0.z);
    const mine = ctx.spawnVehicle('sports', s0.x + Math.cos(h) * 2.5, s0.z - Math.sin(h) * 2.5, h, { color: 0xf0c010, keep: true });
    const rival = ctx.spawnVehicle('sports', s0.x - Math.cos(h) * 2.5, s0.z + Math.sin(h) * 2.5, h, { color: 0x101010 });
    rival.driver = g.peds.createDriver(rival);
    ctx.blip(mine.x, mine.z, '🚗', 'Tu coche');
    await ctx.goTo(s0.x - Math.sin(h) * 8, s0.z - Math.cos(h) * 8, { text: 'Ve a la <b>línea de salida</b> en Montjuïc.', radius: 25, visible: false, label: 'Salida' });
    ctx.objective('Sube al <b>Garbí GT</b> amarillo.');
    await ctx.until(() => pl.vehicle === mine);
    pl.controlsLocked = true;
    for (const n of ['3', '2', '1']) { g.hud.big(n, '', true, 0.8); audio.play('checkpoint'); await ctx.wait(1); }
    g.hud.big('¡YA!', '', true, 0.8);
    pl.controlsLocked = false;
    const lap = ring.slice(1);
    const route = [...lap, ...lap];
    let rivalDone = false;
    rival.ai = new PathDriver(rival, g, route, { speed: 30, reach: 12, aggressive: true, onDone: () => { rivalDone = true; } });
    ctx.failIf(() => rivalDone, '"Rata" ha cruzado la meta antes que tú.');
    ctx.failIf(() => pl.vehicle !== mine, 'Has abandonado el coche.');
    for (let i = 0; i < route.length; i++) {
      const p = route[i];
      await ctx.goTo(p.x, p.z, { radius: 9, vehicle: mine, text: `Vuelta ${i < lap.length ? 1 : 2}/2 · control ${(i % lap.length) + 1}/${lap.length}`, label: 'Control' });
      audio.play('checkpoint');
    }
    rival.ai = null;
    mine.playerOwned = true;
    await ctx.say('Quim (teléfono)', '¡JA! ¡Cinco mil para el bote! El Garbí es tuyo, te lo has ganado.');
  },

  async dani2(ctx, g) {
    const pl = g.player;
    await ctx.say('Dani', 'Esta noche llega un barco con mercancía. No puede atracar: lo recogemos en alta mar.');
    await ctx.say('Dani', 'Hay una lancha esperándote en el Port Olímpic. Recoge la carga en la boya y llévala al muelle de la Zona Franca.');
    if (!g.world.sky.isNight()) g.world.sky.time = 23;
    const dock = g.activities.docks.find((d) => d.name === 'Port Olímpic') || g.activities.docks[0];
    const boat = ctx.spawnVehicle('speedboat', dock.x, dock.z + 6, 0, { color: 0x1a1a1a, keep: true });
    boat.health = boat.maxHealth = 1600;
    ctx.blip(boat.x, boat.z, '⚓', 'Lancha');
    ctx.gps(boat.x, boat.z);
    ctx.objective('Ve a la <b>lancha</b> del Port Olímpic.');
    await ctx.until(() => pl.vehicle === boat);
    ctx.failIf(() => boat.destroyed, 'La lancha ha quedado destrozada.');
    await ctx.goTo(700, 900, { vehicle: boat, radius: 10, text: 'Navega hasta la <b>boya</b> en alta mar.', label: 'Boya' });
    g.hud.notify('Carga recogida. ¡Una patrullera se acerca!');
    const pb = ctx.spawnVehicle('policeboat', 760, 980, Math.PI);
    pb.driver = g.peds.createDriver(pb);
    pb.siren = true;
    const chase = { kind: 'boatchase', update: (dt) => {
      const tx = boat.x + boat.vx * 0.6, tz = boat.z + boat.vz * 0.6;
      const d = Math.hypot(tx - pb.x, tz - pb.z);
      const diff = Math.atan2(tx - pb.x, tz - pb.z) - pb.heading;
      const w = Math.atan2(Math.sin(diff), Math.cos(diff));
      pb.input.steer = Math.max(-1, Math.min(1, -w * 2));
      pb.input.throttle = d > 6 ? 1 : 0.4;
      pb.input.brake = 0;
    } };
    pb.ai = chase;
    const pbb = g.blips.add({ x: pb.x, z: pb.z, follow: pb, icon: '●', color: '#3060ff', kind: 'enemy', temp: true });
    ctx.keep(() => { g.blips.remove(pbb); pb.ai = null; pb.persistent = false; pb.siren = false; });
    g.police.applyCrime({ add: 0, min: 2, label: 'Contrabando' }, boat.x, boat.z);
    await ctx.goTo(-600, 960, { vehicle: boat, radius: 14, text: 'Lleva la carga al <b>muelle de la Zona Franca</b>.', label: 'Muelle' });
    await ctx.say('Dani (radio)', 'Carga entregada. Mis chicos se ocupan del resto. Buen trabajo, mariner.');
    if (g.police.level > 0) { ctx.objective('Pierde a la <b>policía</b>.'); await ctx.until(() => g.police.level === 0); }
  },

  async marta1(ctx, g) {
    const pl = g.player;
    const C = CONTACTS.marta;
    await ctx.say('Marta', 'Así que tú eres el nuevo. Pareces más perdido que un turista en el Gòtic.');
    await ctx.say('Marta', 'Necesito que lleves este paquete a un amigo en la Plaça del Sol, en Gràcia. Sin abrirlo.');
    await ctx.say('Marta', 'Coge mi moto. Y nada de hacer el loco: aquí los Mossos no tienen sentido del humor.');
    const p = parkPoint(g, C.x + 10, C.z);
    const bike = ctx.spawnVehicle('scooter', p.x, p.z, p.h, { color: 0xf2b33d });
    ctx.objective('Sube a la <b>moto de Marta</b> (pulsa <kbd>F</kbd>).');
    const b = ctx.blip(bike.x, bike.z, '🛵', 'Moto de Marta');
    await ctx.until(() => pl.vehicle === bike);
    g.blips.remove(b);
    ctx.failIf(() => bike.destroyed, 'La moto de Marta ha quedado destrozada.');
    let t = 240;
    ctx.failIf(() => (t -= g.dt) <= 0, 'Se acabó el tiempo.');
    ctx.keep(() => g.hud.timer(''));
    const tick = setInterval(() => g.hud.timer(Math.max(0, t)), 250);
    ctx.keep(() => clearInterval(tick));
    await ctx.goTo(-75, -607, { text: 'Lleva el paquete a la <b>Plaça del Sol</b> (Gràcia).', radius: 6, label: 'Plaça del Sol' });
    clearInterval(tick);
    g.hud.timer('');
    await ctx.say('Jordi', 'Ah, el paquete de Marta. Toma, esto es para ti. Dile que el vermut del domingo sigue en pie.');
    await ctx.say('Marta (teléfono)', 'Bien hecho. Quédate la moto si quieres, pero cuídala. Pásate por el bar cuando quieras más trabajo.');
    bike.playerOwned = true;
  },

  async marta2(ctx, g) {
    const pl = g.player;
    await ctx.say('Marta', 'Toni me debe ochocientos euros desde Sant Joan. Dice que no tiene, pero cada tarde está de cañas en la Barceloneta.');
    await ctx.say('Marta', 'Habla con él. Si se pone tonto… convéncelo. Pero no lo mates, los muertos no pagan.');
    const spot = g.world.sidewalkPoint(430, 560);
    await ctx.goTo(spot.x, spot.z, { text: 'Busca a <b>Toni</b> en la Barceloneta.', radius: 18, visible: false, label: 'Toni' });
    const toni = ctx.spawnPed('civil', spot.x, spot.z, { look: { skin: 0xe0ac85, hair: 0x101010, shirt: 0xe8c030, pants: 0x3a5a8a, shoes: 0xf0f0f0, hairStyle: 0, height: 1.0, build: 1.1 } });
    toni.health = toni.maxHealth = 160;
    toni.brave = false;
    const tb = g.blips.add({ x: spot.x, z: spot.z, follow: toni, icon: '●', color: '#ff4040', kind: 'enemy', temp: true });
    ctx.objective('Habla con <b>Toni</b>.');
    await ctx.until(() => dist2(pl.x, pl.z, toni.x, toni.z) < 8);
    toni.say('¡Otra vez no! ¡Dile a Marta que el lunes!', 3);
    // Huye por las calles
    const fleeTo = [g.world.sidewalkPoint(520, 470), g.world.sidewalkPoint(330, 440), g.world.sidewalkPoint(200, 380), g.world.sidewalkPoint(100, 330)];
    let i = 0;
    toni.controller = (dt, ped) => {
      const p = fleeTo[i];
      if (dist2(ped.x, ped.z, p.x, p.z) < 3) i = (i + 1) % fleeTo.length;
      return { x: p.x, z: p.z, speed: 6.4 };
    };
    ctx.objective('¡Toni huye! <b>Atrápalo</b> y dale un escarmiento (sin matarlo).');
    ctx.failIf(() => !toni.alive, 'Toni ha muerto. Los muertos no pagan.');
    ctx.failIf(() => dist2(pl.x, pl.z, toni.x, toni.z) > 220, 'Toni se ha escapado.');
    await ctx.until(() => toni.health < 105 || toni.state === 'down');
    toni.controller = null;
    toni.task = { type: 'surrender', t: 999 };
    toni.say('¡Vale, vale! ¡Toma tu dinero!', 3);
    g.blips.remove(tb);
    await ctx.wait(1.5);
    const cash = g.pickups.add('cash', toni.x + 1.2, toni.z, { amount: 0, halo: 0xf2b33d, life: 999 });
    ctx.objective('Recoge el <b>dinero</b>.');
    await ctx.until(() => !g.pickups.list.includes(cash));
    toni.task = null;
    await ctx.say('Marta (teléfono)', '¿Ha pagado? Sabía que eras de fiar. Lo tuyo va en el sobre.');
  },

  async marta3(ctx, g) {
    const pl = g.player;
    await ctx.say('Marta', 'Una banda de carteristas se ha adueñado de la parte baja de la Rambla. Asustan a los turistas, y sin turistas no hay negocio.');
    await ctx.say('Marta', 'Toma esta pistola. Espero que no tengas que usarla… pero espero.');
    pl.giveWeapon('pistol', 48);
    g.hud.notify('Has recibido una <b>Pistola</b>. Apunta con <kbd>clic derecho</kbd> y dispara con <kbd>clic izquierdo</kbd>.');
    const c = { x: 0, z: 330 };
    await ctx.goTo(c.x + 12, c.z, { text: 'Ve a la <b>parte baja de la Rambla</b>.', radius: 25, visible: false, label: 'Carteristas' });
    const enemies = [
      ctx.enemy(-6, 320, 'knife', { aggro: 25 }),
      ctx.enemy(5, 345, 'bat', { aggro: 25 }),
      ctx.enemy(-3, 360, 'pistol', { aggro: 30 }),
      ctx.enemy(8, 300, 'knife', { aggro: 25 }),
    ];
    ctx.objective('Acaba con la <b>banda de carteristas</b> (4).');
    await ctx.until(() => enemies.every((e) => !e.alive || e.state === 'down' && e.health < 40));
    ctx.objective('');
    await ctx.say('Marta (teléfono)', 'Me dicen que la Rambla vuelve a ser la Rambla. La Armeria del Raval te atenderá a partir de ahora. Diles que vas de mi parte.');
    if (g.police.level > 0) {
      ctx.objective('Pierde a la <b>policía</b>.');
      await ctx.until(() => g.police.level === 0);
    }
  },

  async quim1(ctx, g) {
    const pl = g.player;
    await ctx.say('Quim', '¿Te manda Marta? Bien. Tengo un cliente que quiere un Garbí GT. Rojo, a poder ser.');
    await ctx.say('Quim', 'Hay uno aparcado en el Passeig de Gràcia, frente a las tiendas caras. Tráemelo sin un rasguño y sin la pasma detrás.');
    const p = parkPoint(g, 12, -420);
    const car = ctx.spawnVehicle('sports', p.x, p.z, p.h, { color: 0xd81e1e, locked: true });
    car.parked = true;
    const b = ctx.blip(car.x, car.z, '🚗', 'Garbí GT');
    ctx.objective('Roba el <b>Garbí GT</b> del Passeig de Gràcia.');
    g.gps.set(car.x, car.z, true);
    ctx.failIf(() => car.destroyed, 'El Garbí GT ha quedado destrozado.');
    await ctx.until(() => pl.vehicle === car);
    g.blips.remove(b);
    g.police.applyCrime({ add: 0, min: 2, label: 'Robo de vehículo de lujo' }, car.x, car.z);
    const Q = CONTACTS.quim;
    const drop = roadPoint(g, Q.x + 15, Q.z);
    ctx.objective('Lleva el coche al <b>desguace de Quim</b>. Pierde a la policía antes de entrar.');
    let ok = false;
    while (!ok) {
      await ctx.goTo(drop.x, drop.z, { radius: 6, vehicle: car, text: g.police.level ? 'Pierde a la <b>policía</b> y entra en el <b>desguace</b>.' : 'Lleva el coche al <b>desguace</b>.', label: 'Desguace' });
      if (g.police.level > 0) { g.hud.notify('¡No traigas a la policía al desguace!'); ctx.objective('Pierde a la <b>policía</b>.'); await ctx.until(() => g.police.level === 0); continue; }
      ok = true;
    }
    const health = car.health / car.maxHealth;
    pl.exitVehicle(true);
    car.mission = { noEnter: 'Este coche ya es de Quim.' };
    if (health < 0.5) {
      await ctx.say('Quim', '¿Esto es un Garbí GT o un acordeón? Te pagaré, pero menos.');
      g.economy.add(-600, 'Descuento por daños');
    } else await ctx.say('Quim', 'Precioso. Mi cliente estará encantado. A partir de ahora te compro cualquier coche que me traigas.');
    g.vehicles.remove(car);
  },

  async quim2(ctx, g) {
    const pl = g.player;
    await ctx.say('Quim', 'Unos listos me han robado piezas. Las llevan en una furgoneta blanca que ahora mismo baja por la Diagonal.');
    await ctx.say('Quim', 'Destrózala lo justo para que pare. Recupera la caja y tráemela.');
    const start = roadPoint(g, -700, -620);
    const van = ctx.spawnVehicle('van', start.x, start.z, start.h, { color: 0xf0f0f0 });
    van.driver = g.peds.createDriver(van);
    van.driver.persistent = true;
    van.health = van.maxHealth = 1300;
    const route = [];
    for (let x = -700; x <= 600; x += 100) { const p = roadPoint(g, x, -760 + (x + 1000) * 0.4122); route.push({ x: p.x, z: p.z }); }
    route.push(...[[640, -30], [640, 300], [300, 425], [-140, 430], [-500, 690], [-1000, 670]].map(([x, z]) => roadPoint(g, x, z)));
    van.ai = null;
    const vb = ctx.blip(van.x, van.z, '●', 'Furgoneta');
    vb.follow = van;
    ctx.objective('Intercepta la <b>furgoneta</b> en la Diagonal.');
    ctx.failIf(() => van.removed, 'La furgoneta ha desaparecido.');
    await ctx.until(() => dist2(pl.x, pl.z, van.x, van.z) < 120);
    van.ai = new PathDriver(van, g, route, { speed: 24, aggressive: false });
    ctx.objective('¡Te han visto! <b>Daña la furgoneta</b> hasta que se detenga.');
    ctx.failIf(() => dist2(pl.x, pl.z, van.x, van.z) > 320, 'La furgoneta ha escapado.');
    ctx.failIf(() => van.destroyed, 'Has destruido la furgoneta y las piezas con ella.');
    await ctx.until(() => van.health / van.maxHealth < 0.45 || van.ai?.i >= route.length - 1);
    if (van.health / van.maxHealth >= 0.45) ctx.fail('La furgoneta ha escapado.');
    van.ai = null;
    van.input = { throttle: 0, brake: 1, steer: 0, handbrake: 1 };
    if (van.driver && van.driver.alive) g.peds.ejectFrom(van, van.driver, 'flee');
    g.blips.remove(vb);
    const box = g.pickups.add('weapon', van.x - van.fx * 4, van.z - van.fz * 4, { weapon: 'bat', ammo: 0, halo: 0xf2b33d, life: 999 });
    ctx.objective('Recoge la <b>caja de piezas</b>.');
    await ctx.until(() => !g.pickups.list.includes(box));
    g.hud.notify('Caja recuperada (y un bate que había dentro).');
    const Q = CONTACTS.quim;
    await ctx.goTo(Q.x, Q.z, { text: 'Lleva la caja a <b>Quim</b>.', radius: 4, label: 'Quim' });
    await ctx.say('Quim', 'Mis piezas… Eres un crack. Esa gente no volverá a meterse conmigo. Gracias a ti.');
  },

  async ines1(ctx, g) {
    const pl = g.player;
    await ctx.say('Inés', 'Encantada. Quim me ha hablado muy bien de ti. Yo construyo el futuro de Poblenou… y alguien quiere construirlo antes que yo.');
    await ctx.say('Inés', 'Mi competidor tiene maquinaria en tres solares. Si esa maquinaria… dejara de funcionar, las obras se retrasarían meses.');
    const sites = [[1020, 120], [780, -260], [1120, -420]];
    const targets = [];
    for (const [x, z] of sites) {
      const p = g.world.sidewalkPoint(x, z);
      const t = ctx.spawnVehicle(rand() < 0.5 ? 'truck' : 'van', p.x + 4, p.z, rand() * 6, { color: 0xe8a020, locked: true });
      t.parked = true;
      t.mission = { noEnter: 'La maquinaria está cerrada. Destrúyela.' };
      targets.push(t);
      const b = g.blips.add({ x: t.x, z: t.z, follow: t, icon: '✖', color: '#ff8020', kind: 'enemy', temp: true });
      t.blip = b;
      ctx.enemy(p.x - 3, p.z + 3, 'bat', { aggro: 20 });
    }
    ctx.objective('Destruye la <b>maquinaria</b> de las tres obras (0/3).');
    await ctx.until(() => {
      const n = targets.filter((t) => t.destroyed).length;
      ctx.objective(`Destruye la <b>maquinaria</b> de las tres obras (${n}/3).`);
      for (const t of targets) if (t.destroyed && t.blip) { g.blips.remove(t.blip); t.blip = null; }
      return n === 3;
    });
    if (g.police.level > 0) { ctx.objective('Pierde a la <b>policía</b>.'); await ctx.until(() => g.police.level === 0); }
    await ctx.say('Inés (teléfono)', 'Qué lástima, esos accidentes laborales… Te he transferido tu parte. Hablamos pronto.');
  },

  async ines2(ctx, g) {
    const pl = g.player;
    await ctx.say('Inés', 'Un inversor muy importante se aloja en el Hotel Arts. Quiere ver la ciudad desde Montjuïc antes de firmar.');
    await ctx.say('Inés', 'Recógelo, llévalo al castillo y conduce como si llevaras huevos. Nada de policía, nada de golpes.');
    const pick = roadPoint(g, 760, 350);
    if (!pl.vehicle) {
      const p = parkPoint(g, CONTACTS.ines.x + 10, CONTACTS.ines.z);
      const car = ctx.spawnVehicle('sedan', p.x, p.z, p.h, { color: 0x101010 });
      ctx.blip(car.x, car.z, '🚗', 'Berlina');
      ctx.objective('Sube a la <b>berlina</b> de Inés.');
      await ctx.until(() => pl.vehicle === car);
    }
    await ctx.goTo(pick.x, pick.z, { vehicle: true, slow: true, radius: 5, text: 'Recoge al <b>inversor</b> en el Hotel Arts.', label: 'Inversor' });
    const car = pl.vehicle;
    const inv = g.peds.createDriver(car);
    inv.role = 'civil';
    car.passengers.push(inv);
    ctx.keep(() => { car.passengers = car.passengers.filter((p) => p !== inv); g.peds.remove(inv); });
    await ctx.say('Mr. Lindqvist', 'Good evening. Inés says you know the city. Let us see this famous castle.');
    const startHealth = car.health;
    let t = 270;
    ctx.failIf(() => pl.vehicle !== car, 'Has abandonado al inversor.');
    ctx.failIf(() => (startHealth - car.health) / car.maxHealth > 0.25, 'El inversor se ha bajado, aterrorizado por tu conducción.');
    ctx.failIf(() => g.police.level > 0, 'El inversor no quiere saber nada de la policía.');
    ctx.failIf(() => (t -= g.dt) <= 0, 'El inversor ha perdido la paciencia.');
    const tick = setInterval(() => g.hud.timer(Math.max(0, t)), 250);
    ctx.keep(() => { clearInterval(tick); g.hud.timer(''); });
    const top = roadPoint(g, -480 + 50, 330 - 20);
    await ctx.goTo(top.x, top.z, { vehicle: true, slow: true, radius: 8, text: 'Lleva al inversor al <b>Castell de Montjuïc</b>.', label: 'Castell' });
    clearInterval(tick);
    await ctx.say('Mr. Lindqvist', 'Magnificent. The sea, the port, the whole city… Tell Inés we have a deal.');
  },

  async llop1(ctx, g) {
    const pl = g.player;
    await ctx.say('Dani', 'Marta dice que tienes agallas. Necesito agallas. Unos albaneses se han quedado con un paquete nuestro en los muelles.');
    await ctx.say('Dani', 'Está en un contenedor rojo en la Zona Franca. Ve, cógelo y vuelve. Si alguien se mete en medio… ya sabes.');
    const P = { x: -760, z: 905 };
    await ctx.goTo(P.x, P.z - 40, { text: 'Ve a los <b>muelles de la Zona Franca</b>.', radius: 30, visible: false, label: 'Contenedores' });
    const enemies = [];
    const weapons = ['pistol', 'smg', 'pistol', 'shotgun', 'pistol', 'smg'];
    for (let i = 0; i < 6; i++) enemies.push(ctx.enemy(P.x - 40 + i * 16, P.z - 18 + (i % 2) * 22, weapons[i], { aggro: 45 }));
    const pkg = g.pickups.add('weapon', P.x + 6, P.z + 2, { weapon: 'smg', ammo: 60, halo: 0xf2b33d, life: 9999 });
    ctx.blip(P.x + 6, P.z + 2, '📦', 'Paquete');
    ctx.objective('Recupera el <b>paquete</b>.');
    await ctx.until(() => !g.pickups.list.includes(pkg));
    g.hud.notify('Paquete recuperado (con un subfusil de regalo).');
    const D = CONTACTS.dani;
    await ctx.goTo(D.x, D.z, { text: 'Lleva el paquete a <b>Dani</b> en el Port Vell.', radius: 4, label: 'Dani' });
    await ctx.say('Dani', 'Ni lo has abierto. Me gustas. Los Llops no olvidan a los amigos… ni a los enemigos.');
  },

  async final(ctx, g) {
    const pl = g.player;
    await ctx.say('Dani', 'Tenemos un problema. Inés ha comprado a mi jefe. Van a repartirse el puerto y el barrio… y tú sabes demasiado.');
    await ctx.say('Dani', 'Esta noche se reúnen en el Castell de Montjuïc. Si quieres seguir vivo en esta ciudad, termina con esto.');
    if (!g.world.sky.isNight()) {
      await ctx.say('Dani', 'Esperaremos a que oscurezca.');
      g.world.sky.time = 22;
    }
    const top = roadPoint(g, -480 + 45, 330 - 30);
    await ctx.goTo(top.x, top.z, { text: 'Ve al <b>Castell de Montjuïc</b>.', radius: 40, visible: false, label: 'Castell' });
    const cx = -480, cz = 330;
    const guards = [];
    const ws = ['rifle', 'smg', 'pistol', 'shotgun', 'smg', 'rifle', 'pistol', 'smg'];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      guards.push(ctx.enemy(cx + Math.cos(a) * 22, cz + Math.sin(a) * 22, ws[i], { aggro: 60, health: 130 }));
    }
    ctx.objective('Elimina a los <b>guardaespaldas</b> (8).');
    await ctx.until(() => {
      const n = guards.filter((e) => e.alive).length;
      ctx.objective(`Elimina a los <b>guardaespaldas</b> (${n} restantes).`);
      return n === 0;
    });
    await ctx.say('Inés (radio)', '¡Maldito seas! ¡Esta ciudad es mía!');
    const p = roadPoint(g, cx + 40, cz + 30);
    const car = ctx.spawnVehicle('sports', p.x, p.z, p.h, { color: 0xf0f0f0 });
    car.driver = g.peds.createDriver(car);
    car.health = car.maxHealth = 1400;
    const route = g.routePoints(car.x, car.z, 640, -84).concat(g.routePoints(640, -84, 1100, 160));
    car.ai = new PathDriver(car, g, route, { speed: 34, aggressive: true });
    const b = ctx.blip(car.x, car.z, '★', 'Inés');
    b.follow = car;
    ctx.objective('¡Inés huye! <b>Destruye su coche</b>.');
    ctx.failIf(() => dist2(pl.x, pl.z, car.x, car.z) > 380, 'Inés ha escapado.');
    await ctx.until(() => car.destroyed || (car.driver && !car.driver.alive));
    await ctx.wait(2);
    await ctx.say('Dani (teléfono)', 'Se acabó. El puerto vuelve a respirar, y el barrio también. Barcelona es tuya… o tú eres de Barcelona. Ya no sé.');
    if (g.police.level > 0) { ctx.objective('Pierde a la <b>policía</b>.'); await ctx.until(() => g.police.level === 0); }
  },
};

export { PursuitDriver };
