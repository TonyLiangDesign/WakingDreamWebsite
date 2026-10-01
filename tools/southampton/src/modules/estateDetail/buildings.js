import * as THREE from 'three';
import { M4 } from './fb.js';

// Building kit. All functions draw in the FB's current local frame, y absolute (ground = Q).

export function gableRoof(b, x0, y0, z0, lx, lz, rise, key = 'roof', ridgeAlong = 'x', overhang = 0.4, gableKey = 'shedClad') {
  if (ridgeAlong === 'x') {
    const half = lz / 2 + overhang, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    b.cbox(key, x0 + lx / 2, y0 + rise / 2, z0 + lz / 2 - half / 2, lx + overhang * 2, 0.14, slope, -ang, 0, 0);
    b.cbox(key, x0 + lx / 2, y0 + rise / 2, z0 + lz / 2 + half / 2, lx + overhang * 2, 0.14, slope, ang, 0, 0);
    if (gableKey) for (const x of [x0 + 0.02, x0 + lx - 0.02]) {
      b.poly(gableKey, [[x, y0, z0], [x, y0, z0 + lz], [x, y0 + rise, z0 + lz / 2]], [x === x0 + 0.02 ? -1 : 1, 0, 0]);
    }
  } else {
    const half = lx / 2 + overhang, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    b.cbox(key, x0 + lx / 2 - half / 2, y0 + rise / 2, z0 + lz / 2, slope, 0.14, lz + overhang * 2, 0, 0, ang);
    b.cbox(key, x0 + lx / 2 + half / 2, y0 + rise / 2, z0 + lz / 2, slope, 0.14, lz + overhang * 2, 0, 0, -ang);
    if (gableKey) for (const z of [z0 + 0.02, z0 + lz - 0.02]) {
      b.poly(gableKey, [[x0, y0, z], [x0 + lx, y0, z], [x0 + lx / 2, y0 + rise, z]], [0, 0, z === z0 + 0.02 ? -1 : 1]);
    }
  }
}

// Hipped roof as planar faces.
export function hipRoof(b, x0, x1, z0, z1, y0, rise, key = 'slate', o = 0.35) {
  x0 -= o; x1 += o; z0 -= o; z1 += o;
  const lx = x1 - x0, lz = z1 - z0;
  if (lx >= lz) {
    const h = Math.min(lz / 2, lx / 2), zc = (z0 + z1) / 2, y = y0 + rise;
    const A = [x0, y0, z0], B = [x1, y0, z0], C = [x1, y0, z1], D = [x0, y0, z1], R1 = [x0 + h, y, zc], R2 = [x1 - h, y, zc];
    b.poly(key, [A, B, R2, R1], [0, 1, -1]);
    b.poly(key, [D, C, R2, R1], [0, 1, 1]);
    b.poly(key, [A, D, R1], [-1, 1, 0]);
    b.poly(key, [B, C, R2], [1, 1, 0]);
  } else {
    const h = lx / 2, xc = (x0 + x1) / 2, y = y0 + rise;
    const A = [x0, y0, z0], B = [x1, y0, z0], C = [x1, y0, z1], D = [x0, y0, z1], R1 = [xc, y, z0 + h], R2 = [xc, y, z1 - h];
    b.poly(key, [A, D, R2, R1], [-1, 1, 0]);
    b.poly(key, [B, C, R2, R1], [1, 1, 0]);
    b.poly(key, [A, B, R1], [0, 1, -1]);
    b.poly(key, [D, C, R2], [0, 1, 1]);
  }
}

// Long transit shed along a quay. Local frame: x along quay, waterside wall at zW, inland = -z.
// opts: He eaves, clad key, roofKey, roof 'twin'|'single', storeys 1|2, doorsWater, gallery-less.
export function transitShed(b, rnd, x0, x1, zW, D, opts = {}) {
  const Q = 4.6, len = x1 - x0, zL = zW - D;
  const two = opts.storeys === 2;
  const He = opts.He ?? (two ? 12.5 : 8.6);
  const clad = opts.clad || 'shedClad', trim = opts.trim || 'shedTrim', roofKey = opts.roofKey || 'roof';
  const plinth = opts.plinth || 'brickDark';
  const bay = 12;
  const doorH = 5.4;
  for (const [z, side] of [[zW, 1], [zL, -1]]) {
    const zo = side > 0 ? z - 0.3 : z; // wall box min z
    b.gbox(plinth, x0, Q, zo - 0.05, len, 0.9, 0.4);
    b.box(clad, x0, Q + doorH, zo, len, He - doorH, 0.3);
    const doors = side > 0 ? opts.doorsWater !== false : true;
    for (let x = x0; x < x1 - 0.1; x += bay) {
      const w = Math.min(bay, x1 - x);
      if (!doors || w < bay) { b.box(clad, x, Q + 0.9, zo, w, doorH - 0.9, 0.3); continue; }
      b.box(clad, x, Q + 0.9, zo, 3.2, doorH - 0.9, 0.3);
      b.box(clad, x + 8.8, Q + 0.9, zo, 3.2, doorH - 0.9, 0.3);
      // recessed dark opening + sliding door (open or shut)
      b.panel('glass', x + 6, Q + doorH / 2, z - side * 1.2, 'z', side, 5.6, doorH);
      const open = rnd() < 0.5 ? 5.3 : 0;
      b.gbox(trim, x + 3.2 + open, Q + 0.03, side > 0 ? z + 0.05 : z - 0.2, 5.6, doorH - 0.1, 0.15);
      b.box(trim, x + 3.0, Q + doorH, side > 0 ? z + 0.02 : z - 0.35, 11.4, 0.22, 0.33);
    }
    // pilasters + windows
    for (let x = x0; x <= x1 + 0.01; x += bay) b.gbox(trim, x - 0.25, Q, side > 0 ? z : z - 0.2, 0.5, He + 0.1, 0.2);
    const wy = two ? [Q + 7.2, Q + 10.2] : [Q + 6.9];
    for (const y of wy) for (let x = x0 + 1.4; x < x1 - 1.5; x += 3) b.panel('glass', x + 0.8, y, side > 0 ? z + 0.01 : z - 0.01, 'z', side, 1.6, 1.5);
    b.box(trim, x0, Q + He - 0.45, side > 0 ? z - 0.05 : z - 0.2, len, 0.45, 0.25);
    if (two) b.box(trim, x0, Q + doorH + 0.3, side > 0 ? z : z - 0.25, len, 0.25, 0.25);
  }
  // gable ends
  const rise = opts.roof === 'single' ? Math.min(D * 0.22, 6) : 3.4;
  const prof = opts.roof === 'single'
    ? [[0, 0], [D, 0], [D, He], [D / 2, He + rise], [0, He]]
    : [[0, 0], [D, 0], [D, He], [D * 0.75, He + rise], [D * 0.5, He], [D * 0.25, He + rise], [0, He]];
  const shape = new THREE.Shape(prof.map(([x, y]) => new THREE.Vector2(x, y)));
  const gg = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false });
  for (const xe of [x0, x1 - 0.3]) b.add(clad, gg, M4(xe, Q, zW, 0, Math.PI / 2, 0));
  for (const [xe, s] of [[x0 - 0.02, -1], [x1 + 0.02, 1]]) {
    b.panel('glass', xe, Q + 2.8, zW - D * 0.5, 'x', s, 7.5, 5.6);
    b.gbox(trim, xe - 0.1 + (s > 0 ? 0.1 : 0), Q, zW - D * 0.5 - 4.2, 0.12, 5.8, 0.3);
    b.gbox(trim, xe - 0.1 + (s > 0 ? 0.1 : 0), Q, zW - D * 0.5 + 3.9, 0.12, 5.8, 0.3);
    b.panel('glass', xe, Q + He + rise * 0.45, zW - D * (opts.roof === 'single' ? 0.5 : 0.25), 'x', s, 2.6, 1.4);
  }
  // roof
  if (opts.roof === 'single') {
    gableRoof(b, x0, Q + He, zL, len, D, rise, roofKey, 'x', 0.5, null);
    if (opts.rooflights !== false) {
      const half = D / 2 + 0.5, ang = Math.atan2(rise, half);
      for (const s of [-1, 1]) {
        const zc = zL + D / 2 + s * half * 0.45, yc = Q + He + rise * 0.55 + 0.1;
        b.cbox('skylight', x0 + len / 2, yc, zc, len - 10, 0.06, 1.4, s * ang, 0, 0);
      }
    }
    b.cbox(trim, x0 + len / 2, Q + He + rise + 0.05, zL + D / 2, len + 1, 0.22, 0.5);
  } else {
    for (const k of [0, 1]) {
      const zc0 = zL + (D / 2) * k;
      gableRoof(b, x0, Q + He, zc0, len, D / 2, rise, roofKey, 'x', 0.45, null);
      if (opts.rooflights !== false) {
        const half = D / 4 + 0.45, ang = Math.atan2(rise, half);
        for (const s of [-1, 1]) {
          const zc = zc0 + D / 4 + s * (half * 0.32);
          const yc = Q + He + rise * (1 - 0.32) + 0.1;
          b.cbox('skylight', x0 + len / 2, yc + 0.02, zc, len - 8, 0.06, 1.2, s * ang, 0, 0);
        }
      }
      b.cbox(trim, x0 + len / 2, Q + He + rise + 0.05, zc0 + D / 4, len + 0.9, 0.22, 0.5);
    }
    b.box(trim, x0, Q + He - 0.1, zL + D / 2 - 0.4, len, 0.3, 0.8);
  }
  for (let x = x0 + 3; x < x1; x += 24) b.gbox('castIron', x, Q, zW + 0.05, 0.14, He, 0.14);
  // quayside canopy on some sheds
  if (opts.canopy) {
    b.cbox(roofKey, x0 + len / 2, Q + doorH + 0.9, zW + 2.2, len, 0.1, 4.6, -0.14, 0, 0);
    for (let x = x0 + 6; x < x1; x += 12) b.strut(trim, [x, Q + doorH - 0.8, zW + 0.1], [x, Q + doorH + 0.6, zW + 3.8], 0.16);
  }
}

// Multi-storey brick warehouse (bonded store). Axis-aligned in the current frame: x0..x1, z0..z1.
// opts: storeys, wall key, roof 'hip'|'gables', loading side(s) ±z, lucams.
export function warehouse(b, rnd, x0, x1, z0, z1, opts = {}) {
  const Q = 4.6, n = opts.storeys ?? 5, fh = opts.floorH ?? 3.5, H = 1.2 + n * fh;
  const wall = opts.wall || 'brick', dress = opts.dress || 'stone';
  const lx = x1 - x0, lz = z1 - z0;
  b.gbox(wall, x0, Q, z0, lx, H, lz);
  b.gbox(dress, x0 - 0.15, Q, z0 - 0.15, lx + 0.3, 1.2, lz + 0.3); // plinth
  for (let f = 1; f < n; f += 2) b.box(dress, x0 - 0.08, Q + 1.2 + f * fh - 0.15, z0 - 0.08, lx + 0.16, 0.25, lz + 0.16);
  b.box(dress, x0 - 0.3, Q + H - 0.2, z0 - 0.3, lx + 0.6, 0.45, lz + 0.6); // cornice
  const bay = opts.bay ?? 4.2;
  const loads = opts.loading || [-1];
  const doorBays = new Set();
  const nb = Math.max(1, Math.round(lx / bay));
  const bw = lx / nb;
  const loadEvery = opts.loadEvery ?? 5;
  for (let i = Math.floor(loadEvery / 2); i < nb; i += loadEvery) doorBays.add(i);
  // long facades
  for (const s of [-1, 1]) {
    const z = s < 0 ? z0 - 0.02 : z1 + 0.02;
    const loading = loads.includes(s);
    for (let i = 0; i < nb; i++) {
      const cx = x0 + (i + 0.5) * bw;
      if (loading && doorBays.has(i)) {
        for (let f = 0; f < n; f++) {
          const y = Q + (f === 0 ? 0 : 1.2 + f * fh);
          const h = f === 0 ? 3.4 : fh - 0.7;
          b.panel('timberDark', cx, y + h / 2 + (f === 0 ? 0 : 0.2), z, 'z', s, 2.2, h);
        }
        // lucam / hoist housing at the top
        const yl = Q + 1.2 + (n - 1) * fh;
        b.box('timberDark', cx - 1.6, yl, s < 0 ? z0 - 1.4 : z1, 3.2, fh + 1.2, 1.4);
        b.cbox('slate', cx, yl + fh + 1.4, s < 0 ? z0 - 0.8 : z1 + 0.8, 3.6, 0.15, 2.0, s * 0.35, 0, 0);
        b.strut('castIron', [cx, yl + fh + 0.6, s < 0 ? z0 - 1.4 : z1 + 1.4], [cx, yl + fh + 0.6, s < 0 ? z0 - 2.8 : z1 + 2.8], 0.18);
        b.rod('castIron', [cx, yl + fh + 0.6, s < 0 ? z0 - 2.7 : z1 + 2.7], [cx, Q + 3.8 + rnd() * 6, s < 0 ? z0 - 2.7 : z1 + 2.7], 0.02, 3);
      } else {
        for (let f = 0; f < n; f++) {
          const y = Q + 1.2 + f * fh + fh * 0.5 - 0.1;
          b.panel('glass', cx, y, z, 'z', s, Math.min(1.5, bw * 0.45), f === 0 ? 1.9 : 1.7);
        }
      }
    }
  }
  // end facades
  const nbz = Math.max(1, Math.round(lz / bay));
  const bz = lz / nbz;
  for (const s of [-1, 1]) {
    const x = s < 0 ? x0 - 0.02 : x1 + 0.02;
    for (let i = 0; i < nbz; i++) for (let f = 0; f < n; f++) {
      if (opts.blindEnds && i % 2) continue;
      b.panel('glass', x, Q + 1.2 + f * fh + fh * 0.5 - 0.1, z0 + (i + 0.5) * bz, 'x', s, Math.min(1.4, bz * 0.45), 1.7);
    }
  }
  // roof
  const yr = Q + H + 0.25;
  if (opts.roof === 'gables') {
    // transverse gables along x (valley roof), gable walls on the long ±z facades
    const k = Math.max(1, Math.round(lx / (opts.gableSpan ?? 16)));
    const span = lx / k;
    for (let i = 0; i < k; i++) gableRoof(b, x0 + i * span, yr, z0, span, lz, Math.min(span * 0.35, 5), 'slate', 'z', 0.25, wall);
  } else if (opts.roof === 'flat') {
    b.box('render', x0 + 0.3, yr - 0.05, z0 + 0.3, lx - 0.6, 0.12, lz - 0.6);
    b.box(wall, x0, yr - 0.2, z0, lx, 1.0, 0.4); b.box(wall, x0, yr - 0.2, z1 - 0.4, lx, 1.0, 0.4);
  } else {
    hipRoof(b, x0, x1, z0, z1, yr, Math.min(lz, lx) * 0.28, 'slate', 0.4);
  }
  // chimney stacks
  const nc = Math.max(1, Math.floor(lx / 30));
  for (let i = 0; i < nc; i++) {
    const cx = x0 + lx * (i + 0.5) / nc + (rnd() - 0.5) * 4, cz = z0 + lz * (0.3 + rnd() * 0.4);
    const rr = opts.roof === 'gables' ? Math.min(lx / Math.max(1, Math.round(lx / (opts.gableSpan ?? 16))) * 0.35, 5) : Math.min(lz, lx) * 0.28;
    b.gbox(wall, cx - 0.7, yr, cz - 0.5, 1.4, Math.min(rr, 6) + 1.8, 1.0);
  }
  return H;
}

// North-light saw-tooth engineering shop. Teeth ridges run along z; glazing faces -x (north).
export function sawtoothShop(b, x0, x1, z0, z1, opts = {}) {
  const Q = 4.6, He = opts.He ?? 10, R = opts.rise ?? 4.2, span = opts.span ?? 9;
  const lx = x1 - x0, lz = z1 - z0, wall = opts.wall || 'brick';
  const nT = Math.max(1, Math.round(lx / span)), S = lx / nT;
  // walls
  b.gbox(wall, x0, Q, z0, lx, He, 0.6);
  b.gbox(wall, x0, Q, z1 - 0.6, lx, He, 0.6);
  b.gbox(wall, x0, Q, z0, 0.6, He + R, lz);
  b.gbox(wall, x1 - 0.6, Q, z0, 0.6, He, lz);
  b.box('stone', x0 - 0.1, Q + He - 0.4, z0 - 0.12, lx + 0.2, 0.4, 0.2);
  b.box('stone', x0 - 0.1, Q + He - 0.4, z1 - 0.08, lx + 0.2, 0.4, 0.2);
  // pilasters & tall windows on long walls
  for (let x = x0; x <= x1 + 0.01; x += S / 2) {
    for (const z of [z0 - 0.35, z1 - 0.05]) b.gbox(wall, x - 0.4, Q, z, 0.8, He - 0.4, 0.4);
  }
  for (let x = x0 + S / 4; x < x1; x += S / 2) {
    b.panel('glass', x, Q + He * 0.52, z0 - 0.03, 'z', -1, S * 0.26, He * 0.55);
    b.panel('glass', x, Q + He * 0.52, z1 + 0.03, 'z', 1, S * 0.26, He * 0.55);
  }
  // end walls with saw-tooth profile (z ends)
  const prof = [[0, 0], [lx, 0], [lx, He]];
  for (let i = nT - 1; i >= 0; i--) { prof.push([i * S + 0.6, He + R]); if (i > 0) prof.push([i * S, He]); else prof.push([0, He + R]); }
  const shape = new THREE.Shape(prof.map(([x, y]) => new THREE.Vector2(x, y)));
  const gg = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false });
  b.add(wall, gg, M4(x0, Q, z0, 0, 0, 0));
  b.add(wall, gg, M4(x0, Q, z1 - 0.6, 0, 0, 0));
  // big doors in end walls
  for (const [z, s] of [[z0 - 0.03, -1], [z1 + 0.03, 1]]) {
    if (opts.doors === false) break;
    b.panel('timberDark', x0 + lx * 0.5, Q + 3.2, z, 'z', s, 6, 6.4);
  }
  // roof teeth
  for (let i = 0; i < nT; i++) {
    const xa = x0 + i * S;
    // glazing (north face, slightly raked)
    // north face: boarded/slated lower half, a narrow grimy glazed band under the ridge
    const ym = Q + He + R * 0.45, xm = xa + 0.6 * 0.45;
    b.poly(opts.roofKey || 'slate', [[xa, Q + He, z0 + 0.3], [xa, Q + He, z1 - 0.3], [xm, ym, z1 - 0.3], [xm, ym, z0 + 0.3]], [-1, 0.1, 0]);
    b.poly('skylight', [[xm, ym, z0 + 0.3], [xm, ym, z1 - 0.3], [xa + 0.6, Q + He + R, z1 - 0.3], [xa + 0.6, Q + He + R, z0 + 0.3]], [-1, 0.1, 0]);
    // slope
    const ang = Math.atan2(R, S - 0.6), sl = Math.hypot(R, S - 0.6);
    b.cbox(opts.roofKey || 'slate', xa + 0.6 + (S - 0.6) / 2, Q + He + R / 2 + 0.08, (z0 + z1) / 2, sl + 0.3, 0.14, lz + 0.3, 0, 0, -ang);
    b.box('castIron', xa - 0.15, Q + He - 0.1, z0, 0.5, 0.25, lz); // valley gutter
    for (let z = z0 + 3; z < z1 - 1; z += 3) b.box('shedTrim', xa + 0.45, ym - 0.1, z, 0.08, Q + He + R - ym, 0.08);
  }
}

export function chimney(b, x, z, h = 40, r = 1.8) {
  const Q = 4.6;
  b.gbox('brick', x - r - 0.8, Q, z - r - 0.8, 2 * r + 1.6, 7, 2 * r + 1.6);
  b.box('stone', x - r - 1.0, Q + 7, z - r - 1.0, 2 * r + 2, 0.5, 2 * r + 2);
  b.add('brick', new THREE.CylinderGeometry(r * 0.62, r, h - 7.5, 8, 1, true), M4(x, Q + 7.5 + (h - 7.5) / 2, z, 0, Math.PI / 8, 0));
  b.add('brickDark', new THREE.CylinderGeometry(r * 0.78, r * 0.66, 1.6, 8, 1, false), M4(x, Q + h + 0.3, z, 0, Math.PI / 8, 0));
  b.add('black', new THREE.CylinderGeometry(r * 0.56, r * 0.56, 0.2, 8, 1, false), M4(x, Q + h + 1.02, z, 0, Math.PI / 8, 0));
}

// Two/three storey office or engine house with hipped slate roof.
export function office(b, rnd, x0, x1, z0, z1, opts = {}) {
  const Q = 4.6, n = opts.storeys ?? 2, fh = opts.floorH ?? 3.8, H = n * fh + 0.8;
  const wall = opts.wall || 'brick';
  b.gbox(wall, x0, Q, z0, x1 - x0, H, z1 - z0);
  b.gbox('stone', x0 - 0.12, Q, z0 - 0.12, x1 - x0 + 0.24, 0.8, z1 - z0 + 0.24);
  b.box('stone', x0 - 0.25, Q + H - 0.3, z0 - 0.25, x1 - x0 + 0.5, 0.35, z1 - z0 + 0.5);
  for (let f = 1; f < n; f++) b.box('stone', x0 - 0.08, Q + 0.8 + f * fh - 0.1, z0 - 0.08, x1 - x0 + 0.16, 0.2, z1 - z0 + 0.16);
  const bay = 3.4;
  for (const s of [-1, 1]) {
    const z = s < 0 ? z0 - 0.02 : z1 + 0.02;
    const nb = Math.max(1, Math.round((x1 - x0) / bay)), bw = (x1 - x0) / nb;
    for (let i = 0; i < nb; i++) for (let f = 0; f < n; f++) {
      const door = f === 0 && s === (opts.front ?? -1) && i === Math.floor(nb / 2);
      b.panel(door ? 'timberDark' : 'glass', x0 + (i + 0.5) * bw, Q + 0.8 + f * fh + (door ? 0.6 : fh * 0.5), z, 'z', s, door ? 1.6 : 1.1, door ? 2.6 : 1.9);
    }
    const x = s < 0 ? x0 - 0.02 : x1 + 0.02;
    const nz = Math.max(1, Math.round((z1 - z0) / bay)), bz = (z1 - z0) / nz;
    for (let i = 0; i < nz; i++) for (let f = 0; f < n; f++) b.panel('glass', x, Q + 0.8 + f * fh + fh * 0.5, z0 + (i + 0.5) * bz, 'x', s, 1.1, 1.9);
  }
  const rise = Math.min(x1 - x0, z1 - z0) * 0.3;
  hipRoof(b, x0, x1, z0, z1, Q + H, rise, opts.roofKey || 'slate', 0.45);
  for (const t of [0.2, 0.8]) {
    const lx = x1 - x0 >= z1 - z0;
    const cx = lx ? x0 + (x1 - x0) * t : (x0 + x1) / 2 + 1, cz = lx ? (z0 + z1) / 2 + 1 : z0 + (z1 - z0) * t;
    b.gbox(wall, cx - 0.5, Q + H + rise * 0.4, cz - 0.9, 1.0, rise * 0.6 + 1.8, 1.8);
  }
  if (opts.clock) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.gbox('white', cx - 1.4, Q + H + rise - 0.5, cz - 1.4, 2.8, 3.2, 2.8);
    hipRoof(b, cx - 1.4, cx + 1.4, cz - 1.4, cz + 1.4, Q + H + rise + 2.7, 2.2, 'slate', 0.2);
  }
  return H + rise;
}

// Small timber hut / cabin
export function hut(b, x, z, w = 3, d = 2.4, ry = 0, opts = {}) {
  const Q = 4.6, h = opts.h ?? 2.6;
  b.pushFrame(x, z, ry);
  b.gbox(opts.wall || 'timberDark', -w / 2, Q, -d / 2, w, h, d);
  gableRoof(b, -w / 2, Q + h, -d / 2, w, d, 0.8, opts.roof || 'roof', 'x', 0.25, opts.wall || 'timberDark');
  b.panel('glass', 0, Q + 1.6, d / 2 + 0.02, 'z', 1, 0.9, 0.8);
  b.panel('timber', -w / 2 - 0.02, Q + 1.0, 0, 'x', -1, 0.8, 1.9);
  if (opts.stove !== false) b.cyl('castIron', w * 0.3, Q + h + 1.0, -d * 0.2, 0.08, 0.08, 1.6, 5);
  b.pop();
}

// Cold store: tall, near-windowless, rendered brick with pilasters.
export function coldStore(b, x0, x1, z0, z1, H = 20) {
  const Q = 4.6;
  b.gbox('render', x0, Q, z0, x1 - x0, H, z1 - z0);
  b.gbox('brickDark', x0 - 0.2, Q, z0 - 0.2, x1 - x0 + 0.4, 2.2, z1 - z0 + 0.4);
  for (let x = x0; x <= x1 + 0.01; x += 6) for (const z of [z0 - 0.4, z1]) b.gbox('render', x - 0.5, Q, z, 1.0, H + 0.6, 0.4);
  for (let z = z0; z <= z1 + 0.01; z += 6) for (const x of [x0 - 0.4, x1]) b.gbox('render', x, Q, z - 0.5, 0.4, H + 0.6, 1.0);
  b.box('stone', x0 - 0.5, Q + H, z0 - 0.5, x1 - x0 + 1, 0.7, z1 - z0 + 1);
  for (let x = x0 + 3; x < x1 - 2; x += 6) {
    b.panel('glass', x, Q + H - 2.5, z0 - 0.45, 'z', -1, 1.0, 1.2);
    b.panel('timberDark', x, Q + 1.8, z0 - 0.45, 'z', -1, 2.2, 3.0);
  }
  // machinery house & short stack on the roof
  b.gbox('brick', x0 + 4, Q + H + 0.7, z0 + 4, 14, 4.5, 9);
  hipRoof(b, x0 + 4, x0 + 18, z0 + 4, z0 + 13, Q + H + 5.2, 2.5, 'slate', 0.3);
  b.cyl('brick', x0 + 22, Q + H + 7, z0 + 8, 0.7, 0.9, 12, 8);
  // raised loading platform with canopy
  b.gbox('brickDark', x0, Q, z0 - 5, x1 - x0, 1.1, 4.6);
  b.cbox('roof', (x0 + x1) / 2, Q + 5.6, z0 - 3, x1 - x0, 0.12, 5.4, 0.12, 0, 0);
  for (let x = x0 + 2; x < x1; x += 8) b.strut('castIron', [x, Q + 1.1, z0 - 5.2], [x, Q + 5.3, z0 - 5.2], 0.18);
}
