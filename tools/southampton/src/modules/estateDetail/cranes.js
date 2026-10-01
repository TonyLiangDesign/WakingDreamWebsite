import * as THREE from 'three';
import { M4 } from './fb.js';

const Q = 4.6;

// Electric portal travelling crane with luffing lattice jib (after dock.js). Local frame:
// rails at z = zA and zB (portal straddles the quay track), slew 0 = jib toward +x.
export function portalCrane(b, x, zA, zB, slew, luff, opts = {}) {
  const portalH = opts.portalH ?? 7.2, zc = (zA + zB) / 2, gauge = Math.abs(zA - zB);
  const k = opts.key || 'steel', house = opts.house || 'shedTrim';
  for (const z of [zA, zB]) {
    for (const dx of [-2.6, 2.6]) {
      b.box(k, x + dx - 0.9, Q + 0.05, z - 0.35, 1.8, 0.7, 0.7);
      b.strut(k, [x + dx, Q + 0.7, z], [x + dx * 0.45, Q + portalH, zc + (z - zc) * 0.35], 0.42);
    }
    b.strut(k, [x - 2.6, Q + 1.4, z], [x + 2.6, Q + 1.4, z], 0.25);
    b.strut(k, [x - 2.6, Q + 1.4, z], [x + 1.2, Q + portalH - 0.5, zc + (z - zc) * 0.35], 0.16);
  }
  b.box(k, x - 1.6, Q + portalH, zc - gauge * 0.25, 3.2, 0.7, gauge * 0.5);
  const base = [x, Q + portalH + 0.7, zc];
  const c = Math.cos(slew), s = Math.sin(slew);
  const rot = (lx, ly, lz) => [base[0] + lx * c + lz * s, base[1] + ly, base[2] - lx * s + lz * c];
  b.cyl(k, base[0], base[1] + 0.25, base[2], 1.8, 1.8, 0.5, 12);
  const hc = rot(-1.2, 2.1, 0);
  b.cbox(house, hc[0], hc[1], hc[2], 5.2, 3.2, 3.4, 0, slew, 0);
  const hr = rot(-1.2, 3.85, 0);
  b.add('roof', new THREE.CylinderGeometry(1.8, 1.8, 5.3, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.25, 1), M4(hr[0], hr[1], hr[2], 0, slew, 0));
  const cw = rot(-3.9, 1.3, 0);
  b.cbox(k, cw[0], cw[1], cw[2], 1.2, 2.0, 2.8, 0, slew, 0);
  const win = rot(1.62, 2.4, 0);
  b.cbox('glass', win[0], win[1], win[2], 0.02, 0.9, 2.4, 0, slew, 0);
  const ap = rot(-0.6, 7.5, 0);
  for (const sd of [-1, 1]) {
    b.strut(k, rot(1.4, 0.5, sd * 1.3), ap, 0.2);
    b.strut(k, rot(-3.4, 0.5, sd * 1.3), ap, 0.2);
  }
  const L = opts.L ?? 24;
  const ca = Math.cos(luff), sa = Math.sin(luff);
  const jibPt = (t, o1, o2) => rot(1.8 + t * L * ca + o1 * -sa, 1.0 + t * L * sa + o1 * ca, o2);
  const w0 = 1.1, h0 = 0.9;
  const corners = [[-h0, -w0], [h0, -w0], [h0, w0], [-h0, w0]];
  const taper = (t, v) => v * (1 - 0.7 * t);
  for (const [o1, o2] of corners) b.strut(k, jibPt(0, o1, o2), jibPt(1, taper(1, o1), taper(1, o2)), 0.18);
  const N = opts.lod === 'low' ? 6 : 12;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    for (const [ia, ib] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
      const a = corners[ia], cc = corners[ib];
      b.strut(k, jibPt(t0, taper(t0, a[0]), taper(t0, a[1])), jibPt(t1, taper(t1, cc[0]), taper(t1, cc[1])), 0.07);
    }
  }
  const tip = jibPt(1, 0, 0);
  b.rod('castIron', ap, tip, 0.035, 3);
  const hookY = Math.max(Q + 3 + (tip[1] - Q) * (0.25 + (opts.hook ?? 0.1)), Q + 5);
  b.rod('castIron', tip, [tip[0], hookY, tip[2]], 0.025, 3);
  b.box('castIron', tip[0] - 0.25, hookY - 0.9, tip[2] - 0.18, 0.5, 0.9, 0.35);
}

// Rail-mounted steam travelling crane (Appleby / Stothert & Pitt type), jib toward +x at slew 0.
export function steamCrane(b, x, z, slew, opts = {}) {
  const c = Math.cos(slew), s = Math.sin(slew);
  const rot = (lx, ly, lz) => [x + lx * c + lz * s, Q + ly, z - lx * s + lz * c];
  // truck
  b.box('black', x - 2.6, Q + 0.35, z - 1.3, 5.2, 0.7, 2.6);
  for (const dx of [-1.6, 1.6]) for (const dz of [-0.72, 0.72]) b.add('black', WHEEL, M4(x + dx, Q + 0.45, z + dz, Math.PI / 2, 0, 0));
  b.cyl('black', x, Q + 1.15, z, 1.2, 1.2, 0.2, 10);
  // body
  const bc = rot(-0.9, 2.2, 0);
  b.cbox('timberDark', bc[0], bc[1], bc[2], 3.8, 2.4, 2.5, 0, slew, 0);
  const rc = rot(-0.9, 3.5, 0);
  b.cbox('roof', rc[0], rc[1], rc[2], 4.2, 0.12, 2.9, 0, slew, 0);
  const boil = rot(-2.3, 2.5, 0);
  b.cyl('black', boil[0], boil[1], boil[2], 0.55, 0.55, 2.6, 10);
  const fun = rot(-2.3, 4.6, 0);
  b.cyl('black', fun[0], fun[1], fun[2], 0.16, 0.18, 1.8, 6);
  const cwt = rot(-3.2, 1.6, 0);
  b.cbox('castIron', cwt[0], cwt[1], cwt[2], 0.9, 1.0, 2.2, 0, slew, 0);
  const L = opts.L ?? 12, luff = opts.luff ?? 0.75;
  const tip = rot(0.9 + Math.cos(luff) * L, 1.5 + Math.sin(luff) * L, 0);
  for (const sd of [-0.55, 0.55]) b.strut('timber', rot(0.9, 1.4, sd), tip, 0.2);
  for (let t = 0.2; t < 0.95; t += 0.25) {
    const a = rot(0.9 + Math.cos(luff) * L * t, 1.5 + Math.sin(luff) * L * t, -0.55 * (1 - t));
    const bb = rot(0.9 + Math.cos(luff) * L * t, 1.5 + Math.sin(luff) * L * t, 0.55 * (1 - t));
    b.strut('steel', a, bb, 0.06);
  }
  const post = rot(-0.4, 4.2, 0);
  b.rod('castIron', post, tip, 0.03, 3);
  const hy = Q + 2 + Math.max(1, (tip[1] - Q) * 0.35);
  b.rod('castIron', tip, [tip[0], hy, tip[2]], 0.025, 3);
  b.box('castIron', tip[0] - 0.2, hy - 0.6, tip[2] - 0.2, 0.4, 0.6, 0.4);
}
const WHEEL = new THREE.CylinderGeometry(0.45, 0.45, 0.14, 8);

// Fixed hydraulic quay crane (Armstrong type) on a cast-iron pedestal. Jib toward +x at slew 0.
export function hydraulicCrane(b, x, z, slew, opts = {}) {
  const c = Math.cos(slew), s = Math.sin(slew);
  const rot = (lx, ly, lz) => [x + lx * c + lz * s, Q + ly, z - lx * s + lz * c];
  b.cyl('castIron', x, Q + 0.3, z, 1.0, 1.2, 0.6, 10);
  b.cyl('castIron', x, Q + 2.2, z, 0.45, 0.6, 3.2, 8);
  const L = opts.L ?? 9;
  const tip = rot(L * 0.95, 8.5, 0);
  for (const sd of [-0.3, 0.3]) {
    b.strut('castIron', rot(0.3, 3.2, sd), tip, 0.16);
    b.strut('castIron', rot(-0.4, 4.0, sd), rot(L * 0.5, 6.0, sd * 0.6), 0.1);
  }
  b.strut('castIron', rot(-1.0, 3.0, 0), rot(-0.2, 4.6, 0), 0.2);
  b.cbox('castIron', ...rot(-1.1, 3.3, 0), 1.0, 1.0, 1.2, 0, slew, 0);
  const hy = Q + 3 + (opts.hook ?? 0.5) * 4;
  b.rod('castIron', tip, [tip[0], hy, tip[2]], 0.02, 3);
  b.box('castIron', tip[0] - 0.15, hy - 0.5, tip[2] - 0.15, 0.3, 0.5, 0.3);
}

// Large fixed hammerhead crane for the repair works (lattice tower + cantilever).
export function hammerhead(b, x, z, slew, opts = {}) {
  const H = opts.H ?? 38, w = 5.5, k = 'steel';
  const legs = [[-w, -w], [w, -w], [w, w], [-w, w]];
  b.gbox('stone', x - w - 1.2, Q, z - w - 1.2, 2 * w + 2.4, 1.2, 2 * w + 2.4);
  for (const [dx, dz] of legs) b.strut(k, [x + dx, Q + 1.2, z + dz], [x + dx * 0.45, Q + H, z + dz * 0.45], 0.5);
  const lvl = 7;
  for (let i = 0; i < lvl; i++) {
    const t0 = i / lvl, t1 = (i + 1) / lvl;
    const y0 = Q + 1.2 + (H - 1.2) * t0, y1 = Q + 1.2 + (H - 1.2) * t1;
    const f0 = 1 - 0.55 * t0, f1 = 1 - 0.55 * t1;
    for (let j = 0; j < 4; j++) {
      const a = legs[j], cc = legs[(j + 1) % 4];
      b.strut(k, [x + a[0] * f0, y0, z + a[1] * f0], [x + cc[0] * f1, y1, z + cc[1] * f1], 0.14);
      b.strut(k, [x + a[0] * f1, y1, z + a[1] * f1], [x + cc[0] * f1, y1, z + cc[1] * f1], 0.16);
    }
  }
  const c = Math.cos(slew), s = Math.sin(slew);
  const rot = (lx, ly, lz) => [x + lx * c + lz * s, Q + H + ly, z - lx * s + lz * c];
  b.cyl(k, x, Q + H + 0.4, z, 3.2, 3.2, 0.8, 12);
  const Lf = opts.Lf ?? 30, Lb = opts.Lb ?? 14, hh = 4.5, hw = 1.6;
  // cantilever: two Pratt trusses
  for (const sd of [-hw, hw]) {
    b.strut(k, rot(-Lb, 0.8, sd), rot(Lf, 0.8, sd), 0.35);
    b.strut(k, rot(-Lb, hh * 0.6, sd), rot(0, hh + 0.8, sd), 0.3);
    b.strut(k, rot(0, hh + 0.8, sd), rot(Lf, 1.8, sd), 0.3);
    for (let t = -Lb; t < Lf; t += 4) {
      const topY = (u) => (u <= 0 ? 0.8 + (hh * 0.6 - 0.8) + ((u + Lb) / Lb) * (hh + 0.8 - hh * 0.6) - (hh * 0.6 - 0.8) : hh + 0.8 - (u / Lf) * (hh - 1.0));
      const yA = t <= 0 ? hh * 0.6 + ((t + Lb) / Lb) * (hh + 0.8 - hh * 0.6) : hh + 0.8 - (t / Lf) * (hh - 1.0);
      b.strut(k, rot(t, 0.8, sd), rot(t, yA, sd), 0.12);
      const t2 = Math.min(t + 4, Lf);
      const yB = t2 <= 0 ? hh * 0.6 + ((t2 + Lb) / Lb) * (hh + 0.8 - hh * 0.6) : hh + 0.8 - (t2 / Lf) * (hh - 1.0);
      b.strut(k, rot(t, yA, sd), rot(t2, 0.8, sd), 0.1);
      void topY; void yB;
    }
  }
  for (let t = -Lb; t <= Lf; t += 8) b.strut(k, rot(t, 0.8, -hw), rot(t, 0.8, hw), 0.14);
  // machinery house & counterweight at the back
  b.cbox('shedTrim', ...rot(-Lb + 4, 2.6, 0), 7, 3.6, 4.2, 0, slew, 0);
  b.cbox('roof', ...rot(-Lb + 4, 4.5, 0), 7.6, 0.2, 4.8, 0, slew, 0);
  b.cbox('castIron', ...rot(-Lb + 0.8, -0.6, 0), 2.2, 3.2, 3.6, 0, slew, 0);
  // trolley, falls, hook block
  const tr = rot(Lf * (opts.trolley ?? 0.7), 0.3, 0);
  b.box('shedTrim', tr[0] - 1.2, tr[1] - 0.6, tr[2] - 1.2, 2.4, 0.9, 2.4);
  const hy = Q + (opts.hookY ?? 14);
  for (const sd of [-0.3, 0.3]) b.rod('castIron', [tr[0] + sd, tr[1] - 0.6, tr[2]], [tr[0] + sd, hy + 1, tr[2]], 0.03, 3);
  b.box('castIron', tr[0] - 0.5, hy, tr[2] - 0.4, 1.0, 1.2, 0.8);
  // access ladder cage
  b.strut('castIron', [x + w + 0.3, Q + 1.2, z], [x + w * 0.45 + 0.3, Q + H, z], 0.1);
}

// Floating sheerlegs crane on a pontoon. Local: pontoon along x, legs lean toward +x.
export function floatingCrane(b, x, z, ry) {
  b.pushFrame(x, z, ry);
  const L = 36, W = 16, fb = 2.2;
  b.box('hullBlack', -L / 2, -1.2, -W / 2, L, fb + 1.2, W);
  b.box('timber', -L / 2 + 0.3, fb - 0.02, -W / 2 + 0.3, L - 0.6, 0.1, W - 0.6);
  b.box('shedTrim', -L / 2 + 2, fb, -4, 9, 3.6, 8);
  gableRoofLite(b, -L / 2 + 2, fb + 3.6, -4, 9, 8, 1.2);
  b.cyl('black', -L / 2 + 5, fb + 6.5, 0, 0.45, 0.5, 3.8, 8);
  const top = [L / 2 + 6, fb + 32, 0];
  for (const sd of [-6.5, 6.5]) b.strut('steel', [L / 2 - 3, fb, sd], top, 0.7);
  b.strut('steel', [-L / 2 + 12, fb, 0], [top[0] - 1, top[1] - 1, 0], 0.55);
  for (let t = 0.2; t < 0.9; t += 0.2) b.strut('steel', [L / 2 - 3 + (top[0] - L / 2 + 3) * t, fb + (top[1] - fb) * t, -6.5 * (1 - t)], [L / 2 - 3 + (top[0] - L / 2 + 3) * t, fb + (top[1] - fb) * t, 6.5 * (1 - t)], 0.2);
  b.rod('castIron', top, [top[0], fb + 8, 0], 0.05, 4);
  b.box('castIron', top[0] - 0.6, fb + 6.8, -0.5, 1.2, 1.4, 1.0);
  b.pop();
}
function gableRoofLite(b, x0, y0, z0, lx, lz, rise) {
  const half = lz / 2 + 0.3, sl = Math.hypot(half, rise), ang = Math.atan2(rise, half);
  b.cbox('roof', x0 + lx / 2, y0 + rise / 2, z0 + lz / 2 - half / 2, lx + 0.6, 0.1, sl, -ang, 0, 0);
  b.cbox('roof', x0 + lx / 2, y0 + rise / 2, z0 + lz / 2 + half / 2, lx + 0.6, 0.1, sl, ang, 0, 0);
}
