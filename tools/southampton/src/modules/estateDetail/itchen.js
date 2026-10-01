import * as THREE from 'three';
import { M4 } from './fb.js';
import { transitShed, warehouse, sawtoothShop, chimney, office, hut, gableRoof } from './buildings.js';
import { steamCrane, hydraulicCrane } from './cranes.js';
import { hullGeo, coalHeap, timberStack } from './props.js';
import { makePath, drawTrack, rake, RAIL_TOP } from './rail.js';
import { pointInPoly, distToSegs } from '../../poly.js';

// River Itchen, 1912: the Itchen wharves (coal & timber) on the west bank north of the Outer Dock,
// Day, Summers & Co's Northam Iron Works upstream on the west bank, and John I. Thornycroft's
// Woolston shipyard (the former Mordey, Carney yard) on the east bank south of the floating bridge,
// with colliers, hulks, barges and a destroyer fitting out.
// Authored in WORLD coordinates; the FB/instancer live in the dock-frame group, so everything is
// pre-multiplied by the inverse dock yaw.

const Q = 4.6;

export function buildItchen({ ctx, fb, inst, rnd, stats }) {
  const { layout, terrain, geo } = ctx;
  if (!terrain?.sample) return;
  const Rinv = new THREE.Matrix4().makeRotationY(-geo.DOCK_YAW);
  const winst = { place: (name, m) => inst.place(name, Rinv.clone().multiply(m)), has: (n) => inst.has(n) };
  const at = (name, x, y, z, ry = 0) => winst.place(name, new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const fbW = layout.LANDMARKS.floatingBridgeW, fbE = layout.LANDMARKS.floatingBridgeE;
  const bridgeClear = (x, z, r = 0) => distToSegs(x, z, [fbW, fbE], false) >= 30 + r;
  const hAt = (x, z) => terrain.sample(x, z).h;

  defineCraft(inst);
  fb.push(Rinv);

  // frame: origin on the bank line, u along the bank, inland = (uz, -ux)
  const frame = (ox, oz, ux, uz) => { const l = Math.hypot(ux, uz); ux /= l; uz /= l; return { ox, oz, ux, uz, ang: Math.atan2(-uz, ux) }; };
  const W = (fr, s, n) => [fr.ox + fr.ux * s + fr.uz * n, fr.oz + fr.uz * s - fr.ux * n];
  const enter = (fr, Y) => fb.pushFrame(fr.ox, fr.oz, fr.ang, Y - Q);
  const yawAlong = (fr, flip = false) => fr.ang + (flip ? Math.PI : 0);
  const yawInland = (fr) => fr.ang + Math.PI / 2; // local +x pointing inland

  // hull-in-water test (world): every sample under the hull and a margin must be real water
  const inWater = (x, z, yaw, L, B, margin = 3) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const u of [-1, -0.5, 0, 0.5, 1]) for (const v of [-1, 0, 1]) {
      const lx = u * (L / 2 + margin), lz = v * (B / 2 + margin);
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      if (hAt(px, pz) > -1.5 || !bridgeClear(px, pz)) return false;
    }
    return true;
  };
  const moor = (name, fr, s, n, L, B, flip = false) => {
    const [x, z] = W(fr, s, n);
    const yaw = yawAlong(fr, flip);
    if (!inWater(x, z, yaw, L, B)) return false;
    at(name, x, 0, z, yaw);
    stats.boats++;
    return true;
  };

  // made-ground platform with a timber-piled river face; returns its level
  const platform = (fr, s0, s1, n0, n1, gaps = []) => {
    let Y = 2.4;
    for (let s = s0; s <= s1; s += 10) for (let n = Math.max(n0, 2); n <= n1; n += 10) { const [x, z] = W(fr, s, n); Y = Math.max(Y, hAt(x, z) + 0.35); }
    Y = Math.min(Y, 4.4);
    enter(fr, Y);
    const spans = [];
    let a = s0;
    for (const [g0, g1] of gaps.sort((p, q) => p[0] - q[0])) { if (g0 > a) spans.push([a, g0]); a = g1; }
    if (a < s1) spans.push([a, s1]);
    const nGap = gaps.length ? gaps[0][2] : n0;
    for (const [p, q] of spans) fb.box('yardEarth', p, Q - Y - 1.5, -nGap, q - p, Y + 1.5, nGap - n0, 0, true);
    fb.box('yardEarth', s0, Q - Y - 1.5, -n1, s1 - s0, Y + 1.5, n1 - nGap, 0, true);
    for (const [p, q] of spans) {
      for (let s = p + 1; s < q; s += 2.4) fb.box('fender', s - 0.18, Q - Y - 1.5, -n0 + 0.05, 0.36, Y + 1.8, 0.36);
      fb.box('fender', p, Q - 0.9, -n0 + 0.4, q - p, 0.35, 0.3);
    }
    fb.pop();
    return Y;
  };

  const slipway = (fr, Y, sc, nTop, nBot = -40, yBot = -2.6) => {
    enter(fr, Y);
    const len = nTop - nBot;
    const y = (n) => Q - Y + yBot + (Y - yBot) * (n - nBot) / len; // local-Q-based y at inland n
    // inclined ground slab and ways
    fb.strut('yardEarth', [sc, y(nBot) - 0.8, -nBot], [sc, y(nTop) - 0.8, -nTop], 16.6, 1.6);
    for (const o of [-3.2, 3.2]) fb.strut('timberDark', [sc + o, y(nBot) + 0.15, -nBot], [sc + o, y(nTop) + 0.15, -nTop], 1.1, 0.35);
    for (let n = nBot + 2; n < nTop; n += 1.8) fb.box('timberDark', sc - 0.6, y(n) + 0.1, -n - 0.25, 1.2, 0.55, 0.5);
    fb.pop();
    return (n) => y(n) + Y - Q; // absolute height of the ways at n
  };

  // hull on the stocks with keel blocks, shores and staging
  const onStocks = (fr, Y, sc, yWays, n0, n1, name, B, H, scaffold = true) => {
    const nc = (n0 + n1) / 2, [x, z] = W(fr, sc, nc);
    const slope = Math.atan2(yWays(n1) - yWays(n0), n1 - n0);
    const yc = yWays(nc) + 0.7;
    const m = new THREE.Matrix4().makeRotationY(yawInland(fr)).multiply(new THREE.Matrix4().makeRotationZ(slope)).setPosition(x, yc, z);
    if (name) { winst.place(name, m); }
    enter(fr, Y);
    const yl = (n) => yWays(n) - Y + Q;
    for (let n = n0 + 3; n < n1 - 2; n += 4) {
      for (const sd of [-1, 1]) fb.strut('timber', [sc + sd * (B / 2 + 2.5), yl(n) - 0.2, -n], [sc + sd * B * 0.42, yl(n) + H * 0.45, -n], 0.22);
      if (!scaffold) continue;
      for (const sd of [-1, 1]) fb.box('timberDark', sc + sd * (B / 2 + 1.6) - 0.1, yl(n) - 0.3, -n - 0.1, 0.2, H + 3, 0.2);
    }
    if (scaffold) for (const sd of [-1, 1]) for (const k of [0.45, 0.85]) {
      fb.strut('timber', [sc + sd * (B / 2 + 1.6), yl(n0 + 2) + H * k, -(n0 + 2)], [sc + sd * (B / 2 + 1.6), yl(n1 - 3) + H * k, -(n1 - 3)], 0.9, 0.08);
    }
    fb.pop();
  };

  const sheerlegs = (fr, Y, s, n, h = 30) => {
    enter(fr, Y);
    const top = [s, Q + h, -(n - 11)];
    for (const o of [-5, 5]) fb.strut('steel', [s + o, Q, -n], top, 0.55);
    fb.strut('steel', [s, Q, -(n + 16)], [top[0], top[1] - 0.5, top[2]], 0.45);
    fb.rod('castIron', top, [s, Q + 7, -(n - 11)], 0.05, 3);
    fb.box('castIron', s - 0.5, Q + 5.8, -(n - 11) - 0.4, 1, 1.2, 0.8);
    fb.box('shedTrim', s - 2, Q, -(n + 18), 4, 2.6, 3);
    fb.pop();
  };

  const derrickPole = (fr, Y, s, n, h = 22, slew = 0) => {
    enter(fr, Y);
    fb.cyl('timberDark', s, Q + h / 2, -n, 0.22, 0.32, h, 6);
    const tip = [s + Math.cos(slew) * 14, Q + h * 0.55, -n + Math.sin(slew) * 14];
    fb.strut('timber', [s, Q + 2, -n], tip, 0.28);
    fb.rod('castIron', [s, Q + h, -n], tip, 0.03, 3);
    for (const a of [0.8, 2.9, 4.9]) fb.rod('castIron', [s, Q + h, -n], [s + Math.cos(a) * h * 0.8, Q, -n + Math.sin(a) * h * 0.8], 0.02, 3);
    fb.pop();
  };

  const openShed = (fr, Y, x0, x1, n0, n1, roofKey = 'roofDark') => {
    enter(fr, Y);
    const H = 6.5;
    for (let x = x0; x <= x1 + 0.01; x += 6) for (const n of [n0, n1]) fb.gbox('timberDark', x - 0.2, Q, -n - 0.2, 0.4, H, 0.4);
    for (const n of [n0, n1]) fb.box('timberDark', x0, Q + H - 0.4, -n - 0.2, x1 - x0, 0.4, 0.4);
    gableRoof(fb, x0, Q + H, -n1, x1 - x0, n1 - n0, 2.6, roofKey, 'x', 0.6, 'timberDark');
    fb.gbox('cladBlack', x0, Q, -n1 - 0.2, x1 - x0, 2.4, 0.2);
    fb.pop();
  };

  // ================================================================ Itchen wharves (west bank, slab at Q)
  const wpoly = layout.ITCHEN_WHARVES?.[0];
  if (wpoly) {
    const fr = frame(840, -577, -7, -189);
    const inside = (s, n, m = 4) => { const [x, z] = W(fr, s, n); return pointInPoly(x, z, wpoly) && distToSegs(x, z, wpoly) >= m && bridgeClear(x, z, m); };
    enter(fr, Q);
    // crane road & quay track
    const [qa, qb] = [W(fr, 6, 6.7), W(fr, 150, 6.7)];
    fb.pop();
    const qpath = makePath([qa, qb], 1);
    drawTrack(fb, winst, qpath, { bed: 'setts', groundKey: 'roadSetts' });
    rake(winst, qpath, 60, ['coal_black', 'coal_black', 'coal_grey', 'coal_empty', 'coal_black'], RAIL_TOP.setts);
    enter(fr, Q);
    for (const [s, sl] of [[28, 1.6], [74, 1.2], [118, 2.0]]) if (inside(s, 6.7, 2)) { steamCrane(fb, s, -6.7, sl, { L: 13, luff: 0.8 }); stats.cranes++; }
    for (const s of [50, 96, 140]) if (inside(s, 12, 1)) { hydraulicCrane(fb, s, -12, -Math.PI / 2 + (rnd() - 0.5) * 1.2, { L: 9, hook: rnd() }); stats.cranes++; }
    fb.pop();
    // coal store (open-sided) with heaps under it, timber shed
    if (inside(10, 18) && inside(70, 44)) {
      openShed(fr, Q, 10, 70, 18, 44);
      enter(fr, Q);
      for (let s = 16; s < 66; s += 16) coalHeap(fb, s, -31, 13, 20, 3.2 + rnd(), 0, rnd);
      fb.pop();
    }
    enter(fr, Q);
    if (inside(84, 16) && inside(150, 40)) transitShed(fb, rnd, 84, 150, -16, 24, { roof: 'single', clad: 'cladBlack', roofKey: 'roof', rooflights: false });
    fb.pop();
    // sidings behind with idle coal wagons
    for (const n of [52, 56.5]) {
      const pts = [];
      for (let s = 0; s <= 150; s += 10) if (inside(s, n, 3)) pts.push(W(fr, s, n));
      if (pts.length < 3) continue;
      const p = makePath(pts, 1);
      drawTrack(fb, winst, p, { bed: 'setts', groundKey: 'ash' });
      rake(winst, p, 4 + rnd() * 10, Array.from({ length: Math.floor(p.len / 6.8) - 3 }, () => pick(['coal_black', 'coal_empty', 'coal_empty', 'coal_grey', 'open_grey'])), RAIL_TOP.setts);
    }
    // stock ground: coal heaps and timber stacks, merchant's office, weighbridge
    enter(fr, Q);
    // coal stocked in long ridges, pit-prop and deal stacks in blocks, a few carts and huts
    for (let s = -70; s < 150; s += 18 + rnd() * 16) for (let n = 68 + rnd() * 10; n < 235; n += 16 + rnd() * 18) {
      if (rnd() < 0.2) continue;
      const cs = s + (rnd() - 0.5) * 10, cn = n + (rnd() - 0.5) * 8;
      if (!inside(cs, cn, 12) || (cs > 0 && cs < 44 && cn < 100)) continue;
      const r = rnd();
      if (r < 0.45) coalHeap(fb, cs, -cn, 16 + rnd() * 8, 9 + rnd() * 4, 2.6 + rnd() * 1.6, (rnd() - 0.5) * 0.25, rnd);
      else if (r < 0.8) {
        const k = 2 + Math.floor(rnd() * 3);
        for (let i = 0; i < k; i++) timberStack(fb, rnd, cs + (i - k / 2) * 4.2, -cn, 3.6, 9 + rnd() * 3, 1.4 + rnd() * 1.8, 0);
      } else if (r < 0.88) hut(fb, cs, -cn, 4 + rnd() * 3, 3, rnd() * 0.2, { wall: pick(['timberDark', 'cladBlack']), roof: 'roofDark' });
      else winst.place(pick(['dray', 'handcart']), new THREE.Matrix4().makeRotationY(rnd() * 6.28).setPosition(...(() => { const [x, z] = W(fr, cs, cn); return [x, Q, z]; })()));
    }
    if (inside(10, 72) && inside(34, 90)) office(fb, rnd, 10, 34, -90, -72, { storeys: 2, wall: 'brickYellow', roofKey: 'slateDark' });
    if (inside(40, 80)) { hut(fb, 44, -80, 3.4, 2.8, 0, { wall: 'brickRed', roof: 'slateDark' }); fb.box('castIron', 48, Q - 0.02, -86, 8, 0.06, 3.2); }
    fb.pop();
    // moored alongside: a collier discharging, a sailing barge and lighters
    moor('coaster', fr, 46, -(1.6 + 4.3), 52, 8.6);
    moor('lighterCoal', fr, 46, -(1.6 + 8.6 + 1 + 3.25), 22, 6.5, true);
    moor('sailingBarge', fr, 96, -(1.6 + 3.1), 26, 6.2, true);
    moor('lighter', fr, 128, -(1.6 + 3.25), 22, 6.5);
  }

  // ================================================================ Thornycroft, Woolston (east bank)
  {
    const fr = frame(1146, -650, -0.185, 0.983);
    const slips = [45, 78, 111];
    const Y = platform(fr, 18, 360, -2, 92, slips.map((s) => [s - 8, s + 8, 88]));
    const ways = slips.map((s) => slipway(fr, Y, s, 88));
    onStocks(fr, Y, slips[1], ways[1], 10, 82, 'destroyerHull', 7.4, 5.0);
    onStocks(fr, Y, slips[0], ways[0], 22, 78, 'framedHull', 7.0, 4.6, false);
    enter(fr, Y);
    { const yl = (n) => ways[2](n) - Y + Q; for (let n = 20; n < 80; n += 2.2) fb.box('timber', slips[2] - 0.8, yl(n) + 0.55, -n - 0.3, 1.6, 0.5, 0.6); }
    fb.pop();
    for (const s of [61, 95]) { derrickPole(fr, Y, s, 25, 24, Math.PI / 2 + (rnd() - 0.5)); derrickPole(fr, Y, s, 66, 22, Math.PI / 2 + (rnd() - 0.5)); }
    enter(fr, Y);
    sawtoothShop(fb, 130, 208, -90, -44, { He: 10, span: 13, rise: 2.4, wall: 'brickRed', roofKey: 'roof' });
    transitShed(fb, rnd, 130, 208, -12, 22, { roof: 'single', clad: 'cladGrey', roofKey: 'roofDark', rooflights: false, doorsWater: true });
    office(fb, rnd, 220, 250, -84, -62, { storeys: 2, wall: 'brickRed', roofKey: 'slateDark' });
    chimney(fb, 258, -58, 36, 1.5);
    warehouse(fb, rnd, 268, 336, -86, -58, { storeys: 2, floorH: 4.5, wall: 'brick', roof: 'gables', gableSpan: 17, loading: [1] });
    // yard stock: plates, frames, boilers
    for (let i = 0; i < 8; i++) {
      const s = 222 + i * 14, n = 38 + (i % 2) * 7;
      for (let k = 0; k < 3 + Math.floor(rnd() * 6); k++) fb.box('steelPlate', s + rnd() * 0.3, Q + k * 0.1, -n - 2 + rnd() * 0.3, 9, 0.08, 3.6);
    }
    for (let i = 0; i < 3; i++) { fb.cyl('black', 300 + i * 12, Q + 2.2, -20, 1.8, 1.8, 5, 12, 0, 0, Math.PI / 2); fb.gbox('timberDark', 297 + i * 12, Q, -22, 0.5, 0.6, 4); }
    for (let i = 0; i < 5; i++) timberStack(fb, rnd, 140 + i * 13, -38.5, 10, 2.8, 0.8 + rnd(), 0);
    // fitting-out jetty on piles
    const j0 = 215, j1 = 352;
    fb.box('timber', j0, Q - 0.35, 2, j1 - j0, 0.35, 12);
    for (let s = j0 + 1; s < j1; s += 4) for (const n of [-2.5, -8, -13.5]) fb.box('fender', s, Q - Y - 2.5, -n - 0.18, 0.36, Y + 2.2, 0.36);
    fb.box('timberDark', j0, Q + 0.0, 13.7, j1 - j0, 0.3, 0.3);
    steamCrane(fb, 240, 7, 1.3, { L: 13, luff: 0.85 }); stats.cranes++;
    fb.pop();
    sheerlegs(fr, Y, 322, -1, 32);
    moor('destroyer', fr, 283, -(14.5 + 3.9), 72, 7.6, true);
    moor('lighter', fr, 232, -(14.5 + 7.6 + 1.2 + 3.3), 22, 6.5);
    moor('steamLighter', fr, 150, -(3 + 3.2), 24, 6);
  }

  // ================================================================ Day, Summers & Co, Northam Iron Works (west bank)
  {
    const fr = frame(664, -1150, 0.234, -0.974);
    const slips = [58, 92];
    const Y = platform(fr, 8, 300, -2, 72, slips.map((s) => [s - 8, s + 8, 68]));
    const ways = slips.map((s) => slipway(fr, Y, s, 68));
    onStocks(fr, Y, slips[0], ways[0], 8, 62, 'coasterHull', 8.6, 4.6);
    enter(fr, Y);
    { const yl = (n) => ways[1](n) - Y + Q; for (let n = 14; n < 62; n += 2.2) fb.box('timber', slips[1] - 0.8, yl(n) + 0.55, -n - 0.3, 1.6, 0.5, 0.6); }
    sawtoothShop(fb, 118, 190, -66, -24, { He: 10, span: 12, rise: 2.2, wall: 'brick', roofKey: 'roofRed' });
    warehouse(fb, rnd, 202, 262, -62, -28, { storeys: 1, floorH: 8, wall: 'brickRed', roof: 'gables', gableSpan: 15, loading: [1], bay: 6 });
    office(fb, rnd, 10, 34, -66, -48, { storeys: 2, wall: 'brickYellow', roofKey: 'slateDark' });
    chimney(fb, 196, -46, 38, 1.6);
    for (let i = 0; i < 4; i++) { fb.cyl('black', 214 + i * 11, Q + 2.0, -16, 1.7, 1.7, 5.5, 12, 0, 0, Math.PI / 2); fb.gbox('timberDark', 211 + i * 11, Q, -18, 0.5, 0.6, 4); }
    for (let i = 0; i < 4; i++) timberStack(fb, rnd, 124 + i * 13, -14, 10, 2.6, 0.8 + rnd(), 0);
    steamCrane(fb, 280, -8, 1.0, { L: 12 }); stats.cranes++;
    fb.pop();
    for (const s of [75, 109]) derrickPole(fr, Y, s, 30, 22, Math.PI / 2);
    sheerlegs(fr, Y, 150, 2, 30);
    moor('steamYacht', fr, 205, -(3 + 3.1), 40, 6.2, true);
    moor('tugHulk', fr, 250, -(3 + 3.1 + 6.2 + 1.2 + 3.2), 30, 6.4);
  }

  // ================================================================ craft along both banks & moored hulks
  {
    // hulks and colliers at mid-river moorings, barges in trots off the banks
    const spots = [
      ['hulk', 905, -1040, 1.35], ['hulk', 960, -1300, 1.2], ['coaster', 1010, -1450, 1.1],
      ['hulk', 1000, -480, 1.62], ['coaster', 980, -300, 1.6], ['sailingBarge', 1060, -560, 1.5],
      ['lighter', 1068, -590, 1.52], ['sailingBarge', 780, -1120, 1.3], ['lighterSheeted', 800, -1180, 1.3],
      ['steamLighter', 1100, -1050, 1.2], ['hulk', 1050, -1600, 0.9], ['sailingBarge', 1120, -1500, 1.0],
      ['lighter', 900, -950, 1.4], ['lighterCoal', 912, -940, 1.4],
    ];
    const dims = { hulk: [46, 11], coaster: [52, 8.6], sailingBarge: [26, 6.2], lighter: [22, 6.5], lighterSheeted: [22, 6.5], lighterCoal: [22, 6.5], steamLighter: [24, 6] };
    for (const [name, x, z, yaw] of spots) {
      const [L, B] = dims[name];
      const y = yaw + (rnd() - 0.5) * 0.15;
      if (!inWater(x, z, y, L, B, 4)) continue;
      at(name, x, 0, z, y);
      stats.boats++;
    }
  }

  fb.pop();
}

function defineCraft(inst) {
  if (inst.has('coaster')) return;
  // steam collier/coaster, engines aft: origin at waterline, +x bow
  inst.define('coaster', (b) => {
    const L = 52, B = 8.6;
    b.add('hullBlack', hullGeo(L, B, 4.6, 0.25), M4(0, -2.8, 0));
    b.box('hullRed', -L / 2 + 1, -0.6, -B / 2 + 0.05, L - 2, 0.12, B - 0.1);
    b.box('timber', -L / 2 + 2, 1.78, -B / 2 + 0.6, L - 6, 0.06, B - 1.2);
    b.box('hullBlack', 15, 1.8, -B * 0.32, 9, 1.8, B * 0.64);
    b.box('hullBlack', -L / 2 + 1.2, 1.8, -B * 0.42, 9, 1.6, B * 0.84);
    b.box('white', -20, 3.4, -2.4, 7, 2.4, 4.8);
    b.box('white', -17.5, 5.8, -1.6, 3, 1.8, 3.2);
    b.box('roof', -18, 7.6, -2.0, 4, 0.12, 4);
    b.cyl('black', -21, 8.2, 0, 0.85, 0.9, 6, 10);
    b.cyl('signalRed', -21, 9.8, 0, 0.87, 0.87, 0.7, 10);
    for (const x of [-9, 1, 9]) b.box('tarp', x - 2.5, 1.8, -2, 5, 0.6, 4);
    b.cyl('timberDark', 12, 9.5, 0, 0.14, 0.2, 15, 5);
    b.cyl('timberDark', -8, 8, 0, 0.12, 0.18, 12, 5);
    b.strut('timberDark', [12, 3, 0], [4, 9, 0], 0.16);
    b.strut('timberDark', [-8, 3, 0], [-1, 8, 0], 0.16);
    b.rod('castIron', [12, 17, 0], [L / 2, 2, 0], 0.03, 3);
    b.rod('castIron', [12, 17, 0], [-8, 14, 0], 0.03, 3);
  });
  inst.define('coasterHull', (b) => {
    b.add('redOxide', hullGeo(52, 8.6, 4.6, 0.25), M4(0, 0, 0));
    for (let x = -22; x <= 22; x += 2.2) b.box('redOxide', x, 4.6, -4.1, 0.2, 1.4, 0.2), b.box('redOxide', x, 4.6, 3.9, 0.2, 1.4, 0.2);
  });
  // old wooden hulk used for storage: black hull, housed-over deck, stumps of masts
  inst.define('hulk', (b) => {
    const L = 46, B = 11;
    b.add('hullBlack', hullGeo(L, B, 6.5, 0.35), M4(0, -3.6, 0));
    b.box('timberDark', -L / 2 + 2, 2.9, -B / 2 + 0.6, L - 5, 0.06, B - 1.2);
    b.box('timberDark', -12, 2.9, -3.5, 20, 2.6, 7);
    gableRoof(b, -12, 5.5, -3.5, 20, 7, 1.6, 'roof', 'x', 0.3, 'timberDark');
    for (const x of [12, -16]) b.cyl('timberDark', x, 6, 0, 0.35, 0.45, 6.5, 6);
    b.strut('timberDark', [L / 2 - 2, 3, 0], [L / 2 + 8, 6, 0], 0.4);
  });
  inst.define('tugHulk', (b) => {
    b.add('hullBlack', hullGeo(30, 6.4, 3.4, 0.3), M4(0, -1.8, 0));
    b.box('timberDark', -6, 1.6, -2, 10, 2, 4);
    b.cyl('funnelBuff', 0, 5, 0, 0.6, 0.6, 3.2, 8);
  });
  // torpedo-boat destroyer fitting out (grey, three funnels)
  inst.define('destroyer', (b) => {
    const L = 72, B = 7.6;
    b.add('warGrey', hullGeo(L, B, 5.0, 0.05), M4(0, -2.4, 0));
    b.box('steel', -L / 2 + 3, 2.58, -B * 0.4, L - 10, 0.05, B * 0.8);
    b.box('warGrey', 18, 2.6, -2.4, 14, 1.4, 4.8);
    b.box('warGrey', 13, 2.6, -1.4, 4, 3.8, 2.8);
    b.box('white', 12.8, 6.4, -1.8, 4.4, 0.1, 3.6);
    for (const x of [7, -1, -9]) b.cyl('warGrey', x, 5.2, 0, 0.8, 0.8, 5.2, 10);
    b.cyl('steel', 11, 9, 0, 0.1, 0.14, 12, 5);
    b.cyl('steel', -20, 7, 0, 0.08, 0.12, 9, 5);
    b.box('steel', 24, 4, -0.4, 1.8, 0.8, 0.8);
    b.box('steel', -26, 2.6, -0.4, 1.8, 0.8, 0.8);
    b.rod('castIron', [11, 15, 0], [L / 2, 3, 0], 0.02, 3);
    b.rod('castIron', [11, 15, 0], [-20, 11.5, 0], 0.02, 3);
  });
  inst.define('destroyerHull', (b) => {
    b.add('redOxide', hullGeo(72, 7.4, 5.0, 0.05), M4(0, 0, 0));
    for (let x = -30; x <= 30; x += 2) b.box('redOxide', x, 5.0, -0.1, 0.18, 0.18, 0.2);
    b.box('redOxide', -30, 4.9, -3.1, 60, 0.14, 0.14);
    b.box('redOxide', -30, 4.9, 2.95, 60, 0.14, 0.14);
  });
  // keel and frames only (early stage)
  inst.define('framedHull', (b) => {
    b.box('redOxide', -28, 0, -0.3, 56, 0.6, 0.6);
    for (let x = -24; x <= 24; x += 1.8) {
      const w = 3.4 * Math.sqrt(Math.max(0.05, 1 - (x / 28) ** 2));
      for (const sd of [-1, 1]) b.strut('redOxide', [x, 0.3, 0], [x, 4.4, sd * w], 0.16);
    }
    b.box('redOxide', -24, 4.3, -3.4, 48, 0.15, 0.15);
    b.box('redOxide', -24, 4.3, 3.25, 48, 0.15, 0.15);
  });
  inst.define('steamYacht', (b) => {
    const L = 40, B = 6.2;
    b.add('white', hullGeo(L, B, 4.0, 0.1), M4(0, -2.2, 0));
    b.box('hullBlack', -L / 2 + 0.5, -0.4, -B / 2 + 0.05, L - 1, 0.25, B - 0.1);
    b.box('timber', -L / 2 + 2, 1.78, -B * 0.4, L - 6, 0.05, B * 0.8);
    b.box('timber', -8, 1.8, -1.8, 14, 2.1, 3.6);
    b.box('white', 2, 3.9, -1.9, 4, 1.4, 3.8);
    b.cyl('funnelBuff', -2, 5.5, 0, 0.55, 0.6, 3.6, 10, 0, 0, 0.12);
    for (const x of [9, -12]) b.cyl('timber', x, 9, 0, 0.1, 0.14, 14, 5);
  });
}
