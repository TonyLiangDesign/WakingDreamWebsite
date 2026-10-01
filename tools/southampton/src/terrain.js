import * as THREE from 'three';
import { Region, distToSegs } from './poly.js';
import { surface } from './surface.js';
import {
  LANDMARKS, ITCHEN_WHARVES, RIVERS, OD, EMPRESS_DOCK, OUTER_DOCK, TRAFALGAR_DD, INNER_DOCK, PENINSULA, WEST_LAND, EAST_LAND, ISLE_OF_WIGHT, DOCK_ESTATE, CHANNELS, MUDFLATS, TOWN_ZONES, PARKS, ELEVATION, IOW_HILLS,
} from './layout.js';

// Heightfield terrain for ~60 km of the Solent approaches, detailed within ~7 km of
// the docks. Heights are "apparent" heights (earth curvature + refraction folded in)
// so a flat water plane still gives the right horizon for the Isle of Wight.

const Q = 4.6;
const R_EFF = 7.33e6; // earth radius with k = 0.13 refraction

function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), fx = x - xi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function fbm(x, z, oct = 5) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, z * f) * a; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

export class Terrain {
  constructor() {
    this.lands = [PENINSULA, WEST_LAND, EAST_LAND].map((p) => new Region(p));
    this.iow = new Region(ISLE_OF_WIGHT);
    this.estate = new Region(DOCK_ESTATE);
    this.basins = [new Region(TRAFALGAR_DD), new Region(INNER_DOCK)];
    this.mud = new Region(MUDFLATS);
    this.wetBasins = [new Region(OD), new Region(EMPRESS_DOCK), new Region(OUTER_DOCK)];
    this.towns = TOWN_ZONES.map((z) => ({ ...z, region: new Region(z.poly) }));
    this.parks = PARKS.map((p) => new Region(p));
    const L = LANDMARKS;
    this.fixedPoints = [L.royalPierRoot, L.townQuay, L.hythePierRoot, L.netleyChapel, L.floatingBridgeW, L.floatingBridgeE, L.calshotCastle];
    this.wharves = ITCHEN_WHARVES.map((p) => new Region(p));
  }

  idw(x, z, pts, p = 2) {
    let s = 0, w = 0;
    for (const [px, pz, h] of pts) {
      const d2 = (px - x) ** 2 + (pz - z) ** 2 + 4e4;
      const k = 1 / Math.pow(d2, p / 2);
      s += h * k; w += k;
    }
    return s / w;
  }

  // Signed distance to coastline (positive on land) and which land.
  coast(x, z) {
    let best = -Infinity, iow = false;
    for (const r of this.lands) {
      const [x0, x1, z0, z1] = r.box;
      if (x < x0 - 3000 || x > x1 + 3000 || z < z0 - 3000 || z > z1 + 3000) continue;
      const s = r.sdist(x, z);
      if (s > best) best = s;
    }
    const [x0, x1, z0, z1] = this.iow.box;
    if (!(x < x0 - 3000 || x > x1 + 3000 || z < z0 - 3000 || z > z1 + 3000)) {
      const s = this.iow.sdist(x, z);
      if (s > best) { best = s; iow = true; }
    }
    return { s: best === -Infinity ? -5000 : best, iow };
  }

  sample(x, z) {
    const c0 = this.coast(x, z);
    const iow = c0.iow;
    // natural shorelines wiggle: fractal offset of the coast distance, suppressed around the
    // surveyed dock estate and piers so quays and landmarks stay exact
    let s = c0.s;
    if (Math.abs(s) < 400) {
      const de = Math.abs(this.estate.sdist(x, z));
      let w = THREE.MathUtils.smoothstep(de, 250, 650);
      for (const [lx, lz] of this.fixedPoints) {
        const dd = Math.hypot(x - lx, z - lz);
        if (dd < 500) w = Math.min(w, THREE.MathUtils.smoothstep(dd, 180, 500));
      }
      if (w > 0) s += ((fbm(x / 420, z / 420, 4) - 0.5) * 110 + (fbm(x / 95, z / 95, 3) - 0.5) * 28) * w;
    }
    const out = { h: 0, s, type: 'sea', town: null };
    if (s > 0) {
      if (this.estate.contains(x, z) || this.wharves.some((r) => r.contains(x, z))) {
        // under the estate slab: drop the ground near any quay face or basin so terrain
        // triangles can't ramp up out of the water in front of the vertical quay walls
        const nearWater = s < 45 || this.basins.some((b) => b.sdist(x, z) > -45);
        out.h = nearWater ? -12 : Q - 0.5; out.type = 'estate'; return out;
      }
      const base = iow ? this.idw(x, z, IOW_HILLS, 2.2) : this.idw(x, z, ELEVATION, 2);
      const ramp = THREE.MathUtils.smoothstep(s, 0, iow ? 900 : 350);
      const hills = (fbm(x / 1700, z / 1700) - 0.5) * (iow ? 90 : 34) + (fbm(x / 520, z / 520, 4) - 0.5) * 9 + (fbm(x / 160, z / 160, 3) - 0.5) * 2.5;
      let h = 0.25 + (base - 0.25) * ramp + hills * ramp;
      // estate edge: blend town up from quay level
      const de = distToSegs(x, z, this.estate.poly);
      if (de < 200) h = Q - 0.5 + (h - (Q - 0.5)) * THREE.MathUtils.smoothstep(de, 0, 200);
      if (s < 60) h = Math.max(h, 0.25 + s * 0.035);
      for (const r of RIVERS) {
        const dr = distToSegs(x, z, r.pts, false);
        if (dr < r.width * 2.5) {
          const bank = 0.25 + (dr - r.width / 2) * 0.05;
          if (dr < r.width / 2) { out.h = -1.5; out.s = -(r.width / 2 - dr); out.type = 'sea'; return out; }
          h = Math.min(h, Math.max(bank, 0.25));
        }
      }
      out.h = h;
      out.type = 'land';
      for (const t of this.towns) if (t.region.contains(x, z)) { out.type = 'town'; out.town = t; break; }
      if (out.type === 'land') for (const p of this.parks) if (p.contains(x, z)) { out.type = 'park'; break; }
    } else {
      const d = -s;
      if (this.wetBasins.some((b) => b.contains(x, z))) { out.h = -12; out.type = 'sea'; return out; }
      // dredged berths and approaches in front of the dock estate stay deep
      const de0 = -this.estate.sdist(x, z);
      const dredge = THREE.MathUtils.smoothstep(de0, 320, 120);
      let h = 0.25 - d * 0.035 - (fbm(x / 300, z / 300, 3) - 0.5) * 0.4 * THREE.MathUtils.smoothstep(d, 20, 120);
      const mw = THREE.MathUtils.smoothstep(this.mud.sdist(x, z), -60, 260);
      if (mw > 0) {
        // creeks meander through the flats
        const creek = Math.abs(fbm(x / 520, z / 520, 4) - 0.5);
        const mudH = 0.55 + (fbm(x / 160, z / 160, 4) - 0.5) * 0.7 - THREE.MathUtils.smoothstep(creek, 0.05, 0.0) * 1.2;
        h = h + (Math.max(h, mudH) - h) * mw;
      }
      let dc = Infinity;
      for (const c of CHANNELS) dc = Math.min(dc, distToSegs(x, z, c, false));
      if (dc < 420) h = Math.min(h, -2.5 - (420 - dc) * 0.02);
      h = h + (Math.min(h, -7) - h) * dredge;
      out.h = Math.max(h, -14);
      out.type = h > -0.8 ? 'mud' : 'sea';
    }
    return out;
  }

  apparent(h, x, z) {
    const drop = (x * x + z * z) / (2 * R_EFF);
    if (h <= 0) return h - drop;
    // keep the shoreline where it is; sink only relief (hills) with distance
    return h - Math.min(drop, h * 0.9) * THREE.MathUtils.smoothstep(h, 0.5, 25);
  }

  colorFor(smp, x, z, c) {
    const n = fbm(x / 90, z / 90, 3);
    switch (smp.type) {
      case 'sea': c.setRGB(0.16, 0.15, 0.12); break;
      case 'mud': {
        const wetter = THREE.MathUtils.smoothstep(smp.h, 0.8, -0.6);
        c.setRGB(0.13 - 0.05 * wetter, 0.12 - 0.045 * wetter, 0.095 - 0.035 * wetter).multiplyScalar(0.85 + 0.3 * n);
        break;
      }
      case 'estate': c.setRGB(0.36, 0.34, 0.31); break;
      case 'town': {
        // blend town ground into the surrounding fields toward the zone edge
        const w = THREE.MathUtils.smoothstep(smp.town.region.sdist(x, z), 0, 160) * (0.4 + 0.6 * smp.town.density);
        c.setRGB(0.36 + (0.20 - 0.36) * w, 0.45 + (0.19 - 0.45) * w, 0.24 + (0.17 - 0.24) * w).multiplyScalar(0.85 + 0.3 * n * w);
        smp.fieldW = 1 - w;
        break;
      }
      case 'park': c.setRGB(0.23, 0.30, 0.13).multiplyScalar(0.85 + 0.3 * n); break;
      default: {
        c.setRGB(0.36, 0.45, 0.24).multiplyScalar(0.85 + 0.3 * n); // rough grass; field shader takes over inland
      }
    }
    return c;
  }

  buildGrid(x0, x1, z0, z1, step, { lowerInside = null, keepHeights = false } = {}) {
    const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
    const heights = keepHeights ? new Float32Array((nx + 1) * (nz + 1) * 2) : null;
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3);
    const col = new Float32Array((nx + 1) * (nz + 1) * 3);
    const fw = new Float32Array((nx + 1) * (nz + 1));
    const sh = new Float32Array((nx + 1) * (nz + 1));
    const c = new THREE.Color();
    let k = 0;
    for (let j = 0; j <= nz; j++) {
      const z = z0 + j * step;
      for (let i = 0; i <= nx; i++) {
        const x = x0 + i * step;
        const smp = this.sample(x, z);
        let h = this.apparent(smp.h, x, z);
        if (lowerInside && x > lowerInside[0] && x < lowerInside[1] && z > lowerInside[2] && z < lowerInside[3]) h = -40;
        if (heights) {
          heights[k * 2] = smp.type === 'estate' ? -6 : h;
          // gate: shoreline cutting only for natural coasts, never around docks/wharves
          heights[k * 2 + 1] = THREE.MathUtils.smoothstep(Math.abs(this.estate.sdist(x, z)), 180, 320) * (smp.type === 'estate' ? 0 : 1);
        }
        // sink the mesh a touch at the waterline; the water shader cuts the shore smoothly
        if (heights && smp.type !== 'estate') h -= 0.6 * (1 - THREE.MathUtils.smoothstep(Math.abs(h), 0, 2.0));
        pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
        this.colorFor(smp, x, z, c);
        col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
        fw[k] = smp.type === 'land' ? 1 : smp.type === 'town' ? smp.fieldW : 0;
        sh[k] = Math.max(-50, Math.min(smp.s, 200));
        k++;
      }
    }
    const idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aField', new THREE.BufferAttribute(fw, 1));
    g.setAttribute('aShore', new THREE.BufferAttribute(sh, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (heights) g.userData.heights = { data: heights, nx: nx + 1, nz: nz + 1, rect: [x0, z0, x1, z1] };
    return g;
  }

  heightAt(x, z) { return this.apparent(this.sample(x, z).h, x, z); }
}

// ---------------------------------------------------------------- field system
// Irregular Hampshire field pattern shared by the terrain shader (GLSL) and scattering
// code (JS twin, fieldAt) so hedgerows and copses line up with what the shader paints.
// Field types by `type` hash: < .38 pasture, < .55 young cereal, < .72 ploughed/sown,
// < .82 rough fallow, ≥ .82 copse (woodland floor — place trees there).
export const FIELD = { W: 210, H: 150 };

function uhash(ix, iy, salt) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(salt, 1442695041)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export function fieldAt(x, z) {
  const wx = x + Math.sin(z * 0.0021 + Math.sin(x * 0.0013) * 1.7) * 40;
  const wz = z + Math.sin(x * 0.0019 + Math.sin(z * 0.0011) * 1.9) * 40;
  const qx = 0.94 * wx + 0.34 * wz, qy = -0.34 * wx + 0.94 * wz;
  const row = Math.floor(qy / FIELD.H);
  const cx = qx / FIELD.W + uhash(row, 0, 5);
  const col = Math.floor(cx);
  const fx = cx - col, fy = qy / FIELD.H - row;
  let d = Math.min(fx * FIELD.W, (1 - fx) * FIELD.W, fy * FIELD.H, (1 - fy) * FIELD.H);
  let sub = 0;
  const hs = uhash(col, row, 1), sp = 0.3 + 0.4 * uhash(col, row, 2);
  if (hs < 0.4) { sub = fx < sp ? 0 : 1; d = Math.min(d, Math.abs(fx - sp) * FIELD.W); }
  else if (hs < 0.6) { sub = fy < sp ? 0 : 1; d = Math.min(d, Math.abs(fy - sp) * FIELD.H); }
  let type = uhash(col * 2 + sub, row, 4);
  // woodland clusters: copses are rare in open country and merge into woods where this is high
  const wv = Math.sin(x * 0.00071 + Math.sin(z * 0.00053) * 2.1) * Math.sin(z * 0.00067 + Math.sin(x * 0.00049) * 1.7);
  const thr = 0.94 - 0.40 * Math.min(Math.max(wv / 0.8, 0), 1);
  if (type >= 0.82 && type < thr) type = 0.30 + (type - 0.82) * 2.5; // demote to pasture/cereal
  else if (type < 0.82 && type >= thr) type = 0.82 + (type - thr) * 0.1; // promote to copse
  return { dEdge: d, type, copse: type >= 0.82, hedgeWidth: 2.2 + 1.5 * uhash(col, row, 6), col, row, sub };
}

const FIELD_GLSL = /* glsl */`
  float uhash(int ix, int iy, uint salt) {
    uint h = uint(ix) * 374761393u + uint(iy) * 668265263u + salt * 1442695041u;
    h = (h ^ (h >> 13u)) * 1274126177u;
    h ^= h >> 16u;
    return float(h) / 4294967296.0;
  }
  // returns (distance to boundary m, type hash, hedge width m, stripe coord)
  vec4 fieldAt(vec2 p) {
    vec2 w = p + vec2(sin(p.y * 0.0021 + sin(p.x * 0.0013) * 1.7), sin(p.x * 0.0019 + sin(p.y * 0.0011) * 1.9)) * 40.0;
    vec2 q = vec2(0.94 * w.x + 0.34 * w.y, -0.34 * w.x + 0.94 * w.y);
    int row = int(floor(q.y / 150.0));
    float cx = q.x / 210.0 + uhash(row, 0, 5u);
    int col = int(floor(cx));
    float fx = cx - float(col), fy = q.y / 150.0 - float(row);
    float d = min(min(fx * 210.0, (1.0 - fx) * 210.0), min(fy * 150.0, (1.0 - fy) * 150.0));
    int sub = 0;
    float hs = uhash(col, row, 1u), sp = 0.3 + 0.4 * uhash(col, row, 2u);
    float stripe = q.x;
    if (hs < 0.4) { sub = fx < sp ? 0 : 1; d = min(d, abs(fx - sp) * 210.0); stripe = q.y; }
    else if (hs < 0.6) { sub = fy < sp ? 0 : 1; d = min(d, abs(fy - sp) * 150.0); }
    float type = uhash(col * 2 + sub, row, 4u);
    float wv = sin(p.x * 0.00071 + sin(p.y * 0.00053) * 2.1) * sin(p.y * 0.00067 + sin(p.x * 0.00049) * 1.7);
    float thr = 0.94 - 0.40 * clamp(wv / 0.8, 0.0, 1.0);
    if (type >= 0.82 && type < thr) type = 0.30 + (type - 0.82) * 2.5;
    else if (type < 0.82 && type >= thr) type = 0.82 + (type - thr) * 0.1;
    return vec4(d, type, 2.2 + 1.5 * uhash(col, row, 6u), stripe);
  }
`;

export function terrainMaterial() {
  const m = surface({
    set: 'concrete', scale: 7, color: 0xffffff, grime: 0.25, variation: 0.45, wet: true, highWater: 0.15, cavity: 0.2, normalScale: 0.7, name: 'terrain', minRough: 0.96, envMapIntensity: 0.55, specular: 0.4,
    extra: {
      key: 'terrain2',
      vertexPars: 'attribute float aField; attribute float aShore; varying float vField; varying float vShore;',
      vertex: 'vField = aField; vShore = aShore;',
      fragmentPars: `varying float vField; varying float vShore;` + FIELD_GLSL,
      fragment: `
        {
          float lum = clamp(dot(tpAlb, vec3(0.333)) / 0.55, 0.6, 1.25);
          float px = max(length(fwidth(vLocalP.xz)), 0.05);
          float camD = length(vLocalP - cameraPosition);
          float fieldW = vField * smoothstep(6.0, 45.0, vShore);
          if (fieldW > 0.01) {
            vec4 fa = fieldAt(vLocalP.xz);
            float t = fa.y;
            vec3 fc;
            float stripes = 0.5 + 0.5 * sin(fa.w * 2.6);
            float stripeFade = clamp(1.2 / px, 0.0, 1.0);
            if (t < 0.38) fc = mix(vec3(0.115, 0.20, 0.055), vec3(0.19, 0.27, 0.085), uhash(int(t * 9973.0), 1, 7u));
            else if (t < 0.55) fc = mix(vec3(0.15, 0.23, 0.07), vec3(0.20, 0.25, 0.10), stripes * stripeFade * 0.6);
            else if (t < 0.72) fc = mix(vec3(0.21, 0.155, 0.10), vec3(0.29, 0.22, 0.15), uhash(int(t * 7919.0), 2, 7u)) * (1.0 - 0.18 * stripes * stripeFade);
            else if (t < 0.82) fc = vec3(0.23, 0.23, 0.13);
            else fc = vec3(0.085, 0.08, 0.055);
            float fid = uhash(int(t * 65536.0), 3, 9u);
            // mottling inside fields (soil / moisture)
            fc *= 0.84 + 0.32 * mix(gBroad, gMid, 0.35);
            // April 1912: autumn-sown wheat greenest; spring oats/barley still brown with a green haze
            if (t >= 0.38 && t < 0.55)
              fc = fid < 0.6 ? mix(vec3(0.11, 0.19, 0.055), vec3(0.15, 0.22, 0.07), gMid)
                             : mix(vec3(0.22, 0.16, 0.10), vec3(0.17, 0.19, 0.09), 0.35 * stripes * stripeFade);
            if (t < 0.38) fc = mix(fc, vec3(0.20, 0.22, 0.09), 0.25 * smoothstep(0.55, 0.8, gBroad));
            // New Forest heath / rough grazing (unenclosed)
            float heath = smoothstep(-3500.0, -6500.0, vLocalP.x) * smoothstep(-2500.0, 500.0, vLocalP.z) * smoothstep(0.42, 0.58, gBroad);
            fc = mix(fc, mix(vec3(0.115, 0.09, 0.075), vec3(0.055, 0.065, 0.03), smoothstep(0.45, 0.7, gMid)), heath);
            // Test valley water meadows north of Redbridge
            float wm = smoothstep(-4500.0, -5200.0, vLocalP.x) * smoothstep(-3000.0, -3600.0, vLocalP.z);
            fc = mix(fc, vec3(0.13, 0.24, 0.07) * (0.9 + 0.2 * sin(fa.w * 0.25)), wm * 0.7);
            // hedge shadows fall on the north side (sun in the south, +z = south)
            vec4 fs = fieldAt(vLocalP.xz + vec2(0.0, 3.5));
            float hshadow = (1.0 - smoothstep(fs.z, fs.z + 2.0, fs.x)) * (1.0 - smoothstep(1.5, 4.0, px));
            fc *= 1.0 - 0.35 * hshadow * (1.0 - heath);
            fc *= vec3(0.66, 0.74, 0.60);
            // soften far patchwork toward a common tone (aerial perspective of texture contrast)
            fc = mix(fc, vec3(0.17, 0.21, 0.10), smoothstep(3000.0, 14000.0, camD) * 0.55);
            float hw = fa.z;
            float hedge = 1.0 - smoothstep(hw, hw + max(px * 1.5, 1.0), fa.x);
            hedge *= clamp(hw * 1.6 / px, 0.2, 1.0) * (1.0 - heath);
            fc = mix(fc, vec3(0.05, 0.06, 0.035), hedge * 0.85);
            base = mix(base, fc * lum * (0.82 + 0.36 * gBroad) / max(vColor.rgb, vec3(0.05)), fieldW);
          }
          // shingle / sea-wall strip right at the land edge, and wet mud just below it
          float shingle = (1.0 - smoothstep(3.0, 11.0 + px, vShore)) * step(-2.0, vShore);
          base = mix(base, vec3(0.19, 0.18, 0.15) * lum, shingle * 0.7 * step(0.3, vLocalP.y));
        }
      `,
    },
  });
  m.vertexColors = true;
  return m;
}

export function buildTerrain() {
  const t = new Terrain();
  const mat = terrainMaterial();
  const group = new THREE.Group();
  group.name = 'Terrain';
  const t0 = performance.now();
  const near = [-6600, 9000, -6000, 11000];
  const nearG = t.buildGrid(near[0], near[1], near[2], near[3], 30, { keepHeights: true });
  const farG = t.buildGrid(-36000, 36000, -26000, 40000, 300, { lowerInside: [near[0] + 150, near[1] - 150, near[2] + 150, near[3] - 150] });
  for (const [g, name, shadow] of [[nearG, 'terrain-near', true], [farG, 'terrain-far', false]]) {
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = name; mesh.receiveShadow = shadow; mesh.castShadow = false;
    group.add(mesh);
  }
  console.log(`[terrain] ${(performance.now() - t0).toFixed(0)} ms`);
  const H = nearG.userData.heights;
  const heightTex = new THREE.DataTexture(H.data, H.nx, H.nz, THREE.RGFormat, THREE.FloatType);
  heightTex.minFilter = heightTex.magFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;
  return { group, terrain: t, material: mat, heightTex, heightRect: H.rect };
}
