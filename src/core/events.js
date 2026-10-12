// Bus de eventos global: permite que los sistemas se comuniquen sin acoplarse.
// Eventos principales:
//  'crime'      {type, x, z, severity, victim}
//  'gunshot'    {x, z, shooter}
//  'explosion'  {x, z, radius}
//  'pedKilled'  {ped, killer, x, z}
//  'vehicleDestroyed' {vehicle}
//  'notify'     {text, time}
//  'moneyChanged' {money, delta}
//  'missionComplete' {id}

class EventBus {
  constructor() { this.handlers = new Map(); }
  on(name, fn) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(fn);
    return () => this.handlers.get(name).delete(fn);
  }
  emit(name, data) {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) fn(data);
  }
}

export const events = new EventBus();
