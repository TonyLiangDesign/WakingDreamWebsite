import * as THREE from 'three';
import { add, rod, box, mergeStatic, v3, lerp } from './kit.js';
import { KEEL_BAR } from './hull.js';

// Stands: the braked trailer and the studio display cradle, each sized to the hull lines and
// returned as its own merged group. TRAILER_LIFT and CRADLE_LIFT are the heights of the hull's
// waterline (boat y = 0) above the floor on each.

export const TRAILER_LIFT = 1.08;
export const CRADLE_LIFT = 0.8;

export function trailer(lines, m) {
  const { L, B } = lines;
  const g = new THREE.Group();
  const beamY = 0.5;
  const beam = (x0, x1, z0, z1, size = 0.1) => {
    const a = v3(x0, beamY, z0);
    const b = v3(x1, beamY, z1);
    const len = a.distanceTo(b);
    const mesh = add(g, new THREE.BoxGeometry(len, size, size), m.galv);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  };
  for (const z of [0.42, -0.42]) beam(-0.35, L + 0.1, z, z);
  for (const z of [0.42, -0.42]) beam(L + 0.1, L + 1.5, z, 0);
  beam(L + 1.0, L + 1.9, 0, 0, 0.09);
  for (const x of [0.15, L * 0.33, L * 0.62, L - 0.15]) beam(x, x + 0.001, -0.78, 0.78, 0.09);

  const coupling = add(g, new THREE.SphereGeometry(0.07, 16, 10), m.galv);
  coupling.position.set(L + 1.95, beamY + 0.02, 0);
  const jockey = add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.07, 20), m.tyre);
  jockey.position.set(L + 1.45, 0.1, 0.16);
  jockey.rotation.x = Math.PI / 2;
  rod(g, v3(L + 1.45, 0.12, 0.16), v3(L + 1.45, beamY + 0.25, 0.16), 0.03, m.galv);

  // Axle, wheels and guards sit just inside the chines.
  const axleX = L * 0.42;
  const wheelZ = B / 2 - 0.12;
  rod(g, v3(axleX, 0.34, -wheelZ), v3(axleX, 0.34, wheelZ), 0.035, m.galv);
  for (const side of [1, -1]) {
    for (const dx of [-0.4, 0.4]) {
      const x = axleX + dx;
      const tyre = add(g, new THREE.CylinderGeometry(0.33, 0.33, 0.2, 32), m.tyre);
      tyre.position.set(x, 0.33, side * wheelZ);
      tyre.rotation.x = Math.PI / 2;
      const rim = add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.21, 24), m.galv);
      rim.position.copy(tyre.position);
      rim.rotation.x = Math.PI / 2;
    }
    // Open half-cylinder over the tandem pair, stretched fore and aft.
    const guard = add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.26, 32, 1, true, Math.PI / 2, Math.PI), m.galv);
    guard.scale.set(2.1, 1, 1);
    guard.position.set(axleX, 0.36, side * wheelZ);
    guard.rotation.x = Math.PI / 2;
    rod(g, v3(axleX, beamY, side * 0.42), v3(axleX, 0.6, side * (wheelZ - 0.1)), 0.03, m.galv);
  }

  // Keel rollers under the keel bar and carpeted skids matched to the deadrise.
  const contact = (t, z) => {
    const s = lines.section(t);
    return TRAILER_LIFT + lerp(s.yk, s.yc, Math.min(1, z / s.zc));
  };
  for (const t of [0.08, 0.3, 0.52, 0.7]) {
    const x = t * L;
    const top = contact(t, 0) - KEEL_BAR;
    rod(g, v3(x, beamY, 0), v3(x, top - 0.06, 0), 0.03, m.galv);
    const roller = add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.22, 16), m.rubber);
    roller.position.set(x, top - 0.05, 0);
    roller.rotation.x = Math.PI / 2;
  }
  const skidZ = 0.56;
  for (const side of [1, -1]) {
    const t0 = 0.05;
    const t1 = 0.58;
    const y0 = contact(t0, skidZ);
    const y1 = contact(t1, skidZ);
    const skid = add(g, new THREE.BoxGeometry((t1 - t0) * L, 0.07, 0.12), m.carpet);
    skid.position.set(((t0 + t1) / 2) * L, (y0 + y1) / 2 - 0.04, side * skidZ);
    skid.rotation.x = side * lines.section(0.3).dr * 0.9;
    for (const t of [0.12, 0.5]) rod(g, v3(t * L, beamY, side * 0.42), v3(t * L, contact(t, skidZ) - 0.07, side * skidZ), 0.025, m.galv);
  }

  // Winch post with bow snubber.
  const postX = L + 0.12;
  const postTop = TRAILER_LIFT + lines.keel(0.97) + 0.12;
  rod(g, v3(postX, beamY, 0), v3(postX, postTop, 0), 0.045, m.galv);
  rod(g, v3(postX + 0.55, beamY, 0), v3(postX, postTop - 0.2, 0), 0.03, m.galv);
  const winch = add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.16, 16), m.galv);
  winch.position.set(postX + 0.05, postTop - 0.25, 0);
  winch.rotation.x = Math.PI / 2;
  const snubber = add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.2, 16), m.rubber);
  snubber.position.set(postX - 0.06, postTop - 0.02, 0);
  snubber.rotation.x = Math.PI / 2;

  const lightBar = add(g, new THREE.BoxGeometry(0.05, 0.08, 1.9), m.galv);
  lightBar.position.set(-0.6, 0.72, 0);
  for (const side of [1, -1]) {
    const light = add(g, new THREE.BoxGeometry(0.03, 0.09, 0.18), m.tailLight);
    light.position.set(-0.64, 0.72, side * 0.86);
  }
  rod(g, v3(-0.35, beamY, 0.42), v3(-0.6, 0.72, 0.42), 0.025, m.galv);
  rod(g, v3(-0.35, beamY, -0.42), v3(-0.6, 0.72, -0.42), 0.025, m.galv);
  return mergeStatic(g);
}

// Display cradle: timber keel blocks on bearers, one under the transom, and padded poppets
// either side set to the deadrise.
export function cradle(lines, m) {
  const g = new THREE.Group();
  const { L } = lines;
  for (const t of [0.03, 0.3, 0.62]) {
    const x = t * L;
    const top = CRADLE_LIFT + lines.keel(t) - KEEL_BAR;
    box(g, m.wood, [0.24, 0.12, 1.2], [x, 0.06, 0]);
    const h = (top - 0.12) / 2;
    box(g, m.wood, [0.34, h - 0.004, 0.4], [x, 0.12 + h / 2, 0]);
    box(g, m.wood, [0.28, h, 0.32], [x + 0.012, 0.12 + h * 1.5, 0]);
    box(g, m.rubber, [0.3, 0.012, 0.22], [x, top - 0.006, 0], { cast: false });
  }
  for (const t of [0.2, 0.52]) {
    const s = lines.section(t);
    const f = 0.55;
    const z = s.zc * f;
    const y = CRADLE_LIFT + lerp(s.yk, s.yc, f);
    for (const side of [1, -1]) {
      const footZ = side * (z + 0.12);
      box(g, m.galv, [0.32, 0.02, 0.32], [t * L, 0.01, footZ]);
      rod(g, v3(t * L, 0.02, footZ), v3(t * L, y - 0.08, side * z), 0.035, m.galv);
      rod(g, v3(t * L, y - 0.12, side * z), v3(t * L, y - 0.05, side * z), 0.05, m.galv);
      const pad = add(g, new THREE.BoxGeometry(0.36, 0.05, 0.22), m.carpet);
      pad.position.set(t * L, y - 0.028, side * z);
      pad.rotation.x = -side * s.dr;
    }
  }
  return mergeStatic(g);
}
