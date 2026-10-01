import * as THREE from 'three';

// Camera shots: keyframed position / target / fov / focus, Catmull-Rom through the
// keys with smootherstep easing on overall time. Coordinates are world metres
// (x east, y up, z south), origin = centre of the Ocean Dock basin at water level.

// Keys with `dock: true` shots are given in the Ocean Dock frame (+X toward the mouth,
// +Z toward the west quay; Titanic centre ≈ (-70, -45), bow ≈ (64, -45)).
export const SHOTS = {
  establishing: {
    label: 'Crane-down establishing over the dock mouth', duration: 20, dock: true,
    keys: [
      { pos: [620, 240, -170], target: [-80, 10, -60], fov: 30 },
      { pos: [450, 115, -85], target: [-70, 14, -50], fov: 31 },
      { pos: [330, 58, -20], target: [-60, 18, -45], fov: 32 },
    ],
  },
  aerialSouth: {
    label: 'High aerial from Southampton Water', duration: 20,
    keys: [
      { pos: [1500, 900, 2300], target: [0, 0, 0], fov: 28 },
      { pos: [900, 620, 1500], target: [-40, 0, -60], fov: 28 },
    ],
  },
  bowLow: {
    label: 'Low angle at the bow (script #9)', duration: 12, dock: true,
    keys: [
      { pos: [150, 3.0, -8], target: [40, 13, -42], fov: 36 },
      { pos: [135, 2.6, 2], target: [20, 15, -44], fov: 38 },
    ],
  },
  quayLevel: {
    label: 'Quay level along Berth 44', duration: 14, dock: true,
    keys: [
      { pos: [120, 6.3, -64.5], target: [-110, 14, -46], fov: 34 },
      { pos: [106, 6.3, -64.5], target: [-140, 16, -46], fov: 34 },
    ],
  },
  dockMouth: {
    label: 'Dock mouth, tugs waiting', duration: 14, dock: true,
    keys: [
      { pos: [420, 18, 70], target: [150, 10, -20], fov: 36 },
      { pos: [380, 26, 20], target: [100, 12, -30], fov: 36 },
    ],
  },
  topDown: {
    label: 'God\'s-eye top-down (script #15)', duration: 18, dock: true,
    keys: [
      { pos: [60, 1500, -10], target: [60, 0, -9], fov: 30 },
      { pos: [0, 900, -20], target: [0, 0, -19], fov: 30 },
    ],
  },
  orbit: {
    label: 'Harbour orbit to close the sequence', duration: 22, dock: true,
    orbit: { center: [-70, 16, -44.3], radius: 620, height: 210, from: 0.9, to: 0.35 }, fov: 34,
  },
  tugDetail: {
    label: 'Low tracking view of a standby tug', duration: 12, dock: true,
    keys: [
      { pos: [218, 7, -6], target: [175, 3, -18], fov: 52 },
      { pos: [211, 8.5, -2], target: [174, 3.2, -18], fov: 52 },
    ],
  },
  bowForward: {
    title: 'Foredeck', group: 'Onboard & cinematic',
    description: 'A slow step toward the bow rail, looking out across Southampton Water.',
    label: 'Eye level looking forward from the forecastle', duration: 14, dock: true, near: 0.08,
    keys: [
      { pos: [59.2, 17.17, -43.05], target: [270, 12, -47], fov: 66 },
      { pos: [60, 17.2, -43.05], target: [270, 12, -43.05], fov: 66 },
      { pos: [60.7, 17.17, -43.05], target: [270, 12, -39], fov: 66 },
    ],
  },
  bowCinema: {
    title: 'Bow', group: 'Onboard & cinematic',
    description: 'Drift past the prow as the long hull opens against the harbour.',
    label: 'Cinematic three-quarter view of the prow', duration: 16, dock: true,
    keys: [
      { pos: [85, 20, -24], target: [12, 23, -44.3], fov: 52 },
      { pos: [92, 21.5, -17], target: [8, 23, -44.3], fov: 52 },
    ],
  },
  bridgeWing: {
    title: 'Bridge', group: 'Onboard & cinematic',
    description: 'A measured pan over the forecastle and waiting tugs from the bridge wing.',
    label: 'Open bridge wing looking toward the dock mouth', duration: 14, dock: true, near: 0.08,
    keys: [
      { pos: [5.2, 20.56, -35.6], target: [145, 8, -52], fov: 68 },
      { pos: [5.2, 20.56, -35.2], target: [145, 8, -50], fov: 68 },
      { pos: [5.2, 20.56, -34.8], target: [145, 8, -48], fov: 68 },
    ],
  },
  shipPortrait: {
    title: 'Portrait', group: 'Onboard & cinematic',
    description: 'Track along the harbour to reveal the full liner, its four funnels and quay.',
    label: 'Full liner three-quarter portrait', duration: 18, dock: true,
    keys: [
      { pos: [110, 42, 135], target: [-70, 20, -44.3], fov: 42 },
      { pos: [90, 40, 145], target: [-70, 20, -44.3], fov: 42 },
    ],
  },
};

const originalTitles = {
  establishing: 'Harbour', aerialSouth: 'Aerial',
  bowLow: 'Low bow', quayLevel: 'Quay',
  dockMouth: 'Dock mouth', topDown: 'Overhead',
  orbit: 'Orbit', tugDetail: 'Tug',
};
for (const [name, title] of Object.entries(originalTitles)) {
  SHOTS[name].title = title;
}

// One editorial order drives the menu, arrow navigation and automatic screening.
export const SHOT_SEQUENCE = [
  { title: 'The harbour', shots: ['aerialSouth', 'establishing', 'dockMouth', 'tugDetail'] },
  { title: 'The liner', shots: ['shipPortrait', 'quayLevel', 'bowLow', 'bowCinema'] },
  { title: 'On board', shots: ['bridgeWing', 'bowForward'] },
  { title: 'The panorama', shots: ['topDown', 'orbit'] },
];
export const SHOT_ORDER = SHOT_SEQUENCE.flatMap((chapter) => chapter.shots);
for (const chapter of SHOT_SEQUENCE) for (const name of chapter.shots) SHOTS[name].group = chapter.title;
Object.assign(SHOTS.aerialSouth, { description: 'Approach Southampton from the water, gradually closing on the docks.' });
Object.assign(SHOTS.establishing, { description: 'Descend over the dock mouth to reveal Titanic at her berth.' });
Object.assign(SHOTS.dockMouth, { description: 'Glide toward the dock entrance and the tugs awaiting orders.' });
Object.assign(SHOTS.tugDetail, { description: 'Track beside a standby tug before turning to the great liner.' });
Object.assign(SHOTS.quayLevel, { description: 'Move along Berth 44, with the hull rising above the quay.' });
Object.assign(SHOTS.bowLow, { description: 'A low water-level approach beneath the towering bow.' });
Object.assign(SHOTS.topDown, { description: 'Descend slowly over the docks for a final view of their layout.' });
Object.assign(SHOTS.orbit, { description: 'Circle the harbour in a wide closing panorama.' });

// convert dock-frame shots to world once
const YAW = ((90 - 192.5) * Math.PI) / 180;
for (const s of Object.values(SHOTS)) {
  if (!s.dock) continue;
  const c = Math.cos(YAW), sn = Math.sin(YAW);
  const points = s.keys ? s.keys.flatMap((k) => [k.pos, k.target]) : [s.orbit.center];
  for (const point of points) {
    const [x, y, z] = point;
    point.splice(0, 3, x * c + z * sn, y, -x * sn + z * c);
  }
  if (s.orbit) { s.orbit.from -= YAW; s.orbit.to -= YAW; }
  s.dock = false;
}

const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export class ShotPlayer {
  constructor(camera, controls, post) {
    this.camera = camera; this.controls = controls; this.post = post;
    this.shot = null; this.t = 0; this.active = false; this.paused = false;
  }
  play(shot, { hold = false, loop = false } = {}) {
    this.shot = shot; this.t = 0; this.active = !hold;
    this.loop = loop;
    this.camera.near = shot.near ?? 0.5;
    if (shot.keys) {
      this.posCurve = new THREE.CatmullRomCurve3(shot.keys.map((k) => new THREE.Vector3(...k.pos)), false, 'centripetal');
      this.tgtCurve = new THREE.CatmullRomCurve3(shot.keys.map((k) => new THREE.Vector3(...k.target)), false, 'centripetal');
    }
    this.apply(0);
  }
  stop() { this.active = false; }
  seek(t) {
    if (!this.shot) return;
    this.t = t;
    this.apply(ease(Math.min(Math.max(t / this.shot.duration, 0), 1)));
  }
  update(dt) {
    if (!this.active || !this.shot || this.paused) return;
    this.t += dt;
    // Individual views gently retrace the path; screening makes one pass then cuts.
    const phase = this.t / this.shot.duration;
    const u = this.loop ? 1 - Math.abs(1 - (phase % 2)) : Math.min(phase, 1);
    this.apply(ease(u));
    if (!this.loop && u >= 1) this.active = false;
  }
  apply(u) {
    const s = this.shot, cam = this.camera, c = this.controls;
    if (s.orbit) {
      if (this.post) this.post.dofPass.enabled = false;
      const o = s.orbit, a = o.from + (o.to - o.from) * u;
      cam.position.set(o.center[0] + Math.cos(a) * o.radius, o.height, o.center[2] + Math.sin(a) * o.radius);
      c.target.set(...o.center);
      cam.fov = s.fov;
    } else {
      const n = s.keys.length;
      if (n === 1) { cam.position.set(...s.keys[0].pos); c.target.set(...s.keys[0].target); }
      else { cam.position.copy(this.posCurve.getPoint(u)); c.target.copy(this.tgtCurve.getPoint(u)); }
      const f = u * (n - 1), i = Math.min(Math.floor(f), n - 2), w = n > 1 ? f - i : 0;
      const k0 = s.keys[Math.max(i, 0)], k1 = s.keys[Math.min(i + 1, n - 1)];
      cam.fov = (k0.fov ?? 32) * (1 - w) + (k1.fov ?? 32) * w;
      if (k0.focus && this.post) {
        this.post.dofPass.enabled = true;
        this.post.dof.cocMaterial.focusDistance = (k0.focus) * (1 - w) + (k1.focus ?? k0.focus) * w;
        this.post.dof.bokehScale = 2.5;
      } else if (this.post) this.post.dofPass.enabled = false;
    }
    cam.updateProjectionMatrix();
    cam.lookAt(c.target);
  }
}
