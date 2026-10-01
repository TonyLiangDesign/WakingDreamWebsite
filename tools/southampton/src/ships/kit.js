import * as THREE from 'three';
import { ropeBeforeRender } from './materials.js';

// Geometry accumulator for ships: one bucket per material key, vertex colours per part,
// so a whole liner collapses to a handful of draw calls. All geometry is non-indexed.

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const _nm = new THREE.Matrix3();
const Y = new THREE.Vector3(0, 1, 0);

const colorCache = new Map();
export function col(hex) {
  let c = colorCache.get(hex);
  if (!c) { const k = new THREE.Color(hex); c = [k.r, k.g, k.b]; colorCache.set(hex, c); }
  return c;
}
export function shade(hex, f) { const c = col(hex); return [c[0] * f, c[1] * f, c[2] * f]; }

// ---------------------------------------------------------------- templates (cached)
const T = {};
function nonIndexed(g) {
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  return n;
}
export function tpl(name, make) {
  if (!T[name]) T[name] = nonIndexed(make());
  return T[name];
}
export const unitBox = () => tpl('box', () => new THREE.BoxGeometry(1, 1, 1));
export const unitCyl = (seg = 8, open = false) => tpl(`cyl${seg}${open}`, () => new THREE.CylinderGeometry(1, 1, 1, seg, 1, open));

export class Mesher {
  constructor() { this.b = new Map(); this.tris = 0; }
  bucket(key) {
    let o = this.b.get(key);
    if (!o) { o = { p: [], n: [], c: [], uv: [] }; this.b.set(key, o); }
    return o;
  }

  // triangle; if `want` (normal hint [x,y,z]) is given the winding is flipped to face it
  tri(key, a, b, c, color, want) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b);
    const len = _n.length();
    if (len < 1e-9) return;
    _n.divideScalar(len);
    if (want && _n.x * want[0] + _n.y * want[1] + _n.z * want[2] < 0) { const t = b; b = c; c = t; _n.negate(); }
    const o = this.bucket(key);
    o.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) { o.n.push(_n.x, _n.y, _n.z); o.c.push(color[0], color[1], color[2]); }
  }
  quad(key, a, b, c, d, color, want) {
    if (!want) {
      _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      _n.crossVectors(_a, _b); want = [_n.x, _n.y, _n.z];
    }
    this.tri(key, a, b, c, color, want);
    this.tri(key, a, c, d, color, want);
  }

  // quad with explicit per-vertex normals (smooth curved plating); winding follows na
  quadN(key, a, b, c, d, color, na, nb, nc = nb, nd = na) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b);
    const flip = _n.x * na[0] + _n.y * na[1] + _n.z * na[2] < 0;
    const V = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    const N = flip ? [na, nc, nb, na, nd, nc] : [na, nb, nc, na, nc, nd];
    const o = this.bucket(key);
    for (let i = 0; i < 6; i++) {
      o.p.push(V[i][0], V[i][1], V[i][2]); o.n.push(N[i][0], N[i][1], N[i][2]); o.c.push(color[0], color[1], color[2]);
    }
  }

  // append a template geometry transformed by a matrix
  geo(key, g, m, color) {
    const o = this.bucket(key);
    const P = g.attributes.position, N = g.attributes.normal, CC = g.attributes.color;
    _nm.getNormalMatrix(m);
    for (let i = 0; i < P.count; i++) {
      _p.fromBufferAttribute(P, i).applyMatrix4(m);
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
      o.p.push(_p.x, _p.y, _p.z); o.n.push(_n.x, _n.y, _n.z);
      if (CC) o.c.push(CC.getX(i), CC.getY(i), CC.getZ(i)); else o.c.push(color[0], color[1], color[2]);
    }
  }

  // centre-sized box, optional rotation about Y (and X/Z)
  box(key, cx, cy, cz, w, h, d, color, ry = 0, rx = 0, rz = 0) {
    _m.compose(_p.set(cx, cy, cz), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(w, h, d));
    this.geo(key, unitBox(), _m, color);
  }
  // min-corner box
  mbox(key, x, y, z, w, h, d, color) { this.box(key, x + w / 2, y + h / 2, z + d / 2, w, h, d, color); }

  cyl(key, cx, y0, cz, r, h, color, seg = 8, open = false, rz2 = r) {
    _m.compose(_p.set(cx, y0 + h / 2, cz), _q.identity(), _s.set(r, h, rz2));
    this.geo(key, unitCyl(seg, open), _m, color);
  }

  // round member between two points
  rod(key, a, b, r, color, seg = 4, open = true) {
    if (key === 'dark' && r <= 0.06) { key = 'rope'; seg = Math.max(seg, 4); }
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _a.length();
    if (len < 1e-4) return;
    _q.setFromUnitVectors(Y, _a.divideScalar(len));
    _m.compose(_p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s.set(r, len, r));
    this.geo(key, unitCyl(seg, open), _m, color);
  }
  // square member between two points
  strut(key, a, b, w, color, d = w) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = _a.length();
    if (len < 1e-4) return;
    _q.setFromUnitVectors(Y, _a.divideScalar(len));
    _m.compose(_p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), _q, _s.set(w, len, d));
    this.geo(key, unitBox(), _m, color);
  }

  // textured ribbon quad (rails): a,b bottom points, height h, u0/u1 texture coords
  ribbon(key, a, b, h, u0, u1, color) {
    const o = this.bucket(key);
    _a.set(b[0] - a[0], 0, b[2] - a[2]);
    _n.set(-_a.z, 0, _a.x).normalize();
    const v = [a[0], a[1], a[2], b[0], b[1], b[2], b[0], b[1] + h, b[2], a[0], a[1], a[2], b[0], b[1] + h, b[2], a[0], a[1] + h, a[2]];
    const uv = [u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1];
    for (let i = 0; i < 6; i++) {
      o.p.push(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]); o.n.push(_n.x, _n.y, _n.z);
      o.c.push(color[0], color[1], color[2]); o.uv.push(uv[i * 2], uv[i * 2 + 1]);
    }
  }

  build(materials, name) {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, o] of this.b) {
      if (!o.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
      if (o.uv.length) g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
      else g.setAttribute('uv', new THREE.Float32BufferAttribute(boxUV(o.p, o.n), 2)); // metres, for GLB export
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, materials[key]);
      mesh.name = `${name}:${key}`;
      mesh.castShadow = true; mesh.receiveShadow = true;
      if (materials[key]?.userData?.isRope) mesh.onBeforeRender = ropeBeforeRender;
      group.add(mesh);
      this.tris += o.p.length / 9;
    }
    this.b.clear();
    return group;
  }
}

export const mat4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

function boxUV(p, n) {
  const uv = new Float32Array((p.length / 3) * 2);
  for (let i = 0, j = 0; i < p.length; i += 3, j += 2) {
    const ax = Math.abs(n[i]), ay = Math.abs(n[i + 1]), az = Math.abs(n[i + 2]);
    if (ay >= ax && ay >= az) { uv[j] = p[i]; uv[j + 1] = p[i + 2]; }
    else if (ax >= az) { uv[j] = p[i + 2]; uv[j + 1] = p[i + 1]; }
    else { uv[j] = p[i]; uv[j + 1] = p[i + 1]; }
  }
  return uv;
}
