import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { canvas, reduceMotion, renderer, scene, vessel, stand, mats, current, onWater, renderReflection, snapshot } from './scene.js';

// Camera and orbit controls, the view presets and their fit to the visible rig, fly-to and
// refit, the per-frame camera step, and the fixed 16:9 spec-sheet render.
// rigChanged() is called after every mountBoat(); resizeCamera() after every stage resize.

let framed = null;
let flight = null;
export const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 4000);
camera.position.set(5.6, 2.6, 6.4);
export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 3;
controls.maxDistance = 32;
controls.target.set(0, 1.4, 0);
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.35;
controls.addEventListener('start', () => { controls.autoRotate = false; framed = null; });

// ---------- camera views ----------

// Each preset is a direction only; the distance is fitted to the visible rig for the stage's
// shape. The three-quarter view fits every heading, because auto-rotate swings round from it.
const VIEWS = {
  hero: { label: 'Three-quarter', dir: [5.4, 1.35, 6.35], spin: true },
  side: { label: 'Profile', dir: [0, 0.3, 10.8] },
  stern: { label: 'Stern', dir: [-6.4, 1.5, 3.4] },
  bow: { label: 'Bow', dir: [7.0, 1.5, -3.2] },
  top: { label: 'Plan', dir: [0.01, 12.5, 0.4] },
};
const FILL_H = 0.92;  // share of the stage width the rig may use
const FILL_V = 0.76;  // and of its height, leaving room for the title and the view buttons
const Y_AXIS = new THREE.Vector3(0, 1, 0);

// Points on what is on show: hull, engine and fit-out, plus the trailer or cradle. Rod blanks
// are left out, so a rocket launcher may crop at the top rather than shrink the boat.
let rig = null;
function rigPoints() {
  if (rig) return rig;
  vessel.updateMatrixWorld(true);
  stand.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const points = [];
  for (const part of [current.boat, current.trailer, current.cradle]) {
    if (!part.visible) continue;
    part.traverse((o) => {
      if (!o.isMesh || o.material === mats.rod) return;
      const pos = o.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 500));
      const ext = [];
      for (let i = 0; i < pos.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        box.expandByPoint(p);
        if (i % step === 0) points.push(p);
        // Keep each part's extremes so thin tips are never skipped by the sampling.
        for (let k = 0; k < 3; k++) {
          if (!ext[k * 2] || p.getComponent(k) < ext[k * 2].getComponent(k)) ext[k * 2] = p;
          if (!ext[k * 2 + 1] || p.getComponent(k) > ext[k * 2 + 1].getComponent(k)) ext[k * 2 + 1] = p;
        }
      }
      points.push(...ext);
    });
  }
  return (rig = { box, points });
}

function fitDistance(points, centre, dir, aspect) {
  const right = new THREE.Vector3().crossVectors(Y_AXIS, dir).normalize();
  const up = new THREE.Vector3().crossVectors(dir, right);
  const tV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * FILL_V;
  const tH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect * FILL_H;
  const q = new THREE.Vector3();
  let d = 0;
  for (const p of points) {
    q.subVectors(p, centre);
    const depth = q.dot(dir);
    d = Math.max(d, Math.abs(q.dot(right)) / tH + depth, Math.abs(q.dot(up)) / tV + depth);
  }
  return d;
}

export function viewTargets(name, { spin = VIEWS[name].spin, aspect = camera.aspect } = {}) {
  const { box, points } = rigPoints();
  const target = box.getCenter(new THREE.Vector3());
  const base = new THREE.Vector3(...VIEWS[name].dir).normalize();
  const turns = spin ? 24 : 1;
  let d = 0;
  for (let i = 0; i < turns; i++) d = Math.max(d, fitDistance(points, target, base.clone().applyAxisAngle(Y_AXIS, (i / turns) * Math.PI * 2), aspect));
  return { pos: target.clone().addScaledVector(base, d), target };
}

// After a resize or a rig change, keep the current heading but refit distance and centre.
export function refit() {
  if (!framed || !current) return;
  const to = viewTargets(framed);
  const heading = camera.position.clone().sub(controls.target).normalize();
  if (!VIEWS[framed].spin) heading.copy(to.pos).sub(to.target).normalize();
  const pos = to.target.clone().addScaledVector(heading, to.pos.distanceTo(to.target));
  flight = { from: camera.position.clone(), fromTarget: controls.target.clone(), pos, target: to.target, start: performance.now(), duration: reduceMotion ? 0 : 500 };
}

export function flyTo(name, instant = false) {
  controls.autoRotate = false;
  framed = name;
  const to = viewTargets(name);
  if (instant || reduceMotion) {
    camera.position.copy(to.pos);
    controls.target.copy(to.target);
    return;
  }
  flight = { from: camera.position.clone(), fromTarget: controls.target.clone(), ...to, start: performance.now(), duration: 1100 };
}

// After a rebuild or scene change: drop the cached rig points and refit what is framed.
export function rigChanged() {
  rig = null;
  controls.maxPolarAngle = onWater ? Math.PI * 0.485 : Math.PI * 0.49;
  if (framed) refit();
}

export function resizeCamera(aspect) {
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  refit();
}

const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
export function stepCamera() {
  if (flight) {
    const u = Math.min(1, (performance.now() - flight.start) / flight.duration);
    const e = ease(u);
    camera.position.lerpVectors(flight.from, flight.pos, e);
    controls.target.lerpVectors(flight.fromTarget, flight.target, e);
    if (u === 1) flight = null;
  }
}

// Spec-sheet image: the three-quarter preset at a fixed 16:9, whatever the stage is showing.
export function specShot() {
  const size = renderer.getSize(new THREE.Vector2());
  const saved = { pos: camera.position.clone(), aspect: camera.aspect };
  renderer.setSize(1280, 720, false);
  camera.aspect = 1280 / 720;
  camera.updateProjectionMatrix();
  const to = viewTargets('hero', { spin: false, aspect: 1280 / 720 });
  camera.position.copy(to.pos);
  camera.lookAt(to.target);
  camera.updateMatrixWorld();
  if (onWater) {
    renderer.shadowMap.needsUpdate = true;
    renderReflection(camera, to.target);
  }
  const out = snapshot(camera);
  renderer.setSize(size.x, size.y, false);
  camera.aspect = saved.aspect;
  camera.updateProjectionMatrix();
  camera.position.copy(saved.pos);
  camera.lookAt(controls.target);
  renderer.render(scene, camera);
  return out;
}
