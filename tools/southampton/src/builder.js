import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
}

// Collects geometry per material key and merges into a handful of draw calls.
// Geometry is normalised to non-indexed position/normal/uv, with box-projected
// UVs in metres so exported GLBs remain texturable in Unreal.
export class Builder {
  constructor(materials) {
    this.materials = materials;
    this.buckets = new Map();
  }

  add(key, geometry, matrix) {
    if (!this.materials[key]) throw new Error('Unknown material ' + key);
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (matrix) g.applyMatrix4(matrix);
    boxUV(g);
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(g);
    return this;
  }

  // Axis-aligned box by min corner & size, optional Y rotation about its centre.
  box(key, x, y, z, w, h, d, ry = 0) {
    return this.add(key, new THREE.BoxGeometry(w, h, d), mat(x + w / 2, y + h / 2, z + d / 2, 0, ry, 0));
  }

  // Box by centre.
  cbox(key, cx, cy, cz, w, h, d, rx = 0, ry = 0, rz = 0) {
    return this.add(key, new THREE.BoxGeometry(w, h, d), mat(cx, cy, cz, rx, ry, rz));
  }

  cyl(key, cx, cy, cz, rTop, rBot, h, seg = 12, rx = 0, ry = 0, rz = 0) {
    return this.add(key, new THREE.CylinderGeometry(rTop, rBot, h, seg), mat(cx, cy, cz, rx, ry, rz));
  }

  // Square-section member between two points.
  strut(key, a, b, w = 0.2, d = w) {
    const dir = _p.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    if (len < 1e-4) return this;
    dir.divideScalar(len);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1));
    return this.add(key, new THREE.BoxGeometry(w, len, d), m);
  }

  // Round member between two points.
  rod(key, a, b, r = 0.1, seg = 6) {
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length();
    if (len < 1e-4) return this;
    dir.divideScalar(len);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), q, new THREE.Vector3(1, 1, 1));
    return this.add(key, new THREE.CylinderGeometry(r, r, len, seg, 1, true), m);
  }

  build({ castShadow = true, receiveShadow = true, name = 'built' } = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, list] of this.buckets) {
      // chunk to keep index counts sane
      for (let i = 0; i < list.length; i += 4000) {
        const merged = mergeGeometries(list.slice(i, i + 4000), false);
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, this.materials[key]);
        mesh.name = `${name}:${key}`;
        mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
        group.add(mesh);
      }
      list.forEach((g) => g.dispose());
    }
    this.buckets.clear();
    return group;
  }
}

function boxUV(g) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
