import * as THREE from 'three';

// Woodland canopy as draped heightfield sheets (one merged mesh per tile). Geometry
// carries the canopy mass (steep rounded wood edges, rolling top); the fragment shader
// resolves individual tree crowns procedurally (jittered cells → domes with bent
// normals, dark gaps, per-crown species tint), fading to the mean with pixel footprint.
// ~8× fewer triangles than instancing a crown per tree, and it scales to far woods.
//
// canopyAt(x, z, out) must fill out = { h (canopy height above ground, 0 = none), a: Color, b: Color, mix, edge }.

export function buildCanopy({ ground, canopyAt, tiles, material, onEdge, castShadow, colorScale = 1 }) {
  const group = new THREE.Group();
  group.name = 'canopy';
  const out = { h: 0, a: new THREE.Color(), b: new THREE.Color(), mix: 0, edge: 0 };
  let tris = 0;
  const merged = new Map(); // mesh key → { pos, col, colB, idx }
  const border = new Map(); // tile-border vertex position → [[M, vi], ...] (normals averaged across tiles/meshes)

  for (const T of tiles) {
    const { x0, z0, size, key } = T;
    const n = Math.round(size / T.step), step = size / n; // exact divisor so tile borders coincide
    // coarse pre-pass: any canopy in this tile?
    let any = false;
    const cs = Math.max(step, 24);
    for (let z = z0 - cs; z <= z0 + size + cs && !any; z += cs) for (let x = x0 - cs; x <= x0 + size + cs; x += cs) {
      canopyAt(x, z, out);
      if (out.h > 0) { any = true; break; }
    }
    if (!any) continue;
    let M = merged.get(key);
    if (!M) { M = { pos: [], col: [], colB: [], mix: [], idx: [], shadow: T.shadow }; merged.set(key, M); }
    const cols = n + 1;
    const H = new Float32Array(cols * cols);
    const vid = new Int32Array(cols * cols).fill(-1);
    const info = new Array(cols * cols);
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      canopyAt(x, z, out);
      const k = j * cols + i;
      H[k] = out.h;
      if (out.h > 0) info[k] = [out.a.r, out.a.g, out.a.b, out.b.r, out.b.g, out.b.b, out.mix, out.edge];
      if (onEdge && out.edge > 0) onEdge(x, z, out);
    }
    const vert = (i, j) => {
      const k = j * cols + i;
      if (vid[k] >= 0) return vid[k];
      // jitter vertices (hash of world position, so tile borders agree) to break the grid staircase
      const bx = x0 + i * step, bz = z0 + j * step;
      const hs = Math.sin(bx * 12.9898 + bz * 78.233) * 43758.5453, hs2 = Math.sin(bx * 39.3467 + bz * 11.135) * 24634.6345;
      const x = bx + (hs - Math.floor(hs) - 0.5) * 0.6 * step, z = bz + (hs2 - Math.floor(hs2) - 0.5) * 0.6 * step;
      const g = ground.height(x, z);
      const h = H[k];
      vid[k] = M.pos.length / 3;
      M.pos.push(x, h > 0 ? g + h : g - 1.0, z);
      if (i === 0 || j === 0 || i === n || j === n) {
        const bk = Math.round(bx * 10) + ',' + Math.round(bz * 10);
        let e = border.get(bk); if (!e) border.set(bk, e = []);
        e.push([M, vid[k]]);
      }
      const I = info[k] || nearestInfo(i, j);
      const ao = (h > 0 ? 1 : 0.35) * colorScale;
      M.col.push(I[0] * ao, I[1] * ao, I[2] * ao);
      M.colB.push(I[3] * ao, I[4] * ao, I[5] * ao);
      M.mix.push(I[6]);
      return vid[k];
    };
    const nearestInfo = (i, j) => {
      for (let r = 1; r <= 2; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii > n || jj > n) continue;
        const I = info[jj * cols + ii];
        if (I) return I;
      }
      return [0.2, 0.2, 0.18, 0.2, 0.2, 0.18, 0, 0];
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * cols + i, b = a + 1, d = a + cols, e = d + 1;
      const ha = H[a] > 0, hb = H[b] > 0, hd = H[d] > 0, he = H[e] > 0;
      if (!(ha || hb || hd || he)) continue;
      // split along the diagonal that keeps edges tidy
      if (ha || hd || hb) M.idx.push(vert(i, j), vert(i, j + 1), vert(i + 1, j));
      if (hb || hd || he) M.idx.push(vert(i + 1, j), vert(i, j + 1), vert(i + 1, j + 1));
    }
  }

  for (const [key, M] of merged) {
    if (!M.idx.length) continue;
    M.geo = true;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(M.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(M.col, 3));
    g.setAttribute('aTintB', new THREE.Float32BufferAttribute(M.colB, 3));
    g.setAttribute('aMix', new THREE.Float32BufferAttribute(M.mix, 1));
    g.setIndex(M.idx);
    g.computeVertexNormals();
    // soften facet lighting of the coarse sheet: bend normals toward up (crowns come from the shader)
    const nrm = g.attributes.normal;
    for (let i = 0; i < nrm.count; i++) {
      const nx = nrm.getX(i) * 0.25, ny = nrm.getY(i) * 0.25 + 0.75, nz = nrm.getZ(i) * 0.25;
      const l = Math.hypot(nx, ny, nz) || 1;
      nrm.setXYZ(i, nx / l, ny / l, nz / l);
    }
    g.computeBoundingSphere();
    M.normal = g.attributes.normal;
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'veg:canopy:' + key;
    mesh.castShadow = !!(M.shadow && castShadow);
    mesh.receiveShadow = true;
    group.add(mesh);
    tris += M.idx.length / 3;
  }
  // stitch normals across tile / mesh borders (vertices there are duplicated per tile)
  for (const list of border.values()) {
    if (list.length < 2) continue;
    let nx = 0, ny = 0, nz = 0;
    for (const [M, vi] of list) { if (!M.normal) continue; nx += M.normal.getX(vi); ny += M.normal.getY(vi); nz += M.normal.getZ(vi); }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const [M, vi] of list) if (M.normal) M.normal.setXYZ(vi, nx / l, ny / l, nz / l);
  }
  return { group, tris, meshes: group.children.length };
}

// Canopy material: MeshStandardMaterial + procedural crowns.
export function canopyMaterial({ cell = 11, bright = 0.62 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, vertexColors: true, envMapIntensity: 0.7 });
  m.name = 'vegCanopy';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCell = { value: cell };
    sh.uniforms.uBright = { value: bright };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aTintB; attribute float aMix;
        varying vec3 vCW; varying vec3 vTintB; varying float vMix; varying float vUpW;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vCW = (modelMatrix * vec4(transformed, 1.0)).xyz; vTintB = aTintB; vMix = aMix;
        vUpW = normalize(mat3(modelMatrix) * objectNormal).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uCell; uniform float uBright;
        varying vec3 vCW; varying vec3 vTintB; varying float vMix; varying float vUpW;
        float ch21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        float cvn(vec3 x) {
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          float a = ch21(i.xy + i.z * 17.0), b = ch21(i.xy + vec2(1, 0) + i.z * 17.0), c = ch21(i.xy + vec2(0, 1) + i.z * 17.0), d = ch21(i.xy + vec2(1, 1) + i.z * 17.0);
          float e = ch21(i.xy + (i.z + 1.0) * 17.0), g = ch21(i.xy + vec2(1, 0) + (i.z + 1.0) * 17.0), h = ch21(i.xy + vec2(0, 1) + (i.z + 1.0) * 17.0), k = ch21(i.xy + vec2(1, 1) + (i.z + 1.0) * 17.0);
          return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float cSteep = 1.0 - smoothstep(0.35, 0.8, vUpW);
        vec2 cPw = vCW.xz;
        vec2 cP = cPw / uCell;
        vec2 cC = floor(cP);
        vec3 cWCol = vec3(0.0); float cWSum = 0.0; float cQMax = 0.0; vec2 cNAcc = vec2(0.0);
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 c = cC + vec2(float(i), float(j));
          vec2 o = vec2(ch21(c), ch21(c + 19.19));
          vec2 d = cP - (c + 0.1 + 0.8 * o);
          float id = ch21(c + 5.3);
          float ang = atan(d.y, d.x);
          float r = (0.66 + 0.34 * ch21(c + 3.7)) * (1.0 + 0.16 * sin(3.0 * ang + id * 40.0) + 0.09 * sin(5.0 * ang + id * 17.0));
          float q = 1.0 - dot(d, d) / (r * r);
          if (q > 0.0) {
            float w = q * q * (0.6 + 0.8 * ch21(c + 9.1));
            cWCol += (id < vMix ? vTintB : vColor.rgb) * (0.78 + 0.44 * ch21(c + 2.2)) * w;
            cWSum += w; cQMax = max(cQMax, q);
            cNAcc += d / r * w;
          }
        }
        // footprint along the minor axis keeps crowns resolved at grazing angles
        vec2 cDx = dFdx(cPw), cDy = dFdy(cPw);
        float cFw = min(length(cDx), length(cDy)) * 1.4 / uCell;
        float cDetail = 1.0 - smoothstep(0.08, 0.3, cFw);
        float cCover = cWSum > 0.0 ? 1.0 : 0.0;
        vec3 cMean = mix(vColor.rgb, vTintB, vMix) * 0.6;
        vec3 cTint = cWSum > 0.0 ? cWCol / cWSum : cMean;
        float cAO = mix(0.12, 1.05, smoothstep(0.0, 0.8, cQMax));
        vec3 cCol = mix(cMean, cTint * cAO, cDetail);
        vec2 cNd = cWSum > 0.0 ? cNAcc / cWSum : vec2(0.0);
        cCol *= 1.0 - 0.25 * cSteep;
        float cFw2 = length(fwidth(vCW));
        float cSp = (cvn(vCW * 0.7) - 0.5) * (1.0 - smoothstep(0.4, 1.3, cFw2)) + (cvn(vCW * 1.9 + 3.0) - 0.5) * 1.1 * (1.0 - smoothstep(0.2, 0.55, cFw2));
        diffuseColor.rgb = uBright * cCol * clamp(1.0 + cSp * 0.6, 0.5, 1.4);
        // match the terrain's far patchwork softening so distant woods don't read as spots
        float cCamD = length(vCW - cameraPosition);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.16, 0.09), smoothstep(3000.0, 14000.0, cCamD) * 0.3);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 dn = normalize(vec3(cNd.x, 0.75, cNd.y));
          float k = cDetail * cCover * 1.0 * (1.0 - 0.6 * cSteep);
          vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          vec3 dv = normalize((viewMatrix * vec4(dn, 0.0)).xyz);
          normal = normalize(normal + (dv - up) * k);
        }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.specularColor *= 0.25; material.specularColorBlended *= 0.25; material.specularF90 = 0.25;`);
  };
  m.customProgramCacheKey = () => 'vegCanopy7';
  return m;
}

// JS twin of the shader crown field: relief (in cells) of the tallest crown dome at p, 0 in gaps.
const fr = (v) => v - Math.floor(v);
function ch21(px, py) {
  let x = fr(px * 0.1031), y = fr(py * 0.1031), z = fr(px * 0.1031);
  const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
  x += d; y += d; z += d;
  return fr((x + y) * z);
}
export function crownRelief(wx, wz, cell) {
  const px = wx / cell, pz = wz / cell;
  const cx = Math.floor(px), cz = Math.floor(pz);
  let best = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const c0 = cx + i, c1 = cz + j;
    const dx = px - (c0 + 0.1 + 0.8 * ch21(c0, c1)), dz = pz - (c1 + 0.1 + 0.8 * ch21(c0 + 19.19, c1 + 19.19));
    const id = ch21(c0 + 5.3, c1 + 5.3);
    const ang = Math.atan2(dz, dx);
    const r = (0.66 + 0.34 * ch21(c0 + 3.7, c1 + 3.7)) * (1 + 0.16 * Math.sin(3 * ang + id * 40) + 0.09 * Math.sin(5 * ang + id * 17));
    const q = 1 - (dx * dx + dz * dz) / (r * r);
    if (q > 0) {
      const hh = Math.sqrt(q) * r * 0.8 + 0.5 * ch21(c0 + 9.1, c1 + 9.1);
      if (hh > best) best = hh;
    }
  }
  return best;
}
