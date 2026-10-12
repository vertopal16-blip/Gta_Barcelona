// Trazado urbano de la Barcelona condensada.
// Cada barrio tiene su propia trama (la cuadrícula de Cerdà del Eixample, el laberinto
// del Gòtic, las manzanas alargadas de la Barceloneta...) y todos se conectan mediante
// los grandes ejes reales: Gran Via, Diagonal, Paral·lel, Passeig de Gràcia, Rondas, etc.

import { makeRng } from '../core/utils.js';
import { diagonalZ, PARALLEL, MONTJUIC, districtAt, isWater, montjuicDist } from './terrain.js';

export const ROAD_TYPES = {
  highway: { w: 20, speed: 19, lanes: 2, sidewalk: 0, prio: 6 },
  avenue: { w: 22, speed: 15, lanes: 2, sidewalk: 4.5, prio: 5 },
  street: { w: 13, speed: 12, lanes: 1, sidewalk: 3.5, prio: 4 },
  mountain: { w: 10, speed: 12, lanes: 1, sidewalk: 1.5, prio: 3 },
  local: { w: 9.5, speed: 9, lanes: 1, sidewalk: 2.5, prio: 2 },
  narrow: { w: 6.5, speed: 6.5, lanes: 1, sidewalk: 1.3, prio: 1 },
  promenade: { w: 16, speed: 0, lanes: 0, sidewalk: 0, prio: 0, noTraffic: true },
};

// Zonas reservadas (sin edificios genéricos): parques, plazas y monumentos
export const ZONES = [
  { id: 'placaCatalunya', kind: 'plaza', rect: [-57, -13, 57, 37], name: 'Plaça de Catalunya' },
  { id: 'sagradaFamilia', kind: 'landmark', rect: [320, -404, 384, -340], name: 'Sagrada Família' },
  { id: 'placaGaudi', kind: 'park', rect: [260, -400, 316, -344], name: 'Plaça Gaudí' },
  { id: 'placaSF', kind: 'park', rect: [388, -400, 444, -344], name: 'Plaça de la Sagrada Família' },
  { id: 'ciutadella', kind: 'park', rect: [440, 54, 632, 404], name: 'Parc de la Ciutadella' },
  { id: 'placaEspanya', kind: 'plaza', circle: [-580, -84, 34], name: "Plaça d'Espanya" },
  { id: 'glories', kind: 'park', circle: [640, -84, 44], name: 'Plaça de les Glòries' },
  { id: 'torreGlories', kind: 'landmark', circle: [712, -150, 22], name: 'Torre Glòries' },
  { id: 'colon', kind: 'plaza', circle: [0, 436, 11], name: 'Mirador de Colom' },
  { id: 'montjuic', kind: 'park', circle: [MONTJUIC.x, MONTJUIC.z, 215], name: 'Montjuïc' },
  { id: 'mnac', kind: 'landmark', rect: [-650, 160, -510, 240], name: 'Palau Nacional' },
  { id: 'fontMagica', kind: 'plaza', rect: [-610, 95, -550, 150], name: 'Font Màgica' },
  { id: 'estadi', kind: 'landmark', rect: [-950, -850, -750, -670], name: 'Estadi de Les Corts' },
  { id: 'parkGuell', kind: 'park', circle: [90, -935, 75], name: 'Park Güell' },
  { id: 'catedral', kind: 'landmark', rect: [78, 150, 132, 205], name: 'Catedral de Barcelona' },
  { id: 'placaReial', kind: 'plaza', rect: [28, 300, 70, 338], name: 'Plaça Reial' },
  { id: 'santJaume', kind: 'plaza', rect: [100, 232, 132, 258], name: 'Plaça de Sant Jaume' },
  { id: 'boqueria', kind: 'landmark', rect: [-44, 168, -11, 206], name: 'Mercat de la Boqueria' },
  { id: 'macba', kind: 'landmark', rect: [-165, 105, -95, 145], name: 'MACBA' },
  { id: 'placaMacba', kind: 'plaza', rect: [-165, 145, -95, 178], name: 'Plaça dels Àngels' },
  { id: 'ramblaRaval', kind: 'plaza', rect: [-145, 250, -110, 370], name: 'Rambla del Raval' },
  { id: 'santaMaria', kind: 'landmark', rect: [285, 240, 318, 290], name: 'Santa Maria del Mar' },
  { id: 'mercatBorn', kind: 'landmark', rect: [330, 140, 390, 180], name: 'Mercat del Born' },
  { id: 'placaSol', kind: 'plaza', rect: [-95, -625, -55, -590], name: 'Plaça del Sol' },
  { id: 'placaVila', kind: 'plaza', rect: [35, -505, 75, -475], name: 'Plaça de la Vila de Gràcia' },
  { id: 'casaBatllo', kind: 'landmark', rect: [15, -192, 30, -174], name: 'Casa Batlló' },
  { id: 'pedrera', kind: 'landmark', rect: [15, -332, 38, -308], name: 'La Pedrera' },
  { id: 'twinA', kind: 'landmark', rect: [742, 355, 778, 395], name: 'Hotel Arts' },
  { id: 'twinB', kind: 'landmark', rect: [812, 355, 848, 395], name: 'Torre Mapfre' },
  { id: 'hospital', kind: 'landmark', rect: [572, 300, 640, 370], name: 'Hospital del Mar' },
  { id: 'comisaria', kind: 'landmark', rect: [198, 235, 232, 270], name: 'Comisaría Via Laietana' },
  { id: 'estacioSants', kind: 'landmark', rect: [-830, -250, -690, -190], name: 'Estació de Sants' },
  { id: 'maremagnum', kind: 'landmark', rect: [60, 445, 210, 640], name: "Moll d'Espanya" },
  { id: 'hotelW', kind: 'landmark', rect: [380, 655, 470, 725], name: 'Hotel Vela' },
  { id: 'arenas', kind: 'landmark', circle: [-640, -150, 30], name: 'Les Arenes' },
  { id: 'calatrava', kind: 'landmark', circle: [-610, 300, 20], name: 'Torre de Montjuïc' },
  { id: 'estadiOlimpic', kind: 'landmark', rect: [-560, 360, -440, 440], name: 'Estadi Olímpic' },
  { id: 'vilaClock', kind: 'plaza', rect: [-20, -470, 20, -440], name: 'Plaça de la Llibertat' },
];

export function zoneAt(x, z, kinds = null) {
  for (const zn of ZONES) {
    if (kinds && !kinds.includes(zn.kind)) continue;
    if (zn.rect) {
      const [x0, z0, x1, z1] = zn.rect;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return zn;
    } else {
      const [cx, cz, r] = zn.circle;
      if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) return zn;
    }
  }
  return null;
}

/** ¿Un rectángulo AABB se solapa con alguna zona reservada? */
export function rectHitsZone(x0, z0, x1, z1, margin = 0) {
  for (const zn of ZONES) {
    if (zn.rect) {
      const [a0, b0, a1, b1] = zn.rect;
      if (x1 + margin > a0 && x0 - margin < a1 && z1 + margin > b0 && z0 - margin < b1) return zn;
    } else {
      const [cx, cz, r] = zn.circle;
      const px = Math.max(x0, Math.min(cx, x1)), pz = Math.max(z0, Math.min(cz, z1));
      if ((px - cx) ** 2 + (pz - cz) ** 2 < (r + margin) ** 2) return zn;
    }
  }
  return null;
}

export const ROUNDABOUTS = [
  { x: -580, z: -84, r: 40, type: 'avenue', w: 14, name: "Plaça d'Espanya" },
  { x: 640, z: -84, r: 52, type: 'avenue', w: 14, name: 'Glòries' },
  { x: 0, z: 436, r: 18, type: 'street', w: 11, name: 'Colom' },
];

/** Genera la red de calles y las manzanas (celdas) de cada barrio. */
export function buildLayout(seed = 1714) {
  const rng = makeRng(seed);
  const segs = [];
  const grids = [];
  const add = (ax, az, bx, bz, type, name = '', w = null) => {
    segs.push({ ax, az, bx, bz, type, w: w || ROAD_TYPES[type].w, name });
  };
  const poly = (pts, type, name, w) => {
    for (let i = 0; i < pts.length - 1; i++) add(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], type, name, w);
  };

  /** Líneas con espaciado irregular. */
  const irregular = (from, to, minStep, maxStep) => {
    const out = [from];
    let v = from;
    while (true) {
      v += rng.range(minStep, maxStep);
      if (v >= to - minStep * 0.6) break;
      out.push(v);
    }
    out.push(to);
    return out;
  };

  /**
   * Cuadrícula de calles. inRegion decide qué nodos pertenecen al barrio.
   * removeProb elimina tramos interiores, creando callejones peatonales y manzanas irregulares.
   */
  const grid = (o) => {
    const { xs, zs, inRegion, type, district, removeProb = 0, skipX = [], skipZ = [], jitter = 0, w } = o;
    const J = (i, j) => {
      if (!jitter) return [xs[i], zs[j]];
      const r = makeRng(i * 7919 + j * 104729 + seed);
      const edge = i === 0 || j === 0 || i === xs.length - 1 || j === zs.length - 1;
      return edge ? [xs[i], zs[j]] : [xs[i] + r.range(-jitter, jitter), zs[j] + r.range(-jitter, jitter)];
    };
    const inR = (p) => inRegion(p[0], p[1]);
    for (let i = 0; i < xs.length; i++) {
      for (let j = 0; j < zs.length; j++) {
        const p = J(i, j);
        // tramo horizontal
        if (i + 1 < xs.length && !skipZ.some((s) => Math.abs(s - zs[j]) < 0.5)) {
          const q = J(i + 1, j);
          const border = j === 0 || j === zs.length - 1;
          if ((inR(p) || inR(q)) && !(removeProb && !border && rng() < removeProb)) {
            if (!zoneBlocks((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) add(p[0], p[1], q[0], q[1], type, '', w);
          }
        }
        // tramo vertical
        if (j + 1 < zs.length && !skipX.some((s) => Math.abs(s - xs[i]) < 0.5)) {
          const q = J(i, j + 1);
          const border = i === 0 || i === xs.length - 1;
          if ((inR(p) || inR(q)) && !(removeProb && !border && rng() < removeProb)) {
            if (!zoneBlocks((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) add(p[0], p[1], q[0], q[1], type, '', w);
          }
        }
      }
    }
    // Celdas (manzanas) para colocar edificios
    const cells = [];
    for (let i = 0; i + 1 < xs.length; i++) {
      for (let j = 0; j + 1 < zs.length; j++) {
        const a = J(i, j), b = J(i + 1, j + 1);
        const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
        if (!inRegion(cx, cz)) continue;
        cells.push({ x0: Math.min(a[0], b[0]), z0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), z1: Math.max(a[1], b[1]), district });
      }
    }
    grids.push({ district, type, cells, w: w || ROAD_TYPES[type].w });
  };

  // Tramos en zonas verdes/plazas no se generan (excepto montañas, que tienen su propia red)
  const zoneBlocks = (x, z) => {
    const zn = zoneAt(x, z, ['park', 'plaza', 'landmark']);
    return zn && zn.id !== 'montjuic';
  };

  // -------------------------------------------------------------------------
  // Grandes ejes
  // -------------------------------------------------------------------------
  add(-1290, -84, 1240, -84, 'avenue', 'Gran Via de les Corts Catalanes', 24);
  const diagPts = [];
  for (let x = -1290; x <= 1240; x += 60) diagPts.push([x, diagonalZ(x)]);
  diagPts.push([1240, diagonalZ(1240)]);
  poly(diagPts, 'avenue', 'Avinguda Diagonal', 26);
  add(PARALLEL.ax, PARALLEL.az, PARALLEL.bx, PARALLEL.bz, 'avenue', 'Avinguda del Paral·lel', 20);
  add(0, -20, 0, diagonalZ(0), 'avenue', 'Passeig de Gràcia', 22);
  add(0, diagonalZ(0), 0, -1000, 'street', 'Carrer Gran de Gràcia', 11);
  add(0, 44, 0, 436, 'promenade', 'La Rambla', 16);
  add(190, 44, 190, 430, 'street', 'Via Laietana', 14);
  add(-460, 44, 640, 44, 'avenue', 'Ronda de Sant Pere', 16);
  add(-300, 44, -300, 264, 'street', 'Ronda de Sant Pau', 13);
  poly([[1240, 415], [640, 415], [560, 415], [310, 425], [190, 430], [0, 436], [-140, 430],
    [-200, 520], [-260, 640], [-500, 690], [-800, 670], [-1290, 670]], 'highway', 'Ronda del Litoral', 20);
  add(512, -84, 512, 44, 'promenade', 'Passeig de Lluís Companys', 18);
  add(310, 425, 310, 650, 'avenue', 'Passeig de Joan de Borbó', 14);
  add(522, 415, 522, 650, 'local', 'Passeig Marítim', 10);
  add(310, 650, 522, 650, 'local', 'Carrer del Almirall Cervera', 9);
  add(430, 44, 430, 418, 'street', 'Passeig de Picasso', 12);
  add(640, -84, 640, 415, 'street', 'Carrer de Wellington', 14);
  poly([[640, -84], [760, -330], [880, -620], [960, -1000]], 'avenue', 'Avinguda Meridiana', 22);
  add(-580, -84, -580, 140, 'avenue', 'Avinguda de la Reina Maria Cristina', 18);
  add(-900, -84, -900, 670, 'street', 'Passeig de la Zona Franca', 14);
  add(-1290, -560, 640, -560, 'street', 'Travessera de Gràcia', 12);
  add(960, -84, 960, 415, 'promenade', 'Rambla del Poblenou', 16);
  add(-64, -20, -64, diagonalZ(-64), 'avenue', 'Rambla de Catalunya', 18);

  // Rotondas
  for (const rb of ROUNDABOUTS) {
    const n = 16, pts = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([rb.x + Math.cos(a) * rb.r, rb.z + Math.sin(a) * rb.r]);
    }
    poly(pts, rb.type, rb.name, rb.w);
  }

  // Montjuïc: carretera de circunvalación y subida en espiral al castillo
  {
    const n = 40, ring = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      ring.push([MONTJUIC.x + Math.cos(a) * 238, MONTJUIC.z + Math.sin(a) * 238]);
    }
    poly(ring, 'mountain', 'Passeig de Montjuïc', 11);
    const sx = -580, sz = 140;
    const a0 = Math.atan2(sz - MONTJUIC.z, sx - MONTJUIC.x);
    const r0 = Math.hypot(sx - MONTJUIC.x, sz - MONTJUIC.z);
    const spiral = [[sx, sz]];
    const N = 56, turns = 1.55;
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const a = a0 + t * turns * Math.PI * 2;
      const r = r0 + (46 - r0) * t;
      spiral.push([MONTJUIC.x + Math.cos(a) * r, MONTJUIC.z + Math.sin(a) * r]);
    }
    poly(spiral, 'mountain', 'Carretera del Castell', 10);
  }

  // -------------------------------------------------------------------------
  // Barrios
  // -------------------------------------------------------------------------
  // L'Eixample: cuadrícula de Cerdà
  {
    const xs = [], zs = [];
    for (let i = -7; i <= 10; i++) xs.push(i * 64);
    for (let j = 0; j <= 11; j++) zs.push(44 - 64 * j);
    grid({
      xs, zs, type: 'street', district: 'eixample',
      skipX: [], skipZ: [44, -84],
      inRegion: (x, z) => {
        if (x < -470 || x > 650 || z > 50 || z < -670) return false;
        const d = districtAt(x, z);
        return d === 'eixample';
      },
    });
  }
  // Gràcia: trama irregular de calles estrechas y plazas
  grid({
    xs: irregular(-285, 225, 34, 48), zs: irregular(-960, -230, 32, 45).reverse(), type: 'local', district: 'gracia',
    jitter: 4, removeProb: 0.1, w: 8.5,
    inRegion: (x, z) => x > -292 && x < 232 && z > -965 && z < diagonalZ(x) - 4,
  });
  // Ciutat Vella
  grid({
    xs: irregular(-300, -8, 30, 48), zs: irregular(44, 430, 28, 44), type: 'narrow', district: 'raval',
    jitter: 5, removeProb: 0.18,
    inRegion: (x, z) => x >= -301 && x <= 0 && z >= 43 && z <= 432 && x > PARALLEL.ax + (z - PARALLEL.az) / (PARALLEL.bz - PARALLEL.az) * (PARALLEL.bx - PARALLEL.ax) - 2,
  });
  grid({
    xs: irregular(8, 190, 26, 40), zs: irregular(44, 430, 24, 38), type: 'narrow', district: 'gotic',
    jitter: 5, removeProb: 0.22, w: 6,
    inRegion: (x, z) => x >= 7 && x <= 191 && z >= 43 && z <= 432,
  });
  grid({
    xs: irregular(190, 430, 28, 44), zs: irregular(44, 425, 26, 40), type: 'narrow', district: 'born',
    jitter: 5, removeProb: 0.2,
    inRegion: (x, z) => x >= 189 && x <= 431 && z >= 43 && z <= 428,
  });
  // Poble-sec
  {
    const xs = [], zs = [];
    for (let x = -600; x <= -150; x += 42) xs.push(x);
    for (let z = -40; z <= 470; z += 40) zs.push(z);
    grid({ xs, zs, type: 'local', district: 'poblesec', jitter: 3, w: 8.5, inRegion: (x, z) => districtAt(x, z) === 'poblesec' && montjuicDist(x, z) > 205 });
  }
  // Barceloneta: manzanas largas y estrechas
  {
    const xs = [];
    for (let x = 310; x <= 522; x += 21.2) xs.push(x);
    grid({
      xs, zs: [425, 480, 545, 600, 650], type: 'narrow', district: 'barceloneta', w: 6,
      skipX: [310], skipZ: [425, 650],
      inRegion: (x, z) => x >= 309 && x <= 523 && z >= 424 && z <= 651,
    });
  }
  // Vila Olímpica
  grid({
    xs: [560, 645, 730, 815, 900], zs: [170, 250, 330, 415], type: 'local', district: 'vilaolimpica', skipZ: [415], skipX: [640],
    inRegion: (x, z) => x >= 559 && x <= 901 && z >= 169 && z <= 416,
  });
  // Poblenou: continuación de la cuadrícula de Cerdà con naves y el distrito 22@
  {
    const xs = [], zs = [];
    for (let x = 640; x <= 1240; x += 80) xs.push(x);
    for (let j = -6; j <= 11; j++) zs.push(44 - 64 * j);
    zs.sort((a, b) => a - b);
    grid({
      xs, zs, type: 'local', district: 'poblenou', skipX: [640, 960], skipZ: [-84], w: 11,
      inRegion: (x, z) => x >= 639 && z <= 416 && z >= -670 && !(x < 900 && z > 170) && districtAt(x, z) === 'poblenou',
    });
  }
  // Sants
  {
    const xs = [], zs = [];
    for (let x = -1290; x <= -470; x += 56) xs.push(x);
    zs.push(...irregular(-470, 60, 46, 60));
    grid({ xs, zs, type: 'local', district: 'sants', jitter: 3, skipZ: [-84], inRegion: (x, z) => x < -462 && districtAt(x, z) === 'sants' });
  }
  // Les Corts
  {
    const xs = [], zs = [];
    for (let x = -1290; x <= -470; x += 74) xs.push(x);
    for (let z = -1040; z <= -470; z += 70) zs.push(z);
    grid({ xs, zs, type: 'street', district: 'lescorts', w: 12, inRegion: (x, z) => x < -462 && districtAt(x, z) === 'lescorts' });
  }
  // Zona Franca: grandes naves y logística
  {
    const xs = [], zs = [];
    for (let x = -1290; x <= -260; x += 130) xs.push(x);
    for (let z = 100; z <= 870; z += 96) zs.push(z);
    grid({ xs, zs, type: 'street', district: 'zonafranca', w: 14, inRegion: (x, z) => districtAt(x, z) === 'zonafranca' && !isWater(x, z) });
  }

  return { segs, grids };
}
