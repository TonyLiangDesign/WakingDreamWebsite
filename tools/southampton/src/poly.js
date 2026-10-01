// 2D polygon helpers on [x, z] arrays.

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSegs(x, z, poly, closed = true) {
  let best = Infinity;
  const n = poly.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % n];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + t * dx - x, pz = az + t * dz - z;
    const d = px * px + pz * pz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

// Bounding box accelerated polygon for many queries.
export class Region {
  constructor(poly) {
    this.poly = poly;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    this.box = [x0, x1, z0, z1];
  }
  contains(x, z) {
    const [x0, x1, z0, z1] = this.box;
    if (x < x0 || x > x1 || z < z0 || z > z1) return false;
    return pointInPoly(x, z, this.poly);
  }
  // signed distance: positive inside
  sdist(x, z) {
    const d = distToSegs(x, z, this.poly);
    return this.contains(x, z) ? d : -d;
  }
  area() {
    let a = 0; const p = this.poly;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]);
    return Math.abs(a / 2);
  }
  randomPoint(rnd) {
    const [x0, x1, z0, z1] = this.box;
    for (let i = 0; i < 200; i++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (pointInPoly(x, z, this.poly)) return [x, z];
    }
    return null;
  }
}

// Chaikin smoothing for hand-authored coastlines.
export function smoothPoly(poly, iterations = 2, closed = true) {
  let p = poly;
  for (let k = 0; k < iterations; k++) {
    const out = [];
    const n = p.length, m = closed ? n : n - 1;
    if (!closed) out.push(p[0]);
    for (let i = 0; i < m; i++) {
      const a = p[i], b = p[(i + 1) % n];
      out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) out.push(p[n - 1]);
    p = out;
  }
  return p;
}

// Densify a polyline so no segment exceeds `step`.
export function densify(poly, step, closed = true) {
  const out = [];
  const n = poly.length, m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  if (!closed) out.push(poly[n - 1]);
  return out;
}
