import * as THREE from 'three';
import { createSky, createWater, createUnderwater, seaHeight } from './water.js';
import { createSpray, createWhiteWater } from './spray.js';
import { loadSkipper, placeSkipper } from './crew.js';

// Everything the water scene adds to the studio: the sky, the sea, its floor, the spray and the
// white water, the sky-lit environment, and the skipper. Loaded on demand by scene.js the first
// time a build asks for the water, so a studio start never fetches or builds any of it.

export function createSea({ pmrem, lowPower, mirrorTexture }) {
  const envScene = new THREE.Scene();
  const envSky = createSky();
  envSky.geometry = new THREE.SphereGeometry(50, 32, 16);
  // The environment is a desaturated copy of the visible sky. Clearcoat on dark topsides mirrors
  // its horizon, and a full-strength sunset horizon turns navy and charcoal brown; decks and roofs
  // take their diffuse light from its zenith, and a full blue zenith turns white surfaces blue
  // (the sun is only about 10 degrees up, so the key adds little to them). The warmth and the blue
  // stay in the sun, the key light and the visible sky.
  envSky.material.uniforms.uHorizon.value.set('#ddd3c9');
  envSky.material.uniforms.uAnti.value.set('#aeb9c6');
  envSky.material.uniforms.uTop.value.set('#a6a9ad');
  envScene.add(envSky);
  const waterEnv = pmrem.fromScene(envScene, 0.02).texture;
  envSky.geometry.dispose();
  envSky.material.dispose();

  const sky = createSky();
  const water = createWater({ detail: lowPower ? 0 : 1 });
  const underwater = createUnderwater();
  const spray = createSpray({ count: lowPower ? 2500 : 7000 });
  const whiteWater = createWhiteWater({ detail: lowPower ? 0 : 1 });
  water.material.uniforms.tReflect.value = mirrorTexture;
  return { sky, water, underwater, spray, whiteWater, waterEnv, seaHeight, loadSkipper, placeSkipper };
}
