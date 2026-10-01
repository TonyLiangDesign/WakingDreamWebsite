import * as THREE from 'three';
import { M4 } from './fb.js';

const Q = 4.6;
export const RAIL_TOP = { ballast: Q + 0.43, setts: Q + 0.07 };

// ---------------------------------------------------------------- paths
// Waypoint polyline with bezier fillets at the corners. Returns segments {a, b, len} and cumulative s.
export function makePath(wp, r = 40) {
  const pts = [];
  const push = (x, z) => { const l = pts[pts.length - 1]; if (!l || Math.hypot(l[0] - x, l[1] - z) > 0.05) pts.push([x, z]); };
  push(wp[0][0], wp[0][1]);
  for (let i = 1; i < wp.length - 1; i++) {
    const A = wp[i - 1], B = wp[i], C = wp[i + 1];
    let d1x = B[0] - A[0], d1z = B[1] - A[1]; const l1 = Math.hypot(d1x, d1z); d1x /= l1; d1z /= l1;
    let d2x = C[0] - B[0], d2z = C[1] - B[1]; const l2 = Math.hypot(d2x, d2z); d2x /= l2; d2z /= l2;
    const cos = THREE.MathUtils.clamp(d1x * d2x + d1z * d2z, -1, 1), th = Math.acos(cos);
    if (th < 1e-3) { push(B[0], B[1]); continue; }
    const t = Math.min(r * Math.tan(th / 2), l1 * (i === 1 ? 0.95 : 0.5), l2 * (i === wp.length - 2 ? 0.95 : 0.5));
    const P1 = [B[0] - d1x * t, B[1] - d1z * t], P2 = [B[0] + d2x * t, B[1] + d2z * t];
    push(P1[0], P1[1]);
    const n = Math.max(2, Math.ceil((t * 2) / 3));
    for (let k = 1; k < n; k++) {
      const u = k / n, a = (1 - u) * (1 - u), bb = 2 * u * (1 - u), c = u * u;
      push(a * P1[0] + bb * B[0] + c * P2[0], a * P1[1] + bb * B[1] + c * P2[1]);
    }
    push(P2[0], P2[1]);
  }
  const L = wp[wp.length - 1];
  push(L[0], L[1]);
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, s, len: s[s.length - 1] };
}

export function sampleAt(path, t) {
  const { pts, s } = path;
  t = THREE.MathUtils.clamp(t, 0, path.len);
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= t) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], seg = s[hi] - s[lo] || 1, u = (t - s[lo]) / seg;
  const tx = (b[0] - a[0]) / seg, tz = (b[1] - a[1]) / seg;
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, tx, tz };
}

// offset a path sideways (left normal = (-tz, tx)... we use n = (tz, -tx)); approximate for parallel tracks
export function offsetPath(path, d) {
  const out = [];
  const { pts } = path;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    out.push([pts[i][0] + tz * d, pts[i][1] - tx * d]);
  }
  return makePath(out, 0.1);
}

export function subPath(path, t0, t1) {
  const out = [];
  const a = sampleAt(path, t0); out.push([a.x, a.z]);
  for (let i = 0; i < path.pts.length; i++) if (path.s[i] > t0 + 0.01 && path.s[i] < t1 - 0.01) out.push(path.pts[i]);
  const b = sampleAt(path, t1); out.push([b.x, b.z]);
  return makePath(out, 0.1);
}

// ---------------------------------------------------------------- track drawing
export function drawTrack(fb, inst, path, opts = {}) {
  const bed = opts.bed || 'ballast';
  const { pts } = path;
  const yRail = bed === 'ballast' ? Q + 0.3 : Q + 0.0;
  const rh = bed === 'ballast' ? 0.13 : 0.07;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 0.01) continue;
    const tx = dx / len, tz = dz / len, nx = tz, nz = -tx;
    const ang = Math.atan2(-tz, tx), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    if (bed === 'ballast') {
      const e = 0.06; // extend to cover joints
      const ax = a[0] - tx * e, az = a[1] - tz * e, bx = b[0] + tx * e, bz = b[1] + tz * e;
      const P = (x, z, off, y) => [x + nx * off, y, z + nz * off];
      const yt = Q + 0.17, yb = Q + 0.005;
      fb.poly('ballast', [P(ax, az, -1.6, yt), P(bx, bz, -1.6, yt), P(bx, bz, 1.6, yt), P(ax, az, 1.6, yt)], [0, 1, 0]);
      fb.poly('ballast', [P(ax, az, 1.6, yt), P(bx, bz, 1.6, yt), P(bx, bz, 2.25, yb), P(ax, az, 2.25, yb)], [nx, 1, nz]);
      fb.poly('ballast', [P(ax, az, -1.6, yt), P(bx, bz, -1.6, yt), P(bx, bz, -2.25, yb), P(ax, az, -2.25, yb)], [-nx, 1, -nz]);
    } else if (bed === 'setts') {
      const P = (x, z, off) => [x + nx * off, Q + 0.035, z + nz * off];
      fb.poly(opts.groundKey || 'roadSetts', [P(a[0], a[1], -1.5), P(b[0], b[1], -1.5), P(b[0], b[1], 1.5), P(a[0], a[1], 1.5)], [0, 1, 0]);
    }
    for (const off of [-0.72, 0.72]) {
      _m.makeRotationY(ang).setPosition(cx + nx * off, yRail + rh / 2, cz + nz * off);
      fb.boxMat('rail', _m, len + 0.04, rh, 0.07, true);
    }
  }
  if (bed === 'ballast' && inst) {
    for (let t = 0.4; t < path.len; t += 0.72) {
      const p = sampleAt(path, t);
      inst.place('sleeper', _m.makeRotationY(Math.atan2(-p.tz, p.tx)).setPosition(p.x, Q + 0.17, p.z));
    }
  }
}
const _m = new THREE.Matrix4();

// ---------------------------------------------------------------- rolling stock prototypes
const WHEEL_DISC = new THREE.CylinderGeometry(0.46, 0.46, 0.13, 8, 1, false); // both faces: far-side wheels read as discs too
function wheelset(b, x, y, W) {
  const r = 0.46;
  for (const sd of [-1, 1]) {
    // wheel: cylinder axis along z; top cap (+y) rotated to face outward
    b.add('black', WHEEL_DISC, M4(x, y + r, sd * 0.76, sd * Math.PI / 2, 0, 0));
    // W-iron (axle guard) hanging from the solebar, with axlebox and leaf spring
    const zo = sd * (W / 2 - 0.12);
    const zf = sd * (W / 2 + 0.005);
    // W-iron plate (trapezoid) facing outward, axlebox, leaf spring
    // axle guard: a short plate under the solebar framing the axlebox
    b.panel('black', x, y + 0.53, zf, 'z', sd, 0.62, 0.3);
    b.box('castIron', x - 0.18, y + 0.32, zo - 0.11 + sd * 0.12, 0.36, 0.34, 0.22, 0, true);
    b.panel('castIron', x, y + 0.72, zf + sd * 0.01, 'z', sd, 1.3, 0.11);
  }
}
function underframe(b, L, W, y0) {
  // solebars (deep channel, outside the wheels) and headstocks
  b.box('black', -L / 2, y0 + 0.66, -W / 2, L, 0.3, 0.14, 0, true);
  b.box('black', -L / 2, y0 + 0.66, W / 2 - 0.14, L, 0.3, 0.14, 0, true);
  b.box('black', -L / 2 - 0.05, y0 + 0.66, -W / 2, 0.14, 0.34, W, 0, true);
  b.box('black', L / 2 - 0.09, y0 + 0.66, -W / 2, 0.14, 0.34, W, 0, true);
  for (const sx of [-1, 1]) for (const z of [-0.87, 0.87]) b.box('castIron', sx > 0 ? L / 2 : -L / 2 - 0.4, y0 + 0.72, z - 0.1, 0.4, 0.2, 0.2, 0, true);
  wheelset(b, -L * 0.3, y0, W);
  wheelset(b, L * 0.3, y0, W);
}
// open-topped body shell: outer walls, inner walls, rim, floor (no hidden faces)
function openBody(b, key, L, W, y0, H) {
  const x0 = -L / 2, x1 = L / 2, z0 = -W / 2, z1 = W / 2, t = 0.1, y1 = y0 + H;
  const q = (pts, n) => b.poly(key, pts, n);
  q([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1]);
  q([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]);
  q([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]);
  q([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0]);
  q([[x0 + t, y0, z0 + t], [x1 - t, y0, z0 + t], [x1 - t, y1, z0 + t], [x0 + t, y1, z0 + t]], [0, 0, 1]);
  q([[x0 + t, y0, z1 - t], [x1 - t, y0, z1 - t], [x1 - t, y1, z1 - t], [x0 + t, y1, z1 - t]], [0, 0, -1]);
  q([[x0 + t, y0, z0 + t], [x0 + t, y0, z1 - t], [x0 + t, y1, z1 - t], [x0 + t, y1, z0 + t]], [1, 0, 0]);
  q([[x1 - t, y0, z0 + t], [x1 - t, y0, z1 - t], [x1 - t, y1, z1 - t], [x1 - t, y1, z0 + t]], [-1, 0, 0]);
  q([[x0, y1, z0], [x1, y1, z0], [x1, y1, z0 + t], [x0, y1, z0 + t]], [0, 1, 0]);
  q([[x0, y1, z1 - t], [x1, y1, z1 - t], [x1, y1, z1], [x0, y1, z1]], [0, 1, 0]);
  q([[x0 + t, y0 + 0.08, z0 + t], [x1 - t, y0 + 0.08, z0 + t], [x1 - t, y0 + 0.08, z1 - t], [x0 + t, y0 + 0.08, z1 - t]], [0, 1, 0]);
}

export function defineRollingStock(inst) {
  // All protos: origin at rail top, centre of wagon, +x along the track.
  const open = (key, load) => (b) => {
    const L = 5.5, W = 2.3;
    underframe(b, L, W, 0);
    const fy = 0.92;
    openBody(b, key, L, W, fy, 1.0);
    for (const x of [-1.8, 1.8]) for (const [z, n] of [[-W / 2 - 0.015, -1], [W / 2 + 0.015, 1]]) b.panel('black', x, fy + 0.5, z, 'z', n, 0.1, 1.0);
    for (const [z, n] of [[-W / 2 - 0.02, -1], [W / 2 + 0.02, 1]]) b.panel('black', 0, fy + 0.5, z, 'z', n, 1.25, 0.9);
    if (load === 'coal') {
      const y = fy + 0.9, r = 0.35, hw = W / 2 - 0.12, hl = L / 2 - 0.12;
      b.poly('coalHeap', [[-hl, y, -hw], [hl, y, -hw], [hl - 0.6, y + r, 0], [-hl + 0.6, y + r, 0]], [0, 1, -1]);
      b.poly('coalHeap', [[-hl, y, hw], [hl, y, hw], [hl - 0.6, y + r, 0], [-hl + 0.6, y + r, 0]], [0, 1, 1]);
      b.poly('coalHeap', [[-hl, y, -hw], [-hl, y, hw], [-hl + 0.6, y + r, 0]], [-1, 1, 0]);
      b.poly('coalHeap', [[hl, y, -hw], [hl, y, hw], [hl - 0.6, y + r, 0]], [1, 1, 0]);
    } else if (load === 'sheet') {
      const half = W / 2 + 0.05, rise = 0.55, sl = Math.hypot(half, rise), a = Math.atan2(rise, half);
      b.cbox('tarp', 0, fy + 1.0 + rise / 2, -half / 2, L + 0.1, 0.05, sl, -a, 0, 0);
      b.cbox('tarp', 0, fy + 1.0 + rise / 2, half / 2, L + 0.1, 0.05, sl, a, 0, 0);
    } else if (load === 'crates') {
      b.box('crate', -2.4, fy + 0.08, -1.0, 2.0, 1.3, 2.0, 0, true);
      b.box('crate', 0.1, fy + 0.08, -0.9, 1.6, 1.1, 1.8, 0, true);
      b.box('sack', 1.8, fy + 0.08, -0.9, 0.7, 0.9, 1.8, 0, true);
    }
  };
  inst.define('open_grey', open('wagonGrey'));
  inst.define('open_red', open('wagonRed'));
  inst.define('coal_grey', open('wagonGrey', 'coal'));
  inst.define('coal_black', open('coalWagon', 'coal'));
  inst.define('coal_empty', open('coalWagon'));
  inst.define('sheeted', open('wagonGrey', 'sheet'));
  inst.define('crates', open('wagonRed', 'crates'));
  inst.define('van', (b) => {
    const L = 5.6, W = 2.35;
    underframe(b, L, W, 0);
    const fy = 0.92, H = 2.1;
    b.box('vanBody', -L / 2, fy, -W / 2, L, H, W, 0, true);
    const roof = new THREE.CylinderGeometry(2.2, 2.2, L + 0.2, 6, 1, true, -0.56, 1.12).rotateZ(Math.PI / 2);
    b.add('vanRoof', roof, M4(0, fy + H - 2.2 * Math.cos(0.56) + 0.02, 0, 0, 0, 0));
    for (const s of [-1, 1]) {
      b.panel('black', 0, fy + H / 2, s * (W / 2 + 0.02), 'z', s, 2.0, H - 0.1);
      for (const x of [-2.2, 2.2]) b.panel('black', x, fy + H / 2, s * (W / 2 + 0.01), 'z', s, 0.1, H);
    }
  });
  inst.define('brake', (b) => {
    const L = 6.2, W = 2.35;
    underframe(b, L, W, 0);
    const fy = 0.92, H = 2.2;
    b.box('vanBody', -L / 2 + 1.2, fy, -W / 2, L - 2.4, H, W);
    b.box('wagonGrey', -L / 2, fy, -W / 2, 1.2, 0.08, W);
    b.box('wagonGrey', L / 2 - 1.2, fy, -W / 2, 1.2, 0.08, W);
    b.box('vanRoof', -L / 2 - 0.05, fy + H, -W / 2 - 0.08, L + 0.1, 0.12, W + 0.16);
    for (const x of [-L / 2 + 0.05, L / 2 - 0.15]) for (const z of [-W / 2, W / 2 - 0.1]) b.box('black', x, fy, z, 0.1, H, 0.1);
    b.cyl('black', 0.8, fy + H + 0.35, 0.5, 0.07, 0.07, 0.6, 5);
    b.box('glass', -L / 2 + 1.18, fy + 1.2, -0.5, 0.04, 0.6, 1.0);
  });
  inst.define('bolster', (b) => {
    const L = 8.5, W = 2.3;
    underframe(b, L, W, 0);
    b.box('wagonGrey', -L / 2, 0.92, -W / 2, L, 0.12, W);
    for (const x of [-2.2, 2.2]) b.box('timberDark', x - 0.2, 1.04, -W / 2, 0.4, 0.3, W);
    for (let i = 0; i < 6; i++) {
      const z = -0.8 + (i % 3) * 0.8, y = 1.34 + Math.floor(i / 3) * 0.55 + 0.27;
      b.add('timber', LOG, M4(0, y, z, 0, 0, Math.PI / 2));
    }
  });
  // LSWR Adams B4 0-4-0 dock tank
  inst.define('b4', (b) => {
    const G = 'lswrGreen';
    b.box('black', -3.6, 0.55, -1.0, 7.2, 0.55, 2.0); // frames
    b.box('lswrLower', -3.9, 0.7, -1.3, 0.25, 0.55, 2.6);
    b.box('lswrLower', 3.65, 0.7, -1.3, 0.25, 0.55, 2.6);
    for (const x of [-1.1, 1.1]) for (const z of [-0.72, 0.72]) b.add('lswrGreen', LOCO_WHEEL, M4(x, 0.62, z, Math.PI / 2, 0, 0));
    b.box('black', -1.8, 0.45, -0.95, 3.6, 0.2, 0.08);
    b.box('black', -1.8, 0.45, 0.87, 3.6, 0.2, 0.08);
    b.box(G, -3.55, 1.1, -1.25, 7.1, 0.12, 2.5); // running plate
    b.add(G, BOILER, M4(0.7, 2.05, 0, 0, 0, Math.PI / 2));
    b.add('black', SMOKEBOX, M4(3.15, 2.05, 0, 0, 0, Math.PI / 2));
    b.cyl('black', 3.1, 3.2, 0, 0.22, 0.26, 0.9, 10);
    b.cyl('black', 3.1, 3.7, 0, 0.3, 0.26, 0.14, 10);
    b.cyl(G, 1.2, 2.95, 0, 0.3, 0.38, 0.55, 10);
    b.cyl('brass', 1.2, 3.25, 0, 0.18, 0.28, 0.15, 10);
    b.cyl('brass', -0.6, 2.85, 0, 0.1, 0.1, 0.45, 6);
    for (const z of [-1, 1]) b.box(G, -0.4, 1.2, z > 0 ? 0.75 : -1.25, 2.6, 1.35, 0.5); // side tanks
    b.box(G, -3.0, 1.2, -1.2, 1.8, 1.75, 2.4); // cab lower
    for (const z of [-1.2, 1.1]) b.box(G, -3.0, 2.95, z, 0.15, 1.05, 0.1), b.box(G, -1.35, 2.95, z, 0.15, 1.05, 0.1);
    b.box(G, -1.35, 2.95, -1.2, 0.15, 1.05, 2.4);
    b.box('glass', -1.2, 3.25, -0.95, 0.02, 0.5, 0.5);
    b.box('glass', -1.2, 3.25, 0.45, 0.02, 0.5, 0.5);
    b.cbox('black', -2.2, 4.08, 0, 2.2, 0.1, 2.6, 0, 0, 0);
    b.box('black', -3.55, 1.2, -1.2, 0.55, 1.2, 2.4); // bunker
    b.box('coal', -3.5, 2.4, -1.1, 0.45, 0.25, 2.2);
    for (const sx of [-1, 1]) for (const z of [-0.87, 0.87]) b.box('castIron', sx > 0 ? 3.9 : -4.3, 0.85, z - 0.1, 0.4, 0.2, 0.2);
  });
}
const LOG = new THREE.CylinderGeometry(0.28, 0.32, 8.0, 7);
const LOCO_WHEEL = new THREE.CylinderGeometry(0.6, 0.6, 0.14, 12);
const BOILER = new THREE.CylinderGeometry(0.68, 0.68, 4.0, 14, 1, false);
const SMOKEBOX = new THREE.CylinderGeometry(0.72, 0.72, 1.0, 14, 1, false);

// Sleeper prototype: top + two long sides.
export function defineSleeper(inst) {
  inst.define('sleeper', (b) => {
    const w = 0.25, L = 2.6, h = 0.13;
    b.poly('sleeper', [[-w / 2, h, -L / 2], [w / 2, h, -L / 2], [w / 2, h, L / 2], [-w / 2, h, L / 2]], [0, 1, 0]);
  });
}

export const STOCK_LEN = { open_grey: 5.5, open_red: 5.5, coal_grey: 5.5, coal_black: 5.5, coal_empty: 5.5, sheeted: 5.5, crates: 5.5, van: 5.6, brake: 6.2, bolster: 8.5, b4: 8.4 };

// Place a rake of vehicles along a path starting at s0 (moving toward +s).
export function rake(inst, path, s0, types, yTop, gap = 0.9) {
  let s = s0;
  for (const t of types) {
    if (!t) { s += 6; continue; }
    const L = STOCK_LEN[t] + 0.9;
    const c = s + L / 2;
    if (c + L / 2 > path.len) break;
    const p = sampleAt(path, c);
    inst.place(t, _m.makeRotationY(Math.atan2(-p.tz, p.tx)).setPosition(p.x, yTop, p.z));
    s += L + (gap - 0.9);
  }
  return s;
}

// Turntable (pit + girder deck), buffer stop, signal post
export function turntable(b, x, z, ang, D = 15) {
  const prof = [[D / 2 + 0.5, 0.05], [D / 2 + 0.5, 0], [D / 2, 0], [D / 2 - 0.05, -0.9], [0, -0.9]].map(([r, y]) => new THREE.Vector2(r, y));
  b.add('stone', new THREE.LatheGeometry(prof.reverse(), 28), M4(x, Q + 0.06, z));
  b.add('castIron', new THREE.TorusGeometry(D / 2 - 0.4, 0.08, 4, 28).rotateX(Math.PI / 2), M4(x, Q - 0.78, z));
  b.pushFrame(x, z, ang);
  b.box('black', -D / 2 + 0.2, Q - 0.6, -1.4, D - 0.4, 0.9, 0.35);
  b.box('black', -D / 2 + 0.2, Q - 0.6, 1.05, D - 0.4, 0.9, 0.35);
  b.box('timberDark', -D / 2 + 0.2, Q + 0.2, -1.8, D - 0.4, 0.1, 3.6);
  for (const off of [-0.72, 0.72]) b.box('rail', -D / 2 + 0.2, Q + 0.3, off - 0.035, D - 0.4, 0.12, 0.07);
  b.box('castIron', D / 2 - 1.2, Q + 0.3, -2.4, 0.1, 1.0, 4.8);
  b.box('castIron', -D / 2 + 1.1, Q + 0.3, -2.4, 0.1, 1.0, 4.8);
  b.pop();
}

export function bufferStop(b, p, yTop) {
  const ang = Math.atan2(-p.tz, p.tx);
  b.pushFrame(p.x, p.z, ang);
  b.gbox('timberDark', -0.3, Q, -1.5, 0.6, yTop - Q + 0.6, 3.0);
  b.box('timber', -0.45, yTop + 0.3, -1.3, 0.15, 0.35, 2.6);
  b.strut('timberDark', [-2.2, Q, -1.0], [-0.3, yTop + 0.5, -1.0], 0.22);
  b.strut('timberDark', [-2.2, Q, 1.0], [-0.3, yTop + 0.5, 1.0], 0.22);
  b.pop();
}

export function signalPost(b, x, z, ang, arms = 1) {
  b.pushFrame(x, z, ang);
  b.gbox('stone', -0.5, Q, -0.5, 1.0, 0.4, 1.0);
  b.box('white', -0.12, Q + 0.4, -0.12, 0.24, 8.5, 0.24);
  b.cyl('black', 0, Q + 9.05, 0, 0.02, 0.14, 0.3, 6);
  for (let i = 0; i < arms; i++) {
    const y = Q + 7.8 - i * 1.5;
    b.box('signalRed', 0.12, y - 0.13, -0.02, 1.4, 0.26, 0.04);
    b.box('white', 1.2, y - 0.1, -0.03, 0.25, 0.2, 0.06);
    b.box('castIron', -0.28, y - 0.28, -0.1, 0.18, 0.35, 0.2);
  }
  for (let y = Q + 0.6; y < Q + 7; y += 0.45) b.box('castIron', 0.12, y, 0.15, 0.4, 0.03, 0.03);
  b.pop();
}
