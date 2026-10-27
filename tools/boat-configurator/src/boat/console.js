import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { add, tube, rod, box, v3, lerp } from './kit.js';
import { DECK_Y } from './hull.js';
import * as fit from './fittings.js';
import { strip, ringCap, roundLoop, offsetLoop, partMaterials, slab, pillow } from './cabin.js';

// Centre console: a moulded-look plate console with generously rolled edges over a recessed toe
// kick, a starboard door to the head (gasket, hinges, latch, vents), a phone tray and cup holders
// on the dash top, a smoked acrylic wrap screen capped by a stainless rail, side grab rails, and a
// front cooler seat (moulded cooler with lid seam, latches and drain, upholstered cushion and
// backrest with piping). The T-top option is a welded tube frame on four deck-mounted legs with a
// fabric canopy (slim bound hem, stitched, 1.98 m headroom), rocket launcher on stand-offs, VHF
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
  // Taper an extrusion centred on z = 0 (half width hw0) to the console's sides, less inset.
  const taper = (g, hw0, inset = 0) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, (p.getZ(i) * (halfAt(p.getX(i), Math.max(DECK_Y, p.getY(i))) - inset)) / hw0);
    g.computeVertexNormals();
    return g;
  };

  // ----- body: side profile with filleted edges, extruded with a 35 mm rolled bevel, tapered,
  // standing on a toe kick recessed 40 mm all round -----
  const b = 0.035;
  const yK = DECK_Y + 0.085;
  const profile = [[cx0 + 0.035, yK], [cx1, yK], [cx1, yFront], [flat, top], [cx0, top + 0.015], [cx0, yK + 0.06]];
  const rounded = roundLoop(profile, [0.02, 0.03, 0.07, 0.035, 0.05, 0.02], 5, 0.2);
  const shape = new THREE.Shape(offsetLoop(rounded, -b).map(([x, y]) => new THREE.Vector2(x, y)));
  const body = new THREE.ExtrudeGeometry(shape, { depth: Wc - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 4 });
  body.translate(0, 0, -(Wc - 2 * b) / 2);
  // Smooth across the rolled edges and fillets, crisp only at real creases.
  add(group, toCreasedNormals(taper(body, Wc / 2), THREE.MathUtils.degToRad(35)), m.trim);
  const kick = new THREE.ExtrudeGeometry(new THREE.Shape([
    new THREE.Vector2(cx0 + 0.075, DECK_Y - 0.01), new THREE.Vector2(cx1 - 0.04, DECK_Y - 0.01),
    new THREE.Vector2(cx1 - 0.04, yK + 0.03), new THREE.Vector2(cx0 + 0.075, yK + 0.03),
  ]), { depth: 1, bevelEnabled: false });
  kick.translate(0, 0, -0.5);
  add(group, taper(kick, 0.5, 0.04), m.trim);
  // Rubber kick strip along the foot of the recess.
  for (const s of [1, -1]) {
    const run = (y) => [cx0 + 0.09, cx1 - 0.06].map((x) => v3(x, y, s * (halfAt(x, y) - 0.04 + 0.0015)));
    add(group, strip(run(DECK_Y + 0.02), run(DECK_Y + 0.05)), pm.seal, { cast: false });
  }

  // Door to the head on the starboard side: gasket, proud panel, hinges, latch, vent slots.
  const dx0 = cx0 + 0.19;
  const dx1 = Math.min(cx1 - 0.1, cx0 + 0.56);
  const dy0 = DECK_Y + 0.2;
  const dy1 = DECK_Y + 0.8;
  const door = roundLoop([[dx0, dy0], [dx1, dy0], [dx1, dy1], [dx0, dy1]], 0.035, 4, 0.08);
  const onSide = (loop, d) => loop.map(([x, y]) => v3(x, y, halfAt(x, y) + d));
  add(group, strip(onSide(offsetLoop(door, 0.008), 0.001), onSide(door, 0.001), true), pm.seal);
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

  // Phone tray (raised moulded lip round a rubber mat) and two cup holders on the dash top,
  // ahead of helm.js's instrument pod and the throttle.
  {
    const tray = roundLoop([[cx0 + 0.46, 0.06], [cx0 + 0.32, 0.06], [cx0 + 0.32, -0.2], [cx0 + 0.46, -0.2]], 0.025, 4, 0.06);
    add(group, tube(tray.map(([x, z]) => v3(x, yTop(x) + 0.004, z)), 0.007, tray.length * 2, 6, true), m.trim);
    const mat = new THREE.ShapeGeometry(new THREE.Shape(offsetLoop(tray, -0.004).map(([x, z]) => new THREE.Vector2(x, z))));
    mat.rotateX(Math.PI / 2);
    const mp = mat.attributes.position;
    for (let i = 0; i < mp.count; i++) mp.setY(i, yTop(mp.getX(i)) + 0.003);
    mat.computeVertexNormals();
    add(group, mat, m.rubber, { cast: false });
    for (const x of [cx0 + 0.27, cx0 + 0.36]) {
      const rim = add(group, new THREE.TorusGeometry(0.038, 0.005, 6, 24), m.stainless);
      rim.position.set(x, yTop(x) + 0.003, 0.27);
      rim.rotation.x = Math.PI / 2;
      const well = add(group, new THREE.CircleGeometry(0.036, 24), m.rubber, { cast: false });
      well.position.set(x, yTop(x) + 0.002, 0.27);
      well.rotation.x = -Math.PI / 2;
    }
  }

  // ----- smoked acrylic wrap screen capped by a stainless rail -----
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
  // The rail sits on the acrylic's top edge, its ends turning down to flanges on the dash top.
  const railOf = (p) => p.clone().add(v3(-0.002, 0.009, 0));
  const ends = [0, N].map((i) => ({ low: v3(base[i].x - 0.05, yTop(base[i].x - 0.05), base[i].z * 0.97), high: railOf(edge[i]).add(v3(-0.03, 0, 0)) }));
  add(group, tube([ends[0].low, ends[0].low.clone().add(v3(0, 0.05, 0)), ends[0].high, ...edge.slice(1, N).map(railOf), ends[1].high, ends[1].low.clone().add(v3(0, 0.05, 0)), ends[1].low], 0.011, 96, 8), m.stainless);
  for (const e of ends) {
    const fl = add(group, new THREE.CylinderGeometry(0.02, 0.022, 0.008, 12), m.stainless);
    fl.position.copy(e.low).add(v3(0, 0.004, 0));
  }

  // ----- front cooler seat: moulded cooler on a toe kick, lid with latches, upholstered
  // cushion and backrest with piping -----
  const sx0 = cx1 + 0.03;
  const sx1 = cx1 + 0.53;
  const sw = 0.8;
  const mx = (sx0 + sx1) / 2;
  const yLid = DECK_Y + 0.335;         // lid seam
  const yC = DECK_Y + 0.385;           // lid top, cushion base
  const plinth = add(group, new RoundedBoxGeometry(sx1 - sx0 - 0.05, 0.06, sw - 0.05, 2, 0.012), m.trim);
  plinth.position.set(mx, DECK_Y + 0.028, 0);
  const bodyH = yLid - 0.004 - (DECK_Y + 0.045);
  const cooler = new RoundedBoxGeometry(sx1 - sx0, bodyH, sw, 3, 0.035);
  const cp = cooler.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const k = lerp(0.97, 1, cp.getY(i) / bodyH + 0.5);  // moulding draft, narrower at the foot
    cp.setXYZ(i, cp.getX(i) * k, cp.getY(i), cp.getZ(i) * k);
  }
  cooler.computeVertexNormals();
  add(group, cooler, m.trim).position.set(mx, DECK_Y + 0.045 + bodyH / 2, 0);
  box(group, m.dash, [sx1 - sx0 - 0.03, 0.008, sw - 0.03], [mx, yLid - 0.001, 0], { cast: false });
  const lid = add(group, new RoundedBoxGeometry(sx1 - sx0 + 0.012, yC - yLid - 0.003, sw + 0.012, 3, 0.012), m.trim);
  lid.position.set(mx, (yLid + 0.003 + yC) / 2, 0);
  for (const z of [-0.24, 0.24]) {
    const t = add(group, new RoundedBoxGeometry(0.014, 0.07, 0.04, 2, 0.005), m.rubber);
    t.position.set(sx1 + 0.007, yLid - 0.022, z);
    box(group, m.rubber, [0.012, 0.016, 0.03], [sx1 + 0.012, yLid + 0.022, z]);
  }
  const drain = add(group, new THREE.CylinderGeometry(0.012, 0.012, 0.012, 12), m.rubber);
  drain.position.set(sx1 + 0.003, DECK_Y + 0.08, 0.3);
  drain.rotation.z = Math.PI / 2;
  const seat = pillow({ xa: sx0 - 0.004, xb: sx1 + 0.008, yb: yC, h: 0.095, hw: sw / 2 + 0.004, R: 0.04, p: 2.7, n: 24, steps: 6 });
  add(group, seat.geometry, pm.vinyl);
  add(group, tube(seat.welt, 0.0055, 60, 5, true), pm.piping, { cast: false });
  for (const z of [-0.13, 0.13]) {
    const yS = yC + 0.0475 + 0.0475 * (1 - Math.abs(z / (sw / 2 + 0.004)) ** 2.7) ** (1 / 2.7) + 0.0004;
    add(group, tube([v3(sx0 + 0.05, yS, z), v3(sx1 - 0.04, yS, z)], 0.0018, 2, 4), pm.piping, { cast: false });
  }
  // Backrest against the console front: built along z, then turned to face forward.
  const back = pillow({ xa: -(sw - 0.08) / 2, xb: (sw - 0.08) / 2, yb: DECK_Y + 0.49, h: 0.27, hw: 0.04, R: 0.035, p: 2.6, n: 20, steps: 6, welt: [0.7, -0.7] });
  const turn = (g) => g.rotateY(Math.PI / 2).translate(cx1 + 0.045, 0, 0);
  add(group, turn(back.geometry), pm.vinyl);
  add(group, tube(back.welt.map((p) => v3(p.z + cx1 + 0.045, p.y, -p.x)), 0.0055, 60, 5, true), pm.piping, { cast: false });
  for (const s of [1, -1]) {
    const z = s * (sw / 2);
    add(group, tube([v3(sx0 + 0.12, DECK_Y + 0.27, z), v3(sx0 + 0.15, DECK_Y + 0.27, z + s * 0.04), v3(sx1 - 0.15, DECK_Y + 0.27, z + s * 0.04), v3(sx1 - 0.12, DECK_Y + 0.27, z)], 0.011, 24, 8), m.stainless);
  }

  const rocket = build.options.includes('rocket');
  if (build.options.includes('ttop')) {
    // ----- T-top: welded tube frame on four legs, fabric canopy -----
    const yT = DECK_Y + 1.98;          // canopy underside: 1.98 m headroom
    const xa = cx0 - 0.9;
    const xf = cx1 + 0.12;
    const hz = 0.78;
    const RT = 0.024;                  // frame tube radius; the canopy rests on it
    const RL = 0.023;                  // leg tube radius
    const frameY = yT - RT;
    const fz = hz - 0.08;
    const frameLoop = roundLoop([[xa + 0.08, fz], [xa + 0.08, -fz], [xf - 0.08, -fz], [xf - 0.08, fz]], 0.12, 6, 0.3);
    add(group, tube(frameLoop.map(([x, z]) => v3(x, frameY, z)), RT, 80, 8, true), m.stainless);
    rod(group, v3((xa + xf) / 2, frameY, -fz), v3((xa + xf) / 2, frameY, fz), 0.018, m.stainless);
    const weld = (r, at, axis) => {
      const bead = add(group, new THREE.TorusGeometry(r, 0.0035, 4, 14), m.stainless, { cast: false });
      bead.position.copy(at);
      bead.quaternion.setFromUnitVectors(v3(0, 0, 1), axis);
    };
    for (const s of [1, -1]) weld(0.018, v3((xa + xf) / 2, frameY, s * (fz - 0.019)), v3(0, 0, 1));
    const legX = [cx0 + 0.05, cx1 - 0.1];
    const topX = [cx0 - 0.32, cx1 - 0.2];
    for (const s of [1, -1]) {
      const zf = legX.map((x) => s * (halfAt(x, DECK_Y) + 0.075));
      for (const k of [0, 1]) {
        const x = legX[k];
        // Vertical, a smooth S-bend (cubic, vertical at both ends) inboard and over, then
        // straight up into the frame.
        const a = v3(x, DECK_Y + 1.15, zf[k]);
        const d = v3(topX[k], frameY - 0.06, s * fz);
        const bend = new THREE.CubicBezierCurve3(a, a.clone().setY(a.y + 0.32), d.clone().setY(d.y - 0.32), d).getPoints(12);
        const pts = [v3(x, DECK_Y + 0.012, zf[k]), v3(x, DECK_Y + 0.5, zf[k]), ...bend, v3(topX[k], frameY, s * fz)];
        add(group, tube(pts, RL, 40, 8), m.stainless);
        weld(RL, v3(topX[k], frameY - 0.016, s * fz), v3(0, 1, 0));
        const plate = add(group, new THREE.CylinderGeometry(0.06, 0.065, 0.012, 20), m.stainless);
        plate.position.set(x, DECK_Y + 0.006, zf[k]);
        const socket = add(group, new THREE.CylinderGeometry(0.032, 0.035, 0.07, 16), m.stainless);
        socket.position.set(x, DECK_Y + 0.047, zf[k]);
      }
      // Side brace between the legs, doubling as a grab rail, welded at both ends.
      rod(group, v3(legX[0], DECK_Y + 0.95, zf[0]), v3(legX[1], DECK_Y + 0.95, zf[1]), 0.016, m.stainless);
      for (const k of [0, 1]) weld(0.016, v3(legX[k] + (k ? -RL : RL) * 0.9, DECK_Y + 0.95, zf[k]), v3(1, 0, 0));
    }
    pm.canvas.color.copy(m.trim.color).multiplyScalar(0.93);
    pm.binding.color.copy(m.trim.color).multiplyScalar(0.55);
    const canopy = roundLoop([[xa, hz], [xa, -hz], [xf, -hz], [xf, hz]], 0.18, 6, 0.12);
    // 30 mm visible edge: a 12 mm top over an 18 mm hem, domed 35 mm over the bows.
    const drip = 0.018;
    const canopyY = slab(group, canopy, { yUnder: yT, thick: 0.012, drip, crown: 0.035, reach: 0.55, round: 0.008, top: pm.canvas, under: pm.canvas });
    // Bound hem, a stitch line above it on the fascia and a top-stitch inboard of the edge.
    add(group, tube(offsetLoop(canopy, 0.0005).map(([x, z]) => v3(x, yT - drip + 0.003, z)), 0.0065, 90, 5, true), pm.binding);
    add(group, tube(offsetLoop(canopy, 0.0012).map(([x, z]) => v3(x, yT - 0.003, z)), 0.0012, 80, 3, true), pm.binding, { cast: false });
    add(group, tube(offsetLoop(canopy, -0.04).map(([x, z]) => v3(x, canopyY(x, z) + 0.0012, z)), 0.0016, 80, 3, true), pm.binding, { cast: false });
    // Two LED downlights under the canopy over the helm (lenses unlit).
    for (const x of [cx0 - 0.1, cx0 + 0.35]) {
      const rim = add(group, new THREE.CylinderGeometry(0.038, 0.04, 0.01, 18), m.stainless, { cast: false });
      rim.position.set(x, yT - 0.005, 0);
      const dl = add(group, new THREE.CircleGeometry(0.031, 18), pm.ledLens, { cast: false });
      dl.position.set(x, yT - 0.0105, 0);
      dl.rotation.x = Math.PI / 2;
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
    const whip = add(group, new THREE.CylinderGeometry(0.004, 0.009, 1.35, 8), pm.whip);
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
