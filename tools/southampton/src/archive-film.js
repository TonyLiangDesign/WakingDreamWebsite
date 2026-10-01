import { Uniform, Vector2 } from 'three';
import { BlendFunction, Effect, EffectAttribute, EffectPass } from 'postprocessing';

// Owns only the final image. Keep ship, quay, lighting and camera files independent.
// Opt-in: &film=archive (warm monochrome), &film=mono, or &film=colour.
// &filmStrength=0..1 controls the blend; &off=film or &film=off bypasses it.
// &filmGrain=0..2 independently controls fine grain (default 0.65; 0 removes it).
// &still=100 freezes film damage at that time as well as freezing the scene.
// Offline callers can seek effect.setTime(seconds) before rendering a frame.
export function readFilmOptions(params) {
  const mode = (params.get('film') || '').toLowerCase();
  const off = (params.get('off') || '').split(',');
  const requested = Number(params.get('filmStrength') ?? 0.9);
  const strength = Number.isFinite(requested) ? Math.min(1, Math.max(0, requested)) : 0.9;
  const requestedGrain = Number(params.get('filmGrain') ?? 0.65);
  const grain = Number.isFinite(requestedGrain) ? Math.min(2, Math.max(0, requestedGrain)) : 0.65;
  const still = Number(params.get('still'));
  return {
    mode,
    enabled: ['archive', 'mono', 'colour'].includes(mode) && !off.includes('film') && strength > 0,
    strength,
    grain,
    frozen: params.has('still'),
    time: Number.isFinite(still) ? Math.max(0, still) : 0,
  };
}

const fragment = /* glsl */`
  uniform vec2 uFilmSize;
  uniform float uFilmFrame;
  uniform float uFilmColour;
  uniform float uFilmWarmth;
  uniform float uFilmGrain;

  float filmHash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Polynomial hash avoids the directional patterns of the old sine-based grain.
  float grainHash(vec2 p) {
    vec3 q = fract(vec3(p.xyx) * 0.1031);
    q += dot(q, q.yzx + 33.33);
    return fract((q.x + q.y) * q.z);
  }
  float grainNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(grainHash(i), grainHash(i + vec2(1.0, 0.0)), f.x),
      mix(grainHash(i + vec2(0.0, 1.0)), grainHash(i + vec2(1.0)), f.x), f.y);
  }

  // Work in display values after the existing tone map, then return linear RGB.
  // Texture taps remain linear even when a pass converts its main input colour.
  vec3 filmDisplay(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055,
      step(vec3(0.0031308), c));
  }
  vec3 filmLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
  }
  vec3 filmRead(vec2 uv) {
    return texture2D(inputBuffer, clamp(uv, 0.5 / uFilmSize, 1.0 - 0.5 / uFilmSize)).rgb;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float frame = uFilmFrame;
    float aspectFilm = uFilmSize.x / max(uFilmSize.y, 1.0);
    // Equivalent to a soft 540-line transfer; no digital scanlines or VHS tearing.
    vec2 transferSize = vec2(540.0 * aspectFilm, 540.0);
    vec2 cell = 1.0 / transferSize;
    vec2 weave = vec2(filmHash(vec2(frame, 7.0)), filmHash(vec2(frame, 19.0))) - 0.5;
    vec2 p = uv + weave * cell * 0.65;
    vec2 sampled = (floor(p * transferSize) + 0.5) / transferSize;
    p = mix(p, sampled, 0.35);
    // Cross-shaped optical softness, plus a broad tap for gentle highlight bleed.
    vec3 c = filmRead(p) * 0.40;
    c += filmRead(p + vec2(cell.x, 0.0)) * 0.15;
    c += filmRead(p - vec2(cell.x, 0.0)) * 0.15;
    c += filmRead(p + vec2(0.0, cell.y)) * 0.15;
    c += filmRead(p - vec2(0.0, cell.y)) * 0.15;
    vec3 halo = filmRead(p + cell * 2.8) + filmRead(p - cell * 2.8);
    c = filmDisplay(c + max(halo * 0.5 - 0.48, 0.0) * 0.055);

    float luma = dot(c, vec3(0.30, 0.59, 0.11));
    c = mix(vec3(luma), c, uFilmColour);
    // A print-like toe and shoulder: retain real blacks instead of adding a grey veil.
    c += 0.009 * (1.0 - smoothstep(vec3(0.0), vec3(0.24), c));
    c -= 0.038 * smoothstep(vec3(0.62), vec3(1.0), c);
    // Warmth is concentrated in the highlights, leaving the hull nearly neutral.
    float paper = smoothstep(0.25, 0.85, luma) * uFilmWarmth;
    c *= mix(vec3(1.0), vec3(1.018, 1.003, 0.976), paper);
    c *= 1.0 + (filmHash(vec2(frame, 37.0)) - 0.5) * 0.028;

    // Filtered, irregular grains. Midtones carry the texture; blacks and whites stay clean.
    float grainHeight = min(uFilmSize.y, 900.0);
    vec2 grainPos = uv * vec2(grainHeight * aspectFilm, grainHeight);
    vec2 grainSeed = vec2(mod(frame, 4096.0) * 13.17, mod(frame, 4096.0) * 7.31);
    float fine = grainNoise(grainPos + grainSeed) - 0.5;
    float clump = grainNoise(grainPos * 0.57 + grainSeed.yx + 47.0) - 0.5;
    float grain = fine * 0.88 + clump * 0.12;
    float grainResponse = smoothstep(0.04, 0.26, luma) * (1.0 - smoothstep(0.72, 0.98, luma));
    c += grain * 0.040 * uFilmGrain * (0.20 + 0.80 * grainResponse);

    // Rare short dust flecks and intermittent hairline scratches, not a fixed overlay.
    float damageFrame = floor(frame / 4.0);
    vec2 dustGrid = uv * vec2(42.0 * aspectFilm, 42.0);
    vec2 dustTile = floor(dustGrid);
    float dustSeed = filmHash(dustTile + damageFrame * 23.0);
    vec2 dustPos = vec2(filmHash(dustTile + damageFrame), filmHash(dustTile + damageFrame + 91.0));
    vec2 dustDelta = (fract(dustGrid) - dustPos) * vec2(aspectFilm, 1.0);
    float dust = (1.0 - smoothstep(0.015, 0.065, length(dustDelta))) * step(0.996, dustSeed);
    c -= dust * 0.20;
    float scratchEpoch = floor(frame / 18.0);
    float scratchX = filmHash(vec2(scratchEpoch, 53.0));
    float scratch = (1.0 - smoothstep(0.25, 1.1, abs(uv.x - scratchX) * uFilmSize.x));
    scratch *= step(0.78, filmHash(vec2(scratchEpoch, 29.0)));
    scratch *= smoothstep(0.15, 0.3, uv.y) * (1.0 - smoothstep(0.72, 0.9, uv.y));
    c += scratch * 0.08;

    vec2 edge = (uv - 0.5) * 2.0;
    float vignetteFilm = smoothstep(0.35, 1.35, dot(edge, edge));
    c *= 1.0 - vignetteFilm * 0.22;
    outputColor = vec4(filmLinear(clamp(c, 0.0, 1.0)), inputColor.a);
  }
`;

export class ArchiveFilmEffect extends Effect {
  constructor(options) {
    super('ArchiveFilm', fragment, {
      attributes: EffectAttribute.CONVOLUTION,
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([
        ['uFilmSize', new Uniform(new Vector2(1, 1))],
        ['uFilmFrame', new Uniform(Math.floor(options.time * 18))],
        ['uFilmColour', new Uniform(options.mode === 'colour' ? 0.52 : 0)],
        ['uFilmWarmth', new Uniform(options.mode === 'mono' ? 0 : 1)],
        ['uFilmGrain', new Uniform(options.grain ?? 0.65)],
      ]),
    });
    this.mode = options.mode;
    this.frozen = options.frozen;
    this.elapsed = options.time;
    this.blendMode.opacity.value = options.strength;
  }

  setSize(width, height) {
    this.uniforms.get('uFilmSize').value.set(Math.max(1, width), Math.max(1, height));
  }

  setTime(seconds) {
    this.elapsed = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    this.uniforms.get('uFilmFrame').value = Math.floor(this.elapsed * 18);
  }

  update(renderer, inputBuffer, deltaTime) {
    if (!this.frozen && Number.isFinite(deltaTime) && deltaTime > 0) this.setTime(this.elapsed + deltaTime);
  }
}

export function installArchiveFilm(composer, camera, params = new URLSearchParams(location.search)) {
  const options = readFilmOptions(params);
  if (!options.enabled) return null; // Original links add no GPU pass or film allocation.
  const effect = new ArchiveFilmEffect(options);
  const pass = new EffectPass(camera, effect);
  composer.addPass(pass);
  return { effect, pass, options };
}
