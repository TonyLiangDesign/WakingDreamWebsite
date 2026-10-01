import { frustum, extrudeProfile, roundArch } from './kit.js';
import { groundRange, chimney, windowRow } from './common.js';

// Generic pile pier. Kit frame: origin at the root on the shoreline, +x toward the head,
// deck centred on z = 0. Piles run down to the terrain (sea bed) and stand in the water.
export function pierDeck(ctx, k, o) {
  const { x0 = 0, x1, width, deckY, step = 9, piles, pileKey = 'ironWet', pileR = 0.18, deckKey = 'timber', girderKey = 'castIron', railing = true, lampStep = 0, bracing = true } = o;
  const L = x1 - x0;
  k.box(deckKey, x0, deckY - 0.3, -width / 2, L, 0.3, width);
  for (const z of [-width / 2 + 0.3, 0, width / 2 - 0.3]) k.box(girderKey, x0, deckY - 1.1, z - 0.15, L, 0.8, 0.3);
  k.box('timberDark', x0, deckY - 0.45, -width / 2 - 0.15, L, 0.4, 0.15); // fascia
  k.box('timberDark', x0, deckY - 0.45, width / 2, L, 0.4, 0.15);
  const n = Math.max(1, Math.round(L / step));
  for (let i = 0; i <= n; i++) {
    const x = x0 + (L * i) / n;
    let bedMin = Infinity;
    const tops = [];
    for (const z of piles) {
      const w = k.toWorld(x, 0, z);
      const bed = Math.min(ctx.terrain.heightAt(w[0], w[2]), deckY - 1.5);
      bedMin = Math.min(bedMin, bed);
      const yb = bed - 1.5;
      if (yb > deckY - 1.2) continue;
      k.cyl(pileKey, x, (yb + deckY - 1.1) / 2, z, pileR, pileR * 1.15, deckY - 1.1 - yb, 6);
      tops.push([z, bed]);
    }
    k.box(girderKey, x - 0.2, deckY - 1.5, -width / 2, 0.4, 0.45, width); // cross-head
    if (bracing && tops.length >= 2 && bedMin < deckY - 3) {
      const yLo = Math.max(bedMin + 0.3, -1.5), yHi = deckY - 1.4;
      for (let j = 0; j + 1 < tops.length; j++) {
        const za = tops[j][0], zb = tops[j + 1][0];
        k.strut(girderKey, [x, yLo, za], [x, yHi, zb], 0.09);
        k.strut(girderKey, [x, yHi, za], [x, yLo, zb], 0.09);
      }
      if (yLo < 1.2) k.box(girderKey, x - 0.06, 1.2, piles[0], 0.12, 0.14, piles[piles.length - 1] - piles[0]);
    }
  }
  if (railing) for (const s of [-1, 1]) {
    const z = s * (width / 2 - 0.1);
    k.box('castIron', x0, deckY + 1.0, z - 0.05, L, 0.08, 0.1);
    k.box('castIron', x0, deckY + 0.45, z - 0.03, L, 0.05, 0.06);
    const np = Math.round(L / 2.5);
    for (let i = 0; i <= np; i++) k.box('castIron', x0 + (L * i) / np - 0.04, deckY, z - 0.04, 0.08, 1.05, 0.08);
  }
  if (lampStep) for (let x = x0 + lampStep / 2; x < x1; x += lampStep) for (const s of [-1, 1]) lamp(k, x, deckY, s * (width / 2 - 0.3));
}

export function lamp(k, x, y, z, h = 3.6) {
  k.cyl('lamp', x, y + h / 2, z, 0.05, 0.09, h, 6);
  k.cbox('lampGlass', x, y + h + 0.25, z, 0.32, 0.45, 0.32);
  k.fr('lamp', x, y + h + 0.47, z, 0.42, 0.42, 0.25);
}

// ------------------------------------------------------------------ Royal Pier (1892)
export function royalPier(ctx, kit) {
  const L = ctx.layout.LANDMARKS;
  const [ax, az] = L.royalPierRoot, [bx, bz] = L.royalPierHead;
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = Math.atan2(-(bz - az), bx - ax);
  const k = kit.sub(ax, 0, az, yaw);
  const D = 5.6, W = 11;
  // stone abutment on the shore
  k.box('coping', -22, -4, -W / 2 - 1, 24, D - 0.3 + 4, W + 2);
  k.box('setts', -22, D - 0.3, -W / 2 - 1, 24, 0.05, W + 2);
  pierDeck(ctx, k, { x0: 2, x1: len - 18, width: W, deckY: D, step: 9, piles: [-4.5, -1.5, 1.5, 4.5], lampStep: 30 });
  // boat-train line down the pier
  for (const r of [-0.72, 0.72]) k.box('rail', -60, D + 0.02, -2.2 + r - 0.04, len + 40, 0.14, 0.08);
  // pier head: broad T with pavilion and railway station
  const hx0 = len - 20, hx1 = len + 18, hz0 = -48, hz1 = 34;
  pierDeck(ctx, k.sub(0, 0, (hz0 + hz1) / 2), { x0: hx0, x1: hx1, width: hz1 - hz0, deckY: D, step: 8, piles: [-38, -30, -22, -14, -6, 2, 10, 18, 26, 36].map((z) => z + 3.0).filter((z) => Math.abs(z) < (hz1 - hz0) / 2), bracing: false, lampStep: 0, railing: false });
  const hk = k;
  for (const z of [hz0 + 0.1, hz1 - 0.1]) {
    hk.box('castIron', hx0, D + 1.0, z - 0.05, hx1 - hx0, 0.08, 0.1);
    for (let x = hx0; x <= hx1; x += 2.5) hk.box('castIron', x, D, z - 0.04, 0.08, 1.05, 0.08);
  }
  hk.box('castIron', hx1 - 0.1, D + 1.0, hz0, 0.1, 0.08, hz1 - hz0);
  // pavilion (1894): white timber, hipped roof, corner turrets & central lantern
  const pv = hk.sub(len + 2, D, -16, 0);
  pv.box('white', -9, 0, -15, 18, 6.0, 30);
  pv.box('timberDark', -9.3, 5.8, -15.3, 18.6, 0.5, 30.6);
  for (const f of pv.faces(0, 0, 18, 30)) windowRow(f.k, { x0: -f.len / 2 + 2, x1: f.len / 2 - 2, n: Math.round(f.len / 2.6), y: 1.0, ww: 1.5, wh: 3.4, arch: 'round', depth: 0.1 });
  pv.fr('roof', 0, 6.3, 0, 20, 32, 4.5, 6, 18);
  pv.box('white', -2.5, 10.8, -8, 5, 2.2, 16);
  pv.box('glass', -2.6, 11.2, -7.8, 5.2, 1.2, 15.6);
  pv.fr('roof', 0, 13.0, 0, 6.2, 17, 1.6, 0.5, 11);
  for (const [cx, cz] of [[-9, -15], [9, -15], [-9, 15], [9, 15]]) {
    pv.cyl('white', cx, 4.5, cz, 1.7, 1.7, 9, 10);
    pv.cyl('roof', cx, 9.9, cz, 0.0, 2.0, 1.9, 10);
    pv.cyl('castIron', cx, 11.6, cz, 0.04, 0.04, 1.6, 4);
  }
  // verandah canopy around the pavilion
  pv.box('roof', -11.5, 3.6, -17.5, 23, 0.2, 35);
  for (let x = -11; x <= 11; x += 5.5) for (const z of [-17.2, 17.2]) pv.cyl('castIron', x, 1.8, z, 0.08, 0.1, 3.6, 6);
  // pier station building & canopy on the east arm
  const st = hk.sub(len - 6, D, 18, 0);
  st.box('shedClad', -12, 0, -4, 24, 4.2, 8);
  st.fr('slate', 0, 4.2, 0, 25, 9, 2.2, 25, 0);
  st.box('roof', -14, 3.4, -9, 28, 0.25, 5);
  windowRow(st.sub(0, 0, -4, 0), { x0: -11, x1: 11, n: 6, y: 1.0, ww: 1.2, wh: 1.8, depth: 0.1 });
  for (let x = -13; x <= 13; x += 6.5) st.cyl('castIron', x, 1.7, -8.6, 0.08, 0.1, 3.4, 6);
  // low-water landing stages (pontoons) with brows
  for (const [pz, sgn] of [[hz0 - 5, 1], [hz1 + 5, -1]]) {
    hk.box('timberDark', hx0 + 2, 0.0, pz - 3, 30, 1.0, 6);
    hk.box('timber', hx0 + 2, 1.0, pz - 3, 30, 0.12, 6);
    const brow = Math.hypot(14, D - 1.1);
    const ang = Math.atan2(D - 1.1, 14) * sgn;
    hk.cbox('timber', hx0 + 17, (D + 1.1) / 2, pz + sgn * 3 + sgn * 7, 2.4, 0.2, brow, ang, 0, 0);
    for (const px of [hx0 + 4, hx0 + 30]) hk.cyl('ironWet', px, -1, pz + sgn * -3.4, 0.25, 0.25, 7, 6);
  }
  // toll houses & gates at the root
  for (const s of [-1, 1]) {
    const th = k.sub(-12, D - 0.3, s * (W / 2 + 3.5), 0);
    th.box('render', -3, 0, -2.5, 6, 3.6, 5);
    th.box('stoneDark', -3.2, 3.5, -2.7, 6.4, 0.35, 5.4);
    th.fr('slate', 0, 3.85, 0, 6.6, 5.6, 2.6, 0.4, 0.4);
    for (const f of th.faces(0, 0, 6, 5)) windowRow(f.k, { x0: -2, x1: 2, n: 1, y: 1.0, ww: 1.2, wh: 1.8, arch: 'round', dress: 'stoneDark', depth: 0.12 });
    th.cyl('castIron', 0, 7.0, 0, 0.3, 0.55, 1.0, 8);
    k.box('castIron', -12.4, D - 0.3, s * (W / 2 - 0.2) - 0.2, 0.6, 4.2, 0.6);
  }
  k.box('castIron', -12.3, D + 3.6, -W / 2, 0.2, 0.2, W);
  for (let z = -W / 2 + 0.3; z < W / 2; z += 0.35) k.box('castIron', -12.25, D - 0.3, z, 0.06, 3.9, 0.06);
  return [{ name: 'Royal Pier', pts: [k.toWorld(-22, 0, -W), k.toWorld(len + 18, 0, -W), k.toWorld(len + 18, 0, W), k.toWorld(-22, 0, W)] }];
}

// ------------------------------------------------------------------ Town Quay
export function townQuay(ctx, kit) {
  const L = ctx.layout.LANDMARKS;
  const [ax, az] = L.royalPierRoot, [bx, bz] = L.townQuay;
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = Math.atan2(-(bz - az), bx - ax);
  // local +x along the shore toward the docks, +z toward the water (south)
  const k = kit.sub(ax, 0, az, yaw);
  const s0 = k.toWorld(0, 0, 10);
  const sea = ctx.terrain.sample(s0[0], s0[2]).s < 0 ? 1 : -1;
  const q = sea > 0 ? k : kit.sub(ax, 0, az, yaw + Math.PI);
  const D = 4.9, X0 = 18, X1 = len + 20, Z0 = -6, Z1 = 26;
  pierDeck(ctx, q.sub(0, 0, (Z0 + Z1) / 2), { x0: X0, x1: X1, width: Z1 - Z0, deckY: D, step: 6, piles: [-15, -9, -3, 3, 9, 15], pileKey: 'timberWet', pileR: 0.22, deckKey: 'timber', girderKey: 'timberDark', bracing: true, railing: false });
  // fender piles along the face
  for (let x = X0; x <= X1; x += 3) q.box('fender', x, -2.5, Z1 - 0.1, 0.35, D + 3.2, 0.35);
  q.box('fender', X0, D - 0.9, Z1 + 0.1, X1 - X0, 0.35, 0.3);
  // transit sheds (timber-framed, corrugated iron) and the harbour office
  for (const [sx, sl] of [[X0 + 8, 52], [X0 + 70, 46]]) {
    if (sx + sl > X1 - 4) continue;
    q.box('shedClad', sx, D, Z0 + 1, sl, 5.2, 12);
    q.fr('roof', sx + sl / 2, D + 5.2, Z0 + 7, sl + 0.6, 12.8, 2.6, sl + 0.6, 0);
    for (let x = sx + 4; x < sx + sl - 2; x += 8) q.box('timberDark', x, D, Z0 + 12.95, 4.0, 3.8, 0.12);
  }
  // quay rails and wagons
  for (const r of [-0.72, 0.72]) q.box('rail', X0, D + 0.02, 18 + r - 0.04, X1 - X0, 0.14, 0.08);
  for (const x of [X0 + 20, X0 + 28.5, X0 + 60]) {
    q.box('wagonRed', x, D + 0.9, 16.6, 7.5, 1.4, 2.8);
    q.box('black', x + 0.3, D + 0.4, 16.8, 6.9, 0.5, 2.4);
  }
  // steam crane on the face
  const cr = q.sub(X0 + 110 < X1 ? X0 + 110 : X1 - 25, D, 21, 0);
  cr.box('black', -2.5, 0, -2, 5, 1.0, 4);
  cr.box('steel', -2.0, 1.0, -1.6, 4.2, 2.8, 3.2);
  cr.fr('roof', 0.1, 3.8, 0, 4.6, 3.6, 0.8, 4.6, 0);
  cr.cyl('black', -1.4, 5.0, 0, 0.22, 0.22, 2.4, 8);
  cr.strut('steel', [1.8, 1.5, -0.8], [7.5, 11.5, -0.2], 0.28);
  cr.strut('steel', [1.8, 1.5, 0.8], [7.5, 11.5, 0.2], 0.28);
  cr.strut('steel', [-1.8, 3.8, 0], [7.5, 11.6, 0], 0.12);
  cr.rod('rail', [7.6, 11.4, 0], [7.6, 3.5, 0], 0.03, 4);
  cr.cbox('castIron', 7.6, 3.2, 0, 0.3, 0.6, 0.3);
  // bollards
  for (let x = X0 + 5; x < X1; x += 14) q.cyl('castIron', x, D + 0.4, Z1 - 1.0, 0.25, 0.3, 0.8, 8);
  return [{ name: 'Town Quay', pts: [q.toWorld(X0, 0, Z0), q.toWorld(X1, 0, Z0), q.toWorld(X1, 0, Z1), q.toWorld(X0, 0, Z1)] }];
}

// ------------------------------------------------------------------ Hythe Pier (1881)
export function hythePier(ctx, kit) {
  const L = ctx.layout.LANDMARKS;
  const [ax, az] = L.hythePierRoot, [bx, bz] = L.hythePierHead;
  const len = Math.hypot(bx - ax, bz - az);
  const yaw = Math.atan2(-(bz - az), bx - ax);
  const k = kit.sub(ax, 0, az, yaw);
  const D = 5.2, W = 3.6;
  // shore abutment: a walled ramp rising from the hard to deck level
  const RL = 26;
  const gR = Math.max(ctx.terrain.heightAt(...(() => { const p = k.toWorld(-RL, 0, 0); return [p[0], p[2]]; })()), 0.3);
  const rAng = Math.atan2(D - 0.3 - gR, RL);
  const rLen = Math.hypot(RL, D - 0.3 - gR);
  k.cbox('timber', -RL / 2 + 1, (D - 0.3 + gR) / 2, 0, rLen, 0.3, W + 1.0, 0, 0, rAng);
  for (const s of [-1, 1]) {
    k.cbox('coping', -RL / 2 + 1, (D - 0.3 + gR) / 2 - 1.6, s * (W / 2 + 0.3), rLen, 3.6, 0.7, 0, 0, rAng);
    k.cbox('castIron', -RL / 2 + 1, (D - 0.3 + gR) / 2 + 1.0, s * (W / 2 + 0.3), rLen, 0.08, 0.1, 0, 0, rAng);
  }
  k.box('coping', -2, Math.min(gR, 0) - 3, -W / 2 - 0.6, 4, D - 0.3 - Math.min(gR, 0) + 3, W + 1.2);
  const g0 = gR;
  pierDeck(ctx, k, { x0: 1, x1: len - 10, width: W, deckY: D, step: 10, piles: [-1.5, 1.5], lampStep: 60, pileR: 0.16 });
  // entrance lodge with ticket window
  const lg = k.sub(-RL - 4, g0, W / 2 + 4.5, 0);
  lg.box('brick', -4, -1, -2.5, 8, 4.2, 5);
  lg.fr('slate', 0, 3.2, 0, 8.8, 5.8, 2.4, 8.8, 0);
  chimney(lg, 'brick', 2.5, 3.2, 0, 0.8, 0.6, 2.8, 1, 'brickDark');
  windowRow(lg.sub(0, 0, -2.5, 0), { x0: -3, x1: 3, n: 2, y: 0.5, ww: 1.1, wh: 1.5, dress: 'stone', depth: 0.1 });
  // pier head: wider deck, waiting shelter, landing stages at two levels
  const h = k.sub(len, 0, 0, 0);
  pierDeck(ctx, h, { x0: -12, x1: 12, width: 14, deckY: D, step: 6, piles: [-6, -2, 2, 6], lampStep: 0 });
  h.box('white', -5, D, -3, 10, 3.2, 6);
  h.fr('slate', 0, D + 3.2, 0, 11, 7, 1.8, 11, 0);
  h.box('roof', -7.5, D + 2.8, -5.5, 15, 0.18, 2.5);
  for (const f of h.faces(0, 0, 10, 6, D)) windowRow(f.k, { x0: -f.len / 2 + 1, x1: f.len / 2 - 1, n: Math.round(f.len / 2.5), y: 1.0, ww: 1.1, wh: 1.4, depth: 0.08 });
  lamp(h, 10, D, -6.5); lamp(h, 10, D, 6.5);
  // lower landing stage with steps
  h.box('timber', 12, 2.3, -7, 5, 0.25, 14);
  for (const z of [-6.5, 0, 6.5]) h.cyl('timberWet', 16.6, -1, z, 0.2, 0.2, 7, 6);
  for (let i = 0; i < 6; i++) h.box('timber', 11.2 - i * 0.55, 2.55 + i * 0.45, 5.0, 0.55, 0.12, 1.6);
  return [{ name: 'Hythe Pier', pts: [k.toWorld(-14, 0, -8), k.toWorld(len + 18, 0, -8), k.toWorld(len + 18, 0, 8), k.toWorld(-14, 0, 8)] }];
}
