import * as THREE from 'three';
import { getTextures } from './textures.js';

// Triplanar PBR surface built on MeshStandardMaterial. Texture coordinates come
// from object-space position (the dock frame), so procedural geometry needs no UVs
// and texel density is constant in metres. Adds grime, streaking, ground dirt and
// tidal staining so large flat surfaces never read as CG.

export const sharedUniforms = {
  uTime: { value: 0 },
  uGrimeTex: { value: null },
  // drifting cumulus shadows (projected along the sun direction from ~1100 m)
  uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
  uCloudShadow: { value: 0.72 },
  uCloudCover: { value: 0.42 },
  uCloudWind: { value: new THREE.Vector2(6.5, 4.0) },
};

export function surface(opts = {}) {
  const tex = getTextures();
  sharedUniforms.uGrimeTex.value = tex.grime;
  const set = tex[opts.set || 'concrete'];
  const m = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff,
    roughness: opts.roughness ?? 1,
    metalness: opts.metalness ?? 0,
    side: opts.side ?? THREE.FrontSide,
    envMapIntensity: opts.envMapIntensity ?? 1,
  });
  m.name = opts.name || opts.set;
  const u = {
    tpMap: { value: set.map }, tpNrm: { value: set.normalMap }, tpOrm: { value: set.ormMap },
    uTile: { value: opts.scale ?? 2 },
    uNormalScale: { value: opts.normalScale ?? 1 },
    uGrime: { value: opts.grime ?? 0.4 },
    uStreaks: { value: opts.streaks ?? 0.0 },
    uGroundDirt: { value: opts.groundDirt ?? 0.0 },
    uGroundY: { value: opts.groundY ?? 0 },
    uCavity: { value: opts.cavity ?? 0.6 },
    uHW: { value: opts.highWater ?? 1.0 },
    uOffset: { value: new THREE.Vector3(...(opts.offset || [0, 0, 0])) },
    uVariation: { value: opts.variation ?? 0.25 },
    uMinRough: { value: opts.minRough ?? 0.04 },
    uSpecMul: { value: opts.specular ?? 1.0 },
    uRust: { value: opts.rust ?? 1.0 },
  };
  m.userData.tp = u;
  const defs = [];
  if (opts.swapTop) defs.push('#define TP_SWAP_TOP');
  if (opts.wet) defs.push('#define TP_WET');
  if (opts.instanceLocal) defs.push('#define TP_INSTANCE_LOCAL');
  const ex = opts.extra || {};
  const key = 'tp|' + defs.join('|') + (ex.key || '');
  m.customProgramCacheKey = () => key;

  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u, sharedUniforms, ex.uniforms || {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        ${defs.join('\n')}
        uniform vec3 uOffset;
        varying vec3 vLocalP; varying vec3 vLocalN;
        varying vec3 vVX; varying vec3 vVY; varying vec3 vVZ; varying vec3 vWorldP;
        ${ex.vertexPars || ''}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        ${ex.vertex || ''}
        {
          vec4 lp = vec4(transformed, 1.0);
          vec3 ln = objectNormal;
          mat3 axes = mat3(1.0);
          #ifdef USE_INSTANCING
            #ifdef TP_INSTANCE_LOCAL
              axes = mat3(instanceMatrix);
            #else
              lp = instanceMatrix * lp; ln = mat3(instanceMatrix) * ln;
            #endif
          #endif
          vLocalP = lp.xyz + uOffset; vLocalN = ln;
          #ifdef USE_INSTANCING
            vWorldP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          #else
            vWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;
          #endif
          vVX = normalize(normalMatrix * (axes * vec3(1.0, 0.0, 0.0)));
          vVY = normalize(normalMatrix * (axes * vec3(0.0, 1.0, 0.0)));
          vVZ = normalize(normalMatrix * (axes * vec3(0.0, 0.0, 1.0)));
        }`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${defs.join('\n')}
        uniform sampler2D tpMap; uniform sampler2D tpNrm; uniform sampler2D tpOrm; uniform sampler2D uGrimeTex;
        uniform float uTile; uniform float uNormalScale; uniform float uGrime; uniform float uStreaks;
        uniform float uGroundDirt; uniform float uGroundY; uniform float uCavity; uniform float uHW; uniform float uVariation; uniform float uMinRough; uniform float uSpecMul; uniform float uRust;
        varying vec3 vLocalP; varying vec3 vLocalN;
        varying vec3 vVX; varying vec3 vVY; varying vec3 vVZ; varying vec3 vWorldP;
        uniform vec3 uSunDirW; uniform float uCloudShadow; uniform float uCloudCover; uniform vec2 uCloudWind; uniform float uTime;
        float cloudShadowAt(vec3 wp) {
          vec2 p = wp.xz - uSunDirW.xz / max(uSunDirW.y, 0.15) * (1100.0 - wp.y) - uCloudWind * uTime;
          float n = texture2D(uGrimeTex, p / 9000.0).r * 0.78 + texture2D(uGrimeTex, p / 2300.0 + 0.31).g * 0.22;
          float c = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + 0.2, n);
          return 1.0 - c * uCloudShadow;
        }
        ${ex.fragmentPars || ''}`)
      .replace('#include <map_fragment>', `
        vec3 tpN = normalize(vLocalN) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 tpB = pow(abs(tpN), vec3(6.0)); tpB /= (tpB.x + tpB.y + tpB.z);
        vec3 tpP = vLocalP / uTile;
        vec2 uvX = tpP.zy;
        #ifdef TP_SWAP_TOP
          vec2 uvY = tpP.zx;
        #else
          vec2 uvY = tpP.xz;
        #endif
        vec2 uvZ = tpP.xy;
        vec3 tpAlb = texture2D(tpMap, uvX).rgb * tpB.x + texture2D(tpMap, uvY).rgb * tpB.y + texture2D(tpMap, uvZ).rgb * tpB.z;
        vec3 tpOrmV = texture2D(tpOrm, uvX).rgb * tpB.x + texture2D(tpOrm, uvY).rgb * tpB.y + texture2D(tpOrm, uvZ).rgb * tpB.z;

        vec2 gUV = mix(vec2(vLocalP.x + vLocalP.z, vLocalP.y), vLocalP.xz, tpB.y);
        float gBroad = texture2D(uGrimeTex, gUV / 53.0).r;
        float gMid = texture2D(uGrimeTex, gUV / 11.0).g;
        float gStreak = texture2D(uGrimeTex, vec2((vLocalP.x + vLocalP.z) / 7.0, vLocalP.y / 29.0)).b;

        vec3 base = tpAlb * mix(diffuse, vec3(0.30, 0.15, 0.08), tpOrmV.b * uRust);
        base *= 1.0 - uVariation + 2.0 * uVariation * (gBroad * 0.6 + gMid * 0.4);
        base *= mix(1.0, tpOrmV.g, uCavity);

        float dirt = uGrime * smoothstep(0.42, 0.78, gBroad * 0.65 + gMid * 0.35);
        float streak = uStreaks * (1.0 - tpB.y) * smoothstep(0.45, 0.85, gStreak);
        float ground = uGroundDirt * (1.0 - smoothstep(0.0, 1.6 + gMid, vLocalP.y - uGroundY));
        float grimeAmt = clamp(dirt * 0.55 + streak * 0.5 + ground * 0.6, 0.0, 0.9);
        base = mix(base, base * vec3(0.42, 0.38, 0.33), grimeAmt);
        float tpRoughMul = 1.0 + grimeAmt * 0.25;

        #ifdef TP_WET
          float hw = uHW + (gStreak - 0.5) * 0.5;
          float wet = 1.0 - smoothstep(hw - 0.15, hw + 0.25, vLocalP.y);
          float algae = 1.0 - smoothstep(uHW - 1.6 + gMid, uHW - 0.6 + gMid, vLocalP.y);
          base = mix(base, base * 0.45, wet);
          base = mix(base, vec3(0.035, 0.045, 0.022) * (0.7 + 0.6 * gMid), algae * 0.85);
          float salt = smoothstep(0.05, 0.0, abs(vLocalP.y - (hw + 0.28))) * 0.25 * gMid;
          tpRoughMul *= mix(1.0, 0.35, wet);
        #endif

        ${ex.fragment || ''}
        diffuseColor.rgb = base;
      `)
      .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>
        {
          float cs = cloudShadowAt(vWorldP);
          reflectedLight.directDiffuse *= cs;
          reflectedLight.directSpecular *= cs * uSpecMul;
        }
      `)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = clamp(roughness * tpOrmV.r * tpRoughMul, uMinRough, 1.0);
      `)
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 nX = texture2D(tpNrm, uvX).xyz * 2.0 - 1.0;
          vec3 nY = texture2D(tpNrm, uvY).xyz * 2.0 - 1.0;
          vec3 nZ = texture2D(tpNrm, uvZ).xyz * 2.0 - 1.0;
          float tpFoot = length(fwidth(vLocalP)) / uTile;
          float nFade = 1.0 - smoothstep(0.012, 0.06, tpFoot);
          float ns = uNormalScale * mix(0.12, 1.0, nFade);
          nX.xy *= ns; nY.xy *= ns; nZ.xy *= ns;
          nX = vec3(nX.xy + tpN.zy, abs(nX.z) * tpN.x);
          nZ = vec3(nZ.xy + tpN.xy, abs(nZ.z) * tpN.z);
          #ifdef TP_SWAP_TOP
            nY = vec3(nY.xy + tpN.zx, abs(nY.z) * tpN.y);
            vec3 ln = normalize(nX.zyx * tpB.x + nY.yzx * tpB.y + nZ.xyz * tpB.z);
          #else
            nY = vec3(nY.xy + tpN.xz, abs(nY.z) * tpN.y);
            vec3 ln = normalize(nX.zyx * tpB.x + nY.xzy * tpB.y + nZ.xyz * tpB.z);
          #endif
          normal = normalize(vVX * ln.x + vVY * ln.y + vVZ * ln.z);
        }
      `);
  };
  return m;
}

// Plain painted/untextured material helper.
export function paint(color, roughness = 0.6, metalness = 0, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}
