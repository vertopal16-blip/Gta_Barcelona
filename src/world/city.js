// Generación de la ciudad: edificios por barrio, mobiliario urbano, suelo, mar y horizonte.

import * as THREE from 'three';
import { makeRng, jitterColor, clamp } from '../core/utils.js';
import { GeoBuilder, ensureCCW, getMaterials } from './geom.js';
import { groundHeight, isWater, isBeach, districtAt, MAP, SEA_LEVEL, montjuicDist, coastZ } from './terrain.js';
import { zoneAt, rectHitsZone, ZONES } from './layout.js';

// Estilo arquitectónico por barrio
const STYLE = {
  eixample: { facades: [['modernista', 0.65], ['residencial', 0.35]], h: [19, 27], colors: [0xd8c3a5, 0xe3cfb0, 0xc9a77c, 0xe8d8c0, 0xd6b38a, 0xbfa58a, 0xeadbc8, 0xc7b299, 0xd9b9a0], roof: 0xa59d90 },
  gotic: { facades: [['gotic', 1]], h: [11, 21], colors: [0xb5a58e, 0xa89880, 0xc2b49c, 0x9e8f7a, 0xd0c2a8, 0xb9a284], roof: 0x9a6a50, front: [7, 13], depth: 14 },
  raval: { facades: [['residencial', 0.6], ['gotic', 0.4]], h: [12, 24], colors: [0xc98e6b, 0xd6a77e, 0xb87b5c, 0xe0c09a, 0xc2b097, 0xd9cdb8, 0xe6b98f], roof: 0x8f7a68, front: [8, 15], depth: 15 },
  born: { facades: [['gotic', 0.8], ['residencial', 0.2]], h: [12, 20], colors: [0xc6a882, 0xb69878, 0xd4b892, 0xa98d6c, 0xcdb79a], roof: 0x9a6a50, front: [7, 14], depth: 14 },
  gracia: { facades: [['residencial', 0.8], ['modernista', 0.2]], h: [9, 17], colors: [0xe8c88f, 0xf0dcb4, 0xd9a86c, 0xe6b8a2, 0xf2e3c6, 0xcf9f7a, 0xe8d0a0], roof: 0xa0634a, front: [8, 15], depth: 13 },
  barceloneta: { facades: [['residencial', 1]], h: [10, 16], colors: [0xf2e4c4, 0xe9c7a0, 0xd8e2e6, 0xf0d0c0, 0xe4d6b8, 0xcfe0d8], roof: 0x9c8b78, front: [7, 12], depth: 16 },
  poblenou: { facades: [['industrial', 0.6], ['modern', 0.4]], h: [7, 13], colors: [0xa0553b, 0x9a4f36, 0xb36a4c, 0x8c4a35, 0xb88a6a], roof: 0x6d6a66, front: [14, 30], depth: 22 },
  vilaolimpica: { facades: [['modern', 0.5], ['residencial', 0.5]], h: [15, 28], colors: [0xe8e2d6, 0xd2c8b8, 0xbfc9cf, 0xd8b8a0], roof: 0x9a9690, front: [14, 26], depth: 16 },
  sants: { facades: [['residencial', 1]], h: [14, 26], colors: [0xd8c8b0, 0xc8b49a, 0xbfae98, 0xe0d0b8, 0xcfb8a0], roof: 0x8f877d, front: [9, 16], depth: 14 },
  lescorts: { facades: [['modern', 0.5], ['residencial', 0.5]], h: [18, 40], colors: [0xd0d4d8, 0xc0b8a8, 0xe0dcd0, 0xb8c4cc], roof: 0x8f8f8f, front: [14, 26], depth: 16 },
  poblesec: { facades: [['residencial', 1]], h: [12, 20], colors: [0xd9b48f, 0xc9a07a, 0xe6cba8, 0xd0b59a], roof: 0x9a7a62, front: [8, 14], depth: 13 },
  zonafranca: { facades: [['industrial', 1]], h: [9, 14], colors: [0x8a8f96, 0x9aa3ab, 0x6f7a84, 0xb0b6bb, 0x7f8c6a, 0x8f7f6f], roof: 0x5f6266, front: [40, 80], depth: 40 },
};

function pickW(rng, pairs) {
  let t = 0;
  for (const p of pairs) t += p[1];
  let r = rng() * t;
  for (const p of pairs) { r -= p[1]; if (r <= 0) return p[0]; }
  return pairs[0][0];
}

export class City {
  constructor(scene, layout, roads, collision) {
    this.scene = scene;
    this.layout = layout;
    this.roads = roads;
    this.collision = collision;
    this.mat = getMaterials();
    this.rng = makeRng(4242);
    this.group = new THREE.Group();
    this.group.name = 'city';
    scene.add(this.group);
    this.buildings = [];
    this.chunks = new Map();
    this.lampHeads = null;
    this.signalLights = [];
  }

  chunk(x, z) {
    const CH = 300;
    const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
    let c = this.chunks.get(k);
    if (!c) {
      c = { roof: new GeoBuilder(), plain: new GeoBuilder(), facades: {} };
      this.chunks.set(k, c);
    }
    return c;
  }

  facadeBuilder(x, z, style) {
    const c = this.chunk(x, z);
    if (!c.facades[style]) c.facades[style] = new GeoBuilder();
    return c.facades[style];
  }

  build() {
    this.buildGround();
    this.buildWater();
    for (const g of this.layout.grids) {
      if (g.district !== 'eixample') continue;
      for (const cell of g.cells) this.eixampleBlock(cell);
    }
    this.frontage();
    for (const g of this.layout.grids) {
      if (g.district === 'eixample') continue;
      for (const cell of g.cells) this.genericBlock(cell, g);
    }
    this.buildProps();
    this.buildBackdrop();
    this.flush();
  }

  // -------------------------------------------------------------------------
  // Edificios
  // -------------------------------------------------------------------------
  /** Comprueba si un polígono es edificable y devuelve la base. */
  _validLot(x0, z0, x1, z1, minClear = 0.4) {
    const st = this.stats || (this.stats = {});
    const d = districtAt((x0 + x1) / 2, (z0 + z1) / 2);
    const rej = (r) => { st[d + ':' + r] = (st[d + ':' + r] || 0) + 1; return null; };
    if (x1 - x0 < 4 || z1 - z0 < 4) return rej('small');
    if (this.roads.rectClearance(x0, z0, x1, z1) < minClear) return rej('road');
    if (rectHitsZone(x0, z0, x1, z1, 1)) return rej('zone');
    const hs = [];
    for (const [x, z] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [(x0 + x1) / 2, (z0 + z1) / 2]]) {
      if (isWater(x, z) || isBeach(x, z)) return rej('water');
      hs.push(groundHeight(x, z));
    }
    const lo = Math.min(...hs), hi = Math.max(...hs);
    if (hi - lo > 7) return rej('slope');
    st[d + ':ok'] = (st[d + ':ok'] || 0) + 1;
    return { lo, hi };
  }

  addBuilding(poly, base, height, style, color, district, opts = {}) {
    poly = ensureCCW(poly);
    let cx = 0, cz = 0;
    for (let i = 0; i < poly.length; i += 2) { cx += poly[i]; cz += poly[i + 1]; }
    cx /= poly.length / 2; cz /= poly.length / 2;
    const y0 = base.lo - 0.6;
    const y1 = base.hi + height;
    const fb = this.facadeBuilder(cx, cz, style);
    const ch = this.chunk(cx, cz);
    const roofColor = opts.roof !== undefined ? opts.roof : STYLE[district]?.roof ?? 0x999088;
    // Planta baja más oscura (comercios) + resto de fachada
    const gf = Math.min(4.2, height * 0.3);
    ch.plain.prism(poly, y0, base.lo + gf, opts.groundColor ?? jitterColor(0x5a5048, this.rng, 0.2), { roofBuilder: null, roof: false });
    fb.prism(poly, base.lo + gf, y1, color, { roofBuilder: ch.roof, roofColor, vOffset: 0, uOffset: this.rng() * 30 });
    // Cornisa
    if (opts.cornice !== false && height > 10) {
      const grown = growPoly(poly, 0.35);
      ch.plain.prism(grown, y1 - 0.5, y1, jitterColor(color, this.rng, 0.1), { roof: false });
    }
    // Elementos de cubierta
    if (opts.roofStuff !== false && this.rng() < 0.45) {
      const bx = cx + this.rng.range(-2, 2), bz = cz + this.rng.range(-2, 2);
      ch.roof.box(bx, y1, bz, this.rng.range(2, 4), this.rng.range(1.5, 3), this.rng.range(2, 4), 0x8c8a86);
    }
    this.collision.addPoly(poly, y0, y1, 'building');
    const b = { poly, cx, cz, y0, y1, district, style };
    this.buildings.push(b);
    return b;
  }

  /** Manzana del Eixample: octógono con chaflanes y patio interior. */
  eixampleBlock(cell) {
    // Ajusta cada lado hasta dejar sitio a calle + acera
    let x0 = cell.x0 + 9.5, x1 = cell.x1 - 9.5, z0 = cell.z0 + 9.5, z1 = cell.z1 - 9.5;
    const R = this.roads;
    for (let k = 0; k < 12 && R.rectClearance(x0, z0 + 12, x0 + 1, z1 - 12) < 0.3; k++) x0 += 1;
    for (let k = 0; k < 12 && R.rectClearance(x1 - 1, z0 + 12, x1, z1 - 12) < 0.3; k++) x1 -= 1;
    for (let k = 0; k < 12 && R.rectClearance(x0 + 12, z0, x1 - 12, z0 + 1) < 0.3; k++) z0 += 1;
    for (let k = 0; k < 12 && R.rectClearance(x0 + 12, z1 - 1, x1 - 12, z1) < 0.3; k++) z1 -= 1;
    const W = x1 - x0, H = z1 - z0;
    if (W < 16 || H < 16) return;
    const rng = this.rng;
    const S = STYLE.eixample;
    const D = Math.min(13, W / 3, H / 3);
    const c = 6.5;
    const blockH = rng.range(S.h[0], S.h[1]);
    const pieces = [];
    // Esquinas achaflanadas
    pieces.push([x0 + c, z0, x0 + D, z0, x0 + D, z0 + D, x0, z0 + D, x0, z0 + c]);
    pieces.push([x1 - D, z0, x1 - c, z0, x1, z0 + c, x1, z0 + D, x1 - D, z0 + D]);
    pieces.push([x1 - D, z1 - D, x1, z1 - D, x1, z1 - c, x1 - c, z1, x1 - D, z1]);
    pieces.push([x0, z1 - D, x0 + D, z1 - D, x0 + D, z1, x0 + c, z1, x0, z1 - c]);
    // Lados divididos en fincas
    const splitSide = (a, b) => {
      const len = b - a;
      const n = Math.max(1, Math.round(len / rng.range(9, 15)));
      const cuts = [a];
      for (let i = 1; i < n; i++) cuts.push(a + (len * i) / n + rng.range(-1.5, 1.5));
      cuts.push(b);
      return cuts;
    };
    let cuts = splitSide(x0 + D, x1 - D);
    for (let i = 0; i < cuts.length - 1; i++) {
      pieces.push([cuts[i], z0, cuts[i + 1], z0, cuts[i + 1], z0 + D, cuts[i], z0 + D]);
      pieces.push([cuts[i], z1 - D, cuts[i + 1], z1 - D, cuts[i + 1], z1, cuts[i], z1]);
    }
    cuts = splitSide(z0 + D, z1 - D);
    for (let i = 0; i < cuts.length - 1; i++) {
      pieces.push([x0, cuts[i], x0 + D, cuts[i], x0 + D, cuts[i + 1], x0, cuts[i + 1]]);
      pieces.push([x1 - D, cuts[i], x1, cuts[i], x1, cuts[i + 1], x1 - D, cuts[i + 1]]);
    }
    for (const p of pieces) {
      let px0 = Infinity, px1 = -Infinity, pz0 = Infinity, pz1 = -Infinity;
      for (let i = 0; i < p.length; i += 2) {
        px0 = Math.min(px0, p[i]); px1 = Math.max(px1, p[i]);
        pz0 = Math.min(pz0, p[i + 1]); pz1 = Math.max(pz1, p[i + 1]);
      }
      const base = this._validLot(px0, pz0, px1, pz1, 0.2);
      if (!base) continue;
      const style = pickW(rng, S.facades);
      const h = clamp(blockH + rng.range(-3.5, 3.5), 14, 32);
      this.addBuilding(p, base, h, style, jitterColor(rng.pick(S.colors), rng, 0.05), 'eixample');
    }
    // Patio interior: suelo verde
    const ch = this.chunk((x0 + x1) / 2, (z0 + z1) / 2);
    const y = groundHeight((x0 + x1) / 2, (z0 + z1) / 2) + 0.05;
    ch.plain.polygonFlat(ensureCCW([x0 + D, z0 + D, x1 - D, z0 + D, x1 - D, z1 - D, x0 + D, z1 - D]), y, 0x7b8f5a);
  }

  /** ¿El polígono se solapa con algún edificio ya colocado? */
  overlapsBuilding(poly, margin = 0.4) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]);
      z0 = Math.min(z0, poly[i + 1]); z1 = Math.max(z1, poly[i + 1]);
    }
    for (const c of this.collision.query(x0 - margin, z0 - margin, x1 + margin, z1 + margin)) {
      if (c.tag !== 'building') continue;
      if (convexOverlap(poly, c.poly, margin)) return true;
    }
    return false;
  }

  /** Valida un polígono orientado (fachadas a la calle). */
  _validPoly(poly) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]);
      z0 = Math.min(z0, poly[i + 1]); z1 = Math.max(z1, poly[i + 1]);
    }
    if (this.roads.polyClearance(poly) < 0.25) return null;
    if (rectHitsZone(x0, z0, x1, z1, 0.5)) return null;
    const hs = [];
    for (let i = 0; i < poly.length; i += 2) {
      const x = poly[i], z = poly[i + 1];
      if (isWater(x, z) || isBeach(x, z)) return null;
      hs.push(groundHeight(x, z));
    }
    const lo = Math.min(...hs), hi = Math.max(...hs);
    if (hi - lo > 6) return null;
    if (this.overlapsBuilding(poly)) return null;
    return { lo, hi };
  }

  /** Edificios alineados con cada calle: fachadas continuas en tramas irregulares. */
  frontage() {
    const FRONT_DISTRICTS = new Set(['gotic', 'raval', 'born', 'gracia', 'barceloneta', 'poblesec', 'sants', 'poblenou', 'lescorts', 'vilaolimpica']);
    const R = this.roads;
    const rng = this.rng;
    for (const e of R.edges) {
      if (e.type === 'mountain' || e.type === 'highway') continue;
      const A = R.nodes[e.a], B = R.nodes[e.b];
      for (const side of [-1, 1]) {
        let pos = (A.radius || 4) + e.sidewalk + 1;
        const end = e.len - (B.radius || 4) - e.sidewalk - 1;
        let guard = 0;
        while (pos < end - 4 && guard++ < 60) {
          const mx = A.x + e.dx * pos, mz = A.z + e.dz * pos;
          const dist = districtAt(mx - e.dz * side * 12, mz + e.dx * side * 12);
          if (!FRONT_DISTRICTS.has(dist)) { pos += 8; continue; }
          const S = STYLE[dist];
          const f = Math.min(end - pos, rng.range(S.front[0], S.front[1]));
          if (f < 5) break;
          const d = rng.range(S.depth * 0.75, S.depth * 1.15);
          const off = e.w / 2 + e.sidewalk + 0.45 + d / 2 + (e.type === 'promenade' ? 5 : 0);
          const cx = A.x + e.dx * (pos + f / 2) - e.dz * off * side;
          const cz = A.z + e.dz * (pos + f / 2) + e.dx * off * side;
          const ang = Math.atan2(e.dx, e.dz);
          let poly = rectPolyLocal(cx, cz, d, f, ang);
          let base = this._validPoly(poly);
          let usedF = f;
          if (!base && f > 7) {
            // Reintento con una finca más estrecha y menos profunda
            usedF = f * 0.55;
            const d2 = d * 0.7, off2 = off - d / 2 + d2 / 2;
            const cx2 = A.x + e.dx * (pos + usedF / 2) - e.dz * off2 * side;
            const cz2 = A.z + e.dz * (pos + usedF / 2) + e.dx * off2 * side;
            poly = rectPolyLocal(cx2, cz2, d2, usedF, ang);
            base = this._validPoly(poly);
          }
          if (base) {
            let style = pickW(rng, S.facades);
            let h = rng.range(S.h[0], S.h[1]);
            let color = jitterColor(rng.pick(S.colors), rng, 0.05);
            if (style === 'modern' && (dist === 'poblenou' || dist === 'lescorts') && rng() < 0.3) {
              h = rng.range(30, 70);
              color = jitterColor(rng.pick([0xc8d4dc, 0xa8b8c4, 0xe0e4e8, 0x9fb0bc]), rng, 0.04);
            }
            this.addBuilding(poly, base, h, style, color, dist);
            pos += usedF + rng.range(0, 0.3);
          } else {
            pos += 1.5;
          }
        }
      }
    }
  }

  /** Manzanas genéricas: subdivisión en fincas según el estilo del barrio. */
  genericBlock(cell, g) {
    const S = STYLE[cell.district] || STYLE.sants;
    const rng = this.rng;
    const m = g.w / 2 + (g.type === 'narrow' ? 1.3 : g.type === 'street' ? 3.5 : 2.5) + 0.7;
    let x0 = cell.x0 + m, x1 = cell.x1 - m, z0 = cell.z0 + m, z1 = cell.z1 - m;
    if (x1 - x0 < 6 || z1 - z0 < 6) return;
    const lots = [];
    const front = S.front || [10, 16];
    const depth = S.depth || 14;
    const subdivide = (a0, b0, a1, b1, d) => {
      const w = a1 - a0, h = b1 - b0;
      if (d > 8) { lots.push([a0, b0, a1, b1]); return; }
      const long = Math.max(w, h), short = Math.min(w, h);
      if (short > depth * 2.3) {
        // Dos filas (fachadas a calles opuestas)
        if (w >= h) { const mz = (b0 + b1) / 2; subdivide(a0, b0, a1, mz, d + 1); subdivide(a0, mz, a1, b1, d + 1); }
        else { const mx = (a0 + a1) / 2; subdivide(a0, b0, mx, b1, d + 1); subdivide(mx, b0, a1, b1, d + 1); }
        return;
      }
      if (long > front[1]) {
        const t = rng.range(0.35, 0.65);
        if (w >= h) { const mx = a0 + w * t; subdivide(a0, b0, mx, b1, d + 1); subdivide(mx, b0, a1, b1, d + 1); }
        else { const mz = b0 + h * t; subdivide(a0, b0, a1, mz, d + 1); subdivide(a0, mz, a1, b1, d + 1); }
        return;
      }
      lots.push([a0, b0, a1, b1]);
    };
    // Zona Franca: naves con patio de maniobras
    if (cell.district === 'zonafranca') {
      x0 += 6; x1 -= 6; z0 += 6; z1 -= 6;
    }
    subdivide(x0, z0, x1, z1, 0);
    for (let [a0, b0, a1, b1] of lots) {
      let base = null;
      for (let k = 0; k < 4 && !base; k++) {
        base = this._validLot(a0, b0, a1, b1);
        if (!base) { a0 += 1.2; b0 += 1.2; a1 -= 1.2; b1 -= 1.2; }
      }
      if (!base) continue;
      if (this.overlapsBuilding([a0, b0, a1, b0, a1, b1, a0, b1])) continue;
      let style = pickW(rng, S.facades);
      let h = rng.range(S.h[0], S.h[1]);
      let color = jitterColor(rng.pick(S.colors), rng, 0.05);
      // Torres de oficinas del 22@ y Les Corts
      if (style === 'modern' && (cell.district === 'poblenou' || cell.district === 'lescorts') && rng() < 0.45) {
        h = rng.range(30, 75);
        color = jitterColor(rng.pick([0xc8d4dc, 0xa8b8c4, 0xe0e4e8, 0x9fb0bc]), rng, 0.04);
      } else if (style === 'modern' && cell.district === 'poblenou') {
        h = rng.range(14, 28);
      }
      this.addBuilding([a0, b0, a1, b0, a1, b1, a0, b1], base, h, style, color, cell.district);
    }
  }

  // -------------------------------------------------------------------------
  // Suelo, mar, horizonte
  // -------------------------------------------------------------------------
  groundColor(x, z, rng) {
    if (isWater(x, z)) return 0xb8a77a;
    if (isBeach(x, z)) return 0xe3cf9c;
    const zn = zoneAt(x, z, ['park', 'plaza']);
    const d = montjuicDist(x, z);
    if (zn && zn.kind === 'park') return jitterColor(0x6f9a4f, rng, 0.12);
    if (d < 230) return jitterColor(d < 215 ? 0x6b9550 : 0x8a9a6a, rng, 0.12);
    if (zn && zn.kind === 'plaza') return 0xc9bc9e;
    const dist = districtAt(x, z);
    if (dist === 'zonafranca') return 0x7f8287;
    if (z < -900 && x > -10 && x < 190) return jitterColor(0x7a9a55, rng, 0.1);
    return 0xb1a998;
  }

  buildGround() {
    const STEP = 10;
    const nx = Math.ceil((MAP.maxX - MAP.minX) / STEP) + 1;
    const nz = Math.ceil((MAP.maxZ - MAP.minZ) / STEP) + 1;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const rng = makeRng(77);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = MAP.minX + i * STEP, z = MAP.minZ + j * STEP;
        const k = j * nx + i;
        pos[k * 3] = x; pos[k * 3 + 1] = groundHeight(x, z); pos[k * 3 + 2] = z;
        const c = new THREE.Color(this.groundColor(x, z, rng));
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
        uv[k * 2] = x / 12; uv[k * 2 + 1] = z / 12;
      }
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, this.mat.ground);
    mesh.receiveShadow = true;
    mesh.name = 'ground';
    this.group.add(mesh);
  }

  buildWater() {
    const g = new THREE.PlaneGeometry(9000, 9000, 1, 1);
    g.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(g, this.mat.water);
    water.position.set(0, SEA_LEVEL, 1500);
    water.receiveShadow = true;
    water.name = 'water';
    this.water = water;
    this.group.add(water);
  }

  buildBackdrop() {
    // Sierra de Collserola al norte, con el Tibidabo y la torre de comunicaciones
    const b = new GeoBuilder();
    const rng = makeRng(31);
    const pts = [];
    for (let x = -3200; x <= 3200; x += 80) {
      const ridge = 160 + Math.sin(x * 0.0021) * 60 + Math.sin(x * 0.0067 + 1) * 30 + rng() * 10 + (Math.abs(x - 100) < 500 ? (500 - Math.abs(x - 100)) * 0.25 : 0);
      pts.push([x, ridge]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [xa, ha] = pts[i], [xb, hb] = pts[i + 1];
      const zf = -1180, zb = -1700;
      b.quad([xa, 12, zf], [xb, 12, zf], [xb, hb, zb + 120], [xa, ha, zb + 120], 0x5d7862);
      b.quad([xa, ha, zb + 120], [xb, hb, zb + 120], [xb, hb * 0.5, zb - 600], [xa, ha * 0.5, zb - 600], 0x6d8a84);
    }
    // Templo del Tibidabo
    const tx = 100, tz = -1580, ty = 285;
    b.box(tx, ty - 10, tz, 30, 26, 22, 0xd8d0c0);
    b.cylinder(tx, ty + 16, tz, 6, 4, 22, 0xd8d0c0, 10);
    b.cylinder(tx, ty + 38, tz, 1.4, 0.3, 14, 0xc8b070, 6);
    // Torre de Collserola
    b.cylinder(-260, 200, -1540, 3, 1.4, 190, 0xc8ccd0, 8);
    b.box(-260, 300, -1540, 18, 26, 18, 0xa0a8b0);
    // Islas industriales a los lados (delta del Llobregat y Besòs)
    for (let i = 0; i < 40; i++) {
      const side = i % 2 ? -1 : 1;
      const x = side * rng.range(1350, 2200), z = rng.range(-900, 700);
      b.box(x, 0, z, rng.range(30, 90), rng.range(8, 40), rng.range(30, 90), jitterColor(0x9a9590, rng, 0.15));
    }
    b.quad([-3500, -0.2, -1180], [-1300, -0.2, -1180], [-1300, -0.2, 1000], [-3500, -0.2, 1000], 0x8f8f7a, null, [0, 1, 0]);
    b.quad([1250, -0.2, -1180], [3500, -0.2, -1180], [3500, -0.2, 470], [1250, -0.2, 470], 0x8f8f7a, null, [0, 1, 0]);
    b.quad([-1300, -0.2, -2000], [1250, -0.2, -2000], [1250, -0.2, -1050], [-1300, -0.2, -1050], 0x6d7f57, null, [0, 1, 0]);
    const m = b.toMesh(new THREE.MeshLambertMaterial({ vertexColors: true, fog: false }));
    m.name = 'backdrop';
    this.backdrop = m;
    this.group.add(m);
  }

  // -------------------------------------------------------------------------
  // Mobiliario urbano (instanciado)
  // -------------------------------------------------------------------------
  buildProps() {
    const rng = makeRng(555);
    const trees = [], palms = [], lamps = [], signals = [], benches = [], bins = [];
    const R = this.roads;
    const blocked = (x, z, r = 1) => {
      if (isWater(x, z)) return true;
      if (R.roadDistance(x, z) < 0.3) return true;
      return this.collision.query(x - r, z - r, x + r, z + r).some((c) => c.tag === 'building' && pointInsideish(c, x, z, r));
    };
    const TREE_DISTRICTS = new Set(['eixample', 'sants', 'lescorts', 'poblenou', 'gracia', 'vilaolimpica', 'poblesec', 'zonafranca']);
    for (const e of R.edges) {
      const A = R.nodes[e.a], B = R.nodes[e.b];
      const isProm = e.type === 'promenade';
      const palmRow = (e.name === 'Ronda del Litoral' && A.x > -150) || e.name === 'Passeig de Joan de Borbó' || e.name === 'Passeig Marítim';
      const treeRow = isProm || ((e.type === 'avenue' || e.type === 'street') && TREE_DISTRICTS.has(e.district));
      const spacing = palmRow ? 16 : 13;
      const rA = (A.radius || 5) + 5, rB = (B.radius || 5) + 5;
      for (let s = rA; s < e.len - rB; s += spacing) {
        for (const side of [-1, 1]) {
          const off = isProm ? e.w / 2 - 1.5 : e.w / 2 + Math.max(1.2, e.sidewalk * 0.55);
          const x = A.x + e.dx * s - e.dz * off * side, z = A.z + e.dz * s + e.dx * off * side;
          if (palmRow) {
            if (side === 1 && !blocked(x, z)) palms.push([x, z, rng()]);
          } else if (treeRow && !blocked(x, z, 0.6)) trees.push([x, z, rng()]);
        }
      }
      // Farolas
      if (!e.noTraffic || isProm) {
        for (let s = rA + 6; s < e.len - rB; s += 26) {
          const side = Math.floor(s / 26) % 2 ? 1 : -1;
          const off = isProm ? 2 : e.w / 2 + Math.max(0.5, e.sidewalk * 0.25);
          const x = A.x + e.dx * s - e.dz * off * side, z = A.z + e.dz * s + e.dx * off * side;
          if (!blocked(x, z, 0.3)) lamps.push([x, z, Math.atan2(e.dz * side, -e.dx * side)]);
        }
      }
      // Bancos y contenedores
      if (e.sidewalk >= 2.5 && e.len > 40 && rng() < 0.35) {
        const s = e.len * rng.range(0.3, 0.7), side = rng() < 0.5 ? 1 : -1;
        const off = e.w / 2 + e.sidewalk * 0.8;
        const x = A.x + e.dx * s - e.dz * off * side, z = A.z + e.dz * s + e.dx * off * side;
        if (!blocked(x, z, 1)) (rng() < 0.5 ? benches : bins).push([x, z, Math.atan2(-e.dz, e.dx)]);
      }
    }
    // Semáforos
    for (const n of R.nodes) {
      if (!n.signal) continue;
      for (const id of n.edges) {
        const e = R.edges[id];
        if (e.noTraffic) continue;
        const dir = e.a === n.id ? 1 : -1;
        const dx = e.dx * dir, dz = e.dz * dir;
        const off = n.radius + 3.6;
        // A la derecha del vehículo que llega (que circula en sentido -dir)
        const side = e.w / 2 + 0.8;
        const x = n.x + dx * off + dz * side, z = n.z + dz * off - dx * side;
        const ang = Math.atan2(dx, dz);
        const diffAng = Math.atan2(e.dz, e.dx) - n.refAngle;
        let df = Math.abs(((diffAng % Math.PI) + Math.PI) % Math.PI);
        if (df > Math.PI / 2) df = Math.PI - df;
        signals.push({ x, z, ang, node: n, axis: df < Math.PI / 4 ? 0 : 1 });
      }
    }
    // Parques: árboles dispersos
    for (const zn of ZONES) {
      if (zn.kind !== 'park') continue;
      const count = zn.id === 'montjuic' ? 900 : zn.id === 'ciutadella' ? 220 : 60;
      for (let i = 0; i < count; i++) {
        let x, z;
        if (zn.rect) { x = rng.range(zn.rect[0], zn.rect[2]); z = rng.range(zn.rect[1], zn.rect[3]); }
        else { const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * zn.circle[2]; x = zn.circle[0] + Math.cos(a) * r; z = zn.circle[1] + Math.sin(a) * r; }
        if (zn.id === 'montjuic' && montjuicDist(x, z) < 55) continue;
        if (!blocked(x, z, 2) && R.roadDistance(x, z) > 3 && !zoneAt(x, z, ['landmark', 'plaza'])) {
          (zn.id === 'montjuic' && rng() < 0.25 ? palms : trees).push([x, z, rng()]);
        }
      }
    }
    // Playa: palmeras en el paseo
    for (let x = 570; x < 1230; x += 22) {
      const z = 424;
      if (!blocked(x, z)) palms.push([x, z, rng()]);
    }
    this.placeTrees(trees);
    this.placePalms(palms);
    this.placeLamps(lamps);
    this.placeSignals(signals);
    this.placeSmall(benches, bins);
    this.placeBeach(rng);
  }

  placeTrees(list) {
    const trunkG = new THREE.CylinderGeometry(0.18, 0.28, 3.2, 6);
    trunkG.translate(0, 1.6, 0);
    const crownG = new THREE.IcosahedronGeometry(2.6, 0);
    crownG.scale(1, 0.85, 1);
    crownG.translate(0, 4.6, 0);
    const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x5a4632 }), list.length);
    const crown = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    list.forEach(([x, z, r], i) => {
      const sc = 0.8 + r * 0.6;
      p.set(x, groundHeight(x, z), z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r * 6.28);
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      trunk.setMatrixAt(i, m);
      crown.setMatrixAt(i, m);
      col.setHSL(0.22 + r * 0.08, 0.45, 0.28 + r * 0.1);
      crown.setColorAt(i, col);
      this.collision.addBox(x, z, 0.5, 0.5, 0, p.y - 1, p.y + 3, 'prop');
    });
    trunk.castShadow = crown.castShadow = true;
    crown.receiveShadow = true;
    this.group.add(trunk, crown);
  }

  placePalms(list) {
    const trunkG = new THREE.CylinderGeometry(0.16, 0.26, 8, 6);
    trunkG.translate(0, 4, 0);
    // Hojas: abanico de láminas inclinadas
    const leaves = new GeoBuilder();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const dx = Math.cos(a), dz = Math.sin(a);
      const px = -dz * 0.45, pz = dx * 0.45;
      leaves.quad([px, 8, pz], [-px, 8, -pz], [dx * 3.6 - px * 0.3, 6.6, dz * 3.6 - pz * 0.3], [dx * 3.6 + px * 0.3, 6.6, dz * 3.6 + pz * 0.3], 0x3f7a35);
      leaves.quad([-px, 8, -pz], [px, 8, pz], [dx * 3.6 + px * 0.3, 6.6, dz * 3.6 + pz * 0.3], [dx * 3.6 - px * 0.3, 6.6, dz * 3.6 - pz * 0.3], 0x3f7a35);
    }
    const leafG = leaves.toGeometry();
    const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x8a7050 }), list.length);
    const crown = new THREE.InstancedMesh(leafG, this.mat.plainDouble, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    list.forEach(([x, z, r], i) => {
      const sc = 0.85 + r * 0.4;
      p.set(x, groundHeight(x, z), z);
      q.setFromEuler(new THREE.Euler((r - 0.5) * 0.12, r * 6.28, (r - 0.5) * 0.1));
      s.set(sc, sc, sc);
      m.compose(p, q, s);
      trunk.setMatrixAt(i, m);
      crown.setMatrixAt(i, m);
      this.collision.addBox(x, z, 0.5, 0.5, 0, p.y - 1, p.y + 7, 'prop');
    });
    trunk.castShadow = crown.castShadow = true;
    this.group.add(trunk, crown);
  }

  placeLamps(list) {
    const pole = new GeoBuilder();
    pole.cylinder(0, 0, 0, 0.09, 0.07, 6.5, 0x2e3133, 6);
    pole.box(0, 6.3, 0.7, 0.12, 0.12, 1.5, 0x2e3133);
    const poleG = pole.toGeometry();
    const headG = new THREE.BoxGeometry(0.5, 0.18, 0.7);
    headG.translate(0, 6.15, 1.35);
    const poles = new THREE.InstancedMesh(poleG, this.mat.plain, list.length);
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0x555555 });
    const heads = new THREE.InstancedMesh(headG, this.lampMat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    list.forEach(([x, z, a], i) => {
      p.set(x, groundHeight(x, z), z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
      m.compose(p, q, s);
      poles.setMatrixAt(i, m);
      heads.setMatrixAt(i, m);
      this.collision.addBox(x, z, 0.3, 0.3, 0, p.y - 1, p.y + 6, 'prop');
    });
    this.lampPositions = list;
    this.group.add(poles, heads);
  }

  placeSignals(list) {
    const pole = new GeoBuilder();
    pole.cylinder(0, 0, 0, 0.08, 0.08, 3.4, 0x2b2e30, 6);
    pole.box(0, 2.45, 0.05, 0.35, 1.0, 0.25, 0x1d1f20);
    const poleG = pole.toGeometry();
    const lightG = new THREE.BoxGeometry(0.22, 0.22, 0.06);
    const poles = new THREE.InstancedMesh(poleG, this.mat.plain, list.length);
    const lights = new THREE.InstancedMesh(lightG, new THREE.MeshBasicMaterial({ color: 0xffffff }), list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    list.forEach((sg, i) => {
      const y = groundHeight(sg.x, sg.z);
      p.set(sg.x, y, sg.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sg.ang);
      m.compose(p, q, s);
      poles.setMatrixAt(i, m);
      sg.y = y;
      this.collision.addBox(sg.x, sg.z, 0.25, 0.25, 0, y - 1, y + 3, 'prop');
    });
    this.signals = list;
    this.signalMesh = lights;
    lights.setColorAt(0, new THREE.Color(1, 0, 0));
    this.group.add(poles, lights);
  }

  /** Actualiza el color de los semáforos (rojo/ámbar/verde). */
  updateSignals(time) {
    if (!this.signals || !this.signals.length) return;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const red = new THREE.Color(1, 0.1, 0.05), yel = new THREE.Color(1, 0.7, 0), grn = new THREE.Color(0.1, 1, 0.3);
    this.signals.forEach((sg, i) => {
      const st = this.roads.signalState(sg.node, sg.axis, time);
      const off = st === 'r' ? 2.8 : st === 'y' ? 2.45 : 2.1;
      // la luz mira hacia el tráfico que llega (+z local)
      const ca = Math.cos(sg.ang), sa = Math.sin(sg.ang);
      p.set(sg.x + sa * 0.19, sg.y + off, sg.z + ca * 0.19);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sg.ang);
      m.compose(p, q, s);
      this.signalMesh.setMatrixAt(i, m);
      this.signalMesh.setColorAt(i, st === 'r' ? red : st === 'y' ? yel : grn);
    });
    this.signalMesh.instanceMatrix.needsUpdate = true;
    if (this.signalMesh.instanceColor) this.signalMesh.instanceColor.needsUpdate = true;
  }

  placeSmall(benches, bins) {
    for (const [x, z, a] of benches) {
      const y = groundHeight(x, z);
      const b = this.chunk(x, z).plain;
      b.box(x, y + 0.4, z, 1.8, 0.1, 0.5, 0x6b4a2e, a);
      b.box(x, y, z, 1.6, 0.4, 0.15, 0x3a3a3a, a);
      this.collision.addBox(x, z, 1.8, 0.6, a, y - 1, y + 0.8, 'prop');
    }
    for (const [x, z, a] of bins) {
      const y = groundHeight(x, z);
      const colors = [0x3d7a3d, 0x2f5fa8, 0xd8c030, 0x6b6b6b, 0x7a5030];
      for (let i = 0; i < 3; i++) {
        const lx = (i - 1) * 1.6;
        const cx = x + Math.cos(a) * lx, cz = z - Math.sin(a) * lx;
        this.chunk(cx, cz).plain.box(cx, y, cz, 1.4, 1.6, 1.4, colors[(i + Math.floor(x)) % colors.length], a);
      }
      this.collision.addBox(x, z, 4.8, 1.5, a, y - 1, y + 1.6, 'prop');
    }
  }

  placeBeach(rng) {
    // Sombrillas y hamacas en la playa
    for (let i = 0; i < 160; i++) {
      const x = rng.range(575, 1230), z = rng.range(436, 466);
      if (!isBeach(x, z)) continue;
      const y = groundHeight(x, z);
      const ch = this.chunk(x, z).plain;
      const col = rng.pick([0xd83a3a, 0x3a7ad8, 0xf0c030, 0x40b070, 0xf0f0f0, 0xe07030]);
      ch.cylinder(x, y, z, 0.04, 0.04, 2.3, 0xdddddd, 5);
      ch.cylinder(x, y + 2.0, z, 1.5, 0.05, 0.5, col, 8);
      if (rng() < 0.6) ch.box(x + 1.2, y, z + 0.5, 0.7, 0.3, 1.8, 0xf2f2f2);
    }
    // Torres de socorrista
    for (let x = 620; x < 1230; x += 150) {
      const y = groundHeight(x, 455);
      const ch = this.chunk(x, 455).plain;
      ch.box(x, y, 455, 1.4, 3, 1.4, 0xd8d8d8);
      ch.box(x, y + 3, 455, 1.8, 1.4, 1.8, 0xd83030);
    }
  }

  flush() {
    for (const c of this.chunks.values()) {
      for (const [style, b] of Object.entries(c.facades)) {
        if (b.empty) continue;
        const m = b.toMesh(this.mat.facades[style]);
        m.castShadow = true; m.receiveShadow = true;
        this.group.add(m);
      }
      if (!c.roof.empty) { const m = c.roof.toMesh(this.mat.plain); m.receiveShadow = true; m.castShadow = true; this.group.add(m); }
      if (!c.plain.empty) { const m = c.plain.toMesh(this.mat.plain); m.receiveShadow = true; m.castShadow = true; this.group.add(m); }
    }
    this.chunks.clear();
  }

  /** Iluminación nocturna de farolas. */
  setNight(f) {
    if (this.lampMat) this.lampMat.color.setRGB(0.33 + f * 0.67, 0.33 + f * 0.6, 0.33 + f * 0.35);
  }
}

/** Rectángulo orientado: sx a lo ancho (perpendicular a la calle), sz a lo largo. */
function rectPolyLocal(cx, cz, sx, sz, ry) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const hx = sx / 2, hz = sz / 2;
  const out = [];
  for (const [lx, lz] of [[-hx, hz], [hx, hz], [hx, -hz], [-hx, -hz]]) out.push(cx + lx * c + lz * s, cz - lx * s + lz * c);
  return ensureCCW(out);
}

/** SAT entre dos polígonos convexos con margen. */
function convexOverlap(a, b, margin = 0) {
  for (const poly of [a, b]) {
    const n = poly.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const nx = -(poly[j * 2 + 1] - poly[i * 2 + 1]), nz = poly[j * 2] - poly[i * 2];
      const l = Math.hypot(nx, nz) || 1;
      let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
      for (let k = 0; k < a.length; k += 2) { const p = (a[k] * nx + a[k + 1] * nz) / l; amin = Math.min(amin, p); amax = Math.max(amax, p); }
      for (let k = 0; k < b.length; k += 2) { const p = (b[k] * nx + b[k + 1] * nz) / l; bmin = Math.min(bmin, p); bmax = Math.max(bmax, p); }
      if (amax + margin <= bmin || bmax + margin <= amin) return false;
    }
  }
  return true;
}

function growPoly(poly, d) {
  let cx = 0, cz = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) { cx += poly[i * 2]; cz += poly[i * 2 + 1]; }
  cx /= n; cz /= n;
  const out = [];
  for (let i = 0; i < n; i++) {
    const x = poly[i * 2], z = poly[i * 2 + 1];
    const l = Math.hypot(x - cx, z - cz) || 1;
    out.push(x + (x - cx) / l * d, z + (z - cz) / l * d);
  }
  return out;
}

function pointInsideish(c, x, z, r) {
  return x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r;
}

export { STYLE, coastZ };
