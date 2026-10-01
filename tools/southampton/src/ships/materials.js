import * as THREE from 'three';
import { surface, sharedUniforms } from '../surface.js';

// Shared ship materials (created once). Painted parts and decks carry per-vertex colours,
// so a ship needs only: hull, paint, funnel, deck, dark, glass, rail + instanced openings.

// Smooth painted steel on the triplanar surface pipeline (keeps grime / cloud shadows) but
// replaces the plate texture with procedural horizontal strake seams, butt seams and faint
// rivet rows — no vertical grain. Soot streaks above `sootY` (funnel tops).
const PAINT_FRAG = /* glsl */ `
{
  vec3 P = vLocalP;
  vec3 Nn = normalize(vLocalN);
  float vert = 1.0 - smoothstep(0.5, 0.9, abs(Nn.y));
  float along = abs(Nn.x) > abs(Nn.z) ? P.z : P.x;
  float fy = fract(P.y / uSeamH); float dy = min(fy, 1.0 - fy) * uSeamH;
  float fx = fract(along / uButt); float dx = min(fx, 1.0 - fx) * uButt;
  float aaY = fwidth(P.y), aaX = fwidth(along);
  float fadeY = 1.0 - smoothstep(0.015, 0.08, aaY), fadeX = 1.0 - smoothstep(0.015, 0.08, aaX);
  float seam = (1.0 - smoothstep(0.004, 0.022 + aaY, dy)) * vert * fadeY;
  float butt = (1.0 - smoothstep(0.004, 0.02 + aaX, dx)) * vert * fadeX * uButtAmt;
  float rp = fract(along / 0.1); float rr = length(vec2(min(rp, 1.0 - rp) * 0.1, dy - 0.055));
  float rivet = (1.0 - smoothstep(0.007, 0.014, rr)) * vert * (1.0 - smoothstep(0.004, 0.012, aaX + aaY));
  float var = 0.93 + 0.14 * (gBroad * 0.6 + gMid * 0.4);
  vec3 b = diffuse * var;
  b *= 1.0 - 0.2 * max(seam, butt);
  b *= 1.0 - 0.12 * rivet;
  float dirt = uGrime * smoothstep(0.52, 0.85, gBroad * 0.65 + gMid * 0.35);
  float rain = uStreaks * vert * smoothstep(0.62, 0.9, texture2D(uGrimeTex, vec2(along / 3.0, P.y / 23.0)).b) * 0.35;
  b = mix(b, b * vec3(0.62, 0.59, 0.54), clamp(dirt * 0.5 + rain, 0.0, 0.6));
  float sootZone = smoothstep(uSootY - 8.0, uSootY - 0.3, P.y);
  float st = texture2D(uGrimeTex, vec2(along / 4.0, P.y / 37.0)).b;
  float soot = sootZone * sootZone * (0.3 + 0.7 * smoothstep(0.3, 0.8, st)) * vert;
  b = mix(b, b * vec3(0.3, 0.28, 0.26), soot * 0.75);
  base = b;
  tpOrmV = vec3(0.78 + 0.1 * gMid + soot * 0.15, 1.0, 0.0);
}`;

export function paintMaterial({ sootY = 1e5, seamH = 1.83, butt = 5.5, buttAmt = 0.7, grime = 0.3, streaks = 0.35, name = 'shipPaint' } = {}) {
  const uniforms = { uSootY: { value: sootY }, uSeamH: { value: seamH }, uButt: { value: butt }, uButtAmt: { value: buttAmt } };
  const m = surface({
    set: 'plate', scale: 3, normalScale: 0.0, roughness: 0.8, grime, streaks, cavity: 0, variation: 0, minRough: 0.45, name,
    extra: { key: 'smoothpaint', uniforms, fragmentPars: 'uniform float uSootY; uniform float uSeamH; uniform float uButt; uniform float uButtAmt;', fragment: PAINT_FRAG },
  });
  m.vertexColors = true;
  m.userData.paint = uniforms;
  m.userData.tp.tpNrm.value = flatNormal();
  return m;
}


// Riveted hull: long horizontal strakes (1.83 m × 9 m) with staggered butts, lapped strake
// edges (shadow under each lap + a faint lit edge, also bent into the normal) and faint rivet
// rows. Kept near-black: high roughness and low env reflection so grazing sun stays narrow.
const HULL_FRAG = /* glsl */ `
{
  vec3 P = vLocalP;
  vec3 Nn = normalize(vLocalN);
  float vert = 1.0 - smoothstep(0.5, 0.9, abs(Nn.y));
  float along = abs(Nn.x) > abs(Nn.z) ? P.z : P.x;
  float sh = 1.83;
  float si = floor(P.y / sh), fy = fract(P.y / sh);
  float dLo = fy * sh, dHi = (1.0 - fy) * sh;
  float aaY = fwidth(P.y), aaX = fwidth(along);
  float fade = (1.0 - smoothstep(0.02, 0.14, aaY)) * vert;
  float lapShadow = 1.0 - smoothstep(0.0, 0.035 + aaY, dHi);
  float lapLight = 1.0 - smoothstep(0.0, 0.025 + aaY, dLo);
  float plen = 9.0, off = mod(si, 2.0) * 4.5;
  float pid = floor((along + off) / plen);
  float fx = fract((along + off) / plen), dx = min(fx, 1.0 - fx) * plen;
  float butt = (1.0 - smoothstep(0.003, 0.012 + aaX, dx)) * (1.0 - smoothstep(0.02, 0.1, aaX));
  float rp = fract(along / 0.11);
  float rr = min(length(vec2(min(rp, 1.0 - rp) * 0.11, dLo - 0.06)), length(vec2(min(rp, 1.0 - rp) * 0.11, dHi - 0.06)));
  float rivet = (1.0 - smoothstep(0.007, 0.013, rr)) * (1.0 - smoothstep(0.003, 0.01, aaX + aaY));
  float h = fract(sin(si * 12.9898 + pid * 78.233) * 43758.5453);
  float var = 0.88 + 0.16 * (gBroad * 0.6 + gMid * 0.4) + 0.08 * (h - 0.5);
  vec3 b = diffuse * var;
  b *= 1.0 - fade * (0.35 * lapShadow + 0.06 * butt + 0.08 * rivet);
  float dirt = uGrime * smoothstep(0.5, 0.85, gBroad * 0.65 + gMid * 0.35);
  float rain = uStreaks * vert * smoothstep(0.6, 0.9, texture2D(uGrimeTex, vec2(along / 3.0, P.y / 17.0)).b);
  b = mix(b, b * vec3(0.85, 0.8, 0.72), clamp(dirt * 0.4 + rain * 0.25, 0.0, 0.5));
  base = b;
  shipBend = fade * (0.55 * lapLight - 0.35 * lapShadow);
  tpOrmV = vec3(1.0, 1.0, 0.0);
}`;

// Deck planking: 0.13 m planks running fore and aft, 6–8 m lengths with staggered butts,
// dark pitch caulking, per-plank tone and fine grain; seams average out with distance.
const DECK_FRAG = /* glsl */ `
{
  vec3 P = vLocalP;
  vec3 Nn = normalize(vLocalN);
  float top = smoothstep(0.5, 0.9, abs(Nn.y));
  float across = top > 0.5 ? P.z : P.y;
  float along = top > 0.5 ? P.x : (abs(Nn.x) > abs(Nn.z) ? P.z : P.x);
  float pw = 0.133;
  float pi = floor(across / pw), fz = fract(across / pw), dz = min(fz, 1.0 - fz) * pw;
  float h1 = fract(sin(pi * 12.9898) * 43758.5453), h2 = fract(sin(pi * 39.3468 + 1.7) * 24634.6345);
  float plen = 6.4 + 1.6 * h2, off = h1 * plen;
  float pid = floor((along + off) / plen);
  float fx = fract((along + off) / plen), dx = min(fx, 1.0 - fx) * plen;
  float aaZ = fwidth(across), aaX = fwidth(along);
  float seam = (1.0 - smoothstep(0.004, 0.009 + aaZ, dz)) * (1.0 - smoothstep(0.01, 0.05, aaZ));
  float butt = (1.0 - smoothstep(0.003, 0.008 + aaX, dx)) * (1.0 - smoothstep(0.01, 0.05, aaX));
  float h3 = fract(sin(pi * 7.13 + pid * 91.7) * 15731.743);
  float grain = texture2D(uGrimeTex, vec2(along / 9.0, across / 0.35 + h1 * 7.0)).g;
  float tone = 0.86 + 0.2 * h3 + 0.14 * (grain - 0.5);
  vec3 b = diffuse * vec3(0.38, 0.36, 0.33) * tone * (0.93 + 0.14 * gBroad);
  // average caulking darkening once individual seams are sub-pixel
  float far = smoothstep(0.01, 0.05, aaZ);
  b *= mix(1.0, 0.9, far);
  b = mix(b, vec3(0.012, 0.010, 0.009), max(seam, butt) * 0.9);
  float dirt = uGrime * smoothstep(0.45, 0.85, gBroad * 0.65 + gMid * 0.35);
  b = mix(b, b * vec3(0.62, 0.58, 0.52), dirt * 0.55);
  base = b;
  tpOrmV = vec3(0.92 + 0.08 * h3, 1.0, 0.0);
}`;

// flat normal map: the procedural materials must not inherit the plate/plank texture's seams
let FLAT = null;
function flatNormal() {
  if (!FLAT) { FLAT = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat); FLAT.needsUpdate = true; }
  return FLAT;
}
function proceduralSurface(opts, frag, key, bendAmt = 0) {
  const m = surface({
    ...opts,
    extra: { key, uniforms: {}, fragmentPars: 'float shipBend = 0.0; float shipAlong = 0.0;', fragment: frag },
  });
  m.userData.tp.tpNrm.value = flatNormal();
  m.vertexColors = true;
  if (bendAmt || opts.specGain) {
    const orig = m.onBeforeCompile;
    const g = opts.specGain ?? 1, ge = opts.envGain ?? g * 0.6;
    m.onBeforeCompile = (sh, r) => {
      orig(sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', `
        normal = normalize(normal + vVY * shipBend * ${bendAmt.toFixed(3)} + vVX * shipAlong * ${bendAmt.toFixed(3)});
        #include <lights_fragment_begin>`).replace('#include <aomap_fragment>', `
        reflectedLight.indirectSpecular *= ${ge.toFixed(3)} * mix(${(opts.grazeEnv ?? 1).toFixed(3)}, 1.0, smoothstep(0.0, 0.6, saturate(dot(geometryNormal, geometryViewDir))));
        reflectedLight.directSpecular *= ${g.toFixed(3)};
        reflectedLight.directDiffuse *= ${(opts.sunDiffuse ?? 1).toFixed(3)};
        ${opts.neutralSky != null ? `
        reflectedLight.indirectSpecular = mix(vec3(dot(reflectedLight.indirectSpecular, vec3(0.3333))), reflectedLight.indirectSpecular, ${opts.neutralSky.toFixed(2)});
        reflectedLight.indirectDiffuse = mix(vec3(dot(reflectedLight.indirectDiffuse, vec3(0.3333))), reflectedLight.indirectDiffuse, ${opts.neutralSky.toFixed(2)}) * vec3(1.03, 1.0, 0.95);` : ''}
        #include <aomap_fragment>`);
    };
    const key = m.customProgramCacheKey();
    m.customProgramCacheKey = () => key + '|spec' + g + '|' + ge + '|' + (opts.grazeEnv ?? 1) + '|' + (opts.sunDiffuse ?? 1) + '|' + opts.neutralSky;
  }
  return m;
}

// dark glazing: weak, desaturated reflection of the sky (never blue panels)
function glazing({ color, roughness, env, sat = 0.2, gain = 1, name, side = THREE.FrontSide, vertexColors = false }) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, envMapIntensity: env, side, vertexColors, name });
  m.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', `
      outgoingLight = mix(vec3(dot(outgoingLight, vec3(0.3, 0.55, 0.15))), outgoingLight, ${sat.toFixed(2)}) * ${gain.toFixed(2)};
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'shipGlazing' + sat + '|' + gain;
  return m;
}

let MATS = null;
export function shipMats() {
  if (MATS) return MATS;
  const vc = (m) => { m.vertexColors = true; return m; };
  MATS = {
    hull: proceduralSurface({ set: 'plate', scale: 4, normalScale: 0.0, roughness: 0.6, envMapIntensity: 0.75, grime: 0.22, streaks: 0.45, cavity: 0, variation: 0, minRough: 0.55, specGain: 0.3, envGain: 0.55, grazeEnv: 0.15, sunDiffuse: 0.28, neutralSky: 0.1, name: 'shipHull' }, HULL_FRAG, 'shiphull', 0.9),
    paint: paintMaterial(),
    funnel: paintMaterial({ sootY: 1e5, name: 'shipFunnel' }), // per-ship clones via funnelMaterial()
    deck: proceduralSurface({ set: 'planks', scale: 1.7, normalScale: 0.0, roughness: 0.92, envMapIntensity: 0.6, grime: 0.42, streaks: 0.0, cavity: 0, variation: 0, minRough: 0.7, name: 'shipDeck' }, DECK_FRAG, 'shipdeck'),
    dark: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92, side: THREE.DoubleSide, name: 'shipDark' }),
    glass: glazing({ color: 0xffffff, roughness: 0.38, env: 0.55, sat: 0.3, side: THREE.DoubleSide, vertexColors: true, name: 'shipGlass' }),
    window: glazing({ color: 0x08090a, roughness: 0.3, env: 0.25, sat: 0.15, gain: 0.28, name: 'shipWindow' }),
    rim: glazing({ color: 0x2a2217, roughness: 0.8, env: 0.2, sat: 0.6, gain: 0.45, name: 'shipRim' }),
    frame: new THREE.MeshStandardMaterial({ color: 0x26231f, roughness: 0.7, name: 'shipFrame' }),
    opening: new THREE.MeshStandardMaterial({ color: 0x0a0907, roughness: 0.95, name: 'shipOpening' }),
    rail: railMaterial(),
    void: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, name: 'shipVoid' }),
    rope: ropeMaterial({ radius: 0.03, name: 'shipRope' }),
    domeGlass: glazing({ color: 0xffffff, roughness: 0.85, env: 0.2, sat: 0.3, gain: 0.35, side: THREE.DoubleSide, vertexColors: true, name: 'shipDomeGlass' }),
  };
  return MATS;
}

// The Olympic-class hero ship is judged at quay height. Keep these surfaces separate
// from the tug material library: restoring the liner's bounced light must not change
// the small craft's varnished wood or near-black working hulls.
let LINER_MATS = null;
export function linerMats() {
  if (LINER_MATS) return LINER_MATS;
  const hullFrag = HULL_FRAG
    .replace('float var = 0.88 + 0.16 * (gBroad * 0.6 + gMid * 0.4) + 0.08 * (h - 0.5);',
      'float var = 0.86 + 0.12 * (gBroad * 0.6 + gMid * 0.4) + 0.18 * (h - 0.5);')
    // Filtering the seam itself already handles sub-pixel coverage. The old
    // 0.14 m cutoff erased all plating from both low camera positions.
    .replace('smoothstep(0.02, 0.14, aaY)', 'smoothstep(0.18, 0.85, aaY)')
    .replace('shipBend = fade * (0.55 * lapLight - 0.35 * lapShadow);', `
      // Millimetre-scale steel sheet dishing, not corrugated iron. Broad highlights
      // change gently from plate to plate; the lap edges remain the sharper feature.
      float dish = sin(fx * 6.28318) * cos(fy * 3.14159) * 0.027;
      shipAlong = vert * cos(fx * 6.28318) * sin(fy * 3.14159) * 0.019;
      shipBend = vert * dish + fade * (0.10 * lapLight - 0.08 * lapShadow);
      // Scrubbed black paint has directional fine texture and uneven gloss,
      // even on a new liner. It averages out once finer than a screen pixel.
      float brushFade = 1.0 - smoothstep(0.025, 0.22, max(aaX, aaY));
      float brush = texture2D(uGrimeTex, vec2(along / 0.32, P.y / 7.5)).g;
      base *= 1.0 + (brush - 0.5) * 0.045 * brushFade;
      float wet = 1.0 - smoothstep(0.12, 0.7, P.y);
      base *= 1.0 - 0.18 * wet;
    `)
    .replace('tpOrmV = vec3(1.0, 1.0, 0.0);', 'tpOrmV = vec3(0.86 + 0.16 * h + 0.075 * (brush - 0.5) * brushFade - 0.22 * (1.0 - smoothstep(0.12, 0.7, P.y)), 1.0, 0.0);');
  const deckFrag = DECK_FRAG.replace('diffuse * vec3(0.38, 0.36, 0.33)', 'diffuse * vec3(0.93, 0.87, 0.77)');
  LINER_MATS = {
    ...shipMats(),
    hull: proceduralSurface({ set: 'plate', scale: 4, normalScale: 0, roughness: 0.67,
      envMapIntensity: 0.8, grime: 0.16, streaks: 0.24, cavity: 0, variation: 0,
      minRough: 0.45, specGain: 0.8, envGain: 0.8, grazeEnv: 0.75,
      sunDiffuse: 1.0, neutralSky: 0.65, name: 'linerRivetedShell' }, hullFrag, 'linerHullPBR', 0.7),
    paint: paintMaterial({ grime: 0.12, streaks: 0.14, name: 'linerPaintedSteel' }),
    deck: proceduralSurface({ set: 'planks', scale: 1.7, normalScale: 0,
      roughness: 0.82, envMapIntensity: 0.6, grime: 0.18, streaks: 0, cavity: 0,
      variation: 0, minRough: 0.6, name: 'linerScrubbedDeck' }, deckFrag, 'linerDeckPBR'),
    window: glazing({ color: 0x111918, roughness: 0.19, env: 0.7, sat: 0.5,
      gain: 0.7, name: 'linerRecessedGlazing' }),
    rim: new THREE.MeshStandardMaterial({ color: 0x665740, roughness: 0.42,
      metalness: 0.65, name: 'linerBronzePortRim' }),
    frame: new THREE.MeshStandardMaterial({ color: 0xb8b4a8, roughness: 0.65,
      name: 'linerWindowMullion' }),
    metal: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true,
      roughness: 0.48, metalness: 0.55, name: 'linerMachinedIron' }),
  };
  return LINER_MATS;
}

const funnelMats = new Map();
export function funnelMaterial(sootY) {
  const k = Math.round(sootY * 2) / 2;
  if (!funnelMats.has(k)) funnelMats.set(k, paintMaterial({ sootY: k, seamH: 1.83, butt: 3.2, buttAmt: 0.12, grime: 0.18, streaks: 0.15, name: 'shipFunnel' }));
  return funnelMats.get(k);
}

// Flags: canvas atlas + gentle wave in the vertex shader (aFlag = [u along fly 0..1, flag length m, phase])
export function flagMaterial(atlas) {
  const m = new THREE.MeshStandardMaterial({ map: atlas, side: THREE.DoubleSide, roughness: 0.85, alphaTest: 0.5, name: 'shipFlag' });
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = sharedUniforms.uTime;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aFlag; uniform float uTime;')
      .replace('#include <beginnormal_vertex>', `
        float fu = aFlag.x, fl = aFlag.y, ph = aFlag.z;
        float k = 6.2831 / max(fl * 0.9, 0.5);
        float amp = 0.07 * fl * fu;
        float wv = sin(fu * fl * k - uTime * 3.1 + ph) + 0.35 * sin(fu * fl * k * 2.3 - uTime * 5.3 + ph * 1.7);
        float dwv = amp * k * cos(fu * fl * k - uTime * 3.1 + ph);
        vec3 objectNormal = normalize(vec3(-dwv * 0.8, 0.0, 1.0));
        #ifdef USE_TANGENT
          vec3 objectTangent = vec3(1.0, 0.0, 0.0);
        #endif`)
      .replace('#include <begin_vertex>', `
        vec3 transformed = vec3(position);
        transformed.z += amp * wv;
        transformed.y -= 0.06 * fl * fu * fu;`);
  };
  m.customProgramCacheKey = () => 'shipFlag';
  return m;
}

function railMaterial() {
  // one 1.8 m tile: top rail, two intermediate wires, one stanchion
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 256, 9); g.fillRect(0, 27, 256, 4); g.fillRect(0, 45, 256, 4);
  g.fillRect(0, 0, 10, 64); g.fillRect(128, 0, 6, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, alphaMap: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.65, name: 'shipRail' });
}

// Thin wires and ropes: the vertex shader pushes the tube surface out so the rope never gets
// thinner than ~0.9 px on screen (no dashed rigging at distance). `radius` = modelled radius.
const VIEW_H = { value: 1080 };
const _sz = new THREE.Vector2();
export function ropeMaterial({ radius = 0.03, color = 0xffffff, vertexColors = true, roughness = 0.9, metalness = 0, name = 'rope', minPx = 0.9 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, vertexColors, roughness, metalness, name });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uViewH = VIEW_H;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uViewH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 mvpR = modelViewMatrix * vec4(transformed, 1.0);
          float distR = max(-mvpR.z, 0.1);
          float pxR = 2.0 / (projectionMatrix[1][1] * uViewH);
          transformed += normalize(objectNormal) * max(0.0, ${(minPx / 2).toFixed(3)} * pxR * distR - ${radius.toFixed(3)});
        }`);
  };
  m.customProgramCacheKey = () => 'shipRope' + radius + minPx;
  m.userData.isRope = true;
  return m;
}
// keep the rope shader's viewport height current (call from a rope mesh's onBeforeRender)
export function ropeBeforeRender(renderer) {
  const t = renderer.getRenderTarget();
  VIEW_H.value = t ? t.height : renderer.getDrawingBufferSize(_sz).y;
}
