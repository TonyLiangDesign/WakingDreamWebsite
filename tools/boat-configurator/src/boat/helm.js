import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { add, tube, rod, box, extrudeProfile, v3, lerp } from './kit.js';
import { DECK_Y } from './hull.js';

// Helm gear for both layouts: moulded dash with a brow, flush MFD, engine display, VHF and switch
// panel on a satin-black fascia, compass, wheel on a tilt column, throttle binnacle (dual for
// twins), pedestal seats with swivel and slide, and the leaning post. Builds into the group given.
// hardtopHelm() receives the placement returned by cabin.js: { C, hw(x), wallZ(x, y) }.
// consoleHelm() receives the placement returned by console.js: { cx0, top, Wc, yTop(x), postX }.
// Both take an optional { twin } as a fourth argument for the dual binnacle.
// Hardtop: the dash is moulded wall to wall under the screen foot and fitted to the walls'
// taper; the helm pod stands proud on starboard over an open footwell, the passenger side is a
// shallow dash with a grab rail over the cuddy entrance in the forward bulkhead.

// ---------- helm-only materials, built once ----------

const ATLAS_W = 512;
const ATLAS_H = 256;
const MFD_UV = [0, 0, 320, 200];
const ENGINE_UV = [336, 0, 160, 120];
const VHF_UV = [336, 136, 160, 48];

// One canvas for every helm screen: a generic chart and sonar split page, an engine page and a
// VHF channel readout. Shown through the emissive map only; no lights are added.
function screenAtlas() {
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = ATLAS_H;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, ATLAS_W, ATLAS_H);

  // Chart page: deep water, a shallows band, a headland, contours, the track and the boat.
  g.save();
  g.beginPath();
  g.rect(0, 0, 160, 200);
  g.clip();
  g.fillStyle = '#09283f';
  g.fillRect(0, 0, 160, 200);
  g.fillStyle = '#0f3a5a';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(150, 0);
  g.bezierCurveTo(130, 50, 90, 62, 72, 112);
  g.bezierCurveTo(52, 150, 22, 152, 0, 172);
  g.fill();
  g.fillStyle = '#76684a';
  g.beginPath();
  g.moveTo(0, 0);
  g.lineTo(116, 0);
  g.bezierCurveTo(100, 36, 70, 46, 56, 86);
  g.bezierCurveTo(40, 116, 16, 120, 0, 136);
  g.fill();
  g.strokeStyle = 'rgba(150,200,235,0.4)';
  g.lineWidth = 1;
  for (const k of [1, 2, 3]) {
    g.beginPath();
    g.moveTo(0, 138 + k * 16);
    g.bezierCurveTo(40, 122 + k * 16, 72, 82 + k * 13, 118 + k * 12, 0);
    g.stroke();
  }
  g.strokeStyle = '#e8f1f7';
  g.lineWidth = 1.5;
  g.setLineDash([5, 4]);
  g.beginPath();
  g.moveTo(40, 192);
  g.lineTo(96, 142);
  g.lineTo(150, 96);
  g.stroke();
  g.setLineDash([]);
  g.strokeStyle = '#ff6a9a';
  g.beginPath();
  g.arc(150, 96, 4, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#ffae3d';
  g.beginPath();
  g.moveTo(96, 128);
  g.lineTo(102, 142);
  g.lineTo(90, 142);
  g.fill();
  g.restore();

  // Sonar page: bottom return in colour bands, a few arches, the depth scale.
  g.save();
  g.beginPath();
  g.rect(160, 0, 160, 200);
  g.clip();
  const water = g.createLinearGradient(0, 0, 0, 200);
  water.addColorStop(0, '#061a33');
  water.addColorStop(1, '#0a2448');
  g.fillStyle = water;
  g.fillRect(160, 0, 160, 200);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = 'rgba(90,160,235,0.3)';
  for (let i = 0; i < 260; i++) g.fillRect(160 + rnd() * 160, 16 + rnd() * 130, 1, 1);
  for (let x = 160; x < 320; x++) {
    const yb = 128 + 10 * Math.sin(x * 0.045) + 5 * Math.sin(x * 0.17 + 1);
    for (const [dy, h, col] of [[0, 4, '#d8342a'], [4, 4, '#f08a24'], [8, 6, '#c9b43a'], [14, 200, '#2e3466']]) {
      g.fillStyle = col;
      g.fillRect(x, yb + dy, 1, h);
    }
  }
  g.lineWidth = 2;
  for (const [x, y, col] of [[196, 70, '#f0c040'], [232, 96, '#e86a30'], [262, 58, '#f0c040'], [290, 104, '#7fd0ff']]) {
    g.strokeStyle = col;
    g.beginPath();
    g.arc(x, y + 6, 6, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  }
  g.fillStyle = 'rgba(220,235,245,0.75)';
  g.font = '9px sans-serif';
  g.textAlign = 'right';
  for (const [y, t] of [[50, '10'], [100, '20'], [150, '30']]) {
    g.fillRect(312, y, 6, 1);
    g.fillText(t, 309, y + 3);
  }
  g.restore();
  g.fillStyle = '#8fa3b2';
  g.fillRect(159, 0, 2, 200);
  g.fillStyle = 'rgba(8,12,16,0.9)';
  g.fillRect(0, 0, 320, 14);
  g.fillRect(0, 182, 320, 18);
  g.fillStyle = '#dfe9f0';
  g.textAlign = 'left';
  g.font = 'bold 10px sans-serif';
  g.fillText('22.4 kn', 6, 195);
  g.fillText('18.6 m', 86, 195);
  g.fillText('17.9 °C', 166, 195);
  g.fillText('COG 047°', 240, 195);
  g.font = '9px sans-serif';
  g.fillText('CHART', 6, 10);
  g.fillText('SONAR', 166, 10);
  g.textAlign = 'right';
  g.fillText('10:42', 314, 10);

  // Engine page: tacho arc and needle, rpm and trim readouts.
  const [ex, ey] = ENGINE_UV;
  g.fillStyle = '#04080c';
  g.fillRect(ex, ey, 160, 120);
  const cx = ex + 80;
  const cy = ey + 68;
  const R = 46;
  g.lineWidth = 6;
  for (const [a0, a1, col] of [[0.8, 2.2, '#1b3043'], [0.8, 1.62, '#5cc8ff'], [2.02, 2.2, '#e0412f']]) {
    g.strokeStyle = col;
    g.beginPath();
    g.arc(cx, cy, R, Math.PI * a0, Math.PI * a1);
    g.stroke();
  }
  g.strokeStyle = '#e6eef4';
  g.lineWidth = 1.5;
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (0.8 + (1.4 * i) / 8);
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (R - 13), cy + Math.sin(a) * (R - 13));
    g.lineTo(cx + Math.cos(a) * (R - 7), cy + Math.sin(a) * (R - 7));
    g.stroke();
  }
  g.strokeStyle = '#ff8c3a';
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + Math.cos(Math.PI * 1.62) * (R - 10), cy + Math.sin(Math.PI * 1.62) * (R - 10));
  g.stroke();
  g.fillStyle = '#e6eef4';
  g.textAlign = 'center';
  g.font = 'bold 17px sans-serif';
  g.fillText('3850', cx, cy + 22);
  g.font = '8px sans-serif';
  g.fillText('RPM', cx, cy + 32);
  g.textAlign = 'left';
  g.fillText('TRIM 12', ex + 6, ey + 12);
  g.textAlign = 'right';
  g.fillText('FUEL 74%', ex + 154, ey + 12);

  // VHF readout.
  const [vx, vy, vw, vh] = VHF_UV;
  g.fillStyle = '#0b1d0f';
  g.fillRect(vx, vy, vw, vh);
  g.fillStyle = '#8af0a0';
  g.textAlign = 'left';
  g.font = 'bold 32px sans-serif';
  g.fillText('16', vx + 10, vy + vh - 10);
  g.font = '11px sans-serif';
  g.fillText('CH', vx + 58, vy + 18);
  g.fillText('25W', vx + 58, vy + 36);
  g.fillText('DSC', vx + 108, vy + 18);
  g.fillText('WX', vx + 108, vy + 36);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let cache = null;
function helmMaterials() {
  if (cache) return cache;
  cache = {
    // Dark glass: the page shows through the emissive map, the clearcoat gives the reflections.
    screen: new THREE.MeshPhysicalMaterial({
      color: '#030507', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04,
      emissive: '#ffffff', emissiveMap: screenAtlas(), emissiveIntensity: 0.6,
    }),
    fascia: new THREE.MeshStandardMaterial({ color: '#1a1c1e', roughness: 0.82 }),
    bezel: new THREE.MeshStandardMaterial({ color: '#0b0c0d', roughness: 0.3 }),
    vinyl: new THREE.MeshStandardMaterial({ color: '#e6e3dc', roughness: 0.52 }),
    piping: new THREE.MeshStandardMaterial({ color: '#8e9195', roughness: 0.5 }),
    shell: new THREE.MeshStandardMaterial({ color: '#8a8e92', roughness: 0.42 }),
    led: new THREE.MeshStandardMaterial({ color: '#0d2a14', emissive: '#3ddc6a', emissiveIntensity: 0.9 }),
  };
  return cache;
}

// ---------- small helpers ----------

// Frame on a raked face from bot to top (x-y points; across is +z): u runs up the face, n is its
// outward normal, at(f, z, out) is the point a fraction f up the face, lifted out along n.
function rakedFace(bot, top, lift = 0) {
  const u = v3(top[0] - bot[0], top[1] - bot[1], 0);
  const len = u.length();
  u.normalize();
  const n = v3(-u.y, u.x, 0);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(0, 0, 1), u, n));
  const at = (f, z, out = 0) => v3(bot[0], bot[1], z).addScaledVector(u, f * len).addScaledVector(n, out + lift);
  return { u, n, len, q, at, tilt: Math.atan2(u.x, u.y) };
}

function onFace(mesh, face, f, z, out) {
  mesh.quaternion.copy(face.q);
  mesh.position.copy(face.at(f, z, out));
  return mesh;
}

// Profile extruded across z0..z1; pass wallZ to pull anything outboard of the walls onto them.
function moulding(points, z0, z1, wallZ = null, bevel = 0.008) {
  const g = extrudeProfile(points, z1 - z0, bevel);
  g.translate(0, 0, (z0 + z1) / 2);
  if (!wallZ) return g;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const lim = wallZ(p.getX(i), p.getY(i));
    const z = p.getZ(i);
    if (Math.abs(z) > lim) p.setZ(i, Math.sign(z) * lim);
  }
  return g;
}

function atlasPlane(w, h, [px, py, pw, ph]) {
  const g = new THREE.PlaneGeometry(w, h);
  const u0 = px / ATLAS_W;
  const u1 = (px + pw) / ATLAS_W;
  const vt = 1 - py / ATLAS_H;
  const vb = 1 - (py + ph) / ATLAS_H;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, vt, u1, vt, u0, vb, u1, vb], 2));
  return g;
}

// Closed loop round a rounded rectangle of half-sizes a, b, corner radius r, as [u, v] pairs.
function roundedRect(a, b, r, per = 3) {
  const pts = [];
  for (const [cu, cv, a0] of [[a - r, b - r, 0], [r - a, b - r, 0.5], [r - a, r - b, 1], [a - r, r - b, 1.5]]) {
    for (let i = 0; i <= per; i++) {
      const t = Math.PI * (a0 + i / (2 * per));
      pts.push([cu + r * Math.cos(t), cv + r * Math.sin(t)]);
    }
  }
  return pts;
}

const pipe = (group, mat, pts, radius = 0.0035) => add(group, tube(pts, radius, pts.length * 2, 3, true), mat, { cast: false });

// ---------- instruments ----------

// Fascia: the satin-black instrument panel laid on a face, 8 mm proud.
function fascia(group, hm, face, z0, z1, f0, f1) {
  const g = new RoundedBoxGeometry(z1 - z0, (f1 - f0) * face.len, 0.01, 1, 0.003);
  onFace(add(group, g, hm.fascia), face, (f0 + f1) / 2, (z0 + z1) / 2, 0.003);
}

// Flush-mounted display on the fascia front: a thin gloss bezel with the glass just proud of it.
function flushScreen(group, hm, face, f, z, w, h, uv, rim = 0.011) {
  onFace(add(group, new RoundedBoxGeometry(w + 2 * rim, h + 2 * rim, 0.008, 1, 0.003), hm.bezel), face, f, z, 0.001);
  onFace(add(group, atlasPlane(w, h, uv), hm.screen, { cast: false }), face, f, z, 0.0065);
}

// Fixed-mount VHF: channel readout and two knobs in one bezel.
function vhfRadio(group, m, hm, face, f, z) {
  onFace(add(group, new RoundedBoxGeometry(0.2, 0.062, 0.01, 1, 0.003), hm.bezel), face, f, z, 0.001);
  onFace(add(group, atlasPlane(0.12, 0.036, VHF_UV), hm.screen, { cast: false }), face, f, z - 0.03, 0.0065);
  for (const dz of [0.05, 0.078]) {
    const knob = add(group, new THREE.CylinderGeometry(0.01, 0.011, 0.014, 10), m.rubber);
    knob.position.copy(face.at(f, z + dz, 0.012));
    knob.quaternion.setFromUnitVectors(v3(0, 1, 0), face.n);
  }
}

// Brushed alloy switch panel with rows of toggles, each with a status LED above it.
function switchPanel(group, m, hm, face, f, z, cols, rows) {
  const w = 0.03 * cols + 0.026;
  const h = 0.044 * rows + 0.014;
  onFace(add(group, new RoundedBoxGeometry(w, h, 0.006, 1, 0.002), m.galv), face, f, z, 0.002);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const dz = -w / 2 + 0.028 + c * 0.03;
      const up = h / 2 - 0.03 - r * 0.044;
      const base = face.at(f, z + dz, 0.005).addScaledVector(face.u, up);
      const nut = add(group, new THREE.CylinderGeometry(0.0055, 0.0055, 0.005, 6), m.stainless, { cast: false });
      nut.position.copy(base);
      nut.quaternion.setFromUnitVectors(v3(0, 1, 0), face.n);
      const lever = (r + c) % 3 === 0 ? -0.007 : 0.007;
      rod(group, base, base.clone().addScaledVector(face.n, 0.017).addScaledVector(face.u, lever), 0.0022, m.stainless, 6);
      const led = add(group, new THREE.BoxGeometry(0.005, 0.005, 0.003), hm.led, { cast: false });
      led.position.copy(base).addScaledVector(face.u, 0.017);
      led.quaternion.copy(face.q);
    }
  }
}

function compass(group, m, x, y, z, r = 0.058) {
  const base = add(group, new THREE.CylinderGeometry(r, r * 1.15, 0.034, 20), m.rubber);
  base.position.set(x, y + 0.015, z);
  const card = add(group, new THREE.CylinderGeometry(r * 0.78, r * 0.78, 0.016, 20), m.seat, { cast: false });
  card.position.set(x, y + 0.038, z);
  const lubber = add(group, new THREE.BoxGeometry(0.012, 0.004, 0.003), m.navRed, { cast: false });
  lubber.position.set(x + r * 0.62, y + 0.047, z);
  const dome = add(group, new THREE.SphereGeometry(r * 0.9, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), m.glass, { cast: false });
  dome.position.set(x, y + 0.031, z);
}

// Wheel on a tilt column: rubber boot from the dash, knuckle, then the shaft tilted a little
// further up to a dished three-spoke wheel. tilt is the face angle from vertical. Returns the rim centre.
function helmWheel(group, m, base, tilt, radius = 0.175) {
  const n = v3(-Math.cos(tilt), Math.sin(tilt), 0);
  const knuckle = base.clone().addScaledVector(n, 0.075);
  rod(group, base.clone().addScaledVector(n, -0.01), knuckle, 0.034, m.rubber, 14);
  const joint = add(group, new THREE.SphereGeometry(0.03, 10, 6), m.dash);
  joint.position.copy(knuckle);
  const axis = v3(-Math.cos(tilt + 0.16), Math.sin(tilt + 0.16), 0);
  const centre = knuckle.clone().addScaledVector(axis, 0.1);
  rod(group, knuckle, centre, 0.017, m.dash, 10);
  const hub = add(group, new THREE.CylinderGeometry(0.044, 0.05, 0.05, 18), m.rubber);
  hub.position.copy(centre);
  hub.quaternion.setFromUnitVectors(v3(0, 1, 0), axis);
  const cap = add(group, new THREE.CylinderGeometry(0.026, 0.026, 0.01, 18), m.stainless);
  cap.position.copy(centre).addScaledVector(axis, 0.028);
  cap.quaternion.copy(hub.quaternion);
  const rimC = centre.clone().addScaledVector(axis, 0.035);
  const rim = add(group, new THREE.TorusGeometry(radius, 0.0115, 8, 36), m.stainless);
  rim.position.copy(rimC);
  rim.quaternion.setFromUnitVectors(v3(0, 0, 1), axis);
  const across = v3(0, 0, 1);
  const up = new THREE.Vector3().crossVectors(axis, across);
  for (const a of [0, Math.PI, Math.PI * 1.5]) {
    const dir = across.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
    rod(group, centre.clone().addScaledVector(dir, 0.04), rimC.clone().addScaledVector(dir, radius - 0.008), 0.0085, m.rubber, 6);
  }
  return rimC;
}

// Top-mount throttle and shift binnacle on a flat at y; twin gets two levers with ball knobs.
function binnacle(group, m, x, y, z, twin) {
  const wz = twin ? 0.14 : 0.1;
  const body = add(group, new RoundedBoxGeometry(0.17, 0.1, wz, 2, 0.03), m.dash);
  body.position.set(x, y + 0.05, z);
  box(group, m.rubber, [0.18, 0.008, wz + 0.012], [x, y + 0.004, z]);
  const levers = twin ? [z - 0.034, z + 0.034] : [z];
  for (const zl of levers) {
    const pivot = add(group, new THREE.CylinderGeometry(0.024, 0.024, twin ? 0.026 : 0.04, 14), m.rubber);
    pivot.position.set(x + 0.01, y + 0.096, zl);
    pivot.rotation.x = Math.PI / 2;
    add(group, tube([v3(x + 0.01, y + 0.1, zl), v3(x - 0.01, y + 0.17, zl), v3(x - 0.05, y + 0.235, zl)], 0.0105, 10, 8), m.stainless);
    if (twin) {
      const knob = add(group, new THREE.SphereGeometry(0.022, 12, 8), m.rubber);
      knob.position.set(x - 0.055, y + 0.245, zl);
    } else {
      const grip = add(group, new THREE.CylinderGeometry(0.016, 0.016, 0.09, 14), m.rubber);
      grip.position.set(x - 0.052, y + 0.24, zl);
      grip.rotation.x = Math.PI / 2;
    }
  }
}

// Handset on a clip, with a coiled cord down to the panel; normal is the face it hangs on (+-z or -x).
function vhfHandset(group, m, at, normal) {
  const across = Math.abs(normal.z) > 0.5 ? v3(1, 0, 0) : v3(0, 0, 1);
  const clip = add(group, new THREE.BoxGeometry(0.03, 0.05, 0.03), m.rubber);
  clip.position.copy(at).addScaledVector(normal, 0.004);
  clip.quaternion.setFromUnitVectors(v3(0, 0, 1), normal);
  const handset = add(group, new RoundedBoxGeometry(0.055, 0.11, 0.032, 1, 0.013), m.rubber);
  handset.position.copy(at).addScaledVector(normal, 0.03).add(v3(0, -0.02, 0));
  handset.quaternion.setFromUnitVectors(v3(0, 0, 1), normal);
  const top = handset.position.clone().add(v3(0, -0.06, 0));
  const end = at.clone().addScaledVector(normal, 0.004).add(v3(0, -0.2, 0)).addScaledVector(across, 0.03);
  const pts = [];
  for (let i = 0; i <= 64; i++) {
    const s = i / 64;
    const a = s * Math.PI * 2 * 12;
    const coil = Math.sin(Math.PI * Math.min(1, s * 1.15)) * 0.008;
    pts.push(top.clone().lerp(end, s).addScaledVector(normal, Math.cos(a) * coil + 0.01 * Math.sin(Math.PI * s)).addScaledVector(across, Math.sin(a) * coil));
  }
  add(group, tube(pts, 0.0024, 72, 3), m.rubber, { cast: false });
}

// ---------- seats ----------

// Pedestal helm seat facing forward at (x, z): bolted base plate, alloy column, swivel head with
// lever, slide rails with the release bar, moulded shell, vinyl cushion with piping, flip-up
// front bolster and a winged backrest with pleat seams.
function pedestalSeat(group, m, hm, x, z, cushionTop = DECK_Y + 0.63) {
  const s = new THREE.Group();
  s.position.set(x, 0, z);
  group.add(s);
  const plate = add(s, new THREE.CylinderGeometry(0.16, 0.17, 0.014, 20), m.galv);
  plate.position.y = DECK_Y + 0.006;
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const bolt = add(s, new THREE.CylinderGeometry(0.009, 0.009, 0.008, 6), m.stainless, { cast: false });
    bolt.position.set(Math.cos(a) * 0.13, DECK_Y + 0.016, Math.sin(a) * 0.13);
  }
  const yHead = cushionTop - 0.19;
  const col = add(s, new THREE.CylinderGeometry(0.04, 0.048, yHead - DECK_Y - 0.03, 16), m.galv);
  col.position.y = (DECK_Y + 0.01 + yHead - 0.02) / 2;
  const collar = add(s, new THREE.CylinderGeometry(0.052, 0.052, 0.035, 16), m.dash);
  collar.position.y = yHead - 0.03;
  const swivel = add(s, new THREE.CylinderGeometry(0.1, 0.1, 0.022, 18), m.dash);
  swivel.position.y = yHead - 0.002;
  rod(s, v3(0.06, yHead, 0.07), v3(0.15, yHead - 0.01, 0.15), 0.006, m.rubber, 6);
  const knob = add(s, new THREE.SphereGeometry(0.014, 8, 6), m.rubber);
  knob.position.set(0.155, yHead - 0.01, 0.155);
  // Slide: carrier plate on the swivel, two rails under the shell, release bar at the front.
  box(s, m.galv, [0.3, 0.012, 0.3], [0, yHead + 0.015, 0]);
  for (const dz of [-0.13, 0.13]) box(s, m.stainless, [0.4, 0.02, 0.024], [0.01, yHead + 0.031, dz]);
  add(s, tube([v3(0.2, yHead + 0.032, -0.09), v3(0.245, yHead + 0.025, -0.06), v3(0.25, yHead + 0.024, 0), v3(0.245, yHead + 0.025, 0.06), v3(0.2, yHead + 0.032, 0.09)], 0.006, 12, 5), m.stainless, { cast: false });
  // Shell and cushion.
  const shellY = yHead + 0.066;
  const shell = add(s, new RoundedBoxGeometry(0.46, 0.05, 0.48, 1, 0.02), hm.shell);
  shell.position.set(0.01, shellY, 0);
  const cushion = add(s, new RoundedBoxGeometry(0.4, 0.1, 0.46, 2, 0.035), hm.vinyl);
  cushion.position.set(-0.01, cushionTop - 0.05, 0);
  pipe(s, hm.piping, roundedRect(0.2 - 0.008, 0.23 - 0.008, 0.03).map(([u, w]) => v3(-0.01 + u, cushionTop - 0.011, w)));
  for (const dz of [-0.075, 0.075]) box(s, hm.piping, [0.28, 0.004, 0.004], [-0.02, cushionTop + 0.0005, dz], { cast: false });
  // Flip-up bolster across the front.
  const bolster = add(s, new RoundedBoxGeometry(0.11, 0.1, 0.46, 2, 0.045), hm.vinyl);
  bolster.position.set(0.2, cushionTop - 0.03, 0);
  // Backrest, reclined, with wings, pleat seams and a moulded shell.
  const back = new THREE.Group();
  back.position.set(-0.19, cushionTop - 0.03, 0);
  back.rotation.z = 0.2;
  s.add(back);
  const pad = add(back, new RoundedBoxGeometry(0.085, 0.42, 0.42, 2, 0.035), hm.vinyl);
  pad.position.set(0, 0.23, 0);
  const shellB = add(back, new RoundedBoxGeometry(0.04, 0.54, 0.46, 1, 0.015), hm.shell);
  shellB.position.set(-0.055, 0.17, 0);
  for (const side of [-1, 1]) {
    const wing = add(back, new RoundedBoxGeometry(0.1, 0.38, 0.075, 2, 0.032), hm.vinyl);
    wing.position.set(0.02, 0.22, side * 0.195);
    rod(back, v3(0.044, 0.05, side * 0.159), v3(0.044, 0.4, side * 0.159), 0.0035, hm.piping, 4);
  }
  for (const y of [0.16, 0.3]) box(back, hm.piping, [0.004, 0.004, 0.31], [0.0425, y, 0], { cast: false });
  rod(back, v3(0.032, 0.43, -0.159), v3(0.032, 0.43, 0.159), 0.0035, hm.piping, 4);
}

// ---------- hardtop ----------

export function hardtopHelm(group, m, { C, hw, wallZ }, { twin = false } = {}) {
  const hm = helmMaterials();
  const [Cx, Cy] = C;
  const walls = (x, y) => wallZ(x, y) - 0.004;
  const xB = Cx - 0.07;         // forward bulkhead, just aft of the screen foot
  const dTop = Cy + 0.035;      // dash top, just below the window sills
  const xT = xB - 0.27;         // aft edge of the dash top, under the brow
  const yKnee = DECK_Y + 0.58;  // underside of the helm pod where it meets the bulkhead
  const wHelm = walls(xT, dTop - 0.2);
  const zw = wHelm - 0.4;       // wheel and helm seat centreline
  // MFD sized to the dash: 9" on the 550, 10" on the 620, 12" on the 680.
  const diag = (wHelm > 0.82 ? 12 : wHelm > 0.77 ? 10 : 9) * 0.0254;
  const mfdW = diag * 0.848;
  const mfdH = diag * 0.53;
  const zM = zw - 0.175 - 0.03 - mfdW / 2;
  const zIn = zM - mfdW / 2 - 0.06;  // inboard cheek of the helm pod

  // Dash top wall to wall: nose tucked under the screen foot, flat top, rounded brow lip.
  add(group, moulding([[Cx - 0.005, Cy - 0.05], [Cx - 0.005, Cy - 0.022], [xB, dTop], [xT + 0.02, dTop], [xT - 0.012, dTop - 0.012], [xT - 0.014, dTop - 0.04], [xT + 0.04, dTop - 0.05], [xB + 0.03, Cy - 0.05]], -1.5, 1.5, walls), m.trim);
  // Anti-glare top.
  // (The moulding's 8 mm bevel puts its skin at dTop + 0.008; the cap's top is at dTop + 0.015.)
  add(group, moulding([[xT + 0.03, dTop + 0.004], [xB - 0.012, dTop + 0.004], [xB - 0.012, dTop + 0.012], [xT + 0.03, dTop + 0.012]], -1.5, 1.5, (x, y) => walls(x, y) - 0.01, 0.003), hm.fascia);
  const yDeck = dTop + 0.013;  // what stands on the dash top is sunk 2 mm into the cap
  // Helm pod: raked face under the brow, underside sweeping forward to the bulkhead.
  const fTop = [xT + 0.03, dTop - 0.04];
  const fBot = [xT - 0.11, dTop - 0.37];
  add(group, moulding([fTop, fBot, [xT - 0.085, dTop - 0.405], [xB, yKnee], [xB + 0.03, yKnee], [xB + 0.03, dTop - 0.045]], zIn, 1.5, walls), m.trim);
  // Passenger dash: shallow, near-vertical face, a step back from the helm pod.
  add(group, moulding([[xT + 0.03, dTop - 0.04], [xT + 0.008, dTop - 0.15], [xT + 0.03, dTop - 0.185], [xB, dTop - 0.25], [xB + 0.03, dTop - 0.25], [xB + 0.03, dTop - 0.045]], -1.5, zIn, walls), m.trim);

  // Forward bulkhead with the cuddy entrance under the passenger dash.
  const door = { z0: -(walls(xB, DECK_Y + 0.5) - 0.13), z1: zIn - 0.07, y0: DECK_Y + 0.1, y1: dTop - 0.33, r: 0.12 };
  bulkhead(group, m, xB, DECK_Y, dTop - 0.04, (y) => walls(xB, y), door);

  // Fascia and instruments on the helm face.
  const face = rakedFace(fBot, fTop, 0.008);
  const front = rakedFace(fBot, fTop, 0.016);
  const fl = (metres) => metres / face.len;
  const zF0 = zIn + 0.025;
  const zF1 = walls(xT - 0.04, dTop - 0.1) - 0.035;
  fascia(group, hm, face, zF0, zF1, 0.07, 0.93);
  const fMfd = 0.9 - fl(mfdH / 2 + 0.011);
  flushScreen(group, hm, front, fMfd, zM, mfdW, mfdH, MFD_UV);
  vhfRadio(group, m, hm, front, fMfd - fl(mfdH / 2 + 0.011 + 0.045), zM);
  flushScreen(group, hm, front, 0.9 - fl(0.05), zw, 0.1, 0.075, ENGINE_UV);
  switchPanel(group, m, hm, front, 0.42, Math.min(zw + 0.255, zF1 - 0.07), 3, 3);
  const key = add(group, new THREE.CylinderGeometry(0.016, 0.018, 0.01, 14), m.stainless);
  key.position.copy(front.at(0.16, Math.min(zw + 0.255, zF1 - 0.07), 0.004));
  key.quaternion.setFromUnitVectors(v3(0, 1, 0), front.n);
  const wheel = helmWheel(group, m, front.at(0.5, zw, 0), face.tilt);
  compass(group, m, xT + 0.12, yDeck, zw);
  binnacle(group, m, xT + 0.115, yDeck, walls(xT + 0.115, dTop + 0.2) - (twin ? 0.1 : 0.08), twin);
  vhfHandset(group, m, v3(xT + 0.04, dTop - 0.25, zIn - 0.008), v3(0, 0, -1));

  // Passenger grab rail along the port dash.
  const gz0 = -(walls(xT, dTop - 0.1) - 0.1);
  const gz1 = zIn - 0.1;
  const gx = xT - 0.055;
  add(group, tube([v3(xT + 0.012, dTop - 0.1, gz0), v3(gx, dTop - 0.1, gz0 + 0.04), v3(gx, dTop - 0.1, gz1 - 0.04), v3(xT + 0.012, dTop - 0.1, gz1)], 0.012, 16, 6), m.stainless);

  // Footrest bar under the helm on the bulkhead.
  add(group, tube([v3(xB, DECK_Y + 0.22, zw - 0.2), v3(xB - 0.13, DECK_Y + 0.24, zw - 0.17), v3(xB - 0.13, DECK_Y + 0.24, zw + 0.17), v3(xB, DECK_Y + 0.22, zw + 0.2)], 0.0125, 16, 6), m.stainless);

  // Helm and passenger seats, cushion front about a third of a metre aft of the wheel rim.
  const seatX = wheel.x - 0.6;
  pedestalSeat(group, m, hm, seatX, zw);
  pedestalSeat(group, m, hm, seatX, -zw);
}

// Rounded-top doorway outline in the bulkhead's shape plane (X = -z, Y = y), grown by g.
function doorShape({ z0, z1, y0, y1, r }, g = 0) {
  const a = -z1 - g;
  const b = -z0 + g;
  const top = y1 + g;
  const rr = r + g;
  const s = new THREE.Shape();
  s.moveTo(a, y0 - g);
  s.lineTo(b, y0 - g);
  s.lineTo(b, top - rr);
  s.absarc(b - rr, top - rr, rr, 0, Math.PI / 2, false);
  s.lineTo(a + rr, top);
  s.absarc(a + rr, top - rr, rr, Math.PI / 2, Math.PI, false);
  s.closePath();
  return s;
}

// Shape-plane geometry stood up in the y-z plane at x (X = -z maps back to +z).
const standUp = (g, x) => g.rotateY(Math.PI / 2).translate(x, 0, 0);

// Forward bulkhead wall to wall at x from y0 to y1, with a flanged doorway and a dark curtain.
function bulkhead(group, m, x, y0, y1, zAt, door) {
  const ys = Array.from({ length: 7 }, (_, i) => lerp(y0, y1, i / 6));
  const outline = [...ys.map((y) => [-zAt(y), y]), ...ys.slice().reverse().map((y) => [zAt(y), y])];
  const shape = new THREE.Shape(outline.map(([X, Y]) => new THREE.Vector2(X, Y)));
  shape.holes.push(doorShape(door, 0.02));
  add(group, standUp(new THREE.ShapeGeometry(shape, 6), x), m.trim);
  const flange = doorShape(door, 0.04);
  flange.holes.push(doorShape(door, 0));
  add(group, standUp(new THREE.ExtrudeGeometry(flange, { depth: 0.06, bevelEnabled: false, curveSegments: 6 }), x - 0.016), m.trim);
  add(group, standUp(new THREE.ShapeGeometry(doorShape(door, 0.002), 6), x + 0.04), m.dash, { cast: false });
  const edge = [];
  for (const p of doorShape(door, 0.004).getPoints(6)) {
    const q = v3(x - 0.016, p.y, -p.x);
    if (!edge.length || q.distanceTo(edge[edge.length - 1]) > 1e-4) edge.push(q);
  }
  if (edge[0].distanceTo(edge[edge.length - 1]) < 1e-4) edge.pop();
  add(group, tube(edge, 0.006, edge.length * 2, 4, true), m.rubber, { cast: false });
}

// ---------- centre console ----------

export function consoleHelm(group, m, { cx0, top, Wc, yTop, postX }, { twin = false } = {}) {
  const hm = helmMaterials();
  const yA = yTop(cx0);
  // Instrument pod on the console top, to port of the throttle pad.
  const zP0 = -0.3;
  const zP1 = 0.17;
  const pBot = [cx0 + 0.035, yA + 0.03];
  const pTop = [cx0 + 0.165, yA + 0.215];
  add(group, moulding([[cx0 + 0.02, yA - 0.03], [cx0 + 0.02, yA + 0.015], pBot, pTop, [cx0 + 0.14, yA + 0.235], [cx0 + 0.16, yA + 0.25], [cx0 + 0.25, yA + 0.25], [cx0 + 0.285, yA + 0.15], [cx0 + 0.285, yA - 0.03]], zP0, zP1), m.trim);
  const face = rakedFace(pBot, pTop, 0.008);
  const front = rakedFace(pBot, pTop, 0.016);
  const fl = (metres) => metres / face.len;
  fascia(group, hm, face, zP0 + 0.025, zP1 - 0.025, 0.06, 0.93);
  const diag = 10 * 0.0254;
  const mfdW = diag * 0.848;
  const mfdH = diag * 0.53;
  const zM = zP0 + 0.035 + mfdW / 2 + 0.011;
  flushScreen(group, hm, front, 0.5, zM, mfdW, mfdH, MFD_UV);
  flushScreen(group, hm, front, 0.88 - fl(0.04), zM + mfdW / 2 + 0.011 + 0.064, 0.08, 0.06, ENGINE_UV);
  const key = add(group, new THREE.CylinderGeometry(0.014, 0.016, 0.01, 14), m.stainless);
  key.position.copy(front.at(0.25, zM + mfdW / 2 + 0.075, 0.004));
  key.quaternion.setFromUnitVectors(v3(0, 1, 0), front.n);
  compass(group, m, cx0 + 0.205, yA + 0.255, (zP0 + zP1) / 2, 0.045);

  // Aft face: wheel on a mounting pad, switch panel and VHF to port, handset to starboard.
  const aft = rakedFace([cx0, DECK_Y], [cx0, yA]);
  const fa = (y) => (y - DECK_Y) / (yA - DECK_Y);
  const zW = -0.01;
  const pad = add(group, new THREE.CylinderGeometry(0.075, 0.08, 0.02, 20), hm.fascia);
  pad.position.set(cx0 - 0.004, yA - 0.13, zW);
  pad.rotation.z = Math.PI / 2;
  helmWheel(group, m, v3(cx0 - 0.012, yA - 0.13, zW), 0.32);
  fascia(group, hm, aft, -0.345, -0.135, fa(yA - 0.31), fa(yA - 0.06));
  const panelFront = rakedFace([cx0, DECK_Y], [cx0, yA], 0.008);
  switchPanel(group, m, hm, panelFront, fa(yA - 0.115), -0.24, 4, 2);
  vhfRadio(group, m, hm, panelFront, fa(yA - 0.255), -0.24);
  const thrZ = Math.min(0.26, Wc / 2 - 0.16);
  binnacle(group, m, cx0 + 0.11, yTop(cx0 + 0.11) - 0.003, thrZ, twin);
  vhfHandset(group, m, v3(cx0 - 0.002, yA - 0.2, thrZ), v3(-1, 0, 0));
  add(group, tube([v3(cx0 + 0.005, DECK_Y + 0.2, -0.28), v3(cx0 - 0.12, DECK_Y + 0.22, -0.25), v3(cx0 - 0.12, DECK_Y + 0.22, 0.25), v3(cx0 + 0.005, DECK_Y + 0.2, 0.28)], 0.0125, 16, 6), m.stainless);

  leaningPost(group, m, hm, postX);
}

// Leaning post: moulded tackle module with drawers on its aft face, vinyl bolster on top,
// stainless frame carrying the backrest and a top rail (the rocket launcher option sits on it,
// at postX - 0.3, DECK_Y + 1.26), rod holders behind and a footrest bar in front.
function leaningPost(group, m, hm, postX) {
  const xp = postX - 0.12;
  const W = 0.72;
  const yBase = DECK_Y + 0.68;
  const base = add(group, new RoundedBoxGeometry(0.4, yBase - DECK_Y, W, 2, 0.03), m.trim);
  base.position.set(xp, (DECK_Y + yBase) / 2 - 0.002, 0);
  // Tackle drawers: three faces with pulls on the aft side.
  for (const [y, h] of [[DECK_Y + 0.15, 0.12], [DECK_Y + 0.29, 0.12], [DECK_Y + 0.46, 0.17]]) {
    const face = add(group, new RoundedBoxGeometry(0.014, h, W - 0.12, 1, 0.004), m.dash);
    face.position.set(xp - 0.2 - 0.001, y + h / 2, 0);
    rod(group, v3(xp - 0.214, y + h / 2 + 0.02, -0.08), v3(xp - 0.214, y + h / 2 + 0.02, 0.08), 0.006, m.stainless, 6);
  }
  // Bolster.
  const yB = yBase + 0.06;
  const bolster = add(group, new RoundedBoxGeometry(0.3, 0.13, W - 0.02, 2, 0.055), hm.vinyl);
  bolster.position.set(xp + 0.03, yB, 0);
  pipe(group, hm.piping, roundedRect(0.15 - 0.012, (W - 0.02) / 2 - 0.012, 0.04).map(([u, w]) => v3(xp + 0.03 + u, yB + 0.052, w)));
  // Frame: uprights from the module's aft corners up to the top rail, then across.
  const xr = postX - 0.3;
  const yr = DECK_Y + 1.26;
  for (const side of [-1, 1]) {
    add(group, tube([v3(xp - 0.16, yBase - 0.02, side * 0.3), v3(xp - 0.175, yBase + 0.3, side * 0.3), v3(xr, yr - 0.05, side * 0.3), v3(xr, yr, side * 0.27)], 0.019, 20, 8), m.stainless);
    const plate = add(group, new THREE.CylinderGeometry(0.035, 0.035, 0.008, 14), m.stainless);
    plate.position.set(xp - 0.16, yBase + 0.002, side * 0.3);
  }
  rod(group, v3(xr, yr, -0.275), v3(xr, yr, 0.275), 0.016, m.stainless);
  // Backrest pad on the uprights.
  const lean = Math.atan2(xp - 0.175 - xr, yr - 0.05 - yBase - 0.3);
  const back = add(group, new RoundedBoxGeometry(0.08, 0.3, W - 0.12, 2, 0.035), hm.vinyl);
  back.position.set(lerp(xp - 0.175, xr, 0.5) + 0.06, (yBase + 0.3 + yr - 0.05) / 2, 0);
  back.rotation.z = lean;
  // Rod holders on a cross bar behind the backrest.
  const yh = DECK_Y + 0.86;
  rod(group, v3(xp - 0.17, yh, -0.3), v3(xp - 0.17, yh, 0.3), 0.012, m.stainless);
  for (const z of [-0.2, 0, 0.2]) {
    const a = v3(xp - 0.175, yh - 0.12, z);
    const b = v3(xp - 0.235, yh + 0.12, z);
    rod(group, a, b, 0.022, m.stainless);
    const cap = add(group, new THREE.CircleGeometry(0.017, 12), m.rubber, { cast: false });
    cap.position.copy(b).addScaledVector(b.clone().sub(a).normalize(), 0.0012);
    cap.quaternion.setFromUnitVectors(v3(0, 0, 1), b.clone().sub(a).normalize());
  }
  // Footrest bar across the front.
  add(group, tube([v3(xp + 0.198, DECK_Y + 0.2, -0.27), v3(xp + 0.27, DECK_Y + 0.21, -0.24), v3(xp + 0.27, DECK_Y + 0.21, 0.24), v3(xp + 0.198, DECK_Y + 0.2, 0.27)], 0.0125, 16, 6), m.stainless);
}
