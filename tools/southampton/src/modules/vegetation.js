// Scene module "vegetation": woods, copses, hedgerows with hedgerow trees, parkland
// (Southampton Common), garden/street trees, shore scrub and estuary marsh/reed beds,
// for 10 April 1912 (early spring: most broadleaves bare with a bud haze; hawthorn,
// willow and larch in fresh green; pine/holly dark evergreen; blackthorn in blossom).
//
// Detail zones around the port:
//   N  (< ~3.5 km of Ocean Dock, plus Southampton Common): woods are individual instanced
//      crowns (one lumpy dome each, trunks on the wood edges) over the dark copse floor
//      painted by the terrain shader; hedges as rounded extrusions; lobed single trees;
//      everything casts shadows.
//   B  (rest of the 30 m terrain grid): woods as draped canopy sheets with procedural
//      crowns (vegetation/canopy.js), simple hedges to 5 km, low-poly lobed trees.
//   C  (to ~16.5 km, and the Isle of Wight): 90 m canopy sheets only.
// Woodland placement follows terrain.js fieldAt().copse exactly (clustered copses/woods).
import * as G from './vegetation/geom.js';
import { vegMaterial } from './vegetation/material.js';
import { Scatter } from './vegetation/scatter.js';
import { makeGround, fieldAt, FIELD, uhash, toQ, fromQ, qWorld, fieldCell } from './vegetation/ground.js';
import { buildMarsh } from './vegetation/marsh.js';
import { buildCanopy, canopyMaterial } from './vegetation/canopy.js';
import { HedgeBuilder } from './vegetation/hedges.js';
import { buildOccupancy } from './vegetation/occupancy.js';
import { buildParks } from './vegetation/parks.js';

const RN = 4300;   // instanced-crown woods radius
const RH = 5000;   // hedges geometry radius
const RC = 16500;  // far woods radius (mainland)

export async function build(ctx) {
  const { THREE, layout } = ctx;
  const t0 = performance.now();
  const T = {};
  const ground = makeGround(ctx);
  const occ = buildOccupancy(ctx);
  T.occupancy = performance.now() - t0;
  const rnd = ctx.mulberry32(0x7ee5);
  const group = new THREE.Group();
  group.name = 'vegetation';

  // ------------------------------------------------------------------ noise
  const hash2 = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
  const vnoise = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  };
  const fbm = (x, z, o = 4) => { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += vnoise(x * f + i * 17.3, z * f - i * 9.1) * a; n += a; a *= 0.5; f *= 2.07; } return s / n; };
  const smooth = THREE.MathUtils.smoothstep;
  const clamp = THREE.MathUtils.clamp;

  // ------------------------------------------------------------------ palette (sRGB hex, hue jitter, lightness jitter)
  // April: bare oak/elm/beech crowns read grey-brown to purple; hawthorn, willow, larch fresh green.
  const C = new THREE.Color();
  const HSL = {};
  const pal = {
    oak: [0x6a5e4c, 0.03, 0.14], beech: [0x705a49, 0.03, 0.12], birch: [0x675b56, 0.03, 0.10], elm: [0x625448, 0.03, 0.12],
    ash: [0x6b695f, 0.02, 0.10], willow: [0x677a3a, 0.04, 0.10], larch: [0x5a7536, 0.03, 0.10], hawthorn: [0x587636, 0.04, 0.12],
    chestnut: [0x6c8641, 0.04, 0.10], sycamore: [0x6c6b4d, 0.04, 0.10], pine: [0x30452a, 0.03, 0.12], holly: [0x26331f, 0.03, 0.12],
    olive: [0x6a6a46, 0.03, 0.10],
    yew: [0x252b1f, 0.02, 0.1], blossom: [0x9e968d, 0.02, 0.06], pinkBlossom: [0xa08985, 0.02, 0.06],
    gorse: [0x444b28, 0.04, 0.12], gorseFlower: [0x8c8233, 0.03, 0.1], bramble: [0x433a30, 0.03, 0.1], blackthorn: [0x75716a, 0.02, 0.08],
  };
  for (const k in pal) { const c = new THREE.Color(pal[k][0]); const h = {}; c.getHSL(h); HSL[k] = [h.h, h.s, h.l, pal[k][1], pal[k][2]]; }
  const tint = (k, extra = 0, out = C) => {
    const [h, s, l, dh, dl] = HSL[k];
    out.setHSL(h + (rnd() - 0.5) * dh, clamp(s * (0.9 + rnd() * 0.35), 0, 1), clamp(l * (1 + (rnd() - 0.5) * 2 * dl + extra), 0, 1));
    return out;
  };
  const tbl = (o) => ({ items: Object.entries(o), total: Object.values(o).reduce((a, b) => a + b, 0) });
  const pickW = (table, r = rnd()) => { let t = r * table.total; for (const [k, w] of table.items) { t -= w; if (t <= 0) return k; } return table.items[0][0]; };
  const MIX = {
    forest: tbl({ oak: 46, beech: 18, birch: 10, pine: 12, larch: 5, ash: 5 }),
    copse: tbl({ oak: 44, ash: 16, elm: 10, birch: 7, pine: 6, larch: 5, willow: 3, sycamore: 5 }),
    hedgerow: tbl({ elm: 30, oak: 46, ash: 14, hawthorn: 6, sycamore: 4 }),
    common: tbl({ oak: 46, beech: 10, birch: 14, pine: 14, chestnut: 4, sycamore: 6 }),
    garden: tbl({ elm: 12, sycamore: 12, chestnut: 8, blossom: 16, pinkBlossom: 6, holly: 10, yew: 8, birch: 10, oak: 8, pine: 4, hawthorn: 4, willow: 2 }),
    park: tbl({ elm: 45, sycamore: 20, chestnut: 25, oak: 10 }),
    shore: tbl({ oak: 50, pine: 30, hawthorn: 20 }),
  };
  const HEIGHT = { // [H min, H max, crown W/H ratio]
    oak: [11, 23, 1.0], beech: [16, 26, 0.8], birch: [10, 18, 0.55], elm: [15, 28, 0.62], ash: [12, 23, 0.7], willow: [8, 14, 0.9],
    larch: [14, 24, 0.35], hawthorn: [5, 9, 1.0], chestnut: [13, 22, 0.85], sycamore: [12, 22, 0.85], pine: [15, 24, 0.5],
    holly: [6, 11, 0.6], yew: [7, 12, 0.8], blossom: [5, 9, 1.0], pinkBlossom: [5, 9, 1.0],
  };
  const EVERGREEN = new Set(['pine', 'holly', 'yew', 'larch']);

  // ------------------------------------------------------------------ instanced kinds
  const S = new Scatter();
  const matTree = vegMaterial({ name: 'vegCrown', speckle: 0.4, scale: 0.5, bright: 0.72, crown: true, holes: 1 });
  const matTreeFar = vegMaterial({ name: 'vegCrownFar', speckle: 0.3, scale: 0.5, bright: 0.66, crown: true, self: 0.7 });
  const matWood = vegMaterial({ name: 'vegWood', speckle: 0.35, scale: 0.45, bright: 0.62, lift: 0.0, crown: true, holes: 0.75 });
  const matWoodFar = vegMaterial({ name: 'vegWoodFar', speckle: 0.2, scale: 0.3, bright: 0.95, lift: 0.15, crown: true, self: 0.3, field: 12 });
  const matHedge = vegMaterial({ name: 'vegHedge', speckle: 0.6, scale: 0.7, lift: 0.3, bright: 0.62 });
  const KA = { castShadow: true, chunk: 2500 }, KB = { castShadow: false, chunk: 8000 };
  S.kind('broadA0', G.broadleaf(1, { lobes: 3, crownBottom: 0.2, lobeDetail: 1, withLimbs: true, spread: 0.3 }), matTree, KA);
  S.kind('broadA1', G.broadleaf(2, { lobes: 3, crownBottom: 0.24, lobeDetail: 1, withLimbs: true }), matTree, KA);
  S.kind('broadA2', G.broadleaf(7, { lobes: 3, crownBottom: 0.3, lobeDetail: 1, withLimbs: true, spread: 0.16 }), matTree, KA);
  S.kind('elmA', G.elm(3), matTree, KA);
  S.kind('pineA', G.pine(4), matTree, KA);
  S.kind('coneA', G.holly(5), matTree, KA);
  S.kind('shrubA', G.shrub(9, { detail: 1 }), matHedge, KA);
  for (let i = 0; i < 3; i++) S.kind('wood' + i, G.woodCrown(40 + i), matWood, KA);
  for (let i = 0; i < 3; i++) S.kind('woodN' + i, G.woodCrown(80 + i), matWood, KA);
  for (let i = 0; i < 2; i++) S.kind('woodF' + i, G.woodCrown(90 + i, { cut: true, clump: true }), matWoodFar, KB);
  S.kind('woodPF', G.woodCrown(95, { pine: true, cut: true }), matWoodFar, KB);
  S.kind('woodP', G.woodCrown(50, { pine: true }), matWood, KA);
  for (let i = 0; i < 2; i++) S.kind('woodT' + i, G.woodCrown(60 + i, { withTrunk: true, bottom: 0.36, detail: 1 }), matWood, KA);
  S.kind('woodTF', G.woodCrown(64, { withTrunk: true, bottom: 0.36 }), matWood, KA);
  S.kind('woodTX', G.woodCrown(66, { withTrunk: true, bottom: 0.36 }), matWoodFar, KB);
  S.kind('woodPT', G.woodCrown(70, { pine: true, withTrunk: true }), matWood, KA);
  S.kind('treeB0', G.broadleaf(11, { lobes: 3, trunkSeg: 3, crownBottom: 0.18, spread: 0.26 }), matTree, KB);
  S.kind('treeB1', G.broadleaf(13, { lobes: 3, trunkSeg: 3, crownBottom: 0.26, spread: 0.17 }), matTree, KB);
  S.kind('pineB', G.pine(12, { detail: 0 }), matTreeFar, KB);
  S.kind('shrubB', G.shrub(15), matHedge, KB);

  // ------------------------------------------------------------------ regions / masks
  const R = (p) => new ctx.poly.Region(p);
  const westLand = R(layout.WEST_LAND), iow = R(layout.ISLE_OF_WIGHT);
  const common = R(layout.PARKS[0]), centralParks = R(layout.PARKS[1]);
  const estate = R(layout.DOCK_ESTATE);
  const towns = layout.TOWN_ZONES.map((t) => ({ ...t, region: R(t.poly) }));
  const L = layout.LANDMARKS;
  const clearings = [[...L.netleyChapel, 330], [...L.calshotCastle, 150], [...L.hythePierRoot, 60]];
  const cleared = (x, z) => clearings.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r);
  const [comX0, comX1, comZ0, comZ1] = common.box;
  const inCommonBox = (x, z) => x > comX0 - 20 && x < comX1 + 20 && z > comZ0 - 20 && z < comZ1 + 20;
  const inTown = (x, z) => towns.some((t) => t.region.contains(x, z));
  // N zone boundary wanders so the switch from crowns to canopy sheet never runs straight
  const rN = (x, z) => RN + 500 * (vnoise(x / 450 + 3.1, z / 450) - 0.5);
  const inN = (x, z) => Math.hypot(x, z) < rN(x, z) || inCommonBox(x, z);
  // detailed single trees / hedges only close in; the crown woods extend further (inN)
  const bandOf = (x, z) => {
    if (Math.hypot(x, z) < 2600 || inCommonBox(x, z)) return 'A';
    if (inN(x, z)) return 'N';
    if (ground.inNear(x, z)) return 'B';
    return Math.hypot(x, z) < RC || iow.contains(x, z) ? 'C' : null;
  };

  // per-field woodland species record
  const fieldInfo = new Map();
  function woodInfo(col, row, sub) {
    const key = ((col + 5000) * 20000 + (row + 10000)) * 2 + sub;
    let w = fieldInfo.get(key);
    if (w) return w;
    const fc = fieldCell(col, row);
    const [cx, cz] = qWorld((col + 0.5 - fc.off) * FIELD.W, (row + 0.5) * FIELD.H);
    const forest = westLand.contains(cx, cz) && (cx < -1500 || cz > 2000);
    const region = forest ? MIX.forest : MIX.copse;
    const r = (s) => uhash(col * 2 + sub, row, s);
    const dom = pickW(region, r(31));
    let sec = pickW(region, r(32));
    if (sec === dom) sec = EVERGREEN.has(dom) ? 'oak' : (r(33) < 0.5 ? 'pine' : 'birch');
    const a = new THREE.Color(), b = new THREE.Color();
    tint(dom, EVERGREEN.has(dom) ? -0.1 : 0, a); tint(sec, EVERGREEN.has(sec) ? -0.15 : 0, b);
    const hd = HEIGHT[dom];
    w = { dom, sec, a, b, mix: (EVERGREEN.has(sec) ? 0.1 : 0.25) + 0.25 * r(34), H: Math.max(15, hd[0] + (hd[1] - hd[0]) * (0.4 + 0.6 * r(35))) };
    fieldInfo.set(key, w);
    return w;
  }
  const commonInfo = (x, z) => {
    const n1 = vnoise(x / 160, z / 160), n2 = vnoise(x / 230 + 7, z / 230);
    const dom = n1 > 0.62 ? 'beech' : n2 > 0.7 ? 'birch' : 'oak';
    return { dom, sec: n2 < 0.35 ? 'pine' : 'birch', mix: 0.15 + 0.3 * vnoise(x / 120 - 3, z / 120), H: 15 + 7 * vnoise(x / 90, z / 90) };
  };
  const commonNoise = (x, z) => {
    const de = common.sdist(x, z);
    return fbm(x / 420, z / 420, 3) + (1 - smooth(de, 15, 160)) * 0.22 + (1 - smooth(z, comZ0, comZ1)) * 0.1;
  };

  // ------------------------------------------------------------------ tree helpers
  const kindFor = (sp, band, rr) => {
    if (band === 'A') {
      if (sp === 'pine') return 'pineA';
      if (sp === 'holly' || sp === 'yew' || sp === 'larch') return 'coneA';
      if (sp === 'elm') return 'elmA';
      return rr < 0.4 ? 'broadA0' : rr < 0.75 ? 'broadA1' : 'broadA2';
    }
    if (EVERGREEN.has(sp)) return 'pineB';
    return rr < 0.5 ? 'treeB0' : 'treeB1';
  };
  function tree(sp, x, z, band, hScale = 1) {
    const [h0, h1, ratio] = HEIGHT[sp];
    const H = (h0 + (h1 - h0) * rnd()) * hScale;
    const W = H * ratio * (0.8 + rnd() * 0.45);
    if (occ && occ.near(x, z, Math.max(2, W * 0.22)) === 2) return false;
    const kind = kindFor(sp, band, rnd());
    let sx = W, sz = W * (0.8 + rnd() * 0.4);
    if (kind === 'coneA' && sp === 'larch') { sx = sz = H * 0.32; }
    return addV(kind, x, ground.height(x, z) - 0.6, z, sx, H, sz, rnd() * Math.PI * 2, tint(sp));
  }
  const okField = (x, z) => ground.field(x, z) >= 0.999 && !cleared(x, z);
  // never on low ground or near water (QA: trees standing in the Itchen)
  const dry = (x, z) => {
    const gh = ground.height(x, z);
    if (gh < 1.5 || ground.minH(x, z) < 1.0) return false;
    if (gh < 3.5 && ctx.terrain.heightAt(x, z) < 1.6) return false;
    if (ground.field(x, z) > 0.06) return true;
    return ctx.terrain.sample(x, z).s >= 12;
  };
  let wetRejects = 0;
  const addV = (kind, x, y, z, sx, sy, sz, ry, c) => {
    if (!dry(x, z)) { wetRejects++; return false; }
    S.add(kind, x, y, z, sx, sy, sz, ry, c);
    return true;
  };
  const dq1 = fromQ(1, 0), dq2 = fromQ(0, 1);
  const PROBES = [[dq1[0], dq1[1]], [-dq1[0], -dq1[1]], [dq2[0], dq2[1]], [-dq2[0], -dq2[1]]];

  // ------------------------------------------------------------------ woods: individual instanced crowns over the whole detailed terrain
  {
    // passes: crown lattice spacing / crown size / geometry grow with distance from the docks.
    // A regular jittered lattice per pass keeps the canopy closed but broken into crowns.
    let crowns = 0, edges = 0;
    const NB = ground.N, NX0 = NB.x0, NX1 = NB.x0 + NB.nx * NB.step, NZ0 = NB.z0, NZ1 = NB.z0 + NB.nz * NB.step;
    const passes = [[17, 0, 2000, 'woodN'], [22, 2000, 3200, 'wood'], [30, 3200, 5300, 'wood'], [46, 5300, 7500, 'woodF'], [56, 7500, 1e9, 'woodF']];
    for (const [WS, dMin, dMax, family] of passes) {
      const R0 = Math.min(dMax + 50, 99999);
      const X0 = Math.max(NX0, -R0), X1 = Math.min(NX1, R0), Z0 = Math.max(NZ0, Math.min(-R0, dMin === 0 ? comZ0 - 40 : -R0)), Z1 = Math.min(NZ1, R0);
      for (let gz = Z0; gz < Z1; gz += WS) for (let gx = X0; gx < X1; gx += WS) {
        const x = gx + (hash2(gx * 0.013 + WS, gz * 0.017) - 0.5) * WS * 0.85;
        const z = gz + (hash2(gz * 0.019 + 3.3, gx * 0.011 - WS) - 0.5) * WS * 0.85;
        const inCom = inCommonBox(x, z) && common.contains(x, z);
        const dO = inCom ? 0 : Math.hypot(x, z);
        if (dO < dMin || dO >= dMax) continue;
        let info, edge = false, ox = 0, oz = 0;
        if (inCom) {
          if ((occ && occ.near(x, z, 4) > 0) || (!occ && inTown(x, z))) continue;
          const n = commonNoise(x, z) + 0.04 * (vnoise(x / 11, z / 11) - 0.5);
          if (n < 0.56) continue;
          info = commonInfo(x, z);
          edge = n < 0.6 || common.sdist(x, z) < 14;
        } else {
          const fl = ground.field(x, z);
          if (fl < 0.55 || cleared(x, z) || (occ && occ.near(x, z, 3) === 2)) continue;
          const f = fieldAt(x, z);
          if (!f.copse) continue;
          info = woodInfo(f.col, f.row, f.sub);
          if (fl < 0.95) edge = true;
          else if (f.dEdge < WS * 0.9) for (const [dx, dz] of PROBES) if (!fieldAt(x + dx * WS * 0.9, z + dz * WS * 0.9).copse) { edge = true; ox = dx; oz = dz; break; }
        }
        if (rnd() < 0.05) continue; // occasional gap / glade
        let sp = rnd() < info.mix ? info.sec : info.dom;
        let pine = EVERGREEN.has(sp);
        // patches of fresh green (hawthorn / willow / larch coming into leaf) in clusters
        if (!pine && vnoise(x / 48 + 13.1, z / 48 - 3.3) > 0.72 && rnd() < 0.45) sp = rnd() < 0.5 ? 'hawthorn' : rnd() < 0.5 ? 'willow' : 'larch';
        const H = info.H * (0.72 + 0.5 * rnd()) * (sp === 'hawthorn' ? 0.6 : 1);
        let W = family === 'woodF' ? WS * (1.3 + 0.35 * rnd()) : clamp(H * (pine ? 0.7 : 0.95) * (0.8 + 0.5 * rnd()), 9, 24) * (0.55 + 0.45 * WS / 15) * 1.15;
        let px = x, pz = z;
        let kind;
        if (family === 'woodF') {
          if (edge && vnoise(x / 30, z / 30) < 0.35) continue;
          kind = pine ? 'woodPF' : 'woodF' + Math.floor(rnd() * 2);
        } else if (edge) {
          if (vnoise(x / 10 + 5.5, z / 10) < 0.3) continue; // clustered notches in the wood edge
          const push = (vnoise(x / 14 - 2, z / 14) - 0.3) * WS * 0.5;
          px += ox * push; pz += oz * push;
          kind = pine ? 'woodPT' : dO < 2600 ? 'woodT' + (rnd() < 0.5 ? 0 : 1) : dO < 4600 ? 'woodTF' : 'woodTX';
          edges++;
          // outliers beyond the boundary and undergrowth scrub along the edge
          if (ox || oz) {
            if (rnd() < 0.12) {
              const d = WS * (1.0 + 1.3 * rnd()), qx = x + ox * d + (rnd() - 0.5) * 6, qz = z + oz * d + (rnd() - 0.5) * 6;
              if (ground.field(qx, qz) > 0.9 && !(occ && occ.near(qx, qz, 3) === 2)) {
                const s2 = rnd() < 0.3 ? 'hawthorn' : info.dom;
                const h2 = HEIGHT[s2][0] + (HEIGHT[s2][1] - HEIGHT[s2][0]) * rnd();
                const w2 = h2 * HEIGHT[s2][2] * (0.8 + 0.4 * rnd());
                addV(EVERGREEN.has(s2) ? 'woodPT' : dO < 2600 ? 'woodT0' : 'woodTF', qx, ground.height(qx, qz) - 0.5, qz, w2, h2, w2, rnd() * 6.28, tint(s2));
              }
            }
            if (rnd() < 0.35) {
              const d = WS * (0.45 + 0.45 * rnd()), qx = x + ox * d + (rnd() - 0.5) * 5, qz = z + oz * d + (rnd() - 0.5) * 5;
              if (ground.field(qx, qz) > 0.9) {
                const r = rnd(), s3 = r < 0.4 ? 'hawthorn' : r < 0.75 ? 'bramble' : 'blackthorn';
                addV(dO < 2600 ? 'shrubA' : 'shrubB', qx, ground.height(qx, qz) - 0.3, qz, 4 + rnd() * 5, 2 + rnd() * 2.5, 4 + rnd() * 5, rnd() * 6.28, tint(s3));
              }
            }
          }
        } else {
          kind = pine ? 'woodP' : family + Math.floor(rnd() * 3);
          W *= 1.08;
        }
        tint(sp, pine ? -0.1 : 0);
        if (!pine && sp !== 'hawthorn' && sp !== 'willow' && sp !== 'larch') C.lerp(tint('olive', 0, new THREE.Color()), 0.55 * smooth(vnoise(x / 75 - 6, z / 75 + 2), 0.35, 0.8));
        if (addV(kind, px, ground.height(px, pz) - 0.5, pz, W, H, W * (0.8 + 0.4 * rnd()), rnd() * 6.283, C)) crowns++;
      }
    }
    T.woodCrowns = crowns; T.woodEdges = edges;
  }
  T.woods = performance.now() - t0;

  // ------------------------------------------------------------------ distant woods (beyond the detailed terrain): canopy sheets
  function canopyAt(x, z, out) {
    out.h = 0; out.edge = 0;
    if (ground.inNear(x, z)) return out;
    const fl = ground.field(x, z);
    if (fl < 0.45) return out;
    const f = fieldAt(x, z);
    if (!f.copse) return out;
    const W = woodInfo(f.col, f.row, f.sub);
    const prof = smooth(f.dEdge, 4, 30);
    out.h = (W.H - 3) * (0.45 + 0.55 * prof) + (vnoise(x / 70, z / 70) - 0.5) * 5;
    out.a.copy(W.a); out.b.copy(W.a).lerp(W.b, 0.5); out.mix = W.mix;
    return out;
  }
  const tiles = [];
  const TS = 1500;
  for (let tz = -9000; tz < 36000; tz += TS) for (let tx = -RC - 1500; tx < RC + 1500; tx += TS) {
    const cx = tx + TS / 2, cz = tz + TS / 2;
    if (ground.inNear(tx, tz) && ground.inNear(tx + TS, tz + TS) && ground.inNear(tx + TS, tz) && ground.inNear(tx, tz + TS)) continue;
    if (!(Math.hypot(cx, cz) < RC + 1100 || iow.contains(cx, cz))) continue;
    tiles.push({ x0: tx, z0: tz, size: TS, step: 150, band: 'C', key: 'C' + Math.floor(tx / (TS * 10)) + '_' + Math.floor(tz / (TS * 10)) });
  }
  let canopyTris = 0, canopyMeshes = 0;
  {
    const res = buildCanopy({ ground, canopyAt, material: canopyMaterial({ cell: 10 }), castShadow: false, tiles });
    group.add(res.group); canopyTris += res.tris; canopyMeshes += res.meshes;
  }
  T.canopy = performance.now() - t0;

  // ------------------------------------------------------------------ fields: hedgerows, hedgerow tree clumps, a few pasture oaks
  const hedges = new HedgeBuilder();
  const hc = new THREE.Color(0x4f5e34), hc2 = new THREE.Color(0x5a4d3a), hc3 = new THREE.Color(0x8e8a7e), hc4 = new THREE.Color(0x6b8040);
  const hedgeColor = (x, z, out) => {
    const t = vnoise(x / 38, z / 38);
    out.copy(hc).lerp(hc2, smooth(t, 0.35, 0.7));
    out.lerp(hc4, smooth(vnoise(x / 23 - 4.1, z / 23 + 1.7), 0.62, 0.8) * 0.6); // hawthorn in first leaf
    out.lerp(hc3, smooth(vnoise(x / 70 + 9.3, z / 70 - 2.1), 0.76, 0.86) * 0.5); // blackthorn blossom
    return out.multiplyScalar(0.85 + 0.3 * hash2(x * 0.31, z * 0.17));
  };
  let hedgeTrees = 0, fieldTrees = 0;
  {
    const X0 = -RH - 300, X1 = RH + 300, Z0 = Math.min(-RH - 300, comZ0 - 500), Z1 = RH + 300;
    const qs = [toQ(X0, Z0), toQ(X1, Z0), toQ(X0, Z1), toQ(X1, Z1)];
    const qx0 = Math.min(...qs.map((q) => q[0])) - 100, qx1 = Math.max(...qs.map((q) => q[0])) + 100;
    const qy0 = Math.min(...qs.map((q) => q[1])) - 100, qy1 = Math.max(...qs.map((q) => q[1])) + 100;
    const FW = FIELD.W, FH = FIELD.H;
    for (let row = Math.floor(qy0 / FH); row <= Math.ceil(qy1 / FH); row++) {
      const off0 = uhash(row, 0, 5);
      for (let col = Math.floor(qx0 / FW + off0); col <= Math.ceil(qx1 / FW + off0); col++) {
        const fc = fieldCell(col, row);
        const Qp = (fx, fy) => qWorld((col + fx - fc.off) * FW, (row + fy) * FH);
        const [cx, cz] = Qp(0.5, 0.5);
        const band = bandOf(cx, cz) === 'A' ? 'A' : 'B';
        if (band === 'B' && Math.hypot(cx, cz) > RH + 150 && !inN(cx, cz)) continue;
        if (ground.field(cx, cz) <= 0 && [Qp(0, 0), Qp(1, 0), Qp(0, 1), Qp(1, 1)].every(([x, z]) => ground.field(x, z) <= 0)) continue;
        const near = band === 'A';

        // an occasional old pasture oak, standing near the field edge rather than mid-field
        if (rnd() < (near ? 0.03 : 0.012)) {
          const e = rnd() < 0.5 ? 0.06 + rnd() * 0.08 : 0.86 + rnd() * 0.08;
          const [x, z] = rnd() < 0.5 ? Qp(e, 0.15 + rnd() * 0.7) : Qp(0.15 + rnd() * 0.7, e);
          const f = fieldAt(x, z);
          if (okField(x, z) && !f.copse && f.type < 0.38 && tree('oak', x, z, band, 1.05)) fieldTrees++;
        }

        const lines = [[0, 0, 1, 0], [0, 0, 0, 1]];
        if (fc.split === 1) lines.push([fc.sp, 0, fc.sp, 1]);
        if (fc.split === 2) lines.push([0, fc.sp, 1, fc.sp]);
        const step = near ? 11 : 30;
        for (const [ax, ay, bx, by] of lines) {
          const horiz = ay === by;
          const len = horiz ? (bx - ax) * FW : (by - ay) * FH;
          const ns = Math.max(2, Math.round(len / step));
          let runSt = [];
          let nextClump = (near ? 30 : 60) + rnd() * (near ? 160 : 300);
          const flush = () => {
            if (runSt.length >= 2) {
              const s0 = runSt[0], blk = near ? 3000 : 6000;
              hedges.run((near ? 'A' : 'B') + Math.floor(s0.x / blk) + '_' + Math.floor(s0.z / blk), runSt, near, false);
            }
            runSt = [];
          };
          for (let i = 0; i <= ns; i++) {
            const t = i / ns;
            const fx = horiz ? ax + (bx - ax) * t : ax, fy = horiz ? ay : ay + (by - ay) * t;
            const [x, z] = Qp(fx, fy);
            const [x2, z2] = horiz ? Qp(fx + 3 / FW, fy) : Qp(fx, fy + 3 / FH);
            let ux = x2 - x, uz = z2 - z; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
            const gate = rnd() < (near ? 0.025 : 0.015) || vnoise(x / 45 + 2.2, z / 45 - 8.1) < 0.13;
            let ok = !gate && ground.field(x, z) >= 0.9 && !cleared(x, z) && !(occ && occ.near(x, z, 3) === 2) && dry(x, z);
            let fa, fb;
            if (ok) {
              fa = fieldAt(x + uz * 8, z - ux * 8); fb = fieldAt(x - uz * 8, z + ux * 8);
              if (fa.copse && fb.copse) ok = false;
            }
            if (!ok) { flush(); continue; }
            const hN = vnoise(x / 7, z / 7), tall = vnoise(x / 34 + 4.4, z / 34), wob = (vnoise(x / 13 + 7, z / 13) - 0.5) * 1.4;
            const wx = x + uz * wob, wz = z - ux * wob;
            runSt.push({
              x: wx, z: wz, y: ground.height(wx, wz), nx: uz, nz: -ux,
              w: 2.2 + 1.8 * hN + smooth(tall, 0.7, 0.85) * 1.2, h: 1.4 + 1.9 * hN * hN + smooth(tall, 0.66, 0.85) * 2.8 + (hash2(x * 0.7, z * 0.3) - 0.5) * 0.6,
              c: hedgeColor(x, z, new THREE.Color()),
            });
            const tm = t * len;
            if (tm > nextClump) {
              // hedgerow trees come in small groups standing in the hedge line
              const k = 1 + Math.floor(rnd() * rnd() * (near ? 4 : 3));
              const sp = pickW(MIX.hedgerow);
              for (let j = 0; j < k; j++) {
                const along = tm + (j - (k - 1) / 2) * (7 + rnd() * 7);
                if (along < 3 || along > len - 3) continue;
                const u = along / len;
                const [tx, tz] = Qp(horiz ? ax + (bx - ax) * u : ax, horiz ? ay : ay + (by - ay) * u);
                if (ground.field(tx, tz) < 0.9) continue;
                if (tree(rnd() < 0.75 ? sp : pickW(MIX.hedgerow), tx + (rnd() - 0.5) * 1.2, tz + (rnd() - 0.5) * 1.2, band, 0.7 + rnd() * 0.55)) hedgeTrees++;
              }
              nextClump = tm + (near ? 90 : 420) + rnd() * (near ? 190 : 700);
            }
          }
          flush();
        }
      }
    }
  }
  const hedgeMeshes = hedges.build(matHedge, group);
  T.hedgeTrees = hedgeTrees; T.fieldTrees = fieldTrees; T.wetRejects = wetRejects;
  T.hedges = performance.now() - t0;

  // ------------------------------------------------------------------ Southampton Common: parkland standards & scrub outside the woods
  {
    const sp = 16;
    for (let x = comX0; x < comX1; x += sp) for (let z = comZ0; z < comZ1; z += sp) {
      const px = x + rnd() * sp, pz = z + rnd() * sp;
      if (!common.contains(px, pz) || (occ ? occ.near(px, pz, 3) > 0 : inTown(px, pz))) continue;
      const n = commonNoise(px, pz);
      if (n > 0.55) continue;
      if (rnd() < (n > 0.49 ? 0.05 : 0.012)) tree(rnd() < 0.65 ? 'oak' : pickW(MIX.common), px, pz, 'A', 0.7 + rnd() * 0.4);
      else if (n > 0.5 && rnd() < 0.08) addV('shrubA', px, ground.height(px, pz) - 0.2, pz, 4 + rnd() * 4, 2 + rnd() * 2.5, 4 + rnd() * 4, rnd() * 6, tint(rnd() < 0.5 ? 'gorse' : 'hawthorn'));
    }
  }

  // ------------------------------------------------------------------ central parks & suburb gardens / street trees
  {
    const parks = buildParks(ctx, ground, occ, { vnoise, rnd });
    if (parks) {
      group.add(parks.mesh);
      T.parkTris = parks.tris;
      for (const [x, z, sp, hs] of parks.trees) tree(sp, x, z, 'A', hs);
    }
    for (const zone of towns) {
      if (zone.density >= 0.7) continue;
      const n = Math.round((zone.region.area() / 1e4) * (0.7 - zone.density) * 5);
      let placed = 0;
      for (let i = 0; i < n * 8 && placed < n; i++) {
        const p = zone.region.randomPoint(rnd);
        if (!p) continue;
        const [x, z] = p;
        // with the town built: only in back gardens clear of houses/roads; without it: anywhere in the zone
        if (occ && (occ.at(x, z) !== 1 || occ.near(x, z, 2.5) === 2)) continue;
        const smp = ctx.terrain.sample(x, z);
        if (smp.type !== 'town' || smp.town?.name !== zone.name || smp.s < 30 || estate.contains(x, z)) continue;
        if (tree(pickW(MIX.garden), x, z, bandOf(x, z) === 'A' ? 'A' : 'B', occ ? 0.65 : 0.8)) placed++;
      }
    }
  }

  // ------------------------------------------------------------------ shore banks: gorse, bramble, blackthorn, wind-bent trees
  for (const polyL of [layout.PENINSULA, layout.WEST_LAND, layout.EAST_LAND]) {
    const pts = ctx.poly.densify(polyL, 9);
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      if (!ground.inNear(x, z)) continue;
      const band = bandOf(x, z) === 'A' ? 'A' : 'B';
      if (fbm(x / 350, z / 350, 2) < 0.47) continue;
      if (rnd() > (band === 'A' ? 0.6 : 0.35)) continue;
      const [x2, z2] = pts[(i + 1) % pts.length];
      const dx = x2 - x, dz = z2 - z, dl = Math.hypot(dx, dz) || 1;
      for (const side of [1, -1]) {
        const off = 14 + rnd() * 24;
        const px = x - (dz / dl) * off * side, pz = z + (dx / dl) * off * side;
        const smp = ctx.terrain.sample(px, pz);
        if (smp.type !== 'land' || smp.s < 12 || ground.minH(px, pz) < 0.3 || cleared(px, pz)) continue;
        const r = rnd();
        if (r < 0.1) tree(pickW(MIX.shore), px, pz, band, 0.75);
        else {
          const sp = r < 0.5 ? 'gorse' : r < 0.62 ? 'gorseFlower' : r < 0.85 ? 'bramble' : 'blackthorn';
          addV(band === 'A' ? 'shrubA' : 'shrubB', px, ground.height(px, pz) - 0.3, pz, 3 + rnd() * 5, 1.2 + rnd() * 2, 3 + rnd() * 4, rnd() * 6.28, tint(sp));
        }
        break;
      }
    }
  }
  T.misc = performance.now() - t0;

  // ------------------------------------------------------------------ marsh & reed beds
  const marsh = buildMarsh(ctx, ground, { fbm });
  if (marsh) {
    group.add(marsh.mesh);
    for (const [x, z, sp] of marsh.scrub) {
      const near = Math.hypot(x, z) < 2600;
      addV(near ? 'shrubA' : 'shrubB', x, ground.height(x, z) - 0.3, z, 4 + rnd() * 6, 1.4 + rnd() * 2.2, 4 + rnd() * 5, rnd() * 6.28, tint(sp));
    }
  }

  const res = S.build(group);
  const tris = res.tris + canopyTris + hedges.tris + (marsh ? marsh.tris : 0) + (T.parkTris || 0);
  const stats = {
    ms: Math.round(performance.now() - t0), phases: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v)])),
    tris, canopyTris, hedgeTris: hedges.tris, marshTris: marsh ? marsh.tris : 0, instTris: res.tris,
    meshes: res.calls + canopyMeshes + hedgeMeshes + (marsh ? 1 : 0), kinds: res.stats,
  };
  console.log('[vegetation]', JSON.stringify(stats));
  group.userData.stats = stats;
  return { group };
}
