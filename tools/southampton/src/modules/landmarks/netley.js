import * as THREE from 'three';
import { frustum, extrudeProfile, roundArch } from './kit.js';
import { groundRange, chimney, windowRow } from './common.js';
import { pierDeck, lamp } from './piers.js';

// Royal Victoria Military Hospital, Netley (1856–63, E. O. Mennie). 435 m long red-brick
// range with Portland stone dressings facing Southampton Water, central chapel block with
// the domed tower, ward wings behind, and the hospital pier in front.
// Kit frame: origin at the chapel on the front building line, +x toward the NW end,
// -z toward the water (SW).

export function netley(ctx, kit) {
  const Lm = ctx.layout.LANDMARKS;
  const [ax, az] = Lm.netleyNW, [bx, bz] = Lm.netleySE;
  const ux = (ax - bx), uz = (az - bz), len = Math.hypot(ux, uz);
  const yaw = Math.atan2(-uz, ux); // +x toward NW
  // front face: which side is the water?
  const [cx, cz] = Lm.netleyChapel;
  const k0 = kit.sub(cx, 0, cz, yaw);
  const test = k0.toWorld(0, 0, -200);
  if (ctx.terrain.sample(test[0], test[2]).s > ctx.terrain.sample(...(() => { const p = k0.toWorld(0, 0, 200); return [p[0], p[2]]; })()).s) {
    console.warn('[landmarks] Netley orientation: water not on -z');
  }
  const HALF = len / 2;
  const [lo, hi] = groundRange(ctx, k0, -HALF, HALF, 0, 14, 8);
  const [clo] = groundRange(ctx, k0, -30, 30, -8, 60, 4);
  const g = ctx.terrain.heightAt(cx, cz) + 0.6;
  const k = k0.sub(0, g, 0);
  const B = lo - g - 2.5;
  const out = [];

  const S = [0, 4.6, 9.0, 13.2]; // storey floor levels
  const EAVE = 17.0;
  const DEPTH = 14;

  // basement plinth under the whole front range (terrain falls to the water)
  k.box('stoneDark', -HALF - 0.4, B, -0.4, len + 0.8, -B + 0.9, DEPTH + 0.8);

  // long ranges between pavilions
  const pavs = [
    { x: HALF - 11, w: 22, p: 4.0, h: EAVE + 4.2 }, { x: -HALF + 11, w: 22, p: 4.0, h: EAVE + 4.2 },
    { x: 150, w: 14, p: 2.0, h: EAVE + 1.5 }, { x: -150, w: 14, p: 2.0, h: EAVE + 1.5 },
    { x: 82, w: 14, p: 2.0, h: EAVE + 1.5 }, { x: -82, w: 14, p: 2.0, h: EAVE + 1.5 },
  ];
  k.box('netleyBrick', -HALF, 0, 0, len, EAVE, DEPTH);
  k.box('stone', -HALF - 0.25, 0.6, -0.25, len + 0.5, 0.35, DEPTH + 0.5); // plinth course
  for (const y of [S[1] - 0.2, S[2] - 0.2]) k.box('stone', -HALF - 0.12, y, -0.12, len + 0.24, 0.3, DEPTH + 0.24);
  k.box('stone', -HALF - 0.6, EAVE - 0.3, -0.6, len + 1.2, 0.75, DEPTH + 1.2); // cornice
  k.box('stone', -HALF - 0.3, EAVE + 0.45, -0.3, len + 0.6, 0.8, DEPTH + 0.6); // parapet
  // roof: long hipped slate roof behind parapet
  k.fr('slate', 0, EAVE + 0.4, DEPTH / 2, len - 1, DEPTH - 1, 4.6, len - DEPTH, 0);
  // front & rear windows (skip where pavilions or the centre block stand)
  const blocked = (x) => Math.abs(x) < 26 || pavs.some((p) => Math.abs(x - p.x) < p.w / 2 + 0.8);
  const bay = 3.6;
  const nb = Math.floor(len / bay);
  for (const [zf, ry] of [[0, 0], [DEPTH, Math.PI]]) {
    const fk = k.sub(0, 0, zf, ry);
    for (let i = 0; i < nb; i++) {
      const x = -HALF + bay * (i + 0.5) + (len - nb * bay) / 2;
      if (blocked(ry ? -x : x)) continue;
      for (let s = 0; s < 3; s++) {
        const y = S[s] + 1.2, h = s === 0 ? 2.4 : 2.6;
        fk.cbox('glass', x, y + h / 2, -0.02, 1.25, h, 0.1);
        fk.cbox('stone', x, y - 0.08, -0.1, 1.6, 0.16, 0.24);
        fk.cbox('stone', x, y + h + 0.2, -0.08, 1.7, 0.4, 0.18);
      }
    }
  }
  // chimney stacks & roof ventilators along the ridge
  for (let x = -HALF + 20; x < HALF - 15; x += 18) {
    if (Math.abs(x) < 30) continue;
    chimney(k, 'netleyBrick', x, EAVE + 2.0, DEPTH / 2 + 2.6, 1.0, 2.6, 4.8, 3, 'brickDark');
  }
  for (let x = -HALF + 29; x < HALF - 20; x += 36) {
    if (Math.abs(x) < 30) continue;
    k.box('timberDark', x - 1, EAVE + 4.8, DEPTH / 2 - 1, 2, 1.4, 2);
    k.fr('lead', x, EAVE + 6.2, DEPTH / 2, 2.8, 2.8, 1.2);
  }
  // pavilions
  for (const p of pavs) {
    const x0 = p.x - p.w / 2;
    k.box('stoneDark', x0 - 0.4, B, -p.p - 0.4, p.w + 0.8, -B + 0.9, DEPTH + p.p + 0.8);
    k.box('netleyBrick', x0, 0, -p.p, p.w, p.h, DEPTH + p.p);
    for (const [qx, qz] of [[x0, -p.p], [x0 + p.w, -p.p]]) k.cbox('stone', qx, p.h / 2, qz, 0.9, p.h, 0.9);
    k.box('stone', x0 - 0.6, p.h - 0.3, -p.p - 0.6, p.w + 1.2, 0.8, DEPTH + p.p + 1.2);
    k.box('stone', x0 - 0.15, S[1] - 0.2, -p.p - 0.15, p.w + 0.3, 0.3, DEPTH + p.p + 0.3);
    k.fr('slate', p.x, p.h + 0.5, (DEPTH - p.p) / 2, p.w + 0.6, DEPTH + p.p + 0.6, p.w > 16 ? 6.0 : 4.0, p.w > 16 ? 3 : 0.4, p.w > 16 ? 3 : DEPTH * 0.6);
    const fk = k.sub(p.x, 0, -p.p, 0);
    const n = Math.round(p.w / 3.8);
    for (let s = 0; s < 3; s++) windowRow(fk, { x0: -p.w / 2 + 1, x1: p.w / 2 - 1, n, y: S[s] + 1.2, ww: 1.3, wh: 2.6, dress: 'stone', arch: s === 0 ? 'round' : null, depth: 0.1 });
    if (p.h > EAVE + 3) windowRow(fk, { x0: -p.w / 2 + 1, x1: p.w / 2 - 1, n, y: EAVE + 0.9, ww: 1.2, wh: 1.8, dress: 'stone', depth: 0.1 });
    for (const sgn of [-1, 1]) {
      const sk = k.sub(p.x + sgn * p.w / 2, 0, DEPTH / 2 - p.p / 2 - 3, -sgn * Math.PI / 2);
      for (let s = 0; s < 3; s++) windowRow(sk, { x0: -2.5, x1: 2.5, n: 1, y: S[s] + 1.2, ww: 1.3, wh: 2.6, dress: 'stone', depth: 0.1 });
    }
  }
  // ward wings running back from the corridor range
  const wings = [-196, -168, -120, -100, -52, 52, 100, 120, 168, 196];
  for (const wx of wings) {
    const WL = 38, WW = 12;
    const [wlo, whi] = groundRange(ctx, k0, wx - 6, wx + 6, DEPTH, DEPTH + WL, 2);
    const wg = Math.max(whi - g, 0);
    k.box('stoneDark', wx - WW / 2 - 0.3, wlo - g - 2, DEPTH - 1, WW + 0.6, wg - (wlo - g - 2) + 0.9, WL + 1.3);
    k.box('netleyBrick', wx - WW / 2, wg, DEPTH - 1, WW, EAVE - 1.5, WL + 1);
    k.box('stone', wx - WW / 2 - 0.4, wg + EAVE - 1.8, DEPTH - 1, WW + 0.8, 0.6, WL + 1.4);
    k.fr('slate', wx, wg + EAVE - 1.2, DEPTH + WL / 2, WW + 0.6, WL + 1.2, 4.2, 0.2, WL - WW);
    for (const sgn of [-1, 1]) {
      const sk = k.sub(wx + sgn * WW / 2, wg, DEPTH + WL / 2, -sgn * Math.PI / 2);
      for (let s = 0; s < 3; s++) windowRow(sk, { x0: -WL / 2 + 1, x1: WL / 2 - 1, n: 8, y: S[s] + 1.3, ww: 1.3, wh: 2.6, dress: 'stone', depth: 0.1, hood: false });
    }
    chimney(k, 'netleyBrick', wx, wg + EAVE + 1.0, DEPTH + WL - 4, 2.2, 1.0, 4.0, 3, 'brickDark');
    chimney(k, 'netleyBrick', wx, wg + EAVE + 1.0, DEPTH + 14, 2.2, 1.0, 4.0, 3, 'brickDark');
  }

  // centre block: projecting, four storeys, Portland stone portico
  const CW = 52, CP = 7, CH = 22.5;
  k.box('stoneDark', -CW / 2 - 0.4, B, -CP - 0.4, CW + 0.8, -B + 0.9, DEPTH + CP + 0.8);
  k.box('netleyBrick', -CW / 2, 0, -CP, CW, CH, DEPTH + CP);
  k.box('stone', -CW / 2 - 0.2, 0, -CP - 0.2, CW + 0.4, S[1], DEPTH + CP + 0.4);
  k.box('stone', -CW / 2 - 0.7, CH - 0.4, -CP - 0.7, CW + 1.4, 0.9, DEPTH + CP + 1.4);
  k.box('stone', -CW / 2 - 0.3, CH + 0.5, -CP - 0.3, CW + 0.6, 1.0, DEPTH + CP + 0.6);
  for (const qx of [-CW / 2, CW / 2, -12, 12]) k.cbox('stone', qx, CH / 2, -CP, 1.0, CH, 1.0);
  k.fr('slate', 0, CH + 0.5, (DEPTH - CP) / 2, CW + 0.4, DEPTH + CP + 0.4, 5.0, CW - DEPTH - CP, 0);
  const ck = k.sub(0, 0, -CP, 0);
  for (let s = 0; s < 4; s++) {
    const y = s === 0 ? 1.3 : S[1] + 1.3 + (s - 1) * 4.6;
    for (const [a, b2, n] of [[-CW / 2 + 1, -13, 3], [13, CW / 2 - 1, 3]]) windowRow(ck, { x0: a, x1: b2, n, y, ww: 1.4, wh: s === 3 ? 2.0 : 2.7, dress: 'stone', arch: s === 0 ? 'round' : null, depth: 0.1 });
  }
  // portico: arcade of 5 arches with balcony over
  const arch = extrudeProfile(roundArch(2.4, 2.8, 8), 0.4);
  ck.box('stone', -11, 0, -5, 22, 6.2, 5);
  for (let i = 0; i < 5; i++) ck.geo('glass', arch, -8.8 + i * 4.4, 0.3, -5.1);
  ck.box('stone', -11.5, 6.2, -5.5, 23, 0.5, 5.8);
  for (let i = 0; i <= 11; i++) ck.cbox('stone', -11 + i * 2, 7.1, -5.2, 0.35, 1.2, 0.35);
  ck.box('stone', -11.5, 7.7, -5.5, 23, 0.25, 0.6);

  // chapel behind the centre block
  const [chlo] = groundRange(ctx, k0, -10, 10, DEPTH, DEPTH + 42, 3);
  k.box('stoneDark', -10.3, chlo - g - 2, DEPTH, 20.6, -(chlo - g - 2) + 0.8, 42.3);
  k.box('netleyBrick', -10, 0, DEPTH, 20, 15, 42);
  k.fr('slate', 0, 15, DEPTH + 21, 42.6, 21, 7.5, 42.6, 0, Math.PI / 2);
  for (const sgn of [-1, 1]) {
    const sk = k.sub(sgn * 10, 0, DEPTH + 21, -sgn * Math.PI / 2);
    const lg = extrudeProfile(roundArch(1.8, 6.5, 8), 0.3);
    for (let i = 0; i < 6; i++) sk.geo('glass', lg, -17.5 + i * 7, 5.0, -0.1);
    for (let i = 0; i <= 6; i++) sk.cbox('stone', -21 + i * 7, 7, -0.4, 1.0, 14, 0.8);
  }
  k.sub(0, 0, DEPTH + 42, Math.PI).geo('glass', extrudeProfile(roundArch(4.0, 7.0, 10), 0.3), 0, 4, -0.1);

  // the tower: square brick shaft with stone quoins, arcaded belfry, lead dome and lantern
  const TW = 10, TZ = -CP - 1.5;
  const tk = k.sub(0, 0, TZ + TW / 2 - 2, 0);
  const shaftTop = 32;
  tk.box('netleyBrick', -TW / 2, CH, -TW / 2, TW, shaftTop - CH, TW);
  for (const [qx, qz] of [[-TW / 2, -TW / 2], [TW / 2, -TW / 2], [-TW / 2, TW / 2], [TW / 2, TW / 2]]) tk.cbox('stone', qx, (CH + shaftTop) / 2 + 2, qz, 1.1, shaftTop - CH + 4, 1.1);
  tk.box('stone', -TW / 2 - 0.5, shaftTop, -TW / 2 - 0.5, TW + 1, 0.9, TW + 1);
  for (const f of tk.faces(0, 0, TW, TW)) {
    f.k.cyl('white', 0, 27.4, -0.08, 1.35, 1.35, 0.14, 16, Math.PI / 2, 0, 0); // clock face
    f.k.cyl('stone', 0, 27.4, -0.02, 1.7, 1.7, 0.14, 16, Math.PI / 2, 0, 0);
    f.k.geo('glass', extrudeProfile(roundArch(1.2, 2.4, 6), 0.3), 0, CH + 1.2, -0.1);
  }
  // belfry stage: octagonal-ish with arched openings
  const BY = shaftTop + 0.9, BH = 7.5, BR = 4.2;
  tk.cyl('stone', 0, BY + BH / 2, 0, BR, BR, BH, 8, 0, Math.PI / 8, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const ok = tk.sub(Math.cos(a) * BR * 0.925, BY, Math.sin(a) * BR * 0.925, -a - Math.PI / 2);
    ok.geo('glass', extrudeProfile(roundArch(1.6, 3.8, 6), 0.3), 0, 1.3, -0.05);
  }
  tk.cyl('stone', 0, BY + BH + 0.35, 0, BR + 0.5, BR + 0.5, 0.7, 8, 0, Math.PI / 8, 0);
  // corner urns/pinnacles on the shaft top
  for (const [qx, qz] of [[-TW / 2, -TW / 2], [TW / 2, -TW / 2], [-TW / 2, TW / 2], [TW / 2, TW / 2]]) {
    tk.cyl('stone', qx, BY + 1.2, qz, 0.35, 0.55, 2.4, 6);
  }
  const domeG = new THREE.SphereGeometry(BR + 0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const DY = BY + BH + 0.7;
  tk.geo('lead', domeG, 0, DY, 0, 0, 0, 0, 1, 1.25, 1);
  const LY = DY + (BR + 0.2) * 1.2;
  tk.cyl('stone', 0, LY + 1.5, 0, 1.2, 1.2, 3.0, 8);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; tk.cbox('glass', Math.cos(a) * 1.15, LY + 1.5, Math.sin(a) * 1.15, 0.4, 1.8, 0.1, 0, -a + Math.PI / 2, 0); }
  const cup = new THREE.SphereGeometry(1.45, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  tk.geo('lead', cup, 0, LY + 3.0, 0, 0, 0, 0, 1, 1.3, 1);
  tk.cyl('castIron', 0, LY + 5.6, 0, 0.06, 0.12, 2.6, 6);
  tk.cyl('castIron', 0, LY + 6.3, 0, 0.3, 0.3, 0.1, 8);

  // terrace in front and the hospital pier
  const [tlo] = groundRange(ctx, k0, -HALF, HALF, -14, -1, 8);
  k.box('gravel', -HALF - 4, tlo - g - 1.5, -16, len + 8, -(tlo - g - 1.5) + 0.6, 16);
  for (let x = -HALF + 10; x < HALF; x += 40) lamp(k, x, 0.6, -15.4, 3.2);
  out.push({ name: 'Royal Victoria Hospital', pts: [k0.toWorld(-HALF - 5, 0, -17), k0.toWorld(HALF + 5, 0, -17), k0.toWorld(HALF + 5, 0, DEPTH + 58), k0.toWorld(-HALF - 5, 0, DEPTH + 58)] });

  // pier: find the shoreline straight out from the chapel
  let sx = -20;
  for (let d = 20; d < 500; d += 4) {
    const p = k0.toWorld(0, 0, -d);
    if (ctx.terrain.heightAt(p[0], p[2]) < 1.6) { sx = -d; break; }
  }
  const pk = k0.sub(0, 0, sx + 12, Math.PI / 2); // +x toward the water
  const shore = k0.toWorld(0, 0, sx + 12);
  const sg = Math.max(ctx.terrain.heightAt(shore[0], shore[2]), 0.5);
  const PL = 170, PD = 5.6;
  pk.box('coping', -16, sg - 3, -4, 18, PD - 0.3 - sg + 3, 8);
  pierDeck(ctx, pk, { x0: 2, x1: PL, width: 5.2, deckY: PD, step: 10, piles: [-2.2, 0, 2.2], lampStep: 40 });
  pierDeck(ctx, pk.sub(PL + 7, 0, 0, 0), { x0: -7, x1: 7, width: 30, deckY: PD, step: 7, piles: [-13, -6.5, 0, 6.5, 13], lampStep: 0 });
  pk.box('white', PL + 2, PD, -3, 7, 3.0, 6);
  pk.fr('slate', PL + 5.5, PD + 3.0, 0, 7.6, 6.6, 1.6, 7.6, 0);
  // gravel path from the terrace down to the pier, following the slope
  for (let z = -14; z > sx + 6; z -= 3) {
    const p0 = k0.toWorld(0, 0, z), p1 = k0.toWorld(0, 0, z - 3);
    const h0 = ctx.terrain.heightAt(p0[0], p0[2]), h1 = ctx.terrain.heightAt(p1[0], p1[2]);
    const ang = Math.atan2(h0 - h1, 3);
    k0.cbox('gravel', 0, (h0 + h1) / 2 + 0.05, z - 1.5, 3.6, 0.4, 3.3 / Math.cos(ang), -ang, 0, 0);
  }
  out.push({ name: 'Netley Hospital Pier', pts: [k0.toWorld(-15, 0, sx - PL - 20), k0.toWorld(15, 0, sx - PL - 20), k0.toWorld(15, 0, -16), k0.toWorld(-15, 0, -16)] });
  return out;
}
