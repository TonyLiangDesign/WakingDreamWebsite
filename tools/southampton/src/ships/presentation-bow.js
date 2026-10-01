import * as THREE from 'three';
import { station, hullTop } from '../shared-titanic/src/ship/hull.js';
import { WATERLINE, KEEL } from '../shared-titanic/src/presentation/dimensions.js';

// Port-only close-up fittings, in the exterior's authored frame. Call before
// bakeStatic / applyShipRegistration so all parts receive registration once.
function shellPoint(side, z, y, offset = 0) {
  const [x, zz] = station(z, y);
  const [xa, za] = station(z - .025, y), [xb, zb] = station(z + .025, y);
  const normal = new THREE.Vector3(side * (zb - za), 0, -(xb - xa)).normalize();
  return { point: new THREE.Vector3(side * x, y, zz).addScaledVector(normal, offset), normal };
}

function curvedDecal(side, z, y, width, height, material) {
  // Curvature matters at the fine entrance: a tangent-plane label otherwise
  // intersects the plating at its ends or floats above it at the centre.
  const geometry = new THREE.BufferGeometry(), p = [], uv = [], indices = [];
  const segments = 24;
  for (let i = 0; i <= segments; i++) {
    const zz = z + width * (i / segments - .5);
    for (const dy of [-height / 2, height / 2]) {
      p.push(...shellPoint(side, zz, y + dy, .028).point.toArray());
      // Bow runs right-to-left on port and left-to-right on starboard.
      uv.push(side > 0 ? 1 - i / segments : i / segments, dy > 0 ? 1 : 0);
    }
    if (i < segments) {
      const a = i * 2;
      indices.push(...(side > 0 ? [a, a + 1, a + 2, a + 1, a + 3, a + 2] : [a, a + 2, a + 1, a + 1, a + 2, a + 3]));
    }
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

export function applyPortBowDetails(authored) {
  if (authored.userData.portBowDetails) return authored.userData.portBowDetails;
  const group = new THREE.Group(); group.name = 'PortBowCloseDetails';
  const iron = new THREE.MeshStandardMaterial({ color: '#303638', roughness: .76, metalness: .25 });
  const shadow = new THREE.MeshStandardMaterial({ color: '#080b0c', roughness: 1 });
  const stemFinish = new THREE.MeshStandardMaterial({ color: '#20272a', roughness: .69, metalness: .18 });
  const fairleadStations = [121.2, 127.8, 134.4];
  const replacedOpenings = [];
  authored.traverse(o => {
    if (o.geometry?.type === 'CircleGeometry' && o.geometry.parameters.radius === .135
      && fairleadStations.some(z => Math.abs(o.position.z - z) < 1)) replacedOpenings.push(o);
  });
  for (const opening of replacedOpenings) opening.removeFromParent();

  // A narrow forged stem cap follows the existing rake, rather than adding a
  // projecting modern bulb or changing the fine bow's registered extremity.
  const stem = [];
  for (let i = 0; i <= 48; i++) {
    const y = THREE.MathUtils.lerp(WATERLINE - 2, hullTop(146) - .055, i / 48);
    const [, z] = station(146, y);
    stem.push(new THREE.Vector3(0, y, z - .042));
  }
  const stemMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stem), 64, .04, 8, false), stemFinish);
  stemMesh.name = 'ForgedStemCap'; group.add(stemMesh);

  // Deck-level closed roller fairleads: dark recessed throat and a cast rim,
  // rather than flat discs. Keep clear of the anchor's hawse at z=138.5.
  for (const side of [-1, 1]) for (const z of fairleadStations) {
    const y = hullTop(z) - .44, { point, normal } = shellPoint(side, z, y, .037);
    const fairlead = new THREE.Group(); fairlead.position.copy(point);
    fairlead.lookAt(point.clone().add(normal)); fairlead.name = 'ForecastleFairlead';
    const face = new THREE.Mesh(new THREE.CircleGeometry(1, 32), shadow);
    face.scale.set(.34, .15, 1); fairlead.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1, .11, 6, 32), iron);
    rim.scale.set(.34, .15, .22); rim.position.z = .025; fairlead.add(rim);
    for (const sign of [-1, 1]) {
      const roller = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .22, 10), iron);
      roller.position.set(sign * .26, 0, .045); fairlead.add(roller);
    }
    group.add(fairlead);
  }

  // Period-style imperial draft numerals, six inches high. The displayed keel
  // is the model's engineering datum, not a claim about the sailing-day load.
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const marks = [];
  for (let feet = 34; feet <= 48; feet += 2) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#d8d3bb'; ctx.font = 'bold 176px serif'; ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic'; ctx.fillText(String(feet), 256, 210);
    // Each numeral has its own small immutable atlas tile after CanvasTexture
    // creation; the same tile is shared by both sides of the bow.
    const tile = document.createElement('canvas'); tile.width = 512; tile.height = 256;
    tile.getContext('2d').drawImage(canvas, 0, 0);
    const texture = new THREE.CanvasTexture(tile); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false,
      roughness: .83, polygonOffset: true, polygonOffsetFactor: -2 });
    const y = KEEL + feet * .3048 + .102;
    for (const side of [-1, 1]) {
      const label = curvedDecal(side, 142.15, y, .53, .245, material);
      label.name = `BowDraft${feet}ft`; group.add(label);
    }
    marks.push({ feet, y: y - WATERLINE, station: 142.15 });
  }

  group.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  authored.add(group);
  const report = { version: 1, group: group.name, fairleads: 6, draftMarks: marks, maxAuthorZ: 146 };
  authored.userData.portBowDetails = report;
  return report;
}
