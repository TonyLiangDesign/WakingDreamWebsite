import { col } from './kit.js';

// Close-range Olympic-class hardware. Every part goes into the existing merged
// buckets; no individual mesh per chain link, fairlead or ladder rung.
export function heroLinerDetails(K, { spec, hull, yAt }) {
  const { L } = spec;
  const { S, hbTop, hbAt } = hull;
  const black = col(0x30312e), worn = col(0x6b6a60), white = col(spec.white);
  const ellipse = (key, centre, tangent, rx, ry, tube, c) => {
    const n = 20;
    const p = (i) => {
      const a = i / n * Math.PI * 2;
      return [centre[0] + tangent[0] * rx * Math.cos(a), centre[1] + ry * Math.sin(a), centre[2] + tangent[2] * rx * Math.cos(a)];
    };
    for (let i = 0; i < n; i++) K.rod(key, p(i), p(i + 1), tube, c, 6, false);
  };
  // Paired roller fairleads at the forward and after open decks. Their small,
  // rounded throats read as real machinery rather than more rectangular boxes.
  for (const x of [L / 2 - 18, L / 2 - 29, -L / 2 + 18]) {
    for (const side of [-1, 1]) {
      const z = side * (hbTop(x) - 0.48), y = yAt(x, z);
      K.box('metal', x, y + 0.085, z, 1.7, 0.17, 0.85, black);
      for (const dx of [-0.54, 0.54]) {
        K.cyl('metal', x + dx, y + 0.15, z, 0.17, 0.56, black, 16);
        K.cyl('metal', x + dx, y + 0.68, z, 0.22, 0.08, worn, 16);
      }
      K.rod('metal', [x - 0.54, y + 0.72, z], [x + 0.54, y + 0.72, z], 0.09, black, 10, false);
    }
  }
  // Eyebrows over the hull ports catch a sliver of light and suggest the depth
  // of the metal sleeve. The lower glazing remains a recessed, almost dark disk.
  const X0 = -L / 2, X1 = L / 2;
  for (const [rowIndex, row] of (spec.portRows || []).entries()) {
    let r = 1 + rowIndex * 17;
    for (let x = X0 + L * (spec.portFrom ?? 0.09); x <= X1 - L * (spec.portTo ?? 0.1); x += spec.portPitch ?? 2.6) {
      r = (r * 16807) % 2147483647;
      if (r % 100 < 10) continue;
      const y = row + (S(x) - S(0)) * row / S(0);
      const d = (hbAt(x + 0.25, y) - hbAt(x - 0.25, y)) / 0.5;
      if (Math.abs(d / Math.hypot(d, 1)) > 0.75) continue;
      for (const s of [-1, 1]) {
        const dz = hbAt(x, y), norm = Math.hypot(d, 1);
        const tangent = [1 / norm, 0, s * d / norm];
        for (let j = 0; j < 6; j++) {
          const a = j / 6 * Math.PI, b = (j + 1) / 6 * Math.PI;
          const point = (t) => [x + tangent[0] * 0.255 * Math.cos(t), y + 0.255 * Math.sin(t), s * dz + s * 0.045 + tangent[2] * 0.255 * Math.cos(t)];
          K.rod('metal', point(a), point(b), 0.018, black, 4, true);
        }
      }
    }
  }
  // Cast oval cable chocks just below the forecastle margin.
  for (const x of [X1 - 4.5, X1 - 21.5, X0 + 11.5]) {
    for (const s of [-1, 1]) {
      const y = yAt(x, 0) - 0.65, d = (hbTop(x + 0.2) - hbTop(x - 0.2)) / 0.4;
      const norm = Math.hypot(1, d), z = s * (hbTop(x) + 0.05);
      const tang = [1 / norm, 0, s * d / norm], outward = [-d / norm, 0, s / norm];
      ellipse('metal', [x, y, z], tang, 0.47, 0.18, 0.08, black);
      K.quad('dark', [x - 0.3 / norm, y - 0.08, z - s * d * 0.3 / norm], [x + 0.3 / norm, y - 0.08, z + s * d * 0.3 / norm], [x + 0.3 / norm, y + 0.08, z + s * d * 0.3 / norm], [x - 0.3 / norm, y + 0.08, z - s * d * 0.3 / norm], col(0x080a09), outward);
    }
  }
  // Service ladders and pipe clamps on the aft face of each funnel.
  for (const f of spec.funnels || []) {
    const base = S(f.x) + (f.off ?? spec.funnelOff), rake = Math.tan((spec.funnelRake ?? 2) * Math.PI / 180);
    const at = (y, z) => [f.x - f.rx - 0.13 - y * rake, base + y, z];
    const paint = col(spec.funnelColor ?? 0xaf8453);
    for (const z of [-0.32, 0.32]) K.rod('paint', at(0.5, z), at(f.h - 1, z), 0.035, paint, 6, false);
    for (let y = 0.7; y < f.h - 1; y += 0.34) K.rod('metal', at(y, -0.32), at(y, 0.32), 0.028, worn, 6, false);
    for (let y = 1.2; y < f.h - 1; y += 2.4) for (const z of [-0.32, 0.32]) K.rod('paint', at(y, z), [f.x - f.rx + 0.1 - y * rake, base + y, z], 0.03, paint, 6, false);
  }
  // White deck-edge girder and supports beneath the boat-deck overhang create
  // small shadow pockets without painted AO or large additions to draw calls.
  for (let x = -70; x < 73; x += 3.2) {
    for (const s of [-1, 1]) {
      const z = s * (hbTop(x) + 0.13), top = S(x) + spec.funnelOff;
      K.box('paint', x, top - 0.27, z, 0.10, 0.44, 0.22, white);
    }
  }
}
