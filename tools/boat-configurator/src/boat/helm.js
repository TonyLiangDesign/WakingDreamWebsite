import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { add, tube, rod, box, extrudeProfile, v3, lerp } from './kit.js';
import { DECK_Y } from './hull.js';
import { roundLoop, offsetLoop } from './cabin.js';

// Helm gear for both layouts: moulded dash with a brow, flush MFD, engine display, VHF and switch
// panel on a satin-black fascia, compass, polished wheel on a tilt column, throttle binnacle with
// trim rockers (dual for twins), phone tray and cup holders, pedestal seats (brushed column,
// footrest ring, swivel, slide, moulded shell, two-tone pleated vinyl with welts, flip-up
// bolster) and the leaning post (moulded tackle module with recessed drawers, upholstered
// bolster and backrest). Upholstery comes from pad(), one welded skin per cushion. Builds into
// the group given.
// hardtopHelm() receives the placement returned by cabin.js: { C, hw(x), wallZ(x, y) }.
// consoleHelm() receives the placement returned by console.js: { cx0, top, Wc, yTop(x), postX }.
// Both take an optional { twin } as a fourth argument for the dual binnacle, and both return the
// helmsman's anchors for the skipper (crew.js): { wheel: { rim, axis, radius }, throttle (the
// grip), and seat (hardtop: helm cushion centre, top surface) or stand (console: the leaning
// post's front face x) }.
// Hardtop: the dash is moulded wall to wall under the screen foot and fitted to the walls'
// taper; the helm pod stands proud on starboard over an open footwell, the passenger side is a
// shallow dash with a grab rail over the cuddy entrance in the forward bulkhead.

// ---------- helm-only materials, built once ----------

const ATLAS_W = 512;
const ATLAS_H = 256;
const MFD_UV = [0, 0, 320, 200];
const ENGINE_UV = [336, 0, 160, 120];
const VHF_UV = [336, 136, 160, 48];

// One canvas for every helm screen: a generic chart and sonar split page, an engine page and a
// VHF channel readout. Shown through the emissive map only; no lights are added.
function screenAtlas() {
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = ATLAS_H;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, ATLAS_W, ATLAS_H);

  // Chart page: deep water, a shallows band, a headland, contours, the track and the boat.
  g.save();
  g.beginPath();
  g.rect(0, 0, 160, 200);
  g.clip();
  g.fillStyle = '#09283f';
  g.fillRect(0, 0, 160, 200);
  g.fillStyle = '#0f3a5a';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(150, 0);
  g.bezierCurveTo(130, 50, 90, 62, 72, 112);
  g.bezierCurveTo(52, 150, 22, 152, 0, 172);
  g.fill();
  g.fillStyle = '#76684a';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(116, 0);
  g.bezierCurveTo(100, 36, 70, 46, 56, 86);
  g.bezierCurveTo(40, 116, 16, 120, 0, 136);
  g.fill();
  g.strokeStyle = 'rgba(150,200,235,0.4)';
  g.lineWidth = 1;
  for (const k of [1, 2, 3]) {
    g.beginPath();
    g.moveTo(0, 138 + k * 16);
    g.bezierCurveTo(40, 122 + k * 16, 72, 82 + k * 13, 118 + k * 12, 0);
    g.stroke();
  }
  g.strokeStyle = '#e8f1f7';
  g.lineWidth = 1.5;
  g.setLineDash([5, 4]);
  g.beginPath();
  g.moveTo(40, 192);
  g.lineTo(96, 142);
  g.lineTo(150, 96);
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = '#ff6a9a';
  g.beginPath();
  g.arc(150, 96, 4, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffae3d';
  g.beginPath();
  g.moveTo(96, 128);
  g.lineTo(102, 142);
  g.lineTo(90, 142);
  g.fill();
  g.restore();

  // Sonar page: bottom return in colour bands, a few arches, the depth scale.
  g.save();
  g.beginPath();
  g.rect(160, 0, 160, 200);
  g.clip();
  const water = g.createLinearGradient(0, 0, 0, 200);
  water.addColorStop(0, '#061a33');
  water.addColorStop(1, '#0a2448');
  g.fillStyle = water;
  g.fillRect(160, 0, 160, 200);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(90,160,235,0.3)';
  for (let i = 0; i < 260; i++) g.fillRect(160 + rnd() * 160, 16 + rnd() * 130, 1, 1);
  for (let x = 160; x < 320; x++) {
    const yb = 128 + 10 * Math.sin(x * 0.045) + 5 * Math.sin(x * 0.17 + 1);
    for (const [dy, h, col] of [[0, 4, '#d8342a'], [4, 4, '#f08a24'], [8, 6, '#c9b43a'], [14, 200, '#2e3466']]) {
      g.fillStyle = col;
      g.fillRect(x, yb + dy, 1, h);
    }
  }
  g.lineWidth = 2;
  for (const [x, y, col] of [[196, 70, '#f0c040'], [232, 96, '#e86a30'], [262, 58, '#f0c040'], [290, 104, '#7fd0ff']]) {
    g.strokeStyle = col;
    g.beginPath();
    g.arc(x, y + 6, 6, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  }
  g.fillStyle = 'rgba(220,235,245,0.75)';
  g.font = '9px sans-serif';
  g.textAlign = 'right';
  for (const [y, t] of [[50, '10'], [100, '20'], [150, '30']]) {
    g.fillRect(312, y, 6, 1);
    g.fillText(t, 309, y + 3);
  }
  g.restore();
  g.fillStyle = '#8fa3b2';
  g.fillRect(159, 0, 2, 200);
  g.fillStyle = 'rgba(8,12,16,0.9)';
  g.fillRect(0, 0, 320, 14);
  g.fillRect(0, 182, 320, 18);
  g.fillStyle = '#dfe9f0';
  g.textAlign = 'left';
  g.font = 'bold 10px sans-serif';
  g.fillText('22.4 kn', 6, 195);
  g.fillText('18.6 m', 86, 195);
  g.fillText('17.9 °C', 166, 195);
  g.fillText('COG 047°', 240, 195);
  g.font = '9px sans-serif';
  g.fillText('CHART', 6, 10);
  g.fillText('SONAR', 166, 10);
  g.textAlign = 'right';
  g.fillText('10:42', 314, 10);

  // Engine page: tacho arc and needle, rpm and trim readouts.
  const [ex, ey] = ENGINE_UV;
  g.fillStyle = '#04080c';
  g.fillRect(ex, ey, 160, 120);
  const cx = ex + 80;
  const cy = ey + 68;
  const R = 46;
  g.lineWidth = 6;
  for (const [a0, a1, col] of [[0.8, 2.2, '#1b3043'], [0.8, 1.62, '#5cc8ff'], [2.02, 2.2, '#e0412f']]) {
    g.strokeStyle = col;
    g.beginPath();
    g.arc(cx, cy, R, Math.PI * a0, Math.PI * a1);
    g.stroke();
  }
  g.strokeStyle = '#e6eef4';
  g.lineWidth = 1.5;
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (0.8 + (1.4 * i) / 8);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (R - 13), cy + Math.sin(a) * (R - 13));
    g.lineTo(cx + Math.cos(a) * (R - 7), cy + Math.sin(a) * (R - 7));
    g.stroke();
  }
  g.strokeStyle = '#ff8c3a';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(Math.PI * 1.62) * (R - 10), cy + Math.sin(Math.PI * 1.62) * (R - 10));
  g.stroke();
  g.fillStyle = '#e6eef4';
  g.textAlign = 'center';
  g.font = 'bold 17px sans-serif';
  g.fillText('3850', cx, cy + 22);
  g.font = '8px sans-serif';
  g.fillText('RPM', cx, cy + 32);
  g.textAlign = 'left';
  g.fillText('TRIM 12', ex + 6, ey + 12);
  g.textAlign = 'right';
  g.fillText('FUEL 74%', ex + 154, ey + 12);

  // VHF readout.
  const [vx, vy, vw, vh] = VHF_UV;
  g.fillStyle = '#0b1d0f';
  g.fillRect(vx, vy, vw, vh);
  g.fillStyle = '#8af0a0';
  g.textAlign = 'left';
  g.font = 'bold 32px sans-serif';
  g.fillText('16', vx + 10, vy + vh - 10);
  g.font = '11px sans-serif';
  g.fillText('CH', vx + 58, vy + 18);
  g.fillText('25W', vx + 58, vy + 36);
  g.fillText('DSC', vx + 108, vy + 18);
  g.fillText('WX', vx + 108, vy + 36);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Pleated vinyl insert: one channel per repeat across u, with a row of lock stitching just
// inside each seam (u = 0 and 1) in a pale thread; v runs along the channel at 0.2 m per repeat.
// The grey of the insert lives in the map, so the material colour stays white.
function stitchTexture() {
  const W = 64;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#80868c';
  g.fillRect(0, 0, W, H);
  // A faint grain so the vinyl never reads as flat paint up close.
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) {
    const v = 110 + rnd() * 40;
    g.fillStyle = `rgba(${v},${v + 4},${v + 8},0.25)`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1);
  }
  // Seam shadow either side of the channel edge, then the stitch rows.
  for (const x of [0, W - 3]) {
    g.fillStyle = 'rgba(40,44,48,0.35)';
    g.fillRect(x, 0, 3, H);
  }
  g.fillStyle = '#dedbd3';
  for (const x of [5, W - 7]) for (let y = 0; y < H; y += 8) g.fillRect(x, y + 1, 2, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

let cache = null;
function helmMaterials(m) {
  if (cache) return cache;
  // Brushed pedestal alloy: the shared brushed map, turned to run along the column.
  const brushed = m.galv.roughnessMap ? m.galv.roughnessMap.clone() : null;
  if (brushed) {
    brushed.center.set(0.5, 0.5);
    brushed.rotation = Math.PI / 2;
    brushed.repeat.set(1, 4);
    brushed.needsUpdate = true;
  }
  cache = {
    // Dark glass: the page shows through the emissive map, the clearcoat gives the reflections.
    screen: new THREE.MeshPhysicalMaterial({
      color: '#030507', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04,
      emissive: '#ffffff', emissiveMap: screenAtlas(), emissiveIntensity: 1.05,
    }),
    fascia: new THREE.MeshStandardMaterial({ color: '#1a1c1e', roughness: 0.82 }),
    // Anti-glare dash top: a charcoal, dead-flat finish, a step lighter than the fascia.
    antiglare: new THREE.MeshStandardMaterial({ color: '#2a2d30', roughness: 0.95 }),
    bezel: new THREE.MeshStandardMaterial({ color: '#0b0c0d', roughness: 0.3 }),
    // Marine vinyl: off-white body and bolsters, grey pleated inserts, charcoal welt piping.
    vinyl: new THREE.MeshPhysicalMaterial({ color: '#ebe8e1', roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.45 }),
    insert: new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: stitchTexture(), roughness: 0.6, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    piping: new THREE.MeshStandardMaterial({ color: '#34383c', roughness: 0.5 }),
    // Moulded seat shells: light grey satin polymer.
    shell: new THREE.MeshStandardMaterial({ color: '#a4a9ad', roughness: 0.38 }),
    // Satin black for the throttle body, swivel housing and seat hardware.
    satin: new THREE.MeshStandardMaterial({ color: '#1d1f21', roughness: 0.4, metalness: 0.2 }),
    // Brushed anodised alloy for the pedestal columns.
    post: new THREE.MeshStandardMaterial({ color: '#cfd3d6', metalness: 0.75, roughness: 0.38, roughnessMap: brushed }),
    // Polished stainless for the wheel, cup-holder rims and grab handles: brighter in the environment.
    polished: new THREE.MeshStandardMaterial({ color: '#f1f3f5', metalness: 1, roughness: 0.07, envMapIntensity: 1.6 }),
    // Shadow gap behind the leaning post's drawer faces.
    recess: new THREE.MeshStandardMaterial({ color: '#1b1d1f', roughness: 0.85 }),
    led: new THREE.MeshStandardMaterial({ color: '#0d2a14', emissive: '#3ddc6a', emissiveIntensity: 0.9 }),
  };
  for (const mat of Object.values(cache)) mat.userData.shared = true;
  return cache;
}

// ---------- upholstery ----------

const clampTo = (u, lo, hi) => Math.min(hi, Math.max(lo, u));
const smooth01 = (u) => { const t = clampTo(u, 0, 1); return t * t * (3 - 2 * t); };
const bump = (u) => (Math.abs(u) >= 1 ? 0 : (1 - u * u) ** 2);
// Roll knots: the fillet of radius r at each end of a half-length L, sampled at equal angles.
const ROLL = [0, 0.414, 1];

// Knots along one axis: both rolls, the extra knots asked for, and fill to keep gaps under step.
function padKnots(L, r, extra, step) {
  const inner = L - r;
  let ks = [];
  for (const t of ROLL) ks.push(inner + r * t, -(inner + r * t));
  for (const e of extra) if (Math.abs(e) < inner - 0.002) ks.push(e);
  ks.sort((p, q) => p - q);
  ks = ks.filter((k, i) => i === 0 || k - ks[i - 1] > 0.0015);
  const out = [ks[0]];
  for (let i = 1; i < ks.length; i++) {
    const gap = ks[i] - ks[i - 1];
    const n = Math.ceil(gap / step - 1e-6);
    for (let k = 1; k < n; k++) out.push(ks[i - 1] + (gap * k) / n);
    out.push(ks[i]);
  }
  return out;
}

// Upholstered pad (or moulded shell): a subdivided box w (x) by d (z) by h (y, from 0 up), its
// edges rolled to rh across and rv over the top (rb at the bottom), the top crowned and dished,
// with an optional insert panel quilted into channels. Built as one welded, smooth skin; the
// triangles of the insert come back as their own geometry for the grey vinyl.
//   panel: [fx, fz] insert half-size as a fraction of the top; channels: count; seamAxis: the
//   axis the seams are spaced along ('x' or 'z'); dishAxis: the axis whose ends are raised.
// Returns { border, insert (or null), piping (welt round the top edge, or null) }.
function pad(w, d, h, o = {}) {
  const {
    rh = 0.035, rv = 0.03, rb = 0.012, crown = 0, dish = 0, dishAxis = 'z',
    panel = null, channels = 4, seamAxis = 'z', groove = 0.0045, puff = 0.005, gw = 0.0065,
    step = 0.1, bottom = false, piping = false,
  } = o;
  const a = w / 2;
  const b = d / 2;
  const P = panel ? [panel[0] * a, panel[1] * b] : null;
  const ex = { x: [], z: [] };
  const seams = [];
  let ps = 0;
  let cw = 1;
  if (P) {
    for (const [k, p] of [['x', P[0]], ['z', P[1]]]) for (const sg of [-1, 1]) ex[k].push(sg * (p - gw), sg * p, sg * (p + gw));
    ps = seamAxis === 'x' ? P[0] : P[1];
    cw = (2 * ps) / channels;
    for (let k = 0; k < channels; k++) {
      const s0 = -ps + k * cw;
      ex[seamAxis].push(s0 + cw / 2);
      if (k > 0) {
        seams.push(s0);
        ex[seamAxis].push(s0 - gw, s0, s0 + gw);
      }
    }
  }
  const X = padKnots(a, rh, ex.x, step);
  const Z = padKnots(b, rh, ex.z, step);
  const Y = [0, rb];
  const yTop = h - rv;
  const nIn = Math.max(1, Math.ceil((yTop - rb) / 0.06));
  for (let k = 1; k < nIn; k++) Y.push(lerp(rb, yTop, k / nIn));
  Y.push(yTop, yTop + rv * 0.414, h);

  // Box skin, welded by box position.
  const boxP = [];
  const ids = new Map();
  const vid = (x, y, z) => {
    const key = `${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
    let i = ids.get(key);
    if (i === undefined) {
      i = boxP.length / 3;
      boxP.push(x, y, z);
      ids.set(key, i);
    }
    return i;
  };
  const tris = [];
  const face = (U, V, at, N) => {
    const grid = U.map((u) => V.map((v) => vid(...at(u, v))));
    const p0 = at(U[0], V[0]);
    const p1 = at(U[1], V[0]);
    const p2 = at(U[0], V[1]);
    const e1 = v3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const e2 = v3(p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]);
    const flip = e1.cross(e2).dot(v3(...N)) < 0;
    for (let i = 0; i < U.length - 1; i++) {
      for (let j = 0; j < V.length - 1; j++) {
        const A = grid[i][j];
        const B = grid[i + 1][j];
        const C = grid[i + 1][j + 1];
        const D = grid[i][j + 1];
        if (flip) tris.push(A, C, B, A, D, C);
        else tris.push(A, B, C, A, C, D);
      }
    }
  };
  face(X, Z, (x, z) => [x, h, z], [0, 1, 0]);
  face(X, Y, (x, y) => [x, y, b], [0, 0, 1]);
  face(X, Y, (x, y) => [x, y, -b], [0, 0, -1]);
  face(Z, Y, (z, y) => [a, y, z], [1, 0, 0]);
  face(Z, Y, (z, y) => [-a, y, z], [-1, 0, 0]);
  if (bottom) face(X, Z, (x, z) => [x, 0, z], [0, -1, 0]);

  // Roll the edges, crown and dish the top, quilt the insert.
  const deform = (x, y, z) => {
    const qx = clampTo(x, rh - a, a - rh);
    const qy = clampTo(y, rb, h - rv);
    const qz = clampTo(z, rh - b, b - rh);
    const ry = y > qy ? rv : rb;
    let nx = (x - qx) / rh;
    let ny = (y - qy) / ry;
    let nz = (z - qz) / rh;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const px = qx + nx * rh;
    let py = qy + ny * ry;
    const pz = qz + nz * rh;
    const lift = (py / h) ** 2;
    const ux = clampTo(x / a, -1, 1);
    const uz = clampTo(z / b, -1, 1);
    py += crown * (1 - ux * ux) * (1 - uz * uz) * lift;
    const ud = dishAxis === 'x' ? ux : uz;
    py += dish * ud * ud * lift;
    if (P) {
      const up = Math.max(0, ny) ** 2;
      const sd = Math.max(Math.abs(x) - P[0], Math.abs(z) - P[1]);
      let q = -1.25 * groove * bump(sd / gw);
      if (sd < 0) {
        const s = seamAxis === 'x' ? x : z;
        const f = (s + ps) / cw;
        const inside = smooth01(-sd / 0.018);
        q += puff * Math.sin(Math.PI * (f - Math.floor(f))) * inside;
        for (const sk of seams) q -= groove * bump((s - sk) / gw) * smooth01(-sd / gw);
      }
      py += q * up;
    }
    return [px, py, pz];
  };

  const n = boxP.length / 3;
  const pos = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = [boxP[3 * i], boxP[3 * i + 1], boxP[3 * i + 2]];
    pos.set(deform(x, y, z), 3 * i);
    if (P) {
      const s = seamAxis === 'x' ? x : z;
      const t = seamAxis === 'x' ? z : x;
      // A single wide panel takes the plain middle of the map: no stitch rows across it.
      uv[2 * i] = channels > 1 ? (s + ps) / cw : 0.5 + (0.35 * s) / ps;
      uv[2 * i + 1] = t / 0.2;
    } else {
      uv[2 * i] = x / w + 0.5;
      uv[2 * i + 1] = z / d + 0.5;
    }
  }
  const whole = new THREE.BufferGeometry();
  whole.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  whole.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  whole.setIndex(tris);
  whole.computeVertexNormals();

  let insert = null;
  let border = whole;
  if (P) {
    const inIdx = [];
    const outIdx = [];
    for (let k = 0; k < tris.length; k += 3) {
      let cx = 0;
      let cy = 0;
      let cz = 0;
      for (let j = 0; j < 3; j++) {
        cx += boxP[3 * tris[k + j]];
        cy += boxP[3 * tris[k + j] + 1];
        cz += boxP[3 * tris[k + j] + 2];
      }
      const inside = cy / 3 > h - 1e-6 && Math.max(Math.abs(cx / 3) - P[0], Math.abs(cz / 3) - P[1]) < 0;
      (inside ? inIdx : outIdx).push(tris[k], tris[k + 1], tris[k + 2]);
    }
    const part = (idx) => {
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) g.setAttribute(name, whole.getAttribute(name));
      g.setIndex(idx);
      return g;
    };
    insert = part(inIdx);
    border = part(outIdx);
  }

  // Welt piping round the top edge, on the 45 degree line of the roll.
  let pipingGeo = null;
  if (piping) {
    // Finer than the skin round the corners, so the spline cannot cut inside the roll.
    const fine = [0, 11.25, 22.5, 33.75, 45].map((deg) => Math.tan((deg * Math.PI) / 180));
    const edgeKnots = (L, r) => {
      const ks = fine.map((t) => L - r + r * t);
      return [...ks.slice().reverse().map((k) => -k), -(L - r) / 3, (L - r) / 3, ...ks];
    };
    const ekx = edgeKnots(a, rh);
    const ekz = edgeKnots(b, rh);
    const loop = [];
    for (const x of ekx) loop.push([x, h, b]);
    for (const z of ekz.slice().reverse()) loop.push([a, h, z]);
    for (const x of ekx.slice().reverse()) loop.push([x, h, -b]);
    for (const z of ekz) loop.push([-a, h, z]);
    const pts = [];
    for (const p of loop) {
      const q = v3(...deform(...p));
      if (!pts.length || q.distanceTo(pts[pts.length - 1]) > 1e-4) pts.push(q);
    }
    if (pts[0].distanceTo(pts[pts.length - 1]) < 1e-4) pts.pop();
    pipingGeo = new THREE.TubeGeometry(new LoopCurve(pts), pts.length, 0.0042, 5, true);
  }
  return { border, insert, piping: pipingGeo };
}

// Closed polyline sampled by point index rather than arc length, so a tube through it gets one
// segment per point: dense round the welt's corners, sparse along its straight runs.
class LoopCurve extends THREE.Curve {
  constructor(pts) {
    super();
    this.pts = pts;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const n = this.pts.length;
    const f = (((t % 1) + 1) % 1) * n;
    const i = Math.floor(f);
    return target.copy(this.pts[i % n]).lerp(this.pts[(i + 1) % n], f - i);
  }

  getUtoTmapping(u) {
    return u;
  }
}

// Adds a pad's meshes to parent at pos, turned by rotZ about z (-pi/2 stands the pad's top up to
// face forward, +pi/2 to face aft); mat is the body material (vinyl, or the shell for mouldings).
function placePad(parent, hm, geos, pos, rotZ = 0, mat = hm.vinyl) {
  const meshes = [add(parent, geos.border, mat)];
  if (geos.insert) meshes.push(add(parent, geos.insert, hm.insert));
  if (geos.piping) meshes.push(add(parent, geos.piping, hm.piping, { cast: false }));
  for (const mesh of meshes) {
    mesh.position.copy(pos);
    mesh.rotation.z = rotZ;
  }
  return meshes;
}

// ---------- small helpers ----------

// Frame on a raked face from bot to top (x-y points; across is +z): u runs up the face, n is its
// outward normal, at(f, z, out) is the point a fraction f up the face, lifted out along n.
function rakedFace(bot, top, lift = 0) {
  const u = v3(top[0] - bot[0], top[1] - bot[1], 0);
  const len = u.length();
  u.normalize();
  const n = v3(-u.y, u.x, 0);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(0, 0, 1), u, n));
  const at = (f, z, out = 0) => v3(bot[0], bot[1], z).addScaledVector(u, f * len).addScaledVector(n, out + lift);
  return { u, n, len, q, at, tilt: Math.atan2(u.x, u.y) };
}

function onFace(mesh, face, f, z, out) {
  mesh.quaternion.copy(face.q);
  mesh.position.copy(face.at(f, z, out));
  return mesh;
}

// Profile extruded across z0..z1; pass wallZ to pull anything outboard of the walls onto them.
function moulding(points, z0, z1, wallZ = null, bevel = 0.008) {
  const g = extrudeProfile(points, z1 - z0, bevel);
  g.translate(0, 0, (z0 + z1) / 2);
  if (!wallZ) return g;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const lim = wallZ(p.getX(i), p.getY(i));
    const z = p.getZ(i);
    if (Math.abs(z) > lim) p.setZ(i, Math.sign(z) * lim);
  }
  return g;
}

// Moulded part: a side profile (x-y points, either winding) with filleted corners (radii per
// point), extruded across z0..z1 with a rounded edge of radius b all round, so it reads as a
// one-piece moulding rather than a cut box. The outline stays where the points put it.
function roundedMoulding(points, radii, z0, z1, b = 0.015) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    area += x0 * y1 - x1 * y0;
  }
  const ccw = area > 0 ? points : points.slice().reverse();
  const rr = area > 0 ? radii : radii.slice().reverse();
  const loop = offsetLoop(roundLoop(ccw, rr, 4, 0.06), -b);
  const shape = new THREE.Shape(loop.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0 - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, z0 + b);
  // Smooth across the fillets and the rounded edge, so the moulding shades as one surface.
  const smooth = toCreasedNormals(g, Math.PI / 5);
  g.dispose();
  return smooth;
}

function atlasPlane(w, h, [px, py, pw, ph]) {
  const g = new THREE.PlaneGeometry(w, h);
  const u0 = px / ATLAS_W;
  const u1 = (px + pw) / ATLAS_W;
  const vt = 1 - py / ATLAS_H;
  const vb = 1 - (py + ph) / ATLAS_H;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, vt, u1, vt, u0, vb, u1, vb], 2));
  return g;
}

// ---------- instruments ----------

// Fascia: the satin-black instrument panel laid on a face, 8 mm proud.
function fascia(group, hm, face, z0, z1, f0, f1) {
  const g = new RoundedBoxGeometry(z1 - z0, (f1 - f0) * face.len, 0.01, 1, 0.003);
  onFace(add(group, g, hm.fascia), face, (f0 + f1) / 2, (z0 + z1) / 2, 0.003);
}

// Flush-mounted display on the fascia front: a thin gloss bezel with the glass just proud of it.
function flushScreen(group, hm, face, f, z, w, h, uv, rim = 0.011) {
  onFace(add(group, new RoundedBoxGeometry(w + 2 * rim, h + 2 * rim, 0.008, 1, 0.003), hm.bezel), face, f, z, 0.001);
  onFace(add(group, atlasPlane(w, h, uv), hm.screen, { cast: false }), face, f, z, 0.0065);
}

// Fixed-mount VHF: channel readout and two knobs in one bezel.
function vhfRadio(group, m, hm, face, f, z) {
  onFace(add(group, new RoundedBoxGeometry(0.2, 0.062, 0.01, 1, 0.003), hm.bezel), face, f, z, 0.001);
  onFace(add(group, atlasPlane(0.12, 0.036, VHF_UV), hm.screen, { cast: false }), face, f, z - 0.03, 0.0065);
  for (const dz of [0.05, 0.078]) {
    const knob = add(group, new THREE.CylinderGeometry(0.01, 0.011, 0.014, 10), m.rubber);
    knob.position.copy(face.at(f, z + dz, 0.012));
    knob.quaternion.setFromUnitVectors(v3(0, 1, 0), face.n);
  }
}

// Brushed alloy switch panel with rows of toggles, each with a status LED above it.
function switchPanel(group, m, hm, face, f, z, cols, rows) {
  const w = 0.03 * cols + 0.026;
  const h = 0.044 * rows + 0.014;
  onFace(add(group, new RoundedBoxGeometry(w, h, 0.006, 1, 0.002), m.galv), face, f, z, 0.002);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dz = -w / 2 + 0.028 + c * 0.03;
      const up = h / 2 - 0.03 - r * 0.044;
      const base = face.at(f, z + dz, 0.005).addScaledVector(face.u, up);
      const nut = add(group, new THREE.CylinderGeometry(0.0055, 0.0055, 0.005, 6), m.stainless, { cast: false });
      nut.position.copy(base);
      nut.quaternion.setFromUnitVectors(v3(0, 1, 0), face.n);
      const lever = (r + c) % 3 === 0 ? -0.007 : 0.007;
      rod(group, base, base.clone().addScaledVector(face.n, 0.017).addScaledVector(face.u, lever), 0.0022, m.stainless, 6);
      const led = add(group, new THREE.BoxGeometry(0.005, 0.005, 0.003), hm.led, { cast: false });
      led.position.copy(base).addScaledVector(face.u, 0.017);
      led.quaternion.copy(face.q);
    }
  }
}

function compass(group, m, x, y, z, r = 0.058) {
  const base = add(group, new THREE.CylinderGeometry(r, r * 1.15, 0.034, 20), m.rubber);
  base.position.set(x, y + 0.015, z);
  const card = add(group, new THREE.CylinderGeometry(r * 0.78, r * 0.78, 0.016, 20), m.seat, { cast: false });
  card.position.set(x, y + 0.038, z);
  const lubber = add(group, new THREE.BoxGeometry(0.012, 0.004, 0.003), m.navRed, { cast: false });
  lubber.position.set(x + r * 0.62, y + 0.047, z);
  const dome = add(group, new THREE.SphereGeometry(r * 0.9, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, { cast: false });
  dome.position.set(x, y + 0.031, z);
}

// Wheel on a tilt column: rubber boot from the dash, knuckle, then the shaft tilted a little
// further up to a dished three-spoke wheel. tilt is the face angle from vertical. Returns the rim
// centre and the wheel's axis (pointing at the helmsman).
function helmWheel(group, m, hm, base, tilt, radius = 0.175) {
  const n = v3(-Math.cos(tilt), Math.sin(tilt), 0);
  const knuckle = base.clone().addScaledVector(n, 0.075);
  rod(group, base.clone().addScaledVector(n, -0.01), knuckle, 0.034, m.rubber, 14);
  // Rubber boot rings on the column.
  for (const f of [0.25, 0.5, 0.75]) {
    const ring = add(group, new THREE.TorusGeometry(0.034, 0.004, 4, 12), m.rubber, { cast: false });
    ring.position.copy(base).addScaledVector(n, -0.01 + f * 0.085);
    ring.quaternion.setFromUnitVectors(v3(0, 0, 1), n);
  }
  const joint = add(group, new THREE.SphereGeometry(0.03, 12, 8), hm.satin);
  joint.position.copy(knuckle);
  const axis = v3(-Math.cos(tilt + 0.16), Math.sin(tilt + 0.16), 0);
  const centre = knuckle.clone().addScaledVector(axis, 0.1);
  rod(group, knuckle, centre, 0.017, hm.satin, 12);
  const hub = add(group, new THREE.CylinderGeometry(0.042, 0.05, 0.05, 20), m.rubber);
  hub.position.copy(centre);
  hub.quaternion.setFromUnitVectors(v3(0, 1, 0), axis);
  // Polished centre cap with its nut.
  const cap = add(group, new THREE.CylinderGeometry(0.03, 0.034, 0.012, 20), hm.polished);
  cap.position.copy(centre).addScaledVector(axis, 0.03);
  cap.quaternion.copy(hub.quaternion);
  const nut = add(group, new THREE.CylinderGeometry(0.011, 0.011, 0.01, 6), hm.polished, { cast: false });
  nut.position.copy(centre).addScaledVector(axis, 0.04);
  nut.quaternion.copy(hub.quaternion);
  // Polished stainless rim and three spokes, dished toward the helmsman.
  const rimC = centre.clone().addScaledVector(axis, 0.035);
  const rim = add(group, new THREE.TorusGeometry(radius, 0.0125, 8, 48), hm.polished);
  rim.position.copy(rimC);
  rim.quaternion.setFromUnitVectors(v3(0, 0, 1), axis);
  const across = v3(0, 0, 1);
  const up = new THREE.Vector3().crossVectors(axis, across);
  for (const a of [0, Math.PI, Math.PI * 1.5]) {
    const dir = across.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    rod(group, centre.clone().addScaledVector(dir, 0.04).addScaledVector(axis, 0.012), rimC.clone().addScaledVector(dir, radius - 0.01), 0.0078, hm.polished, 8);
  }
  return { rim: rimC, axis, radius };
}

// Top-mount throttle and shift binnacle on a flat at y, levers raking aft (-x). Satin body on
// a rubber gasket with a raised pivot dome, polished arms, trim rocker on each grip, neutral and
// trim buttons on the body. Single: a T-grip; twin: two arms with ball knobs.
function binnacle(group, m, hm, x, y, z, twin) {
  const wz = twin ? 0.15 : 0.11;
  add(group, new RoundedBoxGeometry(0.19, 0.008, wz + 0.016, 1, 0.003), m.rubber).position.set(x, y + 0.004, z);
  const body = add(group, new RoundedBoxGeometry(0.17, 0.085, wz, 3, 0.03), hm.satin);
  body.position.set(x, y + 0.05, z);
  const dome = add(group, new THREE.CylinderGeometry(0.042, 0.042, wz - 0.012, 22), hm.satin);
  dome.position.set(x + 0.008, y + 0.086, z);
  dome.rotation.x = Math.PI / 2;
  // Chrome bezel strip round the dome ends and the button cluster on the aft face.
  for (const s of [-1, 1]) {
    const bez = add(group, new THREE.TorusGeometry(0.04, 0.0035, 4, 18), hm.polished, { cast: false });
    bez.position.set(x + 0.008, y + 0.086, z + s * (wz / 2 - 0.005));
  }
  for (const [dz, mat] of [[-0.022, m.rubber], [0.022, m.rubber]]) {
    const btn = add(group, new THREE.CylinderGeometry(0.009, 0.009, 0.008, 12), mat, { cast: false });
    btn.position.set(x - 0.085, y + 0.06, z + dz);
    btn.rotation.z = Math.PI / 2;
  }
  const ledN = add(group, new THREE.BoxGeometry(0.003, 0.005, 0.01), hm.led, { cast: false });
  ledN.position.set(x - 0.0855, y + 0.077, z);
  const levers = twin ? [z - 0.038, z + 0.038] : [z];
  for (const zl of levers) {
    const hubL = add(group, new THREE.CylinderGeometry(0.03, 0.03, twin ? 0.022 : 0.034, 18), hm.satin);
    hubL.position.set(x + 0.008, y + 0.086, zl);
    hubL.rotation.x = Math.PI / 2;
    const capL = add(group, new THREE.CylinderGeometry(0.016, 0.016, (twin ? 0.022 : 0.034) + 0.004, 14), hm.polished, { cast: false });
    capL.position.copy(hubL.position);
    capL.rotation.x = Math.PI / 2;
    const arm = [v3(x + 0.006, y + 0.1, zl), v3(x - 0.004, y + 0.15, zl), v3(x - 0.022, y + 0.2, zl), v3(x - 0.05, y + 0.238, zl)];
    add(group, tube(arm, 0.0095, 10, 8), m.stainless);
    if (twin) {
      const knob = add(group, new THREE.SphereGeometry(0.023, 16, 12), m.rubber);
      knob.position.set(x - 0.058, y + 0.25, zl);
      knob.scale.set(1, 0.92, 0.9);
      const rocker = add(group, new RoundedBoxGeometry(0.016, 0.006, 0.011, 1, 0.0025), hm.shell, { cast: false });
      rocker.position.set(x - 0.064, y + 0.2705, zl);
    } else {
      // T-grip across the arm with polished end caps, the trim rocker on top at the inboard end.
      const grip = add(group, new THREE.CapsuleGeometry(0.017, 0.085, 4, 14), m.rubber);
      grip.position.set(x - 0.055, y + 0.246, zl);
      grip.rotation.x = Math.PI / 2;
      for (const s of [-1, 1]) {
        const end = add(group, new THREE.CylinderGeometry(0.012, 0.012, 0.004, 12), hm.polished, { cast: false });
        end.position.set(x - 0.055, y + 0.246, zl + s * 0.0605);
        end.rotation.x = Math.PI / 2;
      }
      const rocker = add(group, new RoundedBoxGeometry(0.02, 0.009, 0.026, 1, 0.003), hm.shell, { cast: false });
      rocker.position.set(x - 0.055, y + 0.265, zl - 0.026);
    }
  }
}

// Handset on a clip, with a coiled cord down to the panel; normal is the face it hangs on (+-z or -x).
function vhfHandset(group, m, at, normal) {
  const across = Math.abs(normal.z) > 0.5 ? v3(1, 0, 0) : v3(0, 0, 1);
  const clip = add(group, new THREE.BoxGeometry(0.03, 0.05, 0.03), m.rubber);
  clip.position.copy(at).addScaledVector(normal, 0.004);
  clip.quaternion.setFromUnitVectors(v3(0, 0, 1), normal);
  const handset = add(group, new RoundedBoxGeometry(0.055, 0.11, 0.032, 1, 0.013), m.rubber);
  handset.position.copy(at).addScaledVector(normal, 0.03).add(v3(0, -0.02, 0));
  handset.quaternion.setFromUnitVectors(v3(0, 0, 1), normal);
  const top = handset.position.clone().add(v3(0, -0.06, 0));
  const end = at.clone().addScaledVector(normal, 0.004).add(v3(0, -0.2, 0)).addScaledVector(across, 0.03);
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const s = i / 64;
    const a = s * Math.PI * 2 * 12;
    const coil = Math.sin(Math.PI * Math.min(1, s * 1.15)) * 0.008;
    pts.push(top.clone().lerp(end, s).addScaledVector(normal, Math.cos(a) * coil + 0.01 * Math.sin(Math.PI * s)).addScaledVector(across, Math.sin(a) * coil));
  }
  add(group, tube(pts, 0.0024, 72, 3), m.rubber, { cast: false });
}

// Rubber phone tray on a flat at y, its long side across the boat, with a phone lying in it.
function phoneTray(group, m, hm, x, y, z) {
  add(group, new RoundedBoxGeometry(0.1, 0.02, 0.18, 2, 0.008), m.rubber).position.set(x, y + 0.008, z);
  const well = add(group, new RoundedBoxGeometry(0.082, 0.004, 0.162, 1, 0.0015), hm.recess, { cast: false });
  well.position.set(x, y + 0.0172, z);
  const phone = add(group, new RoundedBoxGeometry(0.072, 0.008, 0.148, 2, 0.003), hm.bezel, { cast: false });
  phone.position.set(x, y + 0.0205, z + 0.004);
  phone.rotation.y = 0.04;
}

// Flush cup holder in a flat at y: polished rim, dark rubber well.
function cupHolder(group, m, hm, x, y, z) {
  const rim = add(group, new THREE.TorusGeometry(0.041, 0.0045, 4, 22), hm.polished, { cast: false });
  rim.position.set(x, y + 0.0035, z);
  rim.rotation.x = Math.PI / 2;
  rim.scale.z = 0.6;
  const well = add(group, new THREE.CircleGeometry(0.039, 24), m.rubber, { cast: false });
  well.position.set(x, y + 0.0028, z);
  well.rotation.x = -Math.PI / 2;
}

// ---------- seats ----------

// Pedestal under a helm seat whose swivel top is at yHead: bolted, chamfered base plate, flared
// foot, brushed alloy column, footrest ring on three spokes from a clamp collar, upper collar and
// swivel housing with its lock lever.
function pedestal(s, m, hm, yHead) {
  const plate = add(s, new THREE.CylinderGeometry(0.148, 0.158, 0.012, 28), hm.post);
  plate.position.y = DECK_Y + 0.006;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const bolt = add(s, new THREE.CylinderGeometry(0.0085, 0.0095, 0.008, 6), m.stainless, { cast: false });
    bolt.position.set(Math.cos(a) * 0.125, DECK_Y + 0.015, Math.sin(a) * 0.125);
  }
  const foot = add(s, new THREE.CylinderGeometry(0.046, 0.072, 0.06, 24), hm.post);
  foot.position.y = DECK_Y + 0.012 + 0.03;
  const y0 = DECK_Y + 0.07;
  const y1 = yHead - 0.075;
  const col = add(s, new THREE.CylinderGeometry(0.037, 0.037, y1 - y0 + 0.02, 24), hm.post);
  col.position.y = (y0 + y1) / 2;
  // Footrest ring: about 0.3 m off the floor, 0.4 m across.
  const yF = DECK_Y + 0.3;
  const clampC = add(s, new THREE.CylinderGeometry(0.047, 0.047, 0.05, 20), hm.satin);
  clampC.position.y = yF;
  const ring = add(s, new THREE.TorusGeometry(0.2, 0.011, 6, 36), m.stainless);
  ring.position.y = yF + 0.012;
  ring.rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / 3;
    const c = v3(Math.cos(a), 0, Math.sin(a));
    rod(s, c.clone().multiplyScalar(0.044).setY(yF), c.clone().multiplyScalar(0.194).setY(yF + 0.012), 0.0085, m.stainless, 8);
  }
  const collar = add(s, new THREE.CylinderGeometry(0.05, 0.05, 0.045, 20), hm.satin);
  collar.position.y = yHead - 0.075;
  const housing = add(s, new THREE.CylinderGeometry(0.085, 0.07, 0.04, 24), hm.satin);
  housing.position.y = yHead - 0.03;
  const flange = add(s, new THREE.CylinderGeometry(0.095, 0.095, 0.01, 24), hm.post);
  flange.position.y = yHead - 0.005;
  // Swivel lock lever out to the front quarter, black knob on the end.
  rod(s, v3(0.055, yHead - 0.03, -0.055), v3(0.16, yHead - 0.045, -0.15), 0.0055, m.stainless, 6);
  const knob = add(s, new THREE.SphereGeometry(0.014, 10, 8), m.rubber);
  knob.position.set(0.163, yHead - 0.046, -0.153);
  knob.scale.set(1.3, 1, 1.3);
}

// Pedestal helm seat facing forward (+x) at (x, z): pedestal, slide on its rails with the release
// bar, a moulded shell tray carrying the pleated cushion, a flip-up front bolster on a piano hinge
// with side pivots, and a reclined backrest (pleated, winged front; upholstered back with a grab
// handle) on a stem from the tray. Two-tone vinyl (off-white body, grey pleated inserts),
// charcoal welts. About 0.5 m wide and 0.68 m fore and aft; cushion top at cushionTop.
function pedestalSeat(group, m, hm, x, z, cushionTop = DECK_Y + 0.63) {
  const s = new THREE.Group();
  s.position.set(x, 0, z);
  group.add(s);
  const yHead = cushionTop - 0.2;
  pedestal(s, m, hm, yHead);

  // Slide: carrier plate on the swivel, two rails, the seat frame on them, release bar in front.
  box(s, m.galv, [0.26, 0.008, 0.24], [0, yHead + 0.004, 0]);
  for (const dz of [-0.115, 0.115]) {
    add(s, new RoundedBoxGeometry(0.36, 0.016, 0.03, 1, 0.004), m.stainless).position.set(-0.01, yHead + 0.016, dz);
  }
  box(s, hm.satin, [0.32, 0.022, 0.28], [-0.03, yHead + 0.035, 0]);
  add(s, tube([v3(0.13, yHead + 0.02, -0.1), v3(0.19, yHead + 0.018, -0.07), v3(0.2, yHead + 0.018, 0), v3(0.19, yHead + 0.018, 0.07), v3(0.13, yHead + 0.02, 0.1)], 0.0055, 14, 6), m.stainless, { cast: false });

  // Shell tray and cushion: the cushion's open underside sits down inside the tray.
  const yTray = yHead + 0.044;
  const trayX0 = -0.255;
  const trayX1 = 0.165;
  placePad(s, hm, pad(trayX1 - trayX0, 0.5, 0.075, { rh: 0.03, rv: 0.02, rb: 0.022, bottom: true, step: 0.12 }), v3((trayX0 + trayX1) / 2, yTray, 0), 0, hm.shell);
  const cBot = yTray + 0.035;
  const crown = 0.014;
  const dish = 0.02;
  placePad(s, hm, pad(0.34, 0.46, cushionTop - cBot - crown, {
    rh: 0.04, rv: 0.035, rb: 0.012, crown, dish, panel: [0.66, 0.62], channels: 5, seamAxis: 'z', piping: true,
  }), v3(-0.01, cBot, 0));

  // Flip-up bolster: its own moulded base on a piano hinge at the tray front, pivots each side.
  const bx = 0.226;
  placePad(s, hm, pad(0.112, 0.5, 0.05, { rh: 0.025, rv: 0.02, rb: 0.02, bottom: true, step: 0.12 }), v3(bx, yTray + 0.025, 0), 0, hm.shell);
  placePad(s, hm, pad(0.108, 0.46, cushionTop + 0.012 - (yTray + 0.06), { rh: 0.045, rv: 0.045, rb: 0.012, dish, piping: true, step: 0.1 }), v3(bx, yTray + 0.06, 0));
  const hinge = add(s, new THREE.CylinderGeometry(0.0065, 0.0065, 0.42, 10), m.stainless, { cast: false });
  hinge.position.set(0.1665, yTray + 0.008, 0);
  hinge.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const plate = add(s, new RoundedBoxGeometry(0.07, 0.036, 0.004, 1, 0.0015), m.stainless, { cast: false });
    plate.position.set(0.167, yTray + 0.04, side * 0.252);
    const pin = add(s, new THREE.CylinderGeometry(0.011, 0.011, 0.008, 14), hm.satin, { cast: false });
    pin.position.set(0.167, yTray + 0.04, side * 0.256);
    pin.rotation.x = Math.PI / 2;
  }

  // Backrest: reclined 11 degrees. A pleated front pad with horizontal channels and raised
  // wings, an upholstered back with a plain grey panel, welted both sides of a moulded core board
  // that shows as a grey line between them; polished grab handle across the back near the top,
  // and a satin stem down to the tray.
  const back = new THREE.Group();
  back.position.set(-0.262, cushionTop - 0.035, 0);
  back.rotation.z = 0.19;
  s.add(back);
  add(back, new RoundedBoxGeometry(0.014, 0.43, 0.43, 1, 0.005), hm.shell).position.set(0, 0.225, 0);
  placePad(back, hm, pad(0.44, 0.44, 0.075, {
    rh: 0.04, rv: 0.035, rb: 0.012, crown: 0.012, dish: 0.045, panel: [0.64, 0.6], channels: 4, seamAxis: 'x', piping: true,
  }), v3(0.003, 0.225, 0), -Math.PI / 2);
  placePad(back, hm, pad(0.44, 0.44, 0.045, {
    rh: 0.04, rv: 0.03, rb: 0.012, crown: 0.022, panel: [0.62, 0.56], channels: 1, seamAxis: 'z', puff: 0.003, piping: true,
  }), v3(-0.003, 0.225, 0), Math.PI / 2);
  const hy = 0.36;
  add(back, tube([v3(-0.058, hy, -0.13), v3(-0.095, hy + 0.025, -0.12), v3(-0.108, hy + 0.045, 0), v3(-0.095, hy + 0.025, 0.12), v3(-0.058, hy, 0.13)], 0.0095, 16, 6), hm.polished);
  for (const side of [-1, 1]) {
    const foot = add(back, new THREE.CylinderGeometry(0.016, 0.018, 0.014, 12), hm.satin, { cast: false });
    foot.position.set(-0.058, hy, side * 0.13);
    foot.rotation.z = Math.PI / 2;
  }
  const stem = add(s, new RoundedBoxGeometry(0.035, 0.13, 0.12, 1, 0.008), hm.shell);
  stem.position.set(-0.262, yTray + 0.085, 0);
  stem.rotation.z = 0.19;
}

// ---------- hardtop ----------

export function hardtopHelm(group, m, { C, hw, wallZ }, { twin = false } = {}) {
  const hm = helmMaterials(m);
  const [Cx, Cy] = C;
  const walls = (x, y) => wallZ(x, y) - 0.004;
  const xB = Cx - 0.07;         // forward bulkhead, just aft of the screen foot
  // Dash top just above the screen foot, but never more than 1.2 m off the floor: it must stay
  // under the cabin's window sills (DECK_Y + 1.23). When the foot is higher, a raked lip under
  // the glass climbs from the dash top to the foot.
  const dTop = Math.min(Cy + 0.035, DECK_Y + 1.2);
  const xT = xB - 0.27;         // aft edge of the dash top, under the brow
  // Underside of the helm pod where it meets the bulkhead; kept under the pod face's foot so
  // the pod profile cannot fold over on a low dash.
  const yKnee = Math.min(DECK_Y + 0.58, dTop - 0.45);
  const wHelm = walls(xT, dTop - 0.2);
  const zw = wHelm - 0.4;       // wheel and helm seat centreline
  // MFD sized to the dash: 9" on the 550, 10" on the 620 and 680 (a 12" would squeeze the
  // cuddy doorway under the passenger dash).
  const diag = (wHelm > 0.64 ? 10 : 9) * 0.0254;
  const mfdW = diag * 0.848;
  const mfdH = diag * 0.53;
  const zM = zw - 0.175 - 0.03 - mfdW / 2;
  const zIn = zM - mfdW / 2 - 0.06;  // inboard cheek of the helm pod

  // Dash top wall to wall: nose tucked under the screen foot, flat top, rounded brow lip. The
  // underside follows the lower of the foot and the dash top so the profile never inverts.
  const yUnder = Math.min(Cy - 0.05, dTop - 0.05);
  add(group, moulding([[Cx - 0.005, Math.min(Cy - 0.05, dTop - 0.085)], [Cx - 0.005, Cy - 0.022], [xB, dTop], [xT + 0.02, dTop], [xT - 0.012, dTop - 0.012], [xT - 0.014, dTop - 0.04], [xT + 0.04, dTop - 0.05], [xB + 0.03, yUnder]], -1.5, 1.5, walls), m.trim);
  // Anti-glare top.
  // (The moulding's 8 mm bevel puts its skin at dTop + 0.008; the cap's top is at dTop + 0.015.)
  add(group, moulding([[xT + 0.03, dTop + 0.004], [xB - 0.012, dTop + 0.004], [xB - 0.012, dTop + 0.012], [xT + 0.03, dTop + 0.012]], -1.5, 1.5, (x, y) => walls(x, y) - 0.01, 0.003), hm.antiglare);
  const yDeck = dTop + 0.013;  // what stands on the dash top is sunk 2 mm into the cap
  // Helm pod: raked face under the brow, underside sweeping forward to the bulkhead.
  const fTop = [xT + 0.03, dTop - 0.04];
  const fBot = [xT - 0.11, dTop - 0.37];
  add(group, moulding([fTop, fBot, [xT - 0.085, dTop - 0.405], [xB, yKnee], [xB + 0.03, yKnee], [xB + 0.03, dTop - 0.045]], zIn, 1.5, walls), m.trim);
  // Passenger dash: shallow, near-vertical face, a step back from the helm pod.
  add(group, moulding([[xT + 0.03, dTop - 0.04], [xT + 0.008, dTop - 0.15], [xT + 0.03, dTop - 0.185], [xB, dTop - 0.25], [xB + 0.03, dTop - 0.25], [xB + 0.03, dTop - 0.045]], -1.5, zIn, walls), m.trim);

  // Forward bulkhead with the cuddy entrance under the passenger dash.
  const door = { z0: -(walls(xB, DECK_Y + 0.5) - 0.13), z1: zIn - 0.07, y0: DECK_Y + 0.1, y1: dTop - 0.33, r: 0.12 };
  bulkhead(group, m, xB, DECK_Y, dTop - 0.04, (y) => walls(xB, y), door);

  // Fascia and instruments on the helm face.
  const face = rakedFace(fBot, fTop, 0.008);
  const front = rakedFace(fBot, fTop, 0.016);
  const fl = (metres) => metres / face.len;
  const zF0 = zIn + 0.025;
  const zF1 = walls(xT - 0.04, dTop - 0.1) - 0.035;
  fascia(group, hm, face, zF0, zF1, 0.07, 0.93);
  const fMfd = 0.9 - fl(mfdH / 2 + 0.011);
  flushScreen(group, hm, front, fMfd, zM, mfdW, mfdH, MFD_UV);
  vhfRadio(group, m, hm, front, fMfd - fl(mfdH / 2 + 0.011 + 0.045), zM);
  flushScreen(group, hm, front, 0.9 - fl(0.05), zw, 0.1, 0.075, ENGINE_UV);
  switchPanel(group, m, hm, front, 0.42, Math.min(zw + 0.255, zF1 - 0.07), 3, 3);
  const key = add(group, new THREE.CylinderGeometry(0.016, 0.018, 0.01, 14), m.stainless);
  key.position.copy(front.at(0.16, Math.min(zw + 0.255, zF1 - 0.07), 0.004));
  key.quaternion.setFromUnitVectors(v3(0, 1, 0), front.n);
  const wheel = helmWheel(group, m, hm, front.at(0.5, zw, 0), face.tilt);
  compass(group, m, xT + 0.12, yDeck, zw);
  const zThr = walls(xT + 0.115, dTop + 0.2) - (twin ? 0.1 : 0.08);
  binnacle(group, m, hm, xT + 0.115, yDeck, zThr, twin);
  vhfHandset(group, m, v3(xT + 0.04, dTop - 0.25, zIn - 0.008), v3(0, 0, -1));
  phoneTray(group, m, hm, xT + 0.15, yDeck, zM);
  for (const dz of [-0.052, 0.052]) cupHolder(group, m, hm, xT + 0.13, yDeck, -zw + dz);

  // Passenger grab rail along the port dash.
  const gz0 = -(walls(xT, dTop - 0.1) - 0.1);
  const gz1 = zIn - 0.1;
  const gx = xT - 0.055;
  add(group, tube([v3(xT + 0.012, dTop - 0.1, gz0), v3(gx, dTop - 0.1, gz0 + 0.04), v3(gx, dTop - 0.1, gz1 - 0.04), v3(xT + 0.012, dTop - 0.1, gz1)], 0.012, 16, 6), m.stainless);

  // Footrest bar under the helm on the bulkhead.
  add(group, tube([v3(xB, DECK_Y + 0.22, zw - 0.2), v3(xB - 0.13, DECK_Y + 0.24, zw - 0.17), v3(xB - 0.13, DECK_Y + 0.24, zw + 0.17), v3(xB, DECK_Y + 0.22, zw + 0.2)], 0.0125, 16, 6), m.stainless);

  // Helm and passenger seats, cushion front about a third of a metre aft of the wheel rim.
  const seatX = wheel.rim.x - 0.6;
  // Seats 0.5 m wide with 0.4 m footrest rings need 0.54 m between centres: on the narrow 550
  // cabin they sit a little outboard of the wheel line rather than touch.
  const seatZ = Math.max(zw, 0.27);
  pedestalSeat(group, m, hm, seatX, seatZ);
  pedestalSeat(group, m, hm, seatX, -seatZ);
  return { wheel, throttle: v3(xT + 0.05, yDeck + 0.15, zThr), seat: v3(seatX, DECK_Y + 0.63, seatZ) };
}

// Rounded-top doorway outline in the bulkhead's shape plane (X = -z, Y = y), grown by g.
function doorShape({ z0, z1, y0, y1, r }, g = 0) {
  const a = -z1 - g;
  const b = -z0 + g;
  const top = y1 + g;
  const rr = r + g;
  const s = new THREE.Shape();
  s.moveTo(a, y0 - g);
  s.lineTo(b, y0 - g);
  s.lineTo(b, top - rr);
  s.absarc(b - rr, top - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(a + rr, top);
  s.absarc(a + rr, top - rr, rr, Math.PI / 2, Math.PI, false);
  s.closePath();
  return s;
}

// Shape-plane geometry stood up in the y-z plane at x (X = -z maps back to +z).
const standUp = (g, x) => g.rotateY(Math.PI / 2).translate(x, 0, 0);

// Forward bulkhead wall to wall at x from y0 to y1, with a flanged doorway and a dark curtain.
function bulkhead(group, m, x, y0, y1, zAt, door) {
  const ys = Array.from({ length: 7 }, (_, i) => lerp(y0, y1, i / 6));
  const outline = [...ys.map((y) => [-zAt(y), y]), ...ys.slice().reverse().map((y) => [zAt(y), y])];
  const shape = new THREE.Shape(outline.map(([X, Y]) => new THREE.Vector2(X, Y)));
  shape.holes.push(doorShape(door, 0.02));
  add(group, standUp(new THREE.ShapeGeometry(shape, 6), x), m.trim);
  const flange = doorShape(door, 0.04);
  flange.holes.push(doorShape(door, 0));
  add(group, standUp(new THREE.ExtrudeGeometry(flange, { depth: 0.06, bevelEnabled: false, curveSegments: 6 }), x - 0.016), m.trim);
  // No curtain: the doorway stays open so the V-berth cushions read through it.
  const edge = [];
  for (const p of doorShape(door, 0.004).getPoints(6)) {
    const q = v3(x - 0.016, p.y, -p.x);
    if (!edge.length || q.distanceTo(edge[edge.length - 1]) > 1e-4) edge.push(q);
  }
  if (edge[0].distanceTo(edge[edge.length - 1]) < 1e-4) edge.pop();
  add(group, tube(edge, 0.006, edge.length * 2, 4, true), m.rubber, { cast: false });
}

// ---------- centre console ----------

export function consoleHelm(group, m, { cx0, top, Wc, yTop, postX }, { twin = false } = {}) {
  const hm = helmMaterials(m);
  const yA = yTop(cx0);
  // Instrument pod on the console top, to port of the throttle pad.
  const zP0 = -0.3;
  const zP1 = 0.17;
  const pBot = [cx0 + 0.035, yA + 0.03];
  const pTop = [cx0 + 0.165, yA + 0.215];
  // Moulded in one piece: filleted profile, rounded side edges, a soft brow over the fascia.
  add(group, roundedMoulding(
    [[cx0 + 0.02, yA - 0.03], [cx0 + 0.02, yA + 0.015], pBot, pTop, [cx0 + 0.14, yA + 0.235], [cx0 + 0.16, yA + 0.25], [cx0 + 0.25, yA + 0.25], [cx0 + 0.285, yA + 0.15], [cx0 + 0.285, yA - 0.03]],
    [0.002, 0.008, 0.012, 0.008, 0.006, 0.01, 0.05, 0.06, 0.002], zP0, zP1, 0.016), m.trim);
  const face = rakedFace(pBot, pTop, 0.008);
  const front = rakedFace(pBot, pTop, 0.016);
  const fl = (metres) => metres / face.len;
  fascia(group, hm, face, zP0 + 0.025, zP1 - 0.025, 0.06, 0.93);
  const diag = 10 * 0.0254;
  const mfdW = diag * 0.848;
  const mfdH = diag * 0.53;
  const zM = zP0 + 0.035 + mfdW / 2 + 0.011;
  flushScreen(group, hm, front, 0.5, zM, mfdW, mfdH, MFD_UV);
  flushScreen(group, hm, front, 0.88 - fl(0.04), zM + mfdW / 2 + 0.011 + 0.064, 0.08, 0.06, ENGINE_UV);
  const key = add(group, new THREE.CylinderGeometry(0.014, 0.016, 0.01, 14), m.stainless);
  key.position.copy(front.at(0.25, zM + mfdW / 2 + 0.075, 0.004));
  key.quaternion.setFromUnitVectors(v3(0, 1, 0), front.n);
  compass(group, m, cx0 + 0.205, yA + 0.255, (zP0 + zP1) / 2, 0.045);

  // Aft face: wheel on a mounting pad, switch panel and VHF to port, handset to starboard.
  const aft = rakedFace([cx0, DECK_Y], [cx0, yA]);
  const fa = (y) => (y - DECK_Y) / (yA - DECK_Y);
  const zW = -0.01;
  const wheelPad = add(group, new THREE.CylinderGeometry(0.075, 0.08, 0.02, 20), hm.fascia);
  wheelPad.position.set(cx0 - 0.004, yA - 0.13, zW);
  wheelPad.rotation.z = Math.PI / 2;
  const wheel = helmWheel(group, m, hm, v3(cx0 - 0.012, yA - 0.13, zW), 0.32);
  fascia(group, hm, aft, -0.345, -0.135, fa(yA - 0.31), fa(yA - 0.06));
  const panelFront = rakedFace([cx0, DECK_Y], [cx0, yA], 0.008);
  switchPanel(group, m, hm, panelFront, fa(yA - 0.115), -0.24, 4, 2);
  vhfRadio(group, m, hm, panelFront, fa(yA - 0.255), -0.24);
  const thrZ = Math.min(0.26, Wc / 2 - 0.16);
  binnacle(group, m, hm, cx0 + 0.11, yTop(cx0 + 0.11) - 0.003, thrZ, twin);
  vhfHandset(group, m, v3(cx0 - 0.002, yA - 0.2, thrZ), v3(-1, 0, 0));
  add(group, tube([v3(cx0 + 0.005, DECK_Y + 0.2, -0.28), v3(cx0 - 0.12, DECK_Y + 0.22, -0.25), v3(cx0 - 0.12, DECK_Y + 0.22, 0.25), v3(cx0 + 0.005, DECK_Y + 0.2, 0.28)], 0.0125, 16, 6), m.stainless);

  leaningPost(group, m, hm, postX);
  return { wheel, throttle: v3(cx0 + 0.04, yTop(cx0 + 0.11) + 0.15, thrZ), stand: postX + 0.08 };
}

// Leaning post: moulded tackle module with drawers on its aft face, vinyl bolster on top,
// stainless frame carrying the backrest and a top rail (the rocket launcher option sits on it,
// at postX - 0.3, DECK_Y + 1.26), rod holders on the module's outboard sides and a footrest bar
// in front.
function leaningPost(group, m, hm, postX) {
  const xp = postX - 0.12;
  const W = 0.72;
  const yBase = DECK_Y + 0.68;
  // Moulded module in the console colour: generous radii, on a toe-kick plinth set in at the aft
  // face.
  const yKick = DECK_Y + 0.075;
  add(group, new RoundedBoxGeometry(0.4, yBase - yKick, W, 4, 0.045), m.trim).position.set(xp, (yKick + yBase) / 2, 0);
  add(group, new RoundedBoxGeometry(0.33, yKick - DECK_Y + 0.02, W - 0.05, 2, 0.015), m.trim).position.set(xp + 0.03, (DECK_Y + yKick + 0.02) / 2 - 0.002, 0);
  // Tackle drawers on the aft face: a moulded surround standing 14 mm proud, the drawer faces set
  // back inside it with a dark shadow gap all round, each with a stainless bar pull on standoffs.
  const xF = xp - 0.2;                 // module's aft face
  const zb = W / 2 - 0.075;            // half-width of the drawer bank
  const drawers = [[DECK_Y + 0.155, 0.13], [DECK_Y + 0.297, 0.13], [DECK_Y + 0.439, 0.165]];
  const yb0 = drawers[0][0] - 0.008;
  const yb1 = drawers[2][0] + drawers[2][1] + 0.008;
  add(group, new RoundedBoxGeometry(0.006, yb1 - yb0, 2 * zb, 1, 0.002), hm.recess, { cast: false }).position.set(xF - 0.002, (yb0 + yb1) / 2, 0);
  const lip = 0.014;
  const rail = (y0, y1, z0, z1) => add(group, new RoundedBoxGeometry(lip + 0.004, y1 - y0, z1 - z0, 2, 0.005), m.trim).position.set(xF - lip / 2 + 0.002, (y0 + y1) / 2, (z0 + z1) / 2);
  const rw = 0.018;
  rail(yb0 - rw, yb0, -zb - rw, zb + rw);
  rail(yb1, yb1 + rw, -zb - rw, zb + rw);
  rail(yb0, yb1, -zb - rw, -zb);
  rail(yb0, yb1, zb, zb + rw);
  for (let i = 0; i < drawers.length - 1; i++) rail(drawers[i][0] + drawers[i][1] + 0.001, drawers[i + 1][0] - 0.001, -zb, zb);
  for (const [y, h] of drawers) {
    const face = add(group, new RoundedBoxGeometry(0.012, h - 0.008, 2 * zb - 0.012, 2, 0.004), m.trim);
    face.position.set(xF - 0.001, y + h / 2, 0);
    const yp = y + h - 0.038;
    const xpull = xF - 0.034;
    rod(group, v3(xpull, yp, -0.075), v3(xpull, yp, 0.075), 0.0055, m.stainless, 10);
    for (const dz of [-0.065, 0.065]) rod(group, v3(xF - 0.006, yp, dz), v3(xpull, yp, dz), 0.0045, m.stainless, 8);
  }
  // Bolster: upholstered to match the helm seats, a little crown, pleats running fore and aft.
  placePad(group, hm, pad(0.3, W - 0.02, 0.12, {
    rh: 0.05, rv: 0.05, rb: 0.012, crown: 0.012, dish: 0.012, panel: [0.6, 0.7], channels: 6, seamAxis: 'z', piping: true,
  }), v3(xp + 0.03, yBase - 0.006, 0));
  // Frame: uprights from the module's aft corners up to the top rail, then across.
  const xr = postX - 0.3;
  const yr = DECK_Y + 1.26;
  for (const side of [-1, 1]) {
    add(group, tube([v3(xp - 0.16, yBase - 0.02, side * 0.3), v3(xp - 0.175, yBase + 0.3, side * 0.3), v3(xr, yr - 0.05, side * 0.3), v3(xr, yr, side * 0.27)], 0.019, 20, 8), m.stainless);
    const plate = add(group, new THREE.CylinderGeometry(0.035, 0.035, 0.008, 14), m.stainless);
    plate.position.set(xp - 0.16, yBase + 0.002, side * 0.3);
  }
  rod(group, v3(xr, yr, -0.275), v3(xr, yr, 0.275), 0.016, m.stainless);
  // Backrest pad on the uprights.
  const lean = Math.atan2(xp - 0.175 - xr, yr - 0.05 - yBase - 0.3);
  // (pad +y, its face, turned to point forward along (cos lean, sin lean); centred where the old
  // box was.)
  const backC = v3(lerp(xp - 0.175, xr, 0.5) + 0.06, (yBase + 0.3 + yr - 0.05) / 2, 0);
  const tB = 0.075;
  const backPos = backC.clone().add(v3(-tB / 2 * Math.cos(lean), -tB / 2 * Math.sin(lean), 0));
  placePad(group, hm, pad(0.3, W - 0.12, tB, {
    rh: 0.035, rv: 0.035, rb: 0.012, crown: 0.01, panel: [0.6, 0.7], channels: 3, seamAxis: 'x', piping: true,
  }), backPos, lean - Math.PI / 2);
  // Rod holders: two a side on the module's outboard faces, raked about 15 degrees aft and 10
  // outboard, each held off the face by two clamp blocks with a band round the tube. They stand
  // clear of the bolster (z 0.35), the frame uprights (z 0.3) and the backrest.
  const zFace = W / 2;
  const rakeAft = Math.tan(15 * Math.PI / 180);
  const rakeOut = Math.tan(10 * Math.PI / 180);
  const hLen = 0.34;
  for (const side of [-1, 1]) {
    for (const x0 of [xp + 0.09, xp - 0.09]) {
      const a = v3(x0, DECK_Y + 0.42, side * (zFace + 0.03));
      const b = a.clone().add(v3(-rakeAft * hLen, hLen, side * rakeOut * hLen));
      const dir = b.clone().sub(a).normalize();
      rod(group, a, b, 0.022, m.stainless, 14);
      const rim = add(group, new THREE.TorusGeometry(0.022, 0.004, 6, 16), m.stainless, { cast: false });
      rim.position.copy(b);
      rim.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
      const cap = add(group, new THREE.CircleGeometry(0.018, 12), m.rubber, { cast: false });
      cap.position.copy(b).addScaledVector(dir, -0.006);
      cap.quaternion.copy(rim.quaternion);
      for (const f of [0.15, 0.55]) {
        const c = a.clone().lerp(b, f);
        const gap = Math.abs(c.z) - zFace;
        box(group, m.dash, [0.05, 0.045, gap], [c.x, c.y, side * (zFace + gap / 2 - 0.004)]);
        const band = add(group, new THREE.CylinderGeometry(0.026, 0.026, 0.035, 14), m.dash);
        band.position.copy(c);
        band.quaternion.setFromUnitVectors(v3(0, 1, 0), dir);
      }
    }
  }
  // Footrest bar across the front.
  add(group, tube([v3(xp + 0.198, DECK_Y + 0.2, -0.27), v3(xp + 0.27, DECK_Y + 0.21, -0.24), v3(xp + 0.27, DECK_Y + 0.21, 0.24), v3(xp + 0.198, DECK_Y + 0.2, 0.27)], 0.0125, 16, 6), m.stainless);
}
