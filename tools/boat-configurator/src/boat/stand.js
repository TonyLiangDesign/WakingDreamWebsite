import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { add, tube, loft, mergeStatic, spaced, v3, lerp, clamp01 } from './kit.js';
import { KEEL_BAR } from './hull.js';
import { POD } from './cockpit.js';
import { bowEyePoint } from './fittings.js';

// Stands: the braked trailer and the studio display cradle, each sized to the hull lines and
// returned as its own merged group. TRAILER_LIFT and CRADLE_LIFT are the heights of the hull's
// waterline (boat y = 0) above the floor on each.
//
// Every point where a stand touches the boat comes from the lines API: keel rollers and keel
// blocks are fitted to the underside of the keel bar (keel(t) less the bar), the bunks and the
// cradle's jack-stand pads bear on the bottom plate between the outer lifting strake and the
// chine (section(t) yk/yc/zc), and the snubber and bow eye are fitted to the stem. Stand-only
// materials (spangled galvanising, painted timber, bunk carpet, tyre moulding, lamps) are built
// once and shared between rebuilds.

export const TRAILER_LIFT = 0.92;
export const CRADLE_LIFT = 0.7;

const PRESS = 0.001;    // a loaded pad or roller beds this far into the keel bar
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(1, 0, 0);

// ---------- contact with the hull ----------

// Depth of the keel bar below the plates at x: KEEL_BAR aft, easing to 26 mm up the forefoot and
// stem (as hull.js draws it).
const barDepth = (lines, x) => lerp(KEEL_BAR, 0.026, clamp01((x - 0.6 * lines.L) / (0.4 * lines.L)));

// Underside of the keel bar at station t. The bar stands square to the keel line, so on the
// rising forefoot its underside sits lower than the depth straight below.
function keelUnder(lines, t) {
  const t0 = Math.max(0, t - 0.003);
  const t1 = Math.min(1, t + 0.003);
  const slope = (lines.keel(t1) - lines.keel(t0)) / ((t1 - t0) * lines.L);
  return lines.keel(t) - barDepth(lines, t * lines.L) * Math.hypot(1, slope) + PRESS;
}

// Centre height of a roller of radius r at x, tangent to the keel bar.
function rollerCentre(lines, x, r, lift) {
  let y = Infinity;
  for (let i = -16; i <= 16; i++) {
    const dx = (i / 16) * r * 0.98;
    y = Math.min(y, lift + keelUnder(lines, clamp01((x + dx) / lines.L)) - Math.sqrt(r * r - dx * dx));
  }
  return y;
}

// Lowest keel-bar underside over a span of x: the top of a flat keel block.
function keelFlat(lines, x0, x1, lift) {
  let y = Infinity;
  for (const x of spaced(x0, x1, 12)) y = Math.min(y, lift + keelUnder(lines, clamp01(x / lines.L)));
  return y;
}

// x of the keel line (the plates, not the bar) where it reaches height y on the forefoot.
const keelX = (lines, y) => lines.stemX(y) - 0.02;

// Bunk band in plan: just outboard of the outer lifting strake (at 0.68 of the chine half-width,
// 45 mm wide on the 620) and clear of the chine, over the whole run of the bunk.
function bunkBand(lines, t0, t1, width) {
  const strake = 0.045 * (lines.B / 2.4);
  let zIn = 0;
  let zMax = Infinity;
  for (const t of spaced(t0, t1, 24)) {
    const s = lines.section(t);
    zIn = Math.max(zIn, 0.68 * s.zc + strake + 0.02);
    zMax = Math.min(zMax, s.zc - 0.015);
  }
  return { zIn, zOut: Math.min(zIn + width, zMax) };
}

// Bottom plate at boat x and half-width z (inside the chine): the straight V of section(x / L)
// from the keel line to the chine root.
function plateY(lines, x, z) {
  const s = lines.section(clamp01(x / lines.L));
  return s.yk + (s.yc - s.yk) * (z / s.zc);
}

// Point on the bottom plate at x, half-width z on side `side`, raised by lift, with the plate's
// outward (downward) normal there, taken from the surface's slope both ways.
function plateFrame(lines, x, z, side, lift) {
  const d = 0.02;
  const dydx = (plateY(lines, x + d, z) - plateY(lines, x - d, z)) / (2 * d);
  const dydz = (plateY(lines, x, z + d) - plateY(lines, x, z - d)) / (2 * d);
  return { P: v3(x, lift + plateY(lines, x, z), side * z), N: v3(dydx, -1, side * dydz).normalize() };
}

// Carpeted bunk bedded on the bottom plate between zIn and zOut, from t0 to t1. Returns frame(t):
// the underside centre and the plate's across (u) and normal (n) directions in the (z, y) plane.
function bunk(g, mat, lines, lift, t0, t1, band, side, thick = 0.055) {
  const c = 0.012;
  const frame = (t) => {
    const s = lines.section(t);
    const yAt = (z) => lift + s.yk + (s.yc - s.yk) * (z / s.zc) + 0.0005;
    const a = [band.zIn, yAt(band.zIn)];
    const b = [band.zOut, yAt(band.zOut)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const n = [-u[1], u[0]];
    const P = (p, du, dn) => v3(s.x, p[1] + u[1] * du + n[1] * dn, side * (p[0] + u[0] * du + n[0] * dn));
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    return { a, b, u, n, P, width: len, under: P(mid, 0, -thick) };
  };
  const count = Math.max(8, Math.ceil(((t1 - t0) * lines.L) / 0.08));
  const rings = spaced(t0, t1, count).map((t) => {
    const { a, b, P } = frame(t);
    const k = thick;
    return [P(a, c, 0), P(b, -c, 0), P(b, 0, -c), P(b, 0, -(k - c)), P(b, -c, -k), P(a, c, -k), P(a, 0, -(k - c)), P(a, 0, -c)];
  });
  const geo = loft(rings);
  const uv = geo.attributes.uv;
  rings.forEach((ring, i) => {
    let run = 0;
    ring.forEach((p, j) => {
      if (j) run += p.distanceTo(ring[j - 1]);
      uv.setXY(i * ring.length + j, run, p.x);
    });
  });
  add(g, geo, mat);
  return frame;
}

// The bow at height y (boat-local): x of the hull's forward face at half-width z. On the centre
// line it is the stem bar's leading edge (stemX); either side, the furthest-forward station whose
// outside half-width at that height still reaches z.
function bowFront(lines, y, z) {
  const bar = lines.stemX(y);
  if (Math.abs(z) < 0.011) return bar;
  let t = 1;
  while (t > 0.5 && lines.halfWidth(lines.section(t), y) < Math.abs(z)) t -= 0.004;
  let lo = t;
  let hi = Math.min(1, t + 0.004);
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (lines.halfWidth(lines.section(mid), y) >= Math.abs(z)) lo = mid; else hi = mid;
  }
  return Math.min(bar, lo * lines.L);
}

// ---------- textures and materials (built once, shared across rebuilds) ----------

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function canvasTexture(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, w, h, amount) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// Hot-dip galvanising: crystal spangle a couple of centimetres across, each facet a slightly
// different grey and sheen, over broad dull patches. UVs are in metres; one tile is 0.3 m.
function spangle() {
  const S = 256;
  const C = 26;
  const cell = S / C;
  const pts = [];
  for (let j = 0; j < C; j++) {
    for (let i = 0; i < C; i++) {
      const a = Math.random() * Math.PI * 2;
      pts.push({ x: (i + Math.random()) * cell, y: (j + Math.random()) * cell, shade: Math.random(), rough: Math.random(), dx: Math.cos(a), dy: Math.sin(a) });
    }
  }
  const [cc, cx] = canvas2d(S, S);
  const [rc, rx] = canvas2d(S, S);
  const col = cx.createImageData(S, S);
  const rgh = rx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i0 = Math.floor(x / cell);
      const j0 = Math.floor(y / cell);
      let best = Infinity;
      let p = null;
      let ox = 0;
      let oy = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = i0 + di;
          const j = j0 + dj;
          const q = pts[((j + C) % C) * C + ((i + C) % C)];
          const qx = q.x + (i < 0 ? -S : i >= C ? S : 0);
          const qy = q.y + (j < 0 ? -S : j >= C ? S : 0);
          const d = (x - qx) ** 2 + (y - qy) ** 2;
          if (d < best) { best = d; p = q; ox = x - qx; oy = y - qy; }
        }
      }
      // Kept low in contrast: at hero distance a facet is about a pixel, and any more variation
      // in shade or sheen reads as noise instead of metal.
      const facet = (ox * p.dx + oy * p.dy) / cell;
      const v = 0.935 + 0.026 * p.shade + 0.007 * facet + (Math.random() - 0.5) * 0.01;
      const k = (y * S + x) * 4;
      col.data[k] = col.data[k + 1] = col.data[k + 2] = Math.max(0, Math.min(255, v * 255));
      col.data[k + 3] = 255;
      const r = 0.52 + 0.06 * p.rough + 0.012 * facet;
      rgh.data[k] = rgh.data[k + 1] = rgh.data[k + 2] = Math.max(0, Math.min(255, r * 255));
      rgh.data[k + 3] = 255;
    }
  }
  cx.putImageData(col, 0, 0);
  rx.putImageData(rgh, 0, 0);
  // Broad dull and bright patches, as galvanising never comes out of the bath even.
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const r = 30 + Math.random() * 70;
    const dull = Math.random() < 0.5;
    for (const [ctx, colour] of [[cx, dull ? '90,92,94' : '255,255,255'], [rx, dull ? '255,255,255' : '40,40,40']]) {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${colour},0.1)`);
      grad.addColorStop(1, `rgba(${colour},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, S, S);
    }
  }
  return { map: canvasTexture(cc, 1 / 0.3), rough: canvasTexture(rc, 1 / 0.3, false) };
}

// Treadplate for the guard steps: raised lozenges in alternating directions. One tile is 40 mm.
function treadBump() {
  const [c, ctx] = canvas2d(64, 64);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#fff';
  for (const [x, y, a] of [[16, 16, 0.785], [48, 48, 0.785], [48, 16, -0.785], [16, 48, -0.785]]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return canvasTexture(c, 1 / 0.04, false);
}

// Bunk carpet: dark marine loop pile tufted in rows along the bunk (canvas y runs along it), with
// loose fibres lying the same way. One tile is 80 mm, so a row is 2.5 mm.
function carpetTexture() {
  const S = 128;
  const [c, ctx] = canvas2d(S, S);
  ctx.fillStyle = '#34383d';
  ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 4) {
    for (let y = Math.random() * 2; y < S - 1; y += 2.4 + Math.random() * 0.6) {
      const v = 62 + Math.random() * 40;
      ctx.fillStyle = `rgba(${v},${v + 3},${v + 7},0.7)`;
      ctx.beginPath();
      ctx.ellipse(x + 2 + (Math.random() - 0.5) * 0.8, y + 1, 1.5, 1.25, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 0; i < 420; i++) {
    const v = Math.random() < 0.5 ? 18 + Math.random() * 20 : 95 + Math.random() * 30;
    ctx.strokeStyle = `rgba(${v},${v + 3},${v + 6},0.22)`;
    ctx.lineWidth = 0.6;
    const x = Math.random() * S;
    const y = Math.random() * S;
    const a = Math.PI / 2 + (Math.random() - 0.5) * 0.7;
    const l = 2 + Math.random() * 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  noise(ctx, S, S, 12);
  return canvasTexture(c, 1 / 0.08);
}

// Tyre moulding, as a bump map (mid grey is the plain surface, lighter is raised). The tyre's
// UVs put the sidewall in rows 0-127, bead (row 0) to shoulder (row 127), about a millimetre a
// row, and the tread across its width in rows 128-255; u runs once round the tyre. The sidewall
// carries moulded rings at the rim line, a band of generic service markings (no brand or size)
// twice round, and ribs at the shoulder; the tread has lateral grooves in the shoulder ribs and
// sipes in the centre ribs.
const TYRE_ROWS = 256;
function tyreBump() {
  const W = 2048;
  const H = TYRE_ROWS;
  const [c, ctx] = canvas2d(W, H);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, W, H);
  // Rim-line rings by the bead.
  ctx.fillStyle = '#a0a0a0';
  ctx.fillRect(0, 12, W, 2);
  ctx.fillRect(0, 18, W, 1);
  ctx.fillStyle = '#686868';
  ctx.fillRect(0, 24, W, 1);
  // Markings band (rows 46-84). Canvas x is about 0.75 mm round the tyre and a row about 1 mm
  // out from the rim, so the text is stretched along x to keep its proportions.
  ctx.fillStyle = '#b4b4b4';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const k of [0, 1]) {
    ctx.save();
    ctx.translate(k * (W / 2) + 40, 0);
    ctx.scale(1.35, 1);
    ctx.font = 'bold 17px Arial, Helvetica, sans-serif';
    ctx.fillText('RADIAL  TUBELESS', 0, 64);
    ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
    ctx.fillText('LIGHT TRUCK   C', 250, 64);
    ctx.font = '8px Arial, Helvetica, sans-serif';
    ctx.fillText('MAX LOAD 850 KG   MAX PRESS 450 KPA', 6, 50);
    ctx.fillText('TREAD 2 POLYESTER + 2 STEEL   SIDEWALL 2 POLYESTER', 6, 79);
    ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
    ctx.fillText('M+S', 470, 64);
    ctx.restore();
  }
  // Shoulder ribs: short radial dashes.
  ctx.fillStyle = '#9a9a9a';
  for (let x = 0; x < W; x += 16) ctx.fillRect(x, 110, 6, 17);
  // Tread: rows 128-255 across the tread width; circumferential grooves are in the geometry at
  // the quarter points (rows 128 + 127 * {0.21, 0.5, 0.79}).
  const row = (u) => 128 + 127 * u;
  ctx.fillStyle = '#3a3a3a';
  for (let x = 0; x < W; x += 30) {
    for (const [u0, u1] of [[0, 0.17], [0.83, 1]]) ctx.fillRect(x, row(u0), 7, row(u1) - row(u0));
  }
  ctx.fillStyle = '#5a5a5a';
  for (const [u0, u1, off] of [[0.25, 0.46, 0], [0.54, 0.75, 9]]) {
    for (let x = off; x < W + 20; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, row(u0));
      ctx.lineTo(x + 6, row((u0 + u1) / 2));
      ctx.lineTo(x, row(u1));
      ctx.lineTo(x + 2, row(u1));
      ctx.lineTo(x + 8, row((u0 + u1) / 2));
      ctx.lineTo(x + 2, row(u0));
      ctx.fill();
    }
  }
  // Roughness from the same moulding: raised lettering and ribs are smoother (they come out of
  // polished parts of the mould and catch the light), grooves a little rougher.
  const [rc, rx] = canvas2d(W, H);
  const src = ctx.getImageData(0, 0, W, H);
  const out = rx.createImageData(W, H);
  for (let i = 0; i < src.data.length; i += 4) {
    const b = src.data[i];
    const r = b > 136 ? 0.68 : b < 120 ? 0.96 : 0.9;
    out.data[i] = out.data[i + 1] = out.data[i + 2] = r * 255;
    out.data[i + 3] = 255;
  }
  rx.putImageData(out, 0, 0);
  const tex = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    return t;
  };
  return { bump: tex(c), rough: tex(rc) };
}

// LED lens: a grid of diodes behind the coloured lens.
function ledTexture(base, dot) {
  const [c, ctx] = canvas2d(64, 32);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 64, 32);
  for (let y = 6; y < 32; y += 10) {
    for (let x = 5; x < 64; x += 9) {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, 4);
      grad.addColorStop(0, dot);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - 4, y - 4, 8, 8);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Generic trailer plate: black on white, no real registration.
function plateTexture() {
  const [c, ctx] = canvas2d(256, 88);
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(0, 0, 256, 88);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;
  ctx.strokeRect(5, 5, 246, 78);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 56px "Helvetica Neue", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HRB26', 128, 47);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let MATS = null;
function standMats() {
  if (MATS) return MATS;
  // Shared: disposeTree() must not free these when a boat is swapped out.
  const shared = (mat) => { mat.userData.shared = true; return mat; };
  const sp = spangle();
  const carpet = carpetTexture();
  const tyre = tyreBump();
  const galv = { color: '#a9aeb1', metalness: 0.85, roughness: 1, map: sp.map, roughnessMap: sp.rough };
  MATS = {
    galv: shared(new THREE.MeshStandardMaterial(galv)),
    rim: shared(new THREE.MeshStandardMaterial({ ...galv, side: THREE.DoubleSide })),
    // Zinc-plated wheel nuts, jack screws and hub caps: brighter and smoother than the dip.
    zinc: shared(new THREE.MeshStandardMaterial({ color: '#c4c8cb', metalness: 0.9, roughness: 0.32 })),
    tread: shared(new THREE.MeshStandardMaterial({ color: '#b0b5b7', metalness: 0.85, roughness: 0.5, map: sp.map, bumpMap: treadBump(), bumpScale: 2.5 })),
    tyre: shared(new THREE.MeshStandardMaterial({ color: '#141516', roughness: 1, roughnessMap: tyre.rough, bumpMap: tyre.bump, bumpScale: 2.2 })),
    // Display cradle: keel blocks in satin slate-grey paint.
    paint: shared(new THREE.MeshStandardMaterial({ color: '#56616b', roughness: 0.5 })),
    carpet: shared(new THREE.MeshStandardMaterial({ map: carpet, bumpMap: carpet, bumpScale: 1.2, roughness: 1 })),
    plastic: shared(new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.42 })),
    redLens: shared(new THREE.MeshStandardMaterial({ color: '#6a0f0c', roughness: 0.15, emissive: '#ffffff', emissiveMap: ledTexture('#3a0705', '#ff3a2a'), emissiveIntensity: 0.9 })),
    amberLens: shared(new THREE.MeshStandardMaterial({ color: '#7a4a08', roughness: 0.15, emissive: '#ffffff', emissiveMap: ledTexture('#3b2304', '#ffae2a'), emissiveIntensity: 0.6 })),
    whiteLens: shared(new THREE.MeshStandardMaterial({ color: '#e8eaec', roughness: 0.1, emissive: '#fff6e0', emissiveIntensity: 0.25 })),
    plate: shared(new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.35, metalness: 0.1 })),
    strap: shared(new THREE.MeshStandardMaterial({ color: '#3d5068', roughness: 0.85 })),
    reservoir: shared(new THREE.MeshStandardMaterial({ color: '#d8d3c4', roughness: 0.35 })),
  };
  return MATS;
}

// ---------- geometry helpers ----------

function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return geo;
}

// Box with UVs in metres on every face, so tiling textures keep their scale.
function boxGeo(sx, sy, sz) {
  const geo = new THREE.BoxGeometry(sx, sy, sz);
  const uv = geo.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, uv.getX(f * 4 + k) * dims[f][0], uv.getY(f * 4 + k) * dims[f][1]);
  return geo;
}

// Box with plain 0-1 UVs on each face, for decals such as lenses and the plate.
function panel(g, mat, size, pos, opts) {
  const mesh = add(g, new THREE.BoxGeometry(...size), mat, opts);
  mesh.position.set(...pos);
  return mesh;
}

function block(g, mat, size, pos, opts) {
  const mesh = add(g, boxGeo(...size), mat, opts);
  mesh.position.set(...pos);
  return mesh;
}

// Turns a mesh whose geometry runs along +x from the origin so that it spans a to b, local y kept
// as near to up as it can be.
function span(mesh, a, b) {
  const dir = new THREE.Vector3().subVectors(b, a).normalize();
  const ref = Math.abs(dir.dot(UP)) > 0.99 ? FWD : UP;
  const z = new THREE.Vector3().crossVectors(dir, ref).normalize();
  const y = new THREE.Vector3().crossVectors(z, dir);
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dir, y, z));
  mesh.position.copy(a);
  return mesh;
}

// Rectangular hollow section from a to b: h along local y, w along local z.
function rhs(g, a, b, w, h, mat) {
  const len = a.distanceTo(b);
  const geo = boxGeo(len, h, w);
  geo.translate(len / 2, 0, 0);
  return span(add(g, geo, mat), a, b);
}

function bar(g, a, b, r, mat, seg = 12) {
  const len = a.distanceTo(b);
  const geo = scaleUV(new THREE.CylinderGeometry(r, r, len, seg, 1), 2 * Math.PI * r, len);
  geo.rotateZ(-Math.PI / 2);
  geo.translate(len / 2, 0, 0);
  return span(add(g, geo, mat), a, b);
}

// Cylinder with its axis along z.
function disc(g, r, w, pos, mat, seg = 20, r2 = r) {
  const geo = scaleUV(new THREE.CylinderGeometry(r2, r, w, seg), 2 * Math.PI * r, w);
  geo.rotateX(Math.PI / 2);
  const mesh = add(g, geo, mat);
  mesh.position.copy(pos);
  return mesh;
}

// C-channel from a to b, web on one side, flanges open towards local +z.
function channel(g, a, b, h, w, t, mat) {
  const len = a.distanceTo(b);
  const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, -h / 2 + t], [-w / 2 + t, -h / 2 + t], [-w / 2 + t, h / 2 - t], [w / 2, h / 2 - t], [w / 2, h / 2], [-w / 2, h / 2]];
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(-z, y))), { depth: len, bevelEnabled: false });
  geo.rotateY(Math.PI / 2);
  return span(add(g, geo, mat), a, b);
}

// Planed and painted timber with eased arrises, centred at pos.
function paintedTimber(g, M, [sx, sy, sz], pos) {
  const mesh = add(g, new RoundedBoxGeometry(sx, sy, sz, 2, 0.007), M.paint);
  mesh.position.set(...pos);
  return mesh;
}

// Sheet swept straight along z from z0 to z1 through a profile of [x, y] points, with smooth
// normals on the side given by outward (+1: to the left of the direction of travel).
function sweepZ(pts, z0, z1, outward) {
  const pos = [];
  const nrm = [];
  const uv = [];
  const idx = [];
  let run = 0;
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tx = (b[0] - a[0]) / l;
    const ty = (b[1] - a[1]) / l;
    if (i) run += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
    for (const z of [z0, z1]) {
      pos.push(p[0], p[1], z);
      nrm.push(ty * outward, -tx * outward, 0);
      uv.push(run, z);
    }
  });
  for (let i = 0; i < pts.length - 1; i++) {
    const a = 2 * i;
    if (outward * (z1 - z0) > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

// Radial profile [r, a] (a along the axis) spun into a solid of revolution about z. vs, if
// given, sets each profile point's texture v (u still runs once round); flipU reverses u.
function lathe(profile, seg, vs = null, flipU = false) {
  const geo = new THREE.LatheGeometry(profile.map(([r, a]) => new THREE.Vector2(r, a)), seg);
  if (vs) {
    const uv = geo.attributes.uv;
    const n = profile.length;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, flipU ? 1 - uv.getX(i) : uv.getX(i), vs[i % n]);
  }
  geo.rotateX(Math.PI / 2);
  return geo;
}

// Hex prism lathe with flat faces (nuts).
function hexLathe(profile) {
  const geo = lathe(profile, 6).toNonIndexed();
  geo.computeVertexNormals();
  return geo;
}

// ---------- trailer parts ----------

// Radial light-truck tyre on a galvanised steel rim, outer face towards +z (side = 1) or -z. R is
// the tyre radius, rb the rim's bead radius, w the section width. The tyre is three lathes (both
// sidewalls and the tread) so each carries its own strip of the moulding texture: rim-line rings,
// markings band and shoulder ribs on the sidewalls, three circumferential grooves in the geometry
// with lateral grooves and sipes in the texture across the tread.
function wheel(g, M, m, pos, side, R, rb, w) {
  const wg = new THREE.Group();
  const hw = w / 2;
  const seg = 36;
  const crown = (a) => R - 0.004 * (a / hw) ** 2;
  const vRow = (row) => 1 - (row + 0.5) / TYRE_ROWS;
  // Sidewall, bead to shoulder: [r, axial fraction of hw].
  const wall = [
    [rb, 0.8], [rb + 0.009, 0.87], [rb + 0.016, 0.9], [rb + 0.03, 0.935], [lerp(rb, R, 0.42), 1],
    [lerp(rb, R, 0.68), 0.985], [lerp(rb, R, 0.85), 0.945], [R - 0.017, 0.87], [R - 0.006, 0.79], [crown(0.72 * hw), 0.72],
  ];
  const wallV = (r) => vRow(127 * clamp01((r - rb) / (R - 0.017 - rb)));
  const inner = wall.map(([r, f]) => [r, -f * hw]);
  const outer = wall.map(([r, f]) => [r, f * hw]).reverse();
  add(wg, lathe(inner, seg, inner.map(([r]) => wallV(r)), true), M.tyre);
  add(wg, lathe(outer, seg, outer.map(([r]) => wallV(r))), M.tyre);
  const groove = (a) => [[crown(a - 0.007), a - 0.007], [crown(a) - 0.009, a - 0.004], [crown(a) - 0.009, a + 0.004], [crown(a + 0.007), a + 0.007]];
  const tread = [[crown(0.72 * hw), -0.72 * hw], ...groove(-0.42 * hw), ...groove(0), ...groove(0.42 * hw), [crown(0.72 * hw), 0.72 * hw]];
  add(wg, lathe(tread, seg, tread.map(([, a]) => vRow(128 + 127 * (a / (0.72 * hw) + 1) / 2))), M.tyre);
  // Rim: flange, dish and the mounting face, seen from outside.
  const k = rb / 0.178;
  const face = hw * 0.62;
  const rim = [
    [rb + 0.014, hw * 0.74], [rb + 0.011, hw * 0.83], [rb + 0.002, hw * 0.84], [rb - 0.008, hw * 0.74],
    [rb - 0.022, hw * 0.5], [0.118 * k, hw * 0.46], [0.088 * k, face - 0.004], [0.072 * k, face], [0.001, face],
  ];
  add(wg, scaleUV(lathe(rim, seg), 1.1, 0.2), M.rim);
  // Inside of the rim barrel, closing the wheel when seen from behind.
  const back = add(wg, new THREE.CircleGeometry(rb, 24), m.rubber);
  back.position.z = -hw * 0.6;
  back.rotation.y = Math.PI;
  // Vent holes in the dish; five flanged wheel nuts on a 114.3 mm circle, each with its stud
  // end showing; the bearing protector with its grease nipple.
  const dishA = lerp(hw * 0.5, hw * 0.46, (rb - 0.022 - 0.137 * k) / (rb - 0.022 - 0.118 * k));
  const nut = hexLathe([[0, 0], [0.0135, 0], [0.0135, 0.003], [0.011, 0.005], [0.011, 0.017], [0.0085, 0.0195], [0, 0.0195]]);
  for (let i = 0; i < 5; i++) {
    const a = ((i + 0.5) / 5) * Math.PI * 2;
    const hole = add(wg, new THREE.CircleGeometry(0.019 * k, 14), m.rubber, { cast: false });
    hole.scale.set(1.35, 0.75, 1);
    hole.rotation.z = a + Math.PI / 2;
    hole.position.set(Math.cos(a) * 0.137 * k, Math.sin(a) * 0.137 * k, dishA + 0.003);
    const b = (i / 5) * Math.PI * 2;
    const p = v3(Math.cos(b) * 0.05715, Math.sin(b) * 0.05715, face);
    const n = add(wg, nut.clone(), M.zinc);
    n.position.copy(p);
    n.rotation.z = b;
    disc(wg, 0.006, 0.006, p.clone().setZ(face + 0.0215), M.zinc, 8);
  }
  nut.dispose();
  const cap = add(wg, lathe([[0, 0], [0.033, 0], [0.033, 0.014], [0.03, 0.03], [0.024, 0.036], [0.007, 0.036], [0.007, 0.042], [0.004, 0.046], [0, 0.046]], 14), M.zinc);
  cap.position.z = face;
  wg.position.copy(pos);
  if (side < 0) wg.rotation.y = Math.PI;
  g.add(wg);
}

// Tandem mudguard over both wheels on one side: 4 mm galvanised sheet, smooth over the arcs,
// with a rolled bead along the outer edge, a lighter one along the inner edge and both ends, and
// a treadplate step along the top. Returns the height of the top.
function mudguard(g, M, xr, xf, R, z, width) {
  const Rg = R + 0.065;
  const t = 0.004;
  const profile = (r) => [
    ...spaced(0.32, Math.PI / 2, 18).map((a) => [xf + Math.cos(a) * r, R + Math.sin(a) * r]),
    ...spaced(Math.PI / 2, Math.PI - 0.32, 18).map((a) => [xr + Math.cos(a) * r, R + Math.sin(a) * r]),
  ];
  const s = Math.sign(z);
  const z0 = z - width / 2;
  const z1 = z + width / 2;
  add(g, sweepZ(profile(Rg + t), z0, z1, 1), M.galv);
  add(g, sweepZ(profile(Rg), z0, z1, -1), M.galv);
  const mid = profile(Rg + t / 2);
  const edge = s * (Math.abs(z) + width / 2 - 0.004);
  const inEdge = s * (Math.abs(z) - width / 2 + 0.002);
  add(g, tube(mid.map(([x, y]) => v3(x, y, edge)), 0.008, 48, 6), M.galv);
  add(g, tube(mid.map(([x, y]) => v3(x, y, inEdge)), 0.005, 48, 4), M.galv);
  for (const [x, y] of [mid[0], mid[mid.length - 1]]) add(g, tube([v3(x, y, z0 + 0.002), v3(x, y, z1 - 0.002)], 0.0045, 2, 6), M.galv);
  const top = R + Rg + t;
  block(g, M.tread, [xf - xr + 0.06, 0.004, width - 0.05], [(xf + xr) / 2, top + 0.002, z]);
  return { top, Rg };
}

// Leaf-spring pack on top of an axle at height y, under the rail at z. Returns the eye height.
function leafSpring(g, M, x, y, z) {
  const leaf = 0.008;
  block(g, M.galv, [0.3, leaf, 0.045], [x, y + leaf / 2, z]);
  block(g, M.galv, [0.46, leaf, 0.045], [x, y + leaf * 1.5, z]);
  const rise = 0.032;
  for (const s of [1, -1]) {
    const a = v3(x, y + leaf * 2.5, z);
    const b = v3(x + s * 0.32, y + leaf * 2.5 + rise, z);
    rhs(g, a, b, 0.045, leaf, M.galv);
    disc(g, 0.014, 0.05, b.clone().add(v3(0, 0.006, 0)), M.galv, 12);
  }
  // U-bolts and the clamp plate.
  block(g, M.galv, [0.07, 0.01, 0.07], [x, y + leaf * 3 + 0.005, z]);
  for (const dz of [-0.03, 0.03]) for (const dx of [-0.03, 0.03]) bar(g, v3(x + dx, y - 0.05, z + dz), v3(x + dx, y + leaf * 3 + 0.02, z + dz), 0.005, M.galv, 6);
  return y + leaf * 2.5 + rise + 0.006;
}

// Keel roller: rubber spool between two galvanised side plates. baseY is where its stand meets
// the frame; a tall stand gets a post.
function keelRoller(g, M, m, x, yc, baseY, r0 = 0.04) {
  const len = 0.2;
  const hl = len / 2;
  const r1 = r0 + 0.013;
  const spool = [[0.012, -hl], [r1 - 0.006, -hl], [r1, -hl + 0.006], [r1, -hl + 0.024], [r0 + 0.002, -0.03], [r0, -0.024], [r0, 0.024], [r0 + 0.002, 0.03], [r1, hl - 0.024], [r1, hl - 0.006], [r1 - 0.006, hl], [0.012, hl]];
  const roller = add(g, lathe(spool, 22), m.rubber);
  roller.position.set(x, yc, 0);
  bar(g, v3(x, yc, -hl - 0.022), v3(x, yc, hl + 0.022), 0.008, M.galv, 8);
  const plateTop = yc + 0.018;
  let plateBase = baseY + 0.008;
  block(g, M.galv, [0.14, 0.008, len + 0.06], [x, baseY + 0.004, 0]);
  if (plateTop - plateBase > 0.16) {
    const postTop = yc - 0.075;
    block(g, M.galv, [0.06, postTop - plateBase, 0.06], [x, (postTop + plateBase) / 2, 0]);
    block(g, M.galv, [0.1, 0.008, len + 0.04], [x, postTop + 0.004, 0]);
    plateBase = postTop + 0.008;
  }
  for (const s of [1, -1]) block(g, M.galv, [0.11, plateTop - plateBase, 0.006], [x, (plateTop + plateBase) / 2, s * (hl + 0.009)]);
}

// Chain of oval links along a curve through pts, alternate links turned a quarter.
function chain(g, M, pts) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = Math.floor(curve.getLength() / 0.024);
  const link = new THREE.TorusGeometry(0.0115, 0.0034, 4, 8);
  link.scale(1.45, 1, 1);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const tan = curve.getTangentAt(u);
    const side = new THREE.Vector3().crossVectors(tan, UP);
    if (side.lengthSq() < 1e-4) side.set(0, 0, 1);
    side.normalize();
    const nrm = new THREE.Vector3().crossVectors(side, tan);
    const plane = i % 2 ? nrm : side;
    const zAxis = new THREE.Vector3().crossVectors(tan, plane).normalize();
    const mesh = add(g, link.clone(), M.galv);
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(tan, plane, zAxis));
    mesh.position.copy(curve.getPointAt(u));
  }
  link.dispose();
  return curve.getPointAt(1);
}

// Bunk saddle at x: a channel the bunk sits in, set to the plate's deadrise, on a pivot tube.
// Returns the pivot centre, where the stand meets it.
function saddle(g, M, f, side, x, mat = M.galv) {
  const ang = side * Math.atan2(-f.u[1], f.u[0]);
  const nrm = v3(0, f.n[1], side * f.n[0]);
  const across = v3(0, f.u[1], side * f.u[0]);
  const under = f.under.clone().setX(x);
  const plate = block(g, mat, [0.2, 0.008, f.width + 0.016], [0, 0, 0]);
  plate.position.copy(under).addScaledVector(nrm, -0.004);
  plate.rotation.x = ang;
  for (const e of [-1, 1]) {
    const cheek = block(g, mat, [0.2, 0.034, 0.006], [0, 0, 0]);
    cheek.position.copy(under).addScaledVector(across, e * (f.width / 2 + 0.005)).addScaledVector(nrm, 0.009);
    cheek.rotation.x = ang;
  }
  const pivot = under.clone().addScaledVector(nrm, -0.03);
  bar(g, pivot.clone().setX(x - 0.07), pivot.clone().setX(x + 0.07), 0.02, mat, 12);
  rhs(g, pivot, under.clone().addScaledVector(nrm, -0.008), 0.03, 0.03, mat);
  return pivot;
}

// ---------- trailer ----------

export function trailer(lines, m) {
  const M = standMats();
  const { L, B } = lines;
  const g = new THREE.Group();
  const lift = TRAILER_LIFT;

  // Frame: 125 x 50 C-section main rails, 100 x 50 C-section cross-members, 100 x 100 drawbar.
  const railTop = 0.55;
  const railH = 0.125;
  const railW = 0.05;
  const railT = 0.006;
  const railY = railTop - railH / 2;
  const railZ = 0.22 * B;
  const xRear = -0.12;
  const xTaper = L - 1.0;
  const xApex = L + 0.45;
  const xCoup = L + 1.45;
  const dbW = 0.1;
  const dbTop = railTop + 0.003;
  const dbY = dbTop - 0.05;
  const crossTop = railY + 0.05;
  const inside = railZ + railW / 2 - railT - 0.001;
  // Half-width of the angled rail's centreline at x, and a point just inside its web.
  const angledZ = (x) => lerp(railZ, dbW / 2 + railW / 2, (x - xTaper) / (xApex - xTaper));
  const webIn = railW / 2 - railT - 0.007;

  // Running gear: tandem axles under the boat's centre of gravity; 14" wheels (13" on the 550).
  const small = L < 6;
  const R = small ? 0.305 : 0.326;
  const rb = small ? 0.165 : 0.178;
  const tw = small ? 0.175 : 0.185;
  const wheelZ = B / 2 - 0.34;
  const axC = 0.4 * L;
  const axles = [axC - 0.41, axC + 0.41];

  for (const s of [1, -1]) {
    // Runs aft-to-fore on port and fore-to-aft on starboard, so both channels open inboard.
    const run = (a, b) => (s < 0 ? channel(g, a, b, railH, railW, railT, M.galv) : channel(g, b, a, railH, railW, railT, M.galv));
    run(v3(xRear, railY, s * railZ), v3(xTaper + 0.006, railY, s * railZ));
    run(v3(xTaper - 0.006, railY, s * railZ), v3(xApex, railY, s * (dbW / 2 + railW / 2)));
    block(g, M.galv, [0.2, 0.004, 0.09], [xTaper, railTop + 0.002, s * railZ]);
    block(g, M.galv, [0.26, 0.004, 0.13], [xApex - 0.1, dbTop + 0.002, s * 0.065]);
  }
  rhs(g, v3(xTaper + 0.025, dbY, 0), v3(xCoup - 0.16, dbY, 0), dbW, 0.1, M.galv);

  // Keel rollers along the keel line: four on the level keel, one where the forefoot starts to
  // lift and one at the knee of the frame, each on a cross-member between the rail webs.
  const rollerX = [0.03, 0.2, 0.38, 0.56].map((t) => t * L);
  rollerX.push(keelX(lines, lines.keel(0) + 0.05), xTaper);
  for (const x of [xRear + 0.04, ...rollerX]) {
    channel(g, v3(x, railY, -inside), v3(x, railY, inside), 0.1, 0.05, 0.005, M.galv);
  }

  for (const x of rollerX) keelRoller(g, M, m, x, rollerCentre(lines, x, 0.04, lift), crossTop);

  // Carpeted bunks under the bottom plates, just inboard of the chines, on bolt-on brackets.
  const frontWheel = axles[1] + R;
  const t0 = 0.035;
  const t1 = Math.min(0.62, (frontWheel + 0.3) / L);
  const band = bunkBand(lines, t0, t1, 0.15);
  for (const s of [1, -1]) {
    const frame = bunk(g, M.carpet, lines, lift, t0, t1, band, s);
    for (const x of [0.09 * L, axC, frontWheel + 0.14]) {
      const pivot = saddle(g, M, frame(x / L), s, x);
      block(g, M.galv, [0.12, 0.1, 0.008], [x, railY + 0.01, s * (railZ + railW / 2 + 0.004)]);
      rhs(g, v3(x, railTop - 0.03, s * (railZ + railW / 2 + 0.025)), pivot, 0.05, 0.05, M.galv);
    }
  }

  // Axles, hubs, springs and wheels; guards with steps on stays from the rails.
  let eyeY = 0;
  for (const x of axles) {
    rhs(g, v3(x, R, -(wheelZ - 0.03)), v3(x, R, wheelZ - 0.03), 0.05, 0.05, M.galv);
    for (const s of [1, -1]) {
      disc(g, 0.06, 0.05, v3(x, R, s * (wheelZ - 0.07)), M.galv, 16);
      wheel(g, M, m, v3(x, R - 0.004, s * wheelZ), s, R, rb, tw);
      eyeY = leafSpring(g, M, x, R + 0.025, s * railZ);
    }
  }
  const railBottom = railTop - railH;
  for (const s of [1, -1]) {
    // Spring hangers fore and aft, and the equaliser rocker between the axles.
    for (const [x, len] of [[axles[0] - 0.32, 0.05], [axC, 0.05], [axles[1] + 0.32, 0.05]]) {
      block(g, M.galv, [len, railBottom - eyeY + 0.02, 0.06], [x, (railBottom + eyeY - 0.02) / 2, s * railZ]);
      disc(g, 0.012, 0.07, v3(x, eyeY, s * railZ), M.galv, 8);
    }
    block(g, M.galv, [0.2, 0.03, 0.012], [axC, eyeY, s * (railZ + 0.031)]);
    block(g, M.galv, [0.2, 0.03, 0.012], [axC, eyeY, s * (railZ - 0.031)]);
    const width = 0.27;
    const { top, Rg } = mudguard(g, M, axles[0], axles[1], R, s * wheelZ, width);
    const inner = wheelZ - width / 2 + 0.01;
    for (const x of [axles[0] - 0.12, axC, axles[1] + 0.12]) {
      const y = x === axC ? top - 0.007 : R + Math.sqrt(Rg * Rg - 0.12 * 0.12) - 0.004;
      rhs(g, v3(x, railTop - 0.04, s * (railZ + railW / 2)), v3(x, y, s * inner), 0.04, 0.008, M.galv);
    }
  }

  // Light boards: an LED combination lamp each side on its own galvanised board, carried aft of
  // the boarding pods on a 50 x 50 arm clamped under each main rail. Split boards stay clear of
  // the engine legs (single or twin) and nothing of the boat hangs over them, so both lamps read
  // from astern. The number plate hangs under the port board with its lamp hood.
  const xBoard = -POD - 0.012 - 0.09;
  const boardArmY = railBottom - 0.025;
  const lightY = railY;
  const lampZ = wheelZ + 0.03;
  const boardIn = railZ - 0.035;
  const boardOut = lampZ + 0.02;
  const boardBot = boardArmY - 0.025;
  const boardTop = lightY + 0.065;
  for (const s of [1, -1]) {
    rhs(g, v3(xRear + 0.3, boardArmY, s * railZ), v3(xBoard + 0.006, boardArmY, s * railZ), 0.05, 0.05, M.galv);
    for (const x of [xRear + 0.24, xRear + 0.06]) {
      block(g, M.galv, [0.05, 0.008, 0.09], [x, boardArmY - 0.029, s * railZ]);
      for (const dz of [-0.036, 0.036]) bar(g, v3(x, boardArmY - 0.036, s * railZ + dz), v3(x, railBottom + 0.006, s * railZ + dz), 0.005, M.galv, 6);
    }
    block(g, M.galv, [0.006, boardTop - boardBot, boardOut - boardIn], [xBoard + 0.003, (boardTop + boardBot) / 2, (s * (boardIn + boardOut)) / 2]);
    // Gusset between arm and board.
    rhs(g, v3(xBoard + 0.006, boardArmY + 0.022, s * railZ), v3(xBoard + 0.1, boardArmY + 0.022, s * railZ), 0.006, 0.006, M.galv);
    const z = s * (lampZ - 0.12);
    block(g, M.plastic, [0.045, 0.1, 0.27], [xBoard - 0.0225, lightY, z]);
    panel(g, M.redLens, [0.006, 0.07, 0.15], [xBoard - 0.047, lightY, z - s * 0.045], { cast: false });
    panel(g, M.amberLens, [0.006, 0.07, 0.07], [xBoard - 0.047, lightY, z + s * 0.08], { cast: false });
  }
  const plateZ = -(boardOut - 0.195);
  const plateY = boardBot - 0.055;
  block(g, M.plastic, [0.012, 0.15, 0.39], [xBoard - 0.006, plateY + 0.01, plateZ]);
  panel(g, M.plate, [0.003, 0.125, 0.37], [xBoard - 0.0135, plateY, plateZ], { cast: false });
  block(g, M.plastic, [0.04, 0.022, 0.08], [xBoard - 0.032, plateY + 0.074, plateZ]);
  panel(g, M.whiteLens, [0.02, 0.004, 0.06], [xBoard - 0.035, plateY + 0.061, plateZ], { cast: false });

  // Wiring: from each lamp forward along its arm and up into the rail; the starboard lead crosses
  // just forward of the rear cross-member to join the port loom, which runs forward inside the
  // port rail to the plug in its holder on the drawbar.
  const wireY = railY - 0.035;
  const plug = v3(xCoup - 0.62, dbY - 0.02, -(dbW / 2 + 0.028));
  const lead = (s) => [
    v3(xBoard + 0.008, lightY - 0.03, s * (railZ + 0.07)), v3(xBoard + 0.1, boardArmY, s * (railZ + 0.052)),
    v3(xRear + 0.1, boardArmY, s * (railZ + 0.052)), v3(xRear + 0.16, wireY, s * (railZ + webIn)),
  ];
  add(g, tube([...lead(1), v3(xRear + 0.12, wireY, railZ - 0.06), v3(xRear + 0.1, wireY, 0), v3(xRear + 0.12, wireY, -(railZ - 0.06)), v3(xRear + 0.2, wireY, -(railZ + webIn))], 0.005, 60, 5), m.rubber, { cast: false });
  const loom = [
    ...lead(-1), v3(xTaper - 0.2, wireY, -(railZ + webIn)),
    v3(xTaper + 0.4, wireY, -(angledZ(xTaper + 0.4) + webIn)), v3(xApex - 0.2, wireY, -(angledZ(xApex - 0.2) + webIn)),
    v3(xApex + 0.08, dbY - 0.02, -(dbW / 2 + 0.006)), v3(plug.x - 0.16, dbY - 0.02, -(dbW / 2 + 0.006)),
    v3(plug.x - 0.1, dbY - 0.15, -(dbW / 2 + 0.02)), v3(plug.x - 0.035, plug.y, plug.z),
  ];
  add(g, tube(loom, 0.005, 80, 5), m.rubber, { cast: false });
  bar(g, plug.clone().add(v3(-0.035, 0, 0)), plug.clone().add(v3(0.035, 0, 0)), 0.021, M.plastic, 14);
  block(g, M.galv, [0.05, 0.05, 0.006], [plug.x, plug.y, -(dbW / 2 + 0.003)]);

  // Hydraulic override coupling: housing over the drawbar, ball coupling, master cylinder and
  // reservoir, park brake lever; brake line back along the drawbar to both axles.
  const hx0 = xCoup - 0.5;
  const hx1 = xCoup - 0.1;
  block(g, M.galv, [hx1 - hx0, 0.006, 0.124], [(hx0 + hx1) / 2, dbTop + 0.033, 0]);
  for (const s of [1, -1]) block(g, M.galv, [hx1 - hx0, 0.11, 0.006], [(hx0 + hx1) / 2, dbTop - 0.019, s * 0.059]);
  bar(g, v3(hx1 - 0.08, dbTop - 0.02, 0), v3(xCoup - 0.04, dbTop - 0.02, 0), 0.028, M.galv, 16);
  const head = new THREE.Shape([[-0.06, 0.03], [0.02, 0.04], [0.06, 0.02], [0.075, -0.015], [0.06, -0.045], [-0.06, -0.05]].map(([x, y]) => new THREE.Vector2(x, y)));
  const headGeo = new THREE.ExtrudeGeometry(head, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 6 });
  headGeo.translate(xCoup, dbTop - 0.03, -0.035);
  add(g, headGeo, M.galv);
  rhs(g, v3(xCoup - 0.02, dbTop + 0.02, 0), v3(xCoup - 0.17, dbTop + 0.075, 0), 0.03, 0.014, M.galv);
  disc(g, 0.012, 0.04, v3(xCoup - 0.17, dbTop + 0.075, 0), m.rubber, 10);
  const mc = v3(hx0 + 0.02, dbTop + 0.058, 0);
  bar(g, mc, mc.clone().add(v3(0.13, 0, 0)), 0.022, M.plastic, 14);
  bar(g, v3(hx0 + 0.09, dbTop + 0.075, 0), v3(hx0 + 0.09, dbTop + 0.12, 0), 0.02, M.reservoir, 14);
  bar(g, v3(hx0 + 0.09, dbTop + 0.12, 0), v3(hx0 + 0.09, dbTop + 0.133, 0), 0.016, M.plastic, 14);
  const lever = v3(xCoup - 0.26, dbTop, 0.068);
  disc(g, 0.02, 0.012, lever, M.galv, 12);
  bar(g, lever, v3(xCoup - 0.5, dbTop + 0.17, 0.074), 0.009, M.galv, 8);
  bar(g, v3(xCoup - 0.5, dbTop + 0.17, 0.074), v3(xCoup - 0.6, dbTop + 0.24, 0.076), 0.014, m.rubber, 10);
  const brakeZ = dbW / 2 + 0.006;
  const brake = [
    mc.clone().add(v3(-0.01, 0, 0)), v3(hx0 - 0.02, dbTop + 0.02, brakeZ), v3(hx0 - 0.07, dbTop - 0.015, brakeZ), v3(xApex + 0.08, dbY + 0.02, brakeZ),
    v3(xApex - 0.2, railY + 0.035, angledZ(xApex - 0.2) + webIn), v3(xTaper + 0.4, railY + 0.035, angledZ(xTaper + 0.4) + webIn),
    v3(xTaper - 0.2, railY + 0.035, railZ + webIn), v3(axles[1] + 0.3, railY + 0.035, railZ + webIn),
    v3(axC + 0.1, railY - 0.03, railZ + webIn), v3(axC, railY - 0.03, railZ - 0.045), v3(axC, R + 0.07, railZ - 0.05),
  ];
  add(g, tube(brake, 0.004, 90, 5), M.galv, { cast: false });
  for (const x of axles) {
    const fx = x + 0.042;
    add(g, tube([v3(axC, R + 0.07, railZ - 0.05), v3(fx, R + 0.02, railZ - 0.05), v3(fx, R, 0), v3(fx, R, -(wheelZ - 0.1))], 0.004, 40, 5), M.galv, { cast: false });
    add(g, tube([v3(fx, R + 0.005, railZ - 0.06), v3(fx, R, wheelZ - 0.1)], 0.004, 8, 5), M.galv, { cast: false });
  }

  // Safety chains from lugs under the drawbar, draped to their shackles.
  for (const s of [1, -1]) {
    const a = v3(xCoup - 0.3, dbY - 0.058, s * 0.035);
    block(g, M.galv, [0.05, 0.01, 0.02], [a.x, dbY - 0.055, a.z]);
    const end = chain(g, M, [a, v3(xCoup - 0.25, 0.3, s * 0.05), v3(xCoup - 0.13, 0.22, s * 0.065), v3(xCoup - 0.04, 0.27, s * 0.07)]);
    const shackle = add(g, new THREE.TorusGeometry(0.02, 0.0055, 6, 14, Math.PI), M.galv);
    shackle.position.copy(end).add(v3(0.016, 0, 0));
    shackle.rotation.z = -Math.PI / 2;
    bar(g, end.clone().add(v3(0.016, -0.02, -0.014)), end.clone().add(v3(0.016, -0.02, 0.014)), 0.006, M.galv, 8);
  }

  // Jockey wheel on a swing-up clamp, starboard side of the drawbar.
  const jx = xCoup - 0.66;
  const jz = dbW / 2 + 0.075;
  block(g, M.galv, [0.12, 0.13, 0.05], [jx, dbY, dbW / 2 + 0.025]);
  bar(g, v3(jx, 0.24, jz), v3(jx, dbTop + 0.16, jz), 0.03, M.galv, 14);
  bar(g, v3(jx, 0.13, jz), v3(jx, 0.26, jz), 0.024, M.galv, 14);
  bar(g, v3(jx, dbTop + 0.17, jz), v3(jx - 0.12, dbTop + 0.17, jz), 0.008, M.galv, 8);
  bar(g, v3(jx - 0.12, dbTop + 0.17, jz), v3(jx - 0.12, dbTop + 0.25, jz), 0.014, m.rubber, 10);
  disc(g, 0.032, 0.014, v3(jx, dbTop + 0.165, jz), M.galv, 14);
  for (const dz of [-0.042, 0.042]) block(g, M.galv, [0.05, 0.05, 0.006], [jx, 0.115, jz + dz]);
  block(g, M.galv, [0.05, 0.006, 0.09], [jx, 0.14, jz]);
  // Solid rubber tyre with a rounded crown on a pressed-steel wheel.
  const jTyre = [[0.056, -0.028], [0.072, -0.031], [0.09, -0.028], [0.098, -0.02], [0.1, -0.008], [0.1, 0.008], [0.098, 0.02], [0.09, 0.028], [0.072, 0.031], [0.056, 0.028]];
  add(g, lathe(jTyre, 24), m.tyre).position.set(jx, 0.1, jz);
  const jRim = [[0, -0.035], [0.012, -0.035], [0.02, -0.026], [0.034, -0.022], [0.05, -0.03], [0.058, -0.029], [0.058, 0.029], [0.05, 0.03], [0.034, 0.022], [0.02, 0.026], [0.012, 0.035], [0, 0.035]];
  add(g, scaleUV(lathe(jRim, 20), 0.4, 0.1), M.galv).position.set(jx, 0.1, jz);
  bar(g, v3(jx, 0.1, jz - 0.048), v3(jx, 0.1, jz + 0.048), 0.008, M.galv, 8);

  // Winch post, snubber arm and winch. The rubber vee snubber is tilted to the stem's rake, its
  // faces slope back with the bow, and it is pushed aft until it bears on the stem.
  // The strap hooks the boat's own bow eye (fittings.js), so the snubber and winch line up with it.
  const eyeP = bowEyePoint(lines);
  const yEye = eyeP.y;
  const ySnub = yEye + 0.16;
  const rake = Math.atan((lines.stemX(ySnub + 0.02) - lines.stemX(ySnub - 0.02)) / 0.04);
  const cr = Math.cos(rake);
  const sr = Math.sin(rake);
  // Snubber-local (x' forward square to the stem, y' up the stem) to boat x, y about the apex.
  const toBoat = (xl, yl) => [xl * cr + yl * sr, ySnub - xl * sr + yl * cr];
  const tanA = Math.min(1.2, Math.max(0.15, ((bowFront(lines, ySnub, 0.015) - bowFront(lines, ySnub, 0.075)) / 0.06) * cr));
  const snubH = 0.07;
  const bevel = 0.006;
  let xv = -Infinity;
  for (let i = 0; i <= 32; i++) {
    const z = (i / 32) * 0.08;
    for (let j = -4; j <= 4; j++) {
      const [xw, yw] = toBoat(-z * tanA, (j / 4) * (snubH / 2 + bevel));
      xv = Math.max(xv, bowFront(lines, yw, z) - xw);
    }
  }
  const snubDepth = 0.1;
  const snub = new THREE.Shape([[0, 0], [-0.08 * tanA, 0.08], [snubDepth, 0.08], [snubDepth, -0.08], [-0.08 * tanA, -0.08]].map(([x, z]) => new THREE.Vector2(x, z)));
  const snubGeo = new THREE.ExtrudeGeometry(snub, { depth: snubH, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  snubGeo.rotateX(Math.PI / 2);
  snubGeo.translate(bevel * Math.hypot(1, tanA), snubH / 2, 0);
  snubGeo.rotateZ(-rake);
  snubGeo.translate(xv, lift + ySnub, 0);
  add(g, snubGeo, m.rubber);
  const backD = snubDepth + bevel + 0.004;
  const [bx, by] = toBoat(backD, 0);
  const back = block(g, M.galv, [0.008, 0.09, 0.12], [xv + bx, lift + by, 0]);
  back.rotation.z = -rake;
  const postX = xv + 0.3;
  const armY = lift + by;
  const postTop = armY + 0.06;
  block(g, M.galv, [0.075, postTop - dbTop, 0.075], [postX, (postTop + dbTop) / 2, 0]);
  block(g, M.galv, [0.085, 0.008, 0.085], [postX, postTop + 0.004, 0]);
  rhs(g, v3(postX - 0.0375, armY, 0), v3(xv + bx + 0.004 * cr, armY, 0), 0.05, 0.05, M.galv);
  rhs(g, v3(postX + 0.0375, lerp(dbTop, postTop, 0.55), 0), v3(postX + 0.58, dbTop + 0.025, 0), 0.05, 0.05, M.galv);
  // Post clamp: plates over and under the drawbar with four tie bolts.
  block(g, M.galv, [0.15, 0.012, 0.15], [postX, dbTop + 0.006, 0]);
  block(g, M.galv, [0.15, 0.012, 0.15], [postX, dbY - 0.056, 0]);
  for (const dx of [-0.058, 0.058]) for (const dz of [-0.062, 0.062]) bar(g, v3(postX + dx, dbY - 0.075, dz), v3(postX + dx, dbTop + 0.025, dz), 0.007, M.galv, 6);

  // Spare wheel on a stub off the port side of the post.
  const spare = v3(postX, 0.92, -(0.0375 + 0.13));
  rhs(g, v3(postX, spare.y, -0.0375), v3(postX, spare.y, spare.z + tw * 0.3), 0.06, 0.06, M.galv);
  wheel(g, M, m, spare, -1, R, rb, tw);

  const eye = lift + yEye;
  const drum = v3(postX - 0.0375 - 0.078, eye + 0.03, 0);
  block(g, M.galv, [0.006, 0.17, 0.13], [postX - 0.0405, drum.y + 0.02, 0]);
  for (const s of [1, -1]) block(g, M.galv, [0.13, 0.13, 0.005], [drum.x + 0.02, drum.y + 0.01, s * 0.058]);
  disc(g, 0.02, 0.112, drum, M.galv, 14);
  disc(g, 0.044, 0.052, drum, M.strap, 24);
  disc(g, 0.058, 0.008, drum.clone().add(v3(0, 0, 0.066)), M.galv, 28);
  const pin = drum.clone().add(v3(0.03, 0.068, 0.07));
  disc(g, 0.018, 0.014, pin, M.galv, 12);
  const crankEnd = pin.clone().add(v3(0.04, -0.2, 0.02));
  rhs(g, pin.clone().add(v3(0, 0, 0.012)), crankEnd, 0.02, 0.008, M.galv);
  bar(g, crankEnd, crankEnd.clone().add(v3(0, 0, 0.1)), 0.014, m.rubber, 10);
  // The strap leaves the bottom of the drum and its hook wraps the boat's bow eye.
  const eyeRake = Math.atan((lines.stemX(yEye + 0.02) - lines.stemX(yEye - 0.02)) / 0.04);
  const hookC = v3(eyeP.x, eye, 0);
  const hook = add(g, new THREE.TorusGeometry(0.015, 0.005, 6, 14, Math.PI * 1.5), M.galv);
  hook.position.copy(hookC);
  hook.quaternion.setFromUnitVectors(v3(0, 0, 1), v3(Math.sin(eyeRake), Math.cos(eyeRake), 0));
  const strapA = drum.clone().add(v3(0, -0.044, 0));
  const toDrum = strapA.clone().sub(hookC).normalize();
  const strapB = hookC.clone().addScaledVector(toDrum, 0.075);
  bar(g, hookC.clone().addScaledVector(toDrum, 0.015), strapB, 0.005, M.galv, 8);
  const strapGeo = boxGeo(strapA.distanceTo(strapB), 0.003, 0.05);
  strapGeo.translate(strapA.distanceTo(strapB) / 2, 0, 0);
  span(add(g, strapGeo, M.strap), strapB, strapA);

  return mergeStatic(g);
}

// ---------- cradle ----------

// Showroom display cradle, blocked as a boatyard blocks a trailer boat. Three painted timber keel
// blocks take the weight on the keel bar: one under the transom and two along the level keel,
// each square and level with its rubber pad flat on the bar. Four galvanised screw-jack stands
// steady the hull, each swivel pad square to the bottom plate between the outer lifting strake
// and the chine.
export function cradle(lines, m) {
  const M = standMats();
  const g = new THREE.Group();
  const { L, B } = lines;
  const lift = CRADLE_LIFT;

  // Keel block: two bearers across, a two-high fore-and-aft block on them, a rubber pad on top.
  const pad = 0.012;
  const keelBlock = (xc) => {
    const len = 0.46;
    const top = keelFlat(lines, xc - len / 2 + 0.02, xc + len / 2 - 0.02, lift);
    const h = (top - pad) / 3;
    for (const dx of [-0.15, 0.15]) paintedTimber(g, M, [0.15, h, 0.56 * (B / 2.4)], [xc + dx, h / 2, 0]);
    for (const k of [1, 2]) paintedTimber(g, M, [len, h, 0.18], [xc, h * (k + 0.5), 0]);
    block(g, m.rubber, [len - 0.04, pad, 0.12], [xc, top - pad / 2, 0]);
  };
  for (const x of [0.3, 0.34 * L, 0.56 * L]) keelBlock(x);

  // Screw-jack stand at x on side s: a tripod of round-tube legs welded to a centre tube, an acme
  // screw wound up through a tommy-bar nut, and a ball-jointed pad, rubber faced, bedded 0.8 mm
  // into the plate (the plate is flat to 0.6 mm under it) and square to it.
  const nut = hexLathe([[0, 0], [0.036, 0], [0.036, 0.034], [0, 0.034]]);
  nut.rotateX(-Math.PI / 2);
  const jack = (x, s) => {
    const band = bunkBand(lines, (x - 0.1) / L, (x + 0.1) / L, 0.3);
    const z = (band.zIn + band.zOut) / 2;
    const { P, N } = plateFrame(lines, x, z, s, lift);
    const q = new THREE.Quaternion().setFromUnitVectors(UP, N.clone().negate());
    const face = P.clone().addScaledVector(N, -0.0008);
    const along = (d) => face.clone().addScaledVector(N, d);
    const tilted = (geo, d, mat) => {
      const mesh = add(g, geo, mat);
      mesh.quaternion.copy(q);
      mesh.position.copy(along(d));
      return mesh;
    };
    tilted(boxGeo(0.17, 0.015, 0.17), 0.0075, m.rubber);
    tilted(boxGeo(0.16, 0.008, 0.16), 0.019, M.galv);
    tilted(new THREE.CylinderGeometry(0.028, 0.02, 0.024, 16), 0.035, M.galv);
    const ball = along(0.055);
    add(g, new THREE.SphereGeometry(0.02, 14, 10), M.zinc).position.copy(ball);
    const nutY = ball.y - 0.17;
    bar(g, v3(ball.x, ball.y - 0.012, ball.z), v3(ball.x, nutY - 0.06, ball.z), 0.015, M.zinc, 12);
    add(g, nut.clone(), M.galv).position.set(ball.x, nutY, ball.z);
    bar(g, v3(ball.x - 0.15, nutY + 0.017, ball.z), v3(ball.x + 0.15, nutY + 0.017, ball.z), 0.008, M.zinc, 8);
    const tubeBot = 0.22;
    bar(g, v3(ball.x, tubeBot, ball.z), v3(ball.x, nutY, ball.z), 0.03, M.galv, 16);
    const legTop = 0.3;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const dx = Math.sin(a);
      const dz = s * Math.cos(a);
      const foot = v3(ball.x + dx * 0.38, 0.012, ball.z + dz * 0.38);
      bar(g, v3(ball.x + dx * 0.022, legTop, ball.z + dz * 0.022), foot.clone().add(v3(0, 0.004, 0)), 0.016, M.galv, 10);
      block(g, M.galv, [0.075, 0.008, 0.075], [foot.x, 0.004, foot.z]);
    }
  };
  for (const t of [0.2, 0.47]) for (const s of [1, -1]) jack(t * L, s);
  nut.dispose();
  return mergeStatic(g);
}
