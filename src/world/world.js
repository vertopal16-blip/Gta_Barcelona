// Ensambla el mundo: trazado, red viaria, colisiones, edificios, monumentos y cielo.

import * as THREE from 'three';
import { buildLayout } from './layout.js';
import { RoadNetwork } from './roads.js';
import { CollisionWorld } from './colliders.js';
import { City } from './city.js';
import { Landmarks } from './landmarks.js';
import { Sky } from './sky.js';
import { getMaterials, setNightFactor } from './geom.js';
import { groundHeight, isWater, districtAt, DISTRICTS, MAP } from './terrain.js';

export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
  }

  /** Construcción por fases (permite mostrar progreso). */
  async build(progress = () => {}) {
    const step = async (label, pct, fn) => {
      progress(label, pct);
      await new Promise((r) => setTimeout(r, 0));
      fn();
    };
    await step('Trazando calles de Barcelona…', 0.05, () => { this.layout = buildLayout(); });
    await step('Conectando barrios…', 0.15, () => { this.roads = new RoadNetwork(this.layout.segs); });
    await step('Asfaltando avenidas…', 0.25, () => {
      this.collision = new CollisionWorld();
      this.materials = getMaterials();
      this.scene.add(this.roads.buildMeshes(this.materials));
    });
    await step('Levantando el Eixample…', 0.4, () => {
      this.city = new City(this.scene, this.layout, this.roads, this.collision);
      this.city.build();
    });
    await step('Construyendo monumentos…', 0.7, () => {
      this.landmarks = new Landmarks(this.scene, this.collision, this.roads);
      this.landmarks.build();
    });
    await step('Encendiendo el sol mediterráneo…', 0.85, () => {
      this.sky = new Sky(this.scene, this.renderer);
      // Luces reales de las farolas más cercanas (de noche)
      this.lampLights = [];
      for (let i = 0; i < 8; i++) {
        const l = new THREE.PointLight(0xffb36b, 0, 26, 1.6);
        this.scene.add(l);
        this.lampLights.push(l);
      }
      this.lampT = 0;
    });
    this.MAP = MAP;
  }

  groundHeight(x, z) { return groundHeight(x, z); }
  isWater(x, z) { return isWater(x, z); }
  district(x, z) { return DISTRICTS[districtAt(x, z)]; }
  districtId(x, z) { return districtAt(x, z); }

  update(dt, focus, simTime) {
    this.sky.update(dt, focus);
    const n = this.sky.night;
    setNightFactor(smooth(n));
    this.city.setNight(n);
    this.city.updateSignals(simTime);
    this.landmarks.update(dt, this.sky.time, n);
    this.updateLampLights(dt, focus, n);
    if (this.city.water) {
      const m = this.materials.water.map;
      m.offset.x = (m.offset.x + dt * 0.004) % 1;
      m.offset.y = (m.offset.y + dt * 0.0025) % 1;
      const nm = this.materials.water.normalMap;
      nm.offset.x = (nm.offset.x + dt * 0.02) % 1;
      nm.offset.y = (nm.offset.y - dt * 0.013) % 1;
    }
  }

  updateLampLights(dt, focus, night) {
    this.lampT -= dt;
    const on = night > 0.35;
    if (this.lampT <= 0 && focus) {
      this.lampT = 0.4;
      const lamps = this.city.lampPositions || [];
      const near = [];
      for (const l of lamps) {
        const d = Math.abs(l[0] - focus.x) + Math.abs(l[1] - focus.z);
        if (d < 90) near.push([d, l]);
      }
      near.sort((a, b) => a[0] - b[0]);
      this.lampLights.forEach((L, i) => {
        const e = near[i];
        L.userData.off = !e;
        if (!e) return;
        const [x, z, a] = e[1];
        L.position.set(x + Math.sin(a) * 1.3, groundHeight(x, z) + 5.8, z + Math.cos(a) * 1.3);
      });
    }
    for (const L of this.lampLights) L.intensity = on && !L.userData.off ? 120 * Math.min(1, (night - 0.35) * 3) : 0;
  }

  /** Punto en la acera más cercana a (x,z). */
  sidewalkPoint(x, z, side = null) {
    const ne = this.roads.nearestEdge(x, z, 200, (e) => !e.noTraffic);
    if (!ne) return { x, z };
    const e = ne.edge;
    const px = -e.dz, pz = e.dx;
    let s = side;
    if (s === null) s = ((x - ne.x) * px + (z - ne.z) * pz) >= 0 ? 1 : -1;
    const off = e.w / 2 + Math.max(1, e.sidewalk * 0.6);
    return { x: ne.x + px * off * s, z: ne.z + pz * off * s, edge: e, heading: Math.atan2(e.dx, e.dz) };
  }
}

function smooth(x) { return x * x * (3 - 2 * x); }
export { THREE };
