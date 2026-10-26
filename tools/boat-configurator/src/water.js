import * as THREE from 'three';

// Golden-hour harbour: one sky function shared by the dome, the water reflection and the
// PBR environment, so paint, glass and water all agree on the light.

export const SUN_DIR = new THREE.Vector3(-0.62, 0.17, 0.77).normalize();

// The waterline is sampled at this many stations from transom to bow.
export const WL_STATIONS = 16;

const skyUniforms = () => ({
  uTop: { value: new THREE.Color('#4f74a3') },
  uHorizon: { value: new THREE.Color('#e8cbb2') },
  uSunDir: { value: SUN_DIR.clone() },
  uSunColor: { value: new THREE.Color('#ffd7a8') },
});

const skyChunk = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  vec3 skyColour(vec3 dir) {
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uTop, pow(h, 0.5));
    col = mix(col, uHorizon * 0.55, clamp(-dir.y * 3.0, 0.0, 1.0));
    float sun = max(dot(dir, uSunDir), 0.0);
    col += uSunColor * (pow(sun, 6.0) * 0.35 + pow(sun, 48.0) * 0.7);
    return col;
  }
`;

export function createSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: skyUniforms(),
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      ${skyChunk}
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        vec3 col = skyColour(dir);
        col += uSunColor * smoothstep(0.9993, 0.9997, dot(dir, uSunDir)) * 6.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

export function createWater() {
  const uniforms = {
    ...skyUniforms(),
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color('#0b2631') },
    uGlow: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uGlowOn: { value: 0 },
    uGlowColor: { value: new THREE.Color('#2f9cff') },
    uHullX: { value: new THREE.Vector2(-3, 6) },
    uWl: { value: new Array(WL_STATIONS + 1).fill(0) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${skyChunk}
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uGlow[2];
      uniform float uGlowOn;
      uniform vec3 uGlowColor;
      uniform vec2 uHullX;
      uniform float uWl[${WL_STATIONS + 1}];
      varying vec3 vWorld;

      // Sum of directional swells and chop; returns the surface slope.
      vec2 slope(vec2 p, float t, float fade) {
        vec2 g = vec2(0.0);
        vec2 dirs[7] = vec2[7](vec2(1.0, 0.18), vec2(0.72, 0.69), vec2(-0.3, 0.95), vec2(0.94, -0.33), vec2(-0.82, 0.57), vec2(0.21, -0.98), vec2(0.55, 0.83));
        float freq[7] = float[7](0.32, 0.55, 0.9, 1.6, 2.7, 4.3, 7.1);
        float amp[7] = float[7](0.05, 0.032, 0.02, 0.012, 0.007, 0.004, 0.0025);
        for (int i = 0; i < 7; i++) {
          float f = freq[i];
          float speed = sqrt(9.8 * f) * 0.55;
          float phase = dot(p, normalize(dirs[i])) * f + t * speed + float(i) * 1.7;
          float a = amp[i] * (i > 3 ? fade : 1.0);
          g += normalize(dirs[i]) * a * f * cos(phase);
        }
        return g;
      }

      // Approximate distance from the hull's waterline: transom at uHullX.x, length uHullX.y.
      float hullDist(vec2 p) {
        float t = (p.x - uHullX.x) / uHullX.y;
        float tc = clamp(t, 0.0, 1.0);
        float f = tc * ${WL_STATIONS}.0;
        int i = int(min(floor(f), ${WL_STATIONS - 1}.0));
        float hw = mix(uWl[i], uWl[i + 1], f - float(i));
        float dz = abs(p.y) - hw;
        return length(vec2((t - tc) * uHullX.y, max(dz, 0.0))) + min(dz, 0.0);
      }

      void main() {
        float dist = length(vWorld.xz - cameraPosition.xz);
        float fade = 1.0 / (1.0 + dist * 0.06);
        vec2 g = slope(vWorld.xz, uTime, fade) * (0.35 + 0.65 * fade);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
        vec3 r = reflect(-v, n);
        r.y = abs(r.y);
        vec3 refl = skyColour(r);
        vec3 body = uDeep * (0.7 + 0.5 * max(dot(n, uSunDir), 0.0));

        // Calm water in the lee of the hull, a dark reflection where it meets the topsides
        // and a thin broken wash line at the waterline.
        float d = max(hullDist(vWorld.xz), 0.0);
        float lee = exp(-d * 0.9);
        vec3 col = mix(body, refl, fres * (1.0 - 0.55 * lee));
        col += uSunColor * pow(max(dot(r, uSunDir), 0.0), 380.0) * 2.4 * (1.0 - lee);
        col = mix(col, uDeep * 0.45, 0.6 * exp(-d / 0.16));
        float broken = 0.55 + 0.45 * sin(vWorld.x * 9.0 + uTime * 1.3 + sin(vWorld.z * 13.0));
        col += vec3(0.62, 0.64, 0.63) * exp(-pow(d / 0.035, 2.0)) * broken * 0.5;

        for (int i = 0; i < 2; i++) {
          vec2 d = vWorld.xz - uGlow[i].xz;
          col += uGlowColor * uGlowOn * exp(-dot(d, d) * 1.6) * 0.75;
        }
        col = mix(col, skyColour(normalize(vec3(-v.x, 0.015, -v.z))), smoothstep(60.0, 1100.0, dist));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}
