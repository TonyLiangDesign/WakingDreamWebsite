import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { getTextures } from './textures.js';

// Short, crossing wind waves in a sheltered tidal harbour. The reflected scene
// remains planar, but is filtered and refracted by the local wave slope rather
// than appearing as an unbroken mirror at water-level camera angles.
const WaterShader = {
  name: 'HarbourWater',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    tNormal: { value: null },
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSunIntensity: { value: 40 },
    uSkyColor: { value: new THREE.Color(0.5, 0.6, 0.7) },
    uBody: { value: new THREE.Color(0.025, 0.042, 0.034) },
    uWaveScale: { value: 1.0 },
    uDistort: { value: 0.075 },
    uWind: { value: new THREE.Vector2(0.8, 0.3) },
    uHeightTex: { value: null },
    uGrime: { value: null },
    uShipPose: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) },
    uShipDim: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) },
    uShipCount: { value: 0 },
    uHeightRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix;
    uniform float uTime;
    uniform float uWaveScale;
    varying vec4 vUvR;
    varying vec3 vWorld;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUvR = textureMatrix * vec4(position, 1.0);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      // Geometry is densely tessellated around the docks and intentionally
      // coarse offshore. Displace only the dense area (metres, not ocean swell).
      vec2 p = wp.xz;
      float envelope = 1.0 - smoothstep(350.0, 550.0, length(p));
      float height = sin(dot(p, vec2(0.52, 0.29)) - uTime * 1.76) * 0.085
                   + sin(dot(p, vec2(-0.33, 0.69)) - uTime * 2.02 + 1.7) * 0.048
                   + sin(dot(p, vec2(1.12, 0.42)) - uTime * 2.69 + 3.1) * 0.022;
      wp.y += height * envelope * uWaveScale;
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tNormal;
    uniform float uTime;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform float uSunIntensity;
    uniform vec3 uSkyColor;
    uniform vec3 uBody;
    uniform float uWaveScale;
    uniform float uDistort;
    uniform vec2 uWind;
    uniform sampler2D uHeightTex;
    uniform sampler2D uGrime;
    uniform vec4 uShipPose[16];
    uniform vec4 uShipDim[16];
    uniform int uShipCount;
    uniform vec4 uHeightRect;
    varying vec4 vUvR;
    varying vec3 vWorld;
    #include <common>
    #include <logdepthbuf_pars_fragment>

    // Smoothly remove unresolved frequencies before they become bright crawling
    // pixels in compressed, grazing views. The texture itself is mip filtered.
    vec2 nrm(vec2 uv) {
      float footprint = max(length(dFdx(uv)), length(dFdy(uv))) * 512.0;
      return (texture2D(tNormal, uv).xy * 2.0 - 1.0)
             * (1.0 - smoothstep(6.0, 24.0, footprint));
    }

    // Phase-aware filtering lets sub-metre ripples survive where they span
    // several pixels, then fade smoothly before their crests alias offshore.
    float rippleSlope(float phase) {
      float footprint = max(abs(dFdx(phase)), abs(dFdy(phase)));
      float resolved = 1.0 - smoothstep(0.9, 2.7, footprint);
      float harmonic = 1.0 - smoothstep(0.7, 1.7, footprint);
      return (cos(phase) + cos(phase * 2.0) * 0.18 * harmonic) * resolved;
    }

    void main() {
      #include <logdepthbuf_fragment>
      float t = uTime;
      vec2 p = vWorld.xz;
      // terrain height under this fragment (bilinear → smooth shoreline, independent of mesh triangles)
      float ground = -20.0;
      float natural = 1.0;
      if (uHeightRect.z > uHeightRect.x) {
        vec2 huv = (p - uHeightRect.xy) / (uHeightRect.zw - uHeightRect.xy);
        if (all(greaterThan(huv, vec2(0.0))) && all(lessThan(huv, vec2(1.0)))) {
          // smooth (quintic) cell interpolation so shoreline contours don't follow the 30 m grid
          vec2 ts = vec2(textureSize(uHeightTex, 0));
          vec2 hg = texture2D(uHeightTex, huv * (ts - 1.0) / ts + 0.5 / ts).rg;
          ground = hg.r;
          natural = hg.g;
        }
      }
      if (ground > 0.0 && natural > 0.5) discard;
      if (natural < 0.5) ground = min(ground, -3.0);
      vec3 toEye = cameraPosition - vWorld;
      float dist = length(toEye);
      vec3 V = toEye / dist;

      // fade high frequencies with distance to kill shimmer
      float nearF = 1.0 - smoothstep(40.0, 420.0, dist);
      float midF = 1.0 - smoothstep(300.0, 2600.0, dist);
      float farF = 1.0 - smoothstep(2000.0, 14000.0, dist);
      vec2 w = uWind;
      // gusty wind patches break up tiling and give the estuary large-scale texture
      float gust = texture2D(uGrime, p / 2300.0 + w * t * 0.0012).r;
      float gust2 = texture2D(uGrime, p / 640.0 - w * t * 0.003).g;
      float strength = uWaveScale * (0.6 + 0.8 * gust) * (0.85 + 0.3 * gust2) * mix(0.35, 1.0, natural);
      mat2 r1 = mat2(0.8, -0.6, 0.6, 0.8), r2 = mat2(0.28, 0.96, -0.96, 0.28);
      // domain warp so wave trains never line up into regular rows
      vec2 pw = p + (vec2(gust, gust2) - 0.5) * vec2(12.0, 10.0);
      vec2 d = nrm(r1 * pw / 71.0 + w * t * 0.0045) * 0.25 * farF
             + nrm(r2 * pw / 131.0 - w * t * 0.003) * 0.28 * farF
             + nrm(r2 * pw / 19.3 + vec2(-w.y, w.x) * t * 0.011) * 0.26 * midF
             + nrm(r1 * p / 11.7 - vec2(w.y, -w.x) * t * 0.016) * 0.22 * midF
             + nrm(p / 5.1 + w * t * 0.035) * 0.23 * nearF
             + nrm(r1 * p / 1.37 - w * t * 0.06) * 0.12 * nearF;
      d *= strength * 0.8;
      // Crossed short wind waves, wavelengths about 0.8–1.5 m. Slow phase
      // modulation shortens and bends the ridges instead of drawing infinite
      // parallel stripes. Slopes are independent of geometric wave amplitude.
      float shortA = dot(p, vec2(3.8, 1.52)) - t * 4.0 + sin(dot(p, vec2(0.19, -0.11))) * 1.6;
      float shortB = dot(p, vec2(6.7, 2.9)) - t * 5.1 + sin(dot(p, vec2(-0.31, 0.26)) + 1.4) * 2.2;
      float shortC = dot(p, vec2(-4.9, 5.4)) - t * 4.8 + sin(dot(p, vec2(0.24, 0.37))) * 1.5;
      vec2 shortSlope = normalize(vec2(3.8, 1.52)) * rippleSlope(shortA) * 0.072
                      + normalize(vec2(6.7, 2.9)) * rippleSlope(shortB) * 0.040
                      + normalize(vec2(-4.9, 5.4)) * rippleSlope(shortC) * 0.034;
      d += shortSlope * nearF * (0.70 + 0.35 * gust2) / 0.58;
      // Derivative of the geometric waves plus small capillary ripples. Keep
      // real slopes at grazing angles; pixel footprints provide the filtering.
      float envelope = 1.0 - smoothstep(350.0, 550.0, length(p));
      vec2 slope = vec2(0.52, 0.29) * cos(dot(p, vec2(0.52, 0.29)) - t * 1.76) * 0.085
                 + vec2(-0.33, 0.69) * cos(dot(p, vec2(-0.33, 0.69)) - t * 2.02 + 1.7) * 0.048
                 + vec2(1.12, 0.42) * cos(dot(p, vec2(1.12, 0.42)) - t * 2.69 + 3.1) * 0.022;

      float contact = 0.0;
      float hullRipple = 0.0;
      for (int i = 0; i < 16; i++) {
        if (i >= uShipCount) break;
        vec4 ps = uShipPose[i]; vec4 dm = uShipDim[i];
        vec2 q = p - ps.xy;
        vec2 local = vec2(q.x * ps.z - q.y * ps.w, q.x * ps.w + q.y * ps.z);
        float halfB = dm.y * (1.0 - pow(clamp(abs(local.x) / dm.x, 0.0, 1.0), 2.2));
        float outsideX = max(abs(local.x) - dm.x, 0.0);
        float outsideZ = max(abs(local.y) - halfB, 0.0);
        float edgeDistance = length(vec2(outsideX, outsideZ));
        contact = max(contact, (1.0 - smoothstep(0.0, 1.5, edgeDistance)) * step(abs(local.x), dm.x));
        // Reflected wave trains near stationary hulls. No artificial speed wake
        // or broad white foam strip around ships moored at berth.
        float band = exp(-edgeDistance * 0.22) * (1.0 - smoothstep(dm.x, dm.x + 9.0, abs(local.x)));
        float ripple = cos(edgeDistance * 3.2 - t * 2.1 + sin(local.x * 0.47)) * band;
        vec2 outward = normalize(q + vec2(0.01));
        d += outward * ripple * 0.12;
        hullRipple = max(hullRipple, band);
      }
      vec3 N = normalize(vec3(d.x * 0.58 - slope.x * envelope, 1.0, d.y * 0.58 - slope.y * envelope));

      float NdV = max(dot(N, V), 0.0);
      float F = (0.02 + 0.98 * pow(1.0 - NdV, 5.0)) * 0.72;

      // Wave slopes split reflected architecture into irregular, short streaks.
      // Mip-filtered rough reflection removes the crisp double of the ship.
      float dist2 = uDistort * (0.7 + 0.5 * gust) * (0.48 + 0.65 * nearF);
      vec2 base = vUvR.xy / vUvR.w;
      vec2 o = N.xz * dist2;
      float roughness = 0.20 + gust * 0.09 + hullRipple * 0.07;
      // Blur only the unresolved microfacet lobe. The actual short-wave shape
      // should remain legible rather than dissolving into frosted glass.
      float lod = (0.70 + gust * 0.95 + hullRipple * 0.55) * (0.72 + 0.28 * nearF);
      vec2 texel = 1.0 / vec2(textureSize(tDiffuse, 0));
      vec2 blur = texel * exp2(lod) * vec2(0.3, 0.55);
      vec3 refl = textureLod(tDiffuse, clamp(base + o, vec2(0.002), vec2(0.998)), lod).rgb * 0.5
                + textureLod(tDiffuse, clamp(base + o * 0.78 + blur, vec2(0.002), vec2(0.998)), lod).rgb * 0.25
                + textureLod(tDiffuse, clamp(base + o * 1.18 - blur, vec2(0.002), vec2(0.998)), lod).rgb * 0.25;
      // ripples scatter bright cloud reflections into a lower-contrast sheen
      float rl = dot(refl, vec3(0.3333));
      refl = mix(refl, uSkyColor * (0.6 + 0.25 * gust2), smoothstep(0.6 * dot(uSkyColor, vec3(0.3333)), 2.2 * dot(uSkyColor, vec3(0.3333)), rl) * 0.45);
      refl *= vec3(0.80, 0.86, 0.80); // silt-laden water desaturates what it mirrors
      // sheltered dock water: dimmer, greyer mirror even when calm
      refl = mix(refl, vec3(dot(refl, vec3(0.3333))) * vec3(0.92, 1.0, 0.94), (1.0 - natural) * 0.45) * mix(0.82, 1.0, natural);

      // cast shadows of moored ships (footprint swept along the sun direction)
      float shade = 0.0;
      vec2 sweep = uSunDir.xz / max(uSunDir.y, 0.2);
      for (int i = 0; i < 16; i++) {
        if (i >= uShipCount) break;
        vec4 ps = uShipPose[i]; vec4 dm = uShipDim[i];
        for (int k = 0; k < 4; k++) {
          float hgt = dm.z * (0.15 + 0.28 * float(k));
          vec2 q = p + sweep * hgt - ps.xy;
          float lx = q.x * ps.z - q.y * ps.w;
          float lz = q.x * ps.w + q.y * ps.z;
          float halfL = dm.x * (k > 1 ? 0.62 : 1.0);
          float halfB = dm.y * (1.0 - pow(clamp(abs(lx) / halfL, 0.0, 1.0), 4.0));
          if (abs(lx) < halfL && abs(lz) < halfB) shade += 0.25;
        }
      }
      shade = clamp(shade * 1.4, 0.0, 1.0);

      float sunUp = max(uSunDir.y, 0.0);
      vec3 irr = (uSunColor * uSunIntensity * sunUp / PI + uSkyColor * 0.9) * (1.0 - 0.75 * shade);
      vec3 body = uBody * irr * (0.80 + 0.32 * gust2);
      // Suspended harbour silt gives the valleys a little grey-green fill;
      // softened sky scatter makes chop visible even under the black hull.
      body += uSkyColor * vec3(0.035, 0.050, 0.045) * (0.7 + 0.3 * N.y) * (1.0 - 0.65 * shade);

      float shallow = smoothstep(-1.6, 0.0, ground);
      body = mix(body, vec3(0.055, 0.050, 0.038) * irr, shallow * 0.8);
      vec3 col = mix(body, refl, F * (1.0 - shallow * 0.85));
      col *= 1.0 - 0.45 * contact;

      float edge = smoothstep(-0.18, -0.02, ground) * (0.5 + 0.5 * texture2D(tNormal, p / 9.0 + t * 0.01).x);
      col = mix(col, uSkyColor * 0.55 + uSunColor * uSunIntensity * 0.012, edge * 0.35 * nearF);

      // Normalized GGX glitter: broad, energy-bounded highlights, without the
      // old 2400-power / 380-gain pinpoints that flickered and bloomed to white.
      vec3 H = normalize(uSunDir + V);
      float NdH = max(dot(N, H), 0.0);
      // glitter: broken into sparkles by a fine hash so the sun never mirrors as a clean disc
      // band-limited sparkle: thresholded, mip-filtered fine ripple texture (no hard cells)
      float alpha2 = pow(roughness, 4.0);
      float denom = NdH * NdH * (alpha2 - 1.0) + 1.0;
      float distribution = alpha2 / max(PI * denom * denom, 0.00001);
      float nl = max(dot(N, uSunDir), 0.0);
      float visibility = 1.0 / max(4.0 * (NdV + 0.22) * (nl + 0.22), 0.1);
      float spec = min(distribution * visibility * 0.025 * nl, 2.0);
      col += uSunColor * uSunIntensity * spec * (1.0 - shade);

      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function createWater({ size = 90000, resolutionScale = 0.5 } = {}) {
  // Spend 80% of each axis on the actual dock water, at 2.25 m spacing.
  // A plain cubic distribution undersamples 8–11 m waves by placing vertices
  // 11 m apart only 150 m from the origin. Keep the same triangle count, with a
  // continuous derivative into the rapidly coarsening offshore region.
  const geo = new THREE.PlaneGeometry(2, 2, 500, 500);
  const pa = geo.attributes.position;
  const core = Math.min(450, size / 8);
  const mapAxis = (v) => {
    const r = Math.abs(v), slope = core / 0.8;
    if (r <= 0.8) return Math.sign(v) * r * slope;
    const delta = r - 0.8;
    return Math.sign(v) * (core + slope * delta + (size / 2 - core - slope * 0.2) * (delta / 0.2) ** 3);
  };
  for (let i = 0; i < pa.count; i++) {
    const u = pa.getX(i), v = pa.getY(i);
    pa.setXY(i, mapAxis(u), mapAxis(v));
  }
  geo.computeBoundingSphere();
  const w = Math.round(window.innerWidth * window.devicePixelRatio * resolutionScale);
  const h = Math.round(window.innerHeight * window.devicePixelRatio * resolutionScale);
  const water = new Reflector(geo, { shader: WaterShader, textureWidth: w, textureHeight: h, clipBias: 0.002, multisample: 4 });
  // Each reflection pass generates a compact mip chain. Sampling that chain is
  // cheaper and more stable than many full-resolution blur taps per water pixel.
  const reflectionTexture = water.getRenderTarget().texture;
  reflectionTexture.generateMipmaps = true;
  reflectionTexture.minFilter = THREE.LinearMipmapLinearFilter;
  water.rotation.x = -Math.PI / 2;
  water.name = 'water';
  water.material.uniforms.tNormal.value = getTextures().water;
  water.receiveShadow = false;
  water.resize = (sw, sh) => {
    water.getRenderTarget().setSize(Math.round(sw * resolutionScale), Math.round(sh * resolutionScale));
  };
  return water;
}
