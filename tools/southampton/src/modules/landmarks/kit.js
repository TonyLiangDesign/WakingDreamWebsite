import * as THREE from 'three';

// Local-frame modelling kit on top of the shared Builder. A Kit carries a world
// matrix (for terrain queries) and emits geometry in the frame of the Builder's
// eventual group (rootInv), so rotated sub-assemblies stay merged.

const _v = new THREE.Vector3();

export function polyGeometry(tris) {
  const pos = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (const [p, q, r] of tris) {
    a.fromArray(p); b.fromArray(q); c.fromArray(r);
    const cr = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (cr.lengthSq() < 1e-10) continue;
    pos.push(...p, ...q, ...r);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// Truncated pyramid: base w×d centred at origin (y=0), top w2×d2 centred at (ox, h, oz).
// w2 = d2 = 0 → pyramid; d2 = 0 → hipped/gabled ridge along x; covers mansards and roofs.
const FR_CACHE = new Map();
export function frustum(w, d, h, w2 = 0, d2 = 0, ox = 0, oz = 0, bottom = false) {
  const key = [w, d, h, w2, d2, ox, oz, bottom].map((v) => +(+v).toFixed(3)).join(',');
  if (FR_CACHE.has(key)) return FR_CACHE.get(key);
  const B = [[-w / 2, 0, -d / 2], [w / 2, 0, -d / 2], [w / 2, 0, d / 2], [-w / 2, 0, d / 2]];
  const T = [[ox - w2 / 2, h, oz - d2 / 2], [ox + w2 / 2, h, oz - d2 / 2], [ox + w2 / 2, h, oz + d2 / 2], [ox - w2 / 2, h, oz + d2 / 2]];
  const tris = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tris.push([B[i], B[j], T[j]], [B[i], T[j], T[i]]);
  }
  tris.push([T[0], T[2], T[1]], [T[0], T[3], T[2]]);
  if (bottom) tris.push([B[0], B[1], B[2]], [B[0], B[2], B[3]]);
  const g = polyGeometry(tris);
  FR_CACHE.set(key, g);
  return g;
}

// Extruded 2D profile (in x-y) with thickness along z, centred on z.
export function extrudeProfile(pts, depth) {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Pointed (lancet) arch outline, springing at y=0, width w, rising `rise` above springing.
export function lancet(w, h, segs = 5) {
  const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, h]];
  const rise = w * Math.sqrt(3) / 2;
  const xAt = (yy) => -w / 2 + Math.sqrt(Math.max(0, w * w - yy * yy));
  for (let i = 1; i < segs; i++) pts.push([xAt((rise * i) / segs), h + (rise * i) / segs]);
  pts.push([0, h + rise]);
  for (let i = segs - 1; i >= 1; i--) pts.push([-xAt((rise * i) / segs), h + (rise * i) / segs]);
  pts.push([-w / 2, h]);
  return pts;
}

export function roundArch(w, h, segs = 6) {
  const pts = [[-w / 2, 0], [w / 2, 0], [w / 2, h]];
  for (let i = 1; i < segs; i++) {
    const a = (i / segs) * Math.PI;
    pts.push([(w / 2) * Math.cos(a), h + (w / 2) * Math.sin(a)]);
  }
  pts.push([-w / 2, h]);
  return pts;
}

export class Kit {
  constructor(builder, world = new THREE.Matrix4(), rootInv = new THREE.Matrix4()) {
    this.b = builder; this.world = world; this.rootInv = rootInv;
    this.local = new THREE.Matrix4().multiplyMatrices(rootInv, world);
  }

  sub(x = 0, y = 0, z = 0, ry = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
    return new Kit(this.b, new THREE.Matrix4().multiplyMatrices(this.world, m), this.rootInv);
  }

  toWorld(x, y, z) { return _v.set(x, y, z).applyMatrix4(this.world).toArray(); }

  add(key, geo, m) {
    const mm = m ? new THREE.Matrix4().multiplyMatrices(this.local, m) : this.local;
    this.b.add(key, geo, mm);
    return this;
  }

  cbox(key, cx, cy, cz, w, h, d, rx = 0, ry = 0, rz = 0) {
    if (w <= 0 || h <= 0 || d <= 0) return this;
    return this.add(key, BOX, M4(cx, cy, cz, rx, ry, rz, w, h, d));
  }

  box(key, x, y, z, w, h, d) { return this.cbox(key, x + w / 2, y + h / 2, z + d / 2, w, h, d); }

  cyl(key, cx, cy, cz, rTop, rBot, h, seg = 12, rx = 0, ry = 0, rz = 0) {
    return this.add(key, cylGeo(rTop, rBot, seg), M4(cx, cy, cz, rx, ry, rz, 1, h, 1));
  }

  // frustum placed with base centre at (cx, y, cz)
  fr(key, cx, y, cz, w, d, h, w2 = 0, d2 = 0, ry = 0, ox = 0, oz = 0) {
    return this.add(key, frustum(w, d, h, w2, d2, ox, oz), M4(cx, y, cz, 0, ry, 0));
  }

  geo(key, g, cx = 0, cy = 0, cz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return this.add(key, g, M4(cx, cy, cz, rx, ry, rz, sx, sy, sz));
  }

  strut(key, a, b, w = 0.2, d = w) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    if (len < 1e-4) return this;
    dir.divideScalar(len);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(w, len, d));
    return this.add(key, BOX, m);
  }

  rod(key, a, b, r = 0.1, seg = 6) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    if (len < 1e-4) return this;
    dir.divideScalar(len);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(r, len, r));
    return this.add(key, cylGeo(1, 1, seg, true), m);
  }

  // Sub-kits for the four faces of a w×d rectangle centred at (cx, cz): local x runs
  // along the face (left→right seen from outside), local -z points outward, wall plane z=0.
  faces(cx, cz, w, d, y = 0) {
    return [
      { k: this.sub(cx, y, cz - d / 2, 0), len: w },
      { k: this.sub(cx + w / 2, y, cz, -Math.PI / 2), len: d },
      { k: this.sub(cx, y, cz + d / 2, Math.PI), len: w },
      { k: this.sub(cx - w / 2, y, cz, Math.PI / 2), len: d },
    ];
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new Map();
function cylGeo(rt, rb, seg, open = false) {
  const key = `${rt},${rb},${seg},${open}`;
  if (!CYL.has(key)) CYL.set(key, new THREE.CylinderGeometry(rt, rb, 1, seg, 1, open));
  return CYL.get(key);
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function M4(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

// A row of windows on a facade sub-kit (wall plane z=0, outward -z).
// opts: glass key, dress key (sill/lintel), arch: 'round'|'pointed'|null
export function windowRow(k, { x0, x1, n, y, ww, wh, glass = 'glass', dress = null, arch = null, skip = null, depth = 0.1, sill = true, hood = true }) {
  if (n <= 0) return;
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    if (skip && skip(i, n)) continue;
    const x = x0 + step * (i + 0.5);
    k.cbox(glass, x, y + wh / 2, -depth / 2 + 0.03, ww, wh, depth);
    if (arch === 'round') k.cyl(glass, x, y + wh, -depth / 2 + 0.03, ww / 2, ww / 2, depth, 8, Math.PI / 2, 0, 0);
    else if (arch === 'pointed') k.geo(glass, frustum(ww, depth, ww * 0.75, 0, depth), x, y + wh, -depth / 2 + 0.03);
    if (dress) {
      if (sill) k.cbox(dress, x, y - 0.1, -0.1, ww + 0.35, 0.2, 0.24);
      if (hood && !arch) k.cbox(dress, x, y + wh + 0.18, -0.08, ww + 0.4, 0.36, 0.2);
    }
  }
}
