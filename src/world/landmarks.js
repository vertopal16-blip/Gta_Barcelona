// Monumentos y lugares emblemáticos, modelados proceduralmente a escala del juego.
// Prioridad: que Barcelona se reconozca a primera vista (siluetas, colores, ubicación relativa).

import * as THREE from 'three';
import { GeoBuilder, ensureCCW, getMaterials } from './geom.js';
import { groundHeight, MONTJUIC, SEA_LEVEL } from './terrain.js';
import { makeRng, jitterColor } from '../core/utils.js';

const gy = (x, z) => groundHeight(x, z);

export class Landmarks {
  constructor(scene, collision, roads) {
    this.scene = scene;
    this.col = collision;
    this.roads = roads;
    this.mat = getMaterials();
    this.group = new THREE.Group();
    this.group.name = 'landmarks';
    scene.add(this.group);
    this.b = new GeoBuilder();
    this.glass = new GeoBuilder();
    this.glow = new GeoBuilder();
    this.animated = [];
    this.rng = makeRng(808);
    this.labels = []; // nombres para el mapa
  }

  build() {
    this.sagradaFamilia();
    this.arcTriomf();
    this.colon();
    this.torreGlories();
    this.placaCatalunya();
    this.placaEspanya();
    this.mnac();
    this.castell();
    this.ciutadella();
    this.portVell();
    this.casaBatllo();
    this.pedrera();
    this.catedral();
    this.santaMaria();
    this.boqueria();
    this.macba();
    this.mercatBorn();
    this.placaReial();
    this.parkGuell();
    this.vilaOlimpica();
    this.hotelVela();
    this.estadi();
    this.calatrava();
    this.hospital();
    this.comisaria();
    this.sants();
    this.graciaPlazas();
    this.ramblaDetails();
    this.zonaFrancaPort();
    this.teleferic();
    this.flush();
  }

  flush() {
    const add = (b, mat, shadow = true) => {
      if (b.empty) return;
      const m = b.toMesh(mat);
      m.castShadow = shadow; m.receiveShadow = true;
      this.group.add(m);
    };
    add(this.b, this.mat.plain);
    add(this.glass, this.mat.glass);
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    add(this.glow, this.glowMat, false);
    this.b = new GeoBuilder();
    this.glass = new GeoBuilder();
    this.glow = new GeoBuilder();
  }

  label(name, x, z, icon = null) { this.labels.push({ name, x, z, icon }); }

  boxC(x, z, sx, sz, y0, h, color, ry = 0, collide = true, b = this.b) {
    b.box(x, y0, z, sx, h, sz, color, ry);
    if (collide) this.col.addBox(x, z, sx, sz, ry, y0 - 1, y0 + h, 'building');
  }

  // -------------------------------------------------------------------------
  sagradaFamilia() {
    const cx = 352, cz = -372;
    const y = gy(cx, cz);
    const stone = 0xc6ae84, stoneD = 0xa8915f, stoneN = 0xe0d6c0;
    const b = this.b;
    this.label('Sagrada Família', cx, cz, '⛪');
    // Plataforma y naves en cruz latina
    b.box(cx, y - 1, cz, 58, 1.6, 58, 0xb8ab90);
    this.boxC(cx, cz, 18, 44, y, 28, stone);
    this.boxC(cx, cz, 40, 16, y, 28, stone);
    // Tejado escalonado de las naves
    b.box(cx, y + 28, cz, 12, 6, 40, stoneD);
    b.box(cx, y + 34, cz, 6, 4, 36, stoneD);
    b.box(cx, y + 28, cz, 36, 6, 10, stoneD);
    // Ábside
    b.cylinder(cx, y, cz - 22, 10, 9, 30, stone, 14);
    // Torres (campanarios) con remates de trencadís
    const tower = (x, z, h, r, top = 0xf0c040, body = stone) => {
      const yy = gy(x, z);
      const prof = [[r, 0], [r * 0.95, h * 0.35], [r * 0.85, h * 0.6], [r * 0.7, h * 0.78], [r * 0.45, h * 0.9], [0.4, h]];
      b.lathe(x, z, prof.map(([rr, hh]) => [rr, yy + hh]), body, 12, (k) => (k % 2 ? body : jitterColor(body, this.rng, 0.06)));
      // Aberturas helicoidales (bandas oscuras)
      for (let k = 1; k < 7; k++) b.cylinder(x, yy + h * 0.08 * k, z, r * (1 - k * 0.04) + 0.05, r * (1 - k * 0.04) + 0.05, 0.6, stoneD, 12, { cap: false });
      b.sphere(x, yy + h + 1.2, z, 1.6, top, 8, 5);
      b.cylinder(x, yy + h + 2.5, z, 0.5, 0.1, 3, 0xd03030, 6);
      this.col.addCircle(x, z, r, yy - 1, yy + h, 'building');
    };
    // Fachada del Nacimiento (este) y Pasión (oeste)
    for (const [dx, dz] of [[1, -1.8], [1, -0.6], [1, 0.6], [1, 1.8]]) tower(cx + dx * 24, cz + dz * 6, 62 + Math.abs(dz) * -4 + 6, 3.0, 0xf2c94c, stone);
    for (const [dx, dz] of [[-1, -1.8], [-1, -0.6], [-1, 0.6], [-1, 1.8]]) tower(cx + dx * 24, cz + dz * 6, 64 - Math.abs(dz) * 2, 3.0, 0xe85d3a, stoneD);
    // Fachada de la Gloria (sur), aún en construcción
    for (const dx of [-9, -3, 3, 9]) tower(cx + dx, cz + 27, 58, 2.8, 0xf2f2f2, stoneN);
    // Torres de los evangelistas, de María y de Jesucristo
    for (const [dx, dz] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) tower(cx + dx, cz + dz, 82, 3.6, 0xf0e6c8, stoneN);
    tower(cx, cz - 14, 92, 4.4, 0xe8f0ff, stoneN);
    tower(cx, cz, 112, 6.0, 0xffffff, stoneN);
    // Cruz luminosa de la torre de Jesucristo
    const ty = y + 112;
    this.glow.box(cx, ty + 3, cz, 1.0, 9, 1.0, 0xfff8e0);
    this.glow.box(cx, ty + 9, cz, 6, 1.0, 1.0, 0xfff8e0);
    this.glow.box(cx, ty + 9, cz, 1.0, 1.0, 6, 0xfff8e0);
    // Grúa de construcción (icono del templo durante un siglo)
    const gx = cx + 26, gz = cz + 26;
    b.box(gx, y, gz, 2, 125, 2, 0xe8b820);
    b.box(gx - 20, y + 120, gz, 55, 2.4, 2, 0xe8b820);
    b.box(gx + 8, y + 116, gz, 6, 4, 3, 0xd0d0d0);
    this.col.addBox(gx, gz, 2.2, 2.2, 0, y - 1, y + 125, 'building');
    // Estanques de las plazas laterales
    this.pond(286, -372, 14, 9);
    this.pond(416, -372, 12, 10);
  }

  pond(x, z, rx, rz) {
    const y = gy(x, z) + 0.08;
    const poly = [];
    for (let i = 15; i >= 0; i--) { const a = (i / 16) * Math.PI * 2; poly.push(x + Math.cos(a) * rx, z + Math.sin(a) * rz); }
    this.b.polygonFlat(poly, y, 0x3f7fa8);
  }

  arcTriomf() {
    const x = 512, z = -20, y = gy(x, z);
    const brick = 0xa64b32, deco = 0xdcd0b8;
    this.label('Arc de Triomf', x, z, '🏛');
    for (const s of [-1, 1]) {
      this.boxC(x + s * 8.5, z, 5, 6, y, 22, brick);
      this.b.box(x + s * 8.5, y + 22, z, 5.6, 1.2, 6.6, deco);
      this.b.box(x + s * 8.5, y + 23.2, z, 3, 4, 3, brick);
      this.b.sphere(x + s * 8.5, y + 28, z, 1.2, deco, 6, 4);
    }
    this.b.box(x, y + 16, z, 22, 6, 6, brick);
    this.b.box(x, y + 15.5, z, 23, 0.8, 6.6, deco);
    this.b.box(x, y + 22, z, 23, 1.2, 6.8, deco);
    this.b.box(x, y + 18, z - 3.05, 12, 3, 0.2, 0xe0d4b0); // friso
    this.b.box(x, y + 18, z + 3.05, 12, 3, 0.2, 0xe0d4b0);
    this.col.addBox(x, z, 22, 6, 0, y + 15, y + 23, 'building');
  }

  colon() {
    const x = 0, z = 436, y = gy(x, z);
    const stone = 0xbfb39b, bronze = 0x4f4a3c;
    this.label('Mirador de Colom', x, z, '🗿');
    this.b.cylinder(x, y, z, 9, 9, 1.2, 0xa59a86, 8);
    this.b.cylinder(x, y + 1.2, z, 6.5, 5.5, 7, stone, 8);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      this.b.box(x + Math.cos(a) * 6.5, y + 1.2, z + Math.sin(a) * 6.5, 2.2, 3, 2.2, bronze); // leones
    }
    this.b.cylinder(x, y + 8.2, z, 2.4, 2.4, 5, stone, 10);
    this.b.cylinder(x, y + 13.2, z, 1.4, 1.1, 30, 0x8e7d5a, 12);
    this.b.cylinder(x, y + 43, z, 2.0, 1.5, 3, bronze, 10);
    this.b.sphere(x, y + 47, z, 2.0, 0xb08d3a, 10, 6);
    // Estatua señalando al mar
    this.b.box(x, y + 49, z, 1.0, 3.2, 0.8, bronze);
    this.b.sphere(x, y + 52.6, z, 0.45, bronze, 6, 4);
    this.b.box(x, y + 51.6, z + 1.2, 0.3, 0.3, 2.4, bronze);
    this.col.addCircle(x, z, 7, y - 1, y + 50, 'building');
  }

  torreGlories() {
    const x = 712, z = -150, y = gy(x, z);
    this.label('Torre Glòries', x, z, '🚀');
    const H = 110;
    const prof = [[17, 0], [17, 55], [16.5, 70], [15, 82], [12.5, 93], [9, 101], [5, 106], [1.5, H]];
    const colorAt = (k, yy) => {
      const t = (yy - y) / H;
      const c = new THREE.Color().setHSL(0.02 + t * 0.6, 0.55, 0.42 + t * 0.1);
      return [c.r, c.g, c.b];
    };
    // Subdivide para un degradado suave
    const fine = [];
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, h0] = prof[i], [r1, h1] = prof[i + 1];
      const n = Math.ceil((h1 - h0) / 6);
      for (let k = 0; k < n; k++) fine.push([r0 + (r1 - r0) * k / n, y + h0 + (h1 - h0) * k / n]);
    }
    fine.push([prof[prof.length - 1][0], y + H]);
    this.b.lathe(x, z, fine, 0x888888, 24, colorAt);
    this.col.addCircle(x, z, 17, y - 1, y + H, 'building', 12);
    // Luces LED nocturnas (franjas)
    for (let k = 0; k < 12; k++) {
      const hh = y + 8 + k * 7.5;
      const r = k < 7 ? 17.1 : 17.1 - (k - 6) * 1.7;
      this.glow.cylinder(x, hh, z, r, r, 0.4, new THREE.Color().setHSL(k / 12, 0.9, 0.55).toArray(), 24, { cap: false });
    }
  }

  fountain(x, z, r, tiers = 2, color = 0xcfc4ad) {
    const y = gy(x, z);
    this.b.cylinder(x, y, z, r, r, 0.8, color, 16);
    const poly = [];
    for (let i = 15; i >= 0; i--) { const a = (i / 16) * Math.PI * 2; poly.push(x + Math.cos(a) * (r - 0.4), z + Math.sin(a) * (r - 0.4)); }
    this.b.polygonFlat(poly, y + 0.7, 0x4a90b8);
    let h = y + 0.7;
    for (let t = 0; t < tiers; t++) {
      const rr = r * (0.35 - t * 0.12);
      this.b.cylinder(x, h, z, 0.5, 0.4, 1.6, color, 8);
      h += 1.6;
      this.b.cylinder(x, h, z, rr, rr * 0.9, 0.4, color, 12);
      h += 0.4;
    }
    this.col.addCircle(x, z, r, y - 1, y + 0.8, 'prop', 12);
  }

  placaCatalunya() {
    this.label('Plaça de Catalunya', 0, 12, '⛲');
    const y = gy(0, 12) + 0.06;
    // Rosa de los vientos central
    const star = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? 6 : 16;
      star.push(Math.cos(a) * r, 12 + Math.sin(a) * r);
    }
    this.b.polygonFlat(ensureCCW([-20, -6, 20, -6, 20, 30, -20, 30]), y, 0xd8ccb0);
    for (let i = 0; i < 16; i += 2) {
      const a0 = ((i - 1) / 16) * Math.PI * 2, a1 = (i / 16) * Math.PI * 2, a2 = ((i + 1) / 16) * Math.PI * 2;
      this.b.tri([Math.cos(a0) * 6, y + 0.02, 12 + Math.sin(a0) * 6], [Math.cos(a1) * 16, y + 0.02, 12 + Math.sin(a1) * 16], [Math.cos(a2) * 6, y + 0.02, 12 + Math.sin(a2) * 6], i % 4 ? 0x9a8a6a : 0x4a4a4a, [0, 1, 0]);
    }
    for (const [gx, gz] of [[-38, 0], [38, 0], [-38, 26], [38, 26]]) {
      this.b.polygonFlat(ensureCCW([gx - 12, gz - 6, gx + 12, gz - 6, gx + 12, gz + 6, gx - 12, gz + 6]), y + 0.03, 0x6f9a4f);
    }
    this.fountain(-26, 12, 5);
    this.fountain(26, 12, 5);
    // Monumento a Macià (escalinata invertida)
    const mx = 40, mz = 32, my = gy(mx, mz);
    for (let k = 0; k < 6; k++) this.b.box(mx, my + k * 1.2, mz, 2 + k * 0.6, 1.2, 2 + k * 0.6, 0xd8d0c0);
    this.col.addBox(mx, mz, 5, 5, 0, my - 1, my + 7, 'building');
  }

  placaEspanya() {
    const x = -580, z = -84;
    this.label("Plaça d'Espanya", x, z, '⛲');
    this.fountain(x, z, 20, 3, 0xd6ccb4);
    const y = gy(x, z);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      const cx = x + Math.cos(a) * 4, cz = z + Math.sin(a) * 4;
      this.b.cylinder(cx, y, cz, 0.9, 0.8, 18, 0xd6ccb4, 8);
    }
    this.b.box(x, y + 18, z, 7, 2, 7, 0xd6ccb4);
    this.b.sphere(x, y + 21, z, 1.5, 0xb89a50, 8, 5);
    this.col.addCircle(x, z, 6, y - 1, y + 20, 'building');
    // Torres venecianas
    for (const s of [-1, 1]) {
      const tx = x + s * 17, tz = z + 52, ty = gy(tx, tz);
      this.boxC(tx, tz, 6, 6, ty, 36, 0xa85a3c);
      this.b.box(tx, ty + 36, tz, 6.8, 1, 6.8, 0xd8cdb5);
      this.b.box(tx, ty + 37, tz, 5, 4, 5, 0xa85a3c);
      this.b.cylinder(tx, ty + 41, tz, 3.4, 0.2, 7, 0x7a6a50, 4);
    }
    // Les Arenes (antigua plaza de toros, hoy centro comercial)
    const ax = -640, az = -150, ay = gy(ax, az);
    this.label('Les Arenes', ax, az);
    this.b.cylinder(ax, ay, az, 27, 27, 16, 0xb4673f, 24, { cap: false });
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.b.box(ax + Math.cos(a) * 27.2, ay + 4, az + Math.sin(a) * 27.2, 2.4, 6, 0.4, 0xe8dcc0, -a + Math.PI / 2, {});
    }
    this.b.cylinder(ax, ay + 16, az, 27, 18, 5, 0xc8c4bc, 24);
    this.b.sphere(ax, ay + 21, az, 12, 0xd8d8d8, 16, 6, 0.3);
    this.col.addCircle(ax, az, 27, ay - 1, ay + 22, 'building', 16);
  }

  mnac() {
    const x = -580, z = 200;
    this.label('Palau Nacional (MNAC)', x, z, '🏛');
    let base = Infinity;
    for (const [px, pz] of [[x - 60, z - 30], [x + 60, z - 30], [x, z - 30]]) base = Math.min(base, gy(px, pz));
    let top = -Infinity;
    for (const [px, pz] of [[x - 60, z + 30], [x + 60, z + 30], [x, z + 30], [x, z]]) top = Math.max(top, gy(px, pz));
    const stone = 0xd9c9a3;
    // Terraza
    this.boxC(x, z, 130, 70, base - 2, top - base + 2, 0xbcae90);
    const y = top;
    this.boxC(x, z + 5, 96, 40, y, 22, stone);
    this.b.box(x, y + 22, z + 5, 98, 1.5, 42, 0xc8b892);
    // Cúpula central
    this.b.cylinder(x, y + 22, z + 5, 14, 14, 10, stone, 20);
    this.b.sphere(x, y + 32, z + 5, 14, 0x9aa3a0, 20, 8, 0.75);
    this.b.cylinder(x, y + 41, z + 5, 2.5, 1.5, 6, stone, 10);
    // Torres de las esquinas
    for (const [dx, dz] of [[-44, -14], [44, -14], [-44, 24], [44, 24]]) {
      this.b.box(x + dx, y + 22, z + dz, 7, 12, 7, stone);
      this.b.sphere(x + dx, y + 34, z + dz, 3.6, 0x9aa3a0, 10, 5);
    }
    // Escalinata hacia la Font Màgica
    const steps = 12;
    const z0 = z - 35, z1 = 152;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const sz = z0 + (z1 - z0) * t;
      const sy = base + (gy(x, z1) - base) * t;
      this.b.box(x, sy - 3, sz, 30, 3, (z0 - z1) / steps * -1 + 0.2, 0xcfc2a5);
    }
    // Font Màgica
    this.fountain(-580, 122, 22, 1, 0xd0c6b0);
    const fy = gy(-580, 122);
    this.magic = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const geo = new THREE.CylinderGeometry(0.15, 0.6, 1, 6);
      geo.translate(0, 0.5, 0);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
      m.position.set(-580 + Math.cos(a) * 9, fy + 0.7, 122 + Math.sin(a) * 9);
      this.group.add(m);
      this.magic.push(m);
    }
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.2, 1, 8).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    c.position.set(-580, fy + 0.7, 122);
    this.group.add(c);
    this.magic.push(c);
    this.animated.push((t, night) => {
      this.magic.forEach((m, i) => {
        const h = 6 + 10 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.7)) + (i === 9 ? 10 : 0);
        m.scale.set(1, h, 1);
        m.material.color.setHSL(night > 0.4 ? (t * 0.05 + i * 0.11) % 1 : 0.55, night > 0.4 ? 0.9 : 0.2, night > 0.4 ? 0.6 : 0.92);
      });
    });
  }

  castell() {
    const x = MONTJUIC.x, z = MONTJUIC.z;
    const y = gy(x, z);
    this.label('Castell de Montjuïc', x, z, '🏰');
    const stone = 0xa89c80, dark = 0x8a7f66;
    const H = 9, S = 30;
    // Ángulo de llegada de la carretera
    const a0 = Math.atan2(140 - z, -580 - x);
    const aEnd = a0 + 1.55 * Math.PI * 2;
    const gateDir = [Math.cos(aEnd), Math.sin(aEnd)];
    // Muros (cuatro lados con puerta en el lado de la carretera)
    const sides = [
      { nx: 0, nz: -1 }, { nx: 1, nz: 0 }, { nx: 0, nz: 1 }, { nx: -1, nz: 0 },
    ];
    let gateSide = 0, bestDot = -2;
    sides.forEach((s, i) => { const d = s.nx * gateDir[0] + s.nz * gateDir[1]; if (d > bestDot) { bestDot = d; gateSide = i; } });
    sides.forEach((s, i) => {
      const cx = x + s.nx * S, cz = z + s.nz * S;
      const along = s.nx === 0 ? [1, 0] : [0, 1];
      const len = S * 2;
      if (i === gateSide) {
        const seg = (len - 8) / 2;
        for (const sgn of [-1, 1]) {
          const px = cx + along[0] * sgn * (4 + seg / 2), pz = cz + along[1] * sgn * (4 + seg / 2);
          this.boxC(px, pz, along[0] ? seg : 3, along[1] ? seg : 3, y - 2, H + 2, stone);
        }
        this.b.box(cx, y + H - 2, cz, along[0] ? 9 : 3.4, 4, along[1] ? 9 : 3.4, dark);
      } else {
        this.boxC(cx, cz, along[0] ? len : 3, along[1] ? len : 3, y - 2, H + 2, stone);
      }
    });
    // Baluartes en las esquinas
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.boxC(x + dx * (S + 3), z + dz * (S + 3), 12, 12, y - 2, H + 2.5, stone, Math.PI / 4);
      this.b.cylinder(x + dx * (S + 7), y + H, z + dz * (S + 7), 0.4, 0.4, 2.2, 0x333333, 6); // cañón
    }
    // Edificio central y patio
    this.boxC(x, z, 26, 26, y, 11, 0xb8ab90);
    this.b.box(x, y + 11, z, 27, 1, 27, dark);
    this.b.cylinder(x + 8, y + 12, z - 8, 1.6, 1.6, 6, stone, 8);
    // Mástil con senyera
    this.b.cylinder(x - 8, y + 12, z + 8, 0.12, 0.12, 12, 0xdddddd, 6);
    for (let k = 0; k < 9; k++) this.b.box(x - 8 + 2.2, y + 21 + k * 0.33, z + 8, 4, 0.33, 0.05, k % 2 ? 0xd32f2f : 0xf6c445);
    // Mirador
    this.label('Mirador del Castell', x + gateDir[0] * 40, z + gateDir[1] * 40);
  }

  ciutadella() {
    this.label('Parc de la Ciutadella', 536, 230, '🌳');
    // Lago
    const lx = 560, lz = 250, y = gy(lx, lz) + 0.07;
    const poly = [];
    for (let i = 19; i >= 0; i--) { const a = (i / 20) * Math.PI * 2; poly.push(lx + Math.cos(a) * 30 * (1 + 0.15 * Math.sin(a * 3)), lz + Math.sin(a) * 18); }
    this.b.polygonFlat(poly, y, 0x3f7fa8);
    this.col.addPoly(ensureCCW(poly), y - 2, y + 0.3, 'prop');
    // Cascada monumental
    const cx = 600, cz = 110, cy = gy(cx, cz);
    const st = 0xcdbf9e;
    this.boxC(cx, cz, 36, 8, cy, 12, st);
    for (let i = -2; i <= 2; i++) this.b.box(cx + i * 6, cy + 2, cz + 4.1, 3.4, 7, 0.4, 0x4a6f80);
    this.b.box(cx, cy + 12, cz, 14, 6, 6, st);
    this.b.box(cx, cy + 18, cz, 6, 3, 3, 0xd4af37); // cuadriga dorada
    this.b.sphere(cx, cy + 22, cz, 1.4, 0xd4af37, 8, 5);
    this.pond(cx, cz + 14, 18, 7);
    this.label('Cascada', cx, cz);
    // Parlament
    const px = 520, pz = 340, py = gy(px, pz);
    this.boxC(px, pz, 60, 22, py, 16, 0xd8c8a8);
    this.b.box(px, py + 16, pz, 20, 5, 22, 0xc8b898);
    this.b.sphere(px, py + 21, pz, 6, 0x8a9a9a, 12, 6, 0.6);
    this.label('Parlament', px, pz);
    // El mamut de piedra
    const mx = 600, mz = 310, my = gy(mx, mz);
    const brown = 0x6b5440;
    this.b.box(mx, my + 2.2, mz, 3, 3.2, 6, brown);
    for (const [dx, dz] of [[-1, -2], [1, -2], [-1, 2], [1, 2]]) this.b.box(mx + dx, my, mz + dz, 0.9, 2.4, 0.9, brown);
    this.b.box(mx, my + 3.6, mz + 3.6, 2.2, 2.2, 2, brown);
    this.b.box(mx, my + 1.4, mz + 4.8, 0.6, 2.6, 0.6, brown);
    for (const s of [-1, 1]) this.b.box(mx + s * 0.8, my + 2.4, mz + 5, 0.25, 0.25, 2.4, 0xf0eadc);
    this.col.addBox(mx, mz, 3.4, 9, 0, my - 1, my + 5, 'prop');
    this.label('El Mamut', mx, mz);
    // Caminos
    const path = (pts) => this.b.ribbon(pts.map(([x, z]) => [x, gy(x, z) + 0.05, z]), 5, 0xd8c8a0, 0.1);
    path([[440, 230], [530, 230], [632, 230]]);
    path([[536, 54], [536, 404]]);
    path([[450, 70], [620, 390]]);
  }

  portVell() {
    this.label('Port Vell', 120, 520, '⚓');
    this.label('Maremagnum', 150, 560);
    const b = this.b;
    // Rambla de Mar (pasarela de madera)
    const y0 = 0.05;
    b.polygonFlat(ensureCCW([8, 446, 62, 446, 62, 462, 8, 462]), y0 + 0.3, 0x8a6a48);
    // Maremagnum y Aquàrium
    this.boxC(150, 560, 70, 40, 0, 14, 0xd8dde0);
    this.glass.box(150, 2, 539.8, 66, 10, 0.5, 0x2a3540);
    b.box(150, 14, 560, 72, 1.2, 42, 0x9a4030);
    this.boxC(120, 615, 50, 30, 0, 10, 0x6a8fa8);
    this.label("L'Aquàrium", 120, 615);
    // Barcos amarrados
    const rng = this.rng;
    const boat = (x, z, len, ry, color = 0xf4f4f4, mast = true) => {
      const w = len * 0.32;
      b.box(x, SEA_LEVEL - 0.6, z, w, 1.6, len, color, ry);
      b.box(x, SEA_LEVEL + 1.0, z, w * 0.7, 1.0, len * 0.45, 0xe0e0e0, ry);
      if (mast) b.cylinder(x, SEA_LEVEL + 1, z, 0.1, 0.08, len * 1.2, 0xcccccc, 4);
      this.col.addBox(x, z, w, len, ry, SEA_LEVEL - 2, SEA_LEVEL + 2.5, 'prop');
    };
    for (let i = 0; i < 18; i++) boat(220 + (i % 2) * 18, 470 + i * 9, rng.range(9, 14), Math.PI / 2 + (i % 2) * 0.05);
    for (let i = 0; i < 12; i++) boat(40 + i * 7.5, 470 + 12, rng.range(10, 13), 0, 0xf4f4f4);
    for (let i = 0; i < 3; i++) boat(-60 + i * 14, 470, 18, 0.0, 0x2a5a8a, false); // golondrinas
    // Crucero en el muelle
    const sx = -40, sz = 760;
    b.box(sx, SEA_LEVEL - 3, sz, 130, 12, 22, 0xf6f6f6);
    b.box(sx + 4, SEA_LEVEL + 9, sz, 110, 6, 20, 0xffffff);
    b.box(sx + 8, SEA_LEVEL + 15, sz, 80, 5, 17, 0xfafafa);
    b.box(sx + 20, SEA_LEVEL + 20, sz, 10, 6, 6, 0x2050a0);
    this.glass.box(sx + 4, SEA_LEVEL + 10, sz - 10.05, 108, 3, 0.2, 0x203040);
    this.col.addBox(sx, sz, 130, 22, 0, SEA_LEVEL - 4, SEA_LEVEL + 25, 'building');
  }

  casaBatllo() {
    const x0 = 15, x1 = 30, z0 = -192, z1 = -174;
    const y = gy(22, -183);
    this.label('Casa Batlló', 22, -183, '🐉');
    const rng = makeRng(17);
    // Fachada de trencadís
    const cols = [0x7fb3c9, 0x9ac3d0, 0x6ea0b8, 0xb2d0d8, 0x88b8a8];
    for (let k = 0; k < 7; k++) {
      this.b.box((x0 + x1) / 2, y + k * 3.3, (z0 + z1) / 2, x1 - x0, 3.3, z1 - z0, rng.pick(cols));
    }
    this.col.addBox((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 0, y - 1, y + 24, 'building');
    // Balcones "máscara" blancos y columnas "hueso"
    for (let k = 1; k < 6; k++) for (let i = 0; i < 4; i++) {
      this.b.box(x0 - 0.35, y + k * 3.3 + 0.6, z0 + 2.5 + i * 4.2, 0.7, 1.2, 2.4, 0xf0ece0);
    }
    for (let i = 0; i < 5; i++) this.b.cylinder(x0 - 0.3, y, z0 + 1.5 + i * 3.8, 0.35, 0.25, 6, 0xe8e0cc, 6);
    // Lomo del dragón
    for (let i = 0; i < 9; i++) {
      const zz = z0 + 1 + i * 2;
      const hue = [0x2f8f6f, 0x3faf8f, 0x5f6fbf, 0xbf5f8f, 0x8fbf4f][i % 5];
      this.b.box(x0 + 2, y + 23 + Math.sin(i * 0.7) * 1.2, zz, 4, 2.2, 2.2, hue, 0.3);
    }
    this.b.cylinder(x0 + 3, y + 23, z1 - 1.5, 0.8, 0.8, 5, 0xe8d8a8, 8);
    this.b.sphere(x0 + 3, y + 28.6, z1 - 1.5, 1.0, 0xd8b040, 8, 4);
  }

  pedrera() {
    const cx = 27, cz = -320;
    const y = gy(cx, cz);
    this.label('La Pedrera', cx, cz, '🏢');
    const stone = 0xe8e0cc;
    const ring = (off, wave) => {
      const pts = [];
      const N = 36;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const rx = 11 + off, rz = 11 + off;
        const r = 1 + wave * Math.sin(a * 7 + off * 3);
        pts.push(cx + Math.cos(a) * rx * r, cz + Math.sin(a) * rz * r);
      }
      return ensureCCW(pts.reverse());
    };
    for (let k = 0; k < 7; k++) {
      const yy = y + k * 3.4;
      this.b.prism(ring(0, 0.03), yy, yy + 2.3, 0x4a4844, { roof: false });
      this.b.prism(ring(0.8, 0.06), yy + 2.3, yy + 3.4, stone, { roof: false });
      this.b.polygonFlat(ring(0.8, 0.06), yy + 3.4, stone);
    }
    this.col.addCircle(cx, cz, 11.5, y - 1, y + 24, 'building', 16);
    // Chimeneas "guerreros"
    const rng = makeRng(5);
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2, r = rng() * 7;
      const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
      this.b.cylinder(px, y + 23.8, pz, 0.7, 0.4, 3, stone, 7);
      this.b.cylinder(px, y + 26.8, pz, 0.8, 0.05, 1.4, i % 3 ? 0xd8d0b8 : 0x6a8a5a, 6);
    }
  }

  catedral() {
    const x = 105, z = 180, y = gy(x, z);
    this.label('Catedral', x, z, '⛪');
    const st = 0xb3a78f;
    this.boxC(x, z + 6, 30, 40, y, 24, st);
    this.b.box(x, y + 24, z + 6, 22, 5, 36, 0x9a8f78);
    // Fachada neogótica con agujas
    this.boxC(x, z - 17, 34, 6, y, 30, st);
    for (const dx of [-13, 13]) {
      this.b.box(x + dx, y + 30, z - 17, 5, 18, 5, st);
      this.b.cylinder(x + dx, y + 48, z - 17, 3.2, 0.2, 14, 0x9a8f78, 8);
    }
    this.b.cylinder(x, y + 30, z - 14, 4, 0.2, 34, 0x9a8f78, 8);
    for (let i = -3; i <= 3; i++) this.b.cylinder(x + i * 4, y + 30, z - 19.5, 0.6, 0.05, 6, st, 4);
    this.glow.box(x, y + 18, z - 20.1, 5, 5, 0.2, 0xcfa060); // rosetón
  }

  santaMaria() {
    const x = 301, z = 265, y = gy(x, z);
    this.label('Santa Maria del Mar', x, z, '⛪');
    const st = 0xc2b08e;
    this.boxC(x, z, 28, 46, y, 26, st);
    this.b.box(x, y + 26, z, 20, 4, 44, 0xa89878);
    for (const dx of [-11, 11]) {
      this.b.cylinder(x + dx, y, z - 21, 3.4, 3.2, 40, st, 8);
      this.b.box(x + dx, y + 40, z - 21, 7, 1, 7, 0xa89878);
    }
    this.glow.cylinder(x, y + 16, z - 23.1, 4, 4, 0.2, 0xc8a050, 12);
  }

  boqueria() {
    const x0 = -44, x1 = -11, z0 = 168, z1 = 206;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, y = gy(cx, cz);
    this.label('La Boqueria', cx, cz, '🍉');
    this.boxC(cx, cz, x1 - x0, z1 - z0, y, 9, 0x5a6f5a);
    this.b.box(cx, y + 9, cz, x1 - x0 + 1, 2, z1 - z0 + 1, 0x3f5f4f);
    // Portal de hierro y vitral sobre La Rambla
    this.b.box(x1 + 0.4, y, cz, 0.8, 13, 14, 0x2f4a3f);
    this.glow.box(x1 + 0.9, y + 8.5, cz, 0.2, 3.5, 11, 0xe8a040);
    const cols = [0xd83a3a, 0x3aa83a, 0xe8c030, 0x3a6ad8];
    for (let i = 0; i < 6; i++) this.glow.box(x1 + 0.95, y + 10.5, cz - 5 + i * 2, 0.2, 1.2, 1.6, cols[i % 4]);
  }

  macba() {
    const x = -130, z = 125, y = gy(x, z);
    this.label('MACBA', x, z, '🖼');
    this.boxC(x, z, 70, 40, y, 18, 0xf4f4f0);
    this.glass.box(x, y + 2, z + 20.2, 60, 13, 0.3, 0x2a3540);
    this.b.box(x + 30, y, z + 22, 6, 9, 4, 0xf4f4f0);
  }

  mercatBorn() {
    const x = 360, z = 160, y = gy(x, z);
    this.label('Mercat del Born', x, z);
    this.boxC(x, z, 60, 40, y, 10, 0x6a7a7f);
    for (let k = 0; k < 4; k++) this.b.box(x, y + 10 + k * 1.2, z, 60 - k * 8, 1.2, 40 - k * 6, k % 2 ? 0x4f5f64 : 0x7f8f94);
  }

  placaReial() {
    const x = 49, z = 319, y = gy(x, z);
    this.label('Plaça Reial', x, z, '🌴');
    this.b.polygonFlat(ensureCCW([28, 300, 70, 300, 70, 338, 28, 338]), y + 0.05, 0xd2c4a2);
    this.fountain(x, z, 4.5, 2, 0xc0b49a);
    // Farolas de Gaudí
    for (const [dx, dz] of [[-10, -6], [10, 6]]) {
      this.b.cylinder(x + dx, y, z + dz, 0.6, 0.3, 5, 0x6a3a2a, 6);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        this.b.box(x + dx + Math.cos(a) * 0.9, y + 5, z + dz + Math.sin(a) * 0.9, 0.2, 1.2, 0.2, 0x7a4a3a);
        this.glow.box(x + dx + Math.cos(a) * 1.4, y + 6.2, z + dz + Math.sin(a) * 1.4, 0.4, 0.5, 0.4, 0xffe0a0);
      }
      this.b.box(x + dx, y + 6.2, z + dz, 0.6, 1.4, 0.6, 0xc03030);
      this.col.addBox(x + dx, z + dz, 1.2, 1.2, 0, y - 1, y + 6, 'prop');
    }
  }

  parkGuell() {
    const x = 90, z = -935;
    this.label('Park Güell', x, z, '🦎');
    const y = gy(x, z + 30);
    // Casitas de entrada (cuento de hadas)
    for (const [dx, cap] of [[-14, 0x8a5a3a], [14, 0xe8e0d0]]) {
      const hx = x + dx, hz = z + 55, hy = gy(hx, hz);
      this.boxC(hx, hz, 8, 8, hy, 6, 0xd8b68a);
      for (let k = 0; k < 4; k++) this.b.box(hx, hy + 6 + k * 1.3, hz, 8.4 - k * 1.8, 1.3, 8.4 - k * 1.8, k % 2 ? 0xffffff : cap);
      this.b.cylinder(hx + 2.5, hy + 8, hz + 2.5, 0.6, 0.3, 6, 0xffffff, 8);
      this.b.sphere(hx + 2.5, hy + 14.5, hz + 2.5, 0.8, 0x3a6ad8, 6, 4);
    }
    // Escalinata con el dragón
    for (let k = 0; k < 8; k++) this.b.box(x, gy(x, z + 40 - k * 2.5) - 0.3 + k * 0.5, z + 40 - k * 2.5, 12, 0.6, 2.5, 0xd8c8a8);
    const dz = z + 32, dy = gy(x, dz) + 3;
    const rng = makeRng(3);
    for (let i = 0; i < 7; i++) this.b.box(x + Math.sin(i) * 0.5, dy + Math.sin(i * 0.9) * 0.4, dz - i * 0.9, 1.6 - i * 0.12, 1.1, 1.1, rng.pick([0x3aa86a, 0xe8c030, 0x3a7ad8, 0xd85a3a]));
    this.col.addBox(x, dz - 3, 2, 7, 0, dy - 4, dy + 1, 'prop');
    // Sala hipóstila y plaza con el banco ondulante
    const hz = z + 10, hy = gy(x, hz);
    for (let i = -3; i <= 3; i++) for (let j = -2; j <= 2; j++) this.b.cylinder(x + i * 4, hy, hz + j * 4, 0.7, 0.7, 6, 0xe8e0cc, 8);
    this.boxC(x, hz, 32, 22, hy + 6, 1.2, 0xd8cfb8);
    for (let i = 0; i < 40; i++) {
      const a = i / 40;
      const bx = x - 16 + a * 32, bz = hz - 11 + Math.sin(a * Math.PI * 6) * 1.6;
      this.b.box(bx, hy + 7.2, bz, 0.9, 0.9, 0.6, rng.pick([0x3aa86a, 0xe8c030, 0x3a7ad8, 0xd85a3a, 0xf0f0f0]));
    }
    this.boxC(x, hz, 34, 24, hy, 0.1, 0xd8cfb8, 0, false);
  }

  vilaOlimpica() {
    this.label('Hotel Arts', 760, 375, '🏨');
    this.label('Torre Mapfre', 830, 375);
    this.label('Peix d\'Or', 760, 440, '🐟');
    // Hotel Arts: estructura de acero blanca
    const ax = 760, az = 375, ay = gy(ax, az);
    const H = 115;
    this.glass.box(ax, ay, az, 26, H, 26, 0x203040);
    this.col.addBox(ax, az, 28, 28, 0, ay - 1, ay + H, 'building');
    for (let k = 0; k <= 10; k++) {
      this.b.box(ax, ay + k * H / 10, az, 28, 0.6, 28, 0xf2f2f2, 0, { roof: true });
    }
    for (const [dx, dz] of [[-14, -14], [14, -14], [14, 14], [-14, 14], [0, -14], [0, 14], [-14, 0], [14, 0]]) {
      this.b.box(ax + dx, ay, az + dz, 0.7, H, 0.7, 0xf2f2f2);
    }
    for (let k = 0; k < 10; k++) {
      for (const s of [-1, 1]) {
        // cruces de San Andrés en las fachadas
        const y0 = ay + k * H / 10;
        this.b.quad([ax - 14, y0, az + s * 14.05], [ax, y0 + H / 10, az + s * 14.05], [ax + 0.8, y0 + H / 10, az + s * 14.05], [ax - 13.2, y0, az + s * 14.05], 0xf2f2f2, null, [0, 0, s]);
      }
    }
    // Torre Mapfre: vidrio dorado
    const mx = 830, mz = 375, my = gy(mx, mz);
    this.b.box(mx, my, mz, 26, H, 26, 0xc8b070);
    this.col.addBox(mx, mz, 26, 26, 0, my - 1, my + H, 'building');
    for (let k = 1; k < 38; k++) this.glass.box(mx, my + k * 3, mz, 26.3, 1.4, 26.3, 0x30404a);
    // Peix d'Or (escultura de Gehry): celosía dorada sobre el paseo
    const fx = 760, fz = 440, fy = gy(fx, fz);
    for (let i = 0; i < 4; i++) this.b.cylinder(fx - 12 + i * 8, fy, fz, 0.4, 0.4, 7, 0x8a8a8a, 6);
    this.b.sphere(fx, fy + 12, fz, 6, 0xd4a640, 14, 8, 0.8);
    this.b.sphere(fx - 9, fy + 11, fz, 4, 0xd4a640, 12, 6, 0.7);
    this.b.sphere(fx + 9, fy + 12.5, fz, 3, 0xd4a640, 10, 6, 0.8);
    this.b.box(fx + 14, fy + 11, fz, 4, 6, 0.5, 0xd4a640, 0.4);
    this.col.addBox(fx, fz, 26, 3, 0, fy - 1, fy + 7, 'prop');
  }

  hotelVela() {
    const x = 425, z = 700;
    this.label('Hotel Vela', x, z, '⛵');
    const y = 0;
    // Planta en forma de vela: arco frontal + cara trasera recta
    const pts = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = -Math.PI / 2 + t * Math.PI;
      pts.push(x + Math.sin(a) * 30, z + Math.cos(a) * 12 - 4);
    }
    const poly = ensureCCW(pts);
    this.glass.prism(poly, y, y + 95, 0x3a5a70, { roofBuilder: this.b, roofColor: 0x9aaab8 });
    this.b.box(x, y, z + 6, 70, 8, 16, 0xe8e8e8);
    this.col.addPoly(poly, y - 1, y + 95, 'building');
    this.col.addBox(x, z + 6, 70, 16, 0, y - 1, y + 8, 'building');
    // L'Estel Ferit (cubos oxidados en la playa)
    const ex = 506, ez = 600, ey = gy(ex, ez);
    for (let k = 0; k < 4; k++) this.b.box(ex + k * 0.6, ey + k * 2.6, ez + k * 0.4, 2.6, 2.6, 2.6, 0x8a4a2a, k * 0.25);
    this.col.addBox(ex + 1, ez, 3.4, 3.4, 0, ey - 1, ey + 10, 'prop');
    this.label("L'Estel Ferit", ex, ez);
  }

  estadi() {
    const x = -850, z = -760, y = gy(x, z);
    this.label('Estadi de Les Corts', x, z, '⚽');
    const rxO = 98, rzO = 82, rxI = 62, rzI = 46, H = 38;
    const N = 40;
    const colors = [0x1d3d8f, 0xa01d3a];
    for (let i = 0; i < N; i++) {
      const a1 = (i / N) * Math.PI * 2, a0 = ((i + 1) / N) * Math.PI * 2;
      const P = (a, rx, rz, hh) => [x + Math.cos(a) * rx, y + hh, z + Math.sin(a) * rz];
      // Graderío inclinado (interior)
      for (let k = 0; k < 4; k++) {
        const t0 = k / 4, t1 = (k + 1) / 4;
        const c = colors[(i + k) % 2];
        this.b.quad(P(a0, rxI + (rxO - rxI) * t0, rzI + (rzO - rzI) * t0, 2 + (H - 6) * t0), P(a0, rxI + (rxO - rxI) * t1, rzI + (rzO - rzI) * t1, 2 + (H - 6) * t1),
          P(a1, rxI + (rxO - rxI) * t1, rzI + (rzO - rzI) * t1, 2 + (H - 6) * t1), P(a1, rxI + (rxO - rxI) * t0, rzI + (rzO - rzI) * t0, 2 + (H - 6) * t0), c);
      }
      // Fachada exterior
      this.b.quad(P(a1, rxO, rzO, 0), P(a1, rxO, rzO, H), P(a0, rxO, rzO, H), P(a0, rxO, rzO, 0), i % 3 ? 0xd8d8d0 : 0xb8b8b0);
      // Cubierta
      this.b.quad(P(a1, rxO, rzO, H), P(a1, rxO - 14, rzO - 12, H + 3), P(a0, rxO - 14, rzO - 12, H + 3), P(a0, rxO, rzO, H), 0xe8e8e8);
    }
    // Césped
    const pitch = [];
    for (let i = N - 1; i >= 0; i--) { const a = (i / N) * Math.PI * 2; pitch.push(x + Math.cos(a) * rxI, z + Math.sin(a) * rzI); }
    this.b.polygonFlat(pitch, y + 0.1, 0x3f8f3f);
    for (let k = -4; k <= 4; k++) this.b.box(x + k * 10, y + 0.12, z, 5, 0.02, 60, k % 2 ? 0x4a9a4a : 0x3a8a3a);
    const outer = [];
    for (let i = 23; i >= 0; i--) { const a = (i / 24) * Math.PI * 2; outer.push(x + Math.cos(a) * rxO, z + Math.sin(a) * rzO); }
    this.col.addPoly(outer, y - 1, y + H, 'building');
  }

  calatrava() {
    const x = -610, z = 300, y = gy(x, z);
    this.label('Torre de Montjuïc', x, z, '📡');
    this.b.cylinder(x, y, z, 6, 6, 3, 0xe8e8e8, 12);
    for (let k = 0; k < 20; k++) {
      const h = k * 3.5;
      this.b.box(x + k * 0.9, y + 3 + h, z, 2.2 - k * 0.05, 3.6, 3.2, 0xf4f4f4, 0);
    }
    this.b.box(x + 9, y + 3, z, 0.5, 60, 0.5, 0xd8d8d8, 0);
    this.col.addCircle(x + 6, z, 6, y - 1, y + 70, 'building');
    // Estadi Olímpic (estructura baja junto a la torre)
    const sx = -540, sz = 270, sy = gy(sx, sz);
    this.label('Anella Olímpica', sx, sz);
    if (this.roads.rectClearance(sx - 30, sz - 22, sx + 30, sz + 22) > 1) {
      this.boxC(sx, sz, 60, 44, sy - 6, 22, 0xd8ccb0);
      this.b.box(sx, sy + 16, sz, 50, 0.5, 34, 0x4f9f4f);
    }
  }

  hospital() {
    const x = 606, z = 335, y = gy(x, z);
    this.label('Hospital del Mar', x, z, '🏥');
    this.boxC(x, z, 64, 66, y, 24, 0xf0f0f0);
    this.glass.box(x, y + 4, z - 33.1, 58, 16, 0.3, 0x2a4050);
    this.glow.box(x - 20, y + 20, z - 33.3, 4, 1.3, 0.2, 0xff2020);
    this.glow.box(x - 20, y + 20, z - 33.3, 1.3, 4, 0.2, 0xff2020);
  }

  comisaria() {
    const x = 215, z = 252, y = gy(x, z);
    this.label('Comisaría', x, z, '🚔');
    this.boxC(x, z, 34, 35, y, 20, 0xc8bca4);
    this.b.box(x, y + 6, z, 34.4, 1.2, 35.4, 0x2050a0);
    this.glow.box(x - 17.3, y + 9, z, 0.2, 1.5, 10, 0x4080ff);
  }

  sants() {
    const x = -760, z = -220, y = gy(x, z);
    this.label('Estació de Sants', x, z, '🚆');
    this.boxC(x, z, 130, 50, y, 9, 0xb8b8b4);
    this.b.box(x, y + 9, z, 140, 1.4, 60, 0x4a4f55);
    this.glass.box(x, y + 1, z + 25.2, 110, 6, 0.3, 0x2a3a48);
    this.boxC(x + 55, z - 10, 20, 24, y + 9, 70, 0xd8d0c4);
  }

  graciaPlazas() {
    // Plaça de la Vila de Gràcia con su campanario
    const x = 55, z = -490, y = gy(x, z);
    this.label('Pl. Vila de Gràcia', x, z, '🕰');
    this.b.polygonFlat(ensureCCW([35, -505, 75, -505, 75, -475, 35, -475]), y + 0.06, 0xd4c4a0);
    this.boxC(x, z, 3.6, 3.6, y, 26, 0xc8a878);
    this.b.cylinder(x, y + 26, z, 2.4, 0.3, 5, 0x7a6a50, 4);
    for (const [dx, dz] of [[1.85, 0], [-1.85, 0], [0, 1.85], [0, -1.85]]) this.b.box(x + dx, y + 21, z + dz, dx ? 0.1 : 2.2, 2.2, dz ? 0.1 : 2.2, 0xf8f4e0);
    // Plaça del Sol con terrazas
    const sx = -75, sz = -607, sy = gy(sx, sz);
    this.label('Plaça del Sol', sx, sz, '☀');
    this.b.polygonFlat(ensureCCW([-95, -625, -55, -625, -55, -590, -95, -590]), sy + 0.06, 0xd8c8a4);
    const rng = makeRng(11);
    for (let i = 0; i < 10; i++) {
      const tx = sx + rng.range(-16, 16), tz = sz + rng.range(-13, 13), ty = gy(tx, tz);
      this.b.cylinder(tx, ty, tz, 0.5, 0.5, 0.75, 0x9a9a9a, 6);
      this.b.cylinder(tx, ty, tz, 0.04, 0.04, 2.4, 0xdddddd, 4, { cap: false });
      this.b.cylinder(tx, ty + 2.3, tz, 1.6, 0.05, 0.5, rng.pick([0xe8d8b0, 0xc83a3a, 0x3a8ac8]), 8);
    }
  }

  ramblaDetails() {
    // Quioscos y puestos de flores
    for (let z = 70; z < 420; z += 38) {
      const y = gy(0, z);
      this.boxC(0, z, 2.8, 4.2, y, 2.6, z % 3 ? 0x2f5a3f : 0x3a4f6a);
      this.b.box(0, y + 2.6, z, 3.4, 0.3, 4.8, 0x1f3a2a);
    }
    // Font de Canaletes
    const fy = gy(0, 58);
    this.b.cylinder(0, fy, 58, 0.5, 0.4, 3, 0x2a2a2a, 8);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      this.glow.box(Math.cos(a) * 0.9, fy + 3.2, 58 + Math.sin(a) * 0.9, 0.35, 0.5, 0.35, 0xffe0a0);
    }
    this.col.addBox(0, 58, 1, 1, 0, fy - 1, fy + 3, 'prop');
    this.label('Canaletes', 0, 58);
    // Mosaico de Miró en el Pla de l'Os
    const my = gy(0, 262) + 0.09;
    const cols = [0xd8302a, 0xf0c020, 0x2a5ad8, 0x2a2a2a, 0xf0f0f0];
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
      this.b.tri([0, my, 262], [Math.cos(a1) * 3.5, my, 262 + Math.sin(a1) * 3.5], [Math.cos(a0) * 3.5, my, 262 + Math.sin(a0) * 3.5], cols[i % 5], [0, 1, 0]);
    }
    this.label('Mosaic de Miró', 0, 262);
    // Gat del Raval
    const cx = -128, cz = 310, cy = gy(cx, cz);
    const bronze = 0x2f2a26;
    this.b.box(cx, cy, cz, 2.2, 2.4, 5, bronze);
    this.b.box(cx, cy + 2.4, cz - 2.2, 1.8, 1.8, 1.6, bronze);
    this.b.box(cx - 0.5, cy + 4.2, cz - 2.2, 0.35, 0.6, 0.35, bronze);
    this.b.box(cx + 0.5, cy + 4.2, cz - 2.2, 0.35, 0.6, 0.35, bronze);
    this.b.box(cx, cy + 2.2, cz + 3, 0.4, 0.4, 2.6, bronze, 0);
    this.col.addBox(cx, cz, 2.4, 6, 0, cy - 1, cy + 4, 'prop');
    this.label('El Gat del Raval', cx, cz, '🐈');
  }

  zonaFrancaPort() {
    this.label('Port de Barcelona', -760, 915, '🏗');
    const rng = makeRng(71);
    const cols = [0xc0392b, 0x2471a3, 0x27ae60, 0xd68910, 0x7d3c98, 0x839192, 0x1a5276];
    // Pilas de contenedores
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 26; i++) {
        const x = -1200 + i * 32 + (r % 2) * 6, z = 885 + r * 15;
        if (x > -300) continue;
        const stack = rng.int(1, 4);
        for (let k = 0; k < stack; k++) this.b.box(x, k * 2.6, z, 12, 2.6, 2.5, rng.pick(cols));
        this.col.addBox(x, z, 12, 2.5, 0, -1, stack * 2.6, 'building');
      }
    }
    // Grúas portuarias
    for (let i = 0; i < 6; i++) {
      const x = -1150 + i * 150, z = 950;
      for (const [dx, dz] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) this.b.box(x + dx, 0, z + dz, 1.2, 28, 1.2, 0xd8442a);
      this.b.box(x, 28, z + 6, 4, 3, 60, 0xd8442a);
      this.b.box(x, 31, z - 4, 6, 4, 8, 0xd8d8d8);
      this.col.addBox(x, z, 14, 12, 0, -1, 2, 'prop');
      for (const [dx, dz] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) this.col.addBox(x + dx, z + dz, 1.4, 1.4, 0, -1, 28, 'building');
    }
  }

  /** Telefèric del Port: de la Barceloneta a Montjuïc sobre el puerto. */
  teleferic() {
    const A = { x: 452, z: 690, h: 78 }, B = { x: 120, z: 600, h: 96 }, C = { x: -300, z: 560, h: 50 };
    this.label('Telefèric del Port', 120, 600, '🚡');
    const tower = (p) => {
      const y = gy(p.x, p.z);
      for (const [dx, dz] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) this.b.box(p.x + dx * 0.6, y, p.z + dz * 0.6, 0.9, p.h, 0.9, 0x6a6e72);
      for (let k = 1; k < 6; k++) this.b.box(p.x, y + k * p.h / 6, p.z, 4.6, 0.5, 4.6, 0x6a6e72);
      this.b.box(p.x, y + p.h, p.z, 9, 6, 9, 0x8a8f94);
      this.col.addBox(p.x, p.z, 4.6, 4.6, 0, y - 1, y + p.h + 6, 'building');
      p.top = y + p.h + 3;
    };
    tower(A); tower(B); tower(C);
    const cable = (p, q) => {
      const pts = [];
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        pts.push(new THREE.Vector3(p.x + (q.x - p.x) * t, p.top + (q.top - p.top) * t - Math.sin(t * Math.PI) * 8, p.z + (q.z - p.z) * t));
      }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      this.group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x222222 })));
      return pts;
    };
    const path = [...cable(A, B), ...cable(B, C).slice(1)];
    const cabins = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.4), new THREE.MeshLambertMaterial({ color: 0xd83a2a }));
      body.position.y = -3.2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.2, 0.15), new THREE.MeshLambertMaterial({ color: 0x333333 }));
      arm.position.y = -1.1;
      g.add(body, arm);
      this.group.add(g);
      cabins.push({ g, t: i / 3 });
    }
    this.animated.push((t, night, dt) => {
      for (const c of cabins) {
        c.t = (c.t + dt * 0.006) % 2;
        const u = c.t < 1 ? c.t : 2 - c.t;
        const f = u * (path.length - 1);
        const i = Math.min(path.length - 2, Math.floor(f));
        c.g.position.lerpVectors(path[i], path[i + 1], f - i);
      }
    });
  }

  update(dt, time, night) {
    this.time = (this.time || 0) + dt;
    for (const fn of this.animated) fn(this.time, night, dt);
    if (this.glowMat) {
      const k = 0.35 + night * 0.65;
      this.glowMat.color.setRGB(k, k, k);
    }
  }
}
