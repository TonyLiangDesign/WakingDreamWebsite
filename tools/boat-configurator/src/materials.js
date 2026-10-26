import * as THREE from 'three';
import { HULL_COLOURS, TRIM_COLOURS, COWLINGS } from './config.js';

// Fine fore-and-aft streaks give the plate alloy a brushed, slightly uneven sheen.
function brushedTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    const g = 90 + Math.random() * 90;
    ctx.strokeStyle = `rgba(${g},${g},${g},${0.08 + Math.random() * 0.18})`;
    ctx.lineWidth = Math.random() * 1.4 + 0.3;
    const y = Math.random() * size;
    const x = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x - 60 - Math.random() * 120, y);
    ctx.lineTo(x + 60 + Math.random() * 120, y + (Math.random() - 0.5) * 1.5);
    ctx.stroke();
  }
  // Broad, soft patches so the plate never reads as one even sheen.
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 50 + Math.random() * 90;
    const v = Math.random() < 0.5 ? 100 : 160;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${v},${v},${v},0.07)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 3);
  texture.anisotropy = 8;
  return texture;
}

// Sawn timber for the display cradle: running grain with tone variation and the odd knot.
function woodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#8f6a43';
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * 128;
    const t = Math.random() < 0.5 ? 'rgba(60,38,20,' : 'rgba(190,150,105,';
    ctx.strokeStyle = `${t}${0.12 + Math.random() * 0.22})`;
    ctx.lineWidth = 0.6 + Math.random() * 1.8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 2.5);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 128;
    ctx.fillStyle = 'rgba(55,32,15,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Raised-dot non-slip pattern for the cockpit floor, side decks and platforms.
function treadTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#9a9e9d';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 16) {
    for (let x = (y / 16) % 2 ? 8 : 0; x < size; x += 16) {
      ctx.fillStyle = '#c4c8c6';
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Generic chart-plotter page for the helm screens: water, a headland, contours and a track.
function chartTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d3a57';
  ctx.fillRect(0, 0, 256, 160);
  ctx.strokeStyle = 'rgba(160,210,240,0.35)';
  for (const r of [70, 95, 120]) {
    ctx.beginPath();
    ctx.ellipse(40, 20, r * 1.4, r, 0.3, 0, Math.PI);
    ctx.stroke();
  }
  ctx.fillStyle = '#c9b27a';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(120, 0);
  ctx.bezierCurveTo(110, 40, 70, 30, 60, 70);
  ctx.bezierCurveTo(40, 90, 10, 80, 0, 100);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, 140);
  ctx.lineTo(150, 95);
  ctx.lineTo(215, 60);
  ctx.stroke();
  ctx.fillStyle = '#ffb347';
  ctx.beginPath();
  ctx.moveTo(150, 88);
  ctx.lineTo(157, 101);
  ctx.lineTo(143, 101);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 140, 256, 20);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createMaterials() {
  const brushed = brushedTexture();
  const tread = treadTexture();
  const m = {
    paint: new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide }),
    alloy: new THREE.MeshPhysicalMaterial({ color: '#b8bdc1', metalness: 1, roughness: 0.48, roughnessMap: brushed, side: THREE.DoubleSide }),
    deck: new THREE.MeshStandardMaterial({ color: '#c9ccca', roughness: 0.88, side: THREE.DoubleSide }),
    nonslip: new THREE.MeshStandardMaterial({ color: '#d6d8d6', map: tread, roughness: 0.95, side: THREE.DoubleSide }),
    screen: new THREE.MeshStandardMaterial({ color: '#05080b', emissive: '#ffffff', emissiveMap: chartTexture(), emissiveIntensity: 0.55, roughness: 0.12 }),
    dash: new THREE.MeshStandardMaterial({ color: '#2b2e31', roughness: 0.55, side: THREE.DoubleSide }),
    lens: new THREE.MeshStandardMaterial({ color: '#f4f6f8', emissive: '#fff4dc', emissiveIntensity: 0.4, roughness: 0.1 }),
    navRed: new THREE.MeshStandardMaterial({ color: '#5a0d0d', emissive: '#e0261d', emissiveIntensity: 0.8 }),
    navGreen: new THREE.MeshStandardMaterial({ color: '#0b3d1c', emissive: '#1fc85a', emissiveIntensity: 0.8 }),
    trim: new THREE.MeshPhysicalMaterial({ roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#0d151a', metalness: 0.1, roughness: 0.03, transparent: true, opacity: 0.6, envMapIntensity: 1.4 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#141516', roughness: 0.72 }),
    stainless: new THREE.MeshStandardMaterial({ color: '#e5e8ea', metalness: 1, roughness: 0.16 }),
    cowling: new THREE.MeshPhysicalMaterial({ roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 }),
    decal: new THREE.MeshStandardMaterial({ color: '#7b8187', roughness: 0.4, metalness: 0.4 }),
    prop: new THREE.MeshStandardMaterial({ color: '#c9ccce', metalness: 1, roughness: 0.22, side: THREE.DoubleSide }),
    galv: new THREE.MeshStandardMaterial({ color: '#a7acae', metalness: 0.85, roughness: 0.55, roughnessMap: brushed }),
    tyre: new THREE.MeshStandardMaterial({ color: '#111213', roughness: 0.92 }),
    carpet: new THREE.MeshStandardMaterial({ color: '#2b2e30', roughness: 1 }),
    seat: new THREE.MeshStandardMaterial({ color: '#e7e4dd', roughness: 0.62 }),
    rod: new THREE.MeshStandardMaterial({ color: '#16181a', roughness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.82 }),
    tailLight: new THREE.MeshStandardMaterial({ color: '#5a0d0d', emissive: '#d4231c', emissiveIntensity: 0.6 }),
    led: new THREE.MeshStandardMaterial({ color: '#0b2a4a', emissive: '#3fa9ff', emissiveIntensity: 1.5 }),
  };
  return m;
}

const hex = (list, id) => list.find((item) => item.id === id);

export function applyBuild(m, build) {
  const hull = hex(HULL_COLOURS, build.hull);
  if (hull.metal) {
    m.paint.color.set('#c3c8cb');
    m.paint.metalness = 1;
    m.paint.roughness = 0.44;
    m.paint.roughnessMap = m.alloy.roughnessMap;
    m.paint.clearcoat = 0;
  } else {
    m.paint.color.set(hull.hex);
    m.paint.metalness = 0;
    m.paint.roughness = 0.3;
    m.paint.roughnessMap = null;
    m.paint.clearcoat = 1;
  }
  m.paint.needsUpdate = true;

  const trim = hex(TRIM_COLOURS, build.trim);
  m.trim.color.set(trim.hex || (hull.metal ? '#c3c8cb' : hull.hex));
  m.trim.metalness = !trim.hex && hull.metal ? 1 : 0;
  m.trim.roughness = !trim.hex && hull.metal ? 0.38 : 0.28;

  const cowl = hex(COWLINGS, build.cowling);
  m.cowling.color.set(cowl.hex);
  m.decal.color.set(build.cowling === 'white' ? '#3a3f45' : '#9aa1a8');
}

// Light paint takes dark lettering; dark paint and bare alloy take white or graphite.
export function letteringColour(build) {
  return ['white', 'sand', 'alloy'].includes(build.hull) ? '#1d232b' : '#f2f1ec';
}
