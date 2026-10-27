import * as THREE from 'three';
import { hullPoints } from './framing.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { canvas, reduceMotion, renderer, scene, vessel, stand, mats, current, onWater, renderReflection, snapshot, renderFrame } from './scene.js';

// Camera and orbit controls, the view presets and their fit to the visible rig, fly-to and
// refit, the per-frame camera step, and the fixed 16:9 spec-sheet render.
// rigChanged() is called after every mountBoat(); resizeCamera() after every stage resize, with
// the stage's safe area (the part not covered by the title, scene toggle and view buttons).
//
// Framing is measured, never hard-coded: every fit projects sample points of what is on show
// (hull, engine, fit-out and the trailer or cradle; afloat, only what is above the water) and
// solves for the orbit target and camera distance that put them all inside the safe area,
// centred in it. Auto-rotate follows a table of those fits round the boat, so the camera eases
// in and out as it turns: the rig fills the stage at every heading and never leaves it.

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const FOV = 32;
const TAN_V = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
let framed = null;   // the preset the camera is holding, or null once the buyer has moved it
let flight = null;
let spin = null;     // auto-rotate fits, one per heading
let lastStep = 0;
let qaHeld = false;  // ?qaCam close-up: no limits, no refits

export const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 4000);
camera.position.set(5.6, 2.6, 6.4);
export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 40;
controls.target.set(0, 1.4, 0);
controls.autoRotate = false;
controls.autoRotateSpeed = 0;
// Auto-rotate is slow and eases up to speed (stepCamera sets the speed every frame).
const SPIN_SPEED = 0.4;  // OrbitControls units: 2.4 degrees a second, a turn in two and a half minutes
const SPIN_RAMP = 2.5;   // seconds to ease up to full speed
let spinClock = 0;
controls.addEventListener('start', () => { controls.autoRotate = false; framed = null; flight = null; });

// ---------- camera views ----------

// Each preset is a direction only; target and distance are fitted to the rig for the stage.
// az: degrees round from the starboard beam (+z) towards the bow (+x); el: degrees above level.
// The three-quarter views share one flattering elevation; the profile is a true side elevation
// (level, so the camera sits at the height of the rig's centre, about the sheer); the plan
// looks straight down with the bow to the right.
const QUARTER_EL = 15;
const VIEWS = {
  hero: { label: 'Three-quarter', az: 40, el: QUARTER_EL, spin: true },
  side: { label: 'Profile', az: 0, el: 0 },
  stern: { label: 'Stern', az: -62, el: QUARTER_EL },
  bow: { label: 'Bow', az: 115, el: QUARTER_EL },
  top: { label: 'Plan', az: 0, el: 89.99 },
};
const SPIN_STEPS = 144;  // every 2.5 degrees

// Safe area in normalised device coordinates (-1..1), from the stage overlays (see main.js).
let safe = { l: -0.94, r: 0.94, b: -0.8, t: 0.72 };
// The spec sheet has no overlays: even margins at the sides and below, and more headroom, so a
// rocket launcher's rods rise into the picture instead of being cut at its top edge.
const SHEET_SAFE = { l: -0.88, r: 0.88, b: -0.86, t: 0.66 };

// Points on what is on show. Rod blanks, reels and the VHF whip are left out, so a rocket
// launcher crops at the top of the frame rather than shrinking the boat:
//  - any mesh flagged userData.noFit, on the mesh or on its material, is skipped (the boat is
//    merged by material at the end of buildBoat, so the material flag is the one that survives);
//  - as a fallback for unflagged parts, thin geometry (tubes, blanks and small fittings, made
//    only of narrow or short triangles) that rises clear of the highest solid surface, the
//    hardtop roof or the T-top canopy, is skipped too.
// Afloat, points below the surface are lifted to it: the water hides them, so they must not
// push the boat up the frame.
const SOLID_WIDTH = 0.02;   // a triangle at least this wide across its longest edge...
const SOLID_LENGTH = 0.1;   // ...and at least this long is solid surface
const THIN_CLEAR = 0.12;    // thin geometry more than this above the solid top is ignored
const noFit = (o) => o.userData.noFit === true || o.material?.userData?.noFit === true;
let rig = null;
function rigPoints() {
  if (rig) return rig;
  vessel.updateMatrixWorld(true);
  stand.updateMatrixWorld(true);
  const meshes = [];
  for (const part of [current.boat, current.trailer, current.cradle]) {
    if (!part.visible) continue;
    part.traverse((o) => { if (o.isMesh && o.material !== mats.rod && !noFit(o)) meshes.push({ o, boat: part === current.boat }); });
  }
  // World positions, and which vertices belong to a solid (wide and long) triangle.
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3();
  let solidTop = -Infinity;
  const parts = meshes.map(({ o, boat }) => {
    const pos = o.geometry.attributes.position;
    const world = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) a.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).toArray(world, i * 3);
    const solid = new Uint8Array(pos.count);
    const index = o.geometry.index;
    const n = index ? index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const i0 = index ? index.getX(t) : t;
      const i1 = index ? index.getX(t + 1) : t + 1;
      const i2 = index ? index.getX(t + 2) : t + 2;
      a.fromArray(world, i0 * 3);
      b.fromArray(world, i1 * 3);
      c.fromArray(world, i2 * 3);
      const longestSq = Math.max(a.distanceToSquared(b), b.distanceToSquared(c), c.distanceToSquared(a));
      if (longestSq < SOLID_LENGTH * SOLID_LENGTH) continue;
      if (ab.subVectors(b, a).cross(ac.subVectors(c, a)).lengthSq() < SOLID_WIDTH * SOLID_WIDTH * longestSq) continue;
      solid[i0] = solid[i1] = solid[i2] = 1;
      solidTop = Math.max(solidTop, a.y, b.y, c.y);
    }
    return { world, solid, boat };
  });
  const thinCut = solidTop + THIN_CLEAR;

  const box = new THREE.Box3();
  const points = [];
  const boatPoints = [];  // the boat alone: hull, fit-out and engines
  const p = new THREE.Vector3();
  for (const { world, solid, boat } of parts) {
    const step = Math.max(1, Math.floor(solid.length / 400));
    const extrema = new Float64Array(14);
    const indices = new Int32Array(14).fill(-1);
    const keys = new Float64Array(7);
    for (let i = 0; i < solid.length; i++) {
      p.fromArray(world, i * 3);
      if (!solid[i] && p.y > thinCut) continue;
      if (onWater && p.y < 0) p.y = 0;
      box.expandByPoint(p);
      if (i % step === 0) {
        points.push(p.clone());
        if (boat) boatPoints.push(points[points.length - 1]);
      }
      // Keep each part's extremes, diagonals included, so thin tips are never sampled away.
      keys[0] = p.x; keys[1] = p.y; keys[2] = p.z;
      keys[3] = p.x + p.z; keys[4] = p.x - p.z;
      keys[5] = p.x + p.y; keys[6] = p.y - p.x;
      for (let k = 0; k < keys.length; k++) {
        const lo = k * 2, hi = lo + 1;
        if (indices[lo] < 0 || keys[k] < extrema[lo]) { extrema[lo] = keys[k]; indices[lo] = i; }
        if (indices[hi] < 0 || keys[k] > extrema[hi]) { extrema[hi] = keys[k]; indices[hi] = i; }
      }
    }
    // Allocate only the final extrema, rather than clones at every intermediate best point.
    for (const i of indices) if (i >= 0) {
      const q = new THREE.Vector3().fromArray(world, i * 3);
      if (onWater && q.y < 0) q.y = 0;
      points.push(q);
      if (boat) boatPoints.push(q);
    }
  }
  const centre = box.getCenter(new THREE.Vector3());
  let radius = 0;
  for (const q of points) radius = Math.max(radius, q.distanceTo(centre));
  return (rig = { box, points: hullPoints(points, centre), boatPoints: hullPoints(boatPoints, centre), centre, radius, solidTop });
}

function basis(dir) {
  const right = new THREE.Vector3().crossVectors(Y_AXIS, dir).normalize();
  const up = new THREE.Vector3().crossVectors(dir, right);
  return { right, up };
}

// Exact distance for a view direction (target to camera) and target: a point at offset x across
// and depth z towards the camera is inside the edge e when d >= x / (e * tan) + z.
//
// The boat itself (hull, fit-out and engines) is also held to BOAT_FILL of the frame width, so a
// boat on a cradle or afloat, with nothing ahead of the bow, keeps the same air round it as one
// whose trailer drawbar reaches out ahead: about 75-80% of the stage either way. BOAT_FILL_V
// does the same for its height, so the near end-on bow and stern views don't loom.
const BOAT_FILL = 0.8;
const BOAT_FILL_V = 0.68;
function solve(dir, aspect, area, target) {
  const { right, up } = basis(dir);
  const tanH = TAN_V * aspect;
  const q = new THREE.Vector3();
  let d = 0;
  for (const p of rigPoints().points) {
    q.subVectors(p, target);
    const x = q.dot(right);
    const y = q.dot(up);
    const z = q.dot(dir);
    d = Math.max(d, x / ((x >= 0 ? area.r : area.l) * tanH) + z, y / ((y >= 0 ? area.t : area.b) * TAN_V) + z);
  }
  // The caps, in NDC where the frame is 2 across. Projected size shrinks about as 1 / d, so a
  // few rescales settle on them.
  for (let k = 0; k < 4; k++) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of rigPoints().boatPoints) {
      q.subVectors(p, target);
      const depth = Math.max(0.1, d - q.dot(dir));
      const nx = q.dot(right) / (depth * tanH);
      const ny = q.dot(up) / (depth * TAN_V);
      if (nx < x0) x0 = nx;
      if (nx > x1) x1 = nx;
      if (ny < y0) y0 = ny;
      if (ny > y1) y1 = ny;
    }
    const over = Math.max((x1 - x0) / (BOAT_FILL * 2), (y1 - y0) / (BOAT_FILL_V * 2));
    if (over <= 1.002) break;
    d *= over;
  }
  return d;
}

// The target and distance that fit every point inside the safe area, with the rig's projection
// centred in it: solve the distance, nudge the target by the projection's off-centre, repeat.
function fit(dir, aspect, area, start = rigPoints().centre) {
  const { right, up } = basis(dir);
  const tanH = TAN_V * aspect;
  const cx = (area.l + area.r) / 2;
  const cy = (area.b + area.t) / 2;
  const target = start.clone();
  const q = new THREE.Vector3();
  let d = solve(dir, aspect, area, target);
  for (let iter = 0; iter < 5; iter++) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of rigPoints().points) {
      q.subVectors(p, target);
      const depth = Math.max(0.1, d - q.dot(dir));
      const nx = q.dot(right) / (depth * tanH);
      const ny = q.dot(up) / (depth * TAN_V);
      if (nx < x0) x0 = nx;
      if (nx > x1) x1 = nx;
      if (ny < y0) y0 = ny;
      if (ny > y1) y1 = ny;
    }
    const ox = (x0 + x1) / 2 - cx;
    const oy = (y0 + y1) / 2 - cy;
    if (Math.abs(ox) < 0.003 && Math.abs(oy) < 0.003) break;
    target.addScaledVector(right, ox * d * tanH).addScaledVector(up, oy * d * TAN_V);
    d = solve(dir, aspect, area, target);
  }
  return { target, d };
}

const DEG = Math.PI / 180;
const azElDir = (az, el) => new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
const presetDir = (name) => azElDir(VIEWS[name].az * DEG, VIEWS[name].el * DEG);
const HERO_AZ = VIEWS.hero.az * DEG;
const HERO_ELEV = VIEWS.hero.el * DEG;
const spinDir = (az) => azElDir(az, HERO_ELEV);

// Fits all the way round at the hero elevation. Targets are smoothed so the orbit centre glides;
// each distance is then the largest exact fit for those targets one step either side, smoothed
// again but never allowed below its own exact fit. So the camera eases out just ahead of a long
// heading coming round, and nothing crosses the edge on the way.
function spinTable() {
  if (spin) return spin;
  const n = SPIN_STEPS;
  const wrap = (i) => ((i % n) + n) % n;
  const gauss = (values, sigma, add, zero) => values.map((_, i) => {
    let acc = zero();
    let wsum = 0;
    for (let k = -3 * sigma; k <= 3 * sigma; k++) {
      const w = Math.exp(-(k * k) / (2 * sigma * sigma));
      acc = add(acc, values[wrap(i + k)], w);
      wsum += w;
    }
    return { acc, wsum };
  });
  const dirs = Array.from({ length: n }, (_, i) => spinDir((i / n) * Math.PI * 2));
  const raw = dirs.map((dir) => fit(dir, camera.aspect, safe));
  const targets = gauss(raw.map((r) => r.target), 2, (a, v, w) => a.addScaledVector(v, w), () => new THREE.Vector3())
    .map(({ acc, wsum }) => acc.divideScalar(wsum));
  const exact = dirs.map((dir, i) => solve(dir, camera.aspect, safe, targets[i]));
  const held = exact.map((_, i) => Math.max(exact[wrap(i - 1)], exact[i], exact[wrap(i + 1)]));
  const table = gauss(held, 2, (a, v, w) => a + v * w, () => 0)
    .map(({ acc, wsum }, i) => ({ target: targets[i], d: Math.max(acc / wsum, held[i] * 0.985, exact[i]) }));
  return (spin = { table });
}

// The spin fit at any azimuth, interpolated between table entries (with a hair of margin for
// the interpolation).
function spinAt(az) {
  // The first still frame needs one fit, not a complete 144-view turntable.
  if (!spin) return fit(spinDir(az), camera.aspect, safe);
  const { table } = spin;
  const u = ((((az / (Math.PI * 2)) % 1) + 1) % 1) * SPIN_STEPS;
  const i = Math.floor(u);
  const f = u - i;
  const a = table[i % SPIN_STEPS];
  const b = table[(i + 1) % SPIN_STEPS];
  return { target: a.target.clone().lerp(b.target, f), d: THREE.MathUtils.lerp(a.d, b.d, f) * 1.005 };
}

// Camera position and target for a preset. The three-quarter view is the spin table's entry at
// its heading, so auto-rotate starts from exactly where the preset leaves the camera.
export function viewTargets(name, { aspect, area } = {}) {
  if (VIEWS[name].spin && !aspect && !area) {
    const { target, d } = spinAt(HERO_AZ);
    return { pos: target.clone().addScaledVector(spinDir(HERO_AZ), d), target };
  }
  const dir = presetDir(name);
  const { target, d } = fit(dir, aspect || camera.aspect, area || safe);
  return { pos: target.clone().addScaledVector(dir, d), target };
}

// Zoom limits from the rig: never inside its bounding sphere, never so far it is a speck.
function setLimits() {
  if (qaHeld) return;
  let far = 0;
  if (spin) for (const e of spin.table) far = Math.max(far, e.d);
  for (const name of Object.keys(VIEWS)) {
    const v = viewTargets(name);
    far = Math.max(far, v.pos.distanceTo(v.target));
  }
  controls.minDistance = Math.max(2.5, rigPoints().radius * 1.15);
  controls.maxDistance = far * 1.6;
}

// Where the camera belongs for the preset it holds; while auto-rotating, at its current heading.
function heldPose() {
  if (VIEWS[framed].spin && controls.autoRotate) {
    const off = camera.position.clone().sub(controls.target);
    const az = Math.atan2(off.x, off.z);
    const { target, d } = spinAt(az);
    return { pos: target.clone().addScaledVector(spinDir(az), d), target };
  }
  return viewTargets(framed);
}

function startFlight(to, duration) {
  if (reduceMotion || !duration) {
    camera.position.copy(to.pos);
    controls.target.copy(to.target);
    camera.lookAt(to.target);
    flight = null;
    return;
  }
  flight = { from: camera.position.clone(), fromTarget: controls.target.clone(), pos: to.pos, target: to.target, start: performance.now(), duration };
}

export function flyTo(name, instant = false) {
  controls.autoRotate = false;
  framed = name;
  startFlight(viewTargets(name), instant ? 0 : 1100);
}

// Starts auto-rotate from the hero fit: still for delay seconds (and while a flight is under
// way), then easing up to speed.
export function startSpin(delay = 0) {
  if (reduceMotion) return;
  framed = 'hero';
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0;
  spinClock = -delay;
}

// After a rebuild or scene change: drop the cached fits and ease to the new one. While
// auto-rotating, stepCamera eases along the new table by itself.
export function rigChanged() {
  rig = null;
  spin = null;
  // Level at most, so the profile preset is a true elevation; the change handler below keeps
  // the camera itself above the floor or the water.
  controls.maxPolarAngle = Math.PI / 2;
  setLimits();
  if (!framed || (VIEWS[framed].spin && controls.autoRotate)) return;
  if (flight) {
    const to = viewTargets(framed);
    flight.pos = to.pos;
    flight.target = to.target;
  } else {
    startFlight(heldPose(), 600);
  }
}

// After a stage resize. insets: the stage size and how far the overlays reach in from each edge,
// in CSS pixels. Snaps straight to the new fit: easing would show the rig cropped while the stage
// changes shape. A flight in progress is retargeted instead.
export function resizeCamera(aspect, insets) {
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  if (insets) {
    const { width: w, height: h, top, bottom, left, right } = insets;
    safe = { l: -1 + (2 * left) / w, r: 1 - (2 * right) / w, t: 1 - (2 * top) / h, b: -1 + (2 * bottom) / h };
  }
  spin = null;
  if (!current) return;
  setLimits();
  if (!framed) return;
  const to = flight ? viewTargets(framed) : heldPose();
  if (flight) {
    flight.pos = to.pos;
    flight.target = to.target;
  } else {
    startFlight(to, 0);
  }
}

// QA close-ups (?qaCam=): park the camera at a world position and target and keep it there.
export function qaHold(pos, target) {
  qaHeld = true;
  framed = null;
  flight = null;
  controls.autoRotate = false;
  controls.minDistance = 0.05;
  controls.maxDistance = 1000;
  camera.position.set(...pos);
  controls.target.set(...target);
  controls.update();
}

// ---------- per frame ----------

const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const sph = new THREE.Spherical();
const sphFrom = new THREE.Spherical();
const sphTo = new THREE.Spherical();
const off = new THREE.Vector3();

export function stepCamera() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - (lastStep || now)) / 1000);
  lastStep = now;
  if (controls.autoRotate) {
    if (!flight) spinClock += dt;
    const u = THREE.MathUtils.clamp(spinClock / SPIN_RAMP, 0, 1);
    // OrbitControls turns 2 pi / 3600 x speed per update: scale by the frame time, so the turn
    // rate is the same at any frame rate.
    controls.autoRotateSpeed = flight ? 0 : SPIN_SPEED * u * u * (3 - 2 * u) * dt * 60;
  } else {
    spinClock = 0;
  }
  if (flight) {
    // Swing round the target on a sphere, so a bow-to-stern move never cuts through the boat.
    const u = Math.min(1, (now - flight.start) / flight.duration);
    const e = ease(u);
    sphFrom.setFromVector3(off.subVectors(flight.from, flight.fromTarget));
    sphTo.setFromVector3(off.subVectors(flight.pos, flight.target));
    const turn = Math.atan2(Math.sin(sphTo.theta - sphFrom.theta), Math.cos(sphTo.theta - sphFrom.theta));
    sph.set(THREE.MathUtils.lerp(sphFrom.radius, sphTo.radius, e), THREE.MathUtils.lerp(sphFrom.phi, sphTo.phi, e), sphFrom.theta + turn * e);
    controls.target.lerpVectors(flight.fromTarget, flight.target, e);
    camera.position.setFromSpherical(sph).add(controls.target);
    if (u === 1) flight = null;
    return;
  }
  // Auto-rotate: ease target, distance and elevation along the spin table at this heading.
  if (controls.autoRotate && framed && VIEWS[framed].spin && current && spinClock > 0) {
    if (!spin) {
      spinTable();
      setLimits();
    }
    off.subVectors(camera.position, controls.target);
    const { target, d } = spinAt(Math.atan2(off.x, off.z));
    const k = 1 - Math.exp(-dt / 0.35);
    sph.setFromVector3(off);
    sph.radius += (d - sph.radius) * k;
    sph.phi += (Math.PI / 2 - HERO_ELEV - sph.phi) * k;
    controls.target.lerp(target, k);
    camera.position.setFromSpherical(sph).add(controls.target);
  }
}

// Keep the buyer's orbit and pan above the floor or the water and close to the rig.
controls.addEventListener('change', () => {
  if (!rig) return;
  const t = controls.target;
  const lo = rig.box.min.clone().subScalar(0.5);
  const hi = rig.box.max.clone().addScalar(0.5);
  lo.y = Math.max(lo.y, 0.3);
  const clamped = t.clone().clamp(lo, hi);
  if (!clamped.equals(t)) {
    camera.position.add(clamped.clone().sub(t));
    t.copy(clamped);
  }
  const floorY = onWater ? 0.35 : 0.25;
  if (camera.position.y < floorY) camera.position.y = floorY;
});

// Spec-sheet image: the three-quarter preset at a fixed 16:9, whatever the stage is showing,
// fitted and centred with even margins (the sheet has no overlays).
export function specShot() {
  const size = renderer.getSize(new THREE.Vector2());
  const saved = { pos: camera.position.clone(), aspect: camera.aspect };
  renderer.setSize(1280, 720, false);
  camera.aspect = 1280 / 720;
  camera.updateProjectionMatrix();
  const to = viewTargets('hero', { aspect: 1280 / 720, area: SHEET_SAFE });
  camera.position.copy(to.pos);
  camera.lookAt(to.target);
  camera.updateMatrixWorld();
  renderer.shadowMap.needsUpdate = true;
  if (onWater) renderReflection(camera, to.target);
  const out = snapshot(camera);
  renderer.setSize(size.x, size.y, false);
  camera.aspect = saved.aspect;
  camera.updateProjectionMatrix();
  camera.position.copy(saved.pos);
  camera.lookAt(controls.target);
  camera.updateMatrixWorld();
  renderFrame(camera);
  return out;
}

// ---------- QA ----------

const r3 = (v) => Math.round(v * 1000) / 1000;
function bounds(cam, points = rigPoints().points) {
  cam.updateMatrixWorld();
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  const p = new THREE.Vector3();
  for (const q of points) {
    p.copy(q).project(cam);
    x0 = Math.min(x0, (p.x + 1) / 2); x1 = Math.max(x1, (p.x + 1) / 2);
    y0 = Math.min(y0, (1 - p.y) / 2); y1 = Math.max(y1, (1 - p.y) / 2);
  }
  return { x0: r3(x0), x1: r3(x1), y0: r3(y0), y1: r3(y1) };
}

// Where the rig sits on the stage now (fractions, y down), against the safe area; and the
// worst bounds over a full auto-rotate turn, sampled every degree from the spin table. boat is
// the boat alone (hull, fit-out and engines: no trailer, cradle or ignored rods), and solidTop
// and top the height the thin-geometry cut works from and the top of what is fitted.
export function rigOnScreen() {
  if (!current) return null;
  const cam = camera.clone();
  let worst = { x0: 1, x1: 0, y0: 1, y1: 0 };
  for (let a = 0; a < 360; a++) {
    const az = THREE.MathUtils.degToRad(a);
    const { target, d } = spinAt(az);
    cam.position.copy(target).addScaledVector(spinDir(az), d);
    cam.lookAt(target);
    const b = bounds(cam);
    worst = { x0: Math.min(worst.x0, b.x0), x1: Math.max(worst.x1, b.x1), y0: Math.min(worst.y0, b.y0), y1: Math.max(worst.y1, b.y1) };
  }
  return {
    rig: bounds(camera),
    boat: bounds(camera, rigPoints().boatPoints),
    spinWorst: worst,
    safe: { x0: r3((safe.l + 1) / 2), x1: r3((safe.r + 1) / 2), y0: r3((1 - safe.t) / 2), y1: r3((1 - safe.b) / 2) },
    d: r3(camera.position.distanceTo(controls.target)),
    zoom: [r3(controls.minDistance), r3(controls.maxDistance)],
    framed,
    solidTop: r3(rigPoints().solidTop),
    top: r3(rigPoints().box.max.y),
  };
}
