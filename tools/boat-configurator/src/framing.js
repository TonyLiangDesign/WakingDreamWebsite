import { Vector3 } from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';

function hullCandidates(points) {
  if (points.length < 1000) return points;
  // QuickHull requires a volume. Degenerate inputs use the original support search.
  const a = points[0], ab = new Vector3(), ac = new Vector3(), normal = new Vector3();
  let longest = 0, widest = 0, deepest = 0;
  for (const p of points) {
    const d = a.distanceToSquared(p);
    if (d > longest) { longest = d; ab.subVectors(p, a); }
  }
  if (!longest) return points;
  for (const p of points) {
    ac.subVectors(p, a).cross(ab);
    const d = ac.lengthSq();
    if (d > widest) { widest = d; normal.copy(ac); }
  }
  if (!widest) return points;
  normal.normalize();
  for (const p of points) deepest = Math.max(deepest, Math.abs(ac.subVectors(p, a).dot(normal)));
  if (deepest < Math.sqrt(longest) * 1e-10) return points;
  const hull = new ConvexHull().setFromPoints(points);
  const outside = new Set();
  for (const face of hull.faces) {
    let edge = face.edge;
    do { outside.add(edge.head().point); edge = edge.next; } while (edge !== face.edge);
  }
  // Keep surviving vertices in input order for deterministic support searches.
  return points.filter(p => outside.has(p));
}

// Keep support points for the same 400 directions used by the original camera fitting.
export function hullPoints(points, centre) {
  // QuickHull removes interior samples before the 400 directional searches. Their
  // projections can never exceed the hull, so the same framing bounds are retained.
  points = hullCandidates(points);
  const keep = new Set();
  // Pack once, rather than dereference Vector3 objects and subtract the centre in each of
  // the 400 support searches. Float64 preserves the original projection precision.
  const xyz = new Float64Array(points.length * 3);
  for (let j = 0; j < points.length; j++) {
    xyz[j * 3] = points[j].x - centre.x;
    xyz[j * 3 + 1] = points[j].y - centre.y;
    xyz[j * 3 + 2] = points[j].z - centre.z;
  }
  const n = 400;
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    const a = i * Math.PI * (3 - Math.sqrt(5));
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let best = 0, bestV = -Infinity;
    for (let j = 0; j < xyz.length; j += 3) {
      const v = xyz[j] * x + xyz[j + 1] * y + xyz[j + 2] * z;
      if (v > bestV) { bestV = v; best = j / 3; }
    }
    keep.add(best);
  }
  return [...keep].map((j) => points[j]);
}
