import * as THREE from 'three';
import { getMaterial, uvBox, uvCyl } from './materials.js';
import { buildSternAccess } from './stern-access.js';

/**
 * 艉部：后井甲板、艉楼甲板、主桅与巡洋舰艉。
 *
 * 和艏部对称的另一个缺口——站在艇甲板尾端往后看，原来是甲板一刀切断，
 * 后面直接是海。而真船的艉部有它自己的一套东西：
 *   · 后井甲板：三等舱的活动空间，两个货舱口，两对吊杆柱
 *   · 艉楼甲板：靠泊用的绞盘、系缆桩，以及那根旗杆
 *   · 靠泊桥（docking bridge）：艉楼前缘的一座小台，倒车靠泊时船副站的地方
 *   · 巡洋舰艉：向后兜出去的圆弧，这是奥林匹克级最好认的一个轮廓
 *
 * 坐标沿用艇甲板：艇甲板面 y=0，船头 +z（所以艉部全在负 z）。
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

export const STERN = {
  WELL_Y: -8.5,        // 后井甲板
  POOP_Y: -5.9,        // 艉楼甲板
  BACK_Z: -47.0,       // 上层建筑后壁
  POOP_Z: -72.0,       // 艉楼前缘
  TAIL_Z: -96.0,       // 艉端
};

/** C76 候选：上层建筑后壁中线门（作者坐标，工程暂定，非历史门位认证）。 */
export const AFT_DOOR = Object.freeze({ x: 0, width: 1.4, height: 2.1, z: STERN.BACK_Z, status: 'engineering-provisional' });

/**
 * 艉部的半宽。
 *
 * 和艏部不一样：艉部不收成一个点，而是兜成一个圆弧再收——
 * 这就是巡洋舰艉。最后十几米的那条曲线是这条船的签名之一，
 * 收得太快会变成货船的方艉，收得太慢又成了游艇。
 */
function halfBeam(z) {
  const { BACK_Z, TAIL_Z } = STERN;
  const t = Math.max(0, Math.min(1, (z - BACK_Z) / (TAIL_Z - BACK_Z)));
  return 13.8 * Math.pow(1 - Math.pow(t, 3.1), 0.42) + 0.5 * (1 - t);
}

function taperedDeck(z0, z1, y, mat, segs = 28) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const z = z0 + ((z1 - z0) * i) / segs;
    const b = Math.max(0.3, halfBeam(z));
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
 * 舷墙本来是一串互相重叠 6% 的直箱子，沿着 halfBeam 曲线排。
 * 直箱子跟不了曲线：重叠段的上表面互相穿插，从接近平行的角度看过去
 * （从靠泊桥往艉、或者从艉楼往艏），黑船体与天空的交界处就成了
 * 一条闪烁的锯齿线。放样把它换成一张连续的面：
 * 一个 Mesh、零重叠，顶沿是一条干净的线。
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
 * 法线用中心差分从切线推：巡洋舰艉最后几米几乎是横着的，
 * 那里如果只往 ±x 偏移，帽条会斜着挂在墙外。
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
 * 兜过艉端的那条路径左右两舷是连在一起的，side 这个概念在合拢处失效：
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
 * 绕过艉端合拢的一条连续路径：左舷 → 艉端 → 右舷。
 *
 * 舷墙原来停在 TAIL_Z + 1.0，而半宽在那儿还有 4.3 m——艉端最后一米是个
 * 八米多宽的敞口，人走到艉端一脚就踏空。巡洋舰艉本来就是兜过去收拢的，
 * 舷墙也该跟着兜一圈。
 *
 * 取样点要往艉端挤。艉端附近 halfBeam ∝ Δz^0.42，所以 Δz 按 u^(1/0.42) 展开，
 * 每一步的半宽增量才相等；均匀取 z 的话最后一米只摊到三个点，
 * 那道圆弧会被切成一个平头——而那道圆弧正是这条船最好认的轮廓。
 * 一条路径走完两舷：合拢处不留接缝，绕序也不会在那里翻过去。
 */
function tailWrap(z0, inset, segs = 72, end = 0.012) {
  const { TAIL_Z } = STERN;
  const span = z0 - TAIL_Z;
  const u0 = Math.pow(end / span, 0.42);          // 收到离艉端 end 米处
  const zAt = (u) => TAIL_Z + span * Math.pow(u, 1 / 0.42);
  const b = (z) => Math.max(0.12, halfBeam(z) - inset);
  const zs = [];
  for (let i = 0; i <= segs; i++) zs.push(zAt(u0 + ((1 - u0) * i) / segs));
  const pts = [];
  for (let i = segs; i >= 0; i--) pts.push({ x: -b(zs[i]), z: zs[i] });   // 左舷向艉
  for (let i = 0; i <= segs; i++) pts.push({ x: b(zs[i]), z: zs[i] });    // 右舷折回
  return withNormals(pts, z0 + 2);
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
    // 拐过二十度就断一段：艉端曲率极大，长弦会直接把那道圆弧抹平
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
  g.add(loftRibbon(path, [
    { u: -T, v: 0 }, { u: -T, v: h }, { u: T, v: h }, { u: T, v: 0 },
  ], y, mat));
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

export function buildStern() {
  const g = new THREE.Group();
  const collide = [];
  const equipment = (object, name) => {
    g.add(object); object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object), size = bounds.getSize(new THREE.Vector3());
    const proxy = box(size.x, size.y, size.z, INVIS);
    proxy.position.copy(bounds.getCenter(new THREE.Vector3())); proxy.name = `SternEquipment:${name}`;
    g.add(proxy); collide.push(proxy); return object;
  };
  const post = (x, z, y, radius, height, name) => {
    const p = put(cyl(radius, radius, height, 12, INVIS), x, y + height / 2, z);
    p.name = `SternEquipment:${name}`; g.add(p); collide.push(p);
  };

  const SUPER = { plateH: 0.52, plateW: 0.82, inout: 0.004, wearAmt: 0.45, grime: 0.10, seam: 0.6 };
  const white = getMaterial('paintedSteel', { color: '#ebe5d6', ...SUPER });
  const trimM = getMaterial('paintedSteel', { color: '#d6d0c0', ...SUPER });
  const machine = getMaterial('paintedSteel', {
    color: '#3c4046', seed: 71, plateH: 0.9, plateW: 1.4, inout: 0.006, wearAmt: 1.3, grime: 0.4,
  });
  const black = getMaterial('paintedSteel', { color: '#15181d', seed: 11, inout: 0.016, grime: 0.25 });
  const deckSteel = getMaterial('paintedSteel', {
    color: '#9a948a', seed: 83, plateH: 0.62, plateW: 1.6,
    inout: 0.008, wearAmt: 1.0, grime: 0.3, roughBase: 0.38,
  });
  const teak = getMaterial('teak', {});
  const wood = getMaterial('teak', { trim: true });
  const brass = getMaterial('brass', {});
  const glass = getMaterial('glass', {});
  const canvasM = getMaterial('canvas', { color: '#8d8674' });
  const rope = getMaterial('rope', { color: '#6f6a5c' });

  const { WELL_Y, POOP_Y, BACK_Z, POOP_Z, TAIL_Z } = STERN;

  /**
   * 舷墙相对外板的内缩量。
   *
   * 黑色外板就画在 x = ±halfBeam(z) 上，而舷墙原来也拿 halfBeam 当中线——
   * 两者同一个 x，外板整片从墙里穿过去。站在井甲板往两舷看，
   * 本该是一道米色的内壁，看见的却是黑船体。退进来一点，两件东西就分开了。
   */
  const BW_IN = 0.18;

  /* --------------------------------------- 上层建筑后壁 */

  const BH = 0 - WELL_Y;
  /**
   * C76 候选：后壁中线开一道工程暂定门（净宽 1.4、净高 2.1），
   * 通往 C 层过渡门厅（interior/rooms/c-aft-boundaries.js）再到后部楼梯 C 层。
   * 墙体、碰撞代理都按门洞切段；门槛与井甲板面齐平，不开艉楼或靠泊桥。
   */
  const DOOR = AFT_DOOR, dL = DOOR.x - DOOR.width / 2, dR = DOOR.x + DOOR.width / 2, dTop = WELL_Y + DOOR.height;
  const wallPiece = (x0, x1, y0, y1, depth, mat, z = BACK_Z) =>
    put(box(x1 - x0, y1 - y0, depth, mat), (x0 + x1) / 2, (y0 + y1) / 2, z);
  g.add(wallPiece(-13.8, dL, WELL_Y, 0, 0.5, white), wallPiece(dR, 13.8, WELL_Y, 0, 0.5, white),
    wallPiece(dL, dR, dTop, 0, 0.5, white));
  {
    const sill = wallPiece(dL - .02, dR + .02, WELL_Y - .14, WELL_Y, 0.62, teak);
    sill.name = 'SternAftDoor:sill'; g.add(sill);
    const sillProxy = sill.clone(); sillProxy.material = INVIS; sillProxy.name = 'Collision:SternAftDoor:sill';
    g.add(sillProxy); collide.push(sillProxy);
    for (const s of [-1, 1]) {
      const jx = s > 0 ? dR : dL;
      g.add(wallPiece(Math.min(jx, jx + s * .12), Math.max(jx, jx + s * .12), WELL_Y, dTop + .12, 0.08, trimM, BACK_Z - .29));
    }
    g.add(wallPiece(dL - .12, dR + .12, dTop, dTop + .12, 0.08, trimM, BACK_Z - .29));
  }
  for (const y of [-2.2, -5.1]) {
    g.add(put(box(27.6, 0.45, 0.7, trimM), 0, y + 0.9, BACK_Z + 0.12));
    for (let x = -12.4; x <= 12.4; x += 2.1) {
      g.add(put(box(1.45, 1.25, 0.12, trimM), x, y, BACK_Z + 0.30));
      g.add(put(box(1.28, 1.08, 0.04, glass), x, y, BACK_Z + 0.38));
    }
  }
  g.add(put(box(28.4, 0.3, 1.0, trimM), 0, -0.15, BACK_Z + 0.3));
  {
    // Same 28 x 10 x 0.8 proxy as before, cut into three pieces around the doorway.
    for (const [x0, x1, y0] of [[-14, dL, WELL_Y], [dR, 14, WELL_Y], [dL, dR, dTop]]) {
      const w = wallPiece(x0, x1, y0, WELL_Y + 10, 0.8, INVIS);
      w.name = 'Collision:SternAftWall'; g.add(w); collide.push(w);
    }
  }

  /* ------------------------------------------- 后井甲板 */

  const wellDeck = taperedDeck(POOP_Z, BACK_Z, WELL_Y, teak, 22);
  g.add(wellDeck); collide.push(wellDeck);
  g.add(bulwark(POOP_Z, BACK_Z, WELL_Y, 1.15, white, wood, 40, BW_IN, collide));

  const hatch = (z, w, d) => {
    const h = new THREE.Group();
    for (const s of [-1, 1]) {
      h.add(put(box(0.16, 0.78, d, machine), (s * w) / 2, 0.39, 0));
      h.add(put(box(w, 0.78, 0.16, machine), 0, 0.39, (s * d) / 2));
      h.add(put(box(0.30, 0.10, d + 0.3, wood), (s * w) / 2, 0.83, 0));
    }
    h.add(put(box(w - 0.2, 0.14, d - 0.2, canvasM), 0, 0.85, 0));
    for (let i = -2; i <= 2; i++) h.add(put(box(0.10, 0.06, d + 0.2, machine), (i * w) / 6, 0.93, 0));
    h.position.set(0, WELL_Y, z);
    return h;
  };
  g.add(hatch(BACK_Z - 7.0, 6.8, 5.6));
  g.add(hatch(BACK_Z - 17.0, 6.0, 5.0));
  for (const z of [BACK_Z - 7.0, BACK_Z - 17.0]) {
    const w = box(7.0, 1.1, 5.8, INVIS);
    w.position.set(0, WELL_Y + 0.55, z); g.add(w); collide.push(w);
  }

  const derrick = (x, z, dir) => {
    const d = new THREE.Group();
    d.add(put(cyl(0.30, 0.42, 8.6, 14, white), 0, 4.3, 0));
    d.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 20), trimM), 0, 6.0, 0));
    d.add(put(cyl(0.46, 0.52, 0.5, 14, trimM), 0, 8.6, 0));
    for (let y = 1.0; y < 8.0; y += 0.42) {
      d.add(put(cyl(0.02, 0.02, 0.4, 6, trimM).rotateZ(Math.PI / 2), 0.36, y, 0));
    }
    const LB = 9.5, tilt = 0.72;
    const boom = cyl(0.11, 0.16, LB, 10, trimM);
    boom.rotation.x = dir * tilt;
    d.add(put(boom, 0, 1.3 + (Math.cos(tilt) * LB) / 2, (dir * Math.sin(tilt) * LB) / 2));
    const tipY = 1.3 + Math.cos(tilt) * LB, tipZ = dir * Math.sin(tilt) * LB;
    d.add(put(cyl(0.10, 0.10, 0.08, 10, machine).rotateZ(Math.PI / 2), 0, tipY - 0.18, tipZ));
    d.add(put(cyl(0.013, 0.013, tipY - 1.6, 6, rope), 0, (tipY - 0.2 + 1.4) / 2, tipZ));
    d.position.set(x, WELL_Y, z);
    return d;
  };
  for (const s of [-1, 1]) {
    g.add(derrick(s * 5.2, BACK_Z - 3.0, -1));
    g.add(derrick(s * 5.2, BACK_Z - 21.0, 1));
    for (const z of [BACK_Z - 3.0, BACK_Z - 21.0]) post(s * 5.2, z, WELL_Y, .44, 9, `derrick-${s}-${z}`);
  }

  /* --------------------------------------------- 主桅 */

  /**
   * 主桅。比前桅矮，也没有瞭望台——它主要是挂旗和拉天线用的。
   * 泰坦尼克的马可尼天线就架在前后两根桅之间，那几根线是
   * 「这条船能发无线电」这件事唯一看得见的证据。
   */
  const mastZ = BACK_Z - 23.5;
  const MAST_H = 27.0;
  g.add(put(cyl(0.26, 0.48, MAST_H, 16, trimM), 0, WELL_Y + MAST_H / 2, mastZ));
  g.add(put(cyl(0.58, 0.70, 1.0, 16, trimM), 0, WELL_Y + 0.5, mastZ));
  post(0, mastZ, WELL_Y, .70, 2, 'mast-base');
  for (let y = 1.2; y < 15.0; y += 0.42) {
    g.add(put(cyl(0.018, 0.018, 0.42, 6, trimM).rotateZ(Math.PI / 2), 0, WELL_Y + y, mastZ + 0.38));
  }
  // 横桁
  g.add(put(cyl(0.09, 0.11, 9.0, 10, trimM).rotateZ(Math.PI / 2), 0, WELL_Y + 16.5, mastZ));
  g.add(put(cyl(0.06, 0.08, 2.2, 8, trimM), 0, WELL_Y + MAST_H + 0.9, mastZ));

  const stay = (x0, y0, z0, x1, y1, z1, r = 0.032) => {
    const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
    const c = cyl(r, r, a.distanceTo(b), 6, rope);
    c.position.copy(a).lerp(b, 0.5);
    c.lookAt(b); c.rotateX(Math.PI / 2);
    g.add(c);
  };
  stay(0, WELL_Y + MAST_H - 3.0, mastZ, 0, POOP_Y + 1.0, POOP_Z - 9.0);
  for (const s of [-1, 1]) {
    stay(0, WELL_Y + MAST_H - 4.5, mastZ, s * 10.5, WELL_Y + 1.0, BACK_Z - 9.0);
    stay(0, WELL_Y + 16.5, mastZ, s * 4.5, WELL_Y + 16.5, mastZ);   // 横桁端的吊索
    stay(0, WELL_Y + MAST_H - 6.0, mastZ, s * 9.0, -0.4, BACK_Z + 1.0, 0.028);
  }
  // 马可尼天线：从主桅横桁一路拉向船头方向
  for (const dx of [-1.8, -0.6, 0.6, 1.8]) {
    stay(dx, WELL_Y + 16.4, mastZ, dx, 6.0, 40.0, 0.016);
  }

  /* ------------------------------------------- 艉楼甲板 */

  const STEP = POOP_Y - WELL_Y;
  // 艉楼甲板是三等舱的散步甲板，铺的是木不是钢——
  // 一整片深灰的钢板既不对，看上去也像一块没做完的占位面。
  const poopDeck = taperedDeck(TAIL_Z, POOP_Z, POOP_Y, teak, 30);
  g.add(poopDeck); collide.push(poopDeck);
  // 艉端那一段是圆弧，分段给足才不会把巡洋舰艉切成多边形。
  // 一路兜过艉端合拢——原来停在 TAIL_Z + 1.0，那儿半宽还有 4.3 m，
  // 艉端最后一米是敞的，人走过去一脚踏空。
  g.add(bulwarkOn(tailWrap(POOP_Z, BW_IN, 72), POOP_Y, 1.08, white, wood, collide));
  // Keep the lower bulkhead closed; only the upper stair mouths are opened.
  const frontWidth = 2 * (halfBeam(POOP_Z) - BW_IN);
  g.add(put(box(frontWidth, STEP, .3, white), 0, WELL_Y + STEP / 2, POOP_Z - .15));
  const frontProxy = put(box(frontWidth, STEP - .02, .3, INVIS), 0, WELL_Y + (STEP - .02) / 2, POOP_Z - .15);
  g.add(frontProxy); collide.push(frontProxy);
  const access = buildSternAccess({ white, trim: trimM, wood, teak }, INVIS);
  g.add(access); collide.push(...access.userData.collide);

  /**
   * 靠泊桥。
   *
   * 艉楼前缘一座架空的小台，上面一具车钟、一个舵轮、一副罗经。
   * 倒船进港的时候船副站在这儿，因为从舰桥上根本看不见船尾。
   */
  {
    const bz = POOP_Z - 3.2, by = POOP_Y + 2.6;
    // 六米宽就够站两三个人，十米宽的平台会把整个艉楼压住
    for (const sx of [-2.9, 0, 2.9]) {
      for (const dz of [-0.9, 0.9]) {
        g.add(put(cyl(0.075, 0.09, 2.6, 8, trimM), sx, POOP_Y + 1.3, bz + dz));
        post(sx, bz + dz, POOP_Y, .09, 2.6, `docking-bridge-${sx}-${dz}`);
      }
    }
    const plat = box(6.8, 0.14, 2.4, trimM);
    g.add(put(plat, 0, by, bz)); collide.push(plat);
    for (const s of [-1, 1]) {
      g.add(put(box(0.12, 1.00, 2.4, white), s * 3.4, by + 0.58, bz));
    }
    g.add(put(box(6.8, 1.00, 0.12, white), 0, by + 0.58, bz - 1.2));
    g.add(put(box(7.0, 0.08, 0.26, wood), 0, by + 1.12, bz - 1.2));
    // 车钟与小舵轮
    g.add(put(cyl(0.10, 0.16, 0.95, 12, brass), -1.1, by + 0.48, bz + 0.3));
    const head = cyl(0.24, 0.24, 0.14, 18, brass);
    head.rotation.x = Math.PI / 2;
    g.add(put(head, -1.1, by + 1.05, bz + 0.3));
    g.add(put(cyl(0.11, 0.15, 0.8, 12, wood), 1.1, by + 0.40, bz + 0.3));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 26), wood);
    g.add(put(rim, 1.1, by + 0.92, bz + 0.3));
    // 上台的梯子
    for (let i = 0; i < 8; i++) {
      g.add(put(cyl(0.018, 0.018, 0.42, 6, trimM).rotateZ(Math.PI / 2), 3.3, POOP_Y + 0.3 + i * 0.32, bz + 1.0));
    }
    const ladderGuard = put(box(.65, 2.6, .22, INVIS), 3.3, POOP_Y + 1.3, bz + 1.0);
    ladderGuard.name = 'SternEquipment:docking-ladder'; g.add(ladderGuard); collide.push(ladderGuard);
  }

  /* -------------------------------- 艉楼上的绞盘与系缆桩 */

  for (const s of [-1, 1]) {
    for (const z of [POOP_Z - 5.5, POOP_Z - 14.0, TAIL_Z + 7.0]) {
      const b = new THREE.Group();
      b.add(put(box(1.0, 0.18, 0.6, machine), 0, 0.09, 0));
      for (const sx of [-0.3, 0.3]) {
        b.add(put(cyl(0.135, 0.155, 0.78, 12, machine), sx, 0.48, 0));
        b.add(put(cyl(0.175, 0.175, 0.07, 12, machine), sx, 0.88, 0));
      }
      b.position.set(s * Math.max(1.2, halfBeam(z) - 1.5), POOP_Y, z);
      equipment(b, `bollard-${s}-${z}`);
    }
    /**
     * 绞缆机。
     *
     * 原来这儿只有一个光秃秃的绞盘头，像是从甲板里长出来的。
     * 真的绞缆机是一整套：一块垫在甲板上的底座、侧面一个齿轮箱，
     * 还有一根让人站着扳的操纵杆——靠泊的时候人就在这三样之间转。
     */
    const cap = new THREE.Group();
    cap.add(put(box(2.10, 0.10, 1.70, machine), 0, 0.05, 0));            // 底座
    cap.add(put(cyl(0.62, 0.74, 0.32, 16, machine), 0, 0.26, 0));
    cap.add(put(cyl(0.40, 0.52, 0.78, 16, machine), 0, 0.80, 0));
    cap.add(put(cyl(0.56, 0.56, 0.10, 16, machine), 0, 1.23, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      cap.add(put(box(0.07, 0.42, 0.07, machine), Math.cos(a) * 0.46, 0.82, Math.sin(a) * 0.46));
    }
    // 齿轮箱放在靠外舷那侧，人站在内侧操作
    cap.add(put(box(0.62, 0.54, 0.86, machine), s * 0.92, 0.37, 0));
    cap.add(put(cyl(0.17, 0.17, 0.30, 12, machine).rotateZ(Math.PI / 2), s * 0.92, 0.52, 0.36));
    // 操纵杆：往内舷倒，杆头一个铜球
    const lever = cyl(0.030, 0.042, 0.92, 8, trimM);
    lever.rotation.z = s * 0.34;
    cap.add(put(lever, -s * (0.86 + Math.sin(0.34) * 0.46), 0.52 + (Math.cos(0.34) * 0.92) / 2, 0.30));
    cap.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), brass),
      -s * (0.86 + Math.sin(0.34) * 0.92), 0.52 + Math.cos(0.34) * 0.92, 0.30));
    cap.add(put(box(0.26, 0.16, 0.26, machine), -s * 0.86, 0.44, 0.30));   // 杆座
    cap.position.set(s * 5.0, POOP_Y, POOP_Z - 9.5);
    equipment(cap, `capstan-${s}`);
  }

  /**
   * 通风筒。
   *
   * 艉楼下面是三等舱的舱房，通风全靠这两个筒。口朝船头，
   * 船走起来就自己灌风进去——这是所有客船通风筒都朝前的原因。
   */
  const cowl = (x, z, r, h, dir, ry) => {
    const v = new THREE.Group();
    const A = 0.95, ax = dir * A;   // 绕 X 转 ax，+Y 轴落到 (0, cosA, dir·sinA)
    const ca = Math.cos(A), sa = dir * Math.sin(A);
    v.add(put(cyl(r * 0.54, r * 0.62, h, 14, machine), 0, h / 2, 0));
    const neck = cyl(r * 0.62, r * 0.54, 0.82, 14, machine);
    neck.rotation.x = ax;
    v.add(put(neck, 0, h + ca * 0.38, sa * 0.38));
    const mouth = cyl(r, r * 0.62, 0.54, 16, machine, true);
    mouth.rotation.x = ax;
    v.add(put(mouth, 0, h + ca * 1.02, sa * 1.02));
    // 筒口内壁的红：艉楼上唯一的一点暖色
    const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 16),
      getMaterial('paintedSteel', { color: '#7a3128', seed: 9, grime: 0.3 }));
    inner.rotation.x = ax - Math.PI / 2;   // 圆盘法线默认 +Z，转到和筒口同向
    v.add(put(inner, 0, h + ca * 0.97, sa * 0.97));   // 塞进喇叭口里一点，别从筒壁捅出去
    v.position.set(x, POOP_Y, z);
    if (ry) v.rotation.y = ry;
    return v;
  };
  for (const s of [-1, 1]) equipment(cowl(s * 6.2, POOP_Z - 12.0, 0.40, 1.70, 1, s * 0.16), `cowl-${s}`);

  /**
   * 船名牌的位置。
   *
   * 艉端那一圈略微凸出的平板，船名和船籍港就漆在上面。
   * 这里只做板——字留给贴图，凸出来的那一圈影子本身就够说明问题了。
   * 板要跟着巡洋舰艉兜过去，所以照舷侧那套参数重算一条路径，
   * 而不是拿一块直板往上贴：直板在两侧会直接插进船体里。
   */
  {
    const nameY = POOP_Y - 1.55;                     // 甲板边缘下面一点五米
    const yBot = -27.0;
    // 舷侧在这个高度的收进量。舷侧是从【甲板面】才开始往里收的（见下面那段放样），
    // 所以要从 POOP_Y 起算；照原来那样从 POOP_Y + 1.1 起算会算多，
    // 整块船名牌会陷进船壳里去。
    const f = (POOP_Y - nameY) / (POOP_Y - yBot);
    const z0 = BACK_Z + 0.5, T0 = 0.895;
    const ref = { x: 0, z: TAIL_Z + 12 };            // 判断「朝外」用的船内参考点
    for (const side of [-1, 1]) {
      const segs = 40;
      const at = (t) => {
        const z = z0 + (TAIL_Z - z0) * t;
        return {
          x: side * halfBeam(z) * (1 - 0.52 * f),
          z: z + Math.pow(t, 2.4) * 11.0 * f,
        };
      };
      const path = [];
      for (let i = 0; i <= segs; i++) {
        // 采样往艉端挤：那里半宽掉得最快，均匀取点会把圆弧切成一个平头
        const t = T0 + (1 - T0) * (1 - Math.pow(1 - i / segs, 2.4));
        const p = at(t);
        const a = at(Math.max(0, t - 0.003)), c = at(Math.min(1, t + 0.003));
        const dx = c.x - a.x, dz = c.z - a.z;
        const L = Math.hypot(dx, dz) || 1e-4;
        let nx = dz / L, nz = -dx / L;
        if (nx * p.x + nz * (p.z - ref.z) < 0) { nx = -nx; nz = -nz; }
        path.push({ x: p.x, z: p.z, nx, nz });
      }
      g.add(loftRibbon(path, [
        { u: -0.02, v: 0 }, { u: -0.02, v: 0.70 },
        { u: 0.10, v: 0.70 }, { u: 0.10, v: 0 },
      ], nameY, black, { closedSection: true }));
    }
  }

  // 艉旗杆：白星旗就挂在这儿
  g.add(put(cyl(0.06, 0.11, 5.4, 10, trimM), 0, POOP_Y + 2.7, TAIL_Z + 1.6));
  post(0, TAIL_Z + 1.6, POOP_Y, .16, 2.2, 'flagstaff');
  g.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), brass), 0, POOP_Y + 5.5, TAIL_Z + 1.6));
  for (const s of [-1, 1]) {
    stay(0, POOP_Y + 5.2, TAIL_Z + 1.6, s * 3.0, POOP_Y + 0.6, TAIL_Z + 4.5, 0.018);
  }

  // 船壳由 src/ship/hull.js 统一装配；本模块仅保留艉部甲板与设备。

  g.userData.collide = collide;
  return g;
}
