/**
 * C64-R1 · 艏部露天甲板步行接入候选（艏楼 + 前井甲板）
 *
 * 唯一工程几何基线：DISPATCH-13 冻结 src/walk/bow.js
 *   sha256 85a4fe8b8e6ecb81a386e0c41e41feb5661365a8ec06ac2b52cee597a5798fae
 * 本模块不导入 bow.js（它依赖未冻结的 materials.js），而是按其常量、halfBeam 轮廓、
 * 舷墙放样与设备位置用基础材质重建，并补齐行走所需的碰撞、阶梯与接入口。
 *
 * 坐标：walk-authoring-v0（米，+Y 上，+Z 艏，+X 右舷），与 bow.js 相同，root 单位变换。
 * 不含船壳（船壳由主线 src/ship/hull.js 统一装配）。
 *
 * buildRegion(THREE) → THREE.Group
 *   root.userData.collide  实体碰撞 Object3D 数组（地板、阶梯、舷墙代理、围板、设备）
 *   root.userData.ports    接入口
 *   root.userData.routes   脚下坐标路线
 */

export const REGION_ID = 'C64-foredeck';

/** 与冻结 bow.js 的 BOW 常量逐项一致。 */
export const BOW = Object.freeze({
  WELL_Y: -8.5,     // 前井甲板（C 甲板）
  FCSL_Y: -5.9,     // 艏楼甲板
  FRONT_Z: 91.5,    // 上层建筑前壁
  WELL_Z1: 117.0,   // 井甲板前缘 / 艏楼落差
  STEM_Z: 146.0,    // 艏柱
});

/** bow.js 的舷墙内缩量。 */
export const BW_IN = 0.18;

/**
 * 候选阶梯（替换 bow.js 两舷直梯）。
 * 冻结版：9 级 0.29 m 踢面 / 0.28 m 踏面，自 z≈116.65 起向船尾升高，顶级在 z≈114.4，
 * 离艏楼甲板前缘 2.6 m 且与落差处 4.0 m 高碰撞墙相撞，Walker 无法通行。
 * 候选：同一 x=±9.6 位置，改为向艏升高并直接接上艏楼甲板；13 级 0.20 m / 0.30 m，净宽 1.2 m。
 */
export const STAIR = Object.freeze({
  xs: Object.freeze([-9.6, 9.6]),
  risers: 13,
  rise: 0.2,
  tread: 0.3,
  clearWidth: 1.2,
  guardX: 0.7,          // 护栏中心线相对梯中心
  footZ: 117.0 - 12 * 0.3,   // 113.4
});

/** 上层建筑前壁的两处门口（接入口）。 */
export const DOORS = Object.freeze({
  xs: Object.freeze([-8.6, 8.6]),
  clearWidth: 1.4,
  clearHeight: 2.2,
  wallZ0: 91.25, wallZ1: 91.75,      // 冻结 bow.js 前壁 0.5 m 厚，中心 z=91.5
  bufferZ0: 89.6,                    // 缓冲平台（门槛内侧）末端
  barrierZ: 89.9,                    // “未开放”边界
});

/** 船体在某个 z 上的半宽（逐字复制自冻结 bow.js）。 */
export function halfBeam(z) {
  const { FRONT_Z, STEM_Z } = BOW;
  const t = Math.max(0, Math.min(1, (z - FRONT_Z) / (STEM_Z - FRONT_Z)));
  return 13.8 * Math.pow(1 - Math.pow(t, 2.6), 0.55) + 0.35 * (1 - t);
}

/** 舷墙内壁（碰撞代理内侧面）到中线的距离。 */
export function innerBeam(z) {
  return Math.max(0.25, halfBeam(z) - BW_IN) - 0.07;
}

const { WELL_Y, FCSL_Y, FRONT_Z, WELL_Z1, STEM_Z } = BOW;

/* ------------------------------------------------------------ 路线与接口 */

const W = WELL_Y, F = FCSL_Y;

/** 出发—探索—返回：右舷门口 → 右舷井甲板 → 右舷梯上艏楼 → 艏端瞭望 → 左舷 → 左舷梯下井甲板 → 左舷门口 → 横穿回右舷门口。 */
const LOOP = [
  [8.6, W, 91.0],     // 00 右舷门口缓冲平台（起点）
  [8.6, W, 92.8],     // 01 出门
  [10.2, W, 96.0],    // 02 右舷吊杆柱外侧
  [10.0, W, 104.4],   // 03 两舱口之间的舷侧
  [9.6, W, 112.6],    // 04 右舷梯脚
  [9.6, F, 117.8],    // 05 右舷梯顶（艏楼）
  [9.2, F, 121.5],    // 06
  [9.0, F, 127.4],    // 07 锚机前的横向通道
  [2.2, F, 127.4],    // 08
  [2.4, F, 132.0],    // 09
  [0.0, F, 140.2],    // 10 艏端瞭望（旗杆前）
  [-2.4, F, 132.0],   // 11
  [-2.2, F, 127.4],   // 12
  [-9.0, F, 127.4],   // 13
  [-9.2, F, 121.5],   // 14
  [-9.6, F, 117.8],   // 15 左舷梯顶
  [-9.6, W, 112.6],   // 16 左舷梯脚
  [-10.0, W, 104.4],  // 17
  [-10.2, W, 96.0],   // 18
  [-8.6, W, 92.8],    // 19 左舷门口前
  [-8.6, W, 91.0],    // 20 左舷门口缓冲平台（到“未开放”边界前）
  [-8.6, W, 92.8],    // 21
  [0.0, W, 93.0],     // 22 沿前壁横穿
  [8.6, W, 92.8],     // 23
  [8.6, W, 91.0],     // 24 回到起点
];

export const ROUTES = Object.freeze([
  Object.freeze({
    id: 'foredeck-loop',
    name: '井甲板—两舷梯—艏楼—艏端环线',
    fromPort: 'port-aft-starboard',
    toPort: 'port-aft-starboard',
    via: ['port-aft-port'],
    branches: ['starboard-well-deck', 'starboard-stair-up', 'forecastle-bow-spur', 'port-stair-down', 'port-well-deck', 'aft-crossing'],
    points: Object.freeze(LOOP.map(p => Object.freeze(p.slice()))),
  }),
]);

export const PORTS = Object.freeze(DOORS.xs.map((x) => Object.freeze({
  id: x > 0 ? 'port-aft-starboard' : 'port-aft-port',
  name: x > 0 ? '右舷上层建筑前壁门口' : '左舷上层建筑前壁门口',
  position: Object.freeze([x, WELL_Y, 90.2]),     // 脚下，缓冲平台上、“未开放”边界前
  facing: Object.freeze([0, 0, -1]),             // 朝向邻区（船尾）
  clearWidth: DOORS.clearWidth,
  clearHeight: DOORS.clearHeight,
  neighbor: null,
  neighborHint: 'C 甲板上层建筑前部内部（主线待接）',
  status: 'closed-unopened',
})));

/* ------------------------------------------------------------ 构造 */

export function buildRegion(THREE) {
  const root = new THREE.Group();
  root.name = REGION_ID;
  const collide = [];

  /* ---------- 材质（基础 PBR，无贴图；预览可按 name 追加程序纹理） ---------- */
  const std = (name, color, o = {}) => {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.0, ...o });
    m.name = name;
    return m;
  };
  const M = {
    white: std('white', '#ebe5d6', { roughness: 0.62 }),
    trim: std('trim', '#d6d0c0', { roughness: 0.6 }),
    machine: std('machine', '#3c4046', { roughness: 0.55, metalness: 0.25 }),
    deckSteel: std('deckSteel', '#a8a296', { roughness: 0.95 }),
    teak: std('teak', '#a88a64', { roughness: 0.85 }),
    wood: std('wood', '#7a5a3a', { roughness: 0.7 }),
    brass: std('brass', '#b08d45', { roughness: 0.35, metalness: 0.9 }),
    glass: std('glass', '#2d3a44', { roughness: 0.08, metalness: 0.4 }),
    canvas: std('canvas', '#8d8674', { roughness: 0.95 }),
    rope: std('rope', '#9d8a66', { roughness: 0.95 }),
    stayRope: std('stayRope', '#6f6a5c', { roughness: 0.9 }),
    red: std('ventRed', '#7a3128', { roughness: 0.8 }),
    barrierRed: std('barrierRed', '#b3261e', { roughness: 0.6 }),
    barrierWhite: std('barrierWhite', '#f1ede4', { roughness: 0.6 }),
    sign: std('signBoard', '#1d2a33', { roughness: 0.7 }),
  };
  const INVIS = new THREE.MeshBasicMaterial({ visible: false });
  INVIS.name = 'collisionProxy';

  /* ---------- 小工具 ---------- */
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const cyl = (rt, rb, h, seg, m, open = false) =>
    new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m);
  const put = (parent, o, x, y, z, ry = 0) => {
    o.position.set(x, y, z);
    if (ry) o.rotation.y = ry;
    o.castShadow = true; o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  /** 登记碰撞体：命名、加入场景图、加入 collide。 */
  const solid = (parent, o, name, kind) => {
    o.name = name;
    o.userData.collider = kind;
    if (!o.parent) parent.add(o);
    collide.push(o);
    return o;
  };
  const proxyBox = (parent, name, kind, w, h, d, x, y, z, ry = 0) => {
    const b = box(w, h, d, INVIS);
    b.position.set(x, y, z);
    b.rotation.y = ry;
    return solid(parent, b, name, kind);
  };
  const proxyCyl = (parent, name, kind, r, h, x, y, z) => {
    const c = cyl(r, r, h, 16, INVIS);
    c.position.set(x, y, z);
    return solid(parent, c, name, kind);
  };
  const group = (name) => { const g = new THREE.Group(); g.name = name; root.add(g); return g; };

  /* ---------- 冻结 bow.js 的甲板与舷墙放样（函数体移植，材质改基础） ---------- */
  function taperedDeck(z0, z1, y, mat, segs) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const z = z0 + ((z1 - z0) * i) / segs;
      const b = Math.max(0.25, halfBeam(z));
      pos.push(-b, y, z, b, y, z);
      uv.push(z / 5.0, -b / 5.0, z / 5.0, b / 5.0);
    }
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }

  const UVM = 1 / 2.5;
  function loftRibbon(path, section, y0, mat, closedSection = false) {
    const N = path.length, S = section.length;
    const pos = [], uv = [], idx = [];
    const arc = [0];
    for (let i = 1; i < N; i++) arc.push(arc[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
    const emit = (p, s) => pos.push(p.x + s.u * p.nx, y0 + s.v, p.z + s.u * p.nz);
    const at = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    const cross = (a, b, c) => {
      const A = at(a), B = at(b), C = at(c);
      const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const edges = [];
    for (let k = 0; k + 1 < S; k++) edges.push([section[k], section[k + 1]]);
    if (closedSection) edges.push([section[S - 1], section[0]]);
    let vAcc = 0;
    for (const [sa, sb] of edges) {
      const du = sb.u - sa.u, dv = sb.v - sa.v, segLen = Math.hypot(du, dv) || 1e-3;
      const base = pos.length / 3;
      for (let i = 0; i < N; i++) {
        emit(path[i], sa); uv.push(arc[i] * UVM, vAcc * UVM);
        emit(path[i], sb); uv.push(arc[i] * UVM, (vAcc + segLen) * UVM);
      }
      for (let i = 0; i < N - 1; i++) {
        const p = path[i], want = [-dv * p.nx, du, -dv * p.nz];
        const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
        if (dot(cross(a, b, d), want) >= 0) idx.push(a, b, d, a, d, c); else idx.push(a, d, b, a, c, d);
      }
      vAcc += segLen;
    }
    for (const end of [0, N - 1]) {
      const p = path[end], q = path[end === 0 ? 1 : N - 2];
      const want = [p.x - q.x, 0, p.z - q.z];
      const base = pos.length / 3;
      for (const s of section) { emit(p, s); uv.push(s.u * UVM, s.v * UVM); }
      for (let k = 1; k + 1 < S; k++) {
        const a = base, b = base + k, c = base + k + 1;
        if (dot(cross(a, b, c), want) >= 0) idx.push(a, b, c); else idx.push(a, c, b);
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

  function withNormals(pts, refZ) {
    const N = pts.length;
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(N - 1, i + 1)];
      const dx = c.x - a.x, dz = c.z - a.z, L = Math.hypot(dx, dz) || 1e-4;
      let nx = dz / L, nz = -dx / L;
      if (nx * p.x + nz * (p.z - refZ) < 0) { nx = -nx; nz = -nz; }
      return { x: p.x, z: p.z, nx, nz };
    });
  }

  function stemWrap(z0, inset, segs = 64, end = 0.05) {
    const span = STEM_Z - z0;
    const u0 = Math.pow(end / span, 0.55);
    const zAt = (u) => STEM_Z - span * Math.pow(u, 1 / 0.55);
    const b = (z) => Math.max(0.12, halfBeam(z) - inset);
    const zs = [];
    for (let i = 0; i <= segs; i++) zs.push(zAt(u0 + ((1 - u0) * i) / segs));
    const pts = [];
    for (let i = segs; i >= 0; i--) pts.push({ x: -b(zs[i]), z: zs[i] });
    for (let i = 0; i <= segs; i++) pts.push({ x: b(zs[i]), z: zs[i] });
    return withNormals(pts, z0 - 2);
  }

  /** bow.js railGuard：沿路径的不可见厚箱，内侧面与舷墙内壁齐平。 */
  function railGuard(path, y, h, parent, prefix, step = 2.6) {
    const D = 0.40, OFF = D / 2 - 0.07, H = h + 0.5;
    let i0 = 0, acc = 0, n = 0;
    for (let i = 1; i < path.length; i++) {
      acc += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
      const turned = path[i0].nx * path[i].nx + path[i0].nz * path[i].nz < 0.94;
      if (i < path.length - 1 && acc < step && !turned) continue;
      const a = path[i0], b = path[i];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      if (L < 0.02) continue;
      let nx = a.nx + b.nx, nz = a.nz + b.nz;
      const NL = Math.hypot(nx, nz) || 1;
      proxyBox(parent, `${prefix}-${String(n++).padStart(2, '0')}`, 'fall-guard',
        L * 1.10, H, D,
        (a.x + b.x) / 2 + (nx / NL) * OFF, y + h / 2, (a.z + b.z) / 2 + (nz / NL) * OFF,
        Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2);
      i0 = i; acc = 0;
    }
  }

  function bulwarkOn(path, y, h, parent, prefix) {
    const T = 0.07, CW = 0.15, CH = 0.10;
    parent.add(loftRibbon(path, [{ u: -T, v: 0 }, { u: -T, v: h }, { u: T, v: h }, { u: T, v: 0 }], y, M.white));
    parent.add(loftRibbon(path, [{ u: -CW, v: 0 }, { u: -CW, v: CH }, { u: CW, v: CH }, { u: CW, v: 0 }], y + h, M.wood, true));
    railGuard(path, y, h, parent, prefix);
  }

  /* =============================================================== 上层建筑前壁（开两处门口） */
  {
    const g = group('superstructure-front');
    const FH = 0 - WELL_Y;                       // 8.5 m，与 bow.js 相同
    const halfW = 13.8;                          // bow.js 27.6 m 宽
    const dw = DOORS.clearWidth, dh = DOORS.clearHeight;
    const zc = FRONT_Z;
    // 墙身：门两侧与门楣分段（bow.js 为整块 27.6×8.5 m）
    const xs = [-halfW, DOORS.xs[0] - dw / 2, DOORS.xs[0] + dw / 2, DOORS.xs[1] - dw / 2, DOORS.xs[1] + dw / 2, halfW];
    for (let k = 0; k < xs.length - 1; k += 2) {
      const w = xs[k + 1] - xs[k], cx = (xs[k] + xs[k + 1]) / 2;
      put(g, box(w, FH, 0.5, M.white), cx, WELL_Y + FH / 2, zc);
      proxyBox(g, `col-front-wall-${k / 2}`, 'wall', w, 3.2, 0.5, cx, WELL_Y + 1.6, zc);
    }
    for (const x of DOORS.xs) {
      put(g, box(dw, FH - dh, 0.5, M.white), x, WELL_Y + dh + (FH - dh) / 2, zc);
      // 门框
      for (const s of [-1, 1]) put(g, box(0.08, dh + 0.08, 0.6, M.trim), x + s * (dw / 2 + 0.04), WELL_Y + dh / 2, zc);
      put(g, box(dw + 0.16, 0.08, 0.6, M.trim), x, WELL_Y + dh + 0.04, zc);
    }
    // A / B 甲板长廊窗带（bow.js 原样）
    for (const y of [-2.2, -5.1]) {
      put(g, box(27.6, 0.45, 0.7, M.trim), 0, y + 0.9, zc - 0.12);
      for (let x = -12.4; x <= 12.4; x += 2.1) {
        put(g, box(1.45, 1.25, 0.12, M.trim), x, y, zc - 0.30);
        put(g, box(1.28, 1.08, 0.04, M.glass), x, y, zc - 0.38);
      }
    }
    put(g, box(28.4, 0.3, 1.0, M.trim), 0, -0.15, zc - 0.3);
  }

  /* =============================================================== 门口缓冲平台与“未开放”边界 */
  for (const port of PORTS) {
    const x = port.position[0];
    const g = group(`buffer-${port.id}`);
    const dw = DOORS.clearWidth, dh = DOORS.clearHeight;
    const z0 = DOORS.bufferZ0, z1 = DOORS.wallZ1, zm = (z0 + z1) / 2, L = z1 - z0;
    // 缓冲平台地板：顶面与井甲板齐平
    const floor = put(g, box(dw + 0.2, 0.2, L, M.teak), x, WELL_Y - 0.1, zm);
    solid(g, floor, `floor-buffer-${port.id}`, 'floor');
    // 门槛压条（低于迈步高度，仅视觉）
    put(g, box(dw, 0.03, 0.12, M.brass), x, WELL_Y + 0.015, DOORS.wallZ1 - 0.05);
    // 侧壁与顶板（位于上层建筑内部轮廓内的短门廊）
    const cz = (z0 + DOORS.wallZ0) / 2, cl = DOORS.wallZ0 - z0;
    for (const s of [-1, 1]) {
      const wall = put(g, box(0.12, dh + 0.2, cl, M.white), x + s * (dw / 2 + 0.06), WELL_Y + (dh + 0.2) / 2, cz);
      solid(g, wall, `col-buffer-side-${port.id}-${s > 0 ? 'S' : 'P'}`, 'wall');
    }
    put(g, box(dw + 0.24, 0.12, cl, M.white), x, WELL_Y + dh + 0.06, cz);
    // “未开放”边界：红白横条门 + 标牌（碰撞为整幅门洞高度，只封本区外缘）
    const bz = DOORS.barrierZ;
    for (let i = 0; i < 6; i++) {
      put(g, box(dw, 0.18, 0.06, i % 2 ? M.barrierWhite : M.barrierRed), x, WELL_Y + 0.25 + i * 0.18, bz);
    }
    for (const s of [-1, 1]) put(g, box(0.08, 1.4, 0.08, M.machine), x + s * (dw / 2 - 0.04), WELL_Y + 0.7, bz);
    const sign = put(g, box(0.9, 0.42, 0.04, M.sign), x, WELL_Y + 1.62, bz + 0.02);
    sign.name = `sign-${port.id}`;
    sign.userData.signText = '未开放 · 主线待接';
    sign.userData.signFacing = [0, 0, 1];
    proxyBox(g, `col-barrier-${port.id}`, 'unopened-boundary', dw + 0.1, dh + 0.2, 0.2, x, WELL_Y + (dh + 0.2) / 2, bz - 0.06);
  }

  /* =============================================================== 前井甲板 */
  {
    const g = group('well-deck');
    const deck = taperedDeck(FRONT_Z, WELL_Z1, WELL_Y, M.teak, 22);
    solid(g, deck, 'floor-well-deck', 'floor');
    for (const side of [-1, 1]) {
      bulwarkOn(edgePath(FRONT_Z, WELL_Z1, 40, side, BW_IN), WELL_Y, 1.15, g, `col-bulwark-well-${side > 0 ? 'S' : 'P'}`);
    }

    // 货舱口（bow.js 二号、三号）
    const hatch = (name, z, w, d) => {
      const h = new THREE.Group();
      h.name = name;
      for (const s of [-1, 1]) {
        put(h, box(0.16, 0.78, d, M.machine), s * w / 2, 0.39, 0);
        put(h, box(w, 0.78, 0.16, M.machine), 0, 0.39, s * d / 2);
        put(h, box(0.30, 0.10, d + 0.3, M.wood), s * w / 2, 0.83, 0);
      }
      put(h, box(w - 0.2, 0.14, d - 0.2, M.canvas), 0, 0.85, 0);
      for (let i = -2; i <= 2; i++) put(h, box(0.10, 0.06, d + 0.2, M.machine), (i * w) / 6, 0.93, 0);
      h.position.set(0, WELL_Y, z);
      g.add(h);
      // 围板实体：按各自围板外廓（bow.js 两舱口共用 7.6×6.4 代理）
      proxyBox(g, `col-${name}`, 'hatch-coaming', w + 0.3, 1.0, d + 0.3, 0, WELL_Y + 0.5, z);
    };
    hatch('hatch-2', FRONT_Z + 7.5, 7.4, 6.2);
    hatch('hatch-3', FRONT_Z + 18.0, 6.6, 5.6);

    // 吊杆柱与吊杆（吊索末端提到 2.3 m 净空之上）
    const derrick = (name, x, z, dir) => {
      const d = new THREE.Group();
      d.name = name;
      put(d, cyl(0.30, 0.42, 9.2, 14, M.white), 0, 4.6, 0);
      put(d, new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 20), M.trim), 0, 6.4, 0).rotation.x = Math.PI / 2;
      put(d, cyl(0.46, 0.52, 0.5, 14, M.trim), 0, 9.2, 0);
      put(d, cyl(0.52, 0.56, 0.3, 14, M.trim), 0, 0.15, 0);
      for (let y = 1.0; y < 8.6; y += 0.42) put(d, cyl(0.02, 0.02, 0.4, 6, M.trim), 0.36, y, 0).rotation.z = Math.PI / 2;
      const LB = 10.5, tilt = 0.72;
      const boom = cyl(0.11, 0.16, LB, 10, M.trim);
      boom.rotation.x = dir * tilt;
      put(d, boom, 0, 1.3 + Math.cos(tilt) * LB / 2, dir * Math.sin(tilt) * LB / 2);
      const tipY = 1.3 + Math.cos(tilt) * LB, tipZ = dir * Math.sin(tilt) * LB;
      put(d, cyl(0.10, 0.10, 0.08, 10, M.machine), 0, tipY - 0.18, tipZ).rotation.z = Math.PI / 2;
      const lowEnd = 2.3;
      put(d, cyl(0.013, 0.013, tipY - 0.2 - lowEnd, 6, M.rope), 0, (tipY - 0.2 + lowEnd) / 2, tipZ);
      put(d, box(0.14, 0.2, 0.08, M.machine), 0, lowEnd - 0.1, tipZ);
      const a = new THREE.Vector3(0, tipY - 0.3, tipZ), b = new THREE.Vector3(0, 8.6, 0);
      const st = cyl(0.018, 0.018, a.distanceTo(b), 6, M.rope);
      st.position.copy(a).lerp(b, 0.5); st.lookAt(b); st.rotateX(Math.PI / 2);
      d.add(st);
      d.position.set(x, WELL_Y, z);
      g.add(d);
      proxyCyl(g, `col-${name}`, 'derrick-post', 0.56, 2.4, x, WELL_Y + 1.2, z);
    };
    for (const s of [-1, 1]) {
      const tag = s > 0 ? 'S' : 'P';
      derrick(`derrick-aft-${tag}`, s * 5.4, FRONT_Z + 3.0, 1);
      derrick(`derrick-fwd-${tag}`, s * 5.4, FRONT_Z + 22.5, -1);
    }

    // 防浪板：冻结位置与折线，舷侧端截短到 |x|≤8.0 为两舷梯脚让路
    const BW_TRIM = 8.0;
    for (const s of [-1, 1]) {
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const t0 = (i / segs) * (BW_TRIM / 11.5), t1 = ((i + 1) / segs) * (BW_TRIM / 11.5);
        const a = new THREE.Vector3(s * t0 * 11.5, 0, WELL_Z1 - 0.5 - t0 * 3.4);
        const b = new THREE.Vector3(s * t1 * 11.5, 0, WELL_Z1 - 0.5 - t1 * 3.4);
        const len = a.distanceTo(b);
        const ry = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
        const mid = a.clone().lerp(b, 0.5);
        const p = put(g, box(len * 1.05, 1.25, 0.16, M.white), mid.x, WELL_Y + 0.62, mid.z, ry);
        p.name = `breakwater-${s > 0 ? 'S' : 'P'}-${i}`;
        if (i % 2 === 1) {
          const k = put(g, box(0.10, 1.0, 0.9, M.white), mid.x, WELL_Y + 0.5, mid.z + 0.5, ry);
          k.name = `breakwater-knee-${s > 0 ? 'S' : 'P'}-${i}`;
        }
        proxyBox(g, `col-breakwater-${s > 0 ? 'S' : 'P'}-${i}`, 'breakwater', len * 1.08, 1.5, 0.3, mid.x, WELL_Y + 0.75, mid.z, ry);
      }
    }
  }

  /* =============================================================== 艏楼落差：挡墙、护栏、两舷阶梯 */
  {
    const g = group('forecastle-break');
    const FSTEP = FCSL_Y - WELL_Y;             // 2.6 m
    const hb = halfBeam(WELL_Z1) - BW_IN;
    // 挡墙：面在 z=117.0，向艏加厚到艏楼甲板下（bow.js 中心在 117.0，24 m 宽）
    const wallW = 2 * hb;
    put(g, box(wallW, FSTEP, 0.4, M.white), 0, WELL_Y + FSTEP / 2, WELL_Z1 + 0.2);
    proxyBox(g, 'col-fcsl-break-bulkhead', 'wall', wallW, FSTEP - 0.02, 0.4, 0, WELL_Y + (FSTEP - 0.02) / 2, WELL_Z1 + 0.2);
    // 挡墙上的舷窗式小门（仅视觉，不可通行）省略；保留一道压条
    put(g, box(wallW, 0.12, 0.5, M.trim), 0, FCSL_Y - 0.06, WELL_Z1 + 0.2);

    // 艏楼边缘护栏：留两处梯口
    const railZ = WELL_Z1 + 0.11, rh = 1.1;
    const ib = innerBeam(railZ);
    const openings = STAIR.xs.map(x => [x - STAIR.guardX + 0.05, x + STAIR.guardX - 0.05]);   // 与梯侧护栏搭接 0.05 m
    const spans = [[-ib, openings[0][0]], [openings[0][1], openings[1][0]], [openings[1][1], ib]];
    spans.forEach(([x0, x1], k) => {
      const w = x1 - x0, cx = (x0 + x1) / 2;
      for (const yy of [0.55, 1.05]) put(g, box(w, 0.05, 0.05, M.trim), cx, FCSL_Y + yy, railZ);
      put(g, box(w, 0.12, 0.06, M.trim), cx, FCSL_Y + 0.06, railZ);   // 踢脚板
      const n = Math.max(1, Math.round(w / 1.5));
      for (let i = 0; i <= n; i++) put(g, cyl(0.025, 0.025, rh, 6, M.trim), x0 + (w * i) / n, FCSL_Y + rh / 2, railZ);
      proxyBox(g, `col-fcsl-break-rail-${k}`, 'fall-guard', w, 1.5, 0.14, cx, FCSL_Y + 0.7, railZ);
    });

    // 两舷阶梯：向艏升高，顶级接艏楼甲板
    for (const sx of STAIR.xs) {
      const tag = sx > 0 ? 'S' : 'P';
      const sg = new THREE.Group();
      sg.name = `stair-${tag}`;
      g.add(sg);
      const cw = STAIR.clearWidth;
      for (let i = 1; i <= STAIR.risers - 1; i++) {
        const zA = WELL_Z1 - (STAIR.risers - i) * STAIR.tread;
        const zB = zA + STAIR.tread;
        const top = WELL_Y + STAIR.rise * i;
        const tread = put(sg, box(cw, 0.05, STAIR.tread + 0.02, M.trim), sx, top - 0.025, (zA + zB) / 2);
        tread.name = `stair-${tag}-tread-${String(i).padStart(2, '0')}`;
        put(sg, box(cw, STAIR.rise, 0.02, M.machine), sx, top - STAIR.rise / 2, zA + 0.01);   // 踢板
        // 实体：每级只占本级踏面深度，自井甲板起到本级顶面
        proxyBox(sg, `col-stair-${tag}-step-${String(i).padStart(2, '0')}`, 'stair-step',
          cw + 0.2, top - WELL_Y, STAIR.tread, sx, (WELL_Y + top) / 2, (zA + zB) / 2);
        // 两侧护栏实体：本级踏面深度，自井甲板到踏面上 1.45 m（盖住 Walker 齐腰射线）
        for (const s of [-1, 1]) {
          const hgt = top - WELL_Y + 1.45;
          proxyBox(sg, `col-stair-${tag}-guard-${s > 0 ? 'out' : 'in'}-${String(i).padStart(2, '0')}`, 'stair-guard',
            0.1, hgt, STAIR.tread, sx + s * STAIR.guardX, WELL_Y + hgt / 2, (zA + zB) / 2);
        }
      }
      // 第一级前的踢板（z=footZ）
      put(sg, box(cw, STAIR.rise, 0.02, M.machine), sx, WELL_Y + STAIR.rise / 2, STAIR.footZ + 0.01);
      // 斜梁与扶手（视觉）
      const run = WELL_Z1 - STAIR.footZ, rise = FCSL_Y - WELL_Y;
      const ang = Math.atan2(rise, run), len = Math.hypot(run, rise);
      for (const s of [-1, 1]) {
        const x = sx + s * STAIR.guardX;
        const stringer = box(0.08, 0.3, len, M.machine);
        stringer.rotation.x = -ang;
        put(sg, stringer, x, WELL_Y + rise / 2 - 0.12, STAIR.footZ + run / 2);
        for (const hy of [0.55, 1.0]) {
          const rail = cyl(0.03, 0.03, len + 0.2, 8, M.trim);
          rail.rotation.x = Math.PI / 2 - ang;
          put(sg, rail, x, WELL_Y + rise / 2 + hy, STAIR.footZ + run / 2);
        }
        for (let k = 0; k <= 4; k++) {
          const z = STAIR.footZ + 0.15 + (run - 0.3) * (k / 4);
          const y = WELL_Y + rise * ((z - STAIR.footZ) / run);
          put(sg, cyl(0.025, 0.025, 1.05, 6, M.trim), x, y + 0.52, z);
        }
        // 梯脚与梯顶立柱
        put(sg, cyl(0.035, 0.035, 1.15, 8, M.trim), x, WELL_Y + 0.575, STAIR.footZ);
        put(sg, cyl(0.035, 0.035, 1.15, 8, M.trim), x, FCSL_Y + 0.575, WELL_Z1 + 0.05);
      }
    }
  }

  /* =============================================================== 艏楼甲板 */
  {
    const g = group('forecastle-deck');
    const deck = taperedDeck(WELL_Z1, STEM_Z, FCSL_Y, M.deckSteel, 30);
    solid(g, deck, 'floor-forecastle-deck', 'floor');
    bulwarkOn(stemWrap(WELL_Z1, BW_IN, 64), FCSL_Y, 1.08, g, 'col-bulwark-fcsl');

    // 锚机
    const windlass = (tag, x) => {
      const w = new THREE.Group();
      w.name = `windlass-${tag}`;
      put(w, box(3.4, 1.05, 2.4, M.machine), 0, 0.52, 0);
      put(w, cyl(0.85, 0.85, 0.62, 9, M.machine), 0, 1.28, 0).rotation.z = Math.PI / 2;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        put(w, box(0.22, 0.22, 0.7, M.machine), Math.cos(a) * 0.78, 1.28 + Math.sin(a) * 0.78, 0);
      }
      for (const sz of [-1.5, 1.5]) {
        put(w, cyl(0.52, 0.52, 0.75, 14, M.machine), 0, 1.15, sz);
        put(w, new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.06, 8, 20), M.machine), 0, 1.50, sz).rotation.x = Math.PI / 2;
      }
      put(w, cyl(0.10, 0.10, 1.1, 8, M.trim), 1.4, 1.6, 0);
      w.position.set(x, FCSL_Y, WELL_Z1 + 6.5);
      g.add(w);
      proxyBox(g, `col-windlass-${tag}`, 'mooring-machinery', 3.6, 2.2, 2.6, x, FCSL_Y + 1.1, WELL_Z1 + 6.5);
    };
    windlass('P', -4.0); windlass('S', 4.0);

    // 锚链（低于迈步高度，仅视觉）
    const chain = (x0, z0, x1, z1) => {
      for (let i = 0; i < 26; i++) {
        const t = i / 26;
        const link = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 6, 12), M.machine);
        link.rotation.x = Math.PI / 2;
        link.rotation.y = i % 2 ? Math.PI / 2 : 0;
        put(g, link, x0 + (x1 - x0) * t, FCSL_Y + 0.04, z0 + (z1 - z0) * t);
      }
    };
    chain(-4.0, WELL_Z1 + 7.6, -3.1, STEM_Z - 7.0);
    chain(4.0, WELL_Z1 + 7.6, 3.1, STEM_Z - 7.0);

    // 系缆桩
    for (const s of [-1, 1]) {
      for (const z of [WELL_Z1 + 2.5, WELL_Z1 + 12.0, STEM_Z - 9.0]) {
        const b = new THREE.Group();
        const name = `bollard-${s > 0 ? 'S' : 'P'}-${z.toFixed(1)}`;
        b.name = name;
        put(b, box(1.0, 0.18, 0.6, M.machine), 0, 0.09, 0);
        for (const sx of [-0.3, 0.3]) {
          put(b, cyl(0.135, 0.155, 0.78, 12, M.machine), sx, 0.48, 0);
          put(b, cyl(0.175, 0.175, 0.07, 12, M.machine), sx, 0.88, 0);
        }
        const x = s * (halfBeam(z) - 1.5);
        b.position.set(x, FCSL_Y, z);
        g.add(b);
        proxyBox(g, `col-${name}`, 'mooring-bollard', 1.0, 0.95, 0.6, x, FCSL_Y + 0.475, z);
      }
    }

    // 锚机操纵台
    {
      const cz = WELL_Z1 + 6.5;
      const st = new THREE.Group();
      st.name = 'windlass-control-stand';
      put(st, box(1.70, 0.12, 1.30, M.machine), 0, 0.06, 0);
      put(st, box(1.15, 0.95, 0.78, M.machine), 0, 0.59, 0);
      const panel = box(1.18, 0.09, 0.86, M.machine);
      panel.rotation.x = -0.46;
      put(st, panel, 0, 1.10, -0.10);
      for (const [lx, lh, tilt] of [[-0.36, 0.95, 0.30], [0, 1.05, 0.16], [0.36, 0.88, 0.42]]) {
        const bar = cyl(0.028, 0.038, lh, 8, M.trim);
        bar.rotation.x = -tilt;
        put(st, bar, lx, 1.16 + (Math.cos(tilt) * lh) / 2, -0.14 - (Math.sin(tilt) * lh) / 2);
        put(st, new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), M.brass), lx, 1.16 + Math.cos(tilt) * lh, -0.14 - Math.sin(tilt) * lh);
      }
      st.position.set(0, FCSL_Y, cz);
      g.add(st);
      proxyBox(g, 'col-windlass-control-stand', 'mooring-machinery', 1.8, 1.5, 1.4, 0, FCSL_Y + 0.75, cz);
    }

    // 蘑菇头通风口
    const mushroom = (name, x, z, r, h) => {
      const v = new THREE.Group();
      v.name = name;
      put(v, cyl(r * 0.58, r * 0.64, h, 14, M.machine), 0, h / 2, 0);
      put(v, cyl(r * 0.86, r, 0.28, 16, M.machine), 0, h + 0.10, 0);
      v.position.set(x, FCSL_Y, z);
      g.add(v);
      proxyCyl(g, `col-${name}`, 'vent', r + 0.02, 1.4, x, FCSL_Y + 0.7, z);
    };
    for (const s of [-1, 1]) {
      const tag = s > 0 ? 'S' : 'P';
      mushroom(`vent-mushroom-aft-${tag}`, s * 6.5, WELL_Z1 + 4.0, 0.52, 0.85);
      mushroom(`vent-mushroom-fwd-${tag}`, s * 7.0, WELL_Z1 + 14.0, 0.46, 0.74);
    }

    // 通风筒（口朝船尾）
    const cowl = (name, x, z, r, h, dir, ry) => {
      const v = new THREE.Group();
      v.name = name;
      const A = 0.95, ax = dir * A, ca = Math.cos(A), sa = dir * Math.sin(A);
      put(v, cyl(r * 0.54, r * 0.62, h, 14, M.machine), 0, h / 2, 0);
      const neck = cyl(r * 0.62, r * 0.54, 0.82, 14, M.machine); neck.rotation.x = ax;
      put(v, neck, 0, h + ca * 0.38, sa * 0.38);
      const mouth = cyl(r, r * 0.62, 0.52, 16, M.machine, true); mouth.rotation.x = ax;
      put(v, mouth, 0, h + ca * 1.00, sa * 1.00);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 16), M.red);
      inner.rotation.x = ax - Math.PI / 2;
      put(v, inner, 0, h + ca * 0.95, sa * 0.95);
      v.position.set(x, FCSL_Y, z);
      if (ry) v.rotation.y = ry;
      g.add(v);
      proxyCyl(g, `col-${name}`, 'vent', 0.5, 2.6, x, FCSL_Y + 1.3, z);
    };
    for (const s of [-1, 1]) cowl(`vent-cowl-${s > 0 ? 'S' : 'P'}`, s * 5.6, WELL_Z1 + 17.5, 0.38, 1.55, -1, s * 0.2);

    // 缆绳盘（实体为 0.9 m 高圆柱，避免 Walker 踩上盘缆）
    const coil = (name, x, z, r0, ry) => {
      const c = new THREE.Group();
      c.name = name;
      for (const [rr, yy] of [[r0, 0.055], [r0 - 0.17, 0.055], [r0 - 0.34, 0.055], [r0 - 0.09, 0.165], [r0 - 0.26, 0.165], [r0 - 0.18, 0.275]]) {
        if (rr < 0.12) continue;
        const t = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.056, 7, 22), M.rope);
        t.rotation.x = Math.PI / 2;
        put(c, t, 0, yy, 0);
      }
      c.position.set(x, FCSL_Y, z);
      c.rotation.y = ry;
      g.add(c);
      proxyCyl(g, `col-${name}`, 'rope-coil', r0 + 0.06, 0.9, x, FCSL_Y + 0.45, z);
    };
    coil('coil-centre', 0, WELL_Z1 + 13.5, 0.84, 0.3);
    coil('coil-P', -6.9, WELL_Z1 + 8.4, 0.72, -0.5);
    coil('coil-S', 6.9, WELL_Z1 + 8.4, 0.76, 0.9);

    // 前桅与瞭望台
    const mastZ = WELL_Z1 + 1.6, MAST_H = 33.0;
    put(g, cyl(0.28, 0.52, MAST_H, 16, M.trim), 0, FCSL_Y + MAST_H / 2, mastZ).name = 'foremast';
    put(g, cyl(0.60, 0.72, 1.0, 16, M.trim), 0, FCSL_Y + 0.5, mastZ);
    proxyCyl(g, 'col-foremast-base', 'mast', 0.74, 2.6, 0, FCSL_Y + 1.3, mastZ);
    for (let y = 1.2; y < 18.5; y += 0.42) put(g, cyl(0.018, 0.018, 0.42, 6, M.trim), 0, FCSL_Y + y, mastZ + 0.40).rotation.z = Math.PI / 2;
    const nestY = FCSL_Y + 18.8;
    const nest = new THREE.Group();
    nest.name = 'crows-nest';
    const nestShell = M.trim.clone();
    nestShell.name = 'trimDoubleSide';
    nestShell.side = THREE.DoubleSide;
    put(nest, cyl(1.16, 0.98, 1.30, 22, nestShell, true), 0, 0.65, 0);
    put(nest, new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.05, 8, 26), M.trim), 0, 1.30, 0).rotation.x = Math.PI / 2;
    put(nest, new THREE.Mesh(new THREE.CircleGeometry(1.14, 22), M.trim).rotateX(-Math.PI / 2), 0, 0.02, 0);
    nest.position.set(0, nestY, mastZ);
    g.add(nest);
    put(g, cyl(0.09, 0.12, 0.44, 10, M.brass), 0, FCSL_Y + MAST_H - 2.6, mastZ);
    put(g, cyl(0.07, 0.09, 2.4, 8, M.trim), 0, FCSL_Y + MAST_H + 1.0, mastZ);

    // 支索（视觉；下端加眼板）
    const stay = (x0, y0, z0, x1, y1, z1, r = 0.035) => {
      const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1);
      const c = cyl(r, r, a.distanceTo(b), 6, M.stayRope);
      c.position.copy(a).lerp(b, 0.5); c.lookAt(b); c.rotateX(Math.PI / 2);
      g.add(c);
    };
    stay(0, FCSL_Y + MAST_H - 3.5, mastZ, 0, FCSL_Y + 1.2, STEM_Z - 3.0);
    for (const s of [-1, 1]) {
      stay(0, FCSL_Y + MAST_H - 5.0, mastZ, s * 11.0, FCSL_Y + 0.9, WELL_Z1 + 9.0);
      stay(0, nestY - 0.6, mastZ, s * 10.0, FCSL_Y + 0.9, WELL_Z1 + 3.5, 0.028);
      stay(0, FCSL_Y + MAST_H - 6.5, mastZ, s * 9.0, -0.2, 86.0, 0.030);
      for (const [sx, sz] of [[s * 11.0, WELL_Z1 + 9.0], [s * 10.0, WELL_Z1 + 3.5]]) {
        put(g, cyl(0.06, 0.1, 0.9, 8, M.machine), sx, FCSL_Y + 0.45, sz);
      }
    }
    put(g, cyl(0.06, 0.1, 1.2, 8, M.machine), 0, FCSL_Y + 0.6, STEM_Z - 3.0);

    // 艏旗杆
    put(g, cyl(0.05, 0.09, 4.2, 10, M.trim), 0, FCSL_Y + 2.1, STEM_Z - 0.9);
    put(g, new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), M.brass), 0, FCSL_Y + 4.3, STEM_Z - 0.9);
    proxyCyl(g, 'col-jackstaff', 'mast', 0.14, 1.8, 0, FCSL_Y + 0.9, STEM_Z - 0.9);

    // 导缆孔与悬锚（位于舷外，仅视觉）
    for (const s of [-1, 1]) {
      const hz = STEM_Z - 7.5;
      put(g, new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 10, 20), M.machine), s * (halfBeam(hz) - 0.1), FCSL_Y - 1.6, hz, s * Math.PI / 2);
      const anchor = new THREE.Group();
      put(anchor, box(0.5, 3.2, 0.5, M.machine), 0, 0, 0);
      put(anchor, box(2.9, 0.42, 0.45, M.machine), 0, -1.3, 0);
      for (const sx of [-1, 1]) { const fl = box(1.0, 0.9, 0.22, M.machine); fl.rotation.z = sx * 0.5; put(anchor, fl, sx * 1.35, -0.95, 0); }
      anchor.position.set(s * (halfBeam(hz) + 0.35), FCSL_Y - 3.3, hz);
      anchor.rotation.y = s * Math.PI / 2;
      g.add(anchor);
    }
  }

  root.userData.regionId = REGION_ID;
  root.userData.collide = collide;
  root.userData.ports = PORTS.map(p => ({ ...p, position: p.position.slice(), facing: p.facing.slice() }));
  root.userData.routes = ROUTES.map(r => ({ ...r, points: r.points.map(p => p.slice()) }));
  root.userData.coordinateSystem = 'walk-authoring-v0';
  root.userData.registrationStatus = 'unregistered';
  root.userData.historicalStatus = 'unverified';
  return root;
}
