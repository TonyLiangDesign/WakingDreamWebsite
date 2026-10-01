import * as THREE from 'three';
import { buildRegion } from '../../docs/claude-handoff/C35/region.mjs';
import { getMaterial, uvBox } from './materials.js';
import { light } from './interior/kit.js';

/** Reviewed C35 circulation geometry, integrated in the current authoring frame.
 * The side flights are an engineering layout, not a historical certification.
 * Keep the existing BOAT→A stair and A hall decoration; replace the overlapping
 * lower scissors flights and their floor openings together. D→E is a local
 * engineering extension of the same flights; it does not alter frozen C35.
 */
export function buildLowerStair() {
  const source = buildRegion(THREE), root = new THREE.Group(), collide = [];
  root.name = 'IntegratedLowerGrandStair';
  root.userData.source = 'C35-R1';
  const floor = getMaterial('carpet', {});
  const oak = getMaterial('oak', { color: '#7a5834' });
  const guard = getMaterial('paintedSteel', { color: '#2a2622', inout: 0 });
  const invisible = new THREE.MeshBasicMaterial({ visible: false });
  // C108 · 楼板/平台底面：低光泽浅色天花涂层（工程暂定，不是历史材质定案）。
  // 独立缓存键，不改 carpet 或其他共享 paint 对象；顶面地毯与侧面保持 floor。
  const soffit = getMaterial('paint', { color: '#d3cab7', gloss: 0.82 });
  source.traverse(o => {
    if (!o.isMesh) return;
    const { deck, category } = o.userData;
    const keep = deck === 'A'
      ? ['foyer', 'flights', 'landings', 'guards'].includes(category)
      : ['B', 'C', 'D'].includes(deck) && ['foyer', 'flights', 'landings', 'guards', 'walls', 'wallsStbd'].includes(category);
    if (!keep || (deck === 'D' && category === 'foyer')) return;
    const mesh = o.clone();
    mesh.geometry = o.geometry.clone();
    mesh.material = ['foyer', 'landings'].includes(category) ? floor : category === 'guards' ? guard : oak;
    if (mesh.geometry.type === 'BoxGeometry') uvBox(mesh);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    // Separate proxies survive static batching. The stair uses its actual tread
    // geometry: no invisible ramp may lift feet into the flight above.
    const proxy = mesh.clone(); proxy.material = invisible;
    proxy.name = `Collision:${mesh.name}`;
    splitSoffit(mesh, soffit);   // proxy 已持有完整实心盒体，之后才拆可见面
    root.add(proxy); collide.push(proxy);
  });
  // Repeat the reviewed C→D arrangement one storey below, opening D's slab
  // and preserving the same tread/landing geometry. C35 itself remains frozen.
  source.traverse(o => {
    if (!o.isMesh || o.userData.deck !== 'C' || !['foyer', 'flights', 'landings', 'guards'].includes(o.userData.category)) return;
    const category = o.userData.category, mesh = o.clone();
    mesh.geometry = o.geometry.clone(); mesh.position.y -= 2.9;
    mesh.name = `EExtension:${o.name}`;
    mesh.userData = {...o.userData, deck: 'D', extensionTo: 'E', placementStatus: 'provisional'};
    mesh.material = ['foyer', 'landings'].includes(category) ? floor : category === 'guards' ? guard : oak;
    if (mesh.geometry.type === 'BoxGeometry') uvBox(mesh);
    mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
    const proxy = mesh.clone(); proxy.material = invisible; proxy.name = `Collision:${mesh.name}`;
    splitSoffit(mesh, soffit);
    root.add(proxy); collide.push(proxy);
  });
  // E landing stays inside x±4.9, clear of the existing mail stair at x>=5.4.
  const enamel = getMaterial('paintedSteel', {color:'#e6e1d4', inout:.004, wearAmt:.3});
  const lino = getMaterial('paint', {color:'#a29b83',gloss:.08});
  const part = (name, size, at, material) => {
    const mesh = uvBox(new THREE.Mesh(new THREE.BoxGeometry(...size), material));
    mesh.position.set(...at); mesh.name = `EGrandFoyer:${name}`;
    mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
    const proxy = mesh.clone(); proxy.material = invisible; proxy.name = `Collision:${mesh.name}`;
    root.add(proxy); collide.push(proxy);
  };
  part('floor', [9.8,.16,10.9], [0,-14.78,69.15], lino);
  part('side-port', [.16,2.9,10.9], [-4.9,-13.25,69.15], enamel);
  for (const [a,b] of [[63.7,63.95],[65.45,74.6]])
    part(`side-starboard-${a}`, [.16,2.9,b-a], [4.9,-13.25,(a+b)/2], enamel);
  part('mail-door-lintel', [.16,.8,1.5], [4.9,-12.2,64.7], enamel);
  part('mail-door-floor', [.72,.16,1.5], [5.2,-14.78,64.7], lino);
  part('mail-door-roof', [.72,.12,1.5], [5.2,-12.36,64.7], enamel);
  for(const z of [63.95,65.45]) part(`mail-door-cheek-${z}`, [.72,2.4,.12], [5.2,-13.5,z], enamel);
  part('forward-wall', [9.8,2.9,.16], [0,-13.25,74.6], enamel);
  for (const side of [-1,1]) part(`aft-jamb-${side}`, [4.15,2.9,.16], [side*2.825,-13.25,63.7], enamel);
  part('aft-lintel', [1.5,.65,.16], [0,-12.125,63.7], enamel);
  part('corridor-floor', [2.7,.16,1.9], [0,-14.78,62.85], lino);
  part('corridor-roof', [2.7,.12,1.7], [0,-12.30,62.85], enamel);
  for(const side of [-1,1]) part(`corridor-side-${side}`, [.16,2.4,1.7], [side*1.35,-13.5,62.85], enamel);
  for(const z of [64.9,68.4,72.1]) {
    light(-3.2,-12.4,z,{intensity:9,range:10});
    light(3.2,-12.4,z,{intensity:9,range:10});
  }
  light(0,-12.55,62.9,{intensity:5,range:7});
  root.userData.extension = {deck:'E',floorY:-14.7,halfWidth:4.9,z0:63.7,z1:74.6,placementStatus:'provisional',historicalStatus:'unverified'};
  // Close the measured 0.3 m longitudinal gap to the existing B/C/D corridors.
  for (const y of [-6, -8.9, -11.8]) {
    const bridge = uvBox(new THREE.Mesh(new THREE.BoxGeometry(1.5, .16, .4), floor));
    bridge.position.set(0, y - .08, 63.55); bridge.name = `StairCorridorThreshold:${y}`;
    root.add(bridge);
    const proxy = bridge.clone(); proxy.material = invisible; root.add(proxy); collide.push(proxy);
  }
  // C interface: corridor-c walls stop at z=63.4 while the stair aft wall starts
  // at 63.62. Beside the 1.5 m door that 0.22 m slot let a walker slide sideways
  // along the threshold onto the safety net outside the corridor. Close only the
  // slot with door reveals (visible oak + collision) and a visual head piece.
  {
    const Y = -8.9, z0 = 63.38, z1 = 63.64, x0 = .75, x1 = 1.26, h = 2.42;
    for (const s of [-1, 1]) {
      const jamb = uvBox(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), oak));
      jamb.position.set(s * (x0 + x1) / 2, Y + h / 2, (z0 + z1) / 2);
      jamb.name = `CCorridorInterface:jamb-${s > 0 ? 'starboard' : 'port'}`;
      jamb.castShadow = jamb.receiveShadow = true; root.add(jamb);
      const proxy = jamb.clone(); proxy.material = invisible; proxy.name = `Collision:${jamb.name}`;
      root.add(proxy); collide.push(proxy);
    }
    const head = uvBox(new THREE.Mesh(new THREE.BoxGeometry(2 * x0, h - 2.1, z1 - z0), oak));
    head.position.set(0, Y + (2.1 + h) / 2, (z0 + z1) / 2);
    head.name = 'CCorridorInterface:head'; head.castShadow = head.receiveShadow = true; root.add(head);
  }
  for (const y of [-3.1, -6, -8.9, -11.8]) {
    light(-3.2, y + 2.3, 66, { intensity: 12, range: 12 });
    light(3.2, y + 2.3, 70, { intensity: 12, range: 12 });
    if (y > -11.8) light(0, y + .8, 73.7, { intensity: 12, range: 10 });
  }
  root.userData.collide = collide;
  return root;
}

/**
 * C108 · 把 foyer 楼板 / landings 平台盒体的向下面（BoxGeometry 第 3 组，−Y）
 * 拆成同位置的独立单材质 Mesh，并从原可见盒体里去掉这同一组三角面。
 * 顶面、四个侧面仍在原 Mesh（原材质、原 UV）；两部分顶点/法线/UV 逐个复制，
 * 合起来与原盒体完全相同，不重叠、不漏面。两者都是普通单材质 Mesh，照常进 bakeStatic。
 * 只按 C35 元数据（category + kind）识别，其他盒体原样返回。碰撞代理不经过这里。
 */
const SOFFIT_KIND = { foyer: 'slab', landings: 'landing' };
function splitSoffit(mesh, material) {
  const { category, kind } = mesh.userData;
  const g = mesh.geometry;
  if (SOFFIT_KIND[category] !== kind || g.type !== 'BoxGeometry' || !g.index || g.groups.length !== 6) return null;
  const down = g.groups.find(q => q.materialIndex === 3);           // 面序 +X −X +Y −Y +Z −Z
  if (!down) return null;
  const rest = [];
  for (const q of g.groups) if (q !== down) rest.push([q.start, q.count]);
  mesh.geometry = pickTriangles(g, rest);
  const under = new THREE.Mesh(pickTriangles(g, [[down.start, down.count]]), material);
  under.name = `${mesh.name}:soffit`;
  under.position.copy(mesh.position); under.quaternion.copy(mesh.quaternion); under.scale.copy(mesh.scale);
  under.userData = { ...mesh.userData, surface: 'soffit', surfaceOf: mesh.name, finish: 'ceiling-paint-provisional' };
  under.castShadow = mesh.castShadow; under.receiveShadow = mesh.receiveShadow;
  mesh.parent.add(under);
  return under;
}

/** 按索引区间取三角面，复制用到的 position/normal/uv，重新编号为紧凑的索引几何。 */
function pickTriangles(g, ranges) {
  const names = ['position', 'normal', 'uv'].filter(n => g.attributes[n]);
  const out = Object.fromEntries(names.map(n => [n, []])), remap = new Map(), index = [];
  for (const [start, count] of ranges) {
    for (let i = start; i < start + count; i++) {
      const v = g.index.getX(i);
      let k = remap.get(v);
      if (k === undefined) {
        k = remap.size; remap.set(v, k);
        for (const n of names) {
          const a = g.attributes[n];
          for (let c = 0; c < a.itemSize; c++) out[n].push(a.array[v * a.itemSize + c]);
        }
      }
      index.push(k);
    }
  }
  const geo = new THREE.BufferGeometry();
  for (const n of names) geo.setAttribute(n, new THREE.Float32BufferAttribute(out[n], g.attributes[n].itemSize));
  geo.setIndex(index);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}
