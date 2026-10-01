import * as THREE from 'three';

// Instance collector: per (kind, chunk) buckets → one InstancedMesh each, so frustum
// culling (and shadow-camera culling) works per chunk while draw calls stay low.
export class Scatter {
  constructor() {
    this.kinds = new Map();
    this.buckets = new Map();
    this.count = 0;
  }

  kind(name, geometry, material, { castShadow = false, receiveShadow = true, chunk = 2500 } = {}) {
    this.kinds.set(name, { geometry, material, castShadow, receiveShadow, chunk });
  }

  add(name, x, y, z, sx, sy, sz, ry, color) {
    const k = this.kinds.get(name);
    const cs = k.chunk;
    const key = name + '|' + Math.floor(x / cs) + '|' + Math.floor(z / cs);
    let b = this.buckets.get(key);
    if (!b) { b = { name, data: [] }; this.buckets.set(key, b); }
    b.data.push(x, y, z, sx, sy, sz, ry, color.r, color.g, color.b);
    this.count++;
  }

  build(group) {
    const stats = {};
    let tris = 0, calls = 0;
    for (const [key, b] of this.buckets) {
      const k = this.kinds.get(b.name);
      const n = b.data.length / 10;
      const mesh = new THREE.InstancedMesh(k.geometry, k.material, n);
      mesh.name = 'veg:' + key;
      const m = mesh.instanceMatrix.array;
      const col = new Float32Array(n * 3);
      const d = b.data;
      for (let i = 0; i < n; i++) {
        const o = i * 10, e = i * 16;
        const c = Math.cos(d[o + 6]), s = Math.sin(d[o + 6]);
        m[e] = c * d[o + 3]; m[e + 1] = 0; m[e + 2] = -s * d[o + 3]; m[e + 3] = 0;
        m[e + 4] = 0; m[e + 5] = d[o + 4]; m[e + 6] = 0; m[e + 7] = 0;
        m[e + 8] = s * d[o + 5]; m[e + 9] = 0; m[e + 10] = c * d[o + 5]; m[e + 11] = 0;
        m[e + 12] = d[o]; m[e + 13] = d[o + 1]; m[e + 14] = d[o + 2]; m[e + 15] = 1;
        col[i * 3] = d[o + 7]; col[i * 3 + 1] = d[o + 8]; col[i * 3 + 2] = d[o + 9];
      }
      mesh.instanceColor = new THREE.InstancedBufferAttribute(col, 3);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = k.castShadow;
      mesh.receiveShadow = k.receiveShadow;
      group.add(mesh);
      const t = (k.geometry.index ? k.geometry.index.count : k.geometry.attributes.position.count) / 3;
      stats[b.name] = stats[b.name] || { n: 0, tris: 0, meshes: 0 };
      stats[b.name].n += n; stats[b.name].tris += n * t; stats[b.name].meshes++;
      tris += n * t; calls++;
    }
    this.buckets.clear();
    return { stats, tris, calls };
  }
}
