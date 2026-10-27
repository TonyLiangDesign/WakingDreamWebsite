import * as THREE from 'three';
import { SUN_DIR, noiseChunk } from './water.js';

// Spray off the planing hull, simulated on the CPU as soft points in the boat's frame (the boat
// holds still and the sea streams aft past it at the cruising speed):
//   whisker spray  sheets flung outboard from under the chines over the forward wetted length,
//                  carried aft by the flow and falling back into the white water within a second
//   prop plume     a low rooster tail kicked up astern of each lower unit
// Most points are droplets; a share are large faint mist puffs that swell as they drift.
//   createSpray({ count })  -> { points, setRig(rig), warm(boat, speed), update(dt, boat, speed), setScale(px) }
//   setRig({ chine: [[x, y, z, weight]...], props: [[x, z]...] }) in boat coordinates.
//   createWhiteWater()      the white water piled against each side, from under the chine out
//                           onto the sea, so a profile view shows the hull pressing into it

const GRAVITY = 9.8;

export function createSpray({ count = 2400 } = {}) {
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  const info = new Float32Array(count * 3); // age / life, size (m), kind (0 droplet, 1 mist)
  const age = new Float32Array(count);
  const life = new Float32Array(count).fill(-1);
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aInfo = new THREE.BufferAttribute(info, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('aInfo', aInfo);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 800 },
      uSunDir: { value: SUN_DIR.clone() },
      uSunColor: { value: new THREE.Color('#ffd8b0') },
      uSky: { value: new THREE.Color('#b9c6d2') },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aInfo;
      uniform float uScale;
      uniform vec3 uSunDir;
      varying float vAlpha;
      varying float vMist;
      varying float vBack;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float k = aInfo.x;
        vMist = aInfo.z;
        float size = aInfo.y * (vMist > 0.5 ? 0.45 + 1.6 * k : 1.0);
        float px = size * uScale / max(-mv.z, 0.05);
        gl_PointSize = clamp(px, 1.0, 96.0);
        // Droplets fade as they fall back; mist swells in and thins out. A droplet smaller than
        // a pixel dims instead of shrinking, so distant spray reads as a haze, not grit.
        vAlpha = vMist > 0.5 ? 0.035 * sin(3.14159 * k) : (1.0 - k * k) * 0.55;
        vAlpha *= clamp(px / 1.6, 0.25, 1.0);
        if (aInfo.y <= 0.0) vAlpha = 0.0;
        // Spray glows when the low sun is behind it (the points live in world space).
        vec3 view = normalize(cameraPosition - position);
        vBack = pow(max(dot(-view, uSunDir), 0.0), 4.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunColor;
      uniform vec3 uSky;
      varying float vAlpha;
      varying float vMist;
      varying float vBack;
      void main() {
        vec2 c = gl_PointCoord * 2.0 - 1.0;
        float r = dot(c, c);
        if (r > 1.0) discard;
        float a = vMist > 0.5 ? exp(-r * 2.5) : smoothstep(1.0, 0.35, r);
        vec3 col = uSky * 0.75 + uSunColor * (0.45 + 1.6 * vBack);
        gl_FragColor = vec4(col, a * vAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.visible = false;

  let chine = [];
  let chineTotal = 0;
  let props = [];
  let next = 0;
  let carry = 0;
  const p = new THREE.Vector3();

  function spawn(boat, x, y, z, vx, vy, vz, lifeS, size, kind) {
    const i = next;
    next = (next + 1) % count;
    p.set(x, y, z).applyMatrix4(boat.matrixWorld);
    pos.set([p.x, Math.max(p.y, 0.005), p.z], i * 3);
    vel.set([vx, vy, vz], i * 3);
    age[i] = 0;
    life[i] = lifeS;
    info[i * 3 + 1] = size;
    info[i * 3 + 2] = kind;
  }

  // One spray particle from a chine station picked by weight, or from a prop.
  function emit(boat, speed) {
    const r = Math.random();
    if (r < 0.8 && chine.length) {
      let w = Math.random() * chineTotal;
      let c = chine[0];
      for (const station of chine) {
        c = station;
        w -= station[3];
        if (w <= 0) break;
      }
      const side = Math.random() < 0.5 ? -1 : 1;
      const mist = Math.random() < 0.06;
      // A thin sheet: launch speeds vary little, so the drops fly out together.
      const kick = Math.random();
      spawn(boat, c[0] + (Math.random() - 0.5) * 0.2, c[1], side * (c[2] + 0.01),
        -speed * (0.5 + 0.2 * Math.random()), 0.55 + 1.1 * kick, side * (2.0 + 1.4 * kick + 0.4 * Math.random()),
        mist ? 0.8 + 0.5 * Math.random() : 0.35 + 0.35 * Math.random(),
        mist ? 0.2 + 0.25 * Math.random() : 0.008 + 0.016 * Math.random(), mist ? 1 : 0);
    } else if (props.length) {
      const [x, z] = props[Math.floor(Math.random() * props.length)];
      const mist = Math.random() < 0.12;
      spawn(boat, x - 0.2 * Math.random(), 0, z + (Math.random() - 0.5) * 0.15,
        -(2.5 + 3.5 * Math.random()), 0.9 + 1.8 * Math.random(), (Math.random() - 0.5) * 0.8,
        mist ? 1.0 + 0.6 * Math.random() : 0.45 + 0.4 * Math.random(),
        mist ? 0.25 + 0.3 * Math.random() : 0.01 + 0.02 * Math.random(), mist ? 1 : 0);
    }
  }

  function step(dt, boat, speed, emitting) {
    if (emitting) {
      // Enough births to keep the pool about full at the mean lifetime.
      carry += (count / 0.62) * dt;
      while (carry >= 1) {
        emit(boat, speed);
        carry -= 1;
      }
    }
    for (let i = 0; i < count; i++) {
      if (life[i] < 0) continue;
      age[i] += dt;
      const j = i * 3;
      const mist = info[j + 2] > 0.5;
      // Mist hangs in the air and only drifts aft; droplets fly ballistic.
      if (mist) {
        vel[j] *= 1 - 1.5 * dt;
        vel[j + 1] = vel[j + 1] * (1 - 2.5 * dt) + 0.1 * dt;
        vel[j + 2] *= 1 - 2 * dt;
      } else vel[j + 1] -= GRAVITY * dt;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt;
      if (age[i] >= life[i] || (!mist && pos[j + 1] < -0.01)) {
        life[i] = -1;
        info[j + 1] = 0;
        continue;
      }
      info[j] = age[i] / life[i];
    }
    position.needsUpdate = true;
    aInfo.needsUpdate = true;
  }

  return {
    points,
    setRig(rig) {
      chine = rig.chine;
      chineTotal = chine.reduce((s, c) => s + c[3], 0);
      props = rig.props;
      life.fill(-1);
      for (let i = 0; i < count; i++) info[i * 3 + 1] = 0;
    },
    // Runs the spray for a second so the first frame afloat already has it.
    warm(boat, speed) {
      for (let k = 0; k < 40; k++) step(1 / 40, boat, speed, true);
    },
    update(dt, boat, speed) {
      if (dt > 0) step(Math.min(dt, 1 / 20), boat, speed, true);
    },
    // Pixels per metre at one metre from the camera: drawing-buffer height * P[1][1] / 2.
    setScale(scale) {
      material.uniforms.uScale.value = scale;
    },
  };
}

// ---------- white water against the hull, underway ----------

// Two ribbons in world space, one a side, from the spray root aft past the transom. Each runs
// from just under the chine edge (inner, uv.y = 0) down and out to the sea (outer, uv.y = 1);
// uv.x runs from the spray root (0) to the ribbon's end astern (1). Foam streams aft through
// it at the cruising speed. build(rows) takes, per station, [inner xyz, outer xyz] pairs for
// the starboard side (the port ribbon mirrors it).
export function createWhiteWater() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uFlow: { value: 0 },
      uTime: { value: 0 },
      uSunDir: { value: SUN_DIR.clone() },
      uSunColor: { value: new THREE.Color('#ffc58a') },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
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
        float n = fbm(q * vec2(1.1, 3.5) + vec2(0.0, uTime * 0.3));
        float grain = vnoise(q * vec2(6.0, 11.0) - vec2(uTime * 0.8, 0.0));
        // Dense against the hull, breaking into lace towards the sea and at both ends.
        // The ragged edges come from the noise, not the ribbon's straight outline.
        float body = smoothstep(1.0, 0.1, vUv.y + (n - 0.45) * 0.5) * smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float a = smoothstep(0.86 - 0.5 * body, 1.0 - 0.5 * body, n * 0.75 + grain * 0.35);
        vec3 col = vec3(0.86, 0.9, 0.92) * (0.85 + 0.5 * max(uSunDir.y + 0.3, 0.0)) * mix(vec3(1.0), uSunColor, 0.18);
        gl_FragColor = vec4(col, a * body * 0.85);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  function build(rows) {
    const n = rows.length;
    const position = new Float32Array(n * 4 * 3);
    const uv = new Float32Array(n * 4 * 2);
    const index = [];
    // Vertices per station: starboard inner, starboard outer, port inner, port outer.
    rows.forEach(([inner, outer], i) => {
      const u = i / (n - 1);
      position.set([inner[0], inner[1], inner[2], outer[0], outer[1], outer[2], inner[0], inner[1], -inner[2], outer[0], outer[1], -outer[2]], i * 12);
      uv.set([u, 0, u, 1, u, 0, u, 1], i * 8);
      if (i < n - 1) {
        for (const side of [0, 2]) {
          const a = i * 4 + side;
          const b = a + 4;
          index.push(a, b, a + 1, b, b + 1, a + 1);
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
