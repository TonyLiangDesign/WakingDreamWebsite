import { frustum, extrudeProfile, roundArch } from './kit.js';
import { groundRange, chimney, dormer, windowRow, bearingYaw } from './common.js';

// South Western Hotel (John Norton, 1867–72) and Tite's Southampton Terminus (1839–40)
// fronting Terminus Terrace, with the station roof and platforms behind running NNE.

const STREET_BEARING = 20;

export function buildStation(ctx, kit) {
  const L = ctx.layout.LANDMARKS;
  const ry = bearingYaw(STREET_BEARING);
  const ux = Math.cos(ry), uz = -Math.sin(ry); // along street (NNE)
  const nx = -Math.sin(ry), nz = -Math.cos(ry); // local -z = toward the street (WNW)
  // frontage line through the terminus front (terminus is 15 m deep)
  const tf = [L.terminus[0] + nx * 7.5, L.terminus[1] + nz * 7.5];
  const along = (p) => (p[0] - tf[0]) * ux + (p[1] - tf[1]) * uz;
  const hs = along(L.southWesternHotel);
  const hotelOrigin = [tf[0] + ux * hs, tf[1] + uz * hs];

  const tk = kit.sub(tf[0], 0, tf[1], ry);
  const hk = kit.sub(hotelOrigin[0], 0, hotelOrigin[1], ry);
  const footprints = [];
  footprints.push(hotel(ctx, hk));
  footprints.push(terminus(ctx, tk));
  footprints.push(...trainShed(ctx, tk));
  return footprints;
}

// ------------------------------------------------------------------ hotel
function hotel(ctx, k) {
  const [lo, hi] = groundRange(ctx, k, -34, 34, -1, 47);
  const g = Math.min(hi, lo + 0.6); // floor at the low side; uphill ground runs into the rusticated base
  const b = k.sub(0, g, 0);
  const levels = [
    { y: 1.3, h: 2.6, arch: 'round' },
    { y: 6.2, h: 2.5 },
    { y: 10.4, h: 2.3 },
    { y: 14.4, h: 2.1 },
    { y: 18.2, h: 1.7 },
  ];
  const EAVE = 20.6;
  const ranges = [
    [-33, 33, 0, 15, 'front'],
    [-33, -19, 15, 46, 'south'],
    [19, 33, 15, 40, 'north'],
  ];
  // foundations / plinth
  for (const [x0, x1, z0, z1] of ranges) {
    b.box('stoneDark', x0 - 0.4, lo - g - 2.5, z0 - 0.4, x1 - x0 + 0.8, 2.5 + (g - lo) + 0.9, z1 - z0 + 0.8);
  }
  for (const [x0, x1, z0, z1] of ranges) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    b.box('hotelStone', x0, 0, z0, w, EAVE, d);
    // rusticated ground storey band & string courses
    b.box('hotelStone', x0 - 0.2, 0.6, z0 - 0.2, w + 0.4, 4.4, d + 0.4);
    b.box('stoneDark', x0 - 0.35, 5.0, z0 - 0.35, w + 0.7, 0.45, d + 0.7);
    b.box('hotelStone', x0 - 0.25, 9.2, z0 - 0.25, w + 0.5, 0.25, d + 0.5);
    b.box('stoneDark', x0 - 0.6, EAVE, z0 - 0.6, w + 1.2, 0.8, d + 1.2); // cornice
    b.box('hotelStone', x0 - 0.3, EAVE + 0.8, z0 - 0.3, w + 0.6, 0.7, d + 0.6); // balustrade parapet
    for (const f of b.faces(cx, cz, w, d)) {
      const n = Math.max(1, Math.round(f.len / 3.6));
      for (const lv of levels) {
        windowRow(f.k, { x0: -f.len / 2 + 0.4, x1: f.len / 2 - 0.4, n, y: lv.y, ww: 1.35, wh: lv.h, dress: 'hotelStone', arch: lv.arch, depth: lv.arch ? 0.3 : 0.12 });
      }
    }
    // mansard
    const mb = EAVE + 1.5, mh = 4.4, inset = 1.6;
    b.fr('slate', cx, mb, cz, w + 0.4, d + 0.4, mh, w + 0.4 - inset * 2, d + 0.4 - inset * 2);
    const tw = w + 0.4 - inset * 2, td = d + 0.4 - inset * 2;
    b.fr('slate', cx, mb + mh, cz, tw, td, 1.4, Math.max(0.01, tw - td), td > tw ? td - tw : 0);
    for (const f of b.faces(cx, cz, w, d, mb)) {
      const n = Math.max(1, Math.round(f.len / 3.6));
      for (let i = 0; i < n; i++) {
        const x = -f.len / 2 + 0.4 + ((f.len - 0.8) * (i + 0.5)) / n;
        if (Math.abs(x) > f.len / 2 - 2.5) continue;
        dormer(f.k, x, 0.5, 0.25, 1.5, 2.1, 'slate', 'hotelStone');
      }
    }
    // chimney stacks along the ridge line
    const long = w > d;
    const cnt = Math.max(2, Math.round(Math.max(w, d) / 11));
    for (let i = 0; i < cnt; i++) {
      const t = (i + 0.5) / cnt - 0.5;
      const px = long ? cx + t * (w - 8) : cx + (i % 2 ? 2.2 : -2.2);
      const pz = long ? cz + (i % 2 ? 2.2 : -2.2) : cz + t * (d - 8);
      chimney(b, 'hotelStone', px, mb + 1.5, pz, 1.2, 3.2, 5.2, 4, 'brickDark');
    }
  }
  // pavilions
  const pav = [
    [-33.8, -22, -0.9, 11, 7.5],
    [22, 33.8, -0.9, 11, 7.5],
    [-33.8, -22, 35, 46.9, 7.0],
    [-7.5, 7.5, -1.4, 13, 9.5],
  ];
  for (const [x0, x1, z0, z1, rh] of pav) {
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const top = EAVE + 4.0;
    b.box('hotelStone', x0, 0.2, z0, w, top, d);
    b.box('stoneDark', x0 - 0.35, 5.0, z0 - 0.35, w + 0.7, 0.45, d + 0.7);
    b.box('stoneDark', x0 - 0.6, EAVE, z0 - 0.6, w + 1.2, 0.8, d + 1.2);
    b.box('stoneDark', x0 - 0.7, top, z0 - 0.7, w + 1.4, 0.9, d + 1.4);
    // quoins
    for (const [qx, qz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.cbox('stoneDark', qx, top / 2, qz, 0.9, top, 0.9);
    for (const f of b.faces(cx, cz, w, d)) {
      const n = Math.max(1, Math.round(f.len / 4.2));
      for (const lv of levels) windowRow(f.k, { x0: -f.len / 2 + 1, x1: f.len / 2 - 1, n, y: lv.y + 0.2, ww: 1.4, wh: lv.h, dress: 'hotelStone', arch: lv.arch, depth: lv.arch ? 0.3 : 0.12 });
      windowRow(f.k, { x0: -f.len / 2 + 1, x1: f.len / 2 - 1, n, y: EAVE + 1.3, ww: 1.2, wh: 1.8, dress: 'hotelStone', depth: 0.12 });
      // tall pavilion roof dormer
      f.k.cbox('hotelStone', 0, top + 2.6, 1.2, 2.4, 3.2, 1.5);
      f.k.cyl('glass', 0, top + 2.7, 0.42, 0.75, 0.75, 0.1, 10, Math.PI / 2, 0, 0);
      f.k.geo('slate', frustum(3.0, 1.9, 1.3, 0, 1.9), 0, top + 4.2, 1.2);
    }
    const base = top + 0.9;
    const tw = w * 0.42, td = d * 0.42;
    b.fr('slate', cx, base, cz, w + 0.6, d + 0.6, rh, tw, td);
    b.box('castIron', cx - tw / 2, base + rh, cz - td / 2, tw, 0.25, td);
    // iron cresting
    for (const f of b.faces(cx, cz, tw, td, base + rh + 0.25)) f.k.cbox('castIron', 0, 0.45, 0, f.len, 0.9, 0.06);
    if (rh > 9) { // central flag staff
      b.cyl('castIron', cx, base + rh + 3.5, cz, 0.06, 0.1, 6.5, 6);
    }
    chimney(b, 'hotelStone', x0 + 1.4, base + 2, cz, 1.2, 2.4, rh - 0.5, 3, 'brickDark');
  }
  // entrance canopy on the Terminus Terrace front
  b.box('castIron', -6, 4.6, -4.4, 12, 0.35, 3.2);
  b.box('glassRoof', -5.8, 4.95, -4.3, 11.6, 0.12, 3.0);
  for (const x of [-5.6, -1.9, 1.9, 5.6]) b.cyl('castIron', x, 2.3, -4.1, 0.1, 0.12, 4.6, 8);
  return { name: 'South Western Hotel', pts: [k.toWorld(-35, 0, -5), k.toWorld(35, 0, -5), k.toWorld(35, 0, 48), k.toWorld(-35, 0, 48)] };
}

// ------------------------------------------------------------------ terminus
function terminus(ctx, k) {
  const [lo, hi] = groundRange(ctx, k, -18, 18, -1, 16);
  const g = Math.min(hi, lo + 0.6);
  const b = k.sub(0, g, 0);
  const W = 34, D = 15, EAVE = 13.8;
  b.box('stoneDark', -W / 2 - 0.4, lo - g - 2.5, -0.4, W + 0.8, 2.5 + (g - lo) + 0.7, D + 0.8);
  b.box('render', -W / 2, 0, 0, W, EAVE, D);
  // rusticated ground floor & first floor band
  b.box('render', -W / 2 - 0.15, 0.3, -0.15, W + 0.3, 5.4, D + 0.3);
  b.box('stoneDark', -W / 2 - 0.35, 5.7, -0.35, W + 0.7, 0.4, D + 0.7);
  b.box('stoneDark', -W / 2 - 0.2, 9.6, -0.2, W + 0.4, 0.22, D + 0.4);
  // deep bracketed eaves cornice
  b.box('stoneDark', -W / 2 - 1.0, EAVE - 0.2, -1.0, W + 2.0, 0.7, D + 2.0);
  for (let i = 0; i <= 16; i++) b.cbox('render', -W / 2 - 0.2 + (i * (W + 0.4)) / 16, EAVE - 0.55, -0.55, 0.3, 0.6, 1.0);
  // quoins
  for (const [qx, qz] of [[-W / 2, 0], [W / 2, 0], [-W / 2, D], [W / 2, D]]) b.cbox('stoneDark', qx, EAVE / 2, qz, 0.8, EAVE, 0.8);
  const faces = b.faces(0, D / 2, W, D);
  faces.forEach((f, i) => {
    const n = i % 2 === 0 ? 7 : 3;
    if (i === 0) {
      // arcaded loggia: seven round-headed openings
      const arch = extrudeProfile(roundArch(2.8, 3.1, 8), 0.5);
      for (let j = 0; j < 7; j++) {
        const x = -W / 2 + 1.0 + ((W - 2) * (j + 0.5)) / 7;
        f.k.geo('glass', arch, x, 0.35, -0.12);
        f.k.cbox('render', x, 5.05, -0.3, 1.0, 0.8, 0.3); // keystone
      }
    } else {
      windowRow(f.k, { x0: -f.len / 2 + 1, x1: f.len / 2 - 1, n, y: 1.4, ww: 1.4, wh: 2.8, arch: 'round', dress: 'render', depth: 0.25 });
    }
    windowRow(f.k, { x0: -f.len / 2 + 1, x1: f.len / 2 - 1, n, y: 6.6, ww: 1.4, wh: 2.6, dress: 'render', hood: false, depth: 0.14 });
    for (let j = 0; j < n; j++) { // pedimented heads
      const x = -f.len / 2 + 1 + ((f.len - 2) * (j + 0.5)) / n;
      f.k.geo('render', frustum(2.1, 0.3, 0.6, 0, 0.3), x, 9.35, -0.15);
    }
    windowRow(f.k, { x0: -f.len / 2 + 1, x1: f.len / 2 - 1, n, y: 10.5, ww: 1.3, wh: 2.0, dress: 'render', depth: 0.14 });
  });
  // low hipped slate roof
  const RW = W + 2.0, RD = D + 2.0;
  b.fr('slate', 0, EAVE + 0.5, D / 2, RW, RD, 3.6, RW - RD, 0);
  for (const [x, z] of [[-11, 3.5], [11, 3.5], [-11, 11.5], [11, 11.5]]) chimney(b, 'render', x, EAVE + 1.5, z, 2.8, 1.0, 4.0, 4, 'brickDark');
  return { name: 'Terminus Station', pts: [k.toWorld(-18, 0, -2), k.toWorld(18, 0, -2), k.toWorld(18, 0, 16), k.toWorld(-18, 0, 16)] };
}

// ------------------------------------------------------------------ train shed, platforms, tracks
function trainShed(ctx, k) {
  const out = [];
  const Z0 = 18, Z1 = 56, X0 = -14, X1 = 100;
  // shed floor at the ground under its middle; the station roads beyond follow the ground
  const gAt = (x, z = 37) => { const p = k.toWorld(x, 0, z); return ctx.terrain.heightAt(p[0], p[2]); };
  const g = gAt((X0 + X1) / 2) + 0.2;
  const b = k.sub(0, g, 0);
  const W = X1 - X0, cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2, D = Z1 - Z0;
  // side walls: brick with arched openings
  for (const z of [Z0, Z1]) {
    b.box('brickDark', X0, -3, z - 0.6, W, 10, 1.2);
    b.box('stoneDark', X0 - 0.2, 6.6, z - 0.8, W + 0.4, 0.5, 1.6);
  }
  const sideFaces = b.faces(cx, cz, W, D + 1.2);
  for (const idx of [0, 2]) windowRow(sideFaces[idx].k, { x0: -W / 2 + 2, x1: W / 2 - 2, n: 14, y: 1.0, ww: 3.0, wh: 3.6, arch: 'round', depth: 0.3 });
  // roof: slate slopes with glazed central lights, iron end screens
  b.fr('slate', cx, 7.0, cz, W + 1, D + 3, 9.5, W + 1, 0);
  for (const s of [-1, 1]) {
    // glazed strip on each slope: tilted panel
    const ang = Math.atan2(9.5, (D + 3) / 2);
    b.cbox('glassRoof', cx, 7.0 + 9.5 * 0.55, cz + s * (D + 3) / 2 * 0.45, W - 6, 0.12, (D + 3) / 2 * 0.55 / Math.cos(ang), s * ang, 0, 0);
  }
  b.box('slate', X0, 16.4, cz - 1.8, W, 0.25, 3.6);
  b.box('glassRoof', X0, 16.6, cz - 1.6, W, 1.3, 3.2); // ventilating lantern
  b.box('slate', X0 - 0.3, 17.9, cz - 2.1, W + 0.6, 0.2, 4.2);
  // end screens (timber valance) – shallow, trains pass under
  for (const x of [X0, X1]) {
    b.cbox('timberDark', x, 10.5, cz, 0.3, 3.5, D);
  }
  // platforms & tracks
  const tracksZ = [23.5, 31.5, 42.5, 50.5];
  const platZ = [[18.6, 21.0], [34.0, 40.0], [53.0, 55.4]];
  // rail level (relative to g): flat under the roof, then easing onto the ground
  const railAt = (x, z) => {
    if (x <= X1) return 0.25;
    const t = Math.min(1, (x - X1) / 40);
    const tt = t * t * (3 - 2 * t);
    return 0.25 * (1 - tt) + (gAt(x, z) + 0.3 - g) * tt;
  };
  const seg = (key, xa, xb, z, depth, top, h, w) => { // tilted strip following railAt
    const ya = railAt(xa, z) + top, yb = railAt(xb, z) + top;
    const L = Math.hypot(xb - xa, yb - ya), ang = Math.atan2(yb - ya, xb - xa);
    b.cbox(key, (xa + xb) / 2, (ya + yb) / 2 - h / 2 + Math.sin(ang) * 0, z, L + 0.05, h, w, 0, 0, ang);
  };
  const STEP = 10;
  for (const [p0, p1] of platZ) for (let x = X0; x < X0 + 175; x += STEP) seg('stoneDark', x, x + STEP, (p0 + p1) / 2, 0, 0.7, 2.6, p1 - p0);
  // open platform canopies beyond the roof
  for (const [p0, p1] of platZ.slice(1, 2)) {
    for (let x = X1; x < X1 + 60; x += STEP) seg('roof', x, x + STEP, (p0 + p1) / 2, 0, 5.9, 0.3, p1 - p0 + 1.6);
    for (let x = X1 + 4; x < X1 + 60; x += 8) { const y = railAt(x, 37); b.cyl('castIron', x, y + 3.0, (p0 + p1) / 2, 0.12, 0.15, 5.4, 6); }
  }
  // tracks: ballast, sleeper band and rails as strips that follow the grade
  for (let x = X0; x < 330; x += STEP) {
    const zs = x >= 200 ? [31.5, 42.5] : tracksZ;
    for (const tz of zs) {
      seg('ballast', x, x + STEP, tz, 0, -0.05, 3.0, 4.0);
      seg('sleeper', x, x + STEP, tz, 0, 0.07, 0.12, 2.6);
      for (const r of [-0.72, 0.72]) seg('rail', x, x + STEP, tz + r, 0, 0.21, 0.14, 0.08);
    }
  }
  // buffer stops at the head of each road
  for (const tz of tracksZ) b.box('timberDark', X0 + 0.3, 0.2, tz - 1.2, 0.6, 1.2, 2.4);
  out.push({ name: 'Terminus train shed', pts: [k.toWorld(X0, 0, Z0 - 1), k.toWorld(X1 + 70, 0, Z0 - 1), k.toWorld(X1 + 70, 0, Z1 + 1), k.toWorld(X0, 0, Z1 + 1)] });
  out.push({ name: 'Terminus tracks', pts: [k.toWorld(X1 + 70, 0, 20), k.toWorld(330, 0, 20), k.toWorld(330, 0, 55), k.toWorld(X1 + 70, 0, 55)] });
  return out;
}
