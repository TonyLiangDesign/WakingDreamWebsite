// Growable indexed triangle writer with the town vertex layout, plus spatial chunking.

export class TownMesh {
  constructor(cap = 4096) {
    this.nv = 0; this.ni = 0;
    this.alloc(cap, cap * 2);
  }
  alloc(vc, ic) {
    const grow = (Old, arr, n) => { const a = new Old(n); if (arr) a.set(arr.subarray(0, Math.min(arr.length, n))); return a; };
    this.vcap = vc; this.icap = ic;
    this.pos = grow(Float32Array, this.pos, vc * 3);
    this.nrm = grow(Float32Array, this.nrm, vc * 3);
    this.tint = grow(Uint8Array, this.tint, vc * 3);
    this.fac = grow(Float32Array, this.fac, vc * 3);
    this.info = grow(Uint8Array, this.info, vc * 4);
    this.idx = grow(Uint32Array, this.idx, ic);
  }
  ensure(v, i) {
    if (this.nv + v > this.vcap || this.ni + i > this.icap) this.alloc(Math.max(this.vcap * 2, this.nv + v), Math.max(this.icap * 2, this.ni + i));
  }
  get tris() { return this.ni / 3; }

  // Polygon (3 or 4 vertices, planar, convex). P: [[x,y,z]...], F: [[u,v]...], w: fac.z,
  // col: [r,g,b] (0..2), info: [kind, a, b, c]. Winding chosen so the face points along `n` (or the
  // computed normal flipped toward `hint` if given as [x,y,z] direction).
  poly(P, F, w, col, info, hint) {
    const n = P.length;
    this.ensure(n, (n - 2) * 3);
    const [a, b, c] = P;
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    let vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    if (n === 4) { const d = P[3]; vx = c[0] - a[0]; vy = c[1] - a[1]; vz = c[2] - a[2]; ux = b[0] - d[0]; uy = b[1] - d[1]; uz = b[2] - d[2]; }
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    let L = Math.hypot(nx, ny, nz);
    if (L < 1e-9) return;
    nx /= L; ny /= L; nz /= L;
    let flip = false;
    if (hint) {
      if (nx * hint[0] + ny * hint[1] + nz * hint[2] < 0) { flip = true; nx = -nx; ny = -ny; nz = -nz; }
    }
    const base = this.nv;
    const tr = Math.max(0, Math.min(255, Math.round(col[0] * 127.5)));
    const tg = Math.max(0, Math.min(255, Math.round(col[1] * 127.5)));
    const tb = Math.max(0, Math.min(255, Math.round(col[2] * 127.5)));
    for (let k = 0; k < n; k++) {
      const i3 = this.nv * 3, i4 = this.nv * 4;
      const p = P[k], f = F[k];
      this.pos[i3] = p[0]; this.pos[i3 + 1] = p[1]; this.pos[i3 + 2] = p[2];
      this.nrm[i3] = nx; this.nrm[i3 + 1] = ny; this.nrm[i3 + 2] = nz;
      this.tint[i3] = tr; this.tint[i3 + 1] = tg; this.tint[i3 + 2] = tb;
      this.fac[i3] = f[0]; this.fac[i3 + 1] = f[1]; this.fac[i3 + 2] = w;
      this.info[i4] = info[0]; this.info[i4 + 1] = info[1]; this.info[i4 + 2] = info[2]; this.info[i4 + 3] = info[3];
      this.nv++;
    }
    const I = this.idx;
    if (!flip) {
      I[this.ni++] = base; I[this.ni++] = base + 1; I[this.ni++] = base + 2;
      if (n === 4) { I[this.ni++] = base; I[this.ni++] = base + 2; I[this.ni++] = base + 3; }
    } else {
      I[this.ni++] = base; I[this.ni++] = base + 2; I[this.ni++] = base + 1;
      if (n === 4) { I[this.ni++] = base; I[this.ni++] = base + 3; I[this.ni++] = base + 2; }
    }
  }

  toMesh(THREE, material, name) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, this.nv * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(0, this.nv * 3), 3));
    g.setAttribute('aTint', new THREE.BufferAttribute(this.tint.slice(0, this.nv * 3), 3, true));
    g.setAttribute('aFac', new THREE.BufferAttribute(this.fac.slice(0, this.nv * 3), 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(this.info.slice(0, this.nv * 4), 4));
    g.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.ni), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = name;
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
}

export class Chunks {
  // 1.1 km chunks over the town (good culling), 3 km chunks in the open countryside (few draw calls)
  constructor(size = 2000, big = 4200, townBox = [-4600, 4600, -4800, 3400]) { this.size = size; this.big = big; this.box = townBox; this.map = new Map(); }
  at(x, z) {
    const [x0, x1, z0, z1] = this.box;
    const inside = x > x0 && x < x1 && z > z0 && z < z1;
    const s = inside ? this.size : this.big;
    const k = (inside ? 's' : 'l') + Math.floor(x / s) + ',' + Math.floor(z / s);
    let m = this.map.get(k);
    if (!m) { m = new TownMesh(1 << 15); this.map.set(k, m); }
    return m;
  }
  get tris() { let t = 0; for (const m of this.map.values()) t += m.tris; return t; }
}
