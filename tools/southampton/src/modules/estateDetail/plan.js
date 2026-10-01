import * as THREE from 'three';
import { transitShed, warehouse, sawtoothShop, chimney, office, hut, coldStore, gableRoof, hipRoof } from './buildings.js';
import { portalCrane, steamCrane, hydraulicCrane, hammerhead, floatingCrane } from './cranes.js';
import { makePath, offsetPath, sampleAt, subPath, drawTrack, defineRollingStock, defineSleeper, rake, turntable, bufferStop, signalPost, RAIL_TOP } from './rail.js';
import { defineProps, cargoStack, coalHeap, timberStack, boundaryWall } from './props.js';
import { M4 } from './fb.js';

// All coordinates in the dock frame (see site.js). Edge frames: local x along the quay, inland = -z;
// EP(frame, s, off) is the point s metres along the quay and `off` metres inland.

export function buildPlan({ M, site, fb, inst, rnd, Q, waterAt }) {
  const stats = { sheds: 0, warehouses: 0, cranes: 0, tracks: 0, trackKm: 0, wagons: 0, stacks: 0, boats: 0 };
  defineSleeper(inst);
  defineRollingStock(inst);
  defineProps(inst);

  const est = site.estate, ih = site.holes.inner;
  const E = {};
  const names = { TQ: [11, 12], DH: [12, 13], IS1: [13, 14], IS2: [14, 15], ES: [15, 16], EW: [16, 17], EN: [17, 18], EE: [18, 19], IQ1: [19, 20], IQ2: [20, 21], IQ3: [21, 22], OS: [22, 23], OW: [23, 24] };
  for (const [n, [i, j]] of Object.entries(names)) E[n] = site.edgeFrame(est[i], est[j]);
  for (let i = 0; i < 4; i++) E['IN' + i] = site.edgeFrame(ih[i], ih[(i + 1) % 4]);
  const EP = (fr, s, off) => site.toDock(fr, s, -off);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  // ================================================================ buildings
  const fit = (fr, s0, s1, zNear, zFar, minLen = 40) => {
    let a = s0, b = s1;
    for (let it = 0; it < 80; it++) {
      if (b - a < minLen) return null;
      if (site.rectFree(fr, a, b, zFar, zNear) >= 0.995) return [a, b];
      const fa = site.rectFree(fr, a, a + 6, zFar, zNear), fbb = site.rectFree(fr, b - 6, b, zFar, zNear);
      if (fa <= fbb) a += 3; else b -= 3;
    }
    return null;
  };
  const sheds = [];
  const shed = (en, s0, s1, D, opts = {}) => {
    const fr = E[en], zW = -(opts.apron ?? 14.5);
    const r = fit(fr, s0, s1, zW - 0.5, zW - D - 1);
    if (!r) return null;
    const [a, b] = r;
    site.mark(fr, a - 1, b + 1, zW - D - 1.5, zW + 0.5, 4);
    fb.pushFrame(fr.ox, fr.oz, fr.ang);
    transitShed(fb, rnd, a, b, zW, D, opts);
    fb.pop();
    // brick office annex at one end of most sheds (clerks, customs, cargo superintendent)
    const aw = 14 + rnd() * 6, ad = 12 + rnd() * 4;
    for (const [x0, x1] of rnd() < 0.5 ? [[b + 3, b + 3 + aw], [a - 3 - aw, a - 3]] : [[a - 3 - aw, a - 3], [b + 3, b + 3 + aw]]) {
      const z1 = zW - D + ad + 2, z0 = zW - D + 2;
      if (site.rectFree(fr, x0 - 1, x1 + 1, z0 - 1, z1 + 1) < 1) continue;
      site.mark(fr, x0 - 1, x1 + 1, z0 - 1, z1 + 1, 4);
      fb.pushFrame(fr.ox, fr.oz, fr.ang);
      office(fb, rnd, x0, x1, z0, z1, { storeys: rnd() < 0.6 ? 2 : 1, wall: pick(['brick', 'brickRed', 'brickYellow']), roofKey: pick(['slate', 'slateDark']) });
      fb.pop();
      break;
    }
    stats.sheds++;
    const rec = { en, fr, a, b, zW, D };
    sheds.push(rec);
    return rec;
  };

  // Test Quay, berths 41–38 (Oceanic & New York lie at 38)
  shed('TQ', 22, 200, 36, { clad: 'shedClad', roofKey: 'roof' });
  shed('TQ', 222, 412, 36, { clad: 'cladGrey', roofKey: 'roofDark', canopy: true });
  const b38 = shed('TQ', 434, 652, 38, { storeys: 2, clad: 'cladRed', roofKey: 'roofRed', trim: 'trimWhite', canopy: true });
  // Itchen side of the dock head, berths 34–36
  shed('IS1', 28, 206, 30, { roof: 'single', clad: 'cladBlack', roofKey: 'roof', trim: 'shedTrim' });
  shed('IS1', 226, 404, 30, { clad: 'shedClad', roofKey: 'roofDark' });
  // Empress Dock
  shed('ES', 34, 204, 30, { clad: 'cladGrey', roofKey: 'roof' });
  shed('ES', 222, 336, 26, { roof: 'single', clad: 'cladRed', roofKey: 'roofRed', trim: 'trimWhite' });
  shed('EN', 16, 244, 30, { storeys: 2, clad: 'shedClad', roofKey: 'roofDark' });
  shed('EE', 14, 250, 30, { clad: 'cladRed', roofKey: 'roof', trim: 'trimWhite' });
  // Itchen Quays, berths 30–33
  shed('IQ1', 24, 284, 32, { clad: 'shedClad', roofKey: 'roof' });
  shed('IQ2', 10, 192, 32, { roof: 'single', clad: 'cladGrey', roofKey: 'roofDark' });
  shed('IQ3', 10, 152, 30, { clad: 'cladBlack', roofKey: 'roof', roof: 'single' });
  // Test shore south of Trafalgar Dry Dock (berths 47–48)
  E.SH4 = site.edgeFrame(est[3], est[4]); E.SH5 = site.edgeFrame(est[4], est[5]);
  shed('SH4', 30, 160, 22, { roof: 'single', clad: 'cladGrey', roofKey: 'roofDark' });
  // Outer Dock (Channel Islands & Havre steamers)
  shed('OS', 22, 140, 24, { roof: 'single', clad: 'cladRed', roofKey: 'roofRed', trim: 'trimWhite' });
  shed('OS', 158, 288, 24, { roof: 'single', clad: 'shedClad', roofKey: 'roof' });

  // ---------------------------------------------------------------- warehouses (edge frames)
  const whs = [];
  const whEdge = (en, s0, s1, D, opts) => {
    const fr = E[en], zW = -(opts.apron ?? 14.5);
    const r = fit(fr, s0, s1, zW - 0.5, zW - D - 1, 30);
    if (!r) return null;
    const [a, b] = r;
    site.mark(fr, a - 1.5, b + 1.5, zW - D - 2, zW + 0.5, 4);
    fb.pushFrame(fr.ox, fr.oz, fr.ang);
    warehouse(fb, rnd, a, b, zW - D, zW, { loading: [1, -1], ...opts });
    fb.pop();
    stats.warehouses++;
    whs.push({ fr, a, b, zW, D });
    return true;
  };
  whEdge('IN3', 14, 118, 28, { storeys: 5, wall: 'brick' });
  whEdge('IN3', 132, 246, 28, { storeys: 5, wall: 'brickYellow', roof: 'gables', gableSpan: 19 });
  whEdge('IN1', 18, 212, 26, { storeys: 4, wall: 'brickRed', roof: 'hip' });
  whEdge('IN2', 8, 100, 22, { storeys: 4, wall: 'brick' });
  whEdge('OW', 10, 148, 26, { storeys: 5, wall: 'brickYellow', roof: 'gables', gableSpan: 17 });

  // ---------------------------------------------------------------- axis-aligned buildings
  const AX = site.axisFrame;
  const place = (x0, x1, z0, z1, fn, minFree = 0.99) => {
    // shrink toward the centre until free
    for (let k = 0; k < 12; k++) {
      if (site.rectFree(AX, x0, x1, z0, z1) >= minFree) {
        site.mark(AX, x0 - 1.5, x1 + 1.5, z0 - 1.5, z1 + 1.5, 4);
        fn(x0, x1, z0, z1);
        return [x0, x1, z0, z1];
      }
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      x0 = cx + (x0 - cx) * 0.93; x1 = cx + (x1 - cx) * 0.93; z0 = cz + (z0 - cz) * 0.93; z1 = cz + (z1 - cz) * 0.93;
    }
    return null;
  };

  // Harland & Wolff Southampton repair works
  place(-470, -352, 207, 330, (a, b, c, d) => sawtoothShop(fb, a, b, c, d, { He: 11, span: 13, rise: 2.4, wall: 'brickRed', roofKey: 'roof' }));
  place(-470, -376, 72, 188, (a, b, c, d) => sawtoothShop(fb, a, b, c, d, { He: 10, span: 12, rise: 2.2, wall: 'brick', roofKey: 'roofRed' }));
  place(-300, -278, 70, 99, (a, b, c, d) => office(fb, rnd, a, b, c, d, { storeys: 2, floorH: 4.5, wall: 'brickRed' }));
  chimney(fb, -289, 106, 44, 1.9);
  site.mark(AX, -293, -285, 101, 111, 4);
  place(-262, -112, 117, 140, (a, b, c, d) => warehouse(fb, rnd, a, b, c, d, { storeys: 2, floorH: 4.2, wall: 'brick', roof: 'gables', gableSpan: 12, loading: [-1] }));
  place(-298, -168, 202, 238, (a, b, c, d) => warehouse(fb, rnd, a, b, c, d, { storeys: 1, floorH: 6, wall: 'brickRed', roof: 'gables', gableSpan: 12, loading: [-1, 1], bay: 6 }), 0.97);
  place(-530, -498, 196, 250, (a, b, c, d) => office(fb, rnd, a, b, c, d, { storeys: 2, wall: 'brickRed' }), 0.95);
  // dry dock pumping station
  place(-24, 6, 116, 139, (a, b, c, d) => office(fb, rnd, a, b, c, d, { storeys: 1, floorH: 6.5, wall: 'brick' }));
  chimney(fb, 12, 128, 26, 1.1);
  site.mark(AX, 9, 15, 125, 131, 4);

  // LSWR dock offices by the main gate, with clock turret
  place(-560, -520, 52, 112, (a, b, c, d) => office(fb, rnd, a, b, c, d, { storeys: 3, wall: 'brickRed', clock: true, front: 1 }), 0.9);
  // International cold store
  place(-332, -292, -560, -498, (a, b, c, d) => coldStore(fb, a, b, c, d, 21));
  // dock engine shed (two roads) next to the yard
  const eshed = place(-196, -150, -470, -452, (a, b, c, d) => {
    fb.gbox('brick', a, Q, c, b - a, 6.5, 0.5); fb.gbox('brick', a, Q, d - 0.5, b - a, 6.5, 0.5);
    fb.gbox('brick', b - 0.5, Q, c, 0.5, 6.5, d - c);
    fb.box('brick', a, Q + 5.2, c, 0.5, 1.3, d - c);
    for (let x = a + 4; x < b - 2; x += 5) for (const z of [c - 0.02, d + 0.02]) fb.panel('glass', x, Q + 3.2, z, 'z', z < c ? -1 : 1, 1.4, 2.4);
    gableRoof(fb, a, Q + 6.5, c, b - a, d - c, 3.2, 'slateDark', 'x', 0.4, 'brick');
    fb.box('slateDark', a + 4, Q + 9.7, (c + d) / 2 - 1.2, b - a - 8, 1.0, 2.4); // smoke vent
    fb.panel('glass', a - 0.02, Q + 2.5, (c + d) / 2, 'x', -1, d - c - 2, 5);
  });

  // ---------------------------------------------------------------- buildings in the open interiors
  const bldFr = (en, s0, s1, zNear, zFar, fn, minLen = 30) => {
    const fr = E[en];
    const r = fit(fr, s0, s1, -zNear, -zFar, minLen);
    if (!r) return null;
    site.mark(fr, r[0] - 2, r[1] + 2, -zFar - 2, -zNear + 2, 4);
    fb.pushFrame(fr.ox, fr.oz, fr.ang);
    fn(r[0], r[1], -zFar, -zNear);
    fb.pop();
    return { fr, a: r[0], b: r[1], zW: -zNear, D: zFar - zNear };
  };
  // dock head interior: general cargo sheds & a grain warehouse between the Test and Itchen sides
  const dh1 = bldFr('TQ', 190, 372, 150, 186, (a, b, z0, z1) => transitShed(fb, rnd, a, b, z1, z1 - z0, { clad: 'cladGrey', roofKey: 'roofRed', trim: 'shedTrim' }));
  if (dh1) sheds.push({ en: 'TQx', ...dh1 });
  const dh2 = bldFr('TQ', 392, 500, 150, 178, (a, b, z0, z1) => transitShed(fb, rnd, a, b, z1, z1 - z0, { roof: 'single', clad: 'cladBlack', roofKey: 'roof' }));
  if (dh2) sheds.push({ en: 'TQy', ...dh2 });
  bldFr('TQ', 96, 168, 150, 176, (a, b, z0, z1) => warehouse(fb, rnd, a, b, z0, z1, { storeys: 6, floorH: 3.3, wall: 'brickYellow', roof: 'hip', loading: [1, -1], loadEvery: 4 }));
  // central east: LSWR goods & stores building, stables block, sidings office
  place(-178, -104, -335, -305, (a, b, c, d) => warehouse(fb, rnd, a, b, c, d, { storeys: 3, floorH: 4, wall: 'brickRed', roof: 'gables', gableSpan: 14, loading: [1] }), 0.97);
  place(-176, -128, -392, -372, (a, b, c, d) => office(fb, rnd, a, b, c, d, { storeys: 2, floorH: 4.2, wall: 'brick', roofKey: 'slateDark' }), 0.97);
  place(-176, -150, -250, -236, (a, b, c, d) => office(fb, rnd, a, b, c, d, { storeys: 1, floorH: 4.5, wall: 'brickYellow', roofKey: 'slateDark' }), 0.97);
  // docks police station & customs watch house by the main gate
  place(-512, -482, -102, -78, (a, b, c, d) => office(fb, rnd, a, b, c, d, { storeys: 2, wall: 'brickYellow', roofKey: 'slateDark', front: 1 }), 0.95);
  // signal box at the Ocean Dock mouth junction
  place(292, 304, -110, -104, (a, b, c, d) => {
    fb.gbox('brickRed', a, Q, c, b - a, 3.2, d - c);
    fb.gbox('timber', a - 0.2, Q + 3.2, c - 0.2, b - a + 0.4, 2.6, d - c + 0.4);
    for (let x = a + 0.8; x < b - 0.5; x += 1.3) fb.panel('glass', x, Q + 4.6, c - 0.23, 'z', -1, 1.0, 1.5), fb.panel('glass', x, Q + 4.6, d + 0.23, 'z', 1, 1.0, 1.5);
    hipRoof(fb, a - 0.2, b + 0.2, c - 0.2, d + 0.2, Q + 5.8, 1.6, 'slateDark', 0.5);
  }, 0.8);

  // ================================================================ Trafalgar Dry Dock
  const dd = site.holes.dd;
  {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of dd) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    // stepped altars on the long walls and the head
    for (let k = 1; k <= 8; k++) {
      const top = Q - 0.6 - 1.25 * k, inset = 0.8 * k, h = top + 10;
      fb.gbox('quayWall', x0 + 0.3, -10, z0, x1 - x0 - 7, h, inset);
      fb.gbox('quayWall', x0 + 0.3, -10, z1 - inset, x1 - x0 - 7, h, inset);
      fb.gbox('quayWall', x0, -10, z0, inset, h, z1 - z0);
      if (top > -0.5) {
        fb.box('coping', x0 + inset - 0.02, top - 0.05, z0 + inset, 0.2, 0.08, z1 - z0 - 2 * inset);
      }
    }
    // stairs down the altars (one flight each side)
    for (const [z, s] of [[z0, 1], [z1, -1]]) {
      for (let k = 0; k < 14; k++) fb.box('stone', x0 + 60 + k * 0.45, Q - 0.6 - k * 0.42, s > 0 ? z0 + 0.1 : z1 - 1.9, 0.46, 0.42, 1.8);
    }
    // caisson gate at the entrance (x1 end)
    const cx = x1 - 3.2, w = 6, zc = (z0 + z1) / 2, L = z1 - z0 + 1.2;
    fb.gbox('steel', cx - w / 2, -10, zc - L / 2, w, 10 + Q - 0.35, L);
    fb.box('timber', cx - w / 2 - 0.2, Q - 0.35, zc - L / 2, w + 0.4, 0.12, L);
    for (let z = zc - L / 2 + 1; z < zc + L / 2; z += 2.2) fb.box('castIron', cx - w / 2 - 0.1, Q - 0.25, z, 0.08, 1.1, 0.08), fb.box('castIron', cx + w / 2, Q - 0.25, z, 0.08, 1.1, 0.08);
    fb.box('castIron', cx - w / 2 - 0.1, Q + 0.8, zc - L / 2, 0.08, 0.06, L);
    fb.box('castIron', cx + w / 2, Q + 0.8, zc - L / 2, 0.08, 0.06, L);
    for (const z of [zc - 8, zc + 8]) fb.cyl('castIron', cx, Q + 0.2, z, 0.35, 0.45, 1.0, 8);
    fb.gbox('shedTrim', cx - 1.5, Q - 0.25, zc - 1.5, 3, 2.2, 3);
    fb.cbox('roof', cx, Q + 2.05, zc, 3.4, 0.1, 3.4);
    // closed entrance channel beyond the caisson: setts infill & timber fender line
  }
  // H&W hammerhead on the west side, steam crane on the east
  hammerhead(fb, -175, 196, Math.PI / 2, { H: 36, Lf: 30, Lb: 13, trolley: 0.55, hookY: 12 });
  site.mark(AX, -184, -166, 187, 205, 4);
  steamCrane(fb, -90, 150, -Math.PI / 2 + 0.3, { L: 13, luff: 0.8 });
  steamCrane(fb, -250, 150, -Math.PI / 2 - 0.4, { L: 12, luff: 0.7 });
  stats.cranes += 3;

  // ================================================================ railways
  const tracks = [];
  const clip = (path, pad = 4.5) => {
    // cut the path where it leaves the estate or gets within `pad` of a quay edge
    const keep = [];
    let started = false;
    for (let t = 0; t <= path.len; t += 2) {
      const p = sampleAt(path, t);
      const k = site.cellOf(p.x, p.z);
      const ok = k >= 0 && site.wdist[k] > pad && site.base[k] !== 2 || (k >= 0 && site.inKeep(p.x, p.z));
      if (ok) { if (!started) { keep.push(t); started = true; } }
      else if (started) { keep.push(t - 2); break; }
    }
    if (keep.length === 1) keep.push(path.len);
    if (keep.length < 2 || keep[1] - keep[0] < 10) return null;
    return subPath(path, keep[0], keep[1]);
  };
  const markTrack = (path, w = 4.8) => {
    for (let i = 1; i < path.pts.length; i++) {
      const a = path.pts[i - 1], b = path.pts[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      site.mark({ ox: a[0], oz: a[1], ang: Math.atan2(-dz / len, dx / len) }, -0.5, len + 0.5, -w / 2, w / 2, 3);
    }
  };
  const track = (path, opts = {}) => {
    if (!path) return null;
    const p = opts.noClip ? path : clip(path, opts.pad ?? 4.5);
    if (!p) return null;
    drawTrack(fb, inst, p, opts);
    if (opts.bed !== 'rails') markTrack(p, opts.bed === 'setts' ? 3.6 : 4.8);
    for (let i = 1; i < p.pts.length; i++) {
      const a = p.pts[i - 1], b = p.pts[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const fr = { ox: a[0], oz: a[1], ang: Math.atan2(-dz / len, dx / len) };
      if (opts.bed === 'rails') { site.stamp('wear', fr, 0, len, -2.5, 2.5, 0.35); continue; }
      site.stamp('gravel', fr, -1, len + 1, -5.5, 5.5, 0.9);
      if (opts.kind === 'coal' || opts.kind === 'yard') site.stamp('coal', fr, -1, len + 1, -8, 8, opts.kind === 'coal' ? 0.95 : 0.7);
      else site.stamp('coal', fr, -1, len + 1, -3.5, 3.5, 0.45);
    }
    const rec = { path: p, bed: opts.bed || 'ballast', yTop: opts.bed === 'ballast' || !opts.bed ? RAIL_TOP.ballast : RAIL_TOP.setts, fill: opts.fill ?? 0, kind: opts.kind };
    tracks.push(rec);
    stats.tracks++; stats.trackKm += p.len / 1000;
    return rec;
  };
  const multi = (wp, offs, opts = {}, r = 45) => {
    const base = makePath(wp, r);
    return offs.map((o) => track(o ? offsetPath(base, o) : base, opts));
  };

  // N1: main lead from the Canute Road gate to the Ocean Dock boat-train lines (dock.js)
  multi([[-612, 22], [-540, 4], [-470, -40], [-400, -90], [-330, -114], [-296, -118.2], [-257, -118.2]], [-2.3, 2.3], { noClip: true, fill: 0.25 }, 60);
  // N2: spine to the Test Quay, past Empress Dock west quay
  const n2 = multi([[-458, -48], [-400, -112], [-340, -141], [290, -141], EP(E.TQ, 70, 57), EP(E.TQ, 668, 57)], [0, 4.5], { fill: 0.35 }, 70);
  // N3: Itchen line
  multi([[-325, -141], [-290, -160], [-272, -200], [-272, -470], EP(E.IQ2, 175, 53), EP(E.IQ2, 20, 53), EP(E.IQ1, 270, 53), EP(E.IQ1, 20, 53)], [0, 4.5], { fill: 0.4 }, 50);
  track(makePath([EP(E.IQ2, 150, 57.5), EP(E.IQ3, 0, 51), EP(E.IQ3, 140, 51)], 40), { fill: 0.6 });
  // N4: central coal-strike yard (fan off N3)
  for (let i = 1; i <= 13; i++) {
    const x = -272 + 4.5 * i, zA = -196 - 2 * i, diag = 26 + 5.5 * i, zEnd = -452 - 3 * (i % 4) - (i > 9 ? 20 : 0);
    track(makePath([[-272, zA], [x, zA - diag], [x, zEnd]], 30), { fill: 0.85, kind: 'yard', throat: diag });
    tracks[tracks.length - 1] && (tracks[tracks.length - 1].throat = diag + 6);
  }
  // N5: Empress north & east quay back lines
  track(makePath([[-160, -145.5], [-140, -175], EP(E.EN, 20, 49), EP(E.EN, 255, 49), EP(E.EE, 25, 49), EP(E.EE, 250, 49)], 40), { fill: 0.5 });
  track(makePath([EP(E.EN, 60, 53.5), EP(E.EN, 255, 53.5), EP(E.EE, 25, 53.5), EP(E.EE, 200, 53.5)], 40), { fill: 0.6 });
  // N6: Empress south quay back line (dock head)
  track(makePath([[160, -145.5], [205, -175], EP(E.ES, 300, 49), EP(E.ES, 15, 49)], 40), { fill: 0.5 });
  // N7: Itchen dock-head back line & two groups of coal sidings in the middle of the dock head
  track(makePath([EP(E.IS1, 470, 47), EP(E.IS1, 15, 47)], 40), { fill: 0.45 });
  for (let k = 0; k < 7; k++) {
    const off = 78 + k * 4.5;
    track(makePath([EP(E.TQ, 70 + k * 10, 61.5), EP(E.TQ, 120 + k * 15, off), EP(E.TQ, 600 - k * 22, off)], 60), { fill: 0.8, kind: 'coal', throat: 60 + k * 5 });
  }
  for (let k = 0; k < 5; k++) {
    const off = 53.5 + k * 4.5;
    track(makePath([EP(E.IS1, 420 - k * 8, 47), EP(E.IS1, 380 - k * 14, off), EP(E.IS1, 70 + k * 16, off)], 50), { fill: 0.85, kind: 'coal', throat: 50 + k * 5 });
  }
  // N8: inner dock west side & to the outer dock warehouse
  track(makePath([[-325, -145.5], [-300, -190], [-330, -262], EP(E.OW, 8, 45), EP(E.OW, 150, 45)], 35), { fill: 0.5 });
  // N9: Harland & Wolff siding
  track(makePath([[-545, 2], [-500, 36], [-483, 80], [-483, 300]], 40), { fill: 0.3 });
  track(makePath([[-483, 150], [-470, 197], [-330, 197]], 30), { fill: 0.2, bed: 'setts' });
  // quay lines (flush in setts) + crane rails on the aprons
  const quayLines = ['SH4', 'TQ', 'IS1', 'ES', 'EW', 'EN', 'EE', 'IQ1', 'IQ2', 'IQ3', 'OS', 'OW', 'IN0', 'IN1', 'IN2', 'IN3', 'DH'];
  for (const en of quayLines) {
    const fr = E[en];
    const a = 6, b = fr.len - 6;
    if (b - a < 30) continue;
    track(makePath([EP(fr, a, 6.7), EP(fr, b, 6.7)], 1), { bed: 'rails', noClip: true, fill: en === 'TQ' ? 0.15 : 0.3 });
    if (!en.startsWith('IN') && en !== 'OW' && en !== 'OS') {
      for (const off of [3.2, 10.2]) {
        const p = makePath([EP(fr, a, off), EP(fr, b, off)], 1);
        drawTrack(fb, null, p, { bed: 'railsOnly' });
      }
    }
  }

  // buffer stops at dead ends of sidings
  for (const t of tracks) {
    if (t.bed !== 'ballast' || t.kind !== 'yard' && t.kind !== 'coal') continue;
    const p = sampleAt(t.path, t.path.len - 1.5);
    bufferStop(fb, p, t.yTop);
  }

  // turntable & signals
  turntable(fb, -205, -490, 0.4, 15);
  site.mark(AX, -214, -196, -499, -481, 4);
  signalPost(fb, -560, 16, 0, 2);
  signalPost(fb, -360, -150, 0.2, 1);
  signalPost(fb, -262, -190, Math.PI / 2, 2);
  signalPost(fb, 250, -151, 0, 1);

  // ================================================================ cranes
  const craneRun = (en, s0, s1, pitch, slewFn, opts = {}) => {
    const fr = E[en];
    fb.pushFrame(fr.ox, fr.oz, fr.ang);
    for (let s = s0; s < Math.min(s1, fr.len - 8); s += pitch * (0.8 + rnd() * 0.4)) {
      portalCrane(fb, s, -3.2, -10.2, slewFn(s), 0.85 + rnd() * 0.45, { lod: 'low', ...opts });
      stats.cranes++;
    }
    fb.pop();
  };
  const inland = () => Math.PI / 2 + (rnd() - 0.5) * 1.4;
  const anySlew = () => (rnd() < 0.5 ? -Math.PI / 2 : Math.PI / 2) + (rnd() - 0.5) * 1.6;
  craneRun('TQ', 30, 300, 38, anySlew);
  craneRun('TQ', 320, 670, 44, () => (rnd() < 0.5 ? (rnd() - 0.5) * 0.5 : inland()));
  craneRun('IS1', 30, 400, 46, anySlew);
  craneRun('ES', 40, 330, 50, anySlew);
  craneRun('EN', 30, 240, 48, anySlew);
  craneRun('EE', 30, 240, 52, anySlew);
  craneRun('IQ1', 30, 280, 44, anySlew);
  craneRun('IQ2', 20, 190, 50, anySlew);
  craneRun('IQ3', 20, 150, 55, anySlew);
  craneRun('EW', 40, 230, 70, anySlew);
  craneRun('SH4', 30, 160, 45, anySlew);
  // hydraulic cranes round the old docks
  for (const en of ['IN0', 'IN1', 'IN2', 'IN3', 'OS', 'OW']) {
    const fr = E[en];
    fb.pushFrame(fr.ox, fr.oz, fr.ang);
    for (let s = 18; s < fr.len - 10; s += 28 + rnd() * 12) {
      hydraulicCrane(fb, s, -11.5, -Math.PI / 2 + (rnd() - 0.5) * 2.2, { L: 8 + rnd() * 2, hook: rnd() });
      stats.cranes++;
    }
    fb.pop();
  }
  // steam travelling cranes on the dock head
  fb.pushFrame(E.DH.ox, E.DH.oz, E.DH.ang);
  steamCrane(fb, 40, -6.7, -1.2, {}); steamCrane(fb, 95, -6.7, 2.2, {});
  fb.pop();

  // ================================================================ rolling stock
  const mix = {
    yard: ['coal_empty', 'coal_empty', 'coal_black', 'coal_grey', 'open_grey', 'open_red', 'coal_empty', 'van', 'sheeted'],
    coal: ['coal_black', 'coal_black', 'coal_grey', 'coal_empty', 'coal_empty', 'open_grey'],
    quay: ['van', 'van', 'open_red', 'sheeted', 'crates', 'open_grey', 'bolster', 'van'],
    line: ['van', 'open_grey', 'coal_empty', 'open_red', 'sheeted', 'coal_black', 'crates'],
  };
  for (const t of tracks) {
    if (!t.fill) continue;
    const kind = t.kind || (t.bed === 'rails' ? 'quay' : 'line');
    const m = mix[kind] || mix.line;
    const siding = kind === 'yard' || kind === 'coal';
    const fill = siding ? t.fill * (0.55 + rnd() * 0.45) : t.fill;
    let s = (t.throat ?? 0) + 4 + rnd() * (siding ? 45 : 25);
    const end = t.path.len - 4 - (siding ? rnd() * 30 : 0);
    while (s < end - 10) {
      if (rnd() > fill) { s += 15 + rnd() * 50; continue; }
      const n = 2 + Math.floor(rnd() * (siding ? 22 : 9));
      const types = [];
      const base = pick(m);
      for (let i = 0; i < n; i++) types.push(rnd() < 0.55 ? base : pick(m));
      if (!siding && rnd() < 0.25) types.push('brake');
      const fitN = Math.floor((end - s) / 6.6);
      const use = types.slice(0, Math.max(0, fitN));
      if (!use.length) break;
      s = rake(inst, t.path, s, use, t.yTop, 0.9 + (rnd() < 0.3 ? 0.4 : 0)) + 5 + rnd() * (siding ? 25 : 45);
      stats.wagons += use.length;
    }
  }
  // shunting engines (B4 dock tanks)
  const loco = (ti, s) => { const t = tracks[ti]; if (!t) return; const p = sampleAt(t.path, s); inst.place('b4', new THREE.Matrix4().makeRotationY(Math.atan2(-p.tz, p.tx) + (rnd() < 0.5 ? Math.PI : 0)).setPosition(p.x, t.yTop, p.z)); };
  loco(0, 60); loco(3, 380); loco(5, 120); loco(12, 40);

  // ================================================================ ground: setts roads & shed platforms
  const ground = (key, fr, x0, x1, z0, z1) => {
    site.stamp('setts', fr, x0, x1, z0, z1, 1);
    site.stamp('wear', fr, x0 - 3, x1 + 3, z0 - 4, z1 + 4, 0.5);
  };
  // cart-wheel ruts: narrow, semi-transparent, noise-broken strips
  const ruts = (fr, x0, x1, zc, gap = 1.45) => {
    for (const o of [-gap / 2, gap / 2]) for (const w of [0.28, 0.5]) {
      const P = (lx, lz) => { const [x, z] = site.toDock(fr, lx, lz); return [x, Q + 0.03 + w * 0.004, z]; };
      fb.poly('rut', [P(x0, zc + o - w / 2), P(x1, zc + o - w / 2), P(x1, zc + o + w / 2), P(x0, zc + o + w / 2)], [0, 1, 0]);
    }
  };
  for (const s of sheds) {
    ruts(s.fr, s.a - 6, s.b + 6, s.zW - s.D - 3.2);
    ground('roadSetts', s.fr, s.a - 10, s.b + 10, s.zW - s.D - 5.5, s.zW - s.D + 0.2);
    ground('roadSetts', s.fr, s.a - 10, s.a + 0.2, s.zW - s.D - 5.5, s.zW);
    ground('roadSetts', s.fr, s.b - 0.2, s.b + 10, s.zW - s.D - 5.5, s.zW);
  }
  for (const w of whs) ground('roadSetts', w.fr, w.a - 8, w.b + 8, w.zW - w.D - 7, w.zW - w.D + 0.2);
  const road = (wp, width = 8, r = 30) => {
    const p = makePath(wp, r);
    for (let i = 1; i < p.pts.length; i++) {
      const a = p.pts[i - 1], b = p.pts[i];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      const fr = { ox: a[0], oz: a[1], ang: Math.atan2(-dz / len, dx / len) };
      ground('roadSetts', fr, -0.6, len + 0.6, -width / 2, width / 2);
      ruts(fr, -0.3, len + 0.3, (rnd() - 0.5) * 1.5, 1.5);
      if (width > 7.5) ruts(fr, -0.3, len + 0.3, width * 0.25, 1.5);
      site.mark(fr, -0.5, len + 0.5, -width / 2, width / 2, 2);
    }
    roadW.push(width);
    return p;
  };
  const roads = [], roadW = [];
  roads.push(road([[-600, 34], [-520, 24], [-455, -12], [-392, -64], [-340, -86], [-275, -92]], 9));
  roads.push(road([[-440, -150], [-360, -163], [-300, -176], [140, -176]], 8));
  roads.push(road([[-300, -176], [-290, -230], [-290, -520], EP(E.IQ2, 185, 68)], 8));
  roads.push(road([[-575, 80], [-500, 190], [-500, 320]], 7));
  roads.push(road([[140, -176], [220, -196], EP(E.TQ, 100, 72), EP(E.TQ, 640, 72)], 8));
  roads.push(road([[-190, -176], [-190, -520]], 8));
  roads.push(road([[-660, -175], [-610, -150], [-520, -120]], 8));

  // level crossings: setts decking between the rails and white gates along the road edges
  const segX = (a, b, c, d) => {
    const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * q[1] - r[1] * q[0];
    if (Math.abs(den) < 1e-6) return null;
    const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
  };
  const crossings = [];
  roads.forEach((rp, ri) => {
    const w = roadW[ri];
    for (const t of tracks) {
      if (t.bed !== 'ballast') continue;
      for (let i = 1; i < rp.pts.length; i++) for (let k = 1; k < t.path.pts.length; k++) {
        const X = segX(rp.pts[i - 1], rp.pts[i], t.path.pts[k - 1], t.path.pts[k]);
        if (!X) continue;
        const a = rp.pts[i - 1], b = rp.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const rx = (b[0] - a[0]) / L, rz = (b[1] - a[1]) / L;
        const ta = t.path.pts[k - 1], tb = t.path.pts[k], TL = Math.hypot(tb[0] - ta[0], tb[1] - ta[1]);
        const tx = (tb[0] - ta[0]) / TL, tz = (tb[1] - ta[1]) / TL;
        // decking: parallelogram spanning the road width along the track
        const sinA = Math.abs(rx * tz - rz * tx) || 1, half = (w / 2) / sinA;
        const P = (along, off) => [X[0] + tx * along + tz * off, Q + 0.31, X[1] + tz * along - tx * off];
        fb.poly('roadSetts', [P(-half, -0.66), P(half, -0.66), P(half, 0.66), P(-half, 0.66)], [0, 1, 0]);
        for (const off of [-1.6, 1.6]) fb.poly('roadSetts', [P(-half, off * 0.49), P(half, off * 0.49), P(half, off), P(-half, off)], [0, 1, 0]);
        crossings.push({ X, rx, rz, w, ri });
      }
    }
  });
  const gated = new Set();
  stats.crossings = crossings.slice(0, 40).map((c) => site.d2w(c.X[0], c.X[1]).map(Math.round));
  for (const c of crossings) {
    const key = c.ri + ':' + Math.round(c.X[0] / 25) + ',' + Math.round(c.X[1] / 25);
    if (gated.has(key)) continue;
    gated.add(key);
    const nx = -c.rz, nz = c.rx, ang = Math.atan2(-c.rz, c.rx);
    for (const sd of [-1, 1]) {
      const cx = c.X[0] + nx * sd * (c.w / 2 + 0.4), cz = c.X[1] + nz * sd * (c.w / 2 + 0.4);
      for (const e of [-1, 1]) {
        const px = cx + c.rx * e * 5.2, pz = cz + c.rz * e * 5.2;
        fb.cbox('white', px, Q + 0.8, pz, 0.35, 1.6, 0.35, 0, ang, 0, true);
        fb.cbox('white', cx + c.rx * e * 2.55, Q + 1.1, cz + c.rz * e * 2.55, 4.9, 0.12, 0.1, 0, ang, 0);
        fb.cbox('white', cx + c.rx * e * 2.55, Q + 0.6, cz + c.rz * e * 2.55, 4.9, 0.1, 0.08, 0, ang, 0);
        fb.cbox('signalRed', cx + c.rx * e * 2.2, Q + 0.85, cz + c.rz * e * 2.2, 0.6, 0.6, 0.04, 0, ang, Math.PI / 4);
      }
    }
    if (gated.size % 2) hut(fb, c.X[0] + nx * (c.w / 2 + 5) + c.rx * 9, c.X[1] + nz * (c.w / 2 + 5) + c.rz * 9, 2.6, 2.2, ang, { wall: 'white', roof: 'slateDark' });
  }

  // ================================================================ boundary wall & gates (Canute Road)
  const gates = [[-608, 24], [-664, -176]];
  const wallPts = site.townSegs.map(([a]) => a).concat([site.townSegs[site.townSegs.length - 1][1]]);
  boundaryWall(fb, wallPts, 2.6, (x, z) => gates.some(([gx, gz]) => Math.hypot(x - gx, z - gz) < 16) || site.nearLandmark(x, z, 72));
  for (const [gx, gz] of gates) {
    for (const s of [-1, 1]) {
      fb.gbox('stone', gx - 1, Q, gz + s * 13 - 1, 2, 4.2, 2);
      fb.add('stone', new THREE.ConeGeometry(1.2, 1.2, 4), M4(gx, Q + 4.8, gz + s * 13, 0, Math.PI / 4, 0));
      fb.gbox('castIron', gx - 0.15, Q, gz + s * 12 - 0.15, 0.3, 2.8, 0.3); // hinge post
      // open iron gate leaves swung back
      fb.cbox('castIron', gx + 3, Q + 1.4, gz + s * 12 - s * 0.2, 6, 2.2, 0.06, 0, s * 1.3, 0);
    }
    hut(fb, gx + 14, gz + 18, 4, 3, 0, { wall: 'brickRed', roof: 'slateDark' });
    // weighbridge plate & office
    fb.box('castIron', gx + 26, Q - 0.01, gz - 3, 8, 0.06, 3.2);
    hut(fb, gx + 30, gz - 8, 3.2, 2.6, 0, { wall: 'timberDark', roof: 'roof' });
  }

  // H&W yard: plate racks, boilers awaiting refit, propeller blades, timber
  for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
    const x = -372 + i * 13, z = 352 + row * 16;
    if (site.rectFree(AX, x, x + 10, z, z + 5) < 1) continue;
    const n = 3 + Math.floor(rnd() * 8);
    for (let k = 0; k < n; k++) fb.box('steelPlate', x + rnd() * 0.3, Q + k * 0.1, z + rnd() * 0.3, 9.5, 0.08, 3.6 + rnd() * 1.2);
    fb.gbox('timberDark', x + 1, Q - 0.02, z - 0.3, 0.3, 0.12, 5); fb.gbox('timberDark', x + 8, Q - 0.02, z - 0.3, 0.3, 0.12, 5);
    site.mark(AX, x - 1, x + 11, z - 1, z + 6, 5);
  }
  for (let i = 0; i < 5; i++) {
    const x = -330 + i * 15, z = 262 + (i % 2) * 3;
    if (site.rectFree(AX, x - 4, x + 4, z - 3, z + 3) < 1) continue;
    const L = 5 + rnd() * 2.5, r = 1.8 + rnd() * 0.5;
    fb.cyl('black', x, Q + r + 0.5, z, r, r, L, 16, 0, 0, Math.PI / 2);
    fb.cyl('steelRaw', x - L / 2 - 0.05, Q + r + 0.5, z, r * 0.97, r * 0.97, 0.12, 16, 0, 0, Math.PI / 2);
    fb.gbox('timberDark', x - L / 2 + 0.5, Q, z - r, 0.6, 0.7, 2 * r); fb.gbox('timberDark', x + L / 2 - 1.1, Q, z - r, 0.6, 0.7, 2 * r);
    site.mark(AX, x - 5, x + 5, z - 4, z + 4, 5);
  }
  for (let i = 0; i < 6; i++) {
    const x = -300 + i * 12, z = 300;
    if (site.rectFree(AX, x - 5, x + 5, z - 2, z + 2) < 1) continue;
    timberStack(fb, rnd, x, z, 9, 2.6, 0.9 + rnd() * 1.2, 0);
    site.mark(AX, x - 5, x + 5, z - 2, z + 2, 5);
  }

  // ================================================================ cargo, coal, carts, lamps (fill)
  const zoneHW = (x, z) => x < -300 && z > 60;
  const nearKind = (x, z, v, r) => {
    for (let dz = -r; dz <= r; dz += 4) for (let dx = -r; dx <= r; dx += 4) {
      const k = site.cellOf(x + dx, z + dz);
      if (k >= 0 && site.occ[k] === v) return true;
    }
    return false;
  };
  const blockFree = (x, z, w, d) => site.rectFree(AX, x, x + w, z, z + d) >= 1;
  const B = 12;
  const GG = site.G;
  for (let z = GG.z0 + 4; z < GG.z0 + GG.nz * GG.cell - B; z += B) {
    for (let x = GG.x0 + 4; x < GG.x0 + GG.nx * GG.cell - B; x += B) {
      const bx = x + rnd() * 2, bz = z + rnd() * 2;
      if (!blockFree(bx, bz, B - 2, B - 2)) continue;
      const r = rnd();
      const cx = bx + (B - 2) / 2, cz = bz + (B - 2) / 2;
      if (zoneHW(cx, cz)) continue;
      const nearShed = nearKind(cx, cz, 4, 14);
      const nearRail = nearKind(cx, cz, 3, 10);
      if (nearShed && r < 0.4) {
        const kind = pick(['crates', 'crates', 'barrels', 'bales', 'sacks', 'timber']);
        if (kind === 'timber') timberStack(fb, rnd, cx, cz, 7 + rnd() * 2, 2.4, 0.9 + rnd() * 1.4, rnd() < 0.5 ? 0 : Math.PI / 2);
        else cargoStack(inst, rnd, AX, bx + 1.5, bx + B - 3 - rnd() * 3, bz + 1.5, bz + B - 3 - rnd() * 3, kind, site.toDock);
        site.mark(AX, bx, bx + B, bz, bz + B, 5); stats.stacks++;
        site.stampDisc('wear', cx, cz, 11, 0.8);
      } else if (nearShed && r < 0.5) {
        inst.at(rnd() < 0.7 ? 'dray' : 'handcart', cx, Q, cz, Math.round(rnd() * 4) * Math.PI / 2 + (rnd() - 0.5) * 0.3);
        site.mark(AX, cx - 3, cx + 3, cz - 3, cz + 3, 5);
        site.stampDisc('wear', cx, cz, 9, 0.7);
      } else if (nearRail && r < 0.14) {
        // permanent-way materials: stacked sleepers and rails, a platelayers' barrow
        const ang = Math.round(rnd()) * Math.PI / 2;
        fb.pushFrame(cx, cz, ang);
        for (let k = 0; k < 3 + Math.floor(rnd() * 4); k++) fb.box(k % 2 ? 'sleeper' : 'timberDark', -1.3, Q + k * 0.14, -2.2 + (k % 2) * 0.1, 2.6, 0.13, 4.4);
        for (let k = 0; k < 6; k++) fb.box('rail', -5, Q + 0.02, 3 + k * 0.25, 9, 0.13, 0.12);
        fb.pop();
        site.mark(AX, bx, bx + B, bz, bz + B, 5);
        site.stampDisc('wear', cx, cz, 8, 0.6);
      } else if (!nearRail && r < 0.1) {
        // loose clutter: a few crates, a barrel group, a handcart
        cargoStack(inst, rnd, AX, bx + 2, bx + 6 + rnd() * 3, bz + 2, bz + 5 + rnd() * 2, pick(['crates', 'barrels', 'sacks']), site.toDock);
        if (rnd() < 0.5) inst.at('handcart', bx + 8, Q, bz + 7, rnd() * 6.28);
        site.mark(AX, bx, bx + B, bz, bz + B, 5);
        site.stampDisc('wear', cx, cz, 10, 0.6);
        stats.stacks++;
      } else if (nearRail && !nearShed && r < 0.06) {
        coalHeap(fb, cx, cz, 9 + rnd() * 3, 5 + rnd() * 3, 1.4 + rnd() * 1.2, Math.round(rnd()) * Math.PI / 2, rnd);
        site.stampDisc('coal', cx, cz, 13, 0.9);
        site.mark(AX, bx, bx + B, bz, bz + B, 5); stats.stacks++;
      }
    }
  }
  // strike coal stacked in long ridges beside the dock-head sidings and at the Test Quay shed gaps
  const coalRidge = (fr, s0, s1, off, w, h) => {
    const [x, z] = EP(fr, (s0 + s1) / 2, off);
    const [xa, za] = EP(fr, s0, off), [xb, zb] = EP(fr, s1, off);
    const L = s1 - s0;
    if (site.rectFree(fr, s0, s1, -off - w / 2, -off + w / 2, [0, 2, 5]) < 0.9) return;
    coalHeap(fb, x, z, L, w, h, Math.atan2(-(zb - za), xb - xa), rnd);
    site.stamp('coal', fr, s0 - 6, s1 + 6, -off - w / 2 - 7, -off + w / 2 + 7, 0.85);
    site.mark(fr, s0, s1, -off - w / 2, -off + w / 2, 5);
    stats.stacks++;
  };
  for (let sx = 150; sx < 560; sx += 70 + rnd() * 20) coalRidge(E.TQ, sx, sx + 48 + rnd() * 16, 117, 11 + rnd() * 3, 3.2 + rnd() * 1.2);
  for (let sx = 90; sx < 400; sx += 60 + rnd() * 20) coalRidge(E.IS1, sx, sx + 40 + rnd() * 12, 88, 10, 3 + rnd());
  for (let sx = 260; sx < 520; sx += 55 + rnd() * 15) coalRidge(E.TQ, sx, sx + 38, 205, 12, 3.5 + rnd());
  coalRidge(E.TQ, 205, 216, 30, 8, 2.4); coalRidge(E.TQ, 417, 428, 30, 8, 2.6);
  // cinder ground under the sidings
  site.stamp('gravel', E.TQ, 110, 610, -110, -74, 1);
  site.stamp('gravel', E.IS1, 60, 400, -76, -50, 1);

  // cargo on the aprons in the gaps between sheds (clear of the crane tracks at 3–10 m)
  for (const s of sheds) {
    for (const s2 of sheds) {
      if (s2 === s || s2.en !== s.en || s2.a < s.b || s2.a - s.b > 40) continue;
      const g0 = s.b + 3, g1 = s2.a - 3;
      cargoStack(inst, rnd, s.fr, g0, g1, s.zW - s.D + 4, s.zW - 4, pick(['crates', 'barrels', 'bales']), site.toDock);
    }
  }

  // motor lorries and taxis at the berth-38 passenger shed
  if (b38) {
    for (let i = 0; i < 7; i++) {
      const [x, z] = EP(b38.fr, b38.a + 20 + i * 26 + rnd() * 6, -b38.zW + b38.D + 3.2);
      inst.at(i % 3 === 0 ? 'lorry' : 'taxi', x, Q + 0.02, z, b38.fr.ang + (rnd() < 0.5 ? 0 : Math.PI));
    }
  }
  for (const [x, z, a] of [[-590, 60, 0.2], [-585, 72, 0.3], [-540, 30, 1.7], [-470, -150, 0.1], [140, -168, 0]]) inst.at(rnd() < 0.5 ? 'lorry' : 'dray', x, Q + 0.02, z, a);

  // gas lamps along roads and shed platforms
  const lamp = (x, z) => {
    const k = site.cellOf(x, z);
    if (k < 0 || site.base[k] === 2) return;
    if (site.occ[k] === 3 || site.occ[k] === 4) return;
    inst.at('lamp', x, Q, z, 0);
  };
  for (const p of roads) for (let t = 10; t < p.len; t += 42) { const s = sampleAt(p, t); lamp(s.x + s.tz * 5, s.z - s.tx * 5); }
  for (const s of sheds) for (let x = s.a + 6; x < s.b; x += 36) { const [px, pz] = EP(s.fr, x, -s.zW + s.D + 1.6); lamp(px, pz); }

  // huts, bothies and stores scattered by the lines
  for (let i = 0; i < 40; i++) {
    const t = tracks[Math.floor(rnd() * tracks.length)];
    if (!t || t.bed === 'rails') continue;
    const p = sampleAt(t.path, rnd() * t.path.len);
    const x = p.x + p.tz * 6.5, z = p.z - p.tx * 6.5;
    if (site.rectFree(AX, x - 3, x + 3, z - 3, z + 3) < 1) continue;
    hut(fb, x, z, 2.8 + rnd() * 2, 2.2 + rnd(), Math.atan2(-p.tz, p.tx), { wall: pick(['timberDark', 'cladBlack', 'brickRed']), roof: pick(['roof', 'slateDark']) });
    site.mark(AX, x - 4, x + 4, z - 4, z + 4, 5);
  }

  // ================================================================ small craft in the docks
  const inWater = (x, z, ang, L, W, margin = 3) => {
    if (site.nearLandmark(x, z, 110)) return false; // keep masts out of the hotel / terminus street views
    const c = Math.cos(ang), sn = Math.sin(ang);
    for (const u of [-1, -0.5, 0, 0.5, 1]) for (const v of [-1, 0, 1]) {
      const lx = u * (L / 2 + margin), lz = v * (W / 2 + margin);
      const px = x + lx * c + lz * sn, pz = z - lx * sn + lz * c;
      if (!waterAt(px, pz)) return false;
    }
    return true;
  };
  const moor = (en, s0, s1, types, abreastMax = 2, gap = 4) => {
    const fr = E[en];
    let s = s0;
    while (s < Math.min(s1, fr.len - 15)) {
      const t = pick(types);
      const L = t === 'sailingBarge' ? 26 : t === 'steamLighter' ? 24 : 22, W = t === 'sailingBarge' ? 6.2 : 6.5;
      const n = 1 + Math.floor(rnd() * abreastMax);
      for (let k = 0; k < n; k++) {
        const tt = k === 0 ? t : pick(types.filter((q) => q !== 'sailingBarge'));
        const off = 1.4 + W / 2 + k * (W + 0.5);
        const [x, z] = EP(fr, s + L / 2 + (rnd() - 0.5) * 3, -off);
        const yaw = fr.ang + (rnd() < 0.5 ? 0 : Math.PI) + (rnd() - 0.5) * 0.04;
        if (!inWater(x, z, yaw, L, W)) break;
        inst.at(tt, x, -0.1, z, yaw);
        stats.boats++;
      }
      s += L + gap + rnd() * 30;
    }
  };
  const lighters = ['lighter', 'lighter', 'lighterCoal', 'lighterSheeted', 'steamLighter'];
  moor('EW', 20, 230, lighters, 3, 8);
  moor('EN', 10, 250, lighters, 2, 20);
  moor('ES', 60, 330, ['lighter', 'lighterSheeted', 'sailingBarge'], 2, 30);
  moor('EE', 40, 200, ['sailingBarge', 'lighter'], 1, 40);
  moor('OS', 20, 290, ['sailingBarge', 'sailingBarge', 'lighter', 'steamLighter'], 2, 10);
  moor('OW', 10, 140, ['lighter', 'lighterCoal', 'sailingBarge'], 2, 6);
  moor('IN1', 10, 210, ['lighter', 'lighterSheeted', 'sailingBarge'], 2, 12);
  moor('IN3', 20, 240, ['lighter', 'lighterCoal', 'steamLighter'], 2, 16);
  moor('IN0', 20, 180, ['sailingBarge', 'lighter'], 1, 30);
  // floating sheerlegs in Empress Dock
  {
    const [x, z] = EP(E.EW, 150, -45);
    if (inWater(x, z, E.EW.ang + 0.4, 50, 18)) floatingCrane(fb, x, z, E.EW.ang + 0.4);
  }

  stats.trackKm = +stats.trackKm.toFixed(1);
  return stats;
}
