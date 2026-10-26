import * as THREE from 'three';
import { add, tube, rod, crossSection, ribbon, spaced, v3, lerp } from './kit.js';
import { DECK_Y, CAP } from './hull.js';
import { navLight, rocketLauncher } from './fittings.js';

// Walkaround hardtop: side walls with real window openings, tinted glass and frames, raked
// see-through windscreen with wipers, side decks, nav lights, roof with aft legs, grab rails,
// spotlight, VHF whip and all-round light, and the rocket launcher on the roof.
// Receives the lines, materials and build; returns the helm placement for helm.js:
//   { C, hw(x), wallZ(x, y) }  (C = foot of the windscreen, hw/wallZ = inside of the walls)

const SIDE_DECK = 0.27;         // walkaround width, capping included

// Walkaround hardtop: tapered, tumblehomed sides, raked screen, open aft to the cockpit.
export function hardtop(group, lines, m, build) {
  const { L, section, halfBeam } = lines;
  const x0 = L * 0.38;
  const x1 = L * 0.78;
  const sideY = (x) => lines.sheer(x / L) - 0.05;
  const hw = (x) => Math.max(0.45, halfBeam(x / L) - SIDE_DECK);
  const hwT = (x) => hw(x) - 0.09;
  const yR = DECK_Y + 1.95;
  const B2 = [x1, sideY(x1) + 0.24];
  const C = [x1 - 0.3, B2[1] + 0.3];
  const D = [x1 - 0.98, yR];
  const yTop = (x) => (x <= D[0] ? yR : x <= C[0] ? lerp(yR, C[1], (x - D[0]) / (C[0] - D[0])) : lerp(C[1], B2[1], (x - C[0]) / (x1 - C[0])));
  const wallZ = (x, y) => (y <= sideY(x) ? hw(x) : lerp(hw(x), hwT(x), (y - sideY(x)) / (yTop(x) - sideY(x))));

  // Window openings: sills at yw0, heads at yw1 or under the raked screen.
  const yw0 = yR - 0.72;
  const yw1 = yR - 0.14;
  const head = (x) => Math.min(yw1, yTop(x) - 0.1);
  const xa = x0 + 0.12;
  const xm = (x0 + C[0]) / 2 - 0.1;
  // The forward pane stops where the raked screen comes down to the sill.
  const xb = Math.min(C[0] - 0.12, D[0] + ((yR - yw0 - 0.3) / (yR - C[1])) * (C[0] - D[0]));
  const panes = [[xa, xm - 0.04], [xm + 0.04, xb]];
  const sx0 = D[0] + 0.05;
  const sx1 = C[0] - 0.04;
  const breaks = [x0, xa, xm - 0.04, xm + 0.04, xb, D[0], sx0, sx1, C[0], x1];
  const xsAll = [...new Set([...spaced(x0, x1, 28), ...breaks].map((x) => +x.toFixed(4)))].sort((a, b) => a - b);
  const within = (a, b) => xsAll.filter((x) => x >= a - 1e-4 && x <= b + 1e-4);

  // Side walls: solid to the sills, open between sill and head, solid above and between panes.
  const sill = (x) => Math.min(yw0, yTop(x));
  add(group, ribbon(xsAll.map((x) => ({ x, pts: [[hw(x), DECK_Y], [hw(x), sideY(x)], [hw(x), sideY(x)], [wallZ(x, sill(x)), sill(x)]] }))), m.trim);
  const solid = [[x0, xa], [xm - 0.04, xm + 0.04], [xb, x1]];
  for (const [a, b] of solid) add(group, ribbon(within(a, b).map((x) => ({ x, pts: [[wallZ(x, sill(x)), sill(x)], [hwT(x), yTop(x)]] }))), m.trim);
  for (const [a, b] of panes) add(group, ribbon(within(a, b).map((x) => ({ x, pts: [[wallZ(x, head(x)), head(x)], [hwT(x), yTop(x)]] }))), m.trim);
  // Roof skin, open over the windscreen panes either side of a centre mullion.
  const topSkin = (a, b, zo, zi) => add(group, ribbon(within(a, b).map((x) => ({ x, pts: [[zo(x), yTop(x)], [zi(x), yTop(x)]] }))), m.trim);
  topSkin(x0, sx0, hwT, () => 0);
  topSkin(sx1, x1, hwT, () => 0);
  topSkin(sx0, sx1, hwT, (x) => hwT(x) - 0.05);
  topSkin(sx0, sx1, () => 0.035, () => 0);
  const front = [[hw(x1), DECK_Y], [hw(x1), sideY(x1)], [hwT(x1), yTop(x1)], [-hwT(x1), yTop(x1)], [-hw(x1), sideY(x1)], [-hw(x1), DECK_Y]];
  add(group, crossSection(front, x1), m.trim);

  // Side decks between the hardtop and the gunwale.
  const decks = spaced(x0, x1, 10).map((x) => section(x / L)).map((s) => ({ x: s.x, pts: [[hw(s.x), sideY(s.x)], [s.inner, sideY(s.x)]] }));
  add(group, ribbon(decks), m.nonslip);

  // Tinted glass in the openings, black frames round them, a sliding-pane split in each.
  for (const [a, b] of panes) {
    add(group, ribbon(within(a, b).map((x) => ({ x, pts: [[wallZ(x, yw0) + 0.004, yw0], [wallZ(x, head(x)) + 0.004, head(x)]] }))), m.glass, { cast: false });
    const mid = (a + b) / 2;
    for (const side of [1, -1]) {
      const at = (x, y) => v3(x, y, side * (wallZ(x, y) + 0.008));
      const outline = [...spaced(a, b, 4).map((x) => at(x, yw0)), ...spaced(b, a, 4).map((x) => at(x, head(x)))];
      add(group, tube(outline, 0.011, 64, 5, true), m.rubber, { cast: false });
      rod(group, at(mid, yw0 + 0.02), at(mid, head(mid) - 0.02), 0.008, m.rubber, 6);
    }
  }
  for (const side of [1, -1]) navLight(group, m, x1 - 0.25, sideY(x1 - 0.25) + 0.12, side * (hw(x1 - 0.25) + 0.012));

  // Raked windscreen: two see-through panes either side of a centre mullion, framed, with wipers.
  add(group, ribbon(within(sx0, sx1).map((x) => ({ x, pts: [[hwT(x) - 0.05, yTop(x) + 0.004], [0.035, yTop(x) + 0.004]] }))), m.glass, { cast: false });
  for (const side of [1, -1]) {
    const at = (x, z) => v3(x, yTop(x) + 0.012, side * z);
    const outline = [at(sx0, 0.035), at(sx1, 0.035), at(sx1, hwT(sx1) - 0.05), at((sx0 + sx1) / 2, hwT((sx0 + sx1) / 2) - 0.05), at(sx0, hwT(sx0) - 0.05)];
    add(group, tube(outline, 0.011, 48, 5, true), m.rubber, { cast: false });
  }
  for (const side of [1, -1]) {
    const a = v3(lerp(C[0], D[0], 0.18), lerp(C[1], yR, 0.18) + 0.03, side * 0.22);
    rod(group, a, v3(lerp(C[0], D[0], 0.62), lerp(C[1], yR, 0.62) + 0.03, side * 0.4), 0.007, m.rubber, 6);
  }

  // Roof: tapered in plan, overhanging the cockpit on two posts.
  const roofAft = x0 - 0.5;
  const roofFwd = D[0] + 0.12;
  const ra = hwT(x0) + 0.07;
  const rf = hwT(D[0]) + 0.07;
  const roofShape = new THREE.Shape([[roofAft, -ra], [roofFwd, -rf], [roofFwd + 0.04, 0], [roofFwd, rf], [roofAft, ra]].map(([x, z]) => new THREE.Vector2(x, z)));
  const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.02, bevelSegments: 2 });
  roof.rotateX(-Math.PI / 2);
  roof.translate(0, yR + 0.02, 0);
  add(group, roof, m.trim);
  const sp = section((x0 - 0.42) / L);
  // Aft legs land on the gunwale capping on base plates.
  for (const side of [1, -1]) {
    const foot = v3(x0 - 0.42, sp.ys, side * (sp.hb - CAP / 2));
    rod(group, foot, v3(x0 - 0.42, yR + 0.02, side * (ra - 0.06)), 0.028, m.stainless);
    const plate = add(group, new THREE.CylinderGeometry(0.06, 0.065, 0.014, 20), m.stainless);
    plate.position.copy(foot).add(v3(0, 0.007, 0));
  }

  // Roof grab rails, spotlight, VHF whip and all-round light.
  for (const side of [1, -1]) {
    const z = side * (Math.min(ra, rf) - 0.1);
    const xr0 = roofAft + 0.3;
    const xr1 = roofFwd - 0.25;
    add(group, tube([v3(xr0, yR + 0.08, z), v3(xr0 + 0.06, yR + 0.16, z), v3(xr1 - 0.06, yR + 0.16, z), v3(xr1, yR + 0.08, z)], 0.012, 24, 6), m.stainless);
  }
  const lamp = add(group, new THREE.CylinderGeometry(0.075, 0.06, 0.13, 18), m.trim);
  lamp.position.set(roofFwd - 0.18, yR + 0.17, 0);
  lamp.rotation.z = Math.PI / 2;
  const lens = add(group, new THREE.CircleGeometry(0.065, 18), m.lens, { cast: false });
  lens.position.set(roofFwd - 0.11, yR + 0.17, 0);
  lens.rotation.y = Math.PI / 2;
  rod(group, v3(roofFwd - 0.2, yR + 0.07, 0), v3(roofFwd - 0.2, yR + 0.12, 0), 0.025, m.galv);
  rod(group, v3(roofAft + 0.2, yR + 0.07, -(ra - 0.12)), v3(roofAft + 0.02, yR + 1.45, -(ra - 0.08)), 0.009, m.seat, 6);
  rod(group, v3(roofAft + 0.3, yR + 0.07, 0), v3(roofAft + 0.3, yR + 0.42, 0), 0.012, m.stainless);
  const allRound = add(group, new THREE.SphereGeometry(0.03, 12, 8), m.seat);
  allRound.position.set(roofAft + 0.3, yR + 0.44, 0);

  if (build.options.includes('rocket')) rocketLauncher(group, m, roofAft + 0.14, yR + 0.09, ra * 1.5, 6);
  return { C, hw, wallZ };
}
