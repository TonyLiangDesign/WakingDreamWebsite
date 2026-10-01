// Parametric steamship generator (public entry). Ship local frame: +X bow, +Y up,
// waterline y = 0, origin amidships on the centreline. Metres throughout.
//
//   src/ships/hull.js      hull shell + sheer / half-breadth lookups
//   src/ships/liner.js     deck plan builder: shell steps (forecastle / wells / island / poop),
//                          superstructure tiers, houses, bridge, funnels, boats, fittings, rails
//   src/ships/parts.js     deck furniture (vents, lifeboats, davits, cranes, hatches, masts ...)
//   src/ships/specs.js     per-ship presets (Titanic, Oceanic, Majestic, St Louis, Philadelphia, New York)
//   src/ships/tug.js       Edwardian screw tug
//   src/ships/kit.js       per-material vertex-coloured merging (few draw calls per ship)

export { hullGeometry } from './ships/hull.js';
export { makeLiner } from './ships/liner.js';
export { makeTug } from './ships/tug.js';
export { SHIPS } from './ships/specs.js';
