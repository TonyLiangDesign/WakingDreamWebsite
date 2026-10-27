import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DECK_Y } from './boat/hull.js';

// The skipper, shown on the water only: a rigged figure (Mixamo skeleton, 14k triangles, faces
// +Z as authored) at the helm. A stored base pose sets the spine, head and gripping fingers; then
// two-bone IK puts his left hand on the wheel rim at ten o'clock, his right on the throttle grip,
// and his feet flat on the cockpit floor. At a centre console he stands with his back to the
// leaning post; under a hardtop he sits on the starboard helm seat.
//   loadSkipper()             -> Promise<skipper>, fetched once, the first time the water shows
//   placeSkipper(s, helm)     poses s for the anchors helm.js returns (boat coordinates)
//   skipper.root              add it to the frame the boat is built in

const URL_BASE = `${import.meta.env.BASE_URL}crew/`;
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

let loading = null;

export function loadSkipper() {
  if (loading) return loading;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loading = Promise.all([loader.loadAsync(`${URL_BASE}skipper.glb`), fetch(`${URL_BASE}skipper-helm.json`).then((r) => r.json())])
    .then(([gltf, pose]) => {
      // root turns the figure from +Z to face the bow (+X).
      const root = new THREE.Group();
      root.rotation.y = Math.PI / 2;
      root.add(gltf.scene);
      const bones = {};
      const meshes = [];
      gltf.scene.traverse((o) => {
        if (o.isBone) bones[o.name.replace('mixamorig', '')] = o;
        if (o.isMesh) {
          o.castShadow = o.receiveShadow = true;
          o.frustumCulled = false;
          meshes.push(o);
        }
      });
      return { root, bones, meshes, pose };
    });
  return loading;
}

// ---------- two-bone IK ----------

const pa = v3();
const pb = v3();
const pc = v3();
const dir = v3();
const side = v3();
const goal = v3();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

// Turns bone so that the point `from` (world, carried by its children) swings onto `to`, by the
// shortest rotation about the bone's own origin.
function aim(bone, from, to) {
  bone.getWorldPosition(pa);
  qa.setFromUnitVectors(dir.subVectors(from, pa).normalize(), goal.subVectors(to, pa).normalize());
  bone.getWorldQuaternion(qb).premultiply(qa);
  bone.parent.getWorldQuaternion(qa).invert();
  bone.quaternion.copy(qa.multiply(qb));
  bone.updateMatrixWorld(true);
}

// Upper / lower / end bones (shoulder-elbow-wrist or hip-knee-ankle) reach target (world), the
// middle joint bending towards pole (a world direction). The end bone keeps its world rotation.
function reach(upper, lower, end, target, pole) {
  end.getWorldQuaternion(qb);
  const keep = qb.clone();
  upper.getWorldPosition(pa);
  lower.getWorldPosition(pb);
  end.getWorldPosition(pc);
  const l1 = pa.distanceTo(pb);
  const l2 = pb.distanceTo(pc);
  const d = THREE.MathUtils.clamp(pa.distanceTo(target), Math.abs(l1 - l2) + 1e-3, (l1 + l2) * 0.995);
  const toward = v3().subVectors(target, pa).normalize();
  side.copy(pole).addScaledVector(toward, -pole.dot(toward)).normalize();
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const knee = pa.clone().addScaledVector(toward, l1 * cos).addScaledVector(side, l1 * Math.sqrt(Math.max(0, 1 - cos * cos)));
  aim(upper, pb.clone(), knee);
  end.getWorldPosition(pc);
  aim(lower, pc.clone(), pa.clone().addScaledVector(toward, d));
  end.parent.getWorldQuaternion(qa).invert();
  end.quaternion.copy(qa.multiply(keep));
  end.updateMatrixWorld(true);
}

// ---------- pose ----------

const boatPoint = (root, p) => root.parent.localToWorld(p.clone());

// helm: { wheel: { rim, axis, radius }, throttle, seat | stand } in boat coordinates; root must
// already be in its boat frame (the scene graph above it is used for world positions).
export function placeSkipper(s, helm) {
  const { root, bones: b, pose } = s;
  for (const [name, q] of Object.entries(pose.bones)) b[name]?.quaternion.fromArray(q);
  b.Hips.position.fromArray(pose.hips);
  const { rim, axis, radius } = helm.wheel;
  const seated = !!helm.seat;
  // Feet under the hips, a little apart; the figure's own origin is between his heels.
  if (seated) root.position.set(helm.seat.x + 0.42, DECK_Y, helm.seat.z);
  else root.position.set(Math.max(rim.x - 0.52, helm.stand + 0.2), DECK_Y, rim.z + 0.04);
  root.updateMatrixWorld(true);

  // Seated: the hip joint 9 cm over the cushion, a hand's width aft of its centre.
  if (seated) {
    const hip = boatPoint(root, v3(helm.seat.x - 0.03, helm.seat.y + 0.09, helm.seat.z));
    b.Hips.parent.updateMatrixWorld(true);
    b.Hips.position.copy(b.Hips.parent.worldToLocal(hip));
    b.Hips.updateMatrixWorld(true);
  }

  const up = v3(0, 1, 0).transformDirection(root.parent.matrixWorld);
  const fwd = v3(1, 0, 0).transformDirection(root.parent.matrixWorld);
  const right = v3(0, 0, 1).transformDirection(root.parent.matrixWorld);
  // Feet: flat on the floor, ankles 8 cm up, knees towards the bow (and up, seated).
  for (const [k, sgn] of [['Left', -1], ['Right', 1]]) {
    const foot = boatPoint(root, v3(root.position.x + (seated ? 0 : 0.02), DECK_Y + 0.085, root.position.z + sgn * (seated ? 0.13 : 0.15)));
    reach(b[`${k}UpLeg`], b[`${k}Leg`], b[`${k}Foot`], foot, fwd.clone().addScaledVector(right, sgn * 0.25));
  }
  // Hands: left on the rim at ten o'clock, right on the throttle grip; wrists a palm short of the
  // grip, elbows down and out.
  const across = v3(0, 0, 1);
  const rimUp = v3().crossVectors(axis, across);
  const onRim = rim.clone().addScaledVector(across, -radius * 0.87).addScaledVector(rimUp, radius * 0.5).addScaledVector(axis, 0.07);
  const grip = helm.throttle.clone().add(v3(-0.07, 0, 0));
  reach(b.LeftArm, b.LeftForeArm, b.LeftHand, boatPoint(root, onRim), up.clone().negate().addScaledVector(right, -0.6).addScaledVector(fwd, -0.3));
  reach(b.RightArm, b.RightForeArm, b.RightHand, boatPoint(root, grip), up.clone().negate().addScaledVector(right, 0.6).addScaledVector(fwd, -0.3));
}
