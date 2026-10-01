// Geographic reference. World frame: origin = centre of the Ocean Dock basin at noon
// water level; +X east, +Y up, +Z south (three.js: north = -Z). Metres.
export const GEO = {
  lat: 50.89211,
  lon: -1.39916,
};

const M_PER_DEG_LAT = 111_230;
const M_PER_DEG_LON = 111_320 * Math.cos((GEO.lat * Math.PI) / 180);

export function ll(lat, lon) {
  return [(lon - GEO.lon) * M_PER_DEG_LON, -(lat - GEO.lat) * M_PER_DEG_LAT];
}

// dock frame (+X toward bearing 192.5°) → world yaw
export const DOCK_YAW = ((90 - 192.5) * Math.PI) / 180;
