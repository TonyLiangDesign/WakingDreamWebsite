import * as THREE from 'three';
import { add, tube, rod, loft, spaced, v3, lerp, clamp01, extrudeProfile } from './kit.js';

// Outboards: one generic four-stroke built by outboard(), mounted single or twin on the engine
// pod by outboards(). Receives the materials and the anchors from cockpit(); builds into group.
// The engine is a generic shape with no maker's styling: a sculpted, crowned top cowl with a
// character line along each side, small slanted intake louvres at its aft shoulders and a small
// rating label, a sealed split line over a lower cowl in a neutral tone, stern brackets bolted to the pod face, power trim and tilt with chrome rams, a
// hydraulic steering cylinder on the tilt tube, rigging boot into the transom, airfoil
// midsection, anti-ventilation plate, gearcase, skeg, trim-tab anode and a 3-blade stainless prop.
// Engine-local frame: x = 0 is the cockpit's pod anchor (aft is -x, so the distance aft of it is
// d = -x), y = 0 is the top of the pod, z to starboard.

// Part-specific materials, built once and recoloured from m.cowling on every build.
const own = {};
function ownMaterials(m) {
  if (!own.cowl) {
    // Painted composite under a full clear coat: a satin base with a crisp, glossy top layer,
    // so the softboxes and the sky lie on the cowl as clean highlights.
    own.cowl = new THREE.MeshPhysicalMaterial({ roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.05 });
    // Lower cowl: the same composite in a neutral tone, a colour break under the split line.
    own.lower = new THREE.MeshPhysicalMaterial({ roughness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.12 });
    own.leg = new THREE.MeshPhysicalMaterial({ roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.35 });
    own.zinc = new THREE.MeshStandardMaterial({ color: '#8d9296', metalness: 0.55, roughness: 0.72 });
    own.bore = new THREE.MeshStandardMaterial({ color: '#0c0c0d', roughness: 0.9, side: THREE.DoubleSide });
    own.decal = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    // Recessed intake louvres, drawn with their own shading (dark slot, shadowed top edge, lit lip).
    own.vent = new THREE.MeshStandardMaterial({ map: ventTexture(), transparent: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    for (const mat of Object.values(own)) mat.userData.shared = true;
  }
  const dark = m.cowling.color.getHSL({}).l < 0.3;
  own.cowl.color.copy(m.cowling.color);
  own.cowl.roughness = dark ? 0.38 : 0.42;
  own.lower.color.set(dark ? '#3a3e43' : '#80858a');
  // Brackets, midsection and gearcase in the cowl's paint, a touch flatter.
  own.leg.color.copy(m.cowling.color).multiplyScalar(dark ? 1.25 : 0.94);
  own.decal.color.set(dark ? '#a7adb3' : '#4a5056');
  return own;
}

// Generic power-rating label: the number and FOUR STROKE, no maker's name or mark.
const decals = new Map();
function decalTexture(hp) {
  if (decals.has(hp)) return decals.get(hp);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 104px Montserrat, "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(String(hp), 6, 106);
  const w = ctx.measureText(String(hp)).width;
  ctx.font = '600 34px Montserrat, "Helvetica Neue", Arial, sans-serif';
  ctx.fillText('FOUR STROKE', w + 22, 104);
  ctx.fillRect(w + 22, 62, 500 - w - 22, 5);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  decals.set(hp, texture);
  return texture;
}

// Four short louvres slanting up and aft (u runs aft), each a dark slot with a shadowed upper
// edge and a lit lower lip, in a faint recessed panel. Neutral, so it suits either cowl colour.
function ventTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  const slant = 26;
  // Parallelogram from x0 to x1 (canvas y down), its top edge shifted aft by the slant.
  const panel = (x0, x1, y0, y1, inset = 0) => {
    ctx.beginPath();
    ctx.moveTo(x0 + inset, y1 - inset);
    ctx.lineTo(x1 - inset - slant, y1 - inset);
    ctx.lineTo(x1 - inset, y0 + inset);
    ctx.lineTo(x0 + inset + slant, y0 + inset);
    ctx.closePath();
  };
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  panel(4, 252, 6, 122);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const y = 18 + i * 26;
    const x0 = 22 + i * 6;
    const x1 = 236 - (3 - i) * 4;
    // Lit lip under the slot, the slot, and the shade inside its lower half.
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    panel(x0, x1, y + 3, y + 17);
    ctx.fill();
    ctx.fillStyle = 'rgba(8,9,10,0.96)';
    panel(x0, x1, y, y + 14);
    ctx.fill();
    ctx.fillStyle = 'rgba(40,43,46,0.9)';
    panel(x0, x1, y + 8, y + 14, 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Smooth 1-D interpolation through [v, value] pairs (cubic Hermite, Catmull-Rom tangents).
function smooth(table) {
  const xs = table.map((p) => p[0]);
  const ys = table.map((p) => p[1]);
  const n = xs.length;
  return (v) => {
    let i = 0;
    while (i < n - 2 && v > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = clamp01((v - xs[i]) / h);
    const m1 = i > 0 ? ((ys[i + 1] - ys[i - 1]) / (xs[i + 1] - xs[i - 1])) * h : ys[i + 1] - ys[i];
    const m2 = i + 2 < n ? ((ys[i + 2] - ys[i]) / (xs[i + 2] - xs[i])) * h : ys[i + 1] - ys[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * m2;
  };
}

// Grid surface from f(u, v) -> Vector3, u and v in [0, 1], turned so its faces point along out.
function patch(f, nu, nv, out) {
  const position = [];
  const uv = [];
  const index = [];
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const p = f(i / nu, j / nv);
      position.push(p.x, p.y, p.z);
      uv.push(i / nu, j / nv);
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i;
      index.push(a, a + 1, a + nu + 2, a, a + nu + 2, a + nu + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  let dot = 0;
  for (let i = 0; i < n.count; i++) dot += n.getX(i) * out.x + n.getY(i) * out.y + n.getZ(i) * out.z;
  if (dot < 0) {
    for (let k = 0; k < index.length; k += 3) [index[k + 1], index[k + 2]] = [index[k + 2], index[k + 1]];
    g.setIndex(index);
    g.computeVertexNormals();
  }
  return g;
}

// Ribbed rubber boot along a path: a tube whose radius ripples with the given pitch.
function corrugated(points, radius, ripple, pitch) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const len = curve.getLength();
  const segs = Math.ceil((len / pitch) * 4);
  const radial = 12;
  const frames = curve.computeFrenetFrames(segs, false);
  const position = [];
  const index = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const p = curve.getPointAt(u);
    const r = radius + ripple * Math.cos(((u * len) / pitch) * Math.PI * 2);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const q = p.clone().addScaledVector(frames.normals[i], Math.cos(a) * r).addScaledVector(frames.binormals[i], Math.sin(a) * r);
      position.push(q.x, q.y, q.z);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = i * radial + ((j + 1) % radial);
      index.push(a, a + radial, b, b, a + radial, b + radial);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Symmetric (NACA 00xx) section in the x-z plane at height y, leading edge dLE aft.
function foil(dLE, chord, thick, y, n = 24) {
  return Array.from({ length: n }, (_, j) => {
    const a = (j / n) * Math.PI * 2;
    const x = (1 - Math.cos(a)) / 2;
    const half = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
    return v3(-(dLE + chord * x), y, Math.sign(Math.sin(a)) * Math.max(0, half));
  });
}

// Profile [d, y] in the engine's centre plane, thick wide, with rounded edges.
function fin(points, thick, bevel = 0.004) {
  return extrudeProfile(points.map(([d, y]) => [-d, y]), Math.max(0.001, thick - 2 * bevel), bevel);
}

// Plan shape [d, z] as a plate thick deep, centred at height y.
function plate(points, thick, y, bevel = 0.004) {
  const g = extrudeProfile(points.map(([d, z]) => [-d, -z]), Math.max(0.001, thick - 2 * bevel), bevel);
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// Lathe about the engine's fore-and-aft axis from [d, r] pairs, centred at height y.
function lathe(profile, y, segments = 20) {
  const g = new THREE.LatheGeometry(profile.map(([d, r]) => new THREE.Vector2(r, d)), segments);
  g.rotateZ(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// ---------- cowl ----------

// The cowl's lines for a rating. v runs from 0 at the underside of the lower cowl to 1 at the
// crown. Sizes follow real 150 hp inline-four to 300 hp V6 cowls: 0.54 to 0.64 m wide, 0.74 to
// 0.88 m above the clamp brackets, 0.80 to 0.92 m long. Each height is a rounded plan section
// (a superellipse, narrowing aft); above vc the sections shrink on an ellipse into a crowned
// top. A character line runs along each side of the top cowl, rising aft: below it the side
// stands a few millimetres proud, and the grid rows bend to follow it, so it stays crisp.
function cowlLines(hp) {
  const k = clamp01((hp - 150) / 150);
  const W = 0.54 + 0.1 * k;
  const H = 0.74 + 0.14 * k;
  const Lc = 0.8 + 0.12 * k;
  const d0 = 0.13;      // the cowl's nose, aft of the pod face
  const yb = -0.01;     // underside of the lower cowl
  const vc = 0.8;       // where the crown begins
  const split = 0.33;   // lower / top cowl split
  const vL = 0.6;       // the character line, mid-length
  const front = smooth([[0, 0.205], [0.1, 0.16], [0.25, 0.137], [0.45, d0], [0.65, 0.142], [0.8, 0.168], [1, 0.215]]);
  const back = smooth([[0, 0.72], [0.12, 0.9], [0.3, 0.975], [0.55, 1], [0.8, 0.985], [1, 0.95]]);
  const half = smooth([[0, 0.74], [0.1, 0.87], [0.3, 0.97], [0.5, 1], [0.68, 0.965], [0.85, 0.9], [1, 0.84]]);
  const P = 2.6;
  const dMid = d0 + Lc / 2;
  // The top rises a little towards the back, like most modern cowls.
  const shear = (d) => (0.035 * (d - dMid)) / Lc;
  const crown = (v) => (v <= vc ? 1 : Math.max(0, 1 - ((v - vc) / (1 - vc)) ** 2.2) ** (1 / 2.2));
  const at = (v) => {
    const dF = front(v);
    const dB = d0 + Lc * back(v);
    const e = crown(v);
    return { dc: (dF + dB) / 2, hl: Math.max(1e-4, ((dB - dF) / 2) * e), w: Math.max(1e-4, (W / 2) * half(v) * e) };
  };
  const taper = (u) => 1 - 0.17 * Math.max(0, u) ** 1.5;
  const se = (c) => Math.sign(c) * Math.abs(c) ** (2 / P);
  const pw = (c) => Math.sign(c) * Math.abs(c) ** (P - 1);
  const step = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
  // Rows near the character line bend to follow it as it rises aft.
  const lineAt = (d) => vL + (0.09 * (d - dMid)) / Lc;
  const warp = (v, d) => v + (lineAt(d) - vL) * (1 - step(0.035, 0.15, Math.abs(v - vL)));
  const proud = (v) => 0.0042 * (1 - step(vL - 0.006, vL, v)) * step(split + 0.04, split + 0.12, v);
  // A point from plan coordinates u (-1 nose to 1 aft) and q (z over the half-width), off proud.
  // The character-line step is applied on the sides only (it fades out round the nose and aft).
  const place = (v, r, u, q, off) => {
    let d = r.dc + r.hl * u;
    let z = r.w * q * taper(u);
    const nx = pw(u) / r.hl;
    const nz = pw(q) / r.w;
    const nl = Math.hypot(nx, nz) || 1;
    const push = proud(v) * (nz / nl) ** 4 + off;
    d += (nx / nl) * push;
    z += (nz / nl) * push;
    return v3(-d, lerp(yb, H, warp(v, d)) + shear(d), z);
  };
  const ring = (v, n = 64, off = 0) => {
    const r = at(v);
    return Array.from({ length: n }, (_, j) => {
      const a = (j / n) * Math.PI * 2;
      return place(v, r, se(Math.cos(a)), se(Math.sin(a)), off);
    });
  };
  // Point on the starboard (s = 1) or port side at distance d aft and height v, off proud.
  const side = (d, v, s, off = 0) => {
    const r = at(v);
    const u = Math.min(1, Math.max(-1, (d - r.dc) / r.hl));
    return place(v, r, u, s * (1 - Math.abs(u) ** P) ** (1 / P), off);
  };
  const dB = (v) => at(v).dc + at(v).hl;
  return { k, W, H, Lc, d0, vc, split, vL, at, ring, side, dB };
}

// Indexed skin through rings of equal count, wrapped round (a shared seam, so it shades
// smoothly), optionally closed by a fan to a point (smooth: the crown) or by a flat cap on its
// own vertices (a crisp edge: the underside). Wound outward.
function skin(rings, { top, flatBottom } = {}) {
  const n = rings[0].length;
  const position = [];
  const index = [];
  for (const ring of rings) for (const p of ring) position.push(p.x, p.y, p.z);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      index.push(a, b, b + n, a, b + n, a + n);
    }
  }
  const last = (rings.length - 1) * n;
  if (top) {
    const t = position.length / 3;
    position.push(top.x, top.y, top.z);
    for (let j = 0; j < n; j++) index.push(last + j, last + ((j + 1) % n), t);
  }
  if (flatBottom) {
    const base = position.length / 3;
    const c = rings[0].reduce((acc, p) => acc.add(p), v3(0, 0, 0)).multiplyScalar(1 / n);
    for (const p of rings[0]) position.push(p.x, p.y, p.z);
    position.push(c.x, c.y, c.z);
    for (let j = 0; j < n; j++) index.push(base + ((j + 1) % n), base + j, base + n);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  // A side vertex halfway up must face away from its ring's centre.
  const i = Math.floor(rings.length / 2);
  const c = rings[i].reduce((acc, p) => acc.add(p), v3(0, 0, 0)).multiplyScalar(1 / n);
  const p = rings[i][Math.floor(n / 4)];
  const nrm = g.attributes.normal;
  if (nrm.getX(i * n + Math.floor(n / 4)) * (p.x - c.x) + nrm.getZ(i * n + Math.floor(n / 4)) * (p.z - c.z) < 0) {
    for (let k = 0; k < index.length; k += 3) [index[k + 1], index[k + 2]] = [index[k + 2], index[k + 1]];
    g.setIndex(index);
    g.computeVertexNormals();
  }
  return g;
}

function cowl(g, mats, m, hp) {
  const c = cowlLines(hp);
  const { split, vL, vc } = c;
  // Lower cowl in the neutral tone, top cowl in the paint. Rows are packed round the character
  // line (its step lies between vL - 0.006 and vL) and up into the crown.
  const lowerRows = [0, 0.012, 0.03, 0.055, 0.09, 0.135, 0.19, 0.25, 0.3, split];
  const crownRows = spaced(0, Math.PI / 2, 9).map((a) => vc + (1 - vc) * Math.sin(a)).slice(0, -1);
  const upperRows = [split, 0.36, 0.4, 0.45, 0.5, 0.54, 0.565, vL - 0.018, vL - 0.006, vL, vL + 0.008, vL + 0.022, 0.645, 0.685, 0.725, 0.765, ...crownRows, 0.9995];
  add(g, skin(lowerRows.map((v) => c.ring(v)), { flatBottom: true }), mats.lower);
  const last = c.ring(0.9995);
  const apex = last.reduce((acc, p) => acc.add(p), v3(0, 0, 0)).multiplyScalar(1 / last.length);
  add(g, skin(upperRows.map((v) => c.ring(v)), { top: apex.add(v3(0, 0.0003, 0)) }), mats.cowl);

  // Split line: a dark seal round the joint, just proud of both halves.
  add(g, tube(c.ring(split, 96, 0.0025), 0.0042, 192, 6, true), m.rubber, { cast: false });

  // Intakes: a short panel of slanted louvres high on each side at the aft shoulder, above the
  // character line. The rating label sits small, lower and further forward.
  for (const s of [1, -1]) {
    const vent = patch((u, w) => {
      const v = lerp(0.675, 0.775, w);
      const dd = c.dB(v);
      return c.side(lerp(dd - 0.29, dd - 0.085, u), v, s, 0.0018);
    }, 10, 4, v3(0, 0, s));
    add(g, vent, mats.vent, { cast: false });
    const label = patch((u, w) => {
      const v = lerp(0.455, 0.505, w);
      const dd = c.dB(v);
      return c.side(lerp(dd - 0.21, dd - 0.4, s > 0 ? u : 1 - u), v, s, 0.0022);
    }, 10, 2, v3(0, 0, s));
    add(g, label, mats.decal, { cast: false });
  }
  mats.decal.map = decalTexture(hp);
  return c;
}

// ---------- prop ----------

// One blade on a true helicoid, so the blade angle steepens towards the hub (pitch twist); the
// outline is skewed back, raked aft and the section thins to sharp edges.
// hand = 1 right-hand, -1 left-hand (the port engine of a twin).
function bladeGeometry(hand, angle, dHub, pitch, r0, r1) {
  const nr = 10;
  const ns = 10;
  const position = [];
  const index = [];
  const chord = (rho) => 0.155 * (0.56 + 0.9 * rho - 0.46 * rho * rho) * Math.sqrt(Math.max(0, 1 - rho ** 4));
  for (const face of [1, -1]) {
    const base = position.length / 3;
    for (let i = 0; i <= nr; i++) {
      const rho = i / nr;
      const r = lerp(r0, r1, rho);
      const hs = chord(rho) / (2 * r);
      const skew = 0.32 * rho * rho;
      const tmax = 0.0105 * (1 - 0.8 * rho) + 0.0012;
      for (let j = 0; j <= ns; j++) {
        const s = -1 + (2 * j) / ns;
        const t = tmax * Math.sqrt(Math.max(0, 1 - s * s)) * (1 - 0.15 * s);
        const d = dHub + (pitch / (Math.PI * 2)) * s * hs + 0.12 * (r - r0) + face * t * 0.5;
        const th = hand * (skew + s * hs) + angle;
        position.push(-d, r * Math.cos(th), r * Math.sin(th));
      }
    }
    for (let i = 0; i < nr; i++) {
      for (let j = 0; j < ns; j++) {
        const a = base + i * (ns + 1) + j;
        const b = a + ns + 1;
        if (face > 0) index.push(a, b, a + 1, b, b + 1, a + 1);
        else index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// ---------- the engine ----------

function outboard(m, hp, plateY, hand) {
  const g = new THREE.Group();
  const mats = ownMaterials(m);
  const k = cowl(g, mats, m, hp).k;

  // Stern brackets bolted to the pod face, tilt tube through their heads.
  const face = -0.012;  // the pod's aft face: its bevel stands 12 mm proud of the anchor
  const tilt = v3(-0.06, -0.005, 0);
  const bz = 0.17;
  for (const s of [1, -1]) {
    add(g, fin([[-face, 0.03], [0.03, 0.045], [0.075, 0.04], [0.105, 0.0], [0.115, -0.07], [0.07, -0.33], [-face, -0.37]], 0.022, 0.005), mats.leg).position.z = s * bz;
    // Mounting flange against the pod, with two of the four bolts showing.
    const flange = add(g, new THREE.BoxGeometry(0.014, 0.4, 0.07), mats.leg);
    flange.position.set(face - 0.007, -0.165, s * (bz - 0.012));
    for (const y of [-0.05, -0.29]) {
      const bolt = add(g, new THREE.CylinderGeometry(0.011, 0.011, 0.012, 6), m.stainless);
      bolt.position.set(face - 0.02, y, s * (bz - 0.04));
      bolt.rotation.z = Math.PI / 2;
    }
    // Trim-angle holes in the bracket side.
    for (let i = 0; i < 4; i++) {
      const hole = add(g, new THREE.CircleGeometry(0.008, 10), m.rubber, { cast: false });
      hole.position.set(-0.05 - i * 0.012, -0.12 - i * 0.03, s * (bz + 0.0115));
      if (s < 0) hole.rotation.y = Math.PI;
    }
    const nut = add(g, new THREE.CylinderGeometry(0.022, 0.022, 0.016, 6), m.stainless);
    nut.position.set(tilt.x, tilt.y, s * (bz + 0.019));
    nut.rotation.x = Math.PI / 2;
  }
  rod(g, v3(tilt.x, tilt.y, -bz - 0.03), v3(tilt.x, tilt.y, bz + 0.03), 0.014, m.stainless, 12);

  // Hydraulic steering cylinder riding on the tilt tube, link arm to the steering head.
  rod(g, v3(tilt.x, tilt.y, -0.13), v3(tilt.x, tilt.y, 0.13), 0.03, mats.leg, 16);
  for (const s of [1, -1]) {
    const cap = add(g, new THREE.CylinderGeometry(0.033, 0.033, 0.02, 16), m.galv);
    cap.position.set(tilt.x, tilt.y, s * 0.13);
    cap.rotation.x = Math.PI / 2;
    // Steering hoses up and over to a bulkhead fitting on the pod top.
    add(g, tube([v3(tilt.x, tilt.y + 0.02, s * 0.12), v3(tilt.x + 0.02, 0.07, s * 0.11), v3(0.06, 0.08, s * 0.08), v3(0.12, 0.035, s * 0.03)], 0.007, 16, 6), m.rubber);
  }
  // A 40 mm gland standing from the pod top (bedded into the mounting plate whatever its thickness).
  const fitting = add(g, new THREE.CylinderGeometry(0.022, 0.028, 0.04, 12), m.galv);
  fitting.position.set(0.12, 0.02, 0);
  rod(g, v3(tilt.x, tilt.y + 0.025, 0.04), v3(-0.13, 0.06, 0.04), 0.012, m.galv);

  // Swivel bracket and steering head, between the stern brackets.
  const swivel = add(g, new THREE.BoxGeometry(0.1, 0.38, 0.13), mats.leg);
  swivel.position.set(-0.155, -0.125, 0);
  const head = add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.08, 16), mats.leg);
  head.position.set(-0.17, 0.05, 0);

  // Power trim and tilt: housing low between the brackets, two trim rams and the tilt ram.
  const ptt = add(g, new THREE.BoxGeometry(0.075, 0.15, 0.24), mats.leg);
  ptt.position.set(-0.07, -0.29, 0);
  rod(g, v3(-0.05, -0.335, -bz), v3(-0.05, -0.335, bz), 0.012, m.stainless);
  for (const z of [-0.05, 0.05]) {
    rod(g, v3(-0.07, -0.215, z), v3(-0.07, -0.19, z), 0.024, mats.leg, 14);
    rod(g, v3(-0.07, -0.19, z), v3(-0.11, -0.11, z), 0.013, m.stainless, 12);
  }
  rod(g, v3(-0.065, -0.215, 0), v3(-0.074, -0.17, 0), 0.02, mats.leg, 14);
  rod(g, v3(-0.074, -0.17, 0), v3(-0.112, -0.05, 0), 0.011, m.stainless, 12);

  // Rigging boot from the front of the lower cowl into a grommet in the transom.
  const rz = -0.11;
  add(g, corrugated([v3(-0.17, 0.2, rz), v3(-0.09, 0.225, rz - 0.01), v3(0.06, 0.25, rz - 0.03), v3(0.26, 0.2, rz - 0.05), v3(0.42, 0.1, rz - 0.06), v3(0.52, 0.075, rz - 0.06)], 0.03, 0.0035, 0.022), m.rubber);
  const grommet = add(g, new THREE.TorusGeometry(0.036, 0.009, 8, 20), m.rubber);
  grommet.position.set(0.497, 0.075, rz - 0.06);
  grommet.rotation.y = Math.PI / 2;

  // Midsection: an airfoil leg from inside the lower cowl down to the anti-ventilation plate.
  const legScale = 0.92 + 0.08 * k;
  add(g, loft(spaced(0.03, plateY + 0.004, 6).map((y) => {
    const u = (0.03 - y) / (0.03 - plateY);
    return foil(lerp(0.2, 0.19, u), lerp(0.44, 0.33, u), lerp(0.15, 0.105, u) * legScale, y);
  })), mats.leg);
  // Idle exhaust relief, low on the back of the midsection.
  const relief = add(g, new THREE.CircleGeometry(0.014, 12), mats.bore, { cast: false });
  relief.position.set(-0.545, plateY + 0.2, 0);
  relief.rotation.y = -Math.PI / 2;
  relief.scale.set(1, 1.8, 1);

  // Anti-splash plate and the anti-ventilation plate over the prop.
  const pw = 0.13 + 0.03 * k;
  add(g, plate([[0.2, 0.05], [0.3, pw * 0.62], [0.47, pw * 0.6], [0.5, 0.04], [0.5, -0.04], [0.47, -pw * 0.6], [0.3, -pw * 0.62], [0.2, -0.05]], 0.01, plateY + 0.11), mats.leg);
  add(g, plate([[0.17, 0.045], [0.28, pw], [0.62, pw], [0.67, pw * 0.72], [0.69, 0], [0.67, -pw * 0.72], [0.62, -pw], [0.28, -pw], [0.17, -0.045]], 0.013, plateY), mats.leg);

  // Gearcase: strut, torpedo, water intakes and skeg.
  const drop = 0.215;
  const axis = plateY - drop;
  add(g, loft(spaced(plateY - 0.002, axis, 3).map((y) => {
    const u = (plateY - y) / drop;
    return foil(lerp(0.19, 0.17, u), lerp(0.33, 0.31, u), lerp(0.085, 0.072, u) * legScale, y);
  })), mats.leg);
  const R = 0.06 + 0.01 * k;
  const nose = 0.12;
  const torpedo = [[nose, 0], ...spaced(0.08, 1, 6).map((a) => [nose + R * (1 - Math.cos((a * Math.PI) / 2)), R * Math.sin((a * Math.PI) / 2)]), [0.4, R], [0.47, R * 0.96], [0.535, 0.056], [0.535, 0]];
  add(g, lathe(torpedo, axis, 22), mats.leg);
  for (const s of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const slot = add(g, new THREE.BoxGeometry(0.05, 0.006, 0.004), m.rubber, { cast: false });
      slot.position.set(-(0.26 + i * 0.005), plateY - 0.075 - i * 0.022, s * 0.031 * legScale);
      slot.rotation.z = -0.12;
    }
  }
  add(g, fin([[0.25, 0.0], [0.53, 0.0], [0.545, -0.17], [0.585, -0.228], [0.565, -0.242], [0.49, -0.215], [0.38, -0.12]], 0.022, 0.006), mats.leg).position.y = axis;
  // Trim-tab anode under the plate, behind the strut, clear of the blade tips.
  add(g, fin([[0.5, 0.0], [0.585, 0.0], [0.578, -0.018], [0.515, -0.028]], 0.014, 0.003), mats.zinc).position.y = plateY - 0.006;

  // Three-blade stainless prop, 14.5 in diameter, 19 in pitch, through-hub exhaust.
  add(g, lathe([[0.536, 0.0], [0.536, 0.055], [0.6, 0.054], [0.69, 0.05], [0.715, 0.049], [0.718, 0.044], [0.718, 0.04]], axis, 22), m.prop);
  const bore = add(g, new THREE.CircleGeometry(0.04, 18), mats.bore, { cast: false });
  bore.position.set(-0.712, axis, 0);
  bore.rotation.y = -Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    add(g, bladeGeometry(hand, 0.35 + (i * Math.PI * 2) / 3, 0.615, 0.48, 0.046, 0.184), m.prop).position.y = axis;
  }
  return g;
}

// Single on the centreline, or twin at 0.66 m centres (26 in, the usual twin-rig spacing), each
// bolted to the aft face of the engine pod. The port engine of a twin turns a left-hand prop.
export function outboards(group, m, { hp, twin, podTop, plateY, aft }) {
  for (const z of twin ? [-0.33, 0.33] : [0]) {
    const engine = outboard(m, hp, plateY, twin && z < 0 ? -1 : 1);
    engine.position.set(aft, podTop, z);
    group.add(engine);
  }
}
