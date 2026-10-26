import * as THREE from 'three';
import { resolve } from './config.js';
import { createMaterials, applyBuild } from './materials.js';
import { buildBoat, disposeTree, TRAILER_LIFT, CRADLE_LIFT } from './boat/index.js';
import { POD } from './boat/cockpit.js';
import { createSky, createWater, createUnderwater, waterlineUniforms, wetMaterial, SUN_DIR, WL_STATIONS } from './water.js';

// Renderer, environments, lights, studio floor and contact shadow, sky and water, the boat's
// place in the scene (afloat trim and swell), the water reflection pass and the render loop.
// mountBoat(build) swaps the boat in; `current` is the live result of buildBoat() and `onWater`
// the live scene flag. The camera lives in camera.js and is passed in where needed.
//   Studio: a dark softbox environment (so bare alloy reads as metal), key / fill / rim lights,
//           a soft directional floor shadow plus a contact shadow baked once per build.
//   Water:  the golden-hour sky as environment, the sun as key, a planar reflection rendered at
//           reduced resolution each frame, static trim solved from the hull lines, gentle swell.

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const stage = document.querySelector('.stage');
export const canvas = document.getElementById('view');
// Phones and small tablets: fewer ripple octaves, no reflection MSAA, a smaller shadow map.
const lowPower = matchMedia('(max-width: 700px), (pointer: coarse)').matches;

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
const studioEnv = pmrem.fromScene(studioEnvironment(), 0.02).texture;
const envScene = new THREE.Scene();
const envSky = createSky();
envSky.geometry = new THREE.SphereGeometry(50, 32, 16);
// The environment is a desaturated copy of the visible sky. Clearcoat on dark topsides mirrors
// its horizon, and a full-strength sunset horizon turns navy and charcoal brown; decks and roofs
// take their diffuse light from its zenith, and a full blue zenith turns white surfaces blue
// (the sun is only about 10 degrees up, so the key adds little to them). The warmth and the blue
// stay in the sun, the key light and the visible sky.
envSky.material.uniforms.uHorizon.value.set('#ddd3c9');
envSky.material.uniforms.uAnti.value.set('#aeb9c6');
envSky.material.uniforms.uTop.value.set('#a6a9ad');
envScene.add(envSky);
const waterEnv = pmrem.fromScene(envScene, 0.02).texture;

// A dark photographic studio: graded walls and floor, a big overhead softbox, tall strip
// boxes either side and a cool rim strip behind, so metal and clearcoat pick up clean
// highlights with dark gaps between them.
function studioEnvironment() {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vDir;
      void main() {
        float y = normalize(vDir).y;
        vec3 floorCol = vec3(0.035, 0.036, 0.038);
        vec3 wall = vec3(0.1, 0.103, 0.108);
        vec3 ceiling = vec3(0.05, 0.052, 0.055);
        vec3 col = mix(floorCol, wall, smoothstep(-0.25, 0.05, y));
        col = mix(col, ceiling, smoothstep(0.35, 0.9, y));
        // A soft horizon band of light all round, brightest on the camera side: near-vertical
        // topsides mirror it as a clean highlight line over the darker reflected floor.
        vec3 d = normalize(vDir);
        float band = smoothstep(-0.07, -0.025, y) * (1.0 - smoothstep(0.03, 0.09, y));
        float side = 0.45 + 0.55 * max(0.0, cos(atan(d.x, d.z)));
        col += vec3(1.0, 0.99, 0.97) * band * side * 1.8;
        // The lit floor of the cove beyond the set, which elevated views see in the topsides.
        float cove = smoothstep(-0.42, -0.3, y) * (1.0 - smoothstep(-0.16, -0.08, y));
        col += vec3(0.95, 0.96, 1.0) * cove * side * 0.45;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  env.add(room);
  const panel = (w, h, colour, power, pos) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(colour).multiplyScalar(power), side: THREE.DoubleSide }));
    mesh.position.set(...pos);
    mesh.lookAt(0, pos[1] > 10 ? 0 : pos[1], 0);
    env.add(mesh);
  };
  panel(14, 7, '#fffaf2', 6, [0, 16, 2]);         // overhead softbox
  panel(10, 4, '#fffdf8', 2.5, [7, 4, 14]);        // front softbox on the camera side
  panel(2, 12, '#ffffff', 14, [15, 5, 9]);         // key-side strip
  panel(9, 1.6, '#e8f0ff', 14, [-5, 6, -16]);      // rim strip behind
  return env;
}

const key = new THREE.DirectionalLight('#ffffff', 2.2);
key.castShadow = true;
key.shadow.mapSize.setScalar(lowPower ? 1024 : 2048);
key.shadow.bias = -0.0003;
key.shadow.normalBias = 0.025;
key.shadow.radius = 3;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight('#eef3ff', 0);
scene.add(rim, rim.target);
const fill = new THREE.HemisphereLight('#dfe8f0', '#3a3530', 0.6);
scene.add(fill);

// Studio floor: the key's shadow, softened, over a baked contact shadow.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.22 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const contact = createContactShadow();
scene.add(contact.mesh);

const sky = createSky();
const water = createWater({ detail: lowPower ? 0 : 1 });
const underwater = createUnderwater();
scene.add(sky, water, underwater);
const wet = waterlineUniforms();

// vessel (bobs on the water) > offset (centres the hull) > boat; stands stay put.
export const vessel = new THREE.Group();
const offset = new THREE.Group();
vessel.add(offset);
export const stand = new THREE.Group();
scene.add(vessel, stand);

export const mats = createMaterials();
for (const m of Object.values(mats)) wetMaterial(m, wet);
export let current = null;
export let onWater = false;
let lift = 0;
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
  current.boat.traverse((o) => { if (o.isMesh) wetMaterial(o.material, wet); });
  offset.add(current.boat);
  stand.add(current.trailer, current.cradle);
  offset.position.x = -current.lines.L / 2;
  stand.position.x = -current.lines.L / 2;
  stage.dataset.scene = build.scene;
  applyScene(build);
}

// ---------- afloat: static trim from the hull lines ----------

// The Harbour sits a little stern-down at rest. The hull lines are drawn against this static
// waterline: y = WL_AFT at the transom falling to WL_FWD at the stem, so the chine root is about
// 5 cm under at the transom, the chine leaves the water around midships and the forefoot clears
// at about 0.86 L. A heavier outboard or twins settle the stern up to 1.5 cm deeper.
// Returns the stern-down angle, the waterline height wl(t) in boat coordinates and t where the
// forefoot clears.
export const WL_AFT = 0.22;
export const WL_FWD = 0.16;
export function afloatTrim(lines, build) {
  const { L, section } = lines;
  const engine = resolve(build).engine;
  const load = engine.count === 2 ? 1 : clamp((engine.hp - 150) / 150, 0, 1) * 0.6;
  const wl0 = WL_AFT + 0.015 * load;
  const angle = Math.atan((wl0 - WL_FWD) / L);
  const wl = (t) => wl0 - (wl0 - WL_FWD) * t;
  let bow = 0.5;
  while (bow < 1 && section(bow).yk < wl(bow)) bow += 0.0025;
  return { angle, wl0, wl, bow };
}

// Half-width of the hull where the water meets it at station t.
function waterlineHalfWidth(lines, t, y) {
  return lines.halfWidth(lines.section(clamp(t, 0, 1)), y);
}

function applyScene(build) {
  onWater = build.scene === 'water';
  const onTrailer = !onWater && build.options.includes('trailer');
  const { L } = current.lines;
  current.trailer.visible = onTrailer;
  current.cradle.visible = !onWater && !onTrailer;
  if (onWater) {
    const a = afloatTrim(current.lines, build);
    trim = a.angle;
    lift = (L / 2) * Math.sin(trim) - a.wl0 * Math.cos(trim);
    // The water's hull mask runs from the aft end of the boarding pods to the forefoot.
    const t0 = -POD / L;
    const u = water.material.uniforms;
    u.uHullX.value.set(t0 * L - L / 2, (a.bow - t0) * L);
    u.uWl.value = Array.from({ length: WL_STATIONS + 1 }, (_, i) => {
      const t = lerp(t0, a.bow, i / WL_STATIONS);
      return waterlineHalfWidth(current.lines, t, a.wl(t));
    });
  } else {
    trim = 0;
    lift = onTrailer ? TRAILER_LIFT : CRADLE_LIFT;
  }
  vessel.position.y = lift;
  vessel.rotation.set(0, 0, trim);

  sky.visible = water.visible = underwater.visible = onWater;
  floor.visible = contact.mesh.visible = !onWater;
  wet.uWetOn.value = onWater ? 1 : 0;
  scene.environment = onWater ? waterEnv : studioEnv;
  scene.environmentIntensity = onWater ? 0.75 : 0.8;
  renderer.toneMappingExposure = onWater ? 0.95 : 1.0;
  const reach = L / 2 + (onTrailer ? 2.6 : 1.6);
  if (onWater) {
    key.color.set('#ffe8d0');
    key.intensity = 2.8;
    key.position.copy(SUN_DIR).multiplyScalar(20);
    rim.intensity = 0;
    // Warm-neutral sky fill: upward-facing whites read white to slightly warm, not blue.
    fill.color.set('#f4e2cc');
    fill.groundColor.set('#1a2a31');
    fill.intensity = 0.95;
  } else {
    key.color.set('#fffaf4');
    key.intensity = 1.8;
    key.position.set(5, 10, 8);
    rim.color.set('#e9f0ff');
    rim.intensity = 1.3;
    rim.position.set(-7, 6, -8);
    fill.color.set('#e4ebf2');
    fill.groundColor.set('#2a2826');
    fill.intensity = 0.45;
  }
  // Shadow frustum fitted round the rig, so texels stay small without clipping the shadow.
  Object.assign(key.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 45 });
  key.shadow.camera.updateProjectionMatrix();
  key.target.position.set(0, 0, 0);
  water.material.uniforms.uGlowOn.value = onWater && current.leds.length ? 1 : 0;
  if (!onWater) contact.bake();
}

// ---------- studio contact shadow, baked once per build ----------

// The rig is seen from the floor by an orthographic camera looking up; each surface writes how
// close it is to the floor (red: within a hand's breadth, green: within the hull's height).
// Both channels are blurred, red a little and green a lot, and the floor shows the result: tight
// dark contacts under tyres and cradle pads inside a broad soft shadow under the hull.
function createContactShadow() {
  const RES = 512;
  const HIGH = 1.8;
  const opts = { type: THREE.HalfFloatType, depthBuffer: true };
  const targetA = new THREE.WebGLRenderTarget(RES, RES, opts);
  const targetB = new THREE.WebGLRenderTarget(RES, RES, { type: THREE.HalfFloatType, depthBuffer: false });
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, HIGH);
  cam.rotation.x = Math.PI / 2;
  const depth = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    vertexShader: `varying float vY;
      void main() {
        vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vec4 w = modelMatrix * p;
        vY = w.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `varying float vY;
      void main() {
        float h = max(vY, 0.0);
        gl_FragColor = vec4(pow(clamp(1.0 - h / 0.2, 0.0, 1.0), 2.0), pow(clamp(1.0 - h / ${HIGH.toFixed(2)}, 0.0, 1.0), 1.5), 0.0, 1.0);
      }`,
  });
  const blur = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, uStep: { value: new THREE.Vector4() } },
    depthTest: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tMap; uniform vec4 uStep; varying vec2 vUv;
      void main() {
        vec2 sum = vec2(0.0);
        float total = 0.0;
        for (int i = -6; i <= 6; i++) {
          float w = exp(-float(i * i) / 12.5);
          sum.x += texture2D(tMap, vUv + uStep.xy * float(i)).r * w;
          sum.y += texture2D(tMap, vUv + uStep.zw * float(i)).g * w;
          total += w;
        }
        gl_FragColor = vec4(sum / total, 0.0, 1.0);
      }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blur);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera();

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { tShadow: { value: targetA.texture }, uVP: { value: new THREE.Matrix4() } },
    vertexShader: `uniform mat4 uVP; varying vec2 vUv;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec4 c = uVP * w;
        vUv = c.xy / c.w * 0.5 + 0.5;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `uniform sampler2D tShadow; varying vec2 vUv;
      void main() {
        vec2 edge = smoothstep(0.0, 0.08, vUv) * smoothstep(1.0, 0.92, vUv);
        vec2 s = texture2D(tShadow, clamp(vUv, 0.0, 1.0)).rg;
        float a = (1.0 - (1.0 - s.r * 0.6) * (1.0 - s.g * 0.62)) * edge.x * edge.y;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;
  mesh.renderOrder = 1;

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const centre = new THREE.Vector3();
  const clear = new THREE.Color();
  function pass(from, to, sx, sy) {
    blur.uniforms.tMap.value = from.texture;
    blur.uniforms.uStep.value.set(sx[0], sy[0], sx[1], sy[1]);
    renderer.setRenderTarget(to);
    renderer.render(quadScene, quadCam);
  }
  function bake() {
    scene.updateMatrixWorld(true);
    box.makeEmpty();
    for (const part of [current.boat, current.trailer, current.cradle]) if (part.visible) box.expandByObject(part);
    box.getSize(size);
    box.getCenter(centre);
    const half = Math.max(size.x, size.z) / 2 + 1.4;
    Object.assign(cam, { left: -half, right: half, top: half, bottom: -half });
    cam.position.set(centre.x, 0, centre.z);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    material.uniforms.uVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);

    const hidden = [floor, mesh, sky, water, underwater].filter((o) => o.visible);
    hidden.forEach((o) => { o.visible = false; });
    const saved = { target: renderer.getRenderTarget(), alpha: renderer.getClearAlpha(), clipping: renderer.clippingPlanes };
    renderer.getClearColor(clear);
    renderer.clippingPlanes = [];
    renderer.setClearColor(0x000000, 0);
    scene.overrideMaterial = depth;
    renderer.setRenderTarget(targetA);
    renderer.clear();
    renderer.render(scene, cam);
    scene.overrideMaterial = null;
    // Blur radii in texels: about 4 cm for the contacts, about 30 cm for the broad shadow.
    const texel = (half * 2) / RES;
    const r = 0.04 / texel / 2.5 / RES;
    const g = 0.3 / texel / 2.5 / RES;
    for (let i = 0; i < 2; i++) {
      pass(targetA, targetB, [r, g], [0, 0]);
      pass(targetB, targetA, [0, 0], [r, g]);
    }
    renderer.setRenderTarget(saved.target);
    renderer.setClearColor(clear, saved.alpha);
    renderer.clippingPlanes = saved.clipping;
    hidden.forEach((o) => { o.visible = true; });
  }
  return { mesh, bake };
}

// Renderer and reflection target follow the stage size.
export function resizeRenderer(width, height) {
  renderer.setSize(width, height, false);
  // Reflection at half resolution, less on small high-density screens.
  const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  const scale = devicePixelRatio > 1.5 && width < 700 ? 0.35 : 0.5;
  const w = Math.max(1, Math.round(buffer.x * scale));
  const h = Math.max(1, Math.round(buffer.y * scale));
  mirrorRT.setSize(w, h);
  water.material.uniforms.uTexel.value.set(1 / w, 1 / h);
}

// ---------- water reflection: the scene mirrored in y = 0, clipped at the surface ----------

const mirrorCam = new THREE.PerspectiveCamera();
const mirrorRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: lowPower ? 0 : 4 });
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const mirrorClip = [new THREE.Plane(Y_AXIS.clone(), 0)];
const mirrorBias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const look = new THREE.Vector3();
water.material.uniforms.tReflect.value = mirrorRT.texture;

// Renders the mirror image for camera (target is accepted for compatibility; the camera's own
// direction is used, so the reflection never drifts from the view).
export function renderReflection(camera) {
  camera.updateMatrixWorld();
  mirrorCam.copy(camera);
  mirrorCam.position.set(camera.position.x, -camera.position.y, camera.position.z);
  mirrorCam.up.copy(Y_AXIS).applyQuaternion(camera.quaternion).reflect(Y_AXIS);
  camera.getWorldDirection(look);
  look.y = -look.y;
  mirrorCam.lookAt(look.add(mirrorCam.position));
  mirrorCam.updateMatrixWorld();
  water.material.uniforms.uMirror.value.multiplyMatrices(mirrorBias, mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
  water.visible = underwater.visible = false;
  sky.position.copy(mirrorCam.position);
  sky.material.uniforms.uAlpha.value = 0;
  renderer.clippingPlanes = mirrorClip;
  renderer.setRenderTarget(mirrorRT);
  renderer.render(scene, mirrorCam);
  renderer.setRenderTarget(null);
  renderer.clippingPlanes = [];
  sky.material.uniforms.uAlpha.value = 1;
  water.visible = underwater.visible = true;
  sky.position.copy(camera.position);
}

// Swell and the underwater-light glow, once a frame.
const glowPoint = new THREE.Vector3();
const aftAxis = new THREE.Vector3();
export function tick(t) {
  if (!onWater) return;
  const swell = reduceMotion ? 0 : 1;
  vessel.position.y = lift + (Math.sin(t * 0.8) * 0.014 + Math.sin(t * 1.37 + 1.1) * 0.005) * swell;
  vessel.rotation.z = trim + Math.sin(t * 0.62 + 0.8) * 0.0035 * swell;
  vessel.rotation.x = Math.sin(t * 0.5) * 0.009 * swell;
  water.material.uniforms.uTime.value = reduceMotion ? 0 : t;
  const u = water.material.uniforms;
  current.boat.updateWorldMatrix(true, false);
  for (let i = 0; i < 2; i++) {
    const p = current.leds[i];
    if (!p) { u.uGlow.value[i].w = 0; continue; }
    glowPoint.copy(p);
    current.boat.localToWorld(glowPoint);
    u.uGlow.value[i].set(glowPoint.x, glowPoint.y, glowPoint.z, 1);
  }
  aftAxis.set(-1, 0, 0).transformDirection(current.boat.matrixWorld);
  u.uGlowAft.value.set(aftAxis.x, aftAxis.z).normalize();
}

// One shadow update, the reflection when afloat, then the frame itself.
export function renderFrame(camera) {
  renderer.shadowMap.needsUpdate = true;
  if (onWater) renderReflection(camera);
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}

// Copies the frame in the same task it is rendered, over the studio backdrop the CSS draws.
// Afloat, the reflection is re-rendered for this camera first.
export function snapshot(camera) {
  renderer.shadowMap.needsUpdate = true;
  if (onWater) renderReflection(camera);
  sky.position.copy(camera.position);
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
