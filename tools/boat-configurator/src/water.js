import * as THREE from 'three';

// Golden-hour harbour: one sky function shared by the dome, the water reflection and the
// PBR environment, so paint, glass and water all agree on the light.
//   createSky()          the dome (also rendered into the PMREM environment)
//   createWater()        the sea: planar reflection (tReflect / uMirror, filled by scene.js),
//                        ripple normals, Fresnel, sun glitter, horizon haze, the dark contact
//                        band at the hull and the soft glow of the underwater lights
//   createUnderwater()   a deep-water floor, so the clear water next to the hull has a bottom
//   wetMaterial(m, u)    patches a boat material: a wet, darker band at the waterline and a
//                        teal fade for anything just under the surface (u from waterlineUniforms)

export const SUN_DIR = new THREE.Vector3(-0.62, 0.17, 0.77).normalize();

// The waterline is sampled at this many stations from transom to bow.
export const WL_STATIONS = 16;

// Deep water colour, shared by the sea, the deep floor and the wet hull.
const DEEP = new THREE.Color('#0d2b37');

const skyUniforms = () => ({
  uTop: { value: new THREE.Color('#4d77ab') },
  uHorizon: { value: new THREE.Color('#f3c99d') },
  uAnti: { value: new THREE.Color('#d6c4bb') },
  uSunDir: { value: SUN_DIR.clone() },
  uSunColor: { value: new THREE.Color('#ffc58a') },
  uDeep: { value: DEEP.clone() },
});

const skyChunk = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uAnti;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uDeep;
  // Horizon colour: warm towards the sun, a cool pale grey away from it.
  vec3 horizonColour(vec3 dir) {
    vec2 flatDir = normalize(dir.xz + vec2(1e-5));
    float toSun = dot(flatDir, normalize(uSunDir.xz)) * 0.5 + 0.5;
    return mix(uAnti, uHorizon, smoothstep(0.0, 1.0, toSun));
  }
  vec3 skyColour(vec3 dir) {
    float h = max(dir.y, 0.0);
    vec3 hor = horizonColour(dir);
    vec3 col = mix(hor, uTop, 1.0 - exp(-h * 3.2));
    // Low haze band sitting on the horizon.
    col = mix(col, hor * 1.06, exp(-h * 22.0) * 0.6);
    // Below the horizon (seen only by the environment): the sea, mirroring a cooler sky. At a
    // grazing angle water is a good mirror, so the first 10-15 degrees down stay a pale reflected
    // sky before the deep colour takes over; topsides lean slightly outboard and down, and their
    // clearcoat picks up that band as a soft gradient instead of a flat dark sheet.
    col = mix(col, mix(mix(hor, uTop, 0.55) * 0.55, uDeep * 1.4, smoothstep(0.0, 0.35, -dir.y)), smoothstep(0.0, 0.02, -dir.y));
    float sun = max(dot(dir, uSunDir), 0.0);
    col += uSunColor * (pow(sun, 5.0) * 0.28 + pow(sun, 40.0) * 0.55 + pow(sun, 400.0) * 1.2);
    return col;
  }
  // Tiny screen-space noise against 8-bit banding in long gradients.
  float dither(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) - 0.5; }
`;

export function createSky() {
  const material = new THREE.ShaderMaterial({
    // uAlpha is 0 in the reflection pass, so the mirror image carries an occlusion mask.
    uniforms: { ...skyUniforms(), uAlpha: { value: 1 } },
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
      uniform float uAlpha;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        vec3 col = skyColour(dir);
        col += uSunColor * smoothstep(0.99955, 0.99975, dot(dir, uSunDir)) * 8.0;
        gl_FragColor = vec4(col, uAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += dither(gl_FragCoord.xy) / 255.0;
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

// detail: 1 for desktop, 0 for small screens (fewer ripple octaves, one reflection tap).
export function createWater({ detail = 1 } = {}) {
  const uniforms = {
    ...skyUniforms(),
    uTime: { value: 0 },
    uGlow: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uGlowAft: { value: new THREE.Vector2(-1, 0) },
    uGlowOn: { value: 0 },
    uGlowColor: { value: new THREE.Color('#5ccfe6') },
    uHullX: { value: new THREE.Vector2(-3, 6) },
    uWl: { value: new Array(WL_STATIONS + 1).fill(0) },
    tReflect: { value: null },
    uMirror: { value: new THREE.Matrix4() },
    uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    defines: { DETAIL: detail ? 1 : 0 },
    vertexShader: /* glsl */ `
      uniform mat4 uMirror;
      varying vec3 vWorld;
      varying vec4 vMirror;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vMirror = uMirror * w;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${skyChunk}
      uniform float uTime;
      uniform vec4 uGlow[2];
      uniform vec2 uGlowAft;
      uniform float uGlowOn;
      uniform vec3 uGlowColor;
      uniform vec2 uHullX;
      uniform float uWl[${WL_STATIONS + 1}];
      uniform sampler2D tReflect;
      uniform vec2 uTexel;
      varying vec3 vWorld;
      varying vec4 vMirror;

      // Long low swell, then chop, then fine ripples that fade with distance.
      // Returns the surface slope (d height / dx, d height / dz).
      #if DETAIL == 1
        #define WAVES 14
      #else
        #define WAVES 9
      #endif
      vec2 slope(vec2 p, float t, float fade) {
        vec2 g = vec2(0.0);
        for (int i = 0; i < WAVES; i++) {
          float fi = float(i);
          // The swells share a prevailing direction; shorter waves spread by the golden angle.
          float a = i < 3 ? 0.35 + fi * 0.43 : 0.35 + fi * 2.39996;
          vec2 d = vec2(cos(a), sin(a));
          float f = 0.28 * pow(1.42, fi);
          float speed = sqrt(9.8 * f) * 0.5;
          float amp = 0.045 * pow(0.66, fi);
          float phase = dot(p, d) * f + t * speed + fi * 1.7;
          float k = i > 4 ? fade : 1.0;
          g += d * amp * f * cos(phase) * k;
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
        float fade = 1.0 / (1.0 + dist * 0.07);
        float d = max(hullDist(vWorld.xz), 0.0);
        // The hull damps the ripples in its lee.
        float lee = exp(-d * 1.4);
        vec2 g = slope(vWorld.xz, uTime, fade) * (0.4 + 0.6 * fade) * (1.0 - 0.55 * lee);
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float nv = clamp(dot(n, v), 0.0, 1.0);
        float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);

        // Water body: deep blue-green, lifted a touch by sky light and the low sun's scatter.
        vec3 body = uDeep * (0.8 + 2.2 * max(dot(n, uSunDir) - 0.12, 0.0)) + uTop * 0.02;

        // Planar reflection of the boat and sky, broken up by the ripples and stretched
        // vertically the way small waves smear a reflection.
        vec2 ruv = vMirror.xy / vMirror.w + g * 0.055;
        // Alpha is the boat's mask in the mirror image (the sky writes none).
        vec4 mirror = texture2D(tReflect, ruv) * 0.5;
        #if DETAIL == 1
          vec2 sv = vec2(0.0, uTexel.y * (1.5 + 3.0 * (1.0 - lee)));
          mirror += texture2D(tReflect, ruv + sv) * 0.25;
          mirror += texture2D(tReflect, ruv - sv) * 0.25;
        #else
          mirror *= 2.0;
        #endif
        vec3 refl = mirror.rgb;

        // Underwater lights: a soft cyan cone under the surface, from each lamp spreading aft;
        // deeper lamps glow wider and fainter. xyz = lamp, w = 1 when fitted.
        vec3 glow = vec3(0.0);
        for (int i = 0; i < 2; i++) {
          vec2 rel = vWorld.xz - uGlow[i].xz;
          float depth = clamp(-uGlow[i].y, 0.03, 1.0);
          float along = dot(rel, uGlowAft);
          float across = dot(rel, vec2(-uGlowAft.y, uGlowAft.x));
          float width = 0.14 + depth * 0.4 + 0.32 * max(along, 0.0);
          float reach = along < 0.0 ? exp(-along * along / 0.02) : exp(-along / (0.8 + depth));
          float k = reach * exp(-across * across / (width * width)) * smoothstep(-0.25, 0.1, along);
          glow += uGlowColor * k * uGlow[i].w * exp(-depth * 2.0);
        }
        body += glow * uGlowOn * 0.35;

        vec3 col = mix(body, refl, fres);

        // Sun glitter: a sharp sparkle up close widening into a glitter path with distance,
        // where the ripples are too small to resolve.
        vec3 hv = normalize(uSunDir + v);
        float e = mix(60.0, 1400.0, fade * fade);
        float spec = pow(max(dot(n, hv), 0.0), e) * (e + 8.0) / 25.0;
        col += uSunColor * spec * fres * 0.9 * (1.0 - 0.8 * lee) * (1.0 - mirror.a);

        // Dark contact band where the water meets the hull, and a faint broken wash line.
        col = mix(col, uDeep * 0.3, 0.55 * exp(-d / 0.07));
        float broken = 0.5 + 0.5 * sin(vWorld.x * 11.0 + uTime * 1.1 + 3.0 * sin(vWorld.z * 7.0 + uTime * 0.7));
        col += vec3(0.5, 0.52, 0.5) * exp(-pow(d / 0.025, 2.0)) * broken * 0.12;

        // Horizon haze.
        col = mix(col, skyColour(normalize(vec3(-v.x, 0.01, -v.z))), smoothstep(80.0, 1200.0, dist));

        // Clear water within a hand's breadth of the hull: the submerged plate shows through,
        // tinted by the wet-material patch; beyond, the sea is opaque.
        float clear = 0.45 * exp(-d / 0.12) * (1.0 - fres) * step(0.001, d);
        gl_FragColor = vec4(col, 1.0 - clear);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += dither(gl_FragCoord.xy) / 255.0;
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 1, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  // First among the transparent objects, so glass and decals always draw over it.
  mesh.renderOrder = -1;
  return mesh;
}

// The floor of the clear-water band: a deep teal plane a metre down.
export function createUnderwater() {
  const material = new THREE.MeshBasicMaterial({ color: DEEP.clone().multiplyScalar(0.55) });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -1.2;
  return mesh;
}

// ---------- wet hull at the waterline ----------

export function waterlineUniforms() {
  return { uWetOn: { value: 0 }, uWetDeep: { value: DEEP.clone() } };
}

// Patches a lit boat material in place: within a few centimetres above the surface the plate
// reads wet and darker (the meniscus), and below it fades into the water colour with depth.
export function wetMaterial(material, uniforms) {
  if (material.userData.wet || !(material.isMeshStandardMaterial || material.isMeshLambertMaterial || material.isMeshPhongMaterial)) return;
  material.userData.wet = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWetY;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 wetP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wetP = instanceMatrix * wetP;
        #endif
        vWetY = (modelMatrix * wetP).y;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vWetY;\nuniform float uWetOn;\nuniform vec3 uWetDeep;')
      .replace('#include <opaque_fragment>', `
        if (uWetOn > 0.5) {
          float wet = 1.0 - smoothstep(0.0, 0.06, vWetY);
          outgoingLight *= 1.0 - 0.5 * wet * wet;
          float depth = max(-vWetY, 0.0);
          if (depth > 0.0) outgoingLight = mix(outgoingLight * vec3(0.45, 0.72, 0.78), uWetDeep, 1.0 - exp(-depth * 7.0));
        }
        #include <opaque_fragment>`);
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|wet`;
  material.needsUpdate = true;
}
