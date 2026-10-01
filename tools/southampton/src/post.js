import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, Effect, EffectAttribute, BlendFunction,
  BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, NoiseEffect,
  SMAAEffect, SMAAPreset, DepthOfFieldEffect, ChromaticAberrationEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { installArchiveFilm } from './archive-film.js';

// Aerial perspective: exponential height fog with a Henyey-Greenstein sun lobe,
// computed from the depth buffer so it applies to every material uniformly.
class AerialHazeEffect extends Effect {
  constructor() {
    super('AerialHaze', /* glsl */`
      uniform mat4 uProjInv;
      uniform mat4 uCamWorld;
      uniform vec3 uCamPos;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uHazeColor;
      uniform float uDensity;
      uniform float uFalloff;
      uniform float uSunScatter;
      uniform float uHorizonBlend;
      uniform float uExposure;

      void mainImage(const in vec4 inputColor0, const in vec2 uv, const in float depth, out vec4 outputColor) {
        vec4 inputColor = vec4(inputColor0.rgb * uExposure, inputColor0.a);
        vec4 vp = uProjInv * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
        vp.xyz /= vp.w;
        vec3 dirV = normalize(vp.xyz);
        vec3 dirW = normalize((uCamWorld * vec4(dirV, 0.0)).xyz);
        float mu = dot(dirW, uSunDir);
        float g = 0.72;
        float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) / (4.0 * PI);
        vec3 inscatter = (uHazeColor + uSunColor * hg * uSunScatter) * uExposure;

        if (depth >= 0.9999999) {
          float hb = exp(-max(dirW.y, 0.0) * 40.0) * uHorizonBlend;
          outputColor = vec4(mix(inputColor.rgb, inscatter, hb), inputColor.a);
          return;
        }
        float viewZ = getViewZ(depth);
        vec3 viewPos = dirV * (viewZ / dirV.z);
        float dist = length(viewPos);
        float k = uFalloff;
        float dy = dirW.y * dist * k;
        float integ = abs(dy) > 1e-4 ? (1.0 - exp(-dy)) / dy : 1.0;
        float od = uDensity * exp(-k * max(uCamPos.y, 0.0)) * dist * integ;
        float T = max(exp(-od), 0.28);
        #ifdef DBG_DIST
          outputColor = vec4(vec3(fract(dist / 100.0), od, 1.0 - T), 1.0); return;
        #endif
        outputColor = vec4(inputColor.rgb * T + inscatter * (1.0 - T), inputColor.a);
      }`, {
      attributes: EffectAttribute.DEPTH,
      defines: new Map(new URLSearchParams(location.search).has('dbgdist') ? [['DBG_DIST', '1']] : []),
      uniforms: new Map([
        ['uProjInv', new THREE.Uniform(new THREE.Matrix4())],
        ['uCamWorld', new THREE.Uniform(new THREE.Matrix4())],
        ['uCamPos', new THREE.Uniform(new THREE.Vector3())],
        ['uSunDir', new THREE.Uniform(new THREE.Vector3(0, 1, 0))],
        ['uSunColor', new THREE.Uniform(new THREE.Color(1, 0.95, 0.85))],
        ['uHazeColor', new THREE.Uniform(new THREE.Color(0.55, 0.62, 0.7))],
        ['uDensity', new THREE.Uniform(0.000045)],
        ['uFalloff', new THREE.Uniform(0.0025)],
        ['uSunScatter', new THREE.Uniform(2.0)],
        ['uHorizonBlend', new THREE.Uniform(0.35)],
        ['uExposure', new THREE.Uniform(1.0)],
      ]),
    });
  }
  sync(camera) {
    this.uniforms.get('uProjInv').value.copy(camera.projectionMatrixInverse);
    this.uniforms.get('uCamWorld').value.copy(camera.matrixWorld);
    this.uniforms.get('uCamPos').value.setFromMatrixPosition(camera.matrixWorld);
  }
}

// Filmic grade in a perceptual space: lift/gamma/gain, split-toning, saturation, S-curve.
class GradeEffect extends Effect {
  constructor() {
    super('Grade', /* glsl */`
      uniform vec3 uLift;
      uniform vec3 uGamma;
      uniform vec3 uGain;
      uniform vec3 uShadowTint;
      uniform vec3 uHighTint;
      uniform float uSat;
      uniform float uContrast;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = pow(max(inputColor.rgb, 0.0), vec3(1.0 / 2.2));
        c = uGain * (c + uLift * (1.0 - c));
        c = pow(max(c, 0.0), 1.0 / uGamma);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c += uShadowTint * (1.0 - smoothstep(0.0, 0.45, l)) + uHighTint * smoothstep(0.55, 1.0, l);
        c = mix(vec3(l), c, uSat);
        c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
        outputColor = vec4(pow(max(c, 0.0), vec3(2.2)), inputColor.a);
      }`, {
      uniforms: new Map([
        ['uLift', new THREE.Uniform(new THREE.Vector3(0.0, 0.002, 0.008))],
        ['uGamma', new THREE.Uniform(new THREE.Vector3(1.0, 1.0, 1.0))],
        ['uGain', new THREE.Uniform(new THREE.Vector3(1.0, 0.99, 0.97))],
        ['uShadowTint', new THREE.Uniform(new THREE.Vector3(-0.004, 0.002, 0.012))],
        ['uHighTint', new THREE.Uniform(new THREE.Vector3(0.012, 0.004, -0.01))],
        ['uSat', new THREE.Uniform(0.86)],
        ['uContrast', new THREE.Uniform(0.16)],
      ]),
    });
  }
}

export function createPost(renderer, scene, camera) {
  const off = new Set((new URLSearchParams(location.search).get('off') || '').split(','));
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));

  const ao = new N8AOPostPass(scene, camera, size.x, size.y);
  Object.assign(ao.configuration, {
    aoRadius: 2.5, distanceFalloff: 0.6, intensity: 2.2, halfRes: true, depthAwareUpsampling: true,
    gammaCorrection: false, aoSamples: 16, denoiseSamples: 8, denoiseRadius: 10,
  });
  ao.configuration.color = new THREE.Color(0.02, 0.025, 0.035);
  if (!off.has('ao')) composer.addPass(ao);

  const haze = new AerialHazeEffect();
  composer.addPass(new EffectPass(camera, haze));
  if (off.has('haze')) haze.uniforms.get('uDensity').value = 0;

  const dof = new DepthOfFieldEffect(camera, { focusDistance: 200, focusRange: 150, bokehScale: 0, resolutionScale: 0.5 });
  const dofPass = new EffectPass(camera, dof);
  dofPass.enabled = false;
  composer.addPass(dofPass);

  const bloom = new BloomEffect({ mipmapBlur: true, intensity: 0.28, luminanceThreshold: 1.25, luminanceSmoothing: 0.3, radius: 0.55, levels: 7 });
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const grade = new GradeEffect();
  composer.addPass(new EffectPass(camera, ...[off.has('bloom') ? null : bloom, tone, off.has('grade') ? null : grade].filter(Boolean)));
  if (off.has('agx')) tone.mode = ToneMappingMode.AGX;

  if (!off.has('smaa')) composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));

  const ca = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.00022, 0.00015), radialModulation: true, modulationOffset: 0.35 });
  const vignette = new VignetteEffect({ offset: 0.3, darkness: 0.55 });
  const grain = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: false });
  grain.blendMode.opacity.value = 0.06;
  if (!off.has('fx')) composer.addPass(new EffectPass(camera, ca, vignette, grain));

  let film = installArchiveFilm(composer, camera);
  let grainBeforeFilm = grain.blendMode.opacity.value;
  if (film) grain.blendMode.opacity.value = 0; // Film owns grain, including repeatable stills.

  function setFilmEnabled(enabled) {
    if (enabled && !film) {
      grainBeforeFilm = grain.blendMode.opacity.value;
      const filmParams = new URLSearchParams(location.search);
      if (!['archive', 'mono', 'colour'].includes(filmParams.get('film'))) filmParams.set('film', 'archive');
      filmParams.set('off', (filmParams.get('off') || '').split(',').filter((name) => name !== 'film').join(','));
      if (!(Number(filmParams.get('filmStrength') ?? 0.9) > 0)) filmParams.delete('filmStrength');
      film = installArchiveFilm(composer, camera, filmParams);
    }
    if (!film) return;
    if (enabled && !film.pass.enabled) grainBeforeFilm = grain.blendMode.opacity.value;
    film.pass.enabled = enabled;
    grain.blendMode.opacity.value = enabled ? 0 : grainBeforeFilm;
    // Disabling the final pass does not automatically hand screen output back
    // to the preceding pass. Keep exactly the last enabled pass on the screen.
    const screenPass = composer.passes.findLast((pass) => pass.enabled);
    for (const pass of composer.passes) pass.renderToScreen = pass === screenPass;
  }

  return {
    composer, ao, haze, dof, dofPass, bloom, tone, grade, vignette, grain, ca,
    get film() { return film; }, setFilmEnabled,
    setSize(w, h) { composer.setSize(w, h); },
    render(dt) { haze.sync(camera); composer.render(dt); },
  };
}
