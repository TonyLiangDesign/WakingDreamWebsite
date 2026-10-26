import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createMaterials, applyBuild } from './materials.js';
import { buildBoat, disposeTree, TRAILER_LIFT, CRADLE_LIFT } from './boat/index.js';
import { createSky, createWater, SUN_DIR, WL_STATIONS } from './water.js';

// Renderer, environments, lights, studio floor and contact shadow, sky and water, the boat's
// place in the scene (afloat trim and swell), the water reflection pass and the render loop.
// mountBoat(build) swaps the boat in; `current` is the live result of buildBoat() and `onWater`
// the live scene flag. The camera lives in camera.js and is passed in where needed.

const lerp = THREE.MathUtils.lerp;
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const stage = document.querySelector('.stage');
export const canvas = document.getElementById('view');

// ---------- renderer and scene ----------

export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// One shadow update per frame, shared by the reflection pass and the main render.
renderer.shadowMap.autoUpdate = false;

export const scene = new THREE.Scene();

const pmrem = new THREE.PMREMGenerator(renderer);
const studioEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const envScene = new THREE.Scene();
const envSky = createSky();
envSky.geometry = new THREE.SphereGeometry(50, 32, 16);
envScene.add(envSky);
const waterEnv = pmrem.fromScene(envScene, 0.02).texture;

const key = new THREE.DirectionalLight('#ffffff', 2.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
key.shadow.radius = 3;
Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
scene.add(key, key.target);
const fill = new THREE.HemisphereLight('#dfe8f0', '#3a3530', 0.6);
scene.add(fill);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.3 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.75 }));
contact.rotation.x = -Math.PI / 2;
contact.position.y = 0.002;
scene.add(contact);

const sky = createSky();
const water = createWater();
scene.add(sky, water);

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.6, 'rgba(0,0,0,0.18)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

// vessel (bobs on the water) > offset (centres the hull) > boat; stands stay put.
export const vessel = new THREE.Group();
const offset = new THREE.Group();
vessel.add(offset);
export const stand = new THREE.Group();
scene.add(vessel, stand);

export const mats = createMaterials();
export let current = null;
export let onWater = false;
let lift = 0;
// Afloat the hull sits a little stern-down: the waterline is just above the chine at the
// transom (WL_AFT) and falls towards the bow (WL_FWD), so only the forefoot clears the water.
const WL_AFT = 0.22;
const WL_FWD = 0.16;
const SINK = (WL_AFT + WL_FWD) / 2;
let trim = 0;

// Swaps in a freshly built boat for build and sets the scene up for it.
export function mountBoat(build) {
  if (current) {
    offset.remove(current.boat);
    stand.remove(current.trailer, current.cradle);
    for (const part of [current.boat, current.trailer, current.cradle]) disposeTree(part);
  }
  applyBuild(mats, build);
  current = buildBoat(build, mats);
  offset.add(current.boat);
  stand.add(current.trailer, current.cradle);
  offset.position.x = -current.lines.L / 2;
  stand.position.x = -current.lines.L / 2;
  stage.dataset.scene = build.scene;
  applyScene(build);
}

function applyScene(build) {
  onWater = build.scene === 'water';
  const onTrailer = !onWater && build.options.includes('trailer');
  current.trailer.visible = onTrailer;
  current.cradle.visible = !onWater && !onTrailer;
  lift = onWater ? -SINK : onTrailer ? TRAILER_LIFT : CRADLE_LIFT;
  trim = onWater ? (WL_AFT - WL_FWD) / current.lines.L : 0;
  vessel.position.y = lift;
  vessel.rotation.set(0, 0, trim);

  sky.visible = water.visible = onWater;
  floor.visible = contact.visible = !onWater;
  scene.environment = onWater ? waterEnv : studioEnv;
  scene.environmentIntensity = onWater ? 0.7 : 0.9;
  renderer.toneMappingExposure = onWater ? 0.95 : 1.05;
  if (onWater) {
    key.color.set('#ffdfbd');
    key.intensity = 2.5;
    key.position.copy(SUN_DIR).multiplyScalar(20);
    fill.color.set('#a9c4e4');
    fill.groundColor.set('#1d2c33');
    fill.intensity = 0.8;
  } else {
    key.color.set('#ffffff');
    key.intensity = 2.2;
    key.position.set(5, 11, 6);
    fill.color.set('#dfe8f0');
    fill.groundColor.set('#3a3530');
    fill.intensity = 0.6;
  }
  key.target.position.set(0, 0, 0);
  const L = current.lines.L;
  contact.scale.set(L + (onTrailer ? 3.2 : 1.4), 3.0, 1);
  contact.position.x = onTrailer ? 0.8 : 0;
  water.material.uniforms.uGlowOn.value = onWater && current.leds.length ? 1 : 0;
  // Waterline half-widths from the transom to where the forefoot leaves the water.
  const wl = (t) => current.lines.bottomZ(current.lines.section(t), lerp(WL_AFT, WL_FWD, t));
  let bow = 0.5;
  while (bow < 1 && wl(bow) > 0.001) bow += 0.005;
  water.material.uniforms.uHullX.value.set(-L / 2, L * bow);
  water.material.uniforms.uWl.value = Array.from({ length: WL_STATIONS + 1 }, (_, i) => wl((i / WL_STATIONS) * bow));
}

// Renderer and reflection target follow the stage size.
export function resizeRenderer(width, height) {
  renderer.setSize(width, height, false);
  // Reflection at half resolution, less on small high-density screens.
  const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  const scale = devicePixelRatio > 1.5 && width < 700 ? 0.35 : 0.5;
  mirrorRT.setSize(Math.max(1, Math.round(buffer.x * scale)), Math.max(1, Math.round(buffer.y * scale)));
}

// ---------- water reflection: the scene mirrored in y = 0, clipped at the surface ----------

const mirrorCam = new THREE.PerspectiveCamera();
const mirrorRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const mirrorClip = [new THREE.Plane(Y_AXIS.clone(), 0)];
const mirrorBias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
water.material.uniforms.tReflect.value = mirrorRT.texture;

export function renderReflection(camera, target) {
  mirrorCam.copy(camera);
  mirrorCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
  mirrorCam.up.copy(Y_AXIS).applyQuaternion(camera.quaternion).reflect(Y_AXIS);
  mirrorCam.lookAt(target.x, -target.y, target.z);
  mirrorCam.updateMatrixWorld();
  water.material.uniforms.uMirror.value.multiplyMatrices(mirrorBias, mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
  water.visible = false;
  sky.position.copy(mirrorCam.position);
  renderer.clippingPlanes = mirrorClip;
  renderer.setRenderTarget(mirrorRT);
  renderer.render(scene, mirrorCam);
  renderer.setRenderTarget(null);
  renderer.clippingPlanes = [];
  water.visible = true;
  sky.position.copy(camera.position);
}

// Swell and the underwater-light glow, once a frame.
const glowPoint = new THREE.Vector3();
export function tick(t) {
  if (onWater) {
    const swell = reduceMotion ? 0 : 1;
    vessel.position.y = lift + Math.sin(t * 0.9) * 0.035 * swell;
    vessel.rotation.z = trim + Math.sin(t * 0.7 + 0.8) * 0.01 * swell;
    vessel.rotation.x = Math.sin(t * 0.55) * 0.018 * swell;
    water.material.uniforms.uTime.value = reduceMotion ? 0 : t;
    current.leds.forEach((p, i) => {
      glowPoint.copy(p).add(new THREE.Vector3(-0.5, 0, 0));
      current.boat.localToWorld(glowPoint);
      water.material.uniforms.uGlow.value[i].copy(glowPoint);
    });
  }
}

// One shadow update, the reflection when afloat, then the frame itself.
export function renderFrame(camera, target) {
  renderer.shadowMap.needsUpdate = true;
  if (onWater) renderReflection(camera, target);
  renderer.render(scene, camera);
}

// Copies the frame in the same task it is rendered, over the studio backdrop the CSS draws.
export function snapshot(camera) {
  renderer.render(scene, camera);
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  if (!onWater) {
    const r = Math.hypot(out.width, out.height) * 0.6;
    const grad = ctx.createRadialGradient(out.width / 2, out.height * 0.38, 0, out.width / 2, out.height * 0.38, r);
    grad.addColorStop(0, '#3a3d40');
    grad.addColorStop(0.48, '#222427');
    grad.addColorStop(1, '#131415');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.drawImage(canvas, 0, 0);
  return out;
}

// Runs forever: step() moves the camera, then the scene ticks and renders.
export function startLoop(camera, controls, step) {
  const timer = new THREE.Timer();
  function frame(now) {
    timer.update(now);
    step();
    tick(timer.getElapsed());
    controls.update();
    renderFrame(camera, controls.target);
    requestAnimationFrame(frame);
  }
  frame();
}
