import * as THREE from 'three';

// Shore belts along every detailed shoreline (Test, Southampton Water, Itchen, Netley/Weston).
// Drawn as a low cover hugging the terrain (never more than ~0.3 m above it), so there are no
// shelves or lips:
//  - inland: rough grass / gorse / bramble belt from the tide line to an irregular inner edge;
//  - seaward, in sheltered reaches: Spartina saltmarsh (olive-grey) or Phragmites reed bed (tawny),
//    running out over the upper mud only as far as the mud stays above water.
// Both outlines are feathered per pixel with world-space noise (aFeather: 0 at an edge, 1 inside),
// and meandering creeks are cut into the marsh as dark wet channels in the shader.
// Returns { mesh, tris, scrub: [[x, z, kind]] } — scrub points for instanced bushes.
export function buildMarsh(ctx, ground, { fbm }) {
  const { layout, geo, poly, terrain } = ctx;
  const ll = geo.ll;
  const S = THREE.MathUtils.smoothstep;
  // [lat0, lat1, lon0, lon1, max saltmarsh width m, kind]  kind: 1 marsh, 2 reed
  const AREAS = [
    [50.9040, 50.9300, -1.5000, -1.4550, 70, 2],   // Redbridge / Eling / Totton
    [50.8990, 50.9200, -1.4700, -1.4300, 60, 1],   // Eling–Bury–Marchwood north bank
    [50.8760, 50.9000, -1.4330, -1.4040, 70, 1],   // Marchwood / The Gymp edge
    [50.8380, 50.8700, -1.4000, -1.3300, 50, 1],   // Hythe → Fawley shore
    [50.8420, 50.8600, -1.3300, -1.2950, 40, 1],   // Hamble mouth / Hook
  ];
  const boxes = AREAS.map(([a0, a1, o0, o1, w, kind]) => {
    const [xa, za] = ll(a1, o0), [xb, zb] = ll(a0, o1);
    return { x0: Math.min(xa, xb) - 300, x1: Math.max(xa, xb) + 300, cx0: Math.min(xa, xb), cx1: Math.max(xa, xb), z0: Math.min(za, zb) - 300, z1: Math.max(za, zb) + 300, cz0: Math.min(za, zb), cz1: Math.max(za, zb), w, kind };
  });
  // smooth weight of a saltmarsh area at a point (fades over 300 m outside its box)
  const areaW = (x, z) => {
    let best = 0, kind = 1, w = 0;
    for (const b of boxes) {
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      const dx = Math.max(b.cx0 - x, 0, x - b.cx1), dz = Math.max(b.cz0 - z, 0, z - b.cz1);
      const k = 1 - S(Math.hypot(dx, dz), 0, 300);
      if (k > best) { best = k; kind = b.kind; w = b.w; }
    }
    return { k: best, kind, w };
  };
  const towns = layout.TOWN_ZONES.map((t) => ({ d: t.density, r: new poly.Region(t.poly) }));
  const estate = new poly.Region(layout.DOCK_ESTATE);
  // docks, basins and wharves: no cover anywhere in or near them
  const docks = [layout.OD, layout.EMPRESS_DOCK, layout.OUTER_DOCK, layout.INNER_DOCK, layout.TRAFALGAR_DD, ...(layout.ITCHEN_WHARVES || [])]
    .filter((p) => Array.isArray(p) && p.length > 2 && Array.isArray(p[0])).map((p) => new poly.Region(p));
  const inDocks = (x, z, pad = 0) => estate.sdist(x, z) > -pad || docks.some((d) => d.sdist(x, z) > -pad);
  const L = layout.LANDMARKS;
  const avoid = [[...L.hythePierRoot, 90], [...L.royalPierRoot, 220], [...L.townQuay, 220], [...L.floatingBridgeW, 80], [...L.floatingBridgeE, 80]];

  const pos = [], col = [], fea = [], mar = [], idx = [];
  const scrub = [];
  const c = new THREE.Color(), c2 = new THREE.Color();
  const G = [new THREE.Color(0x5a6440), new THREE.Color(0x6a6746), new THREE.Color(0x4e5a36)];
  const GORSE = new THREE.Color(0x3a4527), BRAMBLE = new THREE.Color(0x4a3f33), WRACK = new THREE.Color(0x4d4838);
  const MARSH = [new THREE.Color(0x5a5c44), new THREE.Color(0x66624a), new THREE.Color(0x4e583a)];
  const REED = [new THREE.Color(0x7a6a4c), new THREE.Color(0x685a40), new THREE.Color(0x86765a)];
  // rows across the belt: [kind (0 sea edge,1 marsh,2 shore,3 grass,4 inner edge), relative offset]
  const ROWS = [[0, -1], [1, -0.7], [1, -0.35], [2, 0], [3, 0.3], [3, 0.65], [4, 1]];

  for (const PL of [layout.PENINSULA, layout.WEST_LAND, layout.EAST_LAND]) {
    const region = new poly.Region(PL);
    const pts = poly.densify(poly.smoothPoly ? poly.smoothPoly(PL, 1) : PL, 11);
    const n = pts.length;
    let prevRow = -1;
    for (let i = 0; i < n; i++) {
      let [x, z] = pts[i];
      let skip = !ground.inNear(x, z) || inDocks(x, z, 250) || avoid.some(([ax, az, r]) => (x - ax) ** 2 + (z - az) ** 2 < r * r);
      const [xa, za] = pts[(i + n - 1) % n], [xb, zb] = pts[(i + 1) % n];
      let tx = xb - xa, tz = zb - za; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      let nx = tz, nz = -tx; // inland normal
      if (!skip) {
        if (!region.contains(x + nx * 6, z + nz * 6)) { nx = -nx; nz = -nz; }
        // move the station onto the real (wiggled) coastline: find where terrain s crosses 0
        let lo = null, prevT = -100, prevS = terrain.sample(x - nx * 100, z - nz * 100).s;
        for (let t = -80; t <= 100; t += 20) {
          const sv = terrain.sample(x + nx * t, z + nz * t).s;
          if (prevS < 0 && sv >= 0) { lo = [prevT, t]; break; }
          prevT = t; prevS = sv;
        }
        if (!lo) skip = true;
        else {
          let [a, b] = lo;
          for (let k = 0; k < 4; k++) { const mid = (a + b) / 2; if (terrain.sample(x + nx * mid, z + nz * mid).s < 0) a = mid; else b = mid; }
          x += nx * b; z += nz * b;
          const sea = terrain.sample(x - nx * 30, z - nz * 30);
          if (sea.type !== 'sea' && sea.type !== 'mud') skip = true; // not a real shoreline
          if (inDocks(x, z, 250)) skip = true;
        }
      }
      let townD = 0;
      if (!skip) for (const t of towns) if (t.r.contains(x + nx * 25, z + nz * 25)) townD = Math.max(townD, t.d);
      if (townD >= 0.7) skip = true;
      if (skip) { prevRow = -1; continue; }

      const nA = fbm(x / 260, z / 260, 3), nB = fbm(x / 60 + 3, z / 60, 2);
      // inland belt width: continuous, irregular
      const wi = Math.max(12, (35 + 85 * S(nA, 0.3, 0.72)) * (0.75 + 0.5 * nB) * (1 - 0.7 * townD));
      // seaward marsh width, then cut back to where the mud is still above water
      const A = areaW(x, z);
      let ws = A.k * A.w * S(fbm(x / 210 + 11, z / 210, 3), 0.25, 0.6) * (0.6 + 0.6 * nB);
      if (ws > 0) {
        let o = 0;
        for (; o < ws; o += 3) if (ground.height(x - nx * (o + 3), z - nz * (o + 3)) < 0.35) break;
        ws = Math.min(ws, o);
      }
      ws = Math.max(ws, 3); // always a thin wrack / tide-line fringe
      const row = pos.length / 3;
      for (const [rk, rel] of ROWS) {
        const o = rel < 0 ? rel * ws : rel * wi;
        const wob = rk === 0 || rk === 4 ? 0 : (fbm(x / 21 + rk, z / 21, 2) - 0.5) * Math.min(8, Math.abs(o) * 0.3);
        const px = x + nx * (o + wob), pz = z + nz * (o + wob);
        const g = ground.height(px, pz);
        const feather = rk === 0 || rk === 4 ? 0 : 1;
        // clip to land: anything over water (terrain below 0.3 m, or open sea) is sunk and faded out
        const wet = g < 0.3 || inDocks(px, pz, 30) || (o < 1 && terrain.sample(px, pz).type === 'sea');
        const y = wet ? g - 1.5 : Math.max(g, 0.3) + (rk === 1 ? (A.kind === 2 ? 0.3 : 0.18) : rk === 0 ? 0.04 : 0.2);
        pos.push(px, y, pz);
        fea.push(wet ? 0 : feather);
        const marshy = rel < 0 ? S(ws, 4, 14) * A.k : 0;
        mar.push(marshy * (A.kind === 2 ? 2 : 1));
        if (rel < 0) {
          const pal = A.kind === 2 ? REED : MARSH;
          const t = fbm(px / 40, pz / 40, 3);
          c.copy(pal[0]).lerp(pal[1], S(t, 0.45, 0.7)).lerp(pal[2], S(t, 0.4, 0.2) * 0.8);
          c.lerp(WRACK, 1 - marshy);
        } else if (rk === 2) {
          c.copy(WRACK).lerp(G[0], 0.35);
        } else {
          const t = fbm(px / 35, pz / 35, 3), u = fbm(px / 16 + 5, pz / 16, 2);
          c.copy(G[0]).lerp(G[1], S(t, 0.45, 0.72)).lerp(G[2], S(t, 0.4, 0.2));
          c2.copy(u > 0.5 ? GORSE : BRAMBLE);
          c.lerp(c2, S(Math.abs(u - 0.5), 0.13, 0.24) * 0.8);
          if (rk === 3 && S(Math.abs(u - 0.5), 0.16, 0.26) > 0.5 && i % 2 === 0) scrub.push([px, pz, u > 0.5 ? 'gorse' : 'bramble']);
        }
        col.push(c.r, c.g, c.b);
      }
      if (prevRow >= 0) {
        for (let j = 0; j < ROWS.length - 1; j++) {
          const a = prevRow + j, b = prevRow + j + 1, d = row + j, e = row + j + 1;
          idx.push(a, d, b, b, d, e);
        }
      }
      prevRow = row;
    }
  }
  if (!idx.length) return null;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, d = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uz = pos[b + 2] - pos[a + 2], vx = pos[d] - pos[a], vz = pos[d + 2] - pos[a + 2];
    if (uz * vx - ux * vz < 0) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aFeather', new THREE.Float32BufferAttribute(fea, 1));
  g.setAttribute('aMarsh', new THREE.Float32BufferAttribute(mar, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, coverMaterial());
  mesh.name = 'veg:shore';
  mesh.receiveShadow = true;
  return { mesh, tris: idx.length / 3, scrub };
}

const COVER_NOISE = /* glsl */`
  float cvH(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float cvN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cvH(i), cvH(i + vec2(1, 0)), f.x), mix(cvH(i + vec2(0, 1)), cvH(i + vec2(1, 1)), f.x), f.y); }
  float cvF(vec2 p) { return cvN(p) * 0.55 + cvN(p * 2.1 + 5.3) * 0.3 + cvN(p * 4.3 - 2.7) * 0.15; }
`;

// Low vegetation cover over terrain: vertex colour, per-pixel feathered outline, creeks, tufts.
export function coverMaterial({ name = 'vegShore', bright = 0.9 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(bright, bright, bright), roughness: 1, metalness: 0, vertexColors: true, envMapIntensity: 0.6 });
  m.name = name;
  m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -6;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aFeather; attribute float aMarsh; varying float vFeather; varying float vMarsh; varying vec3 vCvW;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        vFeather = aFeather; vMarsh = aMarsh; vCvW = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vFeather; varying float vMarsh; varying vec3 vCvW;
        ${COVER_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 p = vCvW.xz;
          // irregular outline: noise threshold against the feather ramp
          float edgeN = cvF(p / 38.0) * 0.75 + cvN(p / 6.0) * 0.25;
          if (vFeather < edgeN * 0.9) discard;
          float fw = length(fwidth(p));
          float det = 1.0 - smoothstep(0.6, 3.0, fw);
          // tussocks / clumps
          float t1 = cvN(p / 2.3), t2 = cvF(p / 11.0);
          diffuseColor.rgb *= mix(1.0, 0.8 + 0.4 * t1, det) * (0.85 + 0.3 * t2);
          // saltmarsh creeks: meandering dark wet channels with a muddy margin
          float mk = clamp(vMarsh, 0.0, 1.0) + clamp(vMarsh - 1.0, 0.0, 1.0);
          if (mk > 0.01) {
            float cr = abs(cvF(p / 90.0) - 0.5);
            float creek = 1.0 - smoothstep(0.018, 0.035, cr);
            float margin = 1.0 - smoothstep(0.03, 0.06, cr);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.15, 0.12), margin * 0.5 * mk);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.05, 0.045), creek * mk);
            // pans: small dark pools on the marsh
            float pan = smoothstep(0.78, 0.84, cvF(p / 17.0 + 9.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.07, 0.065), pan * mk * 0.8);
          }
        }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.specularColor *= 0.3; material.specularColorBlended *= 0.3; material.specularF90 = 0.3;`);
  };
  m.customProgramCacheKey = () => 'vegCover1';
  return m;
}
