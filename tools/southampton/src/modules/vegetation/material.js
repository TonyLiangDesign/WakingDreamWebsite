import * as THREE from 'three';

// Foliage / bare-crown material: MeshStandardMaterial with vertex AO × instance tint and:
//  - crown (aCrown/aShell attributes): per-pixel ellipsoid normals about the crown centre and
//    soft self-shadowing (underside / silhouette), so low-poly crowns shade as soft volumes;
//  - holes > 0: "airy" April crowns — the outer shell and underside are dissolved with world-space
//    twig-cluster noise (alpha-tested, double-sided, dark interior + limbs visible through the
//    gaps), with dark twig rims around each gap. Fades to a solid crown as the pixel footprint
//    grows, so there is no shimmer at altitude;
//  - field > 0: far woods — a world-space pattern of individual crowns (lit domes, dark gaps,
//    per-crown tint) on the upward faces of big woodland clumps, fading to the mean with distance.
const NOISE = /* glsl */`
  float vegH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vegN(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(vegH(i), vegH(i + vec3(1,0,0)), f.x), mix(vegH(i + vec3(0,1,0)), vegH(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(vegH(i + vec3(0,0,1)), vegH(i + vec3(1,0,1)), f.x), mix(vegH(i + vec3(0,1,1)), vegH(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float vegH2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }`;

export function vegMaterial({ name = 'veg', speckle = 0.55, scale = 0.45, roughness = 1, lift = 0.12, side = THREE.FrontSide, bright = 0.7, holes = 0, crown = false, self = 1, field = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(bright, bright, bright), roughness, metalness: 0, vertexColors: true, side: holes > 0 ? THREE.DoubleSide : side, envMapIntensity: crown ? 0.9 : 0.7 });
  if (holes > 0) m.shadowSide = THREE.FrontSide;
  m.name = name;
  const defs = [crown ? '#define VEG_CROWN' : '', holes > 0 ? '#define VEG_HOLES' : '', field > 0 ? '#define VEG_FIELD' : ''].join('\n');
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      uSpeckle: { value: speckle }, uNScale: { value: scale }, uLift: { value: lift }, uHoles: { value: holes },
      uSelf: { value: self }, uCellF: { value: field },
    });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        ${defs}
        varying vec3 vVegW; varying float vVegUp;
        #ifdef VEG_CROWN
          attribute vec4 aCrown; attribute float aShell; varying vec4 vCrown; varying float vShell;
        #endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 vw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            vw = instanceMatrix * vw;
          #endif
          vw = modelMatrix * vw;
          vVegW = vw.xyz;
          vVegUp = normalize(objectNormal).y;
          #ifdef VEG_CROWN
            vec3 cOff = position - aCrown.xyz;
            #ifdef USE_INSTANCING
              cOff = mat3(instanceMatrix) * cOff;
            #endif
            vCrown = vec4(mat3(modelMatrix) * cOff, aCrown.w);
            vShell = aShell;
          #endif
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${defs}
        uniform float uSpeckle; uniform float uNScale; uniform float uLift; uniform float uHoles; uniform float uSelf; uniform float uCellF;
        varying vec3 vVegW; varying float vVegUp;
        #ifdef VEG_CROWN
          varying vec4 vCrown; varying float vShell;
        #endif
        ${NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float vegFw = length(fwidth(vVegW));
        vec3 vegToCam = vVegW - cameraPosition;
        float vegPx = length(fwidth(normalize(vegToCam))) * length(vegToCam); // metres per pixel, independent of surface slope
        #ifdef VEG_HOLES
          float vegAiry = 0.0, vegTwig = 1.0;
          if (vCrown.w > 0.01) {
            vec3 cdA = normalize(vCrown.xyz + vec3(0.0, 1e-3, 0.0));
            vec3 vdA = normalize(cameraPosition - vVegW);
            float fineK = 1.0 - smoothstep(0.05, 0.16, vegPx);
            float nearK = 1.0 - smoothstep(0.14, 0.4, vegPx);
            // twig lace: thin ridged-noise lines at two scales plus twig-cluster blobs; toward the
            // silhouette (smooth bent vertex normal ⟂ view) and underside only the lace survives
            float r1 = smoothstep(0.7, 0.95, 1.0 - abs(2.0 * vegN(vVegW * 0.8 + 3.1) - 1.0));
            float r2 = smoothstep(0.74, 0.96, 1.0 - abs(2.0 * vegN(vVegW * 2.1 - 4.2) - 1.0));
            float cl = smoothstep(0.3, 0.7, vegN(vVegW * 0.45 + 8.7) * 0.7 + vegN(vVegW * 1.3) * 0.3);
            float net = max(r1, r2 * fineK);
            vegTwig = max(net, cl * 0.62);
            float rimC = 1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition)));
            float under = smoothstep(-0.1, -0.8, cdA.y);
            vegAiry = uHoles * nearK * clamp(smoothstep(0.4, 0.92, rimC) * 0.9 + under * 0.5, 0.0, 0.92);
            if (vegTwig < vegAiry) discard;
          }
        #endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 p = vVegW * uNScale;
          float n1 = vegN(p), n2 = vegN(p * 2.3 + 7.1);
          float a1 = 1.0 - smoothstep(0.28, 0.9, vegFw);
          float a2 = 1.0 - smoothstep(0.12, 0.45, vegFw);
          float sp = (n1 - 0.5) * a1 + (n2 - 0.5) * 0.7 * a2;
          float nc = vegN(vVegW * 0.33 + 11.0);
          float ac = 1.0 - smoothstep(0.8, 2.5, vegFw);
          #ifdef VEG_CROWN
            diffuseColor.rgb *= mix(1.0, mix(0.86, 1.08, nc), ac * uSpeckle);
          #else
            diffuseColor.rgb *= mix(1.0, mix(0.5, 1.15, smoothstep(0.3, 0.62, nc)), ac * uSpeckle);
          #endif
          diffuseColor.rgb *= clamp(1.0 + sp * 2.0 * uSpeckle, 0.25, 1.6);
          diffuseColor.rgb *= 1.0 + uLift * vVegUp;
          #ifdef VEG_HOLES
            // twigs: dark rims around every gap, lighter twig tips; the crown interior is dark
            float rimT = smoothstep(vegAiry, vegAiry + 0.22, vegTwig);
            diffuseColor.rgb *= mix(1.0, mix(0.55, 1.05, rimT), smoothstep(0.08, 0.45, vegAiry));
            if (!gl_FrontFacing) diffuseColor.rgb *= 0.55;
          #endif
          #ifdef VEG_CROWN
            vec3 cdir = normalize(vCrown.xyz + vec3(0.0, 1e-3, 0.0));
            vec3 vdir = normalize(cameraPosition - vVegW);
            float rim = abs(dot(cdir, vdir));
            float selfSh = mix(0.78, 1.08, smoothstep(-0.7, 0.6, cdir.y)) * mix(0.8, 1.0, smoothstep(0.05, 0.55, rim));
            diffuseColor.rgb *= mix(1.0, selfSh, vCrown.w * uSelf);
          #endif
          #ifdef VEG_FIELD
            // individual crowns across the top of a far woodland clump
            vec2 fp = vVegW.xz / uCellF;
            vec2 fc = floor(fp);
            float fq = 0.0, fid = 0.0; vec2 fd = vec2(0.0);
            for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
              vec2 c = fc + vec2(float(i), float(j));
              vec2 d = fp - (c + 0.15 + 0.7 * vec2(vegH2(c), vegH2(c + 19.19)));
              float r = 0.62 + 0.3 * vegH2(c + 3.7);
              float q = 1.0 - dot(d, d) / (r * r);
              if (q > fq) { fq = q; fid = vegH2(c + 5.3); fd = d / r; }
            }
            float fDet = (1.0 - smoothstep(0.08, 0.4, length(fwidth(fp)))) * smoothstep(0.1, 0.55, vVegUp);
            vec3 fTint = mix(vec3(1.0), fid < 0.12 ? vec3(0.95, 1.12, 0.8) : fid < 0.3 ? vec3(0.96, 1.02, 0.92) : vec3(1.0 + 0.2 * (fid - 0.65)), 1.0);
            float fAO = mix(0.3, 1.12, smoothstep(0.0, 0.75, fq));
            diffuseColor.rgb *= mix(vec3(0.9), fTint * fAO, fDet);
          #endif
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef VEG_CROWN
        if (vCrown.w > 0.01) {
          vec3 cd = normalize(vCrown.xyz * vec3(1.0, 1.4, 1.0) + vec3(0.0, 1e-3, 0.0));
          float kC = 1.0 - smoothstep(0.6, 2.5, vegFw);
          vec3 bump = vec3(vegN(vVegW * 0.35 + 1.7), vegN(vVegW * 0.35 + 9.2), vegN(vVegW * 0.35 + 5.1)) - 0.5;
          cd = normalize(cd + bump * 0.45 * kC);
          vec3 cv = normalize((viewMatrix * vec4(cd, 0.0)).xyz);
          if (!gl_FrontFacing) cv = -cv;
          normal = normalize(mix(normal, cv, vCrown.w));
        }
        #endif
        #ifdef VEG_FIELD
        {
          float fk = (1.0 - smoothstep(0.08, 0.4, length(fwidth(vVegW.xz / uCellF)))) * smoothstep(0.1, 0.55, vVegUp);
          vec2 fp2 = vVegW.xz / uCellF; vec2 fc2 = floor(fp2); float bq = 0.0; vec2 bd = vec2(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 c = fc2 + vec2(float(i), float(j));
            vec2 d = fp2 - (c + 0.15 + 0.7 * vec2(vegH2(c), vegH2(c + 19.19)));
            float r = 0.62 + 0.3 * vegH2(c + 3.7);
            float q = 1.0 - dot(d, d) / (r * r);
            if (q > bq) { bq = q; bd = d / r; }
          }
          vec3 dn = normalize(vec3(bd.x, 0.8, bd.y));
          vec3 dv = normalize((viewMatrix * vec4(dn, 0.0)).xyz);
          vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          normal = normalize(normal + (dv - up) * fk);
        }
        #endif`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.specularColor *= 0.25; material.specularColorBlended *= 0.25; material.specularF90 = 0.25;`);
  };
  m.customProgramCacheKey = () => 'veg15' + (crown ? 'c' : '') + (holes > 0 ? 'h' : '') + (field > 0 ? 'f' : '');
  return m;
}
