import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { add, tube, rod, box, extrudeProfile, spaced, v3, lerp, clamp01 } from './kit.js';

// Deck fittings: rocket launcher and rods, nav lights, bowsprit with rollers and plough anchor,
// chain into the hawse pipe, anchor-locker hatch, bow cleat, bow rail, and the underwater lights.
// Each builds into the group it is given; underwaterLights() also returns the two lamp
// positions (boat-local) for the water glow, which has exactly two slots.
// allRoundLight() and bowNavLight() are here for the layouts to call (see navLight()).

const TUBE = 0.0145;  // 29 mm stainless tube for the bow rail, its stanchions and legs

// Part-specific materials, built once.
const own = {};
function ownMaterials() {
  if (!own.line) {
    own.line = new THREE.MeshStandardMaterial({ color: '#c8b45a', roughness: 0.6 });
    own.reel = new THREE.MeshStandardMaterial({ color: '#2a2d31', metalness: 0.6, roughness: 0.35 });
    own.anchor = new THREE.MeshStandardMaterial({ color: '#9a9fa2', metalness: 0.8, roughness: 0.5 });
    own.white = new THREE.MeshStandardMaterial({ color: '#f2f2ee', emissive: '#fff8e8', emissiveIntensity: 0.5, roughness: 0.15 });
    own.hole = new THREE.MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.95 });
    for (const mat of Object.values(own)) mat.userData.shared = true;
  }
  return own;
}

// Orients a mesh's local y axis along dir.
function alongY(mesh, dir) {
  mesh.quaternion.setFromUnitVectors(v3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

// Closed plate of thickness t through the surface f(u, v) -> Vector3: two skins and the rims
// on every edge except v = 0 (left open where two plates meet along a spine).
function slab(f, nu, nv, t) {
  const grid = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const v = j / nv;
      const e = 1e-3;
      const p = f(u, v);
      const du = f(Math.min(1, u + e), v).sub(f(Math.max(0, u - e), v));
      const dv = f(u, Math.min(1, v + e)).sub(f(u, Math.max(0, v - e)));
      const n = du.cross(dv);
      grid.push([p, n.lengthSq() > 1e-14 ? p.clone().addScaledVector(n.normalize(), t) : p.clone()]);
    }
  }
  const position = [];
  const quad = (a, b, c, d) => position.push(...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...d.toArray());
  const at = (i, j, s) => grid[j * (nu + 1) + i][s];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      quad(at(i, j, 0), at(i + 1, j, 0), at(i + 1, j + 1, 0), at(i, j + 1, 0));
      quad(at(i, j, 1), at(i, j + 1, 1), at(i + 1, j + 1, 1), at(i + 1, j, 1));
    }
  }
  for (let i = 0; i < nu; i++) quad(at(i, nv, 0), at(i + 1, nv, 0), at(i + 1, nv, 1), at(i, nv, 1));
  for (let j = 0; j < nv; j++) {
    quad(at(0, j, 0), at(0, j, 1), at(0, j + 1, 1), at(0, j + 1, 0));
    quad(at(nu, j, 0), at(nu, j + 1, 0), at(nu, j + 1, 1), at(nu, j, 1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- rocket launcher ----------

// One rod in a holder: EVA butt, reel seat and overhead reel, fore grip, a tapered blank with
// guides. base is the bottom of the holder, dir the holder axis.
function fishingRod(group, m, mats, base, dir) {
  const at = (s) => base.clone().addScaledVector(dir, s);
  const length = 1.95;
  alongY(add(group, new THREE.CylinderGeometry(0.0125, 0.0135, 0.38, 10), m.rubber), dir).position.copy(at(0.22));
  alongY(add(group, new THREE.CylinderGeometry(0.0105, 0.0115, 0.14, 10), m.rubber), dir).position.copy(at(0.48));
  alongY(add(group, new THREE.CylinderGeometry(0.0024, 0.0082, length - 0.41, 8), m.rod), dir).position.copy(at((length + 0.41) / 2));
  // Overhead reel on the upper side of the rod as it leans aft.
  const up = new THREE.Vector3().crossVectors(dir, v3(0, 0, 1)).normalize();
  const axle = new THREE.Vector3().crossVectors(up, dir).normalize();
  const centre = at(0.36).addScaledVector(up, 0.058);
  alongY(add(group, new THREE.BoxGeometry(0.016, 0.06, 0.02), mats.reel), dir).position.copy(at(0.36).addScaledVector(up, 0.018));
  for (const s of [1, -1]) {
    alongY(add(group, new THREE.CylinderGeometry(0.04, 0.04, 0.012, 18), mats.reel), axle).position.copy(centre.clone().addScaledVector(axle, s * 0.036));
  }
  alongY(add(group, new THREE.CylinderGeometry(0.031, 0.031, 0.06, 16), mats.line), axle).position.copy(centre);
  for (const s of [1, -1]) rod(group, centre.clone().addScaledVector(axle, -0.036).addScaledVector(up, 0.03).addScaledVector(dir, s * 0.02), centre.clone().addScaledVector(axle, 0.036).addScaledVector(up, 0.03).addScaledVector(dir, s * 0.02), 0.004, mats.reel, 6);
  // Crank on the right-hand side plate.
  const hub = centre.clone().addScaledVector(axle, 0.05);
  rod(group, hub, hub.clone().addScaledVector(dir, -0.05), 0.004, m.stainless, 6);
  const knob = add(group, new THREE.CylinderGeometry(0.009, 0.009, 0.02, 10), m.rubber);
  alongY(knob, axle).position.copy(hub.clone().addScaledVector(dir, -0.05).addScaledVector(axle, 0.01));
  // Guides along the blank, and the tip-top.
  for (const s of [0.78, 1.12, 1.45, length - 0.01]) {
    const r = lerp(0.008, 0.004, (s - 0.78) / (length - 0.78));
    const ring = add(group, new THREE.TorusGeometry(r, 0.0013, 4, 8), m.stainless, { cast: false });
    ring.position.copy(at(s).addScaledVector(up, r + 0.004));
    ring.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
  }
}

// Rocket launcher on a roof or T-top: a stainless bar on bolted feet, count holders leaning aft
// and fanned symmetrically outboard, a rod and reel in each. (x, y) is the mounting surface on
// the centreline; width spans the outer holders. Mounted low (y under 1.8 m, behind the leaning
// post) the bar is clamped forward to the post frame instead of standing on feet.
export function rocketLauncher(group, m, xMount, y, width, count) {
  const mats = ownMaterials();
  const onPost = y < 1.8;
  const x = onPost ? xMount - 0.04 : xMount;   // set back a little from the post's backrest
  const barY = y + (onPost ? 0.05 : 0.07);
  const half = width / 2;
  const bar0 = v3(x, barY, -half - 0.04);
  const bar1 = v3(x, barY, half + 0.04);
  rod(group, bar0, bar1, 0.016, m.stainless, 12);
  for (const end of [bar0, bar1]) {
    const cap = add(group, new THREE.SphereGeometry(0.016, 12, 8), m.stainless);
    cap.position.copy(end);
  }
  const spacing = count > 1 ? width / (count - 1) : 0;
  if (onPost) {
    // Clamped to the tops of the leaning-post frame, 0.12 m forward and 0.06 m down.
    for (const s of [1, -1]) {
      const z = s * half;
      rod(group, v3(x, barY, z), v3(xMount + 0.12, y - 0.06, z), 0.014, m.stainless);
      const clamp = add(group, new THREE.CylinderGeometry(0.026, 0.026, 0.05, 12), m.stainless);
      clamp.position.set(xMount + 0.12, y - 0.06, z);
      clamp.rotation.z = 1.1;
    }
  } else {
    const feet = count > 4 ? [-half + spacing / 2, 0, half - spacing / 2] : [-half + spacing / 2, half - spacing / 2];
    for (const z of feet) {
      rod(group, v3(x, y + 0.004, z), v3(x, barY, z), 0.015, m.stainless);
      const base = add(group, new THREE.CylinderGeometry(0.034, 0.038, 0.012, 16), m.stainless);
      base.position.set(x, y, z);
    }
  }
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0 : i / (count - 1) * 2 - 1;
    const z = f * half;
    // Outer holders lean further aft as well as further out, so the rods separate in profile.
    const lean = 0.2 + 0.2 * Math.abs(f);
    const fan = 0.2 * f;
    const dir = v3(-Math.sin(lean), Math.cos(lean) * Math.cos(fan), Math.sin(fan)).normalize();
    const base = v3(x, barY, z).addScaledVector(dir, -0.03);
    const top = base.clone().addScaledVector(dir, 0.27);
    rod(group, base, top, 0.022, m.stainless, 12);
    const lip = add(group, new THREE.TorusGeometry(0.022, 0.005, 6, 14), m.stainless);
    lip.position.copy(top);
    lip.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
    fishingRod(group, m, mats, base.clone().addScaledVector(dir, 0.03), dir);
  }
}

// ---------- nav lights ----------

// Side light on a cabin side: black housing with a chrome bezel and a coloured lens facing
// outboard (red to port, green to starboard). z is the housing centre, 12 mm off the wall.
// Nav lights should have one owner: cabin.js places these side lights and an all-round light on
// the hardtop, console.js an all-round light on the T-top; the bare centre console has none yet
// and should call bowNavLight() and allRoundLight() below.
export function navLight(group, m, x, y, z) {
  const s = Math.sign(z) || 1;
  const housing = add(group, new RoundedBoxGeometry(0.13, 0.065, 0.02, 2, 0.006), m.rubber);
  housing.position.set(x, y, z);
  box(group, m.stainless, [0.105, 0.045, 0.004], [x + 0.004, y, z + s * 0.011]);
  const lens = add(group, new RoundedBoxGeometry(0.09, 0.034, 0.012, 2, 0.005), s > 0 ? m.navGreen : m.navRed, { cast: false });
  lens.position.set(x + 0.006, y, z + s * 0.014);
}

// All-round white light on a stainless pole: base at (x, y, z), lens height above it.
export function allRoundLight(group, m, x, y, z, height = 0.42) {
  const mats = ownMaterials();
  const base = add(group, new THREE.CylinderGeometry(0.028, 0.032, 0.03, 14), m.rubber);
  base.position.set(x, y + 0.015, z);
  rod(group, v3(x, y + 0.03, z), v3(x, y + height, z), 0.011, m.stainless, 10);
  const lens = add(group, new THREE.CylinderGeometry(0.026, 0.026, 0.05, 14), mats.white, { cast: false });
  lens.position.set(x, y + height + 0.025, z);
  const cap = add(group, new THREE.SphereGeometry(0.028, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.rubber);
  cap.position.set(x, y + height + 0.05, z);
}

// Bow bicolour (red to port, green to starboard) on a short stalk, for layouts without side
// lights; (x, y) is the deck on the centreline.
export function bowNavLight(group, m, x, y) {
  rod(group, v3(x, y, 0), v3(x, y + 0.08, 0), 0.01, m.stainless, 8);
  const body = add(group, new THREE.CylinderGeometry(0.035, 0.035, 0.05, 16), m.rubber);
  body.position.set(x, y + 0.105, 0);
  for (const s of [1, -1]) {
    const lens = add(group, new THREE.CylinderGeometry(0.037, 0.037, 0.034, 12, 1, true, s > 0 ? 0 : Math.PI, Math.PI * 0.9), s > 0 ? m.navGreen : m.navRed, { cast: false });
    lens.position.set(x, y + 0.105, 0);
    lens.rotation.y = Math.PI * 0.05 - Math.PI / 2;
  }
}

// ---------- bow ----------

// The bowsprit's lines, shared by bowFittings() and bowRail(): a box-section alloy sprit on the
// foredeck, its channel floor rising with the sheer, cantilevered past the stem to a roller.
function spritLines(lines) {
  const { L } = lines;
  const deck = (x) => lines.sheer(Math.min(x / L, 0.992)) - 0.05;   // foredeck surface (cockpit.js)
  const xa = L - 0.5;           // aft end, on the foredeck
  const xe = L - 0.05;          // where the foredeck stops at the stem
  const slope = (deck(xe) - deck(xa)) / (xe - xa);
  const floor = (x) => deck(xe) + 0.06 + slope * (x - xe);   // channel floor, just above the stem head
  const xr = L + 0.33;          // bow roller axle
  const yr = floor(xr) + 0.03;
  const cheek = (x) => floor(x) + (x < xa + 0.08 ? lerp(0.0, 0.035, (x - xa) / 0.08) : x < L + 0.05 ? lerp(0.035, 0.045, (x - xa - 0.08) / (L - xa - 0.03)) : lerp(0.045, 0.09, clamp01((x - L - 0.05) / (xr - L - 0.05))));
  return { deck, xa, xe, floor, xr, yr, cheek, cz: 0.079 };
}

// Bowsprit with bow and keel rollers, plough anchor stowed over the bow roller with its chain
// running down the channel into the hawse pipe, anchor-locker hatch and bow cleat.
export function bowFittings(group, lines, m) {
  const { L } = lines;
  const mats = ownMaterials();
  const sp = spritLines(lines);
  const { deck, xa, xe, floor, xr, yr, cheek, cz } = sp;

  // Sprit body: bottom on the deck and down the stem head, top is the channel floor.
  const bottom = [...spaced(xa, xe, 6).map((x) => [x, deck(x) - 0.004]), [L + 0.005, floor(L) - 0.1], [xr - 0.12, floor(xr - 0.12) - 0.075], [xr - 0.045, floor(xr - 0.045) - 0.06]];
  add(group, extrudeProfile([...bottom, [xr - 0.045, floor(xr - 0.045)], [xa, floor(xa)]], 0.146, 0.003), m.alloy);
  // Cheek plates either side, rounded round the roller axle at the nose.
  const nose = spaced(-Math.PI / 2, Math.PI / 2, 8).map((a) => [xr + 0.06 * Math.cos(a), yr + 0.06 * Math.sin(a)]);
  const top = spaced(xr - 0.02, xa, 14).map((x) => [x, cheek(x)]);
  const cheekShape = [...bottom.slice(0, -1), [xr - 0.04, yr - 0.062], ...nose, ...top];
  for (const s of [1, -1]) add(group, extrudeProfile(cheekShape, 0.006, 0.002), m.alloy).position.z = s * cz;

  // Bow roller (V-spool) and keel roller, on through-bolted axles.
  const spool = [[0, -0.068], [0.042, -0.068], [0.042, -0.058], [0.03, -0.014], [0.027, 0], [0.03, 0.014], [0.042, 0.058], [0.042, 0.068], [0, 0.068]];
  const roller = add(group, new THREE.LatheGeometry(spool.map(([r, a]) => new THREE.Vector2(r, a)), 18), m.rubber);
  roller.position.set(xr, yr, 0);
  roller.rotation.x = Math.PI / 2;
  const xk = xr - 0.42;
  const yk = floor(xk) + 0.025;
  const keel = add(group, new THREE.CylinderGeometry(0.02, 0.02, 0.14, 14), m.rubber);
  keel.position.set(xk, yk, 0);
  keel.rotation.x = Math.PI / 2;
  for (const [x, y] of [[xr, yr], [xk, yk]]) {
    rod(group, v3(x, y, -cz - 0.012), v3(x, y, cz + 0.012), 0.008, m.stainless, 8);
    for (const s of [1, -1]) {
      const nut = add(group, new THREE.CylinderGeometry(0.013, 0.013, 0.01, 6), m.stainless);
      nut.position.set(x, y, s * (cz + 0.009));
      nut.rotation.x = Math.PI / 2;
    }
  }

  // Plough anchor: shank resting on both rollers, curving down over the bow roller to the crown;
  // the share hangs ahead of the roller, point down and back, clear of the stem.
  const t1 = v3(xr, yr + 0.042, 0);
  const t2 = v3(xk, yk + 0.02, 0);
  const e = t1.clone().sub(t2).normalize();
  const n = v3(-e.y, e.x, 0);
  const crown = v3(xr + 0.12, yr - 0.005, 0);
  const shankPath = new THREE.CatmullRomCurve3([
    t2.clone().addScaledVector(e, -0.2).addScaledVector(n, 0.016),
    t2.clone().addScaledVector(n, 0.016),
    t1.clone().addScaledVector(n, 0.02),
    v3(xr + 0.07, yr + 0.05, 0),
    crown,
  ], false, 'centripetal');
  const pts = shankPath.getPoints(24);
  const edge = (sgn) => pts.map((p, i) => {
    const q = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const hh = lerp(0.015, 0.022, i / (pts.length - 1)) * sgn;
    return [p.x - q.y * hh, p.y + q.x * hh];
  });
  add(group, extrudeProfile([...edge(1), ...edge(-1).reverse()], 0.016, 0.003), mats.anchor);
  const a = v3(-Math.sin(0.42), -Math.cos(0.42), 0);
  const fwd = v3(Math.cos(0.42), -Math.sin(0.42), 0);
  const block = add(group, new RoundedBoxGeometry(0.036, 0.05, 0.036, 2, 0.008), mats.anchor);
  block.position.copy(crown).addScaledVector(a, 0.02);
  block.rotation.z = 0.42;
  for (const s of [1, -1]) {
    const flank = slab((u, w) => {
      const half = 0.17 * (1 - u) ** 0.8 * Math.min(1, 0.55 + u * 4);
      const across = half * w;
      return crown.clone().addScaledVector(a, 0.4 * u).add(v3(0, 0, s * across)).addScaledVector(fwd, -0.7 * across ** 1.08);
    }, 10, 5, 0.007 * s);
    add(group, flank, mats.anchor);
  }

  // Shackle, chain down the channel and the hawse pipe at the aft end of the sprit.
  const shackleAt = t2.clone().addScaledVector(e, -0.215).addScaledVector(n, 0.014);
  const shackle = add(group, new THREE.TorusGeometry(0.016, 0.005, 6, 12), m.stainless);
  shackle.position.copy(shackleAt);
  const hawse = v3(xa + 0.07, floor(xa + 0.07), 0);
  const ring = add(group, new THREE.TorusGeometry(0.03, 0.006, 6, 18), m.stainless);
  ring.position.copy(hawse).add(v3(0, 0.003, 0));
  ring.rotation.x = Math.PI / 2;
  const hole = add(group, new THREE.CircleGeometry(0.026, 16), mats.hole, { cast: false });
  hole.position.copy(hawse).add(v3(0, 0.002, 0));
  hole.rotation.x = -Math.PI / 2;
  const start = shackleAt.clone().add(v3(-0.03, -0.006, 0));
  const end = hawse.clone().add(v3(0.005, -0.012, 0));
  const chainLen = start.distanceTo(end);
  const links = Math.max(3, Math.round(chainLen / 0.03));
  for (let i = 0; i < links; i++) {
    const u = (i + 0.5) / links;
    // A slight sag onto the floor before the pipe.
    const p = start.clone().lerp(end, u);
    p.y = Math.max(floor(p.x) + 0.006, p.y - Math.sin(u * Math.PI) * 0.01);
    if (i === links - 1) p.y = floor(p.x) - 0.004;
    const link = add(group, new THREE.TorusGeometry(0.011, 0.0042, 5, 12), mats.anchor);
    link.scale.set(1.5, 1, 1);
    link.position.copy(p);
    const dir = end.clone().sub(start).normalize();
    link.quaternion.setFromUnitVectors(v3(1, 0, 0), dir);
    if (i % 2) link.rotateX(Math.PI / 2);
    if (i === links - 1) link.rotateZ(-0.9);
  }

  // Horn cleat athwartships, just aft of the sprit.
  const xc = xa - 0.1;
  const yc = deck(xc);
  for (const z of [-0.04, 0.04]) rod(group, v3(xc, yc - 0.004, z), v3(xc, yc + 0.042, z * 0.9), 0.011, m.stainless, 10);
  add(group, tube([v3(xc, yc + 0.034, -0.105), v3(xc, yc + 0.046, -0.07), v3(xc, yc + 0.05, 0), v3(xc, yc + 0.046, 0.07), v3(xc, yc + 0.034, 0.105)], 0.0095, 20, 8), m.stainless);

  // Anchor-locker hatch: alloy frame and lid laid to the deck's slope, two hinges aft, flush
  // lift ring forward. It stays clear of the cleat and of the cabin or console bulkhead.
  const fwdEdge = xc - 0.07;
  const aftLimit = 0.8 * L + 0.08;
  const len = Math.min(0.4, fwdEdge - aftLimit);
  if (len > 0.2) {
    const xh = fwdEdge - len / 2;
    const yh = deck(xh);
    const tilt = Math.atan((deck(xh + 0.05) - deck(xh - 0.05)) / 0.1);
    const hatch = new THREE.Group();
    hatch.position.set(xh, yh, 0);
    hatch.rotation.z = tilt;
    const w = 0.44;
    for (const s of [1, -1]) {
      box(hatch, m.alloy, [len, 0.022, 0.02], [0, 0.007, s * (w / 2 - 0.01)]);
      box(hatch, m.alloy, [0.02, 0.022, w], [s * (len / 2 - 0.01), 0.007, 0]);
    }
    const lid = add(hatch, new RoundedBoxGeometry(len - 0.05, 0.016, w - 0.05, 2, 0.005), m.alloy);
    lid.position.y = 0.012;
    for (const z of [-0.12, 0.12]) {
      const hinge = add(hatch, new THREE.CylinderGeometry(0.008, 0.008, 0.07, 10), m.stainless);
      hinge.position.set(-len / 2 + 0.035, 0.021, z);
      hinge.rotation.x = Math.PI / 2;
      box(hatch, m.stainless, [0.04, 0.003, 0.06], [-len / 2 + 0.05, 0.0205, z]);
    }
    const recess = add(hatch, new THREE.CircleGeometry(0.03, 18), mats.hole, { cast: false });
    recess.position.set(len / 2 - 0.07, 0.0205, 0);
    recess.rotation.x = -Math.PI / 2;
    const liftRing = add(hatch, new THREE.TorusGeometry(0.022, 0.004, 6, 16), m.stainless);
    liftRing.position.set(len / 2 - 0.07, 0.022, 0);
    liftRing.rotation.x = Math.PI / 2;
    group.add(hatch);
  }
}

// Bow rail: 29 mm tube 0.42 m above the gunwale, evenly spaced stanchions on the capping, aft
// ends bent down to the capping, one clean radius round the bow and two legs welded to the
// sprit's cheek plates either side of the anchor.
export function bowRail(group, lines, m) {
  const { L, section } = lines;
  const sp = spritLines(lines);
  const h = 0.42;
  const sheer = (x) => lines.sheer(Math.min(1, x / L));
  const railY = (x) => sheer(x) + h;
  const zSide = (x) => section(x / L).hb - 0.075;
  const x0 = 0.62 * L;
  const xK = 0.9 * L;
  const xF = L + 0.1;
  const bend = 0.08;

  // Plan (x, z) to starboard: along the capping to xK, then one convex curve (a 2-D cubic
  // Hermite) leaving the capping on its own line and arriving square across the centreline
  // 0.1 m ahead of the stem, so the bow has a single clean radius with no waist.
  const plan = spaced(x0 + bend, xK, 14).map((x) => [x, zSide(x)]);
  const sK = (zSide(xK + 0.01) - zSide(xK - 0.01)) / 0.02;
  const zK = zSide(xK);
  const D = 0.6 * Math.hypot(xF - xK, zK);
  const t0 = [D / Math.hypot(1, sK), (D * sK) / Math.hypot(1, sK)];
  const hermite = (t) => {
    const h00 = 2 * t ** 3 - 3 * t * t + 1;
    const h10 = t ** 3 - 2 * t * t + t;
    const h01 = -2 * t ** 3 + 3 * t * t;
    const h11 = t ** 3 - t * t;
    return [h00 * xK + h10 * t0[0] + h01 * xF, h00 * zK + h10 * t0[1] - h11 * D];
  };
  for (let i = 1; i <= 18; i++) plan.push(hermite(i / 18));
  // Where the bow curve crosses the sprit's cheek plates (for the legs).
  let tl = 1;
  while (tl > 0 && hermite(tl)[1] < sp.cz) tl -= 0.002;
  // Aft end bent down to the capping.
  const z0 = zSide(x0);
  const leg = [v3(x0, sheer(x0) - 0.002, z0), v3(x0, sheer(x0) + 0.15, z0), ...spaced(Math.PI, Math.PI / 2, 4).map((a) => v3(x0 + bend + bend * Math.cos(a), railY(x0 + bend) - bend + bend * Math.sin(a), z0))];
  leg.pop();
  const starboard = [...leg, ...plan.map(([x, z]) => v3(x, railY(x), z))];
  const port = starboard.map((p) => v3(p.x, p.y, -p.z)).reverse().slice(1);
  add(group, tube([...starboard, ...port], TUBE, 320, 10), m.stainless);

  // Stanchions at even spacing between the aft leg and the start of the bow blend.
  const n = Math.max(2, Math.round((xK - x0) / 0.6));
  for (let i = 1; i <= n; i++) {
    const x = x0 + ((xK - x0) * i) / n;
    for (const s of [1, -1]) {
      rod(group, v3(x, sheer(x) - 0.002, s * zSide(x)), v3(x, railY(x), s * zSide(x)), TUBE, m.stainless, 10);
      const foot = add(group, new THREE.CylinderGeometry(TUBE + 0.002, TUBE + 0.007, 0.02, 12), m.stainless);
      foot.position.set(x, sheer(x) + 0.008, s * zSide(x));
    }
  }
  for (const s of [1, -1]) {
    const foot = add(group, new THREE.CylinderGeometry(TUBE + 0.002, TUBE + 0.007, 0.02, 12), m.stainless);
    foot.position.set(x0, sheer(x0) + 0.008, s * z0);
  }
  // Legs welded to the cheek plates, where the bow radius passes over them.
  const xl = hermite(tl)[0];
  for (const s of [1, -1]) rod(group, v3(xl, sp.cheek(xl) - 0.008, s * sp.cz), v3(xl, railY(xl), s * sp.cz), TUBE, m.stainless, 10);
}

// ---------- underwater lights ----------

// Surface-mount LED lights on the aft faces of the boarding pods, low enough to stay under the
// static waterline (about 0.22 m above the keel datum at the transom). Anchors from cockpit().
export function underwaterLights(group, m, { zi, platY, bottomAt, aft }) {
  const leds = [];
  const faceX = aft - 0.012;     // the pods' aft faces, bevel included
  for (const side of [-1, 1]) {
    const z = side * (zi + 0.14);
    const y = Math.min(platY - 0.1, bottomAt(zi + 0.14) + 0.1);
    const bezel = add(group, new THREE.CylinderGeometry(0.056, 0.06, 0.014, 24), m.stainless);
    bezel.position.set(faceX - 0.007, y, z);
    bezel.rotation.z = Math.PI / 2;
    const lamp = add(group, new THREE.CircleGeometry(0.044, 24), m.led, { cast: false });
    lamp.position.set(faceX - 0.0145, y, z);
    lamp.rotation.y = -Math.PI / 2;
    leds.push(lamp.position.clone());
  }
  return leds;
}
