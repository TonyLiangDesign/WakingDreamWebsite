import * as THREE from 'three';
import { frustum, extrudeProfile, lancet, roundArch } from './kit.js';
import { groundRange, crenels, windowRow } from './common.js';

// Old Town and St Mary's churches. Local +x = east (liturgical east), -z = north.

function wallBox(b, key, x0, x1, z0, z1, h, lo) {
  b.box('rubbleDark', x0 - 0.3, lo - 2, z0 - 0.3, x1 - x0 + 0.6, 2.6 - lo, z1 - z0 + 0.6);
  b.box(key, x0, 0, z0, x1 - x0, h, z1 - z0);
}

function buttresses(b, key, x0, x1, z, dir, n, h, w = 0.9, d = 1.1) {
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    b.box(key, x - w / 2, 0, dir < 0 ? z - d : z, w, h * 0.8, d);
    b.cbox(key, x, h * 0.8, dir < 0 ? z - d * 0.3 : z + d * 0.3, w, 0.9, d * 0.6, dir < 0 ? -0.5 : 0.5, 0, 0);
  }
}

function lancetRow(k, x0, x1, n, y, w, h, key = 'glass') {
  const g = extrudeProfile(lancet(w, h, 4), 0.3);
  for (let i = 0; i < n; i++) k.geo(key, g, x0 + ((x1 - x0) * (i + 0.5)) / n, y, -0.1);
}

// --------------------------------------------------------------- St Michael's
// Norman nave (c.1070) widened in the 19th c.; central tower with the tall
// slender spire (1732, rebuilt 1887), ~50 m — the landmark seen from the water.
export function stMichael(ctx, kit) {
  const [x, z] = ctx.layout.LANDMARKS.stMichael;
  const k0 = kit.sub(x, 0, z, 0);
  const [lo, hi] = groundRange(ctx, k0, -32, 22, -11, 11);
  const g = (lo + hi) / 2 + 0.3;
  const b = k0.sub(0, g, 0);
  const L = lo - g;
  // nave + aisles west of the crossing, chancel + chapels east
  wallBox(b, 'rubble', -30, -4, -4.2, 4.2, 9.5, L);
  wallBox(b, 'rubble', -30, -4, -10.5, -4.2, 6.2, L);
  wallBox(b, 'rubble', -30, -4, 4.2, 10.5, 6.2, L);
  wallBox(b, 'rubble', 4, 20, -4, 4, 8.5, L);
  wallBox(b, 'rubble', 4, 16, -10.5, -4, 6.0, L);
  wallBox(b, 'rubble', 4, 16, 4, 10.5, 6.0, L);
  // roofs: three parallel gables west, chancel gable east
  b.fr('slate', -17, 9.5, 0, 26.6, 9.0, 4.4, 26.6, 0);
  b.fr('slate', -17, 6.2, -7.35, 26.6, 6.8, 3.4, 26.6, 0);
  b.fr('slate', -17, 6.2, 7.35, 26.6, 6.8, 3.4, 26.6, 0);
  b.fr('slate', 12, 8.5, 0, 16.6, 8.6, 4.2, 16.6, 0);
  b.fr('slate', 10, 6.0, -7.25, 12.6, 6.9, 3.2, 12.6, 0);
  b.fr('slate', 10, 6.0, 7.25, 12.6, 6.9, 3.2, 12.6, 0);
  // west gables with big windows
  for (const [zc, w, h, gh] of [[0, 8.4, 9.5, 4.4], [-7.35, 6.3, 6.2, 3.4], [7.35, 6.3, 6.2, 3.4]]) {
    const wk = b.sub(-30, 0, zc, Math.PI / 2);
    wk.geo('glass', extrudeProfile(lancet(w * 0.42, h * 0.45, 5), 0.3), 0, h * 0.25, -0.1);
  }
  b.sub(20, 0, 0, -Math.PI / 2).geo('glass', extrudeProfile(lancet(3.6, 3.5, 5), 0.3), 0, 2.2, -0.1);
  // aisle windows
  for (const [zf, ry] of [[-10.5, 0], [10.5, Math.PI]]) {
    const sk = b.sub(ry ? -17 : -17, 0, zf, ry);
    lancetRow(sk, -12, 12, 5, 1.8, 1.4, 2.4);
    const ck = b.sub(10, 0, zf, ry);
    lancetRow(ck, -5, 5, 2, 1.8, 1.4, 2.2);
  }
  buttresses(b, 'rubbleDark', -30, -4, -10.5, -1, 5, 6.2, 0.8, 0.9);
  buttresses(b, 'rubbleDark', -30, -4, 10.5, 1, 5, 6.2, 0.8, 0.9);
  // central tower
  const T = 8.4, TH = 24;
  b.box('rubbleDark', -T / 2, 0, -T / 2, T, TH, T);
  b.box('stone', -T / 2 - 0.2, 14, -T / 2 - 0.2, T + 0.4, 0.4, T + 0.4);
  b.box('stone', -T / 2 - 0.3, TH - 0.4, -T / 2 - 0.3, T + 0.6, 0.6, T + 0.6);
  for (const f of b.faces(0, 0, T, T)) {
    const lv = extrudeProfile(roundArch(1.1, 2.6, 6), 0.3);
    for (const xo of [-1.5, 1.5]) f.k.geo('glass', lv, xo, 18.2, -0.1);
    f.k.cyl('glass', 0, 15.6, -0.05, 0.9, 0.9, 0.12, 12, Math.PI / 2, 0, 0); // clock
    f.k.cyl('white', 0, 15.6, -0.1, 0.8, 0.8, 0.06, 12, Math.PI / 2, 0, 0);
    crenels(f.k, 'stone', -T / 2, T / 2, TH + 0.2, -0.25, 0.5, 0.8, 0.6, 0.9);
  }
  // octagonal spire with lucarnes and corner pinnacles
  const SB = TH + 0.2, SH = 26.5;
  b.geo('churchStone', coneGeo(3.7, SH, 8), 0, SB, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const lk = b.sub(Math.cos(a) * 2.6, SB + 3.5, Math.sin(a) * 2.6, -a - Math.PI / 2);
    lk.cbox('churchStone', 0, 1.2, 0.4, 1.2, 2.4, 1.2);
    lk.geo('glass', extrudeProfile(lancet(0.6, 1.2, 3), 0.1), 0, 0.4, -0.25);
    lk.geo('churchStone', frustum(1.4, 1.4, 1.3, 0, 1.4), 0, 2.4, 0.4);
    const pa = a + Math.PI / 4;
    b.geo('churchStone', coneGeo(0.45, 3.2, 4), Math.cos(pa) * T * 0.66, SB, Math.sin(pa) * T * 0.66);
  }
  b.cyl('castIron', 0, SB + SH + 1.2, 0, 0.05, 0.05, 2.6, 4);
  b.cbox('castIron', 0, SB + SH + 1.8, 0, 1.0, 0.06, 0.06);
  return { name: "St Michael's Church", pts: [k0.toWorld(-32, 0, -12), k0.toWorld(22, 0, -12), k0.toWorld(22, 0, 12), k0.toWorld(-32, 0, 12)] };
}

// --------------------------------------------------------------- Holy Rood
// 14th-century "church of the sailors" on the High Street; tower with a
// slender spire at the south-west corner, standing on the street line.
export function holyRood(ctx, kit) {
  const [x, z] = ctx.layout.LANDMARKS.holyRood;
  const k0 = kit.sub(x, 0, z, 0);
  const [lo, hi] = groundRange(ctx, k0, -22, 28, -6, 11);
  const g = (lo + hi) / 2 + 0.3;
  const b = k0.sub(0, g, 0);
  const L = lo - g;
  wallBox(b, 'rubble', -16, 17, -4.5, 4.5, 9.0, L);
  wallBox(b, 'rubble', -16, 12, 4.5, 10.5, 6.0, L);
  wallBox(b, 'rubble', 17, 27, -3.6, 3.6, 7.5, L);
  b.fr('slate', 0.5, 9.0, 0, 33.6, 9.6, 4.8, 33.6, 0);
  b.sub(-2, 6.0, 7.5, 0).fr('slate', 0, 0, 0, 28.6, 6.6, 3.0, 28.6, 0);
  b.fr('slate', 22, 7.5, 0, 10.6, 7.8, 3.8, 10.6, 0);
  lancetRow(b.sub(-2, 0, 10.5, Math.PI), -12, 12, 5, 1.6, 1.5, 2.6);
  lancetRow(b.sub(0, 0, -4.5, 0), -14, 14, 6, 2.2, 1.6, 3.4);
  b.sub(-16, 0, 0, Math.PI / 2).geo('glass', extrudeProfile(lancet(3.2, 3.6, 5), 0.3), 0, 2.5, -0.1);
  b.sub(27, 0, 0, -Math.PI / 2).geo('glass', extrudeProfile(lancet(2.8, 2.8, 5), 0.3), 0, 2.0, -0.1);
  buttresses(b, 'rubbleDark', -16, 12, 10.5, 1, 5, 6.0, 0.8, 0.9);
  // SW tower
  const tx = -19, tz = 7.4, T = 6.0, TH = 20.5;
  b.box('rubbleDark', tx - T / 2, L - 2, tz - T / 2, T, TH - L + 2, T);
  for (const f of b.faces(tx, tz, T, T)) {
    f.k.geo('glass', extrudeProfile(lancet(1.1, 2.2, 4), 0.3), 0, 15.3, -0.1);
    f.k.geo('glass', extrudeProfile(lancet(0.5, 1.2, 3), 0.3), 0, 8.5, -0.1);
    crenels(f.k, 'stone', -T / 2, T / 2, TH, -0.2, 0.4, 0.7, 0.5, 0.7);
  }
  b.box('stone', tx - T / 2 - 0.25, TH - 0.5, tz - T / 2 - 0.25, T + 0.5, 0.5, T + 0.5);
  b.box('stone', tx - T / 2 - 0.15, 11, tz - T / 2 - 0.15, T + 0.3, 0.3, T + 0.3);
  b.geo('churchStone', coneGeo(2.4, 11.5, 8), tx, TH, tz);
  b.cyl('castIron', tx, TH + 12.6, tz, 0.05, 0.05, 2.2, 4);
  // west door
  b.sub(tx, 0, tz - T / 2, 0).geo('glass', extrudeProfile(lancet(1.6, 2.0, 4), 0.3), 0, 0, -0.1);
  return { name: 'Holy Rood Church', pts: [k0.toWorld(-23, 0, -6), k0.toWorld(28, 0, -6), k0.toWorld(28, 0, 11), k0.toWorld(-23, 0, 11)] };
}

// --------------------------------------------------------------- St Mary's
// G. E. Street's "mother church" (1878–84). In April 1912 the tower and spire
// (completed 1914) were not yet built: the base stands as a stump in scaffolding.
export function stMary(ctx, kit) {
  const [x, z] = ctx.layout.LANDMARKS.stMary;
  const k0 = kit.sub(x, 0, z, 0);
  const [lo, hi] = groundRange(ctx, k0, -42, 38, -20, 13);
  const g = (lo + hi) / 2 + 0.3;
  const b = k0.sub(0, g, 0);
  const L = lo - g;
  const CL = 19; // clerestory wall height
  wallBox(b, 'churchStone', -32, 28, -5.5, 5.5, CL, L);
  wallBox(b, 'churchStone', -32, 16, -12, -5.5, 8, L);
  wallBox(b, 'churchStone', -32, 16, 5.5, 12, 8, L);
  // polygonal apse (half-octagon)
  const apse = [];
  for (let i = 0; i <= 4; i++) apse.push([28 + Math.sin((i / 4) * Math.PI) * 5.5, -Math.cos((i / 4) * Math.PI) * 5.5]);
  for (let i = 0; i < 4; i++) {
    const [ax, az] = apse[i], [bx, bz] = apse[i + 1];
    const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
    b.cbox('churchStone', (ax + bx) / 2, CL / 2 + L / 2 - 1, (az + bz) / 2, len + 0.6, CL - L + 2, 0.9, 0, -ang, 0);
    const wk = b.sub((ax + bx) / 2, 0, (az + bz) / 2, -ang + Math.PI);
    wk.geo('glass', extrudeProfile(lancet(1.3, 7.0, 4), 0.3), 0, 6.5, 0.55);
    b.cbox('stoneDark', ax, CL * 0.4, az, 1.0, CL * 0.8, 1.0, 0, -ang, 0);
  }
  // apse roof: half cone
  const ar = new THREE.CylinderGeometry(0, 6.2, 7.5, 8, 1, true, 0, Math.PI);
  b.geo('slate', ar, 28, CL + 3.75, 0, 0, 0, 0);
  b.fr('slate', -2, CL, 0, 61.0, 12.6, 8.2, 61.0, 0);
  b.fr('slate', -8, 8, -8.75, 48.6, 7.4, 3.6, 48.6, 0, 0, 0, 3.2);
  b.fr('slate', -8, 8, 8.75, 48.6, 7.4, 3.6, 48.6, 0, 0, 0, -3.2);
  // clerestory, aisle lancets, buttresses
  for (const [zf, ry, dir] of [[-5.5, 0, -1], [5.5, Math.PI, 1]]) {
    const ck = b.sub(-8, 0, zf, ry);
    lancetRow(ck, -23, 23, 8, 12.8, 1.3, 3.6);
  }
  for (const [zf, ry, dir] of [[-12, 0, -1], [12, Math.PI, 1]]) {
    const ak = b.sub(-8, 0, zf, ry);
    lancetRow(ak, -23, 23, 8, 2.2, 1.2, 3.4);
    buttresses(b, 'stoneDark', -32, 16, zf, dir, 8, 8, 1.0, 1.3);
  }
  lancetRow(b.sub(22, 0, -5.5, 0), -5.5, 5.5, 2, 9.0, 1.4, 6.0);
  lancetRow(b.sub(22, 0, 5.5, Math.PI), -5.5, 5.5, 2, 9.0, 1.4, 6.0);
  // west front: three tall lancets + rose
  const wf = b.sub(-32, 0, 0, Math.PI / 2);
  lancetRow(wf, -4.2, 4.2, 3, 3.0, 1.8, 8.5);
  wf.cyl('glass', 0, 15.2, -0.08, 1.9, 1.9, 0.2, 14, Math.PI / 2, 0, 0);
  wf.cbox('stoneDark', 0, 1.8, -0.5, 3.0, 3.6, 1.0);
  for (const zb of [-5.5, 5.5]) b.cbox('stoneDark', -32.6, CL * 0.45, zb, 1.2, CL * 0.9, 1.2);
  // unfinished tower base at the north-west, in scaffolding
  const tx = -37, tz = -15.5, T = 9, TH = 10.5;
  b.box('churchStone', tx - T / 2, L - 2, tz - T / 2, T, TH - L + 2, T);
  for (let lift = 0; lift < 4; lift++) b.box('stoneDark', tx - T / 2 + 0.3, TH + lift * 0.7, tz - T / 2 + 0.3 + (lift % 2) * 0.4, T - 0.6 - lift * 0.8, 0.7, T - 0.6 - (lift % 2) * 0.8);
  const S = T / 2 + 1.3, SH = TH + 7;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    for (let i = 0; i <= 4; i++) {
      const t = i / 4 * 2 - 1;
      const px = sx === sz ? tx + S * sx : tx + t * S, pz = sx === sz ? tz + t * S : tz + S * sz;
      b.cyl('timberDark', px, SH / 2 + L / 2, pz, 0.08, 0.08, SH - L, 5);
    }
  }
  for (let y = 2; y <= SH; y += 2) {
    for (const f of b.faces(tx, tz, 2 * S, 2 * S, y)) f.k.cbox('timberDark', 0, 0, 0, f.len + 0.4, 0.14, 0.14);
    if (y % 4 === 0) for (const f of b.faces(tx, tz, 2 * S - 0.6, 2 * S - 0.6, y + 0.1)) f.k.cbox('timber', 0, 0, 0.3, f.len, 0.06, 0.9);
  }
  // hoist gin pole & a braced diagonal per face
  b.cyl('timberDark', tx, TH + 6, tz, 0.12, 0.12, 12, 5);
  for (const f of b.faces(tx, tz, 2 * S, 2 * S)) f.k.strut('timberDark', [-S, 0.5, -0.1], [S, SH - 1, -0.1], 0.12);
  return { name: "St Mary's Church", pts: [k0.toWorld(-43, 0, -21), k0.toWorld(35, 0, -21), k0.toWorld(35, 0, 13), k0.toWorld(-43, 0, 13)] };
}

const CONES = new Map();
export function coneGeo(r, h, seg) {
  const key = `${r},${h},${seg}`;
  if (!CONES.has(key)) {
    const g = new THREE.CylinderGeometry(0, r, h, seg, 1, true);
    g.rotateY(Math.PI / seg);
    g.translate(0, h / 2, 0);
    CONES.set(key, g);
  }
  return CONES.get(key);
}
