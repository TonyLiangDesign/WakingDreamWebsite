import {
  MODELS, LAYOUTS, HULL_COLOURS, TRIM_COLOURS, ENGINES, COWLINGS, OPTIONS, DEALERS, PRICE_MODES,
  engineAllowed, optionAllowed, normalise, resolve, lineItems, specText, shownTotal, nzd, toHash, fromHash,
} from './config.js';
import { reduceMotion, stage, mountBoat, resizeRenderer, renderFrame, snapshot, startLoop, revealLit, seaReady, loadSea, qaCompileHandles } from './scene.js';
import { qaHold, camera, controls, flyTo, startSpin, rigChanged, resizeCamera, stepCamera, specShot, rigOnScreen } from './camera.js';
import './style.css';

// UI wiring only: options panel, price modes, dealer quote, spec sheet, kiosk. The 3D side is
// scene.js (world, boat, water, loop) and camera.js (views and framing).

let build = fromHash(location.hash);

function rebuild() {
  mountBoat(build);
  rigChanged();
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
  // The water shows once its chunk has loaded and compiled (scene.js); the button says so.
  const waitingForSea = build.scene === 'water' && !seaReady();
  document.querySelector('[data-scene="water"]').toggleAttribute('aria-busy', waitingForSea);
  if (waitingForSea) loadSea().then(syncControls);
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
  if (modelChanged) view('hero');
});

for (const button of document.querySelectorAll('[data-scene]')) {
  button.addEventListener('click', () => {
    build = normalise({ ...build, scene: button.dataset.scene });
    syncControls();
    rebuild();
    view('hero');
  });
}
// The view buttons show which preset the camera holds, until the buyer turns it by hand.
function showView(name) {
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === name));
}
function view(name, instant) {
  flyTo(name, instant);
  showView(name);
}
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => view(button.dataset.view));
controls.addEventListener('start', () => showView(null));

// A build link pasted into the same tab only changes the hash.
addEventListener('hashchange', () => {
  build = fromHash(location.hash);
  syncControls();
  rebuild();
  view('hero');
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

// Clear the buyer's details once they've seen the lead, so a shared show tablet keeps nothing.
function forgetBuyer() {
  quote.reset();
  syncControls();
}
$('#lead-close').addEventListener('click', () => {
  lead.close();
  forgetBuyer();
});
lead.addEventListener('close', forgetBuyer);
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
  view('hero');
  startSpin();
  showView(null);
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
    button.textContent = 'Copy failed';
  }
  setTimeout(() => { button.textContent = 'Copy link'; }, 2000);
});


$('#save-image').addEventListener('click', () => {
  snapshot(camera).toBlob((blob) => {
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
  view('hero');
});

// The camera fits the boat to the part of the stage the overlays leave clear: below the title
// row, above the view buttons (and the kiosk's attract button), with a margin at the sides that
// leaves the boat some air.
const GAP = 10;
function stageInsets(box) {
  const reach = (sel, edge) => {
    const el = $(sel);
    if (!el || el.hidden) return 0;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return 0;
    return edge === 'top' ? r.bottom - box.top + GAP : box.bottom - r.top + GAP;
  };
  const side = Math.max(16, box.width * 0.045);
  return {
    width: box.width,
    height: box.height,
    top: Math.max(GAP * 2, reach('.stage-title', 'top'), reach('.stage-side', 'top')),
    bottom: Math.max(GAP * 2, reach('.stage-views', 'bottom'), reach('#attract', 'bottom')),
    left: side,
    right: side,
  };
}

let started = false;
function resize() {
  const box = stage.getBoundingClientRect();
  if (!box.width || !box.height) return;
  resizeRenderer(box.width, box.height);
  resizeCamera(box.width / box.height, stageInsets(box));
  // Draw the refitted frame now, so no frame is ever shown at the old fit.
  if (started) renderFrame(camera, controls.target);
}
const stageObserver = new ResizeObserver(resize);
for (const el of [stage, $('.stage-top'), $('.stage-views'), attract]) stageObserver.observe(el);

// Phones open straight onto the boat; builder settings stay one tap away.
if (matchMedia('(max-width: 979px)').matches) $('.builder').open = false;
renderControls();
syncControls();
document.fonts.ready.then(async () => {
  performance.mark('rebuild-start');
  rebuild();
  performance.mark('rebuild-end');
  resize();
  // QA hooks: ?qaView=side holds a fixed view with no auto-rotate, for repeatable screenshots;
  // ?qaScroll=600 scrolls the page first (phones: the sticky stage); either one also writes the
  // rig's on-screen bounds and the safe area to <body data-qa-frame> for --dump-dom checks.
  const params = new URLSearchParams(location.search);
  const qaView = params.get('qaView');
  const qaScroll = Number(params.get('qaScroll')) || 0;
  view(qaView || 'hero', true);
  if (!qaView) {
    // Hold the framed hero shot while the loading cover fades, then ease into the turn.
    startSpin(1.2);
    showView(null);
  }
  startLoop(camera, controls, stepCamera);
  started = true;
  // Lift the cover once the first frames are drawn, so it fades onto the boat (in clay), then
  // link the real materials in the background and show them when they are ready (scene.js).
  requestAnimationFrame(() => requestAnimationFrame(() => {
    performance.mark('first-frames');
    $('#loading').classList.add('done');
    revealLit(camera);
  }));
  // ?qaCam=px,py,pz,tx,ty,tz parks the camera (world metres) for close-up QA shots.
  const qaCam = (params.get('qaCam') || '').split(',').map(Number);
  if (qaCam.length === 6 && qaCam.every(Number.isFinite)) qaHold(qaCam.slice(0, 3), qaCam.slice(3));
  if (qaScroll) scrollTo(0, qaScroll);
  if (params.has('qaCompile')) window.qaCompile = qaCompileHandles(camera);
  if (qaView || qaScroll) setInterval(() => { document.body.dataset.qaFrame = JSON.stringify(rigOnScreen()); }, 250);
});
