// Single shader for the whole built-up area: walls (brick / buff / stucco / timber / stone),
// procedural sash windows, shopfronts and doors, slate & clay tile roofs, setts & macadam
// streets with pavements and tram rails, gardens and yards. One material → one draw call
// per spatial chunk. Texture coordinates are plane-aligned (along the wall / up the slope)
// so brick courses and slate courses stay level on rotated street grids.
//
// Per-vertex attributes:
//   aTint  (u8 ×3, normalised, ×2 in shader)  colour multiplier
//   aFac   (f32 ×3)  walls: u along façade (m), v above floor (m), storey height
//                    roofs: u along eave, v up-slope from eave, slope length
//                    roads: along (m), across from centreline (m), carriageway half width
//                    ground: u, v across the patch (m), patch width
//   aInfo  (u8 ×4)   kind, storeys | depth, bay (dm) | pavement (dm), style flags

export const KIND = {
  BRICK: 0, BUFF: 1, STUCCO: 2, TIMBER: 3, STONE: 4,
  SLATE: 5, TILE: 6,
  SETTS: 7, MACADAM: 8, PAVE: 9, GARDEN: 10, YARD: 11,
  POT: 12, SOOT: 13, LEAD: 14, GLASSROOF: 15, THATCH: 16, CANVAS: 17, IRON: 18,
};
// wall styles
export const STYLE = { HOUSE: 0, SHOP: 1, WAREHOUSE: 2, BLANK: 3, CHAPEL: 4, SMALL: 5 };

export function townMaterial(THREE, textures) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
  m.name = 'town';
  const uniforms = {
    tBrick: { value: textures.brick.map }, tBrickN: { value: textures.brick.normalMap },
    tSlate: { value: textures.slate.map }, tSlateN: { value: textures.slate.normalMap },
    tSetts: { value: textures.setts.map }, tSettsN: { value: textures.setts.normalMap },
    tGrime: { value: textures.grime },
  };
  m.customProgramCacheKey = () => 'town-v5';
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aTint; attribute vec3 aFac; attribute vec4 aInfo;
        varying vec3 vTint; varying vec3 vFac; varying vec4 vInfo;
        varying vec3 vWP; varying vec3 vWN; varying vec2 vPUV; varying vec3 vTV; varying vec3 vBV;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vTint = aTint * 2.0; vFac = aFac; vInfo = aInfo;
          vec3 n = normal;
          vec3 t = cross(vec3(0.0, 1.0, 0.0), n);
          if (length(t) < 0.05) t = vec3(1.0, 0.0, 0.0);
          t = normalize(t);
          vec3 b = cross(n, t);
          vWP = position; vWN = n;
          vPUV = vec2(dot(position, t), dot(position, b));
          vTV = normalMatrix * t; vBV = normalMatrix * b;
        }`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D tBrick; uniform sampler2D tBrickN; uniform sampler2D tSlate; uniform sampler2D tSlateN;
        uniform sampler2D tSetts; uniform sampler2D tSettsN; uniform sampler2D tGrime;
        varying vec3 vTint; varying vec3 vFac; varying vec4 vInfo;
        varying vec3 vWP; varying vec3 vWN; varying vec2 vPUV; varying vec3 vTV; varying vec3 vBV;
        float tnRough; vec3 tnNrm; float tnNS;

        float tnH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        // integral of a periodic pulse train (pulse [a,b] repeated every P)
        float tnPI(float x, float a, float b, float P) {
          float fl = floor(x / P); float fr = x - fl * P;
          return fl * (b - a) + clamp(fr - a, 0.0, b - a);
        }
        // box-filtered periodic pulse (anti-aliased at any distance)
        float tnPulse(float x, float w, float a, float b, float P) {
          w = max(w, 1e-4);
          return (tnPI(x + 0.5 * w, a, b, P) - tnPI(x - 0.5 * w, a, b, P)) / w;
        }
        // periodic pulse restricted to [lo, hi]
        float tnPulseR(float x, float w, float a, float b, float P, float lo, float hi) {
          w = max(w, 1e-4);
          float x0 = clamp(x - 0.5 * w, lo, hi), x1 = clamp(x + 0.5 * w, lo, hi);
          return (tnPI(x1, a, b, P) - tnPI(x0, a, b, P)) / w;
        }
        float tnBox(float x, float w, float a, float b) {
          w = max(w, 1e-4);
          return clamp((min(x + 0.5 * w, b) - max(x - 0.5 * w, a)) / w, 0.0, 1.0);
        }
        float tnLum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
      `)
      .replace('#include <map_fragment>', /* glsl */`
      {
        float K = floor(vInfo.x + 0.5);
        vec3 alb = vec3(0.3);
        tnRough = 0.9; tnNS = 1.0; tnNrm = vec3(0.0, 0.0, 1.0);
        float gB = texture2D(tGrime, (vWP.xz + vWP.y * 0.7) / 61.0).r;
        float gM = texture2D(tGrime, (vWP.xz + vec2(vWP.y)) / 9.0).g;
        float gS = texture2D(tGrime, vec2(vPUV.x / 5.0, vWP.y / 23.0)).b;

        if (K < 4.5) {
          // ------------------------------------------------ walls
          vec2 buv = vPUV / 1.8;
          vec3 bt = texture2D(tBrick, buv).rgb;
          tnNrm = texture2D(tBrickN, buv).xyz * 2.0 - 1.0;
          if (K < 0.5) { alb = bt * vTint * 0.6; }
          else if (K < 1.5) { alb = vec3(tnLum(bt) / 0.2) * vTint * vec3(0.28, 0.24, 0.16); }
          else if (K < 2.5) {
            // painted stucco, scored as ashlar on the ground storey
            alb = vTint * 0.52 * (0.9 + 0.12 * gM);
            float score = vFac.y < vFac.z ? tnPulse(vFac.y, fwidth(vFac.y), 0.0, 0.03, 0.45) : 0.0;
            alb *= 1.0 - 0.35 * score;
            tnNS = 0.12;
          } else if (K < 3.5) {
            // timber-framed: black oak studs, rails and braces on limewash
            alb = vTint * (0.9 + 0.1 * gM);
            float fw = max(fwidth(vFac.x), 1e-3);
            float stud = tnPulse(vFac.x, fw, 0.0, 0.16, 0.62);
            float fv = max(fwidth(vFac.y), 1e-3);
            float rail = tnPulse(vFac.y, fv, 0.0, 0.22, vFac.z * 0.5);
            float fr = fract(vFac.x / 1.86);
            float brace = tnBox(abs(fract(vFac.y / vFac.z) - fr), fw * 2.0, 0.0, 0.06);
            float tim = clamp(stud + rail + brace * 0.8, 0.0, 1.0);
            alb = mix(alb, vec3(0.025, 0.022, 0.02), tim);
            tnNS = 0.04;
          } else {
            alb = vec3(tnLum(bt) / 0.2) * vTint * vec3(0.36, 0.34, 0.3);
            tnNS = 0.5;
          }
          float soot = smoothstep(0.35, 0.8, gB * 0.7 + gS * 0.5);
          alb *= mix(1.0, 0.72, soot);
          tnRough = 0.88;

          float st = floor(vInfo.y + 0.5);
          float bay = vInfo.z * 0.1;
          float style = floor(vInfo.w + 0.5);
          float sh = vFac.z;
          float u = vFac.x, v = vFac.y;
          float fu = max(fwidth(u), 1e-3), fv = max(fwidth(v), 1e-3);
          float vmax = st * sh;
          // plinth and eaves shadow
          alb *= mix(0.62, 1.0, smoothstep(-0.2, 0.35, v));
          if (style != 3.0) alb *= mix(1.0, 0.55, smoothstep(vmax - 0.05, vmax + 0.35, v) * step(v, vmax + 0.9));
          if (style != 3.0 && bay > 0.6 && sh > 1.0) {
            float ww, wh, sill, glassLo = 0.0;
            if (style == 2.0) { ww = min(bay * 0.36, 1.1); wh = sh * 0.42; sill = sh * 0.3; }
            else if (style == 4.0) { ww = min(bay * 0.42, 1.4); wh = sh * 0.62; sill = sh * 0.22; }
            else if (style == 5.0) { ww = min(bay * 0.40, 0.9); wh = sh * 0.36; sill = sh * 0.34; }
            else { ww = min(bay * 0.36, 0.98); wh = min(sh * 0.5, 1.75); sill = sh * 0.3; }
            float a = 0.5 * bay - 0.5 * ww, b = 0.5 * bay + 0.5 * ww;
            float lo = style == 1.0 ? sh : 0.0;
            float colO = tnPulse(u, fu, a, b, bay);
            float rowO = tnPulseR(v, fv, sill, sill + wh, sh, lo, vmax);
            float fr = 0.065;
            float colI = tnPulse(u, fu, a + fr, b - fr, bay);
            float rowI = tnPulseR(v, fv, sill + fr, sill + wh - fr, sh, lo, vmax);
            float winO = colO * rowO, glass = colI * rowI;
            // sash glazing: meeting rail + glazing bars (2-over-2 Victorian, 6-over-6 on older fronts)
            float fac6 = step(0.62, tnH(vTint.rb * 23.0 + floor(u / (bay * 7.0)))) * (K > 2.5 ? 1.0 : step(0.5, tnH(vTint.gr * 3.0)));
            float barsV = tnPulse(u, fu, a + ww * 0.5 - 0.02, a + ww * 0.5 + 0.02, bay);
            float barsH = tnPulseR(v, fv, sill + wh * 0.5 - 0.03, sill + wh * 0.5 + 0.03, sh, lo, vmax);
            if (fac6 > 0.5) {
              barsV = max(tnPulse(u, fu, a + ww / 3.0 - 0.017, a + ww / 3.0 + 0.017, bay), tnPulse(u, fu, a + ww * 2.0 / 3.0 - 0.017, a + ww * 2.0 / 3.0 + 0.017, bay));
              barsH = max(barsH, max(tnPulseR(v, fv, sill + wh / 6.0 - 0.017, sill + wh / 6.0 + 0.017, sh, lo, vmax), tnPulseR(v, fv, sill + wh * 5.0 / 6.0 - 0.017, sill + wh * 5.0 / 6.0 + 0.017, sh, lo, vmax)));
            }
            float bars = clamp(barsV + barsH, 0.0, 1.0) * glass;
            glass *= 1.0 - bars;
            // recess: reveal shadow under the head and down one jamb, drip shadow under the sill
            float revealSh = colI * tnPulseR(v, fv, sill + wh - fr - 0.16, sill + wh - fr, sh, lo, vmax) + tnPulse(u, fu, a + fr, a + fr + 0.09, bay) * rowI;
            float dripSh = tnPulse(u, fu, a - 0.1, b + 0.1, bay) * tnPulseR(v, fv, sill - 0.24, sill - 0.09, sh, lo, vmax);
            // lintel & sill dressings
            float colD = tnPulse(u, fu, a - 0.1, b + 0.1, bay);
            float lint = colD * tnPulseR(v, fv, sill + wh, sill + wh + 0.2, sh, lo, vmax);
            float sil = colD * tnPulseR(v, fv, sill - 0.09, sill, sh, lo, vmax);
            vec2 cell = vec2(floor(u / bay), floor(v / sh));
            float hs = tnH(cell + vTint.rg * 17.0);
            vec3 gcol = mix(vec3(0.012, 0.013, 0.015), vec3(0.07, 0.065, 0.055), step(0.72, hs) * 0.8);
            vec3 frame = style == 2.0 ? vec3(0.05, 0.045, 0.04) : mix(vec3(0.36, 0.35, 0.32), vec3(0.08, 0.07, 0.06), step(0.85, tnH(vTint.bg * 11.0)));
            vec3 dress = K < 1.5 ? vec3(0.55, 0.52, 0.45) : alb * 0.8;
            alb = mix(alb, dress, clamp(lint + sil, 0.0, 1.0) * (K < 2.5 ? 1.0 : 0.0));
            alb = mix(alb, frame, winO);
            alb = mix(alb, gcol, glass);
            alb = mix(alb, frame * 0.8, bars);
            alb *= 1.0 - 0.45 * clamp(revealSh, 0.0, 1.0) * rowO * colO;
            alb *= 1.0 - 0.35 * dripSh;
            float lintTop = colD * tnPulseR(v, fv, sill + wh + 0.16, sill + wh + 0.2, sh, lo, vmax);
            alb *= 1.0 + 0.25 * lintTop * (K < 2.5 ? 1.0 : 0.0);
            tnNS *= 1.0 - winO;
            tnRough = mix(tnRough, 0.4, glass);
            if (style == 1.0) {
              // shopfront: recessed plate glass with glazing bars, lobby door, stall riser, pilasters
              float sc = tnPulse(u, fu, 0.3, bay - 0.3, bay);
              float gl = sc * tnBox(v, fv, 0.6, sh - 0.9);
              float bars = max(tnPulse(u, fu, 0.0, 0.05, 0.95), tnBox(v, fv, sh - 1.45, sh - 1.38));
              float cellU = fract(u / bay) * bay;
              float lobby = tnBox(cellU, fu, bay * 0.5 - 0.55, bay * 0.5 + 0.55) * tnBox(v, fv, 0.0, sh - 0.9) * step(0.5, tnH(vec2(floor(u / bay), 3.0) + vTint.rb * 5.0));
              vec3 fcol = mix(vec3(0.05, 0.08, 0.055), vec3(0.13, 0.04, 0.035), step(0.5, tnH(vTint.gb * 9.0)));
              fcol = mix(fcol, vec3(0.03, 0.03, 0.035), step(0.75, tnH(vTint.rg * 4.0)));
              float front = tnBox(v, fv, 0.0, sh - 0.12);
              alb = mix(alb, fcol, front * 0.9);
              alb = mix(alb, fcol * 1.8 + 0.03, tnBox(v, fv, 0.5, 0.6) * sc); // riser moulding
              // glass: dark interior, darker under the fascia and at the reveals, sky sheen lower down
              float depthShade = 0.35 + 0.65 * smoothstep(sh - 0.9, 0.8, v);
              float reveal = 1.0 - 0.6 * (1.0 - smoothstep(0.3, 0.45, cellU)) - 0.6 * smoothstep(bay - 0.45, bay - 0.3, cellU);
              vec3 gc = vec3(0.022, 0.024, 0.026) * depthShade * reveal;
              alb = mix(alb, gc, gl);
              alb = mix(alb, fcol * 1.3, gl * bars * 0.9);
              alb = mix(alb, vec3(0.012, 0.01, 0.009), lobby);
              tnRough = mix(tnRough, 0.45 - 0.2 * depthShade, gl * (1.0 - bars));
              tnNS *= 1.0 - front;
            } else if (style == 0.0) {
              // front door in the first bay
              float door = tnBox(u, fu, a, a + 0.95) * tnBox(v, fv, 0.0, 2.3) * step(u, bay);
              alb = mix(alb, vec3(0.05, 0.04, 0.035) + vTint * 0.02, door);
            } else if (style == 2.0) {
              // loading doors stacked up every fourth bay
              float ld = tnPulse(u, fu, bay * 0.25, bay * 0.75, bay * 4.0) * tnPulseR(v, fv, 0.0, sh * 0.8, sh, 0.0, vmax);
              alb = mix(alb, vec3(0.09, 0.06, 0.045), ld);
            }
          }
        } else if (K < 6.5) {
          // ------------------------------------------------ roofs
          vec2 ruv = vFac.xy / (K < 5.5 ? 2.0 : 1.1);
          vec3 st = texture2D(tSlate, ruv).rgb;
          tnNrm = texture2D(tSlateN, ruv).xyz * 2.0 - 1.0;
          if (K < 5.5) alb = st * vTint * 0.26;
          else {
            // weathered hand-made clay tile: dull red-brown, sooty and lichened in patches
            alb = vec3(tnLum(st) / 0.16) * vTint * vec3(0.118, 0.052, 0.036);
            alb = mix(alb, vec3(0.055, 0.047, 0.04), smoothstep(0.45, 0.85, gB) * 0.55);
            alb = mix(alb, vec3(0.08, 0.075, 0.045), smoothstep(0.62, 0.9, gM) * 0.3);
          }
          float fv = max(fwidth(vFac.y), 1e-3);
          float ridge = tnBox(vFac.y, fv, vFac.z - 0.24, vFac.z + 1.0);
          float gutter = tnBox(vFac.y, fv, -1.0, 0.1);
          alb = mix(alb, K < 5.5 ? vec3(0.13, 0.09, 0.075) : alb * 0.8, ridge);
          alb = mix(alb, vec3(0.02), gutter);
          alb *= mix(1.0, 0.7, smoothstep(0.4, 0.8, gB));
          tnRough = 0.78;
          tnNS = 0.8;
        } else if (K < 11.5) {
          // ------------------------------------------------ ground
          float along = vFac.x, ac = vFac.y;
          float fa = max(fwidth(ac), 1e-3);
          if (K < 8.5) {
            float hw = vFac.z, pave = vInfo.z * 0.1;
            float fl = floor(vInfo.w + 0.5);
            float tram = mod(fl, 2.0), noL = mod(floor(fl / 2.0), 2.0), noR = mod(floor(fl / 4.0), 2.0);
            vec2 suv = vec2(along, ac) / 2.0;
            if (K < 7.5) {
              alb = texture2D(tSetts, suv).rgb * vTint;
              tnNrm = texture2D(tSettsN, suv).xyz * 2.0 - 1.0;
              tnRough = 0.9;
            } else {
              alb = vTint * (0.82 + 0.3 * gM) * (0.9 + 0.1 * texture2D(tGrime, suv * 0.37).g);
              tnNS = 0.0; tnRough = 0.95;
            }
            // wear & dung down the middle, damp gutters
            float mid = 1.0 - smoothstep(0.0, hw * 0.55, abs(ac));
            alb *= 1.0 - 0.12 * mid * smoothstep(0.3, 0.7, gM);
            float gut = tnBox(abs(ac), fa, hw - 0.45, hw);
            // damp, puddled gutters
            float wetG = gut * smoothstep(0.35, 0.65, gM + 0.2 * gB);
            alb *= 1.0 - 0.3 * gut - 0.35 * wetG;
            tnRough = mix(tnRough, 0.25, wetG);
            // cart-wheel ruts and horse dung / straw along each lane of traffic
            float fl2 = max(fwidth(along), 1e-3);
            vec3 muck = vec3(0.075, 0.058, 0.04);
            float ruts = 0.0;
            for (int i = 0; i < 4; i++) {
              float c = (i < 2 ? -1.0 : 1.0) * hw * 0.5 + (mod(float(i), 2.0) < 0.5 ? -0.75 : 0.75);
              ruts += tnBox(ac, fa, c - 0.18, c + 0.18);
            }
            ruts = clamp(ruts, 0.0, 1.0) * (0.45 + 0.55 * smoothstep(0.3, 0.7, texture2D(tGrime, vec2(along / 23.0, ac / 3.0)).r));
            alb = mix(alb, muck * (0.8 + 0.4 * gM), ruts * 0.7);
            float dung = smoothstep(0.7, 0.88, texture2D(tGrime, vec2(along, ac) / 2.3).g) * (1.0 - smoothstep(hw * 0.45, hw * 0.8, abs(ac)));
            alb = mix(alb, vec3(0.06, 0.045, 0.025), dung * 0.8);
            float dustL = smoothstep(0.4, 0.8, texture2D(tGrime, vec2(along, ac) / 31.0).r);
            alb = mix(alb, alb * vec3(0.95, 0.82, 0.66), 0.25 + dustL * 0.4);
            if (tram > 0.5) {
              float r = 0.0;
              for (int i = 0; i < 4; i++) {
                float c = (i < 2 ? -1.45 : 1.45) + (mod(float(i), 2.0) < 0.5 ? -0.7175 : 0.7175);
                r += tnBox(ac, fa, c - 0.035, c + 0.045);
              }
              r = clamp(r, 0.0, 1.0);
              alb = mix(alb, vec3(0.028, 0.026, 0.025), r);
              tnRough = mix(tnRough, 0.75, r);
              tnNS *= 1.0 - r;
            }
            // pavements: York stone flags, granite kerb
            float side = ac < 0.0 ? noL : noR;
            if (side < 0.5) {
              float pv = tnBox(abs(ac), fa, hw, hw + pave + 1.0);
              float kerb = tnBox(abs(ac), fa, hw, hw + 0.3);
              float fla = max(fwidth(along), 1e-3);
              float joints = max(tnPulse(along, fla, 0.0, 0.03, 0.9), tnPulse(abs(ac) - hw, fa, 0.0, 0.03, 0.75));
              vec3 pc = vec3(0.11, 0.105, 0.095) * (0.85 + 0.3 * gM) * (1.0 - 0.35 * joints);
              pc = mix(pc, vec3(0.17, 0.17, 0.16), kerb);
              alb = mix(alb, pc, pv);
              tnNS *= 1.0 - pv; tnRough = mix(tnRough, 0.85, pv);
            }
          } else if (K < 9.5) {
            alb = vTint * (0.85 + 0.3 * gM);
            tnNS = 0.0;
          } else if (K < 10.5) {
            // gardens: lawns, vegetable plots, hedged/walled boundaries
            float W = vFac.z, D = vInfo.y;
            float fu = max(fwidth(along), 1e-3);
            float plot = floor(vInfo.w + 0.5);
            vec3 g = vTint * (0.75 + 0.5 * gM) * (0.85 + 0.3 * gB);
            if (plot > 0.5) {
              float rows = tnPulse(along, fu, 0.0, 0.35, 0.8);
              g = mix(g, vec3(0.1, 0.075, 0.05) * (0.8 + 0.4 * gM), 0.55 * rows + 0.2);
            }
            float path = tnBox(along, fu, W * 0.5 - 0.5, W * 0.5 + 0.5) * step(0.5, plot);
            g = mix(g, vec3(0.22, 0.2, 0.17), path);
            float edge = max(tnBox(along, fu, -1.0, 0.28), tnBox(along, fu, W - 0.28, W + 1.0));
            edge = max(edge, tnBox(ac, fa, D - 0.28, D + 1.0));
            g = mix(g, vec3(0.05, 0.06, 0.035), edge * 0.85);
            alb = g; tnNS = 0.0; tnRough = 0.95;
          } else {
            // back yards: blue-brick paviors / cinders, brick boundary walls
            float W = vFac.z, D = vInfo.y;
            float fu = max(fwidth(along), 1e-3);
            vec3 bt = texture2D(tBrick, vec2(along, ac) / 1.8).rgb;
            alb = vec3(tnLum(bt) / 0.2) * vTint * (0.8 + 0.4 * gM);
            float edge = max(tnBox(along, fu, -1.0, 0.25), tnBox(along, fu, W - 0.25, W + 1.0));
            edge = max(edge, tnBox(ac, fa, D - 0.25, D + 1.0));
            alb = mix(alb, vec3(0.12, 0.07, 0.05), edge);
            tnNS = 0.0; tnRough = 0.9;
          }
        } else {
          // ------------------------------------------------ small parts
          if (K < 12.5) { alb = vTint * vec3(0.4, 0.17, 0.09) * (0.8 + 0.3 * gM); tnNS = 0.0; }
          else if (K < 13.5) { alb = vTint * 0.03; tnNS = 0.0; }
          else if (K < 14.5) { alb = vTint * vec3(0.14, 0.145, 0.15) * (0.8 + 0.4 * gM); tnNS = 0.0; tnRough = 0.6; }
          else if (K < 15.5) {
            // north-light / skylight glazing with iron glazing bars
            float fb = max(fwidth(vFac.x), 1e-3);
            float bar = tnPulse(vFac.x, fb, 0.0, 0.08, 0.6);
            alb = mix(vec3(0.035, 0.04, 0.045) * (0.8 + 0.4 * gM), vec3(0.06), bar); tnNS = 0.0; tnRough = mix(0.15, 0.7, bar);
          } else if (K < 16.5) {
            // thatch: combed straw, weathered grey-brown, block-cut ridge
            float fv = max(fwidth(vFac.y), 1e-3);
            float comb = tnPulse(vFac.x, max(fwidth(vFac.x), 1e-3), 0.0, 0.05, 0.13);
            alb = vTint * vec3(0.16, 0.13, 0.085) * (0.75 + 0.35 * gM) * (1.0 - 0.15 * comb) * mix(1.0, 0.7, smoothstep(0.4, 0.8, gB));
            float ridge = tnBox(vFac.y, fv, vFac.z - 0.7, vFac.z + 1.0);
            alb = mix(alb, alb * 1.25, ridge);
            alb *= mix(0.55, 1.0, smoothstep(0.0, 0.5, vFac.y));
            tnNS = 0.0; tnRough = 1.0;
          } else if (K < 17.5) {
            // striped awning canvas
            float fu = max(fwidth(vFac.x), 1e-3);
            float stripe = tnPulse(vFac.x, fu, 0.0, 0.3, 0.6);
            float hsA = tnH(vTint.rg * 7.0), hsB = tnH(vTint.gb * 5.0);
            vec3 cloth = hsA < 0.3 ? vec3(0.12, 0.11, 0.085) : hsA < 0.5 ? vec3(0.05, 0.065, 0.045) : hsA < 0.72 ? vec3(0.085, 0.06, 0.04) : hsA < 0.88 ? vec3(0.1, 0.085, 0.06) : vec3(0.075, 0.035, 0.028);
            float per = mix(0.35, 0.9, hsB);
            stripe = tnPulse(vFac.x, fu, 0.0, per * 0.5, per) * step(0.55, hsB);
            alb = mix(cloth, cloth * 0.72, stripe) * vTint * (0.8 + 0.3 * gM) * mix(1.0, 0.75, smoothstep(0.4, 0.8, gB));
            tnNS = 0.0; tnRough = 0.95;
          } else {
            // corrugated iron: galvanised grey, rust streaks, dark paint
            float fu = max(fwidth(vFac.x), 1e-3);
            float corr = 0.5 + 0.5 * cos(vFac.x * 6.2831 / 0.076) * clamp(1.0 - fu * 10.0, 0.0, 1.0);
            vec3 base = vTint * vec3(0.16, 0.16, 0.155);
            float rust = smoothstep(0.45, 0.8, gS * 0.6 + gB * 0.5);
            alb = mix(base, vec3(0.13, 0.06, 0.03), rust * 0.8) * (0.85 + 0.15 * corr);
            tnNS = 0.0; tnRough = 0.6 + 0.3 * rust;
          }
        }
        diffuseColor.rgb = alb;
      }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = tnRough;')
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 Tn = normalize(vTV), Bn = normalize(vBV);
          vec3 nn = normalize(vec3(tnNrm.xy * tnNS, max(tnNrm.z, 0.2)));
          normal = normalize(Tn * nn.x + Bn * nn.y + normal * nn.z);
        }`);
  };
  return m;
}
