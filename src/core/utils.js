// Utilidades matemáticas y generador pseudoaleatorio determinista.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
};
export const dist2Sq = (ax, az, bx, bz) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};
/** Normaliza un ángulo a [-PI, PI]. */
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
/** Aproxima un valor hacia otro con una velocidad máxima. */
export const approach = (v, target, maxDelta) => {
  if (v < target) return Math.min(v + maxDelta, target);
  return Math.max(v - maxDelta, target);
};
/** Interpolación exponencial independiente del framerate. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

/** Distancia de un punto a un segmento en 2D, devuelve {d, t, x, z}. */
export function pointSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? ((px - ax) * abx + (pz - az) * abz) / len2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + abx * t, z = az + abz * t;
  return { d: Math.hypot(px - x, pz - z), t, x, z };
}

/** Intersección de segmentos 2D. Devuelve {t, u} o null. */
export function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = cx - ax, qz = cz - az;
  const t = (qx * sz - qz * sx) / den;
  const u = (qx * rz - qz * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

/** Generador pseudoaleatorio mulberry32. */
export function makeRng(seed) {
  let s = seed >>> 0;
  const rng = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a, b) => a + (b - a) * rng();
  rng.int = (a, b) => Math.floor(a + (b - a + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.chance = (p) => rng() < p;
  return rng;
}

export const rand = makeRng(Date.now() & 0xffffffff);

/** Elige un elemento según pesos [{w, ...}] o pares [valor, peso]. */
export function weightedPick(rng, pairs) {
  let total = 0;
  for (const p of pairs) total += p[1];
  let r = rng() * total;
  for (const p of pairs) {
    r -= p[1];
    if (r <= 0) return p[0];
  }
  return pairs[pairs.length - 1][0];
}

export function formatMoney(v) {
  return Math.round(v).toLocaleString('es-ES') + ' €';
}

export function hexToRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

/** Varía ligeramente un color hex. */
export function jitterColor(hex, rng, amount = 0.08) {
  const [r, g, b] = hexToRgb(hex);
  const k = 1 + (rng() * 2 - 1) * amount;
  const f = (c) => clamp(Math.round(c * k * 255), 0, 255);
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

/** Punto dentro de polígono (array plano [x,z,x,z...]). */
export function pointInPoly(x, z, poly) {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2], zi = poly[i * 2 + 1];
    const xj = poly[j * 2], zj = poly[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Cola de prioridad binaria mínima. */
export class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item, pri) {
    const a = this.a;
    a.push({ item, pri });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].pri <= a[i].pri) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].pri < a[m].pri) m = l;
        if (r < a.length && a[r].pri < a[m].pri) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.item;
  }
}
