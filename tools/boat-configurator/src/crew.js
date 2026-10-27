import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DECK_Y } from './boat/hull.js';

// The skipper, shown on the water only: a rigged figure (Mixamo skeleton, 14k triangles, faces
// +Z as authored) at the helm. A stored base pose sets the spine, head and gripping fingers; then
// two-bone IK puts his hands on the wheel rim at ten and two. Under a hardtop he sits on the
// starboard helm seat, feet flat on the cockpit floor; at a centre console he perches on the
// leaning post's bolster with his feet on its footrest bar.
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

// Turns bone by angle about a world axis.
function turn(bone, worldAxis, angle) {
  qa.setFromAxisAngle(worldAxis, angle);
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
const m3 = new THREE.Matrix4();
const qw = new THREE.Quaternion();

// Turns bone (world) so that its own direction fwdLocal points along fwdWorld and acrossLocal along
// acrossWorld (both orthogonalised against the forward); the third axis follows.
function orient(bone, fwdLocal, acrossLocal, fwdWorld, acrossWorld) {
  const basis = (f, a) => {
    const x = f.clone().normalize();
    const y = a.clone().addScaledVector(x, -a.dot(x)).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    return m3.clone().makeBasis(x, y, z);
  };
  const local = basis(fwdLocal, acrossLocal);
  const world = basis(fwdWorld, acrossWorld);
  qw.setFromRotationMatrix(world.multiply(local.invert()));
  bone.parent.getWorldQuaternion(qa).invert();
  bone.quaternion.copy(qa.multiply(qw));
  bone.updateMatrixWorld(true);
}

// The hand's own axes, from the rig: fingers run from the wrist to the middle knuckle, and the
// palm's width from the index knuckle to the little-finger knuckle.
function handAxes(b, side) {
  return {
    fwd: b[`${side}HandMiddle1`].position.clone(),
    across: b[`${side}HandPinky1`].position.clone().sub(b[`${side}HandIndex1`].position),
  };
}
// Where the curled fingers close round a bar, relative to the wrist: this far along the fingers
// and this far to the palm side.
const GRIP_ALONG = 0.1;
const GRIP_IN = 0.03;
// The palm side of hand `side` (world), from the way its posed fingers curl: the middle
// fingertip relative to its knuckle, less the part along the fingers.
const tip = new THREE.Vector3();
const knuckle = new THREE.Vector3();
function palmSide(b, side, fwdWorld) {
  b[`${side}HandMiddle3`].getWorldPosition(tip);
  b[`${side}HandMiddle1`].getWorldPosition(knuckle);
  return tip.sub(knuckle).projectOnPlane(fwdWorld).normalize().clone();
}
// Wrist position (world) that closes the hand round grip (world) once the hand points along
// fwdWorld: back along the fingers and out to the back of the hand.
function wristFor(b, side, grip, fwdWorld) {
  const palm = palmSide(b, side, fwdWorld);
  return grip.clone().addScaledVector(fwdWorld, -GRIP_ALONG).addScaledVector(palm, -GRIP_IN);
}

// helm: { wheel: { rim, axis, radius }, throttle, seat, footrest? } in boat coordinates; root
// must already be in its boat frame (the scene graph above it is used for world positions).
//   A little forward on the cushion, sitting up with a slight lean to the wheel. Feet on the
//   footrest bar where there is one (the console's leaning post is too high for the floor),
//   otherwise flat on the floor.
//   Left hand closed round the rim at ten o'clock, thumb up the rim; right hand its mirror at
//   two o'clock. Each hand drapes over the rim from behind, fingers forward over the tube, so
//   the wrist carries on from the forearm instead of cocking up to point along the spoke. (The
//   throttle grip is left alone: on both layouts it sits at or above shoulder height, and
//   reaching it put the arm straight out at head height.) Each hand is turned to its grip
//   first, then the arm is solved so the fingers close round the bar rather than the wrist
//   landing on it.
export function placeSkipper(s, helm) {
  const { root, bones: b, pose } = s;
  for (const [name, q] of Object.entries(pose.bones)) b[name]?.quaternion.fromArray(q);
  b.Hips.position.fromArray(pose.hips);
  const { rim, axis, radius } = helm.wheel;
  // The figure's own origin is under his hips. The hip joint sits 9 cm over the cushion, a
  // little forward of its middle, so his thighs lie along the cushion and his back sits clear
  // of the backrest.
  const hipX = helm.seat.x + 0.02;
  root.position.set(hipX, DECK_Y, helm.seat.z);
  root.updateMatrixWorld(true);
  const hip = boatPoint(root, v3(hipX, helm.seat.y + 0.09, helm.seat.z));
  b.Hips.parent.updateMatrixWorld(true);
  b.Hips.position.copy(b.Hips.parent.worldToLocal(hip));
  b.Hips.updateMatrixWorld(true);

  const up = v3(0, 1, 0).transformDirection(root.parent.matrixWorld);
  const fwd = v3(1, 0, 0).transformDirection(root.parent.matrixWorld);
  const right = v3(0, 0, 1).transformDirection(root.parent.matrixWorld);
  // He leans into the wheel from the waist, about 15 degrees, and keeps his head up to look
  // out over the bow.
  const lean = -0.26;
  turn(b.Spine, right, lean);
  turn(b.Neck, right, -lean * 0.7);
  // Feet: soles on the footrest bar, or flat on the floor far enough forward of the hips that
  // the knees bend without the shins going vertical; ankles 8 cm over the sole. Knees towards
  // the bow and up.
  const sole = helm.footrest ? [helm.footrest.x, helm.footrest.y] : [hipX + 0.37, DECK_Y];
  for (const [k, sgn] of [['Left', -1], ['Right', 1]]) {
    const foot = boatPoint(root, v3(sole[0], sole[1] + 0.085, root.position.z + sgn * 0.13));
    reach(b[`${k}UpLeg`], b[`${k}Leg`], b[`${k}Foot`], foot, fwd.clone().addScaledVector(right, sgn * 0.25));
  }

  // Left hand: closed round the rim at ten o'clock from behind, as a helmsman holds a wheel:
  // the palm's width runs down the rim (thumb up it) so the fingers wrap round the tube, and
  // the hand lies over the rim, fingers pointing forward past it and a little out along the
  // spoke (60 degrees from the spoke line towards the wheel's axis), palm to the dash and the
  // hub. So the wrist sits behind the rim in line with the forearm, drooping a little.
  const across = v3(0, 0, 1);
  const rimUp = v3().crossVectors(axis, across);
  const overRim = (spoke) => spoke.clone().multiplyScalar(0.5).addScaledVector(axis, -0.866).normalize();
  const tenDir = rimUp.clone().multiplyScalar(0.5).addScaledVector(across, -0.866);
  const alongRim = rimUp.clone().multiplyScalar(0.866).addScaledVector(across, 0.5).negate();
  // Right hand: round the rim at two o'clock, the left hand's mirror (pinky down the rim, so the
  // palm again faces the dash).
  const twoDir = rimUp.clone().multiplyScalar(0.5).addScaledVector(across, 0.866);
  const alongRimR = rimUp.clone().multiplyScalar(-0.866).addScaledVector(across, 0.5);
  // Elbows hang under the shoulders, a little out and aft.
  for (const [side, sgn, spoke, along] of [['Left', -1, tenDir, alongRim], ['Right', 1, twoDir, alongRimR]]) {
    const grip = boatPoint(root, rim.clone().addScaledVector(spoke, radius));
    const acrossWorld = along.clone().transformDirection(root.parent.matrixWorld);
    const pole = up.clone().negate().addScaledVector(right, sgn * 0.15).addScaledVector(fwd, -0.3);
    let fwdWorld = overRim(spoke).transformDirection(root.parent.matrixWorld);
    handOn(b, side, grip, fwdWorld, acrossWorld, pole);
    // Then turn the hand most of the way towards the forearm the first solve gave, and solve
    // again, so the wrist is nearly straight; the palm's width stays as near the rim as the
    // forearm's angle allows (orient() squares it against the fingers).
    b[`${side}Hand`].getWorldPosition(pa);
    b[`${side}ForeArm`].getWorldPosition(pb);
    fwdWorld = fwdWorld.lerp(pa.sub(pb).normalize(), 0.65).normalize();
    handOn(b, side, grip, fwdWorld, acrossWorld, pole);
  }
}

// Closes hand `side` round grip (world) pointing along fwdWorld with its width along
// acrossWorld, and solves the arm (elbow towards pole) so the fingers close round the bar.
function handOn(b, side, grip, fwdWorld, acrossWorld, pole) {
  const H = handAxes(b, side);
  const hand = b[`${side}Hand`];
  orient(hand, H.fwd, H.across, fwdWorld, acrossWorld);
  reach(b[`${side}Arm`], b[`${side}ForeArm`], hand, wristFor(b, side, grip, fwdWorld), pole);
  orient(hand, H.fwd, H.across, fwdWorld, acrossWorld);
}
