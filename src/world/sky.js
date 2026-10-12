// Cielo, sol, luna, niebla, ciclo día/noche y clima.

import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/utils.js';

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = `
uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float stars; uniform float time;
uniform float cloudCover; uniform vec3 cloudColor;
varying vec3 vDir;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x), mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*n2(p); p*=2.03; a*=0.5; } return v; }
void main() {
  float h = clamp(vDir.y, -0.2, 1.0);
  vec3 col = mix(horizon, top, pow(max(h, 0.0), 0.55));
  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  col += sunColor * (pow(s, 600.0) * 4.0 + pow(s, 12.0) * 0.25);
  if (vDir.y > 0.02) {
    vec2 uv = vDir.xz / (vDir.y + 0.08) * 1.6 + vec2(time * 0.006, time * 0.002);
    float c = fbm(uv);
    float cov = smoothstep(1.0 - cloudCover, 1.0 - cloudCover + 0.35, c);
    float lit = 0.75 + 0.25 * fbm(uv * 1.7 + 3.0);
    vec3 cc = cloudColor * lit + sunColor * pow(s, 4.0) * 0.4;
    col = mix(col, cc, cov * smoothstep(0.02, 0.2, vDir.y) * 0.92);
  }
  if (stars > 0.0 && vDir.y > 0.05) {
    vec3 q = floor(vDir * 300.0);
    float st = step(0.9975, hash(q));
    col += vec3(st) * stars * (0.6 + 0.4 * sin(time * 3.0 + hash(q) * 50.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 9.0; // hora del día (0..24)
    this.daySpeed = 1 / 60; // horas de juego por segundo real => día de 24 min
    this.weather = 'clear';
    this.rain = 0;
    this.targetRain = 0;
    this.weatherTimer = 240;

    this.uniforms = {
      top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() },
      stars: { value: 0 }, time: { value: 0 }, cloudCover: { value: 0.35 }, cloudColor: { value: new THREE.Color(1, 1, 1) },
    };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 24, 12),
      new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false }));
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    this.skyMesh = sky;
    scene.add(sky);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x6b5a48, 0.9);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const S = 90;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 10, far: 700 });
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);
    this.fog = new THREE.Fog(0xcfdde8, 250, 1500);
    scene.fog = this.fog;

    // Lluvia
    const N = 5000;
    const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 120, y = Math.random() * 60, z = (Math.random() - 0.5) * 120;
      pos.set([x, y, z, x + 0.05, y - 0.9, z + 0.05], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMesh = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0x9ab0c8, transparent: true, opacity: 0.0 }));
    this.rainMesh.frustumCulled = false;
    scene.add(this.rainMesh);
    this.night = 0;
  }

  get hour() { return Math.floor(this.time); }
  get minute() { return Math.floor((this.time % 1) * 60); }
  clockString() { return String(this.hour).padStart(2, '0') + ':' + String(this.minute).padStart(2, '0'); }

  update(dt, focus) {
    this.time = (this.time + dt * this.daySpeed) % 24;
    this.uniforms.time.value += dt;
    const t = this.time;
    // Elevación del sol: amanecer 6:30, ocaso 20:30 (verano mediterráneo)
    const dayFrac = (t - 6.5) / 14;
    const elev = Math.sin(clamp(dayFrac, -0.25, 1.25) * Math.PI);
    const az = lerp(-Math.PI * 0.6, Math.PI * 0.6, clamp(dayFrac, 0, 1));
    // El sol sale por el mar (este/sureste) y se pone tras Collserola/Llobregat
    const sunDir = new THREE.Vector3(-Math.sin(az) * 0.9, Math.max(elev, -0.3) * 1.2, Math.cos(az) * 0.6 + 0.2).normalize();
    const day = smoothstep(-0.12, 0.25, elev);
    const dusk = clamp(1 - Math.abs(elev - 0.08) / 0.25, 0, 1) * (elev > -0.2 ? 1 : 0);
    this.night = 1 - day;

    const cTopDay = new THREE.Color(0x3d7fd6), cHorDay = new THREE.Color(0xbcd8ee);
    const cTopNight = new THREE.Color(0x060b1c), cHorNight = new THREE.Color(0x1b2338);
    const cDusk = new THREE.Color(0xf08a4b);
    const top = cTopNight.clone().lerp(cTopDay, day);
    const hor = cHorNight.clone().lerp(cHorDay, day).lerp(cDusk, dusk * 0.7);
    const grey = this.rain;
    top.lerp(new THREE.Color(0x5a6470), grey * 0.7 * day);
    hor.lerp(new THREE.Color(0x8a939c), grey * 0.7 * day);
    this.uniforms.top.value.copy(top);
    this.uniforms.horizon.value.copy(hor);
    this.uniforms.sunDir.value.copy(elev > -0.1 ? sunDir : sunDir.clone().negate());
    this.uniforms.sunColor.value.set(elev > -0.1 ? 0xffe6b0 : 0x8899cc).multiplyScalar(elev > -0.1 ? (1 - grey * 0.8) : 0.25);
    this.uniforms.stars.value = this.night * (1 - grey);
    this.uniforms.cloudCover.value = 0.3 + grey * 0.6;
    this.uniforms.cloudColor.value.copy(new THREE.Color(0x1a2030).lerp(new THREE.Color(0xf4f2ee), day)).lerp(new THREE.Color(0xf0a070), dusk * 0.5).lerp(new THREE.Color(0x707880), grey * 0.6 * day);

    // Luces
    const sunI = day * (2.4 - grey * 1.5);
    this.sun.intensity = Math.max(0.55, sunI);
    const sunCol = new THREE.Color(0xfff1d6).lerp(new THREE.Color(0xff9a5a), dusk * 0.8);
    if (elev < -0.05) sunCol.set(0x7f93c8); // luz de luna
    this.sun.color.copy(sunCol);
    this.hemi.intensity = 0.45 + day * 1.0;
    this.hemi.intensity = 0.9 + day * 0.55;
    this.hemi.color.copy(new THREE.Color(0x4a5a8a).lerp(new THREE.Color(0xbfd8ff), day));
    // De noche el suelo refleja la luz anaranjada de las farolas
    this.hemi.groundColor.copy(new THREE.Color(0x9a6a3a).lerp(new THREE.Color(0x6b5a48), day));
    this.fog.color.copy(hor);
    this.fog.near = lerp(250, 80, grey);
    this.fog.far = lerp(1500, 600, grey) * (0.75 + 0.25 * day);
    this.renderer.toneMappingExposure = 0.9 + this.night * 0.45;

    // Sombra centrada en el jugador
    const lightDir = elev > -0.05 ? sunDir : sunDir.clone().negate().setY(Math.abs(sunDir.y) + 0.4).normalize();
    if (focus) {
      this.sun.position.set(focus.x + lightDir.x * 300, focus.y + Math.max(lightDir.y, 0.2) * 300, focus.z + lightDir.z * 300);
      this.sun.target.position.set(focus.x, focus.y, focus.z);
      // Ajuste a texeles para evitar parpadeo
      this.skyMesh.position.set(focus.x, 0, focus.z);
      this.rainMesh.position.set(focus.x, focus.y - 10, focus.z);
    }

    // Clima
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 180 + Math.random() * 300;
      this.targetRain = Math.random() < 0.22 ? 0.6 + Math.random() * 0.4 : 0;
    }
    this.rain += (this.targetRain - this.rain) * Math.min(1, dt * 0.1);
    this.rainMesh.material.opacity = this.rain * 0.55;
    this.rainMesh.visible = this.rain > 0.02;
    if (this.rainMesh.visible) {
      const p = this.rainMesh.geometry.attributes.position;
      const a = p.array;
      for (let i = 0; i < a.length; i += 6) {
        a[i + 1] -= dt * 30; a[i + 4] -= dt * 30;
        if (a[i + 4] < 0) { a[i + 1] += 60; a[i + 4] += 60; }
      }
      p.needsUpdate = true;
    }
  }

  /** ¿Es de noche? (para spawns, misiones, etc.) */
  isNight() { return this.time < 7 || this.time > 21; }
}
