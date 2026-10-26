import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { add, tube, rod, box, crossSection, ribbon, loft, spaced, v3, lerp } from './kit.js';
import { DECK_Y, CAP, KEEL_BAR, topsideMaterial, plateAlloy } from './hull.js';

// Cockpit and transom: toned inner liner with a rolled coaming edge and a cove at the floor, padded
// coaming bolsters over open side pockets, smooth-bordered non-slip floor panels with a flush
// underfloor hatch, flush rod holders, stern-quarter cleats and the fuel filler in the gunwales;
// the full-height transom with a hinged, latched door, the step inside it, scuppers and a live-bait
// tank; the welded pods (boarding platforms with non-slip tops either side of the engine pod), the
// fold-down ladder (stowed on the trailer or stand, down in the water) and boarding handle; the
// standard transom bait board, or the bait station option instead.
// Receives the lines, materials, build and whether the rig is twin.
// cockpit() returns the anchors later parts hang off:
//   { podTop, podHalf, zi, platY, bottomAt(z), aft }  (aft = x of the pods' aft faces)
// The pods' aft faces sit POD_BEVEL aft of `aft`, as they always have: the engine brackets bed
// into them and the underwater lights sit just proud of them.

export const POD = 0.5;         // boarding pods and engine pod, aft of the transom
const POD_BEVEL = 0.012;
const T = 0.1;                  // inner transom thickness
const NONSLIP_TILE = 0.16;      // metres per texture tile: 16 diamonds, a 10 mm pitch
const STEP_RISE = 0.12;         // transom step, then the same again to the door sill (at least)
const X0 = 0.006;               // liner and floor start just forward of the transom skin

// ---------- part materials (cached; shared so disposeTree() leaves them alone) ----------

let cache = null;

function nonslipTexture() {
  const n = 256;
  const cells = 16;
  const c = n / cells;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#9ea3a2';
  ctx.fillRect(0, 0, n, n);
  // Moulded diamond non-slip: each diamond a low pyramid, lit from one side.
  const h = c * 0.42;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const cx = (i + 0.5) * c;
      const cy = (j + 0.5) * c;
      const corners = [[cx - h, cy], [cx, cy - h], [cx + h, cy], [cx, cy + h]];
      ['#c8ccca', '#b8bcba', '#a3a8a6', '#b1b5b3'].forEach((col, f) => {
        const [a, b] = [corners[f], corners[(f + 1) % 4]];
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.lineTo(cx, cy);
        ctx.closePath();
        ctx.fill();
      });
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / NONSLIP_TILE, 1 / NONSLIP_TILE);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function parts() {
  if (cache) return cache;
  const side = THREE.DoubleSide;
  cache = {
    // Painted liner: a soft warm grey with a satin sheen, not flat white.
    liner: new THREE.MeshStandardMaterial({ color: '#c7cac5', roughness: 0.45, side }),
    shade: new THREE.MeshStandardMaterial({ color: '#767a77', roughness: 0.75, side }),
    nonslip: new THREE.MeshStandardMaterial({ color: '#d3d6d4', map: nonslipTexture(), roughness: 0.93, side }),
    bolster: new THREE.MeshStandardMaterial({ color: '#33373b', roughness: 0.5 }),
    hdpe: new THREE.MeshStandardMaterial({ color: '#efede5', roughness: 0.72 }),
    tint: new THREE.MeshStandardMaterial({ color: '#1c2a33', roughness: 0.08, metalness: 0.3 }),
    basin: new THREE.MeshStandardMaterial({ color: '#8d9295', metalness: 1, roughness: 0.32 }),
  };
  for (const mat of Object.values(cache)) mat.userData.shared = true;
  return cache;
}

// The cockpit's non-slip, for other parts that want their decks to match.
export const nonslipMaterial = () => parts().nonslip;

// ---------- geometry helpers ----------

function rbox(group, material, [sx, sy, sz], [x, y, z], r = 0.01, opts) {
  const radius = Math.min(r, Math.min(sx, sy, sz) / 2 - 1e-4);
  // Small radii read the same as a chamfer: one segment keeps the triangle count down.
  const mesh = add(group, new RoundedBoxGeometry(sx, sy, sz, radius > 0.01 ? 2 : 1, radius), material, opts);
  mesh.position.set(x, y, z);
  return mesh;
}

// Flat horizontal face at height y from an outline of [x, z] points, with optional holes.
// UVs are in metres, so the non-slip keeps its scale on every face.
function flat(outline, holes, y) {
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// Rounded rectangle outline, [x, z] points.
function rrect(cx, cz, lx, lz, r, seg = 4) {
  const pts = [];
  const ox = lx / 2 - r;
  const oz = lz / 2 - r;
  for (const [sx, sz, a0] of [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, Math.PI * 1.5]]) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push([cx + sx * ox + r * Math.cos(a), cz + sz * oz + r * Math.sin(a)]);
    }
  }
  return pts;
}

// Symmetric panel between xa and xb whose sides follow halfWidth(x), with rounded corners.
function panel(xa, xb, halfWidth, r, n = 24) {
  const pts = [];
  const arc = (cx, cz, a0, a1) => {
    for (let i = 0; i <= 4; i++) {
      const a = lerp(a0, a1, i / 4);
      pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]);
    }
  };
  const za = halfWidth(xa + r) - r;
  const zb = halfWidth(xb - r) - r;
  arc(xa + r, za, Math.PI, Math.PI / 2);
  for (const x of spaced(xa + r, xb - r, n).slice(1, -1)) pts.push([x, halfWidth(x)]);
  arc(xb - r, zb, Math.PI / 2, 0);
  arc(xb - r, -zb, 0, -Math.PI / 2);
  for (const x of spaced(xb - r, xa + r, n).slice(1, -1)) pts.push([x, -halfWidth(x)]);
  arc(xa + r, -za, -Math.PI / 2, -Math.PI);
  return pts;
}

// Straight prism along x through a [z, y] profile, from xa (aft) to xb, open at xb (it beds into
// the hull there). The aft edges are chamfered by bevel inside the profile, so the side faces
// carry the hull's own surfaces aft without a step. Returns [main, alt]: the faces of edges for
// which alt(a, b) holds (and their chamfers) go in the second geometry.
function prism(profile, xa, xb, bevel, alt = () => false) {
  let p = profile.map(([z, y]) => new THREE.Vector2(z, y));
  if (THREE.ShapeUtils.isClockWise(p)) p = p.reverse();
  const n = p.length;
  const inset = p.map((q, i) => {
    const e1 = q.clone().sub(p[(i - 1 + n) % n]).normalize();
    const e2 = p[(i + 1) % n].clone().sub(q).normalize();
    const n1 = new THREE.Vector2(-e1.y, e1.x);
    const n2 = new THREE.Vector2(-e2.y, e2.x);
    const d = bevel / (1 + n1.dot(n2));
    return q.clone().addScaledVector(n1.add(n2), d);
  });
  const main = [];
  const other = [];
  const at = (q, x) => [x, q.y, q.x];
  const quad = (pos, a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const pos = alt(p[i], p[j]) ? other : main;
    quad(pos, at(p[i], xb), at(p[j], xb), at(p[j], xa + bevel), at(p[i], xa + bevel));
    quad(pos, at(p[i], xa + bevel), at(p[j], xa + bevel), at(inset[j], xa), at(inset[i], xa));
  }
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(inset, [])) main.push(...at(inset[a], xa), ...at(inset[c], xa), ...at(inset[b], xa));
  return [main, other].map((pos) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  });
}

// Planar UVs in metres from x and z, for non-slip on ribbons.
function planarUV(g) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i);
    uv[i * 2 + 1] = -p.getZ(i);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// Rod holder tube from base along dir, with a rolled lip and a dark open end.
function holder(group, m, base, dir, len, r) {
  const top = base.clone().addScaledVector(dir, len);
  rod(group, base, top, r, m.stainless, 12);
  const lip = add(group, new THREE.TorusGeometry(r - 0.002, 0.003, 5, 14), m.stainless, { cast: false });
  lip.position.copy(top);
  lip.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
  const hole = add(group, new THREE.CircleGeometry(r - 0.004, 14), m.rubber, { cast: false });
  hole.position.copy(top).addScaledVector(dir, 0.0015);
  hole.quaternion.setFromUnitVectors(v3(0, 0, 1), dir);
}

// Stainless base plate under a tube foot, standing on a flat top at y.
function footPlate(group, m, x, y, z, r = 0.026) {
  const plate = add(group, new THREE.CylinderGeometry(r, r + 0.003, 0.006, 16), m.stainless);
  plate.position.set(x, y + 0.003, z);
}

// ---------- cockpit ----------

export function cockpit(group, lines, m, build, twin) {
  const k = parts();
  const { L, section } = lines;
  const ht = build.layout === 'ht';
  const S = (x) => section(x / L);
  const fore = ht ? 0.78 : 0.8;
  const xEnd = (fore + 0.02) * L;
  const s0 = section(0);

  // Liner: rolled edge tucked under the capping's inner lip, a flat face, and a cove into the
  // floor. Wherever the plating comes inside the liner face (forward, where the vee rises), the
  // foot steps in to stay 30 mm inside the hull; the floor edge is clipped the same way.
  const face = (s) => s.inner - 0.01;
  const insideAt = (s, z) => {
    // Lowest height at which the outside of the hull is at least 30 mm outboard of z.
    let lo = s.yk;
    let hi = s.ys;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (lines.halfWidth(s, mid) >= z + 0.03) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  const foot = (s) => {
    const f = face(s);
    const edge = Math.min(f - 0.035, lines.halfWidth(s, DECK_Y - 0.03) - 0.005);
    const yLow = Math.max(DECK_Y + 0.035, insideAt(s, f));
    return { edge, cove: [[f, yLow], [f, yLow], [lerp(f, edge, 0.29), lerp(yLow, DECK_Y, 0.71)], [edge, DECK_Y]] };
  };
  const roll = (s) => [[s.inner - 0.0035, s.ys - 0.012], [s.inner - 0.006, s.ys - 0.02], [face(s), s.ys - 0.03], [face(s), s.ys - 0.03]];

  // Coaming bolsters run aft from the hardtop or the console; the side pockets sit under them.
  const bolsterEnd = ht ? 0.38 * L - 0.05 : 0.5 * L;
  const xp0 = 0.55;
  const xp1 = Math.min(xp0 + 1.5, bolsterEnd - 0.25);
  const xs = [...new Set([...spaced(X0, xEnd, 44), xp0, xp1].map((x) => +x.toFixed(4)))].sort((a, b) => a - b).map(S);
  const range = (a, b) => xs.filter((s) => s.x >= a - 1e-4 && s.x <= b + 1e-4);
  // Pocket opening just under the bolsters, kept clear of the floor on a shallow cockpit.
  const yP1 = s0.ys - 0.23;
  const yP0 = Math.max(DECK_Y + 0.1, yP1 - 0.17);
  for (const [a, b] of [[0, xp0], [xp1, xEnd]]) add(group, ribbon(range(a, b).map((s) => ({ x: s.x, pts: [...roll(s), ...foot(s).cove] }))), k.liner);
  const pocket = range(xp0, xp1);
  add(group, ribbon(pocket.map((s) => ({ x: s.x, pts: [...roll(s), [face(s), yP1 + 0.012]] }))), k.liner);
  add(group, ribbon(pocket.map((s) => ({ x: s.x, pts: [[face(s), yP0 - 0.012], ...foot(s).cove] }))), k.liner);

  // Side pockets: rounded lips, then a real recess back to just inside the topsides.
  const back = (s) => lines.sideZ(s, yP0) - 0.014;
  add(group, ribbon(pocket.map((s) => ({ x: s.x, pts: [[face(s), yP0 - 0.012], [face(s) + 0.006, yP0 - 0.003], [face(s) + 0.014, yP0]] }))), k.liner);
  add(group, ribbon(pocket.map((s) => ({ x: s.x, pts: [[face(s) + 0.014, yP1], [face(s) + 0.006, yP1 + 0.003], [face(s), yP1 + 0.012]] }))), k.liner);
  add(group, ribbon(pocket.map((s) => ({ x: s.x, pts: [[face(s) + 0.014, yP0], [back(s), yP0], [back(s), yP0], [back(s), yP1], [back(s), yP1], [face(s) + 0.014, yP1]] }))), k.shade);
  for (const s of [pocket[0], pocket[pocket.length - 1]]) {
    const f = face(s);
    const end = [[f, yP0 - 0.012], [f + 0.014, yP0], [back(s), yP0], [back(s), yP1], [f + 0.014, yP1], [f, yP1 + 0.012]];
    for (const side of [1, -1]) add(group, crossSection(end.map(([z, y]) => [z * side, y]), s.x), k.shade, { cast: false });
  }

  // Coaming bolsters: padded vinyl in sections, on the liner face above the pockets.
  for (const side of [1, -1]) {
    const x0 = side > 0 ? T + 0.39 : T + 0.03;  // starboard clears the live-bait tank
    const count = Math.ceil((bolsterEnd - x0) / 0.85);
    const len = (bolsterEnd - x0) / count;
    for (let i = 0; i < count; i++) bolster(group, k.bolster, x0 + i * len + 0.006, x0 + (i + 1) * len - 0.006, side, S, face);
  }

  // Floor: smooth liner margins round non-slip panels, a flush underfloor hatch in the aft panel.
  const xsFloor = spaced(X0, xEnd, 48).map(S);
  const outer = [...xsFloor.map((s) => [s.x, foot(s).edge]), ...xsFloor.slice().reverse().map((s) => [s.x, -foot(s).edge])];
  const panelOutline = panel(T + 0.05, (ht ? xEnd : fore * L) - 0.06, (x) => foot(S(x)).edge - 0.05, 0.06, 40);
  const hx = 0.98;
  const hatchOuter = rrect(hx, 0, 0.58, 0.7, 0.05);
  const hatchLid = rrect(hx, 0, 0.564, 0.684, 0.042);
  const lidPanel = rrect(hx, 0, 0.5, 0.62, 0.03);
  add(group, flat(outer, [panelOutline], DECK_Y), k.liner, { cast: false });
  add(group, flat(panelOutline, [hatchOuter], DECK_Y), k.nonslip, { cast: false });
  add(group, flat(hatchOuter, [hatchLid], DECK_Y), m.rubber, { cast: false });
  add(group, flat(hatchLid, [lidPanel], DECK_Y), k.liner, { cast: false });
  add(group, flat(lidPanel, [], DECK_Y), k.nonslip, { cast: false });
  // Flush lift ring in a cup at the forward edge of the lid.
  const cup = add(group, new THREE.CircleGeometry(0.03, 18), m.rubber, { cast: false });
  cup.position.set(hx + 0.255, DECK_Y + 0.0015, 0);
  cup.rotation.x = -Math.PI / 2;
  const liftRing = add(group, new THREE.TorusGeometry(0.031, 0.004, 5, 20), m.stainless, { cast: false });
  liftRing.position.set(hx + 0.255, DECK_Y + 0.002, 0);
  liftRing.rotation.x = Math.PI / 2;

  // Foredeck and, on the centre console, the bulkhead under its forward edge.
  const foredeck = spaced(fore, 0.992, 16).map(section);
  add(group, planarUV(ribbon(foredeck.map((s) => ({ x: s.x, pts: [[0, s.ys - 0.05], [Math.max(0, s.hb - CAP * 0.5), s.ys - 0.05]] })))), k.nonslip);
  const bulk = section(fore);
  if (!ht) {
    // Bulkhead face following the liner's own section, so it never reaches past the plating.
    const half = [[face(bulk), bulk.ys - 0.05], ...foot(bulk).cove.filter((_, i) => i !== 1)];
    add(group, crossSection([...half, ...half.slice().reverse().map(([z, y]) => [-z, y])], bulk.x), k.liner);
  }

  // Gunwales: flush rod holders, stern-quarter cleats, fuel filler to starboard.
  const flangeShape = [[0.021, 0], [0.036, 0], [0.038, 0.0015], [0.034, 0.0042], [0.024, 0.0042], [0.021, 0.001]].map(([r, y]) => new THREE.Vector2(r, y));
  for (const side of [1, -1]) {
    for (const x of [0.32, 0.74, 1.16]) {
      const s = S(x);
      const flange = add(group, new THREE.LatheGeometry(flangeShape, 20), m.stainless, { cast: false });
      flange.position.set(s.x, s.ys + 0.0005, side * (s.hb - CAP / 2));
      const insert = add(group, new THREE.CircleGeometry(0.0215, 18), m.rubber, { cast: false });
      insert.position.set(s.x, s.ys + 0.0025, side * (s.hb - CAP / 2));
      insert.rotation.x = -Math.PI / 2;
    }
    cleat(group, m, S(0.19), side);
  }
  const fs = S(1.45);
  const filler = add(group, new THREE.CylinderGeometry(0.043, 0.045, 0.007, 24), m.stainless);
  filler.position.set(fs.x, fs.ys + 0.0035, fs.hb - CAP / 2);
  const fillerCap = add(group, new THREE.CylinderGeometry(0.031, 0.033, 0.006, 24), m.stainless);
  fillerCap.position.set(fs.x, fs.ys + 0.009, fs.hb - CAP / 2);
  box(group, m.rubber, [0.034, 0.002, 0.006], [fs.x, fs.ys + 0.0125, fs.hb - CAP / 2], { cast: false });

  // ---------- transom ----------

  // Hull-coloured parts take the topside material (the paint, or mill-finish plate on bare-alloy
  // builds); bottoms take the hull's bottom plate, which topsideMaterial() returns for a bare build.
  const topside = topsideMaterial(m);
  const plate = plateAlloy();
  const podHalf = twin ? 0.66 : 0.4;
  // Engine mounting surface at 25" (XL) shaft height: 635 mm above the keel plus the 30 mm the
  // anti-ventilation plate sits above the bottom at the transom.
  const podTop = lines.keel(0) + 0.03 + 0.635;
  const platY = s0.yc + 0.2;
  const zi = podHalf + 0.05;
  const bottomAt = (z) => lerp(s0.yk, s0.yc, z / s0.zc);
  const aftFace = -POD - POD_BEVEL;
  const tw = s0.inner;
  const ys = s0.ys;

  // Door to the port boarding platform: open-topped, hinged on its outboard edge, latched inboard.
  // It clears the engine pod, so on twins it is narrower. The sill stands two equal rises above
  // the floor and never below the platform outside; a step inside takes the first rise.
  const dOut = tw - 0.05;
  const dIn = Math.max(podHalf + 0.02, dOut - 0.44);
  const ySill = Math.max(DECK_Y + 2 * STEP_RISE, platY + 0.03);
  const stepTop = (DECK_Y + ySill) / 2;

  // Outer transom skin, notched for the doorway.
  const outline = [[s0.hb, ys], [s0.zn, s0.yn], [s0.zp, s0.yp], [s0.zf, s0.yf], [s0.zc, s0.yc], [0, s0.yk]];
  const skin = [...outline, ...outline.slice(0, -1).reverse().map(([z, y]) => [-z, y]), [-dOut, ys], [-dOut, ySill], [-dIn, ySill], [-dIn, ys]];
  add(group, crossSection(skin, 0), topside);

  // Inner transom either side of and below the doorway, bedded into the liner at its ends.
  // Its aft face stands just forward of the skin, clear of it.
  const deep = tw + 0.03;
  const tIn = T - 0.004;
  const txc = T - tIn / 2;
  box(group, k.liner, [tIn, ys - DECK_Y + 0.01, deep - dOut], [txc, (ys + DECK_Y - 0.01) / 2, -(deep + dOut) / 2]);
  box(group, k.liner, [tIn, ySill - DECK_Y + 0.01, dOut - dIn], [txc, (ySill + DECK_Y - 0.01) / 2, -(dOut + dIn) / 2]);
  box(group, k.liner, [tIn, ys - DECK_Y + 0.01, deep + dIn], [txc, (ys + DECK_Y - 0.01) / 2, (deep - dIn) / 2]);
  // Capping across the transom top in the hull colour, broken at the door; alloy sill plate.
  const capY = ys - 0.004;
  rbox(group, topside, [T + 0.03, 0.017, s0.hb - 0.004 - dOut], [T / 2, capY, -(s0.hb - 0.004 + dOut) / 2], 0.006);
  rbox(group, topside, [T + 0.03, 0.017, s0.hb - 0.004 + dIn], [T / 2, capY, (s0.hb - 0.004 - dIn) / 2], 0.006);
  box(group, m.alloy, [T + 0.02, 0.008, dOut - dIn], [T / 2, ySill - 0.002, -(dOut + dIn) / 2]);

  // The door: a moulded panel with its own capping, rubber seals in the gaps, two barrel hinges.
  const dz0 = -dOut + 0.006;
  const dz1 = -dIn - 0.006;
  const dzc = (dz0 + dz1) / 2;
  rbox(group, k.liner, [0.045, ys - 0.012 - ySill - 0.006, dz1 - dz0], [T - 0.0225, (ys - 0.012 + ySill + 0.006) / 2, dzc], 0.008);
  rbox(group, topside, [T + 0.03, 0.017, dz1 - dz0], [T / 2, capY, dzc], 0.006);
  for (const z of [-dOut + 0.003, -dIn - 0.003]) box(group, m.rubber, [0.05, ys - 0.012 - ySill, 0.005], [T - 0.025, (ys - 0.012 + ySill) / 2, z], { cast: false });
  for (const y of [ySill + 0.07, ys - 0.09]) {
    const barrel = add(group, new THREE.CylinderGeometry(0.009, 0.009, 0.06, 12), m.stainless);
    barrel.position.set(T + 0.009, y, -dOut + 0.003);
    box(group, m.stainless, [0.004, 0.05, 0.045], [T + 0.002, y, -dOut + 0.03]);
    box(group, m.stainless, [0.004, 0.05, 0.03], [T + 0.002, y, -dOut - 0.018]);
  }
  // Lift latch on the inboard edge, keeper on the transom.
  const ly = ys - 0.075;
  rbox(group, m.stainless, [0.006, 0.06, 0.03], [T + 0.003, ly, dz1 - 0.035], 0.003);
  rbox(group, m.stainless, [0.014, 0.016, 0.075], [T + 0.012, ly + 0.012, dz1 - 0.02], 0.006);
  rbox(group, m.stainless, [0.012, 0.03, 0.022], [T + 0.006, ly + 0.012, -dIn + 0.016], 0.004);

  // Transom step inside the door, non-slip on top.
  const stepFwd = T + 0.26;
  const stepZ0 = -(tw + 0.01);
  const stepZ1 = -(dIn - 0.035);
  rbox(group, k.liner, [stepFwd - T + 0.02, stepTop - DECK_Y + 0.01, stepZ1 - stepZ0], [(stepFwd + T - 0.02) / 2, (stepTop + DECK_Y - 0.01) / 2, (stepZ0 + stepZ1) / 2], 0.014);
  add(group, flat(rrect((T + stepFwd) / 2 + 0.005, (stepZ0 + 0.03 + stepZ1) / 2 - 0.005, stepFwd - T - 0.05, stepZ1 - stepZ0 - 0.07, 0.02), [], stepTop + 0.0015), k.nonslip, { cast: false });

  // Scuppers at the foot of the transom, stainless grilles over dark outlets.
  for (const z of [-0.28, 0.28]) {
    rbox(group, m.stainless, [0.006, 0.062, 0.16], [T + 0.003, DECK_Y + 0.036, z], 0.003);
    box(group, m.rubber, [0.004, 0.034, 0.124], [T + 0.006, DECK_Y + 0.036, z], { cast: false });
    for (const dz of [-0.04, 0, 0.04]) box(group, m.stainless, [0.004, 0.036, 0.006], [T + 0.008, DECK_Y + 0.036, z + dz], { cast: false });
  }

  // Live-bait tank in the starboard transom corner: lid with a tinted window, hinge and latch.
  const tz0 = tw - 0.5;
  const tankTop = ys - 0.05;
  const tankFwd = T + 0.36;
  rbox(group, k.liner, [tankFwd - T + 0.03, tankTop - DECK_Y + 0.01, tw + 0.02 - tz0], [(tankFwd + T - 0.03) / 2, (tankTop + DECK_Y - 0.01) / 2, (tz0 + tw + 0.02) / 2], 0.015);
  const lidZ = (tz0 + face(s0)) / 2;
  const lidW = face(s0) - tz0 - 0.08;
  const lidX = (T + tankFwd) / 2 + 0.01;
  rbox(group, m.rubber, [0.3, 0.006, lidW + 0.012], [lidX, tankTop + 0.003, lidZ], 0.003, { cast: false });
  rbox(group, k.liner, [0.288, 0.016, lidW], [lidX, tankTop + 0.012, lidZ], 0.006);
  rbox(group, k.tint, [0.15, 0.003, lidW - 0.14], [lidX, tankTop + 0.0205, lidZ], 0.012, { cast: false });
  rod(group, v3(T + 0.022, tankTop + 0.012, lidZ - lidW / 2 + 0.04), v3(T + 0.022, tankTop + 0.012, lidZ + lidW / 2 - 0.04), 0.006, m.stainless, 8);
  rbox(group, m.stainless, [0.02, 0.022, 0.05], [tankFwd + 0.006, tankTop + 0.008, lidZ], 0.005);

  // Default bait board on the transom; the bait station option replaces it.
  if (!build.options.includes('bait')) baitBoard(group, k, m, s0);

  // ---------- pods ----------

  // Welded pods: the hull's chine and vee carried aft, boarding platforms either side of the engine
  // pod, all one plate structure with chamfered aft edges and a weld seam at the transom.
  // The engine pod stands up from the platforms, or sits down in a well between them, to the
  // engine mounting height; when the two all but coincide the top is one flat deck.
  const zO = lines.sideZ(s0, platY);
  const enginePod = Math.abs(podTop - platY) > 0.015 ? [[-podHalf, platY], [-podHalf, podTop], [podHalf, podTop], [podHalf, platY]] : [];
  const profile = [[zO, platY], [s0.zp, s0.yp], [s0.zf, s0.yf], [s0.zc, s0.yc], [0, s0.yk], [-s0.zc, s0.yc], [-s0.zf, s0.yf], [-s0.zp, s0.yp], [-zO, platY], ...enginePod];
  // Bottom plates, chine shelves and the band under the paint line in plate like the hull's;
  // sides, tops and aft faces in the topside finish.
  const low = (a, b) => a.y <= s0.yp + 1e-4 && b.y <= s0.yp + 1e-4;
  const [podSides, podBottom] = prism(profile, aftFace, 0, POD_BEVEL, low);
  add(group, podSides, topside);
  add(group, podBottom, plate);
  profile.forEach(([z, y], i) => {
    const [z2, y2] = profile[(i + 1) % profile.length];
    rod(group, v3(-0.004, y, z), v3(-0.004, y2, z2), 0.004, low({ y }, { y: y2 }) ? plate : topside, 6).castShadow = false;
  });
  const padX0 = aftFace + POD_BEVEL + 0.03;
  const padX1 = -0.035;
  for (const side of [1, -1]) {
    rod(group, v3(0.002, s0.yf, side * (s0.zf + 0.002)), v3(aftFace + POD_BEVEL, s0.yf, side * (s0.zf + 0.002)), 0.006, plate, 5);
    const pz0 = podHalf + 0.035;
    const pz1 = zO - 0.035;
    add(group, flat(rrect((padX0 + padX1) / 2, side * (pz0 + pz1) / 2, padX1 - padX0, pz1 - pz0, 0.03), [], platY + 0.0015), k.nonslip, { cast: false });
  }
  // Keel bar carried on under the pod, closed off at its aft end.
  // Same flat bar on edge as the hull's: 22 mm wide, KEEL_BAR deep, bedded 6 mm into the plate.
  rbox(group, plate, [-aftFace - 0.006 + 0.02, KEEL_BAR + 0.006, 0.022], [(aftFace + 0.006 + 0.02) / 2, s0.yk - (KEEL_BAR - 0.006) / 2, 0], 0.008);
  // Alloy mounting plate on the engine pod, through-bolted.
  box(group, m.alloy, [POD - 0.03, 0.012, podHalf * 2 - 0.05], [-POD / 2 - 0.01, podTop + 0.006, 0]);
  for (const x of [-0.08, -0.38]) {
    for (const z of [-podHalf + 0.07, podHalf - 0.07]) {
      const bolt = add(group, new THREE.CylinderGeometry(0.012, 0.012, 0.008, 6), m.stainless, { cast: false });
      bolt.position.set(x, podTop + 0.016, z);
    }
  }

  // Fold-down boarding ladder on the port platform, outboard of the underwater light.
  const hwL = 0.115;
  ladder(group, m, { lz: -(s0.zf - 0.03 - hwL), hw: hwL, platY, aftX: aftFace, deployed: build.scene === 'water' });

  // Boarding handle on the transom beside the door, over the port platform.
  const gz = -(dOut + (s0.hb - dOut) / 2);
  const gy0 = platY + 0.12;
  const gy1 = ys - 0.075;
  add(group, tube([v3(-0.002, gy0, gz), v3(-0.055, gy0 + 0.03, gz), v3(-0.06, (gy0 + gy1) / 2, gz), v3(-0.055, gy1 - 0.03, gz), v3(-0.002, gy1, gz)], 0.012, 24, 8), m.stainless);
  for (const y of [gy0, gy1]) {
    const flange = add(group, new THREE.CylinderGeometry(0.022, 0.022, 0.006, 14), m.stainless);
    flange.position.set(-0.003, y, gz);
    flange.rotation.z = Math.PI / 2;
  }

  return { podTop, podHalf, zi, platY, bottomAt, aft: -POD };
}

// Padded coaming bolster section between x0 and x1 on the liner face: a D section, rounded ends.
function bolster(group, material, x0, x1, side, S, face) {
  const th = 0.055;
  const ends = [[0, 0.5], [0.006, 0.8], [0.02, 0.95], [0.045, 1]];
  const mid = spaced(x0 + 0.1, x1 - 0.1, Math.max(1, Math.round((x1 - x0) / 0.12))).map((x) => [x, 1]);
  const xs = [...ends.map(([d, f]) => [x0 + d, f]), ...mid, ...ends.slice().reverse().map(([d, f]) => [x1 - d, f])];
  const rings = xs.map(([x, f]) => {
    const s = S(x);
    const y0 = s.ys - 0.19;
    const y1 = s.ys - 0.045;
    const yc = (y0 + y1) / 2;
    const hh = ((y1 - y0) / 2) * (0.6 + 0.4 * f);
    const z0 = face(s) + 0.003;
    return Array.from({ length: 13 }, (_, j) => {
      const a = -Math.PI / 2 + (Math.PI * j) / 12;
      const sn = Math.sin(a);
      return v3(x, yc + hh * Math.sign(sn) * Math.abs(sn) ** 0.55, side * (z0 - th * f * Math.abs(Math.cos(a)) ** 0.45));
    });
  });
  add(group, loft(rings), material);
}

// Stainless horn cleat on the gunwale capping at station s.
function cleat(group, m, s, side) {
  const z = side * (s.hb - CAP / 2);
  rbox(group, m.stainless, [0.11, 0.004, 0.03], [s.x, s.ys + 0.002, z], 0.0019);
  for (const dx of [-0.032, 0.032]) {
    const leg = add(group, new THREE.CylinderGeometry(0.009, 0.012, 0.026, 10), m.stainless);
    leg.position.set(s.x + dx, s.ys + 0.016, z);
  }
  const horn = add(group, new THREE.CapsuleGeometry(0.009, 0.13, 4, 10), m.stainless);
  horn.position.set(s.x, s.ys + 0.031, z);
  horn.rotation.z = Math.PI / 2;
}

// Telescopic stainless ladder hinged at the aft edge of a platform: flat treads with rubber
// grips, collars where the sections slide, rubber feet. Stowed, it lies folded on the platform.
function ladder(group, m, { lz, hw, platY, aftX, deployed }) {
  const g = new THREE.Group();
  const len = deployed ? 0.92 : 0.44;
  const rungs = deployed ? [0.22, 0.45, 0.68, 0.9] : [0.16, 0.3, 0.43];
  for (const dz of [-hw, hw]) {
    rod(g, v3(0, 0.02, dz), v3(0, -len, dz), 0.011, m.stainless);
    for (const f of deployed ? [0.36, 0.64] : [0.5]) {
      const collar = add(g, new THREE.CylinderGeometry(0.015, 0.015, 0.03, 12), m.stainless);
      collar.position.set(0, -len * f, dz);
    }
    const foot = add(g, new THREE.CylinderGeometry(0.013, 0.013, 0.03, 10), m.rubber);
    foot.position.set(0, -len - 0.01, dz);
  }
  for (const r of rungs) {
    rbox(g, m.stainless, [0.05, 0.014, hw * 2], [0, -r, 0], 0.005);
    box(g, m.rubber, [0.034, 0.004, hw * 2 - 0.03], [0, -r + 0.009, 0], { cast: false });
  }
  if (deployed) {
    // Arms over the chamfered edge to the stiles, which hang just clear of the aft face.
    for (const dz of [-hw, hw]) rod(g, v3(0.058, 0.02, dz), v3(-0.004, 0.02, dz), 0.011, m.stainless);
    g.position.set(aftX - 0.035, platY - 0.003, lz);
  } else {
    g.rotation.z = Math.PI / 2;
    g.position.set(aftX + 0.035, platY + 0.0285, lz);
  }
  group.add(g);
  // Hinge brackets on the platform's aft edge.
  for (const dz of [-hw, hw]) rbox(group, m.stainless, [0.045, 0.03, 0.026], [aftX + 0.04, platY + 0.015, lz + dz * 1.22], 0.006);
  rod(group, v3(aftX + 0.04, platY + 0.017, lz - hw * 1.22), v3(aftX + 0.04, platY + 0.017, lz + hw * 1.22), 0.007, m.stainless, 8);
}

// Standard transom bait board: HDPE cutting board with lips, knife slots and three rod holders,
// on a stainless frame whose legs land on the transom capping.
function baitBoard(group, k, m, s0) {
  const top = s0.ys + 0.31;
  const xa = -0.09;
  const xb = 0.27;
  const w = 0.62;
  const xc = (xa + xb) / 2;
  rbox(group, k.hdpe, [xb - xa, 0.025, w], [xc, top - 0.0125, 0], 0.006);
  rbox(group, k.hdpe, [0.016, 0.034, w], [xa + 0.008, top + 0.016, 0], 0.005);
  for (const side of [1, -1]) rbox(group, k.hdpe, [xb - xa - 0.016, 0.026, 0.014], [xc + 0.008, top + 0.012, side * (w / 2 - 0.007)], 0.005);
  // Knife block in the starboard front corner: three slots, one knife home.
  const kz = w / 2 - 0.014 - 0.07;
  rbox(group, k.hdpe, [0.075, 0.045, 0.14], [xb - 0.05, top + 0.0225, kz], 0.006);
  for (const dz of [-0.04, 0, 0.04]) box(group, m.rubber, [0.05, 0.002, 0.005], [xb - 0.05, top + 0.0455, kz + dz], { cast: false });
  rbox(group, m.rubber, [0.03, 0.1, 0.016], [xb - 0.05, top + 0.096, kz], 0.006);
  // Frame and legs.
  const fy = top - 0.025 - 0.012;
  for (const x of [xa + 0.04, xb - 0.05]) rod(group, v3(x, fy, -w / 2 + 0.03), v3(x, fy, w / 2 - 0.03), 0.012, m.stainless);
  const capTop = s0.ys + 0.0045;
  for (const z of [-0.24, 0.24]) {
    rod(group, v3(0.025, capTop, z), v3(xa + 0.04, fy, z), 0.013, m.stainless);
    rod(group, v3(0.085, capTop, z), v3(xb - 0.05, fy, z), 0.013, m.stainless);
    footPlate(group, m, 0.025, capTop, z);
    footPlate(group, m, 0.085, capTop, z);
  }
  // Rod holders clamped to the aft rail, raked aft.
  const dir = v3(-Math.sin(0.3), Math.cos(0.3), 0);
  for (const z of [-0.2, 0, 0.2]) {
    holder(group, m, v3(xa - 0.026, top - 0.13, z), dir, 0.27, 0.021);
    box(group, m.stainless, [0.07, 0.022, 0.03], [xa + 0.002, fy, z]);
  }
}

// Bait station option: a moulded station in the cabin/console colour on a stainless frame, with
// a cutting board, sink and tap, two tackle drawers, a rail and four rod holders.
export function baitStation(group, lines, m) {
  const k = parts();
  const s0 = lines.section(0);
  const w = Math.min(1.04, s0.inner * 1.05);
  const xa = -0.12;
  const xb = 0.34;
  const top = s0.ys + 0.42;
  const under = top - 0.15;
  const xc = (xa + xb) / 2;
  const ym = (top + under) / 2;
  rbox(group, m.trim, [xb - xa, top - under, w], [xc, ym, 0], 0.025);
  // Cutting board to port, sink and tap to starboard.
  rbox(group, k.hdpe, [xb - xa - 0.08, 0.014, w * 0.52], [xc + 0.01, top + 0.006, -w * 0.2], 0.005);
  const sz = w / 2 - 0.19;
  rbox(group, k.basin, [0.27, 0.004, 0.3], [xc + 0.02, top + 0.0015, sz], 0.02, { cast: false });
  const drain = add(group, new THREE.CircleGeometry(0.02, 14), m.rubber, { cast: false });
  drain.position.set(xc + 0.02, top + 0.0042, sz);
  drain.rotation.x = -Math.PI / 2;
  add(group, tube([v3(xa + 0.05, top, sz), v3(xa + 0.05, top + 0.12, sz), v3(xa + 0.1, top + 0.15, sz), v3(xa + 0.15, top + 0.1, sz)], 0.008, 16, 6), m.stainless);
  // Tackle drawers in the front face.
  for (const side of [1, -1]) {
    const dzc = side * w * 0.22;
    box(group, m.rubber, [0.002, 0.092, w * 0.37], [xb + 0.0005, ym, dzc], { cast: false });
    rbox(group, m.trim, [0.012, 0.084, w * 0.36], [xb + 0.006, ym, dzc], 0.004);
    rod(group, v3(xb + 0.026, ym, dzc - 0.06), v3(xb + 0.026, ym, dzc + 0.06), 0.006, m.stainless, 8);
    for (const dz of [-0.055, 0.055]) rod(group, v3(xb + 0.011, ym, dzc + dz), v3(xb + 0.026, ym, dzc + dz), 0.005, m.stainless, 6);
  }
  // Rail along the aft edge.
  const rz = w / 2 - 0.06;
  for (const z of [-rz, 0, rz]) rod(group, v3(xa + 0.03, top, z), v3(xa + 0.03, top + 0.07, z), 0.009, m.stainless, 8);
  rod(group, v3(xa + 0.03, top + 0.07, -rz - 0.009), v3(xa + 0.03, top + 0.07, rz + 0.009), 0.011, m.stainless);
  // Four rod holders on the aft face.
  const dir = v3(-Math.sin(0.28), Math.cos(0.28), 0);
  for (const f of [-0.375, -0.125, 0.125, 0.375]) {
    holder(group, m, v3(xa - 0.026, under - 0.03, f * w), dir, 0.3, 0.023);
    box(group, m.stainless, [0.03, 0.03, 0.04], [xa - 0.008, under + 0.04, f * w]);
  }
  // Frame: four legs to the transom capping, braced fore and aft.
  const capTop = s0.ys + 0.0045;
  // Feet stay on the fixed capping, inboard of the door's inner edge (dIn on a single rig).
  const lzs = Math.min(w / 2 - 0.09, s0.inner - 0.49 - 0.08);
  for (const z of [-lzs, lzs]) {
    rod(group, v3(0.025, capTop, z), v3(xa + 0.06, under, z), 0.015, m.stainless);
    rod(group, v3(0.085, capTop, z), v3(xb - 0.07, under, z), 0.015, m.stainless);
    rod(group, v3(lerp(0.025, xa + 0.06, 0.5), lerp(capTop, under, 0.5), z), v3(lerp(0.085, xb - 0.07, 0.5), lerp(capTop, under, 0.5), z), 0.011, m.stainless);
    footPlate(group, m, 0.025, capTop, z, 0.028);
    footPlate(group, m, 0.085, capTop, z, 0.028);
  }
}
