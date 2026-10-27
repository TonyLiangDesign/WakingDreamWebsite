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

// ---------- procedural surface maps (made once per page, shared by every build) ----------

// Park-Miller generator: the maps are the same on every load, so screenshots stay comparable.
function rng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// Tileable value-noise height field of size n x n: the sum of [frequency, amplitude] octaves,
// each frequency a whole number of cells per tile so the field wraps.
function noiseField(n, octaves, seed) {
  const r = rng(seed);
  const h = new Float32Array(n * n);
  const ease = (u) => u * u * (3 - 2 * u);
  for (const [f, amp] of octaves) {
    const g = Array.from({ length: f * f }, r);
    for (let y = 0; y < n; y++) {
      const gy = (y / n) * f;
      const iy = Math.floor(gy);
      const sy = ease(gy - iy);
      const y0 = (iy % f) * f;
      const y1 = ((iy + 1) % f) * f;
      for (let x = 0; x < n; x++) {
        const gx = (x / n) * f;
        const ix = Math.floor(gx);
        const sx = ease(gx - ix);
        const x0 = ix % f;
        const x1 = (ix + 1) % f;
        const top = g[y0 + x0] + (g[y0 + x1] - g[y0 + x0]) * sx;
        const bot = g[y1 + x0] + (g[y1 + x1] - g[y1 + x0]) * sx;
        h[y * n + x] += amp * (top + (bot - top) * sy);
      }
    }
  }
  return h;
}

// Tangent-space normal map from a wrapping height field (strength: slope per unit height).
function normalMapFrom(h, n, strength, repeat) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = h[y * n + ((x + 1) % n)] - h[y * n + ((x - 1 + n) % n)];
      const dy = h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x];
      const nx = -dx * strength;
      const ny = dy * strength;
      const l = Math.hypot(nx, ny, 1);
      const i = (y * n + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  return texture;
}

// Orange peel: the fine, even dimpling a sprayed two-pack topcoat flows out to. One tile is
// 60 mm of plate (the topsides carry texture coordinates in metres), dimples about 1-2 mm. It
// only shows where a sharp highlight crosses the paint, as a fine shimmer at its edges.
function orangePeel() {
  const n = 256;
  return normalMapFrom(noiseField(n, [[40, 1], [80, 0.5]], 11), n, 1.6, 1 / 0.06);
}

// Paint tone: a very slow +-3 % drift in the topcoat. Each topside plate is offset into it by
// several metres, so neighbouring sheets come out a shade apart, as panels sprayed in turn do.
function paintTone() {
  const n = 64;
  const h = noiseField(n, [[2, 1], [4, 0.6], [8, 0.25]], 5);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(n, n);
  h.forEach((v, i) => {
    const u = (v - lo) / (hi - lo || 1);
    const g = 244 + u * 11;
    img.data[i * 4] = g;
    img.data[i * 4 + 1] = g - 0.6 + u * 0.6;
    img.data[i * 4 + 2] = g - 1 + u;
    img.data[i * 4 + 3] = 255;
  });
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / 6, 1 / 6);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Marine vinyl: a fine pebbled grain, so the upholstery breaks its highlight up like leather-
// look vinyl instead of reading as moulded plastic.
function vinylGrain() {
  const n = 256;
  return normalMapFrom(noiseField(n, [[64, 1], [128, 0.5], [16, 0.25]], 23), n, 2.2, 6);
}

// Shared materials. Many parts build on these directly, so each one is tuned to read as its
// real counterpart under both the studio softboxes and the open-water sky:
//   paint      two-pack polyurethane over alloy plate: a pigmented, low-specular base under a
//              hard clearcoat with orange peel. The clearcoat gives the crisp but slightly
//              broken reflection; the base no longer adds the broad soft sheen of plastic.
//   trim       gloss white (or charcoal / matched) on the cabin, console and mouldings: the same
//              two-layer build, like gelcoat, with a smoother film than the sprayed topsides.
//   seat       marine vinyl: grained, satin, a soft broad highlight and a faint lacquer layer.
//   rubber     EPDM and moulded rubber: near-matt black with a dusty grazing sheen.
//   stainless  polished 316: steel-toned reflectance and a sharp highlight, so tubes show clean
//              light and dark streaks instead of a grey satin sheen.
//   glass      clear dielectric with a slight grey-green body; reflections, not tint, carry it.
//   nonslip    raised-dot tread with relief, very rough.
//   led        a domed lens over the emitter: glossy cap, emissive 1.5.
export function createMaterials() {
  const brushed = brushedTexture();
  const tread = treadTexture();
  const m = {
    paint: new THREE.MeshPhysicalMaterial({
      roughness: 0.5, specularIntensity: 0.35, map: paintTone(),
      clearcoat: 1, clearcoatRoughness: 0.035, clearcoatNormalMap: orangePeel(), clearcoatNormalScale: new THREE.Vector2(0.02, 0.02),
      side: THREE.DoubleSide,
    }),
    alloy: new THREE.MeshPhysicalMaterial({ color: '#b8bdc1', metalness: 1, roughness: 0.48, roughnessMap: brushed, side: THREE.DoubleSide }),
    deck: new THREE.MeshStandardMaterial({ color: '#c9ccca', roughness: 0.6, side: THREE.DoubleSide }),
    nonslip: new THREE.MeshStandardMaterial({ color: '#d6d8d6', map: tread, bumpMap: tread, bumpScale: 1.2, roughness: 0.95, side: THREE.DoubleSide }),
    screen: new THREE.MeshStandardMaterial({ color: '#05080b', emissive: '#ffffff', emissiveMap: chartTexture(), emissiveIntensity: 0.55, roughness: 0.12 }),
    dash: new THREE.MeshStandardMaterial({ color: '#2b2e31', roughness: 0.5, side: THREE.DoubleSide }),
    lens: new THREE.MeshPhysicalMaterial({ color: '#f4f6f8', emissive: '#fff4dc', emissiveIntensity: 0.4, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 }),
    navRed: new THREE.MeshStandardMaterial({ color: '#5a0d0d', emissive: '#e0261d', emissiveIntensity: 0.8, roughness: 0.2 }),
    navGreen: new THREE.MeshStandardMaterial({ color: '#0b3d1c', emissive: '#1fc85a', emissiveIntensity: 0.8, roughness: 0.2 }),
    trim: new THREE.MeshPhysicalMaterial({ roughness: 0.42, specularIntensity: 0.5, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#1a2724', metalness: 0, roughness: 0.02, ior: 1.52, transparent: true, opacity: 0.5, envMapIntensity: 1.6 }),
    rubber: new THREE.MeshPhysicalMaterial({ color: '#131415', roughness: 0.86, specularIntensity: 0.6, sheen: 0.35, sheenColor: '#3a3d40', sheenRoughness: 0.7 }),
    stainless: new THREE.MeshStandardMaterial({ color: '#cdd1d4', metalness: 1, roughness: 0.075 }),
    cowling: new THREE.MeshPhysicalMaterial({ roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.06 }),
    decal: new THREE.MeshStandardMaterial({ color: '#7b8187', roughness: 0.4, metalness: 0.4 }),
    prop: new THREE.MeshStandardMaterial({ color: '#c9ccce', metalness: 1, roughness: 0.18, side: THREE.DoubleSide }),
    galv: new THREE.MeshStandardMaterial({ color: '#a7acae', metalness: 0.85, roughness: 0.55, roughnessMap: brushed }),
    tyre: new THREE.MeshStandardMaterial({ color: '#111213', roughness: 0.92 }),
    carpet: new THREE.MeshStandardMaterial({ color: '#2b2e30', roughness: 1 }),
    seat: new THREE.MeshPhysicalMaterial({
      color: '#e7e4dd', roughness: 0.56, specularIntensity: 0.7, normalMap: vinylGrain(), normalScale: new THREE.Vector2(0.25, 0.25),
      clearcoat: 0.12, clearcoatRoughness: 0.4, sheen: 0.2, sheenColor: '#ffffff', sheenRoughness: 0.5,
    }),
    rod: new THREE.MeshStandardMaterial({ color: '#16181a', roughness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.82 }),
    tailLight: new THREE.MeshStandardMaterial({ color: '#5a0d0d', emissive: '#d4231c', emissiveIntensity: 0.6 }),
    led: new THREE.MeshPhysicalMaterial({ color: '#0b2a4a', emissive: '#3fa9ff', emissiveIntensity: 1.5, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 }),
  };
  return m;
}

const hex = (list, id) => list.find((item) => item.id === id);

export function applyBuild(m, build) {
  const hull = hex(HULL_COLOURS, build.hull);
  if (hull.metal) {
    // Bare hulls skin the topsides in the hull's own mill-plate material (hull.js); m.paint
    // only stays metallic, which is how topsideMaterial() tells the two apart.
    m.paint.color.set('#c3c8cb');
    m.paint.metalness = 1;
    m.paint.roughness = 0.44;
    m.paint.clearcoat = 0;
  } else {
    m.paint.color.set(hull.hex);
    m.paint.metalness = 0;
    m.paint.roughness = 0.5;
    m.paint.clearcoat = 1;
  }
  m.paint.needsUpdate = true;

  const trim = hex(TRIM_COLOURS, build.trim);
  m.trim.color.set(trim.hex || (hull.metal ? '#c3c8cb' : hull.hex));
  const bareTrim = !trim.hex && hull.metal;
  m.trim.metalness = bareTrim ? 1 : 0;
  m.trim.roughness = bareTrim ? 0.38 : 0.42;
  m.trim.specularIntensity = bareTrim ? 1 : 0.5;
  m.trim.clearcoat = bareTrim ? 0 : 1;

  const cowl = hex(COWLINGS, build.cowling);
  m.cowling.color.set(cowl.hex);
  m.decal.color.set(build.cowling === 'white' ? '#3a3f45' : '#9aa1a8');
}

// Light paint takes dark lettering; dark paint and bare alloy take white or graphite.
export function letteringColour(build) {
  return ['white', 'sand', 'alloy'].includes(build.hull) ? '#1d232b' : '#f2f1ec';
}
