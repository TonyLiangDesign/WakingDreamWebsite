import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeStatic } from '../src/boat/kit.js';

function triangles(geometry, attribute) {
  const a = geometry.getAttribute(attribute), result = [];
  for (let i = 0; i < (geometry.index?.count ?? a.count); i++) {
    const j = geometry.index ? geometry.index.getX(i) : i;
    for (let k = 0; k < a.itemSize; k++) result.push(a.array[j * a.itemSize + k]);
  }
  return result;
}

test('indexed merge preserves every triangle, normal and UV after nested transforms', () => {
  const root = new THREE.Group(), nested = new THREE.Group();
  root.add(nested); nested.position.set(1, 2, -3); nested.rotation.y = 0.7;
  const material = new THREE.MeshStandardMaterial();
  const a = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const b = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10).toNonIndexed(), material);
  a.scale.set(1, 2, 0.7); b.rotation.z = 0.5; b.position.x = 3;
  nested.add(a, b); root.updateMatrixWorld(true);
  const expected = [a, b].map(m => m.geometry.clone().applyMatrix4(m.matrixWorld));
  const merged = mergeStatic(root);
  assert.equal(merged.children.length, 1);
  const geometry = merged.children[0].geometry;
  for (const key of ['position', 'normal', 'uv']) {
    const actual = triangles(geometry, key), wanted = expected.flatMap(g => triangles(g, key));
    assert.equal(actual.length, wanted.length);
    for (let i = 0; i < actual.length; i++) assert.ok(Math.abs(actual[i] - wanted[i]) < 1e-6, `${key} ${i}`);
  }
  assert.ok(geometry.attributes.position.count < geometry.index.count);
});

test('keeps distinct shadow settings and materials in separate buckets', () => {
  const group = new THREE.Group(), material = new THREE.MeshBasicMaterial();
  for (const [cast, receive] of [[true,true],[true,false],[false,true]]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.castShadow = cast; mesh.receiveShadow = receive; group.add(mesh);
  }
  const merged = mergeStatic(group);
  assert.deepEqual(merged.children.map(m => [m.castShadow,m.receiveShadow]), [[true,true],[true,false],[false,true]]);
});

test('fills absent UVs and uses 32-bit indices beyond 65535 vertices', () => {
  const group = new THREE.Group(), g = new THREE.BufferGeometry();
  const positions = new Float32Array(65538 * 3);
  g.setAttribute('position',new THREE.BufferAttribute(positions,3));
  group.add(new THREE.Mesh(g,new THREE.MeshBasicMaterial()));
  const merged = mergeStatic(group).children[0].geometry;
  assert.ok(merged.index.array instanceof Uint32Array);
  assert.equal(merged.index.getX(65537),65537);
  assert.ok(merged.attributes.uv.array.every(x => x === 0));
});
