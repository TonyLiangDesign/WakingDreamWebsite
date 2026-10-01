// Scene module "landmarks": hero landmarks of Southampton & Southampton Water, April 1912.
// Contract: export async function build(ctx) → { group, update?(t, dt, camera) }
import { Kit } from './landmarks/kit.js';
import { buildStation } from './landmarks/station.js';
import { stMichael, holyRood, stMary } from './landmarks/churches.js';
import { royalPier, townQuay, hythePier } from './landmarks/piers.js';
import { netley } from './landmarks/netley.js';
import { townWalls, calshot } from './landmarks/fortifications.js';
import { floatingBridgeHards, floatingBridgeVessel } from './landmarks/floatingBridge.js';

let MATS = null;
function materials(ctx) {
  if (MATS) return MATS;
  const S = ctx.surface;
  MATS = {
    ...ctx.M,
    hotelStone: S({ set: 'ashlar', scale: 2.4, color: 0xe8e0cc, grime: 0.5, streaks: 0.75, variation: 0.2, name: 'lm-hotelStone' }),
    stoneDark: S({ set: 'ashlar', scale: 2.4, color: 0xb3aa98, grime: 0.55, streaks: 0.6, variation: 0.2, name: 'lm-stoneDark' }),
    rubble: S({ set: 'ashlar', scale: 1.3, color: 0xb9ae98, grime: 0.6, streaks: 0.6, variation: 0.35, name: 'lm-rubble' }),
    rubbleDark: S({ set: 'ashlar', scale: 1.3, color: 0x9e947f, grime: 0.6, streaks: 0.6, variation: 0.35, name: 'lm-rubbleDark' }),
    churchStone: S({ set: 'ashlar', scale: 1.8, color: 0xc7bfad, grime: 0.55, streaks: 0.7, variation: 0.25, name: 'lm-churchStone' }),
    churchStoneDark: S({ set: 'ashlar', scale: 1.8, color: 0xa9a08f, grime: 0.55, streaks: 0.6, variation: 0.25, name: 'lm-churchStoneDark' }),
    stoneSpire: S({ set: 'ashlar', scale: 1.6, color: 0xc9c0ae, grime: 0.45, streaks: 0.8, variation: 0.2, name: 'lm-spire' }),
    scaffold: S({ set: 'planks', scale: 1.0, color: 0x9a8566, grime: 0.4, name: 'lm-scaffold' }),
    lead: S({ set: 'plate', scale: 3, color: 0x6c7373, roughness: 0.55, metalness: 0.1, grime: 0.3, streaks: 0.5, name: 'lm-lead' }),
    ironWet: S({ set: 'plate', scale: 2, color: 0x2b2826, roughness: 0.7, metalness: 0.2, grime: 0.3, wet: true, highWater: 3.2, name: 'lm-ironWet' }),
    netleyBrick: S({ set: 'brick', scale: 1.8, color: 0xb46a52, grime: 0.45, streaks: 0.55, variation: 0.2, name: 'lm-netleyBrick' }),
    hullBlack: ctx.paint(0x141414, 0.65, 0.1, { name: 'lm-hullBlack' }),
    hardStone: S({ set: 'setts', scale: 2, color: 0xd8d0c0, grime: 0.45, variation: 0.25, wet: true, highWater: 3.0, name: 'lm-hardStone' }),
    deckLight: S({ set: 'planks', scale: 1.6, color: 0xd9c7a4, grime: 0.25, variation: 0.15, name: 'lm-deckLight' }),
    buffPaint: S({ set: 'plate', scale: 3, color: 0xc4843c, roughness: 0.7, grime: 0.3, name: 'lm-buff' }),
    timberWet: S({ set: 'planks', scale: 1.4, color: 0x6a5b49, grime: 0.5, streaks: 0.5, wet: true, highWater: 3.2, name: 'lm-timberWet' }),
  };
  return MATS;
}

export async function build(ctx) {
  const t0 = performance.now();
  const THREE = ctx.THREE;
  const M = materials(ctx);
  const group = new THREE.Group();
  group.name = 'landmarks';
  const footprints = [];

  const safe = (name, fn) => { try { fn(); } catch (e) { console.error(`[landmarks] ${name} failed`, e); } };

  // world-aligned assemblies share one builder
  const bw = new ctx.Builder(M);
  const kw = new Kit(bw);
  let fb = null;
  safe('station', () => footprints.push(...buildStation(ctx, kw)));
  safe('stMichael', () => footprints.push(stMichael(ctx, kw)));
  safe('holyRood', () => footprints.push(holyRood(ctx, kw)));
  safe('stMary', () => footprints.push(stMary(ctx, kw)));
  safe('royalPier', () => footprints.push(...royalPier(ctx, kw)));
  safe('townQuay', () => footprints.push(...townQuay(ctx, kw)));
  safe('townWalls', () => footprints.push(...townWalls(ctx, kw)));
  safe('calshot', () => footprints.push(...calshot(ctx, kw)));
  safe('floatingBridge', () => { fb = floatingBridgeHards(ctx, kw); footprints.push(...fb.footprints); });
  group.add(bw.build({ name: 'landmarks-world' }));

  // strongly rotated assemblies get their own frame so triplanar textures stay aligned
  const framed = (name, anchor, yaw, fn) => safe(name, () => {
    const G = new THREE.Matrix4().compose(new THREE.Vector3(anchor[0], 0, anchor[1]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
    const b = new ctx.Builder(M);
    const k = new Kit(b, new THREE.Matrix4(), G.clone().invert());
    footprints.push(...fn(k));
    const g = b.build({ name: 'landmarks-' + name });
    g.matrixAutoUpdate = false; g.matrix.copy(G);
    group.add(g);
  });
  const L = ctx.layout.LANDMARKS;
  const yawOf = (a, b) => Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
  framed('hythe', L.hythePierRoot, yawOf(L.hythePierRoot, L.hythePierHead), (k) => hythePier(ctx, k));
  framed('netley', L.netleyChapel, yawOf(L.netleySE, L.netleyNW), (k) => netley(ctx, k));

  // the floating bridge vessel, pinned mid-river on its chains (static for film plates)
  safe('floatingBridgeVessel', () => {
    const v = floatingBridgeVessel(ctx, M);
    const C = fb?.crossing;
    if (!C) return;
    v.rotation.y = C.yaw;
    v.position.set(C.W[0] + C.ux * C.span / 2, 0, C.W[1] + C.uz * C.span / 2);
    group.add(v);
  });

  group.userData.footprints = footprints;
  let tris = 0;
  group.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  group.userData.triangles = tris;
  group.userData.buildMs = performance.now() - t0;
  console.log(`[landmarks] ${(performance.now() - t0).toFixed(0)} ms, ${Math.round(tris / 1000)}k tris`);
  return { group };
}
