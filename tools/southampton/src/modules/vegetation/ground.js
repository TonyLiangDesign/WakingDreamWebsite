// Ground queries for vegetation placement, read straight from the rendered terrain
// meshes so instances sit exactly on the triangulated surface (not the analytic
// height, which differs by up to a metre or two between 30 m grid vertices).

function gridFrom(mesh) {
  const g = mesh.geometry;
  const p = g.attributes.position.array;
  const x0 = p[0], z0 = p[2], step = p[3] - p[0];
  let nx = 0;
  while (p[(nx + 1) * 3 + 2] === z0) nx++;
  const cols = nx + 1;
  const nz = g.attributes.position.count / cols - 1;
  return { x0, z0, step, nx, nz, cols, pos: p, field: g.attributes.aField.array, col: g.attributes.color.array };
}

export function makeGround(ctx) {
  const nearMesh = ctx.root.getObjectByName('terrain-near');
  const farMesh = ctx.root.getObjectByName('terrain-far');
  const N = gridFrom(nearMesh), F = gridFrom(farMesh);
  const NX1 = N.x0 + N.nx * N.step - 1e-3, NZ1 = N.z0 + N.nz * N.step - 1e-3;

  const pick = (x, z) => (x >= N.x0 && x <= NX1 && z >= N.z0 && z <= NZ1 ? N : F);

  // exact triangle interpolation matching terrain.js index order (a,d,b)(b,d,e)
  function height(x, z) {
    const G = pick(x, z);
    let fx = (x - G.x0) / G.step, fz = (z - G.z0) / G.step;
    if (fx < 0) fx = 0; if (fz < 0) fz = 0;
    if (fx > G.nx - 1e-6) fx = G.nx - 1e-6; if (fz > G.nz - 1e-6) fz = G.nz - 1e-6;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = j * G.cols + i, b = a + 1, d = a + G.cols, e = d + 1;
    const P = G.pos;
    const ha = P[a * 3 + 1], hb = P[b * 3 + 1], hd = P[d * 3 + 1], he = P[e * 3 + 1];
    if (u + v <= 1) return ha + u * (hb - ha) + v * (hd - ha);
    return he + (1 - u) * (hd - he) + (1 - v) * (hb - he);
  }

  // minimum field weight over the 4 surrounding vertices (1 = open farmland, s >= 30)
  function field(x, z) {
    const G = pick(x, z);
    const fx = (x - G.x0) / G.step, fz = (z - G.z0) / G.step;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return 0;
    const a = j * G.cols + i, f = G.field;
    return Math.min(f[a], f[a + 1], f[a + G.cols], f[a + G.cols + 1]);
  }

  // max vertex height around the point (used to keep things off low mud)
  function minH(x, z) {
    const G = pick(x, z);
    const fx = (x - G.x0) / G.step, fz = (z - G.z0) / G.step;
    const i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return -99;
    const a = j * G.cols + i, P = G.pos;
    return Math.min(P[a * 3 + 1], P[(a + 1) * 3 + 1], P[(a + G.cols) * 3 + 1], P[(a + G.cols + 1) * 3 + 1]);
  }

  const inNear = (x, z) => x >= N.x0 && x <= NX1 && z >= N.z0 && z <= NZ1;
  return { height, field, minH, inNear, N, F };
}

// ---------------------------------------------------------------- field system (twin of terrain.js fieldAt)
// Warped, rotated rows of fields; boundaries are straight lines in "w-space":
//   w = p + 40 * (sin(z*.0021 + sin(x*.0013)*1.7), sin(x*.0019 + sin(z*.0011)*1.9))
//   q = R w (q.x = .94 w.x + .34 w.z, q.y = -.34 w.x + .94 w.z); row = floor(q.y/150)
//   cx = q.x/210 + uhash(row,0,5); col = floor(cx); optional split at sp (vertical if hs<.4, horizontal if hs<.6)
export { fieldAt, FIELD } from '../../terrain.js';

export function uhash(ix, iy, salt) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(salt, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const DET = 0.94 * 0.94 + 0.34 * 0.34;
export const toQ = (x, z) => [0.94 * x + 0.34 * z, -0.34 * x + 0.94 * z];
export const fromQ = (qx, qy) => [(0.94 * qx - 0.34 * qy) / DET, (0.34 * qx + 0.94 * qy) / DET];

export function warp(x, z) {
  return [x + Math.sin(z * 0.0021 + Math.sin(x * 0.0013) * 1.7) * 40, z + Math.sin(x * 0.0019 + Math.sin(z * 0.0011) * 1.9) * 40];
}
// world point whose warped position is (wx, wz)
export function unwarp(wx, wz) {
  let x = wx, z = wz;
  for (let i = 0; i < 5; i++) {
    x = wx - Math.sin(z * 0.0021 + Math.sin(x * 0.0013) * 1.7) * 40;
    z = wz - Math.sin(x * 0.0019 + Math.sin(z * 0.0011) * 1.9) * 40;
  }
  return [x, z];
}
// q-space → world
export const qWorld = (qx, qy) => { const w = fromQ(qx, qy); return unwarp(w[0], w[1]); };

// field layout of (col,row): row offset, split kind (0 none, 1 vertical at fx=sp, 2 horizontal at fy=sp), sp
export function fieldCell(col, row) {
  const off = uhash(row, 0, 5);
  const hs = uhash(col, row, 1), sp = 0.3 + 0.4 * uhash(col, row, 2);
  return { off, split: hs < 0.4 ? 1 : hs < 0.6 ? 2 : 0, sp };
}
export const fieldType = (col, row, sub) => uhash(col * 2 + sub, row, 4);
