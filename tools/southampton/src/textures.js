import * as THREE from 'three';

// Procedural, tileable PBR texture sets. Everything is generated at load so the
// scene ships with zero third-party texture assets.
// Each set: map (sRGB albedo), normalMap, ormMap (R roughness, G cavity, B raw-mask).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Periodic value noise on a lattice of `px` × `py` cells over the unit square.
class PNoise {
  constructor(seed, px, py = px) {
    const r = mulberry32(seed);
    this.px = px; this.py = py;
    this.v = new Float32Array(px * py);
    for (let i = 0; i < this.v.length; i++) this.v[i] = r() * 2 - 1;
  }
  at(u, v) {
    const x = u * this.px, y = v * this.py;
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const px = this.px, py = this.py;
    const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py;
    const x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
    const a = this.v[y0 * px + x0], b = this.v[y0 * px + x1];
    const c = this.v[y1 * px + x0], d = this.v[y1 * px + x1];
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  }
}

class FBM {
  constructor(seed, px, py = px, octaves = 5) {
    this.o = [];
    for (let i = 0; i < octaves; i++) this.o.push(new PNoise(seed * 7919 + i * 131, px << i, py << i));
  }
  at(u, v) {
    let s = 0, a = 0.5, n = 0;
    for (const o of this.o) { s += o.at(u, v) * a; n += a; a *= 0.5; }
    return s / n; // ~[-1,1]
  }
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };

function makeSet(size, fill, normalStrength, name) {
  const N = size * size;
  const alb = new Float32Array(N * 3);
  const h = new Float32Array(N);
  const orm = new Float32Array(N * 3);
  const px = { r: 0, g: 0, b: 0, h: 0, rough: 0.8, cav: 1, raw: 0 };
  for (let j = 0; j < size; j++) {
    const v = (j + 0.5) / size;
    for (let i = 0; i < size; i++) {
      const u = (i + 0.5) / size;
      px.r = px.g = px.b = 0.5; px.h = 0; px.rough = 0.8; px.cav = 1; px.raw = 0;
      fill(u, v, px);
      const k = j * size + i;
      alb[k * 3] = px.r; alb[k * 3 + 1] = px.g; alb[k * 3 + 2] = px.b;
      h[k] = px.h;
      orm[k * 3] = px.rough; orm[k * 3 + 1] = px.cav; orm[k * 3 + 2] = px.raw;
    }
  }
  const albBytes = new Uint8Array(N * 4);
  const nrmBytes = new Uint8Array(N * 4);
  const ormBytes = new Uint8Array(N * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      // albedo given in linear; encode to sRGB bytes
      for (let c = 0; c < 3; c++) {
        const l = clamp01(alb[k * 3 + c]);
        const s = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
        albBytes[k * 4 + c] = s * 255 + 0.5;
        ormBytes[k * 4 + c] = clamp01(orm[k * 3 + c]) * 255 + 0.5;
      }
      albBytes[k * 4 + 3] = 255; ormBytes[k * 4 + 3] = 255;
      const l = h[j * size + ((i - 1 + size) % size)], r = h[j * size + ((i + 1) % size)];
      const d = h[((j - 1 + size) % size) * size + i], t = h[((j + 1) % size) * size + i];
      let nx = (l - r) * normalStrength, ny = (d - t) * normalStrength, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nrmBytes[k * 4] = (nx * inv * 0.5 + 0.5) * 255 + 0.5;
      nrmBytes[k * 4 + 1] = (ny * inv * 0.5 + 0.5) * 255 + 0.5;
      nrmBytes[k * 4 + 2] = (nz * inv * 0.5 + 0.5) * 255 + 0.5;
      nrmBytes[k * 4 + 3] = 255;
    }
  }
  const mk = (bytes, srgb) => {
    const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.name = name;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(albBytes, true), normalMap: mk(nrmBytes, false), ormMap: mk(ormBytes, false) };
}

// ---------------------------------------------------------------- patterns

// Granite setts laid in courses; tile = 2 m.
function setts(size) {
  const rows = 19, r = mulberry32(11);
  const rowStones = [];
  for (let j = 0; j < rows; j++) {
    const b = []; let x = r();
    const off = x;
    let acc = 0;
    while (acc < 1 - 0.05) { const w = 0.055 + r() * 0.065; b.push(acc); acc += w; }
    b.push(1);
    const tints = b.map(() => r());
    rowStones.push({ b, off, tints });
  }
  const f1 = new FBM(3, 4), f2 = new FBM(5, 32, 32, 3), grit = new PNoise(9, 512);
  return makeSet(size, (u, v, p) => {
    const rv = v * rows, j = Math.floor(rv), fv = rv - j;
    const row = rowStones[j];
    let uu = (u + row.off) % 1, s = 0;
    while (row.b[s + 1] <= uu) s++;
    const du = Math.min(uu - row.b[s], row.b[s + 1] - uu) * 2; // metres (tile 2 m)
    const dv = Math.min(fv, 1 - fv) * (2 / rows);
    const d = Math.min(du, dv);
    const t = row.tints[s];
    const macro = f1.at(u, v);
    const dome = smooth(0.003, 0.022, d) * (0.8 + 0.2 * f2.at(u, v));
    const g = grit.at(u, v) * 0.07 + f2.at(u, v) * 0.05;
    let base = 0.30 + t * 0.14 + g;
    const warm = (t - 0.5) * 0.04;
    if (d < 0.004) {
      const m = 0.13 + 0.05 * macro;
      p.r = m * 1.05; p.g = m; p.b = m * 0.85; p.rough = 0.95; p.cav = 0.55;
    } else {
      base *= 0.8 + 0.4 * row.tints[(s + 3) % row.tints.length];
      base *= 0.9 + 0.15 * macro;
      p.r = base + warm; p.g = base * 0.98; p.b = base * 0.95 - warm;
      p.rough = 0.62 + 0.25 * (1 - dome) + g;
      p.cav = 0.55 + 0.45 * dome;
    }
    p.h = dome;
  }, 3.0, 'setts');
}

// English-bond red brick; tile 1.8 m (8 bricks × 24 courses).
function brick(size) {
  const cols = 8, rows = 24, r = mulberry32(21);
  const tint = []; for (let i = 0; i < cols * 2 * rows; i++) tint.push(r());
  const f1 = new FBM(4, 4), f2 = new FBM(8, 64, 64, 3), soot = new FBM(12, 2, 8, 4);
  const pal = [[0.40, 0.16, 0.10], [0.33, 0.14, 0.09], [0.47, 0.22, 0.13], [0.27, 0.12, 0.08], [0.42, 0.21, 0.15], [0.36, 0.19, 0.14]];
  return makeSet(size, (u, v, p) => {
    const rv = v * rows, j = Math.floor(rv), fv = rv - j;
    const header = j % 2 === 1; // English bond: alternate header courses
    const n = header ? cols * 2 : cols;
    const ru = u * n + (header ? 0.25 : 0), i = Math.floor(ru), fu = ru - i;
    const ii = ((i % n) + n) % n;
    const mortarU = 0.010 / (1.8 / n), mortarV = 0.010 / (1.8 / rows);
    const edge = Math.min(Math.min(fu, 1 - fu) / mortarU, Math.min(fv, 1 - fv) / mortarV);
    const t = tint[(j * cols * 2 + ii) % tint.length];
    const c = pal[Math.floor(t * pal.length) % pal.length];
    const k = 0.85 + 0.3 * f2.at(u, v) * 0.5 + 0.15 * f1.at(u, v);
    const s = 0.75 + 0.25 * soot.at(u, v);
    if (edge < 1) {
      const m = 0.36 * s;
      p.r = m; p.g = m * 0.96; p.b = m * 0.88; p.rough = 0.95; p.cav = 0.5; p.h = 0.1;
    } else {
      p.r = c[0] * k * s; p.g = c[1] * k * s; p.b = c[2] * k * s;
      p.rough = 0.78 + 0.15 * f2.at(u, v); p.cav = 1; p.h = smooth(1, 2.5, edge) * (0.9 + 0.1 * f2.at(u, v));
    }
  }, 2.0, 'brick');
}

// Granite ashlar quay facing; tile 4.8 m (8 courses of 0.6 m).
function ashlar(size) {
  const rows = 8, r = mulberry32(31);
  const offs = [], tints = [];
  for (let j = 0; j < rows; j++) { offs.push(Math.floor(r() * 4) / 8); for (let i = 0; i < 4; i++) tints.push(r()); }
  const f1 = new FBM(14, 4), f2 = new FBM(15, 48, 48, 4), g = new PNoise(16, 512);
  return makeSet(size, (u, v, p) => {
    const rv = v * rows, j = Math.floor(rv), fv = rv - j;
    const ru = (u + offs[j]) * 4, i = Math.floor(ru), fu = ru - i;
    const du = Math.min(fu, 1 - fu) * 1.2, dv = Math.min(fv, 1 - fv) * 0.6;
    const d = Math.min(du, dv);
    const t = tints[j * 4 + (i % 4)];
    const face = smooth(0.008, 0.05, d);
    const n = f2.at(u, v) * 0.5 + g.at(u, v) * 0.25;
    const base = (0.34 + t * 0.1) * (0.9 + 0.2 * f1.at(u, v)) + n * 0.06;
    if (d < 0.008) { p.r = 0.1; p.g = 0.095; p.b = 0.09; p.rough = 0.95; p.cav = 0.3; }
    else { p.r = base * 1.03; p.g = base; p.b = base * 0.97; p.rough = 0.8 + 0.1 * n; p.cav = 0.6 + 0.4 * face; }
    p.h = face * 0.8 + n * 0.2;
  }, 4.0, 'ashlar');
}

// Weathered timber planks; tile 2 m, 8 planks along U.
function planks(size) {
  const rows = 8, r = mulberry32(41);
  const joints = [], tints = [];
  for (let j = 0; j < rows; j++) { joints.push(r()); tints.push(r()); }
  const grain = new FBM(42, 2, 96, 4), f1 = new FBM(43, 4), knots = new PNoise(44, 24, 24);
  return makeSet(size, (u, v, p) => {
    const rv = v * rows, j = Math.floor(rv), fv = rv - j;
    const ju = Math.abs(((u - joints[j] + 1) % 1) - 0.5) * 2; // 0 at butt joint
    const gap = Math.min(Math.min(fv, 1 - fv) * 0.25, ju < 0.5 ? (0.5 - ju) * 2 : 1);
    const gr = grain.at(u + j * 0.37, v);
    const t = tints[j];
    const base = (0.25 + t * 0.12) * (0.85 + 0.25 * gr) * (0.9 + 0.15 * f1.at(u, v));
    const kn = smooth(0.7, 0.9, knots.at(u + j * 0.1, v));
    if (gap < 0.004) { p.r = 0.04; p.g = 0.035; p.b = 0.03; p.rough = 1; p.cav = 0.2; p.h = 0; return; }
    p.r = base * 1.08 * (1 - kn * 0.4); p.g = base * 0.94 * (1 - kn * 0.4); p.b = base * 0.8 * (1 - kn * 0.4);
    p.rough = 0.8 + 0.15 * gr; p.cav = 1; p.h = 0.6 + 0.4 * smooth(0.004, 0.02, gap) + gr * 0.08;
  }, 2.5, 'planks');
}

// Corrugated iron sheeting (3" pitch, 26 corrugations per 2 m tile).
function corrugated(size) {
  const f1 = new FBM(51, 4), streak = new FBM(52, 48, 2, 4), spots = new FBM(53, 16, 16, 4);
  return makeSet(size, (u, v, p) => {
    const c = Math.cos(u * Math.PI * 2 * 26);
    const lap = Math.min(v % 0.5, 0.5 - (v % 0.5)) < 0.003 ? 1 : 0;
    const st = smooth(0.15, 0.55, streak.at(u, v) + 0.25 * (1 - c) * 0.3);
    const rust = clamp01(st * 0.45 + smooth(0.42, 0.62, spots.at(u, v)) * 0.35);
    const paint = 0.62 + 0.08 * f1.at(u, v);
    // rust is either there or not: partial masks would leak untinted bright paint into the tint
    // albedo holds luminance only; the rust mask selects the rust tint in the shader, so
    // filtered mask edges blend linearly instead of leaking bright untinted rings
    const rb = smooth(0.38, 0.52, rust);
    p.r = p.g = p.b = paint;
    p.raw = rb; p.rough = 0.72 + 0.25 * rb; p.cav = 0.75 + 0.25 * (c * 0.5 + 0.5) - lap * 0.4;
    p.h = c * 0.5 + 0.5 - lap * 0.3;
  }, 1.6, 'corrugated');
}

// Welsh slate roofing; tile 2 m.
function slate(size) {
  const rows = 8, cols = 8, r = mulberry32(61);
  const tints = []; for (let i = 0; i < rows * cols; i++) tints.push(r());
  const f1 = new FBM(62, 4), f2 = new FBM(63, 64, 64, 3), lichen = new FBM(64, 12, 12, 4);
  return makeSet(size, (u, v, p) => {
    const rv = v * rows, j = Math.floor(rv), fv = rv - j;
    const ru = u * cols + (j % 2) * 0.5, i = Math.floor(ru), fu = ru - i;
    const t = tints[(j * cols + ((i % cols) + cols) % cols) % tints.length];
    const gap = Math.min(fu, 1 - fu) < 0.02;
    const base = (0.14 + t * 0.06) * (0.9 + 0.15 * f1.at(u, v)) + f2.at(u, v) * 0.012;
    const li = smooth(0.45, 0.7, lichen.at(u, v)) * 0.7;
    p.r = base * 0.95 + li * 0.14; p.g = base * 1.0 + li * 0.13; p.b = base * 1.1 + li * 0.05;
    p.rough = 0.55 + 0.2 * t + li * 0.3;
    p.h = gap ? 0 : 0.35 + fv * 0.65; p.cav = gap ? 0.4 : 0.7 + 0.3 * fv;
  }, 3.0, 'slate');
}

// Generic weathered concrete / render; tile 4 m.
function concrete(size) {
  const f1 = new FBM(71, 4), f2 = new FBM(72, 32, 32, 4), pits = new PNoise(73, 512);
  return makeSet(size, (u, v, p) => {
    const n = f1.at(u, v), m = f2.at(u, v), pit = pits.at(u, v);
    const base = 0.42 + 0.08 * n + 0.04 * m;
    const dark = pit > 0.82 ? 0.55 : 1;
    p.r = base * dark; p.g = base * 0.98 * dark; p.b = base * 0.94 * dark;
    p.rough = 0.85 + 0.1 * m; p.cav = dark < 1 ? 0.5 : 1; p.h = 0.5 + 0.3 * m - (dark < 1 ? 0.4 : 0);
  }, 2.0, 'concrete');
}

// Riveted painted steel plate; tile 4 m. Paint is greyscale (tinted by material colour), rust is raw.
function plate(size) {
  const f1 = new FBM(81, 4), f2 = new FBM(82, 32, 32, 4), streak = new FBM(83, 64, 3, 4), chips = new FBM(84, 24, 24, 4);
  const plateW = 1 / 4, plateH = 1 / 2; // 1 m × 2 m plates
  return makeSet(size, (u, v, p) => {
    const fu = (u / plateW) % 1, fv = (v / plateH) % 1;
    const du = Math.min(fu, 1 - fu) * 1.0, dv = Math.min(fv, 1 - fv) * 2.0;
    const seam = Math.min(du, dv);
    // rivet rows 3 cm in from each seam, 9 cm pitch
    let rivet = 0;
    const pitch = 0.09;
    const ru = (u * 4) % pitch, rvv = (v * 4) % pitch;
    const nearV = Math.abs(dv - 0.03) < 0.01, nearU = Math.abs(du - 0.03) < 0.01;
    if (nearV) { const d = Math.hypot(Math.min(ru, pitch - ru) - 0, dv - 0.03); rivet = smooth(0.012, 0.004, d); }
    if (nearU) { const d = Math.hypot(Math.min(rvv, pitch - rvv), du - 0.03); rivet = Math.max(rivet, smooth(0.012, 0.004, d)); }
    const st = smooth(0.25, 0.65, streak.at(u, v)) * 0.5;
    const ch = smooth(0.6, 0.7, chips.at(u, v));
    const rust = clamp01(st * 0.6 + ch);
    const paint = 0.85 + 0.06 * f1.at(u, v) + 0.03 * f2.at(u, v) - st * 0.15;
    const rb = smooth(0.4, 0.55, rust);
    p.r = p.g = p.b = paint;
    p.raw = rb;
    p.rough = 0.68 + 0.12 * f2.at(u, v) + rust * 0.25;
    p.cav = seam < 0.004 ? 0.5 : 1;
    p.h = (seam < 0.004 ? -0.4 : 0) + rivet * 0.8 + f2.at(u, v) * 0.03 - ch * 0.1;
  }, 6.0, 'plate');
}

// Large-scale grime / variation: R broad blotches, G fine, B vertical streaks.
function grime(size) {
  const f1 = new FBM(91, 4, 4, 6), f2 = new FBM(92, 32, 32, 4), st = new FBM(93, 64, 4, 5);
  const N = size * size, bytes = new Uint8Array(N * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = (i + 0.5) / size, v = (j + 0.5) / size, k = (j * size + i) * 4;
    bytes[k] = clamp01(f1.at(u, v) * 0.9 + 0.5) * 255;
    bytes[k + 1] = clamp01(f2.at(u, v) * 0.9 + 0.5) * 255;
    bytes[k + 2] = clamp01(st.at(u, v) * 1.1 + 0.5) * 255;
    bytes[k + 3] = 255;
  }
  const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

// Tileable water ripple normal map from a sum of integer-wavevector sines.
function waterNormal(size) {
  const r = mulberry32(101);
  const waves = [];
  for (let i = 0; i < 64; i++) {
    const ang = r() * Math.PI * 2, mag = 3 + Math.pow(r(), 1.6) * 44;
    const kx = Math.round(Math.cos(ang) * mag), ky = Math.round(Math.sin(ang) * mag);
    if (kx === 0 && ky === 0) continue;
    const k = Math.hypot(kx, ky);
    waves.push({ kx, ky, a: 1 / Math.pow(k, 1.35), ph: r() * Math.PI * 2 });
  }
  const bytes = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const u = i / size, v = j / size;
    let dx = 0, dy = 0;
    for (const w of waves) {
      const ph = (w.kx * u + w.ky * v) * Math.PI * 2 + w.ph;
      const c = Math.cos(ph) * w.a * Math.PI * 2;
      dx += c * w.kx; dy += c * w.ky;
    }
    dx *= 0.035; dy *= 0.035;
    const inv = 1 / Math.hypot(dx, dy, 1), k = (j * size + i) * 4;
    bytes[k] = (-dx * inv * 0.5 + 0.5) * 255; bytes[k + 1] = (-dy * inv * 0.5 + 0.5) * 255;
    bytes[k + 2] = (inv * 0.5 + 0.5) * 255; bytes[k + 3] = 255;
  }
  const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}

// Soft billowy smoke puff: RGB = fake normal (for lighting), A = density.
function smokePuff(size) {
  const f = new FBM(111, 6, 6, 5);
  const bytes = new Uint8Array(size * size * 4);
  const hgt = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + 0.5) / size * 2 - 1, y = (j + 0.5) / size * 2 - 1;
    const rr = Math.hypot(x, y);
    const n = f.at((i + 0.5) / size, (j + 0.5) / size);
    const d = clamp01((1 - rr * (1.05 - 0.35 * n)) * 1.6);
    hgt[j * size + i] = d * d * (3 - 2 * d) * (0.75 + 0.5 * n);
  }
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const k = j * size + i;
    const l = hgt[j * size + Math.max(i - 1, 0)], rt = hgt[j * size + Math.min(i + 1, size - 1)];
    const d = hgt[Math.max(j - 1, 0) * size + i], t = hgt[Math.min(j + 1, size - 1) * size + i];
    const nx = (l - rt) * 6, ny = (d - t) * 6, inv = 1 / Math.hypot(nx, ny, 1);
    bytes[k * 4] = (nx * inv * 0.5 + 0.5) * 255; bytes[k * 4 + 1] = (ny * inv * 0.5 + 0.5) * 255;
    bytes[k * 4 + 2] = (inv * 0.5 + 0.5) * 255; bytes[k * 4 + 3] = clamp01(hgt[k]) * 255;
  }
  const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true;
  return t;
}

let cache = null;
export function getTextures(quality = 1) {
  if (cache) return cache;
  const S = quality >= 1 ? 1024 : 512;
  const t0 = performance.now();
  cache = {
    setts: setts(S), brick: brick(S), ashlar: ashlar(S), planks: planks(S >> 1 << 0),
    corrugated: corrugated(S >> 1), slate: slate(S >> 1), concrete: concrete(S >> 1), plate: plate(S),
    grime: grime(512), water: waterNormal(512), smoke: smokePuff(256),
  };
  console.log(`[textures] generated in ${(performance.now() - t0).toFixed(0)} ms`);
  return cache;
}
