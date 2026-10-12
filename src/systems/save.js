// Guardado y carga en localStorage.

const KEY = 'barcelona-open-world-save-v1';

export class SaveSystem {
  constructor(game) { this.game = game; }

  static exists() {
    try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
  }

  save() {
    const g = this.game, pl = g.player;
    const data = {
      v: 1,
      time: Date.now(),
      player: { x: pl.vehicle ? pl.vehicle.x : pl.x, z: pl.vehicle ? pl.vehicle.z : pl.z, health: pl.health, armor: pl.armor, look: pl.look, weapons: pl.weapons, current: pl.current },
      money: g.economy.money,
      owned: [...g.economy.owned],
      businesses: [...g.economy.businesses],
      garage: g.economy.garage,
      day: g.economy.day,
      lastIncomeDay: g.economy.lastIncomeDay,
      missions: [...g.missions.done],
      panots: [...g.activities.panotFound],
      jumps: [...g.activities.jumpsDone],
      clock: g.world.sky.time,
      stats: g.stats,
      settings: g.settings,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(data, (k, v) => (v === Infinity ? '__inf' : v)));
      return true;
    } catch (e) { console.warn('No se pudo guardar', e); return false; }
  }

  load() {
    let data;
    try { data = JSON.parse(localStorage.getItem(KEY), (k, v) => (v === '__inf' ? Infinity : v)); } catch (e) { return false; }
    if (!data) return false;
    const g = this.game, pl = g.player;
    pl.placeAt(data.player.x, data.player.z);
    pl.health = data.player.health || 100;
    pl.armor = data.player.armor || 0;
    if (data.player.look) pl.setLook(data.player.look);
    pl.weapons = data.player.weapons || pl.weapons;
    pl.selectWeapon(data.player.current in pl.weapons ? data.player.current : 'fists');
    g.economy.money = data.money;
    g.economy.owned = new Set(data.owned);
    g.economy.businesses = new Set(data.businesses);
    g.economy.garage = data.garage || {};
    g.economy.day = data.day || 1;
    g.economy.lastIncomeDay = data.lastIncomeDay || 0;
    g.missions.done = new Set(data.missions);
    g.activities.panotFound = new Set(data.panots);
    g.activities.jumpsDone = new Set(data.jumps || []);
    g.world.sky.time = data.clock ?? 9;
    Object.assign(g.stats, data.stats || {});
    Object.assign(g.settings, data.settings || {});
    return true;
  }
}
