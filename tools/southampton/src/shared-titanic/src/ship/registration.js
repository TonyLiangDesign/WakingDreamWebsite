import { SHIP_REFERENCE, LEGACY_WALK, LENGTH_SCALE } from '../data/ship-reference.js';

// Apply once to the complete authored ship: shell, decks and all descendants.
// Local room dimensions remain available for editing; runtime points are in metres.
export function applyShipRegistration(root) {
  root.scale.z = LENGTH_SCALE;
  root.position.z = SHIP_REFERENCE.centreZ * (1 - LENGTH_SCALE);
  root.userData.registration = {
    sourceFrame: LEGACY_WALK.id, worldFrame: SHIP_REFERENCE.id,
    lengthScale: LENGTH_SCALE, length: SHIP_REFERENCE.length,
    status: 'engineering-registration-not-historical-placement',
  };
  root.updateWorldMatrix(true, true);
  return root;
}
