// Occupancy grid rasterised from the already-built town module (it builds before
// vegetation), so trees go into back gardens and never through roofs or onto roads.
// Cell values: 0 free, 1 garden, 2 blocked (buildings, walls, roads, yards).
const GARDEN = 10, YARD = 11;

export function buildOccupancy(ctx, cell = 4) {
  const town = ctx.root.getObjectByName('town');
  if (!town) return null;
  const meshes = [];
  town.traverse((o) => { if (o.isMesh && o.geometry.attributes.aInfo && !o.isInstancedMesh) meshes.push(o); });
  if (!meshes.length) return null;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const m of meshes) {
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox;
    x0 = Math.min(x0, b.min.x); x1 = Math.max(x1, b.max.x); z0 = Math.min(z0, b.min.z); z1 = Math.max(z1, b.max.z);
  }
  x0 -= cell * 2; z0 -= cell * 2;
  const nx = Math.ceil((x1 - x0) / cell) + 4, nz = Math.ceil((z1 - z0) / cell) + 4;
  const grid = new Uint8Array(nx * nz);
  const inv = 1 / cell;
  for (const m of meshes) {
    const P = m.geometry.attributes.position.array, info = m.geometry.attributes.aInfo.array, I = m.geometry.index.array;
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const kind = info[a * 4];
      const v = kind === GARDEN ? 1 : 2;
      if (kind === YARD) continue; // yards are open ground; don't block (rare trees there are fine)
      const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cx = P[c * 3], cz = P[c * 3 + 2];
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) * inv)), i1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - x0) * inv));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) * inv)), j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - z0) * inv));
      const area = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
      if (Math.abs(area) < 1 || (i1 - i0 <= 1 && j1 - j0 <= 1)) {
        // walls / tiny faces: mark the bbox
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * nx + i; if (grid[k] < v) grid[k] = v; }
        continue;
      }
      const s = area > 0 ? 1 : -1;
      for (let j = j0; j <= j1; j++) {
        const pz = z0 + (j + 0.5) * cell;
        for (let i = i0; i <= i1; i++) {
          const px = x0 + (i + 0.5) * cell;
          // inside test with half-cell tolerance
          const e0 = ((bx - ax) * (pz - az) - (bz - az) * (px - ax)) * s;
          const e1 = ((cx - bx) * (pz - bz) - (cz - bz) * (px - bx)) * s;
          const e2 = ((ax - cx) * (pz - cz) - (az - cz) * (px - cx)) * s;
          const tol = -cell * 0.7 * Math.max(Math.hypot(bx - ax, bz - az), Math.hypot(cx - bx, cz - bz), Math.hypot(ax - cx, az - cz));
          if (e0 < tol || e1 < tol || e2 < tol) continue;
          const k = j * nx + i;
          if (grid[k] < v) grid[k] = v;
        }
      }
    }
  }
  const at = (x, z) => {
    const i = Math.floor((x - x0) * inv), j = Math.floor((z - z0) * inv);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return 0;
    return grid[j * nx + i];
  };
  // max value within radius r (metres)
  const near = (x, z, r) => {
    const i0 = Math.floor((x - r - x0) * inv), i1 = Math.floor((x + r - x0) * inv);
    const j0 = Math.floor((z - r - z0) * inv), j1 = Math.floor((z + r - z0) * inv);
    let m = 0;
    for (let j = Math.max(0, j0); j <= Math.min(nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) {
      const g = grid[j * nx + i]; if (g > m) { m = g; if (m === 2) return 2; }
    }
    return m;
  };
  return { at, near };
}
