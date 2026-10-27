import * as THREE from 'three';
import { lit } from '../materials.js';
import { add, tube, rod, box, crossSection, loft, sectionRing, spaced, v3, lerp, clamp01 } from './kit.js';
import { DECK_Y, CAP } from './hull.js';
import { nonslipMaterial } from './cockpit.js';
import * as fit from './fittings.js';

// Walkaround hardtop, built from flat alloy plate like the real thing: side walls with a little
// tumblehome, a three-facet front (vertical face, sloped nose, raked windscreen) with swept corner
// panels, double-skinned walls with real window openings (tinted glass set back in slim black
// powder-coated sliding frames with rubber seals, tracks, meeting rails and latches), rolled aft
// corners, a weld fillet to the side deck, a cabin-side grab rail and aft handholds, a rear
// bulkhead with a rolled-edge opening, grab handles and a fire extinguisher, walkable side decks
// and a short deck ahead of the cabin. Inside: grey carpet liner (clipped to the hull plating),
// side pockets, vinyl headliner with overhead grab rails, and a V-berth in the cuddy behind
// helm.js's bulkhead door. The roof is crowned with a slim rolled edge over a drip lip, an aft
// overhang on legs to the gunwale capping with a headliner panel and LED cockpit lights, grab
// rails, LED spotlight and VHF whip.
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
  for (let i = 0; i < 6000; i++) {
    const g = 200 + Math.random() * 55;
    ctx.fillStyle = `rgba(${g},${g},${g},0.45)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1.4, 1.4);
  }
  ctx.fillStyle = 'rgba(40,40,40,0.45)';
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
    glass: lit({ color: '#2a3a42', metalness: 0, roughness: 0.04, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.3 }),
    // Black powder-coated window extrusions and screen frame: satin, not gloss.
    frame: lit({ color: '#1c1e20', metalness: 0.3, roughness: 0.48, side: THREE.DoubleSide }),
    // EPDM glazing seal, matte and a shade darker than the frame.
    seal: lit({ color: '#0d0e0f', roughness: 0.9, side: THREE.DoubleSide }),
    // Mid-grey marine carpet lining the cabin walls.
    liner: lit({ color: '#767a7e', map: linerTexture(), roughness: 0.96, side: THREE.DoubleSide }),
    // Light grey vinyl headliner panels.
    headliner: lit({ color: '#cfd0cc', roughness: 0.74, side: THREE.DoubleSide }),
    // Upholstery to match helm.js's seats.
    vinyl: lit({ color: '#e6e3dc', roughness: 0.55 }),
    piping: lit({ color: '#8e9195', roughness: 0.5 }),
    // LED light lens, switched off.
    ledLens: lit({ color: '#eef1f3', roughness: 0.28 }),
    extinguisher: lit({ color: '#b01a1c', roughness: 0.32 }),
    // Smoked acrylic for the console screen.
    acrylic: lit({ color: '#1f2b31', metalness: 0, roughness: 0.02, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.03 }),
    canvas: lit({ roughness: 0.93, side: THREE.DoubleSide }),
    binding: lit({ roughness: 0.85 }),
    white: lit({ color: '#efeee9', roughness: 0.4 }),
    // VHF whip (hardtop and T-top): its own material so the camera fit can skip it.
    whip: lit({ color: '#efeee9', roughness: 0.4 }),
  };
  for (const mat of Object.values(pm)) mat.userData.shared = true;
  pm.whip.userData.noFit = true;
  cache.set(m, pm);
  return pm;
}

// Distance from (x, z) to the nearest edge of a closed loop.
function edgeDistance(loop, x, z) {
  let d = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const [ax, az] = loop[i];
    const [bx, bz] = loop[(i + 1) % loop.length];
    const dx = bx - ax;
    const dz = bz - az;
    const t = clamp01(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1));
    d = Math.min(d, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return d;
}

// Closed band through offset copies of a plan loop: rows = [[offset, y(x, z)]...], smooth
// shading across the rows (split into separate bands for a crisp crease).
function loopBand(loop, rows) {
  const n = loop.length;
  const pos = [];
  const uv = [];
  const idx = [];
  const runs = [0];
  for (let i = 1; i < n; i++) runs.push(runs[i - 1] + Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]));
  rows.forEach(([o, yf], r) => {
    (o ? offsetLoop(loop, o) : loop).forEach(([x, z], i) => {
      pos.push(x, yf(x, z), z);
      uv.push(runs[i] * 0.5, r * 0.01);
    });
  });
  for (let r = 0; r < rows.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      idx.push(a, b, a + n, b, b + n, a + n);
    }
  }
  return finishGeometry(pos, uv, idx);
}

// Roof-like slab: the hardtop roof and the T-top canopy. loop is the CCW plan outline [[x, z]...].
// The flat underside is at yUnder; the edge is a constant-height lip (thick + drip, the drip
// hanging below the underside) with the top edge rolled over at radius round; the top domes by
// crown towards the middle, reaching it reach metres in from the edge, so the visible edge stays
// thin all round. Returns the top-surface height function.
export function slab(group, loop, { yUnder, thick, drip = 0, crown = 0, reach = 0.6, round = 0.01, lip = 0.004, top, under, fascia = top }) {
  const eT = yUnder + thick;
  const yLow = yUnder - drip;
  const dome = (x, z) => { const u = Math.min(1, edgeDistance(loop, x, z) / reach); return crown * (1 - (1 - u) ** 2); };
  const topY = (x, z) => eT + dome(x, z);
  add(group, ringCap(offsetLoop(loop, -round), (x, z) => v3(x, topY(x, z), z), [1, 0.9, 0.74, 0.54, 0.32, 0.12]), top);
  // Rolled top edge and fascia in one smooth band, a small eased corner at the drip.
  const arc = [0, 0.33, 0.67, 1].map((k) => (k * Math.PI) / 2);
  add(group, loopBand(loop, [
    ...arc.map((t) => [-round + round * Math.sin(t), (x, z) => eT - round + round * Math.cos(t) + dome(x, z)]),
    [0, () => yLow + 0.006],
    [0, () => yLow + 0.002],
    [-0.0015, () => yLow],
  ]), fascia);
  // Underside of the lip and its inner face up to the underside.
  const lipRows = [[-0.0015, () => yLow], [-lip, () => yLow]];
  if (drip > 0) lipRows.push([-lip, () => yUnder]);
  add(group, loopBand(loop, lipRows), fascia);
  const shape = new THREE.Shape(offsetLoop(loop, -lip).map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(Math.PI / 2);
  g.translate(0, yUnder, 0);
  add(group, g, under);
  return topY;
}

// Upholstered pad along x from xa to xb: rounded-box sections (superellipse, exponent p) of
// height h standing on yb, half width hw (number or function of x) about zc(x); every end is
// rolled over at radius R. Returns { geometry, welt } where welt is the closed run of the piping
// seam: through the section angles welt[0] (on the +z side) and welt[1] (back along the other).
export function pillow({ xa, xb, yb, h, hw, zc = () => 0, R = 0.03, p = 3, n = 24, steps = 8, welt = [0.55, Math.PI - 0.55] }) {
  const xs = uniq([...spaced(xa, xa + R, 4), ...spaced(xa + R, xb - R, steps), ...spaced(xb - R, xb, 4)]);
  const sizes = xs.map((x) => {
    const e = Math.min(x - xa, xb - x);
    const k = 1 - Math.sqrt(Math.max(0, 1 - (1 - Math.min(e / R, 1)) ** 2));
    return { x, hh: Math.max(0.003, h / 2 - R * k), ww: Math.max(0.003, (typeof hw === 'function' ? hw(x) : hw) - R * k), z: zc(x) };
  });
  const rings = sizes.map(({ x, hh, ww, z }) => sectionRing(x, yb + h / 2, hh, ww, p, n).map((q) => q.setZ(q.z + z)));
  const at = ({ x, hh, ww, z }, a) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    return v3(x, yb + h / 2 + hh * Math.sign(s) * Math.abs(s) ** (2 / p), z + ww * Math.sign(c) * Math.abs(c) ** (2 / p));
  };
  const seam = [...sizes.slice(1, -1).map((sz) => at(sz, welt[0])), ...sizes.slice(1, -1).reverse().map((sz) => at(sz, welt[1]))];
  return { geometry: loft(rings), welt: seam };
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
  const sy0 = sideY(x0);

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

  // Small fittings on the starboard cabin side, built as geometry so pair() can mirror them.
  const wallN = (x, y) => v3(-(wallZ(x + 0.01, y) - wallZ(x - 0.01, y)) / 0.02, -(wallZ(x, y + 0.01) - wallZ(x, y - 0.01)) / 0.02, 1).normalize();
  const onSide = (x, y, d) => v3(x, y, wallZ(x, y)).addScaledVector(wallN(x, y), d);
  const along = (g, at, dir) => g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), dir)).translate(at.x, at.y, at.z);
  const rodG = (a, b, r, seg = 8) => along(new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg), a.clone().lerp(b, 0.5), b.clone().sub(a).normalize());
  const baseG = (x, y, r = 0.021, t = 0.006) => along(new THREE.CylinderGeometry(r, r * 1.08, t, 14), onSide(x, y, t / 2), wallN(x, y));
  const lean = Math.atan(TUMBLE / (yR - sy0));

  // ----- side walls with window openings -----
  const yw0 = Math.max(yR - 0.76, Cy + 0.06);  // sills clear the helm dash top (C[1] + 0.035)
  const yh = yR - 0.13;
  const P = 0.1;                                 // forward pillar, measured fore and aft
  const xs0 = x0 + 0.17;
  const xe = frontOut(yw0) - P;
  const xmA = lerp(xs0, xe, 0.56);
  const winA = [[xs0, yw0], [xmA - 0.035, yw0], [xmA - 0.035, yh], [xs0, yh]];
  const winB = [[xmA + 0.035, yw0], [xe, yw0], [frontOut(yh) - P, yh], [xmA + 0.035, yh]];
  const loops = [roundLoop(winA, 0.022, 4, 0.12), roundLoop(winB, 0.022, 4, 0.12)];
  const near = (y, dir) => [0.00001, 0.004, 0.012, 0.024, 0.04, 0.06].map((d) => y + dir * d);
  const bandRows = uniq([...near(yw0, 1), ...spaced(yw0 + 0.09, yh - 0.09, 3), ...near(yh, -1)]);
  const cols = (a, b) => spaced(0, 1, Math.max(2, Math.ceil(Math.abs(b - a) / 0.14)));
  const piece = (rows, xL, xR, zf, material) => {
    const mid = rows[Math.floor(rows.length / 2)];
    pair(group, grid(cols(xL(mid), xR(mid)), rows, (u, y) => { const x = lerp(xL(y), xR(y), u); return [x, y, zf(x, y)]; }), material);
  };
  const lowRows = (yFrom) => uniq([...spaced(yFrom, yw0, 6), sideY(x0), sideY(x1), yB2, ...(Cy < yw0 ? [Cy] : [])].filter((y) => y >= yFrom && y <= yw0));
  const topRows = spaced(yh - 0.00001, yR, 2);
  const RC = 0.025;                              // radius of the aft cabin corners
  const skins = [
    { zf: wallZ, front: frontOut, xa: x0 + RC, material: m.trim, rows: lowRows(sy0 - 0.02) },
    { zf: wallIn, front: frontIn, xa: x0 + WALL, material: pm.liner, rows: lowRows(DECK_Y) },
  ];
  for (const { zf, front, xa, material, rows } of skins) {
    piece(rows, () => xa, front, zf, material);
    piece(bandRows, () => xa, (y) => spanAt(loops[0], y)[0], zf, material);
    piece(bandRows, (y) => spanAt(loops[0], y)[1], (y) => spanAt(loops[1], y)[0], zf, material);
    piece(bandRows, (y) => spanAt(loops[1], y)[1], front, zf, material);
    piece(topRows, () => xa, front, zf, material);
  }
  // Rolled aft corner between the side and the aft bulkhead.
  pair(group, grid(spaced(0, Math.PI / 2, 5), spaced(sy0 - 0.02, yR, 6), (a, y) => {
    const cz = wallZ(x0 + RC, y) - RC;
    return [x0 + RC - RC * Math.cos(a), y, cz + RC * Math.sin(a)];
  }), m.trim);
  // Weld fillet where the cabin side meets the side deck.
  const xFil = spaced(x0 + RC, Math.min(x1, frontOut(sideY(x1))) - 0.01, 24);
  pair(group, strip(xFil.map((x) => v3(x, sideY(x) + 0.009, wallZ(x, sideY(x) + 0.009))), xFil.map((x) => v3(x, sideY(x) + 0.001, wallZ(x, sideY(x)) + 0.008))), m.trim);

  // Sliding windows: slim black powder-coated extrusions (26 mm face, 4 mm proud of the plate),
  // a rubber glazing seal, glass set back in two tracks with sill and head channels, meeting
  // rails and a latch; a narrower trim ring inside on the liner.
  const onWall = (loop, d) => loop.map(([x, y]) => v3(x, y, wallZ(x, y) + d));
  const G1 = -0.011;              // outer (sliding) pane, behind the wall face
  const G2 = -0.019;              // inner (fixed) pane
  const FD = 0.004;               // flange face, proud of the plate
  const FIN = -0.006;             // flange edge over the opening
  const FOUT = 0.02;              // flange edge on the plate
  const TR = 0.012;               // sill and head channel height inside the opening
  const dI = -WALL - 0.004;       // inside trim ring face
  for (const [k, loop] of loops.entries()) {
    const ring = (o, d) => onWall(o ? offsetLoop(loop, o) : loop, d);
    const band = (o0, d0, o1, d1, material) => pair(group, strip(ring(o0, d0), ring(o1, d1), true), material);
    band(0, 0, 0, -WALL, pm.frame);
    band(FIN, FD, FOUT - 0.003, FD, pm.frame);
    band(FOUT - 0.003, FD, FOUT, -0.001, pm.frame);
    band(FIN, FD, FIN, G1 + 0.004, pm.frame);
    band(FIN, G1 + 0.004, FIN - 0.005, G1 + 0.0005, pm.seal);
    band(FIN + 0.002, dI, 0.016, dI, pm.frame);
    band(0.016, dI, 0.016, -WALL + 0.001, pm.frame);
    band(FIN + 0.002, dI, FIN + 0.002, G2 - 0.004, pm.frame);
    band(FIN + 0.002, G2 - 0.004, FIN - 0.003, G2 - 0.0005, pm.seal);
    // Sill and head channels the panes slide in.
    for (const [ya, yb] of [[yw0 - 0.001, yw0 + TR], [yh + 0.001, yh - TR]]) {
      const [a, b] = spanAt(loop, yb);
      pair(group, grid(spaced(0, 1, 4), [ya, yb], (u, y) => { const x = lerp(a, b, u); return [x, y, wallZ(x, y) + G1 + 0.003]; }), pm.frame);
      pair(group, grid(spaced(0, 1, 4), [G1 + 0.003, G2 - 0.003], (u, d) => { const x = lerp(a, b, u); return [x, yb, wallZ(x, yb) + d]; }), pm.frame);
    }
    // Sliding split: the aft pane rides the outer track, the forward pane the inner one.
    const poly = k === 0 ? winA : winB;
    const xs = k === 0 ? (poly[0][0] + poly[1][0]) / 2 : lerp(poly[3][0], poly[2][0], 0.5);
    const rows = bandRows.filter((y) => y >= yw0 + TR - 1e-6 && y <= yh - TR + 1e-6);
    const pane = (lo, hi, d) => pair(group, grid(spaced(0, 1, 3), rows, (u, y) => {
      const [a, b] = spanAt(loop, y);
      const x = lerp(Math.max(a, lo), Math.min(b, hi), u);
      return [x, y, wallZ(x, y) + d];
    }), pm.glass, { cast: false });
    pane(-Infinity, xs + 0.012, G1);
    pane(xs - 0.012, Infinity, G2);
    // Meeting rails, 18 mm wide.
    const bar = (xa, xb, d, dd) => {
      const run = [yw0 + TR, yh - TR];
      pair(group, grid([0, 1], run, (u, y) => { const x = lerp(xa, xb, u); return [x, y, wallZ(x, y) + d]; }), pm.frame);
      pair(group, grid([0, 1], run, (u, y) => [xb, y, wallZ(xb, y) + lerp(d, dd, u)]), pm.frame);
    };
    bar(xs - 0.006, xs + 0.012, G1 + 0.004, G1 - 0.004);
    bar(xs + 0.006, xs - 0.012, G2 - 0.004, G2 + 0.004);
    // Latch on the inner meeting rail.
    const ly = 0.5 * (yw0 + yh);
    const latch = new THREE.BoxGeometry(0.01, 0.034, 0.007).rotateX(-lean).translate(xs - 0.004, ly, wallZ(xs, ly) + G2 - 0.0085);
    pair(group, latch, m.stainless);
  }

  // Cabin-side grab rail under the windows and a vertical handhold at the aft corner, on
  // stand-offs with base plates.
  for (const [ya, yb, xa, xb, vertical] of [
    [yw0 - 0.095, yw0 - 0.095, xs0 + 0.04, Math.min(xe - 0.12, x1 - 0.5), false],
    [sy0 + 0.3, Math.min(yw0 + 0.3, yh - 0.06), x0 + 0.075, x0 + 0.075, true],
  ]) {
    const pt = (t, d) => onSide(lerp(xa, xb, t), lerp(ya, yb, t), d);
    const len = Math.hypot(xb - xa, yb - ya);
    const e = 0.03 / len;
    const pts = [pt(0, 0.003), pt(0, 0.036), pt(e, 0.052), ...spaced(0.2, 0.8, 3).map((t) => pt(t, 0.052)), pt(1 - e, 0.052), pt(1, 0.036), pt(1, 0.003)];
    pair(group, tube(pts, 0.0125, vertical ? 20 : 30, 8), m.stainless);
    for (const t of [0, 1]) pair(group, baseG(lerp(xa, xb, t), lerp(ya, yb, t)), m.stainless);
    if (!vertical) {
      for (const t of [1 / 3, 2 / 3]) {
        pair(group, rodG(pt(t, 0.003), pt(t, 0.05), 0.0095), m.stainless);
        pair(group, baseG(lerp(xa, xb, t), ya), m.stainless);
      }
    }
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
  // Frame: slim extrusions (30-35 mm faces) 4 mm proud of the plate, with returns down to the
  // glass and a rubber seal line along every glazed edge.
  const FP = 0.004;
  const gl = -GLASS_SET + 0.002;
  const fpt = (y, z, d) => [X(y, z) + d, y, z];
  const across = (u, y, inset = 0) => zAt(u, zOut(y) - inset);
  for (const [ya, yb] of [[Cy, Cy + 0.035], [yR, yR - 0.03]]) {
    const dir = Math.sign(yb - ya);
    add(group, grid(fc, [ya, yb], (u, y) => fpt(y, across(u, y), FP)), pm.frame);
    add(group, grid(fc, [FP, gl], (u, d) => fpt(yb, across(u, yb), d)), pm.frame);
    add(group, grid(fc, [yb, yb + dir * 0.005], (u, y) => fpt(y, across(u, y, 0.03), gl - 0.001)), pm.seal);
  }
  const screenRows = spaced(Cy + 0.035, yR - 0.03, 4);
  const allRows = spaced(Cy, yR, 4);
  for (const s of [1, -1]) {
    // Corner pillar.
    const pz = (y, w) => s * (zOut(y) - w);
    add(group, grid([0, 1], allRows, (u, y) => fpt(y, pz(y, 0.032 * (1 - u)), FP)), pm.frame);
    add(group, grid([FP, gl], allRows, (d, y) => fpt(y, pz(y, 0.032), d)), pm.frame);
    add(group, grid([0, 1], screenRows, (u, y) => fpt(y, pz(y, lerp(0.032, 0.037, u)), gl - 0.001)), pm.seal);
    // Mullion over the facet fold.
    add(group, grid([-0.016, 0, 0.016], allRows, (u, y) => fpt(y, s * (zc + u), FP)), pm.frame);
    for (const e of [-1, 1]) {
      add(group, grid([FP, gl], allRows, (d, y) => fpt(y, s * (zc + e * 0.016), d)), pm.frame);
      add(group, grid([0, 1], screenRows, (u, y) => fpt(y, s * (zc + e * lerp(0.016, 0.021, u)), gl - 0.001)), pm.seal);
    }
    // Pillar reveal, outer plate to liner.
    add(group, strip(allRows.map((y) => v3(frontOut(y), y, s * zOut(y))), allRows.map((y) => v3(frontIn(y), y, s * wallIn(frontInRaw(y), y)))), pm.frame);
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
  // The outer skin stops short of the side by the corner radius above the side deck.
  const runY = (inset) => (inset ? [[DECK_Y, 0], [sy0, 0], ...spaced(sy0, yR, 7).map((y) => [y, RC])] : spaced(DECK_Y, yR, 8).map((y) => [y, 0]));
  const sideRun = (zf, s, up, inset) => { const r = runY(inset).map(([y, d]) => [s * (zf(x0, y) - d), y]); return up ? r : r.reverse(); };
  for (const [x, zf, material, inset] of [[x0, wallZ, m.trim, true], [x0 + WALL, wallIn, pm.liner, false]]) {
    const outline = [...sideRun(zf, -1, true, inset), ...sideRun(zf, 1, false, inset), ...opening];
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
  // Fire extinguisher in its bracket on the port return, below the handle.
  {
    const z = -(zo + 0.088);
    const yb = DECK_Y + 0.32;
    const xc = x0 - 0.054;
    const body = add(group, new THREE.CylinderGeometry(0.045, 0.045, 0.27, 14, 1, true), pm.extinguisher);
    body.position.set(xc, yb + 0.135, z);
    const shoulder = add(group, new THREE.SphereGeometry(0.045, 14, 4, 0, Math.PI * 2, 0, Math.PI / 2), pm.extinguisher);
    shoulder.position.set(xc, yb + 0.27, z);
    const valve = add(group, new THREE.CylinderGeometry(0.014, 0.016, 0.05, 10), pm.frame);
    valve.position.set(xc, yb + 0.33, z);
    box(group, pm.frame, [0.012, 0.012, 0.07], [xc + 0.004, yb + 0.358, z + 0.02]);
    const gauge = add(group, new THREE.CylinderGeometry(0.011, 0.011, 0.008, 12), pm.white);
    gauge.position.set(xc - 0.018, yb + 0.33, z);
    gauge.rotation.z = Math.PI / 2;
    const hose = add(group, tube([v3(xc, yb + 0.33, z - 0.014), v3(xc + 0.01, yb + 0.31, z - 0.05), v3(xc + 0.01, yb + 0.2, z - 0.052)], 0.006, 10, 6), pm.frame);
    hose.castShadow = false;
    box(group, pm.frame, [0.008, 0.2, 0.05], [x0 - 0.004, yb + 0.14, z]);
    for (const y of [yb + 0.06, yb + 0.2]) {
      const band2 = add(group, new THREE.CylinderGeometry(0.0475, 0.0475, 0.018, 14, 1, true), pm.frame);
      band2.position.set(xc, y, z);
    }
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

  // ----- cabin interior: carpet-lined, pockets, headliner and grab rails, V-berth forward -----
  const xB = C0 - 0.07;           // helm.js's forward bulkhead
  const xT = xB - 0.27;           // aft edge of helm.js's dash
  // Carpeted side pockets on stand-off panels with a rubber edge trim, aft of the dash.
  {
    const xa = x0 + 0.3;
    const xb = xT - 0.08;
    const ya = DECK_Y + 0.52;
    const yb = DECK_Y + 0.78;
    const D = 0.05;
    const xsP = spaced(xa, xb, Math.max(2, Math.ceil((xb - xa) / 0.25)));
    const front = (x, y) => wallIn(x, y) - D;
    pair(group, grid(xsP, [ya, yb], (x, y) => [x, y, front(x, y)]), pm.liner);
    pair(group, grid(xsP, [0, 1], (x, u) => [x, ya, lerp(wallIn(x, ya), front(x, ya), u)]), pm.liner);
    for (const x of [xa, xb]) pair(group, grid([0, 1], [ya, yb], (u, y) => [x, y, lerp(wallIn(x, y), front(x, y), u)]), pm.liner);
    pair(group, tube(xsP.map((x) => v3(x, yb, front(x, yb) + 0.002)), 0.006, xsP.length * 2, 6), pm.seal);
    for (const x of [xa, xb]) pair(group, tube([v3(x, ya, front(x, ya) + 0.002), v3(x, yb, front(x, yb) + 0.002)], 0.006, 2, 6), pm.seal);
  }
  // Headliner: light grey vinyl panels under the roof.
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
  add(group, head, pm.headliner);
  // Overhead grab rails either side of the helm and passenger seats.
  for (const s of [1, -1]) {
    const z = s * (wallIn(x0 + 0.5, yR) - 0.22);
    const xa = x0 + 0.25;
    const xb = xT - 0.12;
    const y0 = yR - 0.004;
    const yl = y0 - 0.055;
    add(group, tube([v3(xa, y0, z), v3(xa, yl + 0.02, z), v3(xa + 0.025, yl, z), ...spaced(xa + 0.1, xb - 0.1, 3).map((x) => v3(x, yl, z)), v3(xb - 0.025, yl, z), v3(xb, yl + 0.02, z), v3(xb, y0, z)], 0.0125, 24, 6), m.stainless);
    for (const x of [xa, xb]) {
      const fl = add(group, new THREE.CylinderGeometry(0.022, 0.024, 0.006, 12), m.stainless);
      fl.position.set(x, y0 - 0.003, z);
    }
  }
  // V-berth in the cuddy, through helm.js's doorway under the passenger dash: two upholstered
  // cushions on a carpeted base, following the hull.
  {
    const xa = xB + 0.06;
    const xb = Math.min(L * 0.84, x1 + 0.6);
    const yb = DECK_Y + 0.31;
    const zMax = (x) => lines.halfWidth(section(x / L), yb) - 0.04;
    const zBase = (y) => lines.halfWidth(section(xa / L), y) - 0.03;
    const ys = spaced(DECK_Y - 0.02, yb, 4);
    add(group, crossSection([...ys.map((y) => [-zBase(y), y]), ...ys.slice().reverse().map((y) => [zBase(y), y])], xa), pm.liner);
    const top = new THREE.ShapeGeometry(new THREE.Shape([
      ...spaced(xa, xb, 8).map((x) => new THREE.Vector2(x, -zMax(x))),
      ...spaced(xb, xa, 8).map((x) => new THREE.Vector2(x, zMax(x))),
    ]));
    top.rotateX(Math.PI / 2);
    top.translate(0, yb - 0.004, 0);
    add(group, top, pm.liner);
    for (const s of [1, -1]) {
      const { geometry, welt } = pillow({ xa, xb, yb, h: 0.1, hw: (x) => zMax(x) / 2 - 0.006, zc: (x) => (s * zMax(x)) / 2, R: 0.035, p: 2.8, n: 16, steps: 4 });
      add(group, geometry, pm.vinyl);
      add(group, tube(welt, 0.005, 40, 4, true), pm.piping, { cast: false });
    }
  }

  // ----- roof: crowned, rolled edge over a slim drip lip, aft overhang on legs -----
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
  const roofLoop = roundLoop(roofPoly, [0.12, 0.12, 0.22, 0.35, 0.35, 0.22], 6, 0.1);
  // 50 mm visible edge (30 mm skin over a 20 mm drip), crowned 30 mm in the middle.
  const roofY = slab(group, roofLoop, { yUnder: yR, thick: 0.03, drip: 0.02, crown: 0.03, reach: 0.75, round: 0.014, top: m.trim, under: m.trim });
  // Headliner panel under the aft overhang with two LED cockpit lights (lenses unlit).
  {
    const xa = roofAft + 0.15;
    const xb = x0 - 0.035;
    const zh = legTop - 0.09;
    const loop = roundLoop([[xb, zh], [xa, zh], [xa, -zh], [xb, -zh]], 0.05, 4, 0.2);
    const g = new THREE.ShapeGeometry(new THREE.Shape(loop.map(([x, z]) => new THREE.Vector2(x, z))));
    g.rotateX(Math.PI / 2);
    g.translate(0, yR - 0.008, 0);
    add(group, g, pm.headliner);
    add(group, strip(loop.map(([x, z]) => v3(x, yR - 0.008, z)), loop.map(([x, z]) => v3(x, yR, z)), true), pm.headliner);
    for (const z of [-0.32, 0.32]) {
      const x = (xa + xb) / 2;
      const rim = add(group, new THREE.CylinderGeometry(0.042, 0.045, 0.01, 20), m.stainless);
      rim.position.set(x, yR - 0.013, z);
      const lens = add(group, new THREE.CircleGeometry(0.034, 20), pm.ledLens, { cast: false });
      lens.position.set(x, yR - 0.0185, z);
      lens.rotation.x = Math.PI / 2;
    }
  }

  // Aft legs from base plates on the gunwale capping, flanged under the roof (one each side).
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
  const whip = add(group, new THREE.CylinderGeometry(0.004, 0.009, 1.35, 8), pm.whip);
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
