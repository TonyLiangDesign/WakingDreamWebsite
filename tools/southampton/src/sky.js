import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { installPortClouds } from './sky-clouds.js';

// Preetham sky with fair-weather cumulus, a matching sun light, and an IBL
// environment re-baked from the same sky whenever the sun moves.
export class Atmosphere {
  constructor(renderer, scene) {
    this.renderer = renderer;
    this.scene = scene;
    this.sky = new Sky();
    this.sky.scale.setScalar(20000);
    this.sky.name = 'sky';
    const u = this.sky.material.uniforms;
    u.turbidity.value = 4.6;
    u.rayleigh.value = 1.1;
    u.mieCoefficient.value = 0.0032;
    u.mieDirectionalG.value = 0.77;
    u.cloudCoverage.value = 0.46;
    u.cloudDensity.value = 0.68;
    u.cloudElevation.value = 0.55;
    u.cloudScale.value = 0.00068;
    u.cloudSpeed.value = 0.00003;
    installPortClouds(this.sky.material);
    scene.add(this.sky);

    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.sun = new THREE.DirectionalLight(0xffffff, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2;
    const sc = this.sun.shadow.camera;
    sc.near = 10; sc.far = 3000;
    scene.add(this.sun, this.sun.target);

    this.hemi = new THREE.HemisphereLight(0x9fb8d6, 0x3a3a34, 0.0);
    scene.add(this.hemi);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1000);
    this.envSky.material.uniforms = this.sky.material.uniforms; // share
    this.envSky.material.fragmentShader = this.sky.material.fragmentShader;
    this.envScene.add(this.envSky);
    // dark ground bounce hemisphere below horizon so reflections of the "ground" aren't sky blue
    const ground = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16, 0, Math.PI * 2, Math.PI / 2 + 0.02, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x2b2c26, side: THREE.BackSide }));
    this.envGround = ground;
    this.envScene.add(ground);
    this.envRT = null;

    this.sunColor = new THREE.Color();
    this.skyColor = new THREE.Color();
    this.sunBase = 42;
  }

  setSun(dir) {
    this.sunDir.copy(dir).normalize();
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir).multiplyScalar(450000);
    // approximate transmitted sun colour through the air mass
    const el = Math.max(this.sunDir.y, 0.001);
    const airMass = 1 / (el + 0.15 * Math.pow(93.885 - (Math.asin(el) * 180) / Math.PI, -1.253));
    const tau = [0.028, 0.055, 0.115].map((k) => Math.exp(-k * airMass * 1.25));
    this.sunColor.setRGB(tau[0], tau[1], tau[2]).multiplyScalar(1 / Math.max(tau[0], 1e-3));
    this.sun.color.copy(this.sunColor);
    this.sun.intensity = this.sunBase * Math.min(1, el * 4) * tau[1] / 0.9;
    const g = this.envGround.material.color;
    g.setRGB(0.05, 0.05, 0.045).multiplyScalar(0.4 + 4 * el);
    this.skyColor.setRGB(0.42, 0.55, 0.72).multiplyScalar(0.3 + 0.9 * el);
    this.bakeEnv();
  }

  bakeEnv() {
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 1, 5000);
    this.scene.environment = this.envRT.texture;
    this.measureHorizon();
  }

  // Render the sky at a few azimuths just above the horizon and average, so the
  // aerial haze blends into the real sky colour instead of a guessed constant.
  measureHorizon() {
    const r = this.renderer;
    if (!this.probeRT) {
      this.probeRT = new THREE.WebGLRenderTarget(16, 16, { type: THREE.FloatType });
      this.probeCam = new THREE.PerspectiveCamera(8, 1, 1, 5000);
      this.probeBuf = new Float32Array(16 * 16 * 4);
    }
    const prev = r.getRenderTarget();
    const cov = this.sky.material.uniforms.cloudCoverage.value;
    this.sky.material.uniforms.cloudCoverage.value = 0;
    const sunAz = Math.atan2(this.sunDir.x, -this.sunDir.z);
    const away = new THREE.Color(0, 0, 0), toward = new THREE.Color();
    const sample = (az, out) => {
      this.probeCam.position.set(0, 0, 0);
      this.probeCam.lookAt(Math.sin(az), Math.tan(0.1), -Math.cos(az));
      r.setRenderTarget(this.probeRT);
      r.render(this.envScene, this.probeCam);
      r.readRenderTargetPixels(this.probeRT, 0, 0, 16, 16, this.probeBuf);
      let R = 0, G = 0, B = 0;
      for (let i = 0; i < 256; i++) { R += this.probeBuf[i * 4]; G += this.probeBuf[i * 4 + 1]; B += this.probeBuf[i * 4 + 2]; }
      out.setRGB(R / 256, G / 256, B / 256);
    };
    const tmp = new THREE.Color();
    for (const d of [Math.PI * 0.5, Math.PI, Math.PI * 1.5]) { sample(sunAz + d, tmp); away.add(tmp); }
    away.multiplyScalar(1 / 3);
    sample(sunAz, toward);
    r.setRenderTarget(prev);
    this.sky.material.uniforms.cloudCoverage.value = cov;
    this.horizonAway = away;
    this.horizonToward = toward;
  }

  // keep the shadow frustum tight around what the camera is looking at
  focusShadow(center, radius) {
    const s = this.sun;
    const r = Math.max(radius, 40);
    s.target.position.copy(center);
    s.position.copy(center).addScaledVector(this.sunDir, 1500);
    const sc = s.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r;
    sc.near = 1; sc.far = 3000;
    sc.updateProjectionMatrix();
    s.shadow.normalBias = 0.02 + r / 4096 * 1.5;
  }

  update(t) {
    this.sky.material.uniforms.time.value = t;
  }
}
