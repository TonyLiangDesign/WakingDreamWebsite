import * as THREE from 'three';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { resolve } from './config.js';
import { createMaterials, applyBuild } from './materials.js';
import { buildBoat, disposeTree, TRAILER_LIFT, CRADLE_LIFT } from './boat/index.js';
import { waterlineUniforms, wetMaterial, SUN_DIR, WL_STATIONS } from './wet.js';

// Renderer, environments, lights, studio floor and contact shadow, sky and water, the boat's
// place in the scene (running trim and motion), the water reflection pass and the render loop.
// mountBoat(build) swaps the boat in; `current` is the live result of buildBoat() and `onWater`
// the live scene flag. The camera lives in camera.js and is passed in where needed.
//   Studio: a dark softbox environment (so bare alloy reads as metal), key / fill / rim lights,
//           a soft directional floor shadow plus a contact shadow baked once per build.
//   Water:  the golden-hour sky as environment, the sun as key, a planar reflection rendered at
//           reduced resolution each frame. The sky, sea, spray, white water and skipper (sea.js)
//           are fetched and built the first time a build asks for the water (loadSea), so the
//           page starts on the boat alone; until they arrive a water build shows in the studio. The boat is shown underway, held in place while the
//           sea streams past: planing trim solved from the hull lines, a light chop in its
//           motion, the wake in the water shader, the spray and white water (spray.js).

performance.mark('scene-module-start');
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const stage = document.querySelector('.stage');
export const canvas = document.getElementById('view');
// Phones, small tablets and small very-high-density screens: fewer ripple octaves, no reflection
// MSAA, a smaller shadow map, and the plain forward render (no ambient occlusion pipeline).
const lowPower = matchMedia('(max-width: 700px), (pointer: coarse)').matches
  || (devicePixelRatio > 2 && Math.min(screen.width, screen.height) < 900);
// QA: ?qaAO=0 keeps the desktop pipeline but switches the occlusion off (for A/B and timings);
// ?qaAO=view shows the occlusion buffer itself.
const qaAO = new URLSearchParams(location.search).get('qaAO');
// QA: ?qaNoAsync skips the off-thread shader compile before the first frame (for A/B timings).
const qaNoAsync = new URLSearchParams(location.search).has('qaNoAsync');
// QA: ?qaPerf exposes window.qaPerf.frame() (one synchronous frame of the live scene) for timing.
const qaPerf = new URLSearchParams(location.search).has('qaPerf') ? (window.qaPerf = { camera: null, frame: () => renderFrame(qaPerf.camera) }) : null;

// ---------- renderer and scene ----------

// Desktop renders into a multisampled target and finishes in post (see createPost), so the
// canvas itself needs no MSAA; the low-power path draws straight to the canvas.
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: lowPower, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Shadows are static in the studio; afloat, one update is shared by both render passes.
renderer.shadowMap.autoUpdate = false;
let shadowDirty = true;
// One clipping plane is always set: the surface in the reflection pass, and far below everything
// otherwise. Programs are built per clipping-plane count, so this keeps the two passes on one
// set of boat programs instead of compiling a second one for the reflection.
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const mirrorClip = [new THREE.Plane(Y_AXIS.clone(), 0)];
const openClip = [new THREE.Plane(Y_AXIS.clone(), 1e4)];
renderer.clippingPlanes = openClip;

export const scene = new THREE.Scene();

const pmrem = new THREE.PMREMGenerator(renderer);
let studioEnv = null;
function prepareStudio() {
  if (studioEnv) return;
  const environment = studioEnvironment();
  studioEnv = pmrem.fromScene(environment, 0.02).texture;
  environment.traverse((o) => {
    o.geometry?.dispose();
    o.material?.dispose();
  });
}

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
  // A long, low, dim strip behind the set: the turn of the bilge and the chines on dark hulls
  // catch it as a soft edge line, separating navy and charcoal from the dark backdrop.
  panel(30, 1.2, '#e6eefc', 2.2, [-3, 0.9, -17]);
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

// Studio floor: draws nothing itself (its shadows are baked into the contact layer) but writes
// depth and normals into the occlusion pass, so the floor darkens where tyres and pads meet it.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const contact = createContactShadow();
scene.add(contact.mesh);

const wet = waterlineUniforms();

// ---------- the sea, loaded on demand ----------

// sea (sea.js) holds the sky, water, underwater floor, spray, white water, the sky-lit environment
// and the skipper loader. null until the first water build asks for it; loadSea() fetches the
// chunk once, builds it, compiles its shaders off the main thread and then shows the water if the
// latest build still wants it. Frames are held (paused) while those shaders link, so the studio
// frame stays up instead of a half-compiled one.
let sea = null;
let seaLoading = null;
let paused = false;
let lastBuild = null;
let frameCamera = null;
export const seaReady = () => !!sea;
export function loadSea() {
  if (!seaLoading) {
    seaLoading = import('./sea.js').then(async (m) => {
      const built = m.createSea({ pmrem, lowPower, mirrorTexture: mirrorRT.texture });
      scene.add(built.sky, built.water, built.underwater, built.spray.object, built.whiteWater.mesh);
      built.water.material.uniforms.uTexel.value.set(1 / mirrorRT.width, 1 / mirrorRT.height);
      sea = built;
      if (lastBuild?.scene === 'water') {
        paused = true;
        try {
          applyScene(lastBuild);
          if (frameCamera) await compileScene(frameCamera);
        } finally {
          paused = false;
        }
      }
      return sea;
    });
  }
  return seaLoading;
}

// Links every program `root` needs (the scene, or a probe of objects lit by it), in parallel and
// off the main thread where the browser allows (KHR_parallel_shader_compile), so the frame that
// first draws them never stalls on a compile. The desktop pipeline draws the scene into its HDR
// target (linear, no tone mapping): compile with that target bound so the programs built are the
// ones the frame uses.
export async function compileScene(camera, root = scene) {
  if (qaNoAsync) return;
  if (post) renderer.setRenderTarget(post.target);
  try {
    await renderer.compileAsync(root, camera, scene);
  } finally {
    renderer.setRenderTarget(null);
  }
}

// ---------- the boat appears as clay, then its materials ----------

// The boat's own shader programs are the long compiles of a first visit. Until they are linked,
// every part of the rig draws in clay (a matcap: one small program, no lights or shadows to
// resolve), so the boat is on screen and turning within a second; revealLit() links the real
// materials in the background on a probe of the rig's meshes and swaps them in once they are
// ready. Later builds use the real materials straight away.
function clayMatcap() {
  const n = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(n * 0.38, n * 0.34, n * 0.05, n * 0.5, n * 0.5, n * 0.52);
  g.addColorStop(0, '#f2f0ec');
  g.addColorStop(0.45, '#b9b6b0');
  g.addColorStop(0.85, '#6c6a66');
  g.addColorStop(1, '#3e3d3b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, n, n);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const clay = new THREE.MeshMatcapMaterial({ matcap: clayMatcap(), side: THREE.DoubleSide });
let litReady = false;
export const litShown = () => litReady;
function clayOver(part) {
  part.traverse((o) => {
    if (o.isMesh && !o.userData.lit) {
      o.userData.lit = o.material;
      o.material = clay;
    }
  });
}
function restoreLit(part) {
  part.traverse((o) => {
    if (o.isMesh && o.userData.lit) {
      o.material = o.userData.lit;
      delete o.userData.lit;
    }
  });
}
export async function revealLit(camera) {
  if (litReady) return;
  if (!onWater) {
    prepareStudio();
    scene.environment = studioEnv;
    contact.bake();
    contact.mesh.visible = true;
  }
  const probe = new THREE.Scene();
  const seen = new Set();
  for (const part of [current.boat, current.trailer, current.cradle]) {
    part.traverse((o) => {
      if (!o.isMesh || !o.userData.lit) return;
      const key = `${o.userData.lit.uuid}|${o.receiveShadow}`;
      if (seen.has(key)) return;
      seen.add(key);
      // The probe mesh shares the geometry, so its attributes shape the program exactly as the
      // part's will.
      const mesh = new THREE.Mesh(o.geometry, o.userData.lit);
      mesh.castShadow = o.castShadow;
      mesh.receiveShadow = o.receiveShadow;
      probe.add(mesh);
    });
  }
  await compileScene(camera, probe);
  litReady = true;
  shadowDirty = true;
  for (const part of [current.boat, current.trailer, current.cradle]) restoreLit(part);
  collectOcclusionHidden();
  performance.mark('lit-shown');
}

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
// The skipper at the helm (crew.js), loaded the first time the water scene shows.
let skipper = null;
let lift = 0;
let trim = 0;

// Swaps in a freshly built boat for build and sets the scene up for it.
export function mountBoat(build) {
  lastBuild = build;
  if (current) {
    offset.remove(current.boat);
    stand.remove(current.trailer, current.cradle);
    for (const part of [current.boat, current.trailer, current.cradle]) disposeTree(part);
  }
  applyBuild(mats, build);
  current = buildBoat(build, mats);
  // The trailer and cradle take the patch too, so they draw with the boat's programs.
  for (const part of [current.boat, current.trailer, current.cradle]) part.traverse((o) => { if (o.isMesh) wetMaterial(o.material, wet); });
  offset.add(current.boat);
  stand.add(current.trailer, current.cradle);
  offset.position.x = -current.lines.L / 2;
  stand.position.x = -current.lines.L / 2;
  if (!litReady) for (const part of [current.boat, current.trailer, current.cradle]) clayOver(part);
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

// ---------- underway: planing trim from the hull lines ----------

// Shown on the water the Harbour runs at about 20 knots (the sea streams aft at UNDERWAY.speed
// m/s). Planing, she sits 4.2 degrees bow-up on the keel line with the transom lifted until the
// water meets the bottom UNDERWAY.draft above the keel: the chines run dry at the transom and the
// keel leaves the water a little forward of midships, at the spray root. A heavier outboard or
// twins sit the stern up to 1.5 cm deeper. Returns the bow-up angle, the waterline height wl(t)
// in boat coordinates and t at the spray root.
export const UNDERWAY = { speed: 10, trim: THREE.MathUtils.degToRad(4.2), draft: 0.25 };
export function underwayTrim(lines, build) {
  const { L, section } = lines;
  const engine = resolve(build).engine;
  const load = engine.count === 2 ? 1 : clamp((engine.hp - 150) / 150, 0, 1) * 0.6;
  const wl0 = section(0).yk + UNDERWAY.draft + 0.015 * load;
  const fall = Math.tan(UNDERWAY.trim) * L;
  const wl = (t) => wl0 - fall * t;
  let bow = 0.2;
  while (bow < 1 && section(bow).yk < wl(bow)) bow += 0.0025;
  return { angle: UNDERWAY.trim, wl0, wl, bow };
}

// Where the spray leaves the hull: the chine edge over the forward part of the wetted length,
// strongest a little aft of the spray root and dying away aft; and the props, a little aft of
// each engine's mount.
function sprayRig(lines, engines, bow) {
  const t0 = Math.max(0.1, bow - 0.34);
  const t1 = bow - 0.02;
  const chine = Array.from({ length: 16 }, (_, i) => {
    const u = i / 15;
    const sec = lines.section(lerp(t0, t1, u));
    return [sec.x, sec.yc - 0.04, sec.zc, Math.pow(Math.sin(Math.PI * Math.pow(u, 1.6)), 1.5) * (0.3 + 0.7 * u)];
  });
  return { chine, props: engines.map(([x, z]) => [x - 0.45, z]) };
}

// The white-water ribbon's stations (starboard side, world space), from the spray root aft and
// on past the transom. Inner edge: tucked just under the chine edge, at most 22 cm up and rising
// over the first stretch aft of the spray root. Outer edge: out on the sea, where the bow wave
// crest stands, widening aft. Astern of the transom the ribbon follows the crest out and drops
// to the surface. Call with the vessel at its running trim (no motion).
const ribbonPoint = new THREE.Vector3();
function whiteWaterRows(lines, boat, bow) {
  const { L } = lines;
  const rows = [];
  const world = (x, y, z) => ribbonPoint.set(x, y, z).applyMatrix4(boat.matrixWorld).clone();
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const t = bow - 0.04 - (bow - 0.04) * (i / N);
    const sec = lines.section(t);
    const along = (bow - t) * L;
    const edge = world(sec.x, sec.yc, sec.zc * 0.93);
    const rise = clamp(along / 1.2, 0, 1);
    const inner = [edge.x, Math.min(edge.y - 0.02, 0.22) * rise, edge.z];
    const outer = [edge.x - 0.05, 0, sec.zc + 0.28 + 0.07 * along];
    rows.push([inner, outer]);
  }
  // Astern: two more stations peeling away with the crest.
  const [lastIn, lastOut] = rows[rows.length - 1];
  for (const d of [0.8, 1.8]) {
    rows.push([[lastIn[0] - d, lastIn[1] * (1 - d / 2), lastIn[2] + 0.2 * d], [lastOut[0] - d, 0, lastOut[2] + 0.25 * d]]);
  }
  return rows;
}

// Half-width of the hull where the water meets it at station t.
function waterlineHalfWidth(lines, t, y) {
  return lines.halfWidth(lines.section(clamp(t, 0, 1)), y);
}

function applyScene(build) {
  shadowDirty = true;
  // A water build before the sea has arrived shows in the studio and asks for the sea.
  onWater = build.scene === 'water' && !!sea;
  if (build.scene === 'water' && !sea) loadSea();
  stage.dataset.scene = onWater ? 'water' : 'studio';
  const onTrailer = !onWater && build.options.includes('trailer');
  const { L } = current.lines;
  current.trailer.visible = onTrailer;
  current.cradle.visible = !onWater && !onTrailer;
  const { water, sky, underwater, spray, whiteWater } = sea || {};
  const u = water?.material.uniforms;
  if (onWater) {
    const a = underwayTrim(current.lines, build);
    trim = a.angle;
    lift = (L / 2) * Math.sin(trim) - a.wl0 * Math.cos(trim);
    // Underway the pods ride clear: the water's hull mask runs from the transom to the spray root,
    // and the wake is drawn from both.
    u.uHullX.value.set(-L / 2, a.bow * L);
    u.uWl.value = Array.from({ length: WL_STATIONS + 1 }, (_, i) => {
      const t = a.bow * (i / WL_STATIONS);
      return waterlineHalfWidth(current.lines, t, a.wl(t));
    });
    // Each prop's wash; twins run two streams that merge astern.
    u.uWash.value = 0.3;
    u.uProp.value = current.engines.length > 1 ? Math.abs(current.engines[0][1]) : 0;
    u.uChine.value = current.lines.section(0.3).zc;
    spray.setRig(sprayRig(current.lines, current.engines, a.bow));
  } else {
    trim = 0;
    lift = onTrailer ? TRAILER_LIFT : CRADLE_LIFT;
  }
  vessel.position.y = lift;
  vessel.rotation.set(0, 0, trim);
  if (sea) {
    u.uRun.value = onWater ? 1 : 0;
    spray.object.visible = onWater;
    whiteWater.mesh.visible = onWater;
    sky.visible = water.visible = underwater.visible = onWater;
  }
  if (onWater) {
    vessel.updateMatrixWorld(true);
    spray.warm(current.boat, UNDERWAY.speed);
    whiteWater.build(whiteWaterRows(current.lines, current.boat, underwayTrim(current.lines, build).bow));
  }

  floor.visible = !onWater;
  contact.mesh.visible = !onWater && litReady;
  wet.uWetOn.value = onWater ? 1 : 0;
  if (!onWater && litReady) prepareStudio();
  scene.environment = onWater ? sea.waterEnv : studioEnv;
  scene.environmentIntensity = onWater ? 0.75 : 0.8;
  // Studio: Khronos PBR Neutral keeps paint hues true (ACES pushes red to crimson and navy to
  // violet) and rolls white decks off softly instead of clipping them. Water: ACES, whose
  // highlight desaturation keeps whites neutral under the warm low sun (round-1 tuning).
  renderer.toneMapping = onWater ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = onWater ? 0.95 : 1.25;
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
  key.target.position.set(0, 0, 0);
  fitKeyShadow();
  if (sea) u.uGlowOn.value = onWater && current.leds.length ? 1 : 0;
  if (!onWater && litReady) contact.bake();
  if (skipper) skipper.root.visible = onWater;
  if (onWater) {
    sea.loadSkipper().then((s) => {
      skipper = s;
      if (!s.root.parent) offset.add(s.root);
      s.root.visible = onWater;
      if (!onWater) return;
      vessel.updateMatrixWorld(true);
      sea.placeSkipper(s, current.helm);
      collectOcclusionHidden();
    });
  }
  collectOcclusionHidden();
}

// The key's shadow camera, fitted in light space to the rig's bounds (rods and all) with a
// margin for the swell and the filter, so its texels stay as small as the rig allows and no
// caster is ever cut off at the frustum edge. The floor's shadows are baked separately, so
// only the rig itself has to fit.
const shadowBox = new THREE.Box3();
const corner = new THREE.Vector3();
function fitKeyShadow() {
  vessel.updateMatrixWorld(true);
  stand.updateMatrixWorld(true);
  shadowBox.makeEmpty();
  for (const part of [current.boat, current.trailer, current.cradle]) if (part.visible) shadowBox.expandByObject(part);
  const cam = key.shadow.camera;
  cam.position.copy(key.position);
  cam.lookAt(key.target.position);
  cam.updateMatrixWorld();
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? shadowBox.max.x : shadowBox.min.x, i & 2 ? shadowBox.max.y : shadowBox.min.y, i & 4 ? shadowBox.max.z : shadowBox.min.z);
    corner.applyMatrix4(cam.matrixWorldInverse);
    x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x);
    y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
    z0 = Math.min(z0, corner.z); z1 = Math.max(z1, corner.z);
  }
  const m = 0.15;
  Object.assign(cam, { left: x0 - m, right: x1 + m, bottom: y0 - m, top: y1 + m, near: Math.max(0.1, -z1 - 1), far: -z0 + 1 });
  cam.updateProjectionMatrix();
}

// ---------- studio floor shadows, baked once per build ----------

// The rig never moves in the studio, so everything the floor shows is baked once per build into
// one texture seen from below by an orthographic camera:
//   r  contact: surfaces within a hand's breadth of the floor (tyres, cradle pads)
//   g  ambient: surfaces within the hull's height (the broad soft pool under the rig)
//   b  key, low casters (under ~2 m: hull, trailer, cradle), projected along the key
//   a  key, high casters (cabin top, hardtop, rods), projected along the key, blurred wider
// A big softbox throws a soft cast shadow whose penumbra grows with the caster's height, so the
// hull's shadow stays defined while rods and rails high above leave only a faint smudge, never
// the stair-stepped lines a real-time shadow map draws for thin geometry. Costs nothing a frame.
function createContactShadow() {
  const RES = 1024;
  const HIGH = 1.8;
  const SPLIT = 2.0;
  const BLUR = new THREE.Vector4(0.055, 0.42, 0.12, 0.45);
  const step = new THREE.Vector4();
  const opts = { type: THREE.HalfFloatType, depthBuffer: false };
  const targetA = new THREE.WebGLRenderTarget(RES, RES, opts);
  const targetB = new THREE.WebGLRenderTarget(RES, RES, opts);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, HIGH);
  cam.rotation.x = Math.PI / 2;
  const maxBlend = { blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendEquationAlpha: THREE.MaxEquation, depthTest: false, depthWrite: false, side: THREE.DoubleSide };
  const instanced = `vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vec4 w = modelMatrix * p;`;
  const contactMat = new THREE.ShaderMaterial({
    ...maxBlend,
    vertexShader: `varying float vY;
      void main() {
        ${instanced}
        vY = w.y;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `varying float vY;
      void main() {
        float h = max(vY, 0.0);
        gl_FragColor = vec4(pow(clamp(1.0 - h / 0.2, 0.0, 1.0), 2.0), pow(clamp(1.0 - h / ${HIGH.toFixed(2)}, 0.0, 1.0), 1.5), 0.0, 0.0);
      }`,
  });
  // Every vertex slid down the key's direction onto the floor: the cast shadow's footprint.
  const keyMat = new THREE.ShaderMaterial({
    ...maxBlend,
    uniforms: { uLight: { value: new THREE.Vector3() } },
    vertexShader: `uniform vec3 uLight; varying float vY;
      void main() {
        ${instanced}
        vY = w.y;
        vec3 q = w.xyz - uLight * (max(w.y, 0.0) / uLight.y);
        q.y = ${(HIGH / 2).toFixed(2)};
        gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
      }`,
    fragmentShader: `varying float vY;
      void main() {
        if (vY < 0.0) discard;
        float low = 1.0 - smoothstep(${(SPLIT - 0.15).toFixed(2)}, ${(SPLIT + 0.15).toFixed(2)}, vY);
        gl_FragColor = vec4(0.0, 0.0, low, 1.0 - low);
      }`,
  });
  const blur = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: null }, uStep: { value: new THREE.Vector4() }, uAxis: { value: new THREE.Vector2() } },
    depthTest: false,
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D tMap; uniform vec4 uStep; uniform vec2 uAxis; varying vec2 vUv;
      void main() {
        vec4 sum = vec4(0.0);
        float total = 0.0;
        for (int i = -6; i <= 6; i++) {
          float w = exp(-float(i * i) / 12.5);
          vec2 o = uAxis * float(i);
          sum.r += texture2D(tMap, vUv + o * uStep.r).r * w;
          sum.g += texture2D(tMap, vUv + o * uStep.g).g * w;
          sum.b += texture2D(tMap, vUv + o * uStep.b).b * w;
          sum.a += texture2D(tMap, vUv + o * uStep.a).a * w;
          total += w;
        }
        gl_FragColor = sum / total;
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
        vec4 s = texture2D(tShadow, clamp(vUv, 0.0, 1.0));
        float key = max(s.b * 0.42, s.a * 0.3);
        float a = (1.0 - (1.0 - s.r * 0.6) * (1.0 - s.g * 0.55) * (1.0 - key)) * edge.x * edge.y;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;
  mesh.renderOrder = 1;

  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const light = new THREE.Vector3();
  const clear = new THREE.Color();
  function pass(from, to, step, ax, ay) {
    blur.uniforms.tMap.value = from.texture;
    blur.uniforms.uStep.value.copy(step);
    blur.uniforms.uAxis.value.set(ax, ay);
    renderer.setRenderTarget(to);
    renderer.render(quadScene, quadCam);
  }
  function bake() {
    scene.updateMatrixWorld(true);
    box.makeEmpty();
    for (const part of [current.boat, current.trailer, current.cradle]) if (part.visible) box.expandByObject(part);
    // The cast shadow reaches out along the key from the top of the rig.
    light.copy(key.position).sub(key.target.position).normalize();
    const reach = box.max.y / light.y;
    const x0 = Math.min(box.min.x, box.min.x - light.x * reach);
    const x1 = Math.max(box.max.x, box.max.x - light.x * reach);
    const z0 = Math.min(box.min.z, box.min.z - light.z * reach);
    const z1 = Math.max(box.max.z, box.max.z - light.z * reach);
    const half = Math.max(x1 - x0, z1 - z0) / 2 + 1.2;
    Object.assign(cam, { left: -half, right: half, top: half, bottom: -half });
    cam.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    material.uniforms.uVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    keyMat.uniforms.uLight.value.copy(light);

    const hidden = [floor, mesh, ...(sea ? [sea.sky, sea.water, sea.underwater] : [])].filter((o) => o.visible);
    hidden.forEach((o) => { o.visible = false; });
    const saved = { target: renderer.getRenderTarget(), alpha: renderer.getClearAlpha(), clipping: renderer.clippingPlanes };
    renderer.getClearColor(clear);
    renderer.clippingPlanes = [];
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(targetA);
    renderer.clear();
    renderer.autoClear = false;
    scene.overrideMaterial = contactMat;
    renderer.render(scene, cam);
    scene.overrideMaterial = keyMat;
    renderer.render(scene, cam);
    scene.overrideMaterial = null;
    renderer.autoClear = true;
    // Total blur (Gaussian sigma, metres) per channel, reached in three separable passes whose
    // sigmas grow 1 : 2 : 3.7. Each pass's tap spacing stays under the blur already applied, so
    // hard edges never print as a staircase of shifted copies, however wide the blur.
    for (const k of [1, 2, 3.667]) {
      step.copy(BLUR).multiplyScalar(k / 4.294 / 2.5 / (half * 2));
      pass(targetA, targetB, step, 1, 0);
      pass(targetB, targetA, step, 0, 1);
    }
    renderer.setRenderTarget(saved.target);
    renderer.setClearColor(clear, saved.alpha);
    renderer.clippingPlanes = saved.clipping;
    hidden.forEach((o) => { o.visible = true; });
  }
  return { mesh, bake };
}

performance.mark('scene-module-end');

// Renderer and reflection target follow the stage size.
export function resizeRenderer(width, height) {
  renderer.setSize(width, height, false);
  // Reflection at half resolution, less on small high-density screens.
  const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
  const scale = devicePixelRatio > 1.5 && width < 700 ? 0.35 : 0.5;
  const w = Math.max(1, Math.round(buffer.x * scale));
  const h = Math.max(1, Math.round(buffer.y * scale));
  mirrorRT.setSize(w, h);
  if (sea) sea.water.material.uniforms.uTexel.value.set(1 / w, 1 / h);
}

// ---------- water reflection: the scene mirrored in y = 0, clipped at the surface ----------

const mirrorCam = new THREE.PerspectiveCamera();
const mirrorRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: lowPower ? 0 : 4 });
const mirrorBias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const look = new THREE.Vector3();

// Renders the mirror image for camera (target is accepted for compatibility; the camera's own
// direction is used, so the reflection never drifts from the view).
export function renderReflection(camera) {
  const { water, sky, underwater } = sea;
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
  renderer.clippingPlanes = openClip;
  sky.material.uniforms.uAlpha.value = 1;
  water.visible = underwater.visible = true;
  sky.position.copy(camera.position);
}

// The running motion, the streaming sea, the spray and the underwater-light glow, once a frame.
// Underway she rides the chop the water draws (seaHeight): heave and pitch follow the sea averaged
// over the wetted bottom, which a planing hull bridges for anything much shorter than itself, and
// roll follows it across the chines. Each axis follows through a soft, well-damped spring, so she
// lags and settles like a 1.5-tonne hull instead of tracing the water. Every 3.5-6 s a bigger
// wave launches the bow and she drops back onto it (ride.slam, 0..1, peaks as the bow lifts).
// A little yaw as the helm holds her course. Reduced motion holds her still at trim.
const glowPoint = new THREE.Vector3();
const aftAxis = new THREE.Vector3();
export const ride = { heave: 0, vHeave: 0, pitch: 0, vPitch: 0, roll: 0, vRoll: 0, slam: 0, nextSlam: 3 };
// Natural frequency (rad/s) and damping ratio per axis.
const RIDE = { heave: [3.5, 0.8], pitch: [3, 0.8], roll: [2.2, 0.6] };
function spring(axis, vel, target, dt) {
  const [w, z] = RIDE[axis];
  ride[vel] += (w * w * (target - ride[axis]) - 2 * z * w * ride[vel]) * dt;
  ride[axis] += ride[vel] * dt;
}
let lastT = 0;
export function tick(t) {
  const dt = clamp(t - lastT, 0, 0.05);
  lastT = t;
  if (!onWater) return;
  const run = reduceMotion ? 0 : 1;
  const { water, spray, whiteWater, seaHeight } = sea;
  const u = water.material.uniforms;
  u.uTime.value = t * run;
  // Wrapped well short of where float precision would coarsen the streaming ripples and foam.
  u.uFlow.value = ((UNDERWAY.speed * t) % 20000) * run;
  if (run) {
    // The sea at four stations along the keel from the transom to the spray root, and across the
    // chines amidships.
    const x0 = u.uHullX.value.x;
    const len = u.uHullX.value.y;
    const xm = x0 + len / 2;
    const b = u.uChine.value;
    let mean = 0;
    let slope = 0;
    for (let i = 0; i < 4; i++) {
      const x = x0 + (len * (i + 0.5)) / 4;
      const h = seaHeight(x, 0, u.uFlow.value, u.uTime.value);
      mean += h / 4;
      slope += ((x - xm) * h) / ((len * len * 5) / 16);
    }
    const heel = (seaHeight(xm, -b, u.uFlow.value, u.uTime.value) - seaHeight(xm, b, u.uFlow.value, u.uTime.value)) / (2 * b);
    if (t >= ride.nextSlam) ride.nextSlam = t + 3.5 + 2.5 * (0.5 + 0.5 * Math.sin(t * 12.9898));
    const k = 1 - (ride.nextSlam - t) / 0.35;
    ride.slam = k > 0 && k < 1 ? Math.sin(k * Math.PI) : 0;
    spring('heave', 'vHeave', mean * 0.9 + ride.slam * 0.12, dt);
    spring('pitch', 'vPitch', Math.atan(slope) * 0.7 + ride.slam * 0.09, dt);
    spring('roll', 'vRoll', Math.atan(heel) * 0.8, dt);
  }
  vessel.position.y = lift + ride.heave * run;
  vessel.rotation.set(ride.roll * run, Math.sin(t * 0.43 + 1.2) * 0.004 * run, trim + ride.pitch * run);
  whiteWater.mesh.material.uniforms.uFlow.value = u.uFlow.value;
  whiteWater.mesh.material.uniforms.uTime.value = u.uTime.value;
  current.boat.updateWorldMatrix(true, false);
  if (run) spray.update(dt, t, current.boat, UNDERWAY.speed, ride);
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

// ---------- desktop pipeline: MSAA scene, ground-truth AO, one finishing pass ----------

// Desktop renders the scene as linear HDR into a 4x multisampled target (clean edges on rods,
// rails and rod tips), then GTAO works out contact occlusion from its own depth and normal pass
// of the opaque rig, and one full-screen pass multiplies it in, tone maps, converts to sRGB,
// dithers and writes a premultiplied image to the transparent canvas over the CSS backdrop.
// Occlusion on the floor (which draws no colour of its own) darkens the backdrop through alpha.
// Phones and low-power devices draw straight to the canvas with no occlusion (see lowPower).
//   Tuning is for metre-scale geometry: a 0.3 m world radius with samples bunched towards the
//   centre gives tight shading in cockpit corners, under seats and capping and round fittings.
//   Stock GTAO only rejects samples by view depth, so a tube or rail standing well clear of a
//   surface still reads as a wall in the horizon search and prints a grainy halo on it; here
//   (RigAO) each sample is weighted by its true 3D distance, fading out between 0.12 and 0.3 m,
//   so only geometry actually in contact shades. Flat or convex plate is never darkened.
//   The noise pattern is fixed in screen space and the denoise is spatial only, so nothing
//   crawls while the camera turns.
const AO = {
  studio: 1,
  water: 0.85,
  // The horizon search reads flat plate seen at a low angle as about 0.93 open, not 1: the
  // finishing pass treats that as white, then applies the contrast curve, so open hull sides
  // and the floor stay untouched and only real contact shades.
  white: 0.94,
  curve: 2.2,
  params: { radius: 0.25, distanceExponent: 1.2, thickness: 0.2, distanceFallOff: 1, scale: 1, samples: 32 },
};
const aoHidden = [];
const aoDrawn = [];
const aoBox = new THREE.Box3();

// What the occlusion pass must not see: the sky dome, the deep-water floor, the baked floor
// shadow, and every transparent surface (glass, acrylic, decals) so the cabin interior seen
// through the windows is shaded by its own geometry. Points and lines never contribute.
function collectOcclusionHidden() {
  aoHidden.length = 0;
  aoDrawn.length = 0;
  aoHidden.push(contact.mesh);
  if (sea) aoHidden.push(sea.sky, sea.underwater, sea.spray.object, sea.whiteWater.mesh);
  for (const part of [current.boat, current.trailer, current.cradle]) {
    part.traverse((o) => {
      if (o.isPoints || o.isLine) aoHidden.push(o);
      else if (o.isMesh) {
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if ((Array.isArray(o.material) ? o.material.some((x) => x.transparent) : m.transparent) || !m.visible || !m.colorWrite) aoHidden.push(o);
        else aoDrawn.push({ mesh: o, side: m.side, material: null });
      }
    });
  }
  if (skipper?.root.visible) for (const mesh of skipper.meshes) aoDrawn.push({ mesh, side: mesh.material.side, material: null });
  aoDrawn.push({ mesh: floor, side: THREE.FrontSide, material: null });
  if (sea) aoDrawn.push({ mesh: sea.water, side: THREE.FrontSide, material: null });
  // AO only round the rig: the floor and water just beyond it, nothing further out.
  aoBox.copy(shadowBox).expandByScalar(0.35);
  aoBox.min.y = Math.min(aoBox.min.y, -0.05);
}

// The occlusion pass's depth and normal render: each mesh drawn with a normal material of its
// own material's side, so single-sided parts cull their back faces exactly as the beauty pass
// does (an override material would force one side on everything: open shells would show their
// insides, or double-sided sheets would vanish).
const aoNormal = [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide].map((side) => new THREE.MeshNormalMaterial({ side, blending: THREE.NoBlending }));
class RigAO extends GTAOPass {
  constructor(...args) {
    super(...args);
    // 3D range falloff instead of the view-depth-only thickness test (see AO above).
    const m = this.gtaoMaterial;
    const test = 'if (abs(viewDelta.z) < thickness) {';
    const step = '* mix(1., 2. / float(j + 2), distanceFallOff))';
    m.fragmentShader = m.fragmentShader
      .replace(test, 'float range = 1.0 - smoothstep(thickness * 0.4, thickness, length(viewDelta)); if (range > 0.0) {')
      .replace(test, 'range = 1.0 - smoothstep(thickness * 0.4, thickness, length(viewDelta)); if (range > 0.0) {')
      .replaceAll(step, '* range * ' + step.slice(2))
      // A small horizon bias: depth-buffer precision at a distance otherwise raises the horizon of
      // flat plate and water seen at a low angle by a few degrees and greys them.
      .replace('(sampleCosHorizon - cosHorizons.x)', '(sampleCosHorizon - cosHorizons.x - 0.03)')
      .replace('(sampleCosHorizon - cosHorizons.y)', '(sampleCosHorizon - cosHorizons.y - 0.03)');
    m.needsUpdate = true;
  }

  _overrideVisibility() {
    for (const o of aoHidden) {
      if (o.visible) {
        o.visible = false;
        this._visibilityCache.push(o);
      }
    }
  }

  _renderOverride(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha) {
    renderer.getClearColor(this._originalClearColor);
    const alpha = renderer.getClearAlpha();
    const autoClear = renderer.autoClear;
    for (const e of aoDrawn) {
      e.material = e.mesh.material;
      e.mesh.material = aoNormal[e.side];
    }
    renderer.setRenderTarget(renderTarget);
    renderer.autoClear = false;
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    for (const e of aoDrawn) {
      e.mesh.material = e.material;
      e.material = null;
    }
    renderer.autoClear = autoClear;
    renderer.setClearColor(this._originalClearColor, alpha);
  }
}

const post = lowPower ? null : createPost();

function createPost() {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const size = new THREE.Vector2();
  let ao = null;
  const material = new THREE.ShaderMaterial({
    uniforms: { tColor: { value: target.texture }, tAO: { value: null }, uAO: { value: 0 }, uDebug: { value: qaAO === 'view' ? 1 : 0 } },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    defines: { AO_WHITE: AO.white.toFixed(3), AO_CURVE: AO.curve.toFixed(3) },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tColor;
      uniform sampler2D tAO;
      uniform float uAO;
      uniform float uDebug;
      varying vec2 vUv;
      float dither(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) - 0.5; }
      void main() {
        vec4 c = texture2D(tColor, vUv);
        float occ = mix(1.0, pow(clamp(texture2D(tAO, vUv).r / AO_WHITE, 0.0, 1.0), AO_CURVE), uAO);
        float a = clamp(c.a, 0.0, 1.0);
        // Un-premultiply so antialiased silhouettes tone map like their surface.
        gl_FragColor = vec4(c.rgb / max(a, 1e-4) * occ, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        float alpha = 1.0 - (1.0 - a) * occ;
        vec3 rgb = clamp(gl_FragColor.rgb * a + dither(gl_FragCoord.xy) / 255.0, 0.0, 1.0);
        gl_FragColor = vec4(min(rgb, vec3(alpha)), alpha);
        if (uDebug > 0.5) gl_FragColor = vec4(vec3(occ), 1.0);
      }`,
  });
  const quad = new FullScreenQuad(material);

  function occlusion(camera) {
    if (!ao || ao.camera !== camera) {
      if (ao) ao.dispose();
      ao = new RigAO(scene, camera, 1, 1);
      ao.output = GTAOPass.OUTPUT.Off;
      ao.updateGtaoMaterial(AO.params);
    }
    // Full resolution up to a 2.5-megapixel buffer (a 1080p or 1440p stage at DPR 1); beyond
    // that, on high-density screens, half resolution, which is still one sample per CSS pixel.
    const scale = size.x * size.y > 2.5e6 ? 0.5 : 1;
    const w = Math.max(1, Math.round(size.x * scale));
    const h = Math.max(1, Math.round(size.y * scale));
    if (ao.width !== w || ao.height !== h) {
      ao.setSize(w, h);
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 11 * scale, rings: 3, samples: 24 });
    }
    ao.setSceneClipBox(aoBox);
    ao.render(renderer, null, target);
    return ao.gtaoMap;
  }

  return {
    target,
    render(camera) {
      renderer.getDrawingBufferSize(size);
      if (target.width !== size.x || target.height !== size.y) target.setSize(size.x, size.y);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      // Clay needs neither lighting nor occlusion. Avoid compiling the full AO pipeline
      // before the first useful frame; the final image still uses the same quality settings.
      const on = litReady && qaAO !== '0';
      material.uniforms.tAO.value = on ? occlusion(camera) : null;
      material.uniforms.uAO.value = on ? (onWater ? AO.water : AO.studio) : 0;
      renderer.setRenderTarget(null);
      quad.render(renderer);
    },
  };
}

// One shadow update, the reflection when afloat, then the frame itself.
const bufferSize = new THREE.Vector2();
let litFrameDrawn = false;
export function renderFrame(camera) {
  frameCamera = camera;
  if (paused) return;
  if (qaPerf) qaPerf.camera = camera;
  renderer.shadowMap.needsUpdate = litReady && (onWater || shadowDirty);
  if (onWater) {
    sea.spray.setScale(renderer.getDrawingBufferSize(bufferSize).y * camera.projectionMatrix.elements[5] / 2);
    renderReflection(camera);
    sea.sky.position.copy(camera.position);
  }
  if (post) post.render(camera);
  else renderer.render(scene, camera);
  if (litReady) shadowDirty = false;
  if (litReady && !litFrameDrawn) {
    performance.mark('lit-frame');
    litFrameDrawn = true;
  }
}

// Copies the frame in the same task it is rendered, over the studio backdrop the CSS draws.
// Afloat, the reflection is re-rendered for this camera first.
export function snapshot(camera) {
  renderFrame(camera);
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
  let frames = 0;
  function frame(now) {
    timer.update(now);
    step();
    tick(timer.getElapsed());
    controls.update();
    if (frames < 3) performance.mark(`frame-${frames}-start`);
    renderFrame(camera, controls.target);
    if (frames < 3) performance.mark(`frame-${frames}-end`);
    frames++;
    requestAnimationFrame(frame);
  }
  frame();
}

// QA: ?qaCompile exposes window.qaCompile = { scene, renderer, frame, salt }: salt(test) marks the
// materials of every object test(object) accepts with a fresh define, so the browser's shader cache
// cannot serve them and the next frame() compiles them cold, which times a first visit's shaders.
export function qaCompileHandles(camera) {
  let n = 0;
  return {
    scene,
    renderer,
    get current() { return current; },
    get skipper() { return skipper; },
    frame: () => renderFrame(camera),
    salt(test) {
      const seen = new Set();
      let count = 0;
      scene.traverse((o) => {
        if (!o.material || !test(o)) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (seen.has(m)) continue;
          seen.add(m);
          m.defines = { ...(m.defines || {}), [`SALT_${Date.now()}_${n++}`]: 1 };
          m.needsUpdate = true;
          count++;
        }
      });
      return count;
    },
  };
}
