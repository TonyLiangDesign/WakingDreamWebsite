// Dock-frame metres: +X points towards the mouth, +Z towards the west quay.
// These are composition/clearance positions for the 11:50 pre-departure plate,
// not a claim about the exact positions or identities of historical tugboats.
// All are awaiting orders: no tight towing cable, forward wake or propeller wash.
// Approximate length/beam range from J. P. Eaton's six-tug dimensions:
// https://www.encyclopedia-titanica.org/titanic-tugs.html . The silhouettes are
// generic steam tugs; the array order does not assign historical identities.
const ft = n => n * 0.3048;
export const TUG_STANDBY = Object.freeze([
  { x: 166, z: 18, yaw: Math.PI * 0.04, role: 'bow-standby', length: ft(120), beam: ft(20.1), funnel: 'red' },
  { x: 210, z: 10, yaw: -Math.PI * 0.05, role: 'mouth-standby', length: ft(135.5), beam: ft(24.1), funnel: 'red' },
  { x: 244, z: -28, yaw: -Math.PI * 0.1, role: 'mouth-standby', length: ft(120), beam: ft(25.1), funnel: 'red' },
  { x: 170, z: 43, yaw: Math.PI * 0.1, role: 'basin-standby', length: ft(120), beam: ft(25), funnel: 'red' },
  { x: 300, z: 26, yaw: Math.PI * 0.12, role: 'outer-standby', length: ft(129.5), beam: ft(25.1), funnel: 'red' },
  { x: -206, z: -19, yaw: Math.PI, role: 'stern-standby', length: ft(130), beam: ft(25), funnel: 'red' },
].map(Object.freeze));

// Call after makeTug(). Keeps smoke metadata and local connection points intact.
// Arrays are also provided as plain numbers for QA/export/other effects modules.
export function placeStandbyTug(tug, index) {
  const berth = TUG_STANDBY[index];
  if (!berth) throw new RangeError(`Unknown standby tug index ${index}`);
  tug.position.set(berth.x, 0, berth.z);
  tug.rotation.y = berth.yaw;
  tug.userData.operation = {
    state: 'standby', role: berth.role, speed: 0, towline: 'stowed',
    wakeStrength: 0, propellerWash: 0, exhaustActivity: 0.18,
  };
  return tug;
}
