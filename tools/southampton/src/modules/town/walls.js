// Medieval town walls remnants (Western Esplanade, north corner, God's House Tower corner) and the Bargate.
import { TOWN_WALLS } from './roads.js';
import { densify } from './util.js';

export function buildWalls(ctx, ground, occ) {
  const { Builder, M, geo, THREE, layout } = ctx;
  const stone = ctx.surface({ set: 'ashlar', scale: 2.4, color: 0xa39c8c, grime: 0.7, streaks: 0.85, variation: 0.35, name: 'townWallStone' });
  const b = new Builder({ stone, dark: M.black, lead: M.steel });
  const rnd = ctx.mulberry32(1338);
  let tris = 0;

  for (const w of TOWN_WALLS) {
    const ctrl = w.pts.map(([la, lo]) => geo.ll(la, lo));
    // outward = west / seaward side: the side away from the walled-town centre
    const cen = geo.ll(50.8998, -1.4035);
    const pts = densify(ctrl, 6);
    let ci = 0;
    const ctrlIdx = pts.map((p) => { while (ci < ctrl.length - 1 && Math.hypot(p[0] - ctrl[ci + 1][0], p[1] - ctrl[ci + 1][1]) < 0.01) ci++; return ci; });
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      const dx = c[0] - a[0], dz = c[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 0.1) continue;
      const ux = dx / L, uz = dz / L;
      let nx = -uz, nz = ux;
      const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
      if ((mx - cen[0]) * nx + (mz - cen[1]) * nz < 0) { nx = -nx; nz = -nz; }
      // gaps where the wall had been breached by 1912
      if (rnd() < 0.05) continue;
      const g0 = ground(a[0], a[1]), g1 = ground(c[0], c[1]);
      const gmin = Math.min(g0, g1), gmax = Math.max(g0, g1);
      const H = 7.5 + 0.8 * Math.sin(i * 0.7) + rnd() * 0.6;
      const top = gmax + H;
      const ry = Math.atan2(-dz, dx);
      const T = 2.4;
      b.cbox('stone', mx, (top + gmin - 2) / 2, mz, L + 0.4, top - gmin + 2, T, 0, ry, 0);
      // wall-walk parapet with merlons on the outer face
      const nm = Math.max(1, Math.round(L / 1.9));
      for (let k = 0; k < nm; k++) {
        const t = (k + 0.5) / nm - 0.5;
        b.cbox('stone', mx + ux * t * L + nx * (T / 2 - 0.35), top + 0.55, mz + uz * t * L + nz * (T / 2 - 0.35), 1.0, 1.1, 0.7, 0, ry, 0);
      }
      // blind arcades on the west wall
      const seg = ctrlIdx[i];
      if (w.arcade && seg >= w.arcade[0] && seg < w.arcade[1]) {
        for (let k = 0; k < 2; k++) {
          const t = k * 0.5 - 0.25;
          b.cbox('stone', mx + ux * t * L + nx * (T / 2 + 0.5), (top + gmin - 1) / 2 - 0.3, mz + uz * t * L + nz * (T / 2 + 0.5), 0.9, top - gmin + 0.4, 1.0, 0, ry, 0);
        }
        b.cbox('dark', mx + nx * (T / 2 + 0.02), gmin + (top - gmin) * 0.45, mz + nz * (T / 2 + 0.02), L * 0.45, (top - gmin) * 0.55, 0.05, 0, ry, 0);
      }
      occ.mark([[a[0] - nx * 3, a[1] - nz * 3], [c[0] - nx * 3, c[1] - nz * 3], [c[0] + nx * 60, c[1] + nz * 60], [a[0] + nx * 60, a[1] + nz * 60]], 3);
    }
    for (const ti of w.towers) {
      const p = ctrl[ti];
      const g = ground(p[0], p[1]);
      const r = 4.2, H = 11 + rnd() * 2;
      b.cyl('stone', p[0], g + (H - 2) / 2, p[1], r, r * 1.05, H + 2, 12);
      for (let k = 0; k < 10; k++) {
        const an = (k / 10) * Math.PI * 2;
        b.cbox('stone', p[0] + Math.cos(an) * (r - 0.35), g + H + 0.55, p[1] + Math.sin(an) * (r - 0.35), 1.0, 1.1, 0.7, 0, -an, 0);
      }
      occ.mark([[p[0] - 7, p[1] - 7], [p[0] + 7, p[1] - 7], [p[0] + 7, p[1] + 7], [p[0] - 7, p[1] + 7]], 3);
    }
  }

  // ------------------------------------------------ Bargate
  {
    const [bx, bz] = layout.LANDMARKS.bargate;
    const g = ground(bx, bz);
    const y0 = g - 2;
    const H = 13.5;
    const D = 11; // depth N–S
    const box = (x0, x1, ya, yb, z0, z1, key = 'stone') => b.box(key, bx + x0, ya, bz + z0, x1 - x0, yb - ya, z1 - z0);
    // piers either side of the passage and the mass above
    box(-8, -2.4, y0, g + H, -D / 2, D / 2);
    box(2.4, 8, y0, g + H, -D / 2, D / 2);
    box(-2.4, 2.4, g + 6.4, g + H, -D / 2, D / 2);
    // pointed-arch haunches
    for (const s of [-1, 1]) {
      b.cbox('stone', bx + s * 1.75, g + 5.6, bz, 1.9, 1.6, D, 0, 0, s * 0.62);
      b.cbox('stone', bx + s * 0.9, g + 6.3, bz, 1.4, 0.8, D, 0, 0, s * 0.35);
    }
    // north drum towers (semi-octagonal)
    for (const s of [-1, 1]) {
      b.cyl('stone', bx + s * 5.2, y0 + (H + 1.2 + 2) / 2, bz - D / 2, 2.9, 3.1, H + 1.2 + 2, 8);
      for (let k = 0; k < 8; k++) {
        const an = Math.PI + (k / 7) * Math.PI;
        b.cbox('stone', bx + s * 5.2 + Math.cos(an) * 2.6, g + H + 1.2 + 0.55, bz - D / 2 + Math.sin(an) * 2.6, 0.9, 1.1, 0.6, 0, -an, 0);
      }
    }
    // battlements round the top
    const mer = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.round(L / 1.7);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        b.cbox('stone', bx + x0 + (x1 - x0) * t, g + H + 0.55, bz + z0 + (z1 - z0) * t, x1 === x0 ? 0.6 : 0.9, 1.1, x1 === x0 ? 0.9 : 0.6);
      }
    };
    mer(-7.7, -D / 2 + 0.3, 7.7, -D / 2 + 0.3); mer(-7.7, D / 2 - 0.3, 7.7, D / 2 - 0.3);
    mer(-7.7, -D / 2 + 0.3, -7.7, D / 2 - 0.3); mer(7.7, -D / 2 + 0.3, 7.7, D / 2 - 0.3);
    b.box('lead', bx - 7.6, g + H - 0.2, bz - D / 2 + 0.5, 15.2, 0.3, D - 1);
    // string course and guildhall windows on the south (town) face
    b.box('stone', bx - 8.2, g + 6.8, bz + D / 2 - 0.1, 16.4, 0.35, 0.4);
    for (let k = 0; k < 4; k++) b.box('dark', bx - 6 + k * 3.6, g + 8.2, bz + D / 2 - 0.02, 1.1, 2.2, 0.08);
    for (const s of [-1, 1]) b.box('dark', bx + s * 5.2 - 0.4, g + 8.4, bz - D / 2 - 3.0, 0.8, 1.8, 0.1);
    occ.mark([[bx - 24.5, bz - 10], [bx + 24.5, bz - 10], [bx + 24.5, bz + 7], [bx - 24.5, bz + 7]], 3);
  }

  const group = b.build({ name: 'town-walls' });
  group.traverse((o) => { if (o.isMesh) tris += o.geometry.attributes.position.count / 3; });
  return { group, tris };
}
