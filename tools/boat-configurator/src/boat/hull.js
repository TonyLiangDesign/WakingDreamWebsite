import * as THREE from 'three';
import { lit } from '../materials.js';
import { add, ribbon, loft, crossSection, spaced, v3, lerp, clamp01 } from './kit.js';

// Hull lines and the shell: bottom plates, reverse chine, topsides with the knuckle and plate
// seams (dished slightly between frames), lifting strakes, weld beads (painted over on painted
// hulls), rubbing strake, keel and stem bar, gunwale capping, vinyl name decal.
// hullLines(model) returns the lines object every other part queries:
//   { L, B, halfBeam(t), keel(t), sheer(t), section(t), bottomZ(s, y), sideZ(s, y),
//     halfWidth(s, y), stemX(y), chineT }
// where section(t) gives hb (half-beam at the sheer), yk keel, yc/zc chine root, yf/zf chine shelf
// edge, yp/zp topside paint line, yn/zn knuckle, ys sheer, inner (inside of the capping) and dr
// deadrise at station t. halfWidth(s, y) is the outside half-width at any height (bottom or
// topsides), stemX(y) the x of the stem bar's leading edge at height y, chineT the station where
// the chine runs into the stem.
// Boat-local y: on the water the scene floats the hull with its static waterline at about
// y = 0.22 at the transom and 0.16 at the stem (scene.js WL_AFT / WL_FWD).
// The Harbour is a generic NZ plate-alloy trailer boat: deep vee, reverse chine, knuckled topsides.

export const DECK_Y = 0.3;      // cockpit floor, self-draining: about 0.1 m above the static waterline
export const CAP = 0.13;        // gunwale capping width, measured square to the sheer
export const KEEL_BAR = 0.035;  // depth of the keel bar below the bottom plates

const DEG = Math.PI / 180;
const FOREFOOT = [0.62, 0.33, 0.3];   // keel starts to lift (t), forefoot fullness (xL), stem-head tangent (m)
const CHINE_STEM = 0.48;              // chine meets the stem this far above the bow waterline (m, 6.2 m hull)
const T_COCKPIT = 0.82;               // forward end of the cockpit liner and floor (cockpit.js fore + 0.02)
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };

// x -> y (and y -> x) lookup through a cubic Bezier that is monotonic in both.
function bezierProfile(P0, P1, P2, P3, n = 400) {
  const xs = [];
  const ys = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = (1 - u) ** 3;
    const b = 3 * u * (1 - u) ** 2;
    const c = 3 * u * u * (1 - u);
    const d = u ** 3;
    xs.push(a * P0[0] + b * P1[0] + c * P2[0] + d * P3[0]);
    ys.push(a * P0[1] + b * P1[1] + c * P2[1] + d * P3[1]);
  }
  const at = (src, dst, v) => {
    if (v <= src[0]) return dst[0];
    if (v >= src[n]) return dst[n];
    let lo = 0;
    let hi = n;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (src[mid] <= v) lo = mid; else hi = mid; }
    return lerp(dst[lo], dst[hi], (v - src[lo]) / (src[hi] - src[lo] || 1));
  };
  return { yAt: (x) => at(xs, ys, x), xAt: (y) => at(ys, xs, y) };
}

// ---------- hull lines ----------

export function hullLines(model) {
  const L = model.length;
  const B = model.beam;
  const k = L / 6.2;
  const sb = B / 2.4;

  // Plan: full beam well aft, maximum at 45 % and a fine entry, about 32 degrees either side
  // of the stem at the sheer.
  const T_MAX = 0.45;
  const halfBeam = (t) => {
    if (t <= T_MAX) return (B / 2) * (1 - 0.035 * (1 - t / T_MAX) ** 2);
    const u = Math.min(1, (t - T_MAX) / (1 - T_MAX));
    return (B / 2) * (1 - u * u) * (1 - 0.2 * u ** 3);
  };

  // Sheer: low and nearly straight aft, sweeping up to the bow.
  const ys0 = 0.86 + 0.07 * k;
  const spring = 0.85 + 0.15 * k;
  const sheer = (t) => ys0 + (0.05 * t + 0.3 * t ** 2.6) * spring;

  // Reverse chine: an 80 mm shelf turned down about 12 degrees at its outer edge.
  const SHELF = 0.08 * sb;
  const DROP = SHELF * Math.tan(12 * DEG);
  const OFF = 0.1 * sb;                 // topside flare: sheer half-beam minus chine edge
  const YC0 = 0.17;                      // chine root at the transom, just under the static waterline

  // Keel: level aft, then a forefoot curving up into a raked stem (about 38 degrees from
  // vertical at the head). The keel depth follows from a 20 degree deadrise at the transom.
  const zc0 = halfBeam(0) - OFF - SHELF;
  const yk0 = YC0 - Math.tan(20 * DEG) * zc0;
  const head = [L, sheer(1)];
  const rake = 38 * DEG;
  const xf = FOREFOOT[0] * L;
  const stem = bezierProfile([xf, yk0], [xf + FOREFOOT[1] * L, yk0], [head[0] - Math.sin(rake) * FOREFOOT[2] * k, head[1] - Math.cos(rake) * FOREFOOT[2] * k], head);
  const keel = (t) => (t * L <= xf ? yk0 : stem.yAt(t * L));

  // The chine stays under the self-draining floor through the cockpit (so the liner and floor
  // sit inside the plating), then sweeps up to meet the stem well above the waterline.
  const chineT = stem.xAt(0.16 + CHINE_STEM * k) / L;
  const T_IN = Math.min(T_COCKPIT, chineT - 0.08); // the chine starts to turn in towards the stem
  const y1 = DECK_Y - 0.035;
  const ycAt = (t) => {
    if (t <= T_IN) return YC0 + (y1 - YC0) * (t / T_IN) ** 3;
    const d = t - T_IN;
    const D = chineT - T_IN;
    const m1 = (3 * (y1 - YC0)) / T_IN;
    return y1 + m1 * d + ((keel(chineT) - y1 - m1 * D) / (D * D)) * d * d;
  };
  const zfAt = (t) => {
    if (t >= chineT) return 0;
    const base = halfBeam(t) - OFF * (1 + 0.15 * smooth(0.5, 0.8, t));
    if (t <= T_IN) return base;
    const u = (t - T_IN) / (chineT - T_IN);
    return base * (1 - u * u);
  };

  function section(t) {
    const hb = halfBeam(t);
    const yk = keel(t);
    const ys = sheer(t);
    const zf = zfAt(t);
    const fade = clamp01(zf / (0.35 * sb));
    const zc = Math.max(0, zf - SHELF * fade);
    const yc = t >= chineT ? yk : Math.max(yk, ycAt(t));
    const yf = t >= chineT ? yk : Math.max(yk, yc - DROP * fade);
    const dr = zc > 1e-4 ? Math.atan2(yc - yk, zc) : Math.PI / 2;
    // Knuckle a little under halfway up the topsides; the upper panel stands nearly plumb,
    // the lower panel takes the flare, which grows into the bow.
    const yn = lerp(yf, ys, 0.45);
    const flareUp = (3 + 9 * smooth(0.6, 1, t)) * DEG;
    const zn = Math.min(hb, Math.max(zf, hb - (ys - yn) * Math.tan(flareUp)));
    // Paint line 45 mm up the lower panel from the chine, running out at the stem.
    const len = Math.hypot(zn - zf, yn - yf) || 1;
    const pl = Math.min(0.045 * fade, 0.4 * len);
    const zp = zf + ((zn - zf) / len) * pl;
    const yp = yf + ((yn - yf) / len) * pl;
    // Inside of the capping, square to the sheer line in plan.
    const ta = Math.max(0, t - 0.004);
    const tb = Math.min(1, t + 0.004);
    const slope = (halfBeam(ta) - halfBeam(tb)) / ((tb - ta) * L);
    const inner = Math.max(0, hb - CAP * Math.hypot(1, slope));
    return { t, x: t * L, hb, yk, ys, dr, zc, yc, zf, yf, zp, yp, zn, yn, inner };
  }

  // Half-width of the V bottom at height y, used for the cockpit floor and the waterline.
  const bottomZ = (s, y) => (y <= s.yk ? 0 : y >= s.yc ? s.zc : (s.zc * (y - s.yk)) / (s.yc - s.yk));
  // Half-width of the topsides at height y.
  const sideZ = (s, y) => (y <= s.yn ? lerp(s.zf, s.zn, clamp01((y - s.yf) / (s.yn - s.yf || 1))) : lerp(s.zn, s.hb, clamp01((y - s.yn) / (s.ys - s.yn || 1))));
  // Outside half-width at any height: bottom below the chine shelf edge, topsides above.
  const halfWidth = (s, y) => (y < s.yf ? bottomZ(s, y) : y > s.ys ? s.hb : sideZ(s, y));
  // Leading edge of the stem bar at height y (between the forefoot and the sheer).
  const stemX = (y) => (y <= yk0 ? xf : stem.xAt(Math.min(y, head[1]))) + 0.02;
  return { L, B, halfBeam, keel, sheer, section, bottomZ, sideZ, halfWidth, stemX, chineT };
}

// ---------- plate fairness ----------

// Plate butts (fractions of L): bottom sheets join once, topside sheets twice, staggered between
// the panels and clear of the name decal.
const BUTT_BOTTOM = [0.46];
const BUTT_LOWER = [0.36, 0.74];
const BUTT_UPPER = [0.3, 0.8];

// Oil-canning: welded plate draws in a little between the frames, so even a fair hull shows a
// faint ripple in grazing reflections. Each topside panel dishes inward between frame stations
// about 0.5 m apart (the butts sit on frames), deepest mid-panel, nothing at the knuckle, chine
// or sheer welds, fading out in the bow where the flare stiffens the plate. 3.3-6 mm deep:
// invisible face-on, a soft wobble in the reflected horizon at a glancing angle.
const FRAME = 0.5;
const DISH = 0.006;
function frameStations(L, butts) {
  const keys = [0, ...butts, 1];
  const out = [];
  for (let i = 0; i < keys.length - 1; i++) {
    const n = Math.max(1, Math.round(((keys[i + 1] - keys[i]) * L) / FRAME));
    for (let j = 0; j < n; j++) out.push(lerp(keys[i], keys[i + 1], j / n));
  }
  out.push(1);
  return out;
}
const hash = (k) => { const v = Math.sin(k * 12.9898 + 4.1) * 43758.5453; return v - Math.floor(v); };

// plateDish(lines, 'lower' | 'upper') returns (t, s) => inward depth in metres of that topside
// panel at station t, s running 0 at the panel's lower edge to 1 at its upper edge.
export function plateDish(lines, panel) {
  const upper = panel === 'upper';
  const frames = frameStations(lines.L, upper ? BUTT_UPPER : BUTT_LOWER);
  const seed = upper ? 17 : 3;
  let lastT = -1;
  let top = 1;
  return (t, s) => {
    let k = 0;
    while (k < frames.length - 2 && t > frames[k + 1]) k++;
    const u = clamp01((t - frames[k]) / (frames[k + 1] - frames[k]));
    const along = 0.65 * Math.sin(Math.PI * u) ** 2 + 0.35 * Math.sin(Math.PI * u);
    const depth = DISH * (0.55 + 0.45 * hash(k + seed)) * (1 - smooth(0.8, 0.95, t));
    // The upper panel is held flat under the rubbing strake (its lower edge is about 76 mm under
    // the sheer), so the strake never stands off a dished plate.
    if (upper && t !== lastT) {
      const sec = lines.section(t);
      top = clamp01((sec.ys - 0.085 - sec.yn) / (sec.ys - sec.yn || 1)) || 1;
      lastT = t;
    }
    const v = clamp01(upper ? s / top : s);
    const across = Math.sin(Math.PI * v) * (1 + 0.5 * (hash(k + seed + 40) - 0.5) * Math.cos(Math.PI * v));
    return depth * along * across;
  };
}
// The two edges [z, y] of a topside panel at a section.
const panelEdges = {
  lower: (s) => [[s.zp, s.yp], [s.zn, s.yn]],
  upper: (s) => [[s.zn, s.yn], [s.hb, s.ys]],
};

// ---------- decal ----------

const LETTER_FONT = (weight) => `italic ${weight} 118px Montserrat, "Helvetica Neue", Arial, sans-serif`;
function drawName(ctx, name) {
  ctx.font = LETTER_FONT(600);
  ctx.textBaseline = 'middle';
  const [series, number] = name.split(' ');
  ctx.fillText(series.toUpperCase(), 20, 100);
  const w = ctx.measureText(series.toUpperCase()).width;
  ctx.font = LETTER_FONT(400);
  ctx.fillText(number, 20 + w + 34, 100);
  ctx.fillRect(20, 168, 980, 6);
}

export function nameTexture(name, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colour;
  drawName(ctx, name);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Cut vinyl has a cut edge: the lettering's alpha, softened by a pixel and turned into a normal
// map, gives every letter a hairline bevel that catches the light along its rim.
function vinylEdgeNormal(name) {
  const w = 1024;
  const h = 192;
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d');
  sctx.filter = 'blur(1px)';
  sctx.fillStyle = '#fff';
  drawName(sctx, name);
  const a = sctx.getImageData(0, 0, w, h).data;
  const out = sctx.createImageData(w, h);
  const at = (x, y) => a[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4 + 3] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = -(at(x + 1, y) - at(x - 1, y)) * 1.4;
      const ny = (at(x, y + 1) - at(x, y - 1)) * 1.4;
      const l = Math.hypot(nx, ny, 1);
      const i = (y * w + x) * 4;
      out.data[i] = (nx / l * 0.5 + 0.5) * 255;
      out.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').putImageData(out, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 8;
  return texture;
}

// Gloss cast vinyl: satin-gloss against the mirror clearcoat around it, so a reflection running
// across the name softens as it crosses the letters. One per name and colour, kept for the page.
const decalCache = new Map();
// Canvas text does not repaint itself after a font download. Start with the fallback, then
// update just the cached colour/normal textures once the two lettering weights are ready.
export async function refreshDecalFonts() {
  try {
    await Promise.all([400, 600].map((weight) => document.fonts.load(LETTER_FONT(weight), 'HARBOUR 620')));
    for (const [key, material] of decalCache) {
      const [name, colour] = key.split('|');
      material.map.dispose();
      material.normalMap.dispose();
      material.map = nameTexture(name, colour);
      material.normalMap = vinylEdgeNormal(name);
    }
  } catch {
    // An unavailable font leaves readable fallback lettering and a working configurator.
  }
}
function decalMaterial(name, colour) {
  const key = `${name}|${colour}`;
  if (!decalCache.has(key)) {
    const material = lit({
      map: nameTexture(name, colour), normalMap: vinylEdgeNormal(name), normalScale: new THREE.Vector2(1, 1),
      roughness: 0.26, specularIntensity: 0.9, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    material.userData.shared = true;
    decalCache.set(key, material);
  }
  return decalCache.get(key);
}

// Name on the upper topsides panel, on a straight line raked with the sheer. The strip is laid
// out by arc length on the plate, so the lettering keeps the canvas proportions. It follows the
// plate's dish and stands 0.6 mm proud of it: on the paint, not floating over it.
export function nameDecal(group, lines, name, colour) {
  const material = decalMaterial(name, colour);
  const dish = plateDish(lines, 'upper');
  const { L, section } = lines;
  const W = 0.2 * L;                     // decal length along the hull
  const H = W * (192 / 1024);            // keeps the canvas aspect
  const tc = 0.6;
  const sc = section(tc);
  const yMid = lerp(sc.yn, sc.ys - 0.075, 0.5);
  const rise = 0.8 * (lines.sheer(tc + 0.08) - lines.sheer(tc - 0.08)) / (0.16 * L);
  const y0 = (x) => yMid - H / 2 + (x - sc.x) * rise;
  const zMid = (x) => lines.sideZ(section(x / L), y0(x) + H / 2);
  const arc = (xa, xb) => {
    let d = 0;
    for (let i = 0; i < 24; i++) {
      const a = lerp(xa, xb, i / 24);
      const b = lerp(xa, xb, (i + 1) / 24);
      d += Math.hypot(b - a, zMid(b) - zMid(a), y0(b) - y0(a));
    }
    return d;
  };
  const scale = W / arc(sc.x - W / 2, sc.x + W / 2);
  const n = 24;
  const xs = spaced(sc.x - (W / 2) * scale, sc.x + (W / 2) * scale, n);
  const run = [0];
  for (let i = 1; i <= n; i++) run.push(run[i - 1] + arc(xs[i - 1], xs[i]));
  const rows = 4;
  // Each column climbs the plate in equal surface steps, so the flare does not stretch it.
  const columns = xs.map((x) => {
    const s = section(x / L);
    const [a, b] = panelEdges.upper(s);
    const [nz, ny] = segNormal(a, b);
    const onPlate = (y) => {
      const z = lines.sideZ(s, y);
      const off = 0.0006 - dish(s.t, (y - s.yn) / (s.ys - s.yn || 1));
      return [z + nz * off, y + ny * off];
    };
    let y = y0(x);
    const out = [onPlate(y)];
    for (let j = 1; j <= rows; j++) {
      const dz = (lines.sideZ(s, y + 0.005) - lines.sideZ(s, y)) / 0.005;
      y += H / rows / Math.hypot(1, dz);
      out.push(onPlate(y));
    }
    return out;
  });
  for (const side of [1, -1]) {
    const position = [];
    const uv = [];
    const index = [];
    columns.forEach((col, i) => col.forEach(([z, y], j) => {
      position.push(xs[i], y, z * side);
      const u = run[i] / run[n];
      uv.push(side > 0 ? u : 1 - u, j / rows);
    }));
    const cols = rows + 1;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < rows; j++) {
        const a = i * cols + j;
        const b = a + cols;
        if (side > 0) index.push(a, b, a + 1, b, b + 1, a + 1);
        else index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    add(group, g, material, { cast: false });
  }
}

// ---------- shell helpers ----------

// Mill-finish plate: satin marine alloy with fine rolling streaks along the sheet and no broad
// blotches, so plates differ only by their streak pattern, never as brighter patches. Made once
// and shared across rebuilds (it is part-specific, so merge-by-material still works).
let millPlate = null;
function millTexture() {
  const w = 1024;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(200,200,200)';
  ctx.fillRect(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Soft bands across the sheet's width, as left by the rolls.
  for (let y = 0; y < h; y += 2) {
    const v = 200 + 10 * Math.sin(y * 0.09 + 1.3) + 6 * Math.sin(y * 0.031);
    ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
    ctx.fillRect(0, y, w, 2);
  }
  // Fine streaks the length of the sheet; drawn twice offset by w so the tile wraps.
  for (let i = 0; i < 1800; i++) {
    const g = 165 + rnd() * 70;
    ctx.strokeStyle = `rgba(${g | 0},${g | 0},${g | 0},${0.06 + rnd() * 0.12})`;
    ctx.lineWidth = 0.4 + rnd() * 1.1;
    const y = rnd() * h;
    const x = rnd() * w;
    const len = 150 + rnd() * 500;
    for (const o of [0, -w]) {
      ctx.beginPath();
      ctx.moveTo(x + o, y);
      ctx.lineTo(x + o + len, y + (rnd() - 0.5));
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
export function plateAlloy() {
  if (!millPlate) {
    millPlate = lit({ color: '#bfc4c8', metalness: 1, roughness: 0.6, roughnessMap: millTexture(), side: THREE.DoubleSide });
    millPlate.userData.shared = true;
  }
  return millPlate;
}
// The topsides material for this build: the paint, or the mill-finish plate when bare.
export function topsideMaterial(m) {
  return m.paint.metalness >= 1 ? plateAlloy() : m.paint;
}

// Plate texture coordinates: fore-and-aft grain, stretched so the mill-finish streaks run
// the length of a sheet; each sheet gets its own offset, like separate plates off the roll.
// Painted sheets take plain metres instead (the paint's orange peel is isotropic), offset by
// metres per sheet so each samples its own shade of the paint's slow tone drift.
function plateUV(g, mode, seed, painted = false) {
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  const du = painted ? seed * 3.7 : (seed * 0.618) % 1;
  const dv = painted ? seed * 2.3 : (seed * 0.382) % 1;
  for (let i = 0; i < p.count; i++) {
    const across = mode === 'bottom' ? Math.abs(p.getZ(i)) : p.getY(i);
    if (painted) uv.setXY(i, p.getX(i) + du, across + dv);
    else uv.setXY(i, p.getX(i) * 0.12 + du, across * 0.7 + dv);
  }
  uv.needsUpdate = true;
  return g;
}

// Rubbing strake: extruded black PVC, semi-gloss, harder and shinier than moulded rubber.
let pvc = null;
function strakeMaterial() {
  if (!pvc) {
    pvc = lit({ color: '#121314', roughness: 0.4, specularIntensity: 0.8, clearcoat: 0.3, clearcoatRoughness: 0.28 });
    pvc.userData.shared = true;
  }
  return pvc;
}

// Strips that run out to a point (stem head, strake and capping ends) leave a few vertices on
// zero-area faces only; give them the normal of their nearest neighbour so they never shade black.
function healNormals(g) {
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const good = [];
  const bad = [];
  for (let i = 0; i < n.count; i++) (Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) > 0.5 ? good : bad).push(i);
  for (const i of bad) {
    let best = -1;
    let bd = Infinity;
    const half = n.count / 2;
    for (const j of good) {
      if ((i < half) !== (j < half)) continue;
      const d = (p.getX(i) - p.getX(j)) ** 2 + (p.getY(i) - p.getY(j)) ** 2 + (p.getZ(i) - p.getZ(j)) ** 2;
      if (d < bd) { bd = d; best = j; }
    }
    if (best >= 0) n.setXYZ(i, n.getX(best), n.getY(best), n.getZ(best));
  }
  return g;
}
const skinStrip = (stations) => healNormals(ribbon(stations));

// Stations between t0 and t1, denser towards the bow, always including the given breaks.
function stations(t0, t1, n, breaks = []) {
  const ts = spaced(0, 1, n, (u) => Math.sin((u * Math.PI) / 2)).map((u) => lerp(t0, t1, u));
  const all = [...ts, ...breaks.filter((b) => b > t0 && b < t1)];
  return [...new Set(all.map((t) => +t.toFixed(5)))].sort((a, b) => a - b);
}

// A bead is a loft of open arcs, so loft() cannot always tell outside from in. The beads use the
// paint and plate materials, which are double-sided: wound inward, three.js would light the
// visible face as a back face with its normals reversed. Check the crown of the middle ring
// against the plate normal and rewind if needed.
function faceOut(g, k, N, ring) {
  const nrm = g.attributes.normal;
  const j = ring * k + Math.floor(k / 2);
  if (nrm.getX(j) * N.x + nrm.getY(j) * N.y + nrm.getZ(j) * N.z < 0) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.index.needsUpdate = true;
  }
  return g;
}

// Weld bead: a low flat bead, 9 mm wide and 2 mm proud, swept along points on the plate with
// the plate's outward normal at each, so it neither twists nor sinks into the plate. Its
// normals lean only slightly off the plate's, so a bead a few pixels wide reads as a soft
// line instead of shimmering light and dark.
function bead(group, pts, normals, material) {
  const T = new THREE.Vector3();
  const frames = [];
  const rings = pts.map((p, i) => {
    T.subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    const N = normals[i].clone().addScaledVector(T, -normals[i].dot(T)).normalize();
    const Bn = new THREE.Vector3().crossVectors(T, N).normalize();
    frames.push([N, Bn]);
    return Array.from({ length: 8 }, (_, j) => {
      const a = (j / 7) * Math.PI;
      const h = j === 0 || j === 7 ? -0.0015 : 0.002 * Math.sin(a) ** 0.7;
      return p.clone().addScaledVector(N, h).addScaledVector(Bn, 0.0045 * Math.cos(a));
    });
  });
  const g = faceOut(loft(rings), 8, frames[Math.floor(frames.length / 2)][0], Math.floor(frames.length / 2));
  const nrm = g.attributes.normal;
  frames.forEach(([N, Bn], i) => {
    for (let j = 0; j < 8; j++) {
      const n = N.clone().addScaledVector(Bn, 0.3 * Math.cos((j / 7) * Math.PI)).normalize();
      nrm.setXYZ(i * 8 + j, n.x, n.y, n.z);
    }
  });
  add(group, g, material, { cast: false });
}

// Painted-over weld: once filled and sprayed, a weld reads as a soft ridge, 16 mm wide and about
// 1 mm high, that rises out of the plate with no edge line and carries a highlight on its
// flank. edges[i] = [nLo, nHi] are the plate normals either side (the lower and upper panel at
// the knuckle, the same plate at a butt); the bead follows the fold between them, so across a
// knuckle it also reads as the slightly rounded crease paint leaves there.
function paintedBead(group, pts, normals, edges, material) {
  const W = 0.008;
  const H = 0.001;
  const K = 11;
  const T = new THREE.Vector3();
  const frames = [];
  const rings = pts.map((p, i) => {
    T.subVectors(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    const N = normals[i].clone().addScaledVector(T, -normals[i].dot(T)).normalize();
    const Bn = new THREE.Vector3().crossVectors(T, N).normalize();
    const [nLo, nHi] = edges[i];
    const loSign = Bn.y <= 0 ? 1 : -1;
    const tanHalf = Math.tan(0.5 * Math.acos(Math.min(1, Math.max(-1, nLo.dot(nHi)))));
    frames.push({ N, Bn, nLo, nHi, loSign });
    return Array.from({ length: K }, (_, j) => {
      const r = -1 + (2 * j) / (K - 1);
      const bump = j === 0 || j === K - 1 ? -0.0006 : H * 0.5 * (1 + Math.cos(Math.PI * r));
      return p.clone().addScaledVector(N, bump - Math.abs(r) * W * tanHalf).addScaledVector(Bn, r * W);
    });
  });
  const mid = Math.floor(frames.length / 2);
  const g = faceOut(loft(rings), K, frames[mid].N, mid);
  const nrm = g.attributes.normal;
  const n = new THREE.Vector3();
  frames.forEach(({ N, Bn, nLo, nHi, loSign }, i) => {
    for (let j = 0; j < K; j++) {
      const r = -1 + (2 * j) / (K - 1);
      n.copy(N).lerp(r * loSign > 0 ? nLo : nHi, Math.abs(r)).normalize();
      n.addScaledVector(Bn, ((1.2 * H * Math.PI) / (2 * W)) * Math.sin(Math.PI * r)).normalize();
      nrm.setXYZ(i * K + j, n.x, n.y, n.z);
    }
  });
  add(group, g, material, { cast: false });
}
// Outward normal (z, y) of a section segment a -> b on the starboard side.
const segNormal = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[1] - a[1]) / l, -(b[0] - a[0]) / l]; };
const bisect = (u, v) => { const z = u[0] + v[0]; const y = u[1] + v[1]; const l = Math.hypot(z, y) || 1; return [z / l, y / l]; };

// Point a fraction f along a section segment [z, y] -> [z, y], pushed d off the plate.
function proud(a, b, f, d) {
  const z = lerp(a[0], b[0], f);
  const y = lerp(a[1], b[1], f);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [z + ((b[1] - a[1]) / len) * d, y - ((b[0] - a[0]) / len) * d];
}

// ---------- shell ----------

// Builds the shell into group. Receives the lines and materials; returns nothing.
export function hullShell(group, lines, m) {
  const { L, section, chineT } = lines;
  const sb = lines.B / 2.4;
  const paint = topsideMaterial(m);
  const painted = paint !== plateAlloy();
  const alloy = plateAlloy();

  const skin = stations(0, 1, 110, [...BUTT_BOTTOM, ...BUTT_LOWER, ...BUTT_UPPER, chineT]).map(section);
  const plates = (cuts, lo, hi, list = skin) => {
    const edges = [lo, ...cuts.filter((c) => c > lo && c < hi), hi];
    return edges.slice(0, -1).map((a, i) => list.filter((s) => s.t >= a - 1e-6 && s.t <= edges[i + 1] + 1e-6));
  };

  // Bottom plates up to where the chine meets the stem, then the turned-down chine shelf.
  plates(BUTT_BOTTOM, 0, chineT).forEach((run, i) => {
    add(group, plateUV(skinStrip(run.map((s) => ({ x: s.x, pts: [[0, s.yk], [s.zc * 0.5, lerp(s.yk, s.yc, 0.5)], [s.zc, s.yc]] }))), 'bottom', i + 1), alloy);
  });
  add(group, plateUV(skinStrip(skin.filter((s) => s.t <= chineT + 1e-6).map((s) => ({ x: s.x, pts: [[s.zc, s.yc], [s.zf, s.yf]] }))), 'side', 7), alloy);

  // Topsides: bare alloy band under the paint line, then the lower and upper panels either
  // side of the knuckle. The panels are finer than the rest of the skin (a station about every
  // 65 mm aft, one on every frame, rows across the panel) so they can carry the dish between
  // frames: each column of points is drawn in by plateDish, and the normals follow.
  add(group, plateUV(skinStrip(skin.filter((s) => s.t <= chineT + 1e-6).map((s) => ({ x: s.x, pts: [[s.zf, s.yf], [s.zp, s.yp]] }))), 'side', 11), alloy);
  for (const [panel, butts, rows, seed, step] of [['lower', BUTT_LOWER, 4, 3, 2], ['upper', BUTT_UPPER, 6, 4, 3]]) {
    const dish = plateDish(lines, panel);
    const run = stations(0, 1, 150, [...butts, ...frameStations(L, butts)]).map(section);
    plates(butts, 0, 1, run).forEach((r, i) => {
      const strip = r.map((s) => {
        const [a, b] = panelEdges[panel](s);
        return { x: s.x, pts: spaced(0, 1, rows).map((f) => proud(a, b, f, -dish(s.t, f))) };
      });
      add(group, plateUV(skinStrip(strip), 'side', seed + i * step, painted), paint);
    });
  }

  // Lifting strakes: two a side, triangular, flat underneath with a near-plumb outer face.
  // They start 0.3 m forward of the transom and fade out before the chine reaches the stem.
  for (const { f, end } of [{ f: 0.36, end: chineT - 0.07 }, { f: 0.68, end: chineT - 0.14 }]) {
    const t0 = 0.3 / L;
    const run = stations(t0, end, 60).map(section).map((s) => {
      const w = 0.045 * sb * smooth(t0, t0 + 0.06 / L, s.t) * (1 - smooth(end - 0.2, end, s.t));
      const zw = Math.min(w, (1 - f) * s.zc * 0.5);
      const tan = (s.yc - s.yk) / Math.max(s.zc, 1e-4);
      const a = [s.zc * f, lerp(s.yk, s.yc, f)];
      const c = [a[0] + zw, a[1] - 0.001 * Math.min(1, zw / 0.01)];
      const b = [a[0] + zw, a[1] + tan * zw];
      return { x: s.x, pts: [a, c, c, b] };
    });
    add(group, skinStrip(run), alloy);
  }

  // Weld beads: topsides to chine shelf, the knuckle, and the plate butts.
  const along = (ts, at, nAt, mat) => {
    for (const side of [1, -1]) {
      const ss = ts.map(section);
      bead(group, ss.map((s) => { const [z, y] = at(s); return v3(s.x, y, side * z); }), ss.map((s) => { const [z, y] = nAt(s); return v3(0, y, side * z); }), mat);
    }
  };
  along(stations(0, chineT - 0.035, 70), (s) => [s.zf, s.yf], (s) => bisect(segNormal([s.zc, s.yc], [s.zf, s.yf]), segNormal([s.zf, s.yf], [s.zp, s.yp])), alloy);
  // On painted hulls the knuckle and topside butts are filled and sprayed over: soft painted
  // ridges. Bare hulls keep the as-welded beads.
  // Bead normals are the plate's true 3D normal, including its fore-and-aft lean where the hull
  // narrows into the bow (over 20 degrees at the forward butts). A section-plane normal there
  // makes the bead mirror a different part of the room from the plate around it, which is what
  // drew the welds as dark pencil lines.
  const bottomEdges = (s) => [[0, s.yk], [s.zc, s.yc]];
  const plateNormal = (edges, t, f, side) => {
    const at = (tt) => { const s = section(clamp01(tt)); const [a, b] = edges(s); return v3(s.x, lerp(a[1], b[1], f), lerp(a[0], b[0], f)); };
    const fore = at(t + 0.002).sub(at(t - 0.002));
    const [a, b] = edges(section(t));
    const n = new THREE.Vector3().crossVectors(fore, v3(0, b[1] - a[1], b[0] - a[0])).normalize();
    if (n.z < 0) n.negate();
    n.z *= side;
    return n;
  };
  if (painted) {
    for (const side of [1, -1]) {
      const ss = stations(0, 0.985, 90).map(section);
      const ends = ss.map((s) => [plateNormal(panelEdges.lower, s.t, 1, side), plateNormal(panelEdges.upper, s.t, 0, side)]);
      paintedBead(group, ss.map((s) => v3(s.x, s.yn, side * s.zn)), ends.map(([lo, hi]) => lo.clone().add(hi).normalize()), ends, paint);
    }
  } else {
    along(stations(0, 0.985, 90), (s) => [s.zn, s.yn], (s) => bisect(segNormal([s.zp, s.yp], [s.zn, s.yn]), segNormal([s.zn, s.yn], [s.hb, s.ys])), paint);
  }
  // The upper butts run up under the rubbing strake.
  const corners = (s) => ({ k: [0, s.yk], c: [s.zc, s.yc], p: [s.zp, s.yp], n: [s.zn, s.yn], h: [lines.sideZ(s, s.ys - 0.062), s.ys - 0.062] });
  const butt = (t, from, to, edges, mat, sprayed) => {
    const s = section(t);
    const pts = corners(s);
    const [a, b] = edges(s);
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    for (const side of [1, -1]) {
      const line = spaced(0.01, 0.99, 8).map((f) => proud(pts[from], pts[to], f, 0)).map(([z, y]) => v3(s.x, y, side * z));
      const nrm = line.map((p) => plateNormal(edges, t, clamp01(Math.hypot(Math.abs(p.z) - a[0], p.y - a[1]) / span), side));
      if (sprayed) paintedBead(group, line, nrm, nrm.map((q) => [q, q]), mat);
      else bead(group, line, nrm, mat);
    }
  };
  for (const t of BUTT_LOWER) butt(t, 'p', 'n', panelEdges.lower, paint, painted);
  for (const t of BUTT_UPPER) butt(t, 'n', 'h', panelEdges.upper, paint, painted);
  for (const t of BUTT_BOTTOM) butt(t, 'k', 'c', bottomEdges, alloy, false);

  // Keel bar and stem bar: one flat bar on edge, welded along the keel and up the stem.
  const headY = lines.sheer(1) - 0.075;
  const bar = spaced(0, 1, 90, (u) => 1 - (1 - u) ** 1.6).map((t) => [t * L, lines.keel(t)]).filter(([, y]) => y <= headY);
  bar.push([lines.stemX(headY) - 0.02, headY]);
  const rings = bar.map(([x, y], i) => {
    const a = bar[Math.max(0, i - 1)];
    const b = bar[Math.min(bar.length - 1, i + 1)];
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (b[1] - a[1]) / tl;
    const ny = -(b[0] - a[0]) / tl;
    const depth = lerp(KEEL_BAR, 0.026, clamp01((x - 0.6 * L) / (0.4 * L)));
    return Array.from({ length: 16 }, (_, j) => {
      const ang = (j / 16) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const out = ((depth + 0.006) / 2) * Math.sign(c) * Math.abs(c) ** 0.4 + (depth - 0.006) / 2;
      return v3(x + nx * out, y + ny * out, 0.011 * Math.sign(s) * Math.abs(s) ** 0.4);
    });
  });
  add(group, loft(rings), alloy);

  // Gunwale capping: flat top square to the sheer, rolled outer edge, short inner lip.
  const capPts = (s) => {
    const lip = 0.018 * clamp01((s.inner - 0.02) / 0.05);
    const zi = Math.max(0, s.inner - 0.003);
    const zo = s.hb + 0.006;
    return [[zi, s.ys - lip], [zi, s.ys], [zi, s.ys], [zo - 0.008, s.ys], [zo - 0.002, s.ys - 0.003], [zo, s.ys - 0.01], [zo, s.ys - 0.024]];
  };
  add(group, skinStrip(stations(0, 1, 70).map(section).map((s) => ({ x: s.x, pts: capPts(s) }))), paint);
  const s0 = section(0);
  const endFace = [...capPts(s0).filter((_, i) => i !== 2), [s0.hb - 0.002, s0.ys - 0.024], [s0.hb - 0.002, s0.ys - 0.012], [Math.max(0, s0.inner - 0.003), s0.ys - 0.012]];
  for (const side of [1, -1]) add(group, crossSection(endFace.map(([z, y]) => [z * side, y]), -0.0005), paint, { cast: false });

  // Rubbing strake: black PVC D-section in one run from transom to transom around the stem.
  const yr = (s) => s.ys - 0.052;
  const sideRun = stations(0, 0.985, 60).map(section);
  const path = [
    ...sideRun.map((s) => v3(s.x, yr(s), lines.halfWidth(s, yr(s)))),
    v3(lines.stemX(lines.sheer(1) - 0.052) + 0.004, lines.sheer(1) - 0.052, 0),
    ...sideRun.slice().reverse().map((s) => v3(s.x, yr(s), -lines.halfWidth(s, yr(s)))),
  ];
  const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
  const N = 200;
  const up = v3(0, 1, 0);
  const strip = curve.getSpacedPoints(N).map((p, i) => {
    const tan = curve.getTangentAt(i / N);
    const out = new THREE.Vector3().crossVectors(tan, up).normalize();
    const nUp = new THREE.Vector3().crossVectors(out, tan).normalize();
    return Array.from({ length: 12 }, (_, j) => {
      const a = (j / 12) * Math.PI * 2;
      const c = Math.cos(a);
      const o = c > 0 ? 0.03 * sb ** 0.5 * c ** 0.8 : -0.004;
      const h = 0.024 * Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** 0.7;
      return p.clone().addScaledVector(out, o).addScaledVector(nUp, h);
    });
  });
  add(group, loft(strip), strakeMaterial());
}
