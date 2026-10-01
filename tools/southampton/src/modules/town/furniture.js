// Street furniture: gas lamps, tram traction poles with span & contact wires, parked carts and handcarts.
// Instanced (one draw call per kind) plus one LineSegments for all overhead wires.
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function paintGeo(THREE, g, color) {
  const n = g.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
}
const at = (THREE, g, x, y, z, rx = 0, ry = 0, rz = 0) => g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));

export function buildFurniture(ctx, items) {
  const { THREE } = ctx;
  const group = new THREE.Group();
  group.name = 'town-furniture';
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15, name: 'townFurniture' });
  let tris = 0;
  const iron = 0x1c211e, green = 0x1f2b22;

  // gas lamp: fluted post, cross-bar, square lantern with glazing
  const lamp = mergeGeometries([
    paintGeo(THREE, at(THREE, new THREE.CylinderGeometry(0.16, 0.2, 0.7, 5, 1, true), 0, 0.35, 0), iron),
    paintGeo(THREE, at(THREE, new THREE.CylinderGeometry(0.06, 0.09, 3.2, 4, 1, true), 0, 2.2, 0), iron),
    paintGeo(THREE, at(THREE, new THREE.BoxGeometry(0.7, 0.05, 0.05), 0, 3.5, 0), iron),
    paintGeo(THREE, at(THREE, new THREE.CylinderGeometry(0.26, 0.13, 0.5, 4, 1, true), 0, 4.0, 0, 0, Math.PI / 4, 0), 0xbfbbaa),
    paintGeo(THREE, at(THREE, new THREE.ConeGeometry(0.3, 0.3, 4), 0, 4.4, 0, 0, Math.PI / 4, 0), iron),
  ]);
  // traction pole: tapering tube, collar rings, bracket arm toward the street, finial
  const pole = mergeGeometries([
    paintGeo(THREE, at(THREE, new THREE.CylinderGeometry(0.09, 0.15, 8.4, 6, 1, true), 0, 4.2, 0), green),
    paintGeo(THREE, at(THREE, new THREE.CylinderGeometry(0.2, 0.22, 1.4, 6, 1, true), 0, 0.7, 0), green),
    paintGeo(THREE, at(THREE, new THREE.BoxGeometry(2.6, 0.08, 0.08), 1.3, 6.9, 0), green),
    paintGeo(THREE, at(THREE, new THREE.ConeGeometry(0.14, 0.5, 4), 0, 8.65, 0), green),
  ]);
  // two-wheeled cart / costermonger's barrow
  const wheel = (x, z, r) => paintGeo(THREE, at(THREE, new THREE.CylinderGeometry(r, r, 0.08, 8, 1, false), x, r, z, Math.PI / 2, 0, 0), 0x2a2018);
  const cart = mergeGeometries([
    paintGeo(THREE, at(THREE, new THREE.BoxGeometry(1.5, 0.5, 2.6), 0, 1.05, 0), 0x5c4632),
    paintGeo(THREE, at(THREE, new THREE.BoxGeometry(1.4, 0.15, 2.5), 0, 1.35, 0), 0x3e2e22),
    wheel(0.8, 0.1, 0.72), wheel(-0.8, 0.1, 0.72),
    paintGeo(THREE, at(THREE, new THREE.BoxGeometry(0.07, 0.07, 2.2), 0.5, 0.75, 2.2, -0.25, 0, 0), 0x4a3a2a),
    paintGeo(THREE, at(THREE, new THREE.BoxGeometry(0.07, 0.07, 2.2), -0.5, 0.75, 2.2, -0.25, 0, 0), 0x4a3a2a),
  ]);
  const barrow = mergeGeometries([
    paintGeo(THREE, at(THREE, new THREE.BoxGeometry(0.9, 0.35, 1.6), 0, 0.75, 0), 0x6a5238),
    wheel(0.5, 0.2, 0.45), wheel(-0.5, 0.2, 0.45),
    paintGeo(THREE, at(THREE, new THREE.BoxGeometry(0.05, 0.05, 1.2), 0.35, 0.7, 1.2, -0.3, 0, 0), 0x4a3a2a),
    paintGeo(THREE, at(THREE, new THREE.BoxGeometry(0.05, 0.05, 1.2), -0.35, 0.7, 1.2, -0.3, 0, 0), 0x4a3a2a),
  ]);

  const inst = (geo, list, name) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    list.forEach((it, i) => { M.compose(p.set(it[0], it[1], it[2]), q.setFromEuler(e.set(0, it[3] || 0, 0)), s); im.setMatrixAt(i, M); });
    im.computeBoundingSphere();
    im.castShadow = true; im.receiveShadow = true;
    im.name = name;
    group.add(im);
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3 * list.length;
  };
  inst(lamp, items.lamps, 'lamps');
  inst(pole, items.poles, 'tramPoles');
  inst(cart, items.carts, 'carts');
  inst(barrow, items.barrows, 'barrows');

  if (items.wires.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(items.wires), 3));
    // thin wires only read up close: fade them out with distance so they never draw as black strokes from the air
    const wm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `#include <common>
        #include <logdepthbuf_pars_vertex>
        varying float vD;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
        }`,
      fragmentShader: `#include <common>
        #include <logdepthbuf_pars_fragment>
        varying float vD;
        void main() {
        #include <logdepthbuf_fragment>
        gl_FragColor = vec4(0.05, 0.05, 0.05, 0.85 * (1.0 - smoothstep(60.0, 260.0, vD))); }`,
    });
    const lines = new THREE.LineSegments(g, wm);
    lines.frustumCulled = false;
    lines.name = 'tramWires';
    group.add(lines);
  }
  return { group, tris };
}
