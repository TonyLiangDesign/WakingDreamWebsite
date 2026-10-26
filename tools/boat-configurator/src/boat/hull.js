import * as THREE from 'three';
import { add, tube, ribbon, spaced, v3, lerp, clamp01 } from './kit.js';

// Hull lines and the shell: bottom plates, reverse chine, topsides with the knuckle and plate
// seams, lifting strakes, weld beads, rubbing strake, keel bar, gunwale capping, name decal.
// hullLines(model) returns the lines object every other part queries:
//   { L, B, halfBeam(t), keel(t), sheer(t), section(t), bottomZ(s, y), sideZ(s, y) }
// where section(t) gives hb (half-beam at the sheer), yk keel, yc/zc chine, yf/zf chine shelf
// edge, yn/zn knuckle, ys sheer, inner (inside of the capping) and dr deadrise at station t.
// The Harbour is a generic NZ plate-alloy trailer boat: deep vee, reverse chine, walkaround hardtop.

export const DECK_Y = 0.16;     // cockpit floor
export const CAP = 0.13;        // gunwale capping width
export const KEEL_BAR = 0.035;  // depth of the keel bar below the bottom plates

// ---------- hull lines ----------

export function hullLines(model) {
  const L = model.length;
  const B = model.beam;
  const k = L / 6.2;
  const halfBeam = (t) => (t < 0.5 ? (B / 2) * (0.97 + 0.06 * t) : (B / 2) * Math.pow(Math.max(0, 1 - ((t - 0.5) / 0.5) ** 2), 0.6));
  const keel = (t) => (t < 0.55 ? -0.3 : -0.3 + 0.78 * Math.pow((t - 0.55) / 0.45, 2.1));
  const sheer = (t) => 0.62 + 0.04 * k + 0.34 * Math.pow(t, 2.4);
  // About 20 degrees at the transom, sharpening to a fine entry at the bow.
  const deadrise = (t) => THREE.MathUtils.degToRad(20 + 24 * Math.pow(Math.max(0, (t - 0.3) / 0.7), 1.5));
  function section(t) {
    const hb = halfBeam(t);
    const yk = keel(t);
    const ys = sheer(t);
    const dr = deadrise(t);
    const fade = Math.min(1, hb / 0.5);
    // Reverse chine: a flat shelf, turned down a touch at its outer edge.
    const zf = hb - 0.03 * fade;
    const zc = Math.max(0, zf - 0.11 * fade);
    const yc = Math.min(yk + Math.tan(dr) * zc, ys - 0.22 * (1 - 0.6 * t));
    const yf = yc - 0.018 * fade;
    // Knuckle: the topsides plate breaks a little above halfway, upper panel flared out.
    const yn = lerp(yf, ys, 0.52);
    const zn = hb - 0.022 * fade;
    return { t, x: t * L, hb, yk, ys, dr, zc, yc, zf, yf, zn, yn, inner: Math.max(0, hb - CAP) };
  }
  // Half-width of the V bottom at height y, used for the cockpit floor and the waterline.
  const bottomZ = (s, y) => (y <= s.yk ? 0 : y >= s.yc ? s.zc : (s.zc * (y - s.yk)) / (s.yc - s.yk));
  // Half-width of the topsides at height y.
  const sideZ = (s, y) => (y <= s.yn ? lerp(s.zf, s.zn, clamp01((y - s.yf) / (s.yn - s.yf))) : lerp(s.zn, s.hb, clamp01((y - s.yn) / (s.ys - s.yn))));
  return { L, B, halfBeam, keel, sheer, section, bottomZ, sideZ };
}

// ---------- decal ----------

export function nameTexture(name, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colour;
  ctx.font = 'italic 600 118px Montserrat, "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  const [series, number] = name.split(' ');
  ctx.fillText(series.toUpperCase(), 20, 100);
  const w = ctx.measureText(series.toUpperCase()).width;
  ctx.font = 'italic 400 118px Montserrat, "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(number, 20 + w + 34, 100);
  ctx.fillRect(20, 168, 980, 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function nameDecal(group, lines, name, colour) {
  const texture = nameTexture(name, colour);
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
  const t0 = 0.48;
  const t1 = 0.69;
  for (const side of [1, -1]) {
    const position = [];
    const uv = [];
    const index = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const s = lines.section(lerp(t0, t1, i / n));
      for (const [j, f] of [0.14, 0.86].entries()) {
        // Upper topsides panel, between the knuckle and the rubbing strake, 4 mm proud of the paint.
        const y = lerp(s.yn, s.ys - 0.06, f);
        position.push(s.x, y, (lines.sideZ(s, y) + 0.004) * side);
        uv.push(side > 0 ? i / n : 1 - i / n, j);
      }
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      if (side > 0) index.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
      else index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    add(group, g, material, { cast: false });
  }
}

// ---------- shell ----------

// Builds the shell into group. Receives the lines and materials; returns nothing.
export function hullShell(group, lines, m) {
  const { L, section } = lines;
  const skin = spaced(0, 1, 80, (u) => Math.sin((u * Math.PI) / 2)).map(section);

  // Bottom plates, reverse-chine shelf, then the topsides in two panels either side of the knuckle.
  add(group, ribbon(skin.map((s) => ({ x: s.x, pts: [[0, s.yk], [s.zc * 0.5, lerp(s.yk, s.yc, 0.5)], [s.zc, s.yc]] }))), m.alloy);
  add(group, ribbon(skin.map((s) => ({ x: s.x, pts: [[s.zc, s.yc], [s.zf, s.yf]] }))), m.alloy);
  add(group, ribbon(skin.map((s) => ({ x: s.x, pts: [[s.zf, s.yf], [s.zn, s.yn]] }))), m.paint);
  add(group, ribbon(skin.map((s) => ({ x: s.x, pts: [[s.zn, s.yn], [s.hb, s.ys]] }))), m.paint);

  // Lifting strakes: flat underside, near-vertical outer face.
  for (const f of [0.38, 0.7]) {
    const strake = spaced(0, 0.86, 40).map(section).map((s) => {
      const taper = Math.min(1, (0.9 - s.t) / 0.14) * 0.045;
      const a = [s.zc * f, lerp(s.yk, s.yc, f)];
      const d = new THREE.Vector2(s.zc, s.yc - s.yk).normalize();
      const c = [a[0] + d.x * taper, a[1] + d.y * taper];
      const b = [c[0], a[1] - 0.002];
      return { x: s.x, pts: [a, b, b, c] };
    });
    add(group, ribbon(strake), m.alloy);
  }

  // Weld beads along the chine and the knuckle, keel bar and stem band.
  for (const side of [1, -1]) {
    const chine = spaced(0, 0.97, 40).map(section).map((s) => v3(s.x, s.yf, side * (s.zf + 0.002)));
    add(group, tube(chine, 0.007, 120, 5), m.alloy, { cast: false });
    const knuckle = spaced(0, 0.985, 40).map(section).map((s) => v3(s.x, s.yn, side * (s.zn + 0.001)));
    add(group, tube(knuckle, 0.005, 120, 5), m.paint, { cast: false });
    const strake = spaced(0, 0.99, 30).map(section).map((s) => v3(s.x, s.ys - 0.035, side * (s.hb + 0.02)));
    add(group, tube(strake, 0.032, 120), m.rubber);
  }
  // Vertical plate joins on the topsides, clear of the name decal.
  for (const t of [0.27, 0.44, 0.78]) {
    const s = section(t);
    const y1 = s.ys - 0.06;
    for (const side of [1, -1]) {
      const pts = [[s.zf, s.yf + 0.01], [s.zn, s.yn], [lines.sideZ(s, y1), y1]].map(([z, y]) => v3(s.x, y, side * (z + 0.0015)));
      add(group, tube(pts, 0.0045, 10, 5), m.paint, { cast: false });
    }
  }
  const keelLine = [...spaced(0, 1, 30).map((t) => v3(t * L, lines.keel(t) - KEEL_BAR / 2, 0)), v3(L + 0.01, lines.sheer(1) - 0.06, 0)];
  add(group, tube(keelLine, KEEL_BAR / 2 + 0.004, 96, 6), m.alloy);

  // Gunwale capping.
  const toBow = spaced(0, 0.985, 48, (u) => Math.sin((u * Math.PI) / 2)).map(section);
  add(group, ribbon(toBow.map((s) => ({ x: s.x, pts: [[s.hb, s.ys], [s.inner, s.ys]] }))), m.paint);
}
