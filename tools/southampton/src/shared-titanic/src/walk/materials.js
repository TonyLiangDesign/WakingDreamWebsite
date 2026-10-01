import * as THREE from 'three';

/**
 * 程序化 PBR 材质库。
 *
 * 这是整个漫游版观感的地基。拿不到采购贴图的情况下，「AAA 观感」里
 * 有一大半来自材质而不是多边形——纯色块的船无论加多少细节都像模型，
 * 而带铆钉法线、柚木缝、磨损与油漆分层的表面，即使几何很简单也像实物。
 *
 * 每种材质生成三张图：albedo / normal / roughness（必要时加 AO）。
 * 法线由高度场经 Sobel 求得，不手绘。
 * 全部在加载时生成一次，之后常驻显存。
 */

const CACHE = new Map();

/* ---------------------------------------------------------- 工具 */

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** 值噪声：程序化贴图的骨架，比 Math.random 的白噪声可控得多。 */
function makeNoise(seed = 1) {
  const p = new Uint8Array(512);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (h, x, y) => {
    const u = h & 1 ? x : y;
    const v = h & 2 ? x : y;
    return ((h & 4) ? -u : u) + ((h & 8) ? -v : v);
  };

  const noise2 = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const A = p[X] + Y, B = p[X + 1] + Y;
    return lerp(
      lerp(grad(p[A], x, y), grad(p[B], x - 1, y), u),
      lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u), v);
  };

  /** 分形叠加。tile 让贴图在给定周期上无缝。 */
  return (x, y, octaves = 4, lac = 2, gain = 0.5, tile = 0) => {
    let v = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      let n;
      if (tile) {
        // 四角混合实现无缝
        const t = tile * f;
        const a = noise2(x * f, y * f);
        const b = noise2(x * f - t, y * f);
        const c = noise2(x * f, y * f - t);
        const d = noise2(x * f - t, y * f - t);
        const fx = (x * f) / t, fy = (y * f) / t;
        n = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
      } else {
        n = noise2(x * f, y * f);
      }
      v += n * amp; norm += amp;
      amp *= gain; f *= lac;
    }
    return v / norm;
  };
}

/** 从高度场算法线图。Sobel 求梯度——比手绘可靠，而且和高度严格一致。 */
function heightToNormal(height, size, strength = 2.0) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy =
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) -
        (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** 单通道数组 → 灰度贴图（粗糙度 / AO / 金属度都用它）。 */
function grayToCanvas(arr, size) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, arr[i] * 255)) | 0;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * 法线图与灰度图的缓存。
 *
 * heightToNormal 是一张 1024²（柚木是 2048²）的 Sobel，每像素九次采样；
 * teakDeck / rivetedSteel 更贵，每像素还要跑五阶噪声。
 * 而全船几十个材质变体里，**绝大多数只是颜色不同**——高度场、粗糙度、
 * 法线全都一模一样。第一版每个变体都从头算一遍，进场光这一项就吃掉
 * 五十多秒，房间越多越慢。
 *
 * 缓存挂在高度场数据对象上（那个对象本身已经按几何参数缓存过了），
 * 所以只要几何参数相同，法线图就只算一次。
 */
/**
 * 表面缓存：一个 kind + 一组【非颜色】参数 → 一份高度场与粗糙度。
 *
 * 地毯、油地毡、光面漆、瓷砖这几类，颜色变了纹理其实一模一样，
 * 但第一版每换一个颜色就把 512²/1024² 的噪声和 Sobel 重算一遍。
 * 全船有十七种油地毡、十四种地毯、十一种漆、六种瓷砖——
 * 光这一项就是十几秒。颜色交给 material.color，纹理只算一次。
 */
const SURF = new Map();
function surface(key, make) {
  let d = SURF.get(key);
  if (!d) { d = make(); SURF.set(key, d); }
  return d;
}

function normalOf(d, strength) {
  const k = '_n' + strength;
  if (!d[k]) d[k] = heightToNormal(d.h, d.size, strength);
  return d[k];
}
function grayOf(d, key, arr) {
  const k = '_g' + key;
  if (!d[k]) d[k] = grayToCanvas(arr, d.size);
  return d[k];
}

function tex(c, repeat, srgb = false) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 16;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* --------------------------------------------- 真实尺度 UV */

/**
 * 贴图的「一格」代表多少米。
 *
 * 铆接钢板一格里有 3 道列板缝（plateH = 0.34 UV），真实列板宽约 90 cm，
 * 所以一格 ≈ 2.5 米。柚木一格 2 米。统一按米算，材质就不需要各自配
 * repeat——那种做法在长宽比悬殊的面上必然被拉成条纹，
 * 250 米长 3 米高的舷墙尤其明显。
 */
export const TILE = 2.5;

/**
 * 按几何体的真实尺寸重写 BoxGeometry 的 UV，每个面各按自己的长宽铺。
 * 这是「不拉伸」的唯一可靠办法：一个 repeat 服务不了立方体的六个面。
 */
export function uvBox(mesh, tile = TILE) {
  const g = mesh.geometry;
  const p = g.parameters;
  if (!p || p.width === undefined) return mesh;
  const { width: w, height: h, depth: d } = p;
  const uv = g.attributes.uv;
  const per = uv.count / 6;
  if (per !== Math.floor(per)) return mesh;
  // BoxGeometry 的面序固定为 +X −X +Y −Y +Z −Z
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = spans[f];
    for (let i = 0; i < per; i++) {
      const k = f * per + i;
      uv.setXY(k, uv.getX(k) * su / tile, uv.getY(k) * sv / tile);
    }
  }
  uv.needsUpdate = true;
  return mesh;
}

/** 圆柱同理：u 绕一圈 = 周长，v = 高。 */
export function uvCyl(mesh, tile = TILE) {
  const g = mesh.geometry;
  const p = g.parameters;
  if (!p || p.radiusTop === undefined) return mesh;
  const r = Math.max(p.radiusTop, p.radiusBottom);
  const su = (2 * Math.PI * r) / tile, sv = p.height / tile;
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return mesh;
}

/** 平面：w × h 米。 */
export function uvPlane(mesh, w, h, tile = TILE) {
  const uv = mesh.geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile);
  uv.needsUpdate = true;
  return mesh;
}

/* ------------------------------------------------- 铆接钢板 */

/**
 * 铆接钢板。
 *
 * 这是 1912 年的船最本质的表面特征——泰坦尼克全船三百多万颗铆钉。
 * 逐颗做几何是不可能的（几千万面），但铆钉的视觉全在高光的排布上，
 * 法线图完全够用，而且在任何距离都成立。
 *
 * 结构：水平列板（strake）接缝 + 垂直对接缝 + 沿缝的双排铆钉 + 漆面起伏。
 */
/**
 * 铆接钢板的高度场缓存。
 *
 * 全船有二十多个 paintedSteel 变体，但它们**绝大多数只是颜色不同**：
 * 板距、搭接、铆钉这些几何参数就那么四五套。而每生成一次要在 1024²
 * 上跑五阶噪声——一百万个像素、每个像素十几次噪声采样。
 * 二十多次下来就是进场时间里最大的一块。
 *
 * 所以：按几何参数缓存高度场/粗糙度/磨损，颜色在外面单独上。
 */
const STEEL_CACHE = new Map();

/** 把一个数吸附到最近的档位上。 */
function snap(v, steps, dflt) {
  if (v === undefined || v === null) v = dflt;
  let best = steps[0];
  for (const s of steps) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  return best;
}

/**
 * 生成一张铆接钢板要在 1024² 上跑五阶噪声——一千万次采样，两三秒。
 * 而各个房间为了「有点区别」各填各的板距、磨损、脏污，
 * 参数稍微差一点就是一张全新的贴图。全船攒下来十几组，
 * 进场时间的一大半花在这上面，而那些差别在画面上根本分不出来。
 *
 * 所以：把参数吸附到几个档位上。真正影响观感的只有三件事——
 * 板多大、搭接明不明显、脏成什么样——每件三四档就够了，
 * 组合下来实际只会生成四五张。
 *
 * 代价：房间作者填的 plateH: 0.55 会变成 0.52。没人看得出来。
 */
function rivetedSteelCached(o) {
  const q = {
    size: o.size,
    plateH: snap(o.plateH, [0.34, 0.52, 0.9, 2.0], 0.34),
    plateW: snap(o.plateW, [0.5, 0.82, 1.4, 2.0], 0.5),
    rivetR: o.rivetR, rivetH: o.rivetH,
    seam: snap(o.seam, [0.25, 0.6, 0.9], 0.9),
    seed: snap(o.seed, [7], 7),
    inout: snap(o.inout, [0, 0.004, 0.012], 0.012),
    wearAmt: snap(o.wearAmt, [0.2, 0.5, 1.0, 1.4], 1.0),
    grime: snap(o.grime, [0, 0.15, 0.35, 0.6], 0),
  };
  // 铆钉尺寸是少数几处真的要按件调的（救生艇的铆钉比船体小得多），
  // 所以它不吸附，但它也只有两三种。
  const key = Object.values(q).join('|');
  let d = STEEL_CACHE.get(key);
  if (!d) { d = rivetedSteel(q); STEEL_CACHE.set(key, d); }
  return d;
}

function rivetedSteel({
  size = 1024, plateH = 0.34, plateW = 0.5,
  rivetR = 0.0075, rivetH = 1.0, seam = 0.9, seed = 7,
  inout = 0.012, wearAmt = 1.0, grime = 0.0,
} = {}) {
  const n = makeNoise(seed);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const wear = new Float32Array(size * size);

  const px = 1 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * px, v = y * px;
      const i = y * size + x;

      // 漆面的大尺度起伏 + 细颗粒
      /**
       * 噪声的阶数和「是否无缝」都要算钱。
       *
       * makeNoise 的 tile 参数是靠四角混合实现无缝的——**每一阶要采四次**。
       * 原来这里低频四阶、细颗粒三阶，全都开无缝，一个像素就是 28 次采样；
       * 再加下面的磨损、积垢、粗糙度，一共五十次。1024² 乘五十就是
       * 五千万次噪声，两三秒——而这类贴图全船要生成十几张。
       *
       * 低频必须无缝（接缝一眼看得见），高频不必：4 cm 周期的颗粒
       * 在接缝处差一点谁也发现不了。按这条把阶数和无缝各砍一遍，
       * 采样从五十降到二十，观感没有可察觉的变化。
       */
      let hh = n(u * 5, v * 5, 3, 2, 0.55, 5) * 0.05
             + n(u * 42, v * 42, 2, 2, 0.5, 0) * 0.022;

      // 列板接缝：水平方向的搭接
      const rowT = v / plateH;
      const row = Math.floor(rowT);
      const rowF = rowT - row;
      const nearRow = Math.min(rowF, 1 - rowF) * plateH;
      if (nearRow < 0.006) hh += (1 - nearRow / 0.006) * seam * 0.045;

      /**
       * in-and-out 列板：隔一块搭在外侧。
       *
       * 第一版这里是一个 0.045 的硬台阶，配上每 1.25 米一道的对接缝，
       * 整面舷墙看上去像砌砖——这是最伤的一个细节，因为它把「钢板」
       * 直接读成了「砌体」。改成很浅的、边缘带过渡的隆起：
       * 搭接在真实的船上本来就只有一个板厚（十几毫米）。
       */
      if (row % 2 === 0) {
        const e = Math.min(1, nearRow / 0.03);
        hh += inout * (0.35 + 0.65 * e);
      }

      // 垂直对接缝，每块板错开半格
      const colT = u / plateW + (row % 2 ? 0.5 : 0);
      const col = Math.floor(colT);
      const colF = colT - col;
      const nearCol = Math.min(colF, 1 - colF) * plateW;
      if (nearCol < 0.005) hh += (1 - nearCol / 0.005) * seam * 0.030;

      // 铆钉：沿两种接缝各排一列。它们才是这个表面的主角，
      // 所以缝压下去之后铆钉要相对更突出。
      const rivetAt = (dist, along, spacing) => {
        if (dist > rivetR * 2.6) return 0;
        const t = along / spacing;
        const f = Math.abs(t - Math.round(t)) * spacing;
        const d = Math.hypot(dist, f);
        if (d > rivetR) return 0;
        return Math.sqrt(Math.max(0, 1 - (d / rivetR) ** 2)) * rivetH * 0.075;
      };
      hh += rivetAt(nearRow, u, 0.026);
      hh += rivetAt(nearCol, v, 0.026);

      h[i] = hh;

      // 磨损：接缝与铆钉附近漆更薄、更粗糙。
      // 幅度压小——原来那一版的大斑块像发霉，不像刷了漆的钢。
      const blotch = n(u * 9 + 11, v * 9 + 3, 3, 2, 0.55, 9) * 0.5 + 0.5;
      const w = Math.max(blotch * 0.34, nearRow < 0.014 ? 0.55 : 0) * wearAmt;
      wear[i] = w;
      // 从上往下的积垢：海上的白漆最脏的地方永远是横向构件的下方
      const dirt = grime * Math.pow(Math.max(0, 1 - rowF), 2.2)
                 * (n(u * 22, v * 22, 2, 2, 0.6, 0) * 0.5 + 0.5);
      wear[i] += dirt;
      rough[i] = 0.38 + w * 0.30 + dirt * 0.3 + n(u * 60, v * 60, 1, 2, 0.5, 0) * 0.06;
    }
  }
  return { h, rough, wear, size };
}

/* ---------------------------------------------------- 柚木甲板 */

/**
 * 柚木甲板。
 *
 * 泰坦尼克的露天甲板铺柚木，板缝灌黑色沥青填料。板宽约 6 英寸（15 cm），
 * 所以贴图按每米 6.6 条板来算——这个比例错了，整片甲板一眼就假。
 */
function teakDeck({ size = 2048, plankW = 0.15, tileMeters = 5.0, seed = 13, butts = true } = {}) {
  const n = makeNoise(seed);
  const h = new Float32Array(size * size);
  const rough = new Float32Array(size * size);
  const col = new Uint8ClampedArray(size * size * 4);

  const planksPerTile = tileMeters / plankW;
  const px = 1 / size;
  const hash = (k) => ((Math.sin(k * 127.1) * 43758.5453) % 1 + 1) % 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x * px, v = y * px;
      const i = y * size + x;

      const pt = v * planksPerTile;
      const plank = Math.floor(pt);
      const pf = pt - plank;
      const edge = Math.min(pf, 1 - pf);

      // 板缝：灌沥青，比板面低
      const caulk = edge < 0.05 ? 1 - edge / 0.05 : 0;

      /**
       * 接头缝。
       *
       * 甲板不是无限长的板——每根柚木大约 5 米一段，段与段之间有一道
       * 横向接头，相邻板的接头必须错开。少了这一条，甲板会因为过于
       * 规整而立刻露馅：现实里没有一百三十米不断头的木板。
       */
      const buttU = hash(plank * 3.7 + 1.3);
      const du = Math.abs(((u - buttU) % 1 + 1.5) % 1 - 0.5);
      const butt = butts && du < 0.0035 ? 1 - du / 0.0035 : 0;

      // 木纹：沿板长方向拉长
      // 木纹三阶就够：再高的阶数在 15 cm 宽的板上分辨不出来
      const grain = n(u * 160, (v + plank * 7.3) * 9, 3, 2.1, 0.5) * 0.5 + 0.5;
      const fine = n(u * 420, (v + plank * 3.1) * 22, 2, 2, 0.5) * 0.5 + 0.5;

      h[i] = -Math.max(caulk, butt * 0.8) * 0.40 + grain * 0.03 + fine * 0.012;

      /**
       * 颜色。第一版偏红偏橙，像家具而不像甲板。
       * 露天柚木每天被海水冲、被砂石擦，日晒之后是偏灰的浅蜜色，
       * 只有背阴处还留着原来的暖调。
       */
      const plankShade = 0.86 + hash(plank * 11.9) * 0.22;
      const bleach = (n(u * 2.2 + 5, v * 2.2, 3, 2, 0.6) * 0.5 + 0.5) * 0.55
                   + hash(plank * 5.1) * 0.35;
      let r = 163, g = 138, b = 100;
      const t = 0.80 + grain * 0.30 + fine * 0.08;
      r *= plankShade * t; g *= plankShade * t; b *= plankShade * t;
      r = r * (1 - bleach * 0.42) + 186 * bleach * 0.42;
      g = g * (1 - bleach * 0.42) + 178 * bleach * 0.42;
      b = b * (1 - bleach * 0.42) + 162 * bleach * 0.42;
      const dark = Math.max(caulk > 0.30 ? 1 : 0, butt > 0.30 ? 1 : 0);
      if (dark) { r *= 0.15; g *= 0.145; b *= 0.15; }

      const o = i * 4;
      col[o] = r; col[o + 1] = g; col[o + 2] = b; col[o + 3] = 255;

      rough[i] = dark ? 0.94 : 0.66 + grain * 0.16 + bleach * 0.10;
    }
  }

  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(col, size, size), 0, 0);
  // col 也带出去：橡木那一支要按亮度重新上色，从数组直接算比
  // getImageData 把画布读回来快得多（后者是一次 GPU 回读，1024² 要上百毫秒）
  return { albedo: c, col, h, rough, size };
}

/** 柚木高度场的缓存：颜色不同不影响它，只有几何参数才影响。 */
const TEAK_CACHE = new Map();
function teakDeckCached(opts) {
  const key = [opts.size, opts.plankW, opts.tileMeters, opts.butts, opts.seed].join('|');
  let d = TEAK_CACHE.get(key);
  if (!d) { d = teakDeck(opts); TEAK_CACHE.set(key, d); }
  return d;
}

/* -------------------------------------------------------- 入口 */

/**
 * 取一个材质。第一次调用时生成贴图，之后走缓存。
 *
 * kind:
 *   'paintedSteel'  刷漆的铆接钢板（船体、上层建筑）
 *   'teak'          柚木甲板
 *   'brass'         黄铜件
 *   'glass'         玻璃
 *   'canvas'        帆布
 *   'rope'          麻绳
 */
export function getMaterial(kind, opts = {}) {
  const key = kind + JSON.stringify(opts);
  if (CACHE.has(key)) return CACHE.get(key);
  let m;

  if (kind === 'paintedSteel') {
    const { color = '#d8d3c6', repeat = [1, 1], roughBase = 0, seed = 7,
            plateH, plateW, inout, wearAmt, grime, seam } = opts;
    const d = rivetedSteelCached({ seed, plateH, plateW, inout, wearAmt, grime, seam });

    /**
     * 颜色不进贴图。
     *
     * 这是进场时间里最大的一笔账：全船有四十多种刷漆钢板，
     * 它们的板缝、铆钉、磨损一模一样，**只有颜色不同**，
     * 而第一版给每一种都烤了一张 1024² 的彩色 albedo。
     * 实测：第一次建全部房间要 26 秒，第二次（材质全命中缓存）只要 132 毫秒——
     * 也就是说几何的代价可以忽略，时间全在这些贴图上。
     *
     * 改法：贴图只存【磨损的明暗】（灰度），颜色交给 material.color，
     * three 会把两者相乘，结果和原来几乎一样，而贴图从四十多张变成三四张。
     */
    const alb = surface('steelAlb' + [d.size, plateH, plateW, inout, wearAmt, grime, seam, seed].join('|'),
      () => {
        const c = canvas(d.size);
        const ctx = c.getContext('2d');
        const img = ctx.createImageData(d.size, d.size);
        for (let i = 0; i < d.size * d.size; i++) {
          const k = (1 - d.wear[i] * 0.16) * 255;
          img.data[i * 4] = k; img.data[i * 4 + 1] = k; img.data[i * 4 + 2] = k;
          img.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return c;
      });

    m = new THREE.MeshStandardMaterial({
      color,
      map: tex(alb, repeat, true),
      normalMap: tex(normalOf(d, 1.7), repeat),
      roughnessMap: tex(grayOf(d, 'r' + roughBase, d.rough.map((v) => v + roughBase)), repeat),
      metalness: 0.04,
      roughness: 1,
      normalScale: new THREE.Vector2(0.85, 0.85),
    });
  } else if (kind === 'teak') {
    // trim: 门框、扶手、舵轮这类细木件。用甲板那套参数的话，
    // 一根 1.3 米的窗框上会横过好几道接头缝，近看像砌砖而不像木头。
    const { repeat = [1, 1], tileMeters, trim = false } = opts;
    const d = teakDeckCached(trim
      ? { size: 1024, plankW: 0.055, tileMeters: 0.85, butts: false, seed: 17 }
      : { size: 2048, plankW: 0.15, tileMeters: tileMeters ?? 5.0, butts: true, seed: 13 });
    m = new THREE.MeshStandardMaterial({
      map: tex(d.albedo, repeat, true),
      normalMap: tex(normalOf(d, 1.35), repeat),
      roughnessMap: tex(grayOf(d, 'r', d.rough), repeat),
      metalness: 0.0,
      roughness: 1,
    });
  } else if (kind === 'oak') {
    /**
     * 橡木镶板。
     *
     * 大楼梯那间屋子是全船最贵的一片表面，而它的贵几乎全在木头上：
     * 深色、密纹、半光。参数和甲板柚木完全不同——板窄得多、没有填缝、
     * 也没有接头，而且要留一点清漆的反光，不然是一堵纸板。
     */
    const { color = '#4a3222', repeat = [1, 1], tileMeters = 0.62 } = opts;
    const d = teakDeckCached({ size: 1024, plankW: 0.035, tileMeters, butts: false, seed: 29 });
    /**
     * 木纹的明暗做成一张灰度图，颜色交给 material.color。
     *
     * 全船有二十多种木色（橡木、桃花心木、胡桃、松、藤……），
     * 纹理全是同一张——把颜色烤进贴图等于把同一张图存二十多遍，
     * 每遍一百多毫秒。拆开之后这一类只生成一次。
     */
    const c = surface('oakLum' + d.size + '|' + tileMeters, () => {
      const cv = canvas(d.size);
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(d.size, d.size);
      for (let i = 0; i < d.size * d.size; i++) {
        const l = (d.col[i * 4] * 0.35 + d.col[i * 4 + 1] * 0.45 + d.col[i * 4 + 2] * 0.20) / 255;
        const k = (0.55 + l * 0.85) * 255;
        img.data[i * 4] = k; img.data[i * 4 + 1] = k; img.data[i * 4 + 2] = k;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      return cv;
    });
    m = new THREE.MeshStandardMaterial({
      color,
      map: tex(c, repeat, true),
      normalMap: tex(normalOf(d, 0.7), repeat),
      roughness: 0.42, metalness: 0.0,
      normalScale: new THREE.Vector2(0.5, 0.5),
    });
  } else if (kind === 'carpet') {
    const { color = '#6d2b2c', repeat = [1, 1] } = opts;
    const d = surface('carpet', () => {
      const n = makeNoise(43);
      const size = 512;
      const h = new Float32Array(size * size);
      const rough = new Float32Array(size * size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size, i = y * size + x;
        // 绒面：短而密的随机起伏，不能有可读的图案
        h[i] = n(u * 300, v * 300, 2, 2, 0.5, 300) * 0.06 + n(u * 70, v * 70, 3, 2, 0.5, 70) * 0.03;
        rough[i] = 0.93 + n(u * 40, v * 40, 2, 2, 0.5, 40) * 0.05;
      }
      return { h, rough, size };
    });
    m = new THREE.MeshStandardMaterial({
      color,
      normalMap: tex(normalOf(d, 1.1), repeat),
      roughnessMap: tex(grayOf(d, 'r', d.rough), repeat),
      roughness: 1, metalness: 0,
    });
  } else if (kind === 'paint') {
    /**
     * 光面漆。
     *
     * 室内的木门、门套、天花、家具刷的漆——和舱壁的铆接钢板完全是两回事。
     * 之前室内一律拿 paintedSteel 顶着用，结果每一扇客舱门上都印着一圈铆钉，
     * 近看非常出戏：1912 年的头等舱不会把铆钉露在卧室门上。
     * 这个材质只有极细的刷痕和一点漆膜的橘皮，其余什么都没有。
     */
    const { color = '#ece7dc', repeat = [1, 1], gloss = 0.35 } = opts;
    const d = surface('paint', () => {
      const n = makeNoise(83);
      const size = 512;
      const h = new Float32Array(size * size);
      const base = new Float32Array(size * size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size, i = y * size + x;
        // 刷痕：沿一个方向拉长的极低幅噪声；橘皮：细密的各向同性起伏
        h[i] = n(u * 3, v * 90, 3, 2, 0.5, 90) * 0.035
             + n(u * 130, v * 130, 2, 2, 0.5, 130) * 0.012;
        base[i] = n(u * 26, v * 26, 2, 2, 0.55, 26) * 0.06;
      }
      return { h, base, size };
    });
    m = new THREE.MeshStandardMaterial({
      color,
      normalMap: tex(normalOf(d, 0.5), repeat),
      // 粗糙度是 gloss + 同一张噪声，按 gloss 分别缓存
      roughnessMap: tex(grayOf(d, 'g' + gloss, d.base.map((v) => v + gloss)), repeat),
      metalness: 0, roughness: 1,
      normalScale: new THREE.Vector2(0.45, 0.45),
    });
  } else if (kind === 'tile') {
    /**
     * 方格地砖。
     *
     * 这条船上最容易被忽略、却最能定位「你在哪一等」的一种表面：
     * 头等舱的浴室、走廊尽头、三等舱的餐厅、接待室都铺它。
     * 砖边要有一圈极细的高光——砖是上釉的，缝是哑的，
     * 少了这个反差就是一张印上去的棋盘格。
     *
     * 高度场和粗糙度只跟格子数有关，和两种砖的颜色无关，
     * 所以缓存起来；颜色只影响 albedo。
     *
     * `grout` / `wear` 控制勾缝和磨损把 albedo 压暗多少。
     *
     * 这两项原来是写死的（0.55 和 1.0），压暗比传进来的 a/b 更强——
     * 平均下来 albedo 只剩 0.94 上下，缝里更是掉到 0.42。
     * 黑白格地面看不出来（本来就有一半是黑砖），但**白瓷砖到不了白**：
     * 三等舱吸烟室的墙裙传的是近白色，出来是一片发灰发绿的东西。
     * 默认值保持原样，已有的调用观感不变；要真正的白瓷砖就把这两个调小。
     */
    const { size = 1024, tileMeters = 0.6, a = '#e6e2d8', b = '#25231f',
            grout = 0.55, wear = 1.0 } = opts;
    const per = 4;                       // 一格贴图里 4×4 块砖
    const d = surface('tile' + size, () => {
      const n = makeNoise(67);
      const h = new Float32Array(size * size);
      const rough = new Float32Array(size * size);
      const grout = new Float32Array(size * size);
      const wear = new Float32Array(size * size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size, i = y * size + x;
        const gx = Math.floor(u * per), gy = Math.floor(v * per);
        const fu = u * per - gx, fv = v * per - gy;
        const edge = Math.min(fu, 1 - fu, fv, 1 - fv);
        const gr = edge < 0.035 ? 1 - edge / 0.035 : 0;
        const w = n(u * 7 + gx, v * 7 + gy, 3, 2, 0.6) * 0.12;
        grout[i] = gr; wear[i] = w;
        h[i] = -gr * 0.5;
        rough[i] = gr > 0.4 ? 0.88 : 0.22 + w * 1.6;
      }
      return { h, rough, grout, wear, size };
    });

    const ca = new THREE.Color(a), cb = new THREE.Color(b);
    const col = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const gx = Math.floor((x / size) * per), gy = Math.floor((y / size) * per);
      const c = (gx + gy) % 2 === 0 ? cb : ca;
      // grout = 0.55、wear = 1 时和旧式 (1 - g*0.55) * (0.94 + w) 逐像素相同
      const k = (1 - d.grout[i] * grout) * (1 - wear * (0.06 - d.wear[i]));
      const o = i * 4;
      col[o] = c.r * 255 * k; col[o + 1] = c.g * 255 * k; col[o + 2] = c.b * 255 * k; col[o + 3] = 255;
    }
    const c = canvas(size);
    c.getContext('2d').putImageData(new ImageData(col, size, size), 0, 0);
    const rep = [1, 1];
    m = new THREE.MeshStandardMaterial({
      map: tex(c, rep, true),
      normalMap: tex(normalOf(d, 1.1), rep),
      roughnessMap: tex(grayOf(d, 'r', d.rough), rep),
      metalness: 0.0, roughness: 1,
    });
    m.userData.tileMeters = tileMeters;
  } else if (kind === 'lino') {
    // 油地毡：二三等舱的走廊与舱室地面。几乎无纹，只有很细的颗粒与磨痕
    const { color = '#6a5a48', repeat = [1, 1] } = opts;
    const d = surface('lino', () => {
      const n = makeNoise(71);
      const size = 512;
      const h = new Float32Array(size * size);
      const rough = new Float32Array(size * size);
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size, i = y * size + x;
        h[i] = n(u * 160, v * 160, 2, 2, 0.5, 160) * 0.03;
        rough[i] = 0.55 + (n(u * 12, v * 12, 3, 2, 0.6, 12) * 0.5 + 0.5) * 0.3;
      }
      return { h, rough, size };
    });
    m = new THREE.MeshStandardMaterial({
      color,
      normalMap: tex(normalOf(d, 0.8), repeat),
      roughnessMap: tex(grayOf(d, 'r', d.rough), repeat),
      metalness: 0, roughness: 1,
    });
  } else if (kind === 'gilt') {
    // 鎏金铜：比甲板上的黄铜更亮更暖，粗糙度更低——它在室内是主要的光源反射体
    const { repeat = [2, 2] } = opts;
    const n = makeNoise(37);
    const size = 512;
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      h[y * size + x] = n(u * 24, v * 24, 3, 2, 0.5, 24) * 0.03;
    }
    m = new THREE.MeshStandardMaterial({
      color: '#c9a34e',
      normalMap: tex(heightToNormal(h, size, 0.8), repeat),
      metalness: 0.95, roughness: 0.22,
    });
  } else if (kind === 'brass') {
    // 船上的黄铜是每天擦、但也每天被海风打的：底色偏灰绿，
    // 高光有形但不刺眼。纯 #b8903c + roughness 0.16 出来像抛光黄金。
    const { color = '#9c8552', repeat = [2, 2] } = opts;
    const n = makeNoise(31);
    const size = 512;
    const h = new Float32Array(size * size);
    const rough = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = y * size + x;
      h[i] = n(u * 30, v * 30, 3, 2, 0.5, 30) * 0.04;
      rough[i] = 0.26 + (n(u * 8, v * 8, 3, 2, 0.6, 8) * 0.5 + 0.5) * 0.30;
    }
    m = new THREE.MeshStandardMaterial({
      color,
      normalMap: tex(heightToNormal(h, size, 1.2), repeat),
      roughnessMap: tex(grayToCanvas(rough, size), repeat),
      metalness: 0.82,
      roughness: 1,
    });
  } else if (kind === 'glass') {
    m = new THREE.MeshPhysicalMaterial({
      color: '#b9c8cf', metalness: 0, roughness: 0.06,
      transmission: 0.92, thickness: 0.02, ior: 1.5,
      transparent: true, opacity: 1,
    });
  } else if (kind === 'canvas') {
    const { color = '#c6bda6', repeat = [3, 3] } = opts;
    const n = makeNoise(57);
    const size = 512;
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, i = y * size + x;
      // 织纹：两个方向的方波叠加
      h[i] = (Math.sin(u * size * 0.55) * 0.5 + Math.sin(v * size * 0.55) * 0.5) * 0.02
           + n(u * 14, v * 14, 3, 2, 0.5, 14) * 0.06;
    }
    m = new THREE.MeshStandardMaterial({
      color,
      normalMap: tex(heightToNormal(h, size, 1.8), repeat),
      roughness: 0.88, metalness: 0,
    });
  } else if (kind === 'rope') {
    const { color = '#8a7a58', repeat = [1, 12] } = opts;
    const size = 256;
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // 三股右捻
      h[y * size + x] = Math.sin((u * 3 + v * 9) * Math.PI * 2) * 0.5;
    }
    m = new THREE.MeshStandardMaterial({
      color,
      normalMap: tex(heightToNormal(h, size, 2.2), repeat),
      roughness: 0.95, metalness: 0,
    });
  } else {
    m = new THREE.MeshStandardMaterial({ color: opts.color || '#888888', roughness: 0.8 });
  }

  m.name = kind;
  CACHE.set(key, m);
  return m;
}

/** 预生成所有材质，避免进场时逐个卡顿。返回已生成的数量。 */
export function warmup() {
  const kinds = [
    ['paintedSteel', { color: '#dcd7ca', repeat: [3, 3] }],
    ['paintedSteel', { color: '#14171b', repeat: [3, 3], seed: 11 }],
    ['teak', { repeat: [1, 1] }],
    ['brass', {}],
    ['glass', {}],
    ['canvas', {}],
    ['rope', {}],
  ];
  kinds.forEach(([k, o]) => getMaterial(k, o));
  return CACHE.size;
}
