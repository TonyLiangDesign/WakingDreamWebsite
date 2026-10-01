import * as THREE from 'three';

// Hedgerows as continuous lumpy extrusions along the field boundaries painted by the
// terrain shader. Each boundary polyline is sampled at fixed stations; consecutive valid
// stations form a run, extruded with a rounded 5-vertex (near) or 3-vertex (far) section.

export class HedgeBuilder {
  constructor() { this.meshes = new Map(); this.tris = 0; }

  // stations: [{x, z, y (ground), nx, nz (unit normal), w, h, c: Color}]
  run(key, stations, near, shadow) {
    if (stations.length < 2) return;
    let M = this.meshes.get(key);
    if (!M) { M = { pos: [], col: [], idx: [], shadow }; this.meshes.set(key, M); }
    const sec = near
      ? [[-0.5, -0.5, 0.55], [-0.32, 0.9, 0.95], [0.05, 1, 1.05], [0.36, 0.85, 0.95], [0.5, -0.5, 0.55]]
      : [[-0.5, -0.5, 0.6], [0, 1, 1.05], [0.5, -0.5, 0.6]];
    const ns = sec.length;
    const base = M.pos.length / 3;
    const last = stations.length - 1;
    stations.forEach((s, i) => {
      const taper = i === 0 || i === last ? 0.45 : 1;
      for (const [u, v, ao] of sec) {
        const yy = v < 0 ? v : v * s.h * taper;
        const ww = (v < 0 ? 1 : 1 - 0.25 * (1 - taper)) * s.w;
        M.pos.push(s.x + s.nx * u * ww, s.y + yy, s.z + s.nz * u * ww);
        M.col.push(s.c.r * ao, s.c.g * ao, s.c.b * ao);
      }
    });
    for (let i = 0; i < last; i++) for (let j = 0; j < ns - 1; j++) {
      const a = base + i * ns + j, b = a + 1, d = a + ns, e = d + 1;
      M.idx.push(a, b, d, b, e, d);
    }
    this.tris += last * (ns - 1) * 2;
  }

  build(material, group) {
    for (const [key, M] of this.meshes) {
      // sections are convex with a wide base, so every outward face has +y normal
      const P = M.pos, I = M.idx;
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t] * 3, b = I[t + 1] * 3, d = I[t + 2] * 3;
        const ux = P[b] - P[a], uz = P[b + 2] - P[a + 2];
        const vx = P[d] - P[a], vz = P[d + 2] - P[a + 2];
        const ny = uz * vx - ux * vz;
        if (ny < 0) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(M.col, 3));
      g.setIndex(I);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, material);
      mesh.name = 'veg:hedge:' + key;
      mesh.castShadow = M.shadow; mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group.children.length;
  }
}
