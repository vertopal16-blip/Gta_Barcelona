// Postprocesado: bloom (luces y neones), viñeta y gradación de color.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 0.35 },
    warmth: { value: 0.0 },
    saturation: { value: 1.08 },
    hurt: { value: 0.0 },
    flash: { value: 0.0 },
    flashColor: { value: new THREE.Color(1, 0, 0) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette; uniform float warmth; uniform float saturation;
    uniform float hurt; uniform float flash; uniform vec3 flashColor; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, saturation - hurt * 0.8);
      c.rgb *= vec3(1.0 + warmth * 0.08, 1.0 + warmth * 0.02, 1.0 - warmth * 0.06);
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * vignette * 2.2;
      c.rgb *= clamp(v, 0.0, 1.0);
      float edge = smoothstep(0.15, 0.75, length(d) * 1.4);
      c.rgb = mix(c.rgb, vec3(0.6, 0.0, 0.0), hurt * edge * 0.6);
      c.rgb = mix(c.rgb, flashColor, flash * edge * 0.35);
      gl_FragColor = c;
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    const size = renderer.getSize(new THREE.Vector2());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.4, 0.5, 0.82);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.enabled = true;
    this.bloomOn = true;
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
  }

  update(dt, night, rain, hurt, wantedFlash) {
    this.bloom.enabled = this.bloomOn;
    this.bloom.strength = 0.15 + night * 0.55;
    this.bloom.threshold = 0.9 - night * 0.1;
    const u = this.grade.uniforms;
    u.warmth.value = (1 - night) * 0.6 - rain * 0.5;
    u.saturation.value = 1.12 - rain * 0.25 - night * 0.05;
    u.vignette.value = 0.3 + night * 0.2;
    u.hurt.value += (hurt - u.hurt.value) * Math.min(1, dt * 4);
    u.flash.value = wantedFlash;
  }

  render() { this.composer.render(); }
}
