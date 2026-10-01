import * as THREE from 'three';

// Low-precision solar position (Astronomical Almanac approximation, ~0.01°).
// Returns a unit vector in world space: +X east, +Y up, -Z north.
export function sunDirection(dateUTC, latDeg, lonDeg, out = new THREE.Vector3()) {
  const rad = Math.PI / 180;
  const jd = dateUTC.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.460 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24;
  const lha = gmst * 15 * rad + lonDeg * rad - ra;
  const lat = latDeg * rad;
  const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(lha));
  const az = Math.atan2(-Math.sin(lha), Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(lha));
  return out.set(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az));
}
