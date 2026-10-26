import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { add, tube, rod, box, v3, lerp } from './kit.js';
import { DECK_Y } from './hull.js';
import * as fit from './fittings.js';
import { strip, ringCap, roundLoop, offsetLoop, partMaterials, slab } from './cabin.js';

// Centre console: a moulded-look plate console with rounded corners, a toe kick, a starboard
// door to the head, smoked acrylic wrap screen with a stainless top rail, side grab rails and a
// cushioned front seat. The T-top option is a welded tube frame on four deck-mounted legs with a
// fabric canopy (bound and stitched edges, 1.98 m headroom), rocket launcher on stand-offs, VHF
// whip, LED spot, downlights and an all-round light. Without it: a bow bicolour on the foredeck,
// an all-round light on a pole at the front of the console, and the launcher on the leaning post
// rail (helm.js). Light and launcher geometry comes from fittings.js.
// Receives the lines, materials and build; returns the helm placement for helm.js:
//   { cx0, top, Wc, yTop(x), postX }  (cx0 = vertical aft face, top = height of the dash top at
//   cx0, Wc = width at the deck, yTop = top surface height, postX = leaning post position)

export function centreConsole(group, lines, m, build) {
  const { L } = lines;
  const pm = partMaterials(m);
  const cx0 = L * 0.44;
  const len = 0.8 + (0.08 * (L - 5.5)) / 1.3;
  const cx1 = cx0 + len;
  const Wc = 0.86;
  const top = DECK_Y + 1.1;
  const flat = cx0 + 0.67;             // flat dash top, screen base, then the front slopes down
  const yFront = DECK_Y + 0.8;
  const yTop = (x) => (x <= flat ? lerp(top + 0.015, top, (x - cx0) / (flat - cx0)) : lerp(top, yFront, (x - flat) / (cx1 - flat)));
  // Sides lean in with height and taper forward (linear, so the flat sides stay flat).
  const halfAt = (x, y) => Wc / 2 - 0.03 * (y - DECK_Y) - (0.03 * (x - cx0)) / len;
  const postX = cx0 - 0.62;            // leaning post, built by helm.js

  // ----- body: side profile with filleted edges, extruded with a rounded bevel, then tapered -----
  const b = 0.025;
  const profile = [[cx0 + 0.07, DECK_Y - 0.06], [cx1, DECK_Y - 0.06], [cx1, yFront], [flat, top], [cx0, top + 0.015], [cx0, DECK_Y + 0.15], [cx0 + 0.07, DECK_Y + 0.1]];
  const rounded = roundLoop(profile, [0.02, 0.02, 0.06, 0.03, 0.05, 0.03, 0.03], 4, 0.25);
  const shape = new THREE.Shape(offsetLoop(rounded, -b).map(([x, y]) => new THREE.Vector2(x, y)));
  const body = new THREE.ExtrudeGeometry(shape, { depth: Wc - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 3, curveSegments: 4 });
  body.translate(0, 0, -(Wc - 2 * b) / 2);
  const bp = body.attributes.position;
  for (let i = 0; i < bp.count; i++) bp.setZ(i, (bp.getZ(i) * halfAt(bp.getX(i), Math.max(DECK_Y, bp.getY(i)))) / (Wc / 2));
  add(group, body, m.trim);

  // Door to the head on the starboard side: gasket, proud panel, hinges, latch, vent slots.
  const dx0 = cx0 + 0.19;
  const dx1 = Math.min(cx1 - 0.1, cx0 + 0.56);
  const dy0 = DECK_Y + 0.2;
  const dy1 = DECK_Y + 0.8;
  const door = roundLoop([[dx0, dy0], [dx1, dy0], [dx1, dy1], [dx0, dy1]], 0.035, 4, 0.08);
  const onSide = (loop, d) => loop.map(([x, y]) => v3(x, y, halfAt(x, y) + d));
  add(group, strip(onSide(offsetLoop(door, 0.009), 0.001), onSide(door, 0.001), true), pm.frame);
  add(group, strip(onSide(door, 0.001), onSide(door, 0.008), true), m.trim);
  add(group, ringCap(door, (x, y) => v3(x, y, halfAt(x, y) + 0.008)), m.trim);
  for (const y of [dy0 + 0.1, dy1 - 0.1]) {
    const hinge = add(group, new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), m.stainless);
    hinge.position.set(dx0 - 0.004, y, halfAt(dx0, y) + 0.012);
  }
  const ly = (dy0 + dy1) / 2;
  const latch = add(group, new RoundedBoxGeometry(0.03, 0.09, 0.018, 2, 0.006), m.stainless);
  latch.position.set(dx1 - 0.05, ly, halfAt(dx1 - 0.05, ly) + 0.016);
  for (let k = 0; k < 4; k++) {
    const y = dy0 + 0.06 + k * 0.025;
    box(group, pm.frame, [0.16, 0.008, 0.004], [(dx0 + dx1) / 2, y, halfAt((dx0 + dx1) / 2, y) + 0.0095], { cast: false });
  }

  // Grab rails along both sides of the console top.
  for (const s of [1, -1]) {
    const yG = top - 0.13;
    const xa = cx0 + 0.08;
    const xb = flat - 0.06;
    const at = (x, d) => v3(x, yG, s * (halfAt(x, yG) + d));
    add(group, tube([at(xa, 0), at(xa + 0.015, 0.035), at(xa + 0.06, 0.05), at((xa + xb) / 2, 0.05), at(xb - 0.06, 0.05), at(xb - 0.015, 0.035), at(xb, 0)], 0.0125, 40, 8), m.stainless);
  }

  // ----- smoked acrylic wrap screen with a stainless top rail -----
  const apex = cx0 + 0.58;
  const xs0 = cx0 + 0.2;
  const N = 16;
  const base = [];
  const edge = [];
  for (let i = 0; i <= N; i++) {
    const th = lerp(-Math.PI / 2, Math.PI / 2, i / N);
    const c = Math.abs(Math.cos(th));
    const sn = Math.sin(th);
    const x = xs0 + (apex - xs0) * c ** 0.75;
    const z = Math.sign(sn) * Math.abs(sn) ** 0.75 * (halfAt(x, top) - 0.035);
    const y = yTop(x) + 0.003;
    const front = c ** 0.7;
    const h = lerp(0.25, 0.4, front);
    base.push(v3(x, y, z));
    edge.push(v3(x - h * Math.tan(0.45) * lerp(0.2, 1, front), y + h, z * 0.93));
  }
  add(group, strip(base, edge), pm.acrylic, { cast: false });
  add(group, tube(base, 0.007, 64, 6), pm.frame, { cast: false });
  const railOf = (p) => p.clone().add(v3(-0.012, 0.035, 0));
  const ends = [0, N].map((i) => ({ low: v3(base[i].x - 0.05, yTop(base[i].x - 0.05), base[i].z * 0.97), high: railOf(edge[i]).add(v3(-0.03, 0, 0)) }));
  add(group, tube([ends[0].low, ends[0].low.clone().add(v3(0, 0.05, 0)), ends[0].high, ...edge.slice(1, N).map(railOf), ends[1].high, ends[1].low.clone().add(v3(0, 0.05, 0)), ends[1].low], 0.011, 96, 8), m.stainless);
  for (const i of [3, N / 2, N - 3]) rod(group, edge[i].clone().add(v3(0, -0.012, 0)), railOf(edge[i]), 0.007, m.stainless, 6);
  for (const e of ends) {
    const fl = add(group, new THREE.CylinderGeometry(0.02, 0.022, 0.008, 12), m.stainless);
    fl.position.copy(e.low).add(v3(0, 0.004, 0));
  }

  // ----- front seat: moulded box with cushion and backrest, piped edges -----
  const sx0 = cx1 + 0.03;
  const sx1 = cx1 + 0.53;
  const sw = 0.8;
  const seatBase = add(group, new RoundedBoxGeometry(sx1 - sx0, 0.38, sw, 3, 0.03), m.trim);
  seatBase.position.set((sx0 + sx1) / 2, DECK_Y + 0.19, 0);
  box(group, pm.frame, [0.006, 0.01, sw - 0.06], [sx1 + 0.001, DECK_Y + 0.33, 0], { cast: false });
  const cushion = add(group, new RoundedBoxGeometry(sx1 - sx0 + 0.02, 0.09, sw + 0.02, 4, 0.035), m.seat);
  cushion.position.set((sx0 + sx1) / 2, DECK_Y + 0.425, 0);
  const pipe = roundLoop([[sx1 - 0.002, sw / 2 - 0.002], [sx0 + 0.002, sw / 2 - 0.002], [sx0 + 0.002, -sw / 2 + 0.002], [sx1 - 0.002, -sw / 2 + 0.002]], 0.03, 4, 0.1);
  add(group, tube(pipe.map(([x, z]) => v3(x, DECK_Y + 0.462, z)), 0.006, 96, 5, true), m.dash, { cast: false });
  const backrest = add(group, new RoundedBoxGeometry(0.08, 0.27, sw - 0.08, 3, 0.03), m.seat);
  backrest.position.set(cx1 + 0.045, DECK_Y + 0.625, 0);
  for (const s of [1, -1]) {
    const z = s * (sw / 2);
    add(group, tube([v3(sx0 + 0.12, DECK_Y + 0.3, z), v3(sx0 + 0.15, DECK_Y + 0.3, z + s * 0.04), v3(sx1 - 0.15, DECK_Y + 0.3, z + s * 0.04), v3(sx1 - 0.12, DECK_Y + 0.3, z)], 0.011, 24, 8), m.stainless);
  }

  const rocket = build.options.includes('rocket');
  if (build.options.includes('ttop')) {
    // ----- T-top: welded tube frame on four legs, fabric canopy -----
    const yT = DECK_Y + 1.98;          // canopy underside: 1.98 m headroom
    const xa = cx0 - 0.9;
    const xf = cx1 + 0.12;
    const hz = 0.78;
    const frameY = yT - 0.03;
    const fz = hz - 0.08;
    const frameLoop = roundLoop([[xa + 0.08, fz], [xa + 0.08, -fz], [xf - 0.08, -fz], [xf - 0.08, fz]], 0.12, 5, 0.3);
    add(group, tube(frameLoop.map(([x, z]) => v3(x, frameY, z)), 0.022, 80, 8, true), m.stainless);
    rod(group, v3((xa + xf) / 2, frameY, -fz), v3((xa + xf) / 2, frameY, fz), 0.018, m.stainless);
    const legX = [cx0 + 0.05, cx1 - 0.1];
    const topX = [cx0 - 0.32, cx1 - 0.2];
    for (const s of [1, -1]) {
      const zf = legX.map((x) => s * (halfAt(x, DECK_Y) + 0.075));
      for (const k of [0, 1]) {
        const x = legX[k];
        const pts = [
          v3(x, DECK_Y + 0.012, zf[k]), v3(x, DECK_Y + 0.6, zf[k]), v3(x, DECK_Y + 1.25, zf[k]),
          v3(lerp(x, topX[k], 0.35), DECK_Y + 1.6, lerp(zf[k], s * fz, 0.45)),
          v3(lerp(x, topX[k], 0.82), frameY - 0.1, lerp(zf[k], s * fz, 0.9)), v3(topX[k], frameY, s * fz),
        ];
        add(group, tube(pts, 0.024, 32, 8), m.stainless);
        const plate = add(group, new THREE.CylinderGeometry(0.06, 0.065, 0.012, 20), m.stainless);
        plate.position.set(x, DECK_Y + 0.006, zf[k]);
        const socket = add(group, new THREE.CylinderGeometry(0.032, 0.035, 0.07, 16), m.stainless);
        socket.position.set(x, DECK_Y + 0.047, zf[k]);
      }
      // Side brace between the legs, doubling as a grab rail.
      rod(group, v3(legX[0], DECK_Y + 0.95, zf[0]), v3(legX[1], DECK_Y + 0.95, zf[1]), 0.016, m.stainless);
    }
    pm.canvas.color.copy(m.trim.color).multiplyScalar(0.93);
    pm.binding.color.copy(m.trim.color).multiplyScalar(0.55);
    const canopy = roundLoop([[xa, hz], [xa, -hz], [xf, -hz], [xf, hz]], 0.18, 6, 0.12);
    const canopyY = slab(group, canopy, { yUnder: yT, edge: 0.045, crown: 0.025, halfW: hz, top: pm.canvas, under: pm.canvas });
    // Bound edge and a stitch line inboard of it.
    add(group, tube(offsetLoop(canopy, -0.006).map(([x, z]) => v3(x, yT + 0.024, z)), 0.017, 100, 6, true), pm.binding);
    add(group, tube(offsetLoop(canopy, -0.045).map(([x, z]) => v3(x, canopyY(x, z) + 0.0015, z)), 0.0022, 100, 3, true), pm.binding, { cast: false });
    // Two LED downlights under the canopy over the helm.
    for (const x of [cx0 - 0.1, cx0 + 0.35]) {
      const dl = add(group, new THREE.CylinderGeometry(0.035, 0.035, 0.01, 16), m.lens, { cast: false });
      dl.position.set(x, yT - 0.006, 0);
    }
    // LED spot forward on the canopy, VHF whip and all-round light aft.
    const xs = xf - 0.2;
    const ys = canopyY(xs, 0);
    box(group, pm.frame, [0.1, 0.012, 0.08], [xs, ys + 0.006, 0]);
    const lamp = add(group, new THREE.CylinderGeometry(0.055, 0.048, 0.09, 18), pm.frame);
    lamp.position.set(xs + 0.01, ys + 0.07, 0);
    lamp.rotation.z = -Math.PI / 2;
    const lens = add(group, new THREE.CircleGeometry(0.048, 18), m.lens, { cast: false });
    lens.position.set(xs + 0.056, ys + 0.07, 0);
    lens.rotation.y = Math.PI / 2;
    for (const sd of [1, -1]) box(group, pm.frame, [0.03, 0.07, 0.008], [xs, ys + 0.04, sd * 0.065]);
    const xv = xa + 0.32;
    const zv = -(hz - 0.12);
    const yv = canopyY(xv, zv);
    box(group, pm.frame, [0.07, 0.03, 0.06], [xv, yv + 0.015, zv]);
    const whipDir = v3(-0.12, 1, 0).normalize();
    const coil = add(group, new THREE.CylinderGeometry(0.014, 0.016, 0.12, 10), pm.frame);
    coil.position.set(xv, yv + 0.03, zv).addScaledVector(whipDir, 0.06);
    coil.quaternion.setFromUnitVectors(v3(0, 1, 0), whipDir);
    const whip = add(group, new THREE.CylinderGeometry(0.004, 0.009, 1.35, 8), pm.white);
    whip.position.set(xv, yv + 0.03, zv).addScaledVector(whipDir, 0.12 + 0.675);
    whip.quaternion.setFromUnitVectors(v3(0, 1, 0), whipDir);
    // All-round white light aft on the canopy (fittings.js; present after integration).
    const xp = xa + 0.34;
    fit.allRoundLight?.(group, m, xp, canopyY(xp, 0), 0);
    if (rocket) {
      // Launcher on stand-offs from the aft frame member, up through the canopy.
      const xr = xa + 0.12;
      const yr = canopyY(xr, 0) + 0.06;
      fit.rocketLauncher(group, m, xr, yr, 1.25, 6);
      for (const s of [1, -1]) {
        rod(group, v3(xa + 0.08, frameY, s * 0.52), v3(xr, yr, s * 0.52), 0.016, m.stainless, 10);
        const boot = add(group, new THREE.CylinderGeometry(0.03, 0.034, 0.016, 12), pm.binding);
        boot.position.set(xa + 0.08 + 0.04 * ((canopyY(xr, s * 0.52) + 0.008 - frameY) / (yr - frameY)), canopyY(xr, s * 0.52) + 0.004, s * 0.52);
      }
    }
  } else {
    // No T-top: bow bicolour on the foredeck, just forward of the cockpit bulkhead and aft of
    // the anchor-locker hatch, and an all-round light on a tall pole at the front of the
    // console top, clear of the screen (fittings.js; present after integration).
    const xb = L * 0.8 + 0.04;
    fit.bowNavLight?.(group, m, xb, lines.sheer(xb / L) - 0.05);
    const xl = cx0 + 0.621;
    fit.allRoundLight?.(group, m, xl, yTop(xl), 0, 0.95);
    // Launcher on the leaning post's top rail (helm.js frames it at this anchor).
    if (rocket) fit.rocketLauncher(group, m, postX - 0.3, DECK_Y + 1.26, 0.6, 4);
  }
  return { cx0, top, Wc, yTop, postX };
}
