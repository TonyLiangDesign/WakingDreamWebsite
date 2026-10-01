import { frustum, windowRow } from './kit.js';

export function groundAt(ctx, x, z) {
  const s = ctx.terrain.sample(x, z);
  if (s.type === 'estate') return ctx.Q;
  return ctx.terrain.heightAt(x, z);
}

// min/max ground over a local rectangle sampled on a grid
export function groundRange(ctx, k, x0, x1, z0, z1, n = 4) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
    const p = k.toWorld(x0 + ((x1 - x0) * i) / n, 0, z0 + ((z1 - z0) * j) / n);
    const h = groundAt(ctx, p[0], p[2]);
    lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  return [lo, hi];
}

export function bearingYaw(bearingDeg) {
  // local +x toward compass bearing
  return ((90 - bearingDeg) * Math.PI) / 180;
}

// Chimney stack with pots
export function chimney(k, key, x, y, z, w, d, h, pots = 2, potKey = key) {
  k.cbox(key, x, y + h / 2, z, w, h, d);
  k.cbox(key, x, y + h - 0.15, z, w + 0.2, 0.3, d + 0.2);
  for (let i = 0; i < pots; i++) {
    const px = x - w / 2 + (w * (i + 0.5)) / pots;
    k.cyl(potKey, px, y + h + 0.35, z, 0.16, 0.2, 0.7, 6);
  }
}

// Battlements along local x at height y (top of wall), wall thickness t centred at z
export function crenels(k, key, x0, x1, y, z, t, merlon = 1.2, gap = 0.9, h = 1.0) {
  const L = x1 - x0;
  const n = Math.max(1, Math.floor((L + gap) / (merlon + gap)));
  const used = n * merlon + (n - 1) * gap;
  let x = x0 + (L - used) / 2;
  for (let i = 0; i < n; i++) {
    k.box(key, x, y, z - t / 2, merlon, h, t);
    x += merlon + gap;
  }
}

// Ring of battlements around a round tower
export function ringCrenels(k, key, cx, cz, r, y, t = 0.8, n = 14, h = 1.0) {
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    const arc = ((Math.PI * 2 * r) / n) * 0.55;
    k.cbox(key, cx + Math.cos(a) * r, y + h / 2, cz + Math.sin(a) * r, t, h, arc, 0, -a, 0);
  }
}

// Dormer window on a mansard/roof slope. Sub-kit frame: wall plane z=0 outward -z.
export function dormer(k, x, y, z, w, h, roofKey, cheekKey, glass = 'glass') {
  k.cbox(cheekKey, x, y + h / 2, z + 0.6, w, h, 1.4);
  k.cbox(glass, x, y + h * 0.45, z - 0.13, w * 0.6, h * 0.62, 0.06);
  k.geo(roofKey, frustum(w + 0.3, 1.6, h * 0.5, 0, 1.6), x, y + h, z + 0.6);
}

// Pitched gable roof over w×d box (ridge along x), with overhang
export function gableRoof(k, key, cx, y, cz, w, d, h, over = 0.4, hip = 0) {
  k.fr(key, cx, y, cz, w + over * 2, d + over * 2, h, Math.max(0, w + over * 2 - hip * 2), 0);
}

export { windowRow };
