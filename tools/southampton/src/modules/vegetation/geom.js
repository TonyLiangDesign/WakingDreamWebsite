import * as THREE from 'three';
import { mergeVertices, mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Procedural crown geometry. Every mesh carries position, normal and a vertex colour
// that bakes ambient occlusion (dark underside / crevices between lobes). Normals are
// bent toward the crown centre so low-poly lumps shade like soft foliage masses
// instead of facets. Unit conventions (instance scale = (W, H, W)):
//   trees:  ground at y = 0, top at y = 1, crown width 1
//   blobs:  centred on origin, radius 0.5 in xz, bottom cut

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randDir(r) {
  const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return new THREE.Vector3(s * Math.cos(t), u, s * Math.sin(t));
}

// Lumpy sphere: icosahedron displaced by a sum of lobes. Returns indexed geometry
// with position/normal/color, in a unit sphere-ish frame (radius ~1).
export function lumpy({ detail = 1, lumps = 6, amp = 0.28, sharp = 3, seed = 1, flatBottom = -0.45, cutBelow = null, upBias = 0.3, rough = 0.06, bend = 0.72, aoBase = 0.42, base = 'ico' }) {
  const r = rng(seed);
  let g = base === 'dodeca' ? new THREE.DodecahedronGeometry(1, detail) : new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const dirs = [];
  for (let i = 0; i < lumps; i++) {
    const d = randDir(r); d.y = d.y * (1 - upBias) + upBias; d.normalize();
    dirs.push([d, amp * (0.5 + r()), sharp * (0.7 + 0.6 * r())]);
  }
  const p = g.attributes.position;
  const disp = new Float32Array(p.count);
  const v = new THREE.Vector3();
  let dmin = Infinity, dmax = -Infinity;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let d = 1 - amp * 0.6;
    for (const [dir, a, s] of dirs) d += a * Math.pow(Math.max(0, v.dot(dir)), s);
    d += (r() - 0.5) * rough * 2;
    disp[i] = d; dmin = Math.min(dmin, d); dmax = Math.max(dmax, d);
    v.multiplyScalar(d);
    if (v.y < flatBottom) v.y = flatBottom + (v.y - flatBottom) * 0.25;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  // normalise to unit radius horizontally
  g.computeBoundingBox();
  const bb = g.boundingBox;
  const sx = 2 / Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  const cyo = (bb.max.y + bb.min.y) / 2, sy = 2 / (bb.max.y - bb.min.y);
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * sx, (p.getY(i) - cyo) * sy, p.getZ(i) * sx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
    v.set(px, py * 0.8, pz).normalize();
    const nx = n.getX(i) * (1 - bend) + v.x * bend, ny = n.getY(i) * (1 - bend) + v.y * bend, nz = n.getZ(i) * (1 - bend) + v.z * bend;
    const l = Math.hypot(nx, ny, nz);
    n.setXYZ(i, nx / l, ny / l, nz / l);
    const hgt = THREE.MathUtils.smoothstep(py, -1, 0.9);
    const crev = THREE.MathUtils.smoothstep((disp[i] - dmin) / Math.max(dmax - dmin, 1e-3), 0.0, 0.75);
    const ao = aoBase + (1 - aoBase) * (0.35 + 0.65 * hgt) * (0.55 + 0.45 * crev);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (cutBelow !== null) cutTris(g, cutBelow);
  return g;
}

// drop triangles whose vertices are all below y
function cutTris(g, y) {
  const idx = g.index.array, p = g.attributes.position;
  const keep = [];
  for (let i = 0; i < idx.length; i += 3) {
    if (p.getY(idx[i]) < y && p.getY(idx[i + 1]) < y && p.getY(idx[i + 2]) < y) continue;
    keep.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  g.setIndex(keep);
}

function xform(g, m) { g.applyMatrix4(m); return g; }
const M4 = (x, y, z, sx, sy, sz, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz));

function trunk(r0, r1, y0, y1, shade = 0.28, seg = 5, lean = 0) {
  let g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1, true);
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);
  g.translate(0, (y0 + y1) / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + lean * (p.getY(i) - y0));
  g.computeVertexNormals();
  const col = new Float32Array(p.count * 3).fill(shade);
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) - y0) / (y1 - y0); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade * (0.6 + 0.4 * t); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// A few limbs forking from the trunk into the crown (visible on bare April trees seen low).
function limbs(seed, n, y0, y1, spread, r0, shade) {
  const r = rng(seed * 31 + 7);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.8;
    const top = new THREE.Vector3(Math.cos(a) * spread * (0.6 + 0.4 * r()), y1 - r() * 0.1, Math.sin(a) * spread * (0.6 + 0.4 * r()));
    const bot = new THREE.Vector3(0, y0, 0);
    const len = top.distanceTo(bot);
    let g = new THREE.CylinderGeometry(r0 * 0.4, r0, len, 4, 1, true);
    g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-5);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(bot, q, new THREE.Vector3(1, 1, 1)));
    g.computeVertexNormals();
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(shade), 3));
    out.push(g);
  }
  return out;
}

// crown centre (unit space) + weight per vertex: the material bends per-pixel normals toward it
// aShell: ellipsoidal radius of each vertex about the crown centre (0 centre .. ~1 outer surface),
// used by the airy-crown shader to dissolve the outer shell into twigs.
function crownAttr(g, cx, cy, cz, w, rx = 0.5, ry = null) {
  const p = g.attributes.position, n = p.count, a = new Float32Array(n * 4), sh = new Float32Array(n);
  if (ry === null) { g.computeBoundingBox(); ry = Math.max((g.boundingBox.max.y - g.boundingBox.min.y) / 2, 1e-3); }
  for (let i = 0; i < n; i++) {
    a[i * 4] = cx; a[i * 4 + 1] = cy; a[i * 4 + 2] = cz; a[i * 4 + 3] = w;
    sh[i] = w > 0 ? Math.hypot((p.getX(i) - cx) / rx, (p.getY(i) - cy) / ry, (p.getZ(i) - cz) / rx) : 0;
  }
  g.setAttribute('aCrown', new THREE.BufferAttribute(a, 4));
  g.setAttribute('aShell', new THREE.BufferAttribute(sh, 1));
  return g;
}

function merge(list) {
  const ok = list.map((g) => (g.attributes.aCrown ? g : crownAttr(g, 0, 0, 0, 0)));
  const m = mergeGeometries(ok, false);
  m.computeBoundingSphere();
  return m;
}

// ---------------------------------------------------------------- tree variants
// Crown as a cluster of branch-mass lobes (irregular silhouette), normals bent toward
// the crown centre so the whole reads as one soft volume with lobes.
function lobeCrown(seed, { n = 5, detail = 0, cy, hh, spread = 0.26, lobeR = [0.2, 0.3], bend = 0.6 }) {
  const r = rng(seed * 7 + 13);
  const parts = [];
  const centre = new THREE.Vector3(0, cy, 0);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rad = (i === 0 ? 0 : spread * (0.6 + 0.4 * r()));
    const ly = cy + (i === 0 ? hh * 0.05 : (r() - 0.45) * hh * 0.85);
    const lr = lobeR[0] + (lobeR[1] - lobeR[0]) * r() + (i === 0 ? 0.06 : 0);
    const g = lumpy({ detail, lumps: 3, amp: 0.22, seed: seed * 31 + i * 7, flatBottom: -0.85, bend: 0, aoBase: 0.5 });
    xform(g, M4(Math.cos(a) * rad, ly, Math.sin(a) * rad, lr, lr * (hh / 0.5) * (i === 0 ? 1.35 : 1.1), lr, r() * 6));
    parts.push(g);
  }
  const m = mergeGeometries(parts, false);
  const p = m.attributes.position, nr = m.attributes.normal, col = m.attributes.color;
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(centre); v.y /= (hh / 0.5); 
    const dist = v.length();
    v.normalize();
    w.fromBufferAttribute(nr, i).multiplyScalar(1 - bend).addScaledVector(v, bend).normalize();
    nr.setXYZ(i, w.x, w.y, w.z);
    // interior lobe surfaces (close to centre) are occluded
    const occl = THREE.MathUtils.smoothstep(dist, 0.12, 0.42);
    const hgt = THREE.MathUtils.smoothstep(v.y, -0.8, 0.8);
    const c = col.getX(i) * (0.45 + 0.55 * occl) * (0.7 + 0.3 * hgt);
    col.setXYZ(i, c, c, c);
  }
  m.computeBoundingBox();
  const bb = m.boundingBox;
  return crownAttr(m, 0, cy, 0, 0.92, Math.max(bb.max.x, -bb.min.x, bb.max.z, -bb.min.z), Math.max(bb.max.y - cy, cy - bb.min.y));
}

// Broadleaf, trunk (+ limbs) + lobed crown (y crownBottom..1).
export function broadleaf(seed, { detail = 1, withLimbs = false, crownBottom = 0.22, lobes = 5, trunkSeg = 5, lobeDetail = 0, blob = false, spread = null } = {}) {
  const r = rng(seed);
  const cy = (crownBottom + 1) / 2, hh = (1 - crownBottom) / 2;
  const crown = blob
    ? crownAttr(xform(lumpy({ detail: 1, lumps: 6, amp: 0.34, sharp: 2.6, seed: seed * 17 + 5, flatBottom: -0.8, cutBelow: -0.85, upBias: 0.2, rough: 0.04, bend: 0.8, aoBase: 1 }), M4(0, cy, 0, 0.5, hh, 0.5, r() * 6)), 0, cy, 0, 1.0, 0.5, hh)
    : detail >= 1
    ? lobeCrown(seed, { n: lobes, detail: lobeDetail, cy, hh, spread: spread ?? (lobes <= 3 ? 0.2 : 0.25), lobeR: lobes <= 3 ? [0.27, 0.34] : [0.24, 0.31] })
    : xform(lumpy({ detail, lumps: 9, amp: 0.42, sharp: 3.2, seed: seed * 13 + 1, flatBottom: -0.6, upBias: 0.15, rough: 0.1 }), M4(0, cy, 0, 0.5, hh, 0.5, r() * 6));
  const parts = [crown, trunk(0.035, 0.022, -0.05, crownBottom + hh * 0.5, 0.22, trunkSeg)];
  if (withLimbs) parts.push(...limbs(seed, 3, crownBottom * 0.85, cy + hh * 0.45, 0.3, 0.02, 0.2), ...limbs(seed + 9, 2, cy - hh * 0.2, cy + hh * 0.75, 0.2, 0.012, 0.22));
  return merge(parts);
}

// Woodland crown: one lumpy dome (20 tris), optional 3-sided trunk for wood-edge trees.
// Unit tree: ground y = 0, top y = 1, width 1.
export function woodCrown(seed, { withTrunk = false, bottom = 0.42, pine = false, base = 'ico', detail = 0, cut = false, clump = false } = {}) {
  const cy = pine ? 0.8 : (bottom + 1) / 2, hh = pine ? 0.2 : (1 - bottom) / 2;
  const g = lumpy({ detail, lumps: clump ? 12 : pine ? 4 : 7, amp: clump ? 0.55 : pine ? 0.28 : 0.34, sharp: clump ? 4 : 2.6, seed: seed * 29 + 3, flatBottom: clump ? -0.5 : -0.7, upBias: 0.25, rough: 0.05, bend: 0.8, aoBase: 1, base, cutBelow: detail > 0 ? (withTrunk ? -0.45 : -0.3) : cut ? -0.45 : null });
  xform(g, M4(0, cy, 0, 0.5, hh, 0.5));
  crownAttr(g, 0, cy, 0, 1.0, 0.5, hh);
  const parts = [g];
  if (withTrunk) parts.push(trunk(0.03, 0.02, -0.05, cy, 0.2, 3));
  return merge(parts);
}

// Two-lobed broadleaf (elm-like, taller and more irregular).
export function elm(seed, { detail = 1 } = {}) {
  const top = lobeCrown(seed + 100, { n: 3, detail: 1, cy: 0.72, hh: 0.27, spread: 0.17, lobeR: [0.18, 0.25] });
  const low = lobeCrown(seed + 200, { n: 2, detail: 0, cy: 0.44, hh: 0.16, spread: 0.14, lobeR: [0.13, 0.17] });
  low.translate(0.1, 0, -0.05);
  return merge([top, low, trunk(0.03, 0.02, -0.05, 0.7, 0.26, 5), ...limbs(seed, 3, 0.25, 0.85, 0.2, 0.016, 0.2)]);
}

// Scots pine: tall clean trunk, flat irregular crown masses at the top.
export function pine(seed, { detail = 1 } = {}) {
  const r = rng(seed);
  const main = xform(lumpy({ detail, lumps: 5, amp: 0.3, sharp: 2, seed: seed * 5 + 9, flatBottom: -0.35, upBias: 0.1, bend: 0.4, aoBase: 0.4 }), M4(r() * 0.1, 0.86, 0, 0.5, 0.14, 0.5, r() * 6));
  crownAttr(main, 0, 0.86, 0, 0.5, 0.5, 0.14);
  const sec = xform(lumpy({ detail: 0, lumps: 3, amp: 0.25, seed: seed * 5 + 11, flatBottom: -0.3, aoBase: 0.4 }), M4(-0.18, 0.7, 0.12, 0.3, 0.09, 0.28, r() * 6));
  return merge([main, sec, trunk(0.022, 0.014, -0.05, 0.84, 0.33, 5, (r() - 0.5) * 0.08)]);
}

// Holly / yew: dense dark cone-ish mass almost to the ground.
export function holly(seed, { detail = 1 } = {}) {
  const g = lumpy({ detail, lumps: 5, amp: 0.2, seed: seed * 3 + 17, flatBottom: -0.8, bend: 0.45, aoBase: 0.35 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), t = 1 - 0.45 * THREE.MathUtils.smoothstep(y, -0.6, 1);
    p.setX(i, p.getX(i) * t); p.setZ(i, p.getZ(i) * t);
  }
  xform(g, M4(0, 0.56, 0, 0.5, 0.45, 0.5));
  crownAttr(g, 0, 0.56, 0, 0.6, 0.5, 0.45);
  return merge([g, trunk(0.04, 0.03, -0.05, 0.2, 0.25, 4)]);
}

// Low shrub / scrub mound, ground at y = 0.
export function shrub(seed, { detail = 0 } = {}) {
  const g = lumpy({ detail, lumps: 4, amp: 0.3, seed: seed * 23 + 1, flatBottom: -0.6, cutBelow: -0.5, bend: 0.5 });
  return merge([xform(g, M4(0, 0.45, 0, 0.5, 0.55, 0.5))]);
}

export function triCount(g) { return (g.index ? g.index.count : g.attributes.position.count) / 3; }
