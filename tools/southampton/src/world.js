import * as THREE from 'three';
import { portMaterials } from './materials.js';
import { buildOceanDock, DOCK } from './dock.js';
import { buildEstate } from './estate.js';
import { buildBerth44 } from './berth.js';
import { buildTerrain } from './terrain.js';
import { makeLiner, makeTug, SHIPS } from './ships.js';
import { DOCK_YAW } from './geo.js';
import { BERTH_38 } from './layout.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as layout from './layout.js';
import * as geo from './geo.js';
import { Builder, mat } from './builder.js';
import { surface, paint } from './surface.js';
import { mulberry32, getTextures } from './textures.js';
import * as poly from './poly.js';
import { Smoke, createGulls, WIND } from './effects.js';

const MODULES = ['town', 'vegetation', 'estateDetail', 'landmarks'];

const params = new URLSearchParams(location.search);

// place an object with its local +X pointing along a world direction
function placeAlong(obj, x, z, dirX, dirZ) {
  obj.position.set(x, 0, z);
  obj.rotation.y = Math.atan2(-dirZ, dirX);
}

export async function buildWorld({ scene, atmo }) {
  const M = portMaterials();
  const root = new THREE.Group();
  root.name = 'Southampton1912';
  scene.add(root);

  const { group: terrainGroup, terrain, heightTex, heightRect } = buildTerrain();
  const water = scene.getObjectByName('water');
  if (water) {
    water.material.uniforms.uHeightTex.value = heightTex;
    water.material.uniforms.uHeightRect.value.set(...heightRect);
  }
  root.add(terrainGroup);
  root.add(buildEstate(M));

  const dockFrame = new THREE.Group();
  dockFrame.name = 'DockFrame';
  dockFrame.rotation.y = DOCK_YAW;
  root.add(dockFrame);
  const dock = buildOceanDock(M);
  dockFrame.add(dock);

  // ---------------------------------------------------------------- ships in Ocean Dock
  const ships = new THREE.Group();
  ships.name = 'Ships';
  dockFrame.add(ships);

  // Titanic: port side to Berth 44, bow toward the mouth. Replaced by the hero model if present.
  const titanicSlot = new THREE.Group();
  titanicSlot.name = 'TitanicSlot';
  titanicSlot.position.set(-70, 0, DOCK.east.z + 1.6 + SHIPS.titanic.B / 2);
  ships.add(titanicSlot);
  let titanic = makeLiner(SHIPS.titanic);
  titanicSlot.add(titanic);
  if (!params.has('proxy') && import.meta.env.VITE_TITANIC_GLB === 'true') {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}assets/titanic.glb`, { method: 'HEAD' });
      if (res.ok && (res.headers.get('content-type') || '').includes('gltf')) {
        const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}assets/titanic.glb`);
        titanicSlot.remove(titanic);
        titanic = gltf.scene;
        // the ship project models bow toward +Z; the port expects bow toward +X
        titanic.rotation.y = Math.PI / 2;
        titanic.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
        titanicSlot.add(titanic);
        titanicSlot.updateMatrixWorld(true);
        // funnel tops (for smoke): highest points of the funnel-top meshes, fore to aft
        const tops = [];
        titanic.traverse((o) => {
          if (o.isMesh && /funneltop/i.test(o.material?.name || '')) {
            const bb = new THREE.Box3().setFromObject(o);
            const c = bb.getCenter(new THREE.Vector3()); c.y = bb.max.y;
            tops.push(titanic.worldToLocal(c.clone()));
          }
        });
        tops.sort((a, b) => b.z - a.z);
        titanic.userData.funnelTops = tops;
        titanic.userData.boatDeckY = 19;
        titanic.userData.hero = true;
      }
    } catch (e) { /* keep proxy */ }
  }

  dockFrame.add(buildBerth44(M, { slotX: titanicSlot.position.x, bollards: dock.userData.bollards }));

  // Berth 46 (west quay): Majestic (bow in), St Louis (bow out), Philadelphia (bow in), rafted.
  const raft = [
    [SHIPS.majestic, -1], [SHIPS.stlouis, 1], [SHIPS.philadelphia, -1],
  ];
  let zEdge = DOCK.west.z - 1.4;
  for (const [spec, dir] of raft) {
    const s = makeLiner(spec);
    const z = zEdge - spec.B / 2;
    s.position.set(-95, 0, z);
    s.rotation.y = dir > 0 ? 0 : Math.PI;
    ships.add(s);
    zEdge = z - spec.B / 2 - 1.2;
  }

  // Berth 38, Test Quay: Oceanic inboard, New York outboard.
  const [qa, qb] = BERTH_38;
  const qdx = qb[0] - qa[0], qdz = qb[1] - qa[1], ql = Math.hypot(qdx, qdz);
  const ux = qdx / ql, uz = qdz / ql, nx = -uz, nz = ux; // water side normal (south-west)
  const mid = [(qa[0] + qb[0]) / 2, (qa[1] + qb[1]) / 2];
  const oceanic = makeLiner(SHIPS.oceanic);
  const offO = 1.6 + SHIPS.oceanic.B / 2;
  placeAlong(oceanic, mid[0] + nx * offO, mid[1] + nz * offO, ux, uz);
  root.add(oceanic);
  const newyork = makeLiner(SHIPS.newyork);
  const offN = offO + SHIPS.oceanic.B / 2 + 1.4 + SHIPS.newyork.B / 2;
  placeAlong(newyork, mid[0] + nx * offN - ux * 12, mid[1] + nz * offN - uz * 12, ux, uz);
  root.add(newyork);

  // Tugs standing by at the dock mouth and off Titanic's bow.
  const tugs = [];
  const tugSpots = [
    [175, -18, Math.PI * 0.05], [205, 8, Math.PI * 0.92], [238, -30, Math.PI * 1.1],
    [85, -6, Math.PI * 0.04], [300, 30, Math.PI * 0.7], [-230, -20, Math.PI * 1.0],
  ];
  tugSpots.forEach(([x, z, yaw], i) => {
    // Eaton, Titanic International Society: all six departure tugs were Red Funnel.
    // Registered lengths/beams constrain these proxies; individual deck plans remain approximate.
    const fleet = [
      { name: 'Hercules', L: 41.3004, B: 7.34568 },
      { name: 'Vulcan', L: 36.576, B: 7.65048 },
      { name: 'Neptune', L: 39.624, B: 7.62 },
      { name: 'Ajax', L: 36.576, B: 7.62 },
      { name: 'Hector', L: 39.4716, B: 7.65048 },
      { name: 'Albert Edward', L: 36.576, B: 6.12648 },
    ];
    const t = makeTug(i + 1, { funnel: 'red', identity: fleet[i] });
    t.position.set(x, 0, z);
    t.rotation.y = yaw;
    ships.add(t);
    tugs.push(t);
  });

  // ---------------------------------------------------------------- content modules
  // Each module is isolated: a failing module logs and is skipped, the scene still loads.
  const ctx = {
    THREE, M, terrain, layout, geo, poly, Builder, mat, surface, paint, mulberry32, textures: getTextures(),
    Q: DOCK.Q, DOCK, root, dockFrame, scene, rnd: mulberry32(1912),
  };
  const want = params.get('modules') ? params.get('modules').split(',') : MODULES;
  const loaded = [];
  for (const name of MODULES) {
    if (!want.includes(name)) continue;
    const t0 = performance.now();
    try {
      const mod = await import(`./modules/${name}.js`);
      const res = await mod.build(ctx);
      if (res?.group) {
        res.group.name ||= name;
        root.add(res.group);
        // vegetation that doesn't cast shadows is inland/far: keep it out of water reflections
        if (name === 'vegetation') res.group.traverse((o) => { if (o.isMesh && !o.castShadow) o.userData.noReflect = true; });
        // anything whose bounds sit well inland can't show up in the water either
        res.group.updateMatrixWorld(true);
        res.group.traverse((o) => {
          if (!o.isMesh || o.userData.noReflect) return;
          if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
          const bs = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld);
          if (bs.radius > 3000) return; // huge merged chunks: keep
          const smp = terrain.sample(bs.center.x, bs.center.z);
          if (smp.s - bs.radius > 450) o.userData.noReflect = true;
        });
      }
      if (res) loaded.push({ name, ...res });
      console.log(`[module] ${name} ${(performance.now() - t0).toFixed(0)} ms`);
    } catch (e) {
      console.error(`[module] ${name} failed:`, e);
    }
  }

  // ---------------------------------------------------------------- ship shadows on the water
  root.updateMatrixWorld(true);
  if (water) {
    const u = water.material.uniforms;
    u.uGrime.value = getTextures().grime;
    const shipList = [];
    const addShip = (obj, L, B, H) => {
      const e = obj.matrixWorld.elements, p = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
      const len = Math.hypot(e[0], e[2]);
      shipList.push([p.x, p.z, e[0] / len, -e[2] / len, L / 2, B / 2, H]);
    };
    const specOf = (g) => g.userData.spec;
    addShip(titanicSlot, SHIPS.titanic.L, SHIPS.titanic.B, (titanic.userData.boatDeckY || 19) * 0.9);
    ships.traverse((o) => { if (o !== titanic && specOf(o) && o.parent === ships) addShip(o, specOf(o).L, specOf(o).B, o.userData.boatDeckY * 0.9); });
    for (const o of [oceanic, newyork]) addShip(o, specOf(o).L, specOf(o).B, o.userData.boatDeckY * 0.9);
    for (const t of tugs) addShip(t, t.userData.L, 7, 5);
    shipList.slice(0, 16).forEach(([x, z, c, sn, hl, hb, h], i) => {
      u.uShipPose.value[i].set(x, z, c, sn);
      u.uShipDim.value[i].set(hl, hb, h, 0);
    });
    u.uShipCount.value = Math.min(shipList.length, 16);
  }

  // ---------------------------------------------------------------- flags stream downwind (NW wind → toward SE)
  root.traverse((o) => {
    if (!o.isMesh || o.name !== 'flags' || !o.geometry.attributes.aFlag) return;
    const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
    const d = WIND.clone().normalize().transformDirection(inv);
    d.y = 0; d.normalize();
    const pa = o.geometry.attributes.position, fa = o.geometry.attributes.aFlag;
    for (let i = 0; i < pa.count; i++) {
      const fu = fa.getX(i), len = fa.getY(i);
      const hx = pa.getX(i) + fu * len; // hoist x (flags were built flying toward -X)
      pa.setX(i, hx + d.x * fu * len);
      pa.setZ(i, pa.getZ(i) + d.z * fu * len);
    }
    pa.needsUpdate = true;
    o.geometry.computeVertexNormals();
  });

  // ---------------------------------------------------------------- smoke & gulls
  const smoke = new Smoke();
  const v = new THREE.Vector3();
  for (const t of tugs) for (const f of t.userData.funnelTops) smoke.add(t.localToWorld(v.copy(f)), { count: 70, life: 22, size: 1.1, rise: 6.0, spread: 0.45, dark: 0.95, opacity: 0.16 });
  if (titanic.userData.funnelTops) {
    // only the first three funnels were connected to boilers; light haze at departure
    titanic.userData.funnelTops.slice(0, 3).forEach((f) => smoke.add(titanic.localToWorld(v.copy(f)), { count: 90, life: 45, size: 4.5, rise: 2.5, spread: 0.7, dark: 0.7, opacity: 0.1 }));
  }
  for (const m of loaded) for (const c of (m.chimneys || []).slice(0, 400)) {
    const p = c.isVector3 ? c : new THREE.Vector3(...c);
    smoke.add(p, { count: 10, life: 22, size: 2.4, rise: 0.8, spread: 0.7, dark: 0.35, opacity: 0.18 });
  }
  if (smoke.emitters.length) root.add(smoke.build());
  const gulls = createGulls([
    { x: 60, z: 40, y: 12, h: 45, r: 260, count: 36 },
    { x: 240, z: 780, y: 8, h: 30, r: 200, count: 18 },
    { x: -500, z: 300, y: 3, h: 20, r: 300, count: 22 },
  ], mulberry32(77));
  root.add(gulls);

  return {
    root, dockFrame, dock, titanicSlot, terrain, tugs, modules: loaded, ctx, smoke, gulls,
    update(t, dt, camera) {
      for (const m of loaded) m.update?.(t, dt, camera);
      if (smoke.mesh) smoke.update(t, camera, atmo);
      gulls.material.uniforms.uTime.value = t;
      const L = atmo.sun.intensity / Math.PI * 0.5 + atmo.horizonAway.g * 0.5;
      gulls.material.uniforms.uLight.value.setRGB(L, L, L * 0.97);
    },
  };
}
