import * as THREE from 'three';

// Fast merged-geometry builder. Same API shape as src/builder.js (box/cbox/cyl/strut/rod/add)
// but writes straight into growable typed arrays (no per-primitive BufferGeometry), supports
// a current local frame (push/pop), bottom-less boxes for things standing on the ground,
// and spatial tiling of the output so large estates still frustum-cull.

const UNIT_BOX = (() => {
  // 6 faces × 2 tris, CCW from outside. order: +x -x +y -y +z -z
  const f = [
    [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, 0, 0]],
    [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, 0, 0]],
    [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1], [0, 1, 0]],
    [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [0, -1, 0]],
    [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 0, 1]],
    [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [0, 0, -1]],
  ];
  return f.map(([a, b, c, d, n]) => ({ tris: [a, b, c, a, c, d], n }));
})();

class Bucket {
  constructor() { this.p = new Float32Array(1 << 16); this.n = new Float32Array(1 << 16); this.len = 0; }
  reserve(k) {
    if (this.len + k <= this.p.length) return;
    let cap = this.p.length * 2;
    while (cap < this.len + k) cap *= 2;
    const p = new Float32Array(cap); p.set(this.p.subarray(0, this.len)); this.p = p;
    const n = new Float32Array(cap); n.set(this.n.subarray(0, this.len)); this.n = n;
  }
}

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _v = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class FB {
  constructor(materials, { tile = 0 } = {}) {
    this.M = materials;
    this.buckets = new Map();
    this.F = new THREE.Matrix4();
    this.stack = [];
    this.tile = tile; // metres; 0 = no tiling
    this.tris = 0;
  }

  push(matrix) { this.stack.push(this.F.clone()); this.F = this.F.clone().multiply(matrix); return this; }
  pop() { this.F = this.stack.pop(); return this; }
  // frame with local +X along (ux,uz) at (ox, oz): y rotation
  pushFrame(ox, oz, ang, oy = 0) { return this.push(new THREE.Matrix4().makeRotationY(ang).setPosition(ox, oy, oz)); }

  _bucket(key, wx, wz) {
    if (!this.M[key]) throw new Error('Unknown material ' + key);
    let k = key;
    if (this.tile) k = key + '|' + Math.floor(wx / this.tile) + ',' + Math.floor(wz / this.tile);
    let b = this.buckets.get(k);
    if (!b) { b = new Bucket(); b.key = key; this.buckets.set(k, b); }
    return b;
  }

  // box with arbitrary local matrix (centre + rotation), size w,h,d
  boxMat(key, m, w, h, d, noBottom = false) {
    const e = _m2.multiplyMatrices(this.F, m).elements;
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const b = this._bucket(key, e[12], e[14]);
    const faces = noBottom ? 5 : 6;
    b.reserve(faces * 18);
    let o = b.len;
    const P = b.p, N = b.n;
    for (let fi = 0; fi < 6; fi++) {
      if (noBottom && fi === 3) continue;
      const F = UNIT_BOX[fi];
      const nx = F.n[0], ny = F.n[1], nz = F.n[2];
      const wnx = e[0] * nx + e[4] * ny + e[8] * nz, wny = e[1] * nx + e[5] * ny + e[9] * nz, wnz = e[2] * nx + e[6] * ny + e[10] * nz;
      for (const v of F.tris) {
        const x = v[0] * hw, y = v[1] * hh, z = v[2] * hd;
        P[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
        P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        N[o] = wnx; N[o + 1] = wny; N[o + 2] = wnz;
        o += 3;
      }
    }
    b.len = o;
    this.tris += faces * 2;
    return this;
  }

  // min-corner box, optional y rotation about its centre (like Builder.box)
  box(key, x, y, z, w, h, d, ry = 0, noBottom = false) {
    _m.makeRotationY(ry).setPosition(x + w / 2, y + h / 2, z + d / 2);
    return this.boxMat(key, _m, w, h, d, noBottom);
  }
  // ground box: no bottom face
  gbox(key, x, y, z, w, h, d) { return this.box(key, x, y, z, w, h, d, 0, true); }

  cbox(key, cx, cy, cz, w, h, d, rx = 0, ry = 0, rz = 0, noBottom = false) {
    _m.makeRotationFromEuler(_e.set(rx, ry, rz)).setPosition(cx, cy, cz);
    return this.boxMat(key, _m, w, h, d, noBottom);
  }

  strut(key, a, c, w = 0.2, d = w) {
    _v.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const len = _v.length();
    if (len < 1e-4) return this;
    _v.divideScalar(len);
    _q.setFromUnitVectors(_up, _v);
    _m.compose(_s.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2), _q, new THREE.Vector3(1, 1, 1));
    return this.boxMat(key, _m, w, len, d);
  }

  // generic geometry (indexed or not) with local matrix
  add(key, geometry, matrix) {
    const full = matrix ? _m2.multiplyMatrices(this.F, matrix) : this.F;
    const e = full.elements;
    const nm = new THREE.Matrix3().getNormalMatrix(full).elements;
    const pos = geometry.attributes.position.array, nrm = geometry.attributes.normal?.array;
    const idx = geometry.index ? geometry.index.array : null;
    const count = idx ? idx.length : pos.length / 3;
    const b = this._bucket(key, e[12], e[14]);
    b.reserve(count * 3);
    let o = b.len;
    const P = b.p, N = b.n;
    for (let i = 0; i < count; i++) {
      const j = (idx ? idx[i] : i) * 3;
      const x = pos[j], y = pos[j + 1], z = pos[j + 2];
      P[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      P[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      P[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (nrm) {
        const a = nrm[j], c = nrm[j + 1], d = nrm[j + 2];
        let nx = nm[0] * a + nm[3] * c + nm[6] * d, ny = nm[1] * a + nm[4] * c + nm[7] * d, nz = nm[2] * a + nm[5] * c + nm[8] * d;
        const l = Math.hypot(nx, ny, nz) || 1;
        N[o] = nx / l; N[o + 1] = ny / l; N[o + 2] = nz / l;
      }
      o += 3;
    }
    if (!nrm) { // flat normals
      for (let t = b.len; t < o; t += 9) {
        const ax = P[t + 3] - P[t], ay = P[t + 4] - P[t + 1], az = P[t + 5] - P[t + 2];
        const bx = P[t + 6] - P[t], by = P[t + 7] - P[t + 1], bz = P[t + 8] - P[t + 2];
        let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        for (let k = 0; k < 9; k += 3) { N[t + k] = nx; N[t + k + 1] = ny; N[t + k + 2] = nz; }
      }
    }
    b.len = o;
    this.tris += count / 3;
    return this;
  }

  cyl(key, cx, cy, cz, rTop, rBot, h, seg = 12, rx = 0, ry = 0, rz = 0) {
    return this.add(key, cylGeo(rTop, rBot, h, seg), _mm(cx, cy, cz, rx, ry, rz));
  }

  rod(key, a, c, r = 0.1, seg = 5) {
    _v.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const len = _v.length();
    if (len < 1e-4) return this;
    _v.divideScalar(len);
    _q.setFromUnitVectors(_up, _v);
    const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2), _q, new THREE.Vector3(r, len, r));
    return this.add(key, openCylUnit(seg), m);
  }

  // quad (4 points, CCW seen from the front) — cheap planes for roofs etc.
  quad(key, a, b, c, d) {
    const g = QUAD_GEO;
    const p = g.attributes.position.array;
    p.set([...a, ...b, ...c, ...a, ...c, ...d]);
    g.deleteAttribute('normal');
    const r = this.add(key, g, null);
    return r;
  }

  // convex planar polygon (fan), oriented so its normal points along `hint` (local vector)
  poly(key, pts, hint) {
    const a = pts[0], b = pts[1], c = pts[2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const flip = hint && nx * hint[0] + ny * hint[1] + nz * hint[2] < 0;
    const n = pts.length, arr = new Float32Array((n - 2) * 9);
    for (let i = 1; i < n - 1; i++) {
      const p1 = flip ? pts[i + 1] : pts[i], p2 = flip ? pts[i] : pts[i + 1];
      arr.set([...a, ...p1, ...p2], (i - 1) * 9);
    }
    POLY_GEO.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    POLY_GEO.deleteAttribute('normal');
    return this.add(key, POLY_GEO, null);
  }
  // axis-aligned rectangle facing one axis direction: axis 'x'|'y'|'z', sign ±1, centre, size (u,v)
  panel(key, cx, cy, cz, axis, sign, w, h) {
    const hw = w / 2, hh = h / 2;
    let pts;
    if (axis === 'x') pts = [[cx, cy - hh, cz - hw], [cx, cy - hh, cz + hw], [cx, cy + hh, cz + hw], [cx, cy + hh, cz - hw]];
    else if (axis === 'z') pts = [[cx - hw, cy - hh, cz], [cx + hw, cy - hh, cz], [cx + hw, cy + hh, cz], [cx - hw, cy + hh, cz]];
    else pts = [[cx - hw, cy, cz - hh], [cx + hw, cy, cz - hh], [cx + hw, cy, cz + hh], [cx - hw, cy, cz + hh]];
    const hint = axis === 'x' ? [sign, 0, 0] : axis === 'y' ? [0, sign, 0] : [0, 0, sign];
    return this.poly(key, pts, hint);
  }

  build(name = 'estateDetail', { castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [k, b] of this.buckets) {
      if (!b.len) continue;
      const g = new THREE.BufferGeometry();
      const p = b.p.slice(0, b.len), n = b.n.slice(0, b.len);
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
      // box-projected metre UVs (for GLB export parity with Builder)
      const cnt = b.len / 3, uv = new Float32Array(cnt * 2);
      for (let i = 0; i < cnt; i++) {
        const ax = Math.abs(n[i * 3]), ay = Math.abs(n[i * 3 + 1]), az = Math.abs(n[i * 3 + 2]);
        if (ay >= ax && ay >= az) { uv[i * 2] = p[i * 3]; uv[i * 2 + 1] = p[i * 3 + 2]; }
        else if (ax >= az) { uv[i * 2] = p[i * 3 + 2]; uv[i * 2 + 1] = p[i * 3 + 1]; }
        else { uv[i * 2] = p[i * 3]; uv[i * 2 + 1] = p[i * 3 + 1]; }
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, this.M[b.key]);
      mesh.name = `${name}:${k}`;
      mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }
}

const POLY_GEO = new THREE.BufferGeometry();
const QUAD_GEO = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3)); return g; })();

function _mm(x, y, z, rx, ry, rz) {
  return new THREE.Matrix4().makeRotationFromEuler(_e.set(rx, ry, rz)).setPosition(x, y, z);
}

const cylCache = new Map();
export function cylGeo(rTop, rBot, h, seg) {
  const k = `${rTop}|${rBot}|${h}|${seg}`;
  let g = cylCache.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rTop, rBot, h, seg); cylCache.set(k, g); }
  return g;
}
const openCache = new Map();
function openCylUnit(seg) {
  let g = openCache.get(seg);
  if (!g) { g = new THREE.CylinderGeometry(1, 1, 1, seg, 1, true); openCache.set(seg, g); }
  return g;
}

export function M4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
}

// Instanced prototypes: build a prototype once with an FB at the origin, then scatter.
export class Instancer {
  constructor(materials) { this.M = materials; this.types = new Map(); }
  define(name, buildFn) {
    const fb = new FB(this.M);
    buildFn(fb);
    const parts = [];
    let tris = 0;
    for (const [k, b] of fb.buckets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(b.p.slice(0, b.len), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(b.n.slice(0, b.len), 3));
      parts.push({ key: b.key, geo: g });
      tris += b.len / 9;
    }
    this.types.set(name, { parts, mats: [], tris });
  }
  has(name) { return this.types.has(name); }
  place(name, matrix) { this.types.get(name).mats.push(matrix.clone()); }
  at(name, x, y, z, ry = 0, s = 1) { this.types.get(name).mats.push(new THREE.Matrix4().makeRotationY(ry).scale(_s.set(s, s, s)).setPosition(x, y, z)); }
  build(name = 'instances') {
    const group = new THREE.Group();
    group.name = name;
    let tris = 0;
    for (const [tn, t] of this.types) {
      if (!t.mats.length) continue;
      for (const part of t.parts) {
        const mesh = new THREE.InstancedMesh(part.geo, this.M[part.key], t.mats.length);
        t.mats.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.name = `${name}:${tn}:${part.key}`;
        group.add(mesh);
      }
      tris += t.tris * t.mats.length;
    }
    group.userData.tris = tris;
    return group;
  }
}
