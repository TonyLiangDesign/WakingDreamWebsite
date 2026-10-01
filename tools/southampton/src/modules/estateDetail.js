// Scene module "estateDetail": the LSWR Eastern Docks estate around Ocean Dock, April 1912.
// Transit sheds on the Test, Itchen and Empress Dock quays, bonded warehouses round the Inner and
// Outer Docks, Harland & Wolff repair works by Trafalgar Dry Dock, a dense LSWR siding network with
// wagons (coal-strike idle stock), quay cranes, cargo, coal heaps, lamps, boundary wall, small craft.
// Everything is built in the dock frame (same yaw as ctx.dockFrame).
import { FB, Instancer } from './estateDetail/fb.js';
import { makeSite } from './estateDetail/site.js';
import { buildPlan } from './estateDetail/plan.js';
import { buildGround } from './estateDetail/ground.js';
import { buildItchen } from './estateDetail/itchen.js';

export async function build(ctx) {
  const { THREE, Q } = ctx;
  const t0 = performance.now();
  const M = extraMaterials(ctx);
  const site = makeSite(ctx.layout, ctx.geo);
  if (typeof globalThis.__edSite !== 'undefined') globalThis.__edSite = site;
  const fb = new FB(M, { tile: 700 });
  const inst = new Instancer(M);
  const rnd = ctx.mulberry32(19120410);
  // boats must sit in real water: terrain deeper than -1.5 m at every hull sample
  const waterAt = (x, z) => {
    const [wx, wz] = site.d2w(x, z);
    if (ctx.terrain?.sample) return ctx.terrain.sample(wx, wz).h < -1.5;
    return false;
  };
  const stats = buildPlan({ ctx, M, site, fb, inst, rnd, Q, waterAt });
  buildItchen({ ctx, fb, inst, rnd, stats });
  const ground = buildGround(ctx, site, M);

  const group = new THREE.Group();
  group.name = 'estateDetail';
  group.rotation.y = ctx.geo.DOCK_YAW;
  const merged = fb.build('estateDetail');
  const instanced = inst.build('estateDetail-inst');
  group.add(merged, instanced);
  if (ground) group.add(ground);
  group.userData = { tris: fb.tris + instanced.userData.tris, mergedTris: fb.tris, instTris: instanced.userData.tris, stats, ms: performance.now() - t0 };
  console.log(`[estateDetail] tris merged ${Math.round(fb.tris)} inst ${Math.round(instanced.userData.tris)} in ${(performance.now() - t0).toFixed(0)} ms`, stats);
  return { group };
}

function extraMaterials(ctx) {
  const { surface: S, paint, M, THREE } = ctx;
  // tinted surface: multiplies the final albedo (some texture sets ignore the base colour)
  const T = (opts, tint) => S({ ...opts, extra: { key: 'tint', uniforms: { uTint: { value: new THREE.Color(tint) } }, fragmentPars: 'uniform vec3 uTint;', fragment: 'base *= uTint;' } });
  const Q = ctx.Q;
  // suppress grazing-angle sheen on dusty ground materials
  const matte = (m) => { const o = m.onBeforeCompile; m.onBeforeCompile = (sh, r) => { o(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectSpecular *= 0.2; reflectedLight.directSpecular *= 0.3;'); }; return m; };
  const X = Object.assign({}, M, {
    coalWagon: S({ set: 'planks', scale: 1.2, color: 0x3b3834, grime: 0.55, name: 'coalWagon' }),
    vanBody: S({ set: 'planks', scale: 1.2, color: 0x6b4636, grime: 0.45, name: 'vanBody' }),
    vanRoof: S({ set: 'plate', scale: 2, color: 0x6a6760, grime: 0.55, name: 'vanRoof' }),
    brass: paint(0xa88540, 0.35, 0.8, { name: 'brass' }),
    signalRed: paint(0x8a1f18, 0.6, 0, { name: 'signalRed' }),
    barrel: S({ set: 'planks', scale: 0.8, color: 0x7b5b3e, grime: 0.4, instanceLocal: true, name: 'barrel' }),
    hullBlack: S({ set: 'planks', scale: 1.5, color: 0x0f0e0d, roughness: 0.92, grime: 0.25, variation: 0.15, name: 'hullBlack' }),
    hold: S({ set: 'planks', scale: 1.2, color: 0x4a3e32, grime: 0.6, name: 'hold' }),
    tanSail: S({ set: 'concrete', scale: 2, color: 0x80442a, roughness: 1, grime: 0.3, name: 'tanSail' }),
    funnelBuff: paint(0xb58a4a, 0.6, 0, { name: 'funnelBuff' }),
    lorryPaint: paint(0x2e3b2c, 0.6, 0.1, { name: 'lorryPaint' }),
    taxiPaint: paint(0x4a1c1c, 0.4, 0.1, { name: 'taxiPaint' }),
    cladRed: S({ set: 'corrugated', scale: 2, color: 0x7d5244, roughness: 0.8, grime: 0.45, streaks: 0.8, groundDirt: 0.7, groundY: Q, name: 'cladRed' }),
    cladGrey: S({ set: 'corrugated', scale: 2, color: 0x8e8b82, roughness: 0.8, grime: 0.5, streaks: 0.8, groundDirt: 0.7, groundY: Q, name: 'cladGrey' }),
    cladBlack: S({ set: 'planks', scale: 2.2, color: 0x34302b, roughness: 0.85, grime: 0.4, streaks: 0.5, groundDirt: 0.6, groundY: Q, name: 'cladBlack' }),
    trimWhite: S({ set: 'plate', scale: 3, color: 0xbdb8aa, roughness: 0.7, grime: 0.4, streaks: 0.5, name: 'trimWhite' }),
    roofRed: T({ set: 'corrugated', scale: 2, color: 0x5a3f36, roughness: 1, grime: 0.55, streaks: 0.3, variation: 0.35, name: 'roofRed' }, 0xc8c0bc),
    roofDark: T({ set: 'corrugated', scale: 2, color: 0x45433f, roughness: 1, grime: 0.55, streaks: 0.3, variation: 0.35, name: 'roofDark' }, 0xc0bcb6),
    brickYellow: S({ set: 'brick', scale: 1.8, color: 0xe6d2b0, grime: 0.55, streaks: 0.6, groundDirt: 0.6, groundY: Q, name: 'brickYellow' }),
    brickRed: S({ set: 'brick', scale: 1.8, color: 0xc4907a, grime: 0.55, streaks: 0.7, groundDirt: 0.6, groundY: Q, name: 'brickRed' }),
    slateDark: S({ set: 'slate', scale: 2, color: 0x5c6068, grime: 0.35, name: 'slateDark' }),
    ballast: matte(S({ set: 'setts', scale: 0.6, color: 0x5a544c, normalScale: 1.5, roughness: 1, envMapIntensity: 0.15, grime: 0.6, name: 'edBallast', extra: { key: 'matte' } })),
    roadSetts: matte(S({ set: 'setts', scale: 2, color: 0x7a746c, roughness: 1, envMapIntensity: 0.15, grime: 0.6, variation: 0.25, name: 'roadSetts', extra: { key: 'matte' } })),
    ash: S({ set: 'concrete', scale: 4, color: 0x5d5850, roughness: 1, grime: 0.8, variation: 0.5, name: 'ash' }),
    roof: T({ set: 'corrugated', scale: 2, color: 0x5e5c57, roughness: 1, grime: 0.6, streaks: 0.35, variation: 0.4, name: 'edRoof' }, 0xc8c4bc),
    slate: S({ set: 'slate', scale: 2, color: 0x70747a, grime: 0.35, variation: 0.3, name: 'edSlate' }),
    coalHeap: T({ set: 'concrete', scale: 0.8, color: 0xffffff, roughness: 0.88, envMapIntensity: 0.35, normalScale: 2.2, grime: 0.2, variation: 0.35, name: 'coalHeap' }, 0x2c2a28),
    skylight: S({ set: 'plate', scale: 1.2, color: 0x4a4f50, roughness: 0.9, envMapIntensity: 0.25, grime: 0.7, streaks: 0.5, variation: 0.25, name: 'skylight' }),
    rut: (() => { const m = S({ set: 'concrete', scale: 3, color: 0x4a4540, roughness: 1, grime: 0.6, variation: 0.5, name: 'rut', extra: { key: 'rut', fragment: 'diffuseColor.a *= smoothstep(0.35, 0.65, gMid) * 0.55;' } }); m.transparent = true; m.depthWrite = false; return m; })(),
    tarp: S({ set: 'concrete', scale: 2, color: 0x35332e, roughness: 0.9, grime: 0.3, name: 'tarpDark' }),
    yardDark: S({ set: 'concrete', scale: 6, color: 0x77716a, roughness: 1, grime: 0.8, variation: 0.55, name: 'yardDark' }),
    yardEarth: S({ set: 'concrete', scale: 4, color: 0x6a6258, roughness: 1, envMapIntensity: 0.35, grime: 0.35, variation: 0.15, name: 'yardEarth' }),
    hullRed: paint(0x5a2a20, 0.8, 0, { name: 'hullRed' }),
    warGrey: S({ set: 'plate', scale: 2, color: 0x7a7f80, roughness: 0.6, grime: 0.3, streaks: 0.4, name: 'warGrey' }),
    redOxide: S({ set: 'plate', scale: 2, color: 0x7a3d2c, roughness: 0.85, grime: 0.4, streaks: 0.5, name: 'redOxide' }),
    steelPlate: S({ set: 'plate', scale: 2, color: 0x5a4a40, roughness: 0.8, metalness: 0.2, grime: 0.5, streaks: 0.4, name: 'steelPlate' }),
  });
  return X;
}
