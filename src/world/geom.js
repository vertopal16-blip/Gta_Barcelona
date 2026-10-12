// Constructor de geometría fusionada con colores por vértice + texturas procedurales.
// Agrupar miles de edificios en pocas mallas es clave para el rendimiento.

import * as THREE from 'three';
import { makeRng } from '../core/utils.js';

// Los colores hex se escriben en sRGB; los atributos de vértice deben ir en espacio lineal.
const _lin = new Map();
const _c = new THREE.Color();
export function hexToRgb(hex) {
  let v = _lin.get(hex);
  if (!v) { _c.setHex(hex); v = [_c.r, _c.g, _c.b]; _lin.set(hex, v); }
  return v;
}

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
    this.vcount = 0;
  }

  get empty() { return this.vcount === 0; }

  _v(x, y, z, nx, ny, nz, u, v, c) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
    return this.vcount++;
  }

  /** Cuadrilátero p0..p3 en sentido antihorario visto desde la normal. */
  quad(p0, p1, p2, p3, color, uvs = null, normal = null) {
    const c = Array.isArray(color) ? color : hexToRgb(color);
    let n = normal;
    if (!n) {
      const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
      const bx = p3[0] - p0[0], by = p3[1] - p0[1], bz = p3[2] - p0[2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      n = [nx / l, ny / l, nz / l];
    }
    const u = uvs || [0, 0, 1, 0, 1, 1, 0, 1];
    const i0 = this._v(p0[0], p0[1], p0[2], n[0], n[1], n[2], u[0], u[1], c);
    const i1 = this._v(p1[0], p1[1], p1[2], n[0], n[1], n[2], u[2], u[3], c);
    const i2 = this._v(p2[0], p2[1], p2[2], n[0], n[1], n[2], u[4], u[5], c);
    const i3 = this._v(p3[0], p3[1], p3[2], n[0], n[1], n[2], u[6], u[7], c);
    this.idx.push(i0, i1, i2, i0, i2, i3);
  }

  tri(p0, p1, p2, color, normal = null) {
    const c = Array.isArray(color) ? color : hexToRgb(color);
    let n = normal;
    if (!n) {
      const ax = p1[0] - p0[0], ay = p1[1] - p0[1], az = p1[2] - p0[2];
      const bx = p2[0] - p0[0], by = p2[1] - p0[1], bz = p2[2] - p0[2];
      let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const l = Math.hypot(nx, ny, nz) || 1;
      n = [nx / l, ny / l, nz / l];
    }
    const i0 = this._v(p0[0], p0[1], p0[2], n[0], n[1], n[2], 0, 0, c);
    const i1 = this._v(p1[0], p1[1], p1[2], n[0], n[1], n[2], 1, 0, c);
    const i2 = this._v(p2[0], p2[1], p2[2], n[0], n[1], n[2], 0, 1, c);
    this.idx.push(i0, i1, i2);
  }

  /**
   * Prisma vertical a partir de un polígono convexo/concavo (array [x,z,...] antihorario visto desde arriba).
   * Las paredes usan UV en metros / tamaño de celda de fachada; el techo opcional.
   */
  prism(poly, y0, y1, color, opts = {}) {
    const c = Array.isArray(color) ? color : hexToRgb(color);
    const cellW = opts.cellW || 3.4, cellH = opts.cellH || 3.2;
    const n = poly.length / 2;
    let acc = opts.uOffset || 0;
    const vOff = opts.vOffset || 0;
    if (opts.walls !== false) {
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = poly[i * 2], az = poly[i * 2 + 1];
        const bx = poly[j * 2], bz = poly[j * 2 + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.01) continue;
        // Normal exterior para polígono antihorario visto desde arriba (norte arriba)
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        const u0 = acc / cellW, u1 = (acc + len) / cellW;
        const v0 = vOff + 0, v1 = vOff + (y1 - y0) / cellH;
        this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], c,
          [u0, v0, u1, v0, u1, v1, u0, v1], [nx, 0, nz]);
        acc += len;
      }
    }
    if (opts.roof !== false && opts.roofBuilder !== null) {
      const rb = opts.roofBuilder || this;
      const rc = opts.roofColor !== undefined ? opts.roofColor : color;
      rb.polygonFlat(poly, y1, rc);
    }
  }

  /** Polígono horizontal (triangulado en abanico; válido para convexos). */
  polygonFlat(poly, y, color, down = false) {
    const c = Array.isArray(color) ? color : hexToRgb(color);
    const n = poly.length / 2;
    const ny = down ? -1 : 1;
    const base = this.vcount;
    for (let i = 0; i < n; i++) this._v(poly[i * 2], y, poly[i * 2 + 1], 0, ny, 0, poly[i * 2] / 8, poly[i * 2 + 1] / 8, c);
    for (let i = 1; i < n - 1; i++) {
      if (down) this.idx.push(base, base + i + 1, base + i);
      else this.idx.push(base, base + i, base + i + 1);
    }
  }

  /** Caja orientada: centro (x, y0 base, z), tamaño sx (ancho X local), sy alto, sz fondo, rotación ry. */
  box(x, y0, z, sx, sy, sz, color, ry = 0, opts = {}) {
    const poly = rectPoly(x, z, sx, sz, ry);
    this.prism(poly, y0, y0 + sy, color, opts);
    if (opts.bottom) this.polygonFlat(poly, y0, color, true);
  }

  /** Cilindro / cono truncado vertical. */
  cylinder(x, y0, z, rBottom, rTop, h, color, seg = 10, opts = {}) {
    const c = Array.isArray(color) ? color : hexToRgb(color);
    const y1 = y0 + h;
    const slope = (rBottom - rTop) / h;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const nl = Math.hypot(1, slope);
      const am = (a0 + a1) / 2;
      const n = [Math.cos(am) / nl, slope / nl, Math.sin(am) / nl];
      this.quad(
        [x + c0 * rBottom, y0, z + s0 * rBottom],
        [x + c0 * rTop, y1, z + s0 * rTop],
        [x + c1 * rTop, y1, z + s1 * rTop],
        [x + c1 * rBottom, y0, z + s1 * rBottom],
        c, [i / seg, 0, i / seg, h / 3, (i + 1) / seg, h / 3, (i + 1) / seg, 0], n);
    }
    if (opts.cap !== false && rTop > 0.001) {
      const poly = [];
      for (let i = seg - 1; i >= 0; i--) {
        const a = (i / seg) * Math.PI * 2;
        poly.push(x + Math.cos(a) * rTop, z + Math.sin(a) * rTop);
      }
      this.polygonFlat(poly, y1, c);
    }
  }

  /** Esfera (u otra forma de revolución con escala vertical). */
  sphere(x, y, z, r, color, seg = 10, rings = 6, sy = 1) {
    const c = Array.isArray(color) ? color : hexToRgb(color);
    const base = this.vcount;
    for (let j = 0; j <= rings; j++) {
      const v = j / rings;
      const phi = v * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const u = i / seg;
        const th = u * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
        this._v(x + nx * r, y + ny * r * sy, z + nz * r, nx, ny, nz, u, v, c);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i, b = a + seg + 1;
        this.idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }

  /** Superficie de revolución a partir de un perfil [[r, y], ...]. */
  lathe(x, z, profile, color, seg = 16, colorFn = null) {
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, y0] = profile[k], [r1, y1] = profile[k + 1];
      const col = colorFn ? colorFn(k, y0) : color;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        this.quad(
          [x + Math.cos(a0) * r0, y0, z + Math.sin(a0) * r0],
          [x + Math.cos(a0) * r1, y1, z + Math.sin(a0) * r1],
          [x + Math.cos(a1) * r1, y1, z + Math.sin(a1) * r1],
          [x + Math.cos(a1) * r0, y0, z + Math.sin(a1) * r0],
          col);
      }
    }
  }

  /** Banda que sigue una polilínea 3D (carreteras, caminos). */
  ribbon(points, width, color, uScale = 0.125) {
    const c = Array.isArray(color) ? color : hexToRgb(color);
    let acc = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay, az] = points[i], [bx, by, bz] = points[i + 1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const px = -(bz - az) / len * width / 2, pz = (bx - ax) / len * width / 2;
      const v0 = acc * uScale, v1 = (acc + len) * uScale;
      this.quad([ax - px, ay, az - pz], [ax + px, ay, az + pz], [bx + px, by, bz + pz], [bx - px, by, bz - pz], c,
        [0, v0, width * uScale, v0, width * uScale, v1, 0, v1], [0, 1, 0]);
      acc += len;
    }
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.vcount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  toMesh(material) {
    return new THREE.Mesh(this.toGeometry(), material);
  }
}

/** Rectángulo orientado como polígono antihorario (visto desde arriba). */
export function rectPoly(cx, cz, sx, sz, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const hx = sx / 2, hz = sz / 2;
  // Esquinas locales en orden antihorario visto desde +Y con Z al sur:
  const pts = [[-hx, hz], [hx, hz], [hx, -hz], [-hx, -hz]];
  const out = [];
  for (const [lx, lz] of pts) {
    // Rotación de three.js alrededor de Y: x' = x cos + z sin, z' = -x sin + z cos
    out.push(cx + lx * c + lz * s, cz - lx * s + lz * c);
  }
  return out;
}

/** Garantiza orientación antihoraria vista desde arriba (para normales exteriores). */
export function ensureCCW(poly) {
  let area = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += poly[i * 2] * poly[j * 2 + 1] - poly[j * 2] * poly[i * 2 + 1];
  }
  // Con Z hacia el sur, "antihorario visto desde arriba" equivale a área negativa en (x,z)
  if (area > 0) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(poly[i * 2], poly[i * 2 + 1]);
    return out;
  }
  return poly;
}

// ---------------------------------------------------------------------------
// Texturas procedurales (canvas)
// ---------------------------------------------------------------------------

function canvasTex(w, h, draw, repeat = true) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Fachadas: cada textura contiene 8x8 celdas (ventana por planta) para que las luces
 * nocturnas no se repitan de forma evidente. UV en celdas => repetición cada 8.
 */
function facadeTextures(style, seed) {
  const rng = makeRng(seed);
  const cells = 8, cw = 32, ch = 32;
  const W = cells * cw, H = cells * ch;
  const lit = [];
  for (let i = 0; i < cells * cells; i++) lit.push(rng() < 0.35);
  const drawWindow = (ctx, x, y, kind, emissive, on) => {
    switch (style) {
      case 'modernista': {
        // Ventana alta con balcón de forja
        ctx.fillStyle = emissive ? (on ? '#ffd890' : '#000') : '#3b3a40';
        ctx.fillRect(x + 9, y + 5, 14, 21);
        if (!emissive) {
          ctx.fillStyle = '#2a2420';
          ctx.fillRect(x + 6, y + 24, 20, 2);
          for (let k = 0; k < 5; k++) ctx.fillRect(x + 7 + k * 4, y + 20, 1, 5);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x + 2, y + 1, 28, 2);
        }
        break;
      }
      case 'gotic': {
        ctx.fillStyle = emissive ? (on ? '#ffc070' : '#000') : '#2d2a28';
        ctx.fillRect(x + 11, y + 7, 10, 17);
        if (!emissive) {
          ctx.fillStyle = '#5a4a3a';
          ctx.fillRect(x + 9, y + 6, 2, 19); ctx.fillRect(x + 21, y + 6, 2, 19);
          ctx.fillStyle = '#26211e';
          ctx.fillRect(x + 8, y + 24, 16, 2);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(x + (kind % 3) * 7, y + (kind % 5) * 5, 6, 3);
        }
        break;
      }
      case 'modern': {
        ctx.fillStyle = emissive ? (on ? '#cfe6ff' : '#000') : (kind % 2 ? '#4a6a85' : '#56789a');
        ctx.fillRect(x + 1, y + 3, 30, 25);
        if (!emissive) {
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          ctx.fillRect(x + 1, y + 3, 12, 25);
          ctx.fillStyle = '#c8ccd0';
          ctx.fillRect(x, y + 28, 32, 4);
        }
        break;
      }
      case 'industrial': {
        ctx.fillStyle = emissive ? (on ? '#ffe2a8' : '#000') : '#2f3438';
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 27); ctx.lineTo(x + 6, y + 12);
        ctx.arc(x + 16, y + 12, 10, Math.PI, 0); ctx.lineTo(x + 26, y + 27); ctx.closePath();
        ctx.fill();
        if (!emissive) {
          ctx.strokeStyle = '#6b6f72'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x + 16, y + 3); ctx.lineTo(x + 16, y + 27);
          ctx.moveTo(x + 6, y + 16); ctx.lineTo(x + 26, y + 16); ctx.stroke();
        }
        break;
      }
      default: { // residencial genérico
        ctx.fillStyle = emissive ? (on ? '#ffe0a0' : '#000') : '#33363b';
        ctx.fillRect(x + 8, y + 7, 16, 16);
        if (!emissive) {
          ctx.fillStyle = kind % 3 === 0 ? '#3d6b4a' : '#7b5a3a'; // persianas
          ctx.fillRect(x + 8, y + 7, 16, kind % 4 === 0 ? 10 : 4);
          ctx.fillStyle = '#2b2b2b';
          ctx.fillRect(x + 6, y + 23, 20, 2);
        }
      }
    }
  };
  const base = (ctx, emissive) => {
    if (emissive) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }
    // Muro claro: se tiñe con el color de vértice
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 1200; i++) {
      const v = 225 + Math.floor(rng() * 30);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(rng() * W, rng() * H, 2, 2);
    }
    if (style === 'industrial') {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    }
  };
  const map = canvasTex(W, H, (ctx) => {
    base(ctx, false);
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) drawWindow(ctx, i * cw, j * ch, i * 7 + j * 3, false, false);
    // Planta baja (fila inferior en v=0 → parte baja del canvas): portales y comercios
  });
  const emi = canvasTex(W, H, (ctx) => {
    base(ctx, true);
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) drawWindow(ctx, i * cw, j * ch, i, true, lit[j * cells + i]);
  });
  map.repeat.set(1 / cells, 1 / cells);
  emi.repeat.set(1 / cells, 1 / cells);
  return { map, emi };
}

function noiseTexture(size, base, variance, seed, extra) {
  const rng = makeRng(seed);
  return canvasTex(size, size, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < size * size * 0.25; i++) {
      const v = Math.floor(rng() * variance) - variance / 2;
      ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v / 255})` : `rgba(0,0,0,${-v / 255})`;
      ctx.fillRect(rng() * w, rng() * h, 1 + rng() * 2, 1 + rng() * 2);
    }
    if (extra) extra(ctx, w, h, rng);
  });
}

/** Baldosa "panot" de flor, icono de las aceras de Barcelona. */
function panotTexture() {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    const s = 64;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const x = i * s, y = j * s;
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      const cx = x + s / 2, cy = y + s / 2;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.ellipse(cx + Math.cos(a) * 13, cy + Math.sin(a) * 13, 11, 6, a, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
      for (const [qx, qy] of [[x, y], [x + s, y], [x, y + s], [x + s, y + s]]) {
        ctx.beginPath(); ctx.arc(qx, qy, 9, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
}

/** Mapa de normales de oleaje (ruido suave). */
function waveNormalMap() {
  const N = 128;
  const rng = makeRng(77);
  const h = new Float32Array(N * N);
  const waves = Array.from({ length: 14 }, () => ({ kx: Math.round(rng.range(-6, 6)), kz: Math.round(rng.range(-6, 6)), a: rng.range(0.3, 1), p: rng() * 6.28 }));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0;
    for (const w of waves) v += w.a * Math.sin((w.kx * x + w.kz * y) / N * Math.PI * 2 + w.p);
    h[y * N + x] = v;
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h[y * N + (x + 1) % N] - h[y * N + (x - 1 + N) % N];
    const dy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
    const nx = -dx * 0.15, ny = -dy * 0.15, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const k = (y * N + x) * 4;
    img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255; img.data[k + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

let _materials = null;

/** Materiales compartidos de la ciudad. */
export function getMaterials() {
  if (_materials) return _materials;
  const m = {};
  const styles = ['residencial', 'modernista', 'gotic', 'modern', 'industrial'];
  m.facades = {};
  m.facadeMats = [];
  styles.forEach((s, i) => {
    const t = facadeTextures(s, 1000 + i * 77);
    const mat = new THREE.MeshLambertMaterial({
      map: t.map, vertexColors: true, emissiveMap: t.emi, emissive: 0xffffff, emissiveIntensity: 0,
    });
    m.facades[s] = mat;
    m.facadeMats.push(mat);
  });
  m.plain = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.plainDouble = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  m.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.asphalt = new THREE.MeshLambertMaterial({
    vertexColors: true,
    map: noiseTexture(128, '#ffffff', 60, 5),
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  m.sidewalk = new THREE.MeshLambertMaterial({
    vertexColors: true, map: panotTexture(),
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  m.markings = new THREE.MeshLambertMaterial({
    vertexColors: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  m.ground = new THREE.MeshLambertMaterial({ vertexColors: true, map: noiseTexture(256, '#ffffff', 50, 9) });
  m.water = new THREE.MeshPhongMaterial({
    color: 0x1f6a92, specular: 0xbfe4ff, shininess: 90, transparent: true, opacity: 0.9,
    map: noiseTexture(256, '#ffffff', 40, 13),
    normalMap: waveNormalMap(), normalScale: new THREE.Vector2(0.6, 0.6),
  });
  m.water.map.repeat.set(60, 60);
  m.water.normalMap.repeat.set(220, 220);
  m.glass = new THREE.MeshPhongMaterial({ color: 0x22313d, specular: 0x8899aa, shininess: 80, transparent: true, opacity: 0.85 });
  _materials = m;
  return m;
}

/** Ajusta la iluminación nocturna de ventanas (0..1). */
export function setNightFactor(f) {
  const m = getMaterials();
  for (const mat of m.facadeMats) mat.emissiveIntensity = f * 0.55;
}
