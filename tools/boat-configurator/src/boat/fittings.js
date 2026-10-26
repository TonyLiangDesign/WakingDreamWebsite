import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { add, tube, rod, box, loft, spaced, v3, lerp, clamp01 } from './kit.js';
import { DECK_Y } from './hull.js';

// Deck fittings: rocket launcher and rods, nav lights, bowsprit with rollers and plough anchor,
// chain into the hawse pipe, anchor-locker hatch, bow cleat, bow eye, bow rail, and the
// underwater lights. Each builds into the group it is given; underwaterLights() also returns
// the two lamp positions (boat-local) for the water glow, which has exactly two slots.
// fittings.js owns the light geometry; cabin.js and console.js place navLight(), allRoundLight()
// and bowNavLight(). bowEyePoint(lines) gives the trailer strap's hook point on the bow eye.

const TUBE = 0.0145;  // 29 mm stainless tube for the bow rail, its stanchions and legs

// Part-specific materials, built once.
const own = {};
function ownMaterials() {
  if (!own.line) {
    own.line = new THREE.MeshStandardMaterial({ color: '#c8b45a', roughness: 0.6 });
    own.reel = new THREE.MeshStandardMaterial({ color: '#2a2d31', metalness: 0.6, roughness: 0.35 });
    // Polished stainless anchor, so it reads against the satin alloy sprit.
    own.anchor = new THREE.MeshStandardMaterial({ color: '#d9dcde', metalness: 1, roughness: 0.2 });
    // Clear-anodised, brushed alloy for the bowsprit (the brushed roughness map is set per build).
    own.sprit = new THREE.MeshPhysicalMaterial({ color: '#b4babf', metalness: 0.85, roughness: 0.3, clearcoat: 0.2, clearcoatRoughness: 0.3 });
    own.white = new THREE.MeshStandardMaterial({ color: '#f2f2ee', emissive: '#fff8e8', emissiveIntensity: 0.5, roughness: 0.15 });
    own.hole = new THREE.MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.95 });
    own.blank = blankMaterial();
    for (const mat of Object.values(own)) mat.userData.shared = true;
  }
  return own;
}

// Rod blanks taper to a 5 mm tip, well under a pixel at hero distance, where they would break
// up into dots. This material keeps every blank at least about one CSS pixel wide: the vertex
// shader pushes each vertex out along its normal by half a pixel's worth of view-space length
// at its depth. Close up the push is a fraction of a millimetre, so the real taper shows.
function blankMaterial() {
  const halfHeight = { value: 450 };
  const size = new THREE.Vector2();
  const mat = new THREE.MeshStandardMaterial({ color: '#16181a', roughness: 0.35 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHalfHeight = halfHeight;
    shader.vertexShader = `uniform float uHalfHeight;\n${shader.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
      float pixel = -mvPosition.z / ( projectionMatrix[ 1 ][ 1 ] * uHalfHeight );
      mvPosition.xyz += normalize( normalMatrix * objectNormal ) * pixel * 0.5;
      gl_Position = projectionMatrix * mvPosition;`)}`;
  };
  mat.customProgramCacheKey = () => 'rod-blank-min-width';
  mat.onBeforeRender = (renderer) => { halfHeight.value = renderer.getSize(size).y / 2 || 450; };
  return mat;
}

// Orients a mesh's local y axis along dir.
function alongY(mesh, dir) {
  mesh.quaternion.setFromUnitVectors(v3(0, 1, 0), dir.clone().normalize());
  return mesh;
}

// ---------- rocket launcher ----------

// One rod in a holder: EVA butt, reel seat and overhead reel, fore grip, a tapered blank with
// guides. base is the bottom of the holder, dir the holder axis.
function fishingRod(group, m, mats, base, dir) {
  const at = (s) => base.clone().addScaledVector(dir, s);
  const length = 1.95;
  alongY(add(group, new THREE.CylinderGeometry(0.0125, 0.0135, 0.38, 10), m.rubber), dir).position.copy(at(0.22));
  alongY(add(group, new THREE.CylinderGeometry(0.0105, 0.0115, 0.14, 10), m.rubber), dir).position.copy(at(0.48));
  alongY(add(group, new THREE.CylinderGeometry(0.0024, 0.0082, length - 0.41, 8), mats.blank), dir).position.copy(at((length + 0.41) / 2));
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

// Rocket launcher: count holders leaning aft and fanned symmetrically outboard, a rod and reel
// in each, on a stainless bar. (x, y) is where the bar is seated on the centreline:
//  - on a hardtop roof or T-top canopy, the tops of the layout's stand-offs: the bar rests on y,
//    and bolted feet drop from it to whatever surface lies below (found by a downward ray
//    against what the layout has already built), so it never floats on a crowned roof;
//  - behind the leaning post (y less than 1.6 m above the cockpit floor; the post rail is at
//    DECK_Y + 1.26, roofs and canopies at DECK_Y + 2 or more), the centre of the post's own
//    top rail: the holders are welded to that rail inside its uprights, with no second bar.
// width spans the outer holders.
const seatRay = new THREE.Raycaster();
export function rocketLauncher(group, m, x, y, width, count) {
  const mats = ownMaterials();
  const onPost = y < DECK_Y + 1.6;
  const barY = onPost ? y : y + 0.016;
  const half = onPost ? Math.min(width, 0.5) / 2 : width / 2;
  const spacing = count > 1 ? (half * 2) / (count - 1) : 0;
  if (!onPost) {
    // Feet first, against the layout's surfaces only.
    group.updateMatrixWorld(true);
    const surfaces = group.children.filter((c) => c.isMesh);
    const feet = count > 4 ? [-half + spacing / 2, 0, half - spacing / 2] : [-half + spacing / 2, half - spacing / 2];
    for (const z of feet) {
      seatRay.set(v3(x, barY, z), v3(0, -1, 0));
      seatRay.far = 0.4;
      const hit = seatRay.intersectObjects(surfaces, false)[0];
      const foot = hit ? hit.point.y : y - 0.06;
      if (barY - foot < 0.025) continue;
      rod(group, v3(x, foot + 0.004, z), v3(x, barY, z), 0.015, m.stainless);
      const base = add(group, new THREE.CylinderGeometry(0.034, 0.038, 0.012, 16), m.stainless);
      base.position.set(x, foot + 0.004, z);
    }
    const bar0 = v3(x, barY, -half - 0.04);
    const bar1 = v3(x, barY, half + 0.04);
    rod(group, bar0, bar1, 0.016, m.stainless, 12);
    for (const end of [bar0, bar1]) {
      const cap = add(group, new THREE.SphereGeometry(0.016, 12, 8), m.stainless);
      cap.position.copy(end);
    }
  }
  for (let i = 0; i < count; i++) {
    const f = count === 1 ? 0 : i / (count - 1) * 2 - 1;
    const z = f * half;
    // Outer holders lean further aft as well as further out, so the rods separate in profile.
    const lean = 0.2 + 0.2 * Math.abs(f);
    const fan = 0.2 * f;
    const dir = v3(-Math.sin(lean), Math.cos(lean) * Math.cos(fan), Math.sin(fan)).normalize();
    const base = v3(x, barY, z).addScaledVector(dir, onPost ? -0.02 : -0.03);
    const top = base.clone().addScaledVector(dir, 0.27);
    rod(group, base, top, 0.022, m.stainless, 12);
    const lip = add(group, new THREE.TorusGeometry(0.022, 0.005, 6, 14), m.stainless);
    lip.position.copy(top);
    lip.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
    fishingRod(group, m, mats, base.clone().addScaledVector(dir, onPost ? 0.02 : 0.03), dir);
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

// Extrusion of an [x, y] outline across z with rounded edges: the bevel is inset so the outline
// keeps its size, and the normals are creased so the rounds shade smoothly and flats stay flat.
function rounded(points, depth, bevel, segments = 3) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const core = Math.max(0.0005, depth - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, { depth: core, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: segments, curveSegments: 8 });
  g.translate(0, 0, -core / 2);
  return toCreasedNormals(g, 0.75);
}

// Smooth [x, y] polyline through control points.
const spline = (pts, n) => new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(n).map((p) => [p.x, p.y]);

// Linear lookup of y at x along a polyline sampled in x (either direction).
function yOnLine(line, x) {
  const pts = line[0][0] <= line[line.length - 1][0] ? line : [...line].reverse();
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (x - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0] || 1));
  return pts[pts.length - 1][1];
}

// The bowsprit's lines, shared by bowFittings() and bowRail(): a box-section alloy sprit on the
// foredeck, its channel floor rising with the sheer just clear of the stem head, cantilevered
// past the raked stem to the bow roller. Its underside follows the deck, then the stem bar's
// leading edge (lines.stemX) down to its lowest point, then sweeps forward to the roller.
function spritLines(lines) {
  const { L } = lines;
  const deck = (x) => lines.sheer(Math.min(x / L, 0.992)) - 0.05;   // foredeck surface (cockpit.js)
  const stemX = lines.stemX || (() => L);
  const xa = L - 0.5;           // aft end, on the foredeck
  const xe = L - 0.05;          // where the foredeck stops at the stem head
  const slope = (deck(xe) - deck(xa)) / (xe - xa);
  const floor = (x) => Math.max(deck(xe), lines.sheer(1)) + 0.012 + slope * (x - L);   // channel floor
  const xr = L + 0.34;          // bow roller axle
  const yr = floor(xr) + 0.03;
  const rn = 0.066;             // cheek radius round the axle
  // Underside: on the deck, down the stem bar to the low point, forward to the nose.
  const yl = floor(L) - 0.11;
  const stemDown = spaced(deck(xe), yl, 3).map((y) => [Math.min(xe, stemX(y) - 0.012), y]);
  const forward = spline([stemDown[stemDown.length - 1], [L + 0.12, floor(L + 0.12) - 0.096], [xr - 0.09, yr - rn - 0.008], [xr - 0.02, yr - rn + 0.002]], 10).slice(1);
  const bottom = [...spaced(xa + 0.02, xe, 6).map((x) => [x, deck(x) - 0.004]), ...stemDown.slice(1), ...forward];
  // Cheek top: a shallow S from the tapered aft end up to the rounded nose.
  const top = spline([[xr, yr + rn], [xr - 0.1, floor(xr - 0.1) + 0.074], [L + 0.02, floor(L + 0.02) + 0.05], [L - 0.24, floor(L - 0.24) + 0.032], [xa + 0.1, floor(xa + 0.1) + 0.036], [xa + 0.03, floor(xa) + 0.012]], 24);
  const cheek = (x) => yOnLine(top, x);
  return { deck, xa, xe, floor, xr, yr, rn, bottom, top, cheek, cz: 0.079 };
}

// Geometry from positions (indexed or not), normals computed, front faces turned along out.
function facingGeometry(position, index, out) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  if (index) g.setIndex(index);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  let dot = 0;
  for (let i = 0; i < n.count; i++) dot += n.getX(i) * out.x + n.getY(i) * out.y + n.getZ(i) * out.z;
  if (dot < 0) {
    if (index) {
      for (let k = 0; k < index.length; k += 3) [index[k + 1], index[k + 2]] = [index[k + 2], index[k + 1]];
      g.setIndex(index);
    } else {
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k += 3) {
        const t = [p.getX(k + 1), p.getY(k + 1), p.getZ(k + 1)];
        p.setXYZ(k + 1, p.getX(k + 2), p.getY(k + 2), p.getZ(k + 2));
        p.setXYZ(k + 2, ...t);
      }
    }
    g.computeVertexNormals();
  }
  return g;
}

// Plough share: two curved flukes meeting in a crisp ridge on the convex (forward) face, a hollow
// on the face towards the shank, wings swept back from a rounded heel and a thickened, weighted
// toe drawn to a point. C is the heel at the crown, a runs to the toe, fwd is the convex side.
// Each fluke is its own smooth sheet, so the ridge and the plate edges stay crisp.
function ploughShare(group, mat, C, a, fwd) {
  const z = v3(0, 0, 1);
  const len = 0.42;
  const sm = (e0, e1, x) => { const u = clamp01((x - e0) / (e1 - e0)); return u * u * (3 - 2 * u); };
  const W = (u) => 0.165 * (1 - u) ** 0.72 * Math.min(1, 0.62 + 3.2 * u) + 0.003;
  const D = (u) => 0.075 * (1 - u) ** 0.55 + 0.008;
  const T = (u, s) => (lerp(0.017, 0.006, s ** 0.8) + 0.026 * sm(0.62, 0.95, u) * (1 - s) ** 1.5) * (1 - 0.65 * sm(0.94, 1, u));
  const outer = (u, s, side) => C.clone().addScaledVector(a, len * u).addScaledVector(z, side * s * W(u))
    .addScaledVector(fwd, -D(u) * (1 - (1 - s) ** 1.3) + 0.02 * sm(0.72, 1, u) * (1 - s));
  const inner = (u, s, side) => outer(u, s, side).addScaledVector(fwd, -T(u, s));
  const nu = 18;
  const ns = 10;
  const sheet = (f, out) => {
    const position = [];
    const index = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= ns; j++) position.push(...f(i / nu, j / ns).toArray());
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < ns; j++) {
        const p = i * (ns + 1) + j;
        index.push(p, p + ns + 1, p + 1, p + 1, p + ns + 1, p + ns + 2);
      }
    }
    return facingGeometry(position, index, out);
  };
  // Flat-shaded rim between two matching edges.
  const rim = (A, B, out) => {
    const position = [];
    for (let i = 0; i < A.length - 1; i++) position.push(...A[i].toArray(), ...A[i + 1].toArray(), ...B[i + 1].toArray(), ...A[i].toArray(), ...B[i + 1].toArray(), ...B[i].toArray());
    return facingGeometry(position, null, out);
  };
  const us = spaced(0, 1, nu);
  const ss = spaced(0, 1, ns);
  for (const side of [1, -1]) {
    add(group, sheet((u, s) => outer(u, s, side), fwd.clone().addScaledVector(z, side * 0.3)), mat);
    add(group, sheet((u, s) => inner(u, s, side), fwd.clone().negate()), mat);
    add(group, rim(us.map((u) => outer(u, 1, side)), us.map((u) => inner(u, 1, side)), z.clone().multiplyScalar(side)), mat);
    add(group, rim(ss.map((s) => outer(0, s, side)), ss.map((s) => inner(0, s, side)), a.clone().negate()), mat);
    add(group, rim(ss.map((s) => outer(1, s, side)), ss.map((s) => inner(1, s, side)), a), mat);
  }
}

// ---------- bow eye ----------

// The bow eye's frame on the stem: P on the stem bar's leading edge (lines.stemX) 0.35 m above
// the keel line at the forefoot, T up the raked stem, N forward and square to it.
function bowEyeFrame(lines) {
  const y = lines.keel(0) + 0.35;
  const stemX = lines.stemX || (() => lines.L);
  const T = v3(stemX(y + 0.02) - stemX(y - 0.02), 0.04, 0).normalize();
  const N = v3(T.y, -T.x, 0);
  return { P: v3(stemX(y), y, 0), T, N };
}

// Where the trailer's winch strap hooks on: the inside of the bow eye's loop, boat-local.
export function bowEyePoint(lines) {
  const { P, N } = bowEyeFrame(lines);
  return P.clone().addScaledVector(N, 0.056);
}

// Stainless U-bolt bow eye through the stem: a saddle plate on the stem bar, two legs one above
// the other along the stem, and the loop standing out square to the stem in the centre plane.
function bowEye(group, lines, m) {
  const { P, T, N } = bowEyeFrame(lines);
  const plate = add(group, new RoundedBoxGeometry(0.008, 0.1, 0.044, 2, 0.003), m.stainless);
  plate.position.copy(P).addScaledVector(N, 0.002);
  plate.quaternion.setFromUnitVectors(v3(0, 1, 0), T);
  const leg = 0.032;
  const r = 0.024;
  const loop = [
    P.clone().addScaledVector(T, -r),
    P.clone().addScaledVector(T, -r).addScaledVector(N, leg),
    ...spaced(Math.PI, 0, 8).map((a) => P.clone().addScaledVector(N, leg + r * Math.sin(a)).addScaledVector(T, r * Math.cos(a))).slice(1, -1),
    P.clone().addScaledVector(T, r).addScaledVector(N, leg),
    P.clone().addScaledVector(T, r),
  ];
  add(group, tube(loop, 0.0065, 28, 8), m.stainless);
  for (const s of [-1, 1]) {
    const nut = add(group, new THREE.CylinderGeometry(0.011, 0.011, 0.008, 6), m.stainless);
    nut.position.copy(P).addScaledVector(T, s * r).addScaledVector(N, 0.009);
    nut.quaternion.setFromUnitVectors(v3(0, 1, 0), N);
  }
}

// Bowsprit with bow and keel rollers, plough anchor stowed over the bow roller with its chain
// running down the channel into the hawse pipe, anchor-locker hatch, bow cleat and bow eye.
export function bowFittings(group, lines, m) {
  const { L } = lines;
  const mats = ownMaterials();
  mats.sprit.roughnessMap = m.alloy.roughnessMap || null;
  const sp = spritLines(lines);
  const { deck, xa, floor, xr, yr, rn, bottom, top, cz } = sp;
  bowEye(group, lines, m);

  // Sprit body between the cheeks: the box under the channel floor, its aft end chamfered down
  // to the deck and its forward end closed under the roller by a curved fairing plate.
  const xn = xr - 0.058;
  const bodyBottom = bottom.filter(([x]) => x < xn).map(([x, y]) => [x, y + 0.006]);
  const body = [...bodyBottom, [xn, yOnLine(bottom, xn) + 0.006], [xn, floor(xn) - 0.004], [xa + 0.1, floor(xa + 0.1) - 0.004], [xa + 0.035, deck(xa) + 0.026]];
  add(group, rounded(body, 0.148, 0.006), mats.sprit);
  const fairing = [...spaced(-2.9, -0.14, 12).map((t) => [xr + 0.057 * Math.cos(t), yr + 0.057 * Math.sin(t)]), ...spaced(-0.14, -2.9, 12).map((t) => [xr + 0.05 * Math.cos(t), yr + 0.05 * Math.sin(t)])];
  add(group, rounded(fairing, 0.148, 0.0025, 2), mats.sprit);
  // Cheek plates: profiled outline, rounded round the axle at the nose, edges radiused.
  const nose = spaced(-1.95, Math.PI / 2, 12).map((t) => [xr + rn * Math.cos(t), yr + rn * Math.sin(t)]);
  const cheekShape = [...bottom, ...nose, ...top.slice(1)];
  for (const s of [1, -1]) add(group, rounded(cheekShape, 0.01, 0.0035), mats.sprit).position.z = s * cz;

  // Bow roller (V-spool) and keel roller, on through-bolted axles.
  const spool = [[0, -0.068], [0.042, -0.068], [0.042, -0.058], [0.03, -0.014], [0.027, 0], [0.03, 0.014], [0.042, 0.058], [0.042, 0.068], [0, 0.068]];
  const roller = add(group, new THREE.LatheGeometry(spool.map(([r, q]) => new THREE.Vector2(r, q)), 18), m.rubber);
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
      nut.position.set(x, y, s * (cz + 0.01));
      nut.rotation.x = Math.PI / 2;
    }
  }

  // Plough anchor: a forged shank resting on both rollers, deepening and thinning towards the
  // crown as it curves down over the bow roller, a crown boss with its pin, and the share
  // hanging ahead of the roller with its toe down and back, clear of the stem.
  const t1 = v3(xr, yr + 0.042, 0);
  const t2 = v3(xk, yk + 0.02, 0);
  const e = t1.clone().sub(t2).normalize();
  const n = v3(-e.y, e.x, 0);
  const crown = v3(xr + 0.14, yr - 0.01, 0);
  const shankPath = new THREE.CatmullRomCurve3([
    t2.clone().addScaledVector(e, -0.2).addScaledVector(n, 0.016),
    t2.clone().addScaledVector(n, 0.017),
    t1.clone().addScaledVector(n, 0.021),
    v3(xr + 0.085, yr + 0.047, 0),
    crown,
  ], false, 'centripetal');
  const rings = spaced(0, 1, 30).map((u) => {
    const p = shankPath.getPointAt(u);
    const t = shankPath.getTangentAt(u);
    const nn = v3(-t.y, t.x, 0).normalize();
    const h = lerp(0.016, 0.025, u ** 1.6);     // section depth grows into the bend
    const w = lerp(0.0125, 0.0085, u);          // thickness tapers to the crown
    return Array.from({ length: 16 }, (_, j) => {
      const ang = (j / 16) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      return p.clone().addScaledVector(nn, h * Math.sign(s) * Math.abs(s) ** 0.5).addScaledVector(v3(0, 0, 1), w * Math.sign(c) * Math.abs(c) ** 0.5);
    });
  });
  add(group, loft(rings), mats.anchor);
  const a = v3(-Math.sin(0.42), -Math.cos(0.42), 0);
  const fwd = v3(Math.cos(0.42), -Math.sin(0.42), 0);
  const boss = add(group, new THREE.CylinderGeometry(0.019, 0.019, 0.064, 18), mats.anchor);
  boss.position.copy(crown).addScaledVector(fwd, -0.014).addScaledVector(a, 0.03);
  boss.rotation.x = Math.PI / 2;
  const pin = add(group, new THREE.CylinderGeometry(0.009, 0.009, 0.078, 10), m.galv);
  pin.position.copy(boss.position);
  pin.rotation.x = Math.PI / 2;
  ploughShare(group, mats.anchor, crown, a, fwd);

  // Shackle, chain down the channel and the hawse pipe near the aft end of the sprit.
  const shackleAt = t2.clone().addScaledVector(e, -0.215).addScaledVector(n, 0.014);
  const shackle = add(group, new THREE.TorusGeometry(0.016, 0.005, 6, 12), m.stainless);
  shackle.position.copy(shackleAt);
  const hawse = v3(xa + 0.14, floor(xa + 0.14), 0);
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
  const aftLimit = 0.8 * L + 0.1;     // clear of the bow bicolour console.js puts at 0.8 L + 0.04
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
  const x0 = 0.75 * L;         // aft end just ahead of the hardtop front (0.72 L plus its raked centre panel)
  const xK = 0.92 * L;
  const xF = L + 0.1;
  const bend = 0.08;

  // Plan (x, z) to starboard: along the capping to xK, then one convex curve (a 2-D cubic
  // Hermite) leaving the capping on its own line and arriving square across the centreline
  // 0.1 m ahead of the stem, so the bow has a single clean radius with no waist.
  const plan = spaced(x0 + bend, xK, 14).map((x) => [x, zSide(x)]);
  const sK = (zSide(xK + 0.01) - zSide(xK - 0.01)) / 0.02;
  const zK = zSide(xK);
  const D = 0.45 * Math.hypot(xF - xK, zK);
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

// Surface-mount LED lights in stainless bezels on the aft face of the engine pod, either side of
// the leg(s) and low on the vee: with the hull's chine only about 5 cm under the static
// waterline at the transom (about y = 0.22 there), the boarding pods are too shallow to keep a
// lamp submerged, so the lights sit where the pod is deepest. Single engine: 0.25 m either side
// of the centreline, outboard of the stern brackets. Twin: 0.13 m either side of the centreline,
// between the two legs. Anchors come from cockpit(); exactly two lamps for the water glow.
export function underwaterLights(group, m, { podHalf, bottomAt, aft }) {
  const leds = [];
  const faceX = aft - 0.012;     // the pod's aft face, bevel included
  const zl = podHalf > 0.5 ? 0.13 : Math.min(0.25, podHalf - 0.15);
  for (const side of [-1, 1]) {
    const z = side * zl;
    const y = Math.min(0.1, bottomAt(zl) + 0.12);
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
