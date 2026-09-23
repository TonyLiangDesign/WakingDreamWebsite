import * as THREE from "three";

const SURFACE_Y = 4.15;
const REDUCE = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const A = {
  anemone: [-1.7, 0, 1.35],
  rockL: [-3.55, 0, -0.45],
  rockR: [3.3, 0, -1.0],
  rockBack: [0.55, 0, -4.35],
  brain: [-0.4, 0, -3.05],
  rockFront: [1.7, 0, 2.45],
  fan: [3.85, 0, -2.35],
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0x0a11);

function smoothstep(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function quality() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  const narrow = Math.min(window.innerWidth, window.innerHeight) < 740;
  // Phones and low-memory devices drop detail. A 4-core laptop is the normal case.
  const low = narrow || mem <= 4;
  return {
    low,
    dpr: Math.min(window.devicePixelRatio || 1, low ? 1.15 : cores >= 8 ? 1.6 : 1.35),
    antialias: !low,
    bubbles: low ? 16 : 40,
    motes: low ? 36 : 100,
    sand: low ? [36, 28] : [64, 48],
    water: low ? 22 : 40,
    shafts: low ? 2 : 4,
  };
}

const GLSL = /* glsl */ `
vec3 toLinear(vec3 c) {
  return pow(max(c, vec3(0.0)), vec3(2.2));
}
float fogAmt(vec3 wp, float density) {
  float dist = length(cameraPosition - wp);
  return clamp(1.0 - exp(-dist * density), 0.0, 0.9);
}
vec3 fogColor(float y) {
  float t = clamp(y / 4.2, 0.0, 1.0);
  vec3 deep = toLinear(vec3(0.05, 0.24, 0.32));
  vec3 mid = toLinear(vec3(0.08, 0.42, 0.5));
  vec3 high = toLinear(vec3(0.28, 0.7, 0.72));
  vec3 c = mix(deep, mid, smoothstep(0.0, 0.72, t));
  return mix(c, high, smoothstep(0.5, 1.0, t));
}
vec3 applyFog(vec3 col, vec3 wp, float density) {
  return mix(col, fogColor(wp.y), fogAmt(wp, density));
}
float caustic(vec2 p, float t) {
  vec2 uv = p * 1.7;
  uv += vec2(sin(uv.y * 1.15 + t * 0.65), cos(uv.x * 1.05 - t * 0.5));
  float c = abs(sin(uv.x * 1.35 + t * 0.4) * sin(uv.y * 1.2 - t * 0.32));
  uv = uv * 1.35 + vec2(sin(uv.y * 1.4 - t * 0.55), cos(uv.x * 1.25 + t * 0.42));
  c += 0.62 * abs(sin(uv.x * 1.15 - t * 0.48) * sin(uv.y + t * 0.36));
  uv = uv * 1.25 + vec2(1.6, -0.45);
  c += 0.38 * abs(sin(uv.x + t * 0.72) * sin(uv.y - t * 0.5));
  return pow(c, 2.5);
}
vec3 sunLight(vec3 albedo, vec3 N, vec3 wp, float density, float specPower, float specGain) {
  vec3 V = normalize(cameraPosition - wp);
  vec3 L = normalize(vec3(0.18, 1.0, 0.22));
  float ndl = max(dot(N, L) * 0.45 + 0.55, 0.0);
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), specPower);
  float fres = pow(1.0 - max(dot(normalize(N), V), 0.0), 3.0);
  vec3 ambient = toLinear(vec3(0.16, 0.38, 0.46));
  vec3 key = toLinear(vec3(1.0, 0.96, 0.84));
  vec3 col = albedo * (ambient * 0.5 + key * ndl * 1.15);
  col += spec * specGain * toLinear(vec3(1.0, 0.98, 0.92));
  col += fres * toLinear(vec3(0.7, 0.95, 0.98)) * 0.7;
  col += albedo * caustic(wp.xz, uTime) * max(N.y, 0.0) * 0.55;
  return applyFog(col, wp, density);
}
vec4 finish(vec3 linearCol, float alpha) {
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  vec3 col = linearCol + (dither - 0.5) * 0.0035;
  #ifdef TONE_MAPPING
    col = toneMapping(col);
  #endif
  return linearToOutputTexel(vec4(col, alpha));
}
vec3 speciesAlbedo(float id, float axial, vec3 lp) {
  vec3 col;
  if (id < 0.5) {
    col = toLinear(vec3(0.97, 0.40, 0.07));
    float d = min(abs(axial - 0.34), min(abs(axial - 0.54), abs(axial - 0.73)));
    float stripe = 1.0 - smoothstep(0.016, 0.04, d);
    float border = smoothstep(0.028, 0.046, d) * (1.0 - smoothstep(0.046, 0.072, d));
    col = mix(col, toLinear(vec3(0.04, 0.03, 0.025)), border);
    col = mix(col, toLinear(vec3(0.97, 0.95, 0.9)), stripe);
  } else if (id < 1.5) {
    col = toLinear(vec3(0.07, 0.24, 0.86));
    float tail = smoothstep(0.22, 0.07, axial);
    col = mix(col, toLinear(vec3(1.0, 0.80, 0.1)), tail);
    float dorsal = smoothstep(0.1, 0.32, lp.y) * (1.0 - tail);
    col = mix(col, toLinear(vec3(1.0, 0.84, 0.16)), dorsal * 0.92);
    float pal = length(vec2((axial - 0.31) / 0.1, lp.y / 0.15));
    col = mix(col, toLinear(vec3(0.02, 0.025, 0.04)), smoothstep(1.05, 0.4, pal) * (1.0 - tail));
  } else if (id < 2.5) {
    col = toLinear(vec3(1.0, 0.76, 0.05));
    float tail = smoothstep(0.22, 0.06, axial);
    col = mix(col, toLinear(vec3(0.96, 0.94, 0.84)), tail);
    col = mix(col, toLinear(vec3(0.98, 0.98, 0.96)), smoothstep(0.16, 0.36, lp.y) * 0.7 * (1.0 - tail));
  } else if (id < 3.5) {
    col = mix(toLinear(vec3(1.0, 0.74, 0.08)), toLinear(vec3(0.58, 0.1, 0.76)), smoothstep(0.34, 0.6, axial));
  } else if (id < 4.5) {
    col = toLinear(vec3(0.03, 0.1, 0.3));
    float stripes = smoothstep(0.2, 0.86, 0.5 + 0.5 * sin(axial * 54.0));
    col = mix(col, toLinear(vec3(0.98, 0.8, 0.2)), stripes);
    col = mix(col, toLinear(vec3(0.98, 0.86, 0.28)), smoothstep(0.18, 0.04, axial));
    col = mix(col, toLinear(vec3(0.015, 0.02, 0.04)), smoothstep(0.76, 0.92, axial));
  } else if (id < 5.5) {
    col = toLinear(vec3(0.1, 0.55, 0.4));
    float scales = 0.5 + 0.5 * sin(axial * 86.0) * sin(lp.y * 54.0);
    col = mix(col, toLinear(vec3(0.18, 0.5, 0.66)), scales * 0.4);
    col = mix(col, toLinear(vec3(0.86, 0.32, 0.48)), smoothstep(0.6, 0.78, axial));
    col = mix(col, toLinear(vec3(0.96, 0.78, 0.22)), smoothstep(0.86, 0.98, axial));
  } else if (id < 6.5) {
    col = toLinear(vec3(0.94, 0.91, 0.82));
    float b = abs(fract(axial * 5.0) - 0.5);
    col = mix(col, toLinear(vec3(0.92, 0.36, 0.07)), 1.0 - smoothstep(0.07, 0.16, b));
    col = mix(col, toLinear(vec3(0.05, 0.04, 0.035)), 1.0 - smoothstep(0.0, 0.03, abs(axial - 0.74)));
    col = mix(col, toLinear(vec3(0.08, 0.07, 0.06)), smoothstep(0.14, 0.03, axial));
  } else {
    col = mix(toLinear(vec3(0.92, 0.96, 0.98)), toLinear(vec3(0.25, 0.52, 0.82)), smoothstep(-0.02, 0.28, lp.y));
  }
  float belly = smoothstep(0.12, -0.28, lp.y);
  col *= mix(0.82, 1.1, belly);
  return col;
}
`;

const fishVert = /* glsl */ `
attribute float aPhase;
attribute float aSpeed;
attribute float aSpecies;
uniform float uTime;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vLocal;
varying float vAxial;
varying float vZone;
varying float vSpecies;
void main() {
  float axial = uv.x;
  float zone = uv.y;
  vec3 pos = position;
  float env = pow(clamp(1.0 - axial, 0.0, 1.0), 1.08);
  float damp = smoothstep(0.55, 0.78, zone);
  float wave = sin(axial * 8.5 - uTime * aSpeed + aPhase) * 0.26 * env * (1.0 - damp);
  pos.z += wave;
  if (zone > 0.4 && zone < 0.5) {
    pos.y += sin(uTime * (aSpeed + 1.5) + aPhase) * 0.07;
  }
  vec4 worldPos = modelMatrix * instanceMatrix * vec4(pos, 1.0);
  mat3 im = mat3(instanceMatrix);
  vec3 n = normal / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
  vN = normalize(normalMatrix * im * n);
  vWorld = worldPos.xyz;
  vLocal = position;
  vAxial = axial;
  vZone = zone;
  vSpecies = aSpecies;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fishFrag = /* glsl */ `
uniform float uTime;
uniform float uFogDensity;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vLocal;
varying float vAxial;
varying float vZone;
varying float vSpecies;
${GLSL}
void main() {
  vec3 N = normalize(vN);
  vec3 col;
  if (vZone > 1.4) {
    col = applyFog(toLinear(vec3(1.0)), vWorld, uFogDensity);
  } else if (vZone > 0.9) {
    col = sunLight(toLinear(vec3(0.015, 0.018, 0.022)), N, vWorld, uFogDensity, 28.0, 1.1);
  } else if (vZone > 0.6) {
    col = sunLight(toLinear(vec3(0.93, 0.95, 0.96)), N, vWorld, uFogDensity, 36.0, 0.45);
  } else {
    vec3 albedo = speciesAlbedo(vSpecies, vAxial, vLocal);
    if (vZone < 0.2) {
      float sc = sin(vLocal.x * 52.0) * sin(vLocal.y * 68.0);
      albedo *= 0.94 + 0.06 * sc;
    } else {
      albedo = mix(albedo, toLinear(vec3(0.8, 0.92, 0.94)), 0.1);
    }
    col = sunLight(albedo, N, vWorld, uFogDensity, 48.0, 0.32);
  }
  gl_FragColor = finish(col, 1.0);
}
`;

const reefVert = /* glsl */ `
uniform float uTime;
uniform float uSway;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vColor;
void main() {
  vec3 pos = position;
  float wave = sin(uTime * 0.55 + pos.x * 0.35 + pos.z * 0.4);
  pos.x += wave * max(pos.y, 0.0) * uSway;
  pos.z += cos(uTime * 0.42 + pos.x * 0.5) * max(pos.y, 0.0) * uSway * 0.65;
  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorld = worldPos.xyz;
  vN = normalize(normalMatrix * normal);
  vColor = color;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const reefFrag = /* glsl */ `
uniform float uTime;
uniform float uFogDensity;
varying vec3 vN;
varying vec3 vWorld;
varying vec3 vColor;
${GLSL}
void main() {
  vec3 col = sunLight(vColor, normalize(vN), vWorld, uFogDensity, 24.0, 0.06);
  gl_FragColor = finish(col, 1.0);
}
`;

const sandVert = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
varying vec3 vN;
float dune(vec2 p) {
  return sin(p.x * 0.42) * 0.1
    + sin(p.y * 0.36 + 1.7) * 0.08
    + sin(p.x * 1.15 + p.y * 0.72) * 0.028;
}
void main() {
  vec3 pos = position;
  pos.y += dune(pos.xz);
  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorld = worldPos.xyz;
  float e = 0.18;
  float dx = dune(pos.xz + vec2(e, 0.0)) - dune(pos.xz - vec2(e, 0.0));
  float dz = dune(pos.xz + vec2(0.0, e)) - dune(pos.xz - vec2(0.0, e));
  vec3 n = normalize(vec3(-dx, 2.0 * e, -dz));
  vN = normalize(normalMatrix * n);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const sandFrag = /* glsl */ `
uniform float uTime;
uniform float uFogDensity;
varying vec3 vWorld;
varying vec3 vN;
${GLSL}
void main() {
  float blotch = sin(vWorld.x * 0.55) * sin(vWorld.z * 0.48 + 0.6);
  vec3 albedo = mix(toLinear(vec3(0.66, 0.52, 0.32)), toLinear(vec3(0.84, 0.72, 0.48)), smoothstep(-0.4, 0.8, blotch));
  float grain = fract(sin(dot(floor(vWorld.xz * 34.0), vec2(127.1, 311.7))) * 43758.5453);
  albedo *= 0.86 + 0.22 * grain;
  float peb = smoothstep(0.82, 0.97, fract(sin(dot(floor(vWorld.xz * 9.0), vec2(19.1, 73.4))) * 21413.5));
  albedo = mix(albedo, toLinear(vec3(0.45, 0.4, 0.32)), peb * 0.55);
  vec3 col = sunLight(albedo, normalize(vN), vWorld, uFogDensity, 18.0, 0.03);
  col += toLinear(vec3(0.75, 0.95, 0.9)) * caustic(vWorld.xz, uTime) * 0.22;
  gl_FragColor = finish(col, 1.0);
}
`;

const waterVert = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
float rip(vec2 p) {
  return sin(p.x * 1.45 + uTime * 1.05) * 0.045
    + sin(p.y * 1.9 - uTime * 0.86) * 0.032
    + sin((p.x + p.y) * 2.6 + uTime * 1.35) * 0.02;
}
void main() {
  vec3 pos = position;
  pos.y += rip(pos.xz);
  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorld = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const waterFrag = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
${GLSL}
float rip(vec2 p) {
  float t = uTime;
  return sin(p.x * 1.45 + t * 1.05)
    + sin(p.y * 1.9 - t * 0.86) * 0.75
    + sin((p.x + p.y) * 2.6 + t * 1.35) * 0.45
    + sin(p.x * 5.2 - p.y * 4.4 + t * 1.8) * 0.22;
}
void main() {
  vec2 p = vWorld.xz;
  float e = 0.1;
  float dx = rip(p + vec2(e, 0.0)) - rip(p - vec2(e, 0.0));
  float dz = rip(p + vec2(0.0, e)) - rip(p - vec2(0.0, e));
  vec3 N = normalize(vec3(-dx, 1.15, -dz));
  vec3 I = normalize(vWorld - cameraPosition);
  float cosA = dot(I, N);
  float window = smoothstep(0.48, 0.74, cosA);
  vec3 sky = mix(toLinear(vec3(0.5, 0.8, 0.84)), toLinear(vec3(0.9, 0.97, 1.0)), smoothstep(0.7, 0.98, cosA));
  vec3 sunDir = normalize(vec3(0.22, 1.0, 0.12));
  sky += toLinear(vec3(1.0, 0.95, 0.78)) * pow(max(dot(normalize(I), sunDir), 0.0), 160.0) * 1.6;
  vec3 below = mix(fogColor(3.4), toLinear(vec3(0.16, 0.5, 0.58)), 0.62);
  below += toLinear(vec3(0.7, 0.95, 0.95)) * caustic(p, uTime) * 0.18;
  vec3 col = mix(below, sky, window);
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 L = normalize(vec3(0.2, 1.0, 0.15));
  float spec = pow(max(dot(N, normalize(L + V)), 0.0), 70.0);
  col += toLinear(vec3(0.85, 0.97, 1.0)) * spec * 0.85;
  gl_FragColor = finish(col, 1.0);
}
`;

const shellVert = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorld = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const shellFrag = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
${GLSL}
void main() {
  gl_FragColor = finish(fogColor(vWorld.y), 1.0);
}
`;

const bubbleVert = /* glsl */ `
varying vec3 vN;
varying vec3 vWorld;
void main() {
  vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
  mat3 im = mat3(instanceMatrix);
  vec3 n = normal / vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
  vN = normalize(normalMatrix * im * n);
  vWorld = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const bubbleFrag = /* glsl */ `
uniform float uTime;
uniform float uFogDensity;
varying vec3 vN;
varying vec3 vWorld;
${GLSL}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = clamp(dot(normalize(vN), V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 1.65);
  float alpha = fres * 0.95 + pow(ndv, 5.0) * 0.28;
  vec3 col = mix(toLinear(vec3(0.94, 0.98, 1.0)), fogColor(vWorld.y), fogAmt(vWorld, uFogDensity) * 0.35);
  gl_FragColor = finish(col, alpha);
}
`;

const shaftVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorld = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const shaftFrag = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vWorld;
${GLSL}
void main() {
  float edge = smoothstep(0.0, 0.28, vUv.x) * smoothstep(1.0, 0.72, vUv.x);
  float flicker = 0.75 + 0.25 * sin(uTime * 0.7 + vWorld.x * 1.4 + vWorld.z);
  float alpha = vUv.y * vUv.y * edge * flicker * 0.11;
  vec3 col = toLinear(vec3(0.7, 0.95, 0.9));
  gl_FragColor = finish(col, alpha);
}
`;

function paint(geo, hex, vary = 0.12, hex2 = null) {
  const base = new THREE.Color(hex);
  const alt = hex2 ? new THREE.Color(hex2) : null;
  const pos = geo.attributes.position;
  if (!geo.boundingBox) geo.computeBoundingBox();
  const minY = geo.boundingBox.min.y;
  const span = Math.max(0.0001, geo.boundingBox.max.y - minY);
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = 0.5 + 0.5 * Math.sin(x * 7.1 + z * 5.4) * Math.sin(y * 6.2 + x * 2.2);
    const h = (y - minY) / span;
    const tint = alt ? smoothstep(-0.2, 0.85, Math.sin(x * 6.5 + z * 5.1 + y * 3.0)) : 0;
    const shade = Math.min(1.25, (0.58 + 0.55 * h) * (0.88 + vary * (n - 0.5) * 2));
    const r = alt ? base.r * (1 - tint) + alt.r * tint : base.r;
    const g = alt ? base.g * (1 - tint) + alt.g * tint : base.g;
    const b = alt ? base.b * (1 - tint) + alt.b * tint : base.b;
    arr[i * 3] = r * shade;
    arr[i * 3 + 1] = g * shade;
    arr[i * 3 + 2] = b * shade;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return geo;
}

function jitter(geo, amount) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.hypot(x, y, z) || 1;
    const n = Math.sin(x * 7.5 + y * 2.2) * Math.cos(z * 6.4 + x * 1.3);
    pos.setXYZ(i, x + (x / len) * n * amount, y + (y / len) * n * amount, z + (z / len) * n * amount);
  }
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return geo;
}

function bake(geo, setup) {
  const obj = new THREE.Object3D();
  setup(obj);
  obj.updateMatrix();
  const g = geo.clone();
  g.applyMatrix4(obj.matrix);
  return g;
}

function mergeParts(parts) {
  let verts = 0;
  let indices = 0;
  for (const part of parts) {
    const g = part.geo;
    if (!g.getAttribute("normal")) g.computeVertexNormals();
    verts += g.getAttribute("position").count;
    const idx = g.getIndex();
    indices += idx ? idx.count : g.getAttribute("position").count;
  }
  const pos = new Float32Array(verts * 3);
  const nrm = new Float32Array(verts * 3);
  const uv = new Float32Array(verts * 2);
  const col = new Float32Array(verts * 3);
  const IndexArray = verts > 65535 ? Uint32Array : Uint16Array;
  const index = new IndexArray(indices);
  let vBase = 0;
  let iBase = 0;
  for (const part of parts) {
    const g = part.geo;
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const c = g.getAttribute("color");
    const idx = g.getIndex();
    for (let i = 0; i < p.count; i++) {
      pos[(vBase + i) * 3] = p.getX(i);
      pos[(vBase + i) * 3 + 1] = p.getY(i);
      pos[(vBase + i) * 3 + 2] = p.getZ(i);
      nrm[(vBase + i) * 3] = n.getX(i);
      nrm[(vBase + i) * 3 + 1] = n.getY(i);
      nrm[(vBase + i) * 3 + 2] = n.getZ(i);
      uv[(vBase + i) * 2 + 1] = part.zone || 0;
      if (c) {
        col[(vBase + i) * 3] = c.getX(i);
        col[(vBase + i) * 3 + 1] = c.getY(i);
        col[(vBase + i) * 3 + 2] = c.getZ(i);
      } else {
        col[(vBase + i) * 3] = 1;
        col[(vBase + i) * 3 + 1] = 1;
        col[(vBase + i) * 3 + 2] = 1;
      }
    }
    if (idx) {
      for (let i = 0; i < idx.count; i++) index[iBase + i] = idx.getX(i) + vBase;
      iBase += idx.count;
    } else {
      for (let i = 0; i < p.count; i++) index[iBase + i] = vBase + i;
      iBase += p.count;
    }
    vBase += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingBox();
  const minX = geo.boundingBox.min.x;
  const span = Math.max(0.0001, geo.boundingBox.max.x - minX);
  for (let i = 0; i < vBase; i++) {
    uv[i * 2] = (pos[i * 3] - minX) / span;
  }
  geo.attributes.uv.needsUpdate = true;
  return geo;
}

function extrude(shape) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 0.03,
    bevelEnabled: false,
    curveSegments: 2,
    steps: 1,
  });
  g.translate(0, 0, -0.015);
  g.computeVertexNormals();
  return g;
}

function buildFishGeometry() {
  const body = new THREE.SphereGeometry(1, 18, 12);
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const radial = Math.hypot(y, z);
    const ny = radial > 1e-5 ? y / radial : 0;
    const nz = radial > 1e-5 ? z / radial : 0;
    const t = x * 0.5 + 0.5;
    const hump = Math.sin(Math.PI * Math.pow(Math.min(Math.max(t, 0), 1), 0.7));
    let r = Math.pow(Math.max(hump, 0), 0.75);
    r *= 0.15 + 0.85 * smoothstep(0, 0.2, t);
    r *= smoothstep(1, 0.8, t);
    const X = (t - 0.46) * 2.55;
    const belly = ny < 0 ? 1.16 : 0.9;
    p.setXYZ(i, X, ny * r * 0.58 * belly, nz * r * 0.3);
  }
  body.computeVertexNormals();
  body.computeBoundingBox();
  const bb = body.boundingBox;
  const eyeX = THREE.MathUtils.lerp(bb.min.x, bb.max.x, 0.76);
  const eyeY = bb.max.y * 0.28;
  const eyeZ = bb.max.z * 0.62;

  const tx = bb.min.x + 0.04;
  const tail = new THREE.Shape();
  tail.moveTo(tx + 0.1, 0.02);
  tail.lineTo(tx - 0.02, 0.18);
  tail.lineTo(tx - 0.46, 0.5);
  tail.lineTo(tx - 0.22, 0.07);
  tail.lineTo(tx - 0.56, 0);
  tail.lineTo(tx - 0.22, -0.07);
  tail.lineTo(tx - 0.46, -0.5);
  tail.lineTo(tx - 0.02, -0.18);
  tail.closePath();

  const x0 = THREE.MathUtils.lerp(bb.min.x, bb.max.x, 0.3);
  const x1 = THREE.MathUtils.lerp(bb.min.x, bb.max.x, 0.64);
  const yb = bb.max.y * 0.78;
  const dorsal = new THREE.Shape();
  dorsal.moveTo(x1, yb * 0.42);
  dorsal.lineTo(x1 * 0.55 + x0 * 0.45, yb * 1.05);
  dorsal.lineTo(x0, yb * 0.7);
  dorsal.lineTo(x0 - 0.16, yb * 0.22);
  dorsal.closePath();

  const ax = THREE.MathUtils.lerp(bb.min.x, bb.max.x, 0.36);
  const anal = new THREE.Shape();
  anal.moveTo(ax + 0.32, -0.1);
  anal.lineTo(ax, -0.08);
  anal.lineTo(ax + 0.08, -0.42);
  anal.closePath();

  const pecShape = new THREE.Shape();
  pecShape.moveTo(0, 0);
  pecShape.quadraticCurveTo(0.16, 0.18, -0.34, 0.05);
  pecShape.quadraticCurveTo(-0.12, -0.12, 0, 0);
  const pec = extrude(pecShape);
  pec.rotateX(Math.PI / 2);
  pec.translate(eyeX - 0.42, -0.02, 0.02);
  const pec2 = pec.clone();
  pec2.scale(1, 1, -1);

  const eye = new THREE.SphereGeometry(0.07, 8, 6);
  eye.translate(eyeX, eyeY, eyeZ);
  const eye2 = eye.clone();
  eye2.translate(0, 0, -eyeZ * 2);
  const pupil = new THREE.SphereGeometry(0.038, 7, 5);
  pupil.translate(eyeX + 0.048, eyeY, eyeZ + 0.028);
  const pupil2 = pupil.clone();
  pupil2.translate(0, 0, -2 * (eyeZ + 0.028));
  const glint = new THREE.SphereGeometry(0.014, 4, 3);
  glint.translate(eyeX + 0.055, eyeY + 0.025, eyeZ + 0.04);
  const glint2 = glint.clone();
  glint2.translate(0, 0, -2 * (eyeZ + 0.04));

  return mergeParts([
    { geo: body, zone: 0 },
    { geo: extrude(tail), zone: 0.3 },
    { geo: extrude(dorsal), zone: 0.3 },
    { geo: extrude(anal), zone: 0.3 },
    { geo: pec, zone: 0.45 },
    { geo: pec2, zone: 0.45 },
    { geo: eye, zone: 0.8 },
    { geo: eye2, zone: 0.8 },
    { geo: pupil, zone: 1 },
    { geo: pupil2, zone: 1 },
    { geo: glint, zone: 1.6 },
    { geo: glint2, zone: 1.6 },
  ]);
}

function cylinder(rTop, rBot, h, seg) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, false);
  g.translate(0, h / 2, 0);
  return g;
}

function buildHardscape() {
  const parts = [];

  const rockL = jitter(new THREE.DodecahedronGeometry(1, 0), 0.16);
  rockL.scale(1.35, 0.72, 1.05);
  paint(rockL, "#6f6558", 0.18, "#8d7b68");
  parts.push(bake(rockL, (o) => {
    o.position.set(A.rockL[0], -0.18, A.rockL[2]);
    o.rotation.y = 0.4;
  }));

  const rockR = jitter(new THREE.IcosahedronGeometry(1, 1), 0.1);
  rockR.scale(1.45, 0.78, 1.15);
  paint(rockR, "#5e584f", 0.16, "#7c6f5e");
  parts.push(bake(rockR, (o) => {
    o.position.set(A.rockR[0], -0.22, A.rockR[2]);
    o.rotation.y = 1.2;
  }));

  const rockB = jitter(new THREE.DodecahedronGeometry(0.7, 0), 0.1);
  rockB.scale(1.1, 0.6, 0.9);
  paint(rockB, "#74685a", 0.14);
  parts.push(bake(rockB, (o) => o.position.set(A.rockBack[0], -0.12, A.rockBack[2])));

  const rockF = jitter(new THREE.DodecahedronGeometry(0.48, 0), 0.08);
  rockF.scale(1.2, 0.42, 0.9);
  paint(rockF, "#7a6c5c", 0.12, "#9a8b74");
  parts.push(bake(rockF, (o) => o.position.set(A.rockFront[0], -0.06, A.rockFront[2])));

  const brain = jitter(new THREE.IcosahedronGeometry(0.62, 2), 0.14);
  brain.scale(1.15, 0.48, 0.95);
  paint(brain, "#c6b15a", 0.22, "#4f6230");
  parts.push(bake(brain, (o) => o.position.set(A.brain[0], 0.12, A.brain[2])));

  const spongeColors = ["#7a4ea3", "#e07a3d", "#6a3d88"];
  const spongeSpec = [
    { at: A.rockL, x: 0.35, z: 0.15, h: 1.05, r: 0.16, c: 0 },
    { at: A.rockL, x: -0.15, z: -0.25, h: 0.72, r: 0.12, c: 1 },
    { at: A.rockR, x: 0.2, z: 0.35, h: 0.9, r: 0.13, c: 2 },
  ];
  for (const s of spongeSpec) {
    const outer = new THREE.CylinderGeometry(s.r, s.r + 0.05, s.h, 8, 1, true);
    outer.translate(0, s.h / 2, 0);
    paint(outer, spongeColors[s.c], 0.08);
    parts.push(bake(outer, (o) => {
      o.position.set(s.at[0] + s.x, 0.25, s.at[2] + s.z);
      o.rotation.z = (s.x > 0 ? -1 : 1) * 0.12;
    }));
    const lip = new THREE.TorusGeometry(s.r * 0.92, 0.03, 5, 8);
    lip.rotateX(Math.PI / 2);
    paint(lip, spongeColors[s.c], 0.02);
    parts.push(bake(lip, (o) => o.position.set(s.at[0] + s.x, 0.25 + s.h, s.at[2] + s.z)));
  }

  function branch(h, r0, r1) {
    return paint(cylinder(r1, r0, h, 5), "#ff8b78", 0.1, "#e36b8c");
  }
  parts.push(bake(branch(0.7, 0.09, 0.05), (o) => o.position.set(A.rockR[0] - 0.15, 0.35, A.rockR[2] + 0.1)));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push(bake(branch(0.42, 0.045, 0.02), (o) => {
      o.position.set(A.rockR[0] - 0.15 + Math.sin(a) * 0.08, 0.95, A.rockR[2] + 0.1 + Math.cos(a) * 0.08);
      o.rotation.z = Math.cos(a) * 0.7;
      o.rotation.x = Math.sin(a) * 0.55;
    }));
  }
  parts.push(bake(paint(cylinder(0.025, 0.055, 0.85, 5), "#d46ad0", 0.08), (o) => {
    o.position.set(A.rockR[0] + 0.45, 0.4, A.rockR[2] - 0.2);
    o.rotation.z = -0.35;
  }));

  const fan = new THREE.RingGeometry(0.12, 0.78, 12);
  paint(fan, "#c44b78", 0.15, "#7a2d58");
  parts.push(bake(fan, (o) => {
    o.position.set(A.fan[0], 0.85, A.fan[2]);
    o.rotation.y = -0.5;
  }));

  for (let i = 0; i < 2; i++) {
    const stem = paint(cylinder(0.08, 0.1, 0.22, 7), "#2f7d58", 0.05);
    const cap = paint(new THREE.SphereGeometry(0.2, 8, 6), "#3eaf78", 0.12, "#1d6b48");
    cap.scale(1, 0.45, 1);
    const x = -1.15 + i * 2.5;
    const z = -1.7 - i * 0.4;
    parts.push(bake(stem, (o) => o.position.set(x, 0, z)));
    parts.push(bake(cap, (o) => o.position.set(x, 0.28, z)));
  }

  for (let i = 0; i < 7; i++) {
    const polyp = new THREE.SphereGeometry(0.055 + (i % 3) * 0.012, 5, 4);
    paint(polyp, i % 2 ? "#2f9d6a" : "#e07a6a", 0.08);
    const ang = (i / 7) * Math.PI * 2;
    parts.push(bake(polyp, (o) => o.position.set(
      A.rockFront[0] + Math.cos(ang) * 0.28,
      0.18 + (i % 2) * 0.05,
      A.rockFront[2] + Math.sin(ang) * 0.2,
    )));
  }

  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.26 : 0.1;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) star.moveTo(x, y);
    else star.lineTo(x, y);
  }
  star.closePath();
  const starGeo = new THREE.ShapeGeometry(star);
  starGeo.rotateX(-Math.PI / 2);
  paint(starGeo, "#e07a32", 0.05);
  parts.push(bake(starGeo, (o) => {
    o.position.set(0.35, 0.06, 1.85);
    o.rotation.y = 0.4;
  }));

  for (let i = 0; i < 4; i++) {
    const shell = new THREE.SphereGeometry(0.1, 7, 5);
    shell.scale(1.15, 0.38, 0.85);
    paint(shell, i % 2 ? "#efe4cc" : "#d7c4a4", 0.06);
    parts.push(bake(shell, (o) => o.position.set(-1.3 + i * 0.9, 0.04, 2.05 - (i % 2) * 0.35)));
  }

  return mergeParts(parts.map((geo) => ({ geo, zone: 0 })));
}

function buildSoftscape() {
  const parts = [];
  const anemone = A.anemone;
  const base = new THREE.SphereGeometry(0.24, 8, 6);
  base.scale(1.15, 0.45, 1.05);
  paint(base, "#8d3d62", 0.1, "#c46b88");
  parts.push(bake(base, (o) => o.position.set(anemone[0], 0.06, anemone[2])));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    const cone = new THREE.ConeGeometry(0.045, 0.52 + (i % 3) * 0.06, 5, 1);
    cone.translate(0, 0.28, 0);
    paint(cone, i % 2 ? "#e48ab4" : "#f2d7c4", 0.06);
    parts.push(bake(cone, (o) => {
      o.position.set(anemone[0] + Math.cos(a) * 0.12, 0.02, anemone[2] + Math.sin(a) * 0.12);
      o.rotation.z = Math.cos(a) * 0.45;
      o.rotation.x = Math.sin(a) * 0.4;
    }));
  }

  const kelpSpots = [
    [-4.3, -2.1, 1.7, "#1e6b42"],
    [-3.9, -2.5, 1.35, "#2f8a52"],
    [0.15, -5.1, 1.9, "#245c38"],
    [-1.4, -4.6, 1.5, "#6a6234"],
    [4.4, -2.6, 1.6, "#1f7048"],
  ];
  for (const [x, z, h, color] of kelpSpots) {
    const ribbon = new THREE.PlaneGeometry(0.16 + h * 0.02, h, 1, 8);
    ribbon.translate(0, h / 2, 0);
    paint(ribbon, color, 0.1, "#8ea24a");
    parts.push(bake(ribbon, (o) => {
      o.position.set(x, 0, z);
      o.rotation.y = x * 0.4;
    }));
  }
  return mergeParts(parts.map((geo) => ({ geo, zone: 0 })));
}

function makeMaterial(vert, frag, uniforms, extra = {}) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    ...extra,
  });
}

function roster(low) {
  const fish = [
    { id: 0, s: [0.5, 0.56, 0.46], home: true },
    { id: 0, s: [0.4, 0.46, 0.38], home: true },
    { id: 1, s: [0.48, 0.8, 0.34], band: "mid" },
    { id: 2, s: [0.46, 0.74, 0.32], band: "high" },
    { id: 4, s: [0.5, 0.86, 0.28], band: "mid" },
    { id: 5, s: [0.68, 0.46, 0.36], band: "low" },
  ];
  if (!low) {
    fish.push(
      { id: 1, s: [0.38, 0.62, 0.26], band: "high" },
      { id: 2, s: [0.36, 0.58, 0.24], band: "mid" },
      { id: 3, s: [0.34, 0.32, 0.24], band: "low" },
      { id: 6, s: [0.44, 0.7, 0.22], band: "mid" },
      { id: 5, s: [0.54, 0.4, 0.3], band: "mid" },
    );
  }
  const school = low ? 5 : 10;
  for (let i = 0; i < school; i++) fish.push({ id: 7, s: [0.22, 0.18, 0.14], school: true });
  return fish;
}

function bandRange(band) {
  if (band === "low") return [0.45, 1.15];
  if (band === "high") return [2.15, 3.25];
  return [1.15, 2.35];
}

function pickGoal(band) {
  const [y0, y1] = bandRange(band || "mid");
  // Most cruises stay in the water in front of the glass.
  if (rand() < 0.7) {
    return new THREE.Vector3((rand() * 2 - 1) * 3.3, 1.15 + rand() * 1.45, -1.2 + rand() * 3.8);
  }
  return new THREE.Vector3(
    (rand() * 2 - 1) * 4.4,
    y0 + rand() * (y1 - y0),
    -5.4 + rand() * 7.6,
  );
}

const STAGE = [
  [-1.5, 1.72, 1.7],
  [0.35, 1.95, 0.9],
  [1.7, 1.48, 2.15],
  [-0.35, 2.15, -0.4],
  [2.2, 1.78, -0.8],
  [-2.1, 1.35, 0.45],
  [0.85, 1.28, 2.6],
  [-0.7, 2.25, 1.35],
  [1.15, 1.62, 1.15],
  [-1.15, 1.55, 2.4],
];

function softCircle() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,0.95)");
  grd.addColorStop(0.4, "rgba(214,242,255,0.28)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function fail(message) {
  const boot = document.getElementById("boot");
  if (!boot) return;
  boot.classList.remove("is-done");
  boot.style.opacity = "1";
  const span = boot.querySelector("span");
  if (span) span.textContent = message;
}

function main() {
  const canvas = document.getElementById("tank");
  const q = quality();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: q.antialias,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
      failIfMajorPerformanceCaveat: false,
    });
  } catch (err) {
    fail("This browser cannot open the tank");
    console.error(err);
    return;
  }

  renderer.setPixelRatio(q.dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x063444, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(56, window.innerWidth / Math.max(1, window.innerHeight), 0.08, 80);
  camera.position.set(0, 1.42, 6.15);

  const ticking = [];
  const fogDensity = { value: 0.028 };

  const shellMat = makeMaterial(shellVert, shellFrag, { uTime: { value: 0 } });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(32, 24, 16), shellMat);
  shell.material.side = THREE.BackSide;
  shell.frustumCulled = false;
  scene.add(shell);

  const sandMat = makeMaterial(sandVert, sandFrag, {
    uTime: { value: 0 },
    uFogDensity: fogDensity,
  });
  ticking.push(sandMat);
  const sandGeo = new THREE.PlaneGeometry(72, 72, q.sand[0], q.sand[1]);
  sandGeo.rotateX(-Math.PI / 2);
  scene.add(new THREE.Mesh(sandGeo, sandMat));

  const hardMat = makeMaterial(reefVert, reefFrag, {
    uTime: { value: 0 },
    uSway: { value: 0 },
    uFogDensity: fogDensity,
  }, { vertexColors: true, side: THREE.DoubleSide });
  const softMat = makeMaterial(reefVert, reefFrag, {
    uTime: { value: 0 },
    uSway: { value: 0.1 },
    uFogDensity: fogDensity,
  }, { vertexColors: true, side: THREE.DoubleSide });
  ticking.push(hardMat, softMat);
  scene.add(new THREE.Mesh(buildHardscape(), hardMat));
  scene.add(new THREE.Mesh(buildSoftscape(), softMat));

  const waterMat = makeMaterial(waterVert, waterFrag, { uTime: { value: 0 } }, { side: THREE.DoubleSide });
  ticking.push(waterMat);
  const waterGeo = new THREE.PlaneGeometry(80, 80, q.water, q.water);
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = SURFACE_Y;
  scene.add(water);

  const shaftMat = makeMaterial(shaftVert, shaftFrag, { uTime: { value: 0 } }, {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  ticking.push(shaftMat);
  const shaftParts = [];
  for (let i = 0; i < q.shafts; i++) {
    const g = new THREE.PlaneGeometry(0.55 + i * 0.18, 3.5, 1, 1);
    g.translate(0, -1.75, 0);
    shaftParts.push(bake(g, (o) => {
      o.position.set(-1.4 + i * 1.15, SURFACE_Y, -0.4 - i * 0.35);
      o.rotation.y = 0.35 + i * 0.4;
      o.rotation.z = -0.08 + i * 0.04;
    }));
  }
  const shafts = new THREE.Mesh(mergeParts(shaftParts.map((geo) => ({ geo, zone: 0 }))), shaftMat);
  shafts.frustumCulled = false;
  scene.add(shafts);

  const fishGeo = buildFishGeometry();
  const entries = roster(q.low);
  const count = entries.length;
  const aSpecies = new Float32Array(count);
  const aPhase = new Float32Array(count);
  const aSpeed = new Float32Array(count);
  const school = {
    pos: new THREE.Vector3(0.15, 1.78, 1.25),
    yaw: 0.4,
    goal: new THREE.Vector3(-1.4, 1.9, 2.1),
    timer: 8,
  };
  let stageCursor = 0;
  const fishes = entries.map((entry, i) => {
    aSpecies[i] = entry.id;
    aPhase[i] = rand() * Math.PI * 2;
    aSpeed[i] = entry.school ? 10.5 + rand() * 2 : 6.2 + rand() * 2.4;
    const fish = {
      id: entry.id,
      home: !!entry.home,
      school: !!entry.school,
      band: entry.band || "mid",
      sx: entry.s[0],
      sy: entry.s[1],
      sz: entry.s[2],
      phase: aPhase[i],
      speed: (entry.school ? 0.62 : 0.26 + rand() * 0.12) * (entry.id === 4 ? 0.82 : 1),
      turn: entry.school ? 2.15 : 1.0,
      yaw: rand() * Math.PI * 2,
      pitch: 0,
      roll: 0,
      bob: entry.school ? 0.02 : 0.035,
      timer: 5 + rand() * 4,
      goal: new THREE.Vector3(),
      off: new THREE.Vector3((rand() - 0.5) * 1.25, (rand() - 0.5) * 0.55, (rand() - 0.5) * 1.05),
      orbit: rand() * Math.PI * 2,
      orbitR: 0.28 + rand() * 0.22,
      pos: new THREE.Vector3(),
    };
    fish.minY = 0.16 + fish.sy * 0.55;
    fish.maxY = SURFACE_Y - 0.42 - fish.sy * 0.15;
    if (fish.home) {
      fish.pos.set(
        A.anemone[0] + Math.cos(fish.orbit) * fish.orbitR,
        0.42 + rand() * 0.2,
        A.anemone[2] + Math.sin(fish.orbit) * fish.orbitR,
      );
    } else if (fish.school) {
      fish.pos.set(school.pos.x + fish.off.x, school.pos.y + fish.off.y, school.pos.z + fish.off.z);
    } else {
      const spot = STAGE[stageCursor % STAGE.length];
      stageCursor += 1;
      fish.pos.set(spot[0], spot[1], spot[2]);
      fish.goal.copy(pickGoal(fish.band));
      fish.yaw = Math.atan2(fish.goal.z - fish.pos.z, fish.goal.x - fish.pos.x);
    }
    return fish;
  });
  fishGeo.setAttribute("aSpecies", new THREE.InstancedBufferAttribute(aSpecies, 1));
  fishGeo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(aPhase, 1));
  fishGeo.setAttribute("aSpeed", new THREE.InstancedBufferAttribute(aSpeed, 1));
  const fishMat = makeMaterial(fishVert, fishFrag, {
    uTime: { value: 0 },
    uFogDensity: fogDensity,
  }, { side: THREE.DoubleSide });
  ticking.push(fishMat);
  const fishMesh = new THREE.InstancedMesh(fishGeo, fishMat, count);
  fishMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  fishMesh.frustumCulled = false;
  scene.add(fishMesh);

  const bubbles = [];
  const bubbleGeo = new THREE.SphereGeometry(1, 7, 5);
  const bubbleMat = makeMaterial(bubbleVert, bubbleFrag, {
    uTime: { value: 0 },
    uFogDensity: fogDensity,
  }, {
    transparent: true,
    depthWrite: false,
  });
  const bubbleMesh = new THREE.InstancedMesh(bubbleGeo, bubbleMat, q.bubbles);
  bubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bubbleMesh.frustumCulled = false;
  scene.add(bubbleMesh);
  function respawnBubble(b, scatterY) {
    const r = rand();
    if (r < 0.34) {
      b.x = A.rockL[0] + 0.35 + (rand() - 0.5) * 0.28;
      b.z = A.rockL[2] + 0.2 + (rand() - 0.5) * 0.28;
      b.y = scatterY ? 0.3 + rand() * 3.3 : 0.25 + rand() * 0.3;
    } else if (r < 0.52) {
      b.x = A.rockR[0] - 0.2 + (rand() - 0.5) * 0.25;
      b.z = A.rockR[2] + 0.15 + (rand() - 0.5) * 0.25;
      b.y = scatterY ? 0.3 + rand() * 3.3 : 0.25 + rand() * 0.3;
    } else if (r < 0.84) {
      b.x = 0.15 + (rand() - 0.5) * 0.55;
      b.z = 1.15 + (rand() - 0.5) * 0.45;
      b.y = scatterY ? 0.4 + rand() * 3.2 : 0.3 + rand() * 0.4;
    } else {
      b.x = (rand() * 2 - 1) * 4.2;
      b.z = -4.2 + rand() * 6.2;
      b.y = 0.2 + rand() * 3.2;
    }
    b.speed = 0.38 + rand() * 0.55;
    b.scale = rand() < 0.16 ? 0.09 + rand() * 0.05 : 0.035 + rand() * 0.045;
    b.phase = rand() * Math.PI * 2;
    b.freq = 1.1 + rand() * 1.5;
    b.amp = 0.04 + rand() * 0.1;
  }
  for (let i = 0; i < q.bubbles; i++) {
    const b = {};
    respawnBubble(b, true);
    bubbles.push(b);
  }

  const moteCount = q.motes;
  const motePos = new Float32Array(moteCount * 3);
  const moteSpeed = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = (rand() * 2 - 1) * 6;
    motePos[i * 3 + 1] = rand() * 3.8;
    motePos[i * 3 + 2] = -6 + rand() * 10;
    moteSpeed[i] = 0.015 + rand() * 0.05;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute("position", new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: 0xd7f4ff,
    size: 0.055,
    map: softCircle(),
    transparent: true,
    depthWrite: false,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }));
  motes.frustumCulled = false;
  scene.add(motes);

  const obstacles = [
    { x: A.rockL[0], z: A.rockL[2], r: 0.95, top: 0.9 },
    { x: A.rockR[0], z: A.rockR[2], r: 1.15, top: 1.3 },
    { x: A.brain[0], z: A.brain[2], r: 0.7, top: 0.55 },
    { x: A.rockFront[0], z: A.rockFront[2], r: 0.48, top: 0.36 },
    { x: A.rockBack[0], z: A.rockBack[2], r: 0.62, top: 0.55 },
  ];

  const pointer = { x: 0, y: 0, lx: 0, ly: 0 };
  window.addEventListener("pointermove", (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  function onResize() {
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  const dummy = new THREE.Object3D();
  const nose = new THREE.Vector3(1, 0, 0);
  const fwd = new THREE.Vector3();
  const qAim = new THREE.Quaternion();
  const qRoll = new THREE.Quaternion();
  const target = new THREE.Vector3();
  let time = 0;
  const clock = new THREE.Clock();
  let raf = 0;

  function updateSchool(dt) {
    school.timer -= dt;
    if (school.timer <= 0) {
      school.goal.set((rand() * 2 - 1) * 3.1, 1.35 + rand() * 1.35, -4.5 + rand() * 5.5);
      school.timer = 4 + rand() * 4;
    }
    const dx = school.goal.x - school.pos.x;
    const dz = school.goal.z - school.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.08) {
      const targetYaw = Math.atan2(dz, dx);
      let dy = Math.atan2(Math.sin(targetYaw - school.yaw), Math.cos(targetYaw - school.yaw));
      school.yaw += THREE.MathUtils.clamp(dy, -0.55 * dt, 0.55 * dt);
      const sp = 0.5 * THREE.MathUtils.clamp(dist, 0.35, 1);
      school.pos.x += Math.cos(school.yaw) * sp * dt;
      school.pos.z += Math.sin(school.yaw) * sp * dt;
    }
    school.pos.y += (school.goal.y - school.pos.y) * Math.min(1, dt * 0.6);
    school.pos.x = THREE.MathUtils.clamp(school.pos.x, -3.6, 3.6);
    school.pos.z = THREE.MathUtils.clamp(school.pos.z, -5.2, 2.6);
    school.pos.y = THREE.MathUtils.clamp(school.pos.y, 1.2, 3.1);
  }

  function updateFish(fish, dt) {
    if (fish.home) {
      fish.orbit += dt * (0.55 + fish.speed);
      target.set(
        A.anemone[0] + Math.cos(fish.orbit) * fish.orbitR,
        0.38 + Math.sin(fish.orbit * 2.1) * 0.1 + fish.orbitR * 0.15,
        A.anemone[2] + Math.sin(fish.orbit) * fish.orbitR * 0.75,
      );
    } else if (fish.school) {
      const ox = fish.off.x * Math.cos(school.yaw) - fish.off.z * Math.sin(school.yaw);
      const oz = fish.off.x * Math.sin(school.yaw) + fish.off.z * Math.cos(school.yaw);
      target.set(school.pos.x + ox, school.pos.y + fish.off.y, school.pos.z + oz);
    } else {
      fish.timer -= dt;
      if (fish.timer <= 0) {
        fish.goal.copy(pickGoal(fish.band));
        fish.timer = 4 + rand() * 5;
      }
      target.copy(fish.goal);
      if (fish.pos.x > 4.3) target.x = -2.5;
      if (fish.pos.x < -4.3) target.x = 2.5;
      if (fish.pos.z > 3.1) target.z = -1.5;
      if (fish.pos.z < -5.5) target.z = 0.5;
      if (fish.pos.y > fish.maxY - 0.3) target.y = fish.minY + 0.4;
      if (fish.pos.y < fish.minY + 0.2) target.y = Math.min(fish.maxY - 0.3, fish.pos.y + 0.8);
    }

    const dx = target.x - fish.pos.x;
    const dy = target.y - fish.pos.y;
    const dz = target.z - fish.pos.z;
    const dist = Math.hypot(dx, dy, dz) || 0.0001;
    const targetYaw = Math.atan2(dz, dx);
    const targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
    let yawDelta = Math.atan2(Math.sin(targetYaw - fish.yaw), Math.cos(targetYaw - fish.yaw));
    const yawStep = THREE.MathUtils.clamp(yawDelta, -fish.turn * dt, fish.turn * dt);
    fish.yaw += yawStep;
    const pitchStep = THREE.MathUtils.clamp(
      THREE.MathUtils.clamp(targetPitch, -0.38, 0.42) - fish.pitch,
      -fish.turn * dt,
      fish.turn * dt,
    );
    fish.pitch += pitchStep;
    const bank = THREE.MathUtils.clamp((-yawStep / Math.max(dt, 1e-4)) * 0.22, -0.55, 0.55);
    fish.roll += (bank - fish.roll) * Math.min(1, dt * 3);

    fwd.set(
      Math.cos(fish.pitch) * Math.cos(fish.yaw),
      Math.sin(fish.pitch),
      Math.cos(fish.pitch) * Math.sin(fish.yaw),
    );
    const urgency = THREE.MathUtils.clamp(dist, 0.22, 1);
    fish.pos.addScaledVector(fwd, fish.speed * urgency * dt);

    if (!fish.home) {
      for (let o = 0; o < obstacles.length; o++) {
        const obs = obstacles[o];
        if (fish.pos.y > obs.top) continue;
        const ox = fish.pos.x - obs.x;
        const oz = fish.pos.z - obs.z;
        const d = Math.hypot(ox, oz);
        if (d < obs.r && d > 1e-4) {
          const push = (obs.r - d) / d;
          fish.pos.x += ox * push;
          fish.pos.z += oz * push;
          fish.pos.y += push * 0.2;
        }
      }
    }

    for (let j = 0; j < fishes.length; j++) {
      const other = fishes[j];
      if (other === fish) continue;
      const sx = fish.pos.x - other.pos.x;
      const sy = fish.pos.y - other.pos.y;
      const sz = fish.pos.z - other.pos.z;
      const min = 0.28 + fish.sx * 0.55;
      const d2 = sx * sx + sy * sy + sz * sz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d * 0.65;
        fish.pos.x += sx * push;
        fish.pos.y += sy * push;
        fish.pos.z += sz * push;
      }
    }

    fish.pos.x = THREE.MathUtils.clamp(fish.pos.x, -5.35, 5.35);
    fish.pos.y = THREE.MathUtils.clamp(fish.pos.y, fish.minY, fish.maxY);
    fish.pos.z = THREE.MathUtils.clamp(fish.pos.z, -6.3, 3.9);

    if (!fish.home && !fish.school && dist < 0.45) fish.timer = 0;
  }

  function render(dt) {
    const motion = REDUCE ? 0.28 : 1;
    time += dt * motion;
    for (let i = 0; i < ticking.length; i++) ticking[i].uniforms.uTime.value = time;

    const sway = REDUCE ? 0 : motion;
    pointer.lx += (pointer.x - pointer.lx) * 0.04;
    pointer.ly += (pointer.y - pointer.ly) * 0.04;
    const lookX = Math.sin(time * 0.07) * 0.22 + (REDUCE ? 0 : pointer.lx * 0.55);
    const lookY = 1.95 + Math.sin(time * 0.05) * 0.1 + (REDUCE ? 0 : pointer.ly * -0.28);
    camera.position.x = Math.sin(time * 0.04) * 0.18 + (REDUCE ? 0 : pointer.lx * 0.28);
    camera.position.y = 1.42 + Math.sin(time * 0.06) * 0.04;
    camera.position.z = 6.15;
    camera.lookAt(lookX, lookY, 0.4);

    updateSchool(dt * sway);
    for (let i = 0; i < fishes.length; i++) {
      const fish = fishes[i];
      updateFish(fish, dt * motion);
      fwd.set(
        Math.cos(fish.pitch) * Math.cos(fish.yaw),
        Math.sin(fish.pitch),
        Math.cos(fish.pitch) * Math.sin(fish.yaw),
      );
      qAim.setFromUnitVectors(nose, fwd);
      qRoll.setFromAxisAngle(fwd, fish.roll);
      dummy.position.copy(fish.pos);
      dummy.position.y += Math.sin(time * 1.35 + fish.phase) * fish.bob;
      dummy.quaternion.copy(qRoll).multiply(qAim);
      dummy.scale.set(fish.sx, fish.sy, fish.sz);
      dummy.updateMatrix();
      fishMesh.setMatrixAt(i, dummy.matrix);
    }
    fishMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i];
      b.y += b.speed * dt * motion;
      if (b.y > SURFACE_Y - 0.08) respawnBubble(b, false);
      const fade = b.y > SURFACE_Y - 0.45 ? Math.max(0.15, (SURFACE_Y - b.y) / 0.45) : 1;
      dummy.position.set(
        b.x + Math.sin(time * b.freq + b.phase) * b.amp,
        b.y,
        b.z + Math.cos(time * b.freq * 0.8 + b.phase) * b.amp * 0.7,
      );
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(b.scale * fade);
      dummy.quaternion.identity();
      dummy.updateMatrix();
      bubbleMesh.setMatrixAt(i, dummy.matrix);
    }
    bubbleMesh.instanceMatrix.needsUpdate = true;

    const pos = moteGeo.attributes.position;
    for (let i = 0; i < moteCount; i++) {
      let y = pos.getY(i) + moteSpeed[i] * dt * motion;
      if (y > SURFACE_Y - 0.2) y = 0.15;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(time * 0.2 + i) * 0.002);
    }
    pos.needsUpdate = true;

    renderer.render(scene, camera);
  }

  try {
    render(0.016);
  } catch (err) {
    fail("The tank could not fill");
    console.error(err);
    return;
  }

  const boot = document.getElementById("boot");
  boot.classList.add("is-done");
  document.body.dataset.ready = "1";
  window.setTimeout(() => boot.remove(), 800);

  function frame() {
    raf = 0;
    if (document.hidden) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    render(dt);
    raf = requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !raf) {
      clock.getDelta();
      raf = requestAnimationFrame(frame);
    }
  });
  raf = requestAnimationFrame(frame);
}

main();
