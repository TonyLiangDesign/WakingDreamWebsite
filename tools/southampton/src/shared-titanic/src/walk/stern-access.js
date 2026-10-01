import * as THREE from 'three';
import { buildRegion, STERN } from '../../docs/claude-handoff/C65/region.mjs';
import { uvBox, uvCyl } from './materials.js';

// Only C65 stairs and upper drop-edge rails: no new doorways, decks or hull.
export function buildSternAccess(materials, invisible) {
  const source = buildRegion(THREE).getObjectByName('poop-front');
  const root = new THREE.Group(), collide = [];
  root.name = 'SternAccess:C65';
  root.userData = { source: 'C65-R1', placementStatus: 'engineering-provisional' };
  const palette = {'ebe5d6': materials.white, 'd6d0c0': materials.trim, '8a5a33': materials.wood, 'ffffff': materials.teak};
  let serial = 0;
  for (const part of source.children.filter(o => o.name.startsWith('stair-') || (o.isMesh && o.position.y > STERN.POOP_Y))) {
    const copy = part.clone(true), solidMeshes = [];
    copy.traverse(o => {
      if (!o.isMesh) return;
      o.geometry = o.geometry.clone(); o.name = `SternAccess:${o.userData.role || 'visual'}-${serial++}`;
      if (o.material.visible === false) { o.material = invisible; collide.push(o); }
      else {
        o.material = palette[o.material.color.getHexString()] ?? materials.trim;
        if (o.geometry.type === 'CylinderGeometry') uvCyl(o); else uvBox(o);
        if (o.userData.role) solidMeshes.push(o);
      }
    });
    root.add(copy);
    for (const mesh of solidMeshes) {
      const proxy = mesh.clone(); proxy.material = invisible; proxy.name = `Collision:${mesh.name}`;
      mesh.parent.add(proxy); collide.push(proxy);
    }
  }
  root.userData.collide = collide;
  return root;
}
