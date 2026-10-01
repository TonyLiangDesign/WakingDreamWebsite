import * as THREE from 'three';
import { extrudeProfile, lancet, roundArch } from './kit.js';
import { groundAt, crenels, ringCrenels, chimney, windowRow } from './common.js';

// ------------------------------------------------------------------ western town walls
// The medieval west wall above the Western Esplanade (the shore road of 1850s): from the
// Arundel Tower at the NW corner south past Catchcold Tower, the 14th-c. Arcades and the
// West Gate toward the Castle Watergate. The Bargate & north wall east of it: town module.
export function townWalls(ctx, kit) {
  const { ll } = ctx.geo;
  const coast = [[50.9047, -1.4072], [50.9010, -1.4070], [50.8985, -1.4078], [50.8975, -1.40755]].map(([a, b]) => ll(a, b));
  const OFF = 24; // wall line stands inland of the esplanade
  // offset polyline toward the land
  const pts = coast.map((p, i) => {
    const a = coast[Math.max(0, i - 1)], b = coast[Math.min(coast.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz); dx /= l; dz /= l;
    let nx = -dz, nz = dx;
    const s = ctx.terrain.sample(p[0] + nx * 40, p[1] + nz * 40).s;
    if (s < 0) { nx = -nx; nz = -nz; }
    return [p[0] + nx * OFF, p[1] + nz * OFF, nx, nz];
  });
  // resample
  const path = [];
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(L / 6);
    for (let j = 0; j < n; j++) path.push({ x: ax + ((bx - ax) * j) / n, z: az + ((bz - az) * j) / n, d: total + (L * j) / n });
    total += L;
  }
  path.push({ x: pts[pts.length - 1][0], z: pts[pts.length - 1][1], d: total });
  // the shoreline wiggles: keep every wall point at least MIN_S inland of the actual coast
  const MIN_S = 26;
  const seg = (i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return [-(b.z - a.z) / l, (b.x - a.x) / l];
  };
  path.forEach((p, i) => {
    let [nx, nz] = seg(i);
    if (ctx.terrain.sample(p.x + nx * 20, p.z + nz * 20).s < ctx.terrain.sample(p.x - nx * 20, p.z - nz * 20).s) { nx = -nx; nz = -nz; }
    p.nx = nx; p.nz = nz;
    for (let k = 0; k < 40 && ctx.terrain.sample(p.x, p.z).s < MIN_S; k++) { p.x += nx * 2; p.z += nz * 2; }
  });
  for (let pass = 0; pass < 3; pass++) { // smooth, never moving seaward of the pushed line
    const prev = path.map((p) => [p.x, p.z]);
    for (let i = 1; i + 1 < path.length; i++) {
      const mx = (prev[i - 1][0] + prev[i][0] * 2 + prev[i + 1][0]) / 4, mz = (prev[i - 1][1] + prev[i][1] * 2 + prev[i + 1][1]) / 4;
      const inward = (mx - prev[i][0]) * path[i].nx + (mz - prev[i][1]) * path[i].nz;
      if (inward >= 0 || ctx.terrain.sample(mx, mz).s >= MIN_S) { path[i].x = mx; path[i].z = mz; }
    }
  }

  const H = 8.5, T = 2.4;
  const arcadeFrom = 150, arcadeTo = 235, westGate = 290;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i], b = path[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
    const mid = [(a.x + b.x) / 2, (a.z + b.z) / 2];
    const ga = groundAt(ctx, a.x, a.z), gb = groundAt(ctx, b.x, b.z);
    const lo = Math.min(ga, gb), hi = Math.max(ga, gb);
    const k = kit.sub(mid[0], 0, mid[1], yaw);
    // determine outward side (toward the water) in this frame
    const pOut = k.toWorld(0, 0, -30);
    const out = ctx.terrain.sample(pOut[0], pOut[2]).s < ctx.terrain.sample(...(() => { const q = k.toWorld(0, 0, 30); return [q[0], q[2]]; })()).s ? -1 : 1;
    // weathered, patched masonry: the wall head undulates and parapets are broken in places
    const wob = Math.sin(a.d * 0.037) * 0.9 + Math.sin(a.d * 0.13 + 1.7) * 0.45;
    const top = hi + H + wob;
    k.box(i % 5 === 2 ? 'rubbleDark' : 'rubble', -L / 2 - 0.05, lo - 2.5, -T / 2, L + 0.1, top - lo + 2.5, T);
    k.cbox('rubbleDark', 0, lo + 0.2, out * (T / 2 + 0.4), L + 0.1, 3.4, 1.0, out * 0.12, 0, 0); // battered footing
    // Western Esplanade (1850s) along the wall foot: road on a sea wall, grounding the wall at the shore
    {
      const ey = Math.max(lo + 0.1, 2.0), EW = 13, zo = out * (T / 2 + 1.5 + EW / 2);
      k.cbox('gravel', 0, ey - 2.5, zo, L + 2.5, 5.0, EW + 1.5);
      k.cbox('quayWall', 0, ey - 4.5, out * (T / 2 + 1.5 + EW + 0.5), L + 2.5, 9.0, 1.0);
      k.cbox('coping', 0, ey + 0.2, out * (T / 2 + 1.5 + EW + 0.5), L + 2.5, 0.5, 1.2);
    }
    if (Math.abs(a.d - westGate) < 5) continue;
    const broken = Math.sin(a.d * 0.051 + 0.4) > 0.72;
    if (!broken) crenels(k, 'rubble', -L / 2, L / 2, top, out * (T / 2 - 0.3), 0.6, 1.1, 0.75, 1.1);
    else k.box('rubbleDark', -L / 2, top, out * (T / 2 - 0.3) - 0.3, L, 0.5, 0.6);
    if (i % 7 === 3 && !(a.d > arcadeFrom && a.d < arcadeTo)) k.cbox('rubbleDark', 0, (lo + top) / 2 - 1.5, out * (T / 2 + 0.9), 1.6, top - lo - 1, 1.8, out * 0.08, 0, 0); // buttress
    if (a.d > arcadeFrom && a.d < arcadeTo) {
      // the Arcades: pointed arches on buttress piers in front of the wall face
      const ak = k.sub(0, 0, out * (T / 2 + 1.1), out > 0 ? Math.PI : 0);
      ak.box('rubble', -L / 2 - 0.05, lo - 1.5, -0.6, L + 0.1, top - 0.3 - lo + 1.5, 1.2);
      ak.geo('glass', extrudeProfile(lancet(3.4, 4.2, 5), 1.3), 0, hi + 0.2, -0.05);
    }
  }
  // towers
  const at = (d) => {
    for (let i = 0; i + 1 < path.length; i++) if (path[i + 1].d >= d) {
      const a = path[i], b = path[i + 1], t = (d - a.d) / Math.max(1e-6, b.d - a.d);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(-(b.z - a.z), b.x - a.x) };
    }
    return { ...path[path.length - 1], yaw: 0 };
  };
  const seaward = (p) => {
    const nx = -Math.sin(p.yaw), nz = -Math.cos(p.yaw); // local -z
    const s1 = ctx.terrain.sample(p.x + nx * 30, p.z + nz * 30).s, s2 = ctx.terrain.sample(p.x - nx * 30, p.z - nz * 30).s;
    return s1 < s2 ? [nx, nz] : [-nx, -nz];
  };
  const roundTower = (d, r, h, proj, name) => {
    const p = at(d);
    const [nx, nz] = seaward(p);
    const tx = p.x + nx * proj, tz = p.z + nz * proj;
    const g = groundAt(ctx, tx, tz);
    kit.cyl('rubbleDark', tx, g - 1.5 + 1.5, tz, r + 0.3, r + 0.9, 3.0, 16);
    kit.cyl('rubble', tx, (g - 2 + g + h) / 2, tz, r, r + 0.15, h + 2, 16);
    ringCrenels(kit, 'rubble', tx, tz, r - 0.3, g + h, 0.7, Math.round(r * 2.4), 1.2);
    const k = kit.sub(tx, g, tz, Math.atan2(nx, nz) + Math.PI);
    k.geo('glass', extrudeProfile(lancet(0.35, 1.5, 3), 0.4), 0, h * 0.55, -r + 0.12);
    return name;
  };
  roundTower(0, 5.6, 12.5, 0, 'Arundel Tower');
  roundTower(26, 4.2, 10.5, 1.2, 'Catchcold Tower');
  roundTower(95, 3.6, 9.5, 1.5, 'Garderobe Tower');
  roundTower(345, 3.8, 9.5, 1.5, 'Watergate tower');
  // West Gate: square gate tower with a pointed passage
  {
    const p = at(westGate);
    const g = groundAt(ctx, p.x, p.z);
    const k = kit.sub(p.x, g, p.z, p.yaw);
    k.box('rubble', -4, -2.5, -3.6, 8, 13, 7.2);
    for (const f of k.faces(0, 0, 8, 7.2)) crenels(f.k, 'rubble', -4, 4, 10.5, 0.3, 0.6, 1.0, 0.7, 1.0);
    const pass = extrudeProfile(lancet(2.8, 2.6, 5), 7.4);
    k.sub(0, 0, 0, Math.PI / 2).geo('glass', pass, 0, 0, 0);
  }
  // north wall stub from Arundel Tower toward the Bargate
  {
    const a = at(0);
    const bg = ctx.layout.LANDMARKS.bargate;
    const dx = bg[0] - a.x, dz = bg[1] - a.z, l = Math.hypot(dx, dz);
    const run = Math.min(70, l * 0.3);
    const n = Math.ceil(run / 6);
    for (let i = 0; i < n; i++) {
      const t0 = (6 + (i * (run - 6)) / n) / l, t1 = (6 + ((i + 1) * (run - 6)) / n) / l;
      const x0 = a.x + dx * t0, z0 = a.z + dz * t0, x1 = a.x + dx * t1, z1 = a.z + dz * t1;
      const g0 = groundAt(ctx, x0, z0), g1 = groundAt(ctx, x1, z1);
      const L = Math.hypot(x1 - x0, z1 - z0);
      const k = kit.sub((x0 + x1) / 2, 0, (z0 + z1) / 2, Math.atan2(-(z1 - z0), x1 - x0));
      const lo = Math.min(g0, g1), top = Math.max(g0, g1) + H - 0.5;
      k.box('rubble', -L / 2 - 0.05, lo - 2.5, -T / 2, L + 0.1, top - lo + 2.5, T);
      crenels(k, 'rubble', -L / 2, L / 2, top, -T / 2 + 0.3, 0.6, 1.1, 0.75, 1.1);
    }
  }
  const P = path.map((p) => [p.x, p.z]);
  return [{ name: 'Western town walls', line: P, width: 12 }];
}

// ------------------------------------------------------------------ Calshot Castle
// Henrician device fort (1539–40): circular keep inside a 16-sided curtain & moat on the
// shingle spit tip; coastguard station cottages nearby. No RNAS station yet (1913).
export function calshot(ctx, kit) {
  const [cx, cz] = ctx.layout.LANDMARKS.calshotCastle;
  const g = Math.max(ctx.terrain.heightAt(cx, cz), 0.3) + 0.5;
  // shingle bank carrying the fort (the spit tip in the terrain is very narrow)
  kit.add('gravel', new THREE.CylinderGeometry(31, 60, 10, 28, 1, true), new THREE.Matrix4().makeTranslation(cx, g - 5.0, cz));
  kit.add('gravel', new THREE.CircleGeometry(31, 28).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, g, cz));
  // spit ridge westward
  const spW = ctx.geo.ll(50.8200, -1.3160);
  const dx = spW[0] - cx, dz = spW[1] - cz, sl = Math.hypot(dx, dz);
  const yaw = Math.atan2(-dz, dx);
  const sk = kit.sub(cx, 0, cz, yaw);
  sk.fr('gravel', sl * 0.3, g - 6, 0, sl * 0.62, 70, 5.8, sl * 0.6, 24);
  const k = kit.sub(cx, g, cz, yaw + Math.PI);
  // moat (wet) ring and curtain
  k.add('mud', new THREE.RingGeometry(21, 26, 32).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(0, 0.08, 0));
  const N = 16, R = 19.5, CH = 5.2;
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    const seg = 2 * R * Math.sin(Math.PI / N) + 0.3;
    k.cbox('stone', Math.cos(a) * R, CH / 2 - 1, Math.sin(a) * R, 2.2, CH + 2, seg, 0, -a, 0);
    k.cbox('stone', Math.cos(a) * (R + 0.7), CH + 0.5, Math.sin(a) * (R + 0.7), 0.8, 1.0, seg * 0.5, 0, -a, 0);
  }
  k.add('grass', new THREE.CircleGeometry(R - 0.8, 24).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(0, 0.3, 0));
  // central keep: two storeys with a 19th c. gun platform & parapet
  const KR = 9.2, KH = 12;
  k.cyl('stone', 0, KH / 2 - 0.5, 0, KR, KR + 0.3, KH + 1, 20);
  k.cyl('stoneDark', 0, KH + 0.6, 0, KR + 0.5, KR + 0.5, 1.2, 20);
  ringCrenels(k, 'stone', 0, 0, KR - 0.2, KH + 1.2, 0.8, 20, 1.1);
  k.cyl('lead', 0, KH + 1.25, 0, KR - 0.6, KR - 0.6, 0.1, 20);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.cbox('glass', Math.cos(a) * KR, 7.5, Math.sin(a) * KR, 0.3, 1.3, 1.0, 0, -a, 0);
  }
  // coastguard lookout on the keep roof & flagstaff
  k.box('white', -2, KH + 1.3, -2, 4, 2.6, 4);
  k.box('glass', -2.05, KH + 2.4, -1.5, 4.1, 1.1, 3);
  k.fr('slate', 0, KH + 3.9, 0, 4.6, 4.6, 1.2);
  k.cyl('timberDark', 4.5, KH + 7, 3, 0.07, 0.12, 11.5, 6);
  k.strut('timberDark', [4.5, KH + 9.5, 3 - 1.8], [4.5, KH + 9.5, 3 + 1.8], 0.06);
  // gatehouse & bridge on the landward side (+x toward the spit)
  k.box('stone', R - 1.5, -1, -3.5, 5, 7.5, 7);
  crenels(k.sub(R + 3.5, 0, 0, -Math.PI / 2), 'stone', -3.5, 3.5, 6.5, 0.3, 0.6, 0.9, 0.6, 0.9);
  k.geo('glass', extrudeProfile(roundArch(2.2, 2.0, 6), 5.4), R + 1.2, 0, 0, 0, Math.PI / 2, 0);
  k.box('timber', R + 3.5, 0.2, -1.6, 7, 0.3, 3.2);
  // coastguard cottages: a terrace along the spit
  const out = [{ name: 'Calshot Castle', pts: [k.toWorld(-28, 0, -28), k.toWorld(28, 0, -28), k.toWorld(28, 0, 28), k.toWorld(-28, 0, 28)] }];
  const ck = kit.sub(cx, 0, cz, yaw).sub(95, g, 18, 0);
  const CL = 42, CD = 7.5;
  ck.box('brick', -CL / 2, -2, 0, CL, 8.2, CD);
  ck.fr('slate', 0, 6.2, CD / 2, CL + 0.6, CD + 0.8, 2.8, CL + 0.6, 0);
  for (let i = 0; i <= 6; i++) chimney(ck, 'brick', -CL / 2 + (CL * i) / 6, 7.4, CD / 2, 0.9, 0.7, 2.4, 2, 'brickDark');
  for (const [zf, ry] of [[0, 0], [CD, Math.PI]]) {
    const fk = ck.sub(0, 0, zf, ry);
    windowRow(fk, { x0: -CL / 2, x1: CL / 2, n: 12, y: 3.8, ww: 0.9, wh: 1.4, dress: 'stone', depth: 0.1 });
    windowRow(fk, { x0: -CL / 2, x1: CL / 2, n: 12, y: 0.9, ww: 0.9, wh: 1.6, dress: 'stone', depth: 0.1, skip: (i) => i % 2 === 1 });
    windowRow(fk, { x0: -CL / 2, x1: CL / 2, n: 12, y: 0.0, ww: 0.95, wh: 2.1, glass: 'timberDark', depth: 0.1, skip: (i) => i % 2 === 0 });
  }
  // walled front gardens
  ck.box('brickDark', -CL / 2, -1, -9, CL, 2.1, 0.35);
  for (let i = 0; i <= 6; i++) ck.box('brickDark', -CL / 2 + (CL * i) / 6 - 0.15, -1, -9, 0.3, 2.1, 9);
  // watch house / boat house on the shingle
  const bh = kit.sub(cx, 0, cz, yaw).sub(52, g, -26, 0);
  bh.box('timberDark', -6, -1, -4, 12, 5.5, 8);
  bh.fr('slate', 0, 4.5, 0, 12.6, 8.6, 2.6, 12.6, 0);
  out.push({ name: 'Calshot coastguard cottages', pts: [ck.toWorld(-CL / 2, 0, -10), ck.toWorld(CL / 2, 0, -10), ck.toWorld(CL / 2, 0, CD), ck.toWorld(-CL / 2, 0, CD)] });
  return out;
}
