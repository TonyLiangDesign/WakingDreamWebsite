// Special sites with their own layouts: board schools, allotments, recreation grounds, nurseries,
// timber yards, brickfields, the Northam gasworks, village churches and farmsteads.
// Every site gets an oriented rectangle q = [q0,q1,q2,q3] (q0→q1 = width W, q0→q3 = depth D).

export function makeSites(api) {
  const { S, KIND, STYLE, ground, rnd, R, pick, col, chunkAt, chimneysInd, chimneysHouse, DEG, tall } = api;
  let tris0 = 0;
  const L2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const frame = (q) => {
    const W = L2(q[0], q[1]), D = L2(q[0], q[3]);
    const u = [(q[1][0] - q[0][0]) / W, (q[1][1] - q[0][1]) / W], v = [(q[3][0] - q[0][0]) / D, (q[3][1] - q[0][1]) / D];
    const P = (a, b) => [q[0][0] + u[0] * a + v[0] * b, q[0][1] + u[1] * a + v[1] * b];
    const R4 = (a0, b0, a1, b1) => [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)];
    return { W, D, u, v, P, R4 };
  };
  const gmin = (q) => Math.min(...q.map((p) => ground(p[0], p[1])));
  const gmax = (q) => Math.max(...q.map((p) => ground(p[0], p[1])));
  const patch = (m, q, kind, tint, style = 0, off = 0.1) => S.patch(m, q, q.map((p) => ground(p[0], p[1]) + off), kind, tint, L2(q[0], q[1]), L2(q[0], q[3]), style);

  // a gabled building on quad c (ridge along c0→c1); returns { eaves, ridge }
  function bld(m, c, o) {
    const floor = gmax(c) + (o.raise ?? 0.2), base = gmin(c) - 0.8;
    const storeys = o.storeys ?? 1, sh = o.sh ?? 3;
    const eaves = o.eaves ?? floor + storeys * sh + 0.3;
    const span = L2(c[0], c[3]);
    const rh = o.rh ?? (span / 2) * Math.tan((o.pitch ?? 35) * DEG);
    const st = o.style ?? STYLE.BLANK;
    S.building(m, c, {
      base, floor, eaves, rh, kind: o.kind ?? KIND.BRICK, col: o.col ?? col.brick(), roofKind: o.roofKind ?? KIND.SLATE, roofCol: o.roofCol ?? col.slate(),
      storeys, sh, walls: o.walls ?? [st, st, st, st], bays: o.bays ?? [3, 3, 3, 3], roof: o.roof ?? 'gable', overhang: o.overhang ?? 0, parapet: o.parapet, parapetAll: o.parapetAll,
      gables: o.gables,
    });
    return { floor, eaves, ridge: eaves + rh, rh };
  }
  const stackAt = (m, p, dir, yBase, yTop, c, pots = 0) => {
    const top = S.stack(m, p, dir, 1.2, 0.6, yBase, yTop, c, KIND.BRICK, pots);
    chimneysHouse.push([p[0], top, p[1], 0]);
  };

  function school(q) {
    const m = chunkAt(q[0]), F = frame(q);
    patch(m, q, KIND.PAVE, [0.075, 0.072, 0.068], 0, 0.09);
    const b0 = Math.min(18, F.D * 0.4);
    const main = F.R4(F.W * 0.12, 4, F.W * 0.88, 4 + Math.min(14, b0));
    const sh = R(4.2, 4.8), storeys = rnd() < 0.4 ? 3 : 2, kind = rnd() < 0.75 ? KIND.BRICK : KIND.BUFF;
    const c = kind === KIND.BRICK ? col.brick() : col.buff(), rc = col.slate();
    const h = bld(m, main, { storeys, sh, pitch: 48, kind, col: c, roofCol: rc, style: STYLE.CHAPEL, bays: [3.2, 3.2, 3.2, 3.2] });
    // cross wings with gables to the street
    for (const a of [F.W * 0.06, F.W * 0.94 - 10]) {
      const wq = F.R4(a, 2, a + 10, 4 + Math.min(20, F.D * 0.55));
      bld(m, [wq[1], wq[2], wq[3], wq[0]], { storeys, sh, pitch: 50, kind, col: c, roofCol: rc, style: STYLE.CHAPEL, bays: [3, 3, 3, 3] });
    }
    // bell-cote on the ridge
    const rp = F.P(F.W * 0.5, 4 + Math.min(14, b0) / 2);
    S.stack(m, rp, F.u, 1.4, 1.4, h.ridge - 1, h.ridge + 2.2, c, kind, 0);
    const cy = h.ridge + 2.2;
    S.building(m, S.rectQ(rp, F.u, 1.8, 1.8), { base: cy, floor: cy, eaves: cy, rh: 1.6, kind, col: c, roofKind: KIND.LEAD, roofCol: [1, 1, 1], storeys: 0, sh: 3, walls: [null, null, null, null], roof: 'hip' });
  }

  function allotments(q) {
    const m = chunkAt(q[0]), F = frame(q);
    const cw = R(9, 12), rw = R(20, 26);
    const nC = Math.max(1, Math.floor(F.W / cw)), nR = Math.max(1, Math.floor(F.D / (rw + 2)));
    const tints = [[0.13, 0.16, 0.06], [0.16, 0.12, 0.07], [0.1, 0.15, 0.05], [0.18, 0.18, 0.08], [0.14, 0.1, 0.06]];
    for (let j = 0; j < nR; j++) {
      const b0 = j * (rw + 2) + 1, b1 = b0 + rw;
      // strips alternate direction of cultivation
      for (let i = 0; i < nC; i++) {
        const a0 = i * (F.W / nC) + 0.3, a1 = (i + 1) * (F.W / nC) - 0.3;
        const pq = F.R4(a0, b0, a1, b1);
        const t = pick(tints), k = R(0.8, 1.2);
        patch(m, pq, KIND.GARDEN, [t[0] * k, t[1] * k, t[2] * k], rnd() < 0.8 ? 1 : 0);
        if (rnd() < 0.3) {
          const sp = F.P(a0 + 1.5, b1 - 1.5);
          const g = ground(sp[0], sp[1]);
          S.box(m, S.rectQ(sp, F.u, 1.8, 2.2), g - 0.3, g + 2, KIND.STUCCO, [R(0.15, 0.3), R(0.13, 0.25), R(0.1, 0.2)], KIND.IRON, [R(0.7, 1.2), R(0.6, 1), R(0.5, 1)]);
        }
      }
    }
  }

  function recground(q) {
    const m = chunkAt(q[0]), F = frame(q);
    patch(m, q, KIND.GARDEN, [0.2, 0.28, 0.1], 0, 0.08);
    const cq = F.R4(F.W / 2 - 12, F.D / 2 - 3, F.W / 2 + 12, F.D / 2 + 3);
    patch(m, cq, KIND.GARDEN, [0.27, 0.29, 0.14], 0, 0.1);
    const pq = F.R4(3, 3, 14, 9);
    bld(m, pq, { storeys: 1, sh: 3.2, pitch: 38, kind: KIND.STUCCO, col: [0.62, 0.6, 0.54], roofKind: KIND.TILE, roofCol: col.tile(), style: STYLE.HOUSE, overhang: 0.6, bays: [2.5, 2.5, 2.5, 2.5] });
  }

  function nursery(q) {
    const m = chunkAt(q[0]), F = frame(q);
    const rows = Math.max(2, Math.floor(F.W / 14));
    for (let i = 0; i < rows; i++) {
      const a0 = i * (F.W / rows) + 0.5, a1 = (i + 1) * (F.W / rows) - 0.5;
      if (rnd() < 0.45) {
        const gq = F.R4(a0 + 2, 3, a0 + 7, F.D - 3);
        const floor = gmax(gq) + 0.1;
        S.building(m, [gq[3], gq[0], gq[1], gq[2]], { base: gmin(gq) - 0.5, floor, eaves: floor + 1.3, rh: 1.4, kind: KIND.BRICK, col: col.brick(), roofKind: KIND.GLASSROOF, roofCol: [1, 1, 1], storeys: 0, sh: 3, walls: [STYLE.BLANK, STYLE.BLANK, STYLE.BLANK, STYLE.BLANK] });
        patch(m, F.R4(a0 + 8, 1, a1, F.D - 1), KIND.GARDEN, [0.12, 0.15, 0.06], 1);
      } else patch(m, F.R4(a0, 1, a1, F.D - 1), KIND.GARDEN, pick([[0.12, 0.17, 0.06], [0.17, 0.13, 0.08], [0.15, 0.18, 0.07]]), 1);
    }
    const hq = F.R4(1, 1, 9, 7);
    bld(m, hq, { storeys: 2, sh: 2.8, pitch: 40, kind: KIND.BRICK, roofKind: KIND.TILE, roofCol: col.tile(), style: STYLE.HOUSE });
  }

  function timberyard(q) {
    const m = chunkAt(q[0]), F = frame(q);
    patch(m, q, KIND.PAVE, [0.1, 0.085, 0.065], 0, 0.09);
    const wood = () => { const k = R(0.55, 1.0); return [0.62 * k, 0.48 * k, 0.32 * k]; };
    for (let a = 4; a < F.W - 8; a += R(8, 11)) {
      for (let b = 4; b < F.D - 5; b += R(4, 6)) {
        if (rnd() < 0.25) continue;
        const sq = F.R4(a, b, a + R(5, 7.5), b + R(2, 3));
        const g = gmin(sq), h = R(1.5, 4.2);
        S.box(m, sq, g - 0.3, g + h, KIND.STUCCO, wood(), KIND.STUCCO, wood());
      }
    }
    // open-sided drying sheds
    for (let i = 0; i < 2; i++) {
      const a = rnd() * Math.max(1, F.W - 30);
      const sq = F.R4(a, F.D - 14, a + 28, F.D - 2);
      const g = gmin(sq), eaves = gmax(sq) + 4.5;
      S.building(m, sq, { base: g, floor: g, eaves, rh: 2.2, kind: KIND.STUCCO, col: wood(), roofKind: KIND.IRON, roofCol: [R(0.8, 1.2), R(0.7, 1), R(0.6, 1)], storeys: 0, sh: 3, walls: [null, null, STYLE.BLANK, null] });
      for (const p of [sq[0], sq[1]]) S.stack(m, p, F.u, 0.3, 0.3, g, eaves, [0.3, 0.25, 0.2], KIND.STUCCO, 0, false);
    }
  }

  function brickfield(q) {
    const m = chunkAt(q[0]), F = frame(q);
    patch(m, F.R4(0, F.D * 0.4, F.W, F.D), KIND.PAVE, [0.11, 0.075, 0.045], 0, 0.07);
    patch(m, F.R4(0, 0, F.W, F.D * 0.4), KIND.PAVE, [0.09, 0.075, 0.06], 0, 0.08);
    const kq = F.R4(F.W * 0.15, 4, F.W * 0.15 + 40, 16);
    const sc = col.soot();
    const h = bld(m, kq, { storeys: 1, sh: 3.6, pitch: 22, kind: KIND.BRICK, col: sc, roofCol: col.slate(), style: STYLE.WAREHOUSE, bays: [4, 4, 4, 4] });
    const sp = F.P(F.W * 0.15 + 20, 10);
    tall(m, sp, h.ridge - 1, R(18, 30), 1.4, sc, true);
    for (let i = 0; i < 5; i++) {
      const a = F.W * 0.15 + 46 + i * 5.5;
      if (a + 3 > F.W) break;
      const hq = F.R4(a, 3, a + 3, Math.min(F.D * 0.38, 34));
      const g = gmin(hq);
      S.building(m, [hq[1], hq[2], hq[3], hq[0]], { base: g, floor: g, eaves: g + 1.5, rh: 1.0, kind: KIND.BRICK, col: sc, roofKind: KIND.TILE, roofCol: col.tile(), storeys: 0, sh: 3, walls: [null, null, null, null] });
    }
  }

  function gasworks(q) {
    const m = chunkAt(q[0]), F = frame(q);
    patch(m, q, KIND.PAVE, [0.055, 0.05, 0.048], 0, 0.09);
    const holders = [[0.22, 0.3, R(20, 24)], [0.55, 0.28, R(24, 28)], [0.35, 0.75, R(16, 19)]];
    for (const [fa, fb, r] of holders) {
      const p = F.P(F.W * fa, F.D * fb);
      const g = ground(p[0], p[1]);
      const H = r * R(0.7, 1.0), bell = H * R(0.55, 0.95);
      const paint = [R(1.0, 1.4), R(0.55, 0.7), R(0.45, 0.55)];
      S.cylinder(m, p, r - 0.6, g - 0.5, g + bell, 20, KIND.IRON, paint, KIND.IRON, paint, r * 0.12);
      const nCol = 12;
      for (let i = 0; i < nCol; i++) {
        const a = (i / nCol) * Math.PI * 2;
        const cp = [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r];
        S.stack(m, cp, [Math.cos(a), Math.sin(a)], 0.7, 0.7, g - 0.3, g + H + 3, [0.5, 0.5, 0.5], KIND.IRON, 0, false);
        const a2 = ((i + 1) / nCol) * Math.PI * 2, cp2 = [p[0] + Math.cos(a2) * r, p[1] + Math.sin(a2) * r];
        const mid = [(cp[0] + cp2[0]) / 2, (cp[1] + cp2[1]) / 2], len = Math.hypot(cp2[0] - cp[0], cp2[1] - cp[1]);
        const dir = [(cp2[0] - cp[0]) / len, (cp2[1] - cp[1]) / len];
        S.box(m, S.rectQ(mid, dir, len, 0.4), g + H + 2.2, g + H + 3, KIND.IRON, [0.5, 0.5, 0.5], null);
      }
    }
    const rq = F.R4(F.W * 0.72, 6, F.W * 0.97, 6 + Math.min(22, F.D * 0.3));
    const sc = col.soot();
    const h = bld(m, [rq[1], rq[2], rq[3], rq[0]], { storeys: 2, sh: 4.5, pitch: 26, kind: KIND.BRICK, col: sc, roofCol: col.slate(), style: STYLE.WAREHOUSE, bays: [4, 4, 4, 4] });
    for (const t of [0.3, 0.75]) tall(m, F.P(F.W * 0.845, 6 + Math.min(22, F.D * 0.3) * t), h.eaves, R(30, 42), 1.6, sc, true);
    for (let i = 0; i < 3; i++) {
      const cq = F.R4(F.W * (0.62 + i * 0.12), F.D * 0.62, F.W * (0.62 + i * 0.12) + 14, F.D * 0.62 + 20);
      const g = gmin(cq);
      S.building(m, cq, { base: g - 0.2, floor: g, eaves: g + 0.4, rh: R(3, 5), kind: KIND.SOOT, col: [1, 1, 1], roofKind: KIND.SOOT, roofCol: [1.2, 1.2, 1.2], storeys: 0, sh: 3, walls: [null, null, null, null], roof: 'hip' });
    }
  }

  // Parish church: flint & stone nave, chancel, west tower (battlemented or shingled spire), churchyard.
  function church(q) {
    const m = chunkAt(q[0]), F = frame(q);
    patch(m, q, KIND.GARDEN, [0.14, 0.2, 0.07], 0, 0.08);
    const stone = [R(0.8, 1.0), R(0.78, 0.95), R(0.72, 0.88)];
    const roofKind = rnd() < 0.6 ? KIND.TILE : KIND.SLATE, roofCol = roofKind === KIND.TILE ? col.tile() : col.slate();
    const cy = F.D / 2, nL = Math.min(20, F.W * 0.5), x0 = F.W * 0.3;
    const nave = F.R4(x0, cy - 4, x0 + nL, cy + 4);
    const h = bld(m, nave, { storeys: 1, sh: 6.2, pitch: 48, kind: KIND.STONE, col: stone, roofKind, roofCol, style: STYLE.CHAPEL, bays: [4, 4, 4, 4] });
    const ch = F.R4(x0 + nL - 0.5, cy - 3, x0 + nL + 7, cy + 3);
    bld(m, ch, { storeys: 1, sh: 5, pitch: 48, kind: KIND.STONE, col: stone, roofKind, roofCol, style: STYLE.CHAPEL, walls: [STYLE.CHAPEL, STYLE.CHAPEL, STYLE.CHAPEL, null], bays: [4, 3, 4, 3] });
    const tq = F.R4(x0 - 5.5, cy - 2.75, x0 + 0.2, cy + 2.75);
    const g = gmin(tq), tH = R(13, 18);
    S.box(m, tq, g - 0.8, g + tH, KIND.STONE, stone, rnd() < 0.5 ? KIND.LEAD : null, [1, 1, 1], STYLE.BLANK);
    if (rnd() < 0.45) {
      S.building(m, tq, { base: g + tH, floor: g + tH, eaves: g + tH, rh: R(8, 12), kind: KIND.STONE, col: stone, roofKind: KIND.SLATE, roofCol: [0.7, 0.7, 0.7], storeys: 0, sh: 3, walls: [null, null, null, null], roof: 'hip' });
    } else {
      for (let i = 0; i < 4; i++) {
        const a = tq[i], b = tq[(i + 1) % 4];
        for (const t of [0.15, 0.5, 0.85]) {
          const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const d = [(b[0] - a[0]) / 5.7, (b[1] - a[1]) / 5.7];
          S.box(m, S.rectQ(p, d, 0.8, 0.5), g + tH, g + tH + 0.9, KIND.STONE, stone, KIND.STONE, stone);
        }
      }
    }
    void h;
  }

  // Farmstead: farmhouse, big black weatherboarded barn, cart shed, yard, ricks. u = axis of the field grid.
  function farm(p, u) {
    const m = chunkAt(p);
    const v = [-u[1], u[0]];
    const P = (a, b) => [p[0] + u[0] * a + v[0] * b, p[1] + u[1] * a + v[1] * b];
    const R4 = (a0, b0, a1, b1) => [P(a0, b0), P(a1, b0), P(a1, b1), P(a0, b1)];
    patch(m, R4(-6, 6, 30, 30), KIND.YARD, [0.1, 0.085, 0.06], 0, 0.08);
    patch(m, R4(-14, -12, 6, 4), KIND.GARDEN, [0.12, 0.17, 0.06], rnd() < 0.5 ? 1 : 0, 0.08);
    const whitewash = rnd() < 0.35;
    const hk = whitewash ? KIND.STUCCO : KIND.BRICK, hc = whitewash ? [0.62, 0.6, 0.55] : col.brick();
    const thatch = rnd() < 0.3;
    const hr = thatch ? KIND.THATCH : rnd() < 0.6 ? KIND.TILE : KIND.SLATE;
    const hq = R4(-5, -4, 6, 4);
    const h = bld(m, hq, { storeys: 2, sh: 2.7, pitch: thatch ? 50 : 42, kind: hk, col: hc, roofKind: hr, roofCol: hr === KIND.SLATE ? col.slate() : hr === KIND.TILE ? col.tile() : [1, 1, 1], style: STYLE.HOUSE, overhang: thatch ? 0.5 : 0.25, bays: [2.6, 3, 2.6, 3] });
    for (const a of [-4.4, 5.4]) stackAt(m, P(a, 0), v, h.ridge - 1.5, h.ridge + 0.9, col.brick());
    const barnW = R(18, 26);
    const bq = R4(2, 18, 2 + barnW, 27);
    const tar = [R(0.08, 0.14), R(0.07, 0.12), R(0.06, 0.1)];
    const br = rnd() < 0.35 ? KIND.THATCH : rnd() < 0.6 ? KIND.TILE : KIND.SLATE;
    bld(m, bq, { storeys: 1, sh: 5, pitch: 45, kind: KIND.STUCCO, col: tar, roofKind: br, roofCol: br === KIND.TILE ? col.tile() : br === KIND.SLATE ? col.slate() : [0.85, 0.85, 0.85], style: STYLE.BLANK });
    const sq = R4(24, 6, 30, 20);
    bld(m, [sq[1], sq[2], sq[3], sq[0]], { storeys: 1, sh: 3.2, pitch: 30, kind: KIND.STUCCO, col: tar, roofKind: rnd() < 0.5 ? KIND.IRON : KIND.TILE, roofCol: [R(0.8, 1.2), R(0.6, 1), R(0.5, 0.9)], walls: [STYLE.BLANK, STYLE.BLANK, STYLE.BLANK, null] });
    for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) {
      const rq = R4(8 + i * 7, 32, 13 + i * 7, 36);
      const g = gmin(rq);
      S.building(m, rq, { base: g - 0.2, floor: g, eaves: g + 2.4, rh: 2.2, kind: KIND.STUCCO, col: [0.42, 0.36, 0.22], roofKind: KIND.THATCH, roofCol: [1.1, 1.05, 0.9], storeys: 0, sh: 3, walls: [STYLE.BLANK, STYLE.BLANK, STYLE.BLANK, STYLE.BLANK], roof: 'hip' });
    }
  }

  return { school, allotments, recground, nursery, timberyard, brickfield, gasworks, church, farm, tris0 };
}
