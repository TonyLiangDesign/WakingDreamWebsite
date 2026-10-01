import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Mesher, col, shade } from './kit.js';
import { hullGeometry } from './hull.js';
import { shipMats, linerMats, funnelMaterial } from './materials.js';
import { heroLinerDetails } from './liner-detail.js';
import { flagsMesh, hullNames } from './dress.js';
import { tryRaft } from './raft.js';
import * as P from './parts.js';

const { PAL } = P;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// smooth-shaded hull with crisp colour boundaries
export function smoothHull(g) {
  const src = g.clone();
  src.deleteAttribute('normal');
  const merged = mergeVertices(src, 1e-3);
  merged.computeVertexNormals();
  return merged.toNonIndexed();
}

function steps(a, b, max) {
  const n = Math.max(1, Math.ceil(Math.abs(b - a) / max));
  const out = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}

// ------------------------------------------------------------------ liner
// Spec (see specs.js): hull params, `shell` sections along the hull top ([x0, x1, h, kind]
// kind 'raised' = forecastle / bridge deck / poop plated to h; 'well' = open deck at the
// base sheer with plated bulwark h), `tiers`/`houses` slabs (off = height above the base
// sheer), funnels, masts, boats and deck fittings. Everything follows the sheer.
export function makeLiner(spec) {
  const mats = spec.heroDetails ? linerMats() : shipMats();
  const K = new Mesher();
  const hull = hullGeometry(spec);
  const { S, hbTop } = hull;
  const { L } = spec;
  const X0 = -L / 2, X1 = L / 2;
  const group = new THREE.Group();
  group.name = spec.name;
  K.geo('hull', smoothHull(hull.geometry), new THREE.Matrix4(), null);

  const plats = [];
  const surfAt = (x, z) => {
    let y = -Infinity;
    for (const p of plats) {
      if (x < p.x0 || x > p.x1) continue;
      if (Math.abs(z - p.zc) > p.hw(x)) continue;
      const yy = S(x) + p.off;
      if (yy > y) y = yy;
    }
    return y;
  };
  // placement height: the highest platform under (x, z), else the base sheer
  const yAt = (x, z) => { const y = surfAt(x, z); return Number.isFinite(y) ? y : S(x); };
  const on = (x, z) => Number.isFinite(surfAt(x, z));
  const openings = { window: [], round: [], opening: [] };
  const addOpening = (kind, x, y, z, w, h, face, n = null) => openings[kind].push({ x, y, z, w, h, face, n });

  const black = col(spec.topsides ?? 0x2f2d2b);
  const line = spec.line ? col(spec.line) : null;
  const lineAt = spec.lineAt ?? 1.8;
  const white = col(spec.white ?? PAL.white);
  const deckC = spec.deckColor ?? PAL.deck;

  // ---------------------------------------------------------------- shell above the base sheer
  const secs = spec.shell.map(([x0, x1, h, kind]) => ({ x0: Math.max(x0, X0), x1: Math.min(x1, X1), h, kind })).sort((a, b) => a.x0 - b.x0);
  const hullXs = (x0, x1, max = 4) => {
    const xs = [x0];
    for (const x of hull.stationsX) if (x > x0 + 0.05 && x < x1 - 0.05) xs.push(x);
    xs.push(x1);
    const out = [xs[0]];
    for (let i = 1; i < xs.length; i++) { const d = xs[i] - xs[i - 1], n = Math.ceil(d / max); for (let k = 1; k <= n; k++) out.push(xs[i - 1] + (d * k) / n); }
    return out;
  };
  const wwC = col(PAL.waterway), teakC = col(PAL.teak);
  const sideN = (x, s) => { const d = (hbTop(x + 0.25) - hbTop(x - 0.25)) / 0.5; const l = Math.hypot(d, 1); return [-d / l, 0, s / l]; };
  // outward hull normal at (x, y) on side s, for openings that must sit flush on the flare
  const shellN = (x, y, s, above) => {
    const hx = above ? (hbTop(x + 0.25) - hbTop(x - 0.25)) / 0.5 : (hull.hbAt(x + 0.25, y) - hull.hbAt(x - 0.25, y)) / 0.5;
    const hy = above ? 0 : (hull.hbAt(x, y + 0.25) - hull.hbAt(x, y - 0.25)) / 0.5;
    const l = Math.hypot(hx, hy, 1);
    return [-hx / l, -hy / l, s / l];
  };
  for (const sc of secs) {
    const xs = hullXs(sc.x0, sc.x1);
    let bands = sc.kind === 'raised' && line && sc.h > lineAt + 0.4
      ? [[0, lineAt, black], [lineAt, lineAt + 0.2, line], [lineAt + 0.2, sc.h, black]] : [[0, sc.h, black]];
    if (spec.whiteShellAbove != null && sc.kind === 'raised' && sc.h > 4) {
      const split = spec.whiteShellAbove;
      bands = bands.flatMap(([lo, hi, c]) => hi <= split ? [[lo, hi, c]] : lo >= split
        ? [[lo, hi, white]] : [[lo, split, c], [split, hi, white]]);
    }
    const top = sc.kind === 'raised' ? sc.h : 0;
    const dc = col(sc.kind === 'raised' ? deckC : (spec.wellDeckColor ?? deckC));
    const bw = sc.kind === 'well' ? 0.3 : 0;
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i], xb = xs[i + 1], ha = hbTop(xa), hb = hbTop(xb), ya = S(xa), yb = S(xb);
      for (const s of [1, -1]) {
        const nA = sideN(xa, s), nB = sideN(xb, s);
        for (const [b0, b1, c] of bands) K.quadN(c === white ? 'paint' : 'hull', [xa, ya + b0, s * ha], [xb, yb + b0, s * hb], [xb, yb + b1, s * hb], [xa, ya + b1, s * ha], c, nA, nB);
        if (sc.kind === 'well') {
          const ia = Math.max(ha - bw, 0), ib = Math.max(hb - bw, 0);
          K.quad('paint', [xa, ya, s * ia], [xb, yb, s * ib], [xb, yb + sc.h, s * ib], [xa, ya + sc.h, s * ia], shade(spec.bulwarkIn ?? PAL.white, 0.92), [0, 0, -s]);
          K.quad('deck', [xa, ya + sc.h, s * ia], [xb, yb + sc.h, s * ib], [xb, yb + sc.h, s * hb], [xa, ya + sc.h, s * ha], teakC, [0, 1, 0]);
        }
        // waterway strip along the deck edge
        const w0 = Math.max(ha - bw, 0), w1 = Math.max(hb - bw, 0);
        const v0 = Math.max(w0 - 0.45, 0), v1 = Math.max(w1 - 0.45, 0);
        K.quad('paint', [xa, ya + top + 0.004, s * v0], [xb, yb + top + 0.004, s * v1], [xb, yb + top + 0.004, s * w1], [xa, ya + top + 0.004, s * w0], wwC, [0, 1, 0]);
      }
      const ia = Math.max(ha - bw - 0.45, 0), ib = Math.max(hb - bw - 0.45, 0);
      K.quad('deck', [xa, ya + top, -ia], [xb, yb + top, -ib], [xb, yb + top, ib], [xa, ya + top, ia], dc, [0, 1, 0]);
    }
    plats.push({ x0: sc.x0, x1: sc.x1, zc: 0, hw: hbTop, off: top, rail: sc.kind === 'raised' || sc.kind === 'open', cap: teakC, name: 'shell' });
  }
  // bulkheads where the hull top steps between sections
  for (let i = 0; i < secs.length - 1; i++) {
    const a = secs[i], b = secs[i + 1], x = a.x1;
    const ta = a.kind === 'raised' ? a.h : 0, tb = b.kind === 'raised' ? b.h : 0;
    const lo = Math.min(ta, tb), hi = Math.max(a.h, b.h);
    if (hi - lo < 0.05) continue;
    const hw = hbTop(x), y = S(x);
    const dir = ta > tb ? 1 : -1; // faces the lower section
    const hiTop = Math.max(ta, tb);
    K.quad('paint', [x, y + lo, -hw], [x, y + lo, hw], [x, y + hiTop, hw], [x, y + hiTop, -hw], col(spec.bulkhead ?? PAL.white), [dir, 0, 0]);
    if (hiTop < hi) { /* bulwark ends only */ }
    // doors and ports in the bulkhead
    const n = Math.floor((hw * 2 - 4) / 3.2);
    for (let k = 0; k < n; k++) {
      const z = -hw + 2 + 3.2 * (k + 0.5);
      if (hiTop - lo > 2.4) addOpening(k % 3 === 1 ? 'opening' : 'window', x + dir * 0.03, y + lo + (k % 3 === 1 ? 1.0 : 1.5), z, k % 3 === 1 ? 0.9 : 0.6, k % 3 === 1 ? 2.0 : 0.6, dir > 0 ? '+x' : '-x');
      if (hiTop - lo > 5) addOpening('window', x + dir * 0.03, y + lo + 4.3, z, 0.8, 0.9, dir > 0 ? '+x' : '-x');
    }
  }

  // ---------------------------------------------------------------- slabs (superstructure tiers, deckhouses)
  const slab = (o) => {
    const { x0, x1, off, h } = o;
    const zc = o.zc ?? 0, inset = o.inset ?? 0, rf = o.roundF ?? 0, ra = o.roundA ?? 0, curve = o.curve ?? 0.35;
    const hwWall = (x) => {
      let hw = Math.min((o.w ?? 1e9) / 2, hbTop(x) - inset - Math.abs(zc));
      if (rf && x > x1 - rf) { const t = (x - (x1 - rf)) / rf; hw *= 1 - curve * (1 - Math.sqrt(Math.max(0, 1 - t * t))); }
      if (ra && x < x0 + ra) { const t = (x0 + ra - x) / ra; hw *= 1 - curve * (1 - Math.sqrt(Math.max(0, 1 - t * t))); }
      return Math.max(hw, 0.2);
    };
    const ov = o.overhang ?? 0, roofT = o.roofT ?? (ov > 0 ? 0.25 : 0);
    const hwRoof = (x) => hwWall(x) + ov;
    const xs = [];
    for (const x of steps(x0, x1, 3)) xs.push(x);
    if (rf) for (const x of steps(x1 - rf, x1, 0.7)) xs.push(x);
    if (ra) for (const x of steps(x0, x0 + ra, 0.7)) xs.push(x);
    xs.sort((a, b) => a - b);
    const wc = col(o.wall ?? spec.white ?? PAL.white);
    const topKey = o.roof === 'deck' ? 'deck' : 'paint';
    const tc = col(o.roofColor ?? (o.roof === 'deck' ? deckC : PAL.roof));
    const wallTop = h - roofT;
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i], xb = xs[i + 1];
      if (xb - xa < 1e-3) continue;
      const ya = S(xa) + off, yb = S(xb) + off;
      const ha = hwWall(xa), hb = hwWall(xb), ra2 = hwRoof(xa), rb2 = hwRoof(xb);
      for (const s of [1, -1]) {
        K.quad('paint', [xa, ya, zc + s * ha], [xb, yb, zc + s * hb], [xb, yb + wallTop, zc + s * hb], [xa, ya + wallTop, zc + s * ha], wc, [0, 0, s]);
        if (roofT) {
          K.quad('paint', [xa, ya + wallTop, zc + s * ra2], [xb, yb + wallTop, zc + s * rb2], [xb, yb + h, zc + s * rb2], [xa, ya + h, zc + s * ra2], wc, [0, 0, s]);
          if (ov > 0) K.quad('paint', [xa, ya + wallTop, zc + s * ha], [xb, yb + wallTop, zc + s * hb], [xb, yb + wallTop, zc + s * rb2], [xa, ya + wallTop, zc + s * ra2], shade(o.wall ?? PAL.white, 0.7), [0, -1, 0]);
        }
      }
      K.quad(topKey, [xa, ya + h, zc - ra2], [xb, yb + h, zc - rb2], [xb, yb + h, zc + rb2], [xa, ya + h, zc + ra2], tc, [0, 1, 0]);
      if (o.roof === 'deck') {
        // margin plank / waterway strip
        for (const s of [1, -1]) K.quad('paint', [xa, ya + h + 0.004, zc + s * (ra2 - 0.3)], [xb, yb + h + 0.004, zc + s * (rb2 - 0.3)], [xb, yb + h + 0.004, zc + s * rb2], [xa, ya + h + 0.004, zc + s * ra2], wwC, [0, 1, 0]);
      } else if (o.roofEdge !== false) {
        // painted roof: darker gutter band so houses read from above
        for (const s of [1, -1]) K.quad('paint', [xa, ya + h + 0.004, zc + s * (ra2 - 0.25)], [xb, yb + h + 0.004, zc + s * (rb2 - 0.25)], [xb, yb + h + 0.004, zc + s * rb2], [xa, ya + h + 0.004, zc + s * ra2], shade(o.roofColor ?? PAL.roof, 0.72), [0, 1, 0]);
      }
    }
    for (const [x, d] of [[x0, -1], [x1, 1]]) {
      const y = S(x) + off, hw = hwWall(x), hr = hwRoof(x);
      K.quad('paint', [x, y, zc - hw], [x, y, zc + hw], [x, y + wallTop, zc + hw], [x, y + wallTop, zc - hw], wc, [d, 0, 0]);
      if (roofT) {
        const xr = x + d * (o.overhangEnd ?? 0);
        K.quad('paint', [xr, y + wallTop, zc - hr], [xr, y + wallTop, zc + hr], [xr, y + h, zc + hr], [xr, y + h, zc - hr], wc, [d, 0, 0]);
      }
    }
    // windows
    for (const wz of [].concat(o.win || [])) {
      const a = wz.x0 ?? x0 + 1.2, b = wz.x1 ?? x1 - 1.2;
      for (let x = a; x <= b + 1e-3; x += wz.pitch) {
        if ((rf && x > x1 - rf * 0.6) || (ra && x < x0 + ra * 0.6)) continue;
        for (const s of wz.side ? [wz.side] : [1, -1]) addOpening(wz.dark ? 'opening' : 'window', x, S(x) + off + wz.y + wz.h / 2, zc + s * (hwWall(x) + 0.03), wz.w, wz.h, s > 0 ? '+z' : '-z');
      }
    }
    for (const wf of [].concat(o.winF || [])) {
      const x = x1 + 0.03, hw = hwWall(x1);
      for (let z = -hw + 1.2; z <= hw - 1.2 + 1e-3; z += wf.pitch) addOpening(wf.dark ? 'opening' : 'window', x, S(x1) + off + wf.y + wf.h / 2, zc + z, wf.w, wf.h, '+x');
    }
    for (const wf of [].concat(o.winA || [])) {
      const x = x0 - 0.03, hw = hwWall(x0);
      for (let z = -hw + 1.2; z <= hw - 1.2 + 1e-3; z += wf.pitch) addOpening(wf.dark ? 'opening' : 'window', x, S(x0) + off + wf.y + wf.h / 2, zc + z, wf.w, wf.h, '-x');
    }
    if (o.plat !== false) plats.push({ x0: x0 - (roofT ? (o.overhangEnd ?? 0) : 0), x1: x1 + (roofT ? (o.overhangEnd ?? 0) : 0), zc, hw: hwRoof, off: off + h, rail: !!o.rail, cap: col(o.cap ?? PAL.white), name: o.name });
    return { hwWall, hwRoof };
  };
  for (const t of spec.tiers || []) slab({ roof: 'deck', rail: true, ...t });
  for (const t of spec.houses || []) slab({ roof: 'roof', ...t });
  const rnd = (() => { let a = (spec.seed ?? 7) * 7919 + 17; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  const roofDetails = [];
  for (const t of spec.houses || []) {
    if (t.details === false) continue;
    const len = t.x1 - t.x0, zc = t.zc ?? 0, w = t.w ?? 6;
    const clear = (x, z, r) => !(spec.funnels || []).some((f) => Math.abs(x - f.x) < f.rx + r + 0.6 && Math.abs(z) < f.rz + r + 0.6)
      && !(spec.domes || []).some((d) => Math.hypot(x - d.x, z - (d.z ?? 0)) < d.r * 1.15 + r) && !(spec.skylights || []).some((k) => x > k.x0 - r && x < k.x1 + r && Math.abs(z - (k.z ?? 0)) < k.w / 2 + r);
    // small light / hatch skylights along the centre, mushroom vents near the corners
    if (len > 6 && w > 3.5) {
      const n = Math.max(1, Math.floor(len / 9));
      for (let i = 0; i < n; i++) {
        const x = t.x0 + (len * (i + 0.5)) / n, sl = Math.min(2.4, len / n - 2);
        if (sl > 1 && clear(x, zc, sl / 2)) roofDetails.push(['sky', x - sl / 2, x + sl / 2, zc, Math.min(1.3, w * 0.25)]);
      }
    }
    for (const [fx, fz] of [[0.12, 0.3], [0.88, -0.3], [0.5, 0.36], [0.3, -0.36]]) {
      if (rnd() < 0.35) continue;
      const x = t.x0 + len * fx, z = zc + w * fz;
      if (clear(x, z, 0.6)) roofDetails.push(['mush', x, z]);
    }
  }

  // ---------------------------------------------------------------- navigating bridge
  if (spec.bridge) {
    const { x, off, w = 9, d = 5, wing = 0.7, h = 2.6 } = spec.bridge;
    slab({ x0: x - d, x1: x - 0.6, off, h, w, roof: 'roof', roofColor: PAL.roof, winF: { pitch: 1.25, w: 0.85, h: 0.95, y: 1.25 }, win: { pitch: 1.6, w: 0.7, h: 0.8, y: 1.3 }, name: 'wheelhouse' });
    slab({ x0: x - 2.6, x1: x + 0.3, off: off - 0.3, h: 0.3, inset: -wing, roof: 'deck', rail: true, roofT: 0, name: 'bridgeWings' });
    const hwB = hbTop(x) + wing, y = S(x) + off;
    K.box('paint', x + 0.2, y + 0.6, 0, 0.15, 1.2, hwB * 2, white); // bridge screen
    for (const s of [1, -1]) {
      K.box('paint', x - 1.2, y + 1.15, s * (hwB - 0.9), 2.4, 2.3, 1.8, white);
      K.box('paint', x - 1.2, y + 2.37, s * (hwB - 0.9), 2.7, 0.14, 2.1, col(PAL.roof));
      addOpening('window', x + 0.03, y + 1.6, s * (hwB - 0.9), 1.1, 0.8, '+x');
    }
    // compass platform on the wheelhouse roof
    const yr = y + h;
    K.box('paint', x - d * 0.6, yr + 0.5, 0, 2.2, 1.0, 2.2, white);
    K.cyl('paint', x - d * 0.6, yr + 1.0, 0, 0.35, 0.9, col(PAL.teak), 8);
  }

  // ---------------------------------------------------------------- docking bridge (poop)
  if (spec.dockingBridge) {
    const { x, h = 2.8, wing = 0.5 } = spec.dockingBridge;
    const base = yAt(x, 0) - S(x);
    slab({ x0: x - 1.1, x1: x + 1.1, off: base + h - 0.25, h: 0.25, inset: -wing, roof: 'deck', rail: true, roofT: 0, name: 'dockingBridge' });
    const hw = hbTop(x) + wing, y = S(x) + base;
    for (const z of [-hw + 0.6, -hw / 3, hw / 3, hw - 0.6]) K.rod('paint', [x, y, z], [x, y + h - 0.25, z], 0.1, col(PAL.black), 6, false);
    K.box('paint', x, y + h + 1.1, 0, 1.8, 2.2, 2.4, white);
    K.box('paint', x, y + h + 2.27, 0, 2.1, 0.14, 2.7, col(PAL.roof));
    addOpening('window', x - 0.93, y + h + 1.5, 0, 1.2, 0.7, '-x');
    P.stair(K, x - 4.5, y + 0.05, x - 1.1, y + h - 0.1, hw - 1.6, 0.7);
  }

  // ---------------------------------------------------------------- funnels
  const funnelTops = [];
  for (const f of spec.funnels || []) {
    const y = S(f.x) + (f.off ?? spec.funnelOff);
    const hbd = hbTop(f.x) - 1;
    const top = P.funnel(K, { x: f.x, y, rx: f.rx, rz: f.rz, h: f.h, rake: spec.funnelRake ?? 2, color: spec.funnelColor ?? PAL.buff, top: spec.funnelTop ?? PAL.black, topH: spec.funnelTopH ? f.h * spec.funnelTopH : undefined, band: spec.funnelBand, bandAt: spec.funnelBandAt ?? 0.62, pipes: spec.funnelPipes ?? 2, guyZ: hbd, guyX: f.h * 0.35, smooth: !!spec.heroDetails });
    funnelTops.push(top);
    if (spec.funnelCasing !== false && !(spec.houses || []).some((hh) => f.x > hh.x0 && f.x < hh.x1 && (hh.off ?? 0) === spec.funnelOff)) {
      slab({ x0: f.x - f.rx - 1.5, x1: f.x + f.rx + 1.5, off: spec.funnelOff, h: 1.2, w: f.rz * 2 + 2.4, roof: 'roof', name: 'casing' });
    }
  }

  // ---------------------------------------------------------------- boats and davits
  const bd = spec.boats;
  // half-width of the walkable platform at a given deck height (boat deck edge)
  const deckHW = (x, off) => plats.reduce((m, p) => (x >= p.x0 && x <= p.x1 && Math.abs(p.off - off) < 0.05 && p.zc === 0 ? Math.max(m, p.hw(x)) : m), 0);
  if (bd) {
    for (const b of bd.list) {
      const l = b.l ?? bd.l ?? 9.1, w = b.w ?? bd.w ?? l * 0.3, h = b.h ?? bd.h ?? 1.2;
      const off = b.off ?? bd.off;
      for (const s of b.side ? [b.side] : [1, -1]) {
        // davit line kept inside the deck edge along the whole boat (hull narrows toward the ends)
        const edge = Math.min(deckHW(b.x - l / 2, off), deckHW(b.x, off), deckHW(b.x + l / 2, off)) || (b.zEdge ?? bd.zEdge);
        const zE = s * Math.min(b.zEdge ?? bd.zEdge, edge - 0.35);
        const y = S(b.x) + off;
        const out = !!b.out;
        const zb = out ? zE + s * 1.5 : zE - s * (w / 2 + 0.45);
        const yb = out ? y + 2.4 : y + 0.45 + h;
        _m.compose(_v.set(b.x, yb, zb), _q.identity(), _s.set(1, 1, 1));
        K.geo('paint', P.lifeboatTpl(l, w, h, true), _m, null);
        if (!out) P.boatChocks(K, b.x, y, zb, l);
        const hd = out ? zE + s * 1.5 : zb;
        for (const dx of [-l * 0.42, l * 0.42]) {
          const xx = b.x + dx;
          if (bd.welin) {
            P.welinDavit(K, xx, y, zE, hd, yb, bd.davitColor ?? PAL.white);
            continue;
          }
          const mid = [xx, y + 3.9, zE + (hd - zE) * 0.2], e = [xx, y + 4.4, hd];
          K.strut('paint', [xx, y, zE], mid, 0.22, col(bd.davitColor ?? PAL.white));
          K.strut('paint', mid, e, 0.18, col(bd.davitColor ?? PAL.white));
          K.rod('dark', e, [xx, yb + 0.3, hd], 0.03, col(PAL.rope), 3);
        }
      }
    }
  }
  for (const c of (spec.collapsibles || []).filter((c) => on(c.x, c.z))) P.collapsible(K, c.x, yAt(c.x, c.z), c.z);

  // ---------------------------------------------------------------- deck fittings
  for (const hch of (spec.hatches || []).filter((h) => on(h.x, h.z ?? 0))) P.hatch(K, hch.x, yAt(hch.x, hch.z ?? 0), hch.z ?? 0, hch.l, hch.w, { h: hch.h ?? 0.75 });
  const nearestHatch = (x, z) => (spec.hatches || []).reduce((b, h) => (Math.hypot(h.x - x, (h.z ?? 0) - z) < Math.hypot(b.x - x, (b.z ?? 0) - z) ? h : b), { x: x + 50, z: 0 });
  for (const c of (spec.cranes || []).filter((c) => on(c.x, c.z))) P.crane(K, c.x, yAt(c.x, c.z), c.z, c.dir ?? (nearestHatch(c.x, c.z).x > c.x ? 0 : Math.PI), { jib: c.jib ?? 8.5, lift: c.lift ?? 0.22, color: spec.craneColor ?? PAL.buff });
  for (const c of (spec.capstans || []).filter((c) => on(c.x, c.z))) P.capstan(K, c.x, yAt(c.x, c.z), c.z, c.r ?? 0.55);
  for (const w of (spec.winches || []).filter((w) => on(w.x, w.z))) P.winch(K, w.x, yAt(w.x, w.z), w.z, w.ry ?? 0);
  for (const sk of spec.skylights || []) {
    const zc = sk.z ?? 0;
    P.skylight(K, sk.x0, sk.x1, zc, yAt((sk.x0 + sk.x1) / 2, zc), sk.w, { h: sk.h ?? 0.6, ridge: sk.ridge ?? Math.min(0.7, sk.w * 0.25) });
  }
  for (const d of roofDetails) {
    if (d[0] === 'mush' && !on(d[1], d[2])) continue;
    if (d[0] === 'sky') P.skylight(K, d[1], d[2], d[3], yAt((d[1] + d[2]) / 2, d[3]), d[4], { h: 0.35, ridge: 0.3 });
    else P.mushroomVent(K, d[1], yAt(d[1], d[2]), d[2], 0.22, 0.55, PAL.roofDark);
  }
  if (spec.boats) {
    const boff = spec.boats.off;
    for (const t of spec.houses || []) {
      if ((t.off ?? 0) !== boff || t.x1 - t.x0 < 5) continue;
      const w = t.w ?? 6, zc = t.zc ?? 0;
      for (const s of [1, -1]) {
        const z = zc + s * (w / 2 + 0.55);
        for (let x = t.x0 + 1.6; x < t.x1 - 1.6; x += 3.4) {
          const y = yAt(x, z);
          if (Math.abs(y - (S(x) + boff)) > 0.05 || Math.abs(yAt(x - 1, z) - y) > 0.05 || Math.abs(yAt(x + 1, z) - y) > 0.05) continue;
          K.box('deck', x, y + 0.42, z, 2.0, 0.08, 0.5, col(PAL.teak));
          K.box('deck', x, y + 0.7, z + s * 0.24, 2.0, 0.5, 0.06, col(PAL.teak));
          for (const dx of [-0.85, 0.85]) K.box('dark', x + dx, y + 0.2, z, 0.06, 0.4, 0.45, col(0x1a1a1a));
        }
      }
    }
  }
  for (const xj of spec.expansionJoints || []) {
    const off = spec.boats?.off ?? 0, hw = hbTop(xj) + 0.3, y = S(xj) + off;
    K.quad('dark', [xj - 0.12, y + 0.012, -hw], [xj + 0.12, y + 0.012, -hw], [xj + 0.12, y + 0.012, hw], [xj - 0.12, y + 0.012, hw], col(0x141414), [0, 1, 0]);
    const depth = spec.heroDetails ? spec.tiers[0].off : 5.8;
    for (const s of [1, -1]) K.quad('dark', [xj - 0.1, y - depth, s * (hbTop(xj) + 0.02)], [xj + 0.1, y - depth, s * (hbTop(xj) + 0.02)], [xj + 0.1, y, s * (hbTop(xj) + 0.36)], [xj - 0.1, y, s * (hbTop(xj) + 0.36)], col(0x202020), [0, 0, s]);
  }
  for (const dm of spec.domes || []) {
    const y = yAt(dm.x, dm.z ?? 0);
    if (spec.heroDetails) {
      // The staircase dome is indoors, sheltered by a rectangular exterior skylight.
      P.skylight(K, dm.x - dm.r, dm.x + dm.r, dm.z ?? 0, y, dm.r * 2,
        { h: 0.7, ridge: 0.65, coaming: spec.white, frame: spec.white });
    } else P.dome(K, dm.x, y, dm.z ?? 0, dm.r);
  }
  for (const v of spec.vents || []) {
    const zs = v.mirror === false ? [v.z] : v.z ? [v.z, -v.z] : [0];
    for (const z of zs) {
      if (!on(v.x, z)) continue;
      const y = yAt(v.x, z);
      if (v.kind === 'mush') P.mushroomVent(K, v.x, y, z, v.r ?? 0.35, v.h ?? 0.8, v.color ?? PAL.roofDark);
      else P.cowlVent(K, v.x, y, z, v.r ?? 0.6, v.h ?? 2.5, v.dir ?? 0, v.color ?? spec.ventColor ?? PAL.buff);
    }
  }
  for (const st of spec.stairs || []) {
    for (const z of st.mirror === false ? [st.z] : [st.z, -st.z]) P.stair(K, st.x0, yAt(st.x0, z) + 0.05, st.x1, yAt(st.x1, z) - 0.05, z, st.w ?? 0.9);
  }
  // bitts along the edges of the open hull decks
  for (const sc of secs) {
    if (sc.kind === 'raised' && sc.x0 > X0 + 1 && sc.x1 < X1 - 1) continue; // midship island: covered
    for (let x = sc.x0 + 3; x < sc.x1 - 3; x += spec.bittPitch ?? 11) {
      const hb = hbTop(x);
      if (hb < 3) continue;
      for (const s of [1, -1]) { const z = s * (hb - 1.1); if (yAt(x, z) <= S(x) + (sc.kind === 'raised' ? sc.h : 0) + 0.1) P.bitts(K, x, yAt(x, z), z, true); }
    }
  }
  // anchor gear on the forecastle
  {
    const fx = X1 - (spec.anchorX ?? 7);
    const yF = yAt(fx, 0);
    if (spec.anchorCrane) {
      const cx = X1 - spec.anchorCrane;
      const yc = yAt(cx, 0);
      K.cyl('paint', cx, yc, 0, 0.55, 1.4, col(PAL.black), 10);
      K.strut('paint', [cx, yc + 1.2, 0], [cx + 2.2, yc + 4.6, 0], 0.3, col(PAL.black));
      K.strut('paint', [cx + 2.2, yc + 4.6, 0], [cx + 3.8, yc + 4.0, 0], 0.25, col(PAL.black));
      K.rod('dark', [cx + 3.8, yc + 4.0, 0], [cx + 3.8, yc + 0.8, 0], 0.04, col(PAL.rope), 3);
    }
    for (const s of [1, -1]) {
      const hx = X1 - (spec.hawseX ?? 4), hz = s * Math.max(hbTop(X1 - (spec.hawseX ?? 4)) - 0.7, 0.8);
      const capX = fx - (spec.capstanAft ?? 1.5), capZ = s * (spec.capstanZ ?? 2.2);
      const yy = yAt(capX, capZ);
      K.strut('dark', [hx, yAt(hx, hz) + 0.08, hz], [capX, yy + 0.08, capZ], 0.34, col(0x1c1a18), 0.14);
      P.capstan(K, capX, yy, capZ, spec.capstanR ?? 0.6);
      K.strut('dark', [capX, yy + 0.08, capZ], [capX - 3, yy + 0.08, capZ * 0.6], 0.34, col(0x1c1a18), 0.14);
      K.cyl('paint', capX - 3, yy, capZ * 0.6, 0.35, 0.3, col(PAL.black), 8); // spurling pipe
      // hawse pipe / anchor on the hull side
      P.hullAnchor(K, hull, hx, S(hx) + (spec.anchorY ?? -1.2), s, { size: spec.anchorSize ?? L / 270 * 0.35 + 0.65 });
    }
    // jackstaff
    K.rod('paint', [X1 - 0.6, S(X1) + (secs[secs.length - 1].kind === 'raised' ? secs[secs.length - 1].h : 0), 0], [X1 - 0.3, yF + 6.5, 0], 0.07, col(PAL.mast), 5, false);
  }
  // ensign staff
  {
    const x = X0 + 1.2, y = yAt(x + 0.5, 0);
    if (y > -Infinity) K.rod('paint', [x, y, 0], [x - 0.8, y + 8, 0], 0.08, col(PAL.mast), 5, false);
  }
  // bowsprit (clipper bows)
  if (spec.bowsprit) {
    const y = S(X1) + (secs[secs.length - 1].kind === 'raised' ? secs[secs.length - 1].h : 0) - 0.4;
    const tip = [X1 + spec.bowsprit, y + spec.bowsprit * 0.22, 0];
    K.rod('paint', [X1 - 4, y, 0], tip, 0.28, col(PAL.black), 8, false);
    K.rod('dark', tip, [X1 - (spec.clipper ?? 0) - 1, 0.8, 0], 0.04, col(PAL.rope), 3); // bobstay
    // trailboards / figurehead scroll in gilt
    for (const s of [1, -1]) {
      const hb = hbTop(X1 - 3);
      K.quad('paint', [X1 - 7, y - 2.2, s * (hull.hbAt(X1 - 7, y - 2.2) + 0.04)], [X1 - 0.3, y - 1.0, s * 0.3], [X1 - 0.2, y - 0.4, s * 0.3], [X1 - 7, y - 1.7, s * (hull.hbAt(X1 - 7, y - 1.7) + 0.04)], col(0xa8822e), [0, 0, s]);
      void hb;
    }
  }

  // ---------------------------------------------------------------- masts and rigging
  const mastTops = [];
  for (const m of spec.masts || []) {
    const y = yAt(m.x, 0);
    const hbm = (x) => hbTop(x) - 0.4;
    const shrouds = [];
    for (const dx of [-1.5, -3.2, -4.9]) for (const s of [1, -1]) { const xx = m.x + dx; shrouds.push([xx, yAt(xx, s * hbm(xx)) + 0.9, s * hbm(xx)]); }
    const fore = m.x > 0;
    const stayF = fore ? [X1 - 1.5, S(X1) + (secs[secs.length - 1].kind === 'raised' ? secs[secs.length - 1].h : 0) + 1, 0] : null;
    const stayA = !fore ? [X0 + 2.5, yAt(X0 + 3, 0) + 1, 0] : null;
    const top = P.mast(K, { x: m.x, y, top: m.top, rake: m.rake ?? 2, r: m.r ?? 0.42, nest: m.nest ? m.nest - y : 0, yard: m.yard ?? 0, stayF, stayA, shrouds, color: spec.mastColor ?? PAL.mast });
    mastTops.push(top);
    for (const [tx, tz] of m.derricks || []) {
      const from = [m.x + (tx > m.x ? 0.6 : -0.6), y + 2.2, 0];
      const dx = tx - from[0], dz = tz - from[2], dl = Math.hypot(dx, dz), len = m.boom ?? Math.min(12, dl + 2);
      const el = 0.42;
      P.derrick(K, from, [from[0] + (dx / dl) * len * Math.cos(el), from[1] + len * Math.sin(el), (dz / dl) * len * Math.cos(el)], spec.mastColor ?? PAL.mast);
    }
    for (const w of m.winches || []) P.winch(K, w[0], yAt(w[0], w[1]), w[1], 0);
  }
  if (spec.aerial && mastTops.length >= 2) {
    const a = mastTops[0], b = mastTops[mastTops.length - 1];
    for (const dz of spec.heroDetails ? [-1.2, -0.4, 0.4, 1.2] : [-0.9, 0.9]) K.rod('dark', [a[0], a[1] - 1.2, dz], [b[0], b[1] - 1.2, dz], 0.025, col(PAL.rope), 3);
    for (const p of [a, b]) K.rod('paint', [p[0], p[1] - 1.2, -1.2], [p[0], p[1] - 1.2, 1.2], 0.05, col(PAL.mast), 3, false);
    if (spec.aerialLead) {
      const lx = spec.aerialLead, ly = a[1] - 1.2 + ((b[1] - a[1]) * (lx - a[0])) / (b[0] - a[0]);
      K.rod('dark', [lx, ly, 0.9], [lx, yAt(lx, 0) + 2.6, 0], 0.03, col(PAL.rope), 3);
    }
  }

  // ---------------------------------------------------------------- hull openings
  for (const [k, row] of (spec.portRows || []).entries()) {
    const x0 = X0 + L * (spec.portFrom ?? 0.09), x1 = X1 - L * (spec.portTo ?? 0.1);
    let r = 1 + k * 17;
    for (let x = x0; x <= x1; x += spec.portPitch ?? 2.6) {
      r = (r * 16807) % 2147483647;
      if ((r % 100) < 10) continue;
      const y = row + (S(x) - S(0)) * (row / Math.max(S(0), 1));
      const zz = hull.hbAt(x, y);
      for (const s of [1, -1]) {
        const n = shellN(x, y, s, false);
        if (Math.abs(n[0]) > 0.75) continue; // too close to the stem / counter
        addOpening('round', x + n[0] * 0.03, y + n[1] * 0.03, s * zz + n[2] * 0.03, 0.42, 0.42, s > 0 ? '+z' : '-z', n);
      }
    }
  }
  const nearAnchor = (x, y) => spec.hawseX != null && Math.abs(x - (X1 - spec.hawseX)) < 2.6 * (spec.anchorSize ?? 1) && Math.abs(y - (S(x) + (spec.anchorY ?? -1.2) + 0.2)) < 2.2 * (spec.anchorSize ?? 1);
  for (const sw of spec.shellWin || []) {
    for (let x = sw.x0; x <= sw.x1; x += sw.pitch) {
      const sc = secs.find((q) => x >= q.x0 && x <= q.x1);
      if (!sc || sc.kind !== 'raised' || sc.h < sw.off + sw.h * 0.5 + 0.3) continue;
      const y = S(x) + sw.off;
      if (nearAnchor(x, y)) continue;
      for (const s of [1, -1]) {
        const put = (xx) => {
          const n = shellN(xx, y, s, true);
          if (Math.abs(n[0]) > 0.75) return;
          addOpening(sw.round ? 'round' : 'window', xx + n[0] * 0.03, y, s * hbTop(xx) + n[2] * 0.03, sw.w, sw.h, s > 0 ? '+z' : '-z', n);
        };
        if (sw.pair) { for (const d of [-0.55, 0.55]) put(x + d); } else put(x);
      }
    }
  }

  // ---------------------------------------------------------------- railings on every open deck edge
  railings(K, plats, surfAt, S, spec, spec.heroDetails ? { step: 1.8, physical: true } : {});
  if (spec.heroDetails) heroLinerDetails(K, { spec, hull, secs, yAt, plats });

  const topY = funnelTops.length ? Math.max(...funnelTops.map((t) => t.y)) : 1e5;
  group.add(K.build({ ...mats, funnel: funnelMaterial(topY) }, spec.name));
  for (const [kind, list] of Object.entries(openings)) if (list.length) for (const m of openingsMeshes(list, kind, mats, !!spec.heroDetails)) group.add(m);

  // ---------------------------------------------------------------- flags and names
  const shellTopAt = (x) => { const sc = secs.find((q) => x >= q.x0 && x <= q.x1) ?? secs[0]; return S(x) + sc.h; };
  const dress = spec.dress;
  if (dress) {
    const flags = [];
    const fore = mastTops[0], main = mastTops[mastTops.length - 1];
    const fsz = dress.size ?? 1;
    if (dress.bluePeter && fore) flags.push({ kind: 'bluePeter', x: fore[0] - 0.25, y: fore[1] - 0.4, z: 0, h: 1.7 * fsz, len: 2.3 * fsz });
    if (dress.royalMail && fore) flags.push({ kind: 'royalMail', x: fore[0] - 0.25, y: fore[1] - 3.2, z: 0, h: 0.75 * fsz, len: 6 * fsz });
    if (dress.house && main && mastTops.length > 1) flags.push({ kind: dress.house, x: main[0] - 0.25, y: main[1] - 0.4, z: 0, h: 1.9 * fsz, len: 3.2 * fsz });
    if (dress.ensign) {
      const x = X0 + 1.2, y = yAt(x + 0.5, 0);
      const es = dress.ensignSize ?? 1;
      flags.push({ kind: dress.ensign, x: x - 0.85, y: y + 7.8, z: 0, h: 2.6 * fsz * es, len: 5.2 * fsz * es });
    }
    const fm = flagsMesh(flags, spec.seed ?? 1);
    if (fm) group.add(fm);
  }
  if (spec.hullName) {
    const lh = spec.nameH ?? 0.7;
    group.add(hullNames(hull, {
      name: spec.hullName, port: spec.registry, letterH: lh,
      bowX: X1 - (spec.nameAft ?? 8), bowY: (x) => shellTopAt(x) - lh * 1.3,
      sternY: spec.registry ? shellTopAt(X0 + 2) - lh * 1.2 : null,
    }));
  }

  group.userData.funnelTops = funnelTops;
  group.userData.spec = spec;
  group.userData.boatDeckY = S(0) + (spec.funnelOff ?? spec.boats?.off ?? 5);
  group.userData.tris = K.tris + Object.values(openings).reduce((a, l) => a + l.length * 2, 0);
  group.userData.surfAt = surfAt;
  group.userData.hull = { L, S, hbTop, hbAt: hull.hbAt, topAt: shellTopAt };
  if (spec.draftForward != null && spec.draftAft != null) {
    // Rigid trim rotates decks, fittings and smoke origins together; no hull shearing.
    group.rotation.z = Math.asin((spec.draftAft - spec.draftForward) / L);
  }
  if (spec.raft) group.addEventListener('added', () => tryRaft(group.parent, spec.raft));
  return group;
}

// Rails wherever a walkable platform edge drops to something lower.
export function railings(K, plats, surfAt, S, spec, { height = 1.05, step = 1.0, physical = false } = {}) {
  const railC = col(spec.railColor ?? PAL.white);
  const railSpan = (a, b, ua, ub, cap) => {
    if (!physical) { K.ribbon('rail', a, b, height, ua, ub, railC); return; }
    // 35 mm posts, three pipe/wire courses, and a rounded upper rail. Geometry
    // casts a real silhouette and shadow in the low bow/quayside views.
    for (const h of [0.33, 0.68, height]) {
      K.rod('paint', [a[0], a[1] + h, a[2]], [b[0], b[1] + h, b[2]], h === height ? 0.043 : 0.018, h === height ? cap : railC, 6, false);
    }
    K.rod('paint', a, [a[0], a[1] + height, a[2]], 0.035, railC, 7, false);
    K.cyl('paint', a[0], a[1], a[2], 0.065, 0.08, railC, 7);
  };
  for (const p of plats) {
    if (!p.rail) continue;
    const y = (x) => S(x) + p.off;
    const cap = p.cap ?? railC;
    const test = (xo, zo, xi, zi, yy) => surfAt(xo, zo) < yy - 0.6 && surfAt(xi, zi) <= yy + 0.3;
    for (const s of [1, -1]) {
      const xs = steps(p.x0 + 0.05, p.x1 - 0.05, step);
      for (let i = 0; i < xs.length - 1; i++) {
        const xa = xs[i], xb = xs[i + 1], xm = (xa + xb) / 2, hm = p.hw(xm);
        if (hm < 0.35) continue;
        if (!test(xm, p.zc + s * (hm + 0.5), xm, p.zc + s * (hm - 0.7), y(xm))) continue;
        const za = p.zc + s * (p.hw(xa) - 0.1), zb = p.zc + s * (p.hw(xb) - 0.1);
        const A = [xa, y(xa), za], B = [xb, y(xb), zb];
        railSpan(A, B, xa / 1.8, xb / 1.8, cap);
        K.quad('paint', [xa, A[1] + height, za - 0.07], [xb, B[1] + height, zb - 0.07], [xb, B[1] + height, zb + 0.07], [xa, A[1] + height, za + 0.07], cap, [0, 1, 0]);
      }
    }
    for (const [xe, d] of [[p.x0, -1], [p.x1, 1]]) {
      const hw = p.hw(xe);
      if (hw < 0.6) continue;
      const zs = steps(p.zc - hw + 0.1, p.zc + hw - 0.1, step);
      const xr = xe - d * 0.1, yy = y(xe);
      for (let i = 0; i < zs.length - 1; i++) {
        const za = zs[i], zb = zs[i + 1], zm = (za + zb) / 2;
        if (!test(xe + d * 0.5, zm, xe - d * 0.7, zm, yy)) continue;
        railSpan([xr, yy, za], [xr, yy, zb], za / 1.8, zb / 1.8, cap);
        K.quad('paint', [xr - 0.07, yy + height, za], [xr - 0.07, yy + height, zb], [xr + 0.07, yy + height, zb], [xr + 0.07, yy + height, za], cap, [0, 1, 0]);
      }
    }
  }
}

export function openingsMesh(list, material, round) {
  const geo = round ? new THREE.CircleGeometry(0.5, 20) : new THREE.PlaneGeometry(1, 1);
  return instanced(list, geo, material, 0, 0, 0);
}

// glazing plus brass rims (portholes) or dark frames (windows)
export function openingsMeshes(list, kind, mats, physical = false) {
  if (kind === 'round') return [instanced(list, new THREE.CircleGeometry(0.5, 24), mats.window, 0, 0, 0.004), instanced(list, physical ? new THREE.TorusGeometry(0.535, 0.03, 4, 16) : new THREE.RingGeometry(0.5, 0.575, 24, 1), mats.rim, 0, 0, 0.012)];
  if (kind === 'window') return [instanced(list, new THREE.PlaneGeometry(1, 1), mats.window, 0, 0, 0.006), instanced(list, physical ? physicalFrameGeo() : frameGeo(), mats.frame, 0, 0, 0.01)];
  return [instanced(list, new THREE.PlaneGeometry(1, 1), mats.opening, 0, 0, 0)];
}

let FRAME = null;
let PHYSICAL_FRAME = null;
function physicalFrameGeo() {
  if (PHYSICAL_FRAME) return PHYSICAL_FRAME;
  const shape = new THREE.Shape();
  shape.moveTo(-0.55, -0.55); shape.lineTo(0.55, -0.55); shape.lineTo(0.55, 0.55); shape.lineTo(-0.55, 0.55); shape.closePath();
  for (const [x0, x1] of [[-0.5, -0.018], [0.018, 0.5]]) {
    const h = new THREE.Path(); h.moveTo(x0, -0.5); h.lineTo(x0, 0.5); h.lineTo(x1, 0.5); h.lineTo(x1, -0.5); h.closePath(); shape.holes.push(h);
  }
  PHYSICAL_FRAME = new THREE.ExtrudeGeometry(shape, { depth: 0.045, steps: 1, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.007, bevelSegments: 1 });
  return PHYSICAL_FRAME;
}
function frameGeo() {
  // unit window frame (outer 1.14, inner 1.0) with a centre mullion
  if (FRAME) return FRAME;
  const s = new THREE.Shape();
  s.moveTo(-0.57, -0.57); s.lineTo(0.57, -0.57); s.lineTo(0.57, 0.57); s.lineTo(-0.57, 0.57); s.closePath();
  const hole = (x0, x1) => { const h = new THREE.Path(); h.moveTo(x0, -0.5); h.lineTo(x0, 0.5); h.lineTo(x1, 0.5); h.lineTo(x1, -0.5); h.closePath(); return h; };
  s.holes.push(hole(-0.5, -0.03), hole(0.03, 0.5));
  FRAME = new THREE.ShapeGeometry(s);
  return FRAME;
}

function instanced(list, geo, material, _a, _b, push) {
  const im = new THREE.InstancedMesh(geo, material, list.length);
  const rot = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 };
  const dir = { '+z': [0, 1], '-z': [0, -1], '+x': [1, 0], '-x': [-1, 0] };
  const Zf = new THREE.Vector3(0, 0, 1), nv = new THREE.Vector3();
  list.forEach((o, i) => {
    if (o.n) {
      nv.set(o.n[0], o.n[1], o.n[2]);
      // keep the opening upright: yaw to the horizontal normal, then pitch
      const yaw = Math.atan2(nv.x, nv.z), pitch = -Math.asin(Math.max(-1, Math.min(1, nv.y)));
      _q.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
      _m.compose(_v.set(o.x + nv.x * push, o.y + nv.y * push, o.z + nv.z * push), _q, _s.set(o.w, o.h, 1));
      im.setMatrixAt(i, _m);
      return;
    }
    _q.setFromEuler(_e.set(0, rot[o.face], 0));
    const d = dir[o.face];
    _m.compose(_v.set(o.x + d[0] * push, o.y, o.z + d[1] * push), _q, _s.set(o.w, o.h, 1));
    im.setMatrixAt(i, _m);
  });
  im.instanceMatrix.needsUpdate = true;
  im.computeBoundingSphere();
  im.receiveShadow = true;
  return im;
}
