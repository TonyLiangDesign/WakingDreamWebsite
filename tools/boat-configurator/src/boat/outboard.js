import * as THREE from 'three';
import { add, tube, rod, box, loft, sectionRing, spaced, v3, lerp } from './kit.js';

// Outboards: one generic four-stroke built by outboard(), mounted single or twin on the engine
// pod by outboards(). Receives the materials and the anchors from cockpit(); builds into group.

// Generic four-stroke outboard: sculpted cowl with a split line, midsection, gearcase,
// anti-ventilation plate, skeg and a three-blade prop. Local x = 0 is the bracket face.
function outboard(m, hp, plateY) {
  const g = new THREE.Group();
  const s = 0.86 + ((hp - 150) / 150) * 0.2;
  // Clamp brackets and tilt tube.
  for (const z of [-0.13, 0.13]) box(g, m.rubber, [0.14, 0.34, 0.03], [-0.07, -0.1, z * s]);
  rod(g, v3(-0.1, 0.02, -0.17 * s), v3(-0.1, 0.02, 0.17 * s), 0.03, m.galv);

  // Powerhead: lower cowl and top cowl lofted as one, a recessed split line between.
  const len = 0.95 * s;
  const xFront = -0.12;
  const yBase = -0.04;
  const ySplit = 0.27 * s;
  const rings = spaced(0.015, 0.985, 18).map((u) => {
    const round = Math.sin(Math.PI * u) ** 0.32;
    const x = xFront - u * len;
    const top = yBase + (0.86 - 0.12 * u) * s * Math.sin(Math.PI * Math.min(1, u * 0.9 + 0.08)) ** 0.22;
    const bottom = yBase + 0.02 * s * (1 - round);
    const half = 0.3 * s * round * (1 - 0.18 * u);
    return sectionRing(x, (top + bottom) / 2, Math.max(0.02, (top - bottom) / 2), Math.max(0.02, half), 3.2);
  });
  add(g, loft(rings), m.cowling);
  const split = rings.map((ring) => {
    const hit = ring.reduce((best, p) => (Math.abs(p.y - ySplit) < Math.abs(best.y - ySplit) && p.z > 0 ? p : best), ring[0]);
    return hit.x;
  });
  const widthAt = (ring) => Math.max(...ring.filter((p) => Math.abs(p.y - ySplit) < 0.08 * s).map((p) => Math.abs(p.z)), 0.02) + 0.004;
  const loop = [...rings.map((ring, i) => v3(split[i], ySplit, widthAt(ring))), ...rings.slice().reverse().map((ring, i) => v3(split[rings.length - 1 - i], ySplit, -widthAt(ring)))];
  add(g, tube(loop, 0.009, 90, 5, true), m.decal, { cast: false });
  const badge = add(g, new THREE.BoxGeometry(0.3 * s, 0.035 * s, 0.006), m.decal, { cast: false });
  badge.position.set(xFront - len * 0.45, ySplit + 0.2 * s, rings[9].reduce((a, p) => Math.max(a, p.z), 0) - 0.01);

  // Midsection, tapering to the anti-ventilation plate.
  const plate = plateY;
  const legRings = spaced(0, 1, 6).map((u) => sectionRing(0, 0, 1, 1, 2, 20).map((p) => v3(-0.44 * s + p.z * lerp(0.24, 0.19, u) * s, lerp(-0.02, plate, u), p.y * lerp(0.1, 0.065, u) * s)));
  add(g, loft(legRings), m.cowling);
  const plateShape = new THREE.Shape([[-0.22, -0.13], [-0.56, -0.13], [-0.64, -0.06], [-0.64, 0.06], [-0.56, 0.13], [-0.22, 0.13], [-0.18, 0]].map(([x, z]) => new THREE.Vector2(x * s, z * s)));
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, { depth: 0.012, bevelEnabled: false });
  plateGeo.rotateX(Math.PI / 2);
  add(g, plateGeo, m.cowling).position.y = plate;

  // Gearcase torpedo, skeg and prop.
  const gearY = plate - 0.17 * s;
  rod(g, v3(-0.3 * s, plate, 0), v3(-0.4 * s, gearY, 0), 0.06 * s, m.cowling, 14).scale.set(1, 1, 0.75);
  const gear = add(g, new THREE.CapsuleGeometry(0.075 * s, 0.34 * s, 6, 16), m.cowling);
  gear.position.set(-0.42 * s, gearY, 0);
  gear.rotation.z = Math.PI / 2;
  const skeg = new THREE.Shape([[-0.32, 0], [-0.54, 0], [-0.5, -0.22], [-0.44, -0.22]].map(([x, y]) => new THREE.Vector2(x * s, y * s)));
  const skegGeo = new THREE.ExtrudeGeometry(skeg, { depth: 0.02, bevelEnabled: false });
  skegGeo.translate(0, 0, -0.01);
  add(g, skegGeo, m.cowling).position.set(0, gearY - 0.04 * s, 0);

  const prop = new THREE.Group();
  prop.position.set(-0.68 * s, gearY, 0);
  const hub = add(prop, new THREE.CylinderGeometry(0.05 * s, 0.035 * s, 0.16 * s, 16), m.prop);
  hub.rotation.z = Math.PI / 2;
  const bladeShape = new THREE.Shape();
  bladeShape.absellipse(0, 0.12 * s, 0.075 * s, 0.13 * s, 0, Math.PI * 2);
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.x = (i * Math.PI * 2) / 3;
    const blade = add(pivot, new THREE.ExtrudeGeometry(bladeShape, { depth: 0.008, bevelEnabled: false, curveSegments: 12 }), m.prop);
    blade.rotation.y = Math.PI / 2 - 0.6;
    prop.add(pivot);
  }
  g.add(prop);
  g.rotation.z = -0.03;
  g.userData.prop = prop;
  return g;
}

// Single on the centreline or twin either side, clamped to the aft face of the engine pod.
export function outboards(group, m, { hp, twin, podTop, plateY, aft }) {
  for (const z of twin ? [-0.4, 0.4] : [0]) {
    const engine = outboard(m, hp, plateY);
    engine.position.set(aft, podTop, z);
    group.add(engine);
  }
}
