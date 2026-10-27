import * as THREE from 'three';

// What the boat needs from the sea before the sea itself is loaded (sea.js, fetched the first time
// the water shows): the sun's direction, the water colour, and the wet-hull patch every boat
// material carries from the start, so the studio and the water share one set of shader programs.

export const SUN_DIR = new THREE.Vector3(-0.62, 0.17, 0.77).normalize();
export const WL_STATIONS = 16;
export const DEEP = new THREE.Color('#0d2b37');

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
