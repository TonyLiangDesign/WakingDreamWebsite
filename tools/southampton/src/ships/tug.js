import * as THREE from 'three';
import { Mesher, col, shade } from './kit.js';
import { hullGeometry } from './hull.js';
import { funnelMaterial } from './materials.js';
import { tugMaterials } from './tug-materials.js';
import { smoothHull, railings, openingsMeshes } from './liner.js';
import * as P from './parts.js';
import { mulberry32 } from '../textures.js';

const { PAL } = P;

// Edwardian steam screw tug (Red Funnel / Alexandra Towing type): low sheer hull with a
// plated bulwark and heavy rubbing strake, engine & boiler casing with skylight, varnished
// wheelhouse and open flying bridge, tall raked funnel, towing hook and towing bows aft.
export function makeTug(seed = 1, { funnel = 'buff', identity = null } = {}) {
  const mats = tugMaterials();
  const r = mulberry32(seed * 97 + 13);
  const randomL = 30 + r() * 7, randomB = 6.4 + r() * 1.3;
  const L = identity?.L ?? randomL, B = identity?.B ?? randomB, T = 2.9, D = 4.5;
  const K = new Mesher();
  const group = new THREE.Group();
  group.name = identity?.name ?? 'tug' + seed;
  const hull = hullGeometry({ L, B, T, D, sheerF: 1.3, sheerA: 0.5, rake: 0.6, overhang: 2.4, forefoot: 1.0, body: 0.1, NU: 90, NV: 18, bottom: 0x42251d, topsides: 0x303634, boot: 0x202826 });
  const { S, hbTop } = hull;
  K.geo('hull', smoothHull(hull.geometry), new THREE.Matrix4(), null);
  const X0 = -L / 2, X1 = L / 2;
  const plats = [];
  const surfAt = (x, z) => {
    let y = -Infinity;
    for (const p of plats) { if (x < p.x0 || x > p.x1 || Math.abs(z - p.zc) > p.hw(x)) continue; y = Math.max(y, S(x) + p.off); }
    return y;
  };
  const deckC = col(0x80725b), black = col(0x303634), teak = col(0x887151);
  const funnelC = funnel === 'red' ? 0x823126 : 0xad874e;
  const casingC = r() < 0.5 ? 0x514a3c : 0x5b564b;
  const bwH = 0.82, bw = 0.16;

  // deck, bulwark, rubbing strake
  const xs = [];
  for (let i = 0; i <= 36; i++) xs.push(X0 + (L * i) / 36);
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1], ha = hbTop(xa), hb = hbTop(xb), ya = S(xa), yb = S(xb);
    const ia = Math.max(ha - bw, 0), ib = Math.max(hb - bw, 0);
    K.quad('deck', [xa, ya, -ia], [xb, yb, -ib], [xb, yb, ib], [xa, ya, ia], deckC, [0, 1, 0]);
    for (const s of [1, -1]) {
      K.quad('hull', [xa, ya, s * ha], [xb, yb, s * hb], [xb, yb + bwH, s * hb], [xa, ya + bwH, s * ha], black, [0, 0, s]);
      K.quad('paint', [xa, ya, s * ia], [xb, yb, s * ib], [xb, yb + bwH, s * ib], [xa, ya + bwH, s * ia], shade(0x6e6252, 1), [0, 0, -s]);
      K.quad('timber', [xa, ya + bwH, s * ia], [xb, yb + bwH, s * ib], [xb, yb + bwH, s * (hb + 0.03)], [xa, ya + bwH, s * (ha + 0.03)], teak, [0, 1, 0]);
      // Visible rolled lip and internal frames give the bulwark actual thickness.
      if (ha > 0.35) K.rod('timber', [xa, ya + bwH, s * (ha - bw * 0.5)], [xb, yb + bwH, s * (hb - bw * 0.5)], 0.047, teak, 8);
      if (i % 3 === 0 && ha > 1.0) K.strut('paint', [xa, ya + 0.1, s * (ia - 0.03)], [xa, ya + bwH - 0.06, s * (ia - 0.03)], 0.058, shade(0x707366, 0.7), 0.07);
      // rubbing strake (timber fender) just below the deck edge
      const ra = hull.hbAt(xa, ya - 0.4) + 0.22, rb = hull.hbAt(xb, yb - 0.4) + 0.22;
      if (ha > 0.4) {
        K.quad('beam', [xa, ya - 0.1, s * ra], [xb, yb - 0.1, s * rb], [xb, yb - 0.1, s * (rb - 0.25)], [xa, ya - 0.1, s * (ra - 0.25)], col(0x443e31), [0, 1, 0]);
        K.quad('beam', [xa, ya - 0.7, s * ra], [xb, yb - 0.7, s * rb], [xb, yb - 0.1, s * rb], [xa, ya - 0.1, s * ra], col(0x443e31), [0, 0, s]);
      }
    }
  }
  plats.push({ x0: X0, x1: X1, zc: 0, hw: hbTop, off: 0, rail: false });

  const dy = S(0);
  const cas = { x0: -L * 0.2, x1: L * 0.13, w: B * 0.5, h: 1.7 };
  const addBox = (x0, x1, zc, w, off, h, wall, roof, rail = false, roofKey = 'paint', wallKey = 'paint') => {
    const y0 = dy + off;
    K.box(wallKey, (x0 + x1) / 2, y0 + h / 2, zc, x1 - x0, h, w, col(wall));
    K.quad(roofKey, [x0 - 0.1, y0 + h + 0.01, zc - w / 2 - 0.1], [x1 + 0.1, y0 + h + 0.01, zc - w / 2 - 0.1], [x1 + 0.1, y0 + h + 0.01, zc + w / 2 + 0.1], [x0 - 0.1, y0 + h + 0.01, zc + w / 2 + 0.1], col(roof), [0, 1, 0]);
    plats.push({ x0: x0 - 0.1, x1: x1 + 0.1, zc, hw: () => w / 2 + 0.1, off: off + h + 0.01 - (S(0) - dy), rail });
  };
  // engine/boiler casing, dark roof
  addBox(cas.x0, cas.x1, 0, cas.w, 0, cas.h, casingC, 0x3a3631, false);
  // raised bridge deck forward of the funnel with varnished wheelhouse and open bridge on top
  const wx0 = L * 0.06, wx1 = L * 0.17;
  addBox(wx0, wx1, 0, 2.6, cas.h, 2.1, 0x64513a, 0x777266, true, 'paint', 'timber');
  // Deep roof fascia, timber sill and corner posts, rather than a bare box.
  for (const s of [-1, 1]) {
    K.box('timber', (wx0 + wx1) / 2, dy + cas.h + 2.09, s * 1.38, wx1 - wx0 + 0.27, 0.16, 0.14, col(0x423a2b));
    K.box('timber', (wx0 + wx1) / 2, dy + cas.h + 0.98, s * 1.32, wx1 - wx0 + 0.06, 0.10, 0.09, col(0x4a3324));
    for (const x of [wx0, wx1]) K.box('timber', x, dy + cas.h + 1.05, s * 1.32, 0.095, 2.06, 0.095, col(0x4a3324));
  }
  const openings = { window: [] };
  for (let z = -0.8; z <= 0.81; z += 0.8) openings.window.push({ x: wx1 + 0.042, y: dy + cas.h + 1.43, z, w: 0.63, h: 0.76, face: '+x' });
  for (const s of [1, -1]) for (const x of [wx0 + 0.8, wx0 + 1.8, wx0 + 2.8]) if (x < wx1 - 0.3) openings.window.push({ x, y: dy + cas.h + 1.43, z: s * 1.342, w: 0.64, h: 0.76, face: s > 0 ? '+z' : '-z' });
  for (const o of openings.window) {
    const front = o.face === '+x', edge = col(0x5e412b);
    for (const k of [-1, 1]) {
      K.box('timber', o.x + (front ? 0 : k * (o.w / 2 + 0.025)), o.y, o.z + (front ? k * (o.w / 2 + 0.025) : 0), front ? 0.08 : 0.06, o.h + 0.13, front ? 0.06 : 0.08, edge);
      K.box('timber', o.x, o.y + k * (o.h / 2 + 0.025), o.z, front ? 0.08 : o.w + 0.11, 0.06, front ? o.w + 0.11 : 0.08, edge);
    }
    K.box('timber', o.x + (front ? 0.006 : 0), o.y - 0.025, o.z, front ? 0.085 : o.w, 0.025, front ? o.w : 0.085, col(0x514631));
  }
  // Aft wheelhouse door with sill, panels and a brass latch.
  K.box('timber', wx0 - 0.025, dy + cas.h + 0.91, 0, 0.06, 1.8, 0.76, col(0x4a3223));
  K.box('glass', wx0 - 0.064, dy + cas.h + 1.35, 0, 0.018, 0.55, 0.50, col(0x182420));
  K.box('paint', wx0 - 0.09, dy + cas.h + 0.95, 0.25, 0.04, 0.05, 0.15, col(0x8c7950));
  // compass binnacle & telegraph on the open bridge
  const yb = dy + cas.h + 2.11;
  K.cyl('paint', (wx0 + wx1) / 2, yb, 0, 0.18, 1.0, teak, 8);
  K.box('paint', wx1 - 0.3, yb + 0.5, 0.7, 0.25, 1.0, 0.25, col(0x6b5530));
  // casing skylight and fittings aft of the funnel
  P.skylight(K, cas.x0 + 0.8, cas.x0 + 3.4, 0, dy + cas.h, 1.7, { h: 0.35, ridge: 0.4, frame: 0x645c49, coaming: 0x423d33 });
  const fx = -L * 0.01;
  const fh = 6.6 + r() * 1.2;
  const ftop = P.funnel(K, { x: fx, y: dy + cas.h, rx: 0.76, rz: 0.68, h: fh, rake: 7, color: funnelC, top: PAL.black, topH: fh * 0.19, pipes: 0, guyZ: hbTop(fx) - 0.3, guyX: 2.5, smooth: true });
  // Narrow steam exhaust and brass whistle; keep their diameter tug-sized.
  const rk = Math.tan(7 * Math.PI / 180);
  K.rod('paint', [fx - 0.91, dy + cas.h, 0.36], [fx - 0.91 - (fh + 0.35) * rk, dy + cas.h + fh + 0.35, 0.36], 0.08, col(0x53504a), 10, false);
  K.cyl('paint', fx + 0.55 - fh * 0.78 * rk, dy + cas.h + fh * 0.78, 0, 0.10, 0.33, col(0x8e7a4d), 12);
  P.cowlVent(K, fx + 1.6, dy + cas.h, 0.7, 0.28, 1.5, 0, funnelC);
  P.cowlVent(K, fx + 1.6, dy + cas.h, -0.7, 0.28, 1.5, 0, funnelC);
  P.cowlVent(K, cas.x0 + 4.2, dy + cas.h, 0.9, 0.25, 1.2, Math.PI, funnelC);
  const boatX = -L * 0.3, boatZ = 0;
  // towing hook post at the after end of the casing
  const hookX = cas.x0 - 0.6;
  K.box('paint', hookX, dy + 0.6, 0, 0.7, 1.2, 1.2, black);
  K.strut('paint', [hookX, dy + 1.1, 0], [hookX - 1.4, dy + 1.0, 0], 0.18, black);
  K.rod('dark', [hookX - 1.4, dy + 1.0, 0], [hookX - 1.5, dy + 0.5, 0], 0.06, col(0x202020), 4);
  // towing bows (steel arches over the after deck)
  for (const bxw of [-L * 0.27, -L * 0.35]) {
    const hb = hbTop(bxw) - bw - 0.15, y0 = S(bxw) + bwH;
    let prev = null;
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * Math.PI;
      const p = [bxw, y0 + Math.sin(a) * 1.5, -Math.cos(a) * hb];
      if (prev) K.strut('paint', prev, p, 0.12, black, 0.18);
      prev = p;
    }
  }
  // small boat stowed on the aft deck, on chocks
  const bl = L * 0.16;
  const bY = S(boatX) + 0.9 + 0.35;
  const m = new THREE.Matrix4().makeTranslation(boatX + L * 0.08, bY, boatZ + hbTop(boatX) * 0.25);
  K.geo('paint', P.lifeboatTpl(Number(bl.toFixed(2)), 1.7, 0.7, false), m, null);
  P.boatChocks(K, boatX + L * 0.08, S(boatX), hbTop(boatX) * 0.25, bl);
  // bitts, fairleads, capstan, anchor
  for (const x of [X1 - 3.2, L * 0.24, -L * 0.18, X0 + 2.6]) for (const s of [1, -1]) { const z = s * (hbTop(x) - 0.75); if (hbTop(x) > 1.6) P.bitts(K, x, S(x), z, true); }
  P.capstan(K, X1 - 5.2, S(X1 - 5.2), 0, 0.35);
  K.box('dark', X1 - 2.4, S(X1 - 2.4) + 0.08, 0, 2.2, 0.1, 0.28, col(0x1c1a18));
  // Chain locker hatch, hinged coal scuttles, engine-room ports and access ladders.
  K.box('paint', X1 - 6.3, S(X1 - 6.3) + 0.11, 0, 1.45, 0.20, 1.2, col(0x41453e));
  for (const s of [-1, 1]) {
    K.cyl('paint', cas.x0 + 3.6, dy + cas.h + 0.01, s * 0.85, 0.30, 0.07, col(0x252c27), 20);
    K.box('paint', cas.x0 + 3.6, dy + cas.h + 0.1, s * 0.85, 0.3, 0.035, 0.06, col(0x57594b));
    for (const x of [cas.x0 + 0.9, cas.x0 + 2.3, cas.x0 + 3.7]) {
      const pos = new THREE.Vector3(x, dy + 1.0, s * (cas.w / 2 + 0.012));
      const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s < 0 ? Math.PI : 0, 0)), new THREE.Vector3(1, 1, 1));
      K.geo('glass', new THREE.CircleGeometry(0.17, 18).toNonIndexed(), m, col(0x111c18));
      K.geo('paint', new THREE.TorusGeometry(0.18, 0.032, 6, 18).toNonIndexed(), m, col(0x837653));
    }
    const z = s * 1.49;
    const ladderX = wx0 - 0.25;
    for (const dx of [-0.28, 0.28]) K.rod('paint', [ladderX + dx, dy + 0.05, z], [ladderX + dx + 0.35, dy + cas.h + 0.2, z], 0.035, col(0x5a6054), 6);
    for (let y = 0.2; y < cas.h + 0.05; y += 0.28) K.rod('paint', [ladderX - 0.28 + y * 0.19, dy + y, z], [ladderX + 0.28 + y * 0.19, dy + y, z], 0.028, col(0x666958), 6);
  }
  // Flaked towing hawser and two secured coils; no modern tyre fenders.
  const hempC = col(0x76644a);
  for (const [cx, cz, radius] of [[X1 - 7.8, 0.7, 0.55], [cas.x0 - 2.0, -1.1, 0.64]]) {
    for (let k = 0; k < 5; k++) {
      const rr = radius - k * 0.08;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, S(cx) + 0.064, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1));
      K.geo('hemp', new THREE.TorusGeometry(rr, 0.041, 6, 28).toNonIndexed(), m, hempC);
    }
  }
  const hawser = new THREE.CatmullRomCurve3([
    new THREE.Vector3(hookX - 1.35, dy + 0.85, 0),
    new THREE.Vector3(hookX - 2.1, dy + 0.10, -0.35),
    new THREE.Vector3(hookX - 3.2, S(hookX - 3.2) + 0.09, -0.7),
    new THREE.Vector3(hookX - 5.3, S(hookX - 5.3) + 0.10, -0.3),
    new THREE.Vector3(hookX - 6.1, S(hookX - 6.1) + 0.09, 0.5),
  ]);
  K.geo('hemp', new THREE.TubeGeometry(hawser, 28, 0.055, 6, false).toNonIndexed(), new THREE.Matrix4(), hempC);
  // mast forward of the wheelhouse
  P.mast(K, { x: L * 0.22, y: S(L * 0.22), top: S(L * 0.22) + 8.5 + r() * 1.5, rake: 3, r: 0.13, topmast: false, stayF: [X1 - 0.5, S(X1) + bwH, 0], shrouds: [[L * 0.2, S(L * 0.2) + bwH, hbTop(L * 0.2) - 0.1], [L * 0.2, S(L * 0.2) + bwH, -hbTop(L * 0.2) + 0.1]], color: 0x9a7650 });
  // rope fenders hanging over the bulwark and a bow pudding fender
  for (let x = X0 + 4; x < X1 - 4; x += 4.5) for (const s of [1, -1]) {
    const z = s * (hbTop(x) + 0.25);
    K.rod('dark', [x, S(x) + bwH, s * hbTop(x)], [x, S(x) - 0.4, z], 0.025, col(PAL.rope), 3);
    const cy = S(x) - 0.72;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, cy, z), new THREE.Quaternion(), new THREE.Vector3(0.235, 0.57, 0.235));
    K.geo('hemp', new THREE.SphereGeometry(1, 12, 10).toNonIndexed(), m, shade(0x716148, 0.92 + r() * 0.14));
    // Tight turns read as coir fenders in close-up, not black rubber cylinders.
    for (let j = -4; j <= 4; j++) {
      const fy = j * 0.10;
      const fr = 0.235 * Math.sqrt(Math.max(0.05, 1 - (fy / 0.57) ** 2));
      const fm = new THREE.Matrix4().compose(new THREE.Vector3(x, cy + fy, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1));
      K.geo('hemp', new THREE.TorusGeometry(fr, 0.021, 4, 12).toNonIndexed(), fm, col(0x5f523d));
    }
  }
  const pudding = new THREE.CatmullRomCurve3([
    new THREE.Vector3(X1 - 2.0, S(X1 - 2.0) - 0.35, -hbTop(X1 - 2.0) - 0.12),
    new THREE.Vector3(X1 - 0.65, S(X1 - 0.65) - 0.39, -hbTop(X1 - 0.65) - 0.22),
    new THREE.Vector3(X1 + 0.10, S(X1) - 0.44, 0),
    new THREE.Vector3(X1 - 0.65, S(X1 - 0.65) - 0.39, hbTop(X1 - 0.65) + 0.22),
    new THREE.Vector3(X1 - 2.0, S(X1 - 2.0) - 0.35, hbTop(X1 - 2.0) + 0.12),
  ]);
  K.geo('hemp', new THREE.TubeGeometry(pudding, 36, 0.30, 10, false).toNonIndexed(), new THREE.Matrix4(), col(0x7c6e53));
  for (let i = 1; i < 34; i++) {
    const u = i / 34, p = pudding.getPoint(u), tangent = pudding.getTangent(u);
    const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangent), new THREE.Vector3(1, 1, 1));
    K.geo('hemp', new THREE.TorusGeometry(0.302, 0.018, 4, 10).toNonIndexed(), m, col(0x5d523d));
  }
  // rails on the flying bridge
  railings(K, plats, surfAt, S, { railColor: 0xd0cabd }, { height: 0.9, step: 0.6 });

  group.add(K.build({ ...mats, funnel: funnelMaterial(ftop.y) }, 'tug' + seed));
  for (const m of openingsMeshes(openings.window, 'window', mats)) group.add(m);
  group.userData.funnelTops = [ftop];
  group.userData.L = L;
  group.userData.B = B;
  group.userData.identity = identity;
  group.userData.tris = K.tris;
  group.userData.visualRevision = 'working-tug-1912-v2';
  return group;
}
