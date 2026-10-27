import * as THREE from 'three';

// Golden-hour harbour: one sky function shared by the dome, the water reflection and the
// PBR environment, so paint, glass and water all agree on the light.
//   createSky()          the dome (also rendered into the PMREM environment)
//   createWater()        the sea: a grid displaced by the longer chop (SEA) and the wake round
//                        the boat, finer wave normals, planar reflection (tReflect / uMirror,
//                        filled by scene.js), Fresnel, sun glitter, horizon haze, the dark
//                        contact band at the hull and the soft glow of the underwater lights;
//                        underway (uRun = 1) the sea streams aft past the boat and carries its
//                        wake: water heaped along the bottom, the diverging crests breaking into
//                        short crests en echelon, the dry transom and the stern wave, the glassy
//                        slick inside the V, and cellular foam ageing from dense white behind the
//                        transom and along the chines into streaky lace astern
//   seaHeight(x, z, f, t) the chop's height as the geometry carries it (scene.js rides on it)
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

// Value noise and four-octave fbm, shared by the sea and the white water (spray.js).
export const noiseChunk = /* glsl */ `
  // An integer hash of the cell p, exact however far the sea has streamed.
  float hash(vec2 p) {
    uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
    return float((q.x ^ q.y) * 1597334673u) / 4294967295.0;
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      s += a * vnoise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      a *= 0.5;
    }
    return s;
  }
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

// ---------- the open sea ----------

// A light chop for a 20-knot run: sixteen wave trains from 11 m down to a few centimetres, each
// 0.7 times as long as the last, spread round the breeze (the short ones more widely) with
// unrelated phases, so nothing lines up or repeats; the shortest ripples are kept low, so close
// up they never cross-hatch. Crests are a little sharper than the troughs
// (see seaHeight). The longest SEA_GEOMETRY trains are also built into the water's geometry, and
// scene.js rides the boat on them.
const WIND = 0.35;
export const SEA = Array.from({ length: 16 }, (_, i) => {
  const k = (2 * Math.PI) / (11 * Math.pow(0.7, i));
  const dir = WIND + (((i * 0.618034 + 0.31) % 1) - 0.5) * 2 * (0.5 + 0.07 * i);
  return { kx: k * Math.cos(dir), kz: k * Math.sin(dir), amp: 0.05 * Math.pow(0.74, i) * Math.pow(0.8, Math.max(i - 9, 0)), omega: Math.sqrt(9.8 * k), phase: i * 2.4 + ((i * 0.754877) % 1) * 6.283 };
});
const SEA_GEOMETRY = 7;

// Height of the chop (metres) at (x, z) once the sea has streamed flow metres aft, at time t:
// the trains the geometry carries, as the shaders' seaHeight() draws them.
export function seaHeight(x, z, flow, t) {
  let h = 0;
  for (let i = 0; i < SEA_GEOMETRY; i++) {
    const w = SEA[i];
    const s = 0.5 + 0.5 * Math.sin(w.kx * (x + flow) + w.kz * z - w.omega * t + w.phase);
    h += w.amp * (2 * s * Math.sqrt(s) - 0.85);
  }
  return h;
}

const f6 = (v) => v.toFixed(6);
const seaChunk = /* glsl */ `
  #define SEA_GEOMETRY ${SEA_GEOMETRY}
  // Per train: (kx, kz, amplitude, angular frequency), and its phase.
  const vec4 SEA_W[${SEA.length}] = vec4[${SEA.length}](${SEA.map((w) => `vec4(${f6(w.kx)}, ${f6(w.kz)}, ${f6(w.amp)}, ${f6(w.omega)})`).join(', ')});
  const float SEA_P[${SEA.length}] = float[${SEA.length}](${SEA.map((w) => f6(w.phase)).join(', ')});
  // Height of the chop at sea position q. Each train fades out as its wavelength nears a few ds
  // (the local grid spacing), so the geometry never aliases.
  float seaHeight(vec2 q, float t, float ds) {
    float h = 0.0;
    for (int i = 0; i < SEA_GEOMETRY; i++) {
      vec4 w = SEA_W[i];
      float s = 0.5 + 0.5 * sin(dot(q, w.xy) - w.w * t + SEA_P[i]);
      h += w.z * (2.0 * s * sqrt(s) - 0.85) * smoothstep(4.0, 8.0, 6.2832 / (length(w.xy) * ds));
    }
    return h;
  }
  // Slope (d height / dx, d height / dz) of the first n trains; each fades out as its wavelength
  // nears a few ds (here the pixel footprint), so distant water never sparkles with aliasing.
  vec2 seaSlope(vec2 q, float t, float ds, int n) {
    vec2 g = vec2(0.0);
    for (int i = 0; i < n; i++) {
      vec4 w = SEA_W[i];
      float ph = dot(q, w.xy) - w.w * t + SEA_P[i];
      float s = 0.5 + 0.5 * sin(ph);
      g += w.xy * w.z * 1.5 * sqrt(s) * cos(ph) * smoothstep(2.0, 6.0, 6.2832 / (length(w.xy) * ds));
    }
    return g;
  }
`;

// The underway wake, shared by the vertex shader (relief) and the fragment shader (normals and
// foam). Boat frame: the sea streams towards -x and the wake stands still round the hull while
// the sea, its chop and its foam stream through it. The hull mask runs from the transom
// (uHullX.x) to where the keel leaves the water (the spray root, uHullX.x + uHullX.y).
const wakeChunk = /* glsl */ `
  uniform float uTime;
  uniform vec2 uHullX;
  uniform float uWl[${WL_STATIONS + 1}];
  uniform float uRun;
  uniform float uFlow;
  uniform float uWash;
  uniform float uProp;
  uniform float uChine;
  ${noiseChunk}
  ${seaChunk}
  // Water half-width of the hull at x (0 off the hull).
  float hullHalf(float x) {
    float t = (x - uHullX.x) / uHullX.y;
    if (t < 0.0 || t > 1.0) return 0.0;
    float f = t * ${WL_STATIONS}.0;
    int i = int(min(floor(f), ${WL_STATIONS - 1}.0));
    return mix(uWl[i], uWl[i + 1], f - float(i));
  }
  // Approximate signed distance from the hull's waterline (negative inside).
  float hullDist(vec2 p) {
    float t = (p.x - uHullX.x) / uHullX.y;
    float tc = clamp(t, 0.0, 1.0);
    float f = tc * ${WL_STATIONS}.0;
    int i = int(min(floor(f), ${WL_STATIONS - 1}.0));
    float hw = mix(uWl[i], uWl[i + 1], f - float(i));
    float dz = abs(p.y) - hw;
    return length(vec2((t - tc) * uHullX.y, max(dz, 0.0))) + min(dz, 0.0);
  }
  // Inside the region the wake is worked out in: round the boat and 170 m astern.
  bool inWake(vec2 p) {
    return uRun > 0.5 && p.x > uHullX.x - 170.0 && abs(p.y) < 45.0 && p.x < uHullX.x + uHullX.y + 3.0;
  }
  // Where the diverging crest runs (distance off the centreline), its width and height: it peels
  // off the hull at the spray root, runs aft along the topsides, then spreads astern at about 10
  // degrees (a planing wake runs well inside the 19.5-degree Kelvin angle), widening and
  // flattening as it goes and dying out before the edge of the wake region.
  vec3 crest(vec2 p) {
    float xT = uHullX.x;
    float xS = uHullX.x + uHullX.y;
    float s = max(xT - p.x, 0.0);
    float along = clamp(xS - p.x, 0.0, xS - xT);
    // Alongside, the crest stands outboard of whichever is wider, the wetted bottom or the chines.
    float c0 = max(uWl[0] + 0.05, uChine + 0.1) + (xS - xT) * 0.08;
    float c = p.x < xT ? c0 + s * 0.17 : max(hullHalf(p.x) + 0.05, uChine * smoothstep(xS, xS - 1.2, p.x) + 0.1) + along * 0.08;
    float w = 0.22 + along * 0.03 + s * 0.028;
    float a = 0.17 * smoothstep(xS + 0.2, xS - 0.9, p.x) / sqrt(1.0 + s / 14.0) * smoothstep(170.0, 110.0, s);
    return vec3(c, w, a);
  }
  // The crest breaks up into short crests en echelon: lines at 50 degrees to the track with the
  // outer end further aft, a little longer astern, each of its own strength. 0..1.5 with sharp
  // crests and flat troughs, faded to its mean where the crests come within a few ds.
  float echelon(vec2 p, float s, float ds) {
    float lam = 1.4 + 0.05 * s;
    float side = p.y > 0.0 ? 3.0 : 9.0;
    float ph = (p.x * 0.766 + abs(p.y) * 0.643) * 6.2832 / lam + 1.5 * vnoise(vec2(p.x * 0.15, side));
    float e = 0.5 + 0.5 * cos(ph);
    e = e * e * (0.45 + 0.9 * vnoise(vec2(ph * 0.159, side + 11.0)));
    return mix(0.34, e, smoothstep(4.0, 7.0, lam / ds));
  }
  // Prop wash: aerated, churned water astern of each lower unit (uProp is their offset off the
  // centreline; twin streams run together within a few metres), spreading and fading.
  float washMask(vec2 p) {
    float s = max(uHullX.x - p.x, 0.0);
    float w = uWash + 0.06 * s;
    float zc = uProp * exp(-s / 6.0);
    float a = (p.y - zc) / w;
    float b = (p.y + zc) / w;
    return max(exp(-a * a * 1.3), exp(-b * b * 1.3)) * smoothstep(0.1, 0.9, uHullX.x - p.x) * exp(-s / 45.0) * smoothstep(170.0, 120.0, s);
  }
  // Inside the V, beyond the white water, a glassy slick where the chop is flattened, slowly
  // filling in astern.
  float slick(vec2 p) {
    vec3 k = crest(p);
    float s = uHullX.x - p.x;
    return smoothstep(k.x - 0.6 * k.y, k.x - 1.8 * k.y, abs(p.y)) * smoothstep(0.5, 4.0, s) * exp(-max(s, 0.0) / 140.0) * smoothstep(170.0, 120.0, s);
  }
  // How much of the open-sea chop survives at p: none under the hull or the forefoot just ahead
  // of the spray root, a little against the hull, less in the slick and the wash.
  float chopK(vec2 p) {
    float xS = uHullX.x + uHullX.y;
    float k = smoothstep(-0.15, 0.6, hullDist(p));
    k *= 1.0 - smoothstep(0.9, 0.3, abs(p.y)) * step(xS, p.x) * smoothstep(xS + 3.0, xS, p.x);
    if (inWake(p)) k *= (1.0 - 0.8 * slick(p)) * (1.0 - 0.6 * washMask(p));
    return k;
  }
  // Wake surface height (metres) at p, with detail down to ds.
  float wakeHeight(vec2 p, float ds) {
    float xT = uHullX.x;
    float xS = xT + uHullX.y;
    float s = xT - p.x;
    float az = abs(p.y);
    // Water heaped against the bottom along the wetted length, dying away a metre astern;
    // inboard of the waterline it dips under the hull.
    float dz = az - (p.x < xT ? uWl[0] : hullHalf(p.x));
    float heap = 0.08 * smoothstep(xS, xS - 0.8, p.x) * smoothstep(xT - 1.4, xT, p.x);
    float h = heap * (dz > 0.0 ? exp(-dz / 0.28) : 1.0 + dz / 0.1);
    // The transom runs dry: the water drops away behind it, then closes in 3-4 m astern in a
    // mound (the stern wave).
    float hT = max(uWl[0], 0.3);
    h -= 0.08 * exp(-s * s / 1.6) * exp(-p.y * p.y / (hT * hT)) * smoothstep(-0.4, 0.2, s);
    h += 0.13 * exp(-pow((s - 3.4) / 1.7, 2.0)) * exp(-p.y * p.y / (hT * hT * 0.8));
    // The diverging crest: a trough inside it, the crest itself breaking into short crests en
    // echelon from the transom aft, and a lower second crest outboard.
    vec3 k = crest(p);
    float u = (az - k.x) / k.y;
    // (the short crests only matter on and just outside the crest)
    float e = abs(u - 1.2) < 4.5 ? echelon(p, max(s, 0.0), ds) : 0.34;
    float feather = smoothstep(xT + 1.5, xT - 2.0, p.x);
    h += k.z * (exp(-u * u) * mix(1.0, 0.6 + 0.8 * e, feather) - 0.4 * exp(-(u + 1.8) * (u + 1.8) / 1.4) + 0.3 * exp(-(u - 2.4) * (u - 2.4) / 1.5) * (0.3 + 1.6 * e));
    return h;
  }
`;

// The sea's geometry: a grid in the xz-plane centred on the boat, cells s0 across there and
// growing by k per metre outwards (spacing s0 + k |x| along x, likewise along z) out past the
// haze, so the chop and the wake have real relief round the boat and in front of the camera for
// few vertices. The vertex shader works out the same spacing to fade what the grid can't carry.
function seaGrid(s0, k, extent) {
  const half = Math.ceil(Math.log(1 + (extent * k) / s0) / k);
  const line = Array.from({ length: 2 * half + 1 }, (_, i) => Math.sign(i - half) * (s0 / k) * Math.expm1(k * Math.abs(i - half)));
  const n = line.length;
  const position = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      position[(j * n + i) * 3] = line[i];
      position[(j * n + i) * 3 + 2] = line[j];
    }
  }
  const index = new Uint32Array((n - 1) * (n - 1) * 6);
  let o = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      index.set([a, a + n, a + 1, a + 1, a + n, a + n + 1], o);
      o += 6;
    }
  }
  // Normals straight up, for the occlusion pass's normal material (the sea draws its own).
  const normal = new Float32Array(n * n * 3);
  for (let i = 1; i < normal.length; i += 3) normal[i] = 1;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

// detail: 1 for desktop, 0 for small screens (a coarser grid, fewer ripple trains, one foam
// scale, one reflection tap).
export function createWater({ detail = 1 } = {}) {
  const grid = detail ? { s0: 0.06, k: 0.05 } : { s0: 0.1, k: 0.08 };
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
    // Underway: uRun 0 or 1, uFlow = how far the sea has streamed aft (metres, wrapped),
    // uWash = half-spread of each prop's wash at the transom, uProp = the props' offset off the
    // centreline (0 for a single engine).
    uRun: { value: 0 },
    uFlow: { value: 0 },
    uWash: { value: 0.3 },
    uProp: { value: 0 },
    // Half-beam at the chines: underway the white water spills out from under them.
    uChine: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    defines: { DETAIL: detail ? 1 : 0, GRID_S0: grid.s0.toFixed(3), GRID_K: grid.k.toFixed(3) },
    vertexShader: /* glsl */ `
      ${wakeChunk}
      uniform mat4 uMirror;
      varying vec3 vWorld;
      varying vec2 vFlat;
      varying vec4 vMirror;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec2 p = w.xz;
        // The grid's spacing here (see seaGrid): anything shorter is left to the normals.
        float ds = GRID_S0 + GRID_K * max(abs(p.x), abs(p.y));
        float h = seaHeight(p + vec2(uFlow, 0.0), uTime, ds) * chopK(p);
        // The wash boils up a little above the sea round it.
        if (inWake(p)) h += wakeHeight(p, ds) + 0.03 * washMask(p);
        vFlat = p;
        // The reflection is a mirror in the mean surface (renderReflection in scene.js).
        vMirror = uMirror * w;
        w.y += h;
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${skyChunk}
      ${wakeChunk}
      uniform vec4 uGlow[2];
      uniform vec2 uGlowAft;
      uniform float uGlowOn;
      uniform vec3 uGlowColor;
      uniform sampler2D tReflect;
      uniform vec2 uTexel;
      varying vec3 vWorld;
      varying vec2 vFlat;
      varying vec4 vMirror;

      #if DETAIL == 1
        #define WAVES 16
      #else
        #define WAVES 10
      #endif

      // Cellular noise: distances to the nearest and second-nearest of one random point per unit
      // cell. F1 is 0 at the points (round gaps open around them); F2 - F1 is 0 on the walls
      // between cells (veins). The points keep to the middle half of their cells, so the 3 x 3
      // search always finds the true second-nearest (no seams); the warp supplies the disorder.
      vec2 cells(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float d1 = 8.0;
        float d2 = 8.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 o = vec2(float(x), float(y));
            vec2 r = o + 0.25 + 0.5 * vec2(hash(i + o), hash(i + o + vec2(57.0, 113.0))) - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
        }
        return sqrt(vec2(d1, d2));
      }
      // Foam streaming with the sea, at density f (0..1) and age (0 right behind the transom and
      // along the chines, 1 some tens of metres astern). Everything is drawn out hard along the
      // flow and bent by a slow domain warp (young foam also churns), so nothing reads as cells.
      //   dense, young foam: solid turbulent white with small, irregular gaps (fine cells' F1,
      //     opened only where the spread noise is low)
      //   thinner, older foam: a lace of veins (the large cells' walls, F2 - F1) whose width
      //     wanders with the spread noise, so the holes between them are of very different sizes
      //     and merge and tear; then streaks along the flow, faint lines
      // Detail smaller than a few pixels (fp, the footprint in metres) falls back to the share of
      // the water it would cover, so it never shimmers far off.
      float foamLace(vec2 q, float f, float age, float fp) {
        float spread = vnoise(q * vec2(0.16, 0.55));
        vec2 warp = vec2(vnoise(q * vec2(0.45, 1.1)), vnoise(q * vec2(0.45, 1.1) + 17.0)) - 0.5;
        warp += (vec2(vnoise(q * 1.1 + uTime * 0.8), vnoise(q * 1.1 - uTime * 0.8 + 7.0)) - 0.5) * 0.8 * max(1.0 - age, 0.0);
        float sharp = smoothstep(0.7, 0.2, fp * 1.6);
        vec2 c = cells(q * vec2(0.4, 1.6) + warp * 1.3);
        float lace = mix(0.45, 1.0 - smoothstep(0.0, 0.12 + 0.45 * spread, c.y - c.x), sharp);
        float gaps = 0.6;
        #if DETAIL == 1
          c = cells(q * vec2(1.8, 4.5) + warp * 3.0);
          gaps = mix(0.6, min(c.x * 1.5, 1.0), smoothstep(0.7, 0.2, fp * 4.5));
        #endif
        float streaks = mix(0.5, vnoise(q * vec2(0.3, 6.0)), smoothstep(0.5, 0.1, fp * 6.0));
        // Young foam fills in between the veins; only the fine gaps stay open.
        float v = lace * 0.4 + gaps * 0.3 + spread * 0.3 + (streaks - 0.5) * 0.5 * min(age, 1.0) + 0.4 * smoothstep(0.05, 0.3, f) * smoothstep(0.4, 0.0, age);
        float thr = 1.0 - 0.85 * f;
        // Thin foam is translucent; dense foam is shaded by its own bubbles.
        float cover = mix(smoothstep(0.9, 0.3, thr), smoothstep(thr, thr + 0.14 + 4.0 * fp, v), sharp);
        return cover * (0.45 + 0.55 * f) * (0.82 + 0.25 * gaps) * smoothstep(0.02, 0.12, f);
      }
      // The churned surface of the prop wash: lumps boiling up as they stream aft.
      float churn(vec2 q) {
        return vnoise(q * vec2(1.3, 2.0) + vec2(0.0, uTime * 0.6)) + 0.5 * vnoise(q * vec2(3.1, 4.4) - vec2(uTime * 0.9, 0.0));
      }

      void main() {
        vec2 p = vFlat;
        float dist = length(vWorld.xz - cameraPosition.xz);
        float fade = 1.0 / (1.0 + dist * 0.07);
        // The pixel footprint on the water, in metres.
        float fp = max(length(fwidth(p)), 1e-4);
        float d = max(hullDist(p), 0.0);
        // The hull damps the ripples in its lee.
        float lee = exp(-d * 1.4) * (1.0 - 0.6 * uRun);
        // Underway the whole sea (ripples, chop and foam) streams aft past the hull.
        vec2 q = p + vec2(uFlow, 0.0);
        vec2 g = seaSlope(q, uTime, fp, WAVES) * chopK(p);
        float foam = 0.0;
        float aer = 0.0;
        if (inWake(p)) {
          // Finite differences no finer than the footprint, which also filters the wake far off.
          float e = max(0.03, fp);
          float h0 = wakeHeight(p, fp);
          g += vec2(wakeHeight(p + vec2(e, 0.0), fp) - h0, wakeHeight(p + vec2(0.0, e), fp) - h0) / e;
          float xT = uHullX.x;
          float xS = uHullX.x + uHullX.y;
          float s = max(xT - p.x, 0.0);
          float az = abs(p.y);
          float wash = washMask(p);
          if (wash > 0.02) {
            float c0 = churn(q);
            g += vec2(churn(q + vec2(e, 0.0)) - c0, churn(q + vec2(0.0, e)) - c0) / e * wash * 0.05 * exp(-s / 25.0) * smoothstep(0.3, 0.05, fp);
          }
          vec3 k = crest(p);
          float u = (az - k.x) / k.y;
          // White water along the chines from the spray root aft, peeling away astern along the
          // inner flank of the crest; whitecaps on the short crests close to the boat; the wash.
          float side = smoothstep(k.x + 0.5 * k.y, k.x - 0.6 * k.y, az) * smoothstep(xS + 0.1, xS - 0.7, p.x) * (0.6 * exp(-s / 5.0) + 0.4 * exp(-s / 30.0));
          if (p.x < xT) side *= smoothstep(k.x - 2.2 * k.y, k.x - 1.0 * k.y, az);
          float caps = exp(-u * u * 1.8) * smoothstep(xS + 0.1, xS - 0.9, p.x) * exp(-s / 12.0) * smoothstep(0.45, 1.1, echelon(p, s, fp));
          float fs = side * 0.85;
          float fc = caps * 0.75;
          // The wash is a dense white mass for a few metres, then a long thinning tail.
          float fw = wash * (0.35 + 0.65 * exp(-s / 10.0));
          // Ragged edges: the masks themselves wander a little.
          float f = max(max(fs, fc), fw) * (0.75 + 0.5 * vnoise(q * vec2(0.4, 1.3)));
          if (f > 0.02) {
            // Age: the wash from the props, the side water from the spray root, the caps from the
            // moment they break.
            float age = (fw * s / 30.0 + fs * ((xS - max(p.x, xT)) / (xS - xT) * 0.3 + s / 14.0) + fc * (0.35 + s / 20.0)) / (fw + fs + fc);
            foam = min(foamLace(q, f, age, fp), 1.0);
          }
          aer = clamp(max(wash * (0.5 + 0.8 * exp(-s / 15.0)), max(caps * 0.5, side)), 0.0, 1.0);
        }
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float nv = clamp(dot(n, v), 0.0, 1.0);
        float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);

        // Water body: deep blue-green, lifted a touch by sky light and the low sun's scatter.
        vec3 body = uDeep * (0.8 + 2.2 * max(dot(n, uSunDir) - 0.12, 0.0)) + uTop * 0.02;
        // Aerated water under and around the foam glows a lighter green-turquoise.
        body = mix(body, vec3(0.15, 0.32, 0.34) * (0.8 + 1.4 * max(dot(n, uSunDir), 0.0)), aer * 0.45);

        // Planar reflection of the boat and sky, broken up by the waves and stretched vertically
        // the way small waves smear a reflection.
        vec2 ruv = vMirror.xy / vMirror.w + g * (0.055 + 0.1 * uRun);
        // Alpha is the boat's mask in the mirror image (the sky writes none).
        vec4 mirror = texture2D(tReflect, ruv) * 0.5;
        #if DETAIL == 1
          vec2 sv = vec2(0.0, uTexel.y * (1.5 + 3.0 * (1.0 - lee)) * (1.0 + uRun));
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
          vec2 rel = p - uGlow[i].xz;
          float depth = clamp(-uGlow[i].y, 0.03, 1.0);
          float along = dot(rel, uGlowAft);
          float across = dot(rel, vec2(-uGlowAft.y, uGlowAft.x));
          float width = 0.14 + depth * 0.4 + 0.32 * max(along, 0.0);
          float reach = along < 0.0 ? exp(-along * along / 0.02) : exp(-along / (0.8 + depth));
          float k = reach * exp(-across * across / (width * width)) * smoothstep(-0.25, 0.1, along);
          glow += uGlowColor * k * uGlow[i].w * exp(-depth * 2.0);
        }
        body += glow * uGlowOn * 0.35;

        // Aerated water is a poor mirror.
        vec3 col = mix(body, refl, fres * (1.0 - 0.6 * aer));

        // Sun glitter: a sharp sparkle up close widening into a glitter path with distance,
        // where the ripples are too small to resolve.
        vec3 hv = normalize(uSunDir + v);
        float e = mix(60.0, 1400.0, fade * fade);
        float spec = pow(max(dot(n, hv), 0.0), e) * (e + 8.0) / 25.0;
        col += uSunColor * spec * fres * 0.9 * (1.0 - 0.8 * lee) * (1.0 - mirror.a) * (1.0 - foam);

        // At rest: a dark contact band where the water meets the hull, and a faint broken wash
        // line. Underway the white water along the chines takes their place.
        col = mix(col, uDeep * 0.3, 0.55 * exp(-d / 0.07) * (1.0 - uRun));
        float broken = 0.5 + 0.5 * sin(p.x * 11.0 + uTime * 1.1 + 3.0 * sin(p.y * 7.0 + uTime * 0.7));
        col += vec3(0.5, 0.52, 0.5) * exp(-pow(d / 0.025, 2.0)) * broken * 0.12 * (1.0 - uRun);

        // Foam: matte white, lit by the low sun and the sky, a little shaded in its own troughs.
        vec3 foamCol = vec3(0.86, 0.9, 0.92) * (0.8 + 0.6 * max(dot(n, uSunDir), 0.0)) * mix(vec3(1.0), uSunColor, 0.18);
        col = mix(col, foamCol, foam);

        // Horizon haze.
        col = mix(col, skyColour(normalize(vec3(-v.x, 0.01, -v.z))), smoothstep(80.0, 1200.0, dist));

        // Clear water within a hand's breadth of the hull: the submerged plate shows through,
        // tinted by the wet-material patch; beyond, the sea is opaque.
        float clear = 0.45 * exp(-d / 0.12) * (1.0 - fres) * step(0.001, d) * (1.0 - uRun);
        gl_FragColor = vec4(col, 1.0 - clear);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += dither(gl_FragCoord.xy) / 255.0;
      }`,
  });
  const mesh = new THREE.Mesh(seaGrid(grid.s0, grid.k, 1500), material);
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
