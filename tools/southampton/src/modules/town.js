// Scene module "town": the built-up area of Southampton and its suburbs, 10 April 1912.
// Street networks per zone (warped rotated grids + hand-placed historic roads + medieval lanes),
// frontage-filled plots of terraces / shops / warehouses / villas with outriggers, yards, gardens,
// chimney stacks and industrial chimneys, the medieval walls and the Bargate.
import { Chunks } from './town/mesh.js';
import { townMaterial, KIND, STYLE } from './town/material.js';
import * as S from './town/shapes.js';
import { makeGround, makeCoast, Occ, fbm, vnoise, Line, densify, smoothPath } from './town/util.js';
import { ROADS, WALLED_TOWN, INDUSTRY } from './town/roads.js';
import { buildWalls } from './town/walls.js';
import { VILLAGES, RAILWAYS, GASWORKS, TIMBER_YARDS, BRICKFIELDS } from './town/country.js';
import { makeSites } from './town/sites.js';
import { buildFurniture } from './town/furniture.js';

const DEG = Math.PI / 180;

// zone character
const CHAR = {
  'Old Town': { type: 'commercial', near: true, warp: 6, cross: [70, 120], plotD: [22, 34] },
  'Above Bar': { type: 'commercial', near: true, warp: 6, cross: [80, 140], plotD: [24, 36] },
  'Canute / Chapel': { type: 'working', near: true, warp: 8, cross: [90, 150], plotD: [15, 21], industry: 0.12 },
  "Northam / St Mary's": { type: 'working', near: true, warp: 10, cross: [100, 170], plotD: [15, 21], industry: 0.1 },
  'Bevois / Portswood': { type: 'suburb', near: false, warp: 16, cross: [130, 220], plotD: [22, 32] },
  'Freemantle / Shirley': { type: 'suburb', near: false, warp: 18, cross: [140, 230], plotD: [22, 32] },
  'Woolston': { type: 'working', near: false, warp: 10, cross: [110, 180], plotD: [16, 22], industry: 0.08 },
  'Itchen Ferry / Peartree': { type: 'village', near: false, warp: 24, cross: [160, 260], plotD: [28, 45] },
  'Bitterne': { type: 'village', near: false, warp: 28, cross: [180, 280], plotD: [30, 50] },
  'Hythe': { type: 'village', near: false, warp: 20, cross: [140, 220], plotD: [26, 40] },
  'Netley': { type: 'village', near: false, warp: 22, cross: [160, 240], plotD: [28, 45] },
  'Millbrook': { type: 'village', near: false, warp: 24, cross: [160, 240], plotD: [26, 40] },
  'Totton / Eling': { type: 'village', near: false, warp: 26, cross: [170, 260], plotD: [28, 45] },
};

export async function build(ctx) {
  const t0 = performance.now();
  const PH = {}; let tph = t0; const ph = (k) => { const n = performance.now(); PH[k] = Math.round(n - tph); tph = n; };
  const { THREE, terrain, layout, geo } = ctx;
  const rnd = ctx.mulberry32(0x1912);
  const R = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const ground = makeGround(terrain);
  const coast = makeCoast(terrain, layout.RIVERS || [], ctx.poly.distToSegs);
  const occ = new Occ(1.5);
  const chunks = new Chunks(1100);
  const Region = ctx.poly.Region;

  // dock estate + Itchen wharves as one region
  const estRegions = [terrain.estate, ...(terrain.wharves || [])];
  const EST = {
    contains: (x, z) => estRegions.some((r) => r.contains(x, z)),
    sdist: (x, z) => { let v = -Infinity; for (const r of estRegions) { const b = r.box; if (x < b[0] - 700 || x > b[1] + 700 || z < b[2] - 700 || z > b[3] + 700) { v = Math.max(v, -700); continue; } v = Math.max(v, r.sdist(x, z)); } return v; },
    box: estRegions.reduce((b, r) => [Math.min(b[0], r.box[0]), Math.max(b[1], r.box[1]), Math.min(b[2], r.box[2]), Math.max(b[3], r.box[3])], [Infinity, -Infinity, Infinity, -Infinity]),
  };
  const zones = layout.TOWN_ZONES.map((z) => ({ ...z, region: new Region(z.poly), ch: CHAR[z.name] || CHAR.Bitterne }));
  const zoneAt = (x, z) => { for (const zz of zones) if (zz.region.contains(x, z)) return zz; return null; };
  const walled = new Region(WALLED_TOWN.map(([la, lo]) => geo.ll(la, lo)));
  // large-scale "districts": builder, date and roofing vary over hundreds of metres
  const district = (x, z) => ({
    tone: 0.62 + 0.95 * fbm(x / 480 + 11.3, z / 480 - 5.1, 3),
    hue: fbm(x / 330 - 7.7, z / 330 + 13.9, 2),
    tile: fbm(x / 760 + 2.2, z / 760 + 9.4, 2),
    stucco: fbm(x / 420 + 31.0, z / 420 - 17.0, 2),
  });
  // sub-districts: each zone is split into a few areas laid out at different times with their own grids
  for (const zone of zones) {
    const area = zone.region.area() / 1e4;
    const single = zone.ch.type === 'commercial';
    const n = single ? 1 : Math.max(1, Math.min(7, Math.round(area / 32)));
    zone.seeds = [];
    for (let i = 0; i < n * 20 && zone.seeds.length < n; i++) {
      const p = zone.region.randomPoint(rnd);
      if (!p || zone.seeds.some((q) => Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < 220)) continue;
      const first = zone.seeds.length === 0;
      zone.seeds.push({
        p, bearing: zone.bearing + (first ? 0 : pick([-42, -30, -18, -9, 12, 22, 35, 48, 90])),
        ...(zone.ch.type === 'working'
          ? { block: zone.block * (first ? 1 : R(0.9, 1.12)), cross: first ? 1 : R(0.85, 1.2), plot: first ? 1 : R(0.92, 1.08), warp: first ? 1 : R(0.6, 1.4) }
          : { block: zone.block * (first ? 1 : R(0.8, 1.35)), cross: first ? 1 : R(0.75, 1.35), plot: first ? 1 : R(0.75, 1.35), warp: first ? 1 : R(0.5, 1.8) }),
      });
    }
    if (!zone.seeds.length) zone.seeds.push({ p: [zone.region.box[0], zone.region.box[2]], bearing: zone.bearing, block: zone.block, cross: 1, plot: 1, warp: 1 });
  }
  const seedAt = (zone, x, z) => {
    let best = zone.seeds[0], bd = Infinity;
    for (const sd of zone.seeds) { const d = (sd.p[0] - x) ** 2 + (sd.p[1] - z) ** 2; if (d < bd) { bd = d; best = sd; } }
    return best;
  };
  const L = layout.LANDMARKS;
  const clearings = [[L.southWesternHotel, 42], [L.terminus, 42], [L.stMichael, 40], [L.holyRood, 40], [L.stMary, 42]];
  const industry = INDUSTRY.map(([la, lo, r, w]) => [...geo.ll(la, lo), r, w]);
  const industryAt = (x, z) => {
    let v = 0;
    for (const [ix, iz, r, w] of industry) { const d = Math.hypot(x - ix, z - iz); if (d < r) v = Math.max(v, w * (1 - d / r) ** 0.6); }
    return v;
  };

  // fraction of a 110 m ring that is town, water, docks or park (1 = deep inside the built-up area)
  const edgeCache = new Map();
  const edgeFrac = (x, z) => {
    const k = Math.round(x / 30) * 100003 + Math.round(z / 30);
    let v = edgeCache.get(k);
    if (v !== undefined) return v;
    let n = 0;
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? 110 : 230, a = (i / 10) * Math.PI * 2, px = Math.round(x / 30) * 30 + Math.cos(a) * rr, pz = Math.round(z / 30) * 30 + Math.sin(a) * rr;
      if (zoneAt(px, pz) || coast(px, pz) < 0 || EST.contains(px, pz) || terrain.parks.some((p) => p.contains(px, pz))) n++;
    }
    v = n / 10;
    edgeCache.set(k, v);
    return v;
  };
  const EB = EST.box, PB = terrain.parks.map((p) => p.box);
  const nearEstate = (x, z, m) => x > EB[0] - m && x < EB[1] + m && z > EB[2] - m && z < EB[3] + m;
  const pointOK = (x, z, zone) => {
    if (zone && !zone.region.contains(x, z)) return false;
    if (coast(x, z) < (zone && zone.ch.rural ? 10 : 6)) return false;
    if (nearEstate(x, z, 8) && EST.sdist(x, z) > -6) return false;
    for (const p of terrain.parks) if (p.contains(x, z)) return false;
    for (const [c, r] of clearings) if (Math.hypot(x - c[0], z - c[1]) < r) return false;
    return true;
  };
  const quadOK = (q, zone) => {
    for (const p of q) if (!pointOK(p[0], p[1], zone)) return false;
    const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cz = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    return pointOK(cx, cz, null);
  };

  // ------------------------------------------------------------------ walls & Bargate first (reserve space)
  const walls = buildWalls(ctx, ground, occ);

  // ------------------------------------------------------------------ streets
  const streets = [];
  const addStreet = (pts, o) => {
    if (pts.length < 2) return null;
    const line = new Line(densify(pts, 5));
    if (line.len < 20) return null;
    const st = { id: streets.length + 1, line, hw: o.hw, pave: o.pave, setts: !!o.setts, tram: !!o.tram, rank: o.rank, zone: o.zone || null, oldTown: !!o.oldTown, rail: !!o.rail, lane: !!o.lane, pale: !!o.pale, trim: o.trim || 0 };
    st.used = new Uint8Array(Math.ceil(line.len / 5) + 2);
    streets.push(st);
    return st;
  };

  // rasterise carriageways (1) and pavements (4)
  const roadOK = (x, z) => coast(x, z) > 2 && !(x > EST.box[0] - 5 && x < EST.box[1] + 5 && z > EST.box[2] - 5 && z < EST.box[3] + 5 && EST.sdist(x, z) > -3);
  const rasterise = (st) => {
    const Ln = st.line;
    for (let t = 0; t < Ln.len; t += 5) {
      const p = Ln.at(t), q = Ln.at(Math.min(Ln.len, t + 5.5));
      if (!roadOK((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)) continue;
      const d = Ln.dir(t + 2.5, 3), nx = -d[1], nz = d[0];
      const e = st.hw, f = st.hw + st.pave;
      occ.quad([[p[0] - nx * f, p[1] - nz * f], [q[0] - nx * f, q[1] - nz * f], [q[0] + nx * f, q[1] + nz * f], [p[0] + nx * f, p[1] + nz * f]], 0, (ix, iz) => {
        const v = occ.get(ix, iz);
        if (v === 0) occ.set(ix, iz, 4, st.id);
      });
      occ.quad([[p[0] - nx * e, p[1] - nz * e], [q[0] - nx * e, q[1] - nz * e], [q[0] + nx * e, q[1] + nz * e], [p[0] + nx * e, p[1] + nz * e]], 0, (ix, iz) => {
        occ.set(ix, iz, 1, st.id);
      });
    }
  };

  for (const r of ROADS) addStreet(smoothPath(r.pts.map(([la, lo]) => geo.ll(la, lo)), 5), r);
  for (const r of RAILWAYS) addStreet(smoothPath(r.pts.map(([la, lo]) => geo.ll(la, lo)), 5), { hw: r.hw, pave: 0, rank: 1, rail: true });
  const nHand = streets.length;
  for (const st of streets) rasterise(st);

  ph('p_roads');
  // ------------------------------------------------------------------ special sites (reserved before the grid is laid out)
  const sites = [];
  const landOK = (x, z, margin = 10) => coast(x, z) > margin && EST.sdist(x, z) < -8 && !terrain.parks.some((p) => p.contains(x, z)) && !clearings.some(([c, r]) => Math.hypot(x - c[0], z - c[1]) < r);
  const reserveSite = (type, c, W, D, bearing, zone, pad = -4) => {
    const b = bearing * DEG, u = [Math.sin(b), -Math.cos(b)];
    const q = S.rectQ(c, u, W, D);
    if (!occ.free(q, pad)) return null;
    if (zone ? !quadOK(q, zone) : !q.every((p) => landOK(p[0], p[1])) || !landOK(c[0], c[1])) return null;
    occ.mark(q, 3);
    const site = { type, q, zone };
    sites.push(site);
    return site;
  };
  const fixedSite = (type, [la, lo, bearing], W, D) => {
    const c0 = geo.ll(la, lo);
    for (let i = 0; i < 16; i++) {
      const c = [c0[0] + (i ? (rnd() - 0.5) * 160 : 0), c0[1] + (i ? (rnd() - 0.5) * 160 : 0)];
      if (reserveSite(type, c, W, D, bearing, null, -2)) return;
    }
  };
  fixedSite('gasworks', [...GASWORKS.at, GASWORKS.bearing], 165, 120);
  for (const t of TIMBER_YARDS) fixedSite('timberyard', t, R(70, 100), R(50, 70));
  for (const t of BRICKFIELDS) fixedSite('brickfield', t, 115, 85);
  const SITE_RATES = {
    working: [['school', 38, [45, 60], [30, 42]], ['recground', 200, [70, 100], [55, 80]]],
    commercial: [['school', 45, [50, 65], [35, 45]]],
    suburb: [['allotments', 24, [60, 120], [45, 80]], ['school', 30, [50, 70], [35, 50]], ['recground', 60, [90, 140], [70, 110]], ['nursery', 45, [50, 90], [40, 70]]],
    village: [['allotments', 32, [50, 100], [40, 70]], ['nursery', 30, [50, 90], [40, 70]], ['recground', 120, [80, 120], [60, 90]]],
  };
  for (const zone of zones) {
    if (zone.name === 'Old Town') continue;
    const area = zone.region.area() / 1e4;
    for (const [type, per, Wr, Dr] of SITE_RATES[zone.ch.type] || []) {
      const want = Math.round(area / per + rnd() * 0.6);
      let got = 0;
      for (let i = 0; i < want * 40 && got < want; i++) {
        const c = zone.region.randomPoint(rnd);
        if (!c) continue;
        if (sites.some((st) => st.type === type && Math.hypot(st.q[0][0] - c[0], st.q[0][1] - c[1]) < 250)) continue;
        if (reserveSite(type, c, R(Wr[0], Wr[1]), R(Dr[0], Dr[1]), seedAt(zone, c[0], c[1]).bearing, zone)) got++;
      }
    }
  }

  ph('p_sites');
  // warped rotated grid per zone, one grid per sub-district seed
  for (const zone of zones) for (const seed of zone.seeds) {
    const ch = zone.ch;
    const b = seed.bearing * DEG;
    const A = [Math.sin(b), -Math.cos(b)], C = [Math.cos(b), Math.sin(b)];
    let cx = 0, cz = 0;
    for (const p of zone.poly) { cx += p[0] / zone.poly.length; cz += p[1] / zone.poly.length; }
    let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    for (const p of zone.poly) {
      const a = (p[0] - cx) * A[0] + (p[1] - cz) * A[1], c = (p[0] - cx) * C[0] + (p[1] - cz) * C[1];
      a0 = Math.min(a0, a); a1 = Math.max(a1, a); c0 = Math.min(c0, c); c1 = Math.max(c1, c);
    }
    a0 -= 60; a1 += 60; c0 -= 60; c1 += 60;
    const amp = ch.warp * seed.warp, lam = 380, sdo = zone.name.length * 13.7 + seed.p[0] * 0.001;
    const W = (a, c) => {
      const wx = (fbm(a / lam + sdo, c / lam, 2) - 0.5) * 2 * amp;
      const wz = (fbm(a / lam, c / lam - sdo, 2) - 0.5) * 2 * amp;
      return [cx + A[0] * a + C[0] * c + wx, cz + A[1] * a + C[1] * c + wz];
    };
    const allowed = (x, z) => zone.region.contains(x, z) && !(zone.name === 'Old Town' && walled.contains(x, z)) && occ.at(x, z) !== 3 && seedAt(zone, x, z) === seed;
    // grid streets must not run along (on top of) the historic roads
    const handHit = (x, z) => { const v = occ.at(x, z); if (v !== 1 && v !== 4) return false; const id = occ.idAt(x, z); return id > 0 && id <= nHand; };
    const emitClipped = (pts, o) => {
      const n = pts.length, ok = pts.map((p) => allowed(p[0], p[1]));
      const hit = pts.map((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, nx = -dz / L * (o.hw + 1), nz = dx / L * (o.hw + 1);
        const k = (o.hw + o.pave + 9) / (o.hw + 1);
        return handHit(p[0], p[1]) || handHit(p[0] + nx, p[1] + nz) || handHit(p[0] - nx, p[1] - nz) || handHit(p[0] + nx * k, p[1] + nz * k) || handHit(p[0] - nx * k, p[1] - nz * k);
      });
      for (let i = 0; i < n;) {
        if (!hit[i]) { i++; continue; }
        let j = i; while (j < n && hit[j]) j++;
        if (j - i >= 5) for (let k = Math.max(0, i - 2); k < Math.min(n, j + 2); k++) ok[k] = false;
        i = j;
      }
      let cur = [];
      for (let i = 0; i < n; i++) {
        if (ok[i]) cur.push(pts[i]);
        else { if (cur.length > 3) addStreet(cur, o); cur = []; }
      }
      if (cur.length > 3) addStreet(cur, o);
    };
    const D = seed.block;
    const cross = [ch.cross[0] * seed.cross, ch.cross[1] * seed.cross];
    const cs = [];
    for (let c = c0 + rnd() * D; c < c1; c += D * R(0.85, 1.18)) cs.push(c);
    const surf = ch.type === 'commercial' || ch.type === 'working';
    const hw = ch.type === 'village' ? 3.0 : 3.6, pave = ch.type === 'village' ? 1.0 : 1.8;
    for (const c of cs) {
      const skew = (rnd() - 0.5) * 0.05;
      const pts = [];
      for (let a = a0; a <= a1; a += 6) pts.push(W(a, c + a * skew));
      c === cs[0] || rnd() > 0.04 ? emitClipped(pts, { hw, pave, setts: surf, rank: 2, zone }) : null;
    }
    let prevA = [];
    for (let i = 0; i < cs.length - 1; i++) {
      const cA = cs[i], cB = cs[i + 1];
      const as = [];
      for (const a of prevA) if (rnd() < 0.55) as.push(a + (rnd() - 0.5) * 6);
      for (let a = a0 + rnd() * cross[1]; a < a1; a += R(cross[0], cross[1])) {
        if (as.some((q) => Math.abs(q - a) < cross[0] * 0.6)) continue;
        as.push(a);
      }
      prevA = as;
      for (const a of as) {
        const pts = [];
        for (let c = cA; c <= cB + 0.1; c += 6) pts.push(W(a, c));
        pts.push(W(a, cB));
        emitClipped(pts, { hw, pave, setts: surf, rank: 3, zone });
      }
    }
  }

  for (const st of streets) if (st.id > nHand) rasterise(st);

  ph('p_grid');
  // ------------------------------------------------------------------ countryside: villages, fringe, farmsteads, lanes
  const VCH = { type: 'village', near: false, rural: true, warp: 0, cross: [0, 0], plotD: [30, 50] };
  const distZoneCache = new Map();
  const distZone = (x, z) => {
    const k = Math.round(x / 40) * 100003 + Math.round(z / 40);
    let v = distZoneCache.get(k);
    if (v === undefined) { v = Infinity; for (const zz of zones) v = Math.min(v, Math.max(0, -zz.region.sdist(x, z))); distZoneCache.set(k, v); }
    return v;
  };
  const FRINGE = 420;
  const fringe = {
    name: 'fringe', density: 0.7, bearing: 0, ch: { ...VCH, fringe: true },
    region: { contains: (x, z) => { const d = distZone(x, z); return d > 0 && d < FRINGE && !terrain.parks.some((p) => p.contains(x, z)); }, box: [-1e9, 1e9, -1e9, 1e9] },
  };
  const villages = [];
  for (const v of VILLAGES) {
    const c = geo.ll(v.at[0], v.at[1]);
    if (coast(c[0], c[1]) < 25 || zoneAt(c[0], c[1])) continue;
    const vz = {
      name: 'v:' + v.name, density: 0.85, bearing: R(0, 180), center: c, r: v.r, ch: VCH,
      region: { contains: (x, z) => { const d = Math.hypot(x - c[0], z - c[1]); return d < v.r * (0.8 + 0.45 * fbm(x / 90, z / 90, 2)) && !zoneAt(x, z); }, box: [c[0] - v.r * 1.3, c[0] + v.r * 1.3, c[1] - v.r * 1.3, c[1] + v.r * 1.3] },
    };
    villages.push(vz);
    // main street through the village, one or two side lanes
    const b = vz.bearing * DEG, u = [Math.cos(b), Math.sin(b)], n = [-u[1], u[0]];
    const Lm = v.r * 1.35;
    const ctrl = [-1, -0.45, 0.1, 0.6, 1].map((t, i) => { const off = (i === 0 || i === 4 ? 0 : (rnd() - 0.5) * v.r * 0.35); return [c[0] + u[0] * t * Lm + n[0] * off, c[1] + u[1] * t * Lm + n[1] * off]; });
    const main = addStreet(smoothPath(ctrl, 5).filter((p) => coast(p[0], p[1]) > 15), { hw: 2.8, pave: rnd() < 0.5 ? 1.0 : 0, rank: 1, zone: vz, pale: true });
    vz.main = main;
    for (let k = 0; k < 1 + (v.r > 180 ? 1 : 0) + (rnd() < 0.5 ? 1 : 0); k++) {
      const t = R(-0.5, 0.5), sgn = rnd() < 0.5 ? -1 : 1, a = (R(60, 120) * DEG) * sgn;
      const d = [Math.cos(b + a), Math.sin(b + a)], o = [c[0] + u[0] * t * Lm, c[1] + u[1] * t * Lm];
      const L2 = v.r * R(0.7, 1.1);
      const cc = [o, [o[0] + d[0] * L2 * 0.5 + (rnd() - 0.5) * 25, o[1] + d[1] * L2 * 0.5 + (rnd() - 0.5) * 25], [o[0] + d[0] * L2, o[1] + d[1] * L2]];
      addStreet(smoothPath(cc, 5).filter((p) => coast(p[0], p[1]) > 15), { hw: 2.4, pave: 0, rank: 2, zone: vz, pale: true });
    }
    if (v.church) {
      for (let i = 0; i < 30; i++) {
        const t = R(-0.3, 0.3), side = rnd() < 0.5 ? -1 : 1;
        const p = [c[0] + u[0] * t * Lm + n[0] * side * R(24, 34), c[1] + u[1] * t * Lm + n[1] * side * R(24, 34)];
        if (reserveSite('church', p, R(38, 48), R(26, 32), 90, null, -3.2)) break;
      }
    }
  }
  const villageAt = (x, z) => villages.find((vz) => vz.region.contains(x, z)) || null;
  for (let i = nHand; i < streets.length; i++) if (streets[i].zone && streets[i].zone.ch.rural) rasterise(streets[i]);

  ph('p_villages');
  // farmsteads on a jittered ~1.2 km lattice, aligned with the field pattern of the terrain shader
  const farms = [];
  const FU = [0.94, 0.34];
  for (let gz = -8400; gz < 9600; gz += 1200) {
    for (let gx = -8000; gx < 8000; gx += 1200) {
      if (rnd() < 0.2) continue;
      const p = [gx + R(150, 1050), gz + R(150, 1050)];
      const smp = terrain.sample(p[0], p[1]);
      if (smp.type !== 'land' || smp.s < 70 || terrain.coast(p[0], p[1]).iow) continue;
      if (distZone(p[0], p[1]) < 250 || villages.some((vz) => Math.hypot(vz.center[0] - p[0], vz.center[1] - p[1]) < vz.r + 250)) continue;
      const q = S.rectQ([p[0] + FU[0] * 8 - FU[1] * 10, p[1] + FU[1] * 8 + FU[0] * 10], FU, 52, 56);
      if (!occ.free(q, -5) || !q.every((c) => landOK(c[0], c[1], 20))) continue;
      occ.mark(q, 3);
      farms.push(p);
    }
  }

  ph('p_farms');
  // unsealed lanes: spanning tree over villages, farms and the town's edge, avoiding water
  {
    const nodes = [];
    for (const vz of villages) nodes.push({ p: vz.center, kind: 'v' });
    for (const f of farms) nodes.push({ p: [f[0] - FU[1] * 3, f[1] + FU[0] * 3], kind: 'f' });
    for (const r of ROADS) {
      if (r.rank !== 0) continue;
      for (const end of [r.pts[0], r.pts[r.pts.length - 1]]) { const q = geo.ll(end[0], end[1]); if (coast(q[0], q[1]) > 40) nodes.push({ p: q, kind: 't' }); }
    }
    for (const zone of zones) {
      const P = zone.poly;
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length], Ls = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let t = 0.5 * 1100; t < Ls; t += 1100) {
          const q = [a[0] + (b[0] - a[0]) * t / Ls, a[1] + (b[1] - a[1]) * t / Ls];
          if (coast(q[0], q[1]) > 60 && !terrain.parks.some((pp) => pp.contains(q[0], q[1]))) nodes.push({ p: q, kind: 't' });
        }
      }
    }
    const clearPath = (a, b) => {
      const Ls = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(Ls / 30);
      for (let i = 1; i < n; i++) {
        const x = a[0] + (b[0] - a[0]) * i / n, z = a[1] + (b[1] - a[1]) * i / n;
        if (coast(x, z) < 24 || EST.sdist(x, z) > -10) return false;
      }
      return true;
    };
    const edges = [];
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      if (nodes[i].kind === 't' && nodes[j].kind === 't') continue;
      const d = Math.hypot(nodes[i].p[0] - nodes[j].p[0], nodes[i].p[1] - nodes[j].p[1]);
      if (d < 2600 && d > 40) edges.push([d, i, j]);
    }
    edges.sort((a, b) => a[0] - b[0]);
    const parent = nodes.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    const degree = new Uint8Array(nodes.length);
    const chosen = [];
    for (const [d, i, j] of edges) {
      const a = find(i), b = find(j);
      const extra = a === b && nodes[i].kind === 'v' && nodes[j].kind === 'v' && degree[i] < 3 && degree[j] < 3 && d < 2200 && rnd() < 0.5;
      if (a === b && !extra) continue;
      const cap = (k) => (nodes[k].kind === 'v' ? 4 : nodes[k].kind === 'f' ? 2 : 1);
      if (degree[i] >= cap(i) || degree[j] >= cap(j)) continue;
      if (!clearPath(nodes[i].p, nodes[j].p)) continue;
      if (a !== b) parent[a] = b;
      degree[i]++; degree[j]++;
      chosen.push([i, j, d]);
    }
    for (const [i, j, d] of chosen) {
      // lanes follow the field boundaries: a staircase along the field-grid axes with softened corners
      const a = nodes[i].p, b = nodes[j].p;
      const FV = [-FU[1], FU[0]];
      const du = (b[0] - a[0]) * FU[0] + (b[1] - a[1]) * FU[1], dv = (b[0] - a[0]) * FV[0] + (b[1] - a[1]) * FV[1];
      const steps = Math.max(1, Math.min(4, Math.round(d / 600)));
      const ctrl = [a];
      let cu = 0, cv = 0;
      const uFirst = rnd() < 0.5;
      for (let k = 0; k < steps; k++) {
        const su = du / steps * R(0.7, 1.3), sv = dv / steps * R(0.7, 1.3);
        const nu = k === steps - 1 ? du : cu + su, nv = k === steps - 1 ? dv : cv + sv;
        const mid = uFirst ? [nu, cv] : [cu, nv];
        for (const [uu, vv] of [mid, [nu, nv]]) ctrl.push([a[0] + FU[0] * uu + FV[0] * vv + (rnd() - 0.5) * 20, a[1] + FU[1] * uu + FV[1] * vv + (rnd() - 0.5) * 20]);
        cu = nu; cv = nv;
      }
      ctrl[ctrl.length - 1] = b;
      // cut corners so bends are curves, not right angles
      const soft = [ctrl[0]];
      for (let k = 1; k < ctrl.length - 1; k++) {
        const p0 = ctrl[k - 1], p1 = ctrl[k], p2 = ctrl[k + 1];
        const l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1, l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
        const r1 = Math.min(40, l1 * 0.4) / l1, r2 = Math.min(40, l2 * 0.4) / l2;
        soft.push([p1[0] + (p0[0] - p1[0]) * r1, p1[1] + (p0[1] - p1[1]) * r1], p1, [p1[0] + (p2[0] - p1[0]) * r2, p1[1] + (p2[1] - p1[1]) * r2]);
      }
      soft.push(ctrl[ctrl.length - 1]);
      const pts = smoothPath(soft, 8).filter((p, k, arr) => k === 0 || Math.hypot(p[0] - arr[k - 1][0], p[1] - arr[k - 1][1]) > 0.5);
      let cur = [];
      const flush = () => { if (cur.length > 6) addStreet(cur, { hw: 1.9, pave: 0, rank: 4, zone: fringe, lane: true, pale: true }); cur = []; };
      for (const p of pts) {
        const cs = coast(p[0], p[1]);
        const inside = zoneAt(p[0], p[1]) || cs < 20 || occ.at(p[0], p[1]) === 3 || (cs < 150 && terrain.sample(p[0], p[1]).type !== 'land');
        if (inside) flush(); else cur.push(p);
      }
      flush();
    }
    for (let i = nHand; i < streets.length; i++) if (streets[i].lane) rasterise(streets[i]);
  }

  ph('p_lanes');
  // ------------------------------------------------------------------ palettes
  const brickCol = () => { const k = R(0.8, 1.15); return [k * R(0.97, 1.1), k * R(0.9, 1.02), k * R(0.85, 1.0)]; };
  const sootBrickCol = () => { const k = R(0.6, 0.85); return [k, k * 0.95, k * 0.92]; };
  const buffCol = () => { const k = R(0.85, 1.2); return [k, k * R(0.95, 1.02), k * R(0.9, 1.05)]; };
  const STUCCO = [[0.55, 0.5, 0.4], [0.6, 0.57, 0.5], [0.44, 0.43, 0.4], [0.52, 0.42, 0.28], [0.46, 0.47, 0.41], [0.55, 0.46, 0.4], [0.62, 0.58, 0.47], [0.38, 0.37, 0.34]];
  const stuccoCol = () => { const c = pick(STUCCO), k = R(0.85, 1.05); return [c[0] * k, c[1] * k, c[2] * k]; };
  let D0 = { tone: 1, hue: 0.5, tile: 0.5, stucco: 0.5 };
  const SLATE_HUES = [[1.06, 0.93, 1.1], [0.9, 0.97, 1.12], [0.97, 1.03, 0.92], [1.08, 1.03, 0.86]]; // Welsh purple, blue, Westmorland green, lichened
  const slateCol = () => {
    const h = D0.hue * 3.2, i = Math.min(3, Math.floor(h)), j = Math.min(3, i + 1), f = h - i;
    const k = D0.tone * R(0.82, 1.18);
    return [0, 1, 2].map((c) => k * (SLATE_HUES[i][c] * (1 - f) + SLATE_HUES[j][c] * f) * R(0.97, 1.03));
  };
  const tileCol = () => { const k = R(0.7, 1.2) * (0.8 + 0.4 * D0.tone); return [k, k * R(0.85, 1.08), k * R(0.85, 1.15)]; };
  const yardCol = () => { const k = R(0.045, 0.08); return [k * 1.05, k, k * 0.95]; };
  const gardenCol = () => { const k = R(0.8, 1.25); return [0.105 * k * R(0.9, 1.1), 0.155 * k, 0.065 * k * R(0.85, 1.1)]; };
  const wallMat = (pBrick, pBuff, pStucco) => {
    pStucco *= 0.4 + 1.3 * D0.stucco; pBuff *= 1.4 - 0.9 * D0.stucco;
    const r = rnd() * (pBrick + pBuff + pStucco);
    if (r < pBrick) return [KIND.BRICK, brickCol()];
    if (r < pBrick + pBuff) return [KIND.BUFF, buffCol()];
    return [KIND.STUCCO, stuccoCol()];
  };

  // ------------------------------------------------------------------ run templates
  function newRun(zone, st, p, side) {
    const ch = zone.ch;
    const inWalls = zone.name === 'Old Town' && walled.contains(p[0], p[1]);
    const type = inWalls ? 'old' : ch.type;
    const ind = Math.max(industryAt(p[0], p[1]), (ch.industry || 0) * (coast(p[0], p[1]) < 250 ? 3 : 1));
    const main = st.rank <= 1;
    const r = rnd();
    const run = { type: 'terrace', zone, near: ch.near, attached: true, n: 1, k: 0, raise: 0.2, overhang: 0.25, pitch: 33, outr: null, lean: 0, bayWin: false, shop: 0, frontParapet: 0, roof: 'gable', frontGable: false, style: STYLE.HOUSE, bay: 2.5, sb: 0, jitterW: 0 };
    D0 = district(p[0], p[1]);
    const seedScale = zone.seeds ? seedAt(zone, p[0], p[1]).plot : 1;
    const pd = R(ch.plotD[0], ch.plotD[1]) * seedScale;
    run.plotD = pd;
    const tileBias = Math.max(0, (D0.tile - 0.45) * 2.2);
    const slate = (p = 0.92) => {
      p = Math.max(0.15, p - tileBias * (ch.type === 'suburb' || ch.type === 'village' ? 0.75 : 0.35));
      if (rnd() < p) { run.roofKind = KIND.SLATE; run.roofCol = slateCol(); } else { run.roofKind = KIND.TILE; run.roofCol = tileCol(); run.pitch += 8; }
    };

    if (type === 'old') {
      run.n = 1; run.w = rnd() < 0.1 ? R(11, 16) : R(4.8, 8.5);
      run.storeys = pick([2, 3, 3, 3, 4, 4]); run.sh = R(3.0, 3.5); run.bd = R(9, 13);
      if (run.bd > pd - 3) run.bd = pd - 3;
      run.plotD = R(22, 40);
      const m = rnd();
      if (m < 0.12) { run.kind = KIND.TIMBER; run.col = [R(0.6, 0.72), R(0.58, 0.66), R(0.48, 0.56)]; run.frontGable = true; run.storeys = Math.min(run.storeys, 3); run.pitch = 50; run.w = Math.min(run.w, 7.5); slate(0.3); }
      else { [run.kind, run.col] = wallMat(0.45, 0.13, 0.42); slate(0.75); if (rnd() < 0.3) { run.frontParapet = 0.9; run.pitch = 28; } }
      run.shop = main ? 0.8 : 0.25; run.bay = R(2.2, 3.0);
      run.outr = { p: 0.85, storeys: Math.max(1, run.storeys - 1 - (rnd() < 0.5 ? 1 : 0)), wf: R(0.45, 0.7), d: R(5, 12) };
      run.lean = 0.5;
      return run;
    }
    if (type === 'commercial') {
      if (!main && r < 0.03) return chapelRun(run, zone);
      run.n = Math.floor(R(2, 7)); run.w = R(5.5, 9.5); run.storeys = pick([3, 3, 4, 4, 3, 2]); run.sh = R(3.2, 3.8); run.bd = R(11, 15);
      [run.kind, run.col] = wallMat(0.38, 0.17, 0.45); slate(0.9);
      run.shop = main ? 0.9 : 0.35; run.bay = R(2.4, 3.1);
      if (rnd() < 0.45) { run.frontParapet = R(0.7, 1.2); run.pitch = 27; }
      run.outr = { p: 0.8, storeys: Math.max(1, run.storeys - 1), wf: R(0.5, 0.75), d: R(6, 12) };
      run.lean = 0.3;
      if (ind > 0.3 && rnd() < ind) return warehouseRun(run, zone, ind);
      return run;
    }
    if (type === 'working') {
      if (rnd() < ind * 0.8) return warehouseRun(run, zone, ind);
      if (r < 0.05) {
        run.type = 'pub'; run.n = 1; run.w = R(7, 10); run.storeys = 3; run.sh = 3.3; run.bd = R(10, 13);
        run.kind = KIND.STUCCO; run.col = stuccoCol(); slate(0.95); run.shop = 1; run.frontParapet = 0.9; run.pitch = 28; run.bay = 2.6;
        run.outr = { p: 1, storeys: 2, wf: 0.6, d: 6 };
        return run;
      }
      if (r < 0.075) return chapelRun(run, zone);
      if (r < 0.085 && !main) return schoolRun(run, zone);
      run.n = Math.floor(R(6, 20)); run.w = R(4.3, 5.4); run.storeys = rnd() < 0.15 ? 3 : 2; run.sh = R(2.75, 3.0); run.bd = R(7.2, 8.6);
      [run.kind, run.col] = wallMat(0.55, 0.3, 0.15);
      if (rnd() < 0.3) run.col = sootBrickCol();
      slate(0.93);
      run.sb = rnd() < 0.12 ? R(1.0, 2.0) : 0; run.bay = run.w / 2 + 0.01;
      run.shop = main ? 0.55 : 0.04;
      run.outr = { p: 0.95, storeys: rnd() < 0.6 ? 2 : 1, wf: R(0.45, 0.6), d: R(3.5, 6) };
      run.lean = 0.6;
      return run;
    }
    if (type === 'suburb') {
      if (r < 0.14) return villaRun(run, zone, pd);
      if (r < 0.16) return chapelRun(run, zone);
      run.n = Math.floor(R(6, 16)); run.w = R(5.0, 6.4); run.storeys = 2; run.sh = R(2.9, 3.2); run.bd = R(8, 9.5);
      [run.kind, run.col] = wallMat(0.5, 0.25, 0.25); slate(0.86);
      run.sb = R(1.8, 4.5); run.raise = 0.45; run.bayWin = rnd() < 0.4; run.bay = run.w / 2 + 0.01;
      run.shop = main ? 0.5 : 0.02;
      if (main && rnd() < 0.5) { run.sb = 0; run.bayWin = false; }
      run.outr = { p: 0.9, storeys: 2, wf: R(0.45, 0.6), d: R(4, 7) };
      run.lean = 0.3;
      return run;
    }
    // village
    if (r < (ch.fringe ? 0.6 : 0.4)) return villaRun(run, zone, pd);
    if (r < (ch.rural ? 0.43 : 0.53)) return chapelRun(run, zone);
    run.n = Math.floor(R(2, 7)); run.w = R(4.6, 6.2); run.storeys = 2; run.sh = R(2.6, 2.9); run.bd = R(6.5, 8);
    [run.kind, run.col] = wallMat(0.55, 0.1, 0.35); slate(ch.rural ? 0.35 : 0.6);
    if (ch.rural && rnd() < 0.35) { run.roofKind = KIND.THATCH; run.roofCol = [R(0.85, 1.15), R(0.85, 1.1), R(0.8, 1.05)]; run.pitch = 50; run.storeys = rnd() < 0.5 ? 1 : 2; run.sh = 2.6; run.overhang = 0.45; }
    if (ch.rural && rnd() < 0.4) { run.kind = KIND.STUCCO; run.col = [R(0.6, 0.7), R(0.58, 0.66), R(0.52, 0.6)]; }
    run.sb = R(2.5, 6); run.raise = 0.3; run.bay = run.w / 2 + 0.01; run.overhang = 0.3;
    run.outr = rnd() < 0.5 ? { p: 0.8, storeys: 1, wf: 0.55, d: R(3, 5) } : null;
    run.lean = 0.3;
    return run;
  }
  function villaRun(run, zone, pd) {
    run.type = 'villa'; run.attached = false; run.n = Math.floor(R(2, 7));
    const semi = rnd() < 0.45;
    run.w = semi ? R(12.5, 16) : R(9.5, 13.5); run.semi = semi;
    run.storeys = rnd() < 0.2 ? 3 : 2; run.sh = R(3.0, 3.4); run.bd = R(9, 11.5);
    [run.kind, run.col] = wallMat(0.55, 0.15, 0.3);
    run.roofKind = KIND.SLATE; run.roofCol = slateCol();
    if (rnd() < 0.35) { run.roofKind = KIND.TILE; run.roofCol = tileCol(); }
    run.pitch = run.roofKind === KIND.TILE ? 42 : 34;
    run.roof = rnd() < 0.55 ? 'hip' : 'gable';
    run.sb = R(4.5, 9); run.raise = 0.6; run.bayWin = rnd() < 0.7; run.bay = 3.0; run.overhang = 0.35;
    run.gap = [R(2, 4), R(5, 12)];
    run.plotD = Math.max(pd, R(34, 55));
    run.outr = rnd() < 0.5 ? { p: 1, storeys: run.storeys - 1, wf: 0.4, d: R(4, 6) } : null;
    return run;
  }
  function chapelRun(run, zone) {
    run.type = 'chapel'; run.attached = false; run.n = 1; run.w = R(11, 15); run.bd = R(18, 24); run.plotD = run.bd + R(3, 8);
    run.storeys = 1; run.sh = R(6.5, 8); run.style = STYLE.CHAPEL; run.bay = 3.4;
    [run.kind, run.col] = wallMat(0.35, 0.35, 0.3);
    if (rnd() < 0.25) { run.kind = KIND.STONE; run.col = [1, 1, 1]; }
    run.roofKind = KIND.SLATE; run.roofCol = slateCol(); run.pitch = 45; run.frontGable = true; run.sb = R(2, 5); run.gap = [3, 6];
    return run;
  }
  function schoolRun(run, zone) {
    run.type = 'school'; run.attached = false; run.n = 1; run.w = R(28, 40); run.bd = R(12, 15); run.plotD = run.bd + R(10, 20);
    run.storeys = 2; run.sh = R(4.2, 4.8); run.style = STYLE.CHAPEL; run.bay = 3.2;
    run.kind = KIND.BRICK; run.col = brickCol(); run.roofKind = KIND.SLATE; run.roofCol = slateCol(); run.pitch = 45; run.sb = R(4, 8); run.gap = [3, 6];
    return run;
  }
  function warehouseRun(run, zone, ind) {
    run.type = 'warehouse'; run.attached = false; run.n = Math.floor(R(1, 3)); run.w = R(14, 32); run.bd = R(14, 28);
    run.plotD = run.bd + R(2, 12);
    run.storeys = Math.floor(R(2, 5.5)); run.sh = R(3.0, 3.6); run.style = STYLE.WAREHOUSE; run.bay = R(3.2, 4.5);
    [run.kind, run.col] = wallMat(0.65, 0.3, 0.05);
    if (rnd() < 0.4) run.col = sootBrickCol();
    run.roofKind = KIND.SLATE; run.roofCol = slateCol(); run.pitch = R(24, 34); run.frontGable = rnd() < 0.6; run.gap = [0, 4];
    run.stack = ind > 0.2 ? 0.35 : 0.12;
    return run;
  }

  // ------------------------------------------------------------------ frontage fill
  const chimneysInd = [], chimneysHouse = [], tallCands = [];
  const stats = { plots: 0, houses: 0 };
  const records = [];

  function heights(rec, prev) {
    const cs = rec.body;
    let gmax = -Infinity, gmin = Infinity;
    for (const c of cs) { const g = ground(c[0], c[1]); gmax = Math.max(gmax, g); gmin = Math.min(gmin, g); }
    let floor = gmax + rec.run.raise;
    if (prev && prev.floor >= gmax + 0.05 && prev.floor - floor < 0.75 && prev.run === rec.run) floor = prev.floor;
    rec.floor = floor; rec.base = gmin - 0.8;
    rec.eaves = floor + rec.storeys * rec.sh + 0.4;
    const span = rec.run.frontGable ? rec.w : rec.bd;
    rec.rh = (span / 2) * Math.tan(rec.pitch * DEG);
    rec.ridge = rec.eaves + rec.rh;
  }

  function fillSide(st, side) {
    if (st.rail) return;
    const Ln = st.line;
    const fo = st.hw + st.pave;
    let t = R(1, 6), run = null, prev = null;
    const recs = [];
    while (t < Ln.len - 4) {
      const p0 = Ln.at(t), d0 = Ln.dir(t);
      const N0 = [-d0[1] * side, d0[0] * side];
      const probe = [p0[0] + N0[0] * (fo + 6), p0[1] + N0[1] * (fo + 6)];
      let zone = zoneAt(probe[0], probe[1]);
      if (st.zone) zone = st.zone.region.contains(probe[0], probe[1]) ? (st.zone.ch.rural ? st.zone : zone === st.zone ? zone : null) : null;
      else if (!zone && st.rank === 0 && fringe.region.contains(probe[0], probe[1])) zone = fringe;
      if (!zone) { t += 8; run = null; prev = null; continue; }
      if (zone.ch.rural) {
        // villages thin out from the green; the fringe thins out with distance from the town
        const f = zone === fringe ? distZone(probe[0], probe[1]) / FRINGE : Math.hypot(probe[0] - zone.center[0], probe[1] - zone.center[1]) / zone.r;
        const keep = zone === fringe ? (st.lane ? 0.55 : 0.85) * (1 - f) ** 1.3 : 1 - 0.65 * f * f;
        if (fbm(probe[0] / 70 + 5.5, probe[1] / 70 - 2.2, 2) > keep + 0.25 || rnd() > keep + 0.15) { t += R(8, 30); run = null; prev = null; continue; }
      } else {
        // ragged outer edge of the built-up area (ribbon development survives along main roads)
        const ef = edgeFrac(probe[0], probe[1]);
        const dense = zone.ch.type === 'working' || zone.ch.type === 'commercial';
        if (ef < (dense ? 0.6 : 1) && fbm(probe[0] / 110 + 3.3, probe[1] / 110 + 1.7, 3) < (1 - ef) * (st.rank <= 1 ? 0.6 : 1.5) - 0.05) { t += 10; run = null; prev = null; continue; }
      }
      // development clusters in the thinner suburbs
      const dens = zone.ch.type === 'working' || zone.ch.type === 'commercial' ? 1 : zone.density + (st.rank <= 1 ? 0.2 : 0);
      if (dens < 0.97) {
        const n = fbm(probe[0] / 320 + 7.1, probe[1] / 320 - 3.3, 3);
        if (n > dens * 0.78 + 0.12) { t += 12; run = null; prev = null; continue; }
      }
      if (!run || run.n <= 0 || run.zone !== zone) { run = newRun(zone, st, probe, side); prev = null; }
      if (!run.attached) t += R(run.gap[0], run.gap[1]);
      const w = run.w * (run.type === 'old' ? 1 : R(0.98, 1.02));
      const t1 = t + w;
      if (t1 > Ln.len - 2) break;
      const p1 = Ln.at(t1), d1 = Ln.dir(t1);
      const N1 = [-d1[1] * side, d1[0] * side];
      const f0 = [p0[0] + N0[0] * fo, p0[1] + N0[1] * fo], f1 = [p1[0] + N1[0] * fo, p1[1] + N1[1] * fo];
      // skip wedges on tight curves
      if (Math.hypot(f1[0] - f0[0], f1[1] - f0[1]) < w * 0.7) { t += 3; run.n = 0; prev = null; continue; }
      let ok = null;
      // how deep can the plot go before meeting another street (share the block) or existing plots
      const depthProbe = (f, N) => {
        const maxD = run.plotD * 2 + 8;
        for (let d = 1.0; d < maxD; d += 1.2) {
          const x = f[0] + N[0] * d, z = f[1] + N[1] * d;
          const v = occ.at(x, z);
          if (v === 0) continue;
          if (v === 2 || v === 3) return d - 0.4;
          if (occ.idAt(x, z) !== st.id) return d / 2;
        }
        return Infinity;
      };
      const fm = [(f0[0] + f1[0]) / 2, (f0[1] + f1[1]) / 2], Nm = [(N0[0] + N1[0]) / 2, (N0[1] + N1[1]) / 2];
      const fa = [f0[0] + (f1[0] - f0[0]) * 0.18, f0[1] + (f1[1] - f0[1]) * 0.18], fb = [f0[0] + (f1[0] - f0[0]) * 0.82, f0[1] + (f1[1] - f0[1]) * 0.82];
      const avail = Math.min(depthProbe(fa, N0), depthProbe(fb, N1), depthProbe(fm, Nm));
      const need = run.sb + Math.min(run.bd, 6.5) + 1.2;
      const D0 = Math.min(run.plotD, avail);
      for (const dd of [D0, D0 * 0.8, need + 0.5]) {
        if (dd < need) continue;
        const q = [f0, f1, [f1[0] + N1[0] * dd, f1[1] + N1[1] * dd], [f0[0] + N0[0] * dd, f0[1] + N0[1] * dd]];
        if (occ.free(q, 0.45) && quadOK(q, zone)) { ok = [q, dd]; break; }
      }
      if (!ok) {
        t += run.attached ? 1.5 : 4; run.n = 0; prev = null; continue;
      }
      const [q, dd] = ok;
      occ.mark(q, 2);
      for (let k = Math.floor(t / 5); k <= Math.ceil(t1 / 5) && k < st.used.length; k++) st.used[k] = 1;
      const rec = { st, run, k: run.k++, t, t1, f0, f1, N0, N1, depth: dd, w: Math.hypot(f1[0] - f0[0], f1[1] - f0[1]) };
      rec.sb = run.sb; rec.bd = Math.min(run.bd, dd - run.sb - 1);
      rec.storeys = run.storeys; rec.sh = run.sh; rec.pitch = run.pitch;
      rec.body = [
        [f0[0] + N0[0] * rec.sb, f0[1] + N0[1] * rec.sb], [f1[0] + N1[0] * rec.sb, f1[1] + N1[1] * rec.sb],
        [f1[0] + N1[0] * (rec.sb + rec.bd), f1[1] + N1[1] * (rec.sb + rec.bd)], [f0[0] + N0[0] * (rec.sb + rec.bd), f0[1] + N0[1] * (rec.sb + rec.bd)],
      ];
      rec.shop = rnd() < run.shop;
      heights(rec, prev);
      recs.push(rec);
      prev = rec;
      run.n--;
      t = t1;
      stats.plots++;
      if (zone.ch.rural) stats[zone === fringe ? 'fringePlots' : 'villagePlots'] = (stats[zone === fringe ? 'fringePlots' : 'villagePlots'] || 0) + 1;
    }
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      if (st.rail) break;
      const pr = i > 0 && recs[i - 1].t1 === r.t && recs[i - 1].run.attached && r.run.attached ? recs[i - 1] : null;
      const nx = i < recs.length - 1 && recs[i + 1].t === r.t1 && recs[i + 1].run.attached && r.run.attached ? recs[i + 1] : null;
      records.push([r, pr, nx]);
    }
  }

  const order = [...streets].sort((a, b) => a.rank - b.rank || b.line.len - a.line.len);
  for (const st of order) { fillSide(st, 1); fillSide(st, -1); }

  ph('p_fill');
  const run0col = (kind, col) => (kind === KIND.STUCCO || kind === KIND.TIMBER ? brickCol() : col);
  // ------------------------------------------------------------------ emit buildings
  const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const add2 = (a, n, s) => [a[0] + n[0] * s, a[1] + n[1] * s];
  const nrm2 = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

  const matches = (a, b) => b && Math.abs(a.eaves - b.eaves) < 0.05 && Math.abs(a.bd - b.bd) < 0.3 && Math.abs(a.sb - b.sb) < 0.3 && a.run.frontGable === b.run.frontGable && a.run.roof === b.run.roof;
  const covers = (nb, a) => nb && nb.eaves >= a.eaves - 0.05 && nb.ridge >= a.ridge - 0.05 && nb.sb <= a.sb + 0.3 && nb.sb + nb.bd >= a.sb + a.bd - 0.3;

  function emitRecord(r, pr, nx) {
    const run = r.run;
    const [c0, c1, c2, c3] = r.body;
    const cx = (c0[0] + c2[0]) / 2, cz = (c0[1] + c2[1]) / 2;
    const m = chunks.at(cx, cz);
    const near = run.near;
    const Nb = nrm2([r.N0[0] + r.N1[0], r.N0[1] + r.N1[1]]);
    const frontStyle = r.shop ? STYLE.SHOP : run.style;
    const sideWall = (nb) => {
      if (matches(r, nb)) return [null, false];
      if (covers(nb, r)) return [null, false];
      return [nb ? STYLE.BLANK : (run.attached && run.type !== 'villa' ? STYLE.BLANK : run.style === STYLE.WAREHOUSE ? STYLE.WAREHOUSE : STYLE.HOUSE), true];
    };
    const [s1, g1] = sideWall(nx), [s3, g3] = sideWall(pr);
    let _n = m.ni; const tick = (k) => { stats[k] = (stats[k] || 0) + (m.ni - _n) / 3; _n = m.ni; };
    const common = {
      base: r.base, floor: r.floor, eaves: r.eaves, rh: r.rh, kind: run.kind, col: run.col, roofKind: run.roofKind, roofCol: run.roofCol,
      storeys: r.storeys, sh: r.sh, overhang: near ? run.overhang : 0, soffit: near && (run.type === 'old' || run.zone.ch.type === 'commercial'),
    };

    if (run.type === 'warehouse') {
      // gable-fronted multi-span warehouse
      const spans = run.frontGable ? Math.max(1, Math.round(r.w / R(9, 14))) : 1;
      for (let s = 0; s < spans; s++) {
        const a = s / spans, b = (s + 1) / spans;
        const q = [lerp2(c0, c1, a), lerp2(c0, c1, b), lerp2(c3, c2, b), lerp2(c3, c2, a)];
        const sw = r.w / spans;
        if (run.frontGable) {
          const rh = (sw / 2) * Math.tan(r.pitch * DEG);
          S.building(m, [q[1], q[2], q[3], q[0]], { ...common, overhang: 0, soffit: false, rh, walls: [s === spans - 1 ? STYLE.WAREHOUSE : null, STYLE.WAREHOUSE, s === 0 ? STYLE.WAREHOUSE : null, STYLE.WAREHOUSE], bays: [run.bay, run.bay, run.bay, run.bay] });
        } else {
          S.building(m, q, { ...common, overhang: 0, soffit: false, walls: [STYLE.WAREHOUSE, STYLE.WAREHOUSE, STYLE.WAREHOUSE, STYLE.WAREHOUSE], bays: [run.bay, run.bay, run.bay, run.bay] });
        }
      }
      const back = [lerp2(add2(r.f0, r.N0, r.depth), add2(r.f1, r.N1, r.depth), 0.5)];
      if (rnd() < run.stack) {
        const bp = back[0];
        const p = [bp[0] - Nb[0] * 2.5 + (rnd() - 0.5) * r.w * 0.5, bp[1] - Nb[1] * 2.5];
        const cc = sootBrickCol();
        tallCands.push({ p, score: industryAt(p[0], p[1]) + rnd() * 0.3, emit: (H) => chimneysInd.push(S.factoryStack(m, p, ground(p[0], p[1]) - 0.5, H, R(1.3, 1.9), cc)), fallback: null });
      }
      return;
    }

    if (run.type === 'chapel') {
      S.building(m, [c1, c2, c3, c0], { ...common, rh: (r.w / 2) * Math.tan(r.pitch * DEG), overhang: near ? 0.3 : 0, walls: [STYLE.CHAPEL, STYLE.BLANK, STYLE.CHAPEL, STYLE.CHAPEL], bays: [3.4, 3.4, 3.4, r.w / 2] });
      if (r.sb > 1) S.patch(m, [c0, c1, r.f1, r.f0], [c0, c1, r.f1, r.f0].map((p) => ground(p[0], p[1]) + 0.1), KIND.YARD, yardCol(), r.w, r.sb);
      const yd = r.depth - r.sb - r.bd;
      if (yd > 1) { const yq = [c3, c2, add2(r.f1, r.N1, r.depth), add2(r.f0, r.N0, r.depth)]; S.patch(m, yq, yq.map((p) => ground(p[0], p[1]) + 0.1), KIND.GARDEN, gardenCol(), r.w, yd); }
      return;
    }

    if (run.frontGable) {
      // ridge perpendicular to the street (timber-framed Tudor houses)
      const rh = (r.w / 2) * Math.tan(r.pitch * DEG);
      S.building(m, [c1, c2, c3, c0], { ...common, rh, ridgeFix: true, walls: [s1 === null ? null : STYLE.BLANK, STYLE.HOUSE, s3 === null ? null : STYLE.BLANK, frontStyle], bays: [3, r.bay, 3, r.bay], gables: [true, true] });
    } else {
      S.building(m, r.body, {
        ...common, roof: run.roof,
        walls: [frontStyle, s1, run.type === 'villa' ? STYLE.HOUSE : STYLE.HOUSE, s3], bays: [r.shop ? R(3.2, 4.5) : run.bay, 3.2, run.bay, 3.2],
        gables: [g1, g3], frontParapet: run.frontParapet,
      });
    }
    stats.houses++;
    tick('t_body');

    // shopfront joinery: pilasters, fascia board, sun-blinds on some
    if (r.shop && near && !run.frontGable) {
      const out = [-Nb[0], -Nb[1]];
      const fy0 = r.floor + r.sh - 0.8, fy1 = r.floor + r.sh - 0.08;
      const e0 = lerp2(c0, c1, 0.004), e1 = lerp2(c0, c1, 0.996);
      const fq = [e0, e1, add2(e1, out, 0.26), add2(e0, out, 0.26)];
      const fcol = pick([[0.45, 0.9, 0.55], [1.2, 0.45, 0.4], [0.35, 0.35, 0.4], [0.6, 0.5, 0.35], [0.3, 0.45, 0.8]]);
      S.box(m, fq, fy0, fy1, KIND.LEAD, fcol, KIND.LEAD, fcol);
      m.poly(fq.map((p) => [p[0], fy0, p[1]]), [[0, 0], [1, 0], [1, 1], [0, 1]], 1, fcol, [KIND.SOOT, 0, 0, 0], [0, -1, 0]);
      const wlen = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
      for (const t of [0.2 / wlen, 1 - 0.2 / wlen]) {
        const pc = add2(lerp2(c0, c1, t), out, 0.1);
        S.box(m, S.rectQ(pc, nrm2([c1[0] - c0[0], c1[1] - c0[1]]), 0.42, 0.2), r.floor - 0.2, fy0, run.kind === KIND.STUCCO ? KIND.STUCCO : KIND.LEAD, run.kind === KIND.STUCCO ? run.col : fcol, null);
      }
      if (rnd() < 0.16) {
        const a0 = add2(e0, out, 0.26), a1 = add2(e1, out, 0.26), dep = R(1.4, 2.0);
        S.sheet(m, [[a0[0], fy0, a0[1]], [a1[0], fy0, a1[1]], [a1[0] + out[0] * dep, fy0 - 0.85, a1[1] + out[1] * dep], [a0[0] + out[0] * dep, fy0 - 0.85, a0[1] + out[1] * dep]], KIND.CANVAS, [R(0.85, 1.15), R(0.85, 1.1), R(0.85, 1.05)], wlen, dep);
      }
    }

    // chimney stacks on the party walls / gable ends
    const stacks = [];
    if (run.type === 'villa') {
      const r0 = lerp2(lerp2(c0, c3, 0.5), lerp2(c1, c2, 0.5), 0.22), r1 = lerp2(lerp2(c0, c3, 0.5), lerp2(c1, c2, 0.5), 0.78);
      stacks.push([r0, r.ridge - (run.roof === 'hip' ? 1.2 : 0.4)], [r1, r.ridge - (run.roof === 'hip' ? 1.2 : 0.4)]);
      if (run.semi) stacks.push([lerp2(lerp2(c0, c3, 0.5), lerp2(c1, c2, 0.5), 0.5), r.ridge]);
    } else if (!run.frontGable) {
      const e3 = lerp2(c0, c3, 0.5), e1 = lerp2(c1, c2, 0.5);
      if (r.k % 2 === 0 || (near && !pr)) stacks.push([e3, Math.max(r.ridge, pr ? pr.ridge : 0)]);
      if (near && !nx && r.k % 2 === 1) stacks.push([e1, r.ridge]);
      if (near && r.w > 7.5 && rnd() < 0.6) stacks.push([lerp2(e3, e1, 0.5), r.ridge]);
    } else {
      stacks.push([lerp2(lerp2(c2, c3, 0.5), lerp2(c0, c1, 0.5), 0.3), r.ridge - 0.8]);
    }
    const dirU = nrm2([c1[0] - c0[0], c1[1] - c0[1]]);
    for (const [p, yTop] of stacks) {
      const h = yTop + R(0.8, 1.3);
      const top = S.stack(m, p, Nb, R(1.0, 1.5), 0.62, r.ridge - 1.4, h, run.kind === KIND.STUCCO ? brickCol() : run.col, run.kind === KIND.STUCCO ? KIND.BRICK : (run.kind === KIND.TIMBER ? KIND.BRICK : run.kind), near && rnd() < 0.6 ? (rnd() < 0.5 ? 2 : 3) : 0, near);
      chimneysHouse.push([p[0], top, p[1], near ? 1 : 0]);
    }
    void dirU;
    tick('t_stacks');

    // bay windows
    if (run.bayWin && r.sb >= 1.2 && (near || run.type === 'villa')) {
      const bs = rnd() < 0.5 ? 2 : 1;
      const a0 = lerp2(c0, c1, 0.5), a1 = lerp2(c0, c1, 0.92);
      const q = [add2(a0, r.N0, -0.8), add2(a1, r.N1, -0.8), a1, a0];
      S.building(m, q, { ...common, roof: 'flat', parapet: 0, overhang: 0, eaves: r.floor + bs * r.sh + 0.1, storeys: bs, walls: [STYLE.CHAPEL, near ? STYLE.CHAPEL : null, null, near ? STYLE.CHAPEL : null], bays: [2.2, 0.8, 1, 0.8] });
    }

    tick('t_bay');
    // rear outrigger, scullery lean-to
    const yardD = r.depth - r.sb - r.bd;
    const o = run.outr;
    let backEdge = [c3, c2];
    if (o && rnd() < o.p * (near ? 1 : 0.8) && yardD > 3) {
      const right = r.k % 2 === 0;
      const wf = Math.min(o.wf, 0.8);
      const a = right ? 1 - wf : 0, b = right ? 1 : wf;
      const od = Math.min(o.d, yardD - 1.5);
      if (od > 2) {
        const q0 = lerp2(c3, c2, a), q1 = lerp2(c3, c2, b);
        const q3 = add2(q0, Nb, od), q2 = add2(q1, Nb, od);
        const os = Math.min(o.storeys, r.storeys);
        const eo = Math.min(r.floor + os * r.sh + 0.3, r.eaves - 0.2);
        const ow = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]);
        const party = (nb) => nb && nb.run === run && nb.run.outr ? null : STYLE.BLANK;
        // edges: e0 q0→q3, e1 q3→q2 (rear), e2 q2→q1, e3 q1→q0 (against house)
        const wallL = right ? STYLE.SMALL : party(pr);
        const wallR = right ? party(nx) : STYLE.SMALL;
        let gmin = Math.min(ground(q3[0], q3[1]), ground(q2[0], q2[1]), r.base + 0.8);
        S.building(m, [q0, q3, q2, q1], {
          ...common, base: gmin - 0.8, eaves: eo, storeys: os, rh: (ow / 2) * Math.tan(r.pitch * DEG), overhang: 0, soffit: false,
          walls: [wallL, STYLE.SMALL, wallR, null], bays: [2.6, 2.4, 2.6, 2], gables: [true, false],
        });
        if (near && rnd() < 0.5) {
          const sp = lerp2(q3, q2, 0.5);
          const top = S.stack(m, add2(sp, Nb, -0.4), Nb, 0.9, 0.55, eo, eo + (ow / 2) * Math.tan(r.pitch * DEG) + R(0.6, 1.0), run.col, run.kind === KIND.STUCCO || run.kind === KIND.TIMBER ? KIND.BRICK : run.kind, 1);
          chimneysHouse.push([sp[0], top, sp[1], 0]);
        }
        if (near && rnd() < run.lean && yardD - od > 4) {
          const l3 = add2(q3, Nb, 2.2), l2 = add2(q2, Nb, 2.2);
          S.leanTo(m, [q3, q2, l2, l3], { base: gmin - 0.6, floor: r.floor, hi: r.floor + 2.7, lo: r.floor + 2.1, kind: run.kind === KIND.TIMBER ? KIND.BRICK : run.kind, col: run.col, roofKind: run.roofKind, roofCol: run.roofCol });
        }
      }
    }

    tick('t_outr');
    // yard / garden behind, front garden
    if (yardD > 0.8) {
      const b0 = add2(r.f0, r.N0, r.depth), b1 = add2(r.f1, r.N1, r.depth);
      const yq = [backEdge[0], backEdge[1], b1, b0];
      const ys = yq.map((p) => ground(p[0], p[1]) + 0.12);
      const garden = run.zone.ch.type === 'suburb' || run.zone.ch.type === 'village' || run.type === 'villa';
      if (garden && yardD > 12 && rnd() < 0.25) {
        // long back garden: half vegetable plot, half lawn / fruit trees
        const mq0 = lerp2(backEdge[0], b0, 0.5), mq1 = lerp2(backEdge[1], b1, 0.5);
        S.patch(m, [backEdge[0], backEdge[1], mq1, mq0], [backEdge[0], backEdge[1], mq1, mq0].map((p) => ground(p[0], p[1]) + 0.12), KIND.GARDEN, gardenCol(), r.w, yardD / 2, 0);
        S.patch(m, [mq0, mq1, b1, b0], [mq0, mq1, b1, b0].map((p) => ground(p[0], p[1]) + 0.12), KIND.GARDEN, gardenCol(), r.w, yardD / 2, 1);
      } else
      if (garden) S.patch(m, yq, ys, KIND.GARDEN, gardenCol().map((v) => v * 1.0), r.w, yardD, rnd() < 0.35 ? 1 : 0);
      else S.patch(m, yq, ys, KIND.YARD, yardCol(), r.w, yardD);
    }
    if (r.sb > 1.0) {
      const fq = [c0, c1, r.f1, r.f0];
      S.patch(m, fq, fq.map((p) => ground(p[0], p[1]) + 0.14), KIND.GARDEN, gardenCol(), r.w, r.sb, 0);
    }
  }

  for (const [r, pr, nx] of records) emitRecord(r, pr, nx);
  stats.t_all = chunks.tris;

  ph('p_emit');
  // ------------------------------------------------------------------ special sites, farmsteads
  const col = {
    brick: brickCol, buff: buffCol, soot: sootBrickCol, slate: () => { D0 = { tone: R(0.8, 1.2), hue: rnd(), tile: 0.5, stucco: 0.5 }; return slateCol(); }, tile: tileCol,
    yard: (k = 1) => yardCol().map((v) => v * k),
  };
  const SITES = makeSites({ S, KIND, STYLE, ground, rnd, R, pick, col, chunkAt: (p) => chunks.at(p[0], p[1]), chimneysInd, chimneysHouse, DEG,
    tall: (m, p, y0, H, r, c, fixed) => tallCands.push({ p, score: fixed ? 10 + rnd() : 1 + rnd() * 0.3, fixedH: H, emit: (h) => chimneysInd.push(S.factoryStack(m, p, y0, h, r, c)), fallback: null }) });
  for (const site of sites) SITES[site.type](site.q);
  for (const f of farms) SITES.farm(f, FU);
  stats.t_sites = chunks.tris - stats.t_all;
  stats.sites = sites.reduce((o, st) => { o[st.type] = (o[st.type] || 0) + 1; return o; }, {}); stats.gas = sites.filter((st) => st.type === 'gasworks').map((st) => st.q[0].map(Math.round)); stats.farms = farms.length; stats.villages = villages.map((v) => v.name + ':' + (v.main ? Math.round(v.main.line.len) : 0)).join(' ');

  // Bargate: in 1912 still joined by buildings on both flanks
  {
    const [bx, bz] = L.bargate;
    for (const s0 of [-1, 1]) {
      const xa = bx + s0 * 8.1, xb = bx + s0 * 24;
      const q = s0 < 0 ? [[xb, bz - 6.5], [xa, bz - 6.5], [xa, bz + 6.5], [xb, bz + 6.5]] : [[xa, bz - 6.5], [xb, bz - 6.5], [xb, bz + 6.5], [xa, bz + 6.5]];
      const gs = q.map((p) => ground(p[0], p[1]));
      const floor = Math.max(...gs) + 0.2, storeys = 4, sh = 3.2, eaves = floor + storeys * sh + 0.4;
      D0 = district(bx, bz);
      const m = chunks.at(bx + s0 * 14, bz);
      S.building(m, q, {
        base: Math.min(...gs) - 0.8, floor, eaves, rh: 6.5 * Math.tan(30 * DEG), kind: s0 < 0 ? KIND.STUCCO : KIND.BRICK, col: s0 < 0 ? [0.6, 0.56, 0.47] : brickCol(),
        roofKind: KIND.SLATE, roofCol: slateCol(), storeys, sh, walls: [STYLE.SHOP, s0 < 0 ? null : STYLE.BLANK, STYLE.SHOP, s0 < 0 ? STYLE.BLANK : null], bays: [3, 3, 3, 3], frontParapet: 0.8,
      });
    }
  }

  ph('p_sitesEmit');
  // ------------------------------------------------------------------ backland: courts, workshops, warehouses, allotments, yards
  for (const zone of zones) {
    const ch = zone.ch, type = ch.type;
    const dense = type === 'working' || type === 'commercial';
    const [x0, x1, z0, z1] = zone.region.box;
    const b = zone.bearing * DEG;
    const A = [Math.sin(b), -Math.cos(b)], C = [Math.cos(b), Math.sin(b)];
    const rect = (px, pz, w, d) => {
      const hwv = [A[0] * w / 2, A[1] * w / 2], hdv = [C[0] * d / 2, C[1] * d / 2];
      return [[px - hwv[0] - hdv[0], pz - hwv[1] - hdv[1]], [px + hwv[0] - hdv[0], pz + hwv[1] - hdv[1]], [px + hwv[0] + hdv[0], pz + hwv[1] + hdv[1]], [px - hwv[0] + hdv[0], pz - hwv[1] + hdv[1]]];
    };
    const step = dense ? 8 : type === 'village' ? 40 : 22;
    for (let z = z0; z < z1; z += step) {
      for (let x = x0; x < x1; x += step) {
        const px = x + rnd() * step, pz = z + rnd() * step;
        if (occ.at(px, pz) !== 0 || !zone.region.contains(px, pz)) continue;
        const ind = industryAt(px, pz);
        D0 = district(px, pz);
        if (dense) {
          if (rnd() > 0.9) continue;
          const inWalls = zone.name === 'Old Town' && walled.contains(px, pz);
          const big = !inWalls && rnd() < ind + 0.08;
          let w = big ? R(14, 30) : R(6, 15), d = big ? R(12, 22) : R(5, 11);
          let q = null;
          for (let k = 0; k < 3; k++) {
            const qq = rect(px, pz, w, d);
            if (occ.free(qq, -0.8) && quadOK(qq, zone)) { q = qq; break; }
            w *= 0.72; d *= 0.8;
          }
          if (!q || w < 4.5 || d < 4) continue;
          occ.mark(q, 2);
          const m = chunks.at(px, pz);
          const storeys = big ? Math.floor(R(2, 5)) : inWalls ? Math.floor(R(2, 4)) : Math.floor(R(1, 2.7));
          const sh = R(3, 3.6);
          const gs = q.map((p) => ground(p[0], p[1]));
          const floor = Math.max(...gs) + 0.1, base = Math.min(...gs) - 0.8, eaves = floor + storeys * sh + 0.3;
          let kind, col;
          [kind, col] = inWalls ? wallMat(0.45, 0.15, 0.4) : wallMat(0.7, 0.25, 0.05);
          if (!inWalls && rnd() < 0.5) col = sootBrickCol();
          const long = w > d;
          const cq = long ? q : [q[1], q[2], q[3], q[0]];
          const span = long ? d : w;
          const pitch = inWalls ? R(35, 48) : R(22, 34);
          const roofKind = rnd() < (inWalls ? 0.65 : 0.88) ? KIND.SLATE : KIND.TILE;
          const style = inWalls ? STYLE.SMALL : STYLE.WAREHOUSE;
          const roofType = inWalls ? 'gable' : big ? pick(['gable', 'gable', 'saw', 'iron', 'flat']) : pick(['gable', 'gable', 'gable', 'iron']);
          if (roofType === 'saw') {
            S.building(m, cq, { base, floor, eaves, rh: 0, kind, col, roofKind, roofCol: slateCol(), storeys, sh, walls: [style, style, style, style], bays: [3.2, 3.2, 3.2, 3.2], roof: 'none' });
            S.sawtooth(m, cq, eaves, R(2.2, 3.2), Math.max(2, Math.round((long ? w : d) / 6.5)), rnd() < 0.5 ? KIND.SLATE : KIND.IRON, rnd() < 0.5 ? slateCol() : [R(0.8, 1.3), R(0.7, 1.1), R(0.6, 1)]);
          } else {
            const rk = roofType === 'iron' ? KIND.IRON : roofKind, rc = roofType === 'iron' ? [R(0.7, 1.4), R(0.65, 1.2), R(0.55, 1.1)] : roofKind === KIND.SLATE ? slateCol() : tileCol();
            S.building(m, cq, { base, floor, eaves, rh: (span / 2) * Math.tan((roofType === 'iron' ? 18 : pitch) * DEG), kind, col, roofKind: rk, roofCol: rc, storeys, sh, walls: [style, style, style, style], bays: [3.2, 3.2, 3.2, 3.2], roof: roofType === 'flat' ? 'flat' : 'gable', parapet: 0.5, parapetAll: true });
          }
          const domestic = () => {
            const sp = lerp2(cq[0], cq[1], R(0.2, 0.8));
            const cp = lerp2(sp, lerp2(cq[3], cq[2], 0.5), 0.5);
            const top = S.stack(m, cp, C, 1.2, 0.6, eaves, eaves + (span / 2) * Math.tan(pitch * DEG) + 1, run0col(kind, col), kind === KIND.STUCCO ? KIND.BRICK : kind, zone.ch.near ? 2 : 0);
            chimneysHouse.push([cp[0], top, cp[1], 1]);
          };
          const sp = [px + C[0] * (d / 2 + 2.2), pz + C[1] * (d / 2 + 2.2)];
          if (!inWalls && big && ind > 0.05 && occ.at(sp[0], sp[1]) !== 1) {
            const cc = sootBrickCol(), rr = R(1.1, 1.7);
            tallCands.push({ p: sp, score: ind + rnd() * 0.3, emit: (H) => chimneysInd.push(S.factoryStack(m, sp, ground(sp[0], sp[1]) - 0.5, H, rr, cc)), fallback: domestic });
          } else if (inWalls || rnd() < 0.5) {
            domestic();
          }
        } else if (rnd() < (type === 'suburb' ? 0.45 : 0.25)) {
          // allotments / market gardens / orchards
          const w = R(20, 40), d = R(16, 30);
          const q = rect(px, pz, w, d);
          if (!occ.free(q, -2) || !quadOK(q, zone)) continue;
          occ.mark(q, 2);
          S.patch(chunks.at(px, pz), q, q.map((p) => ground(p[0], p[1]) + 0.1), KIND.GARDEN, gardenCol(), Math.min(w, 25), d, rnd() < 0.7 ? 1 : 0);
        }
      }
    }
    // leftover ground between buildings: paved/cinder yards (dense), gardens next to houses,
    // and paddocks / market gardens / rough grazing elsewhere so the zone outline never shows as bare ground
    const cell = dense ? 7 : 10;
    const cs = Math.cos(b), sn = Math.sin(b);
    let a0 = Infinity, a1 = -Infinity, c0 = Infinity, c1 = -Infinity;
    for (const p of zone.poly) { const a = p[0] * A[0] + p[1] * A[1], c = p[0] * C[0] + p[1] * C[1]; a0 = Math.min(a0, a); a1 = Math.max(a1, a); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
    void cs; void sn;
    for (let c = c0; c < c1; c += cell) {
      for (let a = a0; a < a1; a += cell) {
        const px = A[0] * a + C[0] * c, pz = A[1] * a + C[1] * c;
        if (occ.at(px, pz) !== 0) continue;
        const q = rect(px, pz, cell, cell);
        if (!occ.free(q, 0)) continue;
        if (!dense) {
          let near = false;
          for (const [ox, oz] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) { const v = occ.at(px + A[0] * ox + C[0] * oz, pz + A[1] * ox + C[1] * oz); if (v === 2) { near = true; break; } }
          if (!near) {
            // a 30 m field cell instead, if it is all free
            const ia = Math.round(a / cell), ic = Math.round(c / cell);
            if (ia % 3 !== 0 || ic % 3 !== 0) continue;
            const fq = rect(px + (A[0] + C[0]) * cell, pz + (A[1] + C[1]) * cell, cell * 3, cell * 3);
            if (!occ.free(fq, 0) || !quadOK(fq, zone)) continue;
            occ.mark(fq, 2);
            const fn = fbm(px / 160, pz / 160, 2), k = R(0.85, 1.15);
            const tint = fn < 0.45 ? [0.2 * k, 0.28 * k, 0.09 * k] : fn < 0.58 ? [0.25 * k, 0.29 * k, 0.12 * k] : fn < 0.68 ? [0.22 * k, 0.17 * k, 0.1 * k] : [0.14 * k, 0.2 * k, 0.07 * k];
            S.patch(chunks.at(px, pz), fq, fq.map((p) => ground(p[0], p[1]) + 0.08), KIND.GARDEN, tint, cell * 3, cell * 3, fn > 0.6 && fn < 0.68 ? 1 : 0);
            continue;
          }
        }
        if (!quadOK(q, zone)) continue;
        occ.mark(q, 2);
        const m = chunks.at(px, pz);
        if (dense) S.patch(m, q, q.map((p) => ground(p[0], p[1]) + 0.1), KIND.YARD, yardCol(), cell, cell);
        else S.patch(m, q, q.map((p) => ground(p[0], p[1]) + 0.1), KIND.GARDEN, gardenCol(), cell, cell, rnd() < 0.3 ? 1 : 0);
      }
    }
  }

  // a few notable tall stacks only, clustered at the real industrial sites, heights 15–45 m
  {
    tallCands.sort((a, b) => b.score - a.score);
    const chosen = [];
    for (const c of tallCands) {
      const ok = chosen.length < 18 && (c.score >= 10 || c.score > 0.25) && chosen.every((o) => Math.hypot(o.p[0] - c.p[0], o.p[1] - c.p[1]) > (c.score >= 10 ? 12 : 70));
      if (ok) { chosen.push(c); c.emit(c.fixedH ?? 15 + 30 * Math.min(1, Math.max(0, c.score - 0.2)) * R(0.6, 1.0) + R(0, 6)); }
      else if (c.fallback) c.fallback();
    }
    stats.tallStacks = chosen.length;
  }
  ph('p_backland');
  // ------------------------------------------------------------------ streets surfaces
  const inTownish = (x, z) => zones.some((zz) => zz.region.sdist(x, z) > -25);
  let roadTris = 0;
  const furn = { lamps: [], poles: [], carts: [], barrows: [], wires: [] };
  let poleAcc = 0;
  for (const st of streets) {
    const Ln = st.line;
    const segL = st.lane ? 24 : st.rank <= 1 ? 10 : 15;
    let prevPoles = null, sinceLamp = rnd() * 30;
    const nSeg = Math.max(1, Math.round(Ln.len / segL));
    const dl = Ln.len / nSeg;
    const yOff = 0.14 + (3 - st.rank) * 0.025;
    const f = st.hw + st.pave;
    for (let i = 0; i < nSeg; i++) {
      const ta = i * dl, tb = (i + 1) * dl, tm = (ta + tb) / 2;
      const pm = Ln.at(tm);
      // drawn where it serves buildings (or main roads within the town)
      let used = false;
      const k0 = Math.max(0, Math.floor((ta - 45) / 5)), k1 = Math.min(st.used.length - 1, Math.ceil((tb + 45) / 5));
      for (let k = k0; k <= k1; k++) if (st.used[k]) { used = true; break; }
      if (!used && !st.rail && !st.lane && !(st.rank === 0 && inTownish(pm[0], pm[1]))) { prevPoles = null; continue; }
      if (st.lane && zoneAt(pm[0], pm[1])) continue;
      if (!roadOK(pm[0], pm[1])) continue;
      if (st.rank >= 2 && terrain.parks.some((p) => p.contains(pm[0], pm[1]))) continue;
      const pa = Ln.at(ta), pb = Ln.at(tb), da = Ln.dir(ta, 4), db = Ln.dir(tb, 4);
      const na = [-da[1], da[0]], nb = [-db[1], db[0]];
      const dm = Ln.dir(tm, 4), nm = [-dm[1], dm[0]];
      const blocked = (s) => {
        for (const tt of [ta + dl * 0.2, tm, tb - dl * 0.2]) {
          const p = Ln.at(tt);
          const x = p[0] + nm[0] * s * (st.hw + st.pave * 0.5), z = p[1] + nm[1] * s * (st.hw + st.pave * 0.5);
          const id = occ.idAt(x, z);
          if (occ.at(x, z) === 1 && id !== st.id) return true;
        }
        return false;
      };
      let flags = st.tram ? 1 : 0;
      if (st.pave <= 0.1 || blocked(-1)) flags |= 2;
      if (st.pave <= 0.1 || blocked(1)) flags |= 4;
      const P = [[pa[0] - na[0] * f, pa[1] - na[1] * f], [pb[0] - nb[0] * f, pb[1] - nb[1] * f], [pb[0] + nb[0] * f, pb[1] + nb[1] * f], [pa[0] + na[0] * f, pa[1] + na[1] * f]];
      const m = chunks.at(pm[0], pm[1]);
      const kind = st.setts ? KIND.SETTS : KIND.MACADAM;
      let tint = st.setts ? [0.2, 0.198, 0.2] : [0.12, 0.112, 0.1];
      if (st.pale) tint = [0.2, 0.18, 0.145];
      if (st.lane) { const k = R(0.85, 1.05); tint = [0.2 * k, 0.18 * k, 0.14 * k]; }
      if (st.rail) { tint = [0.15, 0.135, 0.115]; flags = 1 | 2 | 4; }
      const yo = st.rail ? 0.1 : st.lane ? 0.12 : yOff;
      m.poly(P.map((p) => [p[0], ground(p[0], p[1]) + yo, p[1]]), [[ta, -f], [tb, -f], [tb, f], [ta, f]], st.rail ? f + 2 : st.hw, tint, [kind, 0, Math.round(st.pave * 10), flags], [0, 1, 0]);
      roadTris += 2;

      // street furniture in the older, nearer parts of town
      const zm = zoneAt(pm[0], pm[1]);
      if (!st.rail && !st.lane && zm && zm.ch.near) {
        const gy = ground(pm[0], pm[1]) + yOff + 0.02;
        sinceLamp += dl;
        if (st.rank <= 2 && sinceLamp > 32) {
          sinceLamp = rnd() * 6;
          const side = (i % 2) ? 1 : -1;
          if (!(flags & (side < 0 ? 2 : 4)) && st.pave > 0.8) furn.lamps.push([pm[0] + nm[0] * side * (st.hw + 0.45), gy + 0.12, pm[1] + nm[1] * side * (st.hw + 0.45), 0]);
        }
        if (st.rank <= 2 && rnd() < (zm.ch.type === 'commercial' ? 0.05 : 0.025)) {
          const side = rnd() < 0.5 ? -1 : 1, ry = Math.atan2(-dm[1], dm[0]) + Math.PI / 2 + (rnd() < 0.5 ? Math.PI : 0) + (rnd() - 0.5) * 0.3;
          (rnd() < 0.5 ? furn.carts : furn.barrows).push([pm[0] + nm[0] * side * (st.hw - 1.1), gy, pm[1] + nm[1] * side * (st.hw - 1.1), ry]);
        }
      }
      if (st.tram) {
        poleAcc += dl;
        if (poleAcc >= 34) {
          poleAcc = 0;
          const gy = ground(pm[0], pm[1]) + yOff;
          const L = [pm[0] - nm[0] * (st.hw + 0.35), pm[1] - nm[1] * (st.hw + 0.35)], Rr = [pm[0] + nm[0] * (st.hw + 0.35), pm[1] + nm[1] * (st.hw + 0.35)];
          furn.poles.push([L[0], gy, L[1], Math.atan2(-nm[1], nm[0])], [Rr[0], gy, Rr[1], Math.atan2(nm[1], -nm[0])]);
          const yS = gy + 6.9;
          furn.wires.push(L[0], yS, L[1], Rr[0], yS, Rr[1]);
          const cur = [-1.7, -1.2, 1.2, 1.7].map((c) => [pm[0] + nm[0] * c, gy + 6.35, pm[1] + nm[1] * c]);
          for (const c of cur) furn.wires.push(c[0], yS, c[2], c[0], c[1], c[2]);
          if (prevPoles) for (let k = 0; k < 4; k++) furn.wires.push(...prevPoles[k], ...cur[k]);
          prevPoles = cur;
        }
      } else prevPoles = null;
    }
  }

  ph('p_streets');
  // ------------------------------------------------------------------ assemble
  const material = townMaterial(THREE, ctx.textures);
  const group = new THREE.Group();
  group.name = 'town';
  let tris = 0;
  for (const [key, tm] of chunks.map) {
    if (tm.ni === 0) continue;
    group.add(tm.toMesh(THREE, material, 'town:' + key));
    tris += tm.tris;
  }
  group.add(walls.group);
  tris += walls.tris;
  const furniture = buildFurniture(ctx, furn);
  group.add(furniture.group);
  tris += furniture.tris;
  stats.furnitureTris = furniture.tris; stats.lamps = furn.lamps.length; stats.poles = furn.poles.length;

  // chimney tops for the smoke system: all industrial stacks + a sample of house stacks (near town first)
  const chimneys = chimneysInd.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const houses = chimneysHouse.map((c) => ({ c, w: (c[3] ? 3 : 1) * rnd() }));
  houses.sort((a, b) => b.w - a.w);
  for (const h of houses.slice(0, Math.max(0, 360 - chimneys.length))) chimneys.push(new THREE.Vector3(h.c[0], h.c[1], h.c[2]));

  ph('p_assemble');
  const info = { ...stats, PH, tris, roadTris, draws: group.children.length, plots: stats.plots, houses: stats.houses, streets: streets.length, industrialStacks: chimneysInd.length, ms: Math.round(performance.now() - t0) };
  console.log('[town]', JSON.stringify(info));
  return { group, chimneys, info };
}
