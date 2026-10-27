import * as THREE from 'three';

// Shared geometry helpers for every part of the boat. Pure functions of their arguments:
// they make meshes and geometry and know nothing about the Harbour itself.
// Boat-local coordinates: x runs from the transom (0) to the bow (L), y is up with the
// waterline at 0, z is to starboard.

export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
export const lerp = THREE.MathUtils.lerp;
export const clamp01 = (u) => Math.min(1, Math.max(0, u));

export function add(group, geometry, material, { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  group.add(mesh);
  return mesh;
}

export function tube(points, radius, segments = 64, radial = 8, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : v3(...p))), closed, 'centripetal');
  return new THREE.TubeGeometry(curve, segments, radius, radial, closed);
}

// These templates never change. Mesh transforms supply dimensions, and mergeStatic bakes
// them into the final buffers. Keep templates on the CPU for the next configuration.
const primitiveTemplates = new Set();
const cylinders = new Map();
const unitBox = new THREE.BoxGeometry();
primitiveTemplates.add(unitBox);

export function rod(group, a, b, radius, material, radialSegments = 10) {
  const dir = new THREE.Vector3().subVectors(b, a);
  if (!cylinders.has(radialSegments)) {
    const geometry = new THREE.CylinderGeometry(1, 1, 1, radialSegments);
    cylinders.set(radialSegments, geometry);
    primitiveTemplates.add(geometry);
  }
  const mesh = add(group, cylinders.get(radialSegments), material);
  mesh.scale.set(radius, dir.length(), radius);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(v3(0, 1, 0), dir.normalize());
  return mesh;
}

export function box(group, material, [sx, sy, sz], [x, y, z], opts) {
  const mesh = add(group, unitBox, material, opts);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  return mesh;
}

export function extrudeProfile(points, depth, bevel = 0.025) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Flat face in the y-z plane at x, from a polygon of [z, y] points.
export function crossSection(points, x) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(-z, y))));
  g.rotateY(Math.PI / 2);
  g.translate(x, 0, 0);
  return g;
}

// Strip surface through matching profiles at successive stations, mirrored to port.
// Repeat a profile point to get a crisp crease there.
export function ribbon(stations, mirror = true) {
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
export function loft(rings) {
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
export function sectionRing(x, y0, hh, hw, p = 2.8, n = 28) {
  return Array.from({ length: n }, (_, j) => {
    const a = (j / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return v3(x, y0 + hh * Math.sign(s) * Math.abs(s) ** (2 / p), hw * Math.sign(c) * Math.abs(c) ** (2 / p));
  });
}

export const spaced = (t0, t1, n, ease = (u) => u) => Array.from({ length: n + 1 }, (_, i) => lerp(t0, t1, ease(i / n)));

// Bakes every mesh into one geometry per material and shadow setting, to keep draw calls low.
export function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const buckets = new Map();
  group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`;
    if (!buckets.has(key)) buckets.set(key, { material: mesh.material, cast: mesh.castShadow, receive: mesh.receiveShadow, parts: [], vertices: 0, indices: 0 });
    const bucket = buckets.get(key);
    bucket.parts.push(mesh);
    bucket.vertices += mesh.geometry.attributes.position.count;
    bucket.indices += mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count;
  });
  const out = new THREE.Group();
  const v = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const disposed = new Set();
  for (const { material, cast, receive, parts, vertices, indices } of buckets.values()) {
    // Allocate final GPU buffers once. Keep shared vertices instead of expanding every
    // triangle, cloning each part, then copying the clones into another merged allocation.
    const position = new Float32Array(vertices * 3);
    const normal = new Float32Array(vertices * 3);
    const uv = new Float32Array(vertices * 2);
    const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    let vertexOffset = 0, indexOffset = 0;
    for (const mesh of parts) {
      const g = mesh.geometry;
      const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
      normalMatrix.getNormalMatrix(mesh.matrixWorld);
      for (let i = 0; i < p.count; i++) {
        const j = vertexOffset + i;
        v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld).toArray(position, j * 3);
        if (n) v.fromBufferAttribute(n, i).applyNormalMatrix(normalMatrix).toArray(normal, j * 3);
        if (t) { uv[j * 2] = t.getX(i); uv[j * 2 + 1] = t.getY(i); }
      }
      const count = g.index?.count ?? p.count;
      for (let i = 0; i < count; i++) index[indexOffset + i] = vertexOffset + (g.index ? g.index.getX(i) : i);
      vertexOffset += p.count;
      indexOffset += count;
      disposed.add(g);
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.setIndex(new THREE.BufferAttribute(index, 1));
    add(out, merged, material, { cast, receive });
  }
  for (const geometry of disposed) if (!primitiveTemplates.has(geometry)) geometry.dispose();
  return out;
}
