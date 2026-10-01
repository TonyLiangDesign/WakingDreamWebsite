import * as THREE from 'three';
import { surface } from '../surface.js';
import { shipMats } from './materials.js';

// Tug finishes are deliberately independent of the liners. These little working
// vessels need readable wood and tarred rope at quay distance, rather than the
// much larger plate scale of an ocean liner. All coordinates below are metres.
const STEEL = /* glsl */ `{
  float side = 1.0 - smoothstep(0.45, 0.85, abs(vLocalN.y));
  float along = vLocalP.x + vLocalP.z * 0.12;
  float row = floor(vLocalP.y / 0.82);
  float fy = fract(vLocalP.y / 0.82);
  float dy = min(fy, 1.0 - fy) * 0.82;
  float fx = fract((along + mod(row, 2.0) * 1.75) / 3.5);
  float dx = min(fx, 1.0 - fx) * 3.5;
  float aa = max(fwidth(along), fwidth(vLocalP.y));
  float seam = (1.0 - smoothstep(0.002, 0.006 + aa, dy)) * side;
  float butt = (1.0 - smoothstep(0.002, 0.006 + aa, dx)) * side;
  float rip = fract(along / 0.13);
  float rivDist = length(vec2(min(rip, 1.0 - rip) * 0.13, dy - 0.04));
  float riv = (1.0 - smoothstep(0.005, 0.010 + aa, rivDist)) * (1.0 - smoothstep(0.004, 0.025, aa)) * side;
  float run = texture2D(uGrimeTex, vec2(along / 1.8, vLocalP.y / 16.0)).b;
  float rust = smoothstep(0.72, 0.90, run) * (0.12 + seam * 0.3) * side;
  float wet = 1.0 - smoothstep(0.16, 0.62, vLocalP.y);
  base = diffuse * (0.84 + 0.22 * gBroad + 0.06 * gMid);
  base *= 1.0 - seam * 0.14 - butt * 0.045 - riv * 0.09;
  base = mix(base, base * vec3(1.32, 0.70, 0.39), rust);
  base *= mix(1.0, 0.78, wet);
  vec2 micro = texture2D(uGrimeTex, vec2(along / 1.9, vLocalP.y / 1.7)).rg - 0.5;
  tugMicro = vec3(micro.x * 0.022, micro.y * 0.032, 0.0) * side;
  tugMicro.y += sin(fx * 6.28318) * sin(fy * 3.14159) * 0.012 * side;
  tpOrmV = vec3(mix(0.87 + micro.x * 0.14, 0.63, wet), 1.0, 0.0);
}`;

const WOOD = /* glsl */ `{
  bool top = abs(vLocalN.y) > 0.7;
  float across = top ? vLocalP.z : (abs(vLocalN.x) > 0.7 ? vLocalP.z : vLocalP.x);
  float along = top ? vLocalP.x : vLocalP.y;
  float pw = top ? 0.18 : 0.12;
  float plank = floor(across / pw);
  float f = fract(across / pw);
  float h = fract(sin(plank * 27.19) * 43758.5453);
  float seam = (1.0 - smoothstep(0.002, 0.004 + fwidth(across), min(f, 1.0 - f) * pw)) * (1.0 - smoothstep(0.015, 0.055, fwidth(across)));
  float end = fract((along + h * 4.2) / 4.2);
  float butt = top ? 1.0 - smoothstep(0.002, 0.005 + fwidth(along), min(end, 1.0 - end) * 4.2) : 0.0;
  float grain = texture2D(uGrimeTex, vec2(along / 4.0, across / 0.055)).g;
  base = diffuse * (0.89 + 0.13 * h + 0.13 * (grain - 0.5));
  base *= 1.0 - max(seam, butt * 0.75) * 0.44;
  base *= 0.87 + 0.18 * gBroad;
  tugMicro = vec3(0.0, (grain - 0.5) * 0.014, 0.0);
  tpOrmV = vec3(top ? 0.95 : 0.82 + grain * 0.08, 1.0, 0.0);
}`;

const BEAM = /* glsl */ `{
  float grain = texture2D(uGrimeTex, vec2(vLocalP.x / 7.0, vLocalP.y / 0.16)).g;
  float crack = 1.0 - smoothstep(0.04, 0.12, grain);
  base = diffuse * (0.85 + 0.2 * gMid + 0.12 * grain) * (1.0 - crack * 0.25);
  tugMicro = vec3(0.0, (grain - 0.5) * 0.035, 0.0);
  tpOrmV = vec3(0.97, 1.0, 0.0);
}`;

const HEMP = /* glsl */ `{
  float fibres = texture2D(uGrimeTex, vLocalP.xy * vec2(19.0, 3.0)).g;
  base = diffuse * (0.76 + 0.38 * fibres) * (0.87 + 0.14 * gMid);
  tpOrmV = vec3(1.0, 1.0, 0.0);
}`;

let materials;
export function tugMaterials() {
  if (materials) return materials;
  const flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat);
  flat.needsUpdate = true;
  function finish(name, fragment, set, roughness, env = 0.38) {
    const m = surface({ name, set, scale: 1, roughness, envMapIntensity: env, normalScale: 0,
      grime: 0.25, streaks: 0.15, variation: 0, cavity: 0, minRough: 0.55,
      extra: { key: name, fragmentPars: 'vec3 tugMicro = vec3(0.0);', fragment } });
    m.userData.tp.tpNrm.value = flat;
    m.vertexColors = true;
    const compile = m.onBeforeCompile;
    m.onBeforeCompile = (shader, renderer) => {
      compile(shader, renderer);
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', `
        normal = normalize(normal + vVX * tugMicro.x + vVY * tugMicro.y);
        #include <lights_fragment_begin>`);
    };
    return m;
  }
  materials = { ...shipMats(),
    hull: finish('tugRivetedIron', STEEL, 'plate', 0.76, 0.60),
    paint: finish('tugWorkingPaint', STEEL, 'plate', 0.85, 0.5),
    deck: finish('tugWorkingDeck', WOOD, 'planks', 0.98),
    timber: finish('tugVarnishedCabin', WOOD, 'planks', 0.81, 0.5),
    beam: finish('tugRubbingTimber', BEAM, 'planks', 0.97, 0.3),
    hemp: finish('tugTarredHemp', HEMP, 'planks', 1),
    glass: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.3, envMapIntensity: 0.45, side: THREE.DoubleSide, name: 'tugWindowGlass' }),
  };
  return materials;
}
