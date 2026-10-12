// Geografía de la Barcelona condensada.
// Sistema de coordenadas: X = este, Z = sur (el mar está al sur), Y = altura.
// 1 unidad = 1 metro. La ciudad está comprimida ~1:3 respecto a la real,
// conservando la posición relativa de barrios, ejes y monumentos.

import { clamp, smoothstep, dist2 } from '../core/utils.js';

export const MAP = { minX: -1300, maxX: 1250, minZ: -1050, maxZ: 1000 };
export const SEA_LEVEL = -0.8;

export const MONTJUIC = { x: -480, z: 330, r: 270, top: 40, h: 88 };
export const TIBIDABO_SLOPE_Z = -650;

/** Avinguda Diagonal: cruza la ciudad de noroeste a sureste hasta Glòries y el mar. */
export function diagonalZ(x) {
  if (x <= 640) return -760 + (x + 1000) * 0.4122;
  return -84 + (x - 640) * 0.45; // tras Glòries continúa hacia Diagonal Mar
}

/** Avinguda del Paral·lel: de Plaça d'Espanya al puerto. */
export const PARALLEL = { ax: -580, az: -84, bx: -140, bz: 430 };
export function parallelX(z) {
  const t = (z - PARALLEL.az) / (PARALLEL.bz - PARALLEL.az);
  return PARALLEL.ax + (PARALLEL.bx - PARALLEL.ax) * t;
}

/** Línea de costa: z a partir de la cual empieza el mar para una x dada. */
export function coastZ(x) {
  if (x < -200) return 880;
  if (x < -140) return 880 - (x + 200) / 60 * 430;
  if (x < 290) return 450;
  if (x < 310) return 450 + (x - 290) / 20 * 210;
  if (x < 520) return 660;
  if (x < 560) return 660 - (x - 520) / 40 * 190;
  return 470;
}

// Zonas de tierra adicionales (muelles, espigones)
export const LAND_EXTRA = [
  { x0: 60, x1: 210, z0: 445, z1: 640, name: "Moll d'Espanya" },
  { x0: 8, x1: 62, z0: 446, z1: 462, name: 'Rambla de Mar' },
  { x0: 380, x1: 470, z0: 655, z1: 725, name: 'Espigó de la Barceloneta' },
  { x0: 860, x1: 880, z0: 465, z1: 560, name: 'Port Olímpic' },
  { x0: 940, x1: 960, z0: 465, z1: 560, name: 'Port Olímpic' },
  { x0: -1250, x1: -260, z0: 875, z1: 960, name: 'Moll Zona Franca' },
];

export function inLandExtra(x, z) {
  for (const r of LAND_EXTRA) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
  return false;
}

export function isWater(x, z) {
  if (x < MAP.minX + 2 || x > MAP.maxX - 2 || z < MAP.minZ + 2) return false;
  if (z > MAP.maxZ - 2) return true;
  return z > coastZ(x) && !inLandExtra(x, z);
}

export function montjuicDist(x, z) { return dist2(x, z, MONTJUIC.x, MONTJUIC.z); }

/** Rampas para saltos acrobáticos: {x, z, h (rumbo), len, wid, height}. */
export const RAMPS = [];

function rampHeight(x, z) {
  for (const r of RAMPS) {
    const dx = x - r.x, dz = z - r.z;
    if (Math.abs(dx) > r.len || Math.abs(dz) > r.len) continue;
    const fx = Math.sin(r.h), fz = Math.cos(r.h);
    const lf = dx * fx + dz * fz, ls = -dx * fz + dz * fx;
    if (Math.abs(ls) > r.wid / 2 || Math.abs(lf) > r.len / 2) continue;
    return r.height * (lf + r.len / 2) / r.len;
  }
  return 0;
}

/** Altura del terreno. Montjuïc es una colina con meseta (castillo) y el norte sube hacia Collserola. */
export function groundHeight(x, z) {
  let h = RAMPS.length ? rampHeight(x, z) : 0;
  const d = montjuicDist(x, z);
  if (d < MONTJUIC.r) h += MONTJUIC.h * smoothstep(MONTJUIC.r, MONTJUIC.top, d);
  if (z < TIBIDABO_SLOPE_Z) h += (TIBIDABO_SLOPE_Z - z) * 0.045;
  // Fondo marino
  if (!inLandExtra(x, z)) {
    const c = coastZ(x);
    if (z > c) h = Math.min(h, -4 * clamp((z - c) / 10, 0.05, 1));
  }
  return h;
}

/** Normal aproximada del terreno. */
export function groundNormal(x, z) {
  const e = 1.5;
  const hx = groundHeight(x + e, z) - groundHeight(x - e, z);
  const hz = groundHeight(x, z + e) - groundHeight(x, z - e);
  const nx = -hx, ny = 2 * e, nz = -hz;
  const l = Math.hypot(nx, ny, nz);
  return { x: nx / l, y: ny / l, z: nz / l };
}

export function isBeach(x, z) {
  if (inLandExtra(x, z)) return false;
  const c = coastZ(x);
  if (x >= 560 && x <= 1240 && z > 428 && z <= c + 2) return !(x > 855 && x < 965);
  if (x >= 488 && x < 560 && z > 425 && z <= c + 2) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Barrios
// ---------------------------------------------------------------------------
export const DISTRICTS = {
  eixample: { name: "L'Eixample", color: '#d9a066' },
  gotic: { name: 'Barri Gòtic', color: '#b0a089' },
  raval: { name: 'El Raval', color: '#c97b63' },
  born: { name: 'El Born', color: '#c49a6c' },
  barceloneta: { name: 'La Barceloneta', color: '#6fb7d6' },
  gracia: { name: 'Gràcia', color: '#e0b04c' },
  poblenou: { name: 'Poblenou', color: '#a86a4f' },
  sants: { name: 'Sants', color: '#9d8fb5' },
  montjuic: { name: 'Montjuïc', color: '#6aa35a' },
  zonafranca: { name: 'Zona Franca', color: '#8a8f96' },
  lescorts: { name: 'Les Corts', color: '#7aa0c4' },
  vilaolimpica: { name: 'La Vila Olímpica', color: '#5fb3a1' },
  poblesec: { name: 'Poble-sec', color: '#c98f5a' },
  port: { name: 'Port Vell', color: '#4a7fa8' },
  mar: { name: 'Mar Mediterrània', color: '#2c5f8a' },
};

export function districtAt(x, z) {
  if (isWater(x, z)) return (x > -200 && x < 300 && z < 900) ? 'port' : 'mar';
  const dm = montjuicDist(x, z);
  if (dm < 215) return 'montjuic';
  if ((z > 600 && x < -200) || (x < -740 && z > 60)) return 'zonafranca';
  if (x >= 60 && x <= 210 && z > 445) return 'port';
  if (x >= 300 && x < 560 && z > 405) return 'barceloneta';
  if (x >= 560 && x < 900 && z > 170) return 'vilaolimpica';
  if (x >= 640) return 'poblenou';
  if (z > 44 && z < 460) {
    if (x < 0 && x >= -300 && x > parallelX(z)) return 'raval';
    if (x < 0) return 'poblesec';
    if (x < 190) return 'gotic';
    return 'born';
  }
  if (x < -460) {
    if (z < Math.max(-480, diagonalZ(x))) return 'lescorts';
    return 'sants';
  }
  if (x > -290 && x < 230 && z < diagonalZ(x) - 6) return 'gracia';
  return 'eixample';
}
