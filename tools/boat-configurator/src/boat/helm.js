import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { add, tube, rod, box, extrudeProfile, v3, lerp } from './kit.js';
import { DECK_Y } from './hull.js';

// Helm gear for both layouts: dash, flush MFD, switch panel, wheel on a tilt column, throttle
// binnacle, compass, pedestal seats and the leaning post. Builds into the group it is given.
// hardtopHelm() receives the placement returned by cabin.js: { C, hw(x), wallZ(x, y) }.
// consoleHelm() receives the placement returned by console.js: { cx0, top, Wc, yTop(x), postX }.

export function seat(group, m, x, z, pedestal) {
  rod(group, v3(x, DECK_Y, z), v3(x, DECK_Y + pedestal, z), 0.04, m.stainless);
  const foot = add(group, new THREE.CylinderGeometry(0.15, 0.17, 0.03, 20), m.stainless);
  foot.position.set(x, DECK_Y + 0.015, z);
  const cushion = add(group, new RoundedBoxGeometry(0.46, 0.12, 0.46, 3, 0.05), m.seat);
  cushion.position.set(x, DECK_Y + pedestal + 0.06, z);
  const back = add(group, new RoundedBoxGeometry(0.1, 0.32, 0.46, 3, 0.04), m.seat);
  back.position.set(x - 0.22, DECK_Y + pedestal + 0.24, z);
  back.rotation.z = 0.12;
}

// ---------- helm ----------

// Wheel on a tilt column from base along dir (in the x-y plane), with three spokes.
export function helmWheel(group, m, base, dir, reach = 0.2, radius = 0.17) {
  const centre = base.clone().addScaledVector(dir, reach);
  rod(group, base, centre, 0.026, m.dash, 10);
  const wheel = add(group, new THREE.TorusGeometry(radius, 0.017, 8, 36), m.rubber);
  wheel.position.copy(centre);
  wheel.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
  const hub = add(group, new THREE.CylinderGeometry(0.045, 0.045, 0.05, 16), m.stainless);
  hub.position.copy(centre);
  hub.quaternion.setFromUnitVectors(v3(0, 1, 0), dir);
  const u = v3(0, 0, 1);
  const w = new THREE.Vector3().crossVectors(dir, u).normalize();
  for (const a of [Math.PI / 2, (Math.PI * 7) / 6, (Math.PI * 11) / 6]) {
    rod(group, centre, centre.clone().addScaledVector(u, Math.cos(a) * radius).addScaledVector(w, Math.sin(a) * radius), 0.009, m.stainless, 6);
  }
}

// Panel set into a face tilted back by tilt radians: a bezel with a part proud of it.
export function flushPanel(group, bezelMat, faceMat, centre, tilt, w, h) {
  const bezel = add(group, new THREE.BoxGeometry(0.02, h + 0.04, w + 0.04), bezelMat);
  bezel.position.copy(centre);
  bezel.rotation.z = -tilt;
  const face = add(group, new THREE.BoxGeometry(0.004, h, w), faceMat, { cast: false });
  face.position.copy(centre).add(v3(-Math.cos(tilt) * 0.011, Math.sin(tilt) * 0.011, 0));
  face.rotation.z = -tilt;
}

export function binnacle(group, m, x, y, z) {
  const body = add(group, new RoundedBoxGeometry(0.16, 0.1, 0.12, 2, 0.03), m.dash);
  body.position.set(x, y + 0.05, z);
  rod(group, v3(x, y + 0.08, z), v3(x - 0.1, y + 0.19, z), 0.014, m.stainless, 8);
  const knob = add(group, new THREE.SphereGeometry(0.038, 14, 10), m.rubber);
  knob.position.set(x - 0.1, y + 0.2, z);
}

export function compass(group, m, x, y, z) {
  const base = add(group, new THREE.CylinderGeometry(0.07, 0.08, 0.04, 20), m.rubber);
  base.position.set(x, y + 0.02, z);
  const card = add(group, new THREE.CircleGeometry(0.055, 20), m.seat, { cast: false });
  card.position.set(x, y + 0.042, z);
  card.rotation.x = -Math.PI / 2;
  const dome = add(group, new THREE.SphereGeometry(0.065, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, { cast: false });
  dome.position.set(x, y + 0.04, z);
}

export function hardtopHelm(group, m, { C, hw, wallZ }) {
  // Helm and pedestal seats, seen through the open back; cuddy entrance forward.
  // Moulded dash with a raked face: flush MFD, switch panel, wheel on a tilt column,
  // throttle binnacle to starboard and a compass on top. Helm console below, cuddy to port.
  const dashX = C[0] - 0.18;
  const dTop = C[1] + 0.05;
  const dashW = 2 * wallZ(dashX + 0.18, dTop + 0.02) - 0.02;
  const fTop = [dashX - 0.04, dTop];
  const fBot = [dashX - 0.2, dTop - 0.26];
  const tilt = Math.atan2(fTop[0] - fBot[0], fTop[1] - fBot[1]);
  const nrm = v3(-Math.cos(tilt), Math.sin(tilt), 0);
  const onFace = (f, z, out = 0.012) => v3(lerp(fBot[0], fTop[0], f), lerp(fBot[1], fTop[1], f), z).addScaledVector(nrm, out);
  // Top sits just under the raked screen, the nose chamfered down to clear it.
  // Moulded in the cabin colour wall to wall, with a dark glare shield on top.
  add(group, extrudeProfile([[dashX + 0.18, DECK_Y + 0.62], [dashX + 0.18, C[1] - 0.1], [dashX + 0.08, dTop], fTop, fBot, [dashX - 0.2, DECK_Y + 0.62]], dashW, 0.01), m.trim);
  box(group, m.dash, [0.13, 0.012, dashW - 0.02], [dashX + 0.02, dTop + 0.016, 0], { cast: false });
  box(group, m.trim, [0.04, 0.7, 2 * hw(dashX + 0.16) - 0.02], [dashX + 0.16, DECK_Y + 0.35, 0]);
  const wheelZ = Math.min(hw(dashX) * 0.45, dashW / 2 - 0.22);
  // Helm console down to the floor on the starboard side, against the cabin side.
  const conZ0 = 0.06;
  const conZ1 = hw(dashX) - 0.01;
  box(group, m.trim, [0.38, 0.62, conZ1 - conZ0], [dashX - 0.01, DECK_Y + 0.31, (conZ0 + conZ1) / 2]);
  box(group, m.dash, [0.01, 0.12, conZ1 - conZ0 - 0.06], [dashX - 0.205, DECK_Y + 0.08, (conZ0 + conZ1) / 2], { cast: false });
  box(group, m.rubber, [0.01, 0.52, 0.44], [dashX + 0.135, DECK_Y + 0.34, -hw(dashX) / 2], { cast: false });
  flushPanel(group, m.rubber, m.screen, onFace(0.56, -0.08), tilt, 0.36, 0.19);
  flushPanel(group, m.rubber, m.dash, onFace(0.5, -(dashW / 2 - 0.16)), tilt, 0.16, 0.12);
  for (let i = 0; i < 5; i++) box(group, m.seat, [0.02, 0.025, 0.012], onFace(0.5, -(dashW / 2 - 0.22) + i * 0.03, 0.025).toArray(), { cast: false });
  helmWheel(group, m, onFace(0.38, wheelZ, 0), nrm, 0.22, 0.19);
  binnacle(group, m, dashX + 0.02, dTop, Math.min(wheelZ + 0.27, dashW / 2 - 0.1));
  compass(group, m, dashX + 0.03, dTop, wheelZ);
  for (const side of [1, -1]) seat(group, m, dashX - 0.98, side * hw(dashX) * 0.45, 0.42);
}

export function consoleHelm(group, m, { cx0, top, Wc, yTop, postX }) {
  // Dash pod and electronics on the console.
  const pod = add(group, new RoundedBoxGeometry(0.12, 0.3, 0.5, 2, 0.03), m.dash);
  pod.position.set(cx0 + 0.22, top + 0.13, 0);
  pod.rotation.z = -0.35;
  flushPanel(group, m.rubber, m.screen, v3(cx0 + 0.22 - Math.cos(0.35) * 0.065, top + 0.13 + Math.sin(0.35) * 0.065, 0), 0.35, 0.4, 0.22);
  helmWheel(group, m, v3(cx0 - 0.005, top - 0.2, 0.16), v3(-Math.cos(0.55), Math.sin(0.55), 0), 0.16);
  binnacle(group, m, cx0 + 0.08, yTop(cx0 + 0.08), Math.min(0.32, Wc / 2 - 0.1));
  compass(group, m, cx0 + 0.42, yTop(cx0 + 0.42), 0);
  const switches = add(group, new THREE.BoxGeometry(0.01, 0.12, 0.22), m.dash);
  switches.position.set(cx0 - 0.004, top - 0.18, -0.2);

  // Leaning post: stainless frame, bolster, backrest, rod holders behind.
  const xp = postX;
  for (const dz of [-0.3, 0.3]) {
    add(group, tube([v3(xp + 0.18, DECK_Y, dz), v3(xp + 0.14, DECK_Y + 0.7, dz), v3(xp - 0.08, DECK_Y + 1.02, dz), v3(xp - 0.18, DECK_Y + 1.2, dz)], 0.02, 24, 8), m.stainless);
    rod(group, v3(xp - 0.16, DECK_Y, dz), v3(xp - 0.12, DECK_Y + 0.72, dz), 0.02, m.stainless);
  }
  box(group, m.trim, [0.42, 0.06, 0.74], [xp, DECK_Y + 0.08, 0]);
  const bolster = add(group, new RoundedBoxGeometry(0.36, 0.16, 0.72, 3, 0.06), m.seat);
  bolster.position.set(xp, DECK_Y + 0.8, 0);
  const back = add(group, new RoundedBoxGeometry(0.12, 0.34, 0.68, 3, 0.04), m.seat);
  back.position.set(xp - 0.18, DECK_Y + 1.08, 0);
  back.rotation.z = 0.15;
  for (const z of [-0.2, 0, 0.2]) rod(group, v3(xp - 0.24, DECK_Y + 0.9, z), v3(xp - 0.34, DECK_Y + 1.14, z), 0.022, m.stainless);
}
