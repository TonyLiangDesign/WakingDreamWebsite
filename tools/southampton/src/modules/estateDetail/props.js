import * as THREE from 'three';
import { M4 } from './fb.js';

const Q = 4.6;

export function defineProps(inst) {
  inst.define('crate', (b) => { b.gbox('crate', -0.5, 0, -0.5, 1, 1, 1); });
  inst.define('bale', (b) => { b.gbox('sack', -0.5, 0, -0.5, 1, 1, 1); });
  inst.define('barrel', (b) => {
    const g = new THREE.LatheGeometry([[0.3, 0], [0.38, 0.45], [0.3, 0.9], [0, 0.9]].map(([r, y]) => new THREE.Vector2(r, y)), 6);
    b.add('barrel', g, null);
  });
  inst.define('sack', (b) => { b.cbox('sack', 0, 0.16, 0, 0.9, 0.32, 0.55, 0, 0, 0, true); });
  // horseless dray / cart with shafts resting on the ground
  inst.define('dray', (b) => {
    b.box('timber', -1.8, 1.0, -0.9, 3.6, 0.12, 1.8);
    for (const z of [-0.95, 0.85]) b.box('timberDark', -1.8, 1.12, z, 3.6, 0.25, 0.1);
    for (const x of [-1.2, 1.2]) for (const z of [-0.95, 0.95]) b.add('timberDark', CART_WHEEL, M4(x, 0.5, z, Math.PI / 2, 0, 0));
    b.box('castIron', -1.25, 0.46, -0.9, 0.08, 0.08, 1.8);
    b.box('castIron', 1.15, 0.46, -0.9, 0.08, 0.08, 1.8);
    for (const z of [-0.5, 0.5]) b.strut('timberDark', [1.8, 1.0, z], [4.2, 0.08, z * 0.8], 0.09);
  });
  inst.define('handcart', (b) => {
    b.box('timber', -0.9, 0.55, -0.55, 1.8, 0.08, 1.1);
    for (const z of [-0.62, 0.62]) b.add('timberDark', SMALL_WHEEL, M4(0.1, 0.45, z, Math.PI / 2, 0, 0));
    for (const z of [-0.4, 0.4]) b.strut('timberDark', [-0.9, 0.6, z], [-2.0, 0.05, z], 0.06);
  });
  // c.1910 motor lorry (Leyland/Dennis type): bonnet, open cab with roof, flatbed, solid tyres
  inst.define('lorry', (b) => {
    b.box('black', -3.0, 0.55, -0.8, 6.0, 0.25, 1.6);
    b.box('lorryPaint', 1.9, 0.8, -0.65, 1.1, 0.9, 1.3); // bonnet
    b.box('black', 2.95, 0.75, -0.6, 0.12, 0.95, 1.2); // radiator
    b.box('lorryPaint', 0.9, 0.8, -1.0, 1.0, 0.9, 2.0); // cab lower
    b.box('lorryPaint', 0.7, 2.3, -1.05, 1.4, 0.08, 2.1); // cab roof
    for (const z of [-0.98, 0.9]) for (const x of [0.72, 1.82]) b.box('black', x, 1.7, z, 0.08, 0.62, 0.08);
    b.box('timber', -3.1, 0.8, -1.05, 3.9, 0.12, 2.1);
    for (const z of [-1.05, 0.95]) b.box('timber', -3.1, 0.92, z, 3.9, 0.45, 0.1);
    b.box('crate', -2.8, 0.92, -0.8, 1.3, 1.0, 1.6);
    b.box('sack', -1.3, 0.92, -0.9, 1.2, 0.6, 1.8);
    for (const [x, z] of [[2.1, -0.85], [2.1, 0.85], [-2.0, -0.85], [-2.0, 0.85]]) b.add('black', LORRY_WHEEL, M4(x, 0.46, z, Math.PI / 2, 0, 0));
  });
  // taxi-cab landaulette (Unic / Renault AG)
  inst.define('taxi', (b) => {
    b.box('black', -1.9, 0.45, -0.7, 3.8, 0.2, 1.4);
    b.box('taxiPaint', 0.9, 0.6, -0.55, 0.9, 0.65, 1.1);
    b.box('taxiPaint', -1.8, 0.62, -0.78, 2.7, 0.9, 1.56);
    b.box('black', -1.8, 1.52, -0.78, 1.6, 0.55, 1.56);
    b.box('glass', -0.2, 1.52, -0.7, 0.05, 0.5, 1.4);
    b.box('black', -0.25, 2.05, -0.8, 1.05, 0.06, 1.6);
    for (const [x, z] of [[1.3, -0.72], [1.3, 0.72], [-1.3, -0.72], [-1.3, 0.72]]) b.add('black', CAR_WHEEL, M4(x, 0.38, z, Math.PI / 2, 0, 0));
  });
  inst.define('lamp', (b) => {
    b.add('lamp', new THREE.CylinderGeometry(0.2, 0.26, 0.6, 6), M4(0, 0.3, 0));
    b.add('lamp', new THREE.CylinderGeometry(0.08, 0.13, 4.6, 5), M4(0, 2.9, 0));
    b.box('lamp', -0.45, 4.6, -0.03, 0.9, 0.05, 0.06);
    b.add('lampGlass', new THREE.CylinderGeometry(0.3, 0.18, 0.6, 4), M4(0, 5.45, 0, 0, Math.PI / 4, 0));
    b.add('lamp', new THREE.ConeGeometry(0.36, 0.35, 4), M4(0, 5.92, 0, 0, Math.PI / 4, 0));
  });
  inst.define('bollardPost', (b) => { b.add('castIron', new THREE.CylinderGeometry(0.14, 0.18, 1.0, 6), M4(0, 0.5, 0)); });
  // boats: origin at waterline centre, +x toward the bow
  inst.define('sailingBarge', (b) => {
    const L = 26, W = 6.2;
    const hull = hullGeo(L, W, 2.6, 0.25);
    b.add('hullBlack', hull, M4(0, -1.4, 0));
    b.box('timber', -L / 2 + 0.6, 1.18, -W / 2 + 0.5, L - 3, 0.06, W - 1.0);
    b.box('canvas', -5, 1.2, -2.0, 11, 0.5, 4.0); // hatch covers
    b.box('timberDark', -L / 2 + 0.3, 1.2, -1.0, 2.2, 0.9, 2.0); // wheel shelter / tiller
    b.cyl('timberDark', 5.5, 12.5, 0, 0.16, 0.26, 22, 6);
    b.cyl('timberDark', -L / 2 + 2.5, 5.2, 0, 0.08, 0.1, 8, 5); // mizzen
    b.strut('timberDark', [5.5, 2.5, 0.1], [-6, 17, 0.1], 0.18); // sprit
    b.add('tanSail', new THREE.CylinderGeometry(0.5, 0.7, 14, 6), M4(4.8, 10.5, 0.4, 0, 0, 0.12)); // brailed mainsail
    b.add('tanSail', new THREE.CylinderGeometry(0.25, 0.35, 5, 6), M4(8.5, 4.5, 0, 0, 0, -0.35));
    b.box('timberDark', -L / 2 + 3, 1.0, W / 2 - 0.1, 5, 2.4, 0.2, 0.35); // leeboard
    b.rod('castIron', [5.5, 23, 0], [L / 2 + 3, 2.2, 0], 0.03, 3);
    b.rod('castIron', [5.5, 23, 0], [-L / 2 + 1, 1.8, 0], 0.03, 3);
  });
  inst.define('lighter', (b) => {
    const L = 22, W = 6.5;
    b.add('hullBlack', hullGeo(L, W, 2.4, 0.9, true), M4(0, -1.2, 0));
    b.box('hold', -L / 2 + 2.5, -0.55, -W / 2 + 0.5, L - 5, 0.1, W - 1.0);
    for (let x = -L / 2 + 4; x < L / 2 - 3; x += 2.5) b.box('timberDark', x, 1.0, -W / 2 + 0.3, 0.2, 0.15, W - 0.6);
  });
  inst.define('lighterCoal', (b) => {
    const L = 22, W = 6.5;
    b.add('hullBlack', hullGeo(L, W, 2.4, 0.9, true), M4(0, -1.2, 0));
    b.box('coalHeap', -L / 2 + 2.5, -0.6, -W / 2 + 0.5, L - 5, 1.5, W - 1.0);
    const g = new THREE.CylinderGeometry(0.3, 1.4, 0.8, 6).scale(4.5, 1, 1.4);
    b.add('coalHeap', g, M4(0, 1.3, 0));
  });
  inst.define('lighterSheeted', (b) => {
    const L = 22, W = 6.5;
    b.add('hullBlack', hullGeo(L, W, 2.4, 0.9), M4(0, -1.2, 0));
    const half = W / 2 - 0.6, rise = 0.9, sl = Math.hypot(half, rise), a = Math.atan2(rise, half);
    b.cbox('canvas', 0, 1.2 + rise / 2, -half / 2, L - 4, 0.06, sl, -a, 0, 0);
    b.cbox('canvas', 0, 1.2 + rise / 2, half / 2, L - 4, 0.06, sl, a, 0, 0);
  });
  inst.define('steamLighter', (b) => {
    const L = 24, W = 6;
    b.add('hullBlack', hullGeo(L, W, 2.8, 0.3), M4(0, -1.4, 0));
    b.box('hold', -2, 0.8, -W / 2 + 0.8, 11, 0.05, W - 1.6);
    b.box('white', -L / 2 + 1.5, 1.4, -1.4, 4.5, 2.2, 2.8);
    b.box('roof', -L / 2 + 1.3, 3.6, -1.6, 4.9, 0.1, 3.2);
    b.cyl('funnelBuff', -L / 2 + 5, 5.2, 0, 0.45, 0.45, 3.5, 10);
    b.cyl('black', -L / 2 + 5, 7.0, 0, 0.47, 0.47, 0.5, 10);
    b.cyl('timberDark', 7.5, 6, 0, 0.12, 0.16, 9, 5);
    b.strut('timberDark', [7.5, 2, 0], [0, 7, 0], 0.14);
  });
  inst.define('rowboat', (b) => { b.add('timber', hullGeo(5, 1.6, 0.8, 0.4), M4(0, -0.3, 0)); });
}
const CART_WHEEL = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 8, 1, true);
const SMALL_WHEEL = new THREE.CylinderGeometry(0.45, 0.45, 0.06, 6, 1, true);
const LORRY_WHEEL = new THREE.CylinderGeometry(0.46, 0.46, 0.2, 10);
const CAR_WHEEL = new THREE.CylinderGeometry(0.38, 0.38, 0.14, 10);

// simple barge hull: flat bottom, raked bow/stern, height H, bluffness 0..1 (1 = box ends)
export function hullGeo(L, W, H, bluff = 0.5, open = false) {
  const n = 9, rows = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n, x = -L / 2 + u * L;
    const e = Math.min(u, 1 - u) * 2; // 0 at ends, 1 mid
    const k = bluff + (1 - bluff) * Math.sqrt(Math.min(1, e * 2.5));
    rows.push({ x, hw: (W / 2) * Math.max(0.08, k), bot: (W / 2) * Math.max(0.02, k * 0.85) });
  }
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < n; i++) {
    const r0 = rows[i], r1 = rows[i + 1];
    const s0 = i === 0 ? 0.9 : 0, s1 = i + 1 === n ? 0.9 : 0; // raked ends
    // port side (+z) & starboard (-z)
    quad([r0.x + s0, 0, r0.bot], [r1.x - s1, 0, r1.bot], [r1.x, H, r1.hw], [r0.x, H, r0.hw]);
    quad([r1.x - s1, 0, -r1.bot], [r0.x + s0, 0, -r0.bot], [r0.x, H, -r0.hw], [r1.x, H, -r1.hw]);
    // bottom
    quad([r1.x - s1, 0, r1.bot], [r0.x + s0, 0, r0.bot], [r0.x + s0, 0, -r0.bot], [r1.x - s1, 0, -r1.bot]);
    if (!open || i === 0 || i === n - 1) {
      quad([r0.x, H, r0.hw], [r1.x, H, r1.hw], [r1.x, H, -r1.hw], [r0.x, H, -r0.hw]);
    } else {
      const t = 0.35, hf = 0.6;
      // gunwale strips, inner walls and hold floor
      quad([r0.x, H, r0.hw], [r1.x, H, r1.hw], [r1.x, H, r1.hw - t], [r0.x, H, r0.hw - t]);
      quad([r0.x, H, -r0.hw + t], [r1.x, H, -r1.hw + t], [r1.x, H, -r1.hw], [r0.x, H, -r0.hw]);
      quad([r1.x, hf, r1.hw - t], [r0.x, hf, r0.hw - t], [r0.x, H, r0.hw - t], [r1.x, H, r1.hw - t]);
      quad([r0.x, hf, -r0.hw + t], [r1.x, hf, -r1.hw + t], [r1.x, H, -r1.hw + t], [r0.x, H, -r0.hw + t]);
      quad([r0.x, hf, r0.hw - t], [r1.x, hf, r1.hw - t], [r1.x, hf, -r1.hw + t], [r0.x, hf, -r0.hw + t]);
    }
  }
  const a = rows[0], z = rows[n];
  quad([a.x + 0.9, 0, -a.bot], [a.x + 0.9, 0, a.bot], [a.x, H, a.hw], [a.x, H, -a.hw]);
  quad([z.x - 0.9, 0, z.bot], [z.x - 0.9, 0, -z.bot], [z.x, H, -z.hw], [z.x, H, z.hw]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// stack of crates/bales/barrels on a pallet area (local frame x0..x1, z0..z1)
export function cargoStack(inst, rnd, fr, x0, x1, z0, z1, kind, toDock) {
  const ca = Math.cos(fr.ang), sa = Math.sin(fr.ang);
  const place = (name, lx, y, lz, sx, sy, sz, ry = 0) => {
    const [x, z] = toDock(fr, lx, lz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), fr.ang + ry), new THREE.Vector3(sx, sy, sz));
    inst.place(name, m);
  };
  void ca; void sa;
  if (kind === 'barrels') {
    x1 = Math.min(x1, x0 + 2 + rnd() * 4); z1 = Math.min(z1, z0 + 2 + rnd() * 3);
    for (let x = x0 + 0.4; x < x1 - 0.4; x += 0.8) for (let z = z0 + 0.4; z < z1 - 0.4; z += 0.8) {
      if (rnd() < 0.08) continue;
      place('barrel', x, Q, z, 1, 1, 1);
      if (rnd() < 0.35) place('barrel', x, Q + 0.9, z, 1, 1, 1);
    }
  } else if (kind === 'sacks') {
    const h = 3 + Math.floor(rnd() * 5);
    x1 = Math.min(x1, x0 + 3 + rnd() * 3); z1 = Math.min(z1, z0 + 2 + rnd() * 2);
    for (let x = x0 + 0.5; x < x1 - 0.5; x += 0.95) for (let z = z0 + 0.3; z < z1 - 0.3; z += 0.6) for (let k = 0; k < h; k++) {
      if (k > 1 && rnd() < 0.15) break;
      place('sack', x + (k % 2) * 0.1, Q + k * 0.31, z, 1, 1, 1, (k % 2) * 0.05);
    }
  } else {
    const name = kind === 'bales' ? 'bale' : 'crate';
    let x = x0;
    while (x < x1 - 0.8) {
      const sx = kind === 'bales' ? 1.2 : 0.9 + rnd() * 1.6;
      let z = z0;
      while (z < z1 - 0.8) {
        const sz = kind === 'bales' ? 0.9 : 0.9 + rnd() * 1.4;
        const layers = 1 + Math.floor(rnd() * (kind === 'bales' ? 4 : 3));
        const sy = kind === 'bales' ? 0.9 : 0.7 + rnd() * 0.9;
        for (let k = 0; k < layers; k++) place(name, x + sx / 2, Q + k * sy, z + sz / 2, sx * 0.96, sy * 0.98, sz * 0.96);
        z += sz + 0.08;
      }
      x += sx + (rnd() < 0.12 ? 1.2 : 0.1);
    }
  }
}

// coal stack: flat-topped ridge at the angle of repose with a lumpy surface
export function coalHeap(b, x, z, lx, lz, h, ry = 0, rnd = Math.random) {
  const nx = 14, nz = 7, pos = [], G = [];
  const seed = rnd() * 100, run = 1.5 * h;
  const ku = lx / 2 / run, kv = lz / 2 / run;
  for (let j = 0; j <= nz; j++) {
    const row = [];
    for (let i = 0; i <= nx; i++) {
      const u = (i / nx) * 2 - 1, v = (j / nz) * 2 - 1;
      const n = Math.sin(u * 6.1 + seed) * Math.cos(v * 4.3 + seed * 1.7) * 0.1 + Math.sin(u * 15 + v * 9 + seed) * 0.05;
      const prof = Math.min(1, (1 - Math.abs(u)) * ku) * Math.min(1, (1 - Math.abs(v)) * kv);
      const hh = i === 0 || j === 0 || i === nx || j === nz ? 0 : Math.max(0, prof * (1 + n));
      row.push([u * lx / 2 + n * 1.5, hh * h, v * lz / 2 + n]);
    }
    G.push(row);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = G[j][i], c = G[j][i + 1], d = G[j + 1][i + 1], e = G[j + 1][i];
    pos.push(...a, ...e, ...d, ...a, ...d, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  b.add('coalHeap', g, M4(x, Q - 0.05, z, 0, ry, 0));
}

export function timberStack(b, rnd, x, z, lx, lz, h, ry = 0) {
  b.pushFrame(x, z, ry);
  let y = Q;
  const layers = Math.max(1, Math.round(h / 0.45));
  for (let k = 0; k < layers; k++) {
    b.box('timberDark', -lx / 2, y, -lz / 2, 0.15, 0.1, lz);
    b.box('timberDark', lx / 2 - 0.15, y, -lz / 2, 0.15, 0.1, lz);
    b.box(k % 3 === 2 ? 'timberDark' : 'timber', -lx / 2 - rnd() * 0.3, y + 0.1, -lz / 2, lx + rnd() * 0.5, 0.35, lz);
    y += 0.45;
  }
  b.pop();
}

// boundary wall along a polyline (dock frame), height h, piers every 6 m
export function boundaryWall(b, pts, h = 2.6, skip = () => false) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], c = pts[i];
    const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    const tx = dx / len, tz = dz / len, ang = Math.atan2(-tz, tx);
    for (let t = 0; t < len; t += 6) {
      const l = Math.min(6, len - t);
      const cx = a[0] + tx * (t + l / 2), cz = a[1] + tz * (t + l / 2);
      if (skip(cx, cz)) continue;
      b.cbox('brick', cx, Q + h / 2, cz, l, h, 0.45, 0, ang, 0);
      b.cbox('stone', cx, Q + h + 0.08, cz, l, 0.16, 0.6, 0, ang, 0);
      const px = a[0] + tx * t, pz = a[1] + tz * t;
      b.cbox('brick', px, Q + (h + 0.5) / 2, pz, 0.7, h + 0.5, 0.7, 0, ang, 0);
    }
  }
}
