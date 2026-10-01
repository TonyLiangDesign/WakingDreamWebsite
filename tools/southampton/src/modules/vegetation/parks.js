import * as THREE from 'three';
import { coverMaterial } from './marsh.js';

// Park ground: a grass cover hugging the terrain over each PARKS polygon (mown turf in the
// town parks, rough grass on the Common), gravel paths (perimeter walk, diagonals and a cross
// walk in the central parks; two footpaths across the Common), and positions for avenue and
// specimen trees. Cells blocked by the town (roads, buildings) are left out.
// Returns { mesh, tris, trees: [[x, z, species, heightScale]] }.
export function buildParks(ctx, ground, occ, { vnoise, rnd }) {
  const { layout, poly } = ctx;
  const S = THREE.MathUtils.smoothstep;
  const pos = [], col = [], fea = [], mar = [], idx = [];
  const trees = [];
  const c = new THREE.Color();

  const blocked = (x, z, r = 0) => occ && (r ? occ.near(x, z, r) : occ.at(x, z)) === 2;

  function cover(region, cell, palette, rough) {
    const [x0, x1, z0, z1] = region.box;
    const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
    const vid = new Int32Array((nx + 1) * (nz + 1)).fill(-1);
    const P = region.poly;
    const vert = (i, j) => {
      const k = j * (nx + 1) + i;
      if (vid[k] >= 0) return vid[k];
      let x = x0 + i * cell, z = z0 + j * cell;
      if (!region.contains(x, z)) {
        // snap outside vertices onto the park boundary for a clean edge
        let best = Infinity, bx = x, bz = z;
        for (let a = 0, b = P.length - 1; a < P.length; b = a++) {
          const [ax, az] = P[b], [cx, cz] = P[a];
          const dx = cx - ax, dz = cz - az, l2 = dx * dx + dz * dz;
          let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
          const px = ax + t * dx, pz = az + t * dz, d = (px - x) ** 2 + (pz - z) ** 2;
          if (d < best) { best = d; bx = px; bz = pz; }
        }
        x = bx; z = bz;
      }
      vid[k] = pos.length / 3;
      const gh = ground.height(x, z);
      const smp = ctx.terrain.sample(x, z);
      pos.push(x, gh < 0.3 || smp.type === 'estate' || smp.type === 'sea' ? gh - 1.5 : gh + 0.12, z);
      const t = vnoise(x / 45, z / 45), u = vnoise(x / 13 + 4, z / 13);
      c.copy(palette[0]).lerp(palette[1], S(t, 0.35, 0.75)).lerp(palette[2], S(u, 0.6, 0.85) * rough);
      col.push(c.r, c.g, c.b); fea.push(1); mar.push(0);
      return vid[k];
    };
    let quads = 0;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const cx = x0 + (i + 0.5) * cell, cz = z0 + (j + 0.5) * cell;
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => [x0 + (i + a) * cell, z0 + (j + b) * cell]);
      const inside = region.contains(cx, cz) || corners.some(([x, z]) => region.contains(x, z));
      if (!inside) continue;
      if (occ && (occ.at(cx, cz) > 0 || corners.some(([x, z]) => occ.at(x, z) > 0))) continue;
      const a = vert(i, j), b = vert(i + 1, j), d = vert(i, j + 1), e = vert(i + 1, j + 1);
      idx.push(a, d, b, b, d, e);
      quads++;
    }
    return quads;
  }

  // gravel path strip along a polyline
  const GRAVEL = new THREE.Color(0x8a826f), GRAVEL2 = new THREE.Color(0x746c5b);
  function path(pts, w, region) {
    let prev = -1;
    const dens = poly.densify(pts, 5, false);
    for (let i = 0; i < dens.length; i++) {
      const [x, z] = dens[i];
      const [xa, za] = dens[Math.max(0, i - 1)], [xb, zb] = dens[Math.min(dens.length - 1, i + 1)];
      let tx = xb - xa, tz = zb - za; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      if (!region.contains(x, z) || blocked(x, z, w)) { prev = -1; continue; }
      const row = pos.length / 3;
      for (const s of [-0.5, 0.5]) {
        const px = x - tz * w * s, pz = z + tx * w * s;
        pos.push(px, ground.height(px, pz) + 0.2, pz);
        c.copy(GRAVEL).lerp(GRAVEL2, vnoise(px / 9, pz / 9));
        col.push(c.r, c.g, c.b); fea.push(1); mar.push(0);
      }
      if (prev >= 0) idx.push(prev, row, prev + 1, prev + 1, row, row + 1);
      prev = row;
    }
  }
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const inset = (Pl, d) => {
    const cx = Pl.reduce((s, p) => s + p[0], 0) / Pl.length, cz = Pl.reduce((s, p) => s + p[1], 0) / Pl.length;
    return Pl.map(([x, z]) => { const l = Math.hypot(cx - x, cz - z) || 1; return [x + (cx - x) / l * d, z + (cz - z) / l * d]; });
  };

  // ---------------------------------------------------------------- central parks (mown turf, formal walks)
  {
    const region = new poly.Region(layout.PARKS[1]);
    const TURF = [new THREE.Color(0x475a31), new THREE.Color(0x52623a), new THREE.Color(0x3f512d)];
    cover(region, 5, TURF, 0.5);
    const Pl = layout.PARKS[1];
    const ring = inset(Pl, 9);
    path([...ring, ring[0]], 3.5, region);
    const [p0, p1, p2, p3] = inset(Pl, 12);
    const diag = [[p0, p2], [p1, p3]];
    for (const [a, b] of diag) path([a, b], 4, region);
    const mA = lerp2(p0, p1, 0.5), mB = lerp2(p2, p3, 0.5), mC = lerp2(p1, p2, 0.5), mD = lerp2(p3, p0, 0.5);
    path([mA, mB], 4, region); path([mC, mD], 3.5, region);
    // avenues: limes / elms both sides of the diagonal walks
    for (const [a, b] of diag) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      for (let t = 10; t < L - 10; t += 16) {
        for (const s of [-1, 1]) {
          const x = a[0] + ux * t - uz * 6 * s, z = a[1] + uz * t + ux * 6 * s;
          if (region.contains(x, z) && !blocked(x, z, 5)) trees.push([x, z, rnd() < 0.6 ? 'elm' : 'sycamore', 0.75 + rnd() * 0.2]);
        }
      }
    }
    // specimen trees on the lawns, clear of walks
    const [x0, x1, z0, z1] = region.box;
    for (let k = 0; k < 90; k++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (!region.contains(x, z) || blocked(x, z, 7)) continue;
      const near = (A, B) => {
        const dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - A[0]) * dx + (z - A[1]) * dz) / l2));
        return Math.hypot(A[0] + t * dx - x, A[1] + t * dz - z);
      };
      if (Math.min(near(p0, p2), near(p1, p3), near(mA, mB), near(mC, mD)) < 12) continue;
      if (region.sdist(x, z) < 14) continue;
      if (trees.some(([tx, tz]) => (tx - x) ** 2 + (tz - z) ** 2 < 22 * 22)) continue;
      const r = rnd();
      trees.push([x, z, r < 0.35 ? 'chestnut' : r < 0.6 ? 'sycamore' : r < 0.72 ? 'yew' : 'oak', 0.85 + rnd() * 0.3]);
    }
  }

  // ---------------------------------------------------------------- Southampton Common (rough grass, footpaths)
  {
    const region = new poly.Region(layout.PARKS[0]);
    const ROUGH = [new THREE.Color(0x505c36), new THREE.Color(0x5c5b3e), new THREE.Color(0x44502f)];
    cover(region, 16, ROUGH, 1);
    const [a, b, cc, d] = layout.PARKS[0]; // SW, NW, NE, SE (lat/lon order in layout)
    path([lerp2(a, d, 0.35), lerp2(lerp2(a, d, 0.35), lerp2(b, cc, 0.6), 0.5).map((v, k) => v + (k ? 0 : 60)), lerp2(b, cc, 0.6)], 2.2, region);
    path([lerp2(a, b, 0.45), lerp2(lerp2(a, b, 0.45), lerp2(d, cc, 0.4), 0.5).map((v, k) => v + (k ? 40 : 0)), lerp2(d, cc, 0.4)], 2, region);
  }

  if (!idx.length) return null;
  for (let t = 0; t < idx.length; t += 3) {
    const i0 = idx[t] * 3, i1 = idx[t + 1] * 3, i2 = idx[t + 2] * 3;
    const ux = pos[i1] - pos[i0], uz = pos[i1 + 2] - pos[i0 + 2], vx = pos[i2] - pos[i0], vz = pos[i2 + 2] - pos[i0 + 2];
    if (uz * vx - ux * vz < 0) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aFeather', new THREE.Float32BufferAttribute(fea, 1));
  g.setAttribute('aMarsh', new THREE.Float32BufferAttribute(mar, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, coverMaterial({ name: 'vegPark', bright: 0.72 }));
  mesh.name = 'veg:parks';
  mesh.receiveShadow = true;
  return { mesh, tris: idx.length / 3, trees };
}
