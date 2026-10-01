import * as THREE from 'three';
import { Builder, mat } from './builder.js';
import { surface, paint } from './surface.js';
import { mulberry32 } from './textures.js';

// Close-range dressing of the existing east-quay apron, without changing its footprint.
// A separate seed keeps the fixed cranes, gallery and ship connections unchanged.
export function buildQuayDetail(M, dock, bollards) {
  const { Q, east: E } = dock;
  const rnd = mulberry32(1912041044);
  const materials = {
    ...M,
    quayAshlar: surface({ set: 'ashlar', scale: 3.2, color: 0x8d877b, roughness: 0.94,
      grime: 0.58, streaks: 0.75, wet: true, highWater: 2.7, name: 'quay44-ashlar' }),
    quayJoint: paint(0x474640, 1, 0, { name: 'quay44-recessed-joints' }),
    quayRub: paint(0x5e564a, 0.95, 0, { name: 'quay44-timber-rub' }),
  };
  const b = new Builder(materials);
  const cargo = [], grates = [], coping = [];
  const x0 = -210, x1 = 164;

  // Mortared facing courses stay against the original estate wall, behind its fenders.
  // The lowest visible course is larger and darkened by the existing wet material.
  for (let row = 0; row < 5; row++) {
    const y = -0.45 + row * 0.9;
    const step = row === 0 ? 3.0 : 2.4;
    for (let x = x0 - (row % 2) * step / 2; x < x1; x += step) {
      const a = Math.max(x, x0), w = Math.min(x + step, x1) - a;
      b.box('quayJoint', a, y, E.z + 0.011, w, 0.9, 0.018);
      b.box('quayAshlar', a + 0.014, y + 0.015, E.z + 0.03,
        w - 0.028, 0.866, 0.035 + rnd() * 0.014);
    }
  }

  // Individually coursed stone coping: hairline joints and a gently worn arris.
  for (let x = x0; x < x1; x += 1.75) {
    const w = Math.min(1.75, x1 - x), rise = rnd() * 0.004;
    b.box('quayJoint', x, Q + 0.002, E.z - 1.28, w, 0.019, 1.33);
    b.box('coping', x + 0.008, Q + 0.022, E.z - 1.27,
      w - 0.016, 0.026 + rise, 1.31);
    coping.push([x, x + w]);
  }

  // Stone gutter between the gallery walk and embedded crane/railway tracks.
  // Short cast-iron grates are flush with the apron; no modern painted markings.
  for (let x = x0; x < x1; x += 2.1) {
    b.box('coping', x, Q + 0.034, E.z - 10.82, Math.min(2.08, x1 - x), 0.018, 0.32);
  }
  for (let x = -196; x < 158; x += 27) {
    const z = E.z - 10.69;
    b.box('castIron', x - 0.42, Q + 0.057, z - 0.23, 0.84, 0.03, 0.46);
    b.box('quayJoint', x - 0.36, Q + 0.089, z - 0.18, 0.72, 0.006, 0.36);
    for (let k = 0; k < 8; k++) b.box('castIron', x - 0.34 + k * 0.095, Q + 0.097, z - 0.18, 0.032, 0.009, 0.36);
    grates.push([x, z]);
    // Old masonry scupper above the tidal range, set into the quay face.
    b.box('coping', x - 0.32, Q - 1.18, E.z + 0.069, 0.64, 0.54, 0.05);
    b.box('quayJoint', x - 0.21, Q - 1.06, E.z + 0.123, 0.42, 0.29, 0.014);
  }

  // Embedded service-cover frames and sett repairs are flush and offset from the rails.
  for (const x of [-180, -82, 16, 108]) {
    b.box('yard', x - 0.73, Q + 0.034, E.z - 5.5, 1.46, 0.017, 1.35);
    b.box('castIron', x - 0.55, Q + 0.054, E.z - 5.34, 1.1, 0.026, 1.02);
    for (const dx of [-0.4, 0.4]) b.box('black', x + dx - 0.05, Q + 0.084, E.z - 4.92, 0.1, 0.005, 0.18);
  }
  for (const x of [-140, -52, 34, 92]) {
    for (let i = 0; i < 15; i++) {
      const px = x + i * 0.32;
      b.box(i % 3 ? 'coping' : 'yard', px, Q + 0.033, E.z - 4.2 + (i % 2) * 0.24,
        0.3, 0.012 + rnd() * 0.005, 0.46);
    }
  }

  // Fender fixing straps and tide-rub scars give the wall a readable scale from bowLow.
  for (let x = E.x0 + 6; x <= 165; x += 4.5) {
    for (const y of [1.35, 3.85]) {
      b.box('castIron', x - 0.21, y - 0.12, E.z + 0.727, 0.42, 0.24, 0.036);
      for (const dx of [-0.12, 0.12]) b.add('steelRaw', new THREE.CylinderGeometry(0.042, 0.042, 0.018, 6).rotateX(Math.PI / 2), mat(x + dx, y, E.z + 0.756));
    }
    b.box('quayRub', x - 0.13, 0.85 + rnd() * 0.22, E.z + 0.739, 0.25, 0.05, 0.012);
  }

  // Anchoring plates, four fasteners and collars under existing mooring bollards.
  // Bollard centres and hawser eyes remain exactly where buildOceanDock placed them.
  for (const p of bollards.filter(p => p.z < 0 && p.x < x1)) {
    b.box('castIron', p.x - 0.48, Q + 0.032, p.z - 0.45, 0.96, 0.06, 0.9);
    for (const dx of [-0.35, 0.35]) for (const dz of [-0.32, 0.32]) {
      b.add('steelRaw', new THREE.CylinderGeometry(0.065, 0.065, 0.07, 6), mat(p.x + dx, Q + 0.124, p.z + dz));
    }
  }
  for (const [x, z] of [[39, -62.8], [86, -62.8], [-148, -62.8]]) {
    for (let k = 0; k < 5; k++) {
      b.add('timberDark', new THREE.TorusGeometry(0.31 + k * 0.065, 0.033, 5, 26), mat(x, Q + 0.084 + k * 0.009, z, Math.PI / 2, 0, 0));
    }
    b.rod('timberDark', [x + 0.6, Q + 0.075, z], [x + 1.25, Q + 0.075, z + 0.24], 0.03, 5);
  }

  // A few grounded stacks under the passenger gallery, clear of crane bogies and stairs.
  // All geometry, straps and braces share the same transformed local coordinates.
  const crate = (cx, cz, width, height, depth, angle, base = Q + 0.035) => {
    const local = (x, y, z) => [cx + x * Math.cos(angle) + z * Math.sin(angle), base + y,
      cz - x * Math.sin(angle) + z * Math.cos(angle)];
    const box = (key, x, y, z, w, h, d) => b.add(key, new THREE.BoxGeometry(w, h, d), mat(...local(x, y, z), 0, angle, 0));
    box('crate', 0, height / 2, 0, width, height, depth);
    for (const dz of [-depth / 2 - 0.025, depth / 2 + 0.025]) {
      for (const dx of [-width * 0.34, width * 0.34]) box('timberDark', dx, height / 2, dz, 0.075, height, 0.045);
      for (const y of [0.07, height - 0.07]) box('timber', 0, y, dz, width + 0.02, 0.12, 0.05);
      b.strut('timber', local(-width * 0.38, 0.12, dz), local(width * 0.38, height - 0.12, dz), 0.07, 0.045);
    }
    for (const dx of [-width * 0.34, width * 0.34]) box('castIron', dx, height + 0.015, 0, 0.04, 0.025, depth + 0.03);
    cargo.push({ center: [cx, base + height / 2, cz], size: [width, height, depth], angle, base });
  };
  for (const [x, z] of [[62, -72.0], [96, -72.0], [-26, -72.0], [-116, -72.0]]) {
    crate(x, z, 1.6, 1.0, 1.05, 0.05);
    crate(x + 1.75, z + 0.15, 1.4, 0.78, 0.98, -0.09);
    crate(x, z, 1.28, 0.7, 0.88, -0.03, Q + 1.035);
    // A resting handbarrow with iron-rimmed wheels and handles, entirely landward.
    const tx = x + 3.7, tz = z;
    b.box('timber', tx - 0.95, Q + 0.36, tz - 0.42, 1.9, 0.12, 0.84);
    for (const dz of [-0.32, 0.32]) b.box('timberDark', tx - 1.5, Q + 0.35, tz + dz - 0.04, 3.0, 0.08, 0.08);
    for (const dz of [-0.53, 0.53]) {
      b.add('castIron', new THREE.TorusGeometry(0.28, 0.037, 5, 14), mat(tx + 0.5, Q + 0.28, tz + dz));
      b.rod('castIron', [tx + 0.5, Q + 0.28, tz + dz], [tx + 0.5, Q + 0.54, tz + dz], 0.025);
      b.rod('castIron', [tx + 0.25, Q + 0.28, tz + dz], [tx + 0.75, Q + 0.28, tz + dz], 0.025);
    }
  }

  const group = b.build({ name: 'berth44-quay-detail' });
  group.userData.quayDetail = { seed: 1912041044, cargo, grates, coping,
    bounds: { x0, x1, waterEdge: E.z, quayLevel: Q },
    preserved: 'gallery, cranes, rails, bollard centres and ship connections' };
  return group;
}
