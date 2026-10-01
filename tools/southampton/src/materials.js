import * as THREE from 'three';
import { surface, paint } from './surface.js';

// Shared material catalogue for the port. Colours are sRGB hex.
let LIB = null;
export function portMaterials() {
  if (LIB) return LIB;
  const Q = 4.6; // quay level above noon water
  LIB = {
    quayWall: surface({ set: 'concrete', scale: 3, color: 0x9d968a, wet: true, highWater: 2.7, grime: 0.55, streaks: 0.75, variation: 0.3, name: 'quayWall' }),
    coping: surface({ set: 'ashlar', scale: 4.8, color: 0x7d786f, specular: 0.4, minRough: 0.8, grime: 0.45, streaks: 0.3, wet: true, highWater: 2.7, name: 'coping' }),
    setts: surface({ set: 'setts', scale: 2, color: 0x6e6a63, minRough: 0.85, specular: 0.3, envMapIntensity: 0.5, grime: 0.6, variation: 0.3, name: 'setts' }),
    yard: surface({ set: 'concrete', scale: 5, color: 0x58524a, grime: 0.7, variation: 0.35, minRough: 0.9, specular: 0.3, envMapIntensity: 0.45, name: 'yard' }),
    gravel: surface({ set: 'setts', scale: 0.9, color: 0x8a8175, grime: 0.6, normalScale: 0.6, variation: 0.3, name: 'gravel' }),
    fender: surface({ set: 'planks', scale: 1.2, color: 0x6d5f4d, wet: true, highWater: 2.7, grime: 0.5, streaks: 0.5, name: 'fender' }),
    timber: surface({ set: 'planks', scale: 2, color: 0xb59f80, grime: 0.35, name: 'timber' }),
    timberDark: surface({ set: 'planks', scale: 2, color: 0x5a4c3c, grime: 0.4, name: 'timberDark' }),
    castIron: surface({ set: 'plate', scale: 2, color: 0x1c1d1e, roughness: 0.75, metalness: 0.3, grime: 0.3, variation: 0.1, name: 'castIron' }),
    steel: surface({ set: 'plate', scale: 3, color: 0x3a3d3c, roughness: 0.8, metalness: 0.2, grime: 0.35, streaks: 0.5, name: 'steel' }),
    steelRaw: surface({ set: 'plate', scale: 3, color: 0x6a5446, roughness: 0.85, metalness: 0.2, grime: 0.4, streaks: 0.4, name: 'steelRaw' }),
    shedClad: surface({ set: 'corrugated', scale: 2, color: 0x6f8466, roughness: 0.9, minRough: 0.7, normalScale: 0.5, grime: 0.45, streaks: 0.8, groundDirt: 0.7, groundY: Q, name: 'shedClad' }),
    shedTrim: surface({ set: 'plate', scale: 3, color: 0x44573f, roughness: 0.7, grime: 0.3, streaks: 0.4, name: 'shedTrim' }),
    roof: surface({ set: 'corrugated', scale: 2, color: 0x5e5b55, roughness: 0.9, minRough: 0.72, normalScale: 0.45, grime: 0.55, streaks: 0.3, variation: 0.35, name: 'roof' }),
    brick: surface({ set: 'brick', scale: 1.8, grime: 0.5, streaks: 0.6, groundDirt: 0.6, groundY: Q, name: 'brick' }),
    brickDark: surface({ set: 'brick', scale: 1.8, color: 0x9a8a80, grime: 0.6, streaks: 0.7, name: 'brickDark' }),
    stone: surface({ set: 'ashlar', scale: 2.4, color: 0xd9d0bd, grime: 0.55, streaks: 0.7, name: 'stone' }),
    slate: surface({ set: 'slate', scale: 2, grime: 0.3, name: 'slate' }),
    render: surface({ set: 'concrete', scale: 3, color: 0xcfc6b2, grime: 0.5, streaks: 0.8, name: 'render' }),
    glass: new THREE.MeshStandardMaterial({ color: 0x12161a, roughness: 0.32, metalness: 0.0, envMapIntensity: 0.55, name: 'glass' }),
    glassRoof: new THREE.MeshStandardMaterial({ color: 0x3c4241, roughness: 0.62, metalness: 0.0, envMapIntensity: 0.6, name: 'glassRoof' }),
    rail: paint(0x57504a, 0.35, 0.8, { name: 'rail' }),
    sleeper: surface({ set: 'planks', scale: 1, color: 0x3d3329, grime: 0.5, name: 'sleeper' }),
    ballast: surface({ set: 'setts', scale: 0.6, color: 0x6f675c, normalScale: 1.5, grime: 0.6, name: 'ballast' }),
    lswrUpper: surface({ set: 'plate', scale: 2, color: 0xc99a7e, roughness: 0.5, grime: 0.25, streaks: 0.3, name: 'lswrUpper' }),
    lswrLower: surface({ set: 'plate', scale: 2, color: 0x5a3527, roughness: 0.5, grime: 0.25, streaks: 0.3, name: 'lswrLower' }),
    lswrGreen: surface({ set: 'plate', scale: 2, color: 0x587a3c, roughness: 0.45, grime: 0.25, streaks: 0.3, name: 'lswrGreen' }),
    wagonGrey: surface({ set: 'planks', scale: 1.2, color: 0x77736b, grime: 0.45, name: 'wagonGrey' }),
    wagonRed: surface({ set: 'planks', scale: 1.2, color: 0x7a3a28, grime: 0.45, name: 'wagonRed' }),
    black: surface({ set: 'plate', scale: 2, color: 0x151515, roughness: 0.6, grime: 0.2, name: 'blackPaint' }),
    white: surface({ set: 'plate', scale: 3, color: 0xe2ddd0, roughness: 0.7, grime: 0.35, streaks: 0.6, name: 'white' }),
    canvas: surface({ set: 'concrete', scale: 2, color: 0x8c8672, roughness: 0.95, grime: 0.4, name: 'tarp' }),
    coal: surface({ set: 'setts', scale: 0.35, color: 0x2a2a2a, roughness: 0.55, normalScale: 2, grime: 0.1, name: 'coal' }),
    crate: surface({ set: 'planks', scale: 1.0, color: 0xc2a57e, grime: 0.4, instanceLocal: true, name: 'crate' }),
    sack: surface({ set: 'concrete', scale: 1, color: 0xb3a080, roughness: 1, grime: 0.3, instanceLocal: true, name: 'sack' }),
    grass: surface({ set: 'concrete', scale: 6, color: 0x5f6f3c, roughness: 1, grime: 0.5, variation: 0.45, name: 'grass' }),
    mud: surface({ set: 'concrete', scale: 6, color: 0x5a5244, roughness: 0.4, grime: 0.6, variation: 0.5, name: 'mud' }),
    locoGreen: surface({ set: 'plate', scale: 2, color: 0x2c4226, roughness: 0.6, minRough: 0.45, normalScale: 0.2, grime: 0.3, streaks: 0.3, name: 'locoGreen' }),
    craneSteel: surface({ set: 'plate', scale: 2.5, color: 0x3a3f40, roughness: 0.8, minRough: 0.55, normalScale: 0.25, grime: 0.35, streaks: 0.5, rust: 0.12, variation: 0.15, name: 'craneSteel' }),
    lamp: paint(0x1d2220, 0.6, 0.3, { name: 'lampIron' }),
    lampGlass: new THREE.MeshStandardMaterial({ color: 0xd8d4c4, roughness: 0.2, emissive: 0x000000, name: 'lampGlass' }),
  };
  LIB.Q = Q;
  return LIB;
}
