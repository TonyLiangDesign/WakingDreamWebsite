/**
 * Shared spatial reference, in metres. This is an engineering registration,
 * not a certified shipyard plan. Deck levels remain inherited approximations.
 * Room sources retain their local authoring frame; both complete ship roots
 * now apply the same longitudinal registration, including runtime collisions.
 */
export const SHIP_REFERENCE = Object.freeze({
  id: 'titanic-boat-deck-v1',
  units: 'metres',
  axes: Object.freeze({ x: 'starboard', y: 'up', z: 'forward' }),
  centreZ: 25,
  length: 269.0622,
  beam: 28.2,
  waterline: -18.4404,
  draft: 10.54,
  // Waterline and draft were taken from different loading conditions.
  keelStatus: 'display-derived-not-surveyed',
  deckStatus: 'legacy-approximation-awaiting-plans',
});

export const DECK_LEVELS = Object.freeze({
  BOAT: 0, A: -3.1, B: -6, C: -8.9, D: -11.8,
  E: -14.7, F: -17.6, G: -20.5,
});

export const LEGACY_WALK = Object.freeze({
  id: 'walk-authoring-v0',
  minZ: -96, maxZ: 146, centreZ: 25,
  waterline: -27,
  // Compatibility only. Changing this without the hull/UVs/collision is unsafe.
  deck: Object.freeze({ ...DECK_LEVELS, WATER: -27 }),
});

export const LENGTH_SCALE = SHIP_REFERENCE.length / (LEGACY_WALK.maxZ - LEGACY_WALK.minZ);
export const worldZ = z => SHIP_REFERENCE.centreZ + (z - LEGACY_WALK.centreZ) * LENGTH_SCALE;
export const localZ = z => LEGACY_WALK.centreZ + (z - SHIP_REFERENCE.centreZ) / LENGTH_SCALE;

/** Longitudinal registration only: no y shift or guessed lateral scaling. */
export function registerWalkPoint([x, y, z]) { return [x, y, worldZ(z)]; }
export function unregisterWalkPoint([x, y, z]) { return [x, y, localZ(z)]; }

export function normalizeDeck(deck) {
  if (typeof deck !== 'string') throw new TypeError('Deck must be a string');
  if (deck.toLowerCase() === 'all') return 'all'; // technical support layer
  const value = deck.toUpperCase();
  if (!Object.hasOwn(DECK_LEVELS, value)) throw new RangeError(`Unknown deck: ${deck}`);
  return value;
}

export function deckRank(deck) {
  const value = normalizeDeck(deck);
  return value === 'all' ? 0 : Object.keys(DECK_LEVELS).indexOf(value) + 1;
}
