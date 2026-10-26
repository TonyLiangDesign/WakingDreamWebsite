import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { resolve } from './config.js';
import { letteringColour } from './materials.js';

// Boat-local coordinates: x runs from the transom (0) to the bow (L), y is up with the
// waterline at 0, z is to starboard. Every part is procedural, so a change rebuilds in milliseconds.
// The Harbour is a generic NZ plate-alloy trailer boat: deep vee, reverse chine, walkaround hardtop.

export const DECK_Y = 0.16;
const CAP = 0.13;               // gunwale capping width
const KEEL_BAR = 0.035;         // depth of the keel bar below the bottom plates
const POD = 0.5;                // boarding pods and engine bracket, aft of the transom
const SIDE_DECK = 0.27;         // walkaround width, capping included
export const TRAILER_LIFT = 1.08;
export const CRADLE_LIFT = 0.8;

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp;
const clamp01 = (u) => Math.min(1, Math.max(0, u));

function add(group, geometry, material, { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  group.add(mesh);
  return mesh;
}

function tube(points, radius, segments = 64, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : v3(...p))), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, segments, radius, radial, closed);
}

function rod(group, a, b, radius, material, radialSegments = 10) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const mesh = add(group, new THREE.CylinderGeometry(radius, radius, dir.length(), radialSegments), material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(v3(0, 1, 0), dir.normalize());
  return mesh;
}

function box(group, material, [sx, sy, sz], [x, y, z], opts) {
  const mesh = add(group, new THREE.BoxGeometry(sx, sy, sz), material, opts);
  mesh.position.set(x, y, z);
  return mesh;
}

function extrudeProfile(points, depth, bevel = 0.025) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Flat face in the y-z plane at x, from a polygon of [z, y] points.
function crossSection(points, x) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y))));
  g.rotateY(Math.PI / 2);
  g.translate(x, 0, 0);
  return g;
}

// Strip surface through matching profiles at successive stations, mirrored to port.
// Repeat a profile point to get a crisp crease there.
function ribbon(stations, mirror = true) {
  const cols = stations[0].pts.length;
  const position = [];
  const uv = [];
  const index = [];
  for (const side of mirror ? [1, -1] : [1]) {
    const base = position.length / 3;
    for (const st of stations) {
      let run = 0;
      st.pts.forEach(([z, y], j) => {
        if (j > 0) run += Math.hypot(z - st.pts[j - 1][0], y - st.pts[j - 1][1]);
        position.push(st.x, y, z * side);
        uv.push(st.x * 0.5, run * 0.5);
      });
    }
    for (let i = 0; i < stations.length - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = base + i * cols + j;
        const b = a + cols;
        if (side > 0) index.push(a, b, a + 1, b, b + 1, a + 1);
        else index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Closed skin through rings of equal point count, capped at both ends, wound outward.
function loft(rings) {
  const n = rings[0].length;
  const position = [];
  const uv = [];
  rings.forEach((ring, i) => ring.forEach((p, j) => { position.push(p.x, p.y, p.z); uv.push(j / n, i / (rings.length - 1)); }));
  const centre = (ring) => ring.reduce((c, p) => c.add(p), v3(0, 0, 0)).multiplyScalar(1 / ring.length);
  const c0 = centre(rings[0]);
  const c1 = centre(rings[rings.length - 1]);
  const s0 = position.length / 3;
  position.push(c0.x, c0.y, c0.z, c1.x, c1.y, c1.z);
  uv.push(0.5, 0, 0.5, 1);
  const index = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j;
      const b = (i + 1) * n + j;
      const c = i * n + ((j + 1) % n);
      const d = (i + 1) * n + ((j + 1) % n);
      index.push(a, c, d, a, d, b);
    }
  }
  const last = (rings.length - 1) * n;
  for (let j = 0; j < n; j++) {
    index.push(s0, (j + 1) % n, j);
    index.push(s0 + 1, last + j, last + ((j + 1) % n));
  }
  // Flip the whole skin if the first face points into the shape.
  const mid = Math.floor(rings.length / 2);
  const p = rings[mid][0];
  const q = rings[mid][1 % n];
  const r = rings[mid + 1 < rings.length ? mid + 1 : mid - 1][0];
  const normal = new THREE.Vector3().subVectors(q, p).cross(new THREE.Vector3().subVectors(r, p));
  if (mid + 1 >= rings.length) normal.negate();
  if (normal.dot(new THREE.Vector3().subVectors(p, centre(rings[mid]))) < 0) {
    for (let k = 0; k < index.length; k += 3) [index[k + 1], index[k + 2]] = [index[k + 2], index[k + 1]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Superellipse ring in the y-z plane at x: a rounded box section.
function sectionRing(x, y0, hh, hw, p = 2.8, n = 28) {
  return Array.from({ length: n }, (_, j) => {
    const a = (j / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return v3(x, y0 + hh * Math.sign(s) * Math.abs(s) ** (2 / p), hw * Math.sign(c) * Math.abs(c) ** (2 / p));
  });
}

const spaced = (t0, t1, n, ease = (u) => u) => Array.from({ length: n + 1 }, (_, i) => lerp(t0, t1, ease(i / n)));

// ---------- hull lines ----------

export function hullLines(model) {
  const L = model.length;
  const B = model.beam;
  const k = L / 6.2;
  const halfBeam = (t) => (t < 0.5 ? (B / 2) * (0.97 + 0.06 * t) : (B / 2) * Math.pow(Math.max(0, 1 - ((t - 0.5) / 0.5) ** 2), 0.6));
  const keel = (t) => (t < 0.55 ? -0.3 : -0.3 + 0.78 * Math.pow((t - 0.55) / 0.45, 2.1));
  const sheer = (t) => 0.62 + 0.04 * k + 0.34 * Math.pow(t, 2.4);
  // About 20 degrees at the transom, sharpening to a fine entry at the bow.
  const deadrise = (t) => THREE.MathUtils.degToRad(20 + 24 * Math.pow(Math.max(0, (t - 0.3) / 0.7), 1.5));
  function section(t) {
    const hb = halfBeam(t);
    const yk = keel(t);
    const ys = sheer(t);
    const dr = deadrise(t);
    const fade = Math.min(1, hb / 0.5);
    // Reverse chine: a flat shelf, turned down a touch at its outer edge.
    const zf = hb - 0.03 * fade;
    const zc = Math.max(0, zf - 0.11 * fade);
    const yc = Math.min(yk + Math.tan(dr) * zc, ys - 0.22 * (1 - 0.6 * t));
    const yf = yc - 0.018 * fade;
    // Knuckle: the topsides plate breaks a little above halfway, upper panel flared out.
    const yn = lerp(yf, ys, 0.52);
    const zn = hb - 0.022 * fade;
    return { t, x: t * L, hb, yk, ys, dr, zc, yc, zf, yf, zn, yn, inner: Math.max(0, hb - CAP) };
  }
  // Half-width of the V bottom at height y, used for the cockpit floor and the waterline.
  const bottomZ = (s, y) => (y <= s.yk ? 0 : y >= s.yc ? s.zc : (s.zc * (y - s.yk)) / (s.yc - s.yk));
  // Half-width of the topsides at height y.
  const sideZ = (s, y) => (y <= s.yn ? lerp(s.zf, s.zn, clamp01((y - s.yf) / (s.yn - s.yf))) : lerp(s.zn, s.hb, clamp01((y - s.yn) / (s.ys - s.yn))));
  return { L, B, halfBeam, keel, sheer, section, bottomZ, sideZ };
}

// ---------- decal ----------

function nameTexture(name, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colour;
  ctx.font = 'italic 600 118px Montserrat, "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  const [series, number] = name.split(' ');
  ctx.fillText(series.toUpperCase(), 20, 100);
  const w = ctx.measureText(series.toUpperCase()).width;
  ctx.font = 'italic 400 118px Montserrat, "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(number, 20 + w + 34, 100);
  ctx.fillRect(20, 168, 980, 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function nameDecal(group, lines, name, colour) {
  const texture = nameTexture(name, colour);
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
  const t0 = 0.48;
  const t1 = 0.69;
  for (const side of [1, -1]) {
    const position = [];
    const uv = [];
    const index = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const s = lines.section(lerp(t0, t1, i / n));
      for (const [j, f] of [0.14, 0.86].entries()) {
        // Upper topsides panel, between the knuckle and the rubbing strake, 4 mm proud of the paint.
        const y = lerp(s.yn, s.ys - 0.06, f);
        position.push(s.x, y, (lines.sideZ(s, y) + 0.004) * side);
        uv.push(side > 0 ? i / n : 1 - i / n, j);
      }
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      if (side > 0) index.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
      else index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    add(group, g, material, { cast: false });
  }
}

// ---------- hull ----------

function hull(group, lines, m, build, twin) {
  const { L, section } = lines;
  const skin = spaced(0, 1, 80, (u) => Math.sin((u * Math.PI) / 2)).map(section);

  // Bottom plates, reverse-chine shelf, then the topsides in two panels either side of the knuckle.
  add(group, ribbon(skin.map((s) => ({ x: s.x, pts: [[0, s.yk], [s.zc * 0.5, lerp(s.yk, s.yc, 0.5)], [s.zc, s.yc]] }))), m.alloy);
  add(group, ribbon(skin.map((s) => ({ x: s.x, pts: [[s.zc, s.yc], [s.zf, s.yf]] }))), m.alloy);
  add(group, ribbon(skin.map((s) => ({ x: s.x, pts: [[s.zf, s.yf], [s.zn, s.yn]] }))), m.paint);
  add(group, ribbon(skin.map((s) => ({ x: s.x, pts: [[s.zn, s.yn], [s.hb, s.ys]] }))), m.paint);

  // Lifting strakes: flat underside, near-vertical outer face.
  for (const f of [0.38, 0.7]) {
    const strake = spaced(0, 0.86, 40).map(section).map((s) => {
      const taper = Math.min(1, (0.9 - s.t) / 0.14) * 0.045;
      const a = [s.zc * f, lerp(s.yk, s.yc, f)];
      const d = new THREE.Vector2(s.zc, s.yc - s.yk).normalize();
      const c = [a[0] + d.x * taper, a[1] + d.y * taper];
      const b = [c[0], a[1] - 0.002];
      return { x: s.x, pts: [a, b, b, c] };
    });
    add(group, ribbon(strake), m.alloy);
  }

  // Weld beads along the chine and the knuckle, keel bar and stem band.
  for (const side of [1, -1]) {
    const chine = spaced(0, 0.97, 40).map(section).map((s) => v3(s.x, s.yf, side * (s.zf + 0.002)));
    add(group, tube(chine, 0.007, 120, 5), m.alloy, { cast: false });
    const knuckle = spaced(0, 0.985, 40).map(section).map((s) => v3(s.x, s.yn, side * (s.zn + 0.001)));
    add(group, tube(knuckle, 0.005, 120, 5), m.paint, { cast: false });
    const strake = spaced(0, 0.99, 30).map(section).map((s) => v3(s.x, s.ys - 0.035, side * (s.hb + 0.02)));
    add(group, tube(strake, 0.032, 120), m.rubber);
  }
  // Vertical plate joins on the topsides, clear of the name decal.
  for (const t of [0.27, 0.44, 0.78]) {
    const s = section(t);
    const y1 = s.ys - 0.06;
    for (const side of [1, -1]) {
      const pts = [[s.zf, s.yf + 0.01], [s.zn, s.yn], [lines.sideZ(s, y1), y1]].map(([z, y]) => v3(s.x, y, side * (z + 0.0015)));
      add(group, tube(pts, 0.0045, 10, 5), m.paint, { cast: false });
    }
  }
  const keelLine = [...spaced(0, 1, 30).map((t) => v3(t * L, lines.keel(t) - KEEL_BAR / 2, 0)), v3(L + 0.01, lines.sheer(1) - 0.06, 0)];
  add(group, tube(keelLine, KEEL_BAR / 2 + 0.004, 96, 6), m.alloy);

  // Gunwale capping, inner liner, non-slip cockpit floor.
  const toBow = spaced(0, 0.985, 48, (u) => Math.sin((u * Math.PI) / 2)).map(section);
  add(group, ribbon(toBow.map((s) => ({ x: s.x, pts: [[s.hb, s.ys], [s.inner, s.ys]] }))), m.paint);
  const fore = build.layout === 'ht' ? 0.78 : 0.8;
  const cockpit = spaced(0, fore + 0.02, 32).map(section);
  add(group, ribbon(cockpit.map((s) => ({ x: s.x, pts: [[s.inner, s.ys], [s.inner, DECK_Y]] }))), m.deck);
  add(group, ribbon(cockpit.map((s) => ({ x: s.x, pts: [[0, DECK_Y], [Math.min(s.inner, lines.bottomZ(s, DECK_Y)), DECK_Y]] }))), m.nonslip);
  const foredeck = spaced(fore, 0.992, 16).map(section);
  add(group, ribbon(foredeck.map((s) => ({ x: s.x, pts: [[0, s.ys - 0.05], [Math.max(0, s.hb - CAP * 0.5), s.ys - 0.05]] }))), m.nonslip);
  const bulk = section(fore);
  if (build.layout !== 'ht') box(group, m.deck, [0.02, bulk.ys - 0.05 - DECK_Y, bulk.inner * 2], [bulk.x, (bulk.ys - 0.05 + DECK_Y) / 2, 0]);

  // Side pockets under the coaming and flush rod holders in the capping.
  for (const side of [1, -1]) {
    const a = section(0.1);
    const b = section(0.3);
    const z = Math.min(a.inner, b.inner) - 0.004;
    box(group, m.rubber, [b.x - a.x, 0.2, 0.01], [(a.x + b.x) / 2, DECK_Y + 0.36, side * z], { cast: false });
    box(group, m.deck, [b.x - a.x + 0.04, 0.03, 0.07], [(a.x + b.x) / 2, DECK_Y + 0.26, side * (z - 0.035)]);
    for (const t of [0.07, 0.19]) {
      const s = section(t);
      const ring = add(group, new THREE.TorusGeometry(0.03, 0.008, 6, 18), m.stainless, { cast: false });
      ring.position.set(s.x, s.ys + 0.004, side * (s.hb - CAP / 2));
      ring.rotation.x = Math.PI / 2;
      const hole = add(group, new THREE.CircleGeometry(0.03, 18), m.rubber, { cast: false });
      hole.position.set(s.x, s.ys + 0.003, side * (s.hb - CAP / 2));
      hole.rotation.x = -Math.PI / 2;
    }
  }

  // Full-height transom with a door to the port boarding pod.
  const s0 = section(0);
  const outline = [[s0.hb, s0.ys], [s0.zn, s0.yn], [s0.zf, s0.yf], [s0.zc, s0.yc], [0, s0.yk]];
  add(group, crossSection([...outline, ...outline.slice(0, -1).reverse().map(([z, y]) => [-z, y])], 0), m.paint);
  const tw = s0.inner;
  box(group, m.deck, [0.1, s0.ys - DECK_Y, tw * 2], [0.05, (s0.ys + DECK_Y) / 2, 0]);
  const door = [-(tw - 0.14), -(tw - 0.58)];
  for (const z of door) box(group, m.rubber, [0.012, s0.ys - DECK_Y - 0.06, 0.012], [0.101, (s0.ys + DECK_Y) / 2 + 0.01, z], { cast: false });
  box(group, m.rubber, [0.012, 0.012, Math.abs(door[1] - door[0])], [0.101, s0.ys - 0.04, (door[0] + door[1]) / 2], { cast: false });
  box(group, m.stainless, [0.03, 0.03, 0.12], [0.115, s0.ys - 0.18, door[1] + 0.08]);

  // Boarding pods either side of the engine bracket, following the hull aft.
  const podHalf = twin ? 0.66 : 0.4;
  const podTop = s0.ys - 0.12;
  const platY = s0.yc + 0.2;
  const zi = podHalf + 0.05;
  const bottomAt = (z) => lerp(s0.yk, s0.yc, z / s0.zc);
  for (const side of [1, -1]) {
    const pts = [[zi, platY], [s0.zf, platY], [s0.zf, s0.yf], [s0.zc, s0.yc], [zi, bottomAt(zi)]].map(([z, y]) => [z * side, y]);
    const g = extrudeProfile(pts.map(([z, y]) => [-z, y]), POD, 0.012);
    g.translate(0, 0, POD / 2);
    g.rotateY(Math.PI / 2);
    g.translate(-POD, 0, 0);
    add(group, g, m.paint);
    box(group, m.nonslip, [POD - 0.04, 0.012, s0.zf - zi - 0.04], [-POD / 2, platY + 0.019, side * (zi + s0.zf) / 2], { cast: false });
  }
  // Engine pod: the hull's V carried aft between the boarding pods, alloy mounting plate on top.
  const pod = [[podHalf, podTop], [podHalf, bottomAt(podHalf)], [0, s0.yk], [-podHalf, bottomAt(podHalf)], [-podHalf, podTop]];
  const engineWell = extrudeProfile(pod.map(([z, y]) => [-z, y]), POD, 0.012);
  engineWell.translate(0, 0, POD / 2);
  engineWell.rotateY(Math.PI / 2);
  engineWell.translate(-POD, 0, 0);
  add(group, engineWell, m.paint);
  box(group, m.alloy, [POD, 0.02, podHalf * 2 - 0.04], [-POD / 2, podTop + 0.022, 0]);

  // Fold-down boarding ladder on the port pod.
  const lz = -(zi + s0.zf) / 2;
  const lx = -POD + 0.05;
  for (const dz of [-0.12, 0.12]) rod(group, v3(lx, platY + 0.03, lz + dz), v3(lx - 0.1, platY - 0.62, lz + dz), 0.011, m.stainless);
  for (const f of [0.35, 0.65, 0.95]) rod(group, v3(lx - 0.1 * f, platY + 0.03 - 0.65 * f, lz - 0.12), v3(lx - 0.1 * f, platY + 0.03 - 0.65 * f, lz + 0.12), 0.012, m.stainless);

  // Transom step on the port pod, up to the door sill, with a grab handle on the capping.
  const stepY = platY + 0.19;
  const stepW = Math.min(0.42, s0.zf - zi - 0.08);
  const step = add(group, new RoundedBoxGeometry(0.24, stepY - platY, stepW, 2, 0.015), m.paint);
  step.position.set(-0.12, (stepY + platY) / 2 + 0.01, lz);
  box(group, m.nonslip, [0.2, 0.01, stepW - 0.04], [-0.12, stepY + 0.016, lz], { cast: false });
  for (const z of [lz - stepW / 2 + 0.02, lz + stepW / 2 - 0.02]) box(group, m.rubber, [0.008, s0.ys - stepY - 0.06, 0.012], [-0.004, (s0.ys + stepY) / 2 - 0.01, z], { cast: false });
  add(group, tube([v3(0.02, s0.ys, lz - 0.16), v3(-0.02, s0.ys + 0.1, lz - 0.1), v3(-0.02, s0.ys + 0.1, lz + 0.1), v3(0.02, s0.ys, lz + 0.16)], 0.012, 20, 6), m.stainless);

  nameDecal(group, lines, resolve(build).model.name, letteringColour(build));
  return { podTop, podHalf, zi, platY, bottomAt };
}

// ---------- fit-out ----------

function rocketLauncher(group, m, x, y, width, count) {
  rod(group, v3(x, y, -width / 2), v3(x, y, width / 2), 0.02, m.stainless);
  for (let i = 0; i < count; i++) {
    const z = lerp(-width / 2, width / 2, count === 1 ? 0.5 : i / (count - 1));
    const splay = (z / Math.max(width, 0.01)) * 0.5;
    const holderDir = v3(-Math.sin(0.35), Math.cos(0.35), splay * 0.4).normalize();
    const base = v3(x, y, z);
    const top = base.clone().addScaledVector(holderDir, 0.28);
    rod(group, base, top, 0.022, m.stainless);
    const rodDir = v3(-Math.sin(0.48), Math.cos(0.48), splay).normalize();
    const blank = add(group, new THREE.CylinderGeometry(0.0035, 0.01, 1.85, 6), m.rod);
    blank.position.copy(top).addScaledVector(rodDir, 0.925);
    blank.quaternion.setFromUnitVectors(v3(0, 1, 0), rodDir);
    const reel = add(group, new THREE.CylinderGeometry(0.035, 0.035, 0.05, 14), m.stainless);
    reel.position.copy(top).addScaledVector(rodDir, 0.1).add(v3(-0.04, -0.03, 0));
    reel.rotation.x = Math.PI / 2;
  }
}

function seat(group, m, x, z, pedestal) {
  rod(group, v3(x, DECK_Y, z), v3(x, DECK_Y + pedestal, z), 0.04, m.stainless);
  const foot = add(group, new THREE.CylinderGeometry(0.15, 0.17, 0.03, 20), m.stainless);
  foot.position.set(x, DECK_Y + 0.015, z);
  const cushion = add(group, new RoundedBoxGeometry(0.46, 0.12, 0.46, 3, 0.05), m.seat);
  cushion.position.set(x, DECK_Y + pedestal + 0.06, z);
  const back = add(group, new RoundedBoxGeometry(0.1, 0.46, 0.46, 3, 0.04), m.seat);
  back.position.set(x - 0.22, DECK_Y + pedestal + 0.3, z);
  back.rotation.z = 0.12;
}

function navLight(group, m, x, y, z) {
  box(group, m.galv, [0.12, 0.06, 0.02], [x, y, z]);
  box(group, z > 0 ? m.navGreen : m.navRed, [0.09, 0.035, 0.02], [x + 0.005, y, z + Math.sign(z) * 0.012], { cast: false });
}

// ---------- helm ----------

// Wheel on a tilt column from base along dir (in the x-y plane), with three spokes.
function helmWheel(group, m, base, dir, reach = 0.2, radius = 0.17) {
  const centre = base.clone().addScaledVector(dir, reach);
  rod(group, base, centre, 0.026, m.dash, 10);
  const wheel = add(group, new THREE.TorusGeometry(radius, 0.017, 8, 36), m.rubber);
  wheel.position.copy(centre);
  wheel.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
  const hub = add(group, new THREE.CylinderGeometry(0.045, 0.045, 0.05, 16), m.stainless);
  hub.position.copy(centre);
  hub.quaternion.setFromUnitVectors(v3(0, 1, 0), dir);
  const u = v3(0, 0, 1);
  const w = new THREE.Vector3().crossVectors(dir, u).normalize();
  for (const a of [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6]) {
    rod(group, centre, centre.clone().addScaledVector(u, Math.cos(a) * radius).addScaledVector(w, Math.sin(a) * radius), 0.009, m.stainless, 6);
  }
}

// Panel set into a face tilted back by tilt radians: a bezel with a part proud of it.
function flushPanel(group, bezelMat, faceMat, centre, tilt, w, h) {
  const bezel = add(group, new THREE.BoxGeometry(0.02, h + 0.04, w + 0.04), bezelMat);
  bezel.position.copy(centre);
  bezel.rotation.z = -tilt;
  const face = add(group, new THREE.BoxGeometry(0.004, h, w), faceMat, { cast: false });
  face.position.copy(centre).add(v3(-Math.cos(tilt) * 0.011, Math.sin(tilt) * 0.011, 0));
  face.rotation.z = -tilt;
}

function binnacle(group, m, x, y, z) {
  const body = add(group, new RoundedBoxGeometry(0.16, 0.1, 0.12, 2, 0.03), m.dash);
  body.position.set(x, y + 0.05, z);
  rod(group, v3(x, y + 0.08, z), v3(x - 0.1, y + 0.19, z), 0.012, m.stainless, 8);
  const knob = add(group, new THREE.SphereGeometry(0.03, 12, 8), m.rubber);
  knob.position.set(x - 0.1, y + 0.2, z);
}

function compass(group, m, x, y, z) {
  const base = add(group, new THREE.CylinderGeometry(0.07, 0.08, 0.04, 20), m.rubber);
  base.position.set(x, y + 0.02, z);
  const card = add(group, new THREE.CircleGeometry(0.055, 20), m.seat, { cast: false });
  card.position.set(x, y + 0.042, z);
  card.rotation.x = -Math.PI / 2;
  const dome = add(group, new THREE.SphereGeometry(0.065, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, { cast: false });
  dome.position.set(x, y + 0.04, z);
}

// Walkaround hardtop: tapered, tumblehomed sides, raked screen, open aft to the cockpit.
function hardtop(group, lines, m, build) {
  const { L, section, halfBeam } = lines;
  const x0 = L * 0.38;
  const x1 = L * 0.78;
  const sideY = (x) => lines.sheer(x / L) - 0.05;
  const hw = (x) => Math.max(0.45, halfBeam(x / L) - SIDE_DECK);
  const hwT = (x) => hw(x) - 0.09;
  const yR = DECK_Y + 1.95;
  const B2 = [x1, sideY(x1) + 0.24];
  const C = [x1 - 0.3, B2[1] + 0.3];
  const D = [x1 - 0.98, yR];
  const yTop = (x) => (x <= D[0] ? yR : x <= C[0] ? lerp(yR, C[1], (x - D[0]) / (C[0] - D[0])) : lerp(C[1], B2[1], (x - C[0]) / (x1 - C[0])));
  const wallZ = (x, y) => (y <= sideY(x) ? hw(x) : lerp(hw(x), hwT(x), (y - sideY(x)) / (yTop(x) - sideY(x))));
  const xs = [...spaced(x0, D[0], 8), ...spaced(D[0], C[0], 6).slice(1), ...spaced(C[0], x1, 4).slice(1)];

  const station = (x) => ({ x, pts: [[hw(x), DECK_Y], [hw(x), sideY(x)], [hw(x), sideY(x)], [hwT(x), yTop(x)], [hwT(x), yTop(x)], [0, yTop(x)]] });
  add(group, ribbon(xs.map(station)), m.trim);
  const front = [[hw(x1), DECK_Y], [hw(x1), sideY(x1)], [hwT(x1), yTop(x1)], [-hwT(x1), yTop(x1)], [-hw(x1), sideY(x1)], [-hw(x1), DECK_Y]];
  add(group, crossSection(front, x1), m.trim);

  // Side decks between the hardtop and the gunwale.
  const decks = spaced(x0, x1, 10).map((x) => section(x / L)).map((s) => ({ x: s.x, pts: [[hw(s.x), sideY(s.x)], [s.inner, sideY(s.x)]] }));
  add(group, ribbon(decks), m.nonslip);

  // Framed side windows with a sliding-pane split, and nav lights forward.
  const yw0 = yR - 0.72;
  const yw1 = yR - 0.14;
  const pane = (xa, xb, inset, lift) => ribbon(spaced(xa, xb, 6).map((x) => {
    const top = Math.min(yw1, yTop(x) - 0.1) - inset;
    const bottom = yw0 + inset;
    return { x, pts: [[wallZ(x, bottom) + lift, bottom], [wallZ(x, top) + lift, top]] };
  }));
  const xa = x0 + 0.12;
  const xm = (x0 + C[0]) / 2 - 0.1;
  // The forward pane stops where the raked screen comes down to the sill.
  const xb = Math.min(C[0] - 0.12, D[0] + ((yR - yw0 - 0.3) / (yR - C[1])) * (C[0] - D[0]));
  for (const [a, b] of [[xa, xm - 0.04], [xm + 0.04, xb]]) {
    add(group, pane(a, b, 0, 0.004), m.rubber, { cast: false });
    add(group, pane(a + 0.03, b - 0.03, 0.03, 0.008), m.glass, { cast: false });
    const xs2 = (a + b) / 2;
    for (const side of [1, -1]) {
      const top = Math.min(yw1, yTop(xs2) - 0.1) - 0.03;
      rod(group, v3(xs2, yw0 + 0.03, side * (wallZ(xs2, yw0) + 0.012)), v3(xs2, top, side * (wallZ(xs2, top) + 0.012)), 0.007, m.galv, 6);
    }
  }
  for (const side of [1, -1]) navLight(group, m, x1 - 0.25, sideY(x1 - 0.25) + 0.12, side * (hw(x1 - 0.25) + 0.012));

  // Raked windscreen: black frame, two panes either side of a centre mullion, wipers.
  const screen = (inset, lift, zIn) => ribbon(spaced(D[0] + 0.05 + inset, C[0] - 0.04 - inset, 5).map((x) => ({ x, pts: [[hwT(x) - 0.05 - inset, yTop(x) + lift], [zIn, yTop(x) + lift]] })));
  add(group, screen(0, 0.006, 0), m.rubber, { cast: false });
  add(group, screen(0.03, 0.014, 0.035), m.glass, { cast: false });
  for (const side of [1, -1]) {
    const a = v3(lerp(C[0], D[0], 0.18), lerp(C[1], yR, 0.18) + 0.03, side * 0.22);
    rod(group, a, v3(lerp(C[0], D[0], 0.62), lerp(C[1], yR, 0.62) + 0.03, side * 0.4), 0.007, m.rubber, 6);
  }

  // Roof: tapered in plan, overhanging the cockpit on two posts.
  const roofAft = x0 - 0.5;
  const roofFwd = D[0] + 0.12;
  const ra = hwT(x0) + 0.07;
  const rf = hwT(D[0]) + 0.07;
  const roofShape = new THREE.Shape([[roofAft, -ra], [roofFwd, -rf], [roofFwd + 0.04, 0], [roofFwd, rf], [roofAft, ra]].map(([x, z]) => new THREE.Vector2(x, z)));
  const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2 });
  roof.rotateX(-Math.PI / 2);
  roof.translate(0, yR + 0.02, 0);
  add(group, roof, m.trim);
  const sp = section((x0 - 0.42) / L);
  for (const side of [1, -1]) rod(group, v3(x0 - 0.42, sp.ys, side * (sp.hb - CAP / 2)), v3(x0 - 0.42, yR + 0.02, side * (ra - 0.06)), 0.024, m.stainless);

  // Roof grab rails, spotlight, VHF whip and all-round light.
  for (const side of [1, -1]) {
    const z = side * (Math.min(ra, rf) - 0.1);
    const xr0 = roofAft + 0.3;
    const xr1 = roofFwd - 0.25;
    add(group, tube([v3(xr0, yR + 0.08, z), v3(xr0 + 0.06, yR + 0.16, z), v3(xr1 - 0.06, yR + 0.16, z), v3(xr1, yR + 0.08, z)], 0.012, 24, 6), m.stainless);
  }
  const lamp = add(group, new THREE.CylinderGeometry(0.075, 0.06, 0.13, 18), m.trim);
  lamp.position.set(roofFwd - 0.18, yR + 0.17, 0);
  lamp.rotation.z = Math.PI / 2;
  const lens = add(group, new THREE.CircleGeometry(0.065, 18), m.lens, { cast: false });
  lens.position.set(roofFwd - 0.11, yR + 0.17, 0);
  lens.rotation.y = Math.PI / 2;
  rod(group, v3(roofFwd - 0.2, yR + 0.07, 0), v3(roofFwd - 0.2, yR + 0.12, 0), 0.025, m.galv);
  rod(group, v3(roofAft + 0.2, yR + 0.07, -(ra - 0.12)), v3(roofAft + 0.02, yR + 1.45, -(ra - 0.08)), 0.009, m.seat, 6);
  rod(group, v3(roofAft + 0.3, yR + 0.07, 0), v3(roofAft + 0.3, yR + 0.42, 0), 0.012, m.stainless);
  const allRound = add(group, new THREE.SphereGeometry(0.03, 12, 8), m.seat);
  allRound.position.set(roofAft + 0.3, yR + 0.44, 0);

  // Helm and pedestal seats, seen through the open back; cuddy entrance forward.
  // Moulded dash with a raked face: flush MFD, switch panel, wheel on a tilt column,
  // throttle binnacle to starboard and a compass on top. Helm console below, cuddy to port.
  const dashX = C[0] - 0.18;
  const dashW = 2 * hwT(dashX + 0.2) - 0.08;
  const dTop = C[1] + 0.05;
  const fTop = [dashX - 0.04, dTop];
  const fBot = [dashX - 0.2, dTop - 0.26];
  const tilt = Math.atan2(fTop[0] - fBot[0], fTop[1] - fBot[1]);
  const nrm = v3(-Math.cos(tilt), Math.sin(tilt), 0);
  const onFace = (f, z, out = 0.012) => v3(lerp(fBot[0], fTop[0], f), lerp(fBot[1], fTop[1], f), z).addScaledVector(nrm, out);
  // Top sits just under the raked screen, the nose chamfered down to clear it.
  add(group, extrudeProfile([[dashX + 0.18, DECK_Y + 0.62], [dashX + 0.18, C[1] - 0.1], [dashX + 0.08, dTop], fTop, fBot, [dashX - 0.2, DECK_Y + 0.62]], dashW, 0.02), m.dash);
  box(group, m.deck, [0.04, 0.7, dashW], [dashX + 0.16, DECK_Y + 0.35, 0]);
  const wheelZ = Math.min(hw(dashX) * 0.45, dashW / 2 - 0.22);
  const consoleW = dashW / 2 - 0.02;
  box(group, m.trim, [0.36, 0.62, consoleW], [dashX - 0.02, DECK_Y + 0.31, dashW / 2 - consoleW / 2]);
  box(group, m.rubber, [0.01, 0.5, 0.42], [dashX + 0.135, DECK_Y + 0.33, -dashW / 4], { cast: false });
  flushPanel(group, m.rubber, m.screen, onFace(0.56, -0.08), tilt, 0.36, 0.19);
  flushPanel(group, m.rubber, m.dash, onFace(0.5, -(dashW / 2 - 0.16)), tilt, 0.16, 0.12);
  for (let i = 0; i < 5; i++) box(group, m.seat, [0.02, 0.025, 0.012], onFace(0.5, -(dashW / 2 - 0.22) + i * 0.03, 0.025).toArray(), { cast: false });
  helmWheel(group, m, onFace(0.38, wheelZ, 0), nrm, 0.2);
  binnacle(group, m, dashX + 0.02, dTop, Math.min(wheelZ + 0.27, dashW / 2 - 0.1));
  compass(group, m, dashX + 0.03, dTop, wheelZ);
  for (const side of [1, -1]) seat(group, m, dashX - 0.85, side * hw(dashX) * 0.45, 0.45);

  if (build.options.includes('rocket')) rocketLauncher(group, m, roofAft + 0.14, yR + 0.09, ra * 1.5, 6);
}

// Centre console with wrap screen, leaning post and optional T-top.
function centreConsole(group, lines, m, build) {
  const { L } = lines;
  const cx0 = L * 0.44;
  const cx1 = L * 0.57;
  const Wc = 0.84;
  const top = DECK_Y + 1.02;
  const yTop = (x) => (x <= cx1 - 0.26 ? lerp(top + 0.02, top, (x - cx0) / (cx1 - 0.26 - cx0)) : lerp(top, DECK_Y + 0.8, (x - (cx1 - 0.26)) / 0.26));
  const halfAt = (x, y) => Wc / 2 - 0.07 * clamp01((y - DECK_Y - 0.3) / 0.7) - 0.06 * clamp01((x - cx0) / (cx1 - cx0));
  const xs = spaced(cx0, cx1, 10);
  add(group, ribbon(xs.map((x) => ({ x, pts: [[halfAt(x, DECK_Y), DECK_Y], [halfAt(x, yTop(x)), yTop(x)], [halfAt(x, yTop(x)), yTop(x)], [0, yTop(x)]] }))), m.trim);
  for (const x of [cx0, cx1]) {
    const y = yTop(x);
    add(group, crossSection([[halfAt(x, DECK_Y), DECK_Y], [halfAt(x, y), y], [-halfAt(x, y), y], [-halfAt(x, DECK_Y), DECK_Y]], x), m.trim);
  }
  // Console door to the head, dash and electronics.
  box(group, m.rubber, [0.012, 0.55, 0.36], [cx1 + 0.002, DECK_Y + 0.38, 0], { cast: false });
  const pod = add(group, new RoundedBoxGeometry(0.12, 0.3, 0.5, 2, 0.03), m.dash);
  pod.position.set(cx0 + 0.22, top + 0.13, 0);
  pod.rotation.z = -0.35;
  flushPanel(group, m.rubber, m.screen, v3(cx0 + 0.22 - Math.cos(0.35) * 0.065, top + 0.13 + Math.sin(0.35) * 0.065, 0), 0.35, 0.4, 0.22);
  helmWheel(group, m, v3(cx0 - 0.005, top - 0.2, 0.16), v3(-Math.cos(0.55), Math.sin(0.55), 0), 0.16);
  binnacle(group, m, cx0 + 0.08, yTop(cx0 + 0.08), Math.min(0.32, Wc / 2 - 0.1));
  compass(group, m, cx0 + 0.42, yTop(cx0 + 0.42), 0);
  const switches = add(group, new THREE.BoxGeometry(0.01, 0.12, 0.22), m.dash);
  switches.position.set(cx0 - 0.004, top - 0.18, -0.2);

  // Wrap-around screen with a stainless top rail and console grab rails.
  const sx0 = cx1 - 0.2;
  const sx1 = cx1 - 0.48;
  const screenTop = top + 0.42;
  const ws = Wc / 2 - 0.06;
  const glassPts = [v3(sx0, top - 0.01, -ws), v3(sx0 + 0.04, top - 0.01, 0), v3(sx0, top - 0.01, ws)];
  const g = new THREE.BufferGeometry().setFromPoints([...glassPts, ...glassPts.map((p) => v3(sx1 + (p.x - sx0), screenTop, p.z * 0.92))]);
  g.setIndex([0, 4, 1, 0, 3, 4, 1, 5, 2, 1, 4, 5]);
  g.computeVertexNormals();
  add(group, g, m.glass, { cast: false });
  add(group, tube([v3(sx1, screenTop + 0.01, -ws * 0.92), v3(sx1 + 0.04, screenTop + 0.01, 0), v3(sx1, screenTop + 0.01, ws * 0.92)], 0.012, 16, 6), m.stainless);
  for (const side of [1, -1]) add(group, tube([v3(cx0 + 0.02, top - 0.08, side * (Wc / 2 + 0.04)), v3((cx0 + cx1) / 2, top - 0.02, side * (Wc / 2 + 0.02)), v3(cx1 - 0.08, top - 0.2, side * (Wc / 2 - 0.02))], 0.014, 16), m.stainless);

  // Leaning post: stainless frame, bolster, backrest, rod holders behind.
  const xp = cx0 - 0.62;
  for (const dz of [-0.3, 0.3]) {
    add(group, tube([v3(xp + 0.18, DECK_Y, dz), v3(xp + 0.14, DECK_Y + 0.7, dz), v3(xp - 0.08, DECK_Y + 1.02, dz), v3(xp - 0.18, DECK_Y + 1.2, dz)], 0.02, 24, 8), m.stainless);
    rod(group, v3(xp - 0.16, DECK_Y, dz), v3(xp - 0.12, DECK_Y + 0.72, dz), 0.02, m.stainless);
  }
  box(group, m.trim, [0.42, 0.06, 0.74], [xp, DECK_Y + 0.08, 0]);
  const bolster = add(group, new RoundedBoxGeometry(0.36, 0.16, 0.72, 3, 0.06), m.seat);
  bolster.position.set(xp, DECK_Y + 0.8, 0);
  const back = add(group, new RoundedBoxGeometry(0.12, 0.34, 0.68, 3, 0.04), m.seat);
  back.position.set(xp - 0.18, DECK_Y + 1.08, 0);
  back.rotation.z = 0.15;
  for (const z of [-0.2, 0, 0.2]) rod(group, v3(xp - 0.24, DECK_Y + 0.9, z), v3(xp - 0.34, DECK_Y + 1.14, z), 0.022, m.stainless);
  const cooler = add(group, new RoundedBoxGeometry(0.5, 0.44, 0.78, 3, 0.05), m.seat);
  cooler.position.set(cx1 + 0.42, DECK_Y + 0.22, 0);

  const yT = DECK_Y + 2.05;
  if (build.options.includes('ttop')) {
    // Bent frame legs from the console sides to the canopy.
    for (const side of [1, -1]) {
      add(group, tube([v3(cx1 - 0.08, DECK_Y + 0.5, side * (Wc / 2 + 0.03)), v3(cx1 - 0.12, DECK_Y + 1.3, side * 0.5), v3(cx1 - 0.3, yT - 0.05, side * 0.6)], 0.024, 24, 8), m.stainless);
      add(group, tube([v3(cx0 + 0.06, DECK_Y + 0.5, side * (Wc / 2 + 0.03)), v3(cx0 - 0.04, DECK_Y + 1.3, side * 0.52), v3(cx0 - 0.3, yT - 0.05, side * 0.62)], 0.024, 24, 8), m.stainless);
      rod(group, v3(cx0 - 0.3, yT - 0.05, side * 0.62), v3(cx1 - 0.3, yT - 0.05, side * 0.6), 0.02, m.stainless);
    }
    const aft = cx0 - 0.85;
    const fwd = cx1 + 0.15;
    const canopy = add(group, new RoundedBoxGeometry(fwd - aft, 0.07, 1.55, 3, 0.03), m.trim);
    canopy.position.set((aft + fwd) / 2, yT + 0.035, 0);
    const light = add(group, new THREE.SphereGeometry(0.03, 12, 8), m.seat);
    light.position.set(aft + 0.25, yT + 0.32, 0);
    rod(group, v3(aft + 0.25, yT + 0.07, 0), v3(aft + 0.25, yT + 0.3, 0), 0.012, m.stainless);
    if (build.options.includes('rocket')) rocketLauncher(group, m, aft + 0.1, yT + 0.07, 1.25, 6);
  } else if (build.options.includes('rocket')) {
    rocketLauncher(group, m, xp - 0.3, DECK_Y + 1.26, 0.6, 4);
  }
}

// Short bowsprit with roller and anchor, locker hatch and cleat on the foredeck.
function bowFittings(group, lines, m) {
  const { L, section } = lines;
  const y0 = lines.sheer(0.97) - 0.04;
  box(group, m.alloy, [0.86, 0.05, 0.18], [L - 0.12, y0, 0]);
  for (const side of [1, -1]) {
    add(group, extrudeProfile([[L + 0.02, y0], [L + 0.36, y0], [L + 0.33, y0 + 0.12], [L + 0.1, y0 + 0.07]], 0.012, 0.004), m.alloy).position.z = side * 0.085;
  }
  const roller = add(group, new THREE.CylinderGeometry(0.04, 0.04, 0.15, 16), m.rubber);
  roller.position.set(L + 0.29, y0 + 0.06, 0);
  roller.rotation.x = Math.PI / 2;
  // Plough anchor: shank along the sprit, flukes hanging over the roller.
  box(group, m.galv, [0.55, 0.035, 0.04], [L + 0.03, y0 + 0.12, 0]);
  for (const side of [1, -1]) {
    const fluke = add(group, extrudeProfile([[0, 0], [0.16, -0.05], [0.04, -0.24]], 0.014, 0.004), m.galv);
    fluke.position.set(L + 0.32, y0 + 0.12, side * 0.035);
    fluke.rotation.x = side * 0.5;
  }
  const s = section(0.85);
  const hatch = add(group, new RoundedBoxGeometry(0.5, 0.03, Math.min(0.5, s.hb * 0.9), 2, 0.012), m.deck);
  hatch.position.set(s.x, s.ys - 0.035, 0);
  box(group, m.stainless, [0.02, 0.02, 0.12], [s.x - 0.2, s.ys - 0.012, 0]);
  const c = section(0.92);
  box(group, m.stainless, [0.05, 0.03, 0.04], [c.x, c.ys - 0.03, 0]);
  rod(group, v3(c.x - 0.09, c.ys - 0.005, 0), v3(c.x + 0.09, c.ys - 0.005, 0), 0.012, m.stainless);
}

function bowRail(group, lines, m) {
  const { L, section } = lines;
  const h = 0.36;
  const side = (sign) => spaced(0.64, 0.95, 12).map(section).map((s) => v3(s.x, s.ys + h, sign * (s.hb - 0.07)));
  const tip = v3(L + 0.16, lines.sheer(1) + h - 0.06, 0);
  add(group, tube([...side(-1), tip, ...side(1).reverse()], 0.014, 140), m.stainless);
  for (const t of [0.66, 0.79, 0.91]) {
    const s = section(t);
    for (const sign of [1, -1]) rod(group, v3(s.x, s.ys, sign * (s.hb - 0.07)), v3(s.x, s.ys + h, sign * (s.hb - 0.07)), 0.012, m.stainless);
  }
  // The rail lands on the bowsprit.
  rod(group, v3(L + 0.16, lines.sheer(0.97) - 0.015, 0), tip, 0.014, m.stainless);
}

// Bait board on stainless legs over the transom, with rod holders and a tray.
function baitStation(group, lines, m) {
  const s0 = lines.section(0);
  const y = s0.ys + 0.4;
  const w = Math.min(1.0, s0.inner * 1.1);
  for (const dx of [0.0, 0.32]) for (const dz of [-w / 2 + 0.06, w / 2 - 0.06]) rod(group, v3(0.05 + dx * 0.4, s0.ys, dz), v3(0.06 + dx, y - 0.02, dz), 0.016, m.stainless);
  const board = add(group, new RoundedBoxGeometry(0.42, 0.035, w, 2, 0.012), m.seat);
  board.position.set(0.2, y, 0);
  box(group, m.trim, [0.36, 0.14, w - 0.12], [0.22, y - 0.1, 0]);
  for (const z of [-0.36, -0.12, 0.12, 0.36].map((z) => z * w)) rod(group, v3(0.02, y - 0.04, z), v3(-0.06, y + 0.2, z), 0.022, m.stainless);
}

// ---------- outboard ----------

// Generic four-stroke outboard: sculpted cowl with a split line, midsection, gearcase,
// anti-ventilation plate, skeg and a three-blade prop. Local x = 0 is the bracket face.
function outboard(m, hp, plateY) {
  const g = new THREE.Group();
  const s = 0.86 + ((hp - 150) / 150) * 0.2;
  // Clamp brackets and tilt tube.
  for (const z of [-0.13, 0.13]) box(g, m.rubber, [0.14, 0.34, 0.03], [-0.07, -0.1, z * s]);
  rod(g, v3(-0.1, 0.02, -0.17 * s), v3(-0.1, 0.02, 0.17 * s), 0.03, m.galv);

  // Powerhead: lower cowl and top cowl lofted as one, a recessed split line between.
  const len = 0.95 * s;
  const xFront = -0.12;
  const yBase = -0.04;
  const ySplit = 0.27 * s;
  const rings = spaced(0.015, 0.985, 18).map((u) => {
    const round = Math.sin(Math.PI * u) ** 0.32;
    const x = xFront - u * len;
    const top = yBase + (0.86 - 0.12 * u) * s * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.08)) ** 0.22;
    const bottom = yBase + 0.02 * s * (1 - round);
    const half = 0.3 * s * round * (1 - 0.18 * u);
    return sectionRing(x, (top + bottom) / 2, Math.max(0.02, (top - bottom) / 2), Math.max(0.02, half), 3.2);
  });
  add(g, loft(rings), m.cowling);
  const split = rings.map((ring) => {
    const hit = ring.reduce((best, p) => (Math.abs(p.y - ySplit) < Math.abs(best.y - ySplit) && p.z > 0 ? p : best), ring[0]);
    return hit.x;
  });
  const widthAt = (ring) => Math.max(...ring.filter((p) => Math.abs(p.y - ySplit) < 0.08 * s).map((p) => Math.abs(p.z)), 0.02) + 0.004;
  const loop = [...rings.map((ring, i) => v3(split[i], ySplit, widthAt(ring))), ...rings.slice().reverse().map((ring, i) => v3(split[rings.length - 1 - i], ySplit, -widthAt(ring)))];
  add(g, tube(loop, 0.009, 90, 5, true), m.decal, { cast: false });
  const badge = add(g, new THREE.BoxGeometry(0.3 * s, 0.035 * s, 0.006), m.decal, { cast: false });
  badge.position.set(xFront - len * 0.45, ySplit + 0.2 * s, rings[9].reduce((a, p) => Math.max(a, p.z), 0) - 0.01);

  // Midsection, tapering to the anti-ventilation plate.
  const plate = plateY;
  const legRings = spaced(0, 1, 6).map((u) => sectionRing(0, 0, 1, 1, 2, 20).map((p) => v3(-0.44 * s + p.z * lerp(0.24, 0.19, u) * s, lerp(-0.02, plate, u), p.y * lerp(0.1, 0.065, u) * s)));
  add(g, loft(legRings), m.cowling);
  const plateShape = new THREE.Shape([[-0.22, -0.13], [-0.56, -0.13], [-0.64, -0.06], [-0.64, 0.06], [-0.56, 0.13], [-0.22, 0.13], [-0.18, 0]].map(([x, z]) => new THREE.Vector2(x * s, z * s)));
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, { depth: 0.012, bevelEnabled: false });
  plateGeo.rotateX(Math.PI / 2);
  add(g, plateGeo, m.cowling).position.y = plate;

  // Gearcase torpedo, skeg and prop.
  const gearY = plate - 0.17 * s;
  rod(g, v3(-0.3 * s, plate, 0), v3(-0.4 * s, gearY, 0), 0.06 * s, m.cowling, 14).scale.set(1, 1, 0.75);
  const gear = add(g, new THREE.CapsuleGeometry(0.075 * s, 0.34 * s, 6, 16), m.cowling);
  gear.position.set(-0.42 * s, gearY, 0);
  gear.rotation.z = Math.PI / 2;
  const skeg = new THREE.Shape([[-0.32, 0], [-0.54, 0], [-0.5, -0.22], [-0.44, -0.22]].map(([x, y]) => new THREE.Vector2(x * s, y * s)));
  const skegGeo = new THREE.ExtrudeGeometry(skeg, { depth: 0.02, bevelEnabled: false });
  skegGeo.translate(0, 0, -0.01);
  add(g, skegGeo, m.cowling).position.set(0, gearY - 0.04 * s, 0);

  const prop = new THREE.Group();
  prop.position.set(-0.68 * s, gearY, 0);
  const hub = add(prop, new THREE.CylinderGeometry(0.05 * s, 0.035 * s, 0.16 * s, 16), m.prop);
  hub.rotation.z = Math.PI / 2;
  const bladeShape = new THREE.Shape();
  bladeShape.absellipse(0, 0.12 * s, 0.075 * s, 0.13 * s, 0, Math.PI * 2);
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.x = (i * Math.PI * 2) / 3;
    const blade = add(pivot, new THREE.ExtrudeGeometry(bladeShape, { depth: 0.008, bevelEnabled: false, curveSegments: 12 }), m.prop);
    blade.rotation.y = Math.PI / 2 - 0.6;
    prop.add(pivot);
  }
  g.add(prop);
  g.rotation.z = -0.03;
  g.userData.prop = prop;
  return g;
}

// ---------- trailer and stands ----------

function trailer(lines, m) {
  const { L, B } = lines;
  const g = new THREE.Group();
  const beamY = 0.5;
  const beam = (x0, x1, z0, z1, size = 0.1) => {
    const a = v3(x0, beamY, z0);
    const b = v3(x1, beamY, z1);
    const len = a.distanceTo(b);
    const mesh = add(g, new THREE.BoxGeometry(len, size, size), m.galv);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  };
  for (const z of [0.42, -0.42]) beam(-0.35, L + 0.1, z, z);
  for (const z of [0.42, -0.42]) beam(L + 0.1, L + 1.5, z, 0);
  beam(L + 1.0, L + 1.9, 0, 0, 0.09);
  for (const x of [0.15, L * 0.33, L * 0.62, L - 0.15]) beam(x, x + 0.001, -0.78, 0.78, 0.09);

  const coupling = add(g, new THREE.SphereGeometry(0.07, 16, 10), m.galv);
  coupling.position.set(L + 1.95, beamY + 0.02, 0);
  const jockey = add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.07, 20), m.tyre);
  jockey.position.set(L + 1.45, 0.1, 0.16);
  jockey.rotation.x = Math.PI / 2;
  rod(g, v3(L + 1.45, 0.12, 0.16), v3(L + 1.45, beamY + 0.25, 0.16), 0.03, m.galv);

  // Axle, wheels and guards sit just inside the chines.
  const axleX = L * 0.42;
  const wheelZ = B / 2 - 0.12;
  rod(g, v3(axleX, 0.34, -wheelZ), v3(axleX, 0.34, wheelZ), 0.035, m.galv);
  for (const side of [1, -1]) {
    for (const dx of [-0.4, 0.4]) {
      const x = axleX + dx;
      const tyre = add(g, new THREE.CylinderGeometry(0.33, 0.33, 0.2, 32), m.tyre);
      tyre.position.set(x, 0.33, side * wheelZ);
      tyre.rotation.x = Math.PI / 2;
      const rim = add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.21, 24), m.galv);
      rim.position.copy(tyre.position);
      rim.rotation.x = Math.PI / 2;
    }
    // Open half-cylinder over the tandem pair, stretched fore and aft.
    const guard = add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.26, 32, 1, true, Math.PI / 2, Math.PI), m.galv);
    guard.scale.set(2.1, 1, 1);
    guard.position.set(axleX, 0.36, side * wheelZ);
    guard.rotation.x = Math.PI / 2;
    rod(g, v3(axleX, beamY, side * 0.42), v3(axleX, 0.6, side * (wheelZ - 0.1)), 0.03, m.galv);
  }

  // Keel rollers under the keel bar and carpeted skids matched to the deadrise.
  const contact = (t, z) => {
    const s = lines.section(t);
    return TRAILER_LIFT + lerp(s.yk, s.yc, Math.min(1, z / s.zc));
  };
  for (const t of [0.08, 0.3, 0.52, 0.7]) {
    const x = t * L;
    const top = contact(t, 0) - KEEL_BAR;
    rod(g, v3(x, beamY, 0), v3(x, top - 0.06, 0), 0.03, m.galv);
    const roller = add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.22, 16), m.rubber);
    roller.position.set(x, top - 0.05, 0);
    roller.rotation.x = Math.PI / 2;
  }
  const skidZ = 0.56;
  for (const side of [1, -1]) {
    const t0 = 0.05;
    const t1 = 0.58;
    const y0 = contact(t0, skidZ);
    const y1 = contact(t1, skidZ);
    const skid = add(g, new THREE.BoxGeometry((t1 - t0) * L, 0.07, 0.12), m.carpet);
    skid.position.set(((t0 + t1) / 2) * L, (y0 + y1) / 2 - 0.04, side * skidZ);
    skid.rotation.x = side * lines.section(0.3).dr * 0.9;
    for (const t of [0.12, 0.5]) rod(g, v3(t * L, beamY, side * 0.42), v3(t * L, contact(t, skidZ) - 0.07, side * skidZ), 0.025, m.galv);
  }

  // Winch post with bow snubber.
  const postX = L + 0.12;
  const postTop = TRAILER_LIFT + lines.keel(0.97) + 0.12;
  rod(g, v3(postX, beamY, 0), v3(postX, postTop, 0), 0.045, m.galv);
  rod(g, v3(postX + 0.55, beamY, 0), v3(postX, postTop - 0.2, 0), 0.03, m.galv);
  const winch = add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.16, 16), m.galv);
  winch.position.set(postX + 0.05, postTop - 0.25, 0);
  winch.rotation.x = Math.PI / 2;
  const snubber = add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.2, 16), m.rubber);
  snubber.position.set(postX - 0.06, postTop - 0.02, 0);
  snubber.rotation.x = Math.PI / 2;

  const lightBar = add(g, new THREE.BoxGeometry(0.05, 0.08, 1.9), m.galv);
  lightBar.position.set(-0.6, 0.72, 0);
  for (const side of [1, -1]) {
    const light = add(g, new THREE.BoxGeometry(0.03, 0.09, 0.18), m.tailLight);
    light.position.set(-0.64, 0.72, side * 0.86);
  }
  rod(g, v3(-0.35, beamY, 0.42), v3(-0.6, 0.72, 0.42), 0.025, m.galv);
  rod(g, v3(-0.35, beamY, -0.42), v3(-0.6, 0.72, -0.42), 0.025, m.galv);
  return mergeStatic(g);
}

function cradle(lines, m) {
  const g = new THREE.Group();
  for (const t of [0.24, 0.6]) {
    const h = CRADLE_LIFT + lines.keel(t) - KEEL_BAR;
    const block = add(g, new THREE.BoxGeometry(0.32, h, 0.5), m.wood);
    block.position.set(t * lines.L, h / 2, 0);
  }
  return g;
}

// ---------- assembly ----------

// Bakes every mesh into one geometry per material and shadow setting, to keep draw calls low.
function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const key = `${mesh.material.uuid}|${mesh.castShadow}`;
    if (!buckets.has(key)) buckets.set(key, { material: mesh.material, cast: mesh.castShadow, parts: [] });
    let geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((geo.attributes.position.count) * 2), 2));
    geo.clearGroups();
    geo.applyMatrix4(mesh.matrixWorld);
    buckets.get(key).parts.push(geo);
    mesh.geometry.dispose();
  });
  const out = new THREE.Group();
  for (const { material, cast, parts } of buckets.values()) {
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    add(out, merged, material, { cast });
  }
  return out;
}

export function buildBoat(build, m) {
  const r = resolve(build);
  const lines = hullLines(r.model);
  const boat = new THREE.Group();
  const twin = r.engine.count === 2;
  const { podTop, podHalf, zi, platY, bottomAt } = hull(boat, lines, m, build, twin);
  if (build.layout === 'ht') hardtop(boat, lines, m, build);
  else centreConsole(boat, lines, m, build);
  bowFittings(boat, lines, m);
  if (build.options.includes('bowrail')) bowRail(boat, lines, m);
  if (build.options.includes('bait')) baitStation(boat, lines, m);

  const plateY = lines.keel(0) + 0.03 - podTop;
  for (const z of twin ? [-0.4, 0.4] : [0]) {
    const engine = outboard(m, r.engine.hp, plateY);
    engine.position.set(-POD, podTop, z);
    boat.add(engine);
  }

  // Underwater lights on the aft faces of the boarding pods.
  const leds = [];
  if (build.options.includes('lights')) {
    for (const side of [-1, 1]) {
      const z = side * (zi + 0.14);
      const lamp = add(boat, new THREE.CircleGeometry(0.045, 20), m.led, { cast: false });
      lamp.position.set(-POD - 0.016, Math.min(platY - 0.1, bottomAt(zi + 0.14) + 0.12), z);
      lamp.rotation.y = -Math.PI / 2;
      leds.push(lamp.position.clone());
    }
  }

  return { boat: mergeStatic(boat), lines, leds, trailer: trailer(lines, m), cradle: cradle(lines, m), podHalf };
}

export function disposeTree(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const mat = child.material;
    if (mat && mat.map && mat.map.isCanvasTexture && !mat.userData.shared) {
      mat.map.dispose();
      mat.dispose();
    }
  });
}
