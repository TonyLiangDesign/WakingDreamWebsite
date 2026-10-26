import * as THREE from 'three';
import { add, tube, rod, box, crossSection, spaced, v3, lerp, clamp01 } from './kit.js';
import { DECK_Y, CAP } from './hull.js';
import { nonslipMaterial } from './cockpit.js';
import * as fit from './fittings.js';

// Walkaround hardtop, built from flat alloy plate like the real thing: side walls with a little
// tumblehome, a three-facet front (vertical face, sloped nose, raked windscreen) with swept corner
// panels, double-skinned walls with real window openings (tinted glass in black sliding frames,
// dark carpet liner inside, clipped to the hull plating), a rear bulkhead with a rolled-edge
// opening, walkable side decks and a short deck ahead of the cabin, and a crowned roof with drip
// edge, aft overhang on legs to the gunwale capping, grab rails, LED spotlight and VHF whip.
// fittings.js owns the light and launcher geometry: navLight() side lights (red to port, green
// to starboard), allRoundLight() and rocketLauncher() on the roof. Proportions follow DECK_Y and
// the lines: headroom DECK_Y + 1.9 (+0.06 per metre of length), screen foot at DECK_Y + 1.02.
// Receives the lines, materials and build; returns the helm placement for helm.js:
//   { C, hw(x), wallZ(x, y) }  (C = [x, y] foot of the windscreen on the corner line, where the
//   dash nose may sit; hw/wallZ = inside face of the wall liner)
// The geometry helpers and part materials below are shared with console.js.

const TREAD = 0.21;             // side-deck walkway, inside of the capping to the cabin side
const WALL = 0.03;              // wall thickness, outer plate to liner
const TUMBLE = 0.08;            // inward lean of the sides from side deck to roof
const RAKE = THREE.MathUtils.degToRad(28);   // windscreen rake from vertical
const NOSE = 0.3;               // 45 degree nose between the front face and the screen foot
const SWEEP = 0.38;             // plan sweep of the corner panels (aft per metre outboard)
const GLASS_SET = 0.012;        // glass set back from the outer plate

// ---------- shared helpers ----------

export function finishGeometry(pos, uv, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Grid through at(u, v) -> [x, y, z] for every u in us, v in vs.
export function grid(us, vs, at, uvOf = (p) => [p[0] * 0.5, p[1] * 0.5]) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (const v of vs) {
    for (const u of us) {
      const p = at(u, v);
      pos.push(p[0], p[1], p[2]);
      const t = uvOf(p);
      uv.push(t[0], t[1]);
    }
  }
  const n = us.length;
  for (let i = 0; i < vs.length - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      const b = a + n;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return finishGeometry(pos, uv, idx);
}

// Band between two matching point runs (Vector3), optionally closed.
export function strip(A, B, closed = false) {
  const pos = [];
  const uv = [];
  const idx = [];
  let run = 0;
  A.forEach((p, i) => {
    if (i) run += p.distanceTo(A[i - 1]);
    pos.push(p.x, p.y, p.z, B[i].x, B[i].y, B[i].z);
    uv.push(run * 0.5, 0, run * 0.5, p.distanceTo(B[i]) * 0.5);
  });
  const n = A.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const a = 2 * i;
    const b = 2 * ((i + 1) % n);
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  return finishGeometry(pos, uv, idx);
}

// Cap over a convex 2D loop (concentric rings to its centroid), lifted by at(a, b) -> Vector3.
export function ringCap(loop, at, scales = [1, 0.82, 0.6, 0.38, 0.16]) {
  const c = loop.reduce((s, p) => [s[0] + p[0] / loop.length, s[1] + p[1] / loop.length], [0, 0]);
  const n = loop.length;
  const pos = [];
  const uv = [];
  const idx = [];
  for (const s of scales) {
    for (const p of loop) {
      const q = at(c[0] + (p[0] - c[0]) * s, c[1] + (p[1] - c[1]) * s);
      pos.push(q.x, q.y, q.z);
      uv.push(q.x * 0.5, q.z * 0.5);
    }
  }
  const q = at(c[0], c[1]);
  pos.push(q.x, q.y, q.z);
  uv.push(q.x * 0.5, q.z * 0.5);
  for (let r = 0; r < scales.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      idx.push(a, b, a + n, b, b + n, a + n);
    }
  }
  const last = (scales.length - 1) * n;
  for (let i = 0; i < n; i++) idx.push(last + i, last + ((i + 1) % n), scales.length * n);
  return finishGeometry(pos, uv, idx);
}

// Mirror a geometry to port (z -> -z) keeping the faces wound outward.
export function mirrorZ(g) {
  const h = g.clone();
  h.scale(1, 1, -1);
  const ix = h.index.array;
  for (let k = 0; k < ix.length; k += 3) [ix[k + 1], ix[k + 2]] = [ix[k + 2], ix[k + 1]];
  h.index.needsUpdate = true;
  h.computeVertexNormals();
  return h;
}

export function pair(group, g, material, opts) {
  add(group, g, material, opts);
  add(group, mirrorZ(g), material, opts);
}

// Fillet every corner of a convex CCW polygon [[x, y]...]; straight runs subdivided.
export function roundLoop(poly, radius, seg = 4, maxEdge = 0.08) {
  const n = poly.length;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const len = (a) => Math.hypot(a[0], a[1]);
  const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
  const arcs = poly.map((p, i) => {
    const p0 = poly[(i + n - 1) % n];
    const p2 = poly[(i + 1) % n];
    const d1 = unit(sub(p0, p));
    const d2 = unit(sub(p2, p));
    const half = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1]))) / 2;
    const r = Array.isArray(radius) ? radius[i] : radius;
    const t = Math.min(r / Math.tan(half), 0.45 * len(sub(p0, p)), 0.45 * len(sub(p2, p)));
    const rr = t * Math.tan(half);
    const bis = unit([d1[0] + d2[0], d1[1] + d2[1]]);
    const c = [p[0] + bis[0] * (rr / Math.sin(half)), p[1] + bis[1] * (rr / Math.sin(half))];
    const A = [p[0] + d1[0] * t, p[1] + d1[1] * t];
    const B = [p[0] + d2[0] * t, p[1] + d2[1] * t];
    const a0 = Math.atan2(A[1] - c[1], A[0] - c[0]);
    let da = Math.atan2(B[1] - c[1], B[0] - c[0]) - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    return Array.from({ length: seg + 1 }, (_, k) => [c[0] + rr * Math.cos(a0 + (da * k) / seg), c[1] + rr * Math.sin(a0 + (da * k) / seg)]);
  });
  const out = [];
  arcs.forEach((arc, i) => {
    out.push(...arc);
    const end = arc[arc.length - 1];
    const next = arcs[(i + 1) % n][0];
    const m = Math.ceil(len(sub(next, end)) / maxEdge);
    for (let k = 1; k < m; k++) out.push([lerp(end[0], next[0], k / m), lerp(end[1], next[1], k / m)]);
  });
  return out;
}

// Offset a smooth CCW loop outward by d (inward when negative).
export function offsetLoop(loop, d) {
  const n = loop.length;
  return loop.map((p, i) => {
    const a = loop[(i + n - 1) % n];
    const b = loop[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [p[0] + (d * (b[1] - a[1])) / l, p[1] - (d * (b[0] - a[0])) / l];
  });
}

// [min x, max x] where the horizontal line at y crosses a loop.
export function spanAt(loop, y) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < loop.length; i++) {
    const [xa, ya] = loop[i];
    const [xb, yb] = loop[(i + 1) % loop.length];
    if (ya === yb || (y - ya) * (y - yb) > 0) continue;
    const x = xa + ((xb - xa) * (y - ya)) / (yb - ya);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  return [lo, hi];
}

const uniq = (list) => [...new Set(list.map((y) => +y.toFixed(5)))].sort((a, b) => a - b);

// Part-specific materials, made once per material set and kept across rebuilds.
const cache = new WeakMap();

function linerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);
  // Marine carpet liner: fine fleck, with a glued panel join every metre.
  for (let i = 0; i < 5000; i++) {
    const g = 175 + Math.random() * 80;
    ctx.fillStyle = `rgba(${g},${g},${g},0.6)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4);
  }
  ctx.fillStyle = 'rgba(40,40,40,0.5)';
  ctx.fillRect(0, 0, 2, 256);
  ctx.fillRect(128, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function partMaterials(m) {
  if (cache.has(m)) return cache.get(m);
  const pm = {
    // Tinted toughened glass, see-through from both sides.
    glass: new THREE.MeshPhysicalMaterial({ color: '#2a3a42', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.3 }),
    // Black anodised window extrusions and screen frame.
    frame: new THREE.MeshStandardMaterial({ color: '#16181a', metalness: 0.35, roughness: 0.42, side: THREE.DoubleSide }),
    liner: new THREE.MeshStandardMaterial({ color: '#303337', map: linerTexture(), roughness: 0.95, side: THREE.DoubleSide }),
    // Smoked acrylic for the console screen.
    acrylic: new THREE.MeshPhysicalMaterial({ color: '#3b4a50', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 }),
    canvas: new THREE.MeshStandardMaterial({ roughness: 0.93, side: THREE.DoubleSide }),
    binding: new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    white: new THREE.MeshStandardMaterial({ color: '#efeee9', roughness: 0.4 }),
  };
  for (const mat of Object.values(pm)) mat.userData.shared = true;
  cache.set(m, pm);
  return pm;
}

// Crowned slab with a fascia edge: the hardtop roof and the T-top canopy.
// loop is the CCW plan outline [[x, z]...]; returns the top-surface height function.
export function slab(group, loop, { yUnder, edge, crown, halfW, top, under, fascia = top, drip = 0 }) {
  const topY = (x, z) => yUnder + edge + crown * (1 - (z / halfW) ** 2);
  const loopT = offsetLoop(loop, -0.014);
  add(group, ringCap(loopT, (x, z) => v3(x, topY(x, z), z)), top);
  // Rounded-over top edge, then the fascia down to the drip lip.
  add(group, strip(loop.map(([x, z]) => v3(x, topY(x, z) - 0.012, z)), loopT.map(([x, z]) => v3(x, topY(x, z), z)), true), fascia);
  const yLow = yUnder - drip;
  add(group, strip(loop.map(([x, z]) => v3(x, yLow, z)), loop.map(([x, z]) => v3(x, topY(x, z) - 0.012, z)), true), fascia);
  const loopI = offsetLoop(loop, -0.012);
  if (drip > 0) {
    add(group, strip(loop.map(([x, z]) => v3(x, yLow, z)), loopI.map(([x, z]) => v3(x, yLow, z)), true), fascia);
    add(group, strip(loopI.map(([x, z]) => v3(x, yLow, z)), loopI.map(([x, z]) => v3(x, yUnder, z)), true), fascia);
  }
  const shape = new THREE.Shape((drip > 0 ? loopI : loop).map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(Math.PI / 2);
  g.translate(0, yUnder, 0);
  add(group, g, under);
  return topY;
}

// ---------- hardtop ----------

export function hardtop(group, lines, m, build) {
  const { L, section, halfBeam } = lines;
  const pm = partMaterials(m);
  const x0 = L * 0.36;
  const x1 = L * 0.72;            // cabin front, clear of the fine entry
  const xFore = L * 0.78;         // where cockpit.js starts the foredeck
  const sideY = (x) => lines.sheer(x / L) - 0.05;   // side decks, flush with the foredeck
  // Walkway measured from the inside of the gunwale capping.
  const hw = (x) => Math.max(0.42, section(x / L).inner - TREAD);
  // Standing headroom at the helm, cockpit floor to roof underside: 1.86 m (550) to 1.94 m (680).
  const yR = DECK_Y + 1.9 + (L - 6.2) * 0.06;
  const wallZ = (x, y) => hw(x) - TUMBLE * clamp01((y - sideY(x)) / (yR - sideY(x)));
  // Liner face, never outside the hull plating (the vee comes up under the walls forward).
  const wallIn = (x, y) => Math.min(wallZ(x, y) - WALL, lines.halfWidth(section(x / L), y) - 0.012);

  // Front profile on the corner line: low vertical face on the foredeck, 45 degree nose up to
  // the screen foot at dash height, raked screen. Plan facets: a flat centre panel within zc,
  // corner panels swept aft. Every front surface is x = X(y, z).
  const Cy = DECK_Y + 1.02;
  const yB2 = Math.min(Cy - 0.12, Math.max(sideY(x1) + 0.06, Cy - NOSE));
  const C0 = x1 - (Cy - yB2);
  const tr = Math.tan(RAKE);
  const f = (y) => (y <= yB2 ? x1 : y <= Cy ? x1 - (y - yB2) : C0 - tr * (y - Cy));
  const zc = 0.42 * wallZ(C0, Cy);
  // The corners stay at or ahead of the corner line, so the helm's full-width dash fits behind.
  const dmax = wallZ(C0 - 0.1, Cy) - zc + 0.02;
  const X = (y, z) => f(y) + SWEEP * (dmax - Math.max(0, Math.abs(z) - zc));
  const solve = (y, zf) => { let x = f(y); for (let i = 0; i < 6; i++) x = X(y, zf(x, y)); return x; };
  const frontOut = (y) => solve(y, wallZ);
  const zOut = (y) => wallZ(frontOut(y), y);
  const frontInRaw = (y) => solve(y, wallIn);
  const frontIn = (y) => frontInRaw(y) - (y > yB2 ? GLASS_SET : 0);

  // ----- side walls with window openings -----
  const yw0 = Math.max(yR - 0.76, Cy + 0.06);  // sills clear the helm dash top (C[1] + 0.035)
  const yh = yR - 0.13;
  const P = 0.1;                                 // forward pillar, measured fore and aft
  const xs0 = x0 + 0.17;
  const xe = frontOut(yw0) - P;
  const xmA = lerp(xs0, xe, 0.56);
  const winA = [[xs0, yw0], [xmA - 0.035, yw0], [xmA - 0.035, yh], [xs0, yh]];
  const winB = [[xmA + 0.035, yw0], [xe, yw0], [frontOut(yh) - P, yh], [xmA + 0.035, yh]];
  const loops = [roundLoop(winA, 0.032, 4, 0.12), roundLoop(winB, 0.032, 4, 0.12)];
  const near = (y, dir) => [0.00001, 0.004, 0.012, 0.024, 0.04, 0.06].map((d) => y + dir * d);
  const bandRows = uniq([...near(yw0, 1), ...spaced(yw0 + 0.09, yh - 0.09, 3), ...near(yh, -1)]);
  const cols = (a, b) => spaced(0, 1, Math.max(2, Math.ceil(Math.abs(b - a) / 0.14)));
  const piece = (rows, xL, xR, zf, material) => {
    const mid = rows[Math.floor(rows.length / 2)];
    pair(group, grid(cols(xL(mid), xR(mid)), rows, (u, y) => { const x = lerp(xL(y), xR(y), u); return [x, y, zf(x, y)]; }), material);
  };
  const lowRows = (yFrom) => uniq([...spaced(yFrom, yw0, 6), sideY(x0), sideY(x1), yB2, ...(Cy < yw0 ? [Cy] : [])].filter((y) => y >= yFrom && y <= yw0));
  const topRows = spaced(yh - 0.00001, yR, 2);
  const skins = [
    { zf: wallZ, front: frontOut, xa: x0, material: m.trim, rows: lowRows(sideY(x0) - 0.02) },
    { zf: wallIn, front: frontIn, xa: x0 + WALL, material: pm.liner, rows: lowRows(DECK_Y) },
  ];
  for (const { zf, front, xa, material, rows } of skins) {
    piece(rows, () => xa, front, zf, material);
    piece(bandRows, () => xa, (y) => spanAt(loops[0], y)[0], zf, material);
    piece(bandRows, (y) => spanAt(loops[0], y)[1], (y) => spanAt(loops[1], y)[0], zf, material);
    piece(bandRows, (y) => spanAt(loops[1], y)[1], front, zf, material);
    piece(topRows, () => xa, front, zf, material);
  }

  // Window reveals, black sliding-window extrusions inside and out, glass in two tracks.
  const onWall = (loop, d) => loop.map(([x, y]) => v3(x, y, wallZ(x, y) + d));
  const trackOut = -0.009;
  const trackIn = -0.019;
  for (const [k, loop] of loops.entries()) {
    const fin = offsetLoop(loop, -0.012);
    const fout = offsetLoop(loop, 0.02);
    pair(group, strip(onWall(loop, 0), onWall(loop, -WALL), true), pm.frame);
    pair(group, strip(onWall(fin, 0.006), onWall(fout, 0.006), true), pm.frame);
    pair(group, strip(onWall(fout, -0.002), onWall(fout, 0.006), true), pm.frame);
    pair(group, strip(onWall(fin, 0.006), onWall(fin, trackOut), true), pm.frame);
    pair(group, strip(onWall(fin, -WALL - 0.005), onWall(fout, -WALL - 0.005), true), pm.frame);
    pair(group, strip(onWall(fout, -WALL + 0.002), onWall(fout, -WALL - 0.005), true), pm.frame);
    pair(group, strip(onWall(fin, -WALL - 0.005), onWall(fin, trackIn), true), pm.frame);
    // Sliding split: the aft pane rides the outer track, the forward pane the inner one.
    const poly = k === 0 ? winA : winB;
    const xs = k === 0 ? (poly[0][0] + poly[1][0]) / 2 : lerp(poly[3][0], poly[2][0], 0.5);
    const rows = bandRows.filter((y) => y > yw0 && y < yh);
    const pane = (lo, hi, d) => pair(group, grid(spaced(0, 1, 3), rows, (u, y) => {
      const [a, b] = spanAt(loop, y);
      const x = lerp(Math.max(a, lo), Math.min(b, hi), u);
      return [x, y, wallZ(x, y) + d];
    }), pm.glass, { cast: false });
    pane(-Infinity, xs + 0.012, trackOut);
    pane(xs - 0.012, Infinity, trackIn);
    const bar = (xa, xb, d, dd) => {
      const run = [yw0 + 0.004, yh - 0.004];
      pair(group, grid([0, 1], run, (u, y) => { const x = lerp(xa, xb, u); return [x, y, wallZ(x, y) + d]; }), pm.frame);
      pair(group, grid([0, 1], run, (u, y) => [xb, y, wallZ(xb, y) + lerp(d, dd, u)]), pm.frame);
    };
    bar(xs - 0.01, xs + 0.014, trackOut + 0.005, trackOut - 0.003);
    bar(xs + 0.01, xs - 0.014, trackIn - 0.005, trackIn + 0.003);
    // Latch on the sliding pane.
    pair(group, grid([0, 1], [0.5 * (yw0 + yh) - 0.03, 0.5 * (yw0 + yh) + 0.03], (u, y) => { const x = xs - 0.03 + u * 0.016; return [x, y, wallZ(x, y) + trackIn - 0.008]; }), m.stainless);
  }

  // ----- front: face, nose and three-panel windscreen -----
  const zAt = (u, zo) => (u < 0.25 ? lerp(-zo, -zc, u / 0.25) : u > 0.75 ? lerp(zc, zo, (u - 0.75) / 0.25) : lerp(-zc, zc, (u - 0.25) / 0.5));
  const fc = uniq([...spaced(0, 0.25, 3), ...spaced(0.25, 0.75, 4), ...spaced(0.75, 1, 3)]);
  const frontSheet = (rows, inset, dx, material, opts) => add(group, grid(fc, rows, (u, y) => {
    const z = zAt(u, zOut(y) - inset);
    return [X(y, z) + dx, y, z];
  }, (p) => [p[2] * 0.5, p[1] * 0.5]), material, opts);
  // Face, standing on the foredeck at its own station.
  add(group, grid(fc, spaced(0, 1, 3), (u, v) => {
    const yEst = lerp(sideY(x1), yB2, v);
    const z = zAt(u, zOut(yEst));
    const x = X(yEst, z);
    return [x, lerp(sideY(x) - 0.004, yB2, v), z];
  }, (p) => [p[2] * 0.5, p[1] * 0.5]), m.trim);
  frontSheet(spaced(yB2, Cy, 3), 0, 0, m.trim);
  frontSheet(spaced(Cy, yR, 4), WALL / 2, -GLASS_SET, pm.glass, { cast: false });
  // Frame: sill, head, pillars and the two mullions over the facet folds.
  frontSheet([Cy, Cy + 0.05], 0, 0.004, pm.frame);
  frontSheet([yR - 0.055, yR], 0, 0.004, pm.frame);
  const screenRows = spaced(Cy, yR, 4);
  for (const s of [1, -1]) {
    add(group, grid([0, 1], screenRows, (u, y) => { const z = s * (zOut(y) - 0.045 * (1 - u)); return [X(y, z) + 0.004, y, z]; }), pm.frame);
    add(group, grid([-0.022, 0, 0.022], screenRows, (u, y) => { const z = s * (zc + u); return [X(y, z) + 0.004, y, z]; }), pm.frame);
    // Pillar reveal, outer plate to liner.
    add(group, strip(screenRows.map((y) => v3(frontOut(y), y, s * zOut(y))), screenRows.map((y) => v3(frontIn(y), y, s * wallIn(frontInRaw(y), y)))), pm.frame);
  }
  // Wipers parked on the centre and starboard panels.
  const onScreen = (y, z, d = 0.012) => v3(X(y, z) + d, y, z);
  for (const [pz, tz] of [[0.04, -0.16], [zc + 0.2, zc + 0.04]]) {
    const pivot = onScreen(Cy + 0.07, pz);
    const tip = onScreen(Cy + 0.5, tz);
    rod(group, pivot, tip, 0.006, pm.frame, 6);
    const dir = new THREE.Vector3().subVectors(tip, pivot).normalize();
    rod(group, tip.clone().addScaledVector(dir, -0.36).add(v3(0.006, 0, 0)), tip.clone().addScaledVector(dir, 0.04).add(v3(0.006, 0, 0)), 0.008, pm.frame, 6);
    const hub = add(group, new THREE.CylinderGeometry(0.018, 0.02, 0.025, 12), pm.frame);
    hub.position.copy(onScreen(Cy + 0.07, pz, 0.008));
    hub.rotation.z = -(Math.PI / 2 - RAKE);
  }

  // ----- rear bulkhead with a rolled-edge opening -----
  const zo = Math.min(wallIn(x0, DECK_Y) - 0.17, 0.72);
  const yo = yR - 0.16;
  const ro = 0.12;
  const opening = [[zo, DECK_Y]];
  for (let k = 0; k <= 5; k++) { const a = (k / 5) * (Math.PI / 2); opening.push([zo - ro + ro * Math.cos(a), yo - ro + ro * Math.sin(a)]); }
  for (let k = 0; k <= 5; k++) { const a = Math.PI / 2 + (k / 5) * (Math.PI / 2); opening.push([-zo + ro + ro * Math.cos(a), yo - ro + ro * Math.sin(a)]); }
  opening.push([-zo, DECK_Y]);
  const sideRun = (zf, s, up) => (up ? spaced(DECK_Y, yR, 8) : spaced(yR, DECK_Y, 8)).map((y) => [s * zf(x0, y), y]);
  for (const [x, zf, material] of [[x0, wallZ, m.trim], [x0 + WALL, wallIn, pm.liner]]) {
    const outline = [...sideRun(zf, -1, true), ...sideRun(zf, 1, false), ...opening];
    const g = new THREE.ShapeGeometry(new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(-z, y))));
    g.rotateY(Math.PI / 2);
    g.translate(x, 0, 0);
    const uvs = g.attributes.uv;
    const ps = g.attributes.position;
    for (let i = 0; i < uvs.count; i++) uvs.setXY(i, ps.getZ(i) * 0.5, ps.getY(i) * 0.5);
    add(group, g, material);
  }
  add(group, tube(opening.map(([z, y]) => v3(x0 + WALL / 2, y, z)), WALL / 2 + 0.005, 60, 8), m.trim);
  // Grab handles on the bulkhead returns.
  for (const s of [1, -1]) {
    const z = s * (zo + 0.085);
    const ya = sideY(x0) + 0.35;
    const yb = yR - 0.45;
    add(group, tube([v3(x0, ya, z), v3(x0 - 0.06, ya + 0.04, z), v3(x0 - 0.06, yb - 0.04, z), v3(x0, yb, z)], 0.0125, 24, 8), m.stainless);
  }

  // ----- side decks, flush with the foredeck, with an end face at the cabin's aft end -----
  const deckMat = nonslipMaterial();
  const metres = (p) => [p[0], p[2]];
  pair(group, grid(spaced(0, 1, 3), spaced(x0, x1, 16), (u, x) => [x, sideY(x), lerp(wallZ(x, sideY(x)), section(x / L).inner, u)], metres), deckMat);
  // Short deck ahead of the cabin front, continuing cockpit.js's foredeck (same surface).
  if (xFore > x1 + 0.01) {
    pair(group, grid(spaced(0, 1, 4), spaced(x1, xFore, 4), (u, x) => [x, sideY(x), u * Math.max(0, section(x / L).hb - CAP * 0.5)], metres), deckMat);
  }
  const sa = section(x0 / L);
  for (const s of [1, -1]) {
    add(group, crossSection([[s * hw(x0), DECK_Y], [s * hw(x0), sideY(x0)], [s * sa.inner, sideY(x0)], [s * sa.inner, DECK_Y]], x0), m.deck);
  }

  // ----- nav lights on the cabin sides, forward: red to port, green to starboard -----
  // fittings.js draws the light square to the boat; a black wedge pad takes up the wall's taper.
  for (const s of [1, -1]) {
    const x = x1 - 0.32;
    const y = sideY(x) + 0.17;
    const slope = (wallZ(x + 0.05, y) - wallZ(x - 0.05, y)) / 0.1;
    const zMax = Math.max(wallZ(x - 0.065, y), wallZ(x + 0.065, y));
    fit.navLight(group, m, x, y, s * (zMax + 0.01));
    const pad = Math.abs(slope) * 0.13 + 0.006;
    const nrm = v3(-slope, 0, 1).normalize();
    const wedge = add(group, new THREE.BoxGeometry(0.14, 0.072, pad), pm.frame);
    wedge.position.set(x, y, s * wallZ(x, y)).add(v3(nrm.x, 0, s * nrm.z).multiplyScalar(pad / 2));
    wedge.rotation.y = -Math.atan(s * slope);
  }

  // ----- roof: crowned, drip edge, aft overhang on legs to the gunwales -----
  const roofAft = x0 - 0.5;
  const xLeg = roofAft + 0.09;
  const sl = section(xLeg / L);
  const footZ = sl.hb - CAP / 2;
  const legTop = lerp(wallZ(x0, yR) + 0.06, footZ, 0.55);
  const ra = legTop + 0.06;
  const OV = 0.13;
  const rf = zOut(yR) + 0.09;
  const roofPoly = [
    [roofAft, ra], [roofAft, -ra], [X(yR, rf) + OV, -rf], [X(yR, zc) + OV, -zc],
    [X(yR, zc) + OV, zc], [X(yR, rf) + OV, rf],
  ];
  const roofLoop = roundLoop(roofPoly, [0.08, 0.08, 0.12, 0.35, 0.35, 0.12], 5, 0.1);
  const roofY = slab(group, roofLoop, { yUnder: yR, edge: 0.05, crown: 0.02, halfW: ra, top: m.trim, under: m.trim, drip: 0.02 });
  // Headliner inside the cabin.
  const xFt = frontInRaw(yR) - GLASS_SET - 0.004;
  const sideIn = spaced(x0 + WALL, xFt, 10).map((x) => [x, wallIn(x, yR)]);
  const headPoly = [
    ...sideIn.map(([x, z]) => [x, -z]),
    [X(yR, -zc) - GLASS_SET - 0.004, -zc], [X(yR, zc) - GLASS_SET - 0.004, zc],
    ...sideIn.reverse(),
  ];
  const head = new THREE.ShapeGeometry(new THREE.Shape(headPoly.map(([x, z]) => new THREE.Vector2(x, z))));
  head.rotateX(Math.PI / 2);
  head.translate(0, yR - 0.004, 0);
  const huv = head.attributes.uv;
  for (let i = 0; i < huv.count; i++) huv.setXY(i, head.attributes.position.getX(i) * 0.5, head.attributes.position.getZ(i) * 0.5);
  add(group, head, pm.liner);

  // Aft legs from base plates on the gunwale capping, flanged under the roof.
  for (const s of [1, -1]) {
    const foot = v3(xLeg, sl.ys + 0.008, s * footZ);
    const topP = v3(xLeg, yR - 0.02, s * legTop);
    rod(group, foot, topP, 0.025, m.stainless, 14);
    box(group, m.stainless, [0.13, 0.008, 0.105], [xLeg, sl.ys + 0.004, s * footZ]);
    const socket = add(group, new THREE.CylinderGeometry(0.033, 0.036, 0.05, 16), m.stainless);
    socket.position.set(xLeg, sl.ys + 0.033, s * footZ);
    const flange = add(group, new THREE.CylinderGeometry(0.045, 0.045, 0.01, 16), m.stainless);
    flange.position.set(xLeg, yR - 0.005, s * legTop);
  }

  // Grab rails on stand-offs either side of the roof.
  const xFc = X(yR, rf) + OV;
  const halfAt = (x) => lerp(ra, rf, (x - roofAft) / (xFc - roofAft));
  const flangeAt = (x, z) => {
    const fl = add(group, new THREE.CylinderGeometry(0.022, 0.024, 0.008, 12), m.stainless);
    fl.position.set(x, roofY(x, z) + 0.004, z);
  };
  for (const s of [1, -1]) {
    const xg0 = x0 - 0.05;
    const xg1 = xFc - 0.4;
    const z = (x) => s * (halfAt(x) - 0.13);
    const h = 0.07;
    const at = (x, dy) => v3(x, roofY(x, z(x)) + dy, z(x));
    const pts = [at(xg0, 0.004), at(xg0, h - 0.02), at(xg0 + 0.02, h), ...spaced(xg0 + 0.08, xg1 - 0.08, 4).map((x) => at(x, h)), at(xg1 - 0.02, h), at(xg1, h - 0.02), at(xg1, 0.004)];
    add(group, tube(pts, 0.0125, 64, 8), m.stainless);
    for (const x of [xg0, xg1]) flangeAt(x, z(x));
    const xm = (xg0 + xg1) / 2;
    rod(group, at(xm, 0.004), at(xm, h), 0.011, m.stainless, 8);
    flangeAt(xm, z(xm));
  }

  // LED spotlight on a yoke, forward on the roof centreline.
  const xs = X(yR, 0) + OV - 0.2;
  const ys = roofY(xs, 0);
  box(group, pm.frame, [0.1, 0.012, 0.08], [xs, ys + 0.006, 0]);
  for (const s of [1, -1]) box(group, pm.frame, [0.03, 0.08, 0.008], [xs, ys + 0.05, s * 0.07]);
  const lamp = add(group, new THREE.CylinderGeometry(0.06, 0.052, 0.1, 20), pm.frame);
  lamp.position.set(xs + 0.01, ys + 0.085, 0);
  lamp.rotation.z = -Math.PI / 2;
  const lens = add(group, new THREE.CircleGeometry(0.052, 20), m.lens, { cast: false });
  lens.position.set(xs + 0.0615, ys + 0.085, 0);
  lens.rotation.y = Math.PI / 2;

  // VHF whip on a ratchet mount, aft port corner.
  const xv = roofAft + 0.32;
  const zv = -(halfAt(xv) - 0.12);
  const yv = roofY(xv, zv);
  box(group, pm.frame, [0.07, 0.03, 0.06], [xv, yv + 0.015, zv]);
  const ratchet = add(group, new THREE.CylinderGeometry(0.025, 0.025, 0.03, 14), m.stainless);
  ratchet.position.set(xv, yv + 0.05, zv);
  ratchet.rotation.x = Math.PI / 2;
  const whipDir = v3(-0.12, 1, 0).normalize();
  const coil = add(group, new THREE.CylinderGeometry(0.014, 0.016, 0.12, 10), pm.frame);
  coil.position.set(xv, yv + 0.06, zv).addScaledVector(whipDir, 0.07);
  coil.quaternion.setFromUnitVectors(v3(0, 1, 0), whipDir);
  const whip = add(group, new THREE.CylinderGeometry(0.004, 0.009, 1.35, 8), pm.white);
  whip.position.set(xv, yv + 0.06, zv).addScaledVector(whipDir, 0.13 + 0.675);
  whip.quaternion.setFromUnitVectors(v3(0, 1, 0), whipDir);

  // All-round white light, aft on the centreline (fittings.js; present after integration).
  const xp = roofAft + 0.34;
  fit.allRoundLight?.(group, m, xp, roofY(xp, 0), 0);

  if (build.options.includes('rocket')) {
    // Launcher on the roof's aft edge, on two stand-offs.
    const xr = roofAft + 0.14;
    const yr = yR + 0.09;
    const width = (halfBeam(x0 / L) - 0.29) * 1.5;
    fit.rocketLauncher(group, m, xr, yr, width, 6);
    for (const s of [1, -1]) {
      const z = s * (width / 2 - 0.05);
      rod(group, v3(xr, roofY(xr, z), z), v3(xr, yr, z), 0.014, m.stainless, 8);
      flangeAt(xr, z);
    }
  }

  return { C: [C0, Cy], hw: (x) => hw(x) - WALL, wallZ: wallIn };
}
