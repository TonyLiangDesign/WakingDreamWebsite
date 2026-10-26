import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { add, tube, rod, box, crossSection, ribbon, spaced, v3, lerp, clamp01 } from './kit.js';
import { DECK_Y } from './hull.js';
import { rocketLauncher } from './fittings.js';

// Centre console: tapered console body, wrap-around screen and grab rails, cooler seat, and the
// T-top frame and canopy option (rocket launcher on the T-top, or behind the leaning post).
// Receives the lines, materials and build; returns the helm placement for helm.js:
//   { cx0, top, Wc, yTop(x), postX }  (postX = leaning post position)

// Builds the console into group; the helm and leaning post come from helm.js.
export function centreConsole(group, lines, m, build) {
  const { L } = lines;
  const cx0 = L * 0.44;
  const cx1 = L * 0.57;
  const Wc = 0.84;
  const top = DECK_Y + 1.02;
  const yTop = (x) => (x <= cx1 - 0.26 ? lerp(top + 0.02, top, (x - cx0) / (cx1 - 0.26 - cx0)) : lerp(top, DECK_Y + 0.8, (x - (cx1 - 0.26)) / 0.26));
  const halfAt = (x, y) => Wc / 2 - 0.07 * clamp01((y - DECK_Y - 0.3) / 0.7) - 0.06 * clamp01((x - cx0) / (cx1 - cx0));
  const xs = spaced(cx0, cx1, 10);
  add(group, ribbon(xs.map((x) => ({ x, pts: [[halfAt(x, DECK_Y), DECK_Y], [halfAt(x, yTop(x)), yTop(x)], [halfAt(x, yTop(x)), yTop(x)], [0, yTop(x)]] }))), m.trim);
  for (const x of [cx0, cx1]) {
    const y = yTop(x);
    add(group, crossSection([[halfAt(x, DECK_Y), DECK_Y], [halfAt(x, y), y], [-halfAt(x, y), y], [-halfAt(x, DECK_Y), DECK_Y]], x), m.trim);
  }
  // Console door to the head.
  box(group, m.rubber, [0.012, 0.55, 0.36], [cx1 + 0.002, DECK_Y + 0.38, 0], { cast: false });
  const postX = cx0 - 0.62;     // leaning post, built by helm.js

  // Wrap-around screen with a stainless top rail and console grab rails.
  const sx0 = cx1 - 0.2;
  const sx1 = cx1 - 0.48;
  const screenTop = top + 0.42;
  const ws = Wc / 2 - 0.06;
  const glassPts = [v3(sx0, top - 0.01, -ws), v3(sx0 + 0.04, top - 0.01, 0), v3(sx0, top - 0.01, ws)];
  const g = new THREE.BufferGeometry().setFromPoints([...glassPts, ...glassPts.map((p) => v3(sx1 + (p.x - sx0), screenTop, p.z * 0.92))]);
  g.setIndex([0, 4, 1, 0, 3, 4, 1, 5, 2, 1, 4, 5]);
  g.computeVertexNormals();
  add(group, g, m.glass, { cast: false });
  add(group, tube([v3(sx1, screenTop + 0.01, -ws * 0.92), v3(sx1 + 0.04, screenTop + 0.01, 0), v3(sx1, screenTop + 0.01, ws * 0.92)], 0.012, 16, 6), m.stainless);
  for (const side of [1, -1]) add(group, tube([v3(cx0 + 0.02, top - 0.08, side * (Wc / 2 + 0.04)), v3((cx0 + cx1) / 2, top - 0.02, side * (Wc / 2 + 0.02)), v3(cx1 - 0.08, top - 0.2, side * (Wc / 2 - 0.02))], 0.014, 16), m.stainless);

  const cooler = add(group, new RoundedBoxGeometry(0.5, 0.44, 0.78, 3, 0.05), m.seat);
  cooler.position.set(cx1 + 0.42, DECK_Y + 0.22, 0);

  const yT = DECK_Y + 2.05;
  if (build.options.includes('ttop')) {
    // Bent frame legs from the console sides to the canopy.
    for (const side of [1, -1]) {
      add(group, tube([v3(cx1 - 0.08, DECK_Y + 0.5, side * (Wc / 2 + 0.03)), v3(cx1 - 0.12, DECK_Y + 1.3, side * 0.5), v3(cx1 - 0.3, yT - 0.05, side * 0.6)], 0.024, 24, 8), m.stainless);
      add(group, tube([v3(cx0 + 0.06, DECK_Y + 0.5, side * (Wc / 2 + 0.03)), v3(cx0 - 0.04, DECK_Y + 1.3, side * 0.52), v3(cx0 - 0.3, yT - 0.05, side * 0.62)], 0.024, 24, 8), m.stainless);
      rod(group, v3(cx0 - 0.3, yT - 0.05, side * 0.62), v3(cx1 - 0.3, yT - 0.05, side * 0.6), 0.02, m.stainless);
    }
    const aft = cx0 - 0.85;
    const fwd = cx1 + 0.15;
    const canopy = add(group, new RoundedBoxGeometry(fwd - aft, 0.07, 1.55, 3, 0.03), m.trim);
    canopy.position.set((aft + fwd) / 2, yT + 0.035, 0);
    const light = add(group, new THREE.SphereGeometry(0.03, 12, 8), m.seat);
    light.position.set(aft + 0.25, yT + 0.32, 0);
    rod(group, v3(aft + 0.25, yT + 0.07, 0), v3(aft + 0.25, yT + 0.3, 0), 0.012, m.stainless);
    if (build.options.includes('rocket')) rocketLauncher(group, m, aft + 0.1, yT + 0.07, 1.25, 6);
  } else if (build.options.includes('rocket')) {
    rocketLauncher(group, m, postX - 0.3, DECK_Y + 1.26, 0.6, 4);
  }
  return { cx0, top, Wc, yTop, postX };
}
