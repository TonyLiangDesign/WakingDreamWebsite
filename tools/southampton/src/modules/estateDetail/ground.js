import * as THREE from 'three';

// Estate ground overlay: one flat mesh over the whole slab (dock frame) whose material blends
// yard concrete, granite setts, rolled gravel/cinders, trodden earth, coal dust and oil/wet stains.
// The layout comes from a baked RGBA mask (2 m texels, from site.layers); the shader warps the
// lookup and feathers every threshold with multi-scale noise so no edge is geometric.

function boxBlur(src, nx, nz, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  const inv = 1 / (2 * r + 1);
  for (let j = 0; j < nz; j++) {
    let acc = 0; const row = j * nx;
    for (let i = -r; i <= r; i++) acc += src[row + Math.min(nx - 1, Math.max(0, i))];
    for (let i = 0; i < nx; i++) {
      tmp[row + i] = acc * inv;
      acc += src[row + Math.min(nx - 1, i + r + 1)] - src[row + Math.max(0, i - r)];
    }
  }
  for (let i = 0; i < nx; i++) {
    let acc = 0;
    for (let j = -r; j <= r; j++) acc += tmp[Math.min(nz - 1, Math.max(0, j)) * nx + i];
    for (let j = 0; j < nz; j++) {
      out[j * nx + i] = acc * inv;
      acc += tmp[Math.min(nz - 1, j + r + 1) * nx + i] - tmp[Math.max(0, j - r) * nx + i];
    }
  }
  return out;
}

export function buildGround(ctx, site, M) {
  if (!ctx.textures || !ctx.surface) return null;
  const { G, layers } = site;
  const { nx, nz } = G;
  const blur = (a, r, passes = 2) => { let b = a; for (let p = 0; p < passes; p++) b = boxBlur(b, nx, nz, r); return b; };
  const gravel = blur(layers.gravel, 3), coal = blur(layers.coal, 3), wear = blur(layers.wear, 2), setts = blur(layers.setts, 1, 1);
  const data = new Uint8Array(nx * nz * 4);
  for (let k = 0; k < nx * nz; k++) {
    data[k * 4] = Math.min(255, gravel[k] * 255);
    data[k * 4 + 1] = Math.min(255, coal[k] * 255);
    data[k * 4 + 2] = Math.min(255, wear[k] * 255);
    data[k * 4 + 3] = Math.min(255, setts[k] * 255);
  }
  const mask = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat);
  mask.magFilter = THREE.LinearFilter;
  mask.minFilter = THREE.LinearMipmapLinearFilter;
  mask.generateMipmaps = true;
  mask.needsUpdate = true;

  const tex = ctx.textures;
  const mat = ctx.surface({
    set: 'concrete', scale: 5, color: 0x8a8378, grime: 0.2, variation: 0.12, roughness: 1, envMapIntensity: 0.12, name: 'estateGround',
    extra: {
      key: 'estateGround',
      uniforms: {
        uMask: { value: mask },
        uMaskBox: { value: new THREE.Vector4(G.x0, G.z0, 1 / (nx * G.cell), 1 / (nz * G.cell)) },
        uSetts: { value: tex.setts.map },
        uGrain: { value: tex.setts.map },
      },
      fragmentPars: 'uniform sampler2D uMask; uniform vec4 uMaskBox; uniform sampler2D uSetts; uniform sampler2D uGrain;',
      fragment: /* glsl */`
        {
          vec2 wp = vLocalP.xz;
          float nA = texture2D(uGrimeTex, wp / 47.0).r;
          float nB = texture2D(uGrimeTex, wp / 13.0 + 0.37).g;
          float nC = texture2D(uGrimeTex, wp / 3.3 + 0.71).b;
          float nD = texture2D(uGrimeTex, wp / 131.0 + 0.13).r;
          vec2 muv = (wp - uMaskBox.xy) * uMaskBox.zw + (vec2(nA, nB) - 0.5) * uMaskBox.zw * 9.0;
          vec4 mk = texture2D(uMask, muv);
          if (muv.x < 0.0 || muv.y < 0.0 || muv.x > 1.0 || muv.y > 1.0) mk = vec4(0.0);
          // absolute ground colours (linear), texture only supplies normalised detail
          float dBase = clamp(dot(tpAlb, vec3(0.333)) / max(0.05, dot(texture2D(tpMap, uvY, 9.0).rgb, vec3(0.333))), 0.6, 1.4);
          vec3 grainT = texture2D(uGrain, wp / 0.8).rgb;
          float dGrain = clamp(dot(grainT, vec3(0.333)) / max(0.05, dot(texture2D(uGrain, wp / 0.8, 9.0).rgb, vec3(0.333))), 0.5, 1.5);
          vec3 stT = texture2D(uSetts, wp / 2.0).rgb;
          float dSett = clamp(dot(stT, vec3(0.333)) / max(0.05, dot(texture2D(uSetts, wp / 2.0, 9.0).rgb, vec3(0.333))), 0.75, 1.2);
          // low-contrast, warm grey-brown; variation is mostly darkening (damp, dust, wear)
          float tone = 0.97 + 0.05 * (nD - 0.5) + 0.025 * (nB - 0.5);
          vec3 g = vec3(0.036, 0.032, 0.027) * tone * mix(1.0, dBase, 0.45);
          float gravel = smoothstep(0.25, 0.6, mk.r * 1.2 + (nB - 0.5) * 0.12 + (nC - 0.5) * 0.12);
          float wear = smoothstep(0.12, 0.5, mk.b * 1.3 + (nB - 0.5) * 0.12 + (nC - 0.5) * 0.15);
          float sett = smoothstep(0.45, 0.7, mk.a + (nB - 0.5) * 0.3 + (nC - 0.5) * 0.25);
          float coal = smoothstep(0.08, 0.45, mk.g * 1.3 + (nB - 0.5) * 0.12 + (nC - 0.5) * 0.15);
          g = mix(g, vec3(0.031, 0.029, 0.027) * (0.9 + 0.2 * nC) * clamp(dGrain, 0.7, 1.3), gravel * 0.85);
          g = mix(g, vec3(0.039, 0.032, 0.025) * (0.9 + 0.2 * nC) * mix(1.0, dBase, 0.3), wear * 0.75);
          g = mix(g, vec3(0.034, 0.033, 0.031) * (0.9 + 0.2 * nB) * dSett * mix(1.0, 0.85, wear), sett);
          g = mix(g, vec3(0.016, 0.015, 0.014) * (0.6 + 0.8 * nC), coal * 0.8);
          // surface grime from the base material (grimeAmt) still darkens
          base = g * mix(1.0, 0.88, grimeAmt);
          float stain = smoothstep(0.66, 0.72, nB * 0.6 + nC * 0.4) * (wear * 0.5 + sett * 0.4);
          base *= 1.0 - stain * 0.5;
          tpRoughMul = 1.0 / max(roughness * tpOrmV.r, 0.05);
        }`,
    },
  });

  // cinder/earth ground has almost no sheen, even at grazing sun-facing angles
  const obc = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    obc(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectSpecular *= 0.2; reflectedLight.directSpecular *= 0.3;');
  };
  const shape = new THREE.Shape(site.estate.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of Object.values(site.holes)) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const shapes = [shape];
  for (const wp of ctx.layout.ITCHEN_WHARVES || []) shapes.push(new THREE.Shape(wp.map(site.w2d).map(([x, z]) => new THREE.Vector2(x, -z))));
  const geo = new THREE.ShapeGeometry(shapes);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, ctx.Q - 0.008, 0);
  geo.deleteAttribute('uv');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'estateDetail:ground';
  mesh.receiveShadow = true;
  return mesh;
}
