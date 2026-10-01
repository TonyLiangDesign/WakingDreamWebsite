import * as THREE from 'three';

// Hull shell up to the base sheer line (the lowest weather deck). Ship local frame: +X bow,
// +Y up, waterline y = 0, origin amidships on the centreline. Metres.

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function hullGeometry(p) {
  const { L, B, T, D } = p;
  const sheerF = p.sheerF ?? D * 0.12, sheerA = p.sheerA ?? D * 0.06;
  const rake = p.rake ?? 1.5, overhang = p.overhang ?? L * 0.035, forefoot = p.forefoot ?? T * 0.6;
  const clipper = p.clipper ?? 0; // concave forward-leaning stem (clipper bow)
  const body = p.body ?? 0.3; // half-length fraction of parallel middle body
  const NU = p.NU ?? 140, NV = p.NV ?? 22;
  const deckY = (u) => {
    const s = u * 2 - 1;
    return D - T + (s > 0 ? sheerF * s * s : sheerA * s * s);
  };
  const rows = [];
  for (let iu = 0; iu <= NU; iu++) {
    const a = iu / NU;
    const u = 0.5 - 0.5 * Math.cos(a * Math.PI);
    const yd = deckY(u);
    const ring = [];
    for (let iv = 0; iv <= NV; iv++) {
      const s = iv / NV;
      const y = -T + s * (yd + T);
      const z = y + T; // above keel
      const xB = L / 2 - rake * (1 - s) - clipper * (1 - s * s) - forefoot * (1 - smooth(0, T * (p.forefootH ?? 0.55), z));
      const xS = -L / 2 + overhang * (1 - smooth(-T * 0.35, T * 0.15, y)) + (p.sternCut ?? 0) * (1 - smooth(-T, -T * 0.3, y));
      const x = xS + (xB - xS) * u;
      const xn = (x - (xS + xB) / 2) / ((xB - xS) / 2);
      const tt = Math.min(1, Math.max(0, (Math.abs(xn) - body) / (1 - body)));
      let fb;
      if (xn > 0) {
        fb = Math.pow(Math.max(1 - Math.pow(tt, p.bowFull ?? 1.9), 0), 0.85);
        fb = fb * (1 + (0.07 + clipper * 0.01) * tt * smooth(0, D - T, y)); // bow flare
      } else {
        const run = Math.pow(Math.max(1 - Math.pow(tt, 2.0), 0), 1.3);
        const counter = Math.sqrt(Math.max(1 - Math.pow(tt, p.sternFull ?? 3), 0));
        fb = run + (counter - run) * smooth(-T * 0.4, T * 0.2, y);
      }
      const zk = Math.max(z, 0);
      const bilge = B * 0.09;
      let sect = zk < bilge ? Math.sqrt(Math.max(0, 1 - Math.pow((bilge - zk) / bilge, 2))) : 1;
      sect = sect * 0.92 + 0.08;
      const vexp = 0.05 + 1.1 * tt * tt;
      sect *= Math.pow(Math.min(zk / (T * 1.05), 1), vexp);
      if (iv === 0) sect = 0;
      const hb = Math.max(0, (B / 2) * fb * sect * (1 - 0.015 * s));
      ring.push([x, y, hb]);
    }
    rows.push(ring);
  }
  const pos = [], colr = [];
  const cRed = new THREE.Color(p.bottom ?? 0x4e2016), cBlack = new THREE.Color(p.topsides ?? 0x2f2d2b);
  const cBoot = new THREE.Color(p.boot ?? p.topsides ?? 0x2f2d2b);
  const colorAt = (y) => (y < -0.3 ? cRed : y < 0.3 && p.boot ? cBoot : cBlack);
  const push = (v) => { pos.push(v[0], v[1], v[2]); const c = colorAt(v[1]); colr.push(c.r, c.g, c.b); };
  for (const side of [1, -1]) {
    for (let iu = 0; iu < NU; iu++) {
      const r0 = rows[iu], r1 = rows[iu + 1];
      for (let iv = 0; iv < NV; iv++) {
        const a = [r0[iv][0], r0[iv][1], r0[iv][2] * side], b = [r1[iv][0], r1[iv][1], r1[iv][2] * side];
        const c = [r1[iv + 1][0], r1[iv + 1][1], r1[iv + 1][2] * side], d = [r0[iv + 1][0], r0[iv + 1][1], r0[iv + 1][2] * side];
        // keep the waterline colour split crisp: colour each quad by its mid height
        if (side < 0) { push(a); push(c); push(b); push(a); push(d); push(c); }
        else { push(a); push(b); push(c); push(a); push(c); push(d); }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  g.computeVertexNormals();

  const outline = rows.map((r) => ({ x: r[NV][0], y: r[NV][1], hb: r[NV][2] }));
  // lookup helpers (the top outline x is monotonic)
  const hbTop = (x) => {
    const o = outline;
    if (x <= o[0].x) return o[0].hb;
    if (x >= o[o.length - 1].x) return o[o.length - 1].hb;
    let lo = 0, hi = o.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (o[m].x < x) lo = m; else hi = m; }
    const t = (x - o[lo].x) / Math.max(o[hi].x - o[lo].x, 1e-6);
    return o[lo].hb + (o[hi].hb - o[lo].hb) * t;
  };
  const S = (x) => deckY(Math.min(1, Math.max(0, (x + L / 2) / L)));
  // half-breadth at a given height (for portholes): station nearest in x, interpolated in y
  const hbRow = (r, y) => {
    for (let iv = 0; iv < NV; iv++) {
      if (r[iv + 1][1] >= y) { const t = (y - r[iv][1]) / Math.max(r[iv + 1][1] - r[iv][1], 1e-6); return r[iv][2] + (r[iv + 1][2] - r[iv][2]) * t; }
    }
    return r[NV][2];
  };
  // half-breadth at a given height, interpolated between the bracketing stations
  const hbAt = (x, y) => {
    let lo = 0, hi = rows.length - 1;
    if (x <= rows[0][NV][0]) return hbRow(rows[0], y);
    if (x >= rows[hi][NV][0]) return hbRow(rows[hi], y);
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rows[m][NV][0] < x) lo = m; else hi = m; }
    const t = (x - rows[lo][NV][0]) / Math.max(rows[hi][NV][0] - rows[lo][NV][0], 1e-6);
    return hbRow(rows[lo], y) * (1 - t) + hbRow(rows[hi], y) * t;
  };
  const stationsX = outline.map((o) => o.x);
  return { geometry: g, outline, deckY, S, hbTop, hbAt, stationsX };
}
