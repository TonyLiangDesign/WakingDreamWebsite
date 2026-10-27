import * as THREE from 'three';
import { lit } from '../materials.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { add, tube, rod, box, crossSection, ribbon, loft, spaced, v3, lerp } from './kit.js';
import { DECK_Y, CAP, KEEL_BAR, topsideMaterial, plateAlloy } from './hull.js';

// Cockpit and transom: satin-painted inner liner with a rolled coaming edge and a cove at the
// floor, tuck-and-roll coaming bolsters over dark side pockets, raised non-slip floor panels in
// smooth margins with a flush underfloor hatch, flush rod holders, stern-quarter cleats and the
// fuel filler in the gunwales; the full-height transom with a hinged, latched door, the step
// inside it, an access hatch, scuppers and a gelcoat live-bait tank, all coved into the floor and
// liner; the welded pods (boarding platforms with non-slip tops either side of the engine pod,
// radiused corners, fillet welds to the transom), with scupper outlets, the bung, interceptor trim
// tabs, a transducer bracket and tie-down eyes; the fold-down ladder (stowed on the platform, down
// in the water) and boarding handle; the standard transom bait board, or the bait station option.
// Receives the lines, materials, build and whether the rig is twin.
// cockpit() returns the anchors later parts hang off:
//   { podTop, podHalf, zi, platY, bottomAt(z), aft }  (aft = x of the pods' aft faces)
// The pods' aft faces sit POD_BEVEL aft of `aft`, as they always have: the engine brackets bed
// into them and the underwater lights sit just proud of them.

export const POD = 0.5;         // boarding pods and engine pod, aft of the transom
const POD_BEVEL = 0.012;
const T = 0.1;                  // inner transom thickness
const NONSLIP_TILE = 0.168;     // metres per texture tile: 12 diamonds, a 14 mm pitch
const NONSLIP_CELLS = 12;
const STEP_RISE = 0.12;         // transom step, then the same again to the door sill (at least)
const X0 = 0.006;               // liner and floor start just forward of the transom skin
const PANEL_RISE = 0.0025;      // non-slip panels stand proud of the smooth margins

// ---------- part materials (cached; shared so disposeTree() leaves them alone) ----------

let cache = null;

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function canvasTexture(n, draw, srgb) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  draw(canvas.getContext('2d'), n);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Tangent-space normal map from a height field h(u, v) on the unit tile (it wraps).
function normalTexture(n, height, strength) {
  return canvasTexture(n, (ctx) => {
    const H = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = height((i + 0.5) / n, (j + 0.5) / n);
    const img = ctx.createImageData(n, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const dx = (H[j * n + ((i + 1) % n)] - H[j * n + ((i - 1 + n) % n)]) * strength;
        // Canvas rows run down the tile while v runs up it (the texture is flipped on upload).
        const dv = (H[((j - 1 + n) % n) * n + i] - H[((j + 1) % n) * n + i]) * strength;
        const l = Math.hypot(dx, dv, 1);
        const o = (j * n + i) * 4;
        img.data[o] = (-dx / l * 0.5 + 0.5) * 255;
        img.data[o + 1] = (-dv / l * 0.5 + 0.5) * 255;
        img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// Wrapping value noise on a g x g lattice, smoothly interpolated.
function valueNoise(g, seed) {
  const r = rng(seed);
  const lat = Array.from({ length: g * g }, r);
  const at = (i, j) => lat[(((j % g) + g) % g) * g + (((i % g) + g) % g)];
  const s = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = u * g;
    const y = v * g;
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = s(x - i);
    const fy = s(y - j);
    return lerp(lerp(at(i, j), at(i + 1, j), fx), lerp(at(i, j + 1), at(i + 1, j + 1), fx), fy);
  };
}

// Moulded diamond non-slip: flat-topped diamonds with steep sides, 14 mm apart.
function diamondHeight(u, v) {
  const fu = (u * NONSLIP_CELLS) % 1;
  const fv = (v * NONSLIP_CELLS) % 1;
  const d = Math.abs(fu - 0.5) + Math.abs(fv - 0.5);
  const t = Math.min(1, Math.max(0, (0.43 - d) / 0.13));
  return t * t * (3 - 2 * t);
}

function nonslipColour() {
  return canvasTexture(256, (ctx, n) => {
    const img = ctx.createImageData(n, n);
    const grime = valueNoise(8, 11);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const v = 1 - (j + 0.5) / n;
        // Diamond tops a little lighter (scuffed clean), the valleys a little darker.
        const h = diamondHeight(u, v);
        const g = 166 + 12 * h + 10 * (grime(u, v) - 0.5);
        const o = (j * n + i) * 4;
        img.data[o] = g;
        img.data[o + 1] = g + 3;
        img.data[o + 2] = g + 2;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, true);
}

// Fine orange peel for the painted liner and gelcoat: a soft, low ripple in the reflections.
function peelNormal() {
  const a = valueNoise(24, 3);
  const b = valueNoise(56, 5);
  return normalTexture(256, (u, v) => a(u, v) * 0.65 + b(u, v) * 0.35, 1.6);
}

// HDPE cutting board: off-white with faint knife scores and a soft stain or two.
function hdpeTexture() {
  return canvasTexture(512, (ctx, n) => {
    ctx.fillStyle = '#ebece7';
    ctx.fillRect(0, 0, n, n);
    const r = rng(17);
    for (let i = 0; i < 5; i++) {
      const x = r() * n;
      const y = r() * n;
      const rad = 40 + r() * 90;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, 'rgba(196,190,170,0.16)');
      grad.addColorStop(1, 'rgba(196,190,170,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    for (let i = 0; i < 900; i++) {
      const g = 150 + r() * 50;
      ctx.strokeStyle = `rgba(${g | 0},${g | 0},${(g - 4) | 0},${0.08 + r() * 0.2})`;
      ctx.lineWidth = 0.4 + r() * 0.9;
      const x = r() * n;
      const y = r() * n;
      const a = (r() - 0.5) * 1.2 + (r() < 0.5 ? 0 : Math.PI / 2);
      const len = 6 + r() * 50;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }
  }, true);
}

function parts() {
  if (cache) return cache;
  const side = THREE.DoubleSide;
  const peel = peelNormal();
  peel.repeat.set(10, 10);
  const diamonds = normalTexture(256, diamondHeight, 1.6);
  const tile = 1 / NONSLIP_TILE;
  diamonds.repeat.set(tile, tile);
  const colour = nonslipColour();
  colour.repeat.set(tile, tile);
  cache = {
    // Painted liner: a soft warm white with a satin sheen and a little orange peel.
    liner: lit({
      color: '#d3d5d0', roughness: 0.6, clearcoat: 0.35, clearcoatRoughness: 0.32,
      normalMap: peel, normalScale: new THREE.Vector2(0.05, 0.05), side,
    }),
    // Gelcoat mouldings (bait tank, step, hatch lids): whiter and glossier than the paint.
    gelcoat: lit({
      color: '#e7e8e3', roughness: 0.26, clearcoat: 0.9, clearcoatRoughness: 0.1,
      normalMap: peel, normalScale: new THREE.Vector2(0.05, 0.05), side,
    }),
    shade: lit({ color: '#6c706e', roughness: 0.8, side }),
    pocket: lit({ color: '#363a39', roughness: 0.92, side }),
    nonslip: lit({
      color: '#ffffff', map: colour, normalMap: diamonds, normalScale: new THREE.Vector2(1, 1), roughness: 0.9, side,
    }),
    // Marine vinyl over foam: a soft sheen that shows the rolls.
    bolster: lit({
      color: '#3a3f44', roughness: 0.46, clearcoat: 0.25, clearcoatRoughness: 0.45,
      sheen: 0.6, sheenRoughness: 0.55, sheenColor: new THREE.Color('#8f979e'),
    }),
    hdpe: lit({ color: '#ffffff', map: hdpeTexture(), roughness: 0.66 }),
    groove: lit({ color: '#c2c4be', roughness: 0.85 }),
    // Satin-polished stainless for the frames, ladder and small fittings: a broad highlight that
    // reads as steel against the dark studio, where mirror polish only reflects black.
    satin: lit({ color: '#e4e7e9', metalness: 1, roughness: 0.42 }),
    tint: lit({ color: '#1c2a33', roughness: 0.08, metalness: 0.3 }),
    basin: lit({ color: '#8d9295', metalness: 1, roughness: 0.32 }),
  };
  for (const mat of Object.values(cache)) mat.userData.shared = true;
  return cache;
}

// The cockpit's non-slip, for other parts that want their decks to match.
export const nonslipMaterial = () => parts().nonslip;

// ---------- geometry helpers ----------

function rbox(group, material, [sx, sy, sz], [x, y, z], r = 0.01, opts) {
  const radius = Math.min(r, Math.min(sx, sy, sz) / 2 - 1e-4);
  // Small radii read the same as a chamfer: one segment keeps the triangle count down.
  const mesh = add(group, new RoundedBoxGeometry(sx, sy, sz, radius > 0.01 ? 2 : 1, radius), material, opts);
  mesh.position.set(x, y, z);
  return mesh;
}

// Flat horizontal face at height y from an outline of [x, z] points, with optional holes.
// UVs are in metres, so the non-slip keeps its scale on every face.
function flat(outline, holes, y) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// Rounded rectangle outline, [x, z] points.
function rrect(cx, cz, lx, lz, r, seg = 4) {
  const pts = [];
  const ox = lx / 2 - r;
  const oz = lz / 2 - r;
  for (const [sx, sz, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]]) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + sx * ox + r * Math.cos(a), cz + sz * oz + r * Math.sin(a)]);
    }
  }
  return pts;
}

// Symmetric panel between xa and xb whose sides follow halfWidth(x), with rounded corners.
function panel(xa, xb, halfWidth, r, n = 24) {
  const pts = [];
  const arc = (cx, cz, a0, a1) => {
    for (let i = 0; i <= 4; i++) {
      const a = lerp(a0, a1, i / 4);
      pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  };
  const za = halfWidth(xa + r) - r;
  const zb = halfWidth(xb - r) - r;
  arc(xa + r, za, Math.PI, Math.PI / 2);
  for (const x of spaced(xa + r, xb - r, n).slice(1, -1)) pts.push([x, halfWidth(x)]);
  arc(xb - r, zb, Math.PI / 2, 0);
  arc(xb - r, -zb, 0, -Math.PI / 2);
  for (const x of spaced(xb - r, xa + r, n).slice(1, -1)) pts.push([x, -halfWidth(x)]);
  arc(xa + r, -za, -Math.PI / 2, -Math.PI);
  return pts;
}

// Closed [x, z] outline moved d inwards (mitred); fine for the smooth, convex panel outlines.
function insetOutline(pts, d) {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1];
  const s = Math.sign(area);
  const unit = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  return pts.map((p, i) => {
    const e1 = unit(pts[(i - 1 + n) % n], p);
    const e2 = unit(p, pts[(i + 1) % n]);
    const n1 = [-e1[1] * s, e1[0] * s];
    const n2 = [-e2[1] * s, e2[0] * s];
    const k = d / Math.max(0.3, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
  });
}

// Raised non-slip panel: a smooth chamfered rim from the outline at y up to the patterned top,
// so each panel edge catches the light like a moulded one. Holes get a plain vertical lip.
function raisedPanel(group, k, outline, holes, y, rim = 0.005) {
  const top = insetOutline(outline, rim);
  const yt = y + PANEL_RISE;
  add(group, flat(top, holes, yt), k.nonslip, { cast: false });
  const strip = (lo, hi, ylo, yhi) => {
    const pos = [];
    const n = lo.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = [lo[i][0], ylo, lo[i][1]];
      const b = [lo[j][0], ylo, lo[j][1]];
      const c = [hi[j][0], yhi, hi[j][1]];
      const d = [hi[i][0], yhi, hi[i][1]];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return planarUV(g);
  };
  add(group, strip(outline, top, y, yt), k.liner, { cast: false });
  for (const h of holes) add(group, strip(h, h, y, yt), k.liner, { cast: false });
}

// Straight prism along x through a [z, y] profile, from xa (aft) to xb, open at xb (it beds into
// the hull there). The aft edges are chamfered by bevel inside the profile, so the side faces
// carry the hull's own surfaces aft without a step. Returns [main, alt]: the faces of edges for
// which alt(a, b) holds (and their chamfers) go in the second geometry.
function prism(profile, xa, xb, bevel, alt = () => false) {
  let p = profile.map(([z, y]) => new THREE.Vector2(z, y));
  if (THREE.ShapeUtils.isClockWise(p)) p = p.reverse();
  const n = p.length;
  const inset = p.map((q, i) => {
    const e1 = q.clone().sub(p[(i - 1 + n) % n]).normalize();
    const e2 = p[(i + 1) % n].clone().sub(q).normalize();
    const n1 = new THREE.Vector2(-e1.y, e1.x);
    const n2 = new THREE.Vector2(-e2.y, e2.x);
    const d = bevel / (1 + n1.dot(n2));
    return q.clone().addScaledVector(n1.add(n2), d);
  });
  const main = [];
  const other = [];
  const at = (q, x) => [x, q.y, q.x];
  const quad = (pos, a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pos = alt(p[i], p[j]) ? other : main;
    quad(pos, at(p[i], xb), at(p[j], xb), at(p[j], xa + bevel), at(p[i], xa + bevel));
    quad(pos, at(p[i], xa + bevel), at(p[j], xa + bevel), at(inset[j], xa), at(inset[i], xa));
  }
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(inset, [])) main.push(...at(inset[a], xa), ...at(inset[c], xa), ...at(inset[b], xa));
  return [main, other].map((pos) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  });
}

// Rounds the corners of a closed [z, y] polygon: corner i becomes a quadratic blend from d back
// along the incoming edge to d along the outgoing one (d = rounds[i]; 0 or missing stays sharp).
// tag(i, k) marks output points (k = 0..4 along a rounded corner, -1 for a sharp one).
function roundCorners(pts, rounds, tag) {
  const out = [];
  const tags = [];
  const n = pts.length;
  pts.forEach((p, i) => {
    const d = rounds[i] || 0;
    if (!d) { out.push(p); tags.push(tag(i, -1)); return; }
    const toward = (q) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]); return [p[0] + ((q[0] - p[0]) * d) / l, p[1] + ((q[1] - p[1]) * d) / l]; };
    const s = toward(pts[(i - 1 + n) % n]);
    const e = toward(pts[(i + 1) % n]);
    for (let k = 0; k <= 4; k++) {
      const t = k / 4;
      const a = (1 - t) ** 2;
      const b = 2 * t * (1 - t);
      const c = t * t;
      out.push([a * s[0] + b * p[0] + c * e[0], a * s[1] + b * p[1] + c * e[1]]);
      tags.push(tag(i, k));
    }
  });
  return { pts: out, tags };
}

// Planar UVs in metres from x and z, for non-slip on ribbons.
function planarUV(g) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i);
    uv[i * 2 + 1] = -p.getZ(i);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// Plate texture coordinates scaled like the hull's (hull.js plateUV): the mill-finish streaks run
// fore and aft on sides and bottoms, and across the aft faces, so bare-alloy pods, transom and
// cappings match the topsides instead of sampling one texel. Harmless on painted builds.
function plateUV(mesh) {
  const g = mesh.geometry;
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position;
  const nr = g.attributes.normal;
  const o = mesh.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + o.x;
    const y = p.getY(i) + o.y;
    const z = p.getZ(i) + o.z;
    const ax = Math.abs(nr.getX(i));
    const ay = Math.abs(nr.getY(i));
    const az = Math.abs(nr.getZ(i));
    const [u, v] = ax > Math.max(ay, az) ? [z, y] : ay > az ? [x, z] : [x, y];
    uv[i * 2] = u * 0.12 + 0.31;
    uv[i * 2 + 1] = v * 0.7 + 0.17;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return mesh;
}

// Concave cove of radius r along a -> b in the corner between two faces whose normals u and v
// point into the open space: moulded corners catch the light and give the AO an edge to find.
function cove(group, material, a, b, u, v, r = 0.022, seg = 4) {
  const pos = [];
  const nrm = [];
  const uv = [];
  const len = a.distanceTo(b);
  [a, b].forEach((end, e) => {
    const c = end.clone().addScaledVector(u, r).addScaledVector(v, r);
    for (let k = 0; k <= seg; k++) {
      const t = (k / seg) * (Math.PI / 2);
      const dir = u.clone().multiplyScalar(Math.cos(t)).addScaledVector(v, Math.sin(t));
      const p = c.clone().addScaledVector(dir, -r);
      pos.push(p.x, p.y, p.z);
      nrm.push(dir.x, dir.y, dir.z);
      uv.push(e * len * 2, (k / seg) * r * 2);
    }
  });
  // Wind the faces to agree with the normals, or a double-sided material flips them indoors.
  const along = b.clone().sub(a);
  const arc = u.clone().sub(v);
  const flip = along.clone().cross(arc).dot(u.clone().add(v)) < 0;
  const idx = [];
  for (let k = 0; k < seg; k++) {
    const q = [k, k + seg + 1, k + 1, k + 1, k + seg + 1, k + seg + 2];
    idx.push(...(flip ? [q[0], q[2], q[1], q[3], q[5], q[4]] : q));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  add(group, g, material, { cast: false });
}

// Fillet weld in the corner between a pod surface and the transom skin (x = 0, facing aft),
// along an open polyline of [z, y] points on the surface running to starboard over the top. The
// bead's section bulges past the chord, as a laid fillet does.
function weldFillet(group, material, line, a = 0.009) {
  const pos = [];
  const P = 5;
  line.forEach(([z, y], i) => {
    const pa = line[Math.max(0, i - 1)];
    const pb = line[Math.min(line.length - 1, i + 1)];
    const l = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) || 1;
    const nz = -(pb[1] - pa[1]) / l;
    const ny = (pb[0] - pa[0]) / l;
    for (let k = 0; k < P; k++) {
      const t = k / (P - 1);
      const xx = (1 - t) ** 2 * -a + 2 * t * (1 - t) * (-0.74 * a);
      const nn = 2 * t * (1 - t) * (0.74 * a) + t * t * a;
      pos.push(xx, y + ny * nn, z + nz * nn);
    }
  });
  const idx = [];
  for (let i = 0; i < line.length - 1; i++) {
    for (let k = 0; k < P - 1; k++) {
      const q = i * P + k;
      idx.push(q, q + P, q + 1, q + 1, q + P, q + P + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  plateUV(add(group, g, material, { cast: false }));
}

// Rod holder tube from base along dir, with a rolled lip and a dark open end.
function holder(group, m, base, dir, len, r, metal = m.stainless) {
  const top = base.clone().addScaledVector(dir, len);
  rod(group, base, top, r, metal, 12);
  const lip = add(group, new THREE.TorusGeometry(r - 0.002, 0.003, 5, 14), metal, { cast: false });
  lip.position.copy(top);
  lip.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
  const hole = add(group, new THREE.CircleGeometry(r - 0.004, 14), m.rubber, { cast: false });
  hole.position.copy(top).addScaledVector(dir, 0.0015);
  hole.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
}

// Stainless base plate under a tube foot, standing on a flat top at y.
function footPlate(group, metal, x, y, z, r = 0.026) {
  const plate = add(group, new THREE.CylinderGeometry(r, r + 0.003, 0.006, 16), metal);
  plate.position.set(x, y + 0.003, z);
}

// Hinged access hatch on a vertical face at x facing forward (+x): a gelcoat lid standing proud
// of a dark gap, two barrel hinges along the top and a flush cam latch at the foot.
function hatch(group, k, m, x, yc, zc, w, h) {
  rbox(group, m.rubber, [0.004, h + 0.012, w + 0.012], [x + 0.002, yc, zc], 0.009, { cast: false });
  rbox(group, k.gelcoat, [0.014, h, w], [x + 0.007, yc, zc], 0.008);
  for (const dz of [-0.32 * w, 0.32 * w]) {
    const hinge = add(group, new THREE.CylinderGeometry(0.006, 0.006, 0.05, 10), k.satin);
    hinge.position.set(x + 0.012, yc + h / 2 + 0.002, zc + dz);
    hinge.rotation.x = Math.PI / 2;
  }
  const cam = add(group, new THREE.CylinderGeometry(0.017, 0.017, 0.004, 18), k.satin, { cast: false });
  cam.position.set(x + 0.0155, yc - h / 2 + 0.045, zc);
  cam.rotation.z = Math.PI / 2;
  box(group, m.rubber, [0.002, 0.004, 0.022], [x + 0.0175, yc - h / 2 + 0.045, zc], { cast: false });
}

// Stainless U-bolt eye on the transom skin (x = 0, facing aft) at height y, z.
function eye(group, metal, y, z) {
  rbox(group, metal, [0.006, 0.032, 0.075], [-0.003, y, z], 0.0025);
  const loop = add(group, new THREE.TorusGeometry(0.021, 0.0065, 6, 12, Math.PI), metal);
  loop.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(0, 0, 1), v3(-1, 0, 0), v3(0, -1, 0)));
  loop.position.set(-0.005, y, z);
}

// ---------- cockpit ----------

export function cockpit(group, lines, m, build, twin) {
  const k = parts();
  const { L, section } = lines;
  const ht = build.layout === 'ht';
  const S = (x) => section(x / L);
  const fore = ht ? 0.78 : 0.8;
  const xEnd = (fore + 0.02) * L;
  const s0 = section(0);
  const X = v3(1, 0, 0);
  const Y = v3(0, 1, 0);
  const Z = v3(0, 0, 1);
  const NZ = v3(0, 0, -1);

  // Liner: rolled edge tucked under the capping's inner lip, a flat face, and a cove into the
  // floor. Wherever the plating comes inside the liner face (forward, where the vee rises), the
  // foot steps in to stay 30 mm inside the hull; the floor edge is clipped the same way.
  const face = (s) => s.inner - 0.01;
  const insideAt = (s, z) => {
    // Lowest height at which the outside of the hull is at least 30 mm outboard of z.
    let lo = s.yk;
    let hi = s.ys;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (lines.halfWidth(s, mid) >= z + 0.03) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  const foot = (s) => {
    const f = face(s);
    const edge = Math.min(f - 0.035, lines.halfWidth(s, DECK_Y - 0.03) - 0.005);
    const yLow = Math.max(DECK_Y + 0.035, insideAt(s, f));
    return { edge, yLow, cove: [[f, yLow], [f, yLow], [lerp(f, edge, 0.29), lerp(yLow, DECK_Y, 0.71)], [edge, DECK_Y]] };
  };
  const roll = (s) => [[s.inner - 0.0035, s.ys - 0.012], [s.inner - 0.006, s.ys - 0.02], [face(s), s.ys - 0.03], [face(s), s.ys - 0.03]];

  // Coaming bolsters run aft from the hardtop or the console; the side pockets sit under them.
  const bolsterEnd = ht ? 0.38 * L - 0.05 : 0.5 * L;
  const xp0 = 0.55;
  const xp1 = Math.min(xp0 + 1.5, bolsterEnd - 0.25);
  const xs = [...new Set([...spaced(X0, xEnd, 44), xp0, xp1].map((x) => +x.toFixed(4)))].sort((a, b) => a - b).map(S);
  const range = (a, b) => xs.filter((s) => s.x >= a - 1e-4 && s.x <= b + 1e-4);
  // Pocket opening just under the bolsters, kept clear of the floor on a shallow cockpit.
  const yP1 = s0.ys - 0.23;
  const yP0 = Math.max(DECK_Y + 0.1, yP1 - 0.17);
  for (const [a, b] of [[0, xp0], [xp1, xEnd]]) add(group, ribbon(range(a, b).map((s) => ({ x: s.x, pts: [...roll(s), ...foot(s).cove] }))), k.liner);
  const pocket = range(xp0, xp1);
  add(group, ribbon(pocket.map((s) => ({ x: s.x, pts: [...roll(s), [face(s), yP1 + 0.012]] }))), k.liner);
  add(group, ribbon(pocket.map((s) => ({ x: s.x, pts: [[face(s), yP0 - 0.012], ...foot(s).cove] }))), k.liner);

  // Side pockets: rounded lips, then a real recess back to just inside the topsides. The sill
  // takes some light; the back and the underside of the top lip stay dark, so they read deep.
  const back = (s) => lines.sideZ(s, yP0) - 0.014;
  add(group, ribbon(pocket.map((s) => ({ x: s.x, pts: [[face(s), yP0 - 0.012], [face(s) + 0.006, yP0 - 0.003], [face(s) + 0.014, yP0]] }))), k.liner);
  add(group, ribbon(pocket.map((s) => ({ x: s.x, pts: [[face(s) + 0.014, yP1], [face(s) + 0.006, yP1 + 0.003], [face(s), yP1 + 0.012]] }))), k.liner);
  add(group, ribbon(pocket.map((s) => ({ x: s.x, pts: [[face(s) + 0.014, yP0], [lerp(face(s), back(s), 0.6), yP0], [back(s) - 0.012, yP0], [back(s), yP0 + 0.012]] }))), k.shade);
  add(group, ribbon(pocket.map((s) => ({ x: s.x, pts: [[back(s), yP0 + 0.012], [back(s), yP1 - 0.012], [back(s) - 0.012, yP1], [face(s) + 0.014, yP1]] }))), k.pocket);
  for (const s of [pocket[0], pocket[pocket.length - 1]]) {
    const f = face(s);
    const end = [[f, yP0 - 0.012], [f + 0.014, yP0], [back(s) - 0.012, yP0], [back(s), yP0 + 0.012], [back(s), yP1 - 0.012], [back(s) - 0.012, yP1], [f + 0.014, yP1], [f, yP1 + 0.012]];
    for (const side of [1, -1]) add(group, crossSection(end.map(([z, y]) => [z * side, y]), s.x), k.pocket, { cast: false });
  }

  // Coaming bolsters: padded vinyl in sections, on the liner face above the pockets.
  for (const side of [1, -1]) {
    const x0 = side > 0 ? T + 0.39 : T + 0.03;  // starboard clears the live-bait tank
    const count = Math.ceil((bolsterEnd - x0) / 0.85);
    const len = (bolsterEnd - x0) / count;
    for (let i = 0; i < count; i++) bolster(group, k.bolster, x0 + i * len + 0.006, x0 + (i + 1) * len - 0.006, side, S, face);
  }

  // Floor: smooth liner margins round raised non-slip panels, a flush underfloor hatch in the
  // aft panel.
  const xsFloor = spaced(X0, xEnd, 48).map(S);
  const outer = [...xsFloor.map((s) => [s.x, foot(s).edge]), ...xsFloor.slice().reverse().map((s) => [s.x, -foot(s).edge])];
  const panelOutline = panel(T + 0.05, (ht ? xEnd : fore * L) - 0.06, (x) => foot(S(x)).edge - 0.05, 0.06, 40);
  const hx = 0.98;
  const hatchOuter = rrect(hx, 0, 0.58, 0.7, 0.05);
  const hatchLid = rrect(hx, 0, 0.564, 0.684, 0.042);
  const lidPanel = rrect(hx, 0, 0.5, 0.62, 0.03);
  add(group, flat(outer, [panelOutline], DECK_Y), k.liner, { cast: false });
  raisedPanel(group, k, panelOutline, [hatchOuter], DECK_Y);
  add(group, flat(hatchOuter, [hatchLid], DECK_Y), m.rubber, { cast: false });
  add(group, flat(hatchLid, [lidPanel], DECK_Y), k.liner, { cast: false });
  raisedPanel(group, k, lidPanel, [], DECK_Y, 0.004);
  // Flush lift ring in a cup at the forward edge of the lid.
  const cup = add(group, new THREE.CircleGeometry(0.03, 18), m.rubber, { cast: false });
  cup.position.set(hx + 0.255, DECK_Y + 0.0015, 0);
  cup.rotation.x = -Math.PI / 2;
  const liftRing = add(group, new THREE.TorusGeometry(0.031, 0.004, 5, 20), m.stainless, { cast: false });
  liftRing.position.set(hx + 0.255, DECK_Y + 0.002, 0);
  liftRing.rotation.x = Math.PI / 2;

  // Foredeck and, on the centre console, the bulkhead under its forward edge, coved into the floor.
  const foredeck = spaced(fore, 0.992, 16).map(section);
  add(group, planarUV(ribbon(foredeck.map((s) => ({ x: s.x, pts: [[0, s.ys - 0.05], [Math.max(0, s.hb - CAP * 0.5), s.ys - 0.05]] })))), k.nonslip);
  const bulk = section(fore);
  if (!ht) {
    // Bulkhead face following the liner's own section, so it never reaches past the plating.
    const half = [[face(bulk), bulk.ys - 0.05], ...foot(bulk).cove.filter((_, i) => i !== 1)];
    add(group, crossSection([...half, ...half.slice().reverse().map(([z, y]) => [-z, y])], bulk.x), k.liner);
    const e = foot(bulk).edge - 0.02;
    cove(group, k.liner, v3(bulk.x, DECK_Y, -e), v3(bulk.x, DECK_Y, e), Y, v3(-1, 0, 0), 0.02);
  }

  // Gunwales: flush rod holders, stern-quarter cleats, fuel filler to starboard.
  const flangeShape = [[0.021, 0], [0.036, 0], [0.038, 0.0015], [0.034, 0.0042], [0.024, 0.0042], [0.021, 0.001]].map(([r, y]) => new THREE.Vector2(r, y));
  for (const side of [1, -1]) {
    for (const x of [0.32, 0.74, 1.16]) {
      const s = S(x);
      const flange = add(group, new THREE.LatheGeometry(flangeShape, 20), m.stainless, { cast: false });
      flange.position.set(s.x, s.ys + 0.0005, side * (s.hb - CAP / 2));
      const insert = add(group, new THREE.CircleGeometry(0.0215, 18), m.rubber, { cast: false });
      insert.position.set(s.x, s.ys + 0.0025, side * (s.hb - CAP / 2));
      insert.rotation.x = -Math.PI / 2;
    }
    cleat(group, m, S(0.19), side);
  }
  const fs = S(1.45);
  const filler = add(group, new THREE.CylinderGeometry(0.043, 0.045, 0.007, 24), m.stainless);
  filler.position.set(fs.x, fs.ys + 0.0035, fs.hb - CAP / 2);
  const fillerCap = add(group, new THREE.CylinderGeometry(0.031, 0.033, 0.006, 24), m.stainless);
  fillerCap.position.set(fs.x, fs.ys + 0.009, fs.hb - CAP / 2);
  box(group, m.rubber, [0.034, 0.002, 0.006], [fs.x, fs.ys + 0.0125, fs.hb - CAP / 2], { cast: false });

  // ---------- transom ----------

  // Hull-coloured parts take the topside material (the paint, or mill-finish plate on bare-alloy
  // builds) with plate UVs like the hull's; bottoms take the hull's bottom plate.
  const topside = topsideMaterial(m);
  const plate = plateAlloy();
  const podHalf = twin ? 0.66 : 0.4;
  // Engine mounting surface at 25" (XL) shaft height: 635 mm above the keel plus the 30 mm the
  // anti-ventilation plate sits above the bottom at the transom.
  const podTop = lines.keel(0) + 0.03 + 0.635;
  const platY = s0.yc + 0.2;
  const zi = podHalf + 0.05;
  const bottomAt = (z) => lerp(s0.yk, s0.yc, z / s0.zc);
  const aftFace = -POD - POD_BEVEL;
  const tw = s0.inner;
  const ys = s0.ys;

  // Door to the port boarding platform: open-topped, hinged on its outboard edge, latched inboard.
  // It clears the engine pod, so on twins it is narrower. The sill stands two equal rises above
  // the floor and never below the platform outside; a step inside takes the first rise.
  const dOut = tw - 0.05;
  const dIn = Math.max(podHalf + 0.02, dOut - 0.44);
  const ySill = Math.max(DECK_Y + 2 * STEP_RISE, platY + 0.03);
  const stepTop = (DECK_Y + ySill) / 2;

  // Outer transom skin, notched for the doorway.
  const outline = [[s0.hb, ys], [s0.zn, s0.yn], [s0.zp, s0.yp], [s0.zf, s0.yf], [s0.zc, s0.yc], [0, s0.yk]];
  const skin = [...outline, ...outline.slice(0, -1).reverse().map(([z, y]) => [-z, y]), [-dOut, ys], [-dOut, ySill], [-dIn, ySill], [-dIn, ys]];
  plateUV(add(group, crossSection(skin, 0), topside));

  // Inner transom either side of and below the doorway, bedded into the liner at its ends.
  // Its aft face stands just forward of the skin, clear of it.
  const deep = tw + 0.03;
  const tIn = T - 0.004;
  const txc = T - tIn / 2;
  box(group, k.liner, [tIn, ys - DECK_Y + 0.01, deep - dOut], [txc, (ys + DECK_Y - 0.01) / 2, -(deep + dOut) / 2]);
  box(group, k.liner, [tIn, ySill - DECK_Y + 0.01, dOut - dIn], [txc, (ySill + DECK_Y - 0.01) / 2, -(dOut + dIn) / 2]);
  box(group, k.liner, [tIn, ys - DECK_Y + 0.01, deep + dIn], [txc, (ys + DECK_Y - 0.01) / 2, (deep - dIn) / 2]);
  // Capping across the transom top in the hull colour, broken at the door; alloy sill plate.
  const capY = ys - 0.004;
  plateUV(rbox(group, topside, [T + 0.03, 0.017, s0.hb - 0.004 - dOut], [T / 2, capY, -(s0.hb - 0.004 + dOut) / 2], 0.006));
  plateUV(rbox(group, topside, [T + 0.03, 0.017, s0.hb - 0.004 + dIn], [T / 2, capY, (s0.hb - 0.004 - dIn) / 2], 0.006));
  box(group, m.alloy, [T + 0.02, 0.008, dOut - dIn], [T / 2, ySill - 0.002, -(dOut + dIn) / 2]);

  // The door: a moulded panel with its own capping, rubber seals in the gaps, two barrel hinges.
  const dz0 = -dOut + 0.006;
  const dz1 = -dIn - 0.006;
  const dzc = (dz0 + dz1) / 2;
  rbox(group, k.gelcoat, [0.045, ys - 0.012 - ySill - 0.006, dz1 - dz0], [T - 0.0225, (ys - 0.012 + ySill + 0.006) / 2, dzc], 0.008);
  plateUV(rbox(group, topside, [T + 0.03, 0.017, dz1 - dz0], [T / 2, capY, dzc], 0.006));
  for (const z of [-dOut + 0.003, -dIn - 0.003]) box(group, m.rubber, [0.05, ys - 0.012 - ySill, 0.005], [T - 0.025, (ys - 0.012 + ySill) / 2, z], { cast: false });
  for (const y of [ySill + 0.07, ys - 0.09]) {
    const barrel = add(group, new THREE.CylinderGeometry(0.009, 0.009, 0.06, 12), m.stainless);
    barrel.position.set(T + 0.009, y, -dOut + 0.003);
    box(group, m.stainless, [0.004, 0.05, 0.045], [T + 0.002, y, -dOut + 0.03]);
    box(group, m.stainless, [0.004, 0.05, 0.03], [T + 0.002, y, -dOut - 0.018]);
  }
  // Lift latch on the inboard edge, keeper on the transom.
  const ly = ys - 0.075;
  rbox(group, m.stainless, [0.006, 0.06, 0.03], [T + 0.003, ly, dz1 - 0.035], 0.003);
  rbox(group, m.stainless, [0.014, 0.016, 0.075], [T + 0.012, ly + 0.012, dz1 - 0.02], 0.006);
  rbox(group, m.stainless, [0.012, 0.03, 0.022], [T + 0.006, ly + 0.012, -dIn + 0.016], 0.004);

  // Transom step inside the door, a gelcoat moulding with a non-slip tread, coved all round.
  const stepFwd = T + 0.26;
  const stepZ0 = -(tw + 0.01);
  const stepZ1 = -(dIn - 0.035);
  rbox(group, k.gelcoat, [stepFwd - T + 0.02, stepTop - DECK_Y + 0.01, stepZ1 - stepZ0], [(stepFwd + T - 0.02) / 2, (stepTop + DECK_Y - 0.01) / 2, (stepZ0 + stepZ1) / 2], 0.014);
  raisedPanel(group, k, rrect((T + stepFwd) / 2 + 0.005, (stepZ0 + 0.03 + stepZ1) / 2 - 0.005, stepFwd - T - 0.05, stepZ1 - stepZ0 - 0.07, 0.02), [], stepTop, 0.004);
  const fStep = foot(S(stepFwd));
  cove(group, k.liner, v3(stepFwd, DECK_Y, -fStep.edge), v3(stepFwd, DECK_Y, stepZ1 - 0.014), Y, X);
  cove(group, k.liner, v3(T, DECK_Y, stepZ1), v3(stepFwd - 0.014, DECK_Y, stepZ1), Y, Z);
  cove(group, k.liner, v3(T, DECK_Y, stepZ1), v3(T, stepTop - 0.012, stepZ1), X, Z);
  cove(group, k.liner, v3(stepFwd, fStep.yLow, -face(S(stepFwd))), v3(stepFwd, stepTop - 0.012, -face(S(stepFwd))), X, Z);

  // Scuppers at the foot of the transom, stainless grilles over dark outlets.
  for (const z of [-0.28, 0.28]) {
    rbox(group, m.stainless, [0.006, 0.062, 0.16], [T + 0.003, DECK_Y + 0.036, z], 0.003);
    box(group, m.rubber, [0.004, 0.034, 0.124], [T + 0.006, DECK_Y + 0.036, z], { cast: false });
    for (const dz of [-0.04, 0, 0.04]) box(group, m.stainless, [0.004, 0.036, 0.006], [T + 0.008, DECK_Y + 0.036, z + dz], { cast: false });
  }

  // Live-bait tank in the starboard transom corner: a gelcoat moulding with a lid with a tinted
  // window, hinge and latch, coved into the floor, transom and liner.
  const tz0 = tw - 0.5;
  const tankTop = ys - 0.05;
  const tankFwd = T + 0.36;
  rbox(group, k.gelcoat, [tankFwd - T + 0.03, tankTop - DECK_Y + 0.01, tw + 0.02 - tz0], [(tankFwd + T - 0.03) / 2, (tankTop + DECK_Y - 0.01) / 2, (tz0 + tw + 0.02) / 2], 0.015);
  const lidZ = (tz0 + face(s0)) / 2;
  const lidW = face(s0) - tz0 - 0.08;
  const lidX = (T + tankFwd) / 2 + 0.01;
  rbox(group, m.rubber, [0.3, 0.006, lidW + 0.012], [lidX, tankTop + 0.003, lidZ], 0.003, { cast: false });
  rbox(group, k.gelcoat, [0.288, 0.016, lidW], [lidX, tankTop + 0.012, lidZ], 0.006);
  rbox(group, k.tint, [0.15, 0.003, lidW - 0.14], [lidX, tankTop + 0.0205, lidZ], 0.012, { cast: false });
  rod(group, v3(T + 0.022, tankTop + 0.012, lidZ - lidW / 2 + 0.04), v3(T + 0.022, tankTop + 0.012, lidZ + lidW / 2 - 0.04), 0.006, m.stainless, 8);
  rbox(group, m.stainless, [0.02, 0.022, 0.05], [tankFwd + 0.006, tankTop + 0.008, lidZ], 0.005);
  const fTank = foot(S(tankFwd));
  cove(group, k.liner, v3(tankFwd, DECK_Y, tz0 + 0.015), v3(tankFwd, DECK_Y, fTank.edge), Y, X);
  cove(group, k.liner, v3(T, DECK_Y, tz0), v3(tankFwd - 0.015, DECK_Y, tz0), Y, NZ);
  cove(group, k.liner, v3(T, DECK_Y, tz0), v3(T, tankTop - 0.012, tz0), X, NZ);
  cove(group, k.liner, v3(tankFwd, fTank.yLow, face(S(tankFwd))), v3(tankFwd, tankTop - 0.012, face(S(tankFwd))), X, NZ);

  // Coves where the floor meets the inner transom (broken at the scuppers) and up the corners
  // where the transom meets the liner above the step (the tank fills the starboard corner).
  for (const [za, zb] of [[stepZ1, -0.36], [-0.2, 0.2], [0.36, tz0]]) cove(group, k.liner, v3(T, DECK_Y, za), v3(T, DECK_Y, zb), Y, X);
  cove(group, k.liner, v3(T, stepTop + 0.02, -face(s0)), v3(T, ys - 0.034, -face(s0)), X, Z, 0.01);

  // Access hatch to the transom well (batteries, bilge pump) between the scuppers.
  hatch(group, k, m, T, DECK_Y + 0.1 + 0.14, 0, 0.32, 0.28);

  // Default bait board on the transom; the bait station option replaces it.
  if (!build.options.includes('bait')) baitBoard(group, k, m, s0);

  // ---------- pods ----------

  // Welded pods: the hull's chine and vee carried aft, boarding platforms either side of the engine
  // pod, all one plate structure with chamfered aft edges, radiused corners and fillet welds to
  // the transom. The engine pod stands up from the platforms, or sits down in a well between
  // them, to the engine mounting height; when the two all but coincide the top is one flat deck.
  const zO = lines.sideZ(s0, platY);
  const stands = Math.abs(podTop - platY) > 0.015;
  const enginePod = stands ? [[-podHalf, platY], [-podHalf, podTop], [podHalf, podTop], [podHalf, platY]] : [];
  const raw = [[zO, platY], [s0.zp, s0.yp], [s0.zf, s0.yf], [s0.zc, s0.yc], [0, s0.yk], [-s0.zc, s0.yc], [-s0.zf, s0.yf], [-s0.zp, s0.yp], [-zO, platY], ...enginePod];
  // Radii: the platforms' outer edges, the engine pod's top edges and the coves at its foot
  // (a pod in a well swaps which corners are convex, so the radii follow the rise).
  const up = podTop > platY;
  const rounds = { 0: 0.015, 8: 0.015 };
  if (stands) Object.assign(rounds, { 9: up ? 0.03 : 0.025, 10: up ? 0.025 : 0.03, 11: up ? 0.025 : 0.03, 12: up ? 0.03 : 0.025 });
  // The fillet weld runs over the tops: everything after the port platform's outer corner, and the
  // ends of those corners that lie on the tops.
  const rounded = roundCorners(raw, rounds, (i, kk) => (i === 8 ? kk === 4 : i === 0 ? kk === 0 : i > 8));
  const profile = rounded.pts;
  // Bottom plates, chine shelves and the band under the paint line in plate like the hull's;
  // sides, tops and aft faces in the topside finish.
  const low = (a, b) => a.y <= s0.yp + 1e-4 && b.y <= s0.yp + 1e-4;
  const [podSides, podBottom] = prism(profile, aftFace, 0, POD_BEVEL, low);
  plateUV(add(group, podSides, topside));
  plateUV(add(group, podBottom, plate));
  // Butt weld where the pod's sides and bottom meet the hull's, flush with the plate.
  for (let i = 0; i < 8; i++) {
    const [z, y] = raw[i];
    const [z2, y2] = raw[i + 1];
    rod(group, v3(-0.004, y, z), v3(-0.004, y2, z2), 0.004, low({ y }, { y: y2 }) ? plate : topside, 6).castShadow = false;
  }
  // Fillet weld along the tops, in the corner against the transom skin.
  const first = rounded.tags.findIndex((t, i) => t && !rounded.tags[(i - 1 + profile.length) % profile.length]);
  const weld = [];
  for (let i = first; rounded.tags[i % profile.length]; i++) weld.push(profile[i % profile.length]);
  weldFillet(group, topside, weld);
  const padX0 = aftFace + POD_BEVEL + 0.03;
  const padX1 = -0.035;
  for (const side of [1, -1]) {
    rod(group, v3(0.002, s0.yf, side * (s0.zf + 0.002)), v3(aftFace + POD_BEVEL, s0.yf, side * (s0.zf + 0.002)), 0.006, plate, 5);
    const pz0 = podHalf + (stands ? 0.05 : 0.035);
    const pz1 = zO - 0.04;
    raisedPanel(group, k, rrect((padX0 + padX1) / 2, side * (pz0 + pz1) / 2, padX1 - padX0, pz1 - pz0, 0.03), [], platY, 0.004);
  }
  // Keel bar carried on under the pod, closed off at its aft end.
  // Same flat bar on edge as the hull's: 22 mm wide, KEEL_BAR deep, bedded 6 mm into the plate.
  plateUV(rbox(group, plate, [-aftFace - 0.006 + 0.02, KEEL_BAR + 0.006, 0.022], [(aftFace + 0.006 + 0.02) / 2, s0.yk - (KEEL_BAR - 0.006) / 2, 0], 0.008));
  // Alloy mounting plate on the engine pod, through-bolted.
  box(group, m.alloy, [POD - 0.03, 0.012, podHalf * 2 - 0.05], [-POD / 2 - 0.01, podTop + 0.006, 0]);
  for (const x of [-0.08, -0.38]) {
    for (const z of [-podHalf + 0.07, podHalf - 0.07]) {
      const bolt = add(group, new THREE.CylinderGeometry(0.012, 0.012, 0.008, 6), m.stainless, { cast: false });
      bolt.position.set(x, podTop + 0.016, z);
    }
  }

  // Fold-down boarding ladder on the port platform, outboard of the underwater light.
  const hwL = 0.115;
  const lz = -(s0.zf - 0.03 - hwL);
  ladder(group, m, k.satin, { lz, hw: hwL, platY, aftX: aftFace, deployed: build.scene === 'water' });

  // Fittings on the pods' aft faces (x = aftFace, facing aft).
  podFittings(group, m, k, { s0, podHalf, platY, aftFace, bottomAt, twin });
  // Tie-down / tow eyes on the transom skin just above the platforms.
  for (const side of [1, -1]) eye(group, k.satin, platY + 0.065, side * Math.min(0.9, zO - 0.1));

  // Boarding handle on the transom beside the door, over the port platform.
  const gz = -(dOut + (s0.hb - dOut) / 2);
  const gy0 = platY + 0.12;
  const gy1 = ys - 0.075;
  add(group, tube([v3(-0.002, gy0, gz), v3(-0.055, gy0 + 0.03, gz), v3(-0.06, (gy0 + gy1) / 2, gz), v3(-0.055, gy1 - 0.03, gz), v3(-0.002, gy1, gz)], 0.012, 24, 8), m.stainless);
  for (const y of [gy0, gy1]) {
    const flange = add(group, new THREE.CylinderGeometry(0.022, 0.022, 0.006, 14), m.stainless);
    flange.position.set(-0.003, y, gz);
    flange.rotation.z = Math.PI / 2;
  }

  return { podTop, podHalf, zi, platY, bottomAt, aft: -POD };
}

// Scupper outlets with rubber flaps on the platforms, the bung in the engine pod, interceptor
// trim tabs along the bottom edge either side (clear of the ladder's stiles, which hang 24 mm
// aft of the face), and on a single rig a transom-mount transducer on its bracket to starboard.
function podFittings(group, m, k, { s0, podHalf, platY, aftFace, bottomAt, twin }) {
  const fx = aftFace;
  const along = v3(1, 0, 0);
  // Scupper outlets: flanged spigot, dark bore, flap hanging over its top two-thirds.
  for (const side of [1, -1]) {
    const z = side * (podHalf + 0.12);
    const y = DECK_Y - 0.025;
    const rim = add(group, new THREE.CylinderGeometry(0.034, 0.036, 0.01, 18), k.satin);
    rim.position.set(fx - 0.005, y, z);
    rim.quaternion.setFromUnitVectors(v3(0, 1, 0), along);
    const bore = add(group, new THREE.CircleGeometry(0.024, 16), m.rubber, { cast: false });
    bore.position.set(fx - 0.0105, y, z);
    bore.rotation.y = -Math.PI / 2;
    const flap = add(group, new THREE.CylinderGeometry(0.027, 0.027, 0.003, 16), m.rubber);
    flap.position.set(fx - 0.0125, y + 0.007, z);
    flap.rotation.z = Math.PI / 2 - 0.12;
  }
  // Bung: flange and hex plug, beside the keel bar.
  const bz = -0.07;
  const by = bottomAt(Math.abs(bz)) + POD_BEVEL + 0.04;
  const flange = add(group, new THREE.CylinderGeometry(0.03, 0.03, 0.005, 18), k.satin);
  flange.position.set(fx - 0.0025, by, bz);
  flange.rotation.z = Math.PI / 2;
  const plug = add(group, new THREE.CylinderGeometry(0.017, 0.017, 0.014, 6), k.satin);
  plug.position.set(fx - 0.011, by, bz);
  plug.rotation.z = Math.PI / 2;
  // Interceptors: a low black housing on the deadrise line with the stainless blade edge showing.
  const dr = Math.atan2(s0.yc - s0.yk, s0.zc);
  const iz0 = podHalf + 0.04;
  const iz1 = Math.min(iz0 + 0.33, s0.zc - (twin ? 0.05 : 0.2));
  const hgt = 0.036;
  for (const side of [1, -1]) {
    const zm = (iz0 + iz1) / 2;
    const yb = bottomAt(zm) + POD_BEVEL;
    const cz = side * (zm - (hgt / 2) * Math.sin(dr));
    const cy = yb + (hgt / 2) * Math.cos(dr);
    const housing = rbox(group, m.rubber, [0.02, hgt, iz1 - iz0], [fx - 0.01, cy, cz], 0.005);
    housing.rotation.x = -side * dr;
    const blade = rbox(group, k.satin, [0.012, 0.005, iz1 - iz0 - 0.02], [fx - 0.008, yb - 0.001, side * zm], 0.002, { cast: false });
    blade.rotation.x = -side * dr;
    // Cable from the outboard end up the face to a gland.
    const cz2 = iz1 - 0.035;
    const y0 = bottomAt(cz2) + POD_BEVEL + hgt;
    rod(group, v3(fx - 0.006, y0, side * cz2), v3(fx - 0.006, y0 + 0.16, side * cz2), 0.0045, m.rubber, 6);
    rbox(group, k.satin, [0.014, 0.034, 0.03], [fx - 0.007, y0 + 0.17, side * cz2], 0.0065);
  }
  if (twin) return;
  // Transducer: plate on the face, kick-up bracket, a flat-bottomed body just below the bottom.
  const zt = s0.zc - 0.1;
  const yb = bottomAt(zt) + POD_BEVEL;
  plateUV(rbox(group, m.alloy, [0.008, 0.085, 0.085], [fx - 0.004, yb + 0.08, zt], 0.004));
  for (const dy of [-0.028, 0.028]) {
    for (const dz of [-0.028, 0.028]) {
      const bolt = add(group, new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 6), k.satin, { cast: false });
      bolt.position.set(fx - 0.01, yb + 0.08 + dy, zt + dz);
      bolt.rotation.z = Math.PI / 2;
    }
  }
  rbox(group, m.rubber, [0.05, 0.075, 0.024], [fx - 0.033, yb + 0.06, zt], 0.008);
  const body = add(group, new THREE.CapsuleGeometry(0.026, 0.12, 4, 12), m.rubber);
  body.rotation.z = Math.PI / 2;
  body.scale.set(0.75, 1, 1.3);
  body.position.set(fx - 0.1, yb - POD_BEVEL + 0.0155, zt);
  add(group, tube([v3(fx - 0.035, yb + 0.095, zt), v3(fx - 0.028, yb + 0.12, zt + 0.02), v3(fx - 0.008, yb + 0.145, zt + 0.035), v3(fx - 0.006, yb + 0.16, zt + 0.04)], 0.0045, 12, 6), m.rubber);
  rbox(group, k.satin, [0.014, 0.034, 0.03], [fx - 0.007, yb + 0.17, zt + 0.04], 0.0065);
}

// Padded coaming bolster section between x0 and x1 on the liner face: tuck-and-roll vinyl in
// three horizontal rolls with stitched grooves between them, rounded ends.
function bolster(group, material, x0, x1, side, S, face) {
  const th = 0.055;
  const N = 24;
  const ends = [[0, 0.5], [0.006, 0.8], [0.02, 0.95], [0.045, 1]];
  const mid = spaced(x0 + 0.1, x1 - 0.1, Math.max(1, Math.round((x1 - x0) / 0.22))).map((x) => [x, 1]);
  const xs = [...ends.map(([d, f]) => [x0 + d, f]), ...mid, ...ends.slice().reverse().map(([d, f]) => [x1 - d, f])];
  const rings = xs.map(([x, f]) => {
    const s = S(x);
    const y0 = s.ys - 0.19;
    const y1 = s.ys - 0.045;
    const yc = (y0 + y1) / 2;
    const hh = ((y1 - y0) / 2) * (0.6 + 0.4 * f);
    const z0 = face(s) + 0.003;
    return Array.from({ length: N + 1 }, (_, j) => {
      const w = 0.7 * (j / N) + 0.3 * (0.5 - 0.5 * Math.cos((Math.PI * j) / N));
      const q = 2 * w - 1;
      const dome = Math.max(0, 1 - Math.abs(q) ** 3) ** 0.42;
      const rolls = 0.86 + 0.14 * Math.abs(Math.sin(3 * Math.PI * w)) ** 0.45;
      return v3(x, yc + hh * q, side * (z0 - th * f * dome * rolls));
    });
  });
  add(group, loft(rings), material);
}

// Stainless horn cleat on the gunwale capping at station s.
function cleat(group, m, s, side) {
  const z = side * (s.hb - CAP / 2);
  rbox(group, m.stainless, [0.11, 0.004, 0.03], [s.x, s.ys + 0.002, z], 0.0019);
  for (const dx of [-0.032, 0.032]) {
    const leg = add(group, new THREE.CylinderGeometry(0.009, 0.012, 0.026, 10), m.stainless);
    leg.position.set(s.x + dx, s.ys + 0.016, z);
  }
  const horn = add(group, new THREE.CapsuleGeometry(0.009, 0.13, 4, 10), m.stainless);
  horn.position.set(s.x, s.ys + 0.031, z);
  horn.rotation.z = Math.PI / 2;
}

// Telescopic stainless ladder hinged at the aft edge of a platform: flat treads with rubber
// grips, collars where the sections slide, rubber feet. Stowed, it lies folded on the platform
// on rubber chocks; deployed, its arms reach over the chamfered edge and the
// stiles hang just clear of the aft face, well below the waterline.
function ladder(group, m, steel, { lz, hw, platY, aftX, deployed }) {
  const g = new THREE.Group();
  const len = deployed ? 0.92 : 0.44;
  const rungs = deployed ? [0.22, 0.45, 0.68, 0.9] : [0.16, 0.3, 0.43];
  for (const dz of [-hw, hw]) {
    rod(g, v3(0, 0.02, dz), v3(0, -len, dz), 0.012, steel, 12);
    for (const f of deployed ? [0.36, 0.64] : [0.5]) {
      const collar = add(g, new THREE.CylinderGeometry(0.016, 0.016, 0.03, 14), steel);
      collar.position.set(0, -len * f, dz);
    }
    const foot = add(g, new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10), m.rubber);
    foot.position.set(0, -len - 0.01, dz);
  }
  for (const r of rungs) {
    rbox(g, steel, [0.055, 0.014, hw * 2], [0, -r, 0], 0.005);
    for (const dx of [-0.013, 0, 0.013]) box(g, m.rubber, [0.007, 0.004, hw * 2 - 0.03], [dx, -r + 0.009, 0], { cast: false });
  }
  if (deployed) {
    for (const dz of [-hw, hw]) rod(g, v3(0.058, 0.02, dz), v3(-0.004, 0.02, dz), 0.012, steel, 12);
    g.position.set(aftX - 0.035, platY - 0.003, lz);
  } else {
    g.rotation.z = Math.PI / 2;
    g.position.set(aftX + 0.035, platY + 0.0345, lz);
    // Rubber chocks under the stiles.
    for (const x of [aftX + 0.26, aftX + 0.4]) {
      for (const dz of [-hw, hw]) rbox(group, m.rubber, [0.04, 0.02, 0.03], [x, platY + 0.0125, lz + dz], 0.004);
    }
  }
  group.add(g);
  // Hinge brackets on the platform's aft edge.
  for (const dz of [-hw, hw]) rbox(group, steel, [0.045, 0.03, 0.026], [aftX + 0.04, platY + 0.015, lz + dz * 1.22], 0.006);
  rod(group, v3(aftX + 0.04, platY + 0.017, lz - hw * 1.22), v3(aftX + 0.04, platY + 0.017, lz + hw * 1.22), 0.007, steel, 8);
}

// Standard transom bait board: a 22 mm HDPE cutting board with a routed juice groove, fences on
// three sides, knife slots and three rod holders, on a welded stainless frame whose legs land on
// the transom capping.
function baitBoard(group, k, m, s0) {
  const steel = k.satin;
  const top = s0.ys + 0.31;
  const xa = -0.09;
  const xb = 0.27;
  const w = 0.62;
  const th = 0.022;
  const xc = (xa + xb) / 2;
  rbox(group, k.hdpe, [xb - xa, th, w], [xc, top - th / 2, 0], 0.005);
  // Fences: aft and both sides, the same sheet on edge.
  rbox(group, k.hdpe, [0.016, 0.034, w], [xa + 0.008, top + 0.016, 0], 0.005);
  for (const side of [1, -1]) rbox(group, k.hdpe, [xb - xa - 0.016, 0.026, 0.014], [xc + 0.008, top + 0.012, side * (w / 2 - 0.007)], 0.005);
  // Juice groove routed round the working area, open to the front edge drain.
  const gx = xc + 0.01;
  const glx = xb - xa - 0.075;
  const glz = w - 0.075;
  add(group, flat(rrect(gx, 0, glx, glz, 0.03), [rrect(gx, 0, glx - 0.014, glz - 0.014, 0.023)], top + 0.0006), k.groove, { cast: false });
  // Knife block in the starboard front corner: three deep slots, one knife home.
  const kz = w / 2 - 0.014 - 0.07;
  rbox(group, k.hdpe, [0.075, 0.045, 0.14], [xb - 0.05, top + 0.0225, kz], 0.006);
  for (const dz of [-0.04, 0, 0.04]) box(group, m.rubber, [0.05, 0.003, 0.006], [xb - 0.05, top + 0.0445, kz + dz], { cast: false });
  rbox(group, m.rubber, [0.03, 0.1, 0.016], [xb - 0.05, top + 0.096, kz], 0.006);
  rbox(group, steel, [0.032, 0.008, 0.017], [xb - 0.05, top + 0.05, kz], 0.002);
  // Frame: a welded rectangle of 25 mm tube under the board, and four raked legs.
  const fy = top - th - 0.0125;
  const fz = w / 2 - 0.035;
  const fx0 = xa + 0.04;
  const fx1 = xb - 0.05;
  for (const x of [fx0, fx1]) rod(group, v3(x, fy, -fz - 0.0125), v3(x, fy, fz + 0.0125), 0.0125, steel, 12);
  for (const side of [1, -1]) rod(group, v3(fx0 - 0.0125, fy, side * fz), v3(fx1 + 0.0125, fy, side * fz), 0.0125, steel, 12);
  const capTop = s0.ys + 0.0045;
  for (const z of [-0.24, 0.24]) {
    rod(group, v3(0.025, capTop, z), v3(fx0, fy, z), 0.013, steel, 12);
    rod(group, v3(0.085, capTop, z), v3(fx1, fy, z), 0.013, steel, 12);
    rod(group, v3(lerp(0.025, fx0, 0.45), lerp(capTop, fy, 0.45), z), v3(lerp(0.085, fx1, 0.45), lerp(capTop, fy, 0.45), z), 0.009, steel, 8);
    footPlate(group, steel, 0.025, capTop, z);
    footPlate(group, steel, 0.085, capTop, z);
  }
  // Rod holders clamped to the aft rail, raked aft.
  const dir = v3(-Math.sin(0.3), Math.cos(0.3), 0);
  for (const z of [-0.2, 0, 0.2]) {
    holder(group, m, v3(xa - 0.026, top - 0.13, z), dir, 0.27, 0.021, steel);
    rbox(group, steel, [0.07, 0.024, 0.032], [xa + 0.002, fy, z], 0.004);
  }
}

// Bait station option: a moulded station in the cabin/console colour on a stainless frame, with
// a lift-up top (its split line shows as a dark reveal), a cutting board, sink and tap, two
// tackle drawers, a rail and four rod holders.
export function baitStation(group, lines, m) {
  const k = parts();
  const steel = k.satin;
  const s0 = lines.section(0);
  const w = Math.min(1.04, s0.inner * 1.05);
  const xa = -0.12;
  const xb = 0.34;
  const top = s0.ys + 0.42;
  const under = top - 0.15;
  const xc = (xa + xb) / 2;
  const ym = (top + under) / 2;
  rbox(group, m.trim, [xb - xa, top - under - 0.034, w], [xc, (under + top - 0.034) / 2, 0], 0.025);
  rbox(group, m.rubber, [xb - xa - 0.012, 0.012, w - 0.012], [xc, top - 0.034, 0], 0.005, { cast: false });
  rbox(group, m.trim, [xb - xa, 0.028, w], [xc, top - 0.014, 0], 0.012);
  for (const z of [-w * 0.3, w * 0.3]) {
    const hinge = add(group, new THREE.CylinderGeometry(0.006, 0.006, 0.06, 10), steel);
    hinge.position.set(xa - 0.002, top - 0.034, z);
    hinge.rotation.x = Math.PI / 2;
  }
  // Cutting board to port, sink and tap to starboard.
  rbox(group, k.hdpe, [xb - xa - 0.08, 0.014, w * 0.52], [xc + 0.01, top + 0.006, -w * 0.2], 0.005);
  const sz = w / 2 - 0.19;
  rbox(group, k.basin, [0.27, 0.004, 0.3], [xc + 0.02, top + 0.0015, sz], 0.02, { cast: false });
  const drain = add(group, new THREE.CircleGeometry(0.02, 14), m.rubber, { cast: false });
  drain.position.set(xc + 0.02, top + 0.0042, sz);
  drain.rotation.x = -Math.PI / 2;
  add(group, tube([v3(xa + 0.05, top, sz), v3(xa + 0.05, top + 0.12, sz), v3(xa + 0.1, top + 0.15, sz), v3(xa + 0.15, top + 0.1, sz)], 0.008, 16, 6), steel);
  // Tackle drawers in the front face.
  const dy = (under + top - 0.04) / 2;
  for (const side of [1, -1]) {
    const dzc = side * w * 0.22;
    box(group, m.rubber, [0.002, 0.07, w * 0.37], [xb + 0.0005, dy, dzc], { cast: false });
    rbox(group, m.trim, [0.012, 0.062, w * 0.36], [xb + 0.006, dy, dzc], 0.004);
    rod(group, v3(xb + 0.026, dy, dzc - 0.06), v3(xb + 0.026, dy, dzc + 0.06), 0.006, steel, 8);
    for (const dz of [-0.055, 0.055]) rod(group, v3(xb + 0.011, dy, dzc + dz), v3(xb + 0.026, dy, dzc + dz), 0.005, steel, 6);
  }
  // Rail along the aft edge.
  const rz = w / 2 - 0.06;
  for (const z of [-rz, 0, rz]) rod(group, v3(xa + 0.03, top, z), v3(xa + 0.03, top + 0.07, z), 0.009, steel, 8);
  rod(group, v3(xa + 0.03, top + 0.07, -rz - 0.009), v3(xa + 0.03, top + 0.07, rz + 0.009), 0.011, steel);
  // Four rod holders on the aft face.
  const dir = v3(-Math.sin(0.28), Math.cos(0.28), 0);
  for (const f of [-0.375, -0.125, 0.125, 0.375]) {
    holder(group, m, v3(xa - 0.026, under - 0.03, f * w), dir, 0.3, 0.023, steel);
    rbox(group, steel, [0.03, 0.03, 0.04], [xa - 0.008, under + 0.04, f * w], 0.004);
  }
  // Frame: four legs to the transom capping, braced fore and aft.
  const capTop = s0.ys + 0.0045;
  // Feet stay on the fixed capping, inboard of the door's inner edge (dIn on a single rig).
  const lzs = Math.min(w / 2 - 0.09, s0.inner - 0.49 - 0.08);
  for (const z of [-lzs, lzs]) {
    rod(group, v3(0.025, capTop, z), v3(xa + 0.06, under, z), 0.015, steel, 12);
    rod(group, v3(0.085, capTop, z), v3(xb - 0.07, under, z), 0.015, steel, 12);
    rod(group, v3(lerp(0.025, xa + 0.06, 0.5), lerp(capTop, under, 0.5), z), v3(lerp(0.085, xb - 0.07, 0.5), lerp(capTop, under, 0.5), z), 0.011, steel);
    footPlate(group, steel, 0.025, capTop, z, 0.028);
    footPlate(group, steel, 0.085, capTop, z, 0.028);
  }
}
