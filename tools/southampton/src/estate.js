import * as THREE from 'three';
import { Builder, mat } from './builder.js';
import { DOCK_ESTATE, TRAFALGAR_DD, INNER_DOCK, OD, TEST_QUAY, ITCHEN_WHARVES } from './layout.js';
import { ll } from './geo.js';

const Q = 4.6;
const FLOOR = -14;

function shapeFrom(poly) {
  return new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
}

// The Eastern Docks made ground: one extruded slab whose side faces are the quay walls,
// with copings and timber fenders along every waterside edge.
export function buildEstate(M) {
  const shape = shapeFrom(DOCK_ESTATE);
  shape.holes.push(new THREE.Path(TRAFALGAR_DD.map(([x, z]) => new THREE.Vector2(x, -z))));
  shape.holes.push(new THREE.Path(INNER_DOCK.map(([x, z]) => new THREE.Vector2(x, -z))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Q - 0.02 - FLOOR, bevelEnabled: false, curveSegments: 1 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, FLOOR, 0);
  // ExtrudeGeometry: group 0 = caps, group 1 = sides
  const slab = new THREE.Mesh(geo, [M.yard, M.quayWall]);
  slab.name = 'estate-slab';
  slab.receiveShadow = true;

  const b = new Builder(M);
  const inland = ll(50.89431, -1.39275);
  const isOD = (p) => OD.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.5);
  let stop = DOCK_ESTATE.findIndex((p) => Math.hypot(p[0] - inland[0], p[1] - inland[1]) < 1);
  const edges = [];
  for (let i = 0; i < stop; i++) {
    const a = DOCK_ESTATE[i], c = DOCK_ESTATE[i + 1];
    if (isOD(a) && isOD(c)) continue; // Ocean Dock handled in dock.js
    edges.push([a, c]);
  }
  for (const hole of [TRAFALGAR_DD, INNER_DOCK]) for (let i = 0; i < hole.length; i++) edges.push([hole[(i + 1) % hole.length], hole[i], true]);
  const sign = polySign(DOCK_ESTATE);
  for (const [a, c, isHole] of edges) {
    const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    if (len < 2) continue;
    const ux = dx / len, uz = dz / len;
    // outward (water side) normal
    let nx = uz * sign, nz = -ux * sign;
    if (isHole) { nx = -nx; nz = -nz; }
    const ang = Math.atan2(dz, dx);
    const cx = (a[0] + c[0]) / 2 - nx * 0.6, cz = (a[1] + c[1]) / 2 - nz * 0.6;
    b.cbox('coping', cx, Q - 0.3, cz, len, 0.6, 1.38, 0, -ang, 0);
    b.cbox('setts', (a[0] + c[0]) / 2 - nx * 6.5, Q - 0.04, (a[1] + c[1]) / 2 - nz * 6.5, len, 0.1, 10.5, 0, -ang, 0);
    if (!isHole && len > 30) {
      for (let t = 3; t < len - 3; t += 4.5) {
        const px = a[0] + ux * t + nx * 0.22, pz = a[1] + uz * t + nz * 0.22;
        b.add('fender', new THREE.BoxGeometry(0.36, Q + 1.85, 0.42), mat(px, (Q - 0.35 - 2.2) / 2 + 0.0, pz, 0, -ang, 0));
      }
      for (let t = 12; t < len - 6; t += 26) {
        const px = a[0] + ux * t - nx * 2.2, pz = a[1] + uz * t - nz * 2.2;
        const prof = [[0, 0], [0.34, 0], [0.34, 0.08], [0.26, 0.14], [0.22, 0.55], [0.3, 0.7], [0.38, 0.78], [0.36, 0.86], [0.2, 0.92], [0, 0.94]].map(([r, y]) => new THREE.Vector2(r, y));
        b.add('castIron', new THREE.LatheGeometry(prof, 12), mat(px, Q, pz));
      }
    }
  }
  const group = new THREE.Group();
  group.name = 'Estate';
  for (const wp of ITCHEN_WHARVES) {
    const wg = new THREE.ExtrudeGeometry(shapeFrom(wp), { depth: Q - 0.4 - FLOOR, bevelEnabled: false, curveSegments: 1 });
    wg.rotateX(-Math.PI / 2); wg.translate(0, FLOOR, 0);
    const wm = new THREE.Mesh(wg, [M.timberDark, M.quayWall]);
    wm.receiveShadow = true; wm.castShadow = true; wm.name = 'itchen-wharf';
    group.add(wm);
  }
  group.add(slab, b.build({ name: 'estate-quays' }));
  return group;
}

function polySign(p) {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] - p[i][0]) * (p[j][1] + p[i][1]);
  return Math.sign(a);
}
