import * as THREE from 'three';
import { flagMaterial } from './materials.js';

// Flags (one shared canvas atlas, waving in the vertex shader) and painted hull names.

const AW = 1024, AH = 1024;
const CELLS = {
  redEnsign: [0, 0, 512, 256], blueEnsign: [512, 0, 512, 256],
  usFlag: [0, 256, 512, 256], whiteStar: [512, 256, 512, 256],
  bluePeter: [0, 512, 512, 256], americanLine: [512, 512, 512, 256],
  royalMail: [0, 768, 1024, 128],
};

function unionJack(g, x, y, w, h) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#1f2a5c'; g.fillRect(x, y, w, h);
  const t = h / 30;
  const diag = (width, color) => {
    g.strokeStyle = color; g.lineWidth = width;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + h); g.moveTo(x + w, y); g.lineTo(x, y + h); g.stroke();
  };
  diag(6 * t, '#f2efe6'); diag(2 * t, '#b3202a');
  g.fillStyle = '#f2efe6'; g.fillRect(x + w / 2 - 5 * t, y, 10 * t, h); g.fillRect(x, y + h / 2 - 5 * t, w, 10 * t);
  g.fillStyle = '#b3202a'; g.fillRect(x + w / 2 - 3 * t, y, 6 * t, h); g.fillRect(x, y + h / 2 - 3 * t, w, 6 * t);
  g.restore();
}
function star(g, cx, cy, r, color) {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.4 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}
function swallowtail(g, x, y, w, h, color) {
  g.fillStyle = color; g.beginPath();
  g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w * 0.72, y + h / 2); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); g.fill();
}

let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  const g = c.getContext('2d');
  g.clearRect(0, 0, AW, AH);
  const pad = 4;
  const cell = (k) => { const [x, y, w, h] = CELLS[k]; return [x + pad, y + pad, w - 2 * pad, h - 2 * pad]; };
  // Red & Blue Ensigns
  for (const [k, col] of [['redEnsign', '#b1262b'], ['blueEnsign', '#1f2a5c']]) {
    const [x, y, w, h] = cell(k);
    g.fillStyle = col; g.fillRect(x, y, w, h);
    unionJack(g, x, y, w / 2, h / 2);
  }
  // United States, 48 stars (1912)
  {
    const [x, y, w, h] = cell('usFlag');
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f2efe6' : '#b22234'; g.fillRect(x, y + (i * h) / 13, w, h / 13 + 1); }
    const cw = w * 0.4, ch = (h * 7) / 13;
    g.fillStyle = '#3c3b6e'; g.fillRect(x, y, cw, ch);
    for (let r = 0; r < 6; r++) for (let q = 0; q < 8; q++) star(g, x + ((q + 0.5) * cw) / 8, y + ((r + 0.5) * ch) / 6, ch / 16, '#f2efe6');
  }
  // White Star Line house flag: red swallowtail, white star
  {
    const [x, y, w, h] = cell('whiteStar');
    swallowtail(g, x, y, w, h, '#b1262b');
    star(g, x + w * 0.34, y + h / 2, h * 0.3, '#f2efe6');
  }
  // Blue Peter
  {
    const [x, y, w, h] = cell('bluePeter');
    g.fillStyle = '#1f3f8f'; g.fillRect(x, y, w, h);
    g.fillStyle = '#f2efe6'; g.fillRect(x + w / 3, y + h / 3, w / 3, h / 3);
  }
  // American Line house flag (simplified): blue swallowtail with a white spread eagle
  {
    const [x, y, w, h] = cell('americanLine');
    swallowtail(g, x, y, w, h, '#1f2a5c');
    const cx = x + w * 0.33, cy = y + h * 0.5, s = h * 0.32;
    g.fillStyle = '#f2efe6'; g.beginPath();
    g.moveTo(cx - s * 1.4, cy - s * 0.5); g.quadraticCurveTo(cx - s * 0.6, cy - s * 0.2, cx - s * 0.2, cy - s * 0.5);
    g.lineTo(cx, cy - s * 0.9); g.lineTo(cx + s * 0.2, cy - s * 0.5); g.quadraticCurveTo(cx + s * 0.6, cy - s * 0.2, cx + s * 1.4, cy - s * 0.5);
    g.quadraticCurveTo(cx + s * 0.7, cy + s * 0.3, cx + s * 0.25, cy + s * 0.2); g.lineTo(cx + s * 0.35, cy + s * 0.9); g.lineTo(cx, cy + s * 0.6);
    g.lineTo(cx - s * 0.35, cy + s * 0.9); g.lineTo(cx - s * 0.25, cy + s * 0.2); g.quadraticCurveTo(cx - s * 0.7, cy + s * 0.3, cx - s * 1.4, cy - s * 0.5);
    g.fill();
  }
  // Royal Mail pennant: long tapering swallowtail, red with "ROYAL MAIL"
  {
    const [x, y, w, h] = cell('royalMail');
    g.fillStyle = '#b1262b'; g.beginPath();
    g.moveTo(x, y); g.lineTo(x + w, y + h * 0.36); g.lineTo(x + w * 0.9, y + h / 2); g.lineTo(x + w, y + h * 0.64); g.lineTo(x, y + h); g.closePath(); g.fill();
    g.fillStyle = '#e8c35a'; g.font = `bold ${Math.round(h * 0.5)}px Georgia, serif`; g.textBaseline = 'middle';
    g.fillText('ROYAL  MAIL', x + w * 0.1, y + h / 2 + 2);
    star(g, x + w * 0.05, y + h / 2, h * 0.22, '#e8c35a');
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  ATLAS = { tex, material: flagMaterial(tex) };
  return ATLAS;
}

// flags: [{ kind, x, y (top of hoist), z, h, len }] in ship-local coordinates; fly streams toward -X
export function flagsMesh(flags, seed = 1) {
  if (!flags.length) return null;
  const A = atlas();
  const pos = [], uv = [], aux = [], nrm = [];
  const NU = 10, NV = 2;
  flags.forEach((f, fi) => {
    const [cx, cy, cw, ch] = CELLS[f.kind];
    const u0 = (cx + 4) / AW, u1 = (cx + cw - 4) / AW, v1 = 1 - (cy + 4) / AH, v0 = 1 - (cy + ch - 4) / AH;
    const ph = seed * 1.7 + fi * 2.3;
    const vert = (i, j) => {
      const fu = i / NU, fv = j / NV;
      return { p: [f.x - fu * f.len, f.y - fv * f.h, f.z], t: [u0 + fu * (u1 - u0), v1 - fv * (v1 - v0)], a: [fu, f.len, ph] };
    };
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const q = [vert(i, j), vert(i + 1, j), vert(i + 1, j + 1), vert(i, j + 1)];
      for (const k of [0, 1, 2, 0, 2, 3]) { pos.push(...q[k].p); uv.push(...q[k].t); aux.push(...q[k].a); nrm.push(0, 0, 1); }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aFlag', new THREE.Float32BufferAttribute(aux, 3));
  g.computeBoundingSphere();
  g.boundingSphere.radius += 3;
  const m = new THREE.Mesh(g, A.material);
  m.name = 'flags';
  m.castShadow = true;
  m.frustumCulled = false;
  return m;
}

// Painted names: bow (both sides) and a strip around the counter with the port of registry.
export function hullNames(hull, { name, port, bowY, sternY, bowX, letterH = 0.8, color = '#d6b25a' }) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  const fit = (text, y, px) => {
    g.font = `bold ${px}px Georgia, 'Times New Roman', serif`;
    const w = g.measureText(text).width;
    const sx = Math.min(1, 980 / (w + text.length * px * 0.18));
    g.save(); g.translate(512, y); g.scale(sx, 1);
    // letter-spaced
    const sp = px * 0.18, total = w + sp * (text.length - 1);
    let xx = -total / 2;
    for (const ch of text) { const cw = g.measureText(ch).width; g.fillText(ch, xx + cw / 2, 0); xx += cw + sp; }
    g.restore();
  };
  fit(name, 64, 104); // row 0: bow / stern name
  if (port) fit(port, 190, 84); // row 1: port of registry
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.35, roughness: 0.5, metalness: 0.3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, name: 'hullName' });
  const pos = [], uv = [], nrm = [];
  const quadStrip = (pts, norms, h, vTop, vBot, reverse) => {
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) {
      const ua = reverse ? 1 - i / n : i / n, ub = reverse ? 1 - (i + 1) / n : (i + 1) / n;
      const a = pts[i], b = pts[i + 1];
      const V = [[a[0], a[1] + h / 2, a[2], ua, vTop], [b[0], b[1] + h / 2, b[2], ub, vTop], [b[0], b[1] - h / 2, b[2], ub, vBot], [a[0], a[1] - h / 2, a[2], ua, vBot]];
      const na = norms[i], nb = norms[i + 1];
      const N = [na, nb, nb, na];
      // wind so the front faces the normal
      const e1 = [V[1][0] - V[0][0], V[1][1] - V[0][1], V[1][2] - V[0][2]], e2 = [V[2][0] - V[0][0], V[2][1] - V[0][1], V[2][2] - V[0][2]];
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const ord = cr[0] * na[0] + cr[1] * na[1] + cr[2] * na[2] >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      for (const k of ord) { pos.push(V[k][0], V[k][1], V[k][2]); uv.push(V[k][3], V[k][4]); nrm.push(...N[k]); }
    }
  };
  const aspect = 1024 / 128; // texture row aspect (width : height) per letter row
  // bow names
  {
    const len = letterH * aspect * 0.95;
    for (const s of [1, -1]) {
      const pts = [], norms = [];
      for (let i = 0; i <= 12; i++) {
        const x = bowX - len + (len * i) / 12, y = bowY(x);
        const hb = hull.hbAt(x, y);
        const hb2 = hull.hbAt(x + 0.5, y);
        const nx = -(hb2 - hb) / 0.5, nz = 1;
        const l = Math.hypot(nx, nz);
        pts.push([x, y, s * (hb + 0.1)]); norms.push([(nx / l), 0, (s * nz) / l]);
      }
      quadStrip(pts, norms, letterH, 1, 0.5, s < 0);
    }
  }
  // stern: arc around the counter, name above port of registry
  if (sternY) {
    const L = hull.outline[hull.outline.length - 1].x - hull.outline[0].x;
    const X0 = hull.outline[0].x;
    for (const [row, dy, vT, vB, hgt] of [[0, 0, 1, 0.5, letterH], [1, -letterH * 1.05, 0.5, 0, letterH * 0.8]]) {
      const y = sternY + dy;
      const sts = hull.stationsX.filter((x) => x < X0 + L * 0.07);
      const port = sts.map((x) => [x, -hull.hbAt(x, y)]).reverse();
      const stbd = sts.map((x) => [x, hull.hbAt(x, y)]);
      const line = [...port, ...stbd].filter((p, i, arr) => i === 0 || Math.hypot(p[0] - arr[i - 1][0], p[1] - arr[i - 1][1]) > 0.05);
      const acc = [0];
      for (let i = 1; i < line.length; i++) acc.push(acc[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
      const mid = acc[acc.length - 1] / 2, half = (hgt * aspect * 0.95) / 2;
      const at = (d) => {
        let i = 1; while (i < acc.length - 1 && acc[i] < d) i++;
        const t = (d - acc[i - 1]) / Math.max(acc[i] - acc[i - 1], 1e-6);
        const p = [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
        const tx = line[i][0] - line[i - 1][0], tz = line[i][1] - line[i - 1][1], tl = Math.hypot(tx, tz) || 1;
        let n = [tz / tl, -tx / tl];
        if (n[0] > 0.2) n = [-n[0], -n[1]];
        return { p, n };
      };
      const pts = [], norms = [];
      for (let i = 0; i <= 16; i++) {
        const { p, n } = at(mid - half + (2 * half * i) / 16);
        pts.push([p[0] + n[0] * 0.08, y, p[1] + n[1] * 0.08]); norms.push([n[0], 0, n[1]]);
      }
      // viewer astern looks +X: screen-right is +Z, text runs from -Z to +Z
      quadStrip(pts, norms, hgt, vT, vB, false);
      void row;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'hullNames';
  return mesh;
}
