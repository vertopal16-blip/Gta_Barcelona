// Economía: dinero, tiendas, propiedades (pisos francos), negocios con ingresos,
// desguace, concesionario, taller de pintura y atracos a comercios.

import { formatMoney, rand, dist2 } from '../core/utils.js';
import { audio } from '../core/audio.js';
import { events } from '../core/events.js';
import { WEAPONS } from './combat.js';
import { VEHICLE_TYPES } from '../entities/vehicle.js';

export const SHOPS = [
  { id: 'armeria-raval', type: 'weapons', name: 'Armeria del Raval', x: -205, z: 330, unlock: 'marta3' },
  { id: 'armeria-sants', type: 'weapons', name: 'Caça i Pesca Sants', x: -820, z: -360 },
  { id: 'super-gracia', type: 'store', name: 'Supermercat Gràcia', x: -40, z: -700 },
  { id: 'super-eixample', type: 'store', name: 'Colmado Eixample', x: 200, z: -210 },
  { id: 'super-barceloneta', type: 'store', name: 'Badulaque Barceloneta', x: 420, z: 520 },
  { id: 'super-poblenou', type: 'store', name: 'Super 22@', x: 880, z: 60 },
  { id: 'super-sants', type: 'store', name: 'Fruiteria Sants', x: -680, z: -100 },
  { id: 'moda', type: 'clothes', name: 'Moda Passeig', x: 12, z: -240 },
  { id: 'moda-born', type: 'clothes', name: 'Vintage Born', x: 330, z: 220 },
  { id: 'taller-poblenou', type: 'garage', name: 'Taller Exprés Poblenou', x: 800, z: 20 },
  { id: 'taller-sants', type: 'garage', name: 'Taller Exprés Sants', x: -1000, z: -300 },
  { id: 'taller-gracia', type: 'garage', name: 'Taller Exprés Gràcia', x: 150, z: -650 },
  { id: 'concessionari', type: 'dealer', name: 'Concessionari Diagonal', x: -330, z: -470 },
];

export const PROPERTIES = [
  { id: 'pensio', name: 'Habitació a la Pensió Sants', x: -700, z: -150, price: 0, desc: 'Una habitación diminuta junto a la estación. Es lo que hay.' },
  { id: 'gracia', name: 'Pis a Gràcia', x: -120, z: -760, price: 15000, desc: 'Piso con balcón en una calle tranquila de Gràcia.' },
  { id: 'barceloneta', name: 'Àtic a la Barceloneta', x: 360, z: 600, price: 32000, desc: 'Ático con terraza a dos minutos de la playa.' },
  { id: 'poblenou', name: 'Loft a Poblenou', x: 1000, z: 250, price: 48000, desc: 'Antigua fábrica reconvertida en loft. Garaje incluido.' },
  { id: 'lescorts', name: 'Casa a Les Corts', x: -1040, z: -880, price: 120000, desc: 'Casa con jardín en la zona alta. Has llegado lejos.' },
];

export const BUSINESSES = [
  { id: 'gavina', name: 'Bar La Gavina', x: -95, z: 225, price: 20000, income: 650, desc: 'El bar de Marta en el Raval. Vermuts, tapas y rumores.' },
  { id: 'xiringuito', name: 'Xiringuito Sant Sebastià', x: 500, z: 470, price: 26000, income: 900, desc: 'Chiringuito en la playa de la Barceloneta.' },
  { id: 'tallerpn', name: 'Taller Mecànic 22@', x: 1060, z: -20, price: 38000, income: 1200, desc: 'Taller de coches en Poblenou. Trabajo legal… casi siempre.' },
  { id: 'club', name: 'Sala Port Olímpic', x: 880, z: 410, price: 85000, income: 3200, desc: 'Discoteca frente al mar. Dinero rápido, problemas rápidos.' },
];

export const OUTFITS = [
  { name: 'Recién llegado', price: 0, look: { shirt: 0x2e4a6e, pants: 0x2a2a30, shoes: 0x1a1a1a, hat: null } },
  { name: 'Turista despistado', price: 80, look: { shirt: 0xf04848, pants: 0xd0c8b0, shoes: 0xf0f0f0, hat: 0xf0f0f0 } },
  { name: 'Barcelonès de barri', price: 150, look: { shirt: 0x2f6a4a, pants: 0x3a5a8a, shoes: 0xf0f0f0, hat: null } },
  { name: 'Traje de negocios', price: 900, look: { shirt: 0x1a1a1a, pants: 0x1a1a1a, shoes: 0x3a2010, hat: null } },
  { name: 'Ropa de playa', price: 120, look: { shirt: 0xf0d040, pants: 0x3a6ad8, shoes: 0xd9a07a, hat: null } },
  { name: 'Calle oscura', price: 350, look: { shirt: 0x202020, pants: 0x1e1e1e, shoes: 0x111111, hat: 0x111111 } },
  { name: 'Culer de corazón', price: 220, look: { shirt: 0x1d3d8f, pants: 0xa01d3a, shoes: 0xf0f0f0, hat: null } },
];

const DEALER = ['compact', 'sedan', 'suv', 'sports', 'scooter', 'moto'];
const DEALER_PRICE = { compact: 9000, sedan: 14000, suv: 22000, sports: 65000, scooter: 2500, moto: 18000 };

export class Economy {
  constructor(game) {
    this.game = game;
    this.money = 300;
    this.owned = new Set(['pensio']);
    this.businesses = new Set();
    this.robbedDay = {};
    this.lastIncomeDay = 0;
    this.day = 1;
    this.markers = [];
    this.garage = {}; // propiedad -> {type, color}
  }

  add(amount, reason = '') {
    this.money += amount;
    this.game.stats.earned += Math.max(0, amount);
    this.game.hud.money(this.money, amount);
    if (reason && Math.abs(amount) >= 1) this.game.hud.notify(`${amount >= 0 ? '+' : ''}${formatMoney(amount)} <small>${reason}</small>`);
    events.emit('moneyChanged', { money: this.money, delta: amount });
  }

  spend(amount, reason = '') {
    if (this.money < amount) { this.game.hud.notify('No tienes suficiente dinero.'); audio.play('fail'); return false; }
    this.money -= amount;
    this.game.hud.money(this.money, -amount);
    if (reason) this.game.hud.notify(`-${formatMoney(amount)} <small>${reason}</small>`);
    audio.play('cash');
    return true;
  }

  /** Coloca los marcadores de comercios y propiedades en las aceras. */
  setup() {
    const g = this.game;
    for (const s of SHOPS) {
      const p = g.world.sidewalkPoint(s.x, s.z);
      s.x = p.x; s.z = p.z;
      const color = { weapons: 0xe04040, store: 0x40c060, clothes: 0xd060d0, garage: 0x40a0ff, dealer: 0xf0a020 }[s.type];
      const m = g.markers.add(s.x, s.z, {
        color, radius: s.type === 'garage' || s.type === 'dealer' ? 3 : 1.3,
        prompt: `<kbd>E</kbd> ${s.name}`,
        onInteract: () => this.openShop(s),
      });
      s.marker = m;
      g.blips.add({ x: s.x, z: s.z, icon: { weapons: '🔫', store: '🛒', clothes: '👕', garage: '🔧', dealer: '🚗' }[s.type], label: s.name, kind: 'shop' });
    }
    for (const p of PROPERTIES) {
      const sp = g.world.sidewalkPoint(p.x, p.z);
      p.x = sp.x; p.z = sp.z;
      p.marker = g.markers.add(p.x, p.z, {
        color: 0x40e0e0, radius: 1.3,
        prompt: `<kbd>E</kbd> ${p.name}`,
        onInteract: () => this.openProperty(p),
      });
      p.blip = g.blips.add({ x: p.x, z: p.z, icon: '🏠', label: p.name, kind: 'property', dim: !this.owned.has(p.id) });
    }
    for (const b of BUSINESSES) {
      const sp = g.world.sidewalkPoint(b.x, b.z);
      b.x = sp.x; b.z = sp.z;
      b.marker = g.markers.add(b.x, b.z, {
        color: 0xf0e040, radius: 1.3,
        prompt: `<kbd>E</kbd> ${b.name}`,
        onInteract: () => this.openBusiness(b),
      });
      b.blip = g.blips.add({ x: b.x, z: b.z, icon: '💼', label: b.name, kind: 'business', dim: !this.businesses.has(b.id) });
    }
  }

  refreshBlips() {
    for (const p of PROPERTIES) if (p.blip) p.blip.dim = !this.owned.has(p.id);
    for (const b of BUSINESSES) if (b.blip) b.blip.dim = !this.businesses.has(b.id);
  }

  /** Ingresos diarios de los negocios (a las 8:00). */
  update() {
    const sky = this.game.world.sky;
    if (sky.time >= 8 && sky.time < 8.5 && this.lastIncomeDay !== this.day) {
      this.lastIncomeDay = this.day;
      let total = 0;
      for (const b of BUSINESSES) if (this.businesses.has(b.id)) total += b.income;
      if (total > 0) this.add(total, 'Ingresos de tus negocios');
    }
    if (sky.time < 0.05 && !this.dayFlip) { this.day++; this.dayFlip = true; }
    if (sky.time > 1) this.dayFlip = false;
  }

  openShop(s) {
    const g = this.game;
    if (s.unlock && !g.missions.done.has(s.unlock)) { g.hud.notify('Cerrado. Quizá alguien te recomiende más adelante.'); return; }
    switch (s.type) {
      case 'weapons': return this.weaponShop(s);
      case 'store': return this.store(s);
      case 'clothes': return this.clothes(s);
      case 'garage': return this.garageShop(s);
      case 'dealer': return this.dealer(s);
    }
  }

  weaponShop(s) {
    const g = this.game, pl = g.player;
    const opts = [];
    for (const id of ['bat', 'knife', 'pistol', 'shotgun', 'smg', 'rifle']) {
      const W = WEAPONS[id];
      const have = !!pl.weapons[id];
      opts.push({ label: have ? `${W.name} (ya la tienes)` : W.name, price: have ? null : W.price, disabled: have, action: () => { if (this.spend(W.price, W.name)) { pl.giveWeapon(id, W.ammoPack || 0); g.stats.weaponsBought++; } return 'stay'; } });
      if (have && W.ranged) opts.push({ label: `  Munición ${W.name} ×${W.ammoPack}`, price: W.ammoPrice * W.ammoPack, action: () => { if (this.spend(W.ammoPrice * W.ammoPack, 'Munición')) pl.giveWeapon(id, W.ammoPack); return 'stay'; } });
    }
    opts.push({ label: 'Chaleco antibalas', price: 600, action: () => { if (pl.armor >= 100) g.hud.notify('Ya llevas chaleco.'); else if (this.spend(600, 'Chaleco')) pl.armor = 100; return 'stay'; } });
    this.robOption(s, opts);
    g.ui.menu({ title: s.name, text: '«Aquí no hacemos preguntas. Tú tampoco.»', options: opts });
  }

  store(s) {
    const g = this.game, pl = g.player;
    const opts = [
      { label: 'Bocadillo de jamón', price: 6, action: () => { if (this.spend(6)) pl.health = Math.min(pl.maxHealth, pl.health + 25); return 'stay'; } },
      { label: 'Bebida isotónica (recupera aguante)', price: 3, action: () => { if (this.spend(3)) pl.stamina = 100; return 'stay'; } },
      { label: 'Botiquín completo', price: 60, action: () => { if (this.spend(60)) pl.health = pl.maxHealth; return 'stay'; } },
      { label: 'Plano de la ciudad (revela coleccionables cercanos)', price: 150, action: () => { if (this.spend(150)) g.activities.revealPanots(s.x, s.z, 600); return 'close'; } },
    ];
    this.robOption(s, opts);
    g.ui.menu({ title: s.name, text: 'Abierto 24 horas. «¿Algo más?»', options: opts });
  }

  robOption(s, opts) {
    const g = this.game, pl = g.player;
    const today = this.robbedDay[s.id] === this.day;
    opts.push({
      label: today ? 'Atracar (ya atracado hoy)' : 'Atracar el local (requiere arma de fuego)',
      disabled: today,
      danger: true,
      action: () => {
        if (!pl.weapon.ranged) { g.hud.notify('Necesitas un arma de fuego en la mano.'); return 'close'; }
        this.robbedDay[s.id] = this.day;
        g.ui.close();
        g.activities.startRobbery(s);
        return 'close';
      },
    });
  }

  clothes(s) {
    const g = this.game, pl = g.player;
    const opts = OUTFITS.map((o) => ({
      label: o.name, price: o.price || null,
      action: () => { if (o.price === 0 || this.spend(o.price, o.name)) { pl.setLook(o.look); g.police.level > 0 && g.police.unseenT > 2 && g.police.level <= 2 && (g.police.evadeT += 6); } return 'stay'; },
    }));
    g.ui.menu({ title: s.name, text: 'Cambiar de ropa también ayuda a pasar desapercibido.', options: opts });
  }

  garageShop(s) {
    const g = this.game, pl = g.player;
    const v = pl.vehicle;
    if (!v) { g.hud.notify('Trae un vehículo al taller.'); return; }
    const dmg = 1 - v.health / v.maxHealth;
    const repairCost = Math.round(50 + dmg * 600);
    const opts = [
      { label: `Reparar (${Math.round(dmg * 100)}% daño)`, price: repairCost, disabled: dmg < 0.01, action: () => { if (this.spend(repairCost, 'Reparación')) v.repair(); return 'stay'; } },
      {
        label: 'Pintura nueva + matrícula falsa (pierdes a la policía si no te ven)', price: 250,
        action: () => {
          if (g.police.level > 0 && g.police.copsSee(pl.x, pl.z, 60)) { g.hud.notify('¡Te están viendo! No podemos trabajar así.'); return 'close'; }
          if (this.spend(250, 'Pintura')) {
            const T = VEHICLE_TYPES[v.type];
            const colors = T.colors.filter((c) => c !== v.color);
            if (colors.length) { v.color = rand.pick(colors); const old = v.root; old.removeFromParent(); v.buildModel(); g.scene.add(v.root); }
            v.repair();
            g.police.clear();
          }
          return 'close';
        },
      },
    ];
    g.ui.menu({ title: s.name, text: '«Lo dejamos como nuevo. Sin preguntas.»', options: opts });
  }

  dealer(s) {
    const g = this.game;
    const opts = DEALER.map((t) => ({
      label: VEHICLE_TYPES[t].name, price: DEALER_PRICE[t],
      action: () => {
        if (!this.spend(DEALER_PRICE[t], VEHICLE_TYPES[t].name)) return 'stay';
        const p = g.world.sidewalkPoint(s.x + 8, s.z);
        const ne = g.world.roads.nearestEdge(p.x, p.z, 50, (e) => !e.noTraffic);
        const v = g.vehicles.spawn(t, ne ? ne.x : p.x, ne ? ne.z : p.z, ne ? Math.atan2(ne.edge.dx, ne.edge.dz) : 0);
        v.playerOwned = true; v.persistent = true;
        g.ownedVehicle = v;
        g.hud.notify(`Tu <b>${VEHICLE_TYPES[t].name}</b> te espera en la calle. Guárdalo en el garaje de un piso para conservarlo.`);
        return 'close';
      },
    }));
    g.ui.menu({ title: s.name, text: 'Vehículos nuevos, papeles en regla (por una vez).', options: opts });
  }

  openProperty(p) {
    const g = this.game;
    if (!this.owned.has(p.id)) {
      g.ui.menu({
        title: p.name, text: p.desc, options: [
          { label: 'Comprar', price: p.price, action: () => { if (this.spend(p.price, p.name)) { this.owned.add(p.id); this.refreshBlips(); g.stats.properties++; g.hud.big('PROPIEDAD ADQUIRIDA', p.name, true); audio.play('success'); g.save.save(); } return 'close'; } },
        ],
      });
      return;
    }
    const pl = g.player;
    const stored = this.garage[p.id];
    const opts = [
      { label: 'Guardar partida', action: () => { g.save.save(); g.hud.notify('Partida guardada.'); return 'close'; } },
      { label: 'Dormir hasta la mañana (recupera salud)', action: () => { g.sleep(p); return 'close'; } },
    ];
    if (pl.vehicle && !pl.vehicle.T.police) opts.push({ label: `Guardar ${pl.vehicle.T.name} en el garaje`, action: () => { this.garage[p.id] = { type: pl.vehicle.type, color: pl.vehicle.color }; g.hud.notify('Vehículo guardado.'); g.save.save(); return 'close'; } });
    if (stored && !pl.vehicle) opts.push({ label: `Sacar ${VEHICLE_TYPES[stored.type].name} del garaje`, action: () => { g.spawnStoredVehicle(p, stored); return 'close'; } });
    g.ui.menu({ title: p.name, text: 'Tu refugio. Aquí puedes guardar la partida.', options: opts });
  }

  openBusiness(b) {
    const g = this.game;
    if (!this.businesses.has(b.id)) {
      g.ui.menu({
        title: b.name, text: `${b.desc}<br>Ingresos: <b>${formatMoney(b.income)}</b> al día.`, options: [
          { label: 'Comprar negocio', price: b.price, action: () => { if (this.spend(b.price, b.name)) { this.businesses.add(b.id); this.refreshBlips(); g.hud.big('NEGOCIO ADQUIRIDO', b.name, true); audio.play('success'); g.save.save(); } return 'close'; } },
        ],
      });
      return;
    }
    g.ui.menu({ title: b.name, text: `Es tuyo. Genera ${formatMoney(b.income)} cada día a las 8:00.`, options: [{ label: 'Cerrar', action: () => 'close' }] });
  }

  /** Valor de venta de un coche en el desguace. */
  chopValue(v) {
    return Math.round((v.T.value || 500) * (0.35 + 0.65 * v.health / v.maxHealth));
  }
}

export { dist2 };
