import * as THREE from 'three';
import { Builder, mat } from './builder.js';
import { surface, paint } from './surface.js';
import { DOCK } from './dock.js';
import { SHIPS, hullGeometry } from './ships.js';
import { mulberry32 } from './textures.js';
import { ropeMaterial } from './ships/materials.js';

// Berth 44 at 11:50 on 10 April 1912, in the dock frame: Titanic's mooring lines to the
// quay bollards, covered gangways from the passenger gallery, floating timber camels
// between hull and quay wall, and the last luggage / mail / stores on the apron.

const Q = DOCK.Q;

function catenary(a, b, sag, n = 18) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function buildBerth44(M, { slotX = -70, beam = SHIPS.titanic.B, bollards = [] } = {}) {
  const group = new THREE.Group();
  group.name = 'Berth44';
  const E = DOCK.east;
  const hullZ = E.z + 1.6; // ship's port side
  const spec = SHIPS.titanic, hull = hullGeometry(spec);
  const centreZ = hullZ + beam / 2;
  const trim = Math.asin((spec.draftAft - spec.draftForward) / spec.L);
  const shipPoint = (x, y, z) => new THREE.Vector3(slotX + x * Math.cos(trim) - y * Math.sin(trim), x * Math.sin(trim) + y * Math.cos(trim), centreZ + z);
  group.userData.realism = { lines: [], camels: [] };
  hull.geometry.dispose();
  const rnd = mulberry32(44);
  const rope = ropeMaterial({ radius: 0.1, color: 0x9a8967, vertexColors: false, roughness: 0.95, name: 'hemp-hawser' });
  const ropeCompile = rope.onBeforeCompile;
  rope.onBeforeCompile = (shader, renderer) => {
    ropeCompile(shader,renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>','#include <common>\nattribute float aRopeDistance; varying vec2 vHempUv;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvHempUv=vec2(aRopeDistance,uv.y);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec2 vHempUv;')
      .replace('#include <map_fragment>',`#include <map_fragment>
        float strandPhase=vHempUv.x*34.9-vHempUv.y*18.8496;
        float strandFade=1.0-smoothstep(0.3,1.7,fwidth(strandPhase));
        float strand=0.5+0.5*cos(strandPhase);
        diffuseColor.rgb*=mix(0.87,0.66+0.34*strand,strandFade);
      `);
  };
  rope.customProgramCacheKey = () => 'berth-hemp-hawser-v1';
  const ropeGeometry = (geometry,length) => {
    const uv=geometry.attributes.uv;
    const distance=new Float32Array(uv.count);
    for(let i=0;i<uv.count;i++) distance[i]=uv.getX(i)*length;
    geometry.setAttribute('aRopeDistance',new THREE.BufferAttribute(distance,1));
    return geometry;
  };

  // ---------------------------------------------------------------- mooring lines
  // [ship-local x of fairlead, fairlead drop below deck edge, target dock x (snapped to a bollard), sag]
  const deckAt = hull.S;
  const quayBollards = bollards.filter((p) => p.z < 0).map((p) => p.x);
  const snap = (x) => quayBollards.reduce((a, c) => (Math.abs(c - x) < Math.abs(a - x) ? c : a), quayBollards[0] ?? x);
  const lines = [
    [122, 0.8, 104, 2.2], [119, 0.8, 94, 2.0], [112, 1.6, 72, 1.4], // head lines & bow breast
    [50, 3.0, -95, 1.6], [44, 3.0, -102, 1.6], // forward springs leading aft
    [-60, 3.0, -100, 1.6], [-66, 3.0, -106, 1.6], // aft springs leading forward
    [-94, 0.8, -208, 2.6], [-102, 0.8, -208, 2.4], [-112, 1.6, -184, 1.8], // stern lines to the berth's end bollards & breast
  ];
  for (const [lx, drop, tx, sag] of lines) {
    const bx = snap(tx);
    const ly = deckAt(lx) - drop;
    const a = shipPoint(lx, ly, -hull.hbAt(lx, ly) - 0.04);
    const b = new THREE.Vector3(bx, Q + 0.78, E.z - 2.2);
    // lead out of the fairlead, then a sagging bight down to the bollard
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      p.y -= sag * 4 * t * (1 - t);
      pts.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const mesh = new THREE.Mesh(ropeGeometry(new THREE.TubeGeometry(curve, 48, 0.1, 8, false),curve.getLength()), rope);
    mesh.castShadow = true;
    group.add(mesh);
    group.userData.realism.lines.push({ localX: lx, ship: a.toArray(), quay: b.toArray(), spring: lx === 50 || lx === 44 || lx === -60 || lx === -66 });
    // eye spliced over the bollard head
    const eye = new THREE.Mesh(ropeGeometry(new THREE.TorusGeometry(0.3, 0.07, 7, 16),Math.PI*0.6), rope);
    eye.position.set(bx, Q + 0.62, E.z - 2.2); eye.rotation.x = Math.PI / 2 - 0.25;
    group.add(eye);
    // oval fairlead / mooring port in the shell plating
    const port = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.25, 16).rotateX(Math.PI / 2).scale(1.3, 0.8, 1), M.castIron);
    port.position.copy(a).add(new THREE.Vector3(0, 0, -0.05));
    group.add(port);
  }

  const b = new Builder(M);

  // ---------------------------------------------------------------- floating camels (timber fenders)
  for (const x of [-175, -118, -62, -8, 46, 102]) {
    const lx = x - slotX;
    if (Math.abs(lx) + 6 > spec.L / 2) continue;
    const sideZ = centreZ - hull.hbAt(lx, 0);
    const gap = sideZ - E.z;
    // Short timber camels work along the parallel body, not across the tapered bow gap.
    if (gap < 1.25 || gap > 2.8) continue;
    const zc = (sideZ + E.z) / 2;
    const width = gap - 0.12;
    group.userData.realism.camels.push({ x, gap, z: zc, width });
    b.box('fender', x - 6, -0.55, zc - width / 2, 12, 1.1, width);
    b.box('timberDark', x - 6, 0.45, zc - width / 2 - 0.02, 12, 0.14, width + 0.04);
    // chains up to the coping
    for (const dx of [-4.5, 4.5]) b.rod('castIron', [x + dx, 0.5, zc], [x + dx, Q - 0.2, E.z - 0.4], 0.03, 4);
  }

  // ---------------------------------------------------------------- covered gangways from the gallery
  const galleryY = Q + DOCK.galleryY;
  const galleryEdge = E.z - DOCK.eastApron + 4.2;
  for (const [lx, doorY] of [[52, 7.4], [-8, 7.0]]) {
    const x = slotX + lx;
    const a = [x, galleryY + 0.1, galleryEdge - 0.4];
    const c = [x, doorY, hullZ - 0.1];
    const len = Math.hypot(c[1] - a[1], c[2] - a[2]);
    const ang = Math.atan2(c[1] - a[1], c[2] - a[2]);
    const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    const w = 2.1;
    // deck
    b.add('timber', new THREE.BoxGeometry(w, 0.18, len), mat(mid[0], mid[1], mid[2], -ang, 0, 0));
    // side lattice girders
    for (const s of [-1, 1]) {
      const ox = s * (w / 2);
      b.strut('steel', [a[0] + ox, a[1] + 0.1, a[2]], [c[0] + ox, c[1] + 0.1, c[2]], 0.12, 0.12);
      b.strut('steel', [a[0] + ox, a[1] + 1.25, a[2]], [c[0] + ox, c[1] + 1.25, c[2]], 0.1, 0.1);
      const n = 7;
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const p0 = [a[0] + ox, a[1] + (c[1] - a[1]) * t0, a[2] + (c[2] - a[2]) * t0];
        const p1 = [a[0] + ox, a[1] + (c[1] - a[1]) * t1, a[2] + (c[2] - a[2]) * t1];
        b.strut('steel', [p0[0], p0[1] + 0.1, p0[2]], [p1[0], p1[1] + 1.25, p1[2]], 0.05, 0.05);
      }
    }
    // canvas canopy on hoops
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const y = a[1] + (c[1] - a[1]) * t + 2.2, z = a[2] + (c[2] - a[2]) * t;
      b.box('timberDark', x - w / 2 - 0.05, y - 1.1, z - 0.05, 0.1, 1.3, 0.1);
      b.box('timberDark', x + w / 2 - 0.05, y - 1.1, z - 0.05, 0.1, 1.3, 0.1);
    }
    // pitched canvas cover on a light timber frame (not a round duct)
    for (const sg of [-1, 1]) {
      const pitch = new THREE.BoxGeometry(w * 0.62, 0.05, len + 0.2);
      b.add('canvas', pitch, mat(mid[0] + sg * w * 0.26, mid[1] + 2.35, mid[2], -ang, 0, sg * 0.42));
      b.add('timberDark', new THREE.BoxGeometry(0.1, 1.15, len), mat(mid[0] + sg * (w / 2 + 0.02), mid[1] + 1.8, mid[2], -ang, 0, 0));
    }
    b.add('timberDark', new THREE.BoxGeometry(0.12, 0.12, len + 0.2), mat(mid[0], mid[1] + 2.62, mid[2], -ang, 0, 0));
    // hanging tackle from a gallery davit
    b.strut('steel', [x, galleryY + 3.0, galleryEdge - 0.2], [x, galleryY + 3.0, galleryEdge + 3.5], 0.18, 0.18);
    b.rod('castIron', [x - 0.8, galleryY + 3.0, galleryEdge + 3.4], [x - 0.8, mid[1] + 1.4, mid[2]], 0.02, 3);
    b.rod('castIron', [x + 0.8, galleryY + 3.0, galleryEdge + 3.4], [x + 0.8, mid[1] + 1.4, mid[2]], 0.02, 3);
    // door opening on the hull
    b.box('white', x - 1.45, doorY - 0.2, hullZ - 0.3, 2.9, 2.7, 0.12);
    b.box('black', x - 1.2, doorY, hullZ - 0.42, 2.4, 2.3, 0.14);
  }

  // ---------------------------------------------------------------- the apron: luggage, mails and stores
  const apronZ0 = E.z - DOCK.eastApron + 1.2, apronZ1 = E.z - 11.2; // landward of the crane rails
  const crates = [], trunks = [], sacks = [];
  const pile = (list, cx, cz, n, sx, sy, sz, spread) => {
    for (let i = 0; i < n; i++) {
      const h = Math.floor(rnd() * 3);
      list.push([cx + (rnd() - 0.5) * spread, Q + 0.03 + h * sy + sy / 2, cz + (rnd() - 0.5) * spread * 0.4, rnd() * 0.3 - 0.15, sx * (0.8 + rnd() * 0.4), sy * (0.85 + rnd() * 0.3), sz * (0.8 + rnd() * 0.4)]);
    }
  };
  for (const x of [-190, -160, -128, -96, -58, -30]) {
    const cz = apronZ0 + 1.2 + rnd() * (apronZ1 - apronZ0 - 2.4);
    if (rnd() < 0.5) pile(trunks, x + rnd() * 8, cz, 10 + Math.floor(rnd() * 10), 0.9, 0.6, 0.55, 5);
    if (rnd() < 0.7) pile(crates, x + 10 + rnd() * 8, cz, 6 + Math.floor(rnd() * 8), 1.4, 1.0, 1.1, 6);
    pile(sacks, x + 18, cz, 12, 0.9, 0.4, 0.6, 4);
    // flat four-wheel platform trucks
    for (let k = 0; k < 2; k++) {
      const tx = x + rnd() * 20, tz = apronZ0 + 1 + rnd() * 3, ry = rnd() * 0.6 - 0.3;
      b.add('timber', new THREE.BoxGeometry(3.2, 0.12, 1.4), mat(tx, Q + 0.55, tz, 0, ry, 0));
      for (const [ox, oz] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) {
        b.add('castIron', new THREE.CylinderGeometry(0.25, 0.25, 0.1, 10).rotateX(Math.PI / 2), mat(tx + ox * Math.cos(ry), Q + 0.28, tz + oz - ox * Math.sin(ry), 0, ry, 0));
      }
      b.add('timber', new THREE.BoxGeometry(0.08, 0.9, 1.3), mat(tx - 1.6 * Math.cos(ry), Q + 1.0, tz + 1.6 * Math.sin(ry), 0, ry, 0));
    }
  }
  const inst = (list, geo, material) => {
    const im = new THREE.InstancedMesh(geo, material, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach(([x, y, z, ry, sx, sy, sz], i) => {
      im.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, ry, 0)), new THREE.Vector3(sx, sy, sz)));
    });
    im.castShadow = im.receiveShadow = true;
    return im;
  };
  const trunkMat = surface({ set: 'planks', scale: 0.6, color: 0x4a3526, roughness: 0.7, grime: 0.3, instanceLocal: true, name: 'trunk' });
  group.add(inst(crates, new THREE.BoxGeometry(1, 1, 1), M.crate));
  group.add(inst(trunks, new THREE.BoxGeometry(1, 1, 1), trunkMat));
  const sackMat = surface({ set: 'concrete', scale: 0.8, color: 0xa08a66, roughness: 1, grime: 0.35, instanceLocal: true, name: 'mailSack' });
  // mail sacks: a soft box (sphere pushed toward a cube), tied neck at one end
  const sackGeo = new THREE.SphereGeometry(0.5, 12, 8);
  {
    const pa = sackGeo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pa, i);
      const cube = new THREE.Vector3(Math.sign(v.x), Math.sign(v.y), Math.sign(v.z)).multiplyScalar(0.45);
      v.lerp(new THREE.Vector3(Math.abs(v.x) > 0.3 ? cube.x : v.x, Math.abs(v.y) > 0.3 ? cube.y : v.y, Math.abs(v.z) > 0.3 ? cube.z : v.z), 0.55);
      if (v.x > 0.25) { v.y *= 0.7; v.z *= 0.7; } // gathered neck
      pa.setXYZ(i, v.x * 1.25, v.y * 0.55, v.z * 0.8);
    }
    sackGeo.computeVertexNormals();
  }
  group.add(inst(sacks, sackGeo, sackMat));

  // a wheeled gangway tower parked by the shed
  {
    const x = -140, z = E.z - 8.8;
    for (const [ox, oz] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2]]) b.box('steel', x + ox - 0.1, Q, z + oz - 0.1, 0.2, 9, 0.2);
    for (let y = 1.5; y < 9; y += 2.2) {
      b.strut('steel', [x - 1.5, Q + y, z - 1.2], [x + 1.5, Q + y + 2.0, z - 1.2], 0.06);
      b.strut('steel', [x - 1.5, Q + y, z + 1.2], [x + 1.5, Q + y + 2.0, z + 1.2], 0.06);
    }
    b.box('timber', x - 1.7, Q + 9, z - 1.4, 3.4, 0.2, 2.8);
    b.box('shedTrim', x - 1.7, Q + 9.2, z - 1.4, 3.4, 1.0, 0.06);
  }

  // ---------------------------------------------------------------- the 09:45 Waterloo boat train at the shed platform
  {
    const zT = E.z - DOCK.eastApron - DOCK.shedDepth - 1.5 - 3.8; // first siding landward of shed 44
    const railTop = Q + 0.43;
    // raised boat-train platform between the shed's landward wall and the siding
    const zWall = E.z - DOCK.eastApron - DOCK.shedDepth;
    b.box('setts', -215, Q, zT + 1.55, 190, 0.85, zWall - (zT + 1.55) - 0.1);
    b.box('stone', -215, Q + 0.72, zT + 1.5, 190, 0.18, 0.5);
    let x = -48;
    // Drummond 4-4-0 + tender, facing out toward the dock gate (north)
    const loco = (x0) => {
      b.box('black', x0 - 0.2, railTop + 0.9, zT - 1.35, 10.6, 0.3, 2.7); // running plate
      b.add('locoGreen', new THREE.CylinderGeometry(0.78, 0.78, 6.2, 16).rotateZ(Math.PI / 2), mat(x0 + 5.6, railTop + 2.15, zT));
      b.add('black', new THREE.CylinderGeometry(0.82, 0.82, 1.3, 16).rotateZ(Math.PI / 2), mat(x0 + 9.3, railTop + 2.15, zT));
      b.add('black', new THREE.CylinderGeometry(0.3, 0.26, 1.0, 16), mat(x0 + 9.4, railTop + 3.35, zT));
      b.add('black', new THREE.CylinderGeometry(0.36, 0.36, 0.12, 16), mat(x0 + 9.4, railTop + 3.86, zT)); // chimney cap
      for (const bx of [x0 + 3.2, x0 + 5.0, x0 + 6.8, x0 + 8.5]) b.add('black', new THREE.CylinderGeometry(0.8, 0.8, 0.07, 18).rotateZ(Math.PI / 2), mat(bx, railTop + 2.15, zT)); // boiler bands
      b.add('castIron', new THREE.CylinderGeometry(0.12, 0.14, 0.5, 10), mat(x0 + 3.8, railTop + 3.1, zT)); // safety valves
      for (const s of [-1, 1]) b.add('locoGreen', new THREE.CylinderGeometry(1.08, 1.08, 0.3, 18, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), mat(x0 + 2.5, railTop + 1.05, zT + s * 1.0)); // splashers
      b.box('black', x0 + 9.95, railTop + 0.6, zT - 1.35, 0.25, 0.5, 2.7); // buffer beam
      b.add('locoGreen', new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(x0 + 5.8, railTop + 2.9, zT));
      b.box('locoGreen', x0 - 0.2, railTop + 1.2, zT - 1.35, 2.6, 2.6, 2.7); // cab
      b.box('black', x0 - 0.4, railTop + 3.8, zT - 1.45, 3.0, 0.12, 2.9);
      for (const wx of [x0 + 1.4, x0 + 3.6]) for (const s of [-1, 1]) b.add('locoGreen', new THREE.CylinderGeometry(1.0, 1.0, 0.15, 18).rotateX(Math.PI / 2), mat(wx, railTop + 1.0, zT + s * 0.78));
      for (const wx of [x0 + 7.5, x0 + 9.0]) for (const s of [-1, 1]) b.add('black', new THREE.CylinderGeometry(0.5, 0.5, 0.15, 12).rotateX(Math.PI / 2), mat(wx, railTop + 0.5, zT + s * 0.78));
      b.box('locoGreen', x0 - 7.0, railTop + 0.6, zT - 1.3, 6.4, 2.2, 2.6); // tender
      b.box('coal', x0 - 6.6, railTop + 2.8, zT - 1.1, 5.6, 0.4, 2.2);
      for (const wx of [x0 - 5.8, x0 - 3.8, x0 - 1.8 - 0.2]) for (const s of [-1, 1]) b.add('black', new THREE.CylinderGeometry(0.55, 0.55, 0.14, 12).rotateX(Math.PI / 2), mat(wx - 0.4, railTop + 0.55, zT + s * 0.78));
    };
    const coach = (x0, len) => {
      b.box('lswrLower', x0, railTop + 1.0, zT - 1.38, len, 1.35, 2.76);
      b.box('lswrUpper', x0, railTop + 2.35, zT - 1.38, len, 1.25, 2.76);
      b.add('roof', new THREE.CylinderGeometry(3.2, 3.2, len, 18, 1, true, -0.45, 0.9).rotateZ(Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.45).rotateX(-Math.PI / 2), mat(x0 + len / 2, railTop + 0.55, zT));
      b.box('roof', x0 - 0.05, railTop + 3.55, zT - 1.3, len + 0.1, 0.12, 2.6);
      // panel beading: waist rail, cant rail and door pillars
      for (const s of [-1, 1]) {
        const zf = zT + s * 1.4 - 0.02;
        b.box('lswrLower', x0, railTop + 2.3, zf, len, 0.1, 0.04);
        b.box('lswrLower', x0, railTop + 3.3, zf, len, 0.08, 0.04);
        for (let px = x0 + 0.5; px < x0 + len; px += 1.9) b.box('lswrLower', px - 0.05, railTop + 1.0, zf, 0.08, 2.3, 0.04);
      }
      for (let wx = x0 + 1.0; wx < x0 + len - 1.2; wx += 1.9) for (const s of [-1, 1]) {
        b.box('white', wx - 0.08, railTop + 2.42, zT + s * 1.39 - 0.03, 1.16, 0.91, 0.03);
        b.box('glass', wx, railTop + 2.5, zT + s * 1.41 - 0.02, 1.0, 0.75, 0.04);
      }
      for (const bx of [x0 + 3, x0 + len - 3]) {
        b.box('black', bx - 1.3, railTop + 0.25, zT - 1.1, 2.6, 0.7, 2.2);
        for (const s of [-1, 1]) for (const ox of [-0.9, 0.9]) b.add('black', new THREE.CylinderGeometry(0.46, 0.46, 0.12, 12).rotateX(Math.PI / 2), mat(bx + ox, railTop + 0.46, zT + s * 0.78));
      }
      b.box('black', x0 - 0.35, railTop + 1.1, zT - 0.9, 0.35, 0.3, 1.8); // buffers/gangway
    };
    loco(x);
    x -= 8.2;
    for (let i = 0; i < 8; i++) { x -= 17.8; coach(x, 17.2); }
  }

  group.add(b.build({ name: 'berth44-parts' }));
  return group;
}
