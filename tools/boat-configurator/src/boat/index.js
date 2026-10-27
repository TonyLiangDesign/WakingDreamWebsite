import * as THREE from 'three';
import { resolve } from '../config.js';
import { letteringColour } from '../materials.js';
import { mergeStatic } from './kit.js';
import { hullLines, hullShell, nameDecal } from './hull.js';
import { cockpit, baitStation } from './cockpit.js';
import { hardtop } from './cabin.js';
import { centreConsole } from './console.js';
import { hardtopHelm, consoleHelm } from './helm.js';
import { bowFittings, bowRail, underwaterLights } from './fittings.js';
import { outboards } from './outboard.js';
import { trailer, cradle } from './stand.js';

export { TRAILER_LIFT, CRADLE_LIFT } from './stand.js';

// buildBoat() only orchestrates: it runs the parts in order on one group, passing the lines and
// the anchors earlier parts return, then merges the boat by material. Returns
//   { boat, lines, leds, engines, trailer, cradle, podHalf }  (engines: [x, z] mounts)

export function buildBoat(build, m) {
  const r = resolve(build);
  const lines = hullLines(r.model);
  const boat = new THREE.Group();
  const twin = r.engine.count === 2;

  hullShell(boat, lines, m);
  const deck = cockpit(boat, lines, m, build, twin);
  nameDecal(boat, lines, r.model.name, letteringColour(build));
  if (build.layout === 'ht') hardtopHelm(boat, m, hardtop(boat, lines, m, build), { twin });
  else consoleHelm(boat, m, centreConsole(boat, lines, m, build), { twin });
  bowFittings(boat, lines, m);
  if (build.options.includes('bowrail')) bowRail(boat, lines, m);
  if (build.options.includes('bait')) baitStation(boat, lines, m);
  const engines = outboards(boat, m, { hp: r.engine.hp, twin, podTop: deck.podTop, plateY: lines.keel(0) + 0.03 - deck.podTop, aft: deck.aft });
  const leds = build.options.includes('lights') ? underwaterLights(boat, m, deck) : [];

  return { boat: mergeStatic(boat), lines, leds, engines, trailer: trailer(lines, m), cradle: cradle(lines, m), podHalf: deck.podHalf };
}

export function disposeTree(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const mat = child.material;
    if (mat && mat.map && mat.map.isCanvasTexture && !mat.userData.shared) {
      mat.map.dispose();
      mat.dispose();
    }
  });
}
