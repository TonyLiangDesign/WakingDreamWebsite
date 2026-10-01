// Low-level architectural shapes written straight into TownMesh buffers.
// Footprints are 4 xz corners (any convex quad, so warped street grids keep terraces watertight).
import { KIND, STYLE } from './material.js';

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const d2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Vertical wall a→b between y0 and y1. `out` = outward xz hint.
export function wall(m, a, b, y0, y1, floor, kind, col, storeys, sh, bayTarget, style, out) {
  const L = d2(a, b);
  if (L < 0.05 || y1 - y0 < 0.02) return;
  const nb = Math.max(1, Math.round(L / bayTarget));
  const bay = Math.min(25.5, L / nb);
  m.poly(
    [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]]],
    [[0, y0 - floor], [L, y0 - floor], [L, y1 - floor], [0, y1 - floor]],
    sh, col, [kind, storeys, Math.round(bay * 10), style], [out[0], 0, out[1]],
  );
}

// Wall whose top slopes from ya (at a) to yb (at b).
export function wallSlopedTop(m, a, b, y0, ya, yb, floor, kind, col, out) {
  const L = d2(a, b);
  if (L < 0.05) return;
  m.poly(
    [[a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], yb, b[1]], [a[0], ya, a[1]]],
    [[0, y0 - floor], [L, y0 - floor], [L, yb - floor], [0, ya - floor]],
    3, col, [kind, 0, 30, STYLE.BLANK], [out[0], 0, out[1]],
  );
}

export function gableTri(m, a, b, top, eaves, ridgeY, floor, kind, col, out) {
  const L = d2(a, b);
  const t = d2(a, top);
  m.poly(
    [[a[0], eaves, a[1]], [b[0], eaves, b[1]], [top[0], ridgeY, top[1]]],
    [[0, eaves - floor], [L, eaves - floor], [t, ridgeY - floor]],
    3, col, [kind, 0, 30, STYLE.BLANK], [out[0], 0, out[1]],
  );
}

// Roof plane from an eave edge (e0,e1 at height ye) up to ridge points (r0,r1 at yr).
// Overhang extends the eave outward by `o` metres (horizontal).
export function roofSlope(m, e0, e1, r1, r0, ye0, ye1, yr1, yr0, kind, col, o = 0) {
  let E0 = e0, E1 = e1, Y0 = ye0, Y1 = ye1;
  if (o > 0) {
    const h0 = d2(e0, r0), h1 = d2(e1, r1);
    const k0 = o / Math.max(h0, 0.1), k1 = o / Math.max(h1, 0.1);
    E0 = [e0[0] + (e0[0] - r0[0]) * k0, e0[1] + (e0[1] - r0[1]) * k0]; Y0 = ye0 - (yr0 - ye0) * k0;
    E1 = [e1[0] + (e1[0] - r1[0]) * k1, e1[1] + (e1[1] - r1[1]) * k1]; Y1 = ye1 - (yr1 - ye1) * k1;
  }
  const L = d2(E0, E1);
  const s0 = Math.hypot(d2(E0, r0), yr0 - Y0), s1 = Math.hypot(d2(E1, r1), yr1 - Y1);
  const s = (s0 + s1) / 2;
  // project ridge endpoints on the eave line for u
  const ex = (E1[0] - E0[0]) / (L || 1), ez = (E1[1] - E0[1]) / (L || 1);
  const ur0 = (r0[0] - E0[0]) * ex + (r0[1] - E0[1]) * ez, ur1 = (r1[0] - E0[0]) * ex + (r1[1] - E0[1]) * ez;
  m.poly(
    [[E0[0], Y0, E0[1]], [E1[0], Y1, E1[1]], [r1[0], yr1, r1[1]], [r0[0], yr0, r0[1]]],
    [[0, 0], [L, 0], [ur1, s1], [ur0, s0]],
    s, col, [kind, 0, 0, 0], [0, 1, 0],
  );
  return [E0, E1, Y0, Y1];
}

export function roofTri(m, e0, e1, apex, ye, ya, kind, col) {
  const L = d2(e0, e1);
  const ex = (e1[0] - e0[0]) / (L || 1), ez = (e1[1] - e0[1]) / (L || 1);
  const ua = (apex[0] - e0[0]) * ex + (apex[1] - e0[1]) * ez;
  const hx = apex[0] - (e0[0] + ex * ua), hz = apex[1] - (e0[1] + ez * ua);
  const s = Math.hypot(Math.hypot(hx, hz), ya - ye);
  m.poly(
    [[e0[0], ye, e0[1]], [e1[0], ye, e1[1]], [apex[0], ya, apex[1]]],
    [[0, 0], [L, 0], [ua, s]],
    s, col, [kind, 0, 0, 0], [0, 1, 0],
  );
}

// Box-like building with pitched roof. c = [c0,c1,c2,c3]; ridge runs parallel to c0→c1.
// o: { base, floor, eaves, rh, kind, col, roofKind, roofCol, storeys, sh,
//      walls: [style|null ×4] (edges c0c1, c1c2, c2c3, c3c0), bays: [target ×4], gables: [bool e1, bool e3],
//      roof: 'gable'|'hip'|'flat', overhang, soffit, parapet }
export function building(m, c, o) {
  const [c0, c1, c2, c3] = c;
  const cen = [(c0[0] + c1[0] + c2[0] + c3[0]) / 4, (c0[1] + c1[1] + c2[1] + c3[1]) / 4];
  const outOf = (a, b) => { const mm = mid(a, b); return [mm[0] - cen[0], mm[1] - cen[1]]; };
  const E = [[c0, c1], [c1, c2], [c2, c3], [c3, c0]];
  const roof = o.roof || 'gable';
  const par = roof === 'flat' ? (o.parapet ?? 0.9) : 0;
  for (let i = 0; i < 4; i++) {
    const st = o.walls[i];
    if (st === null || st === undefined) continue;
    const [a, b] = E[i];
    const top = o.eaves + (roof === 'flat' && (o.parapetAll || i === 0) ? par : 0) + (i === 0 ? (o.frontParapet || 0) : 0);
    wall(m, a, b, o.base, top, o.floor, o.kind, o.col, o.storeys, o.sh, o.bays?.[i] ?? 2.6, st, outOf(a, b));
  }
  if (roof === 'none') return;
  if (roof === 'flat') {
    const y = o.eaves + 0.02;
    m.poly([[c0[0], y, c0[1]], [c1[0], y, c1[1]], [c2[0], y, c2[1]], [c3[0], y, c3[1]]],
      [[0, 0], [d2(c0, c1), 0], [d2(c0, c1), d2(c1, c2)], [0, d2(c1, c2)]], 1, o.roofCol, [KIND.LEAD, 0, 0, 0], [0, 1, 0]);
    return;
  }
  const yr = o.eaves + o.rh;
  const ov = o.overhang || 0;
  if (roof === 'gable') {
    const r0 = mid(c0, c3), r1 = mid(c1, c2);
    const A = roofSlope(m, c0, c1, r1, r0, o.eaves, o.eaves, yr, yr, o.roofKind, o.roofCol, ov);
    const B = roofSlope(m, c2, c3, r0, r1, o.eaves, o.eaves, yr, yr, o.roofKind, o.roofCol, ov);
    if (o.gables?.[0] !== false) gableTri(m, c1, c2, r1, o.eaves, yr, o.floor, o.kind, o.col, outOf(c1, c2));
    if (o.gables?.[1] !== false) gableTri(m, c3, c0, r0, o.eaves, yr, o.floor, o.kind, o.col, outOf(c3, c0));
    if (ov > 0 && o.soffit) {
      for (const [[E0, E1, Y0, Y1], a, b] of [[A, c0, c1], [B, c2, c3]]) {
        const oo = outOf(a, b);
        m.poly([[E0[0], Y0, E0[1]], [E1[0], Y1, E1[1]], [b[0], o.eaves, b[1]], [a[0], o.eaves, a[1]]],
          [[0, 0], [1, 0], [1, 1], [0, 1]], 1, o.col, [KIND.SOOT, 0, 0, 0], [oo[0], -1.5, oo[1]]);
      }
    }
  } else {
    // hipped: ridge shortened by the half-depth at each end
    const r0m = mid(c0, c3), r1m = mid(c1, c2);
    const L = d2(r0m, r1m), hd = (d2(c0, c3) + d2(c1, c2)) / 4;
    const k = Math.min(0.5, hd / Math.max(L, 0.01));
    const r0 = [r0m[0] + (r1m[0] - r0m[0]) * k, r0m[1] + (r1m[1] - r0m[1]) * k];
    const r1 = [r1m[0] + (r0m[0] - r1m[0]) * k, r1m[1] + (r0m[1] - r1m[1]) * k];
    roofSlope(m, c0, c1, r1, r0, o.eaves, o.eaves, yr, yr, o.roofKind, o.roofCol, 0);
    roofSlope(m, c2, c3, r0, r1, o.eaves, o.eaves, yr, yr, o.roofKind, o.roofCol, 0);
    roofTri(m, c1, c2, r1, o.eaves, yr, o.roofKind, o.roofCol);
    roofTri(m, c3, c0, r0, o.eaves, yr, o.roofKind, o.roofCol);
  }
}

// Lean-to: high edge along c0→c1 (against the main building), falling to c2→c3.
export function leanTo(m, c, o) {
  const [c0, c1, c2, c3] = c;
  const cen = [(c0[0] + c2[0]) / 2, (c0[1] + c2[1]) / 2];
  const outOf = (a, b) => { const mm = mid(a, b); return [mm[0] - cen[0], mm[1] - cen[1]]; };
  wallSlopedTop(m, c1, c2, o.base, o.hi, o.lo, o.floor, o.kind, o.col, outOf(c1, c2));
  wall(m, c2, c3, o.base, o.lo, o.floor, o.kind, o.col, 1, o.lo - o.floor + 0.2, 2.2, o.style ?? STYLE.SMALL, outOf(c2, c3));
  wallSlopedTop(m, c3, c0, o.base, o.lo, o.hi, o.floor, o.kind, o.col, outOf(c3, c0));
  roofSlope(m, c3, c2, c1, c0, o.lo, o.lo, o.hi, o.hi, o.roofKind, o.roofCol, 0);
}

// Chimney stack centred at p, axes (ax,az) along its long side.
export function stack(m, p, dir, w, d, y0, y1, col, kind, pots, top = true) {
  const ux = dir[0], uz = dir[1], vx = -uz, vz = ux;
  const hw = w / 2, hd = d / 2;
  const q = [
    [p[0] - ux * hw - vx * hd, p[1] - uz * hw - vz * hd], [p[0] + ux * hw - vx * hd, p[1] + uz * hw - vz * hd],
    [p[0] + ux * hw + vx * hd, p[1] + uz * hw + vz * hd], [p[0] - ux * hw + vx * hd, p[1] - uz * hw + vz * hd],
  ];
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    const mm = mid(a, b);
    wall(m, a, b, y0, y1, y1 - 0.4, kind, col, 0, 3, 3, STYLE.BLANK, [mm[0] - p[0], mm[1] - p[1]]);
  }
  if (top) m.poly(q.map((a) => [a[0], y1, a[1]]), [[0, 0], [1, 0], [1, 1], [0, 1]], 1, col, [KIND.SOOT, 0, 0, 0], [0, 1, 0]);
  if (pots > 0) {
    // row of pots merged into one terracotta block with a sooty top
    const pw = Math.min(w * 0.85, 0.34 * pots), pd = 0.3, ph = 0.6;
    const pq = [[p[0] - ux * pw / 2 - vx * pd / 2, p[1] - uz * pw / 2 - vz * pd / 2], [p[0] + ux * pw / 2 - vx * pd / 2, p[1] + uz * pw / 2 - vz * pd / 2],
      [p[0] + ux * pw / 2 + vx * pd / 2, p[1] + uz * pw / 2 + vz * pd / 2], [p[0] - ux * pw / 2 + vx * pd / 2, p[1] - uz * pw / 2 + vz * pd / 2]];
    for (let k = 0; k < 4; k++) {
      const a = pq[k], b = pq[(k + 1) % 4];
      const mm = mid(a, b);
      m.poly([[a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y1 + ph, b[1]], [a[0], y1 + ph, a[1]]],
        [[0, 0], [1, 0], [1, 1], [0, 1]], 1, [1, 1, 1], [KIND.POT, 0, 0, 0], [mm[0] - p[0], 0, mm[1] - p[1]]);
    }
  }
  return y1 + (pots > 0 ? 0.7 : 0);
}

// Tall industrial chimney: tapering octagon with a corbelled cap.
export function factoryStack(m, p, y0, H, r0, col) {
  const seg = 8, r1 = r0 * 0.6;
  const ring = (r, y) => Array.from({ length: seg }, (_, i) => { const a = (i / seg) * Math.PI * 2 + Math.PI / 8; return [p[0] + Math.cos(a) * r, y, p[1] + Math.sin(a) * r]; });
  const add = (ra, ya, rb, yb, kind) => {
    const A = ring(ra, ya), B = ring(rb, yb);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const L = 2 * Math.PI * ra / seg;
      const ang = ((i + 0.5) / seg) * Math.PI * 2 + Math.PI / 8;
      m.poly([A[i], A[j], B[j], B[i]], [[i * L, ya - y0], [(i + 1) * L, ya - y0], [(i + 1) * L, yb - y0], [i * L, yb - y0]],
        3, col, [kind, 0, 30, STYLE.BLANK], [Math.cos(ang), 0, Math.sin(ang)]);
    }
  };
  add(r0, y0, r1, y0 + H * 0.93, KIND.BRICK);
  add(r1 * 1.25, y0 + H * 0.93, r1 * 1.25, y0 + H, KIND.BRICK);
  const top = ring(r1 * 1.25, y0 + H);
  const inner = ring(r1 * 0.9, y0 + H);
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    m.poly([top[i], top[j], inner[j], inner[i]], [[0, 0], [1, 0], [1, 1], [0, 1]], 1, col, [KIND.SOOT, 0, 0, 0], [0, 1, 0]);
  }
  return [p[0], y0 + H, p[1]];
}

// Flat ground patch (4 corners with their own heights). u along c0→c1, v along c0→c3.
export function patch(m, c, ys, kind, col, W, D, style = 0) {
  m.poly(c.map((p, i) => [p[0], ys[i], p[1]]),
    [[0, 0], [W, 0], [W, D], [0, D]], W, col, [kind, Math.min(255, Math.round(D)), 0, style], [0, 1, 0]);
}

// Rectangle corners centred at p with axis u (unit) : w along u, d along v = perp(u).
export function rectQ(p, u, w, d) {
  const v = [-u[1], u[0]], hw = w / 2, hd = d / 2;
  return [
    [p[0] - u[0] * hw - v[0] * hd, p[1] - u[1] * hw - v[1] * hd], [p[0] + u[0] * hw - v[0] * hd, p[1] + u[1] * hw - v[1] * hd],
    [p[0] + u[0] * hw + v[0] * hd, p[1] + u[1] * hw + v[1] * hd], [p[0] - u[0] * hw + v[0] * hd, p[1] - u[1] * hw + v[1] * hd],
  ];
}

// Simple closed box (4 walls + top) of any kinds.
export function box(m, q, y0, y1, kind, col, topKind, topCol, style = STYLE.BLANK, sh = 3, storeys = 0, bay = 3) {
  const cen = [(q[0][0] + q[2][0]) / 2, (q[0][1] + q[2][1]) / 2];
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], mm = mid(a, b);
    wall(m, a, b, y0, y1, y0 + 0.3, kind, col, storeys, sh, bay, style, [mm[0] - cen[0], mm[1] - cen[1]]);
  }
  if (topKind !== null) m.poly(q.map((a) => [a[0], y1, a[1]]), [[0, 0], [d2(q[0], q[1]), 0], [d2(q[0], q[1]), d2(q[1], q[2])], [0, d2(q[1], q[2])]], d2(q[0], q[1]), topCol, [topKind, 0, 0, 0], [0, 1, 0]);
}

// Vertical cylinder (open bottom) with an optional shallow domed/conical top.
export function cylinder(m, p, r, y0, y1, seg, kind, col, topKind, topCol, dome = 0) {
  const P = [];
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; P.push([p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, a]); }
  const L = 2 * Math.PI * r / seg;
  for (let i = 0; i < seg; i++) {
    const A = P[i], B = P[i + 1], am = (A[2] + B[2]) / 2;
    m.poly([[A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]]], [[i * L, y0 - y0], [(i + 1) * L, 0], [(i + 1) * L, y1 - y0], [i * L, y1 - y0]],
      3, col, [kind, 0, 30, STYLE.BLANK], [Math.cos(am), 0, Math.sin(am)]);
  }
  if (topKind === null) return;
  const apex = [p[0], y1 + dome, p[1]];
  for (let i = 0; i < seg; i++) {
    const A = P[i], B = P[i + 1];
    m.poly([[A[0], y1, A[1]], [B[0], y1, B[1]], apex], [[0, 0], [L, 0], [L / 2, r]], r, topCol, [topKind, 0, 0, 0], [0, 1, 0]);
  }
}

// North-light (sawtooth) roof over quad c (bays run across c0→c1, ridges parallel to c1→c2).
export function sawtooth(m, c, eaves, rise, n, roofKind, roofCol) {
  const [c0, c1, c2, c3] = c;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const a0 = lerp(c0, c1, t0), a1 = lerp(c0, c1, t1), b0 = lerp(c3, c2, t0), b1 = lerp(c3, c2, t1);
    // sloping roof from low (t0) up to high (t1)
    roofSlope(m, b0, a0, a1, b1, eaves, eaves, eaves + rise, eaves + rise, roofKind, roofCol, 0);
    // vertical glazing at t1 facing back toward t0
    const L = d2(a1, b1);
    m.poly([[a1[0], eaves, a1[1]], [b1[0], eaves, b1[1]], [b1[0], eaves + rise, b1[1]], [a1[0], eaves + rise, a1[1]]],
      [[0, 0], [L, 0], [L, rise], [0, rise]], rise, [1, 1, 1], [KIND.GLASSROOF, 0, 0, 0], [a0[0] - a1[0], 0.2, a0[1] - a1[1]]);
    // triangle gable ends
    gableTriLean(m, a0, a1, eaves, rise, c, roofCol);
    gableTriLean(m, b0, b1, eaves, rise, c, roofCol);
  }
}
function gableTriLean(m, a, b, eaves, rise, c, col) {
  const cen = [(c[0][0] + c[2][0]) / 2, (c[0][1] + c[2][1]) / 2], mm = mid(a, b);
  m.poly([[a[0], eaves, a[1]], [b[0], eaves, b[1]], [b[0], eaves + rise, b[1]]], [[0, 0], [1, 0], [1, 1]], 3, col, [KIND.SOOT, 0, 30, STYLE.BLANK], [mm[0] - cen[0], 0, mm[1] - cen[1]]);
}

// Double-sided sloping sheet (awning, open shelter roof).
export function sheet(m, P, kind, col, W, D) {
  const F = [[0, 0], [W, 0], [W, D], [0, D]];
  m.poly(P, F, D, col, [kind, 0, 0, 0], [0, 1, 0]);
  m.poly(P, F, D, col, [kind, 0, 0, 0], [0, -1, 0]);
}
