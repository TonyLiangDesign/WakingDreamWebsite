// Shared shell and waterline retain boat deck y=0. Presentation and walk apply
// LENGTH_SCALE once to the complete ship; authored room coordinates remain local.
// British inquiry: boat deck approximately 60.5 ft above the accident waterline.
import { SHIP_REFERENCE, LENGTH_SCALE, worldZ, localZ } from '../data/ship-reference.js';
export { LENGTH_SCALE, worldZ, localZ };
export const WATERLINE = SHIP_REFERENCE.waterline;
export const KEEL = WATERLINE - SHIP_REFERENCE.draft;
export const CENTRE_Z = SHIP_REFERENCE.centreZ;

// Two separate groups of four boats per side, as described by the inquiry.
export const BOAT_STATIONS = [77, 66, 55, 44, -9, -20, -31, -42];
export const A_SCREEN_END = 89.7 - 192 * .3048 / LENGTH_SCALE;

export function breadth(z) {
  if (z > 91.5) {
    const t = Math.min(1, Math.max(0, (z - 91.5) / 54.5));
    return 14.1 * Math.pow(1 - t, .68) * (1 + .32 * t);
  }
  if (z < -47) {
    const t = Math.min(1, Math.max(0, (-47 - z) / 49));
    return 14.1 * Math.pow(1 - t * t, .48);
  }
  return 14.1;
}

export function sheer(z) {
  const bow = Math.max(0, (z - 55) / 91);
  const stern = Math.max(0, (-20 - z) / 76);
  return .65 * bow * bow + .32 * stern * stern;
}
