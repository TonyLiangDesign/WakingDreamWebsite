import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { add, tube, rod, box, extrudeProfile, spaced, v3, lerp } from './kit.js';

// Deck fittings: rocket launcher and rods, nav lights, bowsprit with roller and anchor, locker
// hatch, bow cleat, bow rail, and the underwater lights. Each builds into the group it is given;
// underwaterLights() also returns the lamp positions (boat-local) for the water glow.

export function rocketLauncher(group, m, x, y, width, count) {
  rod(group, v3(x, y, -width / 2), v3(x, y, width / 2), 0.02, m.stainless);
  for (let i = 0; i < count; i++) {
    const z = lerp(-width / 2, width / 2, count === 1 ? 0.5 : i / (count - 1));
    const splay = (z / Math.max(width, 0.01)) * 0.5;
    const holderDir = v3(-Math.sin(0.35), Math.cos(0.35), splay * 0.4).normalize();
    const base = v3(x, y, z);
    const top = base.clone().addScaledVector(holderDir, 0.28);
    rod(group, base, top, 0.022, m.stainless);
    const rodDir = v3(-Math.sin(0.48), Math.cos(0.48), splay).normalize();
    const blank = add(group, new THREE.CylinderGeometry(0.0035, 0.01, 1.85, 6), m.rod);
    blank.position.copy(top).addScaledVector(rodDir, 0.925);
    blank.quaternion.setFromUnitVectors(v3(0, 1, 0), rodDir);
    const reel = add(group, new THREE.CylinderGeometry(0.035, 0.035, 0.05, 14), m.stainless);
    reel.position.copy(top).addScaledVector(rodDir, 0.1).add(v3(-0.04, -0.03, 0));
    reel.rotation.x = Math.PI / 2;
  }
}

export function navLight(group, m, x, y, z) {
  box(group, m.galv, [0.12, 0.06, 0.02], [x, y, z]);
  box(group, z > 0 ? m.navGreen : m.navRed, [0.09, 0.035, 0.02], [x + 0.005, y, z + Math.sign(z) * 0.012], { cast: false });
}

// Short bowsprit with roller and anchor, locker hatch and cleat on the foredeck.
export function bowFittings(group, lines, m) {
  const { L, section } = lines;
  const y0 = lines.sheer(0.97) - 0.04;
  box(group, m.alloy, [0.86, 0.05, 0.18], [L - 0.12, y0, 0]);
  for (const side of [1, -1]) {
    add(group, extrudeProfile([[L + 0.02, y0], [L + 0.36, y0], [L + 0.33, y0 + 0.12], [L + 0.1, y0 + 0.07]], 0.012, 0.004), m.alloy).position.z = side * 0.085;
  }
  const roller = add(group, new THREE.CylinderGeometry(0.04, 0.04, 0.15, 16), m.rubber);
  roller.position.set(L + 0.29, y0 + 0.06, 0);
  roller.rotation.x = Math.PI / 2;
  // Plough anchor: shank along the sprit, flukes hanging over the roller.
  box(group, m.galv, [0.55, 0.035, 0.04], [L + 0.03, y0 + 0.12, 0]);
  for (const side of [1, -1]) {
    const fluke = add(group, extrudeProfile([[0, 0], [0.16, -0.05], [0.04, -0.24]], 0.014, 0.004), m.galv);
    fluke.position.set(L + 0.32, y0 + 0.12, side * 0.035);
    fluke.rotation.x = side * 0.5;
  }
  const s = section(0.85);
  const hatch = add(group, new RoundedBoxGeometry(0.5, 0.03, Math.min(0.5, s.hb * 0.9), 2, 0.012), m.deck);
  hatch.position.set(s.x, s.ys - 0.035, 0);
  box(group, m.stainless, [0.02, 0.02, 0.12], [s.x - 0.2, s.ys - 0.012, 0]);
  const c = section(0.92);
  box(group, m.stainless, [0.05, 0.03, 0.04], [c.x, c.ys - 0.03, 0]);
  rod(group, v3(c.x - 0.09, c.ys - 0.005, 0), v3(c.x + 0.09, c.ys - 0.005, 0), 0.012, m.stainless);
}

export function bowRail(group, lines, m) {
  const { L, section } = lines;
  const h = 0.36;
  const side = (sign) => spaced(0.64, 0.95, 12).map(section).map((s) => v3(s.x, s.ys + h, sign * (s.hb - 0.07)));
  const tip = v3(L + 0.16, lines.sheer(1) + h - 0.06, 0);
  add(group, tube([...side(-1), tip, ...side(1).reverse()], 0.014, 140), m.stainless);
  for (const t of [0.66, 0.79, 0.91]) {
    const s = section(t);
    for (const sign of [1, -1]) rod(group, v3(s.x, s.ys, sign * (s.hb - 0.07)), v3(s.x, s.ys + h, sign * (s.hb - 0.07)), 0.012, m.stainless);
  }
  // The rail lands on the bowsprit.
  rod(group, v3(L + 0.16, lines.sheer(0.97) - 0.015, 0), tip, 0.014, m.stainless);
}

// Underwater lights on the aft faces of the boarding pods; anchors come from cockpit().
export function underwaterLights(group, m, { zi, platY, bottomAt, aft }) {
  const leds = [];
  for (const side of [-1, 1]) {
    const z = side * (zi + 0.14);
    const lamp = add(group, new THREE.CircleGeometry(0.045, 20), m.led, { cast: false });
    lamp.position.set(aft - 0.016, Math.min(platY - 0.1, bottomAt(zi + 0.14) + 0.12), z);
    lamp.rotation.y = -Math.PI / 2;
    leds.push(lamp.position.clone());
  }
  return leds;
}
