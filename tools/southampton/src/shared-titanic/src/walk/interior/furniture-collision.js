import * as THREE from 'three';
import { INVIS } from './kit.js';

// A conservative footprint for static furniture sets. The caller attaches
// these objects directly to its untransformed room root before static baking.
export function furnitureCollision(room, colliders, furniture, name) {
  furniture.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(furniture);
  const size = bounds.getSize(new THREE.Vector3());
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), INVIS);
  proxy.position.copy(bounds.getCenter(new THREE.Vector3()));
  proxy.name = `Furniture:${name}`;
  proxy.userData.furnitureBounds = {min: bounds.min.toArray(), max: bounds.max.toArray()};
  room.add(proxy); colliders.push(proxy);
}
