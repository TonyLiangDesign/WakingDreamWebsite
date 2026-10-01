import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import GUI from 'three/examples/jsm/libs/lil-gui.module.min.js';
import { Atmosphere } from './sky.js';
import { createWater } from './water.js';
import { createPost } from './post.js';
import { sunDirection } from './sun.js';
import { sharedUniforms } from './surface.js';
import { getTextures } from './textures.js';
import { buildWorld } from './world.js';
import { SHOTS, SHOT_SEQUENCE, SHOT_ORDER, ShotPlayer } from './shots.js';
import { GEO } from './geo.js';

// Keep module evaluation synchronous so lazy scene modules can share bundled helpers.
async function init() {
const canvas = document.getElementById('view');
const params = new URLSearchParams(location.search);
document.body.classList.toggle('clean', params.has('clean'));
document.body.classList.toggle('capture', params.has('capture'));
document.body.classList.toggle('views', params.has('views'));
const quality = params.get('q') === 'low' ? 0.6 : 1;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'default', logarithmicDepthBuffer: true, preserveDrawingBuffer: params.has('capture') });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, params.get('pr') ? Number(params.get('pr')) : 1.5) * quality);
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;
const shadowState = { c: new THREE.Vector3(), r: 0, sun: -1 };
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.info.autoReset = !params.has('review');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.5, 60000);
camera.position.set(-420, 160, 520);

getTextures(quality);

const atmo = new Atmosphere(renderer, scene);
const state = {
  hour: 11.87, // GMT = local civil time in 1912 England
  exposure: Number(params.get('exp') || 0.25),
  play: !params.has('still'),
  cinema: false,
  fly: false,
  timeScale: 1,
  archiveFilm: false,
};

function applySun() {
  const h = Math.floor(state.hour), m = (state.hour - h) * 60;
  const date = new Date(Date.UTC(1912, 3, 10, h, Math.floor(m), Math.round((m % 1) * 60)));
  const dir = sunDirection(date, GEO.lat, GEO.lon);
  atmo.setSun(dir);
  sharedUniforms.uSunDirW.value.copy(dir);
  if (water) {
    water.material.uniforms.uSunDir.value.copy(dir);
    water.material.uniforms.uSunColor.value.copy(atmo.sunColor);
    water.material.uniforms.uSunIntensity.value = atmo.sun.intensity;
    water.material.uniforms.uSkyColor.value.copy(atmo.horizonAway);
  }
  if (post) {
    post.haze.uniforms.get('uSunDir').value.copy(dir);
    // haze colour = measured horizon sky; sun lobe scaled from the toward-sun excess
    post.haze.uniforms.get('uHazeColor').value.copy(atmo.horizonAway);
    const excess = Math.max(0, (atmo.horizonToward.g - atmo.horizonAway.g) / Math.max(atmo.horizonAway.g, 1e-3));
    post.haze.uniforms.get('uSunColor').value.copy(atmo.horizonAway).multiplyScalar(excess / 3.0);
    post.haze.uniforms.get('uSunScatter').value = 1.0;
  }
  const slate = document.querySelector('#slate b');
  if (slate) slate.textContent = `10 April 1912 · ${String(h).padStart(2, '0')}:${String(Math.floor(m)).padStart(2, '0')}`;
}

let water = null, post = null;
water = createWater({ resolutionScale: 0.5 * quality });
scene.add(water);

const world = await buildWorld({ scene, renderer, camera, atmo, quality });
post = createPost(renderer, scene, camera);
post.haze.uniforms.get('uExposure').value = state.exposure;
applySun();

// layer 2: inland clutter that never needs to appear in water reflections
camera.layers.enable(2);
world.root.traverse((o) => {
  if (o.isMesh && o.userData.noReflect) o.layers.set(2);
});
let reflLayersFixed = false;
// Reflected cumulus read as floating foam at grazing angles once rippled; mirror a thinner,
// softer cloud layer instead (the direct sky keeps full clouds).
{
  const orig = water.onBeforeRender;
  const cu = atmo.sky.material.uniforms;
  water.onBeforeRender = function (...args) {
    const cov = cu.cloudCoverage.value, den = cu.cloudDensity.value;
    cu.cloudCoverage.value = cov * 0.55; cu.cloudDensity.value = den * 0.45;
    cu.showSunDisc.value = 0; // the water shader draws its own broken glitter instead of a mirrored disc
    orig.apply(this, args);
    cu.cloudCoverage.value = cov; cu.cloudDensity.value = den; cu.showSunDisc.value = 1;
  };
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI;
controls.target.set(0, 10, 0);
controls.update();

const player = new ShotPlayer(camera, controls, post);

// ------------------------------------------------------------------ UI
const gui = new GUI({ title: 'Southampton · 1912' });
gui.close();
gui.add(state, 'hour', 6, 19, 0.01).name('Time (GMT)').onChange(applySun);
gui.add(state, 'exposure', 0.2, 3, 0.01).name('Exposure').onChange((v) => post.haze.uniforms.get('uExposure').value = v);
const fLook = gui.addFolder('Look').close();
const hz = post.haze.uniforms;
fLook.add(hz.get('uDensity'), 'value', 0, 0.001, 0.00001).name('Haze density');
fLook.add(hz.get('uFalloff'), 'value', 0.0002, 0.02, 0.0001).name('Haze falloff');
fLook.add(hz.get('uSunScatter'), 'value', 0, 8, 0.01).name('Sun scatter');
fLook.add(post.ao.configuration, 'intensity', 0, 6, 0.01).name('AO intensity');
fLook.add(post.ao.configuration, 'aoRadius', 0.2, 12, 0.1).name('AO radius');
fLook.add(post.bloom, 'intensity', 0, 3, 0.01).name('Bloom');
fLook.add(post.grain.blendMode.opacity, 'value', 0, 1, 0.01).name('Grain');
fLook.add(post.grade.uniforms.get('uSat'), 'value', 0, 1.5, 0.01).name('Saturation');
fLook.add(post.grade.uniforms.get('uContrast'), 'value', -0.5, 1, 0.01).name('Contrast');
const skyU = atmo.sky.material.uniforms;
fLook.add(skyU.cloudCoverage, 'value', 0, 1, 0.01).name('Cloud cover').onFinishChange(() => atmo.bakeEnv());
fLook.add(skyU.turbidity, 'value', 0, 20, 0.1).name('Turbidity').onFinishChange(() => atmo.bakeEnv());
const fCam = gui.addFolder('Camera');
fCam.add(camera, 'fov', 8, 80, 0.1).name('FOV').onChange(() => camera.updateProjectionMatrix());
fCam.add(post.dofPass, 'enabled').name('Depth of field');
fCam.add(post.dof.cocMaterial, 'focusDistance', 1, 3000, 1).name('Focus dist').listen();
fCam.add(post.dof, 'bokehScale', 0, 8, 0.01).name('Bokeh');
const shotNames = SHOT_ORDER;
const shotCtl = { shot: shotNames[0], play: () => selectShot(shotCtl.shot, { animate: true }) };
const shotController = fCam.add(shotCtl, 'shot', shotNames).name('Shot').onChange((name) => selectShot(name));
fCam.add(shotCtl, 'play').name('▶ Play shot');
fCam.add(state, 'cinema').name('2.39:1 bars').onChange(setCinema);
const fWorld = gui.addFolder('World').close();
world.gui?.(fWorld);

const cameraSelect = document.getElementById('camera-select');
const cameraDescription = document.getElementById('camera-description');
const cameraPlay = document.getElementById('camera-play');
const hudShot = document.getElementById('hud-shot');
const hudShotLabel = document.getElementById('hud-shot-label');
const viewsToggle = hudShot;
const autoplayToggle = document.getElementById('autoplay-toggle');
const autoplayLabel = document.getElementById('autoplay-label');
let carouselEnabled = false, carouselElapsed = 0;
const filmToggle = document.getElementById('film-toggle');
const filmStatus = document.getElementById('film-status');
const cameraList = document.getElementById('camera-list');
const cameraButtons = new Map();
let cameraNumber = 0;
for (const { title: group, shots: names } of SHOT_SEQUENCE) {
  const optgroup = document.createElement('optgroup');
  optgroup.label = group;
  const section = document.createElement('section');
  section.className = 'camera-group';
  const heading = document.createElement('h2');
  heading.textContent = group;
  section.append(heading);
  for (const name of names) {
    const shot = SHOTS[name];
    const option = document.createElement('option');
    option.value = name; option.textContent = `${++cameraNumber}. ${shot.title}`;
    optgroup.append(option);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'camera-view';
    button.dataset.shot = name;
    const number = document.createElement('span');
    number.className = 'camera-number'; number.textContent = String(cameraNumber).padStart(2, '0');
    const title = document.createElement('span'); title.textContent = shot.title;
    button.append(number, title);
    button.addEventListener('click', () => selectShot(name));
    section.append(button); cameraButtons.set(name, button);
  }
  cameraSelect.append(optgroup);
  cameraList.append(section);
}
const cameraOrder = [...cameraSelect.options].map((option) => option.value);
document.getElementById('camera-count').textContent = `${cameraOrder.length} views`;
function selectShot(name, { animate = true, updateUrl = true, automatic = false } = {}) {
  const shot = SHOTS[name];
  if (!shot) return;
  if (!automatic) setAutoPlay(false);
  state.fly = false; controls.enabled = true; keys.clear();
  // Flush any residual orbit drag before placing the next camera.
  controls.enableDamping = false; controls.update(); controls.enableDamping = true;
  shotCtl.shot = name; cameraSelect.value = name; shotController.updateDisplay();
  for (const [key, button] of cameraButtons) button.setAttribute('aria-current', String(key === name));
  if (document.body.classList.contains('views')) cameraButtons.get(name)?.scrollIntoView({ block: 'nearest' });
  hudShotLabel.textContent = `${cameraOrder.indexOf(name) + 1}/${cameraOrder.length} ${shot.title}`;
  hudShot.title = `${shot.title} · View list (V)`;
  cameraDescription.textContent = shot.description;
  const moving = !!shot.orbit || shot.keys.length > 1;
  cameraPlay.disabled = !moving;
  player.paused = false;
  player.play(shot, { hold: !animate || !moving, loop: !automatic });
  canvas.dataset.shot = name;
  if (updateUrl) {
    const url = new URL(location.href);
    url.searchParams.set('shot', name); url.searchParams.delete('shotTime');
    if (animate && moving) url.searchParams.delete('hold'); else url.searchParams.set('hold', '');
    history.replaceState(null, '', url);
  }
}
cameraSelect.addEventListener('change', () => selectShot(cameraSelect.value));
function nextCamera(delta) {
  selectShot(cameraOrder[(cameraOrder.indexOf(shotCtl.shot) + delta + cameraOrder.length) % cameraOrder.length]);
}
document.getElementById('camera-prev').addEventListener('click', () => nextCamera(-1));
document.getElementById('camera-next').addEventListener('click', () => nextCamera(1));
document.getElementById('hud-prev').addEventListener('click', () => nextCamera(-1));
document.getElementById('hud-next').addEventListener('click', () => nextCamera(1));
cameraPlay.addEventListener('click', () => selectShot(shotCtl.shot, { animate: true }));
controls.addEventListener('start', () => { setAutoPlay(false); player.stop(); });

function setAutoPlay(enabled) {
  const wasEnabled = carouselEnabled;
  carouselEnabled = enabled;
  carouselElapsed = 0;
  autoplayToggle.setAttribute('aria-pressed', String(enabled));
  autoplayLabel.textContent = enabled ? 'Pause' : 'Auto play';
  autoplayToggle.title = enabled ? 'Pause view carousel · A' : 'Auto play views · A';
  hudShot.setAttribute('aria-live', enabled ? 'off' : 'polite');
  canvas.dataset.autoplay = enabled ? 'on' : 'off';
  if (enabled) {
    setViewsVisible(false);
    selectShot(shotCtl.shot, { animate: true, automatic: true });
  } else if (wasEnabled) player.stop();
}
autoplayToggle.addEventListener('click', () => setAutoPlay(!carouselEnabled));
function updateCarousel(dt) {
  if (!carouselEnabled || document.hidden) return;
  carouselElapsed += dt;
  const shot = SHOTS[shotCtl.shot];
  const moving = !!shot.orbit || shot.keys.length > 1;
  const dwell = moving ? Math.max(8, shot.duration) : 8;
  if (carouselElapsed < dwell) return;
  carouselElapsed = 0;
  const next = cameraOrder[(cameraOrder.indexOf(shotCtl.shot) + 1) % cameraOrder.length];
  selectShot(next, { animate: true, automatic: true });
}

function setViewsVisible(visible, { focus = false } = {}) {
  if (visible) setAutoPlay(false);
  const picker = document.getElementById('camera-picker');
  const restoreFocus = !visible && picker.contains(document.activeElement);
  document.body.classList.toggle('views', visible);
  viewsToggle.setAttribute('aria-expanded', String(visible));
  if (visible && focus) {
    const selected = cameraButtons.get(shotCtl.shot);
    selected?.focus({ preventScroll: true });
    selected?.scrollIntoView({ block: 'nearest' });
  }
  if (restoreFocus) viewsToggle.focus({ preventScroll: true });
}
setViewsVisible(params.has('views'));
viewsToggle.addEventListener('click', () => setViewsVisible(!document.body.classList.contains('views'), { focus: true }));
document.getElementById('camera-close').addEventListener('click', () => setViewsVisible(false));
function setArchiveFilm(enabled) {
  post.setFilmEnabled(enabled);
  state.archiveFilm = !!post.film?.pass.enabled;
  filmToggle.setAttribute('aria-pressed', String(state.archiveFilm));
  filmStatus.textContent = state.archiveFilm ? 'On' : 'Off';
  canvas.dataset.film = state.archiveFilm ? post.film.effect.mode : 'off';
  const url = new URL(location.href);
  url.searchParams.set('film', state.archiveFilm ? post.film.effect.mode : 'off');
  if (state.archiveFilm) {
    const disabled = (url.searchParams.get('off') || '').split(',').filter((name) => name && name !== 'film');
    if (disabled.length) url.searchParams.set('off', disabled.join(',')); else url.searchParams.delete('off');
  }
  history.replaceState(null, '', url);
}
// Reflect opt-in film URLs without changing the URL on initial load.
state.archiveFilm = !!post.film?.pass.enabled;
filmToggle.setAttribute('aria-pressed', String(state.archiveFilm));
filmStatus.textContent = state.archiveFilm ? 'On' : 'Off';
canvas.dataset.film = state.archiveFilm ? post.film.effect.mode : 'off';
filmToggle.addEventListener('click', () => setArchiveFilm(!state.archiveFilm));

function setCinema(on) {
  document.body.classList.toggle('cine', on);
  const aspect = window.innerWidth / window.innerHeight;
  const bar = on ? Math.max(0, (window.innerHeight - window.innerWidth / 2.39) / 2) : 0;
  document.documentElement.style.setProperty('--bar', bar + 'px');
  void aspect;
}

// ------------------------------------------------------------------ input / fly
const keys = new Set();
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && document.body.classList.contains('views')) {
    e.preventDefault(); setViewsVisible(false); return;
  }
  if (e.target.closest('input, textarea, [contenteditable="true"]')) return;
  if (!e.altKey && !e.ctrlKey && !e.metaKey && ['ArrowLeft', 'ArrowRight', 'KeyV', 'KeyO', 'KeyA'].includes(e.code) &&
      (!e.target.closest('select') || ['KeyV', 'KeyO', 'KeyA'].includes(e.code)) && !(e.code === 'KeyA' && state.fly)) {
    e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'ArrowLeft') nextCamera(-1);
    if (e.code === 'ArrowRight') nextCamera(1);
    if (e.code === 'KeyV') setViewsVisible(!document.body.classList.contains('views'), { focus: true });
    if (e.code === 'KeyO') setArchiveFilm(!state.archiveFilm);
    if (e.code === 'KeyA') setAutoPlay(!carouselEnabled);
    return;
  }
  if (e.target.closest('select')) return;
  if (e.target.closest('button, summary')) return;
  keys.add(e.code);
  if (e.code.startsWith('Digit')) { const i = Number(e.code.slice(5)) - 1; if (cameraOrder[i]) selectShot(cameraOrder[i], { animate: true }); }
  if (e.code === 'KeyC') { state.cinema = !state.cinema; setCinema(state.cinema); }
  if (e.code === 'KeyH') {
    const uiVisible = !document.body.classList.contains('clean') || getComputedStyle(document.getElementById('camera-picker')).display !== 'none';
    document.body.classList.toggle('clean', uiVisible);
    setViewsVisible(false);
  }
  if (e.code === 'Space') {
    const playing = player.active ? !player.paused : state.play;
    setAutoPlay(false);
    state.play = !playing; player.paused = playing;
    if (player.shot) { player.active = true; player.loop = true; }
  }
  if (e.code === 'KeyF') { setAutoPlay(false); player.stop(); state.fly = !state.fly; controls.enabled = !state.fly; }
  if (e.code === 'KeyP') screenshot();
  if (e.code === 'KeyL') console.log(JSON.stringify({ pos: camera.position.toArray().map((v) => +v.toFixed(1)), target: controls.target.toArray().map((v) => +v.toFixed(1)), fov: camera.fov }));
});
addEventListener('keyup', (e) => keys.delete(e.code));

function fly(dt) {
  const speed = (keys.has('ShiftLeft') ? 120 : 30) * dt;
  const f = new THREE.Vector3(); camera.getWorldDirection(f);
  const r = new THREE.Vector3().crossVectors(f, camera.up).normalize();
  const move = new THREE.Vector3();
  if (keys.has('KeyW')) move.add(f); if (keys.has('KeyS')) move.sub(f);
  if (keys.has('KeyD')) move.add(r); if (keys.has('KeyA')) move.sub(r);
  if (keys.has('KeyE')) move.y += 1; if (keys.has('KeyQ')) move.y -= 1;
  move.multiplyScalar(speed);
  camera.position.add(move); controls.target.add(move);
}

function screenshot() {
  post.render(0);
  canvas.toBlob((b) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `southampton1912_${Date.now()}.png`;
    a.click();
  });
}

addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  post.setSize(w, h);
  const pr = renderer.getPixelRatio();
  water.resize(w * pr, h * pr);
  setCinema(state.cinema);
});

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const stillTime = Number(params.get('still') ?? 0);
let simTime = Number.isFinite(stillTime) ? Math.max(0, stillTime) : 0;
const focus = new THREE.Vector3();
const review = params.has('review') ? { since: performance.now(), frames: 0, renderMs: 0 } : null;
const reviewShip = review ? { meshes: 0, triangles: 0, instances: 0 } : null;
if (reviewShip) world.titanicSlot.traverse((o) => {
  if (!o.isMesh) return;
  const count = o.isInstancedMesh ? o.count : 1;
  reviewShip.meshes++;
  reviewShip.instances += o.isInstancedMesh ? o.count : 0;
  reviewShip.triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * count;
});
function frame() {
  if (state.manual) return;
  const dt = Math.min(clock.getDelta(), 0.1);
  if (state.play) simTime += dt * state.timeScale;
  const frameStart = review ? performance.now() : 0;
  if (review) renderer.info.reset();
  step(dt);
  if (review) {
    review.frames++;
    review.renderMs += performance.now() - frameStart;
    const elapsed = performance.now() - review.since;
    if (elapsed >= 2000) {
      canvas.dataset.review = JSON.stringify({
        fps: +(1000 * review.frames / elapsed).toFixed(1),
        renderMs: +(review.renderMs / review.frames).toFixed(1),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        titanic: reviewShip,
      });
      review.since = performance.now(); review.frames = 0; review.renderMs = 0;
    }
  }
  requestAnimationFrame(frame);
}

function step(dt) {
  sharedUniforms.uTime.value = simTime;
  water.material.uniforms.uTime.value = simTime;
  atmo.update(simTime);
  if (state.fly) fly(dt);
  player.update(dt);
  updateCarousel(dt);
  if (!player.active && !state.fly) controls.update();
  // shadow frustum follows the view
  const dist = camera.position.distanceTo(controls.target);
  focus.copy(controls.target);
  // static world: only redraw the shadow map when the shadow frustum actually needs to move
  const radius = THREE.MathUtils.clamp(dist * 1.0, 90, 3200);
  if (!shadowState.r || focus.distanceTo(shadowState.c) > radius * 0.04 || Math.abs(radius - shadowState.r) > radius * 0.08 || shadowState.sun !== state.hour) {
    atmo.focusShadow(focus, radius);
    renderer.shadowMap.needsUpdate = true;
    shadowState.c.copy(focus); shadowState.r = radius; shadowState.sun = state.hour;
  }
  world.update?.(simTime, dt, camera);
  post.render(dt);
  if (!reflLayersFixed) { water.getReflectionCamera(camera).layers.disable(2); reflLayersFixed = true; }
}

document.getElementById('loading').classList.add('done');
const initialShot = SHOTS[params.get('shot')] ? params.get('shot') : shotNames[0];
selectShot(initialShot, { animate: !params.has('hold'), updateUrl: false });
if (params.has('shotTime')) {
  const shotTime = Number(params.get('shotTime'));
  if (Number.isFinite(shotTime)) player.seek(Math.max(0, shotTime));
}
requestAnimationFrame(frame);

// automation hooks for review agents
window.__app = {
  THREE, scene, camera, controls, renderer, post, atmo, world, player, SHOTS, state,
  setView(pos, target, fov) {
    player.stop();
    camera.position.set(...pos); controls.target.set(...target);
    if (fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.lookAt(controls.target); controls.update();
  },
  setHour(h) { state.hour = h; applySun(); },
  // deterministic offline rendering: stops the RAF loop; each call renders one frame of a shot
  renderShotFrame(name, t, fps = 30) {
    state.manual = true;
    const shot = SHOTS[name];
    if (player.shot !== shot) player.play(shot, { hold: true });
    player.seek(t);
    simTime = 100 + t;
    step(1 / fps);
    return true;
  },
  resume() { state.manual = false; requestAnimationFrame(frame); },
  // GLB of the static port (no sky/water/particles). Materials export as named PBR
  // colours; triplanar detail is procedural and should be re-applied by name in UE.
  async exportGLB({ includeFar = false } = {}) {
    const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
    const hidden = [];
    world.root.traverse((o) => {
      if (o.name === 'smoke' || o.name === 'gulls' || (!includeFar && o.name === 'terrain-far')) { hidden.push([o, o.visible]); o.visible = false; }
    });
    const exporter = new GLTFExporter();
    const buf = await exporter.parseAsync(world.root, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
    hidden.forEach(([o, v]) => (o.visible = v));
    return buf;
  },
  info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures }; },
  ready: true,
};

}
init().catch((error) => {
  console.error('Unable to load Southampton demo', error);
  const status = document.querySelector('.loading-status');
  const gpuError = /WebGL|context|ShaderPrecisionFormat/i.test(error.message || '');
  status.textContent = gpuError
    ? 'The graphics connection was interrupted. Reload to try again.'
    : 'The scene could not finish loading. Reload to try again.';
  const retry = document.createElement('button');
  retry.className = 'loading-retry';
  retry.textContent = 'Reload scene';
  retry.addEventListener('click', () => location.reload());
  status.after(retry);
});
