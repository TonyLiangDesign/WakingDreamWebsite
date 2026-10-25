import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { resolve } from './config.js';
import { letteringColour } from './materials.js';

// Boat-local coordinates: x runs from the transom (0) to the bow (L), y is up with the
// waterline at 0, z is to starboard. Every part is procedural, so a change rebuilds in milliseconds.

export const DECK_Y = 0.16;
const CAP = 0.13;               // gunwale capping width
export const TRAILER_LIFT = 1.08;
export const CRADLE_LIFT = 0.8;

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = THREE.MathUtils.lerp;

function add(group, geometry, material, { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  group.add(mesh);
  return mesh;
}

function tube(points, radius, segments = 64, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : v3(...p))), false, 'centripetal');
  return new THREE.TubeGeometry(curve, segments, radius, radial, false);
}

function rod(group, a, b, radius, material, radialSegments = 10) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const mesh = add(group, new THREE.CylinderGeometry(radius, radius, dir.length(), radialSegments), material);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(v3(0, 1, 0), dir.normalize());
  return mesh;
}

function quad(corners, material, group) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap((c) => [c.x, c.y, c.z]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return add(group, g, material, { cast: false });
}

function extrudeProfile(points, depth, bevel = 0.025) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

// Strip surface through matching profiles at successive stations, mirrored to port.
function ribbon(stations, mirror = true) {
  const cols = stations[0].pts.length;
  const position = [];
  const uv = [];
  const index = [];
  for (const side of mirror ? [1, -1] : [1]) {
    const base = position.length / 3;
    for (const st of stations) {
      let run = 0;
      st.pts.forEach(([z, y], j) => {
        if (j > 0) run += Math.hypot(z - st.pts[j - 1][0], y - st.pts[j - 1][1]);
        position.push(st.x, y, z * side);
        uv.push(st.x * 0.5, run * 0.5);
      });
    }
    for (let i = 0; i < stations.length - 1; i++) {
      for (let j = 0; j < cols - 1; j++) {
        const a = base + i * cols + j;
        const b = a + cols;
        if (side > 0) index.push(a, b, a + 1, b, b + 1, a + 1);
        else index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

const spaced = (t0, t1, n, ease = (u) => u) => Array.from({ length: n + 1 }, (_, i) => lerp(t0, t1, ease(i / n)));

// ---------- hull lines ----------

export function hullLines(model) {
  const L = model.length;
  const B = model.beam;
  const k = L / 6.2;
  const halfBeam = (t) => (t < 0.5 ? (B / 2) * (0.95 + 0.1 * t) : (B / 2) * Math.pow(Math.max(0, 1 - ((t - 0.5) / 0.5) ** 2), 0.62));
  const keel = (t) => (t < 0.55 ? -0.3 : -0.3 + 0.78 * Math.pow((t - 0.55) / 0.45, 2.1));
  const sheer = (t) => 0.62 + 0.04 * k + 0.3 * Math.pow(t, 2.6);
  const deadrise = (t) => THREE.MathUtils.degToRad(19 + 22 * Math.pow(Math.max(0, (t - 0.35) / 0.65), 1.5));
  function section(t) {
    const hb = halfBeam(t);
    const yk = keel(t);
    const ys = sheer(t);
    const dr = deadrise(t);
    const zc = hb * 0.86;
    const yc = Math.min(yk + Math.tan(dr) * zc, ys - 0.22 * (1 - 0.6 * t));
    const zf = hb * 0.92;
    const yf = yc + 0.006;
    return { t, x: t * L, hb, yk, ys, dr, zc, yc, zf, yf, zm: hb * 0.985, ym: yf + (ys - yf) * 0.5, inner: Math.max(0, hb - CAP) };
  }
  // Half-width of the V bottom at height y, used to fit the cockpit floor inside the hull.
  const bottomZ = (s, y) => (y <= s.yk ? 0 : y >= s.yc ? s.zc : (s.zc * (y - s.yk)) / (s.yc - s.yk));
  return { L, B, halfBeam, keel, sheer, section, bottomZ };
}

// ---------- decal ----------

function nameTexture(name, colour) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colour;
  ctx.font = 'italic 600 118px Montserrat, "Helvetica Neue", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  const [series, number] = name.split(' ');
  ctx.fillText(series.toUpperCase(), 20, 100);
  const w = ctx.measureText(series.toUpperCase()).width;
  ctx.font = 'italic 400 118px Montserrat, "Helvetica Neue", Arial, sans-serif';
  ctx.fillText(number, 20 + w + 34, 100);
  ctx.fillRect(20, 168, 980, 6);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function nameDecal(group, lines, name, colour) {
  const texture = nameTexture(name, colour);
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -2 });
  const t0 = 0.5;
  const t1 = 0.71;
  for (const side of [1, -1]) {
    const position = [];
    const uv = [];
    const index = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const s = lines.section(lerp(t0, t1, i / n));
      for (const [j, f] of [0.42, 0.86].entries()) {
        // Sample the upper topsides between the chine flat and the sheer, 4 mm proud of the paint.
        const y = lerp(s.yf, s.ys, f);
        const z = f < 0.5 ? lerp(s.zf, s.zm, f / 0.5) : lerp(s.zm, s.hb, (f - 0.5) / 0.5);
        position.push(s.x, y, (z + 0.004) * side);
        uv.push(side > 0 ? i / n : 1 - i / n, j);
      }
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      if (side > 0) index.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
      else index.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    g.computeVertexNormals();
    add(group, g, material, { cast: false });
  }
}

// ---------- hull ----------

function hull(group, lines, m, build, twin) {
  const { L, section } = lines;
  const skin = spaced(0, 1, 72, (u) => Math.sin((u * Math.PI) / 2)).map(section);

  add(group, ribbon(skin.map((s) => ({ x: s.x, pts: [[0, s.yk], [s.zc * 0.5, lerp(s.yk, s.yc, 0.5)], [s.zc, s.yc]] }))), m.alloy);
  add(group, ribbon(skin.map((s) => ({ x: s.x, pts: [[s.zc, s.yc], [s.zf, s.yf]] }))), m.alloy);
  add(group, ribbon(skin.map((s) => ({ x: s.x, pts: [[s.zf, s.yf], [s.zm, s.ym], [s.hb, s.ys]] }))), m.paint);

  // Gunwale capping, inner liner, cockpit floor and anchor deck.
  const toBow = spaced(0, 0.985, 48, (u) => Math.sin((u * Math.PI) / 2)).map(section);
  add(group, ribbon(toBow.map((s) => ({ x: s.x, pts: [[s.hb, s.ys], [s.inner, s.ys]] }))), m.paint);
  const cockpit = spaced(0, 0.82, 32).map(section);
  add(group, ribbon(cockpit.map((s) => ({ x: s.x, pts: [[s.inner, s.ys], [s.inner, DECK_Y]] }))), m.deck);
  add(group, ribbon(cockpit.map((s) => ({ x: s.x, pts: [[0, DECK_Y], [Math.min(s.inner, lines.bottomZ(s, DECK_Y)), DECK_Y]] }))), m.deck);
  const fore = spaced(0.8, 0.992, 16).map(section);
  add(group, ribbon(fore.map((s) => ({ x: s.x, pts: [[0, s.ys - 0.05], [Math.max(0, s.hb - CAP * 0.5), s.ys - 0.05]] }))), m.deck);
  const bulk = section(0.82);
  const bulkhead = add(group, new THREE.BoxGeometry(0.02, bulk.ys - 0.05 - DECK_Y, bulk.inner * 2), m.deck);
  bulkhead.position.set(bulk.x, (bulk.ys - 0.05 + DECK_Y) / 2, 0);

  // Transom.
  const s0 = section(0);
  const outline = [[s0.hb, s0.ys], [s0.zm, s0.ym], [s0.zf, s0.yf], [s0.zc, s0.yc], [0, s0.yk]];
  const shape = new THREE.Shape([...outline, ...outline.slice(0, -1).reverse().map(([z, y]) => [-z, y])].map(([z, y]) => new THREE.Vector2(z, y)));
  const transom = new THREE.ShapeGeometry(shape);
  transom.rotateY(Math.PI / 2);
  add(group, transom, m.paint);

  // Engine pod and boarding platforms either side.
  const podHalf = twin ? 0.66 : 0.4;
  const podTop = s0.ys - 0.16;
  const podBottom = s0.yk + 0.08;
  const pod = add(group, new THREE.BoxGeometry(0.52, podTop - podBottom, podHalf * 2), m.alloy);
  pod.position.set(-0.26, (podTop + podBottom) / 2, 0);
  const platformWidth = s0.hb * 0.92 - podHalf;
  for (const side of [1, -1]) {
    const platform = add(group, new THREE.BoxGeometry(0.48, 0.04, platformWidth), m.alloy);
    platform.position.set(-0.24, s0.yc + 0.1, side * (podHalf + platformWidth / 2));
  }
  const ladderZ = podHalf + platformWidth * 0.5;
  for (const dz of [-0.13, 0.13]) {
    rod(group, v3(-0.42, s0.yc + 0.12, ladderZ + dz), v3(-0.46, s0.yc - 0.45, ladderZ + dz), 0.012, m.stainless);
  }

  // Rubbing strake along the sheer, stem band, spray rails and keel bar.
  for (const side of [1, -1]) {
    const pts = spaced(0, 0.99, 30).map(section).map((s) => v3(s.x, s.ys - 0.035, side * (s.hb + 0.02)));
    add(group, tube(pts, 0.032, 120), m.rubber);
    for (const f of [0.34, 0.68]) {
      const rail = spaced(0, 0.84, 24).map(section).map((s) => v3(s.x, lerp(s.yk, s.yc, f) - 0.006, side * s.zc * f));
      add(group, tube(rail, 0.012, 80, 6), m.alloy);
    }
  }
  const stem = [...spaced(0.6, 1, 16).map((t) => v3(t * L, lines.keel(t) - 0.01, 0)), v3(L + 0.01, lines.sheer(1) - 0.04, 0)];
  add(group, tube(stem, 0.02, 48), m.alloy);

  nameDecal(group, lines, resolve(build).model.name, letteringColour(build));
  return { podTop, podHalf };
}

// ---------- fit-out ----------

function rocketLauncher(group, m, x, y, width, count) {
  rod(group, v3(x, y, -width / 2), v3(x, y, width / 2), 0.02, m.stainless);
  for (let i = 0; i < count; i++) {
    const z = lerp(-width / 2, width / 2, count === 1 ? 0.5 : i / (count - 1));
    const splay = (z / Math.max(width, 0.01)) * 0.5;
    const holderDir = v3(-Math.sin(0.35), Math.cos(0.35), splay * 0.4).normalize();
    const base = v3(x, y, z);
    const top = base.clone().addScaledVector(holderDir, 0.28);
    rod(group, base, top, 0.022, m.stainless);
    const rodDir = v3(-Math.sin(0.48), Math.cos(0.48), splay).normalize();
    const blank = add(group, new THREE.CylinderGeometry(0.0035, 0.01, 1.85, 6), m.rod);
    blank.position.copy(top).addScaledVector(rodDir, 0.925);
    blank.quaternion.setFromUnitVectors(v3(0, 1, 0), rodDir);
    const reel = add(group, new THREE.CylinderGeometry(0.035, 0.035, 0.05, 14), m.stainless);
    reel.position.copy(top).addScaledVector(rodDir, 0.1).add(v3(-0.04, -0.03, 0));
    reel.rotation.x = Math.PI / 2;
  }
}

function hardtop(group, lines, m, build) {
  const { L, section } = lines;
  const x0 = L * 0.36;
  const x1 = L * 0.8;
  const sF = section(0.8);
  const W = 2 * (sF.hb - CAP - 0.05);
  const yF = sF.ys - 0.05;
  const yR = DECK_Y + 1.95;
  const B2 = [x1, yF + 0.28];
  const C = [x1 - 0.26, yF + 0.6];
  const D = [x1 - 0.95, yR];
  add(group, extrudeProfile([[x0, DECK_Y], [x1, DECK_Y], B2, C, D, [x0, yR]], W), m.trim);

  const xFront = (y) => (y <= B2[1] ? x1 : y <= C[1] ? lerp(B2[0], C[0], (y - B2[1]) / (C[1] - B2[1])) : lerp(C[0], D[0], (y - C[1]) / (D[1] - C[1])));
  const yw0 = lines.sheer(0.36) + 0.42;
  const yw1 = yR - 0.12;
  const xa = x0 + 0.14;
  const xm = (xa + xFront(yw0) - 0.16) / 2;
  const panes = [
    [[xa, yw0], [xm - 0.04, yw0], [xm - 0.04, yw1], [xa, yw1]],
    [[xm + 0.04, yw0], [xFront(yw0) - 0.16, yw0], [xFront(yw1) - 0.16, yw1], [xm + 0.04, yw1]],
  ];
  for (const side of [1, -1]) {
    for (const pane of panes) {
      const glass = add(group, extrudeProfile(pane, 0.01, 0.004), m.glass, { cast: false });
      glass.position.z = side * (W / 2 + 0.03);
    }
  }

  // Windscreen on the raked front face, split by a centre mullion.
  const n = new THREE.Vector2(D[1] - C[1], -(D[0] - C[0])).normalize().multiplyScalar(0.03);
  const along = (f) => [lerp(C[0], D[0], f) + n.x, lerp(C[1], D[1], f) + n.y];
  const [ax, ay] = along(0.1);
  const [bx, by] = along(0.9);
  const zo = W / 2 - 0.1;
  quad([v3(ax, ay, 0.03), v3(ax, ay, zo), v3(bx, by, zo), v3(bx, by, 0.03)], m.glass, group);
  quad([v3(ax, ay, -zo), v3(ax, ay, -0.03), v3(bx, by, -0.03), v3(bx, by, -zo)], m.glass, group);
  rod(group, v3(...along(0.88), 0.25), v3(...along(0.45), 0.32), 0.008, m.rubber);
  rod(group, v3(...along(0.88), -0.25), v3(...along(0.45), -0.32), 0.008, m.rubber);
  quad([v3(x0 - 0.03, DECK_Y + 0.15, -0.3), v3(x0 - 0.03, DECK_Y + 0.15, 0.3), v3(x0 - 0.03, yR - 0.18, 0.3), v3(x0 - 0.03, yR - 0.18, -0.3)], m.glass, group);

  // Roof with an aft overhang on stainless posts, radar and antennas.
  const roofAft = x0 - 0.55;
  const roofFwd = D[0] + 0.1;
  const roof = add(group, new RoundedBoxGeometry(roofFwd - roofAft, 0.08, W + 0.2, 3, 0.035), m.trim);
  roof.position.set((roofAft + roofFwd) / 2, yR + 0.065, 0);
  for (const side of [1, -1]) rod(group, v3(x0 - 0.48, DECK_Y, side * (W / 2 + 0.02)), v3(x0 - 0.48, yR + 0.03, side * (W / 2 + 0.02)), 0.025, m.stainless);
  const radar = add(group, new THREE.CylinderGeometry(0.24, 0.27, 0.2, 32), m.seat);
  radar.position.set(roofFwd - 0.55, yR + 0.21, 0);
  for (const side of [1, -1]) {
    const base = v3(roofAft + 0.25, yR + 0.1, side * (W / 2 - 0.05));
    rod(group, base, base.clone().add(v3(-0.32, 1.3, side * 0.05)), 0.01, m.seat);
  }

  // Helm inside the cabin, visible through the glass.
  const dash = add(group, new THREE.BoxGeometry(0.3, 0.38, W - 0.2), m.rubber);
  dash.position.set(C[0] - 0.2, yF + 0.36, 0);
  const wheel = add(group, new THREE.TorusGeometry(0.17, 0.016, 8, 32), m.rubber);
  wheel.position.set(C[0] - 0.45, yF + 0.5, W * 0.22);
  wheel.rotation.y = Math.PI / 2;
  wheel.rotation.x = 0.35;
  for (const side of [1, -1]) seat(group, m, C[0] - 1.05, side * W * 0.22, 0.45);

  if (build.options.includes('rocket')) rocketLauncher(group, m, roofAft + 0.12, yR + 0.11, W * 0.78, 6);
  return { cabinAft: x0 };
}

function seat(group, m, x, z, pedestal) {
  rod(group, v3(x, DECK_Y, z), v3(x, DECK_Y + pedestal, z), 0.04, m.stainless);
  const cushion = add(group, new RoundedBoxGeometry(0.46, 0.12, 0.46, 3, 0.05), m.seat);
  cushion.position.set(x, DECK_Y + pedestal + 0.06, z);
  const back = add(group, new RoundedBoxGeometry(0.1, 0.46, 0.46, 3, 0.04), m.seat);
  back.position.set(x - 0.22, DECK_Y + pedestal + 0.3, z);
  back.rotation.z = 0.12;
}

function centreConsole(group, lines, m, build) {
  const { L } = lines;
  const cx0 = L * 0.44;
  const cx1 = L * 0.57;
  const Wc = 0.8;
  const top = DECK_Y + 1.02;
  add(group, extrudeProfile([[cx0, DECK_Y], [cx1, DECK_Y], [cx1, DECK_Y + 0.78], [cx1 - 0.24, top], [cx0, top + 0.02]], Wc, 0.03), m.trim);
  quad([v3(cx1 - 0.2, top - 0.02, -Wc / 2), v3(cx1 - 0.2, top - 0.02, Wc / 2), v3(cx1 - 0.44, top + 0.4, Wc / 2), v3(cx1 - 0.44, top + 0.4, -Wc / 2)], m.glass, group);
  add(group, tube([v3(cx1 - 0.44, top + 0.41, -Wc / 2), v3(cx1 - 0.44, top + 0.41, Wc / 2)], 0.012, 4), m.stainless);
  for (const side of [1, -1]) add(group, tube([v3(cx0 + 0.02, top - 0.08, side * (Wc / 2 + 0.06)), v3((cx0 + cx1) / 2, top - 0.02, side * (Wc / 2 + 0.06)), v3(cx1 - 0.08, top - 0.18, side * (Wc / 2 + 0.06))], 0.014, 16), m.stainless);
  const mfd = add(group, new THREE.BoxGeometry(0.04, 0.24, 0.42), m.rubber);
  mfd.position.set(cx0 + 0.16, top + 0.1, 0);
  mfd.rotation.z = -0.35;
  const wheel = add(group, new THREE.TorusGeometry(0.17, 0.016, 8, 32), m.rubber);
  wheel.position.set(cx0 - 0.05, top - 0.12, 0.16);
  wheel.rotation.y = Math.PI / 2;
  wheel.rotation.x = -0.3;

  const xp = cx0 - 0.62;
  for (const dx of [-0.16, 0.16]) for (const dz of [-0.28, 0.28]) rod(group, v3(xp + dx, DECK_Y, dz), v3(xp + dx, DECK_Y + 0.74, dz), 0.016, m.stainless);
  const cushion = add(group, new RoundedBoxGeometry(0.4, 0.16, 0.74, 3, 0.05), m.seat);
  cushion.position.set(xp, DECK_Y + 0.82, 0);
  const back = add(group, new RoundedBoxGeometry(0.12, 0.38, 0.7, 3, 0.04), m.seat);
  back.position.set(xp - 0.17, DECK_Y + 1.12, 0);
  const cooler = add(group, new RoundedBoxGeometry(0.5, 0.44, 0.78, 3, 0.05), m.seat);
  cooler.position.set(cx1 + 0.42, DECK_Y + 0.22, 0);

  const yT = DECK_Y + 2.05;
  if (build.options.includes('ttop')) {
    for (const side of [1, -1]) {
      rod(group, v3(cx1 - 0.06, DECK_Y + 0.45, side * (Wc / 2 + 0.04)), v3(cx1 - 0.28, yT, side * 0.56), 0.024, m.stainless);
      rod(group, v3(cx0 + 0.06, DECK_Y + 0.45, side * (Wc / 2 + 0.04)), v3(cx0 - 0.28, yT, side * 0.56), 0.024, m.stainless);
    }
    const aft = cx0 - 0.85;
    const fwd = cx1 + 0.15;
    const canopy = add(group, new RoundedBoxGeometry(fwd - aft, 0.07, 1.55, 3, 0.03), m.trim);
    canopy.position.set((aft + fwd) / 2, yT + 0.035, 0);
    if (build.options.includes('rocket')) rocketLauncher(group, m, aft + 0.1, yT + 0.07, 1.25, 6);
  } else if (build.options.includes('rocket')) {
    rocketLauncher(group, m, xp - 0.24, DECK_Y + 1.28, 0.6, 4);
  }
}

function bowRail(group, lines, m) {
  const { L, section } = lines;
  const h = 0.36;
  const side = (sign) => spaced(0.64, 0.975, 14).map(section).map((s) => v3(s.x, s.ys + h, sign * (s.hb - 0.07)));
  const tip = v3(L - 0.02, lines.sheer(1) + h - 0.02, 0);
  add(group, tube([...side(-1), tip, ...side(1).reverse()], 0.014, 140), m.stainless);
  for (const t of [0.66, 0.79, 0.91]) {
    const s = section(t);
    for (const sign of [1, -1]) rod(group, v3(s.x, s.ys, sign * (s.hb - 0.07)), v3(s.x, s.ys + h, sign * (s.hb - 0.07)), 0.012, m.stainless);
  }
  rod(group, v3(L - 0.05, lines.sheer(0.99) - 0.02, 0), tip, 0.012, m.stainless);
}

function bowRoller(group, lines, m) {
  const y = lines.sheer(1) - 0.03;
  const bracket = add(group, new THREE.BoxGeometry(0.42, 0.06, 0.12), m.stainless);
  bracket.position.set(lines.L - 0.1, y, 0);
  const roller = add(group, new THREE.CylinderGeometry(0.035, 0.035, 0.1, 16), m.rubber);
  roller.position.set(lines.L + 0.09, y - 0.01, 0);
  roller.rotation.x = Math.PI / 2;
}

function baitStation(group, lines, m) {
  const s0 = lines.section(0);
  const h = s0.ys + 0.22 - DECK_Y;
  const body = add(group, new THREE.BoxGeometry(0.34, h, 0.95), m.trim);
  body.position.set(0.24, DECK_Y + h / 2, 0);
  const board = add(group, new THREE.BoxGeometry(0.4, 0.03, 1.0), m.seat);
  board.position.set(0.24, DECK_Y + h + 0.015, 0);
  for (const z of [-0.36, -0.12, 0.12, 0.36]) rod(group, v3(0.1, DECK_Y + h, z), v3(0.02, DECK_Y + h + 0.24, z), 0.022, m.stainless);
}

// ---------- outboard ----------

function outboard(m, hp, plateY) {
  const g = new THREE.Group();
  const s = 0.9 + ((hp - 150) / 150) * 0.22;
  const clamp = add(g, new THREE.BoxGeometry(0.12, 0.3, 0.26), m.rubber);
  clamp.position.set(-0.06, -0.08, 0);

  const hC = 0.26 * s;
  const hW = 0.62 * s;
  const chaps = add(g, new RoundedBoxGeometry(0.6 * s, hC, 0.4 * s, 3, 0.06 * s), m.cowling);
  chaps.position.set(-0.44 * s, -0.02 + hC / 2, 0);
  const cowl = add(g, new RoundedBoxGeometry(0.8 * s, hW, 0.52 * s, 5, 0.16 * s), m.cowling);
  cowl.position.set(-0.48 * s, -0.05 + hC + hW / 2, 0);
  cowl.rotation.z = 0.05;
  const band = add(g, new THREE.BoxGeometry(0.62 * s, 0.05 * s, 0.524 * s), m.decal);
  band.position.copy(cowl.position).add(v3(0, -0.06 * s, 0));
  band.rotation.z = 0.05;

  const legTop = -0.02;
  const legBottom = plateY - 0.16 * s;
  const foil = new THREE.Shape();
  foil.absellipse(0, 0, 0.2 * s, 0.07 * s, 0, Math.PI * 2);
  const leg = new THREE.ExtrudeGeometry(foil, { depth: legTop - legBottom, bevelEnabled: false, curveSegments: 24 });
  leg.rotateX(Math.PI / 2);
  add(g, leg, m.cowling).position.set(-0.42 * s, legTop, 0);
  const plate = add(g, new THREE.BoxGeometry(0.52 * s, 0.018, 0.27 * s), m.cowling);
  plate.position.set(-0.45 * s, plateY, 0);

  const gear = add(g, new THREE.CapsuleGeometry(0.075 * s, 0.32 * s, 6, 16), m.cowling);
  gear.position.set(-0.4 * s, legBottom, 0);
  gear.rotation.z = Math.PI / 2;
  const skeg = new THREE.Shape([new THREE.Vector2(-0.3 * s, 0), new THREE.Vector2(-0.52 * s, 0), new THREE.Vector2(-0.49 * s, -0.2 * s)]);
  const skegGeo = new THREE.ExtrudeGeometry(skeg, { depth: 0.02, bevelEnabled: false });
  skegGeo.translate(0, 0, -0.01);
  add(g, skegGeo, m.cowling).position.set(0, legBottom - 0.04 * s, 0);

  const prop = new THREE.Group();
  prop.position.set(-0.4 * s - 0.3 * s, legBottom, 0);
  const hub = add(prop, new THREE.CylinderGeometry(0.045 * s, 0.035 * s, 0.14 * s, 16), m.prop);
  hub.rotation.z = Math.PI / 2;
  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.x = (i * Math.PI * 2) / 3;
    const blade = add(pivot, new THREE.SphereGeometry(1, 14, 8), m.prop);
    blade.scale.set(0.035 * s, 0.13 * s, 0.075 * s);
    blade.position.y = 0.12 * s;
    blade.rotation.y = 0.65;
    prop.add(pivot);
  }
  g.add(prop);
  g.rotation.z = -0.03;
  g.userData.prop = prop;
  return g;
}

// ---------- trailer and stands ----------

function trailer(lines, m) {
  const { L, B } = lines;
  const g = new THREE.Group();
  const beamY = 0.5;
  const beam = (x0, x1, z0, z1, size = 0.1) => {
    const a = v3(x0, beamY, z0);
    const b = v3(x1, beamY, z1);
    const len = a.distanceTo(b);
    const mesh = add(g, new THREE.BoxGeometry(len, size, size), m.galv);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
  };
  for (const z of [0.42, -0.42]) beam(-0.35, L + 0.1, z, z);
  for (const z of [0.42, -0.42]) beam(L + 0.1, L + 1.5, z, 0);
  beam(L + 1.0, L + 1.9, 0, 0, 0.09);
  for (const x of [0.15, L * 0.33, L * 0.62, L - 0.15]) beam(x, x + 0.001, -0.78, 0.78, 0.09);

  const coupling = add(g, new THREE.SphereGeometry(0.07, 16, 10), m.galv);
  coupling.position.set(L + 1.95, beamY + 0.02, 0);
  const jockey = add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.07, 20), m.tyre);
  jockey.position.set(L + 1.45, 0.1, 0.16);
  jockey.rotation.x = Math.PI / 2;
  rod(g, v3(L + 1.45, 0.12, 0.16), v3(L + 1.45, beamY + 0.25, 0.16), 0.03, m.galv);

  // Axle, wheels and guards sit just inside the chines.
  const axleX = L * 0.42;
  const wheelZ = B / 2 - 0.12;
  rod(g, v3(axleX, 0.34, -wheelZ), v3(axleX, 0.34, wheelZ), 0.035, m.galv);
  for (const side of [1, -1]) {
    for (const dx of [-0.4, 0.4]) {
      const x = axleX + dx;
      const tyre = add(g, new THREE.CylinderGeometry(0.33, 0.33, 0.2, 32), m.tyre);
      tyre.position.set(x, 0.33, side * wheelZ);
      tyre.rotation.x = Math.PI / 2;
      const rim = add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.21, 24), m.galv);
      rim.position.copy(tyre.position);
      rim.rotation.x = Math.PI / 2;
    }
    // Open half-cylinder over the tandem pair, stretched fore and aft.
    const guard = add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.26, 32, 1, true, Math.PI / 2, Math.PI), m.galv);
    guard.scale.set(2.1, 1, 1);
    guard.position.set(axleX, 0.36, side * wheelZ);
    guard.rotation.x = Math.PI / 2;
    rod(g, v3(axleX, beamY, side * 0.42), v3(axleX, 0.6, side * (wheelZ - 0.1)), 0.03, m.galv);
  }

  // Keel rollers and carpeted skids matched to the deadrise.
  const contact = (t, z) => {
    const s = lines.section(t);
    return TRAILER_LIFT + lerp(s.yk, s.yc, Math.min(1, z / s.zc));
  };
  for (const t of [0.08, 0.3, 0.52, 0.7]) {
    const x = t * L;
    const top = contact(t, 0);
    rod(g, v3(x, beamY, 0), v3(x, top - 0.06, 0), 0.03, m.galv);
    const roller = add(g, new THREE.CylinderGeometry(0.05, 0.05, 0.22, 16), m.rubber);
    roller.position.set(x, top - 0.05, 0);
    roller.rotation.x = Math.PI / 2;
  }
  const skidZ = 0.58;
  for (const side of [1, -1]) {
    const t0 = 0.05;
    const t1 = 0.58;
    const y0 = contact(t0, skidZ);
    const y1 = contact(t1, skidZ);
    const skid = add(g, new THREE.BoxGeometry((t1 - t0) * L, 0.07, 0.12), m.carpet);
    skid.position.set(((t0 + t1) / 2) * L, (y0 + y1) / 2 - 0.04, side * skidZ);
    skid.rotation.x = side * lines.section(0.3).dr * 0.9;
    for (const t of [0.12, 0.5]) rod(g, v3(t * L, beamY, side * 0.42), v3(t * L, contact(t, skidZ) - 0.07, side * skidZ), 0.025, m.galv);
  }

  // Winch post with bow snubber.
  const postX = L + 0.12;
  const postTop = TRAILER_LIFT + lines.keel(0.97) + 0.12;
  rod(g, v3(postX, beamY, 0), v3(postX, postTop, 0), 0.045, m.galv);
  rod(g, v3(postX + 0.55, beamY, 0), v3(postX, postTop - 0.2, 0), 0.03, m.galv);
  const winch = add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.16, 16), m.galv);
  winch.position.set(postX + 0.05, postTop - 0.25, 0);
  winch.rotation.x = Math.PI / 2;
  const snubber = add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.2, 16), m.rubber);
  snubber.position.set(postX - 0.06, postTop - 0.02, 0);
  snubber.rotation.x = Math.PI / 2;

  const lightBar = add(g, new THREE.BoxGeometry(0.05, 0.08, 1.9), m.galv);
  lightBar.position.set(-0.42, 0.72, 0);
  for (const side of [1, -1]) {
    const light = add(g, new THREE.BoxGeometry(0.03, 0.09, 0.18), m.tailLight);
    light.position.set(-0.46, 0.72, side * 0.86);
  }
  return g;
}

function cradle(lines, m) {
  const g = new THREE.Group();
  for (const t of [0.24, 0.6]) {
    const h = CRADLE_LIFT + lines.keel(t);
    const block = add(g, new THREE.BoxGeometry(0.32, h, 0.5), m.wood);
    block.position.set(t * lines.L, h / 2, 0);
  }
  return g;
}

// ---------- assembly ----------

export function buildBoat(build, m) {
  const r = resolve(build);
  const lines = hullLines(r.model);
  const boat = new THREE.Group();
  const twin = r.engine.count === 2;
  const { podTop, podHalf } = hull(boat, lines, m, build, twin);
  if (build.layout === 'ht') hardtop(boat, lines, m, build);
  else centreConsole(boat, lines, m, build);
  bowRoller(boat, lines, m);
  if (build.options.includes('bowrail')) bowRail(boat, lines, m);
  if (build.options.includes('bait')) baitStation(boat, lines, m);

  const props = [];
  const plateY = lines.keel(0) + 0.03 - podTop;
  for (const z of twin ? [-0.4, 0.4] : [0]) {
    const engine = outboard(m, r.engine.hp, plateY);
    engine.position.set(-0.52, podTop, z);
    boat.add(engine);
    props.push(engine.userData.prop);
  }

  const leds = [];
  if (build.options.includes('lights')) {
    for (const z of [-(podHalf + 0.18), podHalf + 0.18]) {
      const lamp = add(boat, new THREE.CircleGeometry(0.045, 20), m.led, { cast: false });
      lamp.position.set(-0.005, lines.keel(0) + 0.14, z);
      lamp.rotation.y = -Math.PI / 2;
      leds.push(lamp.position.clone());
    }
  }

  return { boat, lines, props, leds, trailer: trailer(lines, m), cradle: cradle(lines, m), podHalf };
}

export function disposeTree(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    const mat = child.material;
    if (mat && mat.map && mat.map.isCanvasTexture && !mat.userData.shared) {
      mat.map.dispose();
      mat.dispose();
    }
  });
}
