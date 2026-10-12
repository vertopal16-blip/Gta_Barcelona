// Mundo de colisiones 2.5D: polígonos convexos en XZ con rango de altura.
// Suficiente para un mundo urbano (edificios, muros, mobiliario) y muy rápido.

const CELL = 24;

export class CollisionWorld {
  constructor() {
    this.grid = new Map();
    this.list = [];
    this.queryId = 0;
  }

  /** Añade un polígono convexo antihorario (visto desde arriba) [x,z,...]. */
  addPoly(poly, y0, y1, tag = 'building', data = null) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < poly.length; i += 2) {
      x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]);
      z0 = Math.min(z0, poly[i + 1]); z1 = Math.max(z1, poly[i + 1]);
    }
    // Normales exteriores por arista
    const n = poly.length / 2;
    const normals = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = poly[j * 2] - poly[i * 2], dz = poly[j * 2 + 1] - poly[i * 2 + 1];
      const l = Math.hypot(dx, dz) || 1;
      normals.push(-dz / l, dx / l);
    }
    const c = { poly, normals, y0, y1, x0, x1, z0, z1, tag, data, q: 0 };
    this.list.push(c);
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = gx * 73856093 ^ gz * 19349663;
        let l = this.grid.get(k);
        if (!l) { l = []; this.grid.set(k, l); }
        l.push(c);
      }
    }
    return c;
  }

  addBox(cx, cz, sx, sz, ry, y0, y1, tag, data) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const hx = sx / 2, hz = sz / 2;
    const poly = [];
    for (const [lx, lz] of [[-hx, hz], [hx, hz], [hx, -hz], [-hx, -hz]]) poly.push(cx + lx * c + lz * s, cz - lx * s + lz * c);
    return this.addPoly(poly, y0, y1, tag, data);
  }

  addCircle(cx, cz, r, y0, y1, tag, seg = 8) {
    const poly = [];
    for (let i = seg - 1; i >= 0; i--) {
      const a = (i / seg) * Math.PI * 2;
      poly.push(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
    }
    return this.addPoly(poly, y0, y1, tag);
  }

  query(x0, z0, x1, z1) {
    this.queryId++;
    const out = [];
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const l = this.grid.get(gx * 73856093 ^ gz * 19349663);
        if (!l) continue;
        for (const c of l) {
          if (c.q === this.queryId) continue;
          c.q = this.queryId;
          if (c.x1 < x0 || c.x0 > x1 || c.z1 < z0 || c.z0 > z1) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  /**
   * Empuja un círculo (x,z,r) fuera de los colisionadores en el rango de altura [y, y+h].
   * Devuelve {x, z, hit, nx, nz, depth, collider}.
   */
  resolveCircle(x, z, r, y, h, ignoreTag = null) {
    let hit = false, nxs = 0, nzs = 0, maxDepth = 0, hc = null;
    for (let iter = 0; iter < 3; iter++) {
      const cands = this.query(x - r, z - r, x + r, z + r);
      let moved = false;
      for (const c of cands) {
        if (c.tag === ignoreTag) continue;
        if (y + h < c.y0 || y > c.y1 - 0.05) continue;
        const res = circlePoly(x, z, r, c);
        if (res) {
          x += res.nx * res.depth;
          z += res.nz * res.depth;
          nxs += res.nx; nzs += res.nz;
          if (res.depth > maxDepth) { maxDepth = res.depth; hc = c; }
          hit = true; moved = true;
        }
      }
      if (!moved) break;
    }
    const l = Math.hypot(nxs, nzs) || 1;
    return { x, z, hit, nx: nxs / l, nz: nzs / l, depth: maxDepth, collider: hc };
  }

  /** Altura del techo de colisionador bajo el punto (para subirse a cosas). */
  topAt(x, z, y, maxStep = 0.6) {
    let best = -Infinity;
    for (const c of this.query(x, z, x, z)) {
      if (c.y1 > y + maxStep) continue;
      if (pointInConvex(x, z, c)) best = Math.max(best, c.y1);
    }
    return best;
  }

  /** Rayo 3D contra los colisionadores. Devuelve distancia o Infinity. */
  raycast(ox, oy, oz, dx, dy, dz, maxD) {
    const hl = Math.hypot(dx, dz);
    if (hl < 1e-6) return Infinity;
    // Recorre el rayo por celdas (DDA simplificado con pasos de media celda)
    let best = maxD;
    const step = CELL * 0.5;
    const tested = new Set();
    for (let t = 0; t <= Math.min(best, maxD) + step; t += step) {
      const px = ox + dx * t, pz = oz + dz * t;
      const cands = this.query(px - step, pz - step, px + step, pz + step);
      for (const c of cands) {
        if (tested.has(c)) continue;
        tested.add(c);
        const d = rayPoly(ox, oy, oz, dx, dy, dz, c);
        if (d < best) best = d;
      }
      if (best < t) break;
    }
    return best < maxD ? best : Infinity;
  }
}

function pointInConvex(x, z, c) {
  const p = c.poly, n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const d = (x - p[i * 2]) * c.normals[i * 2] + (z - p[i * 2 + 1]) * c.normals[i * 2 + 1];
    if (d > 0) return false;
  }
  return true;
}

/** Círculo contra polígono convexo. */
function circlePoly(x, z, r, c) {
  const p = c.poly, n = p.length / 2, N = c.normals;
  let maxSep = -Infinity, maxI = -1;
  for (let i = 0; i < n; i++) {
    const sep = (x - p[i * 2]) * N[i * 2] + (z - p[i * 2 + 1]) * N[i * 2 + 1];
    if (sep > r) return null;
    if (sep > maxSep) { maxSep = sep; maxI = i; }
  }
  if (maxSep < 0) {
    // Centro dentro: sale por la arista de menor penetración
    return { nx: N[maxI * 2], nz: N[maxI * 2 + 1], depth: r - maxSep };
  }
  // Punto más cercano del contorno
  let bestD = Infinity, bx = 0, bz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = p[i * 2], az = p[i * 2 + 1], ex = p[j * 2] - ax, ez = p[j * 2 + 1] - az;
    const l2 = ex * ex + ez * ez;
    let t = l2 > 0 ? ((x - ax) * ex + (z - az) * ez) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + ex * t, qz = az + ez * t;
    const d = (x - qx) ** 2 + (z - qz) ** 2;
    if (d < bestD) { bestD = d; bx = qx; bz = qz; }
  }
  const d = Math.sqrt(bestD);
  if (d >= r) return null;
  if (d < 1e-6) return { nx: N[maxI * 2], nz: N[maxI * 2 + 1], depth: r };
  return { nx: (x - bx) / d, nz: (z - bz) / d, depth: r - d };
}

/** Rayo 3D contra prisma convexo. */
function rayPoly(ox, oy, oz, dx, dy, dz, c) {
  // Slab test sobre aristas (Cyrus-Beck) + rango vertical
  let tmin = 0, tmax = Infinity;
  const p = c.poly, n = p.length / 2, N = c.normals;
  for (let i = 0; i < n; i++) {
    const nx = N[i * 2], nz = N[i * 2 + 1];
    const num = (p[i * 2] - ox) * nx + (p[i * 2 + 1] - oz) * nz;
    const den = dx * nx + dz * nz;
    if (Math.abs(den) < 1e-9) {
      if (num < 0) return Infinity;
    } else {
      const t = num / den;
      if (den < 0) tmin = Math.max(tmin, t); else tmax = Math.min(tmax, t);
      if (tmin > tmax) return Infinity;
    }
  }
  if (Math.abs(dy) < 1e-9) {
    if (oy < c.y0 || oy > c.y1) return Infinity;
  } else {
    let t0 = (c.y0 - oy) / dy, t1 = (c.y1 - oy) / dy;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tmin = Math.max(tmin, t0); tmax = Math.min(tmax, t1);
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
