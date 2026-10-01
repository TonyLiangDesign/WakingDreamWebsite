import * as THREE from 'three';
import { buildWalkableBoatDeck } from '../shared-titanic/src/walk/boatdeck.js';
import { bakeStatic } from '../shared-titanic/src/walk/bake.js';
import { buildHull, station, hullTop } from '../shared-titanic/src/ship/hull.js';
import { rebuildWalkDetails, buildSuperstructure, buildFunnels } from '../shared-titanic/src/presentation/structure.js';
import { buildDeckDetails } from '../shared-titanic/src/presentation/deck-details.js';
import { applyShipRegistration } from '../shared-titanic/src/ship/registration.js';
import { WATERLINE, CENTRE_Z, worldZ, localZ } from '../shared-titanic/src/presentation/dimensions.js';
import { applyPortBowDetails } from './presentation-bow.js';

// Adapt the shared production exterior to the port's metres, +X bow, y=0 waterline.
// The presentation keeps its boat deck at y=0 and its centre at z=25. Keep the
// registration on the inner root, then rotate/translate the complete assembly once.
export const presentationProfile = {
  deckAt(x) { return hullTop(localZ(x + CENTRE_Z)) - WATERLINE; },
  pointAt(x, y) {
    const [width, z] = station(localZ(x + CENTRE_Z), y + WATERLINE);
    return [worldZ(z) - CENTRE_Z, y, -width];
  },
  // Lower sill of the two shell doors built by the shared hull module.
  gangways: [-30, 55].map(z => [worldZ(z) - CENTRE_Z, -12.9 - WATERLINE]),
  // Registered hull stations at the port's y=0 waterline, including bow rake
  // and stern tuck. Their origin matches TitanicSlot rather than the inner root.
  waterline: Array.from({ length: 256 }, (_, i) => {
    const [halfBreadth, z] = station(-96 + 242 * i / 255, WATERLINE);
    return { x: worldZ(z) - CENTRE_Z, halfBreadth };
  }),
};

export function buildPresentationShip() {
  const authored = new THREE.Group();
  authored.name = 'SharedTitanicExterior';
  const deck = buildWalkableBoatDeck();
  const fittings = rebuildWalkDetails(deck.root);
  const funnels = buildFunnels();
  authored.add(fittings, buildSuperstructure(), funnels, buildHull(), buildDeckDetails());
  applyPortBowDetails(authored);

  // Sample real funnel outlets before merging. Only the first three emit smoke.
  authored.updateMatrixWorld(true);
  const outlets = funnels.children.filter(o => o.isGroup).map((f, index) =>
    f.localToWorld(new THREE.Vector3(0, 18.8 + index * .25, 0)));
  bakeStatic(authored);
  applyShipRegistration(authored);

  const ship = new THREE.Group();
  ship.name = 'TitanicPresentation';
  ship.rotation.y = Math.PI / 2;
  ship.position.set(-CENTRE_Z, -WATERLINE, 0);
  ship.add(authored);
  ship.updateMatrixWorld(true);
  ship.userData.funnelTops = outlets.map(p => ship.worldToLocal(authored.localToWorld(p)));
  ship.userData.boatDeckY = -WATERLINE;
  ship.userData.hero = true;
  ship.userData.model = 'shared-presentation';
  ship.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return ship;
}
