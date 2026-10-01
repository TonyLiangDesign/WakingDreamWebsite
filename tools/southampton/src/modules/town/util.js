// Sampling helpers: exact terrain-mesh heights, cached coast distance, occupancy grid, noise.

// Height of the rendered near-terrain mesh (30 m grid, same triangulation as terrain.js),
// so things placed on the ground neither float nor sink between terrain vertices.
export function makeGround(terrain) {
  // near mesh: 30 m grid over [-6600,7200]×[-6000,9600]; far mesh: 300 m grid from (-36000,-26000)
  const grid = (x0, z0, step, nx, nz) => {
    const H = new Float32Array(nx * nz).fill(NaN);
    const hv = (i, j) => {
      if (i < 0 || j < 0 || i >= nx || j >= nz) return terrain.heightAt(x0 + i * step, z0 + j * step);
      const k = j * nx + i;
      let v = H[k];
      if (v !== v) { v = terrain.heightAt(x0 + i * step, z0 + j * step); H[k] = v; }
      return v;
    };
    return (x, z) => {
      const fx = (x - x0) / step, fz = (z - z0) / step;
      const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
      if (u + v <= 1) { const a = hv(i, j); return a + (hv(i + 1, j) - a) * u + (hv(i, j + 1) - a) * v; }
      const e = hv(i + 1, j + 1);
      return e + (hv(i, j + 1) - e) * (1 - u) + (hv(i + 1, j) - e) * (1 - v);
    };
  };
  const near = grid(-6600, -6000, 30, 461, 521);
  const far = grid(-36000, -26000, 300, 241, 221);
  return (x, z) => (x >= -6600 && x <= 7200 && z >= -6000 && z <= 9600 ? near(x, z) : far(x, z));
}

// Signed distance to the coast (positive on land), bilinear from a lazy 12 m cache.
export function makeCoast(terrain, rivers = [], distToSegs = null) {
  const step = 12, cache = new Map();
  const rb = rivers.map((r) => {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of r.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    return [x0 - 400, x1 + 400, z0 - 400, z1 + 400];
  });
  const sv = (i, j) => {
    const k = i * 100003 + j;
    let v = cache.get(k);
    if (v === undefined) {
      const x = i * step, z = j * step;
      v = terrain.coast(x, z).s;
      // shared terrain wiggles natural shorelines within ~400 m of the polygon coast: use the real value there
      if (Math.abs(v) < 420) v = terrain.sample(x, z).s;
      // rivers cut through the land polygons (Test above Redbridge, Itchen above Northam)
      if (distToSegs) rivers.forEach((r, n) => {
        const b = rb[n];
        if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) return;
        v = Math.min(v, distToSegs(x, z, r.pts, false) - r.width / 2);
      });
      cache.set(k, v);
    }
    return v;
  };
  return (x, z) => {
    const fx = x / step, fz = z / step, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = sv(i, j), b = sv(i + 1, j), c = sv(i, j + 1), d = sv(i + 1, j + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}

// Tile-hashed occupancy raster (1.5 m cells). 0 free, 1 carriageway, 2 building plot, 3 reserved, 4 pavement.
export class Occ {
  constructor(cell = 1.5) { this.c = cell; this.inv = 1 / cell; this.tiles = new Map(); this.lk = -1; this.lt = null; }
  _t(ix, iz, create) {
    const key = ((ix >> 8) + 2048) * 8192 + ((iz >> 8) + 2048);
    if (key === this.lk) return this.lt;
    let t = this.tiles.get(key);
    if (!t) { if (!create) return null; t = { v: new Uint8Array(65536), id: new Uint16Array(65536) }; this.tiles.set(key, t); }
    this.lk = key; this.lt = t;
    return t;
  }
  get(ix, iz) { const t = this._t(ix, iz, false); return t ? t.v[((iz & 255) << 8) | (ix & 255)] : 0; }
  getId(ix, iz) { const t = this._t(ix, iz, false); return t ? t.id[((iz & 255) << 8) | (ix & 255)] : 0; }
  at(x, z) { return this.get(Math.floor(x * this.inv), Math.floor(z * this.inv)); }
  idAt(x, z) { return this.getId(Math.floor(x * this.inv), Math.floor(z * this.inv)); }
  set(ix, iz, v, id = 0) { const t = this._t(ix, iz, true); const k = ((iz & 255) << 8) | (ix & 255); t.v[k] = v; if (id) t.id[k] = id; }
  // visit cells whose centres lie inside convex quad q (shrunk by `shrink` metres). fn returns false to stop.
  quad(q, shrink, fn) {
    const c = this.c, n = q.length;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, area = 0;
    for (let i = 0; i < n; i++) {
      const p = q[i], b = q[(i + 1) % n];
      x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
      area += p[0] * b[1] - b[0] * p[1];
    }
    const sg = area >= 0 ? 1 : -1;
    const E = [];
    for (let i = 0; i < n; i++) {
      const a = q[i], b = q[(i + 1) % n];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      E.push([a[0], a[1], (b[0] - a[0]) / L * sg, (b[1] - a[1]) / L * sg]);
    }
    const ix0 = Math.floor(x0 / c - 0.5), ix1 = Math.ceil(x1 / c - 0.5), iz0 = Math.floor(z0 / c - 0.5), iz1 = Math.ceil(z1 / c - 0.5);
    for (let iz = iz0; iz <= iz1; iz++) {
      const pz = (iz + 0.5) * c;
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = (ix + 0.5) * c;
        let inside = true;
        for (let i = 0; i < n; i++) {
          const e = E[i];
          if (e[2] * (pz - e[1]) - e[3] * (px - e[0]) < shrink) { inside = false; break; }
        }
        if (inside && fn(ix, iz) === false) return false;
      }
    }
    return true;
  }
  free(q, shrink = 0.4) { return this.quad(q, shrink, (ix, iz) => this.get(ix, iz) === 0); }
  mark(q, v, id = 0, shrink = 0) { this.quad(q, shrink, (ix, iz) => { if (v !== 2 || this.get(ix, iz) === 0) this.set(ix, iz, v, id); }); }
}

function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
export function fbm(x, z, oct = 3) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f + i * 17.3, z * f - i * 9.1) * a; n += a; a *= 0.5; f *= 2.07; }
  return s / n;
}

// Polyline with arc-length parameterisation.
export class Line {
  constructor(pts) {
    this.pts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.len = this.cum[this.cum.length - 1];
    this._i = 0;
  }
  seg(t) {
    const c = this.cum;
    let i = Math.min(this._i, c.length - 2);
    while (i > 0 && c[i] > t) i--;
    while (i < c.length - 2 && c[i + 1] < t) i++;
    this._i = i;
    return i;
  }
  at(t) {
    t = Math.max(0, Math.min(this.len, t));
    const i = this.seg(t), a = this.pts[i], b = this.pts[i + 1];
    const L = this.cum[i + 1] - this.cum[i] || 1, k = (t - this.cum[i]) / L;
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  }
  // smoothed unit tangent
  dir(t, span = 4) {
    const a = this.at(t - span), b = this.at(t + span);
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return [dx / L, dz / L];
  }
}

export function densify(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Catmull-Rom through control points (for hand-placed historic roads).
export function smoothPath(ctrl, step = 6) {
  if (ctrl.length < 3) return densify(ctrl, step);
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}
