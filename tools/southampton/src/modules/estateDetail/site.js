// Site model for the estate, entirely in the DOCK FRAME (x along Ocean Dock toward the mouth,
// z toward its west quay). Everything this module builds lives in a group rotated like
// ctx.dockFrame, so most of the estate grid is axis-aligned.
import { pointInPoly, distToSegs } from '../../poly.js';

export function makeSite(layout, geo) {
  const c = Math.cos(geo.DOCK_YAW), s = Math.sin(geo.DOCK_YAW);
  const w2d = ([x, z]) => [x * c - z * s, x * s + z * c];
  const d2w = (x, z) => [x * c + z * s, -x * s + z * c];
  const P = (poly) => poly.map(w2d);

  const estate = P(layout.DOCK_ESTATE);
  const holes = { dd: P(layout.TRAFALGAR_DD), inner: P(layout.INNER_DOCK) };
  const water = { od: P(layout.OD), empress: P(layout.EMPRESS_DOCK), outer: P(layout.OUTER_DOCK) };
  const hotel = w2d(layout.LANDMARKS.southWesternHotel), terminus = w2d(layout.LANDMARKS.terminus);

  // waterside outline segments (estate indices i→i+1). 24→25 … 28→0 border the town.
  const waterSegs = [];
  for (let i = 0; i < estate.length; i++) {
    if (i >= 24) continue;
    waterSegs.push([estate[i], estate[(i + 1) % estate.length]]);
  }
  for (const h of Object.values(holes)) for (let i = 0; i < h.length; i++) waterSegs.push([h[i], h[(i + 1) % h.length]]);
  const townSegs = [];
  for (let i = 24; i < estate.length; i++) townSegs.push([estate[i], estate[(i + 1) % estate.length]]);

  const segDist = (x, z, segs) => {
    let best = Infinity;
    for (const [[ax, az], [bx, bz]] of segs) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = (ax + t * dx - x) ** 2 + (az + t * dz - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };

  // keep-outs owned by other code (dock.js detail, landmarks)
  const keeps = [
    [-262, 277, -127, -58],   // sheds 43/44 + boat-train sidings (x0,x1,z0,z1)
    [-368, -266, -66, 66],    // berth 45 timber yard
    [-272, 222, 58, 114],     // shed 46/47 frame + stacks
  ];
  const inKeep = (x, z) => keeps.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
  const nearLandmark = (x, z, r = 60) => Math.hypot(x - hotel[0], z - hotel[1]) < r || Math.hypot(x - terminus[0], z - terminus[1]) < r;

  const inEstate = (x, z) => pointInPoly(x, z, estate) && !pointInPoly(x, z, holes.dd) && !pointInPoly(x, z, holes.inner);

  // ---------------------------------------------------------------- occupancy grid
  const G = { x0: -720, z0: -700, cell: 2, nx: 835, nz: 600 };
  const occ = new Uint8Array(G.nx * G.nz); // 0 free, 1 apron/keep/outside, 2 road, 3 rail, 4 building, 5 prop
  const base = new Uint8Array(G.nx * G.nz); // 0 buildable, 1 apron (<14 m to water), 2 outside/keep
  const wdist = new Float32Array(G.nx * G.nz);
  for (let j = 0; j < G.nz; j++) {
    const z = G.z0 + (j + 0.5) * G.cell;
    for (let i = 0; i < G.nx; i++) {
      const x = G.x0 + (i + 0.5) * G.cell, k = j * G.nx + i;
      if (!inEstate(x, z) || inKeep(x, z) || nearLandmark(x, z)) { base[k] = 2; occ[k] = 1; wdist[k] = -1; continue; }
      const d = segDist(x, z, waterSegs);
      wdist[k] = d;
      if (d < 14) { base[k] = 1; occ[k] = 1; }
      else if (segDist(x, z, townSegs) < 3) { base[k] = 2; occ[k] = 1; }
    }
  }
  const cellOf = (x, z) => {
    const i = Math.floor((x - G.x0) / G.cell), j = Math.floor((z - G.z0) / G.cell);
    if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return -1;
    return j * G.nx + i;
  };

  // oriented rectangle in a frame: frame {ox, oz, ang}; local rect x0..x1, z0..z1
  const rectCells = (fr, x0, x1, z0, z1, fn) => {
    const ca = Math.cos(fr.ang), sa = Math.sin(fr.ang);
    // local (lx,lz) → dock (ox + lx*ca + lz*sa, oz - lx*sa + lz*ca)
    const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]].map(([lx, lz]) => [fr.ox + lx * ca + lz * sa, fr.oz - lx * sa + lz * ca]);
    let mx0 = Infinity, mx1 = -Infinity, mz0 = Infinity, mz1 = -Infinity;
    for (const [x, z] of pts) { mx0 = Math.min(mx0, x); mx1 = Math.max(mx1, x); mz0 = Math.min(mz0, z); mz1 = Math.max(mz1, z); }
    const i0 = Math.max(0, Math.floor((mx0 - G.x0) / G.cell)), i1 = Math.min(G.nx - 1, Math.floor((mx1 - G.x0) / G.cell));
    const j0 = Math.max(0, Math.floor((mz0 - G.z0) / G.cell)), j1 = Math.min(G.nz - 1, Math.floor((mz1 - G.z0) / G.cell));
    for (let j = j0; j <= j1; j++) {
      const z = G.z0 + (j + 0.5) * G.cell;
      for (let i = i0; i <= i1; i++) {
        const x = G.x0 + (i + 0.5) * G.cell;
        const dx = x - fr.ox, dz = z - fr.oz;
        const lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
        if (lx >= x0 && lx <= x1 && lz >= z0 && lz <= z1) fn(j * G.nx + i, x, z);
      }
    }
    return pts;
  };

  // fraction of cells in the rect that are free (occ == 0 or allowed values)
  const rectFree = (fr, x0, x1, z0, z1, allow = [0]) => {
    let n = 0, ok = 0;
    rectCells(fr, x0, x1, z0, z1, (k) => { n++; if (allow.includes(occ[k])) ok++; });
    return n ? ok / n : 0;
  };
  // ground-appearance layers (0..1) baked into the estate ground mask texture
  const layers = { setts: new Float32Array(G.nx * G.nz), coal: new Float32Array(G.nx * G.nz), wear: new Float32Array(G.nx * G.nz), gravel: new Float32Array(G.nx * G.nz) };
  const stamp = (layer, fr, x0, x1, z0, z1, v = 1) => { const L = layers[layer]; rectCells(fr, x0, x1, z0, z1, (k) => { if (L[k] < v) L[k] = v; }); };
  const stampDisc = (layer, x, z, r, v = 1) => {
    const L = layers[layer];
    const i0 = Math.max(0, Math.floor((x - r - G.x0) / G.cell)), i1 = Math.min(G.nx - 1, Math.floor((x + r - G.x0) / G.cell));
    const j0 = Math.max(0, Math.floor((z - r - G.z0) / G.cell)), j1 = Math.min(G.nz - 1, Math.floor((z + r - G.z0) / G.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = G.x0 + (i + 0.5) * G.cell - x, dz = G.z0 + (j + 0.5) * G.cell - z;
      const d = Math.hypot(dx, dz) / r;
      if (d < 1) { const k = j * G.nx + i, w = v * (1 - d * d); if (L[k] < w) L[k] = w; }
    }
  };
  const mark = (fr, x0, x1, z0, z1, v) => rectCells(fr, x0, x1, z0, z1, (k) => { if (occ[k] !== 1 || v === 1) occ[k] = Math.max(occ[k], v); });
  const markForce = (fr, x0, x1, z0, z1, v) => rectCells(fr, x0, x1, z0, z1, (k) => { occ[k] = v; });

  // A quay-edge frame: local +X along the edge, local z = 0 on the quay line, inland = -Z
  // (same convention as dock.js east quay). ang is the y rotation of the frame.
  const edgeFrame = (a, b) => {
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    let ux = dx / len, uz = dz / len;
    // with rotation.y = ang, local -Z maps to (-sin ang, -cos ang)... inland = (uz, -ux)
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    let o = a;
    if (!inEstate(mx + uz * 20, mz - ux * 20)) { ux = -ux; uz = -uz; o = b; }
    const ang = Math.atan2(-uz, ux);
    return { ox: o[0], oz: o[1], ang, len, ux, uz, nx: uz, nz: -ux, a: o, b: o === a ? b : a };
  };
  const toDock = (fr, lx, lz) => {
    const ca = Math.cos(fr.ang), sa = Math.sin(fr.ang);
    return [fr.ox + lx * ca + lz * sa, fr.oz - lx * sa + lz * ca];
  };
  const axisFrame = { ox: 0, oz: 0, ang: 0 };

  return {
    w2d, d2w, P, estate, holes, water, hotel, terminus, waterSegs, townSegs, segDist, inEstate, inKeep, nearLandmark,
    G, occ, base, wdist, layers, stamp, stampDisc, cellOf, rectCells, rectFree, mark, markForce, edgeFrame, toDock, axisFrame, keeps,
  };
}
