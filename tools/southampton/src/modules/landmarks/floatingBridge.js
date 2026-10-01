import * as THREE from 'three';
import { Kit } from './kit.js';
import { chimney, windowRow, groundAt } from './common.js';

// Itchen Floating Bridge (Northam/Southampton – Woolston chain ferry, 1836–1977).
// Stone hards with toll houses and approach roads on both banks; one steam floating
// bridge riding its two chains, pinned mid-river for film plates.

// Crossing geometry shared by hards, chains and vessel. The Southampton landing sits
// just north of the Itchen wharf slab (its NE corner is the layout point).
export function crossing(ctx) {
  const L = ctx.layout.LANDMARKS;
  const W0 = L.floatingBridgeW, E = L.floatingBridgeE;
  let dx = E[0] - W0[0], dz = E[1] - W0[1];
  const l0 = Math.hypot(dx, dz);
  const nx = dz / l0, nz = -dx / l0; // left of W→E = north-ish
  const W = [W0[0] + nx * 10, W0[1] + nz * 10];
  const Ep = [E[0] + nx * 4, E[1] + nz * 4];
  dx = Ep[0] - W[0]; dz = Ep[1] - W[1];
  const span = Math.hypot(dx, dz);
  return { W, E: Ep, span, ux: dx / span, uz: dz / span, yaw: Math.atan2(-dz, dx) };
}

const HARD_OUT = 30; // hard runs this far into the river from the landing point

export function floatingBridgeHards(ctx, kit) {
  const C = crossing(ctx);
  const out = [];
  for (const [p, dir, name] of [[C.W, 1, 'Floating bridge hard (Southampton)'], [C.E, -1, 'Floating bridge hard (Woolston)']]) {
    // local +x toward the river, z across
    const k = kit.sub(p[0], 0, p[1], dir > 0 ? C.yaw : C.yaw + Math.PI);
    const gnd = (x, z = 0) => { const q = k.toWorld(x, 0, z); return groundAt(ctx, q[0], q[2]); };
    const x0 = -40, x1 = HARD_OUT, yBot = -2.2;
    const yTop = Math.max(gnd(x0), 2.0) + 0.15;
    const run = x1 - x0, drop = yTop - yBot;
    const ang = Math.atan2(drop, run), len = Math.hypot(run, drop);
    const HW = 16; // hard width
    k.cbox('hardStone', (x0 + x1) / 2, (yTop + yBot) / 2 - 0.35, 0, len, 0.7, HW, 0, 0, -ang);
    k.cbox('quayWall', (x0 + x1) / 2 + 4, (yTop + yBot) / 2 - 5.5, 0, len - 8, 10, HW + 0.2, 0, 0, -ang);
    const xw = Math.min(x1, x0 + ((yTop - 0.7) / drop) * run); // wing walls stop where they meet the water
    const wl = Math.hypot(xw - x0, ((xw - x0) / run) * drop), wy = yTop - ((xw - x0) / run) * drop / 2;
    for (const s of [-1, 1]) {
      k.cbox('stoneDark', (x0 + xw) / 2, wy + 0.25, s * (HW / 2 + 0.6), wl, 1.4, 1.2, 0, 0, -ang);
      k.cbox('quayWall', (x0 + x1) / 2 + 4, (yTop + yBot) / 2 - 5.5, s * (HW / 2 + 0.6), len - 8, 10, 1.2, 0, 0, -ang);
      // timber dolphins / guide piles at the foot where the brow lands
      for (const xx of [x1 - 2, x1 - 9]) k.cyl('timberWet', xx, -0.5, s * (HW / 2 + 1.8), 0.35, 0.35, 9, 8);
    }
    // chain anchor posts and chains running down the hard
    const yy = (x) => yTop - ((x - x0) / run) * drop;
    for (const s of [-1, 1]) {
      k.box('hullBlack', x0 - 4, yTop - 0.3, s * 4.5 - 0.7, 1.6, 1.8, 1.4);
      k.strut('hullBlack', [x0 - 2.5, yTop + 0.9, s * 4.5], [x1, yy(x1) + 0.12, s * 4.5], 0.28, 0.28);
    }
    // approach road following the ground inland
    const RL = 130, STEP = 10;
    for (let x = x0 - 2; x > x0 - RL; x -= STEP) {
      const xa = x, xb = x - STEP;
      const ya = x === x0 - 2 ? yTop : gnd(xa) + 0.15, yb = gnd(xb) + 0.15;
      const a2 = Math.atan2(yb - ya, xb - xa), L2 = Math.hypot(xb - xa, yb - ya);
      k.cbox('setts', (xa + xb) / 2, (ya + yb) / 2 - 0.4, 0, L2 + 0.1, 0.8, 11, 0, 0, a2);
      k.cbox('stoneDark', (xa + xb) / 2, (ya + yb) / 2 - 0.3, -6.2, L2 + 0.1, 0.8, 1.6, 0, 0, a2); // kerbed footways
      k.cbox('stoneDark', (xa + xb) / 2, (ya + yb) / 2 - 0.3, 6.2, L2 + 0.1, 0.8, 1.6, 0, 0, a2);
    }
    // toll house (rendered, slate roof, bay window) and waiting shed, facing the road
    const gt = gnd(x0 - 14, 16);
    const th = k.sub(x0 - 14, Math.max(gt, yTop - 0.4), 15, 0);
    th.box('stoneDark', -6, -3, -4, 12, 3.2, 8);
    th.box('white', -6, 0, -4, 12, 5.0, 8);
    th.box('stoneDark', -6.2, 4.8, -4.2, 12.4, 0.4, 8.4);
    th.fr('slate', 0, 5.2, 0, 13, 9, 3.4, 5, 0);
    chimney(th, 'brick', 3.5, 6.0, 0, 0.9, 0.9, 3.0, 2, 'brickDark');
    th.box('white', -2, 0, -5.4, 4, 3.4, 1.4); // toll booth window bay toward the road
    th.box('glass', -1.6, 1.3, -5.45, 3.2, 1.6, 0.1);
    th.fr('slate', 0, 3.4, -4.7, 4.4, 1.6, 0.9, 4.4, 0);
    for (const f of th.faces(0, 0, 12, 8)) windowRow(f.k, { x0: -f.len / 2 + 1.2, x1: f.len / 2 - 1.2, n: Math.round(f.len / 3.2), y: 1.0, ww: 1.0, wh: 1.8, dress: 'stoneDark', depth: 0.1 });
    const gs = gnd(x0 - 16, -15);
    const ws = k.sub(x0 - 16, Math.max(gs, yTop - 0.4), -15, 0);
    ws.box('white', -8, 0, -1.5, 16, 3.0, 3.0);
    ws.box('roof', -9, 3.0, -2.5, 18, 0.25, 5.0);
    for (const x of [-8, -2.7, 2.7, 8]) ws.cyl('castIron', x, 1.5, 2.2, 0.08, 0.1, 3.0, 6);
    // toll gates across the head of the hard
    for (const s of [-1, 1]) k.box('castIron', x0 - 1.2, yTop, s * 5.8 - 0.3, 0.6, 2.6, 0.6);
    k.box('castIron', x0 - 1.1, yTop + 1.1, -5.5, 0.2, 0.15, 11);
    for (const s of [-1, 1]) { k.cyl('lamp', x0 - 1, yTop + 2.2, s * 7.2, 0.07, 0.1, 4.4, 6); k.cbox('lampGlass', x0 - 1, yTop + 4.6, s * 7.2, 0.4, 0.5, 0.4); }
    out.push({ name, pts: [k.toWorld(x0 - RL, 0, -22), k.toWorld(x1, 0, -22), k.toWorld(x1, 0, 22), k.toWorld(x0 - RL, 0, 22)] });
  }
  // the two chains lying in the river between the hards (they surface where the vessel lifts them)
  const V = vesselDims();
  const mid = C.span / 2;
  const ck = kit.sub(C.W[0], 0, C.W[1], C.yaw);
  for (const s of [-1, 1]) {
    const z = s * 4.5;
    const segs = [[HARD_OUT, mid - V.reach], [mid + V.reach, C.span - HARD_OUT]];
    for (const [a, b] of segs) ck.box('hullBlack', a, 0.06, z - 0.3, b - a, 0.14, 0.6);
    // rising to the vessel ends
    ck.strut('hullBlack', [mid - V.reach, 0.1, z], [mid - V.LEN / 2 - 1, V.FB + 0.4, z], 0.3, 0.3);
    ck.strut('hullBlack', [mid + V.LEN / 2 + 1, V.FB + 0.4, z], [mid + V.reach, 0.1, z], 0.3, 0.3);
  }
  return { footprints: out, crossing: C };
}

function vesselDims() {
  const LEN = 32, BEAM = 17, FB = 1.5;
  return { LEN, BEAM, FB, reach: LEN / 2 + 16 };
}

// The vessel, in its own local frame (+x along the crossing, origin at deck centre on the waterline).
export function floatingBridgeVessel(ctx, M) {
  const b = new ctx.Builder(M);
  const k = new Kit(b);
  const { LEN, BEAM, FB } = vesselDims();
  // pontoon hull with raked ends
  k.box('hullBlack', -LEN / 2, -1.3, -BEAM / 2, LEN, 1.3 + FB, BEAM);
  k.box('white', -LEN / 2, FB - 0.25, -BEAM / 2 - 0.02, LEN, 0.25, BEAM + 0.04); // painted sheer strake
  for (const s of [-1, 1]) k.cbox('hullBlack', s * (LEN / 2 + 1.3), 0.4, 0, 3.0, 1.1, BEAM, 0, 0, s * 0.35);
  // pale planked vehicle deck (reads from the air)
  k.box('deckLight', -LEN / 2 - 0.2, FB, -5.2, LEN + 0.4, 0.12, 10.4);
  // passenger saloons along both sides, engine & boiler house raised on the south side
  for (const s of [-1, 1]) {
    const z0 = s > 0 ? BEAM / 2 - 3.2 : -BEAM / 2;
    k.box('white', -LEN / 2 + 2, FB, z0, LEN - 4, 2.8, 3.2);
    k.box('roof', -LEN / 2 + 1.7, FB + 2.8, z0 - 0.3, LEN - 3.4, 0.2, 3.8);
    for (let x = -LEN / 2 + 3.5; x < LEN / 2 - 3; x += 2.2) k.box('glass', x, FB + 1.2, s > 0 ? BEAM / 2 + 0.01 : -BEAM / 2 - 0.08, 1.2, 0.9, 0.07);
    // funnel: tall, black with a buff band, one each side amidships
    const fz = s * (BEAM / 2 - 1.6);
    k.cyl('hullBlack', 0, FB + 2.8 + 5.5, fz, 0.7, 0.75, 11, 14);
    k.cyl('buffPaint', 0, FB + 2.8 + 9.6, fz, 0.72, 0.72, 1.0, 14);
    k.cyl('hullBlack', 0, FB + 2.8 + 11.1, fz, 0.8, 0.72, 0.3, 14);
  }
  // engine house block over the south saloon
  k.box('white', -5, FB + 3.0, BEAM / 2 - 3.4, 10, 2.2, 3.4);
  k.box('roof', -5.3, FB + 5.2, BEAM / 2 - 3.7, 10.6, 0.2, 4.0);
  // overhead navigating bridge spanning the vehicle deck, with wheelhouse
  k.box('white', -1.6, FB + 5.0, -BEAM / 2 + 0.5, 3.2, 1.0, BEAM - 1.0);
  k.box('white', -1.9, FB + 6.0, -2.2, 3.8, 2.2, 4.4);
  k.box('glass', -1.95, FB + 6.9, -2.0, 3.9, 0.9, 4.0);
  k.box('roof', -2.2, FB + 8.2, -2.5, 4.4, 0.2, 5.0);
  for (const z of [-5.3, 5.3]) k.box('castIron', -0.25, FB, z - 0.25, 0.5, 5.0, 0.5);
  // deck edge rails
  for (const z of [-5.2, 5.2]) k.box('castIron', -LEN / 2, FB + 1.0, z - 0.05, LEN, 0.1, 0.1);
  // hinged brows, raised, with gallows frames and lifting chains
  for (const s of [-1, 1]) {
    k.cbox('deckLight', s * (LEN / 2 + 3.4), FB + 1.0, 0, 6.8, 0.35, 10, 0, 0, s * 0.3);
    for (const z of [-5.4, 5.4]) {
      k.box('hullBlack', s * (LEN / 2 - 1) - 0.2, FB, z - 0.2, 0.4, 5.6, 0.4);
      k.rod('hullBlack', [s * (LEN / 2 - 1), FB + 5.4, z], [s * (LEN / 2 + 6.4), FB + 2.9, z], 0.06, 4);
    }
    k.box('hullBlack', s * (LEN / 2 - 1) - 0.2, FB + 5.4, -5.6, 0.4, 0.4, 11.2);
    // chain wheels housings where the chains enter at the ends
    for (const z of [-4.5, 4.5]) k.box('hullBlack', s * (LEN / 2 - 1.5) - 0.8, FB, z - 0.6, 1.6, 1.0, 1.2);
  }
  return b.build({ name: 'floating-bridge' });
}
