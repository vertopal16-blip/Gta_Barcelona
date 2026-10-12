// Red viaria: convierte los segmentos del trazado en un grafo plano navegable
// (nodos = cruces, aristas = tramos) que usan el tráfico, peatones, policía y GPS.

import * as THREE from 'three';
import { segIntersect, pointSegment, MinHeap, makeRng, clamp } from '../core/utils.js';
import { ROAD_TYPES, ROUNDABOUTS } from './layout.js';
import { groundHeight, isWater, districtAt } from './terrain.js';
import { GeoBuilder } from './geom.js';

const OLD_TOWN = new Set(['gotic', 'raval', 'born', 'barceloneta']);

export class RoadNetwork {
  constructor(segs) {
    this.nodes = [];
    this.edges = [];
    this._build(segs);
    this._index();
  }

  // -------------------------------------------------------------------------
  // Construcción del grafo
  // -------------------------------------------------------------------------
  _build(segs) {
    // Descarta segmentos sobre el agua
    segs = segs.filter((s) => !isWater(s.ax, s.az) && !isWater(s.bx, s.bz) && !isWater((s.ax + s.bx) / 2, (s.az + s.bz) / 2));

    // Índice espacial de segmentos para encontrar intersecciones
    const CELL = 60;
    const grid = new Map();
    segs.forEach((s, i) => {
      const x0 = Math.floor(Math.min(s.ax, s.bx) / CELL), x1 = Math.floor(Math.max(s.ax, s.bx) / CELL);
      const z0 = Math.floor(Math.min(s.az, s.bz) / CELL), z1 = Math.floor(Math.max(s.az, s.bz) / CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = x + ',' + z;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    });
    const splits = segs.map(() => [0, 1]);
    const tested = new Set();
    for (const list of grid.values()) {
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const i = Math.min(list[a], list[b]), j = Math.max(list[a], list[b]);
          const key = i * 100000 + j;
          if (tested.has(key)) continue;
          tested.add(key);
          const s = segs[i], t = segs[j];
          const r = segIntersect(s.ax, s.az, s.bx, s.bz, t.ax, t.az, t.bx, t.bz);
          if (r) { splits[i].push(r.t); splits[j].push(r.u); }
        }
      }
    }

    // Fusión de nodos cercanos
    const nodeGrid = new Map();
    const NC = 4, MERGE = 2.2;
    const getNode = (x, z) => {
      const cx = Math.floor(x / NC), cz = Math.floor(z / NC);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const l = nodeGrid.get((cx + dx) + ',' + (cz + dz));
        if (!l) continue;
        for (const n of l) if (Math.hypot(n.x - x, n.z - z) < MERGE) return n;
      }
      const n = { id: this.nodes.length, x, z, edges: [] };
      this.nodes.push(n);
      const k = cx + ',' + cz;
      if (!nodeGrid.has(k)) nodeGrid.set(k, []);
      nodeGrid.get(k).push(n);
      return n;
    };

    const edgeMap = new Map();
    const better = (newT, oldT) => {
      if (newT === 'promenade') return true;
      if (oldT === 'promenade') return false;
      return ROAD_TYPES[newT].prio > ROAD_TYPES[oldT].prio;
    };
    segs.forEach((s, i) => {
      const ts = [...new Set(splits[i].map((t) => Math.round(t * 1e5) / 1e5))].sort((a, b) => a - b);
      let prev = null;
      for (const t of ts) {
        const n = getNode(s.ax + (s.bx - s.ax) * t, s.az + (s.bz - s.az) * t);
        if (prev && prev !== n) {
          const key = Math.min(prev.id, n.id) + '-' + Math.max(prev.id, n.id);
          const ex = edgeMap.get(key);
          if (!ex) edgeMap.set(key, { a: prev.id, b: n.id, type: s.type, w: s.w, name: s.name });
          else if (better(s.type, ex.type)) { ex.type = s.type; ex.w = s.w; ex.name = s.name || ex.name; }
          else if (!ex.name && s.name) ex.name = s.name;
        }
        prev = n;
      }
    });
    let edges = [...edgeMap.values()];

    // Elimina el interior de las rotondas
    const removedNode = new Set();
    for (const rb of ROUNDABOUTS) {
      for (const n of this.nodes) if (Math.hypot(n.x - rb.x, n.z - rb.z) < rb.r - 3) removedNode.add(n.id);
    }
    edges = edges.filter((e) => !removedNode.has(e.a) && !removedNode.has(e.b));

    // Une extremos sueltos con tramos cercanos (uniones en T imperfectas)
    const deg = new Map();
    const recount = () => {
      deg.clear();
      for (const e of edges) { deg.set(e.a, (deg.get(e.a) || 0) + 1); deg.set(e.b, (deg.get(e.b) || 0) + 1); }
    };
    recount();
    for (const n of this.nodes) {
      if (deg.get(n.id) !== 1) continue;
      let best = null;
      for (const e of edges) {
        if (e.a === n.id || e.b === n.id) continue;
        const A = this.nodes[e.a], B = this.nodes[e.b];
        const r = pointSegment(n.x, n.z, A.x, A.z, B.x, B.z);
        if (r.d < 4 && r.t > 0.02 && r.t < 0.98 && (!best || r.d < best.r.d)) best = { e, r };
      }
      if (best) {
        n.x = best.r.x; n.z = best.r.z;
        const e = best.e;
        edges.splice(edges.indexOf(e), 1);
        edges.push({ ...e, b: n.id }, { ...e, a: n.id });
        recount();
      }
    }

    // Poda de callejones sin salida muy cortos
    for (let pass = 0; pass < 3; pass++) {
      recount();
      edges = edges.filter((e) => {
        const A = this.nodes[e.a], B = this.nodes[e.b];
        const len = Math.hypot(A.x - B.x, A.z - B.z);
        if (len < 0.8) return false;
        if ((deg.get(e.a) === 1 || deg.get(e.b) === 1) && len < 45 && e.type !== 'highway' && e.type !== 'avenue' && e.type !== 'promenade') return false;
        return true;
      });
    }

    // Componente conexa mayor
    recount();
    const adj = new Map();
    for (const e of edges) {
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a).push(e.b); adj.get(e.b).push(e.a);
    }
    let bestComp = null;
    const seen = new Set();
    for (const start of adj.keys()) {
      if (seen.has(start)) continue;
      const comp = new Set([start]);
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const v = stack.pop();
        for (const w of adj.get(v)) if (!seen.has(w)) { seen.add(w); comp.add(w); stack.push(w); }
      }
      if (!bestComp || comp.size > bestComp.size) bestComp = comp;
    }
    edges = edges.filter((e) => bestComp.has(e.a));

    // Reindexado compacto
    const oldNodes = this.nodes;
    const remap = new Map();
    this.nodes = [];
    for (const id of bestComp) {
      const o = oldNodes[id];
      const n = { id: this.nodes.length, x: o.x, z: o.z, edges: [] };
      n.y = groundHeight(n.x, n.z);
      remap.set(id, n.id);
      this.nodes.push(n);
    }
    const rng = makeRng(99);
    this.edges = edges.map((e, i) => {
      const a = remap.get(e.a), b = remap.get(e.b);
      const A = this.nodes[a], B = this.nodes[b];
      const len = Math.hypot(B.x - A.x, B.z - A.z);
      const T = ROAD_TYPES[e.type];
      const edge = {
        id: i, a, b, type: e.type, w: e.w, name: e.name, len,
        dx: (B.x - A.x) / len, dz: (B.z - A.z) / len,
        speed: T.speed, lanes: T.lanes, noTraffic: !!T.noTraffic, sidewalk: T.sidewalk,
        district: districtAt((A.x + B.x) / 2, (A.z + B.z) / 2),
      };
      A.edges.push(i); B.edges.push(i);
      return edge;
    });
    // Semáforos en cruces importantes
    for (const n of this.nodes) {
      const ts = n.edges.map((id) => this.edges[id]);
      const traffic = ts.filter((e) => !e.noTraffic);
      n.radius = Math.max(...ts.map((e) => e.w)) / 2;
      n.signal = traffic.length >= 3 && traffic.every((e) => ROAD_TYPES[e.type].prio >= 4) && !ROUNDABOUTS.some((rb) => Math.hypot(n.x - rb.x, n.z - rb.z) < rb.r + 3);
      n.phase = rng() * 20;
      n.refAngle = traffic.length ? Math.atan2(traffic[0].dz, traffic[0].dx) : 0;
    }
  }

  _index() {
    this.CELL = 40;
    this.grid = new Map();
    for (const e of this.edges) {
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const m = e.w / 2 + 8;
      const x0 = Math.floor((Math.min(A.x, B.x) - m) / this.CELL), x1 = Math.floor((Math.max(A.x, B.x) + m) / this.CELL);
      const z0 = Math.floor((Math.min(A.z, B.z) - m) / this.CELL), z1 = Math.floor((Math.max(A.z, B.z) + m) / this.CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = x + ',' + z;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(e.id);
      }
    }
  }

  edgesNear(x, z, r = 0) {
    const out = new Set();
    const c = this.CELL;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
      const l = this.grid.get(i + ',' + j);
      if (l) for (const id of l) out.add(id);
    }
    return out;
  }

  /** Tramo más cercano a un punto. */
  nearestEdge(x, z, maxR = 60, filter = null) {
    let best = null;
    for (let r = 0; r <= maxR; r += 40) {
      for (const id of this.edgesNear(x, z, r)) {
        const e = this.edges[id];
        if (filter && !filter(e)) continue;
        const A = this.nodes[e.a], B = this.nodes[e.b];
        const p = pointSegment(x, z, A.x, A.z, B.x, B.z);
        if (!best || p.d < best.d) best = { edge: e, t: p.t, d: p.d, x: p.x, z: p.z };
      }
      if (best && best.d <= r + 20) break;
    }
    return best;
  }

  nearestNode(x, z, filter = null) {
    const ne = this.nearestEdge(x, z, 200, filter ? (e) => filter(e) : null);
    if (!ne) return this.nodes[0];
    return ne.t < 0.5 ? this.nodes[ne.edge.a] : this.nodes[ne.edge.b];
  }

  /** Distancia del punto al borde de la calzada más cercana (negativa si está dentro). */
  roadDistance(x, z, carsOnly = false) {
    let best = Infinity;
    for (const id of this.edgesNear(x, z, 10)) {
      const e = this.edges[id];
      if (carsOnly && e.noTraffic) continue;
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const d = pointSegment(x, z, A.x, A.z, B.x, B.z).d - e.w / 2;
      if (d < best) best = d;
    }
    return best;
  }

  /** Margen libre entre un rectángulo y las calles (incluida la acera). */
  rectClearance(x0, z0, x1, z1) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const r = Math.hypot(x1 - x0, z1 - z0) / 2;
    let best = Infinity;
    for (const id of this.edgesNear(cx, cz, r + 10)) {
      const e = this.edges[id];
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const d = segRectDist(A.x, A.z, B.x, B.z, x0, z0, x1, z1) - e.w / 2 - e.sidewalk;
      if (d < best) best = d;
    }
    return best;
  }

  /** Margen libre entre un polígono convexo y las calles (incluida la acera). */
  polyClearance(poly) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]);
      z0 = Math.min(z0, poly[i + 1]); z1 = Math.max(z1, poly[i + 1]);
    }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const r = Math.hypot(x1 - x0, z1 - z0) / 2;
    let best = Infinity;
    for (const id of this.edgesNear(cx, cz, r + 10)) {
      const e = this.edges[id];
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const d = segPolyDist(A.x, A.z, B.x, B.z, poly) - e.w / 2 - e.sidewalk;
      if (d < best) best = d;
    }
    // Los cruces también ocupan espacio
    return best;
  }

  otherNode(e, nid) { return e.a === nid ? e.b : e.a; }

  /** A* sobre el grafo. opts.car = true evita paseos peatonales. */
  findPath(fromId, toId, opts = {}) {
    if (fromId === toId) return [fromId];
    const goal = this.nodes[toId];
    const g = new Map([[fromId, 0]]);
    const came = new Map();
    const open = new MinHeap();
    open.push(fromId, 0);
    const closed = new Set();
    let iter = 0;
    while (open.size && iter++ < 20000) {
      const cur = open.pop();
      if (cur === toId) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      const n = this.nodes[cur];
      for (const eid of n.edges) {
        const e = this.edges[eid];
        if (opts.car && e.noTraffic) continue;
        const nb = this.otherNode(e, cur);
        // Las avenidas son más rápidas: el GPS las prefiere
        const cost = e.len / Math.max(4, e.speed || 4);
        const ng = g.get(cur) + cost;
        if (ng < (g.has(nb) ? g.get(nb) : Infinity)) {
          g.set(nb, ng);
          came.set(nb, cur);
          const m = this.nodes[nb];
          open.push(nb, ng + Math.hypot(m.x - goal.x, m.z - goal.z) / 19);
        }
      }
    }
    if (!came.has(toId)) return null;
    const path = [toId];
    let c = toId;
    while (c !== fromId) { c = came.get(c); path.push(c); }
    return path.reverse();
  }

  edgeBetween(a, b) {
    for (const id of this.nodes[a].edges) {
      const e = this.edges[id];
      if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) return e;
    }
    return null;
  }

  /** Estado del semáforo para un vehículo que llega por la arista e al nodo n. */
  signalGreen(n, e, time) {
    if (!n.signal) return true;
    const ang = Math.atan2(e.dz, e.dx);
    let diff = Math.abs(((ang - n.refAngle) % Math.PI + Math.PI) % Math.PI);
    if (diff > Math.PI / 2) diff = Math.PI - diff;
    const axis = diff < Math.PI / 4 ? 0 : 1;
    const t = (time + n.phase) % 22;
    // 0..9 verde eje 0, 9..11 todo rojo, 11..20 verde eje 1, 20..22 todo rojo
    if (axis === 0) return t < 9;
    return t >= 11 && t < 20;
  }

  signalState(n, axis, time) {
    const t = (time + n.phase) % 22;
    if (axis === 0) return t < 8 ? 'g' : t < 9 ? 'y' : 'r';
    return t >= 11 && t < 19 ? 'g' : t >= 19 && t < 20 ? 'y' : 'r';
  }

  // -------------------------------------------------------------------------
  // Mallas
  // -------------------------------------------------------------------------
  buildMeshes(materials) {
    const group = new THREE.Group();
    const CH = 400;
    const chunks = new Map();
    const chunk = (x, z) => {
      const k = Math.floor(x / CH) + ',' + Math.floor(z / CH);
      if (!chunks.has(k)) chunks.set(k, { road: new GeoBuilder(), walk: new GeoBuilder(), mark: new GeoBuilder() });
      return chunks.get(k);
    };
    const yAt = (x, z) => groundHeight(x, z) + 0.07 + Math.min(0.35, Math.abs(groundHeight(x + 3, z) - groundHeight(x - 3, z)) * 0.1);

    const roadColor = (e) => {
      if (e.type === 'promenade') return e.name === 'La Rambla' ? 0xc8b89a : 0xb9ae98;
      if (e.type === 'narrow' && OLD_TOWN.has(e.district)) return 0x8a8073;
      if (e.type === 'highway') return 0x3a3d42;
      if (e.type === 'mountain') return 0x4d4f52;
      return 0x46494e;
    };
    const walkColor = (e) => {
      if (OLD_TOWN.has(e.district)) return 0xa89e8e;
      if (e.district === 'montjuic') return 0x9c9480;
      return 0xbdb8ae;
    };

    for (const e of this.edges) {
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const steps = Math.max(1, Math.ceil(e.len / 8));
      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t;
        pts.push([x, yAt(x, z), z]);
      }
      const ch = chunk((A.x + B.x) / 2, (A.z + B.z) / 2);
      ch.road.ribbon(pts, e.w, roadColor(e), 0.12);
      if (e.sidewalk > 0) ch.walk.ribbon(pts, e.w + e.sidewalk * 2, walkColor(e), 0.25);

      // Marcas viales
      if (!e.noTraffic && e.w >= 9 && e.len > 14) {
        const m = ch.mark;
        const start = Math.min(e.len / 2, (A.radius || 5) + 4), end = e.len - Math.min(e.len / 2, (B.radius || 5) + 4);
        const lineAt = (off, dash, width, col) => {
          for (let s = start; s < end; s += dash ? 7 : 6) {
            const s1 = Math.min(end, s + (dash ? 3 : 6));
            const px = -e.dz * off, pz = e.dx * off;
            const x0 = A.x + e.dx * s + px, z0 = A.z + e.dz * s + pz;
            const x1 = A.x + e.dx * s1 + px, z1 = A.z + e.dz * s1 + pz;
            m.ribbon([[x0, yAt(x0, z0) + 0.02, z0], [x1, yAt(x1, z1) + 0.02, z1]], width, col);
          }
        };
        if (e.lanes >= 2) {
          lineAt(-0.2, false, 0.15, 0xe8e6dc);
          lineAt(0.2, false, 0.15, 0xe8e6dc);
          lineAt(e.w / 4, true, 0.14, 0xe8e6dc);
          lineAt(-e.w / 4, true, 0.14, 0xe8e6dc);
        } else {
          lineAt(0, true, 0.14, 0xe8e6dc);
        }
      }
    }

    // Cruces: discos de calzada y pasos de cebra
    for (const n of this.nodes) {
      const ts = n.edges.map((id) => this.edges[id]);
      if (!ts.length) continue;
      const ch = chunk(n.x, n.z);
      const road = ts.filter((e) => !e.noTraffic);
      const main = road.length ? road.reduce((a, b) => (a.w > b.w ? a : b)) : ts[0];
      const r = (road.length ? Math.max(...road.map((e) => e.w)) : main.w) / 2;
      const poly = [];
      const seg = 14;
      for (let i = seg - 1; i >= 0; i--) {
        const a = (i / seg) * Math.PI * 2;
        poly.push(n.x + Math.cos(a) * r, n.z + Math.sin(a) * r);
      }
      // polígono horizontal siguiendo el terreno (centro)
      const y = yAt(n.x, n.z);
      ch.road.polygonFlat(poly, y, roadColor(main));
      if (n.signal) {
        for (const e of road) {
          const dir = e.a === n.id ? 1 : -1;
          const dx = e.dx * dir, dz = e.dz * dir;
          const off = r + 2.2;
          const cx = n.x + dx * off, cz = n.z + dz * off;
          const stripes = Math.floor(e.w / 1.2);
          for (let k = 0; k < stripes; k++) {
            const lat = -e.w / 2 + 0.6 + k * 1.2;
            const sx = cx - dz * lat, sz = cz + dx * lat;
            const yy = yAt(sx, sz) + 0.03;
            ch.mark.ribbon([[sx - dx * 1.5, yy, sz - dz * 1.5], [sx + dx * 1.5, yy, sz + dz * 1.5]], 0.6, 0xe8e6dc);
          }
        }
      }
    }

    for (const ch of chunks.values()) {
      if (!ch.walk.empty) { const m = ch.walk.toMesh(materials.sidewalk); m.receiveShadow = true; group.add(m); }
      if (!ch.road.empty) { const m = ch.road.toMesh(materials.asphalt); m.receiveShadow = true; group.add(m); }
      if (!ch.mark.empty) { const m = ch.mark.toMesh(materials.markings); m.receiveShadow = true; group.add(m); }
    }
    return group;
  }
}

/** Distancia mínima entre un segmento y un rectángulo AABB. */
export function segRectDist(ax, az, bx, bz, x0, z0, x1, z1) {
  const inside = (x, z) => x >= x0 && x <= x1 && z >= z0 && z <= z1;
  if (inside(ax, az) || inside(bx, bz)) return 0;
  const edges = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
  for (const [cx, cz, dx, dz] of edges) if (segIntersect(ax, az, bx, bz, cx, cz, dx, dz)) return 0;
  let d = Infinity;
  for (const [cx, cz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) d = Math.min(d, pointSegment(cx, cz, ax, az, bx, bz).d);
  const clampD = (px, pz) => Math.hypot(px - clamp(px, x0, x1), pz - clamp(pz, z0, z1));
  d = Math.min(d, clampD(ax, az), clampD(bx, bz));
  return d;
}

/** Distancia mínima entre un segmento y un polígono (0 si se cortan o está dentro). */
export function segPolyDist(ax, az, bx, bz, poly) {
  const n = poly.length / 2;
  const inside = (x, z) => {
    let c = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i * 2], zi = poly[i * 2 + 1], xj = poly[j * 2], zj = poly[j * 2 + 1];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
    }
    return c;
  };
  if (inside(ax, az) || inside(bx, bz)) return 0;
  let d = Infinity;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cx = poly[i * 2], cz = poly[i * 2 + 1], dx = poly[j * 2], dz = poly[j * 2 + 1];
    if (segIntersect(ax, az, bx, bz, cx, cz, dx, dz)) return 0;
    d = Math.min(d, pointSegment(cx, cz, ax, az, bx, bz).d, pointSegment(ax, az, cx, cz, dx, dz).d, pointSegment(bx, bz, cx, cz, dx, dz).d);
  }
  return d;
}
