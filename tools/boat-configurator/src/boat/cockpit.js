import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { add, tube, rod, box, extrudeProfile, crossSection, ribbon, spaced, v3, lerp } from './kit.js';
import { DECK_Y, CAP } from './hull.js';

// Cockpit and transom: inner liner, non-slip floor and foredeck, side pockets, flush rod holders,
// the transom with its door, boarding pods and platforms, the engine pod, ladder, transom step,
// and the bait station option. Receives the lines, materials, build and whether the rig is twin.
// cockpit() returns the anchors later parts hang off:
//   { podTop, podHalf, zi, platY, bottomAt(z), aft }  (aft = x of the pods' aft faces)

export const POD = 0.5;         // boarding pods and engine pod, aft of the transom

export function cockpit(group, lines, m, build, twin) {
  const { section } = lines;
  // Inner liner and non-slip cockpit floor, foredeck and the forward bulkhead.
  const fore = build.layout === 'ht' ? 0.78 : 0.8;
  const cockpit = spaced(0, fore + 0.02, 32).map(section);
  add(group, ribbon(cockpit.map((s) => ({ x: s.x, pts: [[s.inner, s.ys], [s.inner, DECK_Y]] }))), m.deck);
  add(group, ribbon(cockpit.map((s) => ({ x: s.x, pts: [[0, DECK_Y], [Math.min(s.inner, lines.bottomZ(s, DECK_Y)), DECK_Y]] }))), m.nonslip);
  const foredeck = spaced(fore, 0.992, 16).map(section);
  add(group, ribbon(foredeck.map((s) => ({ x: s.x, pts: [[0, s.ys - 0.05], [Math.max(0, s.hb - CAP * 0.5), s.ys - 0.05]] }))), m.nonslip);
  const bulk = section(fore);
  if (build.layout !== 'ht') box(group, m.deck, [0.02, bulk.ys - 0.05 - DECK_Y, bulk.inner * 2], [bulk.x, (bulk.ys - 0.05 + DECK_Y) / 2, 0]);

  // Side pockets under the coaming and flush rod holders in the capping.
  for (const side of [1, -1]) {
    const a = section(0.1);
    const b = section(0.3);
    const z = Math.min(a.inner, b.inner) - 0.004;
    box(group, m.rubber, [b.x - a.x, 0.2, 0.01], [(a.x + b.x) / 2, DECK_Y + 0.36, side * z], { cast: false });
    box(group, m.deck, [b.x - a.x + 0.04, 0.03, 0.07], [(a.x + b.x) / 2, DECK_Y + 0.26, side * (z - 0.035)]);
    for (const t of [0.07, 0.19]) {
      const s = section(t);
      const ring = add(group, new THREE.TorusGeometry(0.03, 0.008, 6, 18), m.stainless, { cast: false });
      ring.position.set(s.x, s.ys + 0.004, side * (s.hb - CAP / 2));
      ring.rotation.x = Math.PI / 2;
      const hole = add(group, new THREE.CircleGeometry(0.03, 18), m.rubber, { cast: false });
      hole.position.set(s.x, s.ys + 0.003, side * (s.hb - CAP / 2));
      hole.rotation.x = -Math.PI / 2;
    }
  }

  // Full-height transom with a door to the port boarding pod.
  const s0 = section(0);
  const outline = [[s0.hb, s0.ys], [s0.zn, s0.yn], [s0.zf, s0.yf], [s0.zc, s0.yc], [0, s0.yk]];
  add(group, crossSection([...outline, ...outline.slice(0, -1).reverse().map(([z, y]) => [-z, y])], 0), m.paint);
  const tw = s0.inner;
  box(group, m.deck, [0.1, s0.ys - DECK_Y, tw * 2], [0.05, (s0.ys + DECK_Y) / 2, 0]);
  const door = [-(tw - 0.14), -(tw - 0.58)];
  for (const z of door) box(group, m.rubber, [0.012, s0.ys - DECK_Y - 0.06, 0.012], [0.101, (s0.ys + DECK_Y) / 2 + 0.01, z], { cast: false });
  box(group, m.rubber, [0.012, 0.012, Math.abs(door[1] - door[0])], [0.101, s0.ys - 0.04, (door[0] + door[1]) / 2], { cast: false });
  box(group, m.stainless, [0.03, 0.03, 0.12], [0.115, s0.ys - 0.18, door[1] + 0.08]);

  // Boarding pods either side of the engine bracket, following the hull aft.
  const podHalf = twin ? 0.66 : 0.4;
  const podTop = s0.ys - 0.12;
  const platY = s0.yc + 0.2;
  const zi = podHalf + 0.05;
  const bottomAt = (z) => lerp(s0.yk, s0.yc, z / s0.zc);
  for (const side of [1, -1]) {
    const pts = [[zi, platY], [s0.zf, platY], [s0.zf, s0.yf], [s0.zc, s0.yc], [zi, bottomAt(zi)]].map(([z, y]) => [z * side, y]);
    const g = extrudeProfile(pts.map(([z, y]) => [-z, y]), POD, 0.012);
    g.translate(0, 0, POD / 2);
    g.rotateY(Math.PI / 2);
    g.translate(-POD, 0, 0);
    add(group, g, m.paint);
    box(group, m.nonslip, [POD - 0.04, 0.012, s0.zf - zi - 0.04], [-POD / 2, platY + 0.019, side * (zi + s0.zf) / 2], { cast: false });
  }
  // Engine pod: the hull's V carried aft between the boarding pods, alloy mounting plate on top.
  const pod = [[podHalf, podTop], [podHalf, bottomAt(podHalf)], [0, s0.yk], [-podHalf, bottomAt(podHalf)], [-podHalf, podTop]];
  const engineWell = extrudeProfile(pod.map(([z, y]) => [-z, y]), POD, 0.012);
  engineWell.translate(0, 0, POD / 2);
  engineWell.rotateY(Math.PI / 2);
  engineWell.translate(-POD, 0, 0);
  add(group, engineWell, m.paint);
  box(group, m.alloy, [POD, 0.02, podHalf * 2 - 0.04], [-POD / 2, podTop + 0.022, 0]);

  // Fold-down boarding ladder on the port pod.
  const lz = -(zi + s0.zf) / 2;
  const lx = -POD + 0.05;
  for (const dz of [-0.12, 0.12]) rod(group, v3(lx, platY + 0.03, lz + dz), v3(lx - 0.1, platY - 0.62, lz + dz), 0.011, m.stainless);
  for (const f of [0.35, 0.65, 0.95]) rod(group, v3(lx - 0.1 * f, platY + 0.03 - 0.65 * f, lz - 0.12), v3(lx - 0.1 * f, platY + 0.03 - 0.65 * f, lz + 0.12), 0.012, m.stainless);

  // Transom step on the port pod, up to the door sill, with a grab handle on the capping.
  const stepY = platY + 0.19;
  const stepW = Math.min(0.42, s0.zf - zi - 0.08);
  const step = add(group, new RoundedBoxGeometry(0.24, stepY - platY, stepW, 2, 0.015), m.paint);
  step.position.set(-0.12, (stepY + platY) / 2 + 0.01, lz);
  box(group, m.nonslip, [0.2, 0.01, stepW - 0.04], [-0.12, stepY + 0.016, lz], { cast: false });
  for (const z of [lz - stepW / 2 + 0.02, lz + stepW / 2 - 0.02]) box(group, m.rubber, [0.008, s0.ys - stepY - 0.06, 0.012], [-0.004, (s0.ys + stepY) / 2 - 0.01, z], { cast: false });
  add(group, tube([v3(0.02, s0.ys, lz - 0.16), v3(-0.02, s0.ys + 0.1, lz - 0.1), v3(-0.02, s0.ys + 0.1, lz + 0.1), v3(0.02, s0.ys, lz + 0.16)], 0.012, 20, 6), m.stainless);

  return { podTop, podHalf, zi, platY, bottomAt, aft: -POD };
}

// Bait board on stainless legs over the transom, with rod holders and a tray.
export function baitStation(group, lines, m) {
  const s0 = lines.section(0);
  const y = s0.ys + 0.4;
  const w = Math.min(1.0, s0.inner * 1.1);
  for (const dx of [0.0, 0.32]) for (const dz of [-w / 2 + 0.06, w / 2 - 0.06]) rod(group, v3(0.05 + dx * 0.4, s0.ys, dz), v3(0.06 + dx, y - 0.02, dz), 0.016, m.stainless);
  const board = add(group, new RoundedBoxGeometry(0.42, 0.035, w, 2, 0.012), m.seat);
  board.position.set(0.2, y, 0);
  box(group, m.trim, [0.36, 0.14, w - 0.12], [0.22, y - 0.1, 0]);
  for (const z of [-0.36, -0.12, 0.12, 0.36].map((z) => z * w)) rod(group, v3(0.02, y - 0.04, z), v3(-0.06, y + 0.2, z), 0.022, m.stainless);
}
