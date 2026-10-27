import{W as ae,D as ea,S as Ge,t as _e,a as ke}from"./index-lmDXErOy.js";import{S as pe,ac as va,M as $,Y as aa,a as Q,f as G,b as ce,ah as Oe,af as te,a3 as xa,B as Y,r as _,G as le,o as Pe,as as wa,at as be,au as Te,av as ka,V as O,u as qe,aw as Ta,ax as de,ay as ta,m as W,az as U,q as fe,aA as Fa,aB as Ra,ad as Aa,aC as ya,a1 as we,aD as na,aE as Sa,aF as Ea,aG as ja,aH as sa,aI as Da,aJ as Ma,aK as La,aL as Ee,j as oa,R as je,aM as Ga,a5 as Pa,aN as qa,aO as Fe,aP as _a,n as ia,aQ as Oa,aR as za,aS as Ka,aT as Ha,aU as Na,aV as Ca,ai as Wa,O as Ia,aW as Ua,aX as Ja,aY as Va,aZ as Ba,a_ as ra,a$ as Xa,b0 as ze,b1 as Ke,b2 as He,b3 as Ne,b4 as Ce,aj as Qa,b5 as Ya,ak as $a,b6 as Za,t as et,s as at,aa as tt}from"./vendor-DHjEPP33.js";const ca=()=>({uTop:{value:new G("#4d77ab")},uHorizon:{value:new G("#f3c99d")},uAnti:{value:new G("#d6c4bb")},uSunDir:{value:Ge.clone()},uSunColor:{value:new G("#ffc58a")},uDeep:{value:ea.clone()}}),la=`
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uAnti;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uDeep;
  // Horizon colour: warm towards the sun, a cool pale grey away from it.
  vec3 horizonColour(vec3 dir) {
    vec2 flatDir = normalize(dir.xz + vec2(1e-5));
    float toSun = dot(flatDir, normalize(uSunDir.xz)) * 0.5 + 0.5;
    return mix(uAnti, uHorizon, smoothstep(0.0, 1.0, toSun));
  }
  vec3 skyColour(vec3 dir) {
    float h = max(dir.y, 0.0);
    vec3 hor = horizonColour(dir);
    vec3 col = mix(hor, uTop, 1.0 - exp(-h * 3.2));
    // Low haze band sitting on the horizon.
    col = mix(col, hor * 1.06, exp(-h * 22.0) * 0.6);
    // Below the horizon (seen only by the environment): the sea, mirroring a cooler sky. At a
    // grazing angle water is a good mirror, so the first 10-15 degrees down stay a pale reflected
    // sky before the deep colour takes over; topsides lean slightly outboard and down, and their
    // clearcoat picks up that band as a soft gradient instead of a flat dark sheet.
    col = mix(col, mix(mix(hor, uTop, 0.55) * 0.55, uDeep * 1.4, smoothstep(0.0, 0.35, -dir.y)), smoothstep(0.0, 0.02, -dir.y));
    float sun = max(dot(dir, uSunDir), 0.0);
    col += uSunColor * (pow(sun, 5.0) * 0.28 + pow(sun, 40.0) * 0.55 + pow(sun, 400.0) * 1.2);
    return col;
  }
  // Tiny screen-space noise against 8-bit banding in long gradients.
  float dither(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) - 0.5; }
`,he=`
  // An integer hash of the cell p, exact however far the sea has streamed.
  float hash(vec2 p) {
    uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
    return float((q.x ^ q.y) * 1597334673u) / 4294967295.0;
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      s += a * vnoise(p);
      p = mat2(1.6, 1.2, -1.2, 1.6) * p;
      a *= 0.5;
    }
    return s;
  }
`;function We(){const d=new pe({uniforms:{...ca(),uAlpha:{value:1}},side:va,depthWrite:!1,vertexShader:`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w;
      }`,fragmentShader:`
      ${la}
      uniform float uAlpha;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        vec3 col = skyColour(dir);
        col += uSunColor * smoothstep(0.99955, 0.99975, dot(dir, uSunDir)) * 8.0;
        gl_FragColor = vec4(col, uAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += dither(gl_FragCoord.xy) / 255.0;
      }`}),e=new $(new aa(1500,48,24),d);return e.frustumCulled=!1,e.renderOrder=-1,e}const nt=.35,X=Array.from({length:16},(d,e)=>{const a=2*Math.PI/(11*Math.pow(.7,e)),t=nt+((e*.618034+.31)%1-.5)*2*(.5+.07*e);return{kx:a*Math.cos(t),kz:a*Math.sin(t),amp:.05*Math.pow(.74,e)*Math.pow(.8,Math.max(e-9,0)),omega:Math.sqrt(9.8*a),phase:e*2.4+e*.754877%1*6.283}}),ba=7;function st(d,e,a,t){let n=0;for(let s=0;s<ba;s++){const o=X[s],r=.5+.5*Math.sin(o.kx*(d+a)+o.kz*e-o.omega*t+o.phase);n+=o.amp*(2*r*Math.sqrt(r)-.85)}return n}const oe=d=>d.toFixed(6),ot=`
  #define SEA_GEOMETRY ${ba}
  // Per train: (kx, kz, amplitude, angular frequency), and its phase.
  const vec4 SEA_W[${X.length}] = vec4[${X.length}](${X.map(d=>`vec4(${oe(d.kx)}, ${oe(d.kz)}, ${oe(d.amp)}, ${oe(d.omega)})`).join(", ")});
  const float SEA_P[${X.length}] = float[${X.length}](${X.map(d=>oe(d.phase)).join(", ")});
  // Height of the chop at sea position q. Each train fades out as its wavelength nears a few ds
  // (the local grid spacing), so the geometry never aliases.
  float seaHeight(vec2 q, float t, float ds) {
    float h = 0.0;
    for (int i = 0; i < SEA_GEOMETRY; i++) {
      vec4 w = SEA_W[i];
      float s = 0.5 + 0.5 * sin(dot(q, w.xy) - w.w * t + SEA_P[i]);
      h += w.z * (2.0 * s * sqrt(s) - 0.85) * smoothstep(4.0, 8.0, 6.2832 / (length(w.xy) * ds));
    }
    return h;
  }
  // Slope (d height / dx, d height / dz) of the first n trains; each fades out as its wavelength
  // nears a few ds (here the pixel footprint), so distant water never sparkles with aliasing.
  vec2 seaSlope(vec2 q, float t, float ds, int n) {
    vec2 g = vec2(0.0);
    for (int i = 0; i < n; i++) {
      vec4 w = SEA_W[i];
      float ph = dot(q, w.xy) - w.w * t + SEA_P[i];
      float s = 0.5 + 0.5 * sin(ph);
      g += w.xy * w.z * 1.5 * sqrt(s) * cos(ph) * smoothstep(2.0, 6.0, 6.2832 / (length(w.xy) * ds));
    }
    return g;
  }
`,Ie=`
  uniform float uTime;
  uniform vec2 uHullX;
  uniform float uWl[${ae+1}];
  uniform float uRun;
  uniform float uFlow;
  uniform float uWash;
  uniform float uProp;
  uniform float uChine;
  ${he}
  ${ot}
  // Water half-width of the hull at x (0 off the hull).
  float hullHalf(float x) {
    float t = (x - uHullX.x) / uHullX.y;
    if (t < 0.0 || t > 1.0) return 0.0;
    float f = t * ${ae}.0;
    int i = int(min(floor(f), ${ae-1}.0));
    return mix(uWl[i], uWl[i + 1], f - float(i));
  }
  // Approximate signed distance from the hull's waterline (negative inside).
  float hullDist(vec2 p) {
    float t = (p.x - uHullX.x) / uHullX.y;
    float tc = clamp(t, 0.0, 1.0);
    float f = tc * ${ae}.0;
    int i = int(min(floor(f), ${ae-1}.0));
    float hw = mix(uWl[i], uWl[i + 1], f - float(i));
    float dz = abs(p.y) - hw;
    return length(vec2((t - tc) * uHullX.y, max(dz, 0.0))) + min(dz, 0.0);
  }
  // Inside the region the wake is worked out in: round the boat and 170 m astern.
  bool inWake(vec2 p) {
    return uRun > 0.5 && p.x > uHullX.x - 170.0 && abs(p.y) < 45.0 && p.x < uHullX.x + uHullX.y + 3.0;
  }
  // Where the diverging crest runs (distance off the centreline), its width and height: it peels
  // off the hull at the spray root, runs aft along the topsides, then spreads astern at about 10
  // degrees (a planing wake runs well inside the 19.5-degree Kelvin angle), widening and
  // flattening as it goes and dying out before the edge of the wake region.
  vec3 crest(vec2 p) {
    float xT = uHullX.x;
    float xS = uHullX.x + uHullX.y;
    float s = max(xT - p.x, 0.0);
    float along = clamp(xS - p.x, 0.0, xS - xT);
    // Alongside, the crest stands outboard of whichever is wider, the wetted bottom or the chines.
    float c0 = max(uWl[0] + 0.05, uChine + 0.1) + (xS - xT) * 0.08;
    float c = p.x < xT ? c0 + s * 0.17 : max(hullHalf(p.x) + 0.05, uChine * smoothstep(xS, xS - 1.2, p.x) + 0.1) + along * 0.08;
    float w = 0.22 + along * 0.03 + s * 0.028;
    float a = 0.17 * smoothstep(xS + 0.2, xS - 0.9, p.x) / sqrt(1.0 + s / 14.0) * smoothstep(170.0, 110.0, s);
    return vec3(c, w, a);
  }
  // The crest breaks up into short crests en echelon: lines at 50 degrees to the track with the
  // outer end further aft, a little longer astern, each of its own strength. 0..1.5 with sharp
  // crests and flat troughs, faded to its mean where the crests come within a few ds.
  float echelon(vec2 p, float s, float ds) {
    float lam = 1.4 + 0.05 * s;
    float side = p.y > 0.0 ? 3.0 : 9.0;
    float ph = (p.x * 0.766 + abs(p.y) * 0.643) * 6.2832 / lam + 1.5 * vnoise(vec2(p.x * 0.15, side));
    float e = 0.5 + 0.5 * cos(ph);
    e = e * e * (0.45 + 0.9 * vnoise(vec2(ph * 0.159, side + 11.0)));
    return mix(0.34, e, smoothstep(4.0, 7.0, lam / ds));
  }
  // Prop wash: aerated, churned water astern of each lower unit (uProp is their offset off the
  // centreline; twin streams run together within a few metres), spreading and fading.
  float washMask(vec2 p) {
    float s = max(uHullX.x - p.x, 0.0);
    float w = uWash + 0.06 * s;
    float zc = uProp * exp(-s / 6.0);
    float a = (p.y - zc) / w;
    float b = (p.y + zc) / w;
    return max(exp(-a * a * 1.3), exp(-b * b * 1.3)) * smoothstep(0.1, 0.9, uHullX.x - p.x) * exp(-s / 45.0) * smoothstep(170.0, 120.0, s);
  }
  // Inside the V, beyond the white water, a glassy slick where the chop is flattened, slowly
  // filling in astern.
  float slick(vec2 p) {
    vec3 k = crest(p);
    float s = uHullX.x - p.x;
    return smoothstep(k.x - 0.6 * k.y, k.x - 1.8 * k.y, abs(p.y)) * smoothstep(0.5, 4.0, s) * exp(-max(s, 0.0) / 140.0) * smoothstep(170.0, 120.0, s);
  }
  // How much of the open-sea chop survives at p: none under the hull or the forefoot just ahead
  // of the spray root, a little against the hull, less in the slick and the wash.
  float chopK(vec2 p) {
    float xS = uHullX.x + uHullX.y;
    float k = smoothstep(-0.15, 0.6, hullDist(p));
    k *= 1.0 - smoothstep(0.9, 0.3, abs(p.y)) * step(xS, p.x) * smoothstep(xS + 3.0, xS, p.x);
    if (inWake(p)) k *= (1.0 - 0.8 * slick(p)) * (1.0 - 0.6 * washMask(p));
    return k;
  }
  // Wake surface height (metres) at p, with detail down to ds.
  float wakeHeight(vec2 p, float ds) {
    float xT = uHullX.x;
    float xS = xT + uHullX.y;
    float s = xT - p.x;
    float az = abs(p.y);
    // Water heaped against the bottom along the wetted length, dying away a metre astern;
    // inboard of the waterline it dips under the hull.
    float dz = az - (p.x < xT ? uWl[0] : hullHalf(p.x));
    float heap = 0.08 * smoothstep(xS, xS - 0.8, p.x) * smoothstep(xT - 1.4, xT, p.x);
    float h = heap * (dz > 0.0 ? exp(-dz / 0.28) : 1.0 + dz / 0.1);
    // The transom runs dry: the water drops away behind it, then closes in 3-4 m astern in a
    // mound (the stern wave).
    float hT = max(uWl[0], 0.3);
    h -= 0.08 * exp(-s * s / 1.6) * exp(-p.y * p.y / (hT * hT)) * smoothstep(-0.4, 0.2, s);
    h += 0.13 * exp(-pow((s - 3.4) / 1.7, 2.0)) * exp(-p.y * p.y / (hT * hT * 0.8));
    // The diverging crest: a trough inside it, the crest itself breaking into short crests en
    // echelon from the transom aft, and a lower second crest outboard.
    vec3 k = crest(p);
    float u = (az - k.x) / k.y;
    // (the short crests only matter on and just outside the crest)
    float e = abs(u - 1.2) < 4.5 ? echelon(p, max(s, 0.0), ds) : 0.34;
    float feather = smoothstep(xT + 1.5, xT - 2.0, p.x);
    h += k.z * (exp(-u * u) * mix(1.0, 0.6 + 0.8 * e, feather) - 0.4 * exp(-(u + 1.8) * (u + 1.8) / 1.4) + 0.3 * exp(-(u - 2.4) * (u - 2.4) / 1.5) * (0.3 + 1.6 * e));
    return h;
  }
`;function it(d,e,a){const t=Math.ceil(Math.log(1+a*e/d)/e),n=Array.from({length:2*t+1},(b,f)=>Math.sign(f-t)*(d/e)*Math.expm1(e*Math.abs(f-t))),s=n.length,o=new Float32Array(s*s*3);for(let b=0;b<s;b++)for(let f=0;f<s;f++)o[(b*s+f)*3]=n[f],o[(b*s+f)*3+2]=n[b];const r=new Uint32Array((s-1)*(s-1)*6);let i=0;for(let b=0;b<s-1;b++)for(let f=0;f<s-1;f++){const h=b*s+f;r.set([h,h+s,h+1,h+1,h+s,h+s+1],i),i+=6}const c=new Float32Array(s*s*3);for(let b=1;b<c.length;b+=3)c[b]=1;const l=new Y;return l.setAttribute("position",new _(o,3)),l.setAttribute("normal",new _(c,3)),l.setIndex(new _(r,1)),l}function rt({detail:d=1}={}){const e=d?{s0:.06,k:.05}:{s0:.1,k:.08},a={...ca(),uTime:{value:0},uGlow:{value:[new Oe,new Oe]},uGlowAft:{value:new ce(-1,0)},uGlowOn:{value:0},uGlowColor:{value:new G("#5ccfe6")},uHullX:{value:new ce(-3,6)},uWl:{value:new Array(ae+1).fill(0)},tReflect:{value:null},uMirror:{value:new Q},uTexel:{value:new ce(1/512,1/512)},uRun:{value:0},uFlow:{value:0},uWash:{value:.3},uProp:{value:0},uChine:{value:1}},t=new pe({uniforms:a,transparent:!0,defines:{DETAIL:d?1:0,GRID_S0:e.s0.toFixed(3),GRID_K:e.k.toFixed(3)},vertexShader:`
      ${Ie}
      uniform mat4 uMirror;
      varying vec3 vWorld;
      varying vec2 vFlat;
      varying vec4 vMirror;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vec2 p = w.xz;
        // The grid's spacing here (see seaGrid): anything shorter is left to the normals.
        float ds = GRID_S0 + GRID_K * max(abs(p.x), abs(p.y));
        float h = seaHeight(p + vec2(uFlow, 0.0), uTime, ds) * chopK(p);
        // The wash boils up a little above the sea round it.
        if (inWake(p)) h += wakeHeight(p, ds) + 0.03 * washMask(p);
        vFlat = p;
        // The reflection is a mirror in the mean surface (renderReflection in scene.js).
        vMirror = uMirror * w;
        w.y += h;
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,fragmentShader:`
      ${la}
      ${Ie}
      uniform vec4 uGlow[2];
      uniform vec2 uGlowAft;
      uniform float uGlowOn;
      uniform vec3 uGlowColor;
      uniform sampler2D tReflect;
      uniform vec2 uTexel;
      varying vec3 vWorld;
      varying vec2 vFlat;
      varying vec4 vMirror;

      #if DETAIL == 1
        #define WAVES 16
      #else
        #define WAVES 10
      #endif

      // Cellular noise: distances to the nearest and second-nearest of one random point per unit
      // cell. F1 is 0 at the points (round gaps open around them); F2 - F1 is 0 on the walls
      // between cells (veins). The points keep to the middle half of their cells, so the 3 x 3
      // search always finds the true second-nearest (no seams); the warp supplies the disorder.
      vec2 cells(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float d1 = 8.0;
        float d2 = 8.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 o = vec2(float(x), float(y));
            vec2 r = o + 0.25 + 0.5 * vec2(hash(i + o), hash(i + o + vec2(57.0, 113.0))) - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
        }
        return sqrt(vec2(d1, d2));
      }
      // Foam streaming with the sea, at density f (0..1) and age (0 right behind the transom and
      // along the chines, 1 some tens of metres astern). Everything is drawn out hard along the
      // flow and bent by a slow domain warp (young foam also churns), so nothing reads as cells.
      //   dense, young foam: solid turbulent white with small, irregular gaps (fine cells' F1,
      //     opened only where the spread noise is low)
      //   thinner, older foam: a lace of veins (the large cells' walls, F2 - F1) whose width
      //     wanders with the spread noise, so the holes between them are of very different sizes
      //     and merge and tear; then streaks along the flow, faint lines
      // Detail smaller than a few pixels (fp, the footprint in metres) falls back to the share of
      // the water it would cover, so it never shimmers far off.
      float foamLace(vec2 q, float f, float age, float fp) {
        float spread = vnoise(q * vec2(0.16, 0.55));
        vec2 warp = vec2(vnoise(q * vec2(0.45, 1.1)), vnoise(q * vec2(0.45, 1.1) + 17.0)) - 0.5;
        warp += (vec2(vnoise(q * 1.1 + uTime * 0.8), vnoise(q * 1.1 - uTime * 0.8 + 7.0)) - 0.5) * 0.8 * max(1.0 - age, 0.0);
        float sharp = smoothstep(0.7, 0.2, fp * 1.6);
        vec2 c = cells(q * vec2(0.4, 1.6) + warp * 1.3);
        float lace = mix(0.45, 1.0 - smoothstep(0.0, 0.12 + 0.45 * spread, c.y - c.x), sharp);
        float gaps = 0.6;
        #if DETAIL == 1
          c = cells(q * vec2(1.8, 4.5) + warp * 3.0);
          gaps = mix(0.6, min(c.x * 1.5, 1.0), smoothstep(0.7, 0.2, fp * 4.5));
        #endif
        float streaks = mix(0.5, vnoise(q * vec2(0.3, 6.0)), smoothstep(0.5, 0.1, fp * 6.0));
        // Young foam fills in between the veins; only the fine gaps stay open.
        float v = lace * 0.4 + gaps * 0.3 + spread * 0.3 + (streaks - 0.5) * 0.5 * min(age, 1.0) + 0.4 * smoothstep(0.05, 0.3, f) * smoothstep(0.4, 0.0, age);
        float thr = 1.0 - 0.85 * f;
        // Thin foam is translucent; dense foam is shaded by its own bubbles.
        float cover = mix(smoothstep(0.9, 0.3, thr), smoothstep(thr, thr + 0.14 + 4.0 * fp, v), sharp);
        return cover * (0.45 + 0.55 * f) * (0.82 + 0.25 * gaps) * smoothstep(0.02, 0.12, f);
      }
      // The churned surface of the prop wash: lumps boiling up as they stream aft.
      float churn(vec2 q) {
        return vnoise(q * vec2(1.3, 2.0) + vec2(0.0, uTime * 0.6)) + 0.5 * vnoise(q * vec2(3.1, 4.4) - vec2(uTime * 0.9, 0.0));
      }

      void main() {
        vec2 p = vFlat;
        float dist = length(vWorld.xz - cameraPosition.xz);
        float fade = 1.0 / (1.0 + dist * 0.07);
        // The pixel footprint on the water, in metres.
        float fp = max(length(fwidth(p)), 1e-4);
        float d = max(hullDist(p), 0.0);
        // The hull damps the ripples in its lee.
        float lee = exp(-d * 1.4) * (1.0 - 0.6 * uRun);
        // Underway the whole sea (ripples, chop and foam) streams aft past the hull.
        vec2 q = p + vec2(uFlow, 0.0);
        vec2 g = seaSlope(q, uTime, fp, WAVES) * chopK(p);
        float foam = 0.0;
        float aer = 0.0;
        if (inWake(p)) {
          // Finite differences no finer than the footprint, which also filters the wake far off.
          float e = max(0.03, fp);
          float h0 = wakeHeight(p, fp);
          g += vec2(wakeHeight(p + vec2(e, 0.0), fp) - h0, wakeHeight(p + vec2(0.0, e), fp) - h0) / e;
          float xT = uHullX.x;
          float xS = uHullX.x + uHullX.y;
          float s = max(xT - p.x, 0.0);
          float az = abs(p.y);
          float wash = washMask(p);
          if (wash > 0.02) {
            float c0 = churn(q);
            g += vec2(churn(q + vec2(e, 0.0)) - c0, churn(q + vec2(0.0, e)) - c0) / e * wash * 0.05 * exp(-s / 25.0) * smoothstep(0.3, 0.05, fp);
          }
          vec3 k = crest(p);
          float u = (az - k.x) / k.y;
          // White water along the chines from the spray root aft, peeling away astern along the
          // inner flank of the crest; whitecaps on the short crests close to the boat; the wash.
          float side = smoothstep(k.x + 0.5 * k.y, k.x - 0.6 * k.y, az) * smoothstep(xS + 0.1, xS - 0.7, p.x) * (0.6 * exp(-s / 5.0) + 0.4 * exp(-s / 30.0));
          if (p.x < xT) side *= smoothstep(k.x - 2.2 * k.y, k.x - 1.0 * k.y, az);
          float caps = exp(-u * u * 1.8) * smoothstep(xS + 0.1, xS - 0.9, p.x) * exp(-s / 12.0) * smoothstep(0.45, 1.1, echelon(p, s, fp));
          float fs = side * 0.85;
          float fc = caps * 0.75;
          // The wash is a dense white mass for a few metres, then a long thinning tail.
          float fw = wash * (0.35 + 0.65 * exp(-s / 10.0));
          // Ragged edges: the masks themselves wander a little.
          float f = max(max(fs, fc), fw) * (0.75 + 0.5 * vnoise(q * vec2(0.4, 1.3)));
          if (f > 0.02) {
            // Age: the wash from the props, the side water from the spray root, the caps from the
            // moment they break.
            float age = (fw * s / 30.0 + fs * ((xS - max(p.x, xT)) / (xS - xT) * 0.3 + s / 14.0) + fc * (0.35 + s / 20.0)) / (fw + fs + fc);
            foam = min(foamLace(q, f, age, fp), 1.0);
          }
          aer = clamp(max(wash * (0.5 + 0.8 * exp(-s / 15.0)), max(caps * 0.5, side)), 0.0, 1.0);
        }
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float nv = clamp(dot(n, v), 0.0, 1.0);
        float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);

        // Water body: deep blue-green, lifted a touch by sky light and the low sun's scatter.
        vec3 body = uDeep * (0.8 + 2.2 * max(dot(n, uSunDir) - 0.12, 0.0)) + uTop * 0.02;
        // Aerated water under and around the foam glows a lighter green-turquoise.
        body = mix(body, vec3(0.15, 0.32, 0.34) * (0.8 + 1.4 * max(dot(n, uSunDir), 0.0)), aer * 0.45);

        // Planar reflection of the boat and sky, broken up by the waves and stretched vertically
        // the way small waves smear a reflection.
        vec2 ruv = vMirror.xy / vMirror.w + g * (0.055 + 0.1 * uRun);
        // Alpha is the boat's mask in the mirror image (the sky writes none).
        vec4 mirror = texture2D(tReflect, ruv) * 0.5;
        #if DETAIL == 1
          vec2 sv = vec2(0.0, uTexel.y * (1.5 + 3.0 * (1.0 - lee)) * (1.0 + uRun));
          mirror += texture2D(tReflect, ruv + sv) * 0.25;
          mirror += texture2D(tReflect, ruv - sv) * 0.25;
        #else
          mirror *= 2.0;
        #endif
        vec3 refl = mirror.rgb;

        // Underwater lights: a soft cyan cone under the surface, from each lamp spreading aft;
        // deeper lamps glow wider and fainter. xyz = lamp, w = 1 when fitted.
        vec3 glow = vec3(0.0);
        for (int i = 0; i < 2; i++) {
          vec2 rel = p - uGlow[i].xz;
          float depth = clamp(-uGlow[i].y, 0.03, 1.0);
          float along = dot(rel, uGlowAft);
          float across = dot(rel, vec2(-uGlowAft.y, uGlowAft.x));
          float width = 0.14 + depth * 0.4 + 0.32 * max(along, 0.0);
          float reach = along < 0.0 ? exp(-along * along / 0.02) : exp(-along / (0.8 + depth));
          float k = reach * exp(-across * across / (width * width)) * smoothstep(-0.25, 0.1, along);
          glow += uGlowColor * k * uGlow[i].w * exp(-depth * 2.0);
        }
        body += glow * uGlowOn * 0.35;

        // Aerated water is a poor mirror.
        vec3 col = mix(body, refl, fres * (1.0 - 0.6 * aer));

        // Sun glitter: a sharp sparkle up close widening into a glitter path with distance,
        // where the ripples are too small to resolve.
        vec3 hv = normalize(uSunDir + v);
        float e = mix(60.0, 1400.0, fade * fade);
        float spec = pow(max(dot(n, hv), 0.0), e) * (e + 8.0) / 25.0;
        col += uSunColor * spec * fres * 0.9 * (1.0 - 0.8 * lee) * (1.0 - mirror.a) * (1.0 - foam);

        // At rest: a dark contact band where the water meets the hull, and a faint broken wash
        // line. Underway the white water along the chines takes their place.
        col = mix(col, uDeep * 0.3, 0.55 * exp(-d / 0.07) * (1.0 - uRun));
        float broken = 0.5 + 0.5 * sin(p.x * 11.0 + uTime * 1.1 + 3.0 * sin(p.y * 7.0 + uTime * 0.7));
        col += vec3(0.5, 0.52, 0.5) * exp(-pow(d / 0.025, 2.0)) * broken * 0.12 * (1.0 - uRun);

        // Foam: matte white, lit by the low sun and the sky, a little shaded in its own troughs.
        vec3 foamCol = vec3(0.86, 0.9, 0.92) * (0.8 + 0.6 * max(dot(n, uSunDir), 0.0)) * mix(vec3(1.0), uSunColor, 0.18);
        col = mix(col, foamCol, foam);

        // Horizon haze.
        col = mix(col, skyColour(normalize(vec3(-v.x, 0.01, -v.z))), smoothstep(80.0, 1200.0, dist));

        // Clear water within a hand's breadth of the hull: the submerged plate shows through,
        // tinted by the wet-material patch; beyond, the sea is opaque.
        float clear = 0.45 * exp(-d / 0.12) * (1.0 - fres) * step(0.001, d) * (1.0 - uRun);
        gl_FragColor = vec4(col, 1.0 - clear);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += dither(gl_FragCoord.xy) / 255.0;
      }`}),n=new $(it(e.s0,e.k,1500),t);return n.renderOrder=-1,n}function ct(){const d=new te({color:ea.clone().multiplyScalar(.55)}),e=new $(new xa(60,60),d);return e.rotation.x=-Math.PI/2,e.position.y=-1.2,e}const xe=9.8,lt=1/140,De={sheet:.7,drop:1.4,mist:4},Ue=0,ee=1,bt=2;function dt(d,e){const a=qe.clamp(-d.vHeave/.25,0,1),t=Math.exp(-(((e-.15)/.16)**2));return .7+.35*a+1.6*t}function da(d,e,a,t,n){return d.set(-e*(.5+.1*t),(.9+1.7*a*(.6+.4*t))*n,(1.8+2.2*a*(.5+.5*t))*n)}function fa(d,e,a,t,n){return d.set(-e*(.75+.15*t),(2.5+1.5*t)*(1-.4*a*a)*n,a*.45)}function ft({chine:d,props:e}){const a=Math.max(...d.map(s=>s[3])),t=new O,n=[1,-1].map(s=>d.map(([o,r,i,c])=>(da(t,1,c/a,.6,1),[o,r,s*(i+.01),c/a,t.x,t.y,s*t.z])));for(const[s,o]of e)n.push(Array.from({length:7},(r,i)=>{const c=i/3-1;return fa(t,1,c,.5,1),[s-.1,0,o+.07*c,.75*(1-c*c),t.x,t.y,t.z]}));return n}function ht({count:d=2400}={}){const e=new le,a=pt(),t=ut(d);e.add(a.mesh,t.mesh),e.visible=!1;let n=0,s=9,o=!1;const r=new Q,i={vHeave:0};function c(l,b,f,h=i){n+=l,s=o&&!(h.slam>0)?0:s+l,o=h.slam>0;const v=dt(h,s);r.copy(b.matrixWorld),a.update(n,v,r),t.step(l,v,r,f)}return{object:e,setRig(l){a.build(ft(l)),t.setRig(l)},warm(l,b){a.setSpeed(b),n-=1;for(let f=0;f<40;f++)c(1/40,l,b)},update(l,b,f,h,v){l<=0||(n=b-Math.min(l,1/20),c(Math.min(l,1/20),f,h,v))},setScale(l){t.mesh.material.uniforms.uScale.value=l}}}const ha=`
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSky;
  vec3 sprayColour(vec3 world, float aer) {
    float fwd = max(dot(normalize(world - cameraPosition), uSunDir), 0.0);
    float scatter = pow(fwd, 5.0) * 1.4 + pow(fwd, 30.0) * 2.5;
    return uSky * (0.65 + 0.35 * aer) + uSunColor * (0.35 + 0.35 * aer + scatter);
  }
`,pa=()=>({uSunDir:{value:Ge.clone()},uSunColor:{value:new G("#ffd2a6")},uSky:{value:new G("#b9c6d2")}}),ie=14;function pt(){const d=new pe({uniforms:{...pa(),uBoat:{value:new Q},uTime:{value:0},uSurge:{value:1},uSpeed:{value:10},uFlight:{value:.5}},transparent:!0,depthWrite:!1,side:Pe,vertexShader:`
      attribute vec3 aLaunch;
      attribute vec3 aVel;
      attribute vec3 aSheet;
      uniform mat4 uBoat;
      uniform float uSurge;
      uniform float uSpeed;
      uniform float uFlight;
      varying vec3 vSheet;
      varying vec3 vWorld;
      void main() {
        vSheet = aSheet;
        float lift = 0.85 + 0.2 * uSurge;
        float tau = aSheet.x * uFlight * (0.85 + 0.15 * uSurge);
        // In the boat's frame the air streams aft at the cruising speed and drags the sheet with it.
        vec3 air = vec3(-uSpeed, 0.0, 0.0);
        vec3 v0 = aVel * vec3(uSpeed, lift, lift);
        float k = ${De.sheet.toFixed(2)};
        vec3 d = air * tau + (v0 - air) * (1.0 - exp(-k * tau)) / k;
        // Launched from the station, or from the surface where that is under water (the props).
        vec3 w = (uBoat * vec4(aLaunch, 1.0)).xyz;
        w.y = max(w.y, 0.01);
        w += mat3(uBoat) * d;
        w.y -= 0.5 * ${xe.toFixed(1)} * tau * tau;
        vWorld = w;
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,fragmentShader:`
      ${he}
      ${ha}
      uniform float uTime;
      uniform float uSurge;
      uniform float uFlight;
      varying vec3 vSheet;
      varying vec3 vWorld;
      void main() {
        float tn = vSheet.x;
        float s = vSheet.y;
        // Streaks running out along the trajectories, streaming outwards with the water.
        float run = tn * 3.0 - uTime / uFlight * 3.0;
        float lig = vnoise(vec2(s * 46.0, run)) * 0.6 + vnoise(vec2(s * 110.0 + 7.0, run * 1.7)) * 0.4;
        // Whole near the chine, tearing into ligaments, then gone (into drops) by the end.
        float tear = smoothstep(0.12, 0.9, tn);
        float thr = mix(-0.4, 0.7, tear);
        float a = smoothstep(thr, thr + 0.18, lig);
        // Strongest mid-strip (just aft of the spray root), ragged at both ends.
        float ends = smoothstep(0.1, 0.5, vSheet.z + (vnoise(vec2(s * 14.0, run * 0.7)) - 0.5) * 0.7);
        a *= ends * smoothstep(0.0, 0.06, tn) * smoothstep(1.0, 0.8, tn);
        // A thin sheet is clear face-on and whiter where it is seen edge-on.
        vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        float edge = 1.0 - abs(dot(n, normalize(cameraPosition - vWorld)));
        a *= (0.2 + 0.55 * edge * edge + 0.2 * tear) * (0.75 + 0.25 * uSurge);
        // Gone where it meets the water.
        a *= smoothstep(-0.01, 0.07, vWorld.y);
        gl_FragColor = vec4(sprayColour(vWorld, 0.4 + 0.6 * tear), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`}),e=new $(new Y,d);return e.frustumCulled=!1,{mesh:e,setSpeed(a){d.uniforms.uSpeed.value=a},build(a){const t=a.reduce((c,l)=>c+l.length,0)*(ie+1),n=new Float32Array(t*3),s=new Float32Array(t*3),o=new Float32Array(t*3),r=[];let i=0;for(const c of a){const l=c.length;c.forEach(([b,f,h,v,k,w,u],g)=>{for(let p=0;p<=ie;p++,i++)if(n.set([b,f,h],i*3),s.set([k,w,u],i*3),o.set([p/ie,g/(l-1),v],i*3),g<l-1&&p<ie){const m=i,x=i+ie+1;r.push(m,x,m+1,x,x+1,m+1)}})}e.geometry.dispose(),e.geometry=new Y,e.geometry.setAttribute("position",new _(n,3)),e.geometry.setAttribute("aLaunch",e.geometry.getAttribute("position")),e.geometry.setAttribute("aVel",new _(s,3)),e.geometry.setAttribute("aSheet",new _(o,3)),e.geometry.setIndex(r)},update(a,t,n){d.uniforms.uTime.value=a,d.uniforms.uSurge.value=t,d.uniforms.uBoat.value.copy(n)}}}function ut(d){const e=new Float32Array(d*3),a=new Float32Array(d*3),t=new Float32Array(d*4),n=new Float32Array(d),s=new Float32Array(d).fill(-1),o=new wa;o.setAttribute("position",new _(new Float32Array([-1,-1,0,1,-1,0,1,1,0,-1,1,0]),3)),o.setIndex([0,1,2,0,2,3]);const r=new be(e,3).setUsage(Te),i=new be(a,3).setUsage(Te),c=new be(t,4).setUsage(Te);o.setAttribute("aPos",r),o.setAttribute("aVel",i),o.setAttribute("aInfo",c),o.instanceCount=d;const l=new pe({uniforms:{...pa(),uScale:{value:800}},transparent:!0,depthWrite:!1,vertexShader:`
      attribute vec3 aPos;
      attribute vec3 aVel;
      attribute vec4 aInfo;
      uniform float uScale;
      varying vec2 vQuad;
      varying float vRun;
      varying float vAlpha;
      varying float vMist;
      varying float vGlint;
      varying float vSeed;
      varying vec3 vWorld;
      void main() {
        float k = aInfo.x;
        float kind = aInfo.z;
        vMist = kind == ${ee}.0 ? 1.0 : 0.0;
        vSeed = aInfo.w;
        vWorld = aPos;
        vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
        float depth = max(-mv.z, 0.05);
        float size = aInfo.y * (vMist > 0.5 ? 0.5 + 1.1 * k : 1.0);
        float w = max(0.5 * size, 0.6 * depth / uScale);
        // Motion across the view at the drop's depth (metres per second).
        vec3 vv = (modelViewMatrix * vec4(aVel, 0.0)).xyz;
        vec2 d = vv.xy + mv.xy * vv.z / depth;
        float speed = length(d);
        vec2 dir = speed > 1e-4 ? d / speed : vec2(1.0, 0.0);
        float stretch = vMist > 0.5 ? 1.0 : kind == ${Ue}.0 ? 1.0 + 3.5 * (1.0 - smoothstep(0.0, 0.25, k)) : 1.0;
        float run = min(0.5 * speed * ${lt.toFixed(4)} * stretch, min(0.08, w * (2.5 + 1.2 * (stretch - 1.0))));
        mv.xy += dir * position.x * (run + w) + vec2(-dir.y, dir.x) * position.y * w;
        gl_Position = projectionMatrix * mv;
        vQuad = vec2(position.x * (run + w) / w, position.y);
        vRun = run / w;
        // Coverage: the drop's own width over the drawn width, spread along its streak.
        float cover = 0.5 * size / w * mix(1.0, w / (w + run), 0.55);
        vAlpha = vMist > 0.5 ? 0.045 * sin(3.14159 * k) : (1.0 - k * k) * 0.9 * cover;
        // Drops fade into the water as they fall back; mist lies low over it.
        vAlpha *= smoothstep(-0.01, vMist > 0.5 ? 0.12 : 0.05, aPos.y);
        // Nothing streaks across the lens.
        vAlpha *= smoothstep(0.4, 1.9, depth);
        if (aInfo.y <= 0.0) vAlpha = 0.0;
        // Now and then a drop catches the sun.
        vGlint = vMist > 0.5 ? 0.0 : pow(max(sin(vSeed * 40.0 + k * 22.0), 0.0), 60.0) * cover;
      }`,fragmentShader:`
      ${he}
      ${ha}
      varying vec2 vQuad;
      varying float vRun;
      varying float vAlpha;
      varying float vMist;
      varying float vGlint;
      varying float vSeed;
      varying vec3 vWorld;
      void main() {
        // Along the streak (0 at its middle, 1 at its tips) and across it, in half-widths.
        float t = abs(vQuad.x) / (vRun + 1.0);
        float r = t * t + vQuad.y * vQuad.y;
        if (t > 1.0) discard;
        float a;
        if (vMist > 0.5) {
          // A cloud of fine droplets, not a smoke puff: soft, and grainy inside.
          float grain = vnoise(vQuad * 3.5 + vSeed * 31.0);
          a = exp(-r * 3.0) * (0.45 + 0.9 * grain);
        } else {
          // A spindle that narrows to soft points at both tips, brighter at its head than its tail
          // (a round drop when it barely moves).
          float y = vQuad.y / max(sqrt(1.0 - t * t), 0.2);
          a = exp(-y * y * 2.6) * (1.0 - t * t) * mix(0.6, 1.0, vQuad.x / (vRun + 1.0) * 0.5 + 0.5);
        }
        vec3 col = sprayColour(vWorld, 0.6 + 0.4 * vMist) + uSunColor * vGlint * 4.0;
        gl_FragColor = vec4(col, a * min(vAlpha + vGlint, 1.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`}),b=new $(o,l);b.frustumCulled=!1;let f=[],h=0,v=1,k=[],w=0,u=0;const g=new O,p=new O,m=new ka;function x(A,y,M,z,S,j,P,K){const H=w;w=(w+1)%d,g.set(y,M,z).applyMatrix4(A),p.applyMatrix3(m);const Z=H*3;e[Z]=g.x+p.x*S,e[Z+1]=Math.max(g.y+p.y*S-.5*xe*S*S,.005),e[Z+2]=g.z+p.z*S,a[Z]=p.x,a[Z+1]=p.y-xe*S,a[Z+2]=p.z,n[H]=0,s[H]=j,t[H*4]=0,t[H*4+1]=P,t[H*4+2]=K,t[H*4+3]=Math.random()}const R=(A,y)=>A+(y-A)*Math.pow(Math.random(),3);function T(A,y,M){const z=.85+.2*M;if(Math.random()<.7&&f.length){let S=Math.random()*h,j=f[0];for(const H of f)if(j=H,S-=H[3],S<=0)break;const P=Math.random()<.5?-1:1,K=Math.random()<.08;da(p,y,j[3]/v,Math.random(),z*(.9+.2*Math.random())),p.z*=P,x(A,j[0]+(Math.random()-.5)*.25,j[1],P*(j[2]+.01),K?.12+.1*Math.random():.04+.12*Math.random(),K?.6+.5*Math.random():.45+.35*Math.random(),K?.05+.06*Math.random():R(.004,.022),K?ee:Ue)}else if(k.length){const[S,j]=k[Math.floor(Math.random()*k.length)],P=Math.random()<.14;fa(p,y,Math.random()*2-1,Math.random(),z*(.85+.3*Math.random())),x(A,S-.25*Math.random(),.02,j+(Math.random()-.5)*.12,0,P?.7+.5*Math.random():.35+.4*Math.random(),P?.07+.08*Math.random():R(.005,.028),P?ee:bt)}}function E(A,y,M,z){for(m.setFromMatrix4(M),u+=d/.6*.62*y*A;u>=1;)T(M,z,y),u-=1;for(let S=0;S<d;S++){if(s[S]<0)continue;n[S]+=A;const j=S*3,P=t[S*4+2],K=(P===ee?De.mist:De.drop)*A;if(a[j]+=(-z-a[j])*K,a[j+2]-=a[j+2]*K,P===ee?a[j+1]=a[j+1]*(1-K)+.1*A:a[j+1]-=xe*A,e[j]+=a[j]*A,e[j+1]+=a[j+1]*A,e[j+2]+=a[j+2]*A,n[S]>=s[S]||P!==ee&&e[j+1]<-.01){s[S]=-1,t[S*4+1]=0;continue}t[S*4]=n[S]/s[S]}r.needsUpdate=!0,i.needsUpdate=!0,c.needsUpdate=!0}return{mesh:b,setRig(A){f=A.chine,h=f.reduce((y,M)=>y+M[3],0),v=Math.max(...f.map(y=>y[3])),k=A.props,s.fill(-1);for(let y=0;y<d;y++)t[y*4+1]=0},step:E}}const V=6;function gt({detail:d=1}={}){const e=new pe({uniforms:{uFlow:{value:0},uTime:{value:0},uSunDir:{value:Ge.clone()},uSunColor:{value:new G("#ffc58a")}},defines:{DETAIL:d},transparent:!0,depthWrite:!1,side:Pe,vertexShader:`
      ${he}
      uniform float uFlow;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        // The mound: highest a little out from the hull, heaving as the foam streams through.
        vec2 q = w.xz + vec2(uFlow, 0.0);
        float mound = pow(sin(3.14159 * min(uv.y * 1.4, 1.0)), 0.8) * smoothstep(0.0, 0.15, uv.x) * smoothstep(1.0, 0.75, uv.x);
        w.y += mound * (0.025 + 0.05 * vnoise(q * vec2(0.9, 2.2) + vec2(0.0, uTime * 0.4)));
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,fragmentShader:`
      ${he}
      uniform float uFlow;
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vec2 q = vWorld.xz + vec2(uFlow, 0.0);
        float fade = 1.0 / (1.0 + length(vWorld.xz - cameraPosition.xz) * 0.07);
        // The sea's foam pattern, exactly as water.js draws it.
        float n = fbm(q * vec2(0.7, 2.0) + vec2(0.0, uTime * 0.15));
        float grain = vnoise(q * vec2(5.0, 9.0) - vec2(uTime * 0.6, 0.0)) * 0.6 + vnoise(q * vec2(13.0, 21.0) + vec2(0.0, uTime)) * 0.4;
        float sea = n * 0.62 + mix(0.24, grain * 0.5, fade);
        // Rolls lying along the hull, tumbling outwards as they stream aft.
        vec2 r = vec2(q.x * 1.2, (abs(vWorld.z) - uTime * 1.3) * 5.0);
        float roll = fbm(r);
        #if DETAIL == 1
          vec2 slope = vec2(fbm(r + vec2(0.08, 0.0)) - roll, fbm(r + vec2(0.0, 0.08)) - roll) / 0.08;
        #else
          vec2 slope = vec2(0.0);
        #endif
        // Dense against the hull, out to lace towards the sea; ragged at both ends.
        float body = smoothstep(1.0, 0.2, vUv.y + (n - 0.45) * 0.7) * smoothstep(0.0, 0.2, vUv.x + (n - 0.5) * 0.2) * smoothstep(1.0, 0.7, vUv.x);
        float core = body * body;
        float v = mix(sea, roll * 0.75 + grain * 0.25 + 0.2, core);
        float thr = 0.98 - 0.85 * body;
        float a = smoothstep(thr, thr + 0.2, v) * smoothstep(0.03, 0.25, body);
        // Sunlit faces bright, troughs a soft grey; thin foam shows the aerated water through it.
        vec3 nrm = normalize(vec3(-slope.x * 0.25, 1.0, -slope.y * 1.2 * sign(vWorld.z)));
        float lit = 0.6 + 0.6 * max(dot(nrm, uSunDir), 0.0) + 0.3 * (roll - 0.5) * core;
        vec3 foam = vec3(0.86, 0.9, 0.92) * lit * mix(vec3(1.0), uSunColor, 0.18);
        vec3 aer = vec3(0.15, 0.32, 0.34) * (0.9 + 1.4 * max(uSunDir.y, 0.0));
        gl_FragColor = vec4(mix(aer, foam, smoothstep(0.0, 0.5, a)), a * 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`}),a=new $(new Y,e);a.frustumCulled=!1,a.visible=!1;function t(n){const s=n.length,o=(V+1)*2,r=new Float32Array(s*o*3),i=new Float32Array(s*o*2),c=[];n.forEach(([l,b],f)=>{const h=f/(s-1);for(let v=0;v<=V;v++){const k=v/V,w=l[0]+(b[0]-l[0])*k,u=l[1]+(b[1]-l[1])*k,g=l[2]+(b[2]-l[2])*k;if(r.set([w,u,g],(f*o+v)*3),r.set([w,u,-g],(f*o+V+1+v)*3),i.set([h,k],(f*o+v)*2),i.set([h,k],(f*o+V+1+v)*2),f<s-1&&v<V)for(const p of[0,V+1]){const m=f*o+p+v,x=m+o;c.push(m,x,m+1,x,x+1,m+1)}}}),a.geometry.dispose(),a.geometry=new Y,a.geometry.setAttribute("position",new _(r,3)),a.geometry.setAttribute("uv",new _(i,2)),a.geometry.setIndex(c)}return{mesh:a,build:t}}function mt(d){const e=new Map,a=new Map,t=d.clone();return ua(d,t,function(n,s){e.set(s,n),a.set(n,s)}),t.traverse(function(n){if(!n.isSkinnedMesh)return;const s=n,o=e.get(n),r=o.skeleton.bones;s.skeleton=o.skeleton.clone(),s.bindMatrix.copy(o.bindMatrix),s.skeleton.bones=r.map(function(i){return a.get(i)}),s.bind(s.skeleton,s.bindMatrix)}),t}function ua(d,e,a){a(d,e);for(let t=0;t<d.children.length;t++)ua(d.children[t],e.children[t],a)}class vt extends Ta{constructor(e){super(e),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(a){return new Ft(a)}),this.register(function(a){return new Rt(a)}),this.register(function(a){return new Gt(a)}),this.register(function(a){return new Pt(a)}),this.register(function(a){return new qt(a)}),this.register(function(a){return new yt(a)}),this.register(function(a){return new St(a)}),this.register(function(a){return new Et(a)}),this.register(function(a){return new jt(a)}),this.register(function(a){return new Tt(a)}),this.register(function(a){return new Dt(a)}),this.register(function(a){return new At(a)}),this.register(function(a){return new Lt(a)}),this.register(function(a){return new Mt(a)}),this.register(function(a){return new wt(a)}),this.register(function(a){return new Je(a,F.EXT_MESHOPT_COMPRESSION)}),this.register(function(a){return new Je(a,F.KHR_MESHOPT_COMPRESSION)}),this.register(function(a){return new _t(a)})}load(e,a,t,n){const s=this;let o;if(this.resourcePath!=="")o=this.resourcePath;else if(this.path!==""){const c=de.extractUrlBase(e);o=de.resolveURL(c,this.path)}else o=de.extractUrlBase(e);this.manager.itemStart(e);const r=function(c){n?n(c):console.error(c),s.manager.itemError(e),s.manager.itemEnd(e)},i=new ta(this.manager);i.setPath(this.path),i.setResponseType("arraybuffer"),i.setRequestHeader(this.requestHeader),i.setWithCredentials(this.withCredentials),i.load(e,function(c){try{s.parse(c,o,function(l){a(l),s.manager.itemEnd(e)},r)}catch(l){r(l)}},t,r)}setDRACOLoader(e){return this.dracoLoader=e,this}setKTX2Loader(e){return this.ktx2Loader=e,this}setMeshoptDecoder(e){return this.meshoptDecoder=e,this}register(e){return this.pluginCallbacks.indexOf(e)===-1&&this.pluginCallbacks.push(e),this}unregister(e){return this.pluginCallbacks.indexOf(e)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1),this}parse(e,a,t,n){let s;const o={},r={},i=new TextDecoder;if(typeof e=="string")s=JSON.parse(e);else if(e instanceof ArrayBuffer)if(i.decode(new Uint8Array(e,0,4))===ga){try{o[F.KHR_BINARY_GLTF]=new Ot(e)}catch(b){n&&n(b);return}s=JSON.parse(o[F.KHR_BINARY_GLTF].content)}else s=JSON.parse(i.decode(e));else s=e;if(s.asset===void 0||s.asset.version[0]<2){n&&n(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}const c=new Qt(s,{path:a||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});c.fileLoader.setRequestHeader(this.requestHeader);for(let l=0;l<this.pluginCallbacks.length;l++){const b=this.pluginCallbacks[l](c);b.name||console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),r[b.name]=b,o[b.name]=!0}if(s.extensionsUsed)for(let l=0;l<s.extensionsUsed.length;++l){const b=s.extensionsUsed[l],f=s.extensionsRequired||[];switch(b){case F.KHR_MATERIALS_UNLIT:o[b]=new kt;break;case F.KHR_DRACO_MESH_COMPRESSION:o[b]=new zt(s,this.dracoLoader);break;case F.KHR_TEXTURE_TRANSFORM:o[b]=new Kt;break;case F.KHR_MESH_QUANTIZATION:o[b]=new Ht;break;default:f.indexOf(b)>=0&&r[b]===void 0&&console.warn('THREE.GLTFLoader: Unknown extension "'+b+'".')}}c.setExtensions(o),c.setPlugins(r),c.parse(t,n)}parseAsync(e,a){const t=this;return new Promise(function(n,s){t.parse(e,a,n,s)})}}function xt(){let d={};return{get:function(e){return d[e]},add:function(e,a){d[e]=a},remove:function(e){delete d[e]},removeAll:function(){d={}}}}function D(d,e,a){const t=d.json.materials[e];return t.extensions&&t.extensions[a]?t.extensions[a]:null}const F={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",KHR_MESHOPT_COMPRESSION:"KHR_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"};class wt{constructor(e){this.parser=e,this.name=F.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){const e=this.parser,a=this.parser.json.nodes||[];for(let t=0,n=a.length;t<n;t++){const s=a[t];s.extensions&&s.extensions[this.name]&&s.extensions[this.name].light!==void 0&&e._addNodeRef(this.cache,s.extensions[this.name].light)}}_loadLight(e){const a=this.parser,t="light:"+e;let n=a.cache.get(t);if(n)return n;const s=a.json,i=((s.extensions&&s.extensions[this.name]||{}).lights||[])[e];let c;const l=new G(16777215);i.color!==void 0&&l.setRGB(i.color[0],i.color[1],i.color[2],U);const b=i.range!==void 0?i.range:0;switch(i.type){case"directional":c=new Aa(l),c.target.position.set(0,0,-1),c.add(c.target);break;case"point":c=new Ra(l),c.distance=b;break;case"spot":c=new Fa(l),c.distance=b,i.spot=i.spot||{},i.spot.innerConeAngle=i.spot.innerConeAngle!==void 0?i.spot.innerConeAngle:0,i.spot.outerConeAngle=i.spot.outerConeAngle!==void 0?i.spot.outerConeAngle:Math.PI/4,c.angle=i.spot.outerConeAngle,c.penumbra=1-i.spot.innerConeAngle/i.spot.outerConeAngle,c.target.position.set(0,0,-1),c.add(c.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+i.type)}return c.position.set(0,0,0),N(c,i),i.intensity!==void 0&&(c.intensity=i.intensity),c.name=a.createUniqueName(i.name||"light_"+e),n=Promise.resolve(c),a.cache.add(t,n),n}getDependency(e,a){if(e==="light")return this._loadLight(a)}createNodeAttachment(e){const a=this,t=this.parser,s=t.json.nodes[e],r=(s.extensions&&s.extensions[this.name]||{}).light;return r===void 0?null:this._loadLight(r).then(function(i){return t._getNodeRef(a.cache,r,i)})}}class kt{constructor(){this.name=F.KHR_MATERIALS_UNLIT}getMaterialType(){return te}extendParams(e,a,t){const n=[];e.color=new G(1,1,1),e.opacity=1;const s=a.pbrMetallicRoughness;if(s){if(Array.isArray(s.baseColorFactor)){const o=s.baseColorFactor;e.color.setRGB(o[0],o[1],o[2],U),e.opacity=o[3]}s.baseColorTexture!==void 0&&n.push(t.assignTexture(e,"map",s.baseColorTexture,fe))}return Promise.all(n)}}class Tt{constructor(e){this.parser=e,this.name=F.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,a){const t=D(this.parser,e,this.name);return t===null||t.emissiveStrength!==void 0&&(a.emissiveIntensity=t.emissiveStrength),Promise.resolve()}}class Ft{constructor(e){this.parser=e,this.name=F.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){return D(this.parser,e,this.name)!==null?W:null}extendMaterialParams(e,a){const t=D(this.parser,e,this.name);if(t===null)return Promise.resolve();const n=[];if(t.clearcoatFactor!==void 0&&(a.clearcoat=t.clearcoatFactor),t.clearcoatTexture!==void 0&&n.push(this.parser.assignTexture(a,"clearcoatMap",t.clearcoatTexture)),t.clearcoatRoughnessFactor!==void 0&&(a.clearcoatRoughness=t.clearcoatRoughnessFactor),t.clearcoatRoughnessTexture!==void 0&&n.push(this.parser.assignTexture(a,"clearcoatRoughnessMap",t.clearcoatRoughnessTexture)),t.clearcoatNormalTexture!==void 0&&(n.push(this.parser.assignTexture(a,"clearcoatNormalMap",t.clearcoatNormalTexture)),t.clearcoatNormalTexture.scale!==void 0)){const s=t.clearcoatNormalTexture.scale;a.clearcoatNormalScale=new ce(s,s)}return Promise.all(n)}}class Rt{constructor(e){this.parser=e,this.name=F.KHR_MATERIALS_DISPERSION}getMaterialType(e){return D(this.parser,e,this.name)!==null?W:null}extendMaterialParams(e,a){const t=D(this.parser,e,this.name);return t===null||(a.dispersion=t.dispersion!==void 0?t.dispersion:0),Promise.resolve()}}class At{constructor(e){this.parser=e,this.name=F.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){return D(this.parser,e,this.name)!==null?W:null}extendMaterialParams(e,a){const t=D(this.parser,e,this.name);if(t===null)return Promise.resolve();const n=[];return t.iridescenceFactor!==void 0&&(a.iridescence=t.iridescenceFactor),t.iridescenceTexture!==void 0&&n.push(this.parser.assignTexture(a,"iridescenceMap",t.iridescenceTexture)),t.iridescenceIor!==void 0&&(a.iridescenceIOR=t.iridescenceIor),a.iridescenceThicknessRange===void 0&&(a.iridescenceThicknessRange=[100,400]),t.iridescenceThicknessMinimum!==void 0&&(a.iridescenceThicknessRange[0]=t.iridescenceThicknessMinimum),t.iridescenceThicknessMaximum!==void 0&&(a.iridescenceThicknessRange[1]=t.iridescenceThicknessMaximum),t.iridescenceThicknessTexture!==void 0&&n.push(this.parser.assignTexture(a,"iridescenceThicknessMap",t.iridescenceThicknessTexture)),Promise.all(n)}}class yt{constructor(e){this.parser=e,this.name=F.KHR_MATERIALS_SHEEN}getMaterialType(e){return D(this.parser,e,this.name)!==null?W:null}extendMaterialParams(e,a){const t=D(this.parser,e,this.name);if(t===null)return Promise.resolve();const n=[];if(a.sheenColor=new G(0,0,0),a.sheenRoughness=0,a.sheen=1,t.sheenColorFactor!==void 0){const s=t.sheenColorFactor;a.sheenColor.setRGB(s[0],s[1],s[2],U)}return t.sheenRoughnessFactor!==void 0&&(a.sheenRoughness=t.sheenRoughnessFactor),t.sheenColorTexture!==void 0&&n.push(this.parser.assignTexture(a,"sheenColorMap",t.sheenColorTexture,fe)),t.sheenRoughnessTexture!==void 0&&n.push(this.parser.assignTexture(a,"sheenRoughnessMap",t.sheenRoughnessTexture)),Promise.all(n)}}class St{constructor(e){this.parser=e,this.name=F.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){return D(this.parser,e,this.name)!==null?W:null}extendMaterialParams(e,a){const t=D(this.parser,e,this.name);if(t===null)return Promise.resolve();const n=[];return t.transmissionFactor!==void 0&&(a.transmission=t.transmissionFactor),t.transmissionTexture!==void 0&&n.push(this.parser.assignTexture(a,"transmissionMap",t.transmissionTexture)),Promise.all(n)}}class Et{constructor(e){this.parser=e,this.name=F.KHR_MATERIALS_VOLUME}getMaterialType(e){return D(this.parser,e,this.name)!==null?W:null}extendMaterialParams(e,a){const t=D(this.parser,e,this.name);if(t===null)return Promise.resolve();const n=[];a.thickness=t.thicknessFactor!==void 0?t.thicknessFactor:0,t.thicknessTexture!==void 0&&n.push(this.parser.assignTexture(a,"thicknessMap",t.thicknessTexture)),a.attenuationDistance=t.attenuationDistance||1/0;const s=t.attenuationColor||[1,1,1];return a.attenuationColor=new G().setRGB(s[0],s[1],s[2],U),Promise.all(n)}}class jt{constructor(e){this.parser=e,this.name=F.KHR_MATERIALS_IOR}getMaterialType(e){return D(this.parser,e,this.name)!==null?W:null}extendMaterialParams(e,a){const t=D(this.parser,e,this.name);return t===null||(a.ior=t.ior!==void 0?t.ior:1.5,a.ior===0&&(a.ior=1e3)),Promise.resolve()}}class Dt{constructor(e){this.parser=e,this.name=F.KHR_MATERIALS_SPECULAR}getMaterialType(e){return D(this.parser,e,this.name)!==null?W:null}extendMaterialParams(e,a){const t=D(this.parser,e,this.name);if(t===null)return Promise.resolve();const n=[];a.specularIntensity=t.specularFactor!==void 0?t.specularFactor:1,t.specularTexture!==void 0&&n.push(this.parser.assignTexture(a,"specularIntensityMap",t.specularTexture));const s=t.specularColorFactor||[1,1,1];return a.specularColor=new G().setRGB(s[0],s[1],s[2],U),t.specularColorTexture!==void 0&&n.push(this.parser.assignTexture(a,"specularColorMap",t.specularColorTexture,fe)),Promise.all(n)}}class Mt{constructor(e){this.parser=e,this.name=F.EXT_MATERIALS_BUMP}getMaterialType(e){return D(this.parser,e,this.name)!==null?W:null}extendMaterialParams(e,a){const t=D(this.parser,e,this.name);if(t===null)return Promise.resolve();const n=[];return a.bumpScale=t.bumpFactor!==void 0?t.bumpFactor:1,t.bumpTexture!==void 0&&n.push(this.parser.assignTexture(a,"bumpMap",t.bumpTexture)),Promise.all(n)}}class Lt{constructor(e){this.parser=e,this.name=F.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){return D(this.parser,e,this.name)!==null?W:null}extendMaterialParams(e,a){const t=D(this.parser,e,this.name);if(t===null)return Promise.resolve();const n=[];return t.anisotropyStrength!==void 0&&(a.anisotropy=t.anisotropyStrength),t.anisotropyRotation!==void 0&&(a.anisotropyRotation=t.anisotropyRotation),t.anisotropyTexture!==void 0&&n.push(this.parser.assignTexture(a,"anisotropyMap",t.anisotropyTexture)),Promise.all(n)}}class Gt{constructor(e){this.parser=e,this.name=F.KHR_TEXTURE_BASISU}loadTexture(e){const a=this.parser,t=a.json,n=t.textures[e];if(!n.extensions||!n.extensions[this.name])return null;const s=n.extensions[this.name],o=a.options.ktx2Loader;if(!o){if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return a.loadTextureImage(e,s.source,o)}}class Pt{constructor(e){this.parser=e,this.name=F.EXT_TEXTURE_WEBP}loadTexture(e){const a=this.name,t=this.parser,n=t.json,s=n.textures[e];if(!s.extensions||!s.extensions[a])return null;const o=s.extensions[a],r=n.images[o.source];let i=t.textureLoader;if(r.uri){const c=t.options.manager.getHandler(r.uri);c!==null&&(i=c)}return t.loadTextureImage(e,o.source,i)}}class qt{constructor(e){this.parser=e,this.name=F.EXT_TEXTURE_AVIF}loadTexture(e){const a=this.name,t=this.parser,n=t.json,s=n.textures[e];if(!s.extensions||!s.extensions[a])return null;const o=s.extensions[a],r=n.images[o.source];let i=t.textureLoader;if(r.uri){const c=t.options.manager.getHandler(r.uri);c!==null&&(i=c)}return t.loadTextureImage(e,o.source,i)}}class Je{constructor(e,a){this.name=a,this.parser=e}loadBufferView(e){const a=this.parser.json,t=a.bufferViews[e];if(t.extensions&&t.extensions[this.name]){const n=t.extensions[this.name],s=this.parser.getDependency("buffer",n.buffer),o=this.parser.options.meshoptDecoder;if(!o||!o.supported){if(a.extensionsRequired&&a.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return s.then(function(r){const i=n.byteOffset||0,c=n.byteLength||0,l=n.count,b=n.byteStride,f=new Uint8Array(r,i,c);return o.decodeGltfBufferAsync?o.decodeGltfBufferAsync(l,b,f,n.mode,n.filter).then(function(h){return h.buffer}):o.ready.then(function(){const h=new ArrayBuffer(l*b);return o.decodeGltfBuffer(new Uint8Array(h),l,b,f,n.mode,n.filter),h})})}else return null}}class _t{constructor(e){this.name=F.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){const a=this.parser.json,t=a.nodes[e];if(!t.extensions||!t.extensions[this.name]||t.mesh===void 0)return null;const n=a.meshes[t.mesh];for(const c of n.primitives)if(c.mode!==q.TRIANGLES&&c.mode!==q.TRIANGLE_STRIP&&c.mode!==q.TRIANGLE_FAN&&c.mode!==void 0)return null;const o=t.extensions[this.name].attributes,r=[],i={};for(const c in o)r.push(this.parser.getDependency("accessor",o[c]).then(l=>(i[c]=l,i[c])));return r.length<1?null:(r.push(this.parser.createNodeMesh(e)),Promise.all(r).then(c=>{const l=c.pop(),b=l.isGroup?l.children:[l],f=c[0].count,h=[];for(const v of b){const k=new Q,w=new O,u=new we,g=new O(1,1,1),p=new ya(v.geometry,v.material,f);for(let x=0;x<f;x++)i.TRANSLATION&&w.fromBufferAttribute(i.TRANSLATION,x),i.ROTATION&&u.fromBufferAttribute(i.ROTATION,x),i.SCALE&&g.fromBufferAttribute(i.SCALE,x),p.setMatrixAt(x,k.compose(w,u,g));let m=null;for(const x in i)if(x==="_COLOR_0"){const R=i[x];p.instanceColor=new be(R.array,R.itemSize,R.normalized)}else if(x!=="TRANSLATION"&&x!=="ROTATION"&&x!=="SCALE"){if(m===null){const T=p.geometry;m=new Y,m.name=T.name;for(const E in T.attributes)m.setAttribute(E,T.attributes[E]);for(const E in T.morphAttributes)m.morphAttributes[E]=T.morphAttributes[E];T.index!==null&&m.setIndex(T.index),m.morphTargetsRelative=T.morphTargetsRelative;for(const E of T.groups)m.addGroup(E.start,E.count,E.materialIndex);T.boundingBox!==null&&(m.boundingBox=T.boundingBox.clone()),T.boundingSphere!==null&&(m.boundingSphere=T.boundingSphere.clone()),m.drawRange.start=T.drawRange.start,m.drawRange.count=T.drawRange.count,m.userData=Object.assign({},T.userData),p.geometry=m}const R=i[x];m.setAttribute(x,new be(R.array,R.itemSize,R.normalized))}na.prototype.copy.call(p,v),this.parser.assignFinalMaterial(p),h.push(p)}return l.isGroup?(l.clear(),l.add(...h),l):h[0]}))}}const ga="glTF",re=12,Ve={JSON:1313821514,BIN:5130562};class Ot{constructor(e){this.name=F.KHR_BINARY_GLTF,this.content=null,this.body=null;const a=new DataView(e,0,re),t=new TextDecoder;if(this.header={magic:t.decode(new Uint8Array(e.slice(0,4))),version:a.getUint32(4,!0),length:a.getUint32(8,!0)},this.header.magic!==ga)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");const n=this.header.length-re,s=new DataView(e,re);let o=0;for(;o<n;){const r=s.getUint32(o,!0);o+=4;const i=s.getUint32(o,!0);if(o+=4,i===Ve.JSON){const c=new Uint8Array(e,re+o,r);this.content=t.decode(c)}else if(i===Ve.BIN){const c=re+o;this.body=e.slice(c,c+r)}o+=r}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}}class zt{constructor(e,a){if(!a)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=F.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=a,this.dracoLoader.preload()}decodePrimitive(e,a){const t=this.json,n=this.dracoLoader,s=e.extensions[this.name].bufferView,o=e.extensions[this.name].attributes,r={},i={},c={};for(const l in o){const b=Me[l]||l.toLowerCase();r[b]=o[l]}for(const l in e.attributes){const b=Me[l]||l.toLowerCase();if(o[l]!==void 0){const f=t.accessors[e.attributes[l]],h=ne[f.componentType];c[b]=h.name,i[b]=f.normalized===!0}}return a.getDependency("bufferView",s).then(function(l){return new Promise(function(b,f){n.decodeDracoFile(l,function(h){for(const v in h.attributes){const k=h.attributes[v],w=i[v];w!==void 0&&(k.normalized=w)}b(h)},r,c,U,f)})})}}class Kt{constructor(){this.name=F.KHR_TEXTURE_TRANSFORM}extendTexture(e,a){if((a.texCoord===void 0||a.texCoord===e.channel)&&a.offset===void 0&&a.rotation===void 0&&a.scale===void 0)return e;if(e=e.clone(),a.texCoord!==void 0&&(e.channel=a.texCoord),a.offset!==void 0&&e.offset.fromArray(a.offset),a.rotation!==void 0&&(e.rotation=a.rotation),a.scale!==void 0&&e.repeat.fromArray(a.scale),a.rotation!==void 0){const t=Math.cos(e.rotation),n=Math.sin(e.rotation);e.matrix.set(e.repeat.x*t,e.repeat.y*n,e.offset.x,-e.repeat.x*n,e.repeat.y*t,e.offset.y,0,0,1),e.matrixAutoUpdate=!1}return e.needsUpdate=!0,e}}class Ht{constructor(){this.name=F.KHR_MESH_QUANTIZATION}}class ma extends Ya{constructor(e,a,t,n){super(e,a,t,n)}copySampleValue_(e){const a=this.resultBuffer,t=this.sampleValues,n=this.valueSize,s=e*n*3+n;for(let o=0;o!==n;o++)a[o]=t[s+o];return a}interpolate_(e,a,t,n){const s=this.resultBuffer,o=this.sampleValues,r=this.valueSize,i=r*2,c=r*3,l=n-a,b=(t-a)/l,f=b*b,h=f*b,v=e*c,k=v-c,w=-2*h+3*f,u=h-f,g=1-w,p=u-f+b;for(let m=0;m!==r;m++){const x=o[k+m+r],R=o[k+m+i]*l,T=o[v+m+r],E=o[v+m]*l;s[m]=g*x+p*R+w*T+u*E}return s}}const Nt=new we;class Ct extends ma{interpolate_(e,a,t,n){const s=super.interpolate_(e,a,t,n);return Nt.fromArray(s).normalize().toArray(s),s}}const q={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6},ne={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},Be={9728:oa,9729:Ee,9984:La,9985:Ma,9986:Da,9987:sa},Xe={33071:Pa,33648:Ga,10497:je},Re={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},Me={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},J={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},Wt={CUBICSPLINE:void 0,LINEAR:ra,STEP:Ba},Ae={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function It(d){return d.DefaultMaterial===void 0&&(d.DefaultMaterial=new ia({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:Qa})),d.DefaultMaterial}function B(d,e,a){for(const t in a.extensions)d[t]===void 0&&(e.userData.gltfExtensions=e.userData.gltfExtensions||{},e.userData.gltfExtensions[t]=a.extensions[t])}function N(d,e){e.extras!==void 0&&(typeof e.extras=="object"?Object.assign(d.userData,e.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+e.extras))}function Ut(d,e,a){let t=!1,n=!1,s=!1;for(let c=0,l=e.length;c<l;c++){const b=e[c];if(b.POSITION!==void 0&&(t=!0),b.NORMAL!==void 0&&(n=!0),b.COLOR_0!==void 0&&(s=!0),t&&n&&s)break}if(!t&&!n&&!s)return Promise.resolve(d);const o=[],r=[],i=[];for(let c=0,l=e.length;c<l;c++){const b=e[c];if(t){const f=b.POSITION!==void 0?a.getDependency("accessor",b.POSITION):d.attributes.position;o.push(f)}if(n){const f=b.NORMAL!==void 0?a.getDependency("accessor",b.NORMAL):d.attributes.normal;r.push(f)}if(s){const f=b.COLOR_0!==void 0?a.getDependency("accessor",b.COLOR_0):d.attributes.color;i.push(f)}}return Promise.all([Promise.all(o),Promise.all(r),Promise.all(i)]).then(function(c){const l=c[0],b=c[1],f=c[2];return t&&(d.morphAttributes.position=l),n&&(d.morphAttributes.normal=b),s&&(d.morphAttributes.color=f),d.morphTargetsRelative=!0,d})}function Jt(d,e){if(d.updateMorphTargets(),e.weights!==void 0)for(let a=0,t=e.weights.length;a<t;a++)d.morphTargetInfluences[a]=e.weights[a];if(e.extras&&Array.isArray(e.extras.targetNames)){const a=e.extras.targetNames;if(d.morphTargetInfluences.length===a.length){d.morphTargetDictionary={};for(let t=0,n=a.length;t<n;t++)d.morphTargetDictionary[a[t]]=t}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function Vt(d){let e;const a=d.extensions&&d.extensions[F.KHR_DRACO_MESH_COMPRESSION];if(a?e="draco:"+a.bufferView+":"+a.indices+":"+ye(a.attributes):e=d.indices+":"+ye(d.attributes)+":"+d.mode,d.targets!==void 0)for(let t=0,n=d.targets.length;t<n;t++)e+=":"+ye(d.targets[t]);return e}function ye(d){let e="";const a=Object.keys(d).sort();for(let t=0,n=a.length;t<n;t++)e+=a[t]+":"+d[a[t]]+";";return e}function Le(d){switch(d){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function Bt(d){return d.search(/\.jpe?g($|\?)/i)>0||d.search(/^data\:image\/jpeg/)===0?"image/jpeg":d.search(/\.webp($|\?)/i)>0||d.search(/^data\:image\/webp/)===0?"image/webp":d.search(/\.ktx2($|\?)/i)>0||d.search(/^data\:image\/ktx2/)===0?"image/ktx2":"image/png"}const Xt=new Q;class Qt{constructor(e={},a={}){this.json=e,this.extensions={},this.plugins={},this.options=a,this.cache=new xt,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let t=!1,n=-1,s=!1,o=-1;if(typeof navigator<"u"&&typeof navigator.userAgent<"u"){const r=navigator.userAgent;t=/^((?!chrome|android).)*safari/i.test(r)===!0;const i=r.match(/Version\/(\d+)/);n=t&&i?parseInt(i[1],10):-1,s=r.indexOf("Firefox")>-1,o=s?r.match(/Firefox\/([0-9]+)\./)[1]:-1}typeof createImageBitmap>"u"||t&&n<17||s&&o<98?this.textureLoader=new Sa(this.options.manager):this.textureLoader=new Ea(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new ta(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials"&&this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,a){const t=this,n=this.json,s=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(o){return o._markDefs&&o._markDefs()}),Promise.all(this._invokeAll(function(o){return o.beforeRoot&&o.beforeRoot()})).then(function(){return Promise.all([t.getDependencies("scene"),t.getDependencies("animation"),t.getDependencies("camera")])}).then(function(o){const r={scene:o[0][n.scene||0],scenes:o[0],animations:o[1],cameras:o[2],asset:n.asset,parser:t,userData:{}};return B(s,r,n),N(r,n),Promise.all(t._invokeAll(function(i){return i.afterRoot&&i.afterRoot(r)})).then(function(){for(const i of r.scenes)i.updateMatrixWorld();e(r)})}).catch(a)}_markDefs(){const e=this.json.nodes||[],a=this.json.skins||[],t=this.json.meshes||[];for(let n=0,s=a.length;n<s;n++){const o=a[n].joints;for(let r=0,i=o.length;r<i;r++)e[o[r]].isBone=!0}for(let n=0,s=e.length;n<s;n++){const o=e[n];o.mesh!==void 0&&(this._addNodeRef(this.meshCache,o.mesh),o.skin!==void 0&&(t[o.mesh].isSkinnedMesh=!0)),o.camera!==void 0&&this._addNodeRef(this.cameraCache,o.camera)}}_addNodeRef(e,a){a!==void 0&&(e.refs[a]===void 0&&(e.refs[a]=e.uses[a]=0),e.refs[a]++)}_getNodeRef(e,a,t){if(e.refs[a]<=1)return t;const n=t.clone(),s=(o,r)=>{const i=this.associations.get(o);i!=null&&this.associations.set(r,i);for(const[c,l]of o.children.entries())s(l,r.children[c])};return s(t,n),n.name+="_instance_"+e.uses[a]++,n}_invokeOne(e){const a=Object.values(this.plugins);a.push(this);for(let t=0;t<a.length;t++){const n=e(a[t]);if(n)return n}return null}_invokeAll(e){const a=Object.values(this.plugins);a.unshift(this);const t=[];for(let n=0;n<a.length;n++){const s=e(a[n]);s&&t.push(s)}return t}getDependency(e,a){const t=e+":"+a;let n=this.cache.get(t);if(!n){switch(e){case"scene":n=this.loadScene(a);break;case"node":n=this._invokeOne(function(s){return s.loadNode&&s.loadNode(a)});break;case"mesh":n=this._invokeOne(function(s){return s.loadMesh&&s.loadMesh(a)});break;case"accessor":n=this.loadAccessor(a);break;case"bufferView":n=this._invokeOne(function(s){return s.loadBufferView&&s.loadBufferView(a)});break;case"buffer":n=this.loadBuffer(a);break;case"material":n=this._invokeOne(function(s){return s.loadMaterial&&s.loadMaterial(a)});break;case"texture":n=this._invokeOne(function(s){return s.loadTexture&&s.loadTexture(a)});break;case"skin":n=this.loadSkin(a);break;case"animation":n=this._invokeOne(function(s){return s.loadAnimation&&s.loadAnimation(a)});break;case"camera":n=this.loadCamera(a);break;default:if(n=this._invokeOne(function(s){return s!=this&&s.getDependency&&s.getDependency(e,a)}),!n)throw new Error("Unknown type: "+e);break}this.cache.add(t,n)}return n}getDependencies(e){let a=this.cache.get(e);if(!a){const t=this,n=this.json[e+(e==="mesh"?"es":"s")]||[];a=Promise.all(n.map(function(s,o){return t.getDependency(e,o)})),this.cache.add(e,a)}return a}loadBuffer(e){const a=this.json.buffers[e],t=this.fileLoader;if(a.type&&a.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+a.type+" buffer type is not supported.");if(a.uri===void 0&&e===0)return Promise.resolve(this.extensions[F.KHR_BINARY_GLTF].body);const n=this.options;return new Promise(function(s,o){t.load(de.resolveURL(a.uri,n.path),s,void 0,function(){o(new Error('THREE.GLTFLoader: Failed to load buffer "'+a.uri+'".'))})})}loadBufferView(e){const a=this.json.bufferViews[e];return this.getDependency("buffer",a.buffer).then(function(t){const n=a.byteLength||0,s=a.byteOffset||0;return t.slice(s,s+n)})}loadAccessor(e){const a=this,t=this.json,n=this.json.accessors[e];if(n.bufferView===void 0&&n.sparse===void 0){const o=Re[n.type],r=ne[n.componentType],i=n.normalized===!0,c=new r(n.count*o);return Promise.resolve(new _(c,o,i))}const s=[];return n.bufferView!==void 0?s.push(this.getDependency("bufferView",n.bufferView)):s.push(null),n.sparse!==void 0&&(s.push(this.getDependency("bufferView",n.sparse.indices.bufferView)),s.push(this.getDependency("bufferView",n.sparse.values.bufferView))),Promise.all(s).then(function(o){const r=o[0],i=Re[n.type],c=ne[n.componentType],l=c.BYTES_PER_ELEMENT,b=l*i,f=n.byteOffset||0,h=n.bufferView!==void 0?t.bufferViews[n.bufferView].byteStride:void 0,v=n.normalized===!0;let k,w;if(h&&h!==b){const u=Math.floor(f/h),g="InterleavedBuffer:"+n.bufferView+":"+n.componentType+":"+u+":"+n.count;let p=a.cache.get(g);p||(k=new c(r,u*h,n.count*h/l),p=new ja(k,h/l),a.cache.add(g,p)),w=new Xa(p,i,f%h/l,v)}else r===null?k=new c(n.count*i):k=new c(r,f,n.count*i),w=new _(k,i,v);if(n.sparse!==void 0){const u=Re.SCALAR,g=ne[n.sparse.indices.componentType],p=n.sparse.indices.byteOffset||0,m=n.sparse.values.byteOffset||0,x=new g(o[1],p,n.sparse.count*u),R=new c(o[2],m,n.sparse.count*i);r!==null&&(w=new _(w.array.slice(),w.itemSize,w.normalized)),w.normalized=!1;for(let T=0,E=x.length;T<E;T++){const A=x[T];if(w.setX(A,R[T*i]),i>=2&&w.setY(A,R[T*i+1]),i>=3&&w.setZ(A,R[T*i+2]),i>=4&&w.setW(A,R[T*i+3]),i>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}w.normalized=v}return w})}loadTexture(e){const a=this.json,t=this.options,s=a.textures[e].source,o=a.images[s];let r=this.textureLoader;if(o.uri){const i=t.manager.getHandler(o.uri);i!==null&&(r=i)}return this.loadTextureImage(e,s,r)}loadTextureImage(e,a,t){const n=this,s=this.json,o=s.textures[e],r=s.images[a],i=(r.uri||r.bufferView)+":"+o.sampler;if(this.textureCache[i])return this.textureCache[i];const c=this.loadImageSource(a,t).then(function(l){l.flipY=!1,l.name=o.name||r.name||"",l.name===""&&typeof r.uri=="string"&&r.uri.startsWith("data:image/")===!1&&(l.name=r.uri);const f=(s.samplers||{})[o.sampler]||{};return l.magFilter=Be[f.magFilter]||Ee,l.minFilter=Be[f.minFilter]||sa,l.wrapS=Xe[f.wrapS]||je,l.wrapT=Xe[f.wrapT]||je,l.generateMipmaps=!l.isCompressedTexture&&l.minFilter!==oa&&l.minFilter!==Ee,n.associations.set(l,{textures:e}),l}).catch(function(){return null});return this.textureCache[i]=c,c}loadImageSource(e,a){const t=this,n=this.json,s=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then(b=>b.clone());const o=n.images[e],r=self.URL||self.webkitURL;let i=o.uri||"",c=!1;if(o.bufferView!==void 0)i=t.getDependency("bufferView",o.bufferView).then(function(b){c=!0;const f=new Blob([b],{type:o.mimeType});return i=r.createObjectURL(f),i});else if(o.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+e+" is missing URI and bufferView");const l=Promise.resolve(i).then(function(b){return new Promise(function(f,h){let v=f;a.isImageBitmapLoader===!0&&(v=function(k){const w=new ze(k);w.needsUpdate=!0,f(w)}),a.load(de.resolveURL(b,s.path),v,void 0,h)})}).then(function(b){return c===!0&&r.revokeObjectURL(i),N(b,o),b.userData.mimeType=o.mimeType||Bt(o.uri),b}).catch(function(b){throw console.error("THREE.GLTFLoader: Couldn't load texture",i),b});return this.sourceCache[e]=l,l}assignTexture(e,a,t,n){const s=this;return this.getDependency("texture",t.index).then(function(o){if(!o)return null;if(t.texCoord!==void 0&&t.texCoord>0&&(o=o.clone(),o.channel=t.texCoord),s.extensions[F.KHR_TEXTURE_TRANSFORM]){const r=t.extensions!==void 0?t.extensions[F.KHR_TEXTURE_TRANSFORM]:void 0;if(r){const i=s.associations.get(o);o=s.extensions[F.KHR_TEXTURE_TRANSFORM].extendTexture(o,r),s.associations.set(o,i)}}return n!==void 0&&(o.colorSpace=n),e[a]=o,o})}assignFinalMaterial(e){const a=e.geometry;let t=e.material;const n=a.attributes.tangent===void 0,s=a.attributes.color!==void 0,o=a.attributes.normal===void 0;if(e.isPoints){const r="PointsMaterial:"+t.uuid;let i=this.cache.get(r);i||(i=new qa,Fe.prototype.copy.call(i,t),i.color.copy(t.color),i.map=t.map,i.sizeAttenuation=!1,this.cache.add(r,i)),t=i}else if(e.isLine){const r="LineBasicMaterial:"+t.uuid;let i=this.cache.get(r);i||(i=new _a,Fe.prototype.copy.call(i,t),i.color.copy(t.color),i.map=t.map,this.cache.add(r,i)),t=i}if(n||s||o){let r="ClonedMaterial:"+t.uuid+":";n&&(r+="derivative-tangents:"),s&&(r+="vertex-colors:"),o&&(r+="flat-shading:");let i=this.cache.get(r);i||(i=t.clone(),s&&(i.vertexColors=!0),o&&(i.flatShading=!0),n&&(i.normalScale&&(i.normalScale.y*=-1),i.clearcoatNormalScale&&(i.clearcoatNormalScale.y*=-1)),this.cache.add(r,i),this.associations.set(i,this.associations.get(t))),t=i}e.material=t}getMaterialType(){return ia}loadMaterial(e){const a=this,t=this.json,n=this.extensions,s=t.materials[e];let o;const r={},i=s.extensions||{},c=[];if(i[F.KHR_MATERIALS_UNLIT]){const b=n[F.KHR_MATERIALS_UNLIT];o=b.getMaterialType(),c.push(b.extendParams(r,s,a))}else{const b=s.pbrMetallicRoughness||{};if(r.color=new G(1,1,1),r.opacity=1,Array.isArray(b.baseColorFactor)){const f=b.baseColorFactor;r.color.setRGB(f[0],f[1],f[2],U),r.opacity=f[3]}b.baseColorTexture!==void 0&&c.push(a.assignTexture(r,"map",b.baseColorTexture,fe)),r.metalness=b.metallicFactor!==void 0?b.metallicFactor:1,r.roughness=b.roughnessFactor!==void 0?b.roughnessFactor:1,b.metallicRoughnessTexture!==void 0&&(c.push(a.assignTexture(r,"metalnessMap",b.metallicRoughnessTexture)),c.push(a.assignTexture(r,"roughnessMap",b.metallicRoughnessTexture))),o=this._invokeOne(function(f){return f.getMaterialType&&f.getMaterialType(e)}),c.push(Promise.all(this._invokeAll(function(f){return f.extendMaterialParams&&f.extendMaterialParams(e,r)})))}s.doubleSided===!0&&(r.side=Pe);const l=s.alphaMode||Ae.OPAQUE;if(l===Ae.BLEND?(r.transparent=!0,r.depthWrite=!1):(r.transparent=!1,l===Ae.MASK&&(r.alphaTest=s.alphaCutoff!==void 0?s.alphaCutoff:.5)),s.normalTexture!==void 0&&o!==te&&(c.push(a.assignTexture(r,"normalMap",s.normalTexture)),r.normalScale=new ce(1,1),s.normalTexture.scale!==void 0)){const b=s.normalTexture.scale;r.normalScale.set(b,b)}if(s.occlusionTexture!==void 0&&o!==te&&(c.push(a.assignTexture(r,"aoMap",s.occlusionTexture)),s.occlusionTexture.strength!==void 0&&(r.aoMapIntensity=s.occlusionTexture.strength)),s.emissiveFactor!==void 0&&o!==te){const b=s.emissiveFactor;r.emissive=new G().setRGB(b[0],b[1],b[2],U)}return s.emissiveTexture!==void 0&&o!==te&&c.push(a.assignTexture(r,"emissiveMap",s.emissiveTexture,fe)),Promise.all(c).then(function(){const b=new o(r);return s.name&&(b.name=s.name),N(b,s),a.associations.set(b,{materials:e}),s.extensions&&B(n,b,s),b})}createUniqueName(e){const a=Oa.sanitizeNodeName(e||"");return a in this.nodeNamesUsed?a+"_"+ ++this.nodeNamesUsed[a]:(this.nodeNamesUsed[a]=0,a)}loadGeometries(e){const a=this,t=this.extensions,n=this.primitiveCache;function s(r){return t[F.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(r,a).then(function(i){return Qe(i,r,a)})}const o=[];for(let r=0,i=e.length;r<i;r++){const c=e[r],l=Vt(c),b=n[l];if(b)o.push(b.promise);else{let f;c.extensions&&c.extensions[F.KHR_DRACO_MESH_COMPRESSION]?f=s(c):f=Qe(new Y,c,a),c.mode===q.TRIANGLE_STRIP?f=f.then(h=>_e(h,et)):c.mode===q.TRIANGLE_FAN&&(f=f.then(h=>_e(h,at))),n[l]={primitive:c,promise:f},o.push(f)}}return Promise.all(o)}loadMesh(e){const a=this,t=this.json,n=this.extensions,s=t.meshes[e],o=s.primitives,r=[];for(let i=0,c=o.length;i<c;i++){const l=o[i].material===void 0?It(this.cache):this.getDependency("material",o[i].material);r.push(l)}return r.push(a.loadGeometries(o)),Promise.all(r).then(async function(i){const c=i.slice(0,i.length-1),l=i[i.length-1],b=[];for(let h=0,v=l.length;h<v;h++){const k=l[h],w=o[h];let u;const g=c[h];if(w.mode===q.TRIANGLES||w.mode===q.TRIANGLE_STRIP||w.mode===q.TRIANGLE_FAN||w.mode===void 0){const p=s.isSkinnedMesh===!0,m=k.hasAttribute("skinIndex")&&k.hasAttribute("skinWeight");p&&m===!1&&console.warn("THREE.GLTFLoader: Missing skinIndex or skinWeight attributes. Skinning disabled."),u=p&&m?new za(k,g):new $(k,g),u.isSkinnedMesh===!0&&u.normalizeSkinWeights()}else if(w.mode===q.LINES)u=new Ka(k,g);else if(w.mode===q.LINE_STRIP)u=new Ha(k,g);else if(w.mode===q.LINE_LOOP)u=new Na(k,g);else if(w.mode===q.POINTS)u=new Ca(k,g);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+w.mode);Object.keys(u.geometry.morphAttributes).length>0&&Jt(u,s),u.name=a.createUniqueName(s.name||"mesh_"+e),N(u,s),w.extensions&&B(n,u,w),a.assignFinalMaterial(u),b.push(u)}for(let h=0,v=b.length;h<v;h++)a.associations.set(b[h],{meshes:e,primitives:h});if(b.length===1)return s.extensions&&B(n,b[0],s),b[0];const f=new le;s.extensions&&B(n,f,s),a.associations.set(f,{meshes:e});for(let h=0,v=b.length;h<v;h++)f.add(b[h]);return f})}loadCamera(e){let a;const t=this.json.cameras[e],n=t[t.type];if(!n){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}return t.type==="perspective"?a=new Wa(qe.radToDeg(n.yfov),n.aspectRatio||1,n.znear||1,n.zfar||2e6):t.type==="orthographic"&&(a=new Ia(-n.xmag,n.xmag,n.ymag,-n.ymag,n.znear,n.zfar)),t.name&&(a.name=this.createUniqueName(t.name)),N(a,t),Promise.resolve(a)}loadSkin(e){const a=this.json.skins[e],t=[];for(let n=0,s=a.joints.length;n<s;n++)t.push(this._loadNodeShallow(a.joints[n]));return a.inverseBindMatrices!==void 0?t.push(this.getDependency("accessor",a.inverseBindMatrices)):t.push(null),Promise.all(t).then(function(n){const s=n.pop(),o=n,r=[],i=[];for(let c=0,l=o.length;c<l;c++){const b=o[c];if(b){r.push(b);const f=new Q;s!==null&&f.fromArray(s.array,c*16),i.push(f)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',a.joints[c])}return new Ua(r,i)})}loadAnimation(e){const a=this.json,t=this,n=a.animations[e],s=n.name?n.name:"animation_"+e,o=[],r=[],i=[],c=[],l=[];for(let b=0,f=n.channels.length;b<f;b++){const h=n.channels[b],v=n.samplers[h.sampler],k=h.target,w=k.node,u=n.parameters!==void 0?n.parameters[v.input]:v.input,g=n.parameters!==void 0?n.parameters[v.output]:v.output;k.node!==void 0&&(o.push(this.getDependency("node",w)),r.push(this.getDependency("accessor",u)),i.push(this.getDependency("accessor",g)),c.push(v),l.push(k))}return Promise.all([Promise.all(o),Promise.all(r),Promise.all(i),Promise.all(c),Promise.all(l)]).then(function(b){const f=b[0],h=b[1],v=b[2],k=b[3],w=b[4],u=[];for(let p=0,m=f.length;p<m;p++){const x=f[p],R=h[p],T=v[p],E=k[p],A=w[p];if(x===void 0)continue;x.updateMatrix&&x.updateMatrix();const y=t._createAnimationTracks(x,R,T,E,A);if(y)for(let M=0;M<y.length;M++)u.push(y[M])}const g=new Ja(s,void 0,u);return N(g,n),g})}createNodeMesh(e){const a=this.json,t=this,n=a.nodes[e];return n.mesh===void 0?null:t.getDependency("mesh",n.mesh).then(function(s){const o=t._getNodeRef(t.meshCache,n.mesh,s);return n.weights!==void 0&&o.traverse(function(r){if(r.isMesh)for(let i=0,c=n.weights.length;i<c;i++)r.morphTargetInfluences[i]=n.weights[i]}),o})}loadNode(e){const a=this.json,t=this,n=a.nodes[e],s=t._loadNodeShallow(e),o=[],r=n.children||[];for(let c=0,l=r.length;c<l;c++)o.push(t.getDependency("node",r[c]));const i=n.skin===void 0?Promise.resolve(null):t.getDependency("skin",n.skin);return Promise.all([s,Promise.all(o),i]).then(function(c){const l=c[0],b=c[1],f=c[2];f!==null&&l.traverse(function(h){h.isSkinnedMesh&&h.bind(f,Xt)});for(let h=0,v=b.length;h<v;h++)l.add(b[h]);if(l.userData.pivot!==void 0&&b.length>0){const h=l.userData.pivot,v=b[0];l.pivot=new O().fromArray(h),l.position.x-=h[0],l.position.y-=h[1],l.position.z-=h[2],v.position.set(0,0,0),delete l.userData.pivot}return l})}_loadNodeShallow(e){const a=this.json,t=this.extensions,n=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];const s=a.nodes[e],o=s.name?n.createUniqueName(s.name):"",r=[],i=n._invokeOne(function(c){return c.createNodeMesh&&c.createNodeMesh(e)});return i&&r.push(i),s.camera!==void 0&&r.push(n.getDependency("camera",s.camera).then(function(c){return n._getNodeRef(n.cameraCache,s.camera,c)})),n._invokeAll(function(c){return c.createNodeAttachment&&c.createNodeAttachment(e)}).forEach(function(c){r.push(c)}),this.nodeCache[e]=Promise.all(r).then(function(c){let l;if(s.isBone===!0?l=new Va:c.length>1?l=new le:c.length===1?l=c[0]:l=new na,l!==c[0])for(let b=0,f=c.length;b<f;b++)l.add(c[b]);if(s.name&&(l.userData.name=s.name,l.name=o),N(l,s),s.extensions&&B(t,l,s),s.matrix!==void 0){const b=new Q;b.fromArray(s.matrix),l.applyMatrix4(b)}else s.translation!==void 0&&l.position.fromArray(s.translation),s.rotation!==void 0&&l.quaternion.fromArray(s.rotation),s.scale!==void 0&&l.scale.fromArray(s.scale);if(!n.associations.has(l))n.associations.set(l,{});else if(s.mesh!==void 0&&n.meshCache.refs[s.mesh]>1){const b=n.associations.get(l);n.associations.set(l,{...b})}return n.associations.get(l).nodes=e,l}),this.nodeCache[e]}loadScene(e){const a=this.extensions,t=this.json.scenes[e],n=this,s=new le;t.name&&(s.name=n.createUniqueName(t.name)),N(s,t),t.extensions&&B(a,s,t);const o=t.nodes||[],r=[];for(let i=0,c=o.length;i<c;i++)r.push(n.getDependency("node",o[i]));return Promise.all(r).then(function(i){for(let l=0,b=i.length;l<b;l++){const f=i[l];f.parent!==null?s.add(mt(f)):s.add(f)}const c=l=>{const b=new Map;for(const[f,h]of n.associations)(f instanceof Fe||f instanceof ze)&&b.set(f,h);return l.traverse(f=>{const h=n.associations.get(f);h!=null&&b.set(f,h)}),b};return n.associations=c(s),s})}_createAnimationTracks(e,a,t,n,s){const o=[],r=e.name?e.name:e.uuid,i=[];function c(h){h.morphTargetInfluences&&i.push(h.name?h.name:h.uuid)}J[s.path]===J.weights?(c(e),e.isGroup&&e.children.forEach(c)):i.push(r);let l;switch(J[s.path]){case J.weights:l=He;break;case J.rotation:l=Ne;break;case J.translation:case J.scale:l=Ke;break;default:t.itemSize===1?l=He:l=Ke;break}const b=n.interpolation!==void 0?Wt[n.interpolation]:ra,f=this._getArrayFromAccessor(t);for(let h=0,v=i.length;h<v;h++){const k=new l(i[h]+"."+J[s.path],a.array,f,b);n.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(k),o.push(k)}return o}_getArrayFromAccessor(e){let a=e.array;if(e.normalized){const t=Le(a.constructor),n=new Float32Array(a.length);for(let s=0,o=a.length;s<o;s++)n[s]=a[s]*t;a=n}return a}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(t){const n=this instanceof Ne?Ct:ma;return new n(this.times,this.values,this.getValueSize()/3,t)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}}function Yt(d,e,a){const t=e.attributes,n=new $a;if(t.POSITION!==void 0){const r=a.json.accessors[t.POSITION],i=r.min,c=r.max;if(i!==void 0&&c!==void 0){if(n.set(new O(i[0],i[1],i[2]),new O(c[0],c[1],c[2])),r.normalized){const l=Le(ne[r.componentType]);n.min.multiplyScalar(l),n.max.multiplyScalar(l)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;const s=e.targets;if(s!==void 0){const r=new O,i=new O;for(let c=0,l=s.length;c<l;c++){const b=s[c];if(b.POSITION!==void 0){const f=a.json.accessors[b.POSITION],h=f.min,v=f.max;if(h!==void 0&&v!==void 0){if(i.setX(Math.max(Math.abs(h[0]),Math.abs(v[0]))),i.setY(Math.max(Math.abs(h[1]),Math.abs(v[1]))),i.setZ(Math.max(Math.abs(h[2]),Math.abs(v[2]))),f.normalized){const k=Le(ne[f.componentType]);i.multiplyScalar(k)}r.max(i)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}n.expandByVector(r)}d.boundingBox=n;const o=new Za;n.getCenter(o.center),o.radius=n.min.distanceTo(n.max)/2,d.boundingSphere=o}function Qe(d,e,a){const t=e.attributes,n=[];function s(o,r){return a.getDependency("accessor",o).then(function(i){d.setAttribute(r,i)})}for(const o in t){const r=Me[o]||o.toLowerCase();r in d.attributes||n.push(s(t[o],r))}if(e.indices!==void 0&&!d.index){const o=a.getDependency("accessor",e.indices).then(function(r){d.setIndex(r)});n.push(o)}return Ce.workingColorSpace!==U&&"COLOR_0"in t&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${Ce.workingColorSpace}" not supported.`),N(d,e),Yt(d,e,a),Promise.all(n).then(function(){return e.targets!==void 0?Ut(d,e.targets,a):d})}var $t=(function(){var d="b9H79Tebbbe8Fv9Gbb9Gvuuuuueu9Giuuub9Geueu9Giuuueuixkbeeeddddillviebeoweuecj:Gdkr;Neqo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbeY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVbdE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbiL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtblK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949WboY9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVJ9V29VVbrl79IV9Rbwq:VZkdbk:XYi5ud9:du8Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaicefhxcj;abad9Uc;WFbGcjdadca0EhmaialfgPar9Rgoadfhsavaoadz:jjjjbgzceVhHcbhOdndninaeaO9nmeaPax9RaD6mdamaeaO9RaOamfgoae6EgAcsfglc9WGhCabaOad2fhXaAcethQaxaDfhiaOaeaoaeao6E9RhLalcl4cifcd4hKazcj;cbfaAfhYcbh8AazcjdfhEaHh3incbh5dnawTmbaxa8Acd4fRbbh5kcbh8Eazcj;cbfhqinaih8Fdndndndna5a8Ecet4ciGgoc9:fPdebdkaPa8F9RaA6mrazcj;cbfa8EaA2fa8FaAz:jjjjb8Aa8FaAfhixdkazcj;cbfa8EaA2fcbaAz:kjjjb8Aa8FhixekaPa8F9RaK6mva8FaKfhidnaCTmbaPai9RcK6mbaocdtc:q:G:cjbfcj:G:cjbawEhaczhrcbhlinargoc9Wfghaqfhrdndndndndndnaaa8Fahco4fRbbalcoG4ciGcdtfydbPDbedvivvvlvkar9cb83bwar9cb83bbxlkarcbaiRbdai8Xbb9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbaqaofgrcGfcbaicdfa8J9c8N1:NfghRbbag9cjjjjjw:dg8J9qE86bbarcVfcbaha8J9c8M1:NfghRbbag9cjjjjjl:dg8J9qE86bbarc7fcbaha8J9c8L1:NfghRbbag9cjjjjjd:dg8J9qE86bbarctfcbaha8J9c8K1:NfghRbbag9cjjjjje:dg8J9qE86bbarc91fcbaha8J9c8J1:NfghRbbag9cjjjj;ab:dg8J9qE86bbarc4fcbaha8J9cg1:NfghRbbag9cjjjja:dg8J9qE86bbarc93fcbaha8J9ch1:NfghRbbag9cjjjjz:dgg9qE86bbarc94fcbahag9ca1:NfghRbbai8Xbe9c:c:qj:bw9:9c:q;c1:I1e:d9c:b:c:e1z9:gg9cjjjjjz:dg8J9qE86bbarc95fcbaha8J9c8N1:NfgiRbbag9cjjjjjw:dg8J9qE86bbarc96fcbaia8J9c8M1:NfgiRbbag9cjjjjjl:dg8J9qE86bbarc97fcbaia8J9c8L1:NfgiRbbag9cjjjjjd:dg8J9qE86bbarc98fcbaia8J9c8K1:NfgiRbbag9cjjjjje:dg8J9qE86bbarc99fcbaia8J9c8J1:NfgiRbbag9cjjjj;ab:dg8J9qE86bbarc9:fcbaia8J9cg1:NfgiRbbag9cjjjja:dg8J9qE86bbarcufcbaia8J9ch1:NfgiRbbag9cjjjjz:dgg9qE86bbaiag9ca1:NfhixikaraiRblaiRbbghco4g8Ka8KciSg8KE86bbaqaofgrcGfaiclfa8Kfg8KRbbahcl4ciGg8La8LciSg8LE86bbarcVfa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc7fa8Ka8Lfg8KRbbahciGghahciSghE86bbarctfa8Kahfg8KRbbaiRbeghco4g8La8LciSg8LE86bbarc91fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc4fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc93fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc94fa8Kahfg8KRbbaiRbdghco4g8La8LciSg8LE86bbarc95fa8Ka8Lfg8KRbbahcl4ciGg8La8LciSg8LE86bbarc96fa8Ka8Lfg8KRbbahcd4ciGg8La8LciSg8LE86bbarc97fa8Ka8Lfg8KRbbahciGghahciSghE86bbarc98fa8KahfghRbbaiRbigico4g8Ka8KciSg8KE86bbarc99faha8KfghRbbaicl4ciGg8Ka8KciSg8KE86bbarc9:faha8KfghRbbaicd4ciGg8Ka8KciSg8KE86bbarcufaha8KfgrRbbaiciGgiaiciSgiE86bbaraifhixdkaraiRbwaiRbbghcl4g8Ka8KcsSg8KE86bbaqaofgrcGfaicwfa8Kfg8KRbbahcsGghahcsSghE86bbarcVfa8KahfghRbbaiRbeg8Kcl4g8La8LcsSg8LE86bbarc7faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarctfaha8KfghRbbaiRbdg8Kcl4g8La8LcsSg8LE86bbarc91faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc4faha8KfghRbbaiRbig8Kcl4g8La8LcsSg8LE86bbarc93faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc94faha8KfghRbbaiRblg8Kcl4g8La8LcsSg8LE86bbarc95faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc96faha8KfghRbbaiRbvg8Kcl4g8La8LcsSg8LE86bbarc97faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc98faha8KfghRbbaiRbog8Kcl4g8La8LcsSg8LE86bbarc99faha8LfghRbba8KcsGg8Ka8KcsSg8KE86bbarc9:faha8KfghRbbaiRbrgicl4g8Ka8KcsSg8KE86bbarcufaha8KfgrRbbaicsGgiaicsSgiE86bbaraifhixekarai8Pbw83bwarai8Pbb83bbaiczfhikdnaoaC9pmbalcdfhlaoczfhraPai9RcL0mekkaoaC6moaimexokaCmva8FTmvkaqaAfhqa8Ecefg8Ecl9hmbkdndndndnawTmbasa8Acd4fRbbgociGPlbedrbkaATmdaza8Afh8Fazcj;cbfhhcbh8EaEhaina8FRbbhraahocbhlinaoahalfRbbgqce4cbaqceG9R7arfgr86bbaoadfhoaAalcefgl9hmbkaacefhaa8Fcefh8FahaAfhha8Ecefg8Ecl9hmbxikkaATmeaza8Afhaazcj;cbfhhcbhoceh8EaYh8FinaEaofhlaa8Vbbhrcbhoinala8FaofRbbcwtahaofRbbgqVc;:FiGce4cbaqceG9R7arfgr87bbaladfhlaLaocefgofmbka8FaQfh8FcdhoaacdfhaahaQfhha8EceGhlcbh8EalmbxdkkaATmbaocl4h8Eaza8AfRbbhqcwhoa3hlinalRbbaotaqVhqalcefhlaocwfgoca9hmbkcbhhaEh8FaYhainazcj;cbfahfRbbhrcwhoaahlinalRbbaotarVhralaAfhlaocwfgoca9hmbkara8E94aq7hqcbhoa8Fhlinalaqao486bbalcefhlaocwfgoca9hmbka8Fadfh8FaacefhaahcefghaA9hmbkkaEclfhEa3clfh3a8Aclfg8Aad6mbkaXazcjdfaAad2z:jjjjb8AazazcjdfaAcufad2fadz:jjjjb8AaAaOfhOaihxaimbkc9:hoxdkcbc99aPax9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaok:ysezu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnalaeci9UgrcHf6mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecjez:kjjjb8Aav9cu83iUav9cu83i8Wav9cu83iyav9cu83iaav9cu83iKav9cu83izav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbavaiaqaDcsGfRbbgscl4gP9RcsGcdtfydbaxcefgOaPEhDavaias9RcsGcdtfydbaOaPTgzfgOascsGgPEhsaPThPdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiazfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaPfhiaOaPfhxxekaxcbalRbbgsEgHaDc;:eSgDfhOascsGhAdndnascl4gCmbaOcefhzxekaOhzavaiaC9RcsGcdtfydbhOkdndnaAmbazcefhxxekazhxavaias9RcsGcdtfydbhzkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhHascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaHhDxekaDcefhDkasce4cbasceG9R7amfgmhHkdndnaCcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhOaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkaOhsxekascefhskaPce4cbaPceG9R7amfgmhOkdndnaAcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhzaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkazhlxekalcefhlkaPce4cbaPceG9R7amfgmhzkdndnadcd9hmbabarcetfgDaH87ebaDclfaz87ebaDcdfaO87ebxekabarcdtfgDaHBdbaDcwfazBdbaDclfaOBdbkavc;abfaocitfgDaOBdbaDaHBdlavaicdtfaHBdbavc;abfaocefcsGcitfgDazBdbaDaOBdlavaicefgicsGcdtfaOBdbavc;abfaocdfcsGcitfgDaHBdbaDazBdlavaiaCTaCcsSVfgicsGcdtfazBdbaiaATaAcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnalaecvf9pmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk:Lvoeue99dud99eud99dndnadcl9hmbaeTmeindndnabcdfgd8Sbb:Yab8Sbbgi:Ygl:l:tabcefgv8Sbbgo:Ygr:l:tgwJbb;:9cawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai86bbdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad86bbdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad86bbabclfhbaecufgembxdkkaeTmbindndnabclfgd8Ueb:Yab8Uebgi:Ygl:l:tabcdfgv8Uebgo:Ygr:l:tgwJb;:FSawawNJbbbbawawJbbbb9GgDEgq:mgkaqaicb9iEalMgwawNakaqaocb9iEarMgqaqNMM:r:vglNJbbbZJbbb:;aDEMgr:lJbbb9p9DTmbar:Ohixekcjjjj94hikadai87ebdndnaqalNJbbbZJbbb:;aqJbbbb9GEMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkavad87ebdndnawalNJbbbZJbbb:;awJbbbb9GEMgw:lJbbb9p9DTmbaw:Ohdxekcjjjj94hdkabad87ebabcwfhbaecufgembkkk:4ioiue99dud99dud99dnaeTmbcbhiabhlindndnal8Uebgv:YgoJ:ji:1Salcof8UebgrciVgw:Y:vgDNJbbbZJbbb:;avcu9kEMgq:lJbbb9p9DTmbaq:Ohkxekcjjjj94hkkalclf8Uebhvalcdf8UebhxalarcefciGcetfak87ebdndnax:YgqaDNJbbbZJbbb:;axcu9kEMgm:lJbbb9p9DTmbam:Ohxxekcjjjj94hxkabaiarciGgkfcd7cetfax87ebdndnav:YgmaDNJbbbZJbbb:;avcu9kEMgP:lJbbb9p9DTmbaP:Ohvxekcjjjj94hvkalarcufciGcetfav87ebdndnawaw2:ZgPaPMaoaoN:taqaqN:tamamN:tgoJbbbbaoJbbbb9GE:raDNJbbbZMgD:lJbbb9p9DTmbaD:Ohrxekcjjjj94hrkalakcetfar87ebalcwfhlaiclfhiaecufgembkkk9mbdnadcd4ae2gdTmbinababydbgecwtcw91:Yaece91cjjj98Gcjjj;8if::NUdbabclfhbadcufgdmbkkk:Tvirud99eudndnadcl9hmbaeTmeindndnabRbbgiabcefgl8Sbbgvabcdfgo8Sbbgrf9R:YJbbuJabcifgwRbbgdce4adVgDcd4aDVgDcl4aDVgD:Z:vgqNJbbbZMgk:lJbbb9p9DTmbak:Ohxxekcjjjj94hxkaoax86bbdndnaraif:YaqNJbbbZMgk:lJbbb9p9DTmbak:Ohoxekcjjjj94hokalao86bbdndnavaifar9R:YaqNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabai86bbdndnaDadcetGadceGV:ZaqNJbbbZMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkawad86bbabclfhbaecufgembxdkkaeTmbindndnab8Vebgiabcdfgl8Uebgvabclfgo8Uebgrf9R:YJbFu9habcofgw8Vebgdce4adVgDcd4aDVgDcl4aDVgDcw4aDVgD:Z:vgqNJbbbZMgk:lJbbb9p9DTmbak:Ohxxekcjjjj94hxkaoax87ebdndnaraif:YaqNJbbbZMgk:lJbbb9p9DTmbak:Ohoxekcjjjj94hokalao87ebdndnavaifar9R:YaqNJbbbZMgk:lJbbb9p9DTmbak:Ohixekcjjjj94hikabai87ebdndnaDadcetGadceGV:ZaqNJbbbZMgq:lJbbb9p9DTmbaq:Ohdxekcjjjj94hdkawad87ebabcwfhbaecufgembkkk9teiucbcbyd:K:G:cjbgeabcifc98GfgbBd:K:G:cjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaik;LeeeudndnaeabVciGTmbabhixekdndnadcz9pmbabhixekabhiinaiaeydbBdbaiclfaeclfydbBdbaicwfaecwfydbBdbaicxfaecxfydbBdbaeczfheaiczfhiadc9Wfgdcs0mbkkadcl6mbinaiaeydbBdbaeclfheaiclfhiadc98fgdci0mbkkdnadTmbinaiaeRbb86bbaicefhiaecefheadcufgdmbkkabk;aeedudndnabciGTmbabhixekaecFeGc:b:c:ew2hldndnadcz9pmbabhixekabhiinaialBdbaicxfalBdbaicwfalBdbaiclfalBdbaiczfhiadc9Wfgdcs0mbkkadcl6mbinaialBdbaiclfhiadc98fgdci0mbkkdnadTmbinaiae86bbaicefhiadcufgdmbkkabkk83dbcj:Gdk8Kbbbbdbbblbbbwbbbbbbbebbbdbbblbbbwbbbbc:K:Gdkl8W:qbb",e="b9H79TebbbeKl9Gbb9Gvuuuuueu9Giuuub9Geueuixkbbebeeddddilve9Weeeviebeoweuecj:Gdkr;Neqo9TW9T9VV95dbH9F9F939H79T9F9J9H229F9Jt9VV7bb8A9TW79O9V9Wt9F9KW9J9V9KW9wWVtW949c919M9MWVbdY9TW79O9V9Wt9F9KW9J9V9KW69U9KW949c919M9MWVblE9TW79O9V9Wt9F9KW9J9V9KW69U9KW949tWG91W9U9JWbvL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9p9JtboK9TW79O9V9Wt9F9KW9J9V9KWS9P2tWV9r919HtbrL9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVT949WbwY9TW79O9V9Wt9F9KW9J9V9KWS9P2tWVJ9V29VVbDl79IV9Rbqq:W9Dklbzik94evu8Jjjjjbcz9Rhbcbheincbhdcbhiinabcwfadfaicjuaead4ceGglE86bbaialfhiadcefgdcw9hmbkaeai86b:q:W:cjbaecitab8Piw83i:q:G:cjbaecefgecjd9hmbkk:JBl8Aud97dur978Jjjjjbcj;kb9Rgv8Kjjjjbc9:hodnalTmbcuhoaiRbbgrc;WeGc:Ge9hmbarcsGgwce0mbc9:hoalcufadcd4cbawEgDadfgrcKcaawEgqaraq0Egk6mbaialfgxar9RhodnadTgmmbavaoad;8qbbkaicefhPcj;abad9Uc;WFbGcjdadca0EhsdndndnadTmbaoadfhzcbhHinaeaH9nmdaxaP9RaD6miabaHad2fhOaPaDfhAasaeaH9RaHasfae6EgCcsfgocl4cifcd4hXavcj;cbfaoc9WGgQcetfhLavcj;cbfaQci2fhKavcj;cbfaQfhYcbh8Aaoc;ab6hEincbh3dnawTmbaPa8Acd4fRbbh3kcbh5avcj;cbfh8Eindndndndna3a5cet4ciGgoc9:fPdebdkaxaA9RaQ6mwdnaQTmbavcj;cbfa5aQ2faAaQ;8qbbkaAaCfhAxdkaQTmeavcj;cbfa5aQ2fcbaQ;8kbxekaxaA9RaX6moaoclVcbawEhraAaXfhocbhidnaEmbaxao9Rc;Gb6mbcbhlina8EalfhidndndndndndnaAalco4fRbbgqciGarfPDbedibledibkaipxbbbbbbbbbbbbbbbbpklbxlkaiaopbblaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLg8Fcdp:mea8FpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogapxiiiiiiiiiiiiiiiip8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbahaoclffagRb:q:W:cjbfhoxikaiaopbbwaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogapxssssssssssssssssp8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbahaocwffagRb:q:W:cjbfhoxdkaiaopbbbpklbaoczfhoxekaiaopbbdaoRbbghcitpbi:q:G:cjbahRb:q:W:cjbghpsaoRbeggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPpklbahaocdffagRb:q:W:cjbfhokdndndndndndnaqcd4ciGarfPDbedibledibkaiczfpxbbbbbbbbbbbbbbbbpklbxlkaiczfaopbblaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLg8Fcdp:mea8FpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogapxiiiiiiiiiiiiiiiip8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbahaoclffagRb:q:W:cjbfhoxikaiczfaopbbwaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogapxssssssssssssssssp8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbahaocwffagRb:q:W:cjbfhoxdkaiczfaopbbbpklbaoczfhoxekaiczfaopbbdaoRbbghcitpbi:q:G:cjbahRb:q:W:cjbghpsaoRbeggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPpklbahaocdffagRb:q:W:cjbfhokdndndndndndnaqcl4ciGarfPDbedibledibkaicafpxbbbbbbbbbbbbbbbbpklbxlkaicafaopbblaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLg8Fcdp:mea8FpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogapxiiiiiiiiiiiiiiiip8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbahaoclffagRb:q:W:cjbfhoxikaicafaopbbwaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogapxssssssssssssssssp8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbahaocwffagRb:q:W:cjbfhoxdkaicafaopbbbpklbaoczfhoxekaicafaopbbdaoRbbghcitpbi:q:G:cjbahRb:q:W:cjbghpsaoRbeggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPpklbahaocdffagRb:q:W:cjbfhokdndndndndndnaqco4arfPDbedibledibkaic8Wfpxbbbbbbbbbbbbbbbbpklbxlkaic8Wfaopbblaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLg8Fcdp:mea8FpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogapxiiiiiiiiiiiiiiiip8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Ngicitpbi:q:G:cjbaiRb:q:W:cjbgipsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbaiaoclffaqRb:q:W:cjbfhoxikaic8Wfaopbbwaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogapxssssssssssssssssp8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Ngicitpbi:q:G:cjbaiRb:q:W:cjbgipsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Ngqcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spklbaiaocwffaqRb:q:W:cjbfhoxdkaic8Wfaopbbbpklbaoczfhoxekaic8WfaopbbdaoRbbgicitpbi:q:G:cjbaiRb:q:W:cjbgipsaoRbegqcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPpklbaiaocdffaqRb:q:W:cjbfhokalc;abfhialcjefaQ0meaihlaxao9Rc;Fb0mbkkdnaiaQ9pmbaici4hlinaxao9RcK6mwa8EaifhqdndndndndndnaAaico4fRbbalcoG4ciGarfPDbedibledibkaqpxbbbbbbbbbbbbbbbbpkbbxlkaqaopbblaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLg8Fcdp:mea8FpmbzeHdOiAlCvXoQrLpxiiiiiiiiiiiiiiiip9ogapxiiiiiiiiiiiiiiiip8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spkbbahaoclffagRb:q:W:cjbfhoxikaqaopbbwaopbbbg8Fclp:mea8FpmbzeHdOiAlCvXoQrLpxssssssssssssssssp9ogapxssssssssssssssssp8Jg8Fp5b9cjF;8;4;W;G;ab9:9cU1:Nghcitpbi:q:G:cjbahRb:q:W:cjbghpsa8Fp5e9cjF;8;4;W;G;ab9:9cU1:Nggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPaaa8Fp9spkbbahaocwffagRb:q:W:cjbfhoxdkaqaopbbbpkbbaoczfhoxekaqaopbbdaoRbbghcitpbi:q:G:cjbahRb:q:W:cjbghpsaoRbeggcitpbi:q:G:cjbp9UpmbedilvorzHOACXQLpPpkbbahaocdffagRb:q:W:cjbfhokalcdfhlaiczfgiaQ6mbkkaohAaoTmoka8EaQfh8Ea5cefg5cl9hmbkdndndndnawTmbaza8Acd4fRbbglciGPlbedwbkaQTmdavcjdfa8Afhlava8Afpbdbh8Jcbhoinalavcj;cbfaofpblbg8KaYaofpblbg8LpmbzeHdOiAlCvXoQrLg8MaLaofpblbg8NaKaofpblbgypmbzeHdOiAlCvXoQrLg8PpmbezHdiOAlvCXorQLg8Fcep9Ta8Fpxeeeeeeeeeeeeeeeegap9op9Hp9rg8Fa8Jp9Ug8Jp9Abbbaladfgla8Ja8Fa8Fpmlvorlvorlvorlvorp9Ug8Jp9Abbbaladfgla8Ja8Fa8FpmwDqkwDqkwDqkwDqkp9Ug8Jp9Abbbaladfgla8Ja8Fa8FpmxmPsxmPsxmPsxmPsp9Ug8Jp9Abbbaladfgla8Ja8Ma8PpmwDKYqk8AExm35Ps8E8Fg8Fcep9Ta8Faap9op9Hp9rg8Fp9Ug8Jp9Abbbaladfgla8Ja8Fa8Fpmlvorlvorlvorlvorp9Ug8Jp9Abbbaladfgla8Ja8Fa8FpmwDqkwDqkwDqkwDqkp9Ug8Jp9Abbbaladfgla8Ja8Fa8FpmxmPsxmPsxmPsxmPsp9Ug8Jp9Abbbaladfgla8Ja8Ka8LpmwKDYq8AkEx3m5P8Es8Fg8Ka8NaypmwKDYq8AkEx3m5P8Es8Fg8LpmbezHdiOAlvCXorQLg8Fcep9Ta8Faap9op9Hp9rg8Fp9Ug8Jp9Abbbaladfgla8Ja8Fa8Fpmlvorlvorlvorlvorp9Ug8Jp9Abbbaladfgla8Ja8Fa8FpmwDqkwDqkwDqkwDqkp9Ug8Jp9Abbbaladfgla8Ja8Fa8FpmxmPsxmPsxmPsxmPsp9Ug8Jp9Abbbaladfgla8Ja8Ka8LpmwDKYqk8AExm35Ps8E8Fg8Fcep9Ta8Faap9op9Hp9rg8Fp9Ugap9Abbbaladfglaaa8Fa8Fpmlvorlvorlvorlvorp9Ugap9Abbbaladfglaaa8Fa8FpmwDqkwDqkwDqkwDqkp9Ugap9Abbbaladfglaaa8Fa8FpmxmPsxmPsxmPsxmPsp9Ug8Jp9AbbbaladfhlaoczfgoaQ6mbxikkaQTmeavcjdfa8Afhlava8Afpbdbh8Jcbhoinalavcj;cbfaofpblbg8KaYaofpblbg8LpmbzeHdOiAlCvXoQrLg8MaLaofpblbg8NaKaofpblbgypmbzeHdOiAlCvXoQrLg8PpmbezHdiOAlvCXorQLg8Fcep:nea8Fpxebebebebebebebebgap9op:bep9rg8Fa8Jp:oeg8Jp9Abbbaladfgla8Ja8Fa8Fpmlvorlvorlvorlvorp:oeg8Jp9Abbbaladfgla8Ja8Fa8FpmwDqkwDqkwDqkwDqkp:oeg8Jp9Abbbaladfgla8Ja8Fa8FpmxmPsxmPsxmPsxmPsp:oeg8Jp9Abbbaladfgla8Ja8Ma8PpmwDKYqk8AExm35Ps8E8Fg8Fcep:nea8Faap9op:bep9rg8Fp:oeg8Jp9Abbbaladfgla8Ja8Fa8Fpmlvorlvorlvorlvorp:oeg8Jp9Abbbaladfgla8Ja8Fa8FpmwDqkwDqkwDqkwDqkp:oeg8Jp9Abbbaladfgla8Ja8Fa8FpmxmPsxmPsxmPsxmPsp:oeg8Jp9Abbbaladfgla8Ja8Ka8LpmwKDYq8AkEx3m5P8Es8Fg8Ka8NaypmwKDYq8AkEx3m5P8Es8Fg8LpmbezHdiOAlvCXorQLg8Fcep:nea8Faap9op:bep9rg8Fp:oeg8Jp9Abbbaladfgla8Ja8Fa8Fpmlvorlvorlvorlvorp:oeg8Jp9Abbbaladfgla8Ja8Fa8FpmwDqkwDqkwDqkwDqkp:oeg8Jp9Abbbaladfgla8Ja8Fa8FpmxmPsxmPsxmPsxmPsp:oeg8Jp9Abbbaladfgla8Ja8Ka8LpmwDKYqk8AExm35Ps8E8Fg8Fcep:nea8Faap9op:bep9rg8Fp:oegap9Abbbaladfglaaa8Fa8Fpmlvorlvorlvorlvorp:oegap9Abbbaladfglaaa8Fa8FpmwDqkwDqkwDqkwDqkp:oegap9Abbbaladfglaaa8Fa8FpmxmPsxmPsxmPsxmPsp:oeg8Jp9AbbbaladfhlaoczfgoaQ6mbxdkkaQTmbcbhocbalcl4gl9Rc8FGhiavcjdfa8Afhrava8Afpbdbhainaravcj;cbfaofpblbg8JaYaofpblbg8KpmbzeHdOiAlCvXoQrLg8LaLaofpblbg8MaKaofpblbg8NpmbzeHdOiAlCvXoQrLgypmbezHdiOAlvCXorQLg8Faip:Rea8Falp:Tep9qg8Faap9rgap9Abbbaradfgraaa8Fa8Fpmlvorlvorlvorlvorp9rgap9Abbbaradfgraaa8Fa8FpmwDqkwDqkwDqkwDqkp9rgap9Abbbaradfgraaa8Fa8FpmxmPsxmPsxmPsxmPsp9rgap9Abbbaradfgraaa8LaypmwDKYqk8AExm35Ps8E8Fg8Faip:Rea8Falp:Tep9qg8Fp9rgap9Abbbaradfgraaa8Fa8Fpmlvorlvorlvorlvorp9rgap9Abbbaradfgraaa8Fa8FpmwDqkwDqkwDqkwDqkp9rgap9Abbbaradfgraaa8Fa8FpmxmPsxmPsxmPsxmPsp9rgap9Abbbaradfgraaa8Ja8KpmwKDYq8AkEx3m5P8Es8Fg8Ja8Ma8NpmwKDYq8AkEx3m5P8Es8Fg8KpmbezHdiOAlvCXorQLg8Faip:Rea8Falp:Tep9qg8Fp9rgap9Abbbaradfgraaa8Fa8Fpmlvorlvorlvorlvorp9rgap9Abbbaradfgraaa8Fa8FpmwDqkwDqkwDqkwDqkp9rgap9Abbbaradfgraaa8Fa8FpmxmPsxmPsxmPsxmPsp9rgap9Abbbaradfgraaa8Ja8KpmwDKYqk8AExm35Ps8E8Fg8Faip:Rea8Falp:Tep9qg8Fp9rgap9Abbbaradfgraaa8Fa8Fpmlvorlvorlvorlvorp9rgap9Abbbaradfgraaa8Fa8FpmwDqkwDqkwDqkwDqkp9rgap9Abbbaradfgraaa8Fa8FpmxmPsxmPsxmPsxmPsp9rgap9AbbbaradfhraoczfgoaQ6mbkka8Aclfg8Aad6mbkdnaCad2goTmbaOavcjdfao;8qbbkdnammbavavcjdfaCcufad2fad;8qbbkaCaHfhHc9:hoaAhPaAmbxlkkaeTmbaDalfhrcbhocuhlinaralaD9RglfaD6mdasaeao9Raoasfae6Eaofgoae6mbkaial9RhPkcbc99axaP9RakSEhoxekc9:hokavcj;kbf8Kjjjjbaokwbz:bjjjbkNsezu8Jjjjjbc;ae9Rgv8Kjjjjbc9:hodnalaeci9UgrcHf6mbcuhoaiRbbgwc;WeGc;Ge9hmbawcsGgDce0mbavc;abfcFecje;8kbav9cu83iUav9cu83i8Wav9cu83iyav9cu83iaav9cu83iKav9cu83izav9cu83iwav9cu83ibaialfc9WfhqaicefgwarfhldnaeTmbcmcsaDceSEhkcbhxcbhmcbhrcbhicbhoindnalaq9nmbc9:hoxikdndnawRbbgDc;Ve0mbavc;abfaoaDcu7gPcl4fcsGcitfgsydlhzasydbhHdndnaDcsGgsak9pmbavaiaPfcsGcdtfydbaxasEhDaxasTgOfhxxekdndnascsSmbcehOasc987asamffcefhDxekalcefhDal8SbbgscFeGhPdndnascu9mmbaDhlxekalcvfhlaPcFbGhPcrhsdninaD8SbbgOcFbGastaPVhPaOcu9kmeaDcefhDascrfgsc8J9hmbxdkkaDcefhlkcehOaPce4cbaPceG9R7amfhDkaDhmkavc;abfaocitfgsaDBdbasazBdlavaicdtfaDBdbavc;abfaocefcsGcitfgsaHBdbasaDBdlaocdfhoaOaifhidnadcd9hmbabarcetfgsaH87ebasclfaD87ebascdfaz87ebxdkabarcdtfgsaHBdbascwfaDBdbasclfazBdbxekdnaDcpe0mbavaiaqaDcsGfRbbgscl4gP9RcsGcdtfydbaxcefgOaPEhDavaias9RcsGcdtfydbaOaPTgzfgOascsGgPEhsaPThPdndnadcd9hmbabarcetfgHax87ebaHclfas87ebaHcdfaD87ebxekabarcdtfgHaxBdbaHcwfasBdbaHclfaDBdbkavaicdtfaxBdbavc;abfaocitfgHaDBdbaHaxBdlavaicefgicsGcdtfaDBdbavc;abfaocefcsGcitfgHasBdbaHaDBdlavaiazfgicsGcdtfasBdbavc;abfaocdfcsGcitfgDaxBdbaDasBdlaocifhoaiaPfhiaOaPfhxxekaxcbalRbbgsEgHaDc;:eSgDfhOascsGhAdndnascl4gCmbaOcefhzxekaOhzavaiaC9RcsGcdtfydbhOkdndnaAmbazcefhxxekazhxavaias9RcsGcdtfydbhzkdndnaDTmbalcefhDxekalcdfhDal8SbegPcFeGhsdnaPcu9kmbalcofhHascFbGhscrhldninaD8SbbgPcFbGaltasVhsaPcu9kmeaDcefhDalcrfglc8J9hmbkaHhDxekaDcefhDkasce4cbasceG9R7amfgmhHkdndnaCcsSmbaDhsxekaDcefhsaD8SbbglcFeGhPdnalcu9kmbaDcvfhOaPcFbGhPcrhldninas8SbbgDcFbGaltaPVhPaDcu9kmeascefhsalcrfglc8J9hmbkaOhsxekascefhskaPce4cbaPceG9R7amfgmhOkdndnaAcsSmbashlxekascefhlas8SbbgDcFeGhPdnaDcu9kmbascvfhzaPcFbGhPcrhDdninal8SbbgscFbGaDtaPVhPascu9kmealcefhlaDcrfgDc8J9hmbkazhlxekalcefhlkaPce4cbaPceG9R7amfgmhzkdndnadcd9hmbabarcetfgDaH87ebaDclfaz87ebaDcdfaO87ebxekabarcdtfgDaHBdbaDcwfazBdbaDclfaOBdbkavc;abfaocitfgDaOBdbaDaHBdlavaicdtfaHBdbavc;abfaocefcsGcitfgDazBdbaDaOBdlavaicefgicsGcdtfaOBdbavc;abfaocdfcsGcitfgDaHBdbaDazBdlavaiaCTaCcsSVfgicsGcdtfazBdbaiaATaAcsSVfhiaocifhokawcefhwaocsGhoaicsGhiarcifgrae6mbkkcbc99alaqSEhokavc;aef8Kjjjjbaok:clevu8Jjjjjbcz9Rhvdnalaecvf9pmbc9:skdnaiRbbc;:eGc;qeSmbcuskav9cb83iwaicefhoaialfc98fhrdnaeTmbdnadcdSmbcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcdtfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgiBdbalaiBdbawcefgwae9hmbxdkkcbhwindnaoar6mbc9:skaocefhlao8SbbgicFeGhddndnaicu9mmbalhoxekaocvfhoadcFbGhdcrhidninal8SbbgDcFbGaitadVhdaDcu9kmealcefhlaicrfgic8J9hmbxdkkalcefhokabawcetfadc8Etc8F91adcd47avcwfadceGcdtVglydbfgi87ebalaiBdbawcefgwae9hmbkkcbc99aoarSEk;Toio97eue97aec98Ghedndnadcl9hmbaeTmecbhdinababpbbbgicKp:RecKp:Sep;6eglaicwp:RecKp:Sep;6ealp;Geaiczp:RecKp:Sep;6egvp;Gep;Kep;Legopxbbbbbbbbbbbbbbbbp:2egralpxbbbjbbbjbbbjbbbjgwp9op9rp;Keglpxbb;:9cbb;:9cbb;:9cbb;:9calalp;Meaoaop;Meavaravawp9op9rp;Keglalp;Mep;Kep;Kep;Jep;Negvp;Mepxbbn0bbn0bbn0bbn0grp;KepxFbbbFbbbFbbbFbbbp9oaipxbbbFbbbFbbbFbbbFp9op9qalavp;Mearp;Kecwp:RepxbFbbbFbbbFbbbFbbp9op9qaoavp;Mearp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qpkbbabczfhbadclfgdae6mbxdkkaeTmbcbhdinabczfgDaDpbbbgipxbbbbbbFFbbbbbbFFgwp9oabpbbbgoaipmbediwDqkzHOAKY8AEgvczp:Reczp:Sep;6eglaoaipmlvorxmPsCXQL358E8FpxFubbFubbFubbFubbp9op;6eavczp:Sep;6egvp;Gealp;Gep;Kep;Legipxbbbbbbbbbbbbbbbbp:2egralpxbbbjbbbjbbbjbbbjgqp9op9rp;Keglpxb;:FSb;:FSb;:FSb;:FSalalp;Meaiaip;Meavaravaqp9op9rp;Keglalp;Mep;Kep;Kep;Jep;Negvp;Mepxbbn0bbn0bbn0bbn0grp;KepxFFbbFFbbFFbbFFbbp9oaiavp;Mearp;Keczp:Rep9qgialavp;Mearp;KepxFFbbFFbbFFbbFFbbp9oglpmwDKYqk8AExm35Ps8E8Fp9qpkbbabaoawp9oaialpmbezHdiOAlvCXorQLp9qpkbbabcafhbadclfgdae6mbkkk;2ileue97euo97dnaec98GgiTmbcbheinabcKfpx:ji:1S:ji:1S:ji:1S:ji:1SabpbbbglabczfgvpbbbgopmlvorxmPsCXQL358E8Fgrczp:Segwpxibbbibbbibbbibbbp9qp;6egDp;NegqaDaDp;MegDaDp;KealaopmbediwDqkzHOAKY8AEgDczp:Reczp:Sep;6eglalp;MeaDczp:Sep;6egoaop;Mearczp:Reczp:Sep;6egrarp;Mep;Kep;Kep;Lepxbbbbbbbbbbbbbbbbp:4ep;Jep;Mepxbbn0bbn0bbn0bbn0gDp;KepxFFbbFFbbFFbbFFbbgkp9oaqaop;MeaDp;Keczp:Rep9qgoaqalp;MeaDp;Keakp9oaqarp;MeaDp;Keczp:Rep9qgDpmwDKYqk8AExm35Ps8E8Fglp5eawclp:RegqpEi:T:j83ibavalp5baqpEd:T:j83ibabcwfaoaDpmbezHdiOAlvCXorQLgDp5eaqpEe:T:j83ibabaDp5baqpEb:T:j83ibabcafhbaeclfgeai6mbkkkuee97dnadcd4ae2c98GgeTmbcbhdinababpbbbgicwp:Recwp:Sep;6eaicep:SepxbbjFbbjFbbjFbbjFp9opxbbjZbbjZbbjZbbjZp:Uep;Mepkbbabczfhbadclfgdae6mbkkk:Sodw97euaec98Ghedndnadcl9hmbaeTmecbhdinabpxbbuJbbuJbbuJbbuJabpbbbgicKp:TeglaicYp:Tep9qgvcdp:Teavp9qgvclp:Teavp9qgop;6ep;Negvaicwp:RecKp:SegraipxFbbbFbbbFbbbFbbbgwp9ogDp:Uep;6ep;Mepxbbn0bbn0bbn0bbn0gqp;Kecwp:RepxbFbbbFbbbFbbbFbbp9oavaDarp:Xeaiczp:RecKp:Segip:Uep;6ep;Meaqp;Keawp9op9qavaDaraip:Uep:Xep;6ep;Meaqp;Keczp:RepxbbFbbbFbbbFbbbFbp9op9qavaoalcep:Rep9oalpxebbbebbbebbbebbbp9op9qp;6ep;Meaqp;KecKp:Rep9qpkbbabczfhbadclfgdae6mbxdkkaeTmbcbhdinabczfgkpxbFu9hbFu9hbFu9hbFu9habpbbbglakpbbbgrpmlvorxmPsCXQL358E8Fgvczp:TegqavcHp:Tep9qgicdp:Teaip9qgiclp:Teaip9qgicwp:Teaip9qgop;6ep;NegialarpmbediwDqkzHOAKY8AEgDpxFFbbFFbbFFbbFFbbglp9ograDczp:Segwp:Ueavczp:Reczp:SegDp:Xep;6ep;Mepxbbn0bbn0bbn0bbn0gvp;Kealp9oaiarawaDp:Uep:Xep;6ep;Meavp;Keczp:Rep9qgwaiaoaqcep:Rep9oaqpxebbbebbbebbbebbbp9op9qp;6ep;Meavp;Keczp:ReaiaDarp:Uep;6ep;Meavp;Kealp9op9qgipmwDKYqk8AExm35Ps8E8FpkbbabawaipmbezHdiOAlvCXorQLpkbbabcafhbadclfgdae6mbkkk9teiucbcbydj:G:cjbgeabcifc98GfgbBdj:G:cjbdndnabZbcztgd9nmbcuhiabad9RcFFifcz4nbcuSmekaehikaikkxebcj:Gdklz:zbb",a=new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,3,2,0,0,5,3,1,0,1,12,1,0,10,22,2,12,0,65,0,65,0,65,0,252,10,0,0,11,7,0,65,0,253,15,26,11]),t=new Uint8Array([32,0,65,2,1,106,34,33,3,128,11,4,13,64,6,253,10,7,15,116,127,5,8,12,40,16,19,54,20,9,27,255,113,17,42,67,24,23,146,148,18,14,22,45,70,69,56,114,101,21,25,63,75,136,108,28,118,29,73,115]);if(typeof WebAssembly!="object")return{supported:!1};var n=WebAssembly.validate(a)?r(e):r(d),s,o=WebAssembly.instantiate(n,{}).then(function(u){s=u.instance,s.exports.__wasm_call_ctors()});function r(u){for(var g=new Uint8Array(u.length),p=0;p<u.length;++p){var m=u.charCodeAt(p);g[p]=m>96?m-97:m>64?m-39:m+4}for(var x=0,p=0;p<u.length;++p)g[x++]=g[p]<60?t[g[p]]:(g[p]-60)*64+g[++p];return g.buffer.slice(0,x)}function i(u,g,p,m,x,R,T){var E=u.exports.sbrk,A=m+3&-4,y=E(A*x),M=E(R.length),z=new Uint8Array(u.exports.memory.buffer);z.set(R,M);var S=g(y,m,x,M,R.length);if(S==0&&T&&T(y,A,x),p.set(z.subarray(y,y+m*x)),E(y-E(0)),S!=0)throw new Error("Malformed buffer data: "+S)}var c={NONE:"",OCTAHEDRAL:"meshopt_decodeFilterOct",QUATERNION:"meshopt_decodeFilterQuat",EXPONENTIAL:"meshopt_decodeFilterExp",COLOR:"meshopt_decodeFilterColor"},l={ATTRIBUTES:"meshopt_decodeVertexBuffer",TRIANGLES:"meshopt_decodeIndexBuffer",INDICES:"meshopt_decodeIndexSequence"},b=[],f=0;function h(u){var g={object:new Worker(u),pending:0,requests:{}};return g.object.onmessage=function(p){var m=p.data;g.pending-=m.count,g.requests[m.id][m.action](m.value),delete g.requests[m.id]},g}function v(u){for(var g="self.ready = WebAssembly.instantiate(new Uint8Array(["+new Uint8Array(n)+"]), {}).then(function(result) { result.instance.exports.__wasm_call_ctors(); return result.instance; });self.onmessage = "+w.name+";"+i.toString()+w.toString(),p=new Blob([g],{type:"text/javascript"}),m=URL.createObjectURL(p),x=b.length;x<u;++x)b[x]=h(m);for(var x=u;x<b.length;++x)b[x].object.postMessage({});b.length=u,URL.revokeObjectURL(m)}function k(u,g,p,m,x){for(var R=b[0],T=1;T<b.length;++T)b[T].pending<R.pending&&(R=b[T]);return new Promise(function(E,A){var y=new Uint8Array(p),M=++f;R.pending+=u,R.requests[M]={resolve:E,reject:A},R.object.postMessage({id:M,count:u,size:g,source:y,mode:m,filter:x},[y.buffer])})}function w(u){var g=u.data;self.ready.then(function(p){if(!g.id)return self.close();try{var m=new Uint8Array(g.count*g.size);i(p,p.exports[g.mode],m,g.count,g.size,g.source,p.exports[g.filter]),self.postMessage({id:g.id,count:g.count,action:"resolve",value:m},[m.buffer])}catch(x){self.postMessage({id:g.id,count:g.count,action:"reject",value:x})}})}return{ready:o,supported:!0,useWorkers:function(u){v(u)},decodeVertexBuffer:function(u,g,p,m,x){i(s,s.exports.meshopt_decodeVertexBuffer,u,g,p,m,s.exports[c[x]])},decodeIndexBuffer:function(u,g,p,m){i(s,s.exports.meshopt_decodeIndexBuffer,u,g,p,m)},decodeIndexSequence:function(u,g,p,m){i(s,s.exports.meshopt_decodeIndexSequence,u,g,p,m)},decodeGltfBuffer:function(u,g,p,m,x,R){i(s,s.exports[l[x]],u,g,p,m,s.exports[c[R]])},decodeGltfBufferAsync:function(u,g,p,m,x){return b.length>0?k(u,g,p,l[m],c[x]):o.then(function(){var R=new Uint8Array(u*g);return i(s,s.exports[l[m]],R,u,g,p,s.exports[c[x]]),R})}}})();const Ye="/boat-configurator/crew/",L=(d=0,e=0,a=0)=>new O(d,e,a);let ue=null;function Zt(){if(ue)return ue;const d=new vt().setMeshoptDecoder($t);return ue=Promise.all([d.loadAsync(`${Ye}skipper.glb`),fetch(`${Ye}skipper-helm.json`).then(e=>e.json())]).then(([e,a])=>{const t=new le;t.rotation.y=Math.PI/2,t.add(e.scene);const n={},s=[];return e.scene.traverse(o=>{o.isBone&&(n[o.name.replace("mixamorig","")]=o),o.isMesh&&(o.castShadow=o.receiveShadow=!0,o.frustumCulled=!1,s.push(o))}),{root:t,bones:n,meshes:s,pose:a}}),ue}const I=L(),ge=L(),me=L(),en=L(),$e=L(),an=L(),C=new we,se=new we;function Ze(d,e,a){d.getWorldPosition(I),C.setFromUnitVectors(en.subVectors(e,I).normalize(),an.subVectors(a,I).normalize()),d.getWorldQuaternion(se).premultiply(C),d.parent.getWorldQuaternion(C).invert(),d.quaternion.copy(C.multiply(se)),d.updateMatrixWorld(!0)}function tn(d,e,a){C.setFromAxisAngle(e,a),d.getWorldQuaternion(se).premultiply(C),d.parent.getWorldQuaternion(C).invert(),d.quaternion.copy(C.multiply(se)),d.updateMatrixWorld(!0)}function Se(d,e,a,t,n){a.getWorldQuaternion(se);const s=se.clone();d.getWorldPosition(I),e.getWorldPosition(ge),a.getWorldPosition(me);const o=I.distanceTo(ge),r=ge.distanceTo(me),i=qe.clamp(I.distanceTo(t),Math.abs(o-r)+.001,(o+r)*.995),c=L().subVectors(t,I).normalize();$e.copy(n).addScaledVector(c,-n.dot(c)).normalize();const l=(o*o+i*i-r*r)/(2*o*i),b=I.clone().addScaledVector(c,o*l).addScaledVector($e,o*Math.sqrt(Math.max(0,1-l*l)));Ze(d,ge.clone(),b),a.getWorldPosition(me),Ze(e,me.clone(),I.clone().addScaledVector(c,i)),a.parent.getWorldQuaternion(C).invert(),a.quaternion.copy(C.multiply(s)),a.updateMatrixWorld(!0)}const ve=(d,e)=>d.parent.localToWorld(e.clone());function nn(d,e){const{root:a,bones:t,pose:n}=d;for(const[w,u]of Object.entries(n.bones))t[w]?.quaternion.fromArray(u);t.Hips.position.fromArray(n.hips);const{rim:s,axis:o,radius:r}=e.wheel,i=!!e.seat;if(i?a.position.set(e.seat.x+.42,ke,e.seat.z):a.position.set(Math.max(s.x-.4,e.stand+.32),ke,s.z+.04),a.updateMatrixWorld(!0),i){const w=ve(a,L(e.seat.x-.03,e.seat.y+.09,e.seat.z));t.Hips.parent.updateMatrixWorld(!0),t.Hips.position.copy(t.Hips.parent.worldToLocal(w)),t.Hips.updateMatrixWorld(!0)}const c=L(0,1,0).transformDirection(a.parent.matrixWorld),l=L(1,0,0).transformDirection(a.parent.matrixWorld),b=L(0,0,1).transformDirection(a.parent.matrixWorld);i||tn(t.Spine,b,-.16);for(const[w,u]of[["Left",-1],["Right",1]]){const g=ve(a,L(a.position.x+(i?0:-.05),ke+.085,a.position.z+u*(i?.13:.15)));Se(t[`${w}UpLeg`],t[`${w}Leg`],t[`${w}Foot`],g,l.clone().addScaledVector(b,u*.25))}const f=L(0,0,1),h=L().crossVectors(o,f),v=s.clone().addScaledVector(f,-r*.87).addScaledVector(h,r*.5).addScaledVector(o,.07),k=e.throttle.clone().add(L(-.07,0,0));Se(t.LeftArm,t.LeftForeArm,t.LeftHand,ve(a,v),c.clone().negate().addScaledVector(b,-.6).addScaledVector(l,-.3)),Se(t.RightArm,t.RightForeArm,t.RightHand,ve(a,k),c.clone().negate().addScaledVector(b,.6).addScaledVector(l,-.3))}function rn({pmrem:d,lowPower:e,mirrorTexture:a}){const t=new tt,n=We();n.geometry=new aa(50,32,16),n.material.uniforms.uHorizon.value.set("#ddd3c9"),n.material.uniforms.uAnti.value.set("#aeb9c6"),n.material.uniforms.uTop.value.set("#a6a9ad"),t.add(n);const s=d.fromScene(t,.02).texture;n.geometry.dispose(),n.material.dispose();const o=We(),r=rt({detail:e?0:1}),i=ct(),c=ht({count:e?2500:7e3}),l=gt({detail:e?0:1});return r.material.uniforms.tReflect.value=a,{sky:o,water:r,underwater:i,spray:c,whiteWater:l,waterEnv:s,seaHeight:st,loadSkipper:Zt,placeSkipper:nn}}export{rn as createSea};
