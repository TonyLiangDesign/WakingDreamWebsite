import * as THREE from 'three';

export const WATERLINE_SAMPLES = 256;
export const WATER_SHIP_LIMIT = 16;

// Flat water has no displacement: shore clipping is per fragment. Retain a
// 12.5 m cells at the low-camera berths, ~40 m cells across the harbour,
// then grow the cells geometrically over the distant estuary.
export function createHarbourWaterGeometry(size = 90000) {
  if (!Number.isFinite(size) || size <= 0) throw new RangeError('Water size must be positive');
  const extent = size / 2, inner = Math.min(3200, extent), close = Math.min(500, inner);
  const closeSteps = Math.ceil(close / 12.5), harbourSteps = Math.ceil((inner - close) / 40);
  const positive = Array.from({ length: closeSteps + 1 }, (_, i) => close * i / closeSteps);
  for (let i = 1; i <= harbourSteps; i++) positive.push(close + (inner - close) * i / harbourSteps);
  if (extent > inner) {
    for (let i = 1; i <= 18; i++) positive.push(inner * (extent / inner) ** (i / 18));
  }
  const axis = [...positive.slice(1).reverse().map(x => -x), ...positive];
  const segments = axis.length - 1;
  const geometry = new THREE.PlaneGeometry(2, 2, segments, segments);
  const positions = geometry.attributes.position;
  for (let j = 0; j <= segments; j++) for (let i = 0; i <= segments; i++)
    positions.setXY(j * axis.length + i, axis[i], -axis[j]);
  geometry.computeBoundingSphere();
  geometry.userData.harbourGrid = { nearCellMetres: close / closeSteps, closeRadius: close,
    harbourCellMetres: harbourSteps ? (inner - close) / harbourSteps : 0, innerRadius: inner, segments };
  return geometry;
}

const smooth = x => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };
// Fallback for the existing length/beam-only ship uniforms: long straight
// middle body with finer +X bow and a fuller -X stern, not an ellipse.
export function fallbackWaterlineHalfBreadth(x, halfLength, halfBeam) {
  const longitudinal = Math.abs(x) / Math.max(halfLength, 0.01);
  const shoulder = x >= 0 ? 0.52 : 0.60;
  return halfBeam * Math.sqrt(Math.max(0, 1 - smooth((longitudinal - shoulder) / (1 - shoulder))));
}

export const fallbackWaterlineGLSL = /* glsl */`
  float fallbackHalfBreadth(float x, vec4 dim) {
    float shoulder = x >= 0.0 ? 0.52 : 0.60;
    float run = smoothstep(shoulder, 1.0, abs(x) / max(dim.x, 0.01));
    return dim.y * sqrt(max(0.0, 1.0 - run));
  }
`;

// Stations are ship-local metres, +X bow, already registered to the same
// centre as uShipPose. Keep true asymmetric ends rather than forcing ±L/2.
export function packWaterline(stations) {
  if (!Array.isArray(stations) || stations.length < 2) throw new TypeError('At least two waterline stations are required');
  const sorted = stations.map(s => ({ x: s.x, halfBreadth: s.halfBreadth })).sort((a, b) => a.x - b.x);
  if (sorted.some(s => !Number.isFinite(s.x) || !Number.isFinite(s.halfBreadth) || s.halfBreadth < 0))
    throw new RangeError('Waterline stations must contain finite metre coordinates and nonnegative half-breadths');
  if (sorted.some((s, i) => i && s.x <= sorted[i - 1].x)) throw new RangeError('Waterline station X coordinates must be distinct');
  const xMin = sorted[0].x, xMax = sorted.at(-1).x;
  const maxBreadth = Math.max(...sorted.map(s => s.halfBreadth));
  if (xMax <= xMin || maxBreadth <= 0) throw new RangeError('Waterline must enclose a positive area');
  const bytes = new Uint8Array(WATERLINE_SAMPLES * 4);
  let station = 0;
  for (let i = 0; i < WATERLINE_SAMPLES; i++) {
    const x = THREE.MathUtils.lerp(xMin, xMax, i / (WATERLINE_SAMPLES - 1));
    while (station < sorted.length - 2 && sorted[station + 1].x < x) station++;
    const a = sorted[station], b = sorted[station + 1];
    const breadth = THREE.MathUtils.lerp(a.halfBreadth, b.halfBreadth, (x - a.x) / (b.x - a.x));
    bytes[i * 4] = Math.round(breadth / maxBreadth * 255);
    bytes[i * 4 + 3] = 255;
  }
  return { bytes, range: [xMin, xMax, maxBreadth, 1] };
}
