import * as THREE from 'three';
import { getMaterial, uvBox, uvCyl } from './materials.js';
import { buildBowAccess } from './bow-access.js';

/**
 * 艏楼、前井甲板与前桅。
 *
 * 做这一块的直接原因很实际：站在舰桥上往前看，原来只有海。
 * 而在真船上，舰桥的正前方是全船最有内容的一片——两层落差的井甲板、
 * 两对吊杆柱、锚机、锚链、以及那根带瞭望台的前桅。它们是舰桥这个
 * 机位成立的全部理由。
 *
 * 坐标沿用艇甲板的：艇甲板面 y=0，船头 +z。
 * 高度按奥林匹克级的甲板间距（约 2.6–2.9 m）往下推：
 *   艇甲板  0        A 甲板 −2.9      B 甲板 −5.8
 *   艏楼甲板 −5.9    前井甲板（C 甲板）−8.5
 */

const box = (w, h, d, m) => uvBox(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m));
const cyl = (rt, rb, h, seg, m, open = false) =>
  uvCyl(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m));

function put(o, x, y, z, ry = 0) {
  o.position.set(x, y, z);
  if (ry) o.rotation.y = ry;
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

/**
 * 碰撞代理专用材质。
 * material.visible === false 的对象渲染器一帧都不提交，但 Raycaster 照样命中，
 * bake.js 也正是靠这一条把它们排除在合批之外——碰撞代理必须保持独立对象。
 */
const INVIS = new THREE.MeshBasicMaterial({ visible: false });

export const BOW = {
  WELL_Y: -8.5,        // 前井甲板
  FCSL_Y: -5.9,        // 艏楼甲板
  FRONT_Z: 91.5,       // 上层建筑前壁
  WELL_Z1: 117.0,      // 井甲板前缘 / 防浪板
  STEM_Z: 146.0,       // 艏柱
};

/** 船体在某个 z 上的半宽。艏部收得很快，这条曲线决定了「船头」的形状。 */
function halfBeam(z) {
  const { FRONT_Z, STEM_Z } = BOW;
  const t = Math.max(0, Math.min(1, (z - FRONT_Z) / (STEM_Z - FRONT_Z)));
  // 前 2/3 几乎不收，最后 1/3 迅速收到艏柱——这是快速客船的水线以上形状
  return 13.8 * Math.pow(1 - Math.pow(t, 2.6), 0.55) + 0.35 * (1 - t);
}

/** 一段带收窄的甲板面：沿 z 分段放样，每段按当时的半宽取值。 */
function taperedDeck(z0, z1, y, mat, segs = 28, inset = 0) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const z = z0 + ((z1 - z0) * i) / segs;
    const b = Math.max(0.25, halfBeam(z) - inset);
    pos.push(-b, y, z, b, y, z);
    uv.push(z / 5.0, -b / 5.0, z / 5.0, b / 5.0);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------------ 沿曲线放样带子 */

const UVM = 1 / 2.5;   // 每米对应的 UV，和 materials.js 的 TILE 对齐

/**
 * 沿一条 z 曲线放样一条连续的带子。
 *
 * 舷墙本来是一串互相重叠 5% 的直箱子，沿着不断收窄的 halfBeam 曲线排。
 * 直箱子跟不了曲线：重叠段的上表面互相穿插，从接近平行的角度看过去
 * （站在艏楼往船尾看最明显），黑船体与天空的交界处就成了一条闪烁的锯齿线。
 * 放样把它换成一张连续的面：一个 Mesh、零重叠，顶沿是一条干净的线。
 *
 *   path    沿程的点 {x, z, nx, nz}，nx/nz 是 xz 平面里的单位外法线
 *   section 截面折线 {u, v}：u 沿外法线偏移，v 是离基准面 y0 的高度。
 *           点序要让每条边的「外侧」落在 (-dv, du) 那一侧。
 *
 * 绕序不手写。左右两舷的绕序天生相反，手推两套 index 正是「一侧发黑」的
 * 来源；这里每个四边形拿自己该朝的方向比一次法线，两舷都不会翻过去。
 */
function loftRibbon(path, section, y0, mat, opts = {}) {
  const { closedSection = false, capEnds = true } = opts;
  const N = path.length, S = section.length;
  if (N < 2 || S < 2) return null;

  const pos = [], uv = [], idx = [];

  // 沿程弧长，用来铺 UV：按米算，接缝才不会随分段数变宽窄
  const arc = [0];
  for (let i = 1; i < N; i++) {
    arc.push(arc[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  }

  const emit = (p, s) => pos.push(p.x + s.u * p.nx, y0 + s.v, p.z + s.u * p.nz);
  const at = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const cross = (a, b, c) => {
    const A = at(a), B = at(b), C = at(c);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    return [e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0]];
  };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  const edges = [];
  for (let k = 0; k + 1 < S; k++) edges.push([section[k], section[k + 1]]);
  if (closedSection) edges.push([section[S - 1], section[0]]);

  let vAcc = 0;
  for (const [sa, sb] of edges) {
    const du = sb.u - sa.u, dv = sb.v - sa.v;
    const segLen = Math.hypot(du, dv) || 1e-3;
    // 每条面带各自一套顶点：computeVertexNormals 只沿 z 平滑，
    // 截面上的棱保持锋利。共用顶点的话顶沿会被磨成一道糊边。
    const base = pos.length / 3;
    for (let i = 0; i < N; i++) {
      emit(path[i], sa); uv.push(arc[i] * UVM, vAcc * UVM);
      emit(path[i], sb); uv.push(arc[i] * UVM, (vAcc + segLen) * UVM);
    }
    for (let i = 0; i < N - 1; i++) {
      const p = path[i];
      const want = [-dv * p.nx, du, -dv * p.nz];
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      if (dot(cross(a, b, d), want) >= 0) idx.push(a, b, d, a, d, c);
      else idx.push(a, d, b, a, c, d);
    }
    vAcc += segLen;
  }

  // 两端封口：0.14 m 的板厚，贴着看还是能看穿的
  if (capEnds) {
    for (const end of [0, N - 1]) {
      const p = path[end], q = path[end === 0 ? 1 : N - 2];
      const want = [p.x - q.x, 0, p.z - q.z];
      const base = pos.length / 3;
      for (const s of section) { emit(p, s); uv.push(s.u * UVM, s.v * UVM); }
      for (let k = 1; k + 1 < S; k++) {
        const a = base, b = base + k, c = base + k + 1;
        if (dot(cross(a, b, c), want) >= 0) idx.push(a, b, c);
        else idx.push(a, c, b);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/**
 * 沿甲板边缘取一串点，顺带把 xz 平面里的外法线算出来。
 * 法线用中心差分从切线推：艏部最后十几米收得很快，
 * 那里如果只往 +x 方向偏移，帽条会斜着挂在墙外。
 */
function edgePath(z0, z1, segs, side, inset = 0, minB = 0.25) {
  const b = (z) => Math.max(minB, halfBeam(z) - inset);
  const path = [];
  for (let i = 0; i <= segs; i++) {
    const z = z0 + ((z1 - z0) * i) / segs;
    const bp = (b(z + 0.05) - b(z - 0.05)) / 0.1;
    const L = Math.hypot(1, bp);
    path.push({ x: side * b(z), z, nx: side / L, nz: -bp / L });
  }
  return path;
}

/**
 * 给一串只有 {x, z} 的点补上 xz 平面里的外法线。
 *
 * 兜过艏柱的那条路径左右两舷是连在一起的，side 这个概念在合拢处失效：
 * 法线只能从切线推，再拿一个「船内参考点」定朝向——
 * 朝错的那一段会整片背光发黑，而不是简单地缺一块。
 */
function withNormals(pts, refZ) {
  const N = pts.length;
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(N - 1, i + 1)];
    const dx = c.x - a.x, dz = c.z - a.z;
    const L = Math.hypot(dx, dz) || 1e-4;
    let nx = dz / L, nz = -dx / L;
    if (nx * p.x + nz * (p.z - refZ) < 0) { nx = -nx; nz = -nz; }
    return { x: p.x, z: p.z, nx, nz };
  });
}

/**
 * 绕过艏柱合拢的一条连续路径：左舷 → 艏柱 → 右舷。
 *
 * 舷墙原来停在离艏柱一米半的地方，艏楼最前端是个六米宽的敞口。
 * 真船的舷墙一路兜到艏柱才收——站在船头最前面，身前那道墙就是它。
 *
 * 取样点要往艏柱挤。艏柱附近 halfBeam ∝ Δz^0.55，所以 Δz 按 u^(1/0.55) 展开，
 * 每一步的半宽增量才相等；均匀取 z 的话最后半米只摊到两三个点，
 * 那半米恰恰是艏柱的全部形状，会被切成一个平头。
 * 一条路径走完两舷：合拢处不留接缝，绕序也不会在那里翻过去。
 */
function stemWrap(z0, inset, segs = 64, end = 0.05) {
  const { STEM_Z } = BOW;
  const span = STEM_Z - z0;
  const u0 = Math.pow(end / span, 0.55);          // 收到离艏柱 end 米处
  const zAt = (u) => STEM_Z - span * Math.pow(u, 1 / 0.55);
  const b = (z) => Math.max(0.12, halfBeam(z) - inset);
  const zs = [];
  for (let i = 0; i <= segs; i++) zs.push(zAt(u0 + ((1 - u0) * i) / segs));
  const pts = [];
  for (let i = segs; i >= 0; i--) pts.push({ x: -b(zs[i]), z: zs[i] });   // 左舷向艏
  for (let i = 0; i <= segs; i++) pts.push({ x: b(zs[i]), z: zs[i] });    // 右舷折回
  return withNormals(pts, z0 - 2);
}

/**
 * 舷墙的碰撞代理。
 *
 * 放样出来的舷墙是一张 0.14 m 厚的壳，而行走用的是射线。薄壳在掠射角下
 * 很容易漏检——人贴着边走就直接穿出去掉进海里，这是艏艉甲板上最严重的一个坑。
 * 所以沿同一条路径再排一串不可见的厚箱子专管挡人：
 * 每段两三米，拐弯处自动断开，跟着 halfBeam 的曲线走。
 * 箱子往外挪半个厚度，内侧面正好和舷墙内壁齐平，贴上去时看着就是靠在墙上。
 */
function railGuard(path, y, h, g, collide, step = 2.6) {
  const D = 0.40;                 // 代理厚度：射线打得准，不必指望薄壳
  const OFF = D / 2 - 0.07;       // 往外挪，内侧面和墙内壁对齐
  const H = h + 0.5;              // 齐膝(+0.55)与齐腰(+1.25)两条射线都要盖住
  let i0 = 0, acc = 0;
  for (let i = 1; i < path.length; i++) {
    acc += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    // 拐过二十度就断一段：艏柱附近曲率极大，长弦会直接把船头抹平
    const turned = path[i0].nx * path[i].nx + path[i0].nz * path[i].nz < 0.94;
    if (i < path.length - 1 && acc < step && !turned) continue;
    const a = path[i0], b = path[i];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 0.02) continue;       // 太短的先攒着，免得掉一段
    let nx = a.nx + b.nx, nz = a.nz + b.nz;
    const NL = Math.hypot(nx, nz) || 1;
    const w = box(L * 1.10, H, D, INVIS);
    w.position.set((a.x + b.x) / 2 + (nx / NL) * OFF, y + h / 2,
      (a.z + b.z) / 2 + (nz / NL) * OFF);
    w.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    g.add(w); collide.push(w);
    i0 = i; acc = 0;
  }
}

/** 一条路径上的舷墙：墙身 + 帽条 + 碰撞代理。 */
function bulwarkOn(path, y, h, mat, capMat, collide) {
  const g = new THREE.Group();
  const T = 0.07;                 // 板厚的一半
  const CW = 0.15, CH = 0.10;     // 帽条：半宽与厚
  // 墙身：内面、顶面、外面三条面带。底边压在甲板上，不必封。
  g.add(loftRibbon(path, [
    { u: -T, v: 0 }, { u: -T, v: h }, { u: T, v: h }, { u: T, v: 0 },
  ], y, mat));
  // 帽条：闭合截面，底面也有——从甲板上抬头能看见它挑出来的那一点
  g.add(loftRibbon(path, [
    { u: -CW, v: 0 }, { u: -CW, v: CH }, { u: CW, v: CH }, { u: CW, v: 0 },
  ], y + h, capMat, { closedSection: true }));
  railGuard(path, y, h, g, collide);
  return g;
}

/**
 * 舷墙：沿甲板边缘立起来的一道实心板，顶上压一根扶手。
 * 两侧各自放样，不用 scale.x = -1 镜像——那会把绕序一起翻过来。
 *
 * inset 是相对外板的内缩量。不给这个量的话，舷墙的中线就取在 halfBeam 上，
 * 和黑色外板同一个 x：外板直接从墙里穿过去，站在井甲板往两舷看
 * 看见的是黑船体，而不是本该看见的米色内壁。
 */
function bulwark(z0, z1, y, h, mat, capMat, segs = 48, inset = 0, collide = []) {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    g.add(bulwarkOn(edgePath(z0, z1, segs, side, inset), y, h, mat, capMat, collide));
  }
  return g;
}

export function buildBow() {
  const g = new THREE.Group();
  const collide = [];
  const equipment = (object, name, minHeight = .65) => {
    g.add(object); object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object);
    bounds.max.y = Math.max(bounds.max.y, bounds.min.y + minHeight);
    const size = bounds.getSize(new THREE.Vector3());
    const proxy = box(size.x, size.y, size.z, INVIS);
    proxy.position.copy(bounds.getCenter(new THREE.Vector3()));
    proxy.name = `BowEquipment:${name}`;
    g.add(proxy); collide.push(proxy);
    return object;
  };

  const SUPER = { plateH: 0.52, plateW: 0.82, inout: 0.004, wearAmt: 0.45, grime: 0.10, seam: 0.6 };
  const white = getMaterial('paintedSteel', { color: '#ebe5d6', ...SUPER });
  const trimM = getMaterial('paintedSteel', { color: '#d6d0c0', ...SUPER });
  // 甲板机械：常年海水，漆比舱壁旧得多
  const machine = getMaterial('paintedSteel', { color: '#3c4046', seed: 71, plateH: 0.9, plateW: 1.4, inout: 0.006, wearAmt: 1.3, grime: 0.4 });
  const black = getMaterial('paintedSteel', { color: '#15181d', seed: 11, inout: 0.016, grime: 0.25 });
  // 露天钢甲板：常年海水加防滑漆，粗糙度要压到接近 1，
  // 不然一整片会反成抛光不锈钢——这是钢制甲板最容易露馅的地方。
  const deckSteel = getMaterial('paintedSteel', {
    color: '#a8a296', seed: 83, plateH: 0.62, plateW: 1.6,
    inout: 0.008, wearAmt: 1.0, grime: 0.3, roughBase: 0.38,
  });
  const teak = getMaterial('teak', {});
  const wood = getMaterial('teak', { trim: true });
  const brass = getMaterial('brass', {});
  const glass = getMaterial('glass', {});
  const canvasM = getMaterial('canvas', { color: '#8d8674' });

  const { WELL_Y, FCSL_Y, FRONT_Z, WELL_Z1, STEM_Z } = BOW;

  /**
   * 舷墙相对外板的内缩量。
   *
   * 黑色外板就画在 x = ±halfBeam(z) 上，而舷墙原来也拿 halfBeam 当中线——
   * 两者同一个 x，外板整片从墙里穿过去。站在井甲板往两舷看，
   * 本该是一道米色的内壁，看见的却是黑船体。退进来一点，两件东西就分开了。
   */
  const BW_IN = 0.18;

  /* ------------------------------------------- 上层建筑前壁 */

  /**
   * 舰桥底下这面墙，从艇甲板一路掉到井甲板，是全船落差最大的一处。
   * 站在井甲板上抬头看它，才知道上层建筑有多高。
   */
  const FH = 0 - WELL_Y;                     // 8.5 m
  /**
   * C75-R2：右舷开一扇门，接 `bow-access.js` 里从 C 层横厅来的工程暂定通道。
   * 净宽 x 7.90…9.30、净高 y −8.5…−6.3（前井甲板面起 2.2 m）。
   * 可见板（27.6 × 8.5 × 0.5）和下面那块不可见碰撞墙（28 × 10 × 0.8）
   * 必须按同一个门洞一起切——只切可见板等于画一扇走不过去的门。
   * 其余墙面与两条窗带原样保留。位置为工程暂定，非历史定案。
   */
  const DOOR = { x0: 7.90, x1: 9.30, top: WELL_Y + 2.2 };
  const frontWall = (halfW, y0, y1, dz, mat) => {
    const parts = [
      [-halfW, DOOR.x0, y0, y1],             // 左舷至门左框
      [DOOR.x1, halfW, y0, y1],              // 门右框至右舷
      [DOOR.x0, DOOR.x1, DOOR.top, y1],      // 门楣以上
    ];
    return parts.map(([xa, xb, ya, yb]) => {
      const m = box(xb - xa, yb - ya, dz, mat);
      m.position.set((xa + xb) / 2, (ya + yb) / 2, FRONT_Z);
      return m;
    });
  };
  for (const m of frontWall(13.8, WELL_Y, 0, 0.5, white)) {
    m.castShadow = true; m.receiveShadow = true; g.add(m);
  }
  // 门套：立框与横楣都在净空之外；井甲板一面整套，通道一面横楣让开通道天花（−6.25）
  for (const [zc, top] of [[FRONT_Z + 0.29, 0.12], [FRONT_Z - 0.29, 0.05]]) {
    for (const xc of [DOOR.x0 - 0.06, DOOR.x1 + 0.06]) {
      g.add(put(box(0.12, 2.2 + top, 0.08, trimM), xc, WELL_Y + (2.2 + top) / 2, zc));
    }
    g.add(put(box(DOOR.x1 - DOOR.x0 + 0.24, top, 0.08, trimM),
      (DOOR.x0 + DOOR.x1) / 2, DOOR.top + top / 2, zc));
  }
  // A 甲板与 B 甲板的封闭散步长廊：两条横向的窗带
  for (const y of [-2.2, -5.1]) {
    g.add(put(box(27.6, 0.45, 0.7, trimM), 0, y + 0.9, FRONT_Z - 0.12));
    for (let x = -12.4; x <= 12.4; x += 2.1) {
      g.add(put(box(1.45, 1.25, 0.12, trimM), x, y, FRONT_Z - 0.30));
      g.add(put(box(1.28, 1.08, 0.04, glass), x, y, FRONT_Z - 0.38));
    }
  }
  // 艇甲板边缘的挑檐
  g.add(put(box(28.4, 0.3, 1.0, trimM), 0, -0.15, FRONT_Z - 0.3));
  // 不可见碰撞墙与可见板同一个门洞分段（原 28 × 10 × 0.8，y −8.5…1.5）
  for (const w of frontWall(14, WELL_Y, WELL_Y + 10, 0.8, INVIS)) {
    w.name = 'BowFrontWallCollider';
    g.add(w); collide.push(w);
  }

  /* --------------------------------------------- 前井甲板 */

  const wellDeck = taperedDeck(FRONT_Z, WELL_Z1, WELL_Y, teak, 22);
  g.add(wellDeck); collide.push(wellDeck);
  g.add(bulwark(FRONT_Z, WELL_Z1, WELL_Y, 1.15, white, wood, 40, BW_IN, collide));

  /**
   * 两个货舱口。
   *
   * 井甲板上最占地方的东西：一圈钢质围板（coaming），上面盖木舱盖，
   * 再蒙一层帆布用压条压住边。泰坦尼克的二号、三号舱口都在这里。
   */
  const hatch = (z, w, d) => {
    const h = new THREE.Group();
    for (const s of [-1, 1]) {
      h.add(put(box(0.16, 0.78, d, machine), s * w / 2, 0.39, 0));
      h.add(put(box(w, 0.78, 0.16, machine), 0, 0.39, s * d / 2));
      h.add(put(box(0.30, 0.10, d + 0.3, wood), s * w / 2, 0.83, 0));
    }
    h.add(put(box(w - 0.2, 0.14, d - 0.2, canvasM), 0, 0.85, 0));
    // 压条
    for (let i = -2; i <= 2; i++) {
      h.add(put(box(0.10, 0.06, d + 0.2, machine), (i * w) / 6, 0.93, 0));
    }
    h.position.set(0, WELL_Y, z);
    return h;
  };
  g.add(hatch(FRONT_Z + 7.5, 7.4, 6.2));
  g.add(hatch(FRONT_Z + 18.0, 6.6, 5.6));
  for (const z of [FRONT_Z + 7.5, FRONT_Z + 18.0]) {
    const w = box(7.6, 1.1, 6.4, INVIS);
    w.position.set(0, WELL_Y + 0.55, z); g.add(w); collide.push(w);
  }

  /**
   * 吊杆柱与吊杆。井甲板两侧各一对，装卸货用。
   * 吊杆是斜着搁在柱上的，不是竖着——这个姿态一错就不像在用的船。
   */
  const derrick = (x, z, dir) => {
    const d = new THREE.Group();
    d.add(put(cyl(0.30, 0.42, 9.2, 14, white), 0, 4.6, 0));
    d.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 20), trimM), 0, 6.4, 0));
    d.add(put(cyl(0.46, 0.52, 0.5, 14, trimM), 0, 9.2, 0));
    for (let y = 1.0; y < 8.6; y += 0.42) {   // 爬梯
      d.add(put(cyl(0.02, 0.02, 0.4, 6, trimM).rotateZ(Math.PI / 2), 0.36, y, 0));
    }
    /**
     * 吊杆。铰点在柱脚附近，杆梢斜指向舱口上方——
     * 第一版把铰点放在柱身中段，杆看上去是飘在空中的两根斜棍，
     * 完全读不出它和柱子的关系。
     */
    const LB = 10.5, tilt = 0.72;
    const boom = cyl(0.11, 0.16, LB, 10, trimM);
    boom.rotation.x = dir * tilt;
    d.add(put(boom, 0,
      1.3 + Math.cos(tilt) * LB / 2,
      dir * Math.sin(tilt) * LB / 2));
    // 吊杆梢的滑车与垂下的吊索
    const tipY = 1.3 + Math.cos(tilt) * LB;
    const tipZ = dir * Math.sin(tilt) * LB;
    d.add(put(cyl(0.10, 0.10, 0.08, 10, machine).rotateZ(Math.PI / 2), 0, tipY - 0.18, tipZ));
    d.add(put(cyl(0.013, 0.013, tipY - 1.6, 6, getMaterial('rope', {})),
      0, (tipY - 0.2 + 1.4) / 2, tipZ));
    // 从杆梢拉回柱顶的稳索
    const topy = 8.6;
    const a = new THREE.Vector3(0, tipY - 0.3, tipZ), b = new THREE.Vector3(0, topy, 0);
    const st = cyl(0.018, 0.018, a.distanceTo(b), 6, getMaterial('rope', {}));
    st.position.copy(a).lerp(b, 0.5);
    st.lookAt(b); st.rotateX(Math.PI / 2);
    d.add(st);
    d.position.set(x, WELL_Y, z);
    return d;
  };
  for (const s of [-1, 1]) {
    g.add(derrick(s * 5.4, FRONT_Z + 3.0, 1));
    g.add(derrick(s * 5.4, FRONT_Z + 22.5, -1));
    for (const z of [FRONT_Z + 3.0, FRONT_Z + 22.5]) {
      const p = put(cyl(.44, .44, 9.2, 12, INVIS), s * 5.4, WELL_Y + 4.6, z);
      p.name = `BowEquipment:derrick-${s}-${z}`; g.add(p); collide.push(p);
    }
  }

  // The accepted access component gives both stair feet a clear approach.
  const access = buildBowAccess({ white, trim: trimM, machine }, INVIS);
  g.add(access); collide.push(...access.userData.collide);

  /* --------------------------------------------- 艏楼甲板 */

  const fcslDeck = taperedDeck(WELL_Z1, STEM_Z, FCSL_Y, deckSteel, 30);
  g.add(fcslDeck); collide.push(fcslDeck);
  // 艏楼这一段收得最快，也是最容易看出锯齿的一段：分段给足。
  // 一路兜过艏柱合拢——原来停在 STEM_Z − 1.5，船头最前端是个六米宽的敞口。
  g.add(bulwarkOn(stemWrap(WELL_Z1, BW_IN, 64), FCSL_Y, 1.08, white, wood, collide));
  /**
   * 锚机。艏楼上最大的一件机器，两台并列，各带一个链轮。
   * 链条从链轮往前经过导缆孔垂下去——那两条链是艏部的重心所在。
   */
  const windlass = (x) => {
    const w = new THREE.Group();
    w.add(put(box(3.4, 1.05, 2.4, machine), 0, 0.52, 0));
    w.add(put(cyl(0.85, 0.85, 0.62, 9, machine).rotateZ(Math.PI / 2), 0, 1.28, 0));   // 链轮
    for (let i = 0; i < 9; i++) {   // 链窝
      const a = (i / 9) * Math.PI * 2;
      w.add(put(box(0.22, 0.22, 0.7, machine), Math.cos(a) * 0.78, 1.28 + Math.sin(a) * 0.78, 0));
    }
    for (const sz of [-1.5, 1.5]) {
      w.add(put(cyl(0.52, 0.52, 0.75, 14, machine), 0, 1.15, sz));                    // 绞盘头
      w.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.06, 8, 20), machine), 0, 1.50, sz));
    }
    w.add(put(cyl(0.10, 0.10, 1.1, 8, trimM), 1.4, 1.6, 0));                          // 操纵杆
    w.position.set(x, FCSL_Y, WELL_Z1 + 6.5);
    return w;
  };
  g.add(windlass(-4.0)); g.add(windlass(4.0));
  for (const x of [-4.0, 4.0]) {
    const w = box(3.6, 2.2, 2.6, INVIS);
    w.position.set(x, FCSL_Y + 1.1, WELL_Z1 + 6.5); g.add(w); collide.push(w);
  }

  /** 锚链：一节一节的环，斜着从链轮拉到导缆孔。 */
  const chainLink = (x0, z0, x1, z1, y) => {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 6, 12), machine);
      link.rotation.x = Math.PI / 2;
      link.rotation.y = i % 2 ? Math.PI / 2 : 0;
      g.add(put(link, x0 + (x1 - x0) * t, y + 0.04, z0 + (z1 - z0) * t));
    }
  };
  chainLink(-4.0, WELL_Z1 + 7.6, -3.1, STEM_Z - 7.0, FCSL_Y);
  chainLink(4.0, WELL_Z1 + 7.6, 3.1, STEM_Z - 7.0, FCSL_Y);

  // 系缆桩与导缆器
  for (const s of [-1, 1]) {
    for (const z of [WELL_Z1 + 2.5, WELL_Z1 + 12.0, STEM_Z - 9.0]) {
      const b = new THREE.Group();
      b.add(put(box(1.0, 0.18, 0.6, machine), 0, 0.09, 0));
      for (const sx of [-0.3, 0.3]) {
        b.add(put(cyl(0.135, 0.155, 0.78, 12, machine), sx, 0.48, 0));
        b.add(put(cyl(0.175, 0.175, 0.07, 12, machine), sx, 0.88, 0));
      }
      b.position.set(s * (halfBeam(z) - 1.5), FCSL_Y, z);
      equipment(b, `bollard-${s}-${z}`);
    }
  }

  /* --------------------------------- 艏楼甲板上的杂件 */

  /**
   * 锚机的操纵台。
   *
   * 两台锚机之间总得有个站人的地方——链轮转起来的时候，
   * 甲板长就站在这儿盯着链条出舱口。台面是斜的，上面几根长杆
   * 分别管链轮离合、刹车和绞盘头。
   */
  {
    const cz = WELL_Z1 + 6.5;
    const st = new THREE.Group();
    st.add(put(box(1.70, 0.12, 1.30, machine), 0, 0.06, 0));          // 垫座
    st.add(put(box(1.15, 0.95, 0.78, machine), 0, 0.59, 0));          // 柜体
    const panel = box(1.18, 0.09, 0.86, machine);
    panel.rotation.x = -0.46;                     // 面板朝船尾倾：人是从井甲板那边上来的
    st.add(put(panel, 0, 1.10, -0.10));
    // 三根操纵杆，长短不一才像用出来的；一律往操作者那侧倒
    const levers = [[-0.36, 0.95, 0.30], [0, 1.05, 0.16], [0.36, 0.88, 0.42]];
    for (const [lx, lh, tilt] of levers) {
      const bar = cyl(0.028, 0.038, lh, 8, trimM);
      bar.rotation.x = -tilt;                     // +Y 轴转到 (0, cos, −sin)：杆头指向 −z
      st.add(put(bar, lx, 1.16 + (Math.cos(tilt) * lh) / 2, -0.14 - (Math.sin(tilt) * lh) / 2));
      st.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), brass),
        lx, 1.16 + Math.cos(tilt) * lh, -0.14 - Math.sin(tilt) * lh));
    }
    // 侧面的手轮：刹车
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.028, 8, 20), trimM);
    rim.rotation.y = Math.PI / 2;
    st.add(put(rim, 0.63, 0.72, 0.05));
    st.add(put(cyl(0.045, 0.045, 0.20, 8, machine).rotateZ(Math.PI / 2), 0.60, 0.72, 0.05));
    st.position.set(0, FCSL_Y, cz);
    g.add(st);
    const w = box(1.8, 1.5, 1.4, INVIS);
    w.position.set(0, FCSL_Y + 0.75, cz); g.add(w); collide.push(w);
  }

  /**
   * 通风口。
   *
   * 艏楼下面是水手舱和链舱，都要出气。露天甲板上用的是矮蘑菇头——
   * 高的通风筒在这儿会被越过艏楼的浪直接掀掉。
   */
  const mushroom = (x, z, r, h) => {
    const v = new THREE.Group();
    v.add(put(cyl(r * 0.58, r * 0.64, h, 14, machine), 0, h / 2, 0));
    v.add(put(new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 0.045, 8, 18), machine), 0, h - 0.10, 0));
    v.add(put(cyl(r * 0.86, r, 0.28, 16, machine), 0, h + 0.10, 0));        // 伞盖
    v.position.set(x, FCSL_Y, z);
    return v;
  };
  for (const s of [-1, 1]) {
    equipment(mushroom(s * 6.5, WELL_Z1 + 4.0, 0.52, 0.85), `mushroom-a-${s}`);
    equipment(mushroom(s * 7.0, WELL_Z1 + 14.0, 0.46, 0.74), `mushroom-b-${s}`);
  }

  /**
   * 通风筒。口朝船尾——迎着艏部来的浪张着嘴，一个大浪就能把筒灌满。
   * dir 是筒口朝的那一侧（−1 朝船尾）。
   */
  const cowl = (x, z, r, h, dir, ry) => {
    const v = new THREE.Group();
    const A = 0.95, ax = dir * A;   // 绕 X 转 ax，+Y 轴落到 (0, cosA, dir·sinA)
    const ca = Math.cos(A), sa = dir * Math.sin(A);
    v.add(put(cyl(r * 0.54, r * 0.62, h, 14, machine), 0, h / 2, 0));
    const neck = cyl(r * 0.62, r * 0.54, 0.82, 14, machine);
    neck.rotation.x = ax;
    v.add(put(neck, 0, h + ca * 0.38, sa * 0.38));
    const mouth = cyl(r, r * 0.62, 0.52, 16, machine, true);
    mouth.rotation.x = ax;
    v.add(put(mouth, 0, h + ca * 1.00, sa * 1.00));
    // 筒口内壁的红：真船的通风筒里头都是红的，这是艏楼上唯一的一点暖色
    const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 16),
      getMaterial('paintedSteel', { color: '#7a3128', seed: 9, grime: 0.3 }));
    inner.rotation.x = ax - Math.PI / 2;   // 圆盘法线默认 +Z，转到和筒口同向
    v.add(put(inner, 0, h + ca * 0.95, sa * 0.95));   // 塞进喇叭口里一点，别从筒壁捅出去
    v.position.set(x, FCSL_Y, z);
    if (ry) v.rotation.y = ry;
    return v;
  };
  for (const s of [-1, 1]) equipment(cowl(s * 5.6, WELL_Z1 + 17.5, 0.38, 1.55, -1, s * 0.2), `cowl-${s}`);

  /**
   * 缆绳盘。
   *
   * 系缆桩边上总盘着几卷缆。盘缆是从外往里一圈圈码上去的，
   * 所以是个中间略高、边缘一圈圈落下去的堆——不是一个整齐的圆环。
   */
  const ropeM = getMaterial('rope', {});
  const coil = (x, z, r0, ry) => {
    const c = new THREE.Group();
    const rings = [
      [r0, 0.055], [r0 - 0.17, 0.055], [r0 - 0.34, 0.055],
      [r0 - 0.09, 0.165], [r0 - 0.26, 0.165],
      [r0 - 0.18, 0.275],
    ];
    for (const [rr, yy] of rings) {
      if (rr < 0.12) continue;
      const t = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.056, 7, 22), ropeM);
      t.rotation.x = Math.PI / 2;
      c.add(put(t, 0, yy, 0));
    }
    c.position.set(x, FCSL_Y, z);
    if (ry) c.rotation.y = ry;
    return c;
  };
  equipment(coil(0, WELL_Z1 + 13.5, 0.84, 0.3), 'coil-centre');
  equipment(coil(-6.9, WELL_Z1 + 8.4, 0.72, -0.5), 'coil-port');
  equipment(coil(6.9, WELL_Z1 + 8.4, 0.76, 0.9), 'coil-starboard');

  /* ------------------------------------------------- 前桅 */

  /**
   * 前桅与瞭望台。
   *
   * 弗雷德里克·弗利特就是在这个桶里喊出那句「正前方有冰山」的。
   * 桅杆从艏楼甲板起，顶端高出艇甲板二十多米；瞭望台在大约三分之二处，
   * 台里有电话——那根电话线是从台底沿桅杆一路拉下来的。
   */
  const mastZ = WELL_Z1 + 1.6;
  const MAST_H = 33.0;
  g.add(put(cyl(0.28, 0.52, MAST_H, 16, trimM), 0, FCSL_Y + MAST_H / 2, mastZ));
  equipment(put(cyl(0.60, 0.72, 1.0, 16, trimM), 0, FCSL_Y + 0.5, mastZ), 'mast-base');      // 桅座
  // 桅上的爬梯
  for (let y = 1.2; y < 18.5; y += 0.42) {
    g.add(put(cyl(0.018, 0.018, 0.42, 6, trimM).rotateZ(Math.PI / 2),
      0, FCSL_Y + y, mastZ + 0.40));
  }
  // 瞭望台
  const nestY = FCSL_Y + 18.8;
  const nest = new THREE.Group();
  nest.add(put(cyl(1.16, 0.98, 1.30, 22, trimM, true), 0, 0.65, 0));
  nest.add(put(new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.05, 8, 26), trimM), 0, 1.30, 0));
  nest.add(put(new THREE.Mesh(new THREE.CircleGeometry(1.14, 22), trimM)
    .rotateX(-Math.PI / 2), 0, 0.02, 0));
  for (let i = 0; i < 6; i++) {   // 托架
    const a = (i / 6) * Math.PI * 2;
    const br = cyl(0.05, 0.05, 1.3, 6, trimM);
    br.rotation.set(0.75, -a, 0);
    nest.add(put(br, Math.cos(a) * 0.62, -0.42, Math.sin(a) * 0.62));
  }
  nest.position.set(0, nestY, mastZ);
  g.add(nest);
  // 桅顶灯与旗绳
  g.add(put(cyl(0.09, 0.12, 0.44, 10, brass), 0, FCSL_Y + MAST_H - 2.6, mastZ));
  g.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), glass), 0, FCSL_Y + MAST_H - 2.3, mastZ));
  g.add(put(cyl(0.07, 0.09, 2.4, 8, trimM), 0, FCSL_Y + MAST_H + 1.0, mastZ));

  // 前支索与两根侧支索：桅杆没有拉索会显得是插上去的
  const rope = getMaterial('rope', { color: '#6f6a5c' });
  const stay = (x0, y0, z0, x1, y1, z1, r = 0.035) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
    const c = cyl(r, r, a.distanceTo(b), 6, rope);
    c.position.copy(a).lerp(b, 0.5);
    c.lookAt(b); c.rotateX(Math.PI / 2);
    g.add(c);
  };
  stay(0, FCSL_Y + MAST_H - 3.5, mastZ, 0, FCSL_Y + 1.2, STEM_Z - 3.0);
  for (const s of [-1, 1]) {
    stay(0, FCSL_Y + MAST_H - 5.0, mastZ, s * 11.0, FCSL_Y + 0.9, WELL_Z1 + 9.0);
    stay(0, nestY - 0.6, mastZ, s * 10.0, FCSL_Y + 0.9, WELL_Z1 + 3.5, 0.028);
    stay(0, FCSL_Y + MAST_H - 6.5, mastZ, s * 9.0, -0.2, 86.0, 0.030);
  }

  /* -------------------------------------------- 艏柱与艏尖 */

  // 船壳由 src/ship/hull.js 统一装配；本模块仅保留艏部甲板与设备。

  // 导缆孔与吊在外面的锚
  for (const s of [-1, 1]) {
    const hz = STEM_Z - 7.5;
    g.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 10, 20), machine),
      s * (halfBeam(hz) - 0.1), FCSL_Y - 1.6, hz, s * Math.PI / 2));
    const anchor = new THREE.Group();
    anchor.add(put(box(0.5, 3.2, 0.5, machine), 0, 0, 0));
    anchor.add(put(box(2.9, 0.42, 0.45, machine), 0, -1.3, 0));
    for (const sx of [-1, 1]) {
      const fl = box(1.0, 0.9, 0.22, machine);
      fl.rotation.z = sx * 0.5;
      anchor.add(put(fl, sx * 1.35, -0.95, 0));
    }
    anchor.position.set(s * (halfBeam(hz) + 0.35), FCSL_Y - 3.3, hz);
    anchor.rotation.y = s * Math.PI / 2;
    g.add(anchor);
  }

  // 艏旗杆：船头最前面那根，Jack & Rose 站的地方就在它脚下
  g.add(put(cyl(0.05, 0.09, 4.2, 10, trimM), 0, FCSL_Y + 2.1, STEM_Z - 0.9));
  g.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), brass), 0, FCSL_Y + 4.3, STEM_Z - 0.9));

  g.userData.collide = collide;
  return g;
}
