import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  MODELS, LAYOUTS, HULL_COLOURS, TRIM_COLOURS, ENGINES, COWLINGS, OPTIONS, DEALERS, PRICE_MODES,
  engineAllowed, optionAllowed, normalise, resolve, lineItems, specText, shownTotal, nzd, toHash, fromHash,
} from './config.js';
import { createMaterials, applyBuild } from './materials.js';
import { buildBoat, disposeTree, TRAILER_LIFT, CRADLE_LIFT } from './boat.js';
import { createSky, createWater, SUN_DIR } from './water.js';
import './style.css';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = document.querySelector('.stage');
const canvas = document.getElementById('view');

// ---------- renderer and scene ----------

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 4000);
camera.position.set(5.6, 2.6, 6.4);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 32;
controls.target.set(0, 1.4, 0);
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.35;
controls.addEventListener('start', () => { controls.autoRotate = false; });

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
const vessel = new THREE.Group();
const offset = new THREE.Group();
vessel.add(offset);
const stand = new THREE.Group();
scene.add(vessel, stand);

const mats = createMaterials();
let build = fromHash(location.hash);
let current = null;
let lift = 0;

function rebuild() {
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
  applyScene();
}

function applyScene() {
  const onWater = build.scene === 'water';
  const onTrailer = !onWater && build.options.includes('trailer');
  current.trailer.visible = onTrailer;
  current.cradle.visible = !onWater && !onTrailer;
  lift = onWater ? 0 : onTrailer ? TRAILER_LIFT : CRADLE_LIFT;
  vessel.position.y = lift;
  vessel.rotation.set(0, 0, 0);

  sky.visible = water.visible = onWater;
  floor.visible = contact.visible = !onWater;
  scene.environment = onWater ? waterEnv : studioEnv;
  scene.environmentIntensity = onWater ? 1.0 : 0.9;
  renderer.toneMappingExposure = onWater ? 0.95 : 1.05;
  if (onWater) {
    key.color.set('#ffd2a1');
    key.intensity = 2.6;
    key.position.copy(SUN_DIR).multiplyScalar(20);
    fill.color.set('#9fb8d6');
    fill.groundColor.set('#1d2c33');
    fill.intensity = 0.55;
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
  water.material.uniforms.uHull.value.set(0, 0, L * 0.55, current.lines.B * 0.6);
  controls.maxPolarAngle = onWater ? Math.PI * 0.485 : Math.PI * 0.49;
}

// ---------- camera views ----------

const VIEWS = {
  hero: { label: 'Three-quarter', pos: [5.6, 2.3, 6.4], target: [0.2, 1.0, 0] },
  side: { label: 'Profile', pos: [0, 1.3, 10.8], target: [0, 1.0, 0] },
  stern: { label: 'Stern', pos: [-7.0, 2.3, 3.4], target: [-0.6, 0.8, 0] },
  bow: { label: 'Bow', pos: [7.4, 2.4, -3.2], target: [0.4, 0.9, 0] },
  top: { label: 'Plan', pos: [0.01, 13, 0.4], target: [0, 0.5, 0] },
};
let flight = null;

// Presets are framed for a 6.2 m hull in a wide stage; narrower stages pull the camera back,
// and phones a little further, so the bow and the outboard stay in frame.
function viewTargets(name) {
  const v = VIEWS[name];
  const phone = name !== 'top' && stage.clientWidth < 600 ? 1.18 : 1;
  const k = (current.lines.L / 6.2) * Math.pow(Math.max(1, 1.6 / camera.aspect), 0.85) * phone;
  const target = new THREE.Vector3(v.target[0], v.target[1] + lift, v.target[2]);
  const pos = new THREE.Vector3(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]).multiplyScalar(k).add(target);
  return { pos, target };
}

function flyTo(name, instant = false) {
  controls.autoRotate = false;
  const to = viewTargets(name);
  if (instant || reduceMotion) {
    camera.position.copy(to.pos);
    controls.target.copy(to.target);
    return;
  }
  flight = { from: camera.position.clone(), fromTarget: controls.target.clone(), ...to, start: performance.now(), duration: 1100 };
}

// ---------- UI ----------

const $ = (sel) => document.querySelector(sel);
const form = $('#config');

function radio(name, item, inner, extra = '') {
  return `<label class="${extra}"><input type="radio" name="${name}" value="${item.id}">${inner}</label>`;
}

function chip(item) {
  if (item.metal) return '<span class="chip chip-alloy"></span>';
  if (!item.hex) return '<span class="chip chip-match"></span>';
  return `<span class="chip" style="--c:${item.hex}"></span>`;
}

function renderControls() {
  $('#opt-price').innerHTML = PRICE_MODES.map((p) => radio('price', p, `<span class="seg-name">${p.name}</span><span class="seg-note">${p.note}</span>`)).join('');
  $('#opt-model').innerHTML = MODELS.map((m) => radio('model', m, `<span class="card-title">${m.name}</span><span class="card-meta">${m.length.toFixed(1)} m<span class="price price-from"> · from ${nzd(m.price)}</span></span>`, 'card')).join('');
  $('#opt-layout').innerHTML = LAYOUTS.map((l) => radio('layout', l, `<span class="card-title">${l.name}</span><span class="card-meta">${l.note}</span><span class="card-price price">${l.price ? `+${nzd(l.price)}` : 'Included'}</span>`, 'card')).join('');
  $('#opt-hull').innerHTML = HULL_COLOURS.map((c) => radio('hull', c, `${chip(c)}<span class="sr">${c.name}</span>`, 'swatch')).join('');
  $('#opt-trim').innerHTML = TRIM_COLOURS.map((c) => radio('trim', c, `${chip(c)}<span class="sr">${c.name}</span>`, 'swatch')).join('');
  $('#opt-engine').innerHTML = ENGINES.map((e) => radio('engine', e, `<span class="row-name">${e.name}</span><span class="row-note" data-note="${e.id}"></span><span class="row-price price">${nzd(e.price)}</span>`, 'row')).join('');
  $('#opt-cowling').innerHTML = COWLINGS.map((c) => radio('cowling', c, `${chip(c)}<span class="sr">${c.name}</span>`, 'swatch')).join('');
  $('#opt-options').innerHTML = OPTIONS.map((o) => `<label class="row"><input type="checkbox" name="options" value="${o.id}"><span class="row-name">${o.name}</span><span class="row-note">${o.note}</span><span class="row-price price">+${nzd(o.price)}</span></label>`).join('');
  $('#opt-dealer').innerHTML = DEALERS.map((d) => radio('dealer', d, `<span class="card-title">${d.region}</span><span class="card-meta">${d.name}, ${d.town}</span>`, 'card')).join('');
  for (const label of document.querySelectorAll('.swatch')) label.title = label.querySelector('.sr').textContent;
}

function syncControls() {
  const r = resolve(build);
  for (const name of ['model', 'layout', 'hull', 'trim', 'engine', 'cowling']) {
    for (const input of form.elements[name]) input.checked = input.value === build[name];
  }
  for (const e of ENGINES) {
    const input = form.querySelector(`input[name="engine"][value="${e.id}"]`);
    const ok = engineAllowed(r.model, e);
    input.disabled = !ok;
    input.closest('label').classList.toggle('is-disabled', !ok);
    form.querySelector(`[data-note="${e.id}"]`).textContent = ok ? (e.count === 2 ? 'Twin rig' : 'Single') : e.count === 2 && !r.model.twin ? 'Harbour 680 only' : `Above ${r.model.maxHp} hp rating`;
  }
  for (const o of OPTIONS) {
    const input = form.querySelector(`input[name="options"][value="${o.id}"]`);
    const ok = optionAllowed(build, o);
    input.checked = build.options.includes(o.id);
    input.disabled = !ok;
    input.closest('label').classList.toggle('is-disabled', !ok);
  }
  $('#hull-name').textContent = r.hull.name;
  $('#trim-name').textContent = r.trim.name;
  $('#cowling-name').textContent = r.cowling.name;
  $('#trim-label').textContent = build.layout === 'ht' ? 'Cabin and hardtop' : 'Console and T-top';

  $('#model-name').textContent = `${r.model.name} ${r.layout.name}`;
  $('#model-dims').textContent = `${r.model.length.toFixed(1)} m · ${r.model.beam.toFixed(1)} m beam · ${r.engine.name}`;
  const { items } = lineItems(build);
  const full = build.price === 'full';
  document.body.dataset.price = build.price;
  for (const input of document.querySelectorAll('input[name="price"]')) input.checked = input.value === build.price;
  for (const input of document.querySelectorAll('input[name="dealer"]')) input.checked = input.value === build.dealer;
  $('#total-label').textContent = { full: 'Estimated price', from: 'Priced from', none: 'Price' }[build.price];
  $('#total').textContent = build.price === 'none' ? 'Quote on request' : build.price === 'from' ? nzd(r.model.price) : shownTotal(build);
  $('#breakdown-label').textContent = full ? 'Price breakdown' : 'Your spec';
  $('#lines').innerHTML = items.map((i) => `<li><span>${i.label}</span>${full ? `<span>${i.price ? nzd(i.price) : 'Included'}</span>` : ''}</li>`).join('');
  $('#price-fine').textContent = `${full ? 'Demo pricing in NZD including GST.' : build.price === 'from' ? 'Base hull price in NZD including GST; your dealer quotes the full build.' : 'Your dealer quotes the full build.'} The Harbour series is a fictional boat built to show the configurator.`;
  document.body.classList.toggle('kiosk', build.kiosk);
  $('#kiosk-toggle').textContent = build.kiosk ? 'Exit kiosk mode' : 'Boat-show kiosk mode';
  for (const button of document.querySelectorAll('[data-scene]')) button.setAttribute('aria-pressed', String(button.dataset.scene === build.scene));
  $('#scene-note').hidden = !(build.scene === 'water' && build.options.includes('trailer'));
  $('#build-field').value = `${specText(build)} · ${location.origin}${location.pathname}${toHash(build)}`;
  history.replaceState(null, '', toHash(build));
}

form.addEventListener('change', (event) => {
  const { name, value } = event.target;
  const next = { ...build, options: [...build.options] };
  if (name === 'options') {
    next.options = [...form.querySelectorAll('input[name="options"]:checked')].map((i) => i.value);
  } else {
    next[name] = value;
  }
  const modelChanged = name === 'model';
  build = normalise(next);
  syncControls();
  rebuild();
  if (modelChanged) flyTo('hero');
});

for (const button of document.querySelectorAll('[data-scene]')) {
  button.addEventListener('click', () => {
    build = normalise({ ...build, scene: button.dataset.scene });
    syncControls();
    rebuild();
    flyTo('hero');
  });
}
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => flyTo(button.dataset.view));

// A build link pasted into the same tab only changes the hash.
addEventListener('hashchange', () => {
  build = fromHash(location.hash);
  syncControls();
  rebuild();
  flyTo('hero');
});

$('.builder').addEventListener('change', (event) => {
  build = normalise({ ...build, price: event.target.value });
  syncControls();
});

// ---------- buyer quote: dealer step and the lead it produces (demo, never sent) ----------

const quote = $('#quote');
const lead = $('#lead');
let lastLead = '';

quote.addEventListener('change', (event) => {
  if (event.target.name !== 'dealer') return;
  build = normalise({ ...build, dealer: event.target.value });
  syncControls();
});

$('#to-quote').addEventListener('click', () => {
  quote.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  setTimeout(() => (build.dealer ? $('#q-name') : quote.querySelector('input[name="dealer"]')).focus({ preventScroll: true }), reduceMotion ? 0 : 600);
});

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function specRows(b) {
  const r = resolve(b);
  return [
    ['Model', `${r.model.name} · ${r.model.length.toFixed(1)} m · ${r.model.beam.toFixed(1)} m beam`],
    ['Layout', r.layout.name],
    ['Topsides', r.hull.name],
    [b.layout === 'ht' ? 'Cabin and hardtop' : 'Console and T-top', r.trim.name],
    ['Power', `${r.engine.name}, ${r.cowling.name.toLowerCase()} cowling`],
    ['Options', r.options.map((o) => o.name).join(', ') || 'None'],
  ];
}

const buildLink = () => `${location.origin}${location.pathname}${toHash({ ...build, kiosk: false })}`;

quote.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = $('#q-name').value.trim();
  const email = $('#q-email').value.trim();
  const phone = $('#q-phone').value.trim();
  const error = !build.dealer ? 'Choose your region first.' : !name ? 'Add your name.' : !email || !$('#q-email').checkValidity() ? 'Add a valid email address.' : '';
  $('#quote-error').textContent = error;
  $('#quote-error').hidden = !error;
  if (error) return;

  const r = resolve(build);
  const { items, total } = lineItems(build);
  const id = `HB-${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const when = new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
  const rows = [
    ['Lead', `${id} · ${when}`],
    ['Dealer', `${r.dealer.name}, ${r.dealer.town} (${r.dealer.region})`],
    ['Buyer', [name, email, phone].filter(Boolean).join(' · ')],
    ...specRows(build),
    ['Price', `${nzd(total)} RRP incl. GST`],
    ['Buyer saw', build.price === 'full' ? 'Full price' : shownTotal(build)],
    ['Source', 'Website configurator'],
    ['Build link', buildLink()],
  ];
  $('#lead-card').innerHTML = `<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${k === 'Build link' ? `<a href="${esc(v)}">${esc(v)}</a>` : esc(v)}</dd>`).join('')}</dl>
    <details><summary>Price breakdown</summary><ul>${items.map((i) => `<li><span>${esc(i.label)}</span><span>${i.price ? nzd(i.price) : 'Included'}</span></li>`).join('')}</ul></details>`;
  lastLead = rows.map(([k, v]) => `${k}: ${v}`).join('\n');
  lead.showModal();
});

$('#lead-close').addEventListener('click', () => lead.close());
$('#lead-copy').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(lastLead);
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Copy failed';
  }
  setTimeout(() => { button.textContent = 'Copy lead'; }, 2000);
});

// ---------- printable spec sheet ----------

const sheet = $('#sheet');

$('#spec-sheet').addEventListener('click', () => {
  const r = resolve(build);
  const { items, total } = lineItems(build);
  const img = specShot().toDataURL('image/jpeg', 0.9);
  const price = build.price === 'full'
    ? `<table class="sheet-prices">${items.map((i) => `<tr><td>${esc(i.label)}</td><td>${i.price ? nzd(i.price) : 'Included'}</td></tr>`).join('')}<tr class="sheet-total"><td>Estimated price</td><td>${nzd(total)}</td></tr></table>`
    : `<p class="sheet-total-line"><span>${build.price === 'from' ? 'Priced from' : 'Price'}</span><strong>${build.price === 'from' ? nzd(r.model.price) : 'Quote on request'}</strong></p>`;
  $('#sheet-page').innerHTML = `
    <header class="sheet-head"><p class="eyebrow">Harbour series · Spec sheet</p><h1>${esc(r.model.name)} ${esc(r.layout.name)}</h1><p class="mono">${new Intl.DateTimeFormat('en-NZ', { dateStyle: 'long' }).format(new Date())}</p></header>
    <img src="${img}" alt="${esc(r.model.name)} ${esc(r.layout.name)} as configured" />
    <table class="sheet-spec">${specRows(build).map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('')}${r.dealer ? `<tr><th>Dealer</th><td>${esc(r.dealer.name)}, ${esc(r.dealer.town)}</td></tr>` : ''}</table>
    ${price}
    <p class="sheet-link">Open this build: <a href="${esc(buildLink())}">${esc(buildLink())}</a></p>
    <p class="sheet-fine">${build.price === 'full' ? 'Demo pricing in NZD including GST. ' : 'Your dealer quotes the full build. '}The Harbour series is a fictional boat built by Waking Dream Technology to show the configurator.</p>`;
  sheet.hidden = false;
  document.body.classList.add('sheet-open');
  $('#sheet-print').focus();
});

function closeSheet() {
  sheet.hidden = true;
  document.body.classList.remove('sheet-open');
}
$('#sheet-close').addEventListener('click', closeSheet);
$('#sheet-print').addEventListener('click', () => print());
addEventListener('keydown', (event) => { if (event.key === 'Escape' && !sheet.hidden) closeSheet(); });

// ---------- boat-show kiosk: full screen, big targets, attract loop when idle ----------

const IDLE_MS = Number(new URLSearchParams(location.search).get('idle')) * 1000 || 60000;
const attract = $('#attract');
let lastInput = performance.now();
let attracting = false;
let cycle = 0;

function goFullscreen() {
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
}

function setKiosk(on) {
  build = normalise({ ...build, kiosk: on });
  syncControls();
  if (on) goFullscreen();
  else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (!on) stopAttract();
}
$('#kiosk-toggle').addEventListener('click', () => setKiosk(!build.kiosk));
$('#kiosk-exit').addEventListener('click', () => setKiosk(false));

// Back to the default boat with the builder's settings, slowly turning and cycling paint.
function startAttract() {
  attracting = true;
  if (lead.open) lead.close();
  closeSheet();
  quote.reset();
  build = normalise({ ...fromHash(''), price: build.price, kiosk: true });
  syncControls();
  rebuild();
  flyTo('hero');
  controls.autoRotate = !reduceMotion;
  document.querySelector('.panel').scrollTo({ top: 0 });
  scrollTo({ top: 0 });
  attract.hidden = false;
}

function stopAttract() {
  if (!attracting) return;
  attracting = false;
  attract.hidden = true;
}

for (const type of ['pointerdown', 'keydown', 'wheel']) {
  addEventListener(type, () => {
    lastInput = performance.now();
    if (build.kiosk) goFullscreen();
    stopAttract();
  }, { passive: true, capture: true });
}

setInterval(() => {
  if (!build.kiosk) return;
  if (!attracting && performance.now() - lastInput > IDLE_MS) startAttract();
  else if (attracting && !reduceMotion) {
    cycle = (cycle + 1) % HULL_COLOURS.length;
    build = normalise({ ...build, hull: HULL_COLOURS[cycle].id });
    syncControls();
    rebuild();
  }
}, 4000);

$('#copy-link').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(location.href);
    button.textContent = 'Link copied';
  } catch {
    button.textContent = 'Copy from the address bar';
  }
  setTimeout(() => { button.textContent = 'Copy build link'; }, 2000);
});

// Copies the frame in the same task it is rendered, over the studio backdrop the CSS draws.
function snapshot() {
  renderer.render(scene, camera);
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext('2d');
  if (build.scene === 'studio') {
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

// Spec-sheet image: the three-quarter preset at a fixed 16:9, whatever the stage is showing.
function specShot() {
  const size = renderer.getSize(new THREE.Vector2());
  const saved = { pos: camera.position.clone(), aspect: camera.aspect };
  renderer.setSize(1280, 720, false);
  camera.aspect = 1280 / 720;
  camera.updateProjectionMatrix();
  const to = viewTargets('hero');
  camera.position.copy(to.pos);
  camera.lookAt(to.target);
  const out = snapshot();
  renderer.setSize(size.x, size.y, false);
  camera.aspect = saved.aspect;
  camera.updateProjectionMatrix();
  camera.position.copy(saved.pos);
  camera.lookAt(controls.target);
  renderer.render(scene, camera);
  return out;
}

$('#save-image').addEventListener('click', () => {
  snapshot().toBlob((blob) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${resolve(build).model.name.toLowerCase().replace(' ', '-')}-${build.layout}-${build.hull}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
});

$('#reset').addEventListener('click', () => {
  build = normalise({ ...fromHash(''), price: build.price, kiosk: build.kiosk });
  quote.reset();
  syncControls();
  rebuild();
  flyTo('hero');
});

// ---------- loop ----------

function resize() {
  const { width, height } = stage.getBoundingClientRect();
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(height, 1);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

const timer = new THREE.Timer();
const glowPoint = new THREE.Vector3();
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

function frame(now) {
  timer.update(now);
  const t = timer.getElapsed();
  if (flight) {
    const u = Math.min(1, (performance.now() - flight.start) / flight.duration);
    const e = ease(u);
    camera.position.lerpVectors(flight.from, flight.pos, e);
    controls.target.lerpVectors(flight.fromTarget, flight.target, e);
    if (u === 1) flight = null;
  }
  if (build.scene === 'water') {
    const swell = reduceMotion ? 0 : 1;
    vessel.position.y = lift + Math.sin(t * 0.9) * 0.035 * swell;
    vessel.rotation.z = Math.sin(t * 0.7 + 0.8) * 0.012 * swell;
    vessel.rotation.x = Math.sin(t * 0.55) * 0.018 * swell;
    water.material.uniforms.uTime.value = reduceMotion ? 0 : t;
    current.leds.forEach((p, i) => {
      glowPoint.copy(p).add(new THREE.Vector3(-0.9, 0, 0));
      current.boat.localToWorld(glowPoint);
      water.material.uniforms.uGlow.value[i].copy(glowPoint);
    });
    sky.position.copy(camera.position);
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Phones open straight onto the boat; builder settings stay one tap away.
if (matchMedia('(max-width: 979px)').matches) $('.builder').open = false;
renderControls();
syncControls();
document.fonts.ready.then(() => {
  rebuild();
  resize();
  flyTo('hero', true);
  controls.autoRotate = !reduceMotion;
  frame();
  requestAnimationFrame(() => $('#loading').classList.add('done'));
});
