import * as THREE from 'three';
import { Mesher, col, shade, tpl } from './kit.js';

// Deck furniture for steamships. Every function writes into a Mesher (K) using the
// material keys: 'paint' (triplanar painted steel, vertex coloured), 'deck' (planks),
// 'dark' (matte soot / rope / rubber), 'glass'. Coordinates in the ship's local frame.

export const PAL = {
  white: 0xcfcabf, roof: 0x7a776f, roofDark: 0x6b6861, buff: 0xb07a3e, black: 0x161616, steel: 0x3a3935,
  tarp: 0x4a4b40, coaming: 0x3f3a33, canvas: 0xb9b4a6, teak: 0x80654a, deck: 0x78716a, deckDark: 0x5e5244,
  mast: 0xa98050, soot: 0x0b0a09, rope: 0x2a241d, red: 0x8a2a1a, wood: 0x6e5238, waterway: 0x3b3833,
};
const C = (k) => col(PAL[k] ?? k);

function geoFromBucket(K, key) {
  const o = K.b.get(key);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(o.c, 3));
  return g;
}

const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), p4 = new THREE.Vector3(), s4 = new THREE.Vector3();
const M = (x, y, z, ry = 0, s = 1, sy = s, sz = s) => m4.compose(p4.set(x, y, z), q4.setFromEuler(e4.set(0, ry, 0)), s4.set(s, sy, sz));

// ---------------------------------------------------------------- lifeboat (origin: gunwale midpoint)
export function lifeboatTpl(l, w, h, covered = true) {
  return tpl(`boat${l}|${w}|${h}|${covered}`, () => {
    const K = new Mesher();
    // Double-ended, rounded clinker-built wooden hull; dimensions refer to gunwale.
    // British Inquiry, Life-saving Appliances: pine strakes, wooden chocks, canvas covers.
    const N = 40, R = 20, white = col(0xe2dfd6);
    const hw = (u) => w / 2 * Math.pow(Math.max(0, 1 - Math.abs(u) ** 2.6), 0.55);
    const skin = (u, t) => [u * l / 2, 0.13 * h * u * u - h * (1 - 0.35 * u ** 4) * Math.cos(t), hw(u) * Math.sin(t)];
    const normal = (u, t) => {
      const du = new THREE.Vector3().fromArray(skin(Math.min(1, u + 0.001), t)).sub(new THREE.Vector3().fromArray(skin(Math.max(-1, u - 0.001), t)));
      const dt = new THREE.Vector3().fromArray(skin(u, t + 0.001)).sub(new THREE.Vector3().fromArray(skin(u, t - 0.001)));
      return du.cross(dt).normalize().toArray();
    };
    for (let i = 0; i < N; i++) for (let j = 0; j < R; j++) {
      const u0 = -1 + 2 * i / N, u1 = -1 + 2 * (i + 1) / N;
      const t0 = -Math.PI / 2 + Math.PI * j / R, t1 = t0 + Math.PI / R;
      K.quadN('paint', skin(u0, t0), skin(u1, t0), skin(u1, t1), skin(u0, t1), white,
        normal(u0, t0), normal(u1, t0), normal(u1, t1), normal(u0, t1));
    }
    // Raised plank laps, rolled gunwales and the external grab line.
    for (const side of [-1, 1]) for (let j = 0; j <= 7; j++) {
      const t = side * (0.18 + 1.39 * j / 7);
      for (let i = 1; i < N - 1; i++) {
        const a = skin(-1 + 2 * i / N, t), b = skin(-1 + 2 * (i + 1) / N, t);
        K.rod('paint', a, b, j === 7 ? 0.035 : 0.012, j === 7 ? C('wood') : shade(0xe2dfd6, 0.92), 5, false);
      }
    }
    const canvas = (u, v) => [u * l / 2, 0.13 * h * u * u + (1 - u * u) * (0.25 * (1 - v * v) + 0.025 * Math.sin(u * 21)), hw(u) * v];
    if (covered) {
      for (let i = 0; i < N; i++) for (let j = 0; j < 8; j++) {
        const u0 = -1 + 2 * i / N, u1 = u0 + 2 / N, v0 = -1 + j / 4, v1 = v0 + 0.25;
        K.quad('paint', canvas(u0, v0), canvas(u1, v0), canvas(u1, v1), canvas(u0, v1), C('canvas'), [0, 1, 0]);
      }
      for (const u of [-0.72, -0.36, 0, 0.36, 0.72]) for (let j = 0; j < 8; j++) {
        const a = canvas(u, -1 + j / 4), b = canvas(u, -1 + (j + 1) / 4);
        a[1] += 0.018; b[1] += 0.018;
        K.rod('paint', a, b, 0.013, C('rope'), 4, false);
      }
    } else {
      for (let x = -l * 0.32; x <= l * 0.33; x += 0.8) K.box('paint', x, -h * 0.2, 0, 0.25, 0.07, hw(2 * x / l) * 1.85, C('wood'));
    }
    for (const side of [-1, 1]) for (let i = 2; i < 14; i++) {
      const u0 = -1 + i / 8, u1 = -1 + (i + 1) / 8;
      const a = [u0 * l / 2, -0.13, side * (hw(u0) + 0.06)], b = [u1 * l / 2, -0.13, side * (hw(u1) + 0.06)];
      const m = [(a[0] + b[0]) / 2, -0.3, (a[2] + b[2]) / 2];
      K.rod('paint', a, m, 0.018, C('rope'), 4, false); K.rod('paint', m, b, 0.018, C('rope'), 4, false);
    }
    return geoFromBucket(K, 'paint');
  });
}

// ---------------------------------------------------------------- cowl ventilator
// Unit cowl (pipe radius 1) at the pipe top: a swept elbow, flared bell with a thick rolled
// lip, and a deep interior that darkens into the throat. Mouth faces -X before rotation.
const COWL_SEG = 18;
let COWL = null;
function cowlParts() {
  return COWL ??= (() => {
    const K = new Mesher();
    const R = 1.15, seg = COWL_SEG;
    const ringAt = (cx, cy, nx, ny, rad) => {
      const pts = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        pts.push([cx + rad * ca * nx, cy + rad * ca * ny, rad * sa]);
      }
      return pts;
    };
    const skin = (key, r0, r1, c0, c1, inward, axis0, axis1) => {
      for (let i = 0; i < seg; i++) {
        const a = r0[i], b = r0[i + 1], c = r1[i + 1], d = r1[i];
        const m = [(a[0] + b[0] + c[0] + d[0]) / 4, (a[1] + b[1] + c[1] + d[1]) / 4, (a[2] + b[2] + c[2] + d[2]) / 4];
        const ax = [(axis0[0] + axis1[0]) / 2, (axis0[1] + axis1[1]) / 2, 0];
        const w = [m[0] - ax[0], m[1] - ax[1], m[2]];
        if (inward) { w[0] = -w[0]; w[1] = -w[1]; w[2] = -w[2]; }
        K.tri(key, a, b, c, c0, w); K.tri(key, a, c, d, c1, w);
      }
    };
    const W = [1, 1, 1];
    // elbow
    const N = 7;
    let prev = null, prevC = null;
    for (let k = 0; k <= N; k++) {
      const t = (k / N) * Math.PI / 2, cx = -R + R * Math.cos(t), cy = R * Math.sin(t);
      const ring = ringAt(cx, cy, Math.cos(t), Math.sin(t), 1 + 0.05 * (k / N));
      if (prev) skin('paint', prev, ring, W, W, false, prevC, [cx, cy]);
      prev = ring; prevC = [cx, cy];
    }
    // bell (outer), lip annulus, bell interior, throat
    const bellOut = [[0, 1.05], [0.35, 1.18], [0.7, 1.38], [1.0, 1.62]];
    for (let k = 0; k < bellOut.length - 1; k++) {
      const [s0, r0] = bellOut[k], [s1, r1] = bellOut[k + 1];
      skin('paint', ringAt(-R - s0, R, 0, 1, r0), ringAt(-R - s1, R, 0, 1, r1), W, W, false, [-R - s0, R], [-R - s1, R]);
    }
    const lipO = ringAt(-R - 1.0, R, 0, 1, 1.62), lipI = ringAt(-R - 1.02, R, 0, 1, 1.44);
    for (let i = 0; i < seg; i++) K.quad('paint', lipO[i], lipO[i + 1], lipI[i + 1], lipI[i], W, [-1, 0, 0]);
    const cLip = col(0x3a2a22), cMid = col(0x1a1411), cDeep = col(0x060505);
    const inner = [[1.02, 1.44, cLip], [0.65, 1.22, cMid], [0.25, 0.98, cDeep], [-0.4, 0.92, cDeep]];
    for (let k = 0; k < inner.length - 1; k++) {
      const [s0, r0, c0] = inner[k], [s1, r1, c1] = inner[k + 1];
      skin('dark', ringAt(-R - s0, R, 0, 1, r0), ringAt(-R - s1, R, 0, 1, r1), c0, c1, true, [-R - s0, R], [-R - s1, R]);
    }
    const back = ringAt(-R + 0.4, R, 0, 1, 0.92), cc = [-R + 0.4, R, 0];
    for (let i = 0; i < seg; i++) K.tri('dark', cc, back[i], back[i + 1], cDeep, [-1, 0, 0]);
    return { paint: geoFromBucket(K, 'paint'), dark: geoFromBucket(K, 'dark') };
  })();
}

// dir: angle in the xz plane the mouth faces (0 = +X / forward)
export function cowlVent(K, x, y, z, r, h, dir, color = PAL.buff) {
  const c = col(color);
  const pipe = Math.max(0.2, h - 1.15 * r);
  K.cyl('paint', x, y, z, r, pipe, c, 16, true);
  K.cyl('paint', x, y, z, r * 1.25, 0.25, c, 16, false); // coaming ring
  const parts = cowlParts();
  const ry = Math.PI - dir;
  K.geo('paint', parts.paint, M(x, y + pipe, z, ry, r), c);
  const o = K.b.get('paint');
  const n = parts.paint.attributes.position.count;
  for (let i = o.c.length - n * 3; i < o.c.length; i += 3) { o.c[i] = c[0]; o.c[i + 1] = c[1]; o.c[i + 2] = c[2]; }
  K.geo('dark', parts.dark, M(x, y + pipe, z, ry, r), null);
}

export function mushroomVent(K, x, y, z, r, h, color = PAL.white) {
  K.cyl('paint', x, y, z, r * 1.2, 0.12, col(color), 18);
  K.cyl('paint', x, y, z, r, h, col(color), 18);
  K.cyl('dark', x, y + h, z, r * 1.5, 0.15, C('soot'), 20, true);
  K.cyl('paint', x, y + h + 0.15, z, r * 1.9, 0.2, col(color), 24);
  K.cyl('paint', x, y + h + 0.35, z, r * 1.5, 0.08, col(color), 24);
}

// ---------------------------------------------------------------- funnel
// elliptical, raked aft; returns top centre
export function funnel(K, { x, y, rx, rz, h, rake = 2, color = PAL.buff, top = PAL.black, topH, band = null, bandAt = 0.62, pipes = 2, guys = true, guyZ = 10, guyX = 8, smooth = false }) {
  const rk = Math.tan((rake * Math.PI) / 180);
  const seg = smooth ? 64 : 28;
  topH = topH ?? h * 0.15;
  const ring = (yy, sc = 1) => {
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push([x - yy * rk + Math.cos(a) * rx * sc, y + yy, Math.sin(a) * rz * sc]);
    }
    return pts;
  };
  const bandQuads = (y0, y1, c, key = 'funnel', sc = 1, inward = false) => {
    const r0 = ring(y0, sc), r1 = ring(y1, sc);
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2, am = a + Math.PI / seg;
      const want = [Math.cos(am) * (inward ? -1 : 1), 0, Math.sin(am) * (inward ? -1 : 1)];
      if (smooth) {
        const ellipseN = (t) => {
          const nx = Math.cos(t) / rx, nz = Math.sin(t) / rz, inv = inward ? -1 : 1;
          const len = Math.hypot(nx, nz, nx * rk);
          return [nx / len * inv, nx * rk / len * inv, nz / len * inv];
        };
        K.quadN(key, r0[i], r0[i + 1], r1[i + 1], r1[i], c, ellipseN(a), ellipseN(a + 2 * Math.PI / seg));
      } else K.quad(key, r0[i], r0[i + 1], r1[i + 1], r1[i], c, want);
    }
  };
  const cBody = col(color), cTop = col(top);
  if (band) {
    const b0 = h * bandAt, b1 = b0 + h * 0.09;
    bandQuads(0, b0, cBody); bandQuads(b0, b1, col(band)); bandQuads(b1, h - topH, cBody);
  } else bandQuads(0, h - topH, cBody);
  bandQuads(h - topH, h, cTop);
  for (const t of [0.33, 0.66]) { const yy = (h - topH) * t; bandQuads(yy, yy + 0.12, shade(color, 0.86), 'funnel', 1.008); }
  // lip and sooty interior
  const rt = ring(h), ri = ring(h, 0.9);
  for (let i = 0; i < seg; i++) K.quad('dark', rt[i], rt[i + 1], ri[i + 1], ri[i], shade(PAL.black, 1.2), [0, 1, 0]);
  bandQuads(h - 2.5, h, C('soot'), 'dark', 0.9, true);
  const cap = ring(h - 2.5, 0.9), cc = [x - (h - 2.5) * rk, y + h - 2.5, 0];
  for (let i = 0; i < seg; i++) K.tri('dark', cc, cap[i], cap[i + 1], C('soot'), [0, 1, 0]);
  // waste steam pipes on the aft face, whistle on the forward face
  for (let k = 0; k < pipes; k++) {
    const zz = (k - (pipes - 1) / 2) * rz * 0.6;
    K.rod('funnel', [x - rx - 0.35, y, zz], [x - rx - 0.35 - (h + 1.2) * rk, y + h + 1.2, zz], 0.22, cBody, 12, false);
  }
  K.rod('funnel', [x + rx + 0.3, y + h * 0.4, 0], [x + rx + 0.3 - h * 0.35 * rk, y + h * 0.75, 0], 0.12, cBody, 8, false);
  // guy wires: two bands to the deck edges
  if (guys) for (const hf of [0.55, 0.88]) {
    const ax = x - h * hf * rk, ay = y + h * hf;
    for (const sz of [1, -1]) for (const dx of [-1, 0.2]) K.rod('dark', [ax, ay, sz * rz * 0.9], [ax + dx * guyX, y + 0.2, sz * guyZ], 0.03, C('rope'), 3);
  }
  // funnel base ring
  bandQuads(0, 0.5, shade(color, 0.7), 'funnel', 1.06);
  return new THREE.Vector3(x - h * rk, y + h, 0);
}

// ---------------------------------------------------------------- deck machinery
export function capstan(K, x, y, z, r = 0.55) {
  const b = C('black');
  K.cyl('paint', x, y, z, r * 1.5, 0.25, b, 24);
  K.cyl('paint', x, y + 0.25, z, r * 1.2, 0.06, b, 24);
  K.cyl('paint', x, y + 0.3, z, r * 0.85, 0.5, b, 20);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; K.box('paint', x + Math.cos(a) * r * 0.87, y + 0.55, z + Math.sin(a) * r * 0.87, 0.08, 0.46, 0.14, b, -a); } // whelps
  K.cyl('paint', x, y + 0.8, z, r * 1.25, 0.28, b, 24);
  K.cyl('paint', x, y + 1.08, z, r * 0.7, 0.1, shade(PAL.steel, 1.3), 20);
}

export function bitts(K, x, y, z, along = true) {
  const b = C('black');
  const dx = along ? 0.45 : 0, dz = along ? 0 : 0.45;
  K.box('paint', x, y + 0.05, z, along ? 1.5 : 0.6, 0.1, along ? 0.6 : 1.5, b);
  for (const k of [-1, 1]) {
    K.cyl('paint', x + k * dx, y, z + k * dz, 0.2, 0.75, b, 18);
    K.cyl('paint', x + k * dx, y + 0.72, z + k * dz, 0.25, 0.08, b, 18);
  }
  K.box('paint', x, y + 0.5, z, along ? 0.9 : 0.12, 0.12, along ? 0.12 : 0.9, b);
}

export function winch(K, x, y, z, ry = 0) {
  const s = C('steel'), b = C('black');
  const c = Math.cos(ry), sn = Math.sin(ry);
  const P = (lx, lz) => [x + lx * c + lz * sn, z - lx * sn + lz * c];
  K.box('paint', x, y + 0.15, z, 2.0, 0.3, 1.4, s, ry);
  for (const lz of [-0.6, 0.6]) { const [px, pz] = P(0, lz); K.box('paint', px, y + 0.7, pz, 1.4, 0.9, 0.12, b, ry); }
  const [a0, a1] = P(0.1, -0.85), [b0, b1] = P(0.1, 0.85);
  K.rod('paint', [a0, y + 0.85, a1], [b0, y + 0.85, b1], 0.36, s, 8, false);
  const [c0, c1] = P(-0.75, 0);
  K.box('paint', c0, y + 0.55, c1, 0.5, 0.8, 0.9, b, ry); // cylinders
}

// cargo hatch: coaming, tarpaulin sagging between the hatch beams and crowned across, a skirt
// drawn down over the coaming, black locking battens with wedge cleats, hatch-bars on top
export function hatch(K, x, y, z, l, w, { coaming = PAL.coaming, tarp = PAL.tarp, h = 0.75, ry = 0 } = {}) {
  const c = Math.cos(ry), sn = Math.sin(ry);
  const P = (lx, yy, lz) => [x + lx * c + lz * sn, y + yy, z - lx * sn + lz * c];
  K.box('paint', x, y + h / 2, z, l, h, w, col(coaming), ry);
  const td = shade(tarp, 0.72), bat = col(0x0b0b0b);
  const beams = Math.max(3, Math.round(l / 1.25)), nx = beams * 4, nz = 8;
  const L2 = l / 2 + 0.06, W2 = w / 2 + 0.06;
  const sagAt = (u, v) => {
    const bu = (u * beams) % 1;
    const across = 1 - (2 * v - 1) ** 2;
    return { sag: 0.11 * Math.sin(Math.PI * bu) ** 2 * (0.35 + 0.65 * across), crown: 0.12 * across };
  };
  const top = (i, j) => {
    const u = i / nx, v = j / nz, { sag, crown } = sagAt(u, v);
    return P(-L2 + 2 * L2 * u, h + 0.05 + crown - sag, -W2 + 2 * W2 * v);
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const { sag } = sagAt((i + 0.5) / nx, (j + 0.5) / nz);
    const f = 1.08 - 3.2 * sag - 0.05 * (((i * 7 + j * 3) % 5) / 4);
    K.quad('paint', top(i, j), top(i + 1, j), top(i + 1, j + 1), top(i, j + 1), shade(tarp, f), [0, 1, 0]);
  }
  const skirt = (a, b2, want) => K.quad('paint', a, b2, [b2[0], y + h - 0.34, b2[2]], [a[0], y + h - 0.34, a[2]], td, want);
  for (let i = 0; i < nx; i++) { skirt(top(i, 0), top(i + 1, 0), [-sn, 0, -c]); skirt(top(i, nz), top(i + 1, nz), [sn, 0, c]); }
  for (let j = 0; j < nz; j++) { skirt(top(0, j), top(0, j + 1), [-c, 0, sn]); skirt(top(nx, j), top(nx, j + 1), [c, 0, -sn]); }
  const by = h - 0.2;
  for (const s of [-1, 1]) {
    K.box('paint', ...P(0, by, s * (W2 + 0.05)), l + 0.24, 0.13, 0.07, bat, ry);
    K.box('paint', ...P(s * (L2 + 0.05), by, 0), 0.07, 0.13, w + 0.24, bat, ry);
    for (let t = -l / 2 + 0.45; t <= l / 2 - 0.3; t += 0.75) K.box('paint', ...P(t, by - 0.14, s * (W2 + 0.09)), 0.2, 0.16, 0.12, bat, ry);
    for (let t = -w / 2 + 0.45; t <= w / 2 - 0.3; t += 0.75) K.box('paint', ...P(s * (L2 + 0.09), by - 0.14, t), 0.12, 0.16, 0.2, bat, ry);
  }
  for (const fu of [0.25, 0.75]) {
    const i = Math.round(fu * nx);
    for (let j = 0; j < nz; j++) {
      const a = top(i, j), b2 = top(i, j + 1);
      K.strut('paint', [a[0], a[1] + 0.05, a[2]], [b2[0], b2[1] + 0.05, b2[2]], 0.1, bat, 0.07);
    }
  }
}

// Olympic-class stowed stockless anchor: shank drawn up into the hawse pipe, so only the crown and
// the two flukes show, lying tight against the shell in the hull's black, with a dark oval hawse
// opening directly above the crown and a shallow contact shadow following the anchor outline.
// (x, y) = crown centre on the shell, side s = ±1. Flukes span ~2.2 × size metres.
export function hullAnchor(K, hull, x, y, s, { size = 1 } = {}) {
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const k = size;
  const yc = y + 0.6 * k;
  const hb = hull.hbAt(x, yc);
  const dX = hull.hbAt(x + 0.5, yc) - hull.hbAt(x - 0.5, yc);
  const dY = hull.hbAt(x, yc + 0.5) - hull.hbAt(x, yc - 0.5);
  const tX = norm([1, 0, s * dX]), tY = norm([0, 1, s * dY]);
  let n = norm(cross(tX, tY)); if (n[2] * s < 0) n = [-n[0], -n[1], -n[2]];
  const O = [x, yc, s * hb];
  const W = (u, v, w) => [O[0] + tX[0] * u + tY[0] * v + n[0] * w, O[1] + tX[1] * u + tY[1] * v + n[1] * w, O[2] + tX[2] * u + tY[2] * v + n[2] * w];
  // oriented box in the shell frame (optionally tapered toward +v)
  const obox = (key, cu, cv, cw, hu, hv, hw, ang, color, taper = 1) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const C8 = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const d of [-1, 1]) {
      const lu = a * hu * (b > 0 ? taper : 1), lv = b * hv;
      C8.push(W(cu + lu * ca - lv * sa, cv + lu * sa + lv * ca, cw + d * hw));
    }
    const cen = W(cu, cv, cw);
    for (const f of [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]) {
      const q = f.map((i) => C8[i]);
      K.quad(key, q[0], q[1], q[2], q[3], color, [(q[0][0] + q[2][0]) / 2 - cen[0], (q[0][1] + q[2][1]) / 2 - cen[1], (q[0][2] + q[2][2]) / 2 - cen[2]]);
    }
  };
  const iron = col(0x2f2d2b), shadow = col(0x0d0c0b), dark = col(0x030303);
  // anchor parts: [cu, cv, hu, hv, angle, taper, thickness]
  const parts = [[0, 0, 0.5 * k, 0.17 * k, 0, 1, 0.16 * k], [0, 0.33 * k, 0.12 * k, 0.2 * k, 0, 1, 0.13 * k]]; // crown, short shank into the pipe
  for (const sg of [-1, 1]) {
    parts.push([sg * 0.62 * k, 0.42 * k, 0.17 * k, 0.5 * k, -sg * 0.5, 0.7, 0.13 * k]); // arm
    parts.push([sg * 0.86 * k, 0.72 * k, 0.26 * k, 0.3 * k, -sg * 0.5, 0.45, 0.09 * k]); // fluke palm to the bill
  }
  // shallow contact shadow: the same outline, slightly enlarged and dropped, lying on the plating
  for (const [cu, cv, hu, hv, ang, taper] of parts) obox('dark', cu + 0.02 * k, cv - 0.09 * k, 0.03, hu + 0.07 * k, hv + 0.07 * k, 0.01, ang, shadow, taper);
  for (const [cu, cv, hu, hv, ang, taper, th] of parts) obox('hull', cu, cv, 0.05 + th, hu, hv, th, ang, iron, taper);
  // hawse opening: the only round element — a dark oval laid just proud of the curved shell (so the
  // plating cannot cover it), with a darker core suggesting the throat of the pipe
  const seg = 24, hv = 0.8 * k, ru = 0.34 * k, rv = 0.27 * k;
  const oval = (sc, w, dv = 0) => { const p = []; for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; p.push(W(Math.cos(a) * ru * sc, hv + dv + Math.sin(a) * rv * sc, w)); } return p; };
  const o1 = oval(1, 0.05), o2 = oval(0.7, 0.055, 0.03 * k), c2 = W(0, hv + 0.05 * k, 0.056);
  for (let i = 0; i < seg; i++) {
    K.quad('void', o1[i], o1[i + 1], o2[i + 1], o2[i], col(0x0a0a09), n);
    K.tri('void', c2, o2[i], o2[i + 1], col(0x030303), n);
  }
}

// Stothert & Pitt style electric deck crane
export function crane(K, x, y, z, dir, { color = PAL.buff, jib = 10, lift = 0.5 } = {}) {
  const c = col(color), b = C('black');
  const cx = Math.cos(dir), cz = Math.sin(dir);
  K.cyl('paint', x, y, z, 0.7, 1.9, b, 10);
  K.box('paint', x - cx * 0.3, y + 2.85, z - cz * 0.3, 2.3, 1.9, 1.8, c, -dir);
  K.box('paint', x - cx * 0.3, y + 3.85, z - cz * 0.3, 2.5, 0.12, 2.0, shade(color, 0.8), -dir);
  const a = [x + cx * 1.0, y + 2.4, z + cz * 1.0];
  const e = [a[0] + cx * jib * Math.cos(lift), a[1] + jib * Math.sin(lift), a[2] + cz * jib * Math.cos(lift)];
  K.strut('paint', a, e, 0.32, c, 0.45);
  K.rod('dark', [x - cx * 0.8, y + 4.2, z - cz * 0.8], e, 0.03, C('rope'), 3);
  K.rod('dark', e, [e[0], a[1] - 0.6, e[2]], 0.03, C('rope'), 3);
}

// raised skylight: tall painted coaming, grimy light-grey glazing on a pitched top with
// light glazing bars, ridge cap and end frames
export function skylight(K, x0, x1, zc, y, w, { h = 0.7, ridge = 0.6, frame = PAL.white, coaming = PAL.teak } = {}) {
  const f = col(frame), g = col(0x8a8c86);
  h = Math.max(h, 0.55);
  K.box('paint', (x0 + x1) / 2, y + h / 2, zc, x1 - x0, h, w, col(coaming));
  K.box('paint', (x0 + x1) / 2, y + h - 0.04, zc, x1 - x0 + 0.12, 0.08, w + 0.12, f); // capping
  const yt = y + h, yr = yt + ridge;
  const A = [x0, yt, zc - w / 2], B = [x1, yt, zc - w / 2], Cc = [x1, yr, zc], D = [x0, yr, zc];
  const E = [x0, yt, zc + w / 2], F = [x1, yt, zc + w / 2];
  K.quad('glass', A, B, Cc, D, g, [0, 1, -1]);
  K.quad('glass', E, F, Cc, D, g, [0, 1, 1]);
  K.tri('paint', A, D, E, f, [-1, 0, 0]); K.tri('paint', B, Cc, F, f, [1, 0, 0]);
  const n = Math.max(2, Math.round((x1 - x0) / 0.55));
  for (let i = 0; i <= n; i++) {
    const xx = x0 + ((x1 - x0) * i) / n;
    K.strut('paint', [xx, yt + 0.025, zc - w / 2], [xx, yr + 0.025, zc], 0.06, f, 0.05);
    K.strut('paint', [xx, yt + 0.025, zc + w / 2], [xx, yr + 0.025, zc], 0.06, f, 0.05);
  }
  K.strut('paint', [x0 - 0.05, yr + 0.04, zc], [x1 + 0.05, yr + 0.04, zc], 0.14, f, 0.1);
  for (const s of [-1, 1]) K.strut('paint', [x0, yt + 0.03, zc + s * w / 2], [x1, yt + 0.03, zc + s * w / 2], 0.1, f, 0.08);
}

export function dome(K, x, y, z, r, frame = PAL.white) {
  const f = col(frame), bar = col(0x8a877f);
  K.cyl('paint', x, y, z, r * 1.12, 0.9, f, 24);
  const sph = tpl('domeSph', () => new THREE.SphereGeometry(1, 24, 6, 0, Math.PI * 2, 0, Math.PI / 2));
  K.geo('domeGlass', sph, M(x, y + 0.9, z, 0, r, r * 0.42, r), col(0x5a5d59));
  // matte glazing bars (16 meridians + two rings) so the dome never flashes a star
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    let prev = null;
    for (let k = 0; k <= 4; k++) {
      const t = 0.12 + (k / 4) * (Math.PI / 2 - 0.35);
      const p = [x + Math.cos(a) * Math.cos(t) * r * 1.01, y + 0.9 + Math.sin(t) * r * 0.43, z + Math.sin(a) * Math.cos(t) * r * 1.01];
      if (prev) K.strut('paint', prev, p, 0.05, bar, 0.03);
      prev = p;
    }
  }
  for (const t of [0.45, 0.95]) {
    const rr = Math.cos(t) * r * 1.01, yy = y + 0.9 + Math.sin(t) * r * 0.43;
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
      K.strut('paint', [x + Math.cos(a0) * rr, yy, z + Math.sin(a0) * rr], [x + Math.cos(a1) * rr, yy, z + Math.sin(a1) * rr], 0.05, bar, 0.03);
    }
  }
  K.cyl('paint', x, y + 0.9 + r * 0.4, z, r * 0.22, 0.25, col(PAL.roofDark), 16);
}

// Welin / radial davit pair for a boat at (x, zEdge) on side s
export function davits(K, x, y, zEdge, s, l, { color = PAL.white, welin = true } = {}) {
  const c = col(color);
  for (const dx of [-l * 0.42, l * 0.42]) {
    const xx = x + dx;
    if (welin) K.box('paint', xx, y + 0.45, zEdge - s * 0.2, 0.5, 0.9, 1.5, shade(color, 0.85));
    const a = [xx, y + 0.8, zEdge], b = [xx, y + 3.9, zEdge - s * 0.35], e = [xx, y + 4.3, zEdge - s * 1.9];
    K.strut('paint', a, b, 0.22, c);
    K.strut('paint', b, e, 0.18, c);
    K.rod('dark', e, [xx, y + 1.4, zEdge - s * 1.9], 0.03, C('rope'), 3);
  }
}

export function collapsible(K, x, y, z, l = 8.3566, w = 2.4384, ry = 0) {
  // Engelhardt: shallow rigid wooden bottom with canvas sides folded down.
  K.geo('paint', lifeboatTpl(l, w, 0.28, true), M(x, y + 0.42, z, ry), null);
  for (const dx of [-l * 0.28, l * 0.28]) K.box('paint', x + dx, y + 0.09, z, 0.28, 0.18, w * 0.72, C('wood'), ry);
}

export function boatChocks(K, x, y, z, l) {
  for (const dx of [-l * 0.3, l * 0.3]) K.box('paint', x + dx, y + 0.2, z, 0.35, 0.4, 1.9, C('wood'));
}

// Welin quadrant davit: pivot and geared sector at the foot, swept steel arm,
// paired lowering falls and a wooden tackle block. Approximate profile, metres.
export function welinDavit(K, x, y, z, headZ, boatY, color = PAL.white) {
  const c = col(color), d = headZ - z, side = Math.sign(d) || 1;
  K.box('paint', x, y + 0.13, z, 0.65, 0.26, 0.65, shade(color, 0.78));
  K.cyl('paint', x, y + 0.26, z, 0.15, 0.8, c, 12);
  K.rod('paint', [x - 0.22, y + 0.8, z], [x + 0.22, y + 0.8, z], 0.28, shade(color, 0.82), 24, false);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x, y + 0.7, z), new THREE.Vector3(x, y + 2.5, z - side * 0.12),
    new THREE.Vector3(x, y + 3.65, z + d * 0.3), new THREE.Vector3(x, y + 4.1, headZ),
  ]);
  K.geo('paint', new THREE.TubeGeometry(curve, 18, 0.11, 8, false), new THREE.Matrix4(), c);
  K.box('paint', x, y + 4.03, headZ, 0.21, 0.3, 0.15, C('wood'));
  const lower = boatY + 0.22;
  for (const dx of [-0.055, 0.055]) K.rod('dark', [x + dx, y + 3.97, headZ], [x + dx, lower, headZ], 0.018, C('rope'), 4, false);
  K.box('paint', x, lower, headZ, 0.16, 0.24, 0.13, C('wood'));
}

// ---------------------------------------------------------------- mast with rigging
export function mast(K, { x, y, top, rake = 2, r = 0.42, nest = 0, yard = 0, stayF = null, stayA = null, shrouds = null, color = PAL.mast, topmast = true }) {
  const rk = Math.tan((rake * Math.PI) / 180);
  const h = top - y;
  const c = col(color);
  const P = (t) => [x - t * rk, y + t, 0];
  const h1 = topmast ? h * 0.7 : h;
  // lower mast (tapered) and topmast
  const seg = (t0, t1, r0, r1) => {
    const a = P(t0), b = P(t1);
    const g = tpl(`taper${r0.toFixed(2)}|${r1.toFixed(2)}`, () => new THREE.CylinderGeometry(r1, r0, 1, 10, 1, true));
    const dir = new THREE.Vector3(b[0] - a[0], b[1] - a[1], 0); const len = dir.length();
    const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    K.geo('paint', g, new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0), qq, new THREE.Vector3(1, len, 1)), c);
  };
  seg(0, h1, r, r * 0.72);
  if (topmast) { seg(h1 - 1.5, h, r * 0.45, r * 0.25); K.cyl('paint', P(h1)[0], P(h1)[1] - 0.5, 0, r * 1.3, 0.35, c, 8); }
  K.cyl('paint', P(h)[0], P(h)[1], 0, r * 0.4, 0.3, c, 8);
  if (nest) {
    const p = P(nest);
    K.cyl('paint', p[0], p[1], 0, 1.0, 1.3, c, 12, false);
    K.cyl('dark', p[0], p[1] + 1.28, 0, 0.9, 0.04, C('soot'), 12);
  }
  if (yard) {
    const p = P(h1 * 0.92);
    K.rod('paint', [p[0], p[1], -yard / 2], [p[0], p[1], yard / 2], 0.12, c, 5, false);
  }
  const rope = C('rope');
  const tp = P(h1 - 0.2);
  if (stayF) K.rod('dark', P(h - 0.2), stayF, 0.035, rope, 3);
  if (stayA) K.rod('dark', P(h - 0.2), stayA, 0.035, rope, 3);
  if (shrouds) for (const [sx, sy, sz] of shrouds) K.rod('dark', tp, [sx, sy, sz], 0.028, rope, 3);
  return P(h);
}

// cargo derrick boom resting from the mast foot toward a hatch
export function derrick(K, from, to, color = PAL.mast) {
  K.rod('paint', from, to, 0.14, col(color), 6, false);
  K.rod('dark', to, [from[0], from[1] + 9, from[2]], 0.025, C('rope'), 3);
}

// ladder / stair between two deck levels (runs along x)
export function stair(K, x0, y0, x1, y1, z, w = 0.9) {
  const n = Math.max(3, Math.round(Math.abs(y1 - y0) / 0.25));
  const c = C('wood'), d = C('black');
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    K.box('paint', x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z, Math.abs(x1 - x0) / n + 0.05, 0.05, w, c);
  }
  for (const dz of [-w / 2, w / 2]) K.strut('paint', [x0, y0, z + dz], [x1, y1, z + dz], 0.08, d, 0.08);
}
