import * as THREE from 'three';
import { DOCK } from '../dock.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ropeMaterial, ropeBeforeRender } from './materials.js';

// Mooring lines and rope fenders for ships rafted abreast at a quay (Berth 46: Majestic
// inboard, St Louis, Philadelphia outboard). Built automatically once every member of a
// raft group (spec.raft) has been added to the same parent; also callable directly.
// Assumes the ships lie parallel to the quay (rotation.y = 0 or PI) in the dock frame.

const ROPE = ropeMaterial({ radius: 0.08, color: 0x3b3326, vertexColors: false, roughness: 0.95, name: 'raftHawser' });
const WIRE = ropeMaterial({ radius: 0.045, color: 0x2a2b2c, vertexColors: false, roughness: 0.5, metalness: 0.6, name: 'raftWire' });
const FENDER = new THREE.MeshStandardMaterial({ color: 0x3f3629, roughness: 1, name: 'ropeFender' });

function catenary(a, b, sag, n = 16) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = new THREE.Vector3().lerpVectors(a, b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function tryRaft(parent, tag) {
  if (!parent || parent.userData['raft:' + tag]) return;
  const members = parent.children.filter((o) => o.userData.spec?.raft === tag);
  const want = members[0]?.userData.spec.raftCount ?? 3;
  if (members.length < want) return;
  parent.userData['raft:' + tag] = true;
  parent.add(buildRaftMoorings(members, { quayZ: DOCK.west.z }));
}

export function buildRaftMoorings(ships, { quayZ = DOCK.west.z, Q = DOCK.Q } = {}) {
  const group = new THREE.Group();
  group.name = 'RaftMoorings';
  ships = [...ships].sort((a, b) => Math.abs(a.position.z - quayZ) - Math.abs(b.position.z - quayZ));
  const side = (ship, towardZ) => Math.sign((towardZ - ship.position.z) * Math.cos(ship.rotation.y)) || 1;
  const cosr = (ship) => Math.cos(ship.rotation.y);
  // world (dock-frame) point on a ship's side at dock x, at fairlead height
  const fair = (ship, wx, s, drop = 0.7) => {
    const H = ship.userData.hull;
    const lx = (wx - ship.position.x) * cosr(ship);
    const cl = Math.max(-H.L / 2 + 3, Math.min(H.L / 2 - 3, lx));
    const y = H.topAt(cl) - drop;
    const lz = s * (H.hbTop(cl) - 0.15);
    return new THREE.Vector3(ship.position.x + cl * cosr(ship), y, ship.position.z + lz * cosr(ship));
  };
  const hullZ = (ship, wx, s, y) => {
    const H = ship.userData.hull;
    const lx = (wx - ship.position.x) * cosr(ship);
    return ship.position.z + s * H.hbAt(lx, y) * cosr(ship);
  };
  const tubes = { rope: [], wire: [] };
  const line = (a, b, sag, kind = 'rope') => tubes[kind].push(new THREE.TubeGeometry(catenary(a, b, sag), 18, kind === 'rope' ? 0.08 : 0.045, 5, false));
  const fenders = [];

  // inboard ship to the quay: head, breast, springs, stern
  {
    const s0 = ships[0], L = s0.userData.hull.L, x0 = s0.position.x, s = side(s0, quayZ);
    const bz = quayZ + 2.2, by = Q + 0.75;
    const bollard = (x) => new THREE.Vector3(x, by, bz);
    const plan = [[0.46, 0.46 * L + 22, 1.8], [0.42, 0.42 * L + 6, 1.2], [0.28, 0.28 * L - 26, 0.9, 'wire'], [-0.26, -0.26 * L + 26, 0.9, 'wire'], [-0.42, -0.42 * L - 6, 1.2], [-0.46, -0.46 * L - 22, 1.8]];
    for (const [fx, bx, sag, kind] of plan) {
      const a = fair(s0, x0 + fx * L, s), b = bollard(x0 + bx);
      line(a, b, sag, kind);
      const eye = new THREE.TorusGeometry(0.33, 0.06, 5, 12).rotateX(Math.PI / 2).translate(b.x, b.y - 0.03, b.z);
      tubes.rope.push(eye);
    }
    // fenders against the quay wall
    for (let k = -2; k <= 2; k++) {
      const wx = x0 + k * L * 0.18;
      const zh = hullZ(s0, wx, s, 1.6);
      fenders.push([wx, 1.6, (zh + quayZ) / 2, fair(s0, wx, s, 0.1)]);
    }
  }
  // ship to ship: two breast lines and two springs, fenders in the gap
  for (let i = 1; i < ships.length; i++) {
    const A = ships[i - 1], B = ships[i];
    const sA = side(A, B.position.z), sB = side(B, A.position.z);
    const L = Math.min(A.userData.hull.L, B.userData.hull.L), xm = (A.position.x + B.position.x) / 2;
    for (const [fa, fb, sag, kind] of [[0.4, 0.43, 0.5], [-0.4, -0.43, 0.5], [0.22, 0.05, 0.5, 'wire'], [-0.22, -0.05, 0.5, 'wire'], [0.44, 0.46, 0.6]]) {
      const a = fair(A, xm + fa * L, sA), b = fair(B, xm + fb * L, sB);
      line(a, b, sag, kind);
    }
    for (let k = -3; k <= 3; k++) {
      const wx = xm + k * L * 0.12, y = 1.8;
      const za = hullZ(A, wx, sA, y), zb = hullZ(B, wx, sB, y);
      // hang from whichever deck edge is higher
      const hangA = fair(A, wx, sA, 0), hangB = fair(B, wx, sB, 0);
      fenders.push([wx, y, (za + zb) / 2, hangA.y > hangB.y ? hangA : hangB]);
    }
  }
  const fg = [];
  for (const [x, y, z, top] of fenders) {
    fg.push(new THREE.CapsuleGeometry(0.42, 0.9, 4, 10).translate(x, y, z));
    tubes.rope.push(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(x, y + 0.85, z), top), 1, 0.03, 4, false));
  }
  const strip = (g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; };
  for (const [kind, list] of Object.entries(tubes)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list.map(strip)), kind === 'rope' ? ROPE : WIRE);
    m.castShadow = true; m.name = 'raft:' + kind; m.onBeforeRender = ropeBeforeRender;
    group.add(m);
  }
  if (fg.length) {
    const m = new THREE.Mesh(mergeGeometries(fg.map(strip)), FENDER);
    m.castShadow = m.receiveShadow = true; m.name = 'raft:fenders';
    group.add(m);
  }
  return group;
}
