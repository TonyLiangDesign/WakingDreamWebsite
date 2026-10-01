import * as THREE from 'three';
import { getTextures } from './textures.js';

// GPU smoke plumes (instanced billboards, fully animated in the vertex shader) and
// wheeling gulls. Wind: brisk north-westerly on 10 April 1912 → drift toward the SE.

export const WIND = new THREE.Vector3(0.62, 0, 0.78).normalize().multiplyScalar(6.5);

const smokeVert = /* glsl */`
  attribute vec3 aOrigin;
  attribute vec4 aParams;   // phase (0..1), seed, life (s), size (m)
  attribute vec4 aStyle;    // rise (m/s), spread, darkness, opacity
  uniform float uTime;
  uniform vec3 uWind;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vDark;
  varying mat3 vBasis;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    float life = aParams.z;
    float age = fract(uTime / life + aParams.x);
    float t = age * life;
    float s = aParams.y;
    // buoyant rise that slows, wind drift that grows as the plume leaves the funnel lee
    vec3 p = aOrigin;
    p.y += aStyle.x * (1.0 - exp(-t * 0.45)) * 2.2 + t * 0.25;
    p += uWind * t * (0.35 + 0.65 * smoothstep(0.0, 4.0, t));
    float turb = aStyle.y * t;
    p.x += sin(t * 0.7 + s * 17.0) * turb * 0.35 + (s - 0.5) * turb;
    p.z += cos(t * 0.6 + s * 23.0) * turb * 0.35 + (fract(s * 7.3) - 0.5) * turb;
    p.y += sin(t * 0.5 + s * 11.0) * turb * 0.15;
    float size = aParams.w * (0.6 + 1.8 * sqrt(age) + age * 1.8);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float ang = s * 6.2831 + t * (fract(s * 13.1) - 0.5) * 0.3;
    vec2 c = vec2(cos(ang), sin(ang));
    vec2 q = position.xy;
    q = vec2(q.x * c.x - q.y * c.y, q.x * c.y + q.y * c.x);
    mv.xy += q * size;
    gl_Position = projectionMatrix * mv;
    vUv = position.xy + 0.5;
    vAlpha = aStyle.w * smoothstep(0.0, 0.06, age) * pow(1.0 - age, 1.6);
    vDark = aStyle.z;
    // view-space billboard basis rotated with the sprite, for fake normal lighting
    vBasis = mat3(vec3(c.x, c.y, 0.0), vec3(-c.y, c.x, 0.0), vec3(0.0, 0.0, 1.0));
    #include <logdepthbuf_vertex>
  }
`;

const smokeFrag = /* glsl */`
  uniform sampler2D uTex;
  uniform vec3 uSunView;
  uniform vec3 uSunColor;
  uniform vec3 uAmbient;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vDark;
  varying mat3 vBasis;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    vec4 tx = texture2D(uTex, vUv);
    float a = tx.a * vAlpha;
    if (a < 0.004) discard;
    vec3 n = normalize(vBasis * (tx.rgb * 2.0 - 1.0));
    float diff = clamp(dot(n, uSunView) * 0.5 + 0.55, 0.0, 1.0);
    vec3 albedo = mix(vec3(0.62, 0.60, 0.57), vec3(0.045, 0.042, 0.04), vDark);
    vec3 col = albedo * (uAmbient * 0.8 + uSunColor * diff * mix(1.0, 0.55, vDark));
    // forward scatter glow when looking toward the sun through thin smoke
    gl_FragColor = vec4(col * a, a);
  }
`;

export class Smoke {
  constructor() {
    this.emitters = [];
    this.mesh = null;
    this.uniforms = {
      uTime: { value: 0 },
      uWind: { value: WIND.clone() },
      uTex: { value: getTextures().smoke },
      uSunView: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uAmbient: { value: new THREE.Color(0.5, 0.5, 0.5) },
    };
  }

  // style: { count, life, size, rise, spread, dark, opacity }
  add(origin, style) { this.emitters.push({ origin: origin.clone(), ...style }); }

  build() {
    let total = 0;
    for (const e of this.emitters) total += e.count;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    const origin = new Float32Array(total * 3), prm = new Float32Array(total * 4), sty = new Float32Array(total * 4);
    let k = 0;
    let seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const e of this.emitters) {
      for (let i = 0; i < e.count; i++, k++) {
        origin.set([e.origin.x, e.origin.y, e.origin.z], k * 3);
        prm.set([i / e.count + rnd() * 0.02, rnd(), e.life * (0.85 + rnd() * 0.3), e.size * (0.8 + rnd() * 0.4)], k * 4);
        sty.set([e.rise, e.spread, e.dark, e.opacity], k * 4);
      }
    }
    g.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origin, 3));
    g.setAttribute('aParams', new THREE.InstancedBufferAttribute(prm, 4));
    g.setAttribute('aStyle', new THREE.InstancedBufferAttribute(sty, 4));
    g.instanceCount = total;
    const m = new THREE.ShaderMaterial({
      vertexShader: smokeVert, fragmentShader: smokeFrag, uniforms: this.uniforms,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'smoke';
    return this.mesh;
  }

  update(t, camera, atmo) {
    const u = this.uniforms;
    u.uTime.value = t;
    u.uSunView.value.copy(atmo.sunDir).transformDirection(camera.matrixWorldInverse);
    u.uSunColor.value.copy(atmo.sunColor).multiplyScalar(atmo.sun.intensity / Math.PI * 0.9);
    u.uAmbient.value.copy(atmo.horizonAway).multiplyScalar(0.9);
  }
}

// ------------------------------------------------------------------ gulls
const gullVert = /* glsl */`
  attribute vec4 aOrbit;  // centre x, centre z, radius, height
  attribute vec4 aMotion; // angular speed, phase, flap rate, seed
  uniform float uTime;
  varying float vShade;
  #include <common>
  #include <logdepthbuf_pars_vertex>
  void main() {
    float s = aMotion.w;
    float a = aMotion.y + uTime * aMotion.x;
    float r = aOrbit.z * (1.0 + 0.25 * sin(uTime * 0.13 + s * 9.0));
    vec3 c = vec3(aOrbit.x + cos(a) * r, aOrbit.w + sin(uTime * 0.21 + s * 5.0) * 6.0, aOrbit.y + sin(a) * r);
    vec3 fwd = normalize(vec3(-sin(a), 0.0, cos(a)) * sign(aMotion.x));
    vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
    // glide most of the time, flap in bursts
    float burst = smoothstep(0.55, 0.8, sin(uTime * 0.4 + s * 31.0));
    float flap = sin(uTime * aMotion.z + s * 40.0) * (0.15 + 0.85 * burst);
    vec3 p = position;
    float span = abs(p.x);
    p.y += span * (0.25 + flap * 0.9) - (span > 0.35 ? (span - 0.35) * 0.45 : 0.0);
    vec3 bank = right * p.x + vec3(0.0, 1.0, 0.0) * p.y + fwd * p.z;
    vec3 wp = c + bank;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vShade = 0.75 + 0.25 * sign(position.x + 1e-3) * flap;
    #include <logdepthbuf_vertex>
  }
`;
const gullFrag = /* glsl */`
  uniform vec3 uLight;
  varying float vShade;
  #include <common>
  #include <logdepthbuf_pars_fragment>
  void main() {
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(uLight * vShade, 1.0);
  }
`;

export function createGulls(flocks, rnd) {
  // simple gull silhouette: body + two jointed wings, 1.3 m span
  const pos = [
    -0.65, 0, -0.05, -0.3, 0, 0.12, -0.3, 0, -0.14,
    -0.3, 0, 0.12, 0.0, 0, 0.18, -0.3, 0, -0.14,
    0.0, 0, 0.18, 0.0, 0, -0.16, -0.3, 0, -0.14,
    0.65, 0, -0.05, 0.3, 0, -0.14, 0.3, 0, 0.12,
    0.3, 0, 0.12, 0.3, 0, -0.14, 0.0, 0, 0.18,
    0.0, 0, 0.18, 0.3, 0, -0.14, 0.0, 0, -0.16,
    -0.05, 0, 0.35, 0.05, 0, 0.35, 0.0, 0, -0.3,
  ];
  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', base.attributes.position);
  const orbit = [], motion = [];
  for (const f of flocks) {
    for (let i = 0; i < f.count; i++) {
      orbit.push(f.x + (rnd() - 0.5) * f.r, f.z + (rnd() - 0.5) * f.r, 15 + rnd() * f.r * 0.6, f.y + rnd() * f.h);
      motion.push((rnd() < 0.5 ? -1 : 1) * (0.08 + rnd() * 0.12), rnd() * 6.28, 7 + rnd() * 3, rnd());
    }
  }
  g.setAttribute('aOrbit', new THREE.InstancedBufferAttribute(new Float32Array(orbit), 4));
  g.setAttribute('aMotion', new THREE.InstancedBufferAttribute(new Float32Array(motion), 4));
  g.instanceCount = orbit.length / 4;
  const m = new THREE.ShaderMaterial({
    vertexShader: gullVert, fragmentShader: gullFrag, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uLight: { value: new THREE.Color(1.5, 1.5, 1.45) } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.name = 'gulls';
  return mesh;
}
