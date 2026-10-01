import * as THREE from 'three';
import { Builder, mat } from './builder.js';
import { mulberry32 } from './textures.js';
import { dockMaterials, buildQuayDetails, craneCabDetails } from './dock-detail.js';

// White Star Dock (Ocean Dock), April 1912, in the DOCK FRAME:
//   origin = centre of the basin at noon water level, +X along the long axis toward
//   the mouth (true bearing 193°), +Z toward the west quay, +Y up. Metres.
// East quay (z = -HZ): Berths 43 (south, toward mouth) and 44 (north).
// West quay (z = +HZ): Berths 46/47, shed still under construction in 1912.
// North end (x = -HX): Berth 45, timber berth.

export const DOCK = {
  HX: 259, HZ: 60, Q: 4.6, FLOOR: -13.5,
  east: { x0: -216, x1: 270, z: -60 },
  west: { x0: -269, x1: 216, z: 60 },
  bearing: 192.5,
  eastApron: 14, shedDepth: 36.6, galleryY: 5.2,
};

export function buildOceanDock(M) {
  M = dockMaterials(M);
  const { HX, HZ, Q, FLOOR } = DOCK;
  const b = new Builder(M);
  const rnd = mulberry32(1912);
  const group = new THREE.Group();
  group.name = 'OceanDock';

  // Basin walls are the side faces of the estate slab (estate.js); here we add what sits
  // on and against them. The basin is a parallelogram: north end and mouth are skewed.
  const E = DOCK.east, W = DOCK.west;

  // ---------------------------------------------------------------- copings
  b.box('coping', E.x0, Q - 0.6, E.z - 1.3, E.x1 - E.x0, 0.6, 1.38);
  b.box('coping', W.x0, Q - 0.6, W.z - 0.08, W.x1 - W.x0, 0.6, 1.38);
  {
    const a = [W.x0, W.z], c = [E.x0, E.z];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]), ang = Math.atan2(c[1] - a[1], c[0] - a[0]);
    const nx = Math.sin(ang), nz = -Math.cos(ang);
    b.cbox('coping', (a[0] + c[0]) / 2 + nx * 0.6, Q - 0.3, (a[1] + c[1]) / 2 + nz * 0.6, len, 0.6, 1.38, 0, -ang, 0);
  }
  b.box('mud', -300, FLOOR - 0.5, -HZ, 600, 0.5, 2 * HZ);

  // ---------------------------------------------------------------- fenders & ladders
  const fenderRun = (z, side, x0, x1, pitch) => {
    for (let x = x0; x <= x1; x += pitch) b.box('fender', x - 0.18, -2.2, side > 0 ? z - 0.42 : z, 0.36, Q - 0.35 + 2.2, 0.42);
    for (const y of [1.2, 3.7]) b.box('fender', x0, y, side > 0 ? z - 0.72 : z + 0.42, x1 - x0, 0.32, 0.3);
  };
  fenderRun(E.z, -1, E.x0 + 6, E.x1 - 4, 4.5);
  fenderRun(W.z, 1, W.x0 + 6, W.x1 - 4, 4.5);
  const ladder = (x, z, side) => {
    const zz = z + side * -0.25;
    for (const dx of [-0.28, 0.28]) b.box('castIron', x + dx - 0.04, -2, zz - 0.04, 0.08, Q + 2.9, 0.08);
    for (let y = -1.8; y < Q; y += 0.3) b.box('castIron', x - 0.28, y, zz - 0.02, 0.56, 0.035, 0.04);
    b.add('castIron', new THREE.TorusGeometry(0.3, 0.025, 5, 10, Math.PI), mat(x, Q + 0.2, z + side * 0.4, 0, 0, 0));
  };
  for (let x = E.x0 + 30; x < E.x1 - 10; x += 56) ladder(x + 2.2, E.z, -1);
  for (let x = W.x0 + 30; x < W.x1 - 40; x += 56) ladder(x + 30, W.z, 1);

  // ---------------------------------------------------------------- quay aprons
  b.box('setts', E.x0 - 30, Q - 0.1, E.z - DOCK.eastApron, E.x1 - E.x0 + 30, 0.13, DOCK.eastApron - 1.3);
  b.box('setts', W.x0 + 4, Q - 0.1, W.z + 1.3, W.x1 - W.x0 - 4, 0.13, 14);

  // ---------------------------------------------------------------- bollards
  const bollards = [];
  const bollard = (x, z) => {
    const prof = [[0, 0], [0.34, 0], [0.34, 0.08], [0.26, 0.14], [0.22, 0.55], [0.3, 0.7], [0.38, 0.78], [0.36, 0.86], [0.2, 0.92], [0, 0.94]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    b.add('castIron', new THREE.LatheGeometry(prof, 14), mat(x, Q + 0.03, z));
    bollards.push(new THREE.Vector3(x, Q + 0.7, z));
  };
  for (let x = E.x0 + 8; x < E.x1 - 4; x += 24) bollard(x, E.z - 2.2);
  for (let x = W.x0 + 12; x < W.x1 - 4; x += 24) bollard(x, W.z + 2.2);

  // ---------------------------------------------------------------- crane rails & quay tracks
  const rail = (x0, x1, z, y) => b.box('rail', x0, y, z - 0.035, x1 - x0, 0.09, 0.07);
  rail(E.x0 - 30, E.x1, E.z - 3.2, Q + 0.03);
  rail(E.x0 - 30, E.x1, E.z - 10.2, Q + 0.03);
  rail(E.x0 - 30, E.x1, E.z - 6.7 - 0.72, Q + 0.03);
  rail(E.x0 - 30, E.x1, E.z - 6.7 + 0.72, Q + 0.03);
  rail(W.x0 + 4, W.x1, W.z + 3.2, Q + 0.03);
  rail(W.x0 + 4, W.x1, W.z + 10.2, Q + 0.03);

  // ---------------------------------------------------------------- sheds 43 / 44
  const zW = E.z - DOCK.eastApron; // waterside wall line
  const D = DOCK.shedDepth;
  shed(b, rnd, -210, -15, zW, D, { gallery: true, doorsLandward: true, annex: 'north' });
  shed(b, rnd, -7, 188, zW, D, { gallery: true, doorsLandward: true, annex: 'south' });

  // boat-train platform & sidings landward of the sheds
  const zRail = zW - D - 1.5;
  b.box('setts', E.x0 - 40, Q - 0.1, zRail - 12, E.x1 - E.x0 + 40, 0.14, 12);
  b.box('stone', -228, Q, zRail - 1.2, 400, 0.9, 1.2); // low platform edge
  for (const dz of [-3.8, -8.4]) sleeperTrack(b, E.x0 - 40, E.x1, zRail + dz, Q + 0.02);

  // ---------------------------------------------------------------- cranes (east quay)
  const cranes = [];
  const craneXs = [-178, -150, -120, -48, 30, 80, 140, 236];
  for (const [i, x] of craneXs.entries()) {
    // parked with jibs along the quay or swung landward, clear of the ships' superstructures
    const slew = [0.05, Math.PI, 0.1, Math.PI - 0.1, 0.1, Math.PI + 0.12, Math.PI, 0.05][i % 8];
    const luff = 0.9 + rnd() * 0.35;
    crane(b, x, E.z - 3.2, E.z - 10.2, slew, luff);
    cranes.push({ x, slew, luff });
  }

  // ---------------------------------------------------------------- west quay: 46/47 shed under construction
  shedFrame(b, rnd, -236, 4, W.z + 14, D);
  steamCrane(b, 60, HZ + 8, 1.2);
  // materials stacks for the shed works
  for (let i = 0; i < 9; i++) {
    const x = 50 + i * 7 + rnd() * 2, z = HZ + 22 + rnd() * 8;
    for (let k = 0; k < 3 + Math.floor(rnd() * 4); k++) b.box('steelRaw', x, Q + 0.03 + k * 0.32, z + (k % 2) * 0.2, 6, 0.3, 0.3);
  }
  for (let i = 0; i < 6; i++) b.box('timber', 110 + i * 5, Q + 0.03, HZ + 20, 4, 0.6 + rnd() * 0.6, 2.2);

  // ---------------------------------------------------------------- north end: berth 45 timber yard
  for (let i = 0; i < 14; i++) {
    const z = -HZ + 8 + i * 8.3, x = -300 - rnd() * 8, h = 1.2 + rnd() * 2.6;
    b.box('timber', x - 6, Q + 0.03, z, 12 + rnd() * 5, h, 5.5);
    for (let k = 0; k < 3; k++) b.box('timberDark', x - 6, Q + 0.03 + (h / 3) * k, z - 0.1, 12, 0.12, 5.7);
  }
  // berth 45 timber shed: weatherboarded, ridge along its length
  b.box('timberDark', -350, Q, -30, 22, 6, 60);
  gableRoof(b, -350, Q + 6, -30, 22, 60, 4, 'roof', 'z', 0.5);
  {
    const tri = new THREE.Shape([new THREE.Vector2(-11, 0), new THREE.Vector2(11, 0), new THREE.Vector2(0, 4)]);
    const g = new THREE.ExtrudeGeometry(tri, { depth: 0.25, bevelEnabled: false });
    b.add('timberDark', g.clone(), mat(-339, Q + 6, -30.1));
    b.add('timberDark', g, mat(-339, Q + 6, 29.85));
    for (let z = -24; z < 28; z += 12) b.box('glass', -328.05, Q + 1.2, z, 0.1, 3.6, 5);
  }

  // ---------------------------------------------------------------- lamps along the quays
  for (let x = E.x0 + 10; x < E.x1; x += 42) lampPost(b, x, E.z - 12.5);
  for (let x = W.x0 + 20; x < W.x1; x += 42) lampPost(b, x, W.z + 12.5);

  group.add(b.build({ name: 'OceanDock' }), buildQuayDetails(M,DOCK));
  group.userData = { bollards, cranes, zShedWater: zW };
  return group;
}

// ---------------------------------------------------------------- components

function sleeperTrack(b, x0, x1, z, y) {
  b.box('ballast', x0, y - 0.05, z - 1.6, x1 - x0, 0.2, 3.2);
  for (let x = x0 + 0.3; x < x1; x += 0.75) b.box('sleeper', x, y + 0.15, z - 1.3, 0.25, 0.13, 2.6);
  for (const dz of [-0.72, 0.72]) b.box('rail', x0, y + 0.28, z + dz - 0.035, x1 - x0, 0.13, 0.07);
}

export function gableRoof(b, x0, y0, z0, lx, lz, rise, key = 'roof', ridgeAlong = 'x', overhang = 0.4) {
  if (ridgeAlong === 'x') {
    const half = lz / 2 + overhang, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    b.cbox(key, x0 + lx / 2, y0 + rise / 2, z0 + lz / 2 - half / 2, lx + overhang * 2, 0.14, slope, -ang, 0, 0);
    b.cbox(key, x0 + lx / 2, y0 + rise / 2, z0 + lz / 2 + half / 2, lx + overhang * 2, 0.14, slope, ang, 0, 0);
    // gable infill triangles
    const tri = new THREE.Shape([new THREE.Vector2(-lz / 2, 0), new THREE.Vector2(lz / 2, 0), new THREE.Vector2(0, rise)]);
    const g = new THREE.ExtrudeGeometry(tri, { depth: 0.25, bevelEnabled: false });
    b.add('shedClad', g.clone(), mat(x0, y0, z0 + lz / 2, 0, Math.PI / 2, 0));
    b.add('shedClad', g, mat(x0 + lx - 0.25, y0, z0 + lz / 2, 0, Math.PI / 2, 0));
  } else {
    const half = lx / 2 + overhang, slope = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    b.cbox(key, x0 + lx / 2 - half / 2, y0 + rise / 2, z0 + lz / 2, slope, 0.14, lz + overhang * 2, 0, 0, ang);
    b.cbox(key, x0 + lx / 2 + half / 2, y0 + rise / 2, z0 + lz / 2, slope, 0.14, lz + overhang * 2, 0, 0, -ang);
  }
}

// Long transit shed: steel frame, corrugated cladding, twin-gable roof with rooflights,
// waterside first-floor passenger gallery with canopy, landward sliding doors.
function shed(b, rnd, x0, x1, zW, D, opts) {
  const Q = DOCK.Q, He = 9.0, len = x1 - x0, zL = zW - D;
  const gy = Q + DOCK.galleryY;
  // plinth
  b.box('brickDark', x0, Q, zL, len, 1.1, 0.4);
  b.box('brickDark', x0, Q, zW - 0.4, len, 1.1, 0.4);
  // walls
  b.box('shedClad', x0, Q + 1.1, zW - 0.3, len, He - 1.1, 0.3);
  // landward wall with door openings
  const bay = 12;
  for (let x = x0; x < x1 - 0.1; x += bay) {
    const w = Math.min(bay, x1 - x);
    if (w < bay) { b.box('shedClad', x, Q + 1.1, zL, w, He - 1.1, 0.3); continue; }
    b.box('shedClad', x, Q + 1.1, zL, 3.2, He - 1.1, 0.3);
    b.box('shedClad', x + 8.8, Q + 1.1, zL, 3.2, He - 1.1, 0.3);
    b.box('shedClad', x + 3.2, Q + 5.6, zL, 5.6, He - 5.6, 0.3);
    b.box('glass', x + 3.2, Q, zL + 1.4, 5.6, 5.6, 0.1); // dark interior
    // sliding door, some open
    const open = rnd() < 0.55 ? 5.2 : 0;
    b.box('shedTrim', x + 3.2 + open, Q + 0.05, zL - 0.35, 5.6, 5.55, 0.12);
    b.box('shedTrim', x + 3.0, Q + 5.6, zL - 0.45, 11.2, 0.25, 0.35); // door track
  }
  // pilasters
  for (let x = x0; x <= x1 + 0.01; x += 6) {
    b.box('shedTrim', x - 0.22, Q, zW - 0.02, 0.44, He + 0.1, 0.18);
    b.box('shedTrim', x - 0.22, Q, zL - 0.16, 0.44, He + 0.1, 0.18);
  }
  b.box('shedTrim', x0, Q + He - 0.5, zW - 0.05, len, 0.5, 0.25); // eaves beam
  b.box('shedTrim', x0, Q + He - 0.5, zL - 0.2, len, 0.5, 0.25);
  b.box('shedTrim', x0, Q + 1.1, zW - 0.05, len, 0.12, 0.15);
  // clerestory windows on the waterside wall at gallery level
  for (let x = x0 + 1.5; x < x1 - 2; x += 3) b.box('glass', x, gy + 0.9, zW + 0.005, 1.6, 1.8, 0.02);
  // high windows landward
  for (let x = x0 + 1.5; x < x1 - 2; x += 3) b.box('glass', x, Q + 6.6, zL - 0.02, 1.6, 1.3, 0.02);

  // gable end walls (twin gable profile)
  const rise = 3.6;
  const prof = new THREE.Shape([
    [0, 0], [D, 0], [D, He], [D * 0.75, He + rise], [D * 0.5, He], [D * 0.25, He + rise], [0, He],
  ].map(([x, y]) => new THREE.Vector2(x, y)));
  const gg = new THREE.ExtrudeGeometry(prof, { depth: 0.3, bevelEnabled: false });
  for (const xe of [x0, x1 - 0.3]) b.add('shedClad', gg.clone(), mat(xe, Q, zW, 0, Math.PI / 2, 0));
  for (const [xe, sg] of [[x0, -1], [x1, 1]]) {
    // everything stands proud of the gable face on the outside, never coplanar
    const o = (d) => (sg > 0 ? xe + d : xe - d);
    for (const zf of [0.28, 0.78]) {
      b.box('shedTrim', Math.min(o(0.02), o(0.14)), Q + He + 0.15, zW - D * zf - 0.15, 0.12, 2.1, 3.5);
      b.box('glass', Math.min(o(0.14), o(0.2)), Q + He + 0.3, zW - D * zf, 0.06, 1.8, 3.2);
      for (let k = 1; k < 4; k++) b.box('shedTrim', Math.min(o(0.2), o(0.26)), Q + He + 0.3, zW - D * zf + k * 0.8 - 0.03, 0.06, 1.8, 0.06);
    }
    for (let k = 0; k < 5; k++) b.box('glass', Math.min(o(0.02), o(0.1)), Q + 5.2, zW - 3 - k * 3.2, 0.08, 1.6, 1.6);
    b.box('shedTrim', Math.min(o(0.02), o(0.22)), Q, zW - D * 0.62, 0.2, 5.5, 8);
  }
  // twin gable roof with rooflights
  for (const k of [0, 1]) {
    const zc0 = zL + (D / 2) * k;
    gableRoof(b, x0, Q + He, zc0, len, D / 2, rise, 'roof', 'x', 0.45);
    const half = D / 4 + 0.45, ang = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      const zc = zc0 + D / 4 + s * (half * 0.32);
      const yc = Q + He + rise * (1 - 0.32) + 0.1;
      b.cbox('glassRoof', x0 + len / 2, yc + 0.02, zc, len - 8, 0.06, 2.6, s * ang, 0, 0);
      for (let x = x0 + 4; x < x1 - 4; x += 2.4) b.cbox('shedTrim', x, yc + 0.06, zc, 0.08, 0.08, 2.7, s * ang, 0, 0);
    }
    b.cbox('shedTrim', x0 + len / 2, Q + He + rise + 0.05, zc0 + D / 4, len + 0.9, 0.22, 0.5); // ridge cap
  }
  b.box('shedTrim', x0, Q + He - 0.1, zL + D / 2 - 0.4, len, 0.3, 0.8); // valley gutter
  // downpipes
  for (let x = x0 + 3; x < x1; x += 24) b.box('castIron', x, Q, zW + 0.05, 0.14, He, 0.14);

  if (opts.gallery) {
    const gz0 = zW, gz1 = zW + 4.2;
    b.box('timberDark', x0, gy - 0.35, gz0, len, 0.35, gz1 - gz0);
    b.box('shedTrim', x0, gy - 0.75, gz1 - 0.3, len, 0.45, 0.3); // fascia
    // brackets
    for (let x = x0; x <= x1 + 0.01; x += 6) {
      b.strut('shedTrim', [x, gy - 3.6, zW + 0.1], [x, gy - 0.4, gz1 - 0.3], 0.22, 0.22);
      b.box('shedTrim', x - 0.08, gy, gz1 - 0.2, 0.16, 3.0, 0.16); // canopy posts
    }
    // railing (solid lower panel + top rail, reads well at distance)
    b.box('shedTrim', x0, gy + 0.95, gz1 - 0.15, len, 0.08, 0.1);
    for (let x = x0; x < x1; x += 1.2) b.box('shedTrim', x, gy, gz1 - 0.13, 0.05, 0.95, 0.05);
    b.box('shedTrim', x0, gy + 0.45, gz1 - 0.14, len, 0.05, 0.06);
    // canopy
    b.cbox('roof', x0 + len / 2, gy + 3.2, (gz0 + gz1) / 2, len, 0.1, 4.8, -0.12, 0, 0);
    // staircases down to the quay
    for (const xs of [x0 + len * 0.28, x0 + len * 0.72]) {
      const steps = 26, rise1 = DOCK.galleryY / steps, run = 0.3;
      for (let i = 0; i < steps; i++) b.box('timber', xs + i * run, Q + i * rise1 + rise1 - 0.06, gz1 - 2.6, run + 0.02, 0.06, 2.4);
      b.strut('shedTrim', [xs, Q, gz1 - 0.15], [xs + steps * run, gy, gz1 - 0.15], 0.25, 0.1);
      b.strut('shedTrim', [xs, Q + 1, gz1 - 0.1], [xs + steps * run, gy + 1, gz1 - 0.1], 0.06, 0.06);
    }
  }
  if (opts.annex) {
    const ax = opts.annex === 'north' ? x0 - 19 : x1 + 1;
    b.box('brick', ax, Q, zL + 4, 18, 6.5, 18);
    gableRoof(b, ax, Q + 6.5, zL + 4, 18, 18, 3.2, 'slate', 'x', 0.35);
    for (let i = 0; i < 4; i++) b.box('glass', ax + 2 + i * 4, Q + 2.2, zL + 22.02, 1.6, 2.4, 0.04);
    b.box('stone', ax - 0.1, Q + 6.2, zL + 3.9, 18.2, 0.3, 18.2);
  }
}

// Steel skeleton of a shed under construction.
function shedFrame(b, rnd, x0, x1, zW, D) {
  const Q = DOCK.Q, He = 9;
  const zs = [zW, zW + D / 2, zW + D];
  b.box('yard', x0, Q - 0.05, zW, x1 - x0, 0.1, D);
  for (let x = x0; x <= x1; x += 6) {
    for (const z of zs) b.box('steelRaw', x - 0.2, Q, z - 0.2, 0.4, He, 0.4);
    // roof trusses on the first 2/3 of the building
    if (x < x0 + (x1 - x0) * 0.7) {
      for (const k of [0, 1]) {
        const za = zs[k], zb = zs[k + 1], zm = (za + zb) / 2;
        b.strut('steelRaw', [x, Q + He, za], [x, Q + He + 3.6, zm], 0.22);
        b.strut('steelRaw', [x, Q + He + 3.6, zm], [x, Q + He, zb], 0.22);
        b.strut('steelRaw', [x, Q + He, za], [x, Q + He, zb], 0.18);
        for (let i = 1; i < 4; i++) {
          const t = i / 4, z = za + (zb - za) * t, yTop = Q + He + 3.6 * (1 - Math.abs(t - 0.5) * 2);
          b.strut('steelRaw', [x, Q + He, z], [x, yTop, z], 0.1);
        }
      }
    }
  }
  // eaves & purlins
  for (const z of zs) b.box('steelRaw', x0, Q + He - 0.4, z - 0.2, x1 - x0, 0.4, 0.4);
  const done = x0 + (x1 - x0) * 0.35;
  for (const k of [0, 1]) {
    gableRoof(b, x0, Q + He, zs[k], done - x0, D / 2, 3.6, 'roof', 'x', 0.3);
  }
  // cladding partially fixed
  b.box('shedClad', x0, Q + 1, zW + D, (x1 - x0) * 0.45, He - 1, 0.25);
  // scaffolding
  for (let x = done; x < done + 30; x += 2.5) {
    b.box('timberDark', x, Q, zW - 1.4, 0.12, He + 2, 0.12);
    for (let y = Q + 2; y < Q + He + 2; y += 2) b.box('timber', x, y, zW - 1.8, 2.5, 0.06, 1.1);
  }
}

// Electric portal travelling crane with a luffing lattice jib.
function crane(b, x, zA, zB, slew, luff) {
  const Q = DOCK.Q, portalH = 7.2, zc = (zA + zB) / 2, gauge = Math.abs(zA - zB);
  const k = 'craneSteel';
  // bogies & legs
  for (const z of [zA, zB]) {
    for (const dx of [-2.6, 2.6]) {
      b.box(k, x + dx - 0.9, Q + 0.05, z - 0.35, 1.8, 0.7, 0.7);
      for (const wx of [-0.55,0.55]) {
        b.cyl('dockIron',x+dx+wx,Q+0.38,z,0.30,0.30,0.82,16,Math.PI/2);
        for (const s of [-1,1]) b.cyl('dockBolt',x+dx+wx,Q+0.38,z+s*0.44,0.09,0.09,0.06,12,Math.PI/2);
      }
      b.strut(k, [x + dx, Q + 0.7, z], [x + dx * 0.45, Q + portalH, zc + (z - zc) * 0.35], 0.42);
    }
    b.strut(k, [x - 2.6, Q + 1.4, z], [x + 2.6, Q + 1.4, z], 0.25);
    b.strut(k, [x - 2.6, Q + 1.4, z], [x + 1.2, Q + portalH - 0.5, zc + (z - zc) * 0.35], 0.16);
  }
  b.box(k, x - 1.6, Q + portalH, zc - gauge * 0.25, 3.2, 0.7, gauge * 0.5);
  // turntable + machinery house (rotates with slew)
  const base = new THREE.Vector3(x, Q + portalH + 0.7, zc);
  const rot = (lx, ly, lz) => {
    const c = Math.cos(slew), s = Math.sin(slew);
    return [base.x + lx * c + lz * s, base.y + ly, base.z - lx * s + lz * c];
  };
  b.add(k, new THREE.CylinderGeometry(1.8, 1.8, 0.5, 20), mat(base.x, base.y + 0.25, base.z));
  const house = new THREE.BoxGeometry(5.2, 3.2, 3.4);
  const hc = rot(-1.2, 2.1, 0);
  b.add('shedTrim', house, mat(hc[0], hc[1], hc[2], 0, slew, 0));
  const hr = rot(-1.2, 3.85, 0);
  b.add('roof', new THREE.CylinderGeometry(1.8, 1.8, 5.3, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.25, 1), mat(hr[0], hr[1], hr[2], 0, slew, 0));
  const cw = rot(-3.9, 1.3, 0);
  b.add(k, new THREE.BoxGeometry(1.2, 2.0, 2.8), mat(cw[0], cw[1], cw[2], 0, slew, 0));
  const win = rot(1.42, 2.4, 0);
  b.add('glass', new THREE.BoxGeometry(0.02, 0.9, 2.4), mat(win[0], win[1], win[2], 0, slew, 0));
  craneCabDetails(b,rot,slew);
  // A-frame
  const ap = rot(-0.6, 7.5, 0);
  for (const s of [-1, 1]) {
    b.strut(k, rot(1.4, 0.5, s * 1.3), ap, 0.2);
    b.strut(k, rot(-3.4, 0.5, s * 1.3), ap, 0.2);
  }
  // lattice jib
  const L = 24, pivot = rot(1.8, 1.0, 0);
  const ca = Math.cos(luff), sa = Math.sin(luff);
  const jibPt = (t, off1, off2) => {
    const lx = 1.8 + t * L * ca + off1 * -sa, ly = 1.0 + t * L * sa + off1 * ca;
    return rot(lx, ly, off2);
  };
  const w0 = 1.1, h0 = 0.9;
  const corners = [[-h0, -w0], [h0, -w0], [h0, w0], [-h0, w0]];
  const taper = (t, v) => v * (1 - 0.7 * t);
  for (const [o1, o2] of corners) b.strut(k, jibPt(0, o1, o2), jibPt(1, taper(1, o1), taper(1, o2)), 0.18);
  const N = 16;
  for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    for (const [ia, ib] of [[0, 1], [1, 2], [2, 3], [3, 0]]) {
      const a = corners[ia], c = corners[ib];
      b.strut(k, jibPt(t0, taper(t0, a[0]), taper(t0, a[1])), jibPt(t1, taper(t1, c[0]), taper(t1, c[1])), 0.07);
    }
  }
  // jib head, luffing ropes, hook
  const tip = jibPt(1, 0, 0);
  b.add(k, new THREE.CylinderGeometry(0.5, 0.5, 0.5, 12).rotateX(Math.PI / 2), mat(tip[0], tip[1], tip[2], 0, slew, 0));
  b.rod('castIron', ap, tip, 0.035, 4);
  b.rod('castIron', rot(-0.6, 7.5, 0.3), jibPt(0.55, h0 * 0.6, 0), 0.03, 4);
  const hookY = Math.max(Q + 3 + (tip[1] - Q) * 0.3, Q + 5);
  b.rod('castIron', tip, [tip[0], hookY, tip[2]], 0.025, 4);
  b.add('castIron', new THREE.BoxGeometry(0.5, 0.9, 0.35), mat(tip[0], hookY - 0.45, tip[2]));
  b.add('castIron', new THREE.TorusGeometry(0.22, 0.06, 5, 10, Math.PI * 1.4), mat(tip[0], hookY - 1.15, tip[2], 0, 0, Math.PI * 0.8));
}

function steamCrane(b, x, z, slew) {
  const Q = DOCK.Q;
  b.box('black', x - 2.5, Q + 0.05, z - 1.6, 5, 1.2, 3.2);
  b.add('black', new THREE.CylinderGeometry(0.7, 0.7, 2.2, 14), mat(x - 1.2, Q + 2.3, z));
  b.add('black', new THREE.CylinderGeometry(0.18, 0.2, 3.0, 8), mat(x - 1.2, Q + 4.6, z));
  b.box('timberDark', x - 0.2, Q + 1.25, z - 1.5, 3, 2.4, 3);
  const tip = [x + Math.cos(slew) * 13, Q + 11, z - Math.sin(slew) * 13];
  for (const s of [-0.5, 0.5]) b.strut('steelRaw', [x + 1, Q + 1.4, z + s], tip, 0.22);
  b.rod('castIron', tip, [tip[0], Q + 3, tip[2]], 0.03, 4);
}

function lampPost(b, x, z) {
  const Q = DOCK.Q;
  b.add('lamp', new THREE.CylinderGeometry(0.1, 0.18, 5.5, 8).translate(0, 2.75, 0), mat(x, Q, z));
  b.add('lamp', new THREE.CylinderGeometry(0.22, 0.26, 0.7, 8).translate(0, 0.35, 0), mat(x, Q, z));
  b.add('lamp', new THREE.CylinderGeometry(0.34, 0.2, 0.7, 6).translate(0, 0, 0), mat(x, Q + 5.9, z));
  b.add('lamp', new THREE.ConeGeometry(0.42, 0.4, 6), mat(x, Q + 6.45, z));
  b.add('lamp', new THREE.BoxGeometry(0.9, 0.06, 0.06), mat(x, Q + 5.0, z));
}
