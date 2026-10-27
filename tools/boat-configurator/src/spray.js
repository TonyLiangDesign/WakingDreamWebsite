import * as THREE from 'three';
import { SUN_DIR, noiseChunk } from './water.js';

// Spray off the planing hull, in world space round the boat (the boat holds still and the sea
// streams aft past it at the cruising speed):
//   sheets    a thin, glassy sheet of water fanning out from under each chine just aft of the
//             spray root, and a low rooster tail astern of each lower unit, both tearing into
//             ligaments as they fly out and fall back (meshes whose trajectories are worked out
//             in the vertex shader)
//   droplets  CPU-simulated drops drawn as instanced quads stretched along their motion:
//             ligaments near the chine breaking into drops further out, plus fine mist
// The spray pulses with the chop: heavier when the bow drops, a burst after each slam.
//   createSpray({ count })  -> { object, setRig(rig), warm(boat, speed), update(dt, t, boat, speed, ride), setScale(px) }
//   setRig({ chine: [[x, y, z, weight]...], props: [[x, z]...] }) in boat coordinates.
//   createWhiteWater({ detail })  the white water rolling out from under each chine onto the
//                                 sea, so a profile view shows the hull pressing into it

const GRAVITY = 9.8;
// Seconds of motion smeared into each drop, as a camera's shutter would.
const EXPOSURE = 1 / 140;
// Drag towards the apparent wind (per second): the sheet, drops and mist are carried aft.
const DRAG = { sheet: 0.7, drop: 1.4, mist: 4.0 };
// Particle kinds.
const DROP = 0;
const MIST = 1;
const PLUME = 2;

// How hard the hull is working (about 0.7 to 2.6), from the ride in scene.js tick(): more spray
// as she drops into the chop, and a burst as she lands after a slam (landed: seconds since
// ride.slam fell back to 0).
function surge(ride, landed) {
  const chop = THREE.MathUtils.clamp(-ride.vHeave / 0.25, 0, 1);
  const burst = Math.exp(-(((landed - 0.15) / 0.16) ** 2));
  return 0.7 + 0.35 * chop + 1.6 * burst;
}

// Launch velocity (m/s, boat frame, starboard) of whisker spray at a chine station of weight w
// (0..1); kick (0..1) spreads it into a fan.
function whiskerVelocity(out, speed, w, kick, lift) {
  return out.set(-speed * (0.5 + 0.1 * kick), (0.9 + 1.7 * w * (0.6 + 0.4 * kick)) * lift, (1.8 + 2.2 * w * (0.5 + 0.5 * kick)) * lift);
}

// Launch velocity of the rooster tail at `across` (-1..1) over the lower unit's width: thrown
// aft with the wash, highest on the centreline; up (0..1) spreads it in height.
function plumeVelocity(out, speed, across, up, lift) {
  return out.set(-speed * (0.75 + 0.15 * up), (2.5 + 1.5 * up) * (1 - 0.4 * across * across) * lift, across * 0.45);
}

// The sheets' launch stations, one strip per sheet: [x, y, z, weight, aft speed as a share of
// the cruising speed, vy, vz] in boat coordinates. Whisker spray off each chine, and a narrow
// fan astern of each lower unit for the rooster tail.
function sheetStrips({ chine, props }) {
  const top = Math.max(...chine.map((c) => c[3]));
  const v = new THREE.Vector3();
  const strips = [1, -1].map((side) => chine.map(([x, y, z, weight]) => {
    whiskerVelocity(v, 1, weight / top, 0.6, 1);
    return [x, y, side * (z + 0.01), weight / top, v.x, v.y, side * v.z];
  }));
  for (const [x, z] of props) {
    strips.push(Array.from({ length: 7 }, (_, i) => {
      const across = i / 3 - 1;
      plumeVelocity(v, 1, across, 0.5, 1);
      return [x - 0.1, 0, z + 0.07 * across, 0.75 * (1 - across * across), v.x, v.y, v.z];
    }));
  }
  return strips;
}

export function createSpray({ count = 2400 } = {}) {
  const object = new THREE.Group();
  const sheet = createSheet();
  const drops = createDrops(count);
  object.add(sheet.mesh, drops.mesh);
  object.visible = false;
  let clock = 0;
  let landed = 9;
  let slamming = false;
  const boatMatrix = new THREE.Matrix4();
  const still = { vHeave: 0 };

  function run(dt, boat, speed, ride = still) {
    clock += dt;
    landed = slamming && !(ride.slam > 0) ? 0 : landed + dt;
    slamming = ride.slam > 0;
    const k = surge(ride, landed);
    boatMatrix.copy(boat.matrixWorld);
    sheet.update(clock, k, boatMatrix);
    drops.step(dt, k, boatMatrix, speed);
  }

  return {
    object,
    setRig(rig) {
      sheet.build(sheetStrips(rig));
      drops.setRig(rig);
    },
    // Runs the spray for a second so the first frame afloat already has it.
    warm(boat, speed) {
      sheet.setSpeed(speed);
      clock -= 1;
      for (let i = 0; i < 40; i++) run(1 / 40, boat, speed);
    },
    // t is the scene clock tick() runs on; ride is scene.js's ride (vHeave, slam), so the spray
    // works with the hull.
    update(dt, t, boat, speed, ride) {
      if (dt <= 0) return;
      clock = t - Math.min(dt, 1 / 20);
      run(Math.min(dt, 1 / 20), boat, speed, ride);
    },
    // Pixels per metre at one metre from the camera: drawing-buffer height * P[1][1] / 2.
    setScale(scale) {
      drops.mesh.material.uniforms.uScale.value = scale;
    },
  };
}

// Light shared by the sheet and the drops: sky fill, the low sun, and the strong forward
// scatter of water drops when the camera looks through them towards the sun.
const sprayLight = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSky;
  vec3 sprayColour(vec3 world, float aer) {
    float fwd = max(dot(normalize(world - cameraPosition), uSunDir), 0.0);
    float scatter = pow(fwd, 5.0) * 1.4 + pow(fwd, 30.0) * 2.5;
    return uSky * (0.65 + 0.35 * aer) + uSunColor * (0.35 + 0.35 * aer + scatter);
  }
`;
const lightUniforms = () => ({
  uSunDir: { value: SUN_DIR.clone() },
  uSunColor: { value: new THREE.Color('#ffd2a6') },
  uSky: { value: new THREE.Color('#b9c6d2') },
});

// ---------- the spray sheets ----------

// Each sheet is rows of trajectories launched from a strip of stations (s across, tau along the
// flight). The vertex shader flies each point out under gravity and drag from the boat's
// current pose; the fragment shader keeps it whole near its root and tears it into streaks
// along the trajectories as it goes, so the drops carry on where it ends.
const SHEET_STEPS = 14;
function createSheet() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      ...lightUniforms(),
      uBoat: { value: new THREE.Matrix4() },
      uTime: { value: 0 },
      uSurge: { value: 1 },
      uSpeed: { value: 10 },
      uFlight: { value: 0.5 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aLaunch;
      attribute vec3 aVel;
      attribute vec3 aSheet;
      uniform mat4 uBoat;
      uniform float uSurge;
      uniform float uSpeed;
      uniform float uFlight;
      varying vec3 vSheet;
      varying vec3 vWorld;
      void main() {
        vSheet = aSheet;
        float lift = 0.85 + 0.2 * uSurge;
        float tau = aSheet.x * uFlight * (0.85 + 0.15 * uSurge);
        // In the boat's frame the air streams aft at the cruising speed and drags the sheet with it.
        vec3 air = vec3(-uSpeed, 0.0, 0.0);
        vec3 v0 = aVel * vec3(uSpeed, lift, lift);
        float k = ${DRAG.sheet.toFixed(2)};
        vec3 d = air * tau + (v0 - air) * (1.0 - exp(-k * tau)) / k;
        // Launched from the station, or from the surface where that is under water (the props).
        vec3 w = (uBoat * vec4(aLaunch, 1.0)).xyz;
        w.y = max(w.y, 0.01);
        w += mat3(uBoat) * d;
        w.y -= 0.5 * ${GRAVITY.toFixed(1)} * tau * tau;
        vWorld = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${noiseChunk}
      ${sprayLight}
      uniform float uTime;
      uniform float uSurge;
      uniform float uFlight;
      varying vec3 vSheet;
      varying vec3 vWorld;
      void main() {
        float tn = vSheet.x;
        float s = vSheet.y;
        // Streaks running out along the trajectories, streaming outwards with the water.
        float run = tn * 3.0 - uTime / uFlight * 3.0;
        float lig = vnoise(vec2(s * 46.0, run)) * 0.6 + vnoise(vec2(s * 110.0 + 7.0, run * 1.7)) * 0.4;
        // Whole near the chine, tearing into ligaments, then gone (into drops) by the end.
        float tear = smoothstep(0.12, 0.9, tn);
        float thr = mix(-0.4, 0.7, tear);
        float a = smoothstep(thr, thr + 0.18, lig);
        // Strongest mid-strip (just aft of the spray root), ragged at both ends.
        float ends = smoothstep(0.1, 0.5, vSheet.z + (vnoise(vec2(s * 14.0, run * 0.7)) - 0.5) * 0.7);
        a *= ends * smoothstep(0.0, 0.06, tn) * smoothstep(1.0, 0.8, tn);
        // A thin sheet is clear face-on and whiter where it is seen edge-on.
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float edge = 1.0 - abs(dot(n, normalize(cameraPosition - vWorld)));
        a *= (0.2 + 0.55 * edge * edge + 0.2 * tear) * (0.75 + 0.25 * uSurge);
        // Gone where it meets the water.
        a *= smoothstep(-0.01, 0.07, vWorld.y);
        gl_FragColor = vec4(sprayColour(vWorld, 0.4 + 0.6 * tear), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  return {
    mesh,
    setSpeed(speed) {
      material.uniforms.uSpeed.value = speed;
    },
    // strips from sheetStrips(); the aft launch speed is scaled by uSpeed in the shader.
    build(strips) {
      const total = strips.reduce((s, strip) => s + strip.length, 0) * (SHEET_STEPS + 1);
      const launch = new Float32Array(total * 3);
      const vel = new Float32Array(total * 3);
      const info = new Float32Array(total * 3);
      const index = [];
      let i = 0;
      for (const strip of strips) {
        const n = strip.length;
        strip.forEach(([x, y, z, w, vx, vy, vz], j) => {
          for (let k = 0; k <= SHEET_STEPS; k++, i++) {
            launch.set([x, y, z], i * 3);
            vel.set([vx, vy, vz], i * 3);
            info.set([k / SHEET_STEPS, j / (n - 1), w], i * 3);
            if (j < n - 1 && k < SHEET_STEPS) {
              const a = i;
              const b = i + SHEET_STEPS + 1;
              index.push(a, b, a + 1, b, b + 1, a + 1);
            }
          }
        });
      }
      mesh.geometry.dispose();
      mesh.geometry = new THREE.BufferGeometry();
      mesh.geometry.setAttribute('position', new THREE.BufferAttribute(launch, 3));
      mesh.geometry.setAttribute('aLaunch', mesh.geometry.getAttribute('position'));
      mesh.geometry.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
      mesh.geometry.setAttribute('aSheet', new THREE.BufferAttribute(info, 3));
      mesh.geometry.setIndex(index);
    },
    update(t, k, boatMatrix) {
      material.uniforms.uTime.value = t;
      material.uniforms.uSurge.value = k;
      material.uniforms.uBoat.value.copy(boatMatrix);
    },
  };
}

// ---------- droplets, ligaments and mist ----------

// Each particle is one quad, oriented on screen along its motion and stretched by the distance
// it covers in EXPOSURE seconds: just off the chine the stretch is larger still, so the first
// stretch of the flight reads as torn ligaments of the sheet. The streak is capped at a few
// times the drop's width and tapers to soft points, so drops passing close to the camera read
// as drops, not hard dashes, and those within a couple of metres of it fade out. A drop narrower
// than a pixel keeps a pixel's width and dims instead, so distant spray reads as a haze, not
// grit. Mist is a soft, faint, slightly speckled puff carried aft on the apparent wind.
function createDrops(count) {
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const info = new Float32Array(count * 4); // age / life, size (m), kind, random seed
  const age = new Float32Array(count);
  const life = new Float32Array(count).fill(-1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const aPos = new THREE.InstancedBufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aVel = new THREE.InstancedBufferAttribute(vel, 3).setUsage(THREE.DynamicDrawUsage);
  const aInfo = new THREE.InstancedBufferAttribute(info, 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aPos', aPos);
  geometry.setAttribute('aVel', aVel);
  geometry.setAttribute('aInfo', aInfo);
  geometry.instanceCount = count;

  const material = new THREE.ShaderMaterial({
    uniforms: { ...lightUniforms(), uScale: { value: 800 } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aPos;
      attribute vec3 aVel;
      attribute vec4 aInfo;
      uniform float uScale;
      varying vec2 vQuad;
      varying float vRun;
      varying float vAlpha;
      varying float vMist;
      varying float vGlint;
      varying float vSeed;
      varying vec3 vWorld;
      void main() {
        float k = aInfo.x;
        float kind = aInfo.z;
        vMist = kind == ${MIST}.0 ? 1.0 : 0.0;
        vSeed = aInfo.w;
        vWorld = aPos;
        vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
        float depth = max(-mv.z, 0.05);
        float size = aInfo.y * (vMist > 0.5 ? 0.5 + 1.1 * k : 1.0);
        float w = max(0.5 * size, 0.6 * depth / uScale);
        // Motion across the view at the drop's depth (metres per second).
        vec3 vv = (modelViewMatrix * vec4(aVel, 0.0)).xyz;
        vec2 d = vv.xy + mv.xy * vv.z / depth;
        float speed = length(d);
        vec2 dir = speed > 1e-4 ? d / speed : vec2(1.0, 0.0);
        float stretch = vMist > 0.5 ? 1.0 : kind == ${DROP}.0 ? 1.0 + 3.5 * (1.0 - smoothstep(0.0, 0.25, k)) : 1.0;
        float run = min(0.5 * speed * ${EXPOSURE.toFixed(4)} * stretch, min(0.08, w * (2.5 + 1.2 * (stretch - 1.0))));
        mv.xy += dir * position.x * (run + w) + vec2(-dir.y, dir.x) * position.y * w;
        gl_Position = projectionMatrix * mv;
        vQuad = vec2(position.x * (run + w) / w, position.y);
        vRun = run / w;
        // Coverage: the drop's own width over the drawn width, spread along its streak.
        float cover = 0.5 * size / w * mix(1.0, w / (w + run), 0.55);
        vAlpha = vMist > 0.5 ? 0.045 * sin(3.14159 * k) : (1.0 - k * k) * 0.9 * cover;
        // Drops fade into the water as they fall back; mist lies low over it.
        vAlpha *= smoothstep(-0.01, vMist > 0.5 ? 0.12 : 0.05, aPos.y);
        // Nothing streaks across the lens.
        vAlpha *= smoothstep(0.4, 1.9, depth);
        if (aInfo.y <= 0.0) vAlpha = 0.0;
        // Now and then a drop catches the sun.
        vGlint = vMist > 0.5 ? 0.0 : pow(max(sin(vSeed * 40.0 + k * 22.0), 0.0), 60.0) * cover;
      }`,
    fragmentShader: /* glsl */ `
      ${noiseChunk}
      ${sprayLight}
      varying vec2 vQuad;
      varying float vRun;
      varying float vAlpha;
      varying float vMist;
      varying float vGlint;
      varying float vSeed;
      varying vec3 vWorld;
      void main() {
        // Along the streak (0 at its middle, 1 at its tips) and across it, in half-widths.
        float t = abs(vQuad.x) / (vRun + 1.0);
        float r = t * t + vQuad.y * vQuad.y;
        if (t > 1.0) discard;
        float a;
        if (vMist > 0.5) {
          // A cloud of fine droplets, not a smoke puff: soft, and grainy inside.
          float grain = vnoise(vQuad * 3.5 + vSeed * 31.0);
          a = exp(-r * 3.0) * (0.45 + 0.9 * grain);
        } else {
          // A spindle that narrows to soft points at both tips, brighter at its head than its tail
          // (a round drop when it barely moves).
          float y = vQuad.y / max(sqrt(1.0 - t * t), 0.2);
          a = exp(-y * y * 2.6) * (1.0 - t * t) * mix(0.6, 1.0, vQuad.x / (vRun + 1.0) * 0.5 + 0.5);
        }
        vec3 col = sprayColour(vWorld, 0.6 + 0.4 * vMist) + uSunColor * vGlint * 4.0;
        gl_FragColor = vec4(col, a * min(vAlpha + vGlint, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;

  let chine = [];
  let chineTotal = 0;
  let chineTop = 1;
  let props = [];
  let next = 0;
  let carry = 0;
  const p = new THREE.Vector3();
  const v = new THREE.Vector3();
  const turn = new THREE.Matrix3();

  // A particle launched at boat-frame (x, y, z) with boat-frame velocity v, flown on for
  // `ahead` seconds so it starts where the sheet tears rather than at the chine.
  function spawn(boatMatrix, x, y, z, ahead, lifeS, size, kind) {
    const i = next;
    next = (next + 1) % count;
    p.set(x, y, z).applyMatrix4(boatMatrix);
    v.applyMatrix3(turn);
    const j = i * 3;
    pos[j] = p.x + v.x * ahead;
    pos[j + 1] = Math.max(p.y + v.y * ahead - 0.5 * GRAVITY * ahead * ahead, 0.005);
    pos[j + 2] = p.z + v.z * ahead;
    vel[j] = v.x;
    vel[j + 1] = v.y - GRAVITY * ahead;
    vel[j + 2] = v.z;
    age[i] = 0;
    life[i] = lifeS;
    info[i * 4] = 0;
    info[i * 4 + 1] = size;
    info[i * 4 + 2] = kind;
    info[i * 4 + 3] = Math.random();
  }

  // Drop diameters: mostly fine, a few large (a steep power law).
  const dropSize = (small, large) => small + (large - small) * Math.pow(Math.random(), 3);

  // One particle from a chine station picked by weight, or from a prop.
  function emit(boatMatrix, speed, k) {
    const lift = 0.85 + 0.2 * k;
    if (Math.random() < 0.7 && chine.length) {
      let w = Math.random() * chineTotal;
      let c = chine[0];
      for (const station of chine) {
        c = station;
        w -= station[3];
        if (w <= 0) break;
      }
      const side = Math.random() < 0.5 ? -1 : 1;
      const mist = Math.random() < 0.08;
      whiskerVelocity(v, speed, c[3] / chineTop, Math.random(), lift * (0.9 + 0.2 * Math.random()));
      v.z *= side;
      spawn(boatMatrix, c[0] + (Math.random() - 0.5) * 0.25, c[1], side * (c[2] + 0.01),
        mist ? 0.12 + 0.1 * Math.random() : 0.04 + 0.12 * Math.random(),
        mist ? 0.6 + 0.5 * Math.random() : 0.45 + 0.35 * Math.random(),
        mist ? 0.05 + 0.06 * Math.random() : dropSize(0.004, 0.022), mist ? MIST : DROP);
    } else if (props.length) {
      // The rooster tail: water thrown up and aft off the lower unit, a low plume at cruise.
      const [x, z] = props[Math.floor(Math.random() * props.length)];
      const mist = Math.random() < 0.14;
      plumeVelocity(v, speed, Math.random() * 2 - 1, Math.random(), lift * (0.85 + 0.3 * Math.random()));
      spawn(boatMatrix, x - 0.25 * Math.random(), 0.02, z + (Math.random() - 0.5) * 0.12, 0,
        mist ? 0.7 + 0.5 * Math.random() : 0.35 + 0.4 * Math.random(),
        mist ? 0.07 + 0.08 * Math.random() : dropSize(0.005, 0.028), mist ? MIST : PLUME);
    }
  }

  function step(dt, k, boatMatrix, speed) {
    turn.setFromMatrix4(boatMatrix);
    // Enough births to keep the pool about two-thirds full at the mean lifetime and an average
    // surge, so the bursts have room.
    carry += (count / 0.6) * 0.62 * k * dt;
    while (carry >= 1) {
      emit(boatMatrix, speed, k);
      carry -= 1;
    }
    for (let i = 0; i < count; i++) {
      if (life[i] < 0) continue;
      age[i] += dt;
      const j = i * 3;
      const kind = info[i * 4 + 2];
      // Drops fly ballistic with a little drag towards the apparent wind; mist hangs in the
      // air, so it streams aft with the wind and barely falls.
      const drag = (kind === MIST ? DRAG.mist : DRAG.drop) * dt;
      vel[j] += (-speed - vel[j]) * drag;
      vel[j + 2] -= vel[j + 2] * drag;
      if (kind === MIST) vel[j + 1] = vel[j + 1] * (1 - drag) + 0.1 * dt;
      else vel[j + 1] -= GRAVITY * dt;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt;
      if (age[i] >= life[i] || (kind !== MIST && pos[j + 1] < -0.01)) {
        life[i] = -1;
        info[i * 4 + 1] = 0;
        continue;
      }
      info[i * 4] = age[i] / life[i];
    }
    aPos.needsUpdate = true;
    aVel.needsUpdate = true;
    aInfo.needsUpdate = true;
  }

  return {
    mesh,
    setRig(rig) {
      chine = rig.chine;
      chineTotal = chine.reduce((s, c) => s + c[3], 0);
      chineTop = Math.max(...chine.map((c) => c[3]));
      props = rig.props;
      life.fill(-1);
      for (let i = 0; i < count; i++) info[i * 4 + 1] = 0;
    },
    step,
  };
}

// ---------- white water against the hull, underway ----------

// Two ribbons in world space, one a side, from the spray root aft past the transom. Each runs
// from just under the chine edge (inner, uv.y = 0) down and out to the sea (outer, uv.y = 1);
// uv.x runs from the spray root (0) to the ribbon's end astern (1). It is a low mound of
// tumbling foam: rolls parallel to the hull that churn outwards as they stream aft, lit by the
// sun on their faces and shaded in their troughs, with some height to its top edge in profile.
// Out towards the sea it thins into the same lace pattern the sea's own foam uses (water.js),
// so it runs on into that foam without an edge. build(rows) takes, per station, [inner xyz,
// outer xyz] pairs for the starboard side (the port ribbon mirrors it). detail 0 (phones) lights
// the rolls flat instead of from their slopes.
const WW_ACROSS = 6;
export function createWhiteWater({ detail = 1 } = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uFlow: { value: 0 },
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() },
      uSunColor: { value: new THREE.Color('#ffc58a') },
    },
    defines: { DETAIL: detail },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      ${noiseChunk}
      uniform float uFlow;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        // The mound: highest a little out from the hull, heaving as the foam streams through.
        vec2 q = w.xz + vec2(uFlow, 0.0);
        float mound = pow(sin(3.14159 * min(uv.y * 1.4, 1.0)), 0.8) * smoothstep(0.0, 0.15, uv.x) * smoothstep(1.0, 0.75, uv.x);
        w.y += mound * (0.025 + 0.05 * vnoise(q * vec2(0.9, 2.2) + vec2(0.0, uTime * 0.4)));
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${noiseChunk}
      uniform float uFlow;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vec2 q = vWorld.xz + vec2(uFlow, 0.0);
        float fade = 1.0 / (1.0 + length(vWorld.xz - cameraPosition.xz) * 0.07);
        // The sea's foam pattern, exactly as water.js draws it.
        float n = fbm(q * vec2(0.7, 2.0) + vec2(0.0, uTime * 0.15));
        float grain = vnoise(q * vec2(5.0, 9.0) - vec2(uTime * 0.6, 0.0)) * 0.6 + vnoise(q * vec2(13.0, 21.0) + vec2(0.0, uTime)) * 0.4;
        float sea = n * 0.62 + mix(0.24, grain * 0.5, fade);
        // Rolls lying along the hull, tumbling outwards as they stream aft.
        vec2 r = vec2(q.x * 1.2, (abs(vWorld.z) - uTime * 1.3) * 5.0);
        float roll = fbm(r);
        #if DETAIL == 1
          vec2 slope = vec2(fbm(r + vec2(0.08, 0.0)) - roll, fbm(r + vec2(0.0, 0.08)) - roll) / 0.08;
        #else
          vec2 slope = vec2(0.0);
        #endif
        // Dense against the hull, out to lace towards the sea; ragged at both ends.
        float body = smoothstep(1.0, 0.2, vUv.y + (n - 0.45) * 0.7) * smoothstep(0.0, 0.2, vUv.x + (n - 0.5) * 0.2) * smoothstep(1.0, 0.7, vUv.x);
        float core = body * body;
        float v = mix(sea, roll * 0.75 + grain * 0.25 + 0.2, core);
        float thr = 0.98 - 0.85 * body;
        float a = smoothstep(thr, thr + 0.2, v) * smoothstep(0.03, 0.25, body);
        // Sunlit faces bright, troughs a soft grey; thin foam shows the aerated water through it.
        vec3 nrm = normalize(vec3(-slope.x * 0.25, 1.0, -slope.y * 1.2 * sign(vWorld.z)));
        float lit = 0.6 + 0.6 * max(dot(nrm, uSunDir), 0.0) + 0.3 * (roll - 0.5) * core;
        vec3 foam = vec3(0.86, 0.9, 0.92) * lit * mix(vec3(1.0), uSunColor, 0.18);
        vec3 aer = vec3(0.15, 0.32, 0.34) * (0.9 + 1.4 * max(uSunDir.y, 0.0));
        gl_FragColor = vec4(mix(aer, foam, smoothstep(0.0, 0.5, a)), a * 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  function build(rows) {
    const n = rows.length;
    const per = (WW_ACROSS + 1) * 2;
    const position = new Float32Array(n * per * 3);
    const uv = new Float32Array(n * per * 2);
    const index = [];
    // Vertices per station: starboard inner to outer, then port inner to outer.
    rows.forEach(([inner, outer], i) => {
      const u = i / (n - 1);
      for (let c = 0; c <= WW_ACROSS; c++) {
        const f = c / WW_ACROSS;
        const x = inner[0] + (outer[0] - inner[0]) * f;
        const y = inner[1] + (outer[1] - inner[1]) * f;
        const z = inner[2] + (outer[2] - inner[2]) * f;
        position.set([x, y, z], (i * per + c) * 3);
        position.set([x, y, -z], (i * per + WW_ACROSS + 1 + c) * 3);
        uv.set([u, f], (i * per + c) * 2);
        uv.set([u, f], (i * per + WW_ACROSS + 1 + c) * 2);
        if (i < n - 1 && c < WW_ACROSS) {
          for (const side of [0, WW_ACROSS + 1]) {
            const a = i * per + side + c;
            const b = a + per;
            index.push(a, b, a + 1, b, b + 1, a + 1);
          }
        }
      }
    });
    mesh.geometry.dispose();
    mesh.geometry = new THREE.BufferGeometry();
    mesh.geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    mesh.geometry.setIndex(index);
  }
  return { mesh, build };
}
