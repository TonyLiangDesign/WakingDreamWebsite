/**
 * C65-R1 · 艉部露天甲板步行接入候选
 *
 * 唯一工程基线：DISPATCH-13 冻结 src/walk/stern.js（副本 inputs/stern.js）。
 * 保留其甲板高度、纵向分区、舱口/吊杆柱/主桅/靠泊桥/绞缆机/系缆桩/通风筒/旗杆位置，
 * 以及 halfBeam 艉部平面曲线与舷墙放样方式；在此基础上改为可连续步行：
 *   · 井甲板 ↔ 艉楼的两部楼梯改为朝艉上升、实体踏步并接到艉楼前缘（冻结版朝艏上升、踏板无碰撞）
 *   · 艉楼前缘全宽防坠栏杆，只在两个梯口开口（冻结版碰撞墙仅 ±11 m 且高出艉楼 0.7 m 封住梯口）
 *   · 大型设施全部配置实体碰撞代理（冻结版只有舱口和舷墙有碰撞）
 *   · 上层建筑后壁与艉楼前舱壁的门：短门槛 + 可见“未开放”封闭边界，邻区 endpoint 为 null
 * 不含船壳（船名牌放样、外板属 hull.js 范围），不做全船配准。
 *
 * 坐标：walk-authoring-v0，米，+Y 上，+Z 艏，+X 右舷。root 为单位变换。
 * buildRegion(THREE) 注入 Three，不创建 renderer、不加载远程资产、不写全局。
 */

export const STERN = Object.freeze({
  WELL_Y: -8.5,   // 后井甲板（冻结 stern.js）
  POOP_Y: -5.9,   // 艉楼甲板（冻结 stern.js）
  BACK_Z: -47.0,  // 上层建筑后壁
  POOP_Z: -72.0,  // 艉楼前缘
  TAIL_Z: -96.0,  // 艉端
});

const { WELL_Y: W, POOP_Y: P, BACK_Z, POOP_Z, TAIL_Z } = STERN;
const BW_IN = 0.18;                 // 舷墙内缩（冻结值）
const SILL = 0.10;                  // 门槛高
const STAIR = Object.freeze({ x: 8.8, width: 1.4, risers: 12, going: 0.30 });
const RISE = (P - W) / STAIR.risers;                 // 0.2167 m
const STAIR_FOOT_Z = POOP_Z + (STAIR.risers - 1) * STAIR.going; // -68.7

/** 冻结 stern.js 的艉部半宽曲线，原样保留。 */
export function halfBeam(z) {
  const t = Math.max(0, Math.min(1, (z - BACK_Z) / (TAIL_Z - BACK_Z)));
  return 13.8 * Math.pow(1 - Math.pow(t, 3.1), 0.42) + 0.5 * (1 - t);
}

/* ----------------------------------------------------------------- 接口数据 */

export const PORTS = Object.freeze([
  {
    id: 'aft-super-stbd',
    label: '上层建筑后壁右舷门（内部）',
    foot: [9.5, W + SILL, -46.0],
    facing: [0, 0, 1],
    clearWidth: 1.1, clearHeight: 2.1,
    neighbor: null, endpoint: null, status: '未开放',
    note: '通往上层建筑内部，主线待接；门槛后为可见封闭栏与闭门',
  },
  {
    id: 'aft-super-port',
    label: '上层建筑后壁左舷门（内部）',
    foot: [-9.5, W + SILL, -46.0],
    facing: [0, 0, 1],
    clearWidth: 1.1, clearHeight: 2.1,
    neighbor: null, endpoint: null, status: '未开放',
    note: '通往上层建筑内部，主线待接；门槛后为可见封闭栏与闭门',
  },
  {
    id: 'poop-door-stbd',
    label: '艉楼前舱壁右舷门（艉楼下舱室）',
    foot: [4.0, W + SILL, -72.9],
    facing: [0, 0, -1],
    clearWidth: 1.2, clearHeight: 2.0,
    neighbor: null, endpoint: null, status: '未开放',
    note: '通往艉楼下三等舱空间，主线待接；门槛后为可见封闭栏与闭门',
  },
  {
    id: 'poop-door-port',
    label: '艉楼前舱壁左舷门（艉楼下舱室）',
    foot: [-4.0, W + SILL, -72.9],
    facing: [0, 0, -1],
    clearWidth: 1.2, clearHeight: 2.0,
    neighbor: null, endpoint: null, status: '未开放',
    note: '通往艉楼下三等舱空间，主线待接；门槛后为可见封闭栏与闭门',
  },
]);

const S = (x, z, y = W) => [x, y, z];
const T = W + SILL;

/**
 * 出发—探索—返回：井甲板起点 → 右舷门槛 → 右舷通道 → 艉楼下右门槛 → 右梯上艉楼 →
 * 右舷绕绞缆机/通风筒/系缆桩 → 艉端旗杆前 → 左舷折回 → 左梯下井甲板 → 左门槛 → 左舷通道 → 起点。
 * 同一路线反向走一次即另一种往返。
 */
export const ROUTES = Object.freeze([
  {
    id: 'aft-loop',
    name: '井甲板—艉楼两舷环线',
    portIds: ['aft-super-stbd', 'poop-door-stbd', 'poop-door-port', 'aft-super-port'],
    points: [
      { p: S(0, -48.8), label: '起点·井甲板前端' },
      { p: S(6.5, -48.8) },
      { p: S(9.5, -48.8) },
      { p: [9.5, T, -46.0], port: 'aft-super-stbd' },
      { p: S(9.5, -48.8) },
      { p: S(8.5, -51.5) },
      { p: S(8.5, -62.0), label: '右舷通道·舱口旁' },
      { p: S(7.2, -65.5) },
      { p: S(7.2, -70.0) },
      { p: S(4.0, -70.2) },
      { p: [4.0, T, -72.9], port: 'poop-door-stbd' },
      { p: S(4.0, -70.2) },
      { p: S(7.2, -70.0) },
      { p: S(7.2, -67.6) },
      { p: S(8.8, -67.6), label: '右梯脚' },
      { p: S(8.8, -72.8, P), label: '右梯顶·艉楼' },
      { p: S(8.8, -75.0, P) },
      { p: S(8.3, -80.5, P), label: '右舷绞缆机旁' },
      { p: S(7.2, -86.0, P) },
      { p: S(5.5, -89.0, P) },
      { p: S(0, -91.0, P), label: '艉端旗杆前' },
      { p: S(-5.5, -89.0, P) },
      { p: S(-7.2, -86.0, P) },
      { p: S(-8.3, -80.5, P), label: '左舷绞缆机旁' },
      { p: S(-8.8, -75.0, P) },
      { p: S(-8.8, -72.8, P), label: '左梯顶' },
      { p: S(-8.8, -67.6), label: '左梯脚' },
      { p: S(-7.2, -67.6) },
      { p: S(-7.2, -70.0) },
      { p: S(-4.0, -70.2) },
      { p: [-4.0, T, -72.9], port: 'poop-door-port' },
      { p: S(-4.0, -70.2) },
      { p: S(-7.2, -70.0) },
      { p: S(-7.2, -65.5) },
      { p: S(-8.5, -62.0), label: '左舷通道·舱口旁' },
      { p: S(-8.5, -51.5) },
      { p: S(-9.5, -48.8) },
      { p: [-9.5, T, -46.0], port: 'aft-super-port' },
      { p: S(-9.5, -48.8) },
      { p: S(-6.5, -48.8) },
      { p: S(0, -48.8), label: '返回起点' },
    ],
  },
]);

export const START = Object.freeze({ foot: [0, W, -48.8], yaw: 0 }); // yaw 0 = 面向 -Z（朝艉）

/* ----------------------------------------------------------------- 构造 */

export function buildRegion(THREE) {
  const root = new THREE.Group();
  root.name = 'C65-aft-open-deck';
  const collide = [];
  const obstacles = [];   // 供 check.mjs：{id, center:[x,y,z], kind}

  /* ---------- 材质（本地简化；冻结 materials.js 不在输入内） ---------- */
  const std = (color, rough = 0.7, metal = 0, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
  const white = std('#ebe5d6', 0.62);
  const trimM = std('#d6d0c0', 0.6);
  const machine = std('#3c4046', 0.55, 0.35);
  const canvasM = std('#8d8674', 0.95);
  const wood = std('#8a5a33', 0.5);
  const brass = std('#b58a3c', 0.35, 0.85);
  const glass = std('#2c3a44', 0.08, 0.2);
  const rope = std('#6f6a5c', 0.9);
  const redM = std('#b3261e', 0.55);
  const doorM = std('#4a3322', 0.6);
  const cowlRed = std('#7a3128', 0.7);
  const INVIS = new THREE.MeshBasicMaterial({ visible: false });

  const teakTex = makeTeakTexture(THREE);
  const teak = std('#ffffff', 0.78, 0, { map: teakTex });

  /* ---------- 小工具 ---------- */
  const put = (o, x, y, z, ry = 0) => {
    o.position.set(x, y, z);
    if (ry) o.rotation.y = ry;
    o.castShadow = true; o.receiveShadow = true;
    return o;
  };
  const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  const cyl = (rt, rb, h, seg, m, open = false) =>
    new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m);
  const add = (parent, o) => { parent.add(o); return o; };
  /** 实体碰撞代理：不可见、独立对象、带真实变换。 */
  const proxy = (parent, geo, x, y, z, ry = 0, role = 'proxy') => {
    const m = new THREE.Mesh(geo, INVIS);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.userData.role = role;
    parent.add(m); collide.push(m);
    return m;
  };
  const solid = (parent, mesh, role) => {  // 可见且参与碰撞
    mesh.userData.role = role;
    parent.add(mesh); collide.push(mesh);
    return mesh;
  };

  /* ================================================ 上层建筑后壁（井甲板前端） */
  const aftWall = add(root, new THREE.Group()); aftWall.name = 'aft-superstructure-wall';
  {
    const HW = 14.2, top = 0, H = top - W, DOORS = [-9.5, 9.5], DW = 1.1, DH = 2.1;
    // 可见墙：三段 + 门楣
    const cuts = [-HW, DOORS[0] - DW / 2, DOORS[0] + DW / 2, DOORS[1] - DW / 2, DOORS[1] + DW / 2, HW];
    for (let i = 0; i < cuts.length; i += 2) {
      const a = cuts[i], b = cuts[i + 1];
      add(aftWall, put(box(b - a, H, 0.5, white), (a + b) / 2, W + H / 2, BACK_Z));
    }
    for (const dx of DOORS) {
      add(aftWall, put(box(DW, H - DH, 0.5, white), dx, W + DH + (H - DH) / 2, BACK_Z));
    }
    for (const y of [-2.2, -5.1]) {
      add(aftWall, put(box(28.4, 0.45, 0.7, trimM), 0, y + 0.9, BACK_Z - 0.12));
      for (let x = -12.4; x <= 12.4; x += 2.1) {
        add(aftWall, put(box(1.45, 1.25, 0.12, trimM), x, y, BACK_Z - 0.30));
        add(aftWall, put(box(1.28, 1.08, 0.04, glass), x, y, BACK_Z - 0.38));
      }
    }
    add(aftWall, put(box(28.8, 0.3, 1.0, trimM), 0, -0.15, BACK_Z - 0.3));
    // 碰撞：门两侧与中段全高墙；门洞不封
    const cc = [-14.6, DOORS[0] - DW / 2, DOORS[0] + DW / 2, DOORS[1] - DW / 2, DOORS[1] + DW / 2, 14.6];
    for (let i = 0; i < cc.length; i += 2) {
      const a = cc[i], b = cc[i + 1];
      proxy(aftWall, new THREE.BoxGeometry(b - a, 10, 0.8), (a + b) / 2, W + 5, BACK_Z, 0, 'wall');
    }
    for (const dx of DOORS) {
      proxy(aftWall, new THREE.BoxGeometry(DW, 10 - DH, 0.8), dx, W + DH + (10 - DH) / 2, BACK_Z, 0, 'wall');
      closedDoorway(aftWall, dx, BACK_Z - 0.25, +1, DW, DH, 2.2, `aft-super-${dx > 0 ? 'stbd' : 'port'}`);
    }
  }

  /**
   * 门槛 + 短门廊 + 未开放封闭边界。
   * z0 为门洞外口；dir 为进入方向（+1 朝艏、-1 朝艉）；depth 为门廊深度。
   */
  function closedDoorway(parent, x, z0, dir, width, height, depth, id) {
    const g = add(parent, new THREE.Group()); g.name = `closed-${id}`;
    const zOut = z0 - dir * 0.35;               // 门槛向外探出一点，作为接合缓冲
    const zEnd = z0 + dir * depth;
    const zc = (zOut + zEnd) / 2, len = Math.abs(zEnd - zOut);
    solid(g, put(box(width + 0.2, SILL, len, trimM), x, W + SILL / 2, zc), 'threshold');
    // 门廊侧壁与顶
    for (const s of [-1, 1]) {
      const wall = put(box(0.12, height + 0.2, depth, white), x + s * (width / 2 + 0.06), W + (height + 0.2) / 2, z0 + dir * depth / 2);
      solid(g, wall, 'wall');
    }
    add(g, put(box(width + 0.36, 0.14, depth, white), x, W + height + 0.13, z0 + dir * depth / 2));
    // 闭门
    add(g, put(box(width, height, 0.06, doorM), x, W + SILL + height / 2 - 0.05, zEnd - dir * 0.05));
    // 红白封闭栏：两根立柱 + 两道条纹横杆 + “未开放”牌
    const zb = zEnd - dir * 0.25;
    for (const s of [-1, 1]) add(g, put(cyl(0.035, 0.035, 1.15, 8, redM), x + s * (width / 2 - 0.06), W + SILL + 0.575, zb));
    for (const y of [0.55, 1.05]) {
      const n = 5, seg = (width - 0.12) / n;
      for (let i = 0; i < n; i++) {
        add(g, put(box(seg, 0.09, 0.05, i % 2 ? white : redM), x - (width - 0.12) / 2 + seg * (i + 0.5), W + SILL + y, zb));
      }
    }
    const sign = put(box(width - 0.2, 0.34, 0.03, signMaterial(THREE, redM)), x, W + SILL + 1.45, zb);
    if (dir < 0) sign.rotation.y = Math.PI;
    sign.userData.role = 'sign';
    add(g, sign);
    // 封闭边界碰撞（门廊末端全宽，不外溢到门槛）
    proxy(g, new THREE.BoxGeometry(width + 0.1, height, 0.12), x, W + height / 2, zb + dir * 0.02, 0, 'closed-boundary');
  }

  /* ================================================ 后井甲板 */
  const well = add(root, new THREE.Group()); well.name = 'aft-well-deck';
  solid(well, taperedDeck(THREE, POOP_Z, BACK_Z, W, teak, 22), 'floor');
  add(well, bulwark(THREE, POOP_Z, BACK_Z, W, 1.15, white, wood, 40, BW_IN, collide));

  const hatch = (z, w, d, id) => {
    const h = new THREE.Group();
    for (const s of [-1, 1]) {
      h.add(put(box(0.16, 0.78, d, machine), (s * w) / 2, 0.39, 0));
      h.add(put(box(w, 0.78, 0.16, machine), 0, 0.39, (s * d) / 2));
      h.add(put(box(0.30, 0.10, d + 0.3, wood), (s * w) / 2, 0.83, 0));
    }
    h.add(put(box(w - 0.2, 0.14, d - 0.2, canvasM), 0, 0.85, 0));
    for (let i = -2; i <= 2; i++) h.add(put(box(0.10, 0.06, d + 0.2, machine), (i * w) / 6, 0.93, 0));
    h.position.set(0, W, z);
    well.add(h);
    proxy(well, new THREE.BoxGeometry(w + 0.4, 1.1, d + 0.4), 0, W + 0.55, z, 0, 'hatch');
    obstacles.push({ id, kind: 'hatch', center: [0, W, z], half: [(w + 0.4) / 2, (d + 0.4) / 2] });
  };
  hatch(BACK_Z - 7.0, 6.8, 5.6, 'hatch-1');
  hatch(BACK_Z - 17.0, 6.0, 5.0, 'hatch-2');

  const derrick = (x, z, dir, id) => {
    const d = new THREE.Group();
    d.add(put(cyl(0.30, 0.42, 8.6, 14, white), 0, 4.3, 0));
    d.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 20), trimM), 0, 6.0, 0));
    d.add(put(cyl(0.46, 0.52, 0.5, 14, trimM), 0, 8.6, 0));
    const LB = 9.5, tilt = 0.72;
    const boom = cyl(0.11, 0.16, LB, 10, trimM);
    boom.rotation.x = dir * tilt;
    d.add(put(boom, 0, 1.3 + (Math.cos(tilt) * LB) / 2, (dir * Math.sin(tilt) * LB) / 2));
    const tipY = 1.3 + Math.cos(tilt) * LB, tipZ = dir * Math.sin(tilt) * LB;
    d.add(put(cyl(0.10, 0.10, 0.08, 10, machine).rotateZ(Math.PI / 2), 0, tipY - 0.18, tipZ));
    // 吊索下端收高到 2.3 m（冻结版垂到 1.4 m，正好横在舷侧通道人头高度）
    const lo = 2.3;
    d.add(put(cyl(0.013, 0.013, tipY - 0.2 - lo, 6, rope), 0, (tipY - 0.2 + lo) / 2, tipZ));
    d.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 12), machine), 0, lo - 0.05, tipZ));
    d.position.set(x, W, z);
    well.add(d);
    proxy(well, new THREE.CylinderGeometry(0.5, 0.5, 2.2, 12), x, W + 1.1, z, 0, 'derrick-post');
    obstacles.push({ id, kind: 'post', center: [x, W, z], r: 0.5 });
  };
  for (const s of [-1, 1]) {
    const n = s > 0 ? 'stbd' : 'port';
    derrick(s * 5.2, BACK_Z - 3.0, -1, `derrick-fwd-${n}`);
    derrick(s * 5.2, BACK_Z - 21.0, 1, `derrick-aft-${n}`);
  }

  /* ---------- 主桅 ---------- */
  const mastZ = BACK_Z - 23.5, MAST_H = 27.0;
  well.add(put(cyl(0.26, 0.48, MAST_H, 16, trimM), 0, W + MAST_H / 2, mastZ));
  well.add(put(cyl(0.58, 0.70, 1.0, 16, trimM), 0, W + 0.5, mastZ));
  well.add(put(cyl(0.09, 0.11, 9.0, 10, trimM).rotateZ(Math.PI / 2), 0, W + 16.5, mastZ));
  well.add(put(cyl(0.06, 0.08, 2.2, 8, trimM), 0, W + MAST_H + 0.9, mastZ));
  proxy(well, new THREE.CylinderGeometry(0.75, 0.75, 2.2, 16), 0, W + 1.1, mastZ, 0, 'mast');
  obstacles.push({ id: 'mainmast', kind: 'post', center: [0, W, mastZ], r: 0.75 });

  const stay = (parent, a, b, r = 0.032) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const c = cyl(r, r, A.distanceTo(B), 6, rope);
    c.position.copy(A).lerp(B, 0.5);
    c.lookAt(B); c.rotateX(Math.PI / 2);
    parent.add(c);
  };
  /** 拉索落脚点：甲板眼板 + 顺拉索方向的低矮碰撞代理，免得人头穿过斜拉索。 */
  const stayFoot = (parent, fx, fy, fz, towardX, towardZ, len, id) => {
    const dx = towardX - fx, dz = towardZ - fz, L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L, ry = Math.atan2(ux, uz);
    parent.add(put(box(0.30, 0.08, 0.30, machine), fx, fy + 0.04, fz));
    parent.add(put(cyl(0.05, 0.05, 0.16, 8, machine), fx, fy + 0.12, fz));
    proxy(parent, new THREE.BoxGeometry(0.30, 1.6, len), fx + ux * len / 2, fy + 0.8, fz + uz * len / 2, ry, 'stay-foot');
    obstacles.push({ id, kind: 'stay-foot', center: [fx + ux * len / 2, fy, fz + uz * len / 2], r: 0.15 });
  };
  const mastTop = [0, W + MAST_H - 3.0, mastZ];
  stay(well, mastTop, [0, P + 1.0, POOP_Z - 9.0]);
  for (const s of [-1, 1]) {
    stay(well, [0, W + MAST_H - 4.5, mastZ], [s * 10.5, W + 1.0, BACK_Z - 9.0]);
    stay(well, [0, W + 16.5, mastZ], [s * 4.5, W + 16.5, mastZ]);
    stay(well, [0, W + MAST_H - 6.0, mastZ], [s * 9.0, -0.4, BACK_Z + 1.0], 0.028);
    stayFoot(well, s * 10.5, W, BACK_Z - 9.0, 0, mastZ, 0.9, `mast-stay-${s > 0 ? 'stbd' : 'port'}`);
  }

  /* ================================================ 艉楼前舱壁与两部楼梯 */
  const front = add(root, new THREE.Group()); front.name = 'poop-front';
  {
    const HB = halfBeam(POOP_Z) - BW_IN, STEP = P - W;
    const DOORS = [-4.0, 4.0], DW = 1.2, DH = 2.0;
    const zc = POOP_Z - 0.15;
    const cuts = [-HB, DOORS[0] - DW / 2, DOORS[0] + DW / 2, DOORS[1] - DW / 2, DOORS[1] + DW / 2, HB];
    for (let i = 0; i < cuts.length; i += 2) {
      const a = cuts[i], b = cuts[i + 1];
      add(front, put(box(b - a, STEP - 0.02, 0.3, white), (a + b) / 2, W + (STEP - 0.02) / 2, zc));
      proxy(front, new THREE.BoxGeometry(b - a + (i === 0 || i === 4 ? 0.3 : 0), STEP - 0.02, 0.3),
        (a + b) / 2 + (i === 0 ? -0.15 : i === 4 ? 0.15 : 0), W + (STEP - 0.02) / 2, zc, 0, 'bulkhead');
    }
    for (const dx of DOORS) {
      add(front, put(box(DW, STEP - DH - 0.02, 0.3, white), dx, W + DH + (STEP - DH - 0.02) / 2, zc));
      closedDoorway(front, dx, POOP_Z, -1, DW, DH, 2.0, `poop-door-${dx > 0 ? 'stbd' : 'port'}`);
    }
    // 舱壁顶的木护条
    add(front, put(box(2 * HB, 0.08, 0.34, wood), 0, P - 0.06, zc));

    // 艉楼前缘防坠栏杆（仅梯口开口）
    const gap0 = STAIR.x - STAIR.width / 2 - 0.05, gap1 = STAIR.x + STAIR.width / 2 + 0.05;
    const rz = POOP_Z - 0.15;
    const segs = [[-HB + 0.07, -gap1, -0.25], [-gap0, gap0, 0], [gap1, HB - 0.07, 0.25]];
    for (const [a, b, ext] of segs) {
      const len = b - a, cx = (a + b) / 2;
      add(front, put(box(len, 0.07, 0.16, wood), cx, P + 1.02, rz));
      for (const y of [0.38, 0.70]) add(front, put(cyl(0.022, 0.022, len, 6, trimM).rotateZ(Math.PI / 2), cx, P + y, rz));
      const n = Math.max(2, Math.round(len / 1.4) + 1);
      for (let i = 0; i < n; i++) add(front, put(cyl(0.03, 0.03, 1.0, 8, trimM), a + 0.05 + (len - 0.1) * i / (n - 1), P + 0.5, rz));
      proxy(front, new THREE.BoxGeometry(len + Math.abs(ext), 1.45, 0.24), cx + ext / 2, P + 0.625, rz, 0, 'guard-rail');
    }

    // 两部楼梯：朝艉上升，12 级踢面 × 0.217 m，踏步深 0.30 m，净宽 1.4 m，两侧挡板+扶手
    for (const s of [-1, 1]) {
      const st = add(front, new THREE.Group()); st.name = `stair-${s > 0 ? 'stbd' : 'port'}`;
      const x = s * STAIR.x, w = STAIR.width;
      for (let k = 1; k < STAIR.risers; k++) {
        const zFront = STAIR_FOOT_Z - (k - 1) * STAIR.going;       // 朝艏的前沿
        const h = k * RISE;
        const m = put(box(w, h, STAIR.going, trimM), x, W + h / 2, zFront - STAIR.going / 2);
        solid(st, m, 'stair-step');
        m.userData.side = s > 0 ? 'stbd' : 'port';
        add(st, put(box(w, 0.03, STAIR.going - 0.02, teak), x, W + h + 0.015, zFront - STAIR.going / 2));
        for (const e of [-1, 1]) {
          const ph = h + 0.95;
          const cheek = put(box(0.08, ph, STAIR.going, white), x + e * (w / 2 + 0.04), W + ph / 2, zFront - STAIR.going / 2);
          solid(st, cheek, 'stair-cheek');
        }
      }
      for (const e of [-1, 1]) {
        const x0 = x + e * (w / 2 + 0.04);
        const zA = STAIR_FOOT_Z + 0.1, zB = POOP_Z;
        const yA = W + RISE + 1.0, yB = P + 1.0;
        const L = Math.hypot(zA - zB, yA - yB);
        const hr = cyl(0.04, 0.04, L, 8, wood);
        hr.position.set(x0, (yA + yB) / 2, (zA + zB) / 2);
        hr.rotation.x = Math.atan2(zB - zA, yB - yA);
        add(st, hr);
      }
    }
  }

  /* ================================================ 艉楼甲板 */
  const poop = add(root, new THREE.Group()); poop.name = 'poop-deck';
  solid(poop, taperedDeck(THREE, TAIL_Z, POOP_Z, P, teak, 30), 'floor');
  add(poop, bulwarkOn(THREE, tailWrap(POOP_Z, BW_IN, 72), P, 1.08, white, wood, collide));

  /* ---------- 靠泊桥（保留为不开放的高台：立柱与直梯均挡人） ---------- */
  {
    const bz = POOP_Z - 3.2, by = P + 2.6;
    for (const sx of [-2.9, 0, 2.9]) {
      for (const dz of [-0.9, 0.9]) {
        poop.add(put(cyl(0.075, 0.09, 2.6, 8, trimM), sx, P + 1.3, bz + dz));
        proxy(poop, new THREE.CylinderGeometry(0.14, 0.14, 2.2, 8), sx, P + 1.1, bz + dz, 0, 'bridge-pillar');
        obstacles.push({ id: `bridge-pillar-${sx}-${dz}`, kind: 'post', center: [sx, P, bz + dz], r: 0.14 });
      }
    }
    poop.add(put(box(6.8, 0.14, 2.4, trimM), 0, by, bz));
    for (const s of [-1, 1]) poop.add(put(box(0.12, 1.00, 2.4, white), s * 3.4, by + 0.58, bz));
    poop.add(put(box(6.8, 1.00, 0.12, white), 0, by + 0.58, bz - 1.2));
    poop.add(put(box(7.0, 0.08, 0.26, wood), 0, by + 1.12, bz - 1.2));
    poop.add(put(cyl(0.10, 0.16, 0.95, 12, brass), -1.1, by + 0.48, bz + 0.3));
    const head = cyl(0.24, 0.24, 0.14, 18, brass); head.rotation.x = Math.PI / 2;
    poop.add(put(head, -1.1, by + 1.05, bz + 0.3));
    poop.add(put(cyl(0.11, 0.15, 0.8, 12, wood), 1.1, by + 0.40, bz + 0.3));
    poop.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 26), wood), 1.1, by + 0.92, bz + 0.3));
    for (let i = 0; i < 8; i++) {
      poop.add(put(cyl(0.018, 0.018, 0.42, 6, trimM).rotateZ(Math.PI / 2), 3.3, P + 0.3 + i * 0.32, bz + 1.0));
    }
    for (const sx of [3.07, 3.53]) poop.add(put(cyl(0.025, 0.025, 2.7, 6, trimM), sx, P + 1.35, bz + 1.0));
    proxy(poop, new THREE.BoxGeometry(0.62, 2.2, 0.25), 3.3, P + 1.1, bz + 1.0, 0, 'bridge-ladder');
    obstacles.push({ id: 'bridge-ladder', kind: 'post', center: [3.3, P, bz + 1.0], r: 0.12 });
  }

  /* ---------- 系缆桩、绞缆机 ---------- */
  for (const s of [-1, 1]) {
    const n = s > 0 ? 'stbd' : 'port';
    for (const z of [POOP_Z - 5.5, POOP_Z - 14.0, TAIL_Z + 7.0]) {
      const b = new THREE.Group();
      b.add(put(box(1.0, 0.18, 0.6, machine), 0, 0.09, 0));
      for (const sx of [-0.3, 0.3]) {
        b.add(put(cyl(0.135, 0.155, 0.78, 12, machine), sx, 0.48, 0));
        b.add(put(cyl(0.175, 0.175, 0.07, 12, machine), sx, 0.88, 0));
      }
      const bx = s * Math.max(1.2, halfBeam(z) - 1.5);
      b.position.set(bx, P, z);
      poop.add(b);
      proxy(poop, new THREE.BoxGeometry(1.05, 1.4, 0.65), bx, P + 0.7, z, 0, 'bollard');
      obstacles.push({ id: `bollard-${n}-${z}`, kind: 'box', center: [bx, P, z], half: [0.52, 0.32] });
    }
    const cap = new THREE.Group();
    cap.add(put(box(2.10, 0.10, 1.70, machine), 0, 0.05, 0));
    cap.add(put(cyl(0.62, 0.74, 0.32, 16, machine), 0, 0.26, 0));
    cap.add(put(cyl(0.40, 0.52, 0.78, 16, machine), 0, 0.80, 0));
    cap.add(put(cyl(0.56, 0.56, 0.10, 16, machine), 0, 1.23, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      cap.add(put(box(0.07, 0.42, 0.07, machine), Math.cos(a) * 0.46, 0.82, Math.sin(a) * 0.46));
    }
    cap.add(put(box(0.62, 0.54, 0.86, machine), s * 0.92, 0.37, 0));
    cap.add(put(cyl(0.17, 0.17, 0.30, 12, machine).rotateZ(Math.PI / 2), s * 0.92, 0.52, 0.36));
    const lever = cyl(0.030, 0.042, 0.92, 8, trimM);
    lever.rotation.z = s * 0.34;
    cap.add(put(lever, -s * (0.86 + Math.sin(0.34) * 0.46), 0.52 + (Math.cos(0.34) * 0.92) / 2, 0.30));
    cap.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 8), brass),
      -s * (0.86 + Math.sin(0.34) * 0.92), 0.52 + Math.cos(0.34) * 0.92, 0.30));
    cap.add(put(box(0.26, 0.16, 0.26, machine), -s * 0.86, 0.44, 0.30));
    cap.position.set(s * 5.0, P, POOP_Z - 9.5);
    poop.add(cap);
    proxy(poop, new THREE.BoxGeometry(2.5, 1.4, 1.8), s * 5.0, P + 0.7, POOP_Z - 9.5, 0, 'capstan');
    obstacles.push({ id: `capstan-${n}`, kind: 'box', center: [s * 5.0, P, POOP_Z - 9.5], half: [1.25, 0.9] });
  }

  /* ---------- 通风筒 ---------- */
  const cowl = (x, z, r, h, dir, ry, id) => {
    const v = new THREE.Group();
    const A = 0.95, ax = dir * A, ca = Math.cos(A), sa = dir * Math.sin(A);
    v.add(put(cyl(r * 0.54, r * 0.62, h, 14, machine), 0, h / 2, 0));
    const neck = cyl(r * 0.62, r * 0.54, 0.82, 14, machine); neck.rotation.x = ax;
    v.add(put(neck, 0, h + ca * 0.38, sa * 0.38));
    const mouth = cyl(r, r * 0.62, 0.54, 16, machine, true); mouth.rotation.x = ax;
    mouth.material = machine.clone(); mouth.material.side = THREE.DoubleSide;
    v.add(put(mouth, 0, h + ca * 1.02, sa * 1.02));
    const inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 16), cowlRed);
    inner.rotation.x = ax - Math.PI / 2;
    v.add(put(inner, 0, h + ca * 0.97, sa * 0.97));
    v.position.set(x, P, z);
    if (ry) v.rotation.y = ry;
    poop.add(v);
    proxy(poop, new THREE.BoxGeometry(0.9, 2.6, 1.5), x, P + 1.3, z + 0.35, ry, 'cowl');
    obstacles.push({ id, kind: 'post', center: [x, P, z], r: 0.4 });
  };
  for (const s of [-1, 1]) cowl(s * 6.2, POOP_Z - 12.0, 0.40, 1.70, 1, s * 0.16, `cowl-${s > 0 ? 'stbd' : 'port'}`);

  /* ---------- 艉旗杆 ---------- */
  const fz = TAIL_Z + 1.6;
  poop.add(put(cyl(0.06, 0.11, 5.4, 10, trimM), 0, P + 2.7, fz));
  poop.add(put(cyl(0.22, 0.26, 0.2, 12, machine), 0, P + 0.1, fz));
  poop.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), brass), 0, P + 5.5, fz));
  proxy(poop, new THREE.CylinderGeometry(0.28, 0.28, 2.2, 10), 0, P + 1.1, fz, 0, 'flagstaff');
  obstacles.push({ id: 'flagstaff', kind: 'post', center: [0, P, fz], r: 0.28 });
  for (const s of [-1, 1]) {
    stay(poop, [0, P + 5.2, fz], [s * 3.0, P + 0.6, TAIL_Z + 4.5], 0.018);
    stayFoot(poop, s * 3.0, P, TAIL_Z + 4.5, 0, fz, 1.3, `flag-stay-${s > 0 ? 'stbd' : 'port'}`);
  }
  // 主桅拉向艉楼中线的拉索落脚
  stayFoot(poop, 0, P, POOP_Z - 9.0, 0, mastZ, 0.8, 'mast-stay-poop');

  /* ---------- userData ---------- */
  root.userData.collide = collide;
  root.userData.ports = PORTS.map(p => ({ ...p, foot: [...p.foot], facing: [...p.facing] }));
  root.userData.routes = ROUTES.map(r => ({
    id: r.id, name: r.name, portIds: [...r.portIds],
    points: r.points.map(q => [...q.p]),
    stops: r.points.map((q, i) => (q.port || q.label) ? { index: i, port: q.port || null, label: q.label || null } : null).filter(Boolean),
  }));
  root.userData.start = { foot: [...START.foot], yaw: START.yaw };
  root.userData.obstacles = obstacles;
  root.userData.stair = { x: STAIR.x, width: STAIR.width, risers: STAIR.risers, rise: RISE, going: STAIR.going, footZ: STAIR_FOOT_Z, topZ: POOP_Z };
  root.userData.region = 'C65-R1 aft open deck';
  return root;
}

/* ================================================================ 几何函数（移植自冻结 stern.js） */

function taperedDeck(THREE, z0, z1, y, mat, segs = 28) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const z = z0 + ((z1 - z0) * i) / segs;
    const b = Math.max(0.3, halfBeam(z));
    pos.push(-b, y, z, b, y, z);
    uv.push(z / 4.8, -b / 4.8, z / 4.8, b / 4.8);
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

const UVM = 1 / 2.5;

function loftRibbon(THREE, path, section, y0, mat, opts = {}) {
  const { closedSection = false, capEnds = true } = opts;
  const N = path.length, S = section.length;
  if (N < 2 || S < 2) return null;
  const pos = [], uv = [], idx = [];
  const arc = [0];
  for (let i = 1; i < N; i++) arc.push(arc[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z));
  const emit = (p, s) => pos.push(p.x + s.u * p.nx, y0 + s.v, p.z + s.u * p.nz);
  const at = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  const cross = (a, b, c) => {
    const A = at(a), B = at(b), C = at(c);
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const edges = [];
  for (let k = 0; k + 1 < S; k++) edges.push([section[k], section[k + 1]]);
  if (closedSection) edges.push([section[S - 1], section[0]]);
  let vAcc = 0;
  for (const [sa, sb] of edges) {
    const du = sb.u - sa.u, dv = sb.v - sa.v;
    const segLen = Math.hypot(du, dv) || 1e-3;
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
    const dx = c.x - a.x, dz = c.z - a.z;
    const L = Math.hypot(dx, dz) || 1e-4;
    let nx = dz / L, nz = -dx / L;
    if (nx * p.x + nz * (p.z - refZ) < 0) { nx = -nx; nz = -nz; }
    return { x: p.x, z: p.z, nx, nz };
  });
}

function tailWrap(z0, inset, segs = 72, end = 0.012) {
  const span = z0 - TAIL_Z;
  const u0 = Math.pow(end / span, 0.42);
  const zAt = (u) => TAIL_Z + span * Math.pow(u, 1 / 0.42);
  const b = (z) => Math.max(0.12, halfBeam(z) - inset);
  const zs = [];
  for (let i = 0; i <= segs; i++) zs.push(zAt(u0 + ((1 - u0) * i) / segs));
  const pts = [];
  for (let i = segs; i >= 0; i--) pts.push({ x: -b(zs[i]), z: zs[i] });
  for (let i = 0; i <= segs; i++) pts.push({ x: b(zs[i]), z: zs[i] });
  return withNormals(pts, z0 + 2);
}

function railGuard(THREE, path, y, h, g, collide, step = 2.6) {
  const D = 0.40, OFF = D / 2 - 0.07, H = h + 0.5;
  const INVIS = new THREE.MeshBasicMaterial({ visible: false });
  let i0 = 0, acc = 0;
  for (let i = 1; i < path.length; i++) {
    acc += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
    const turned = path[i0].nx * path[i].nx + path[i0].nz * path[i].nz < 0.94;
    if (i < path.length - 1 && acc < step && !turned) continue;
    const a = path[i0], b = path[i];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 0.02) continue;
    let nx = a.nx + b.nx, nz = a.nz + b.nz;
    const NL = Math.hypot(nx, nz) || 1;
    const w = new THREE.Mesh(new THREE.BoxGeometry(L * 1.10, H, D), INVIS);
    w.position.set((a.x + b.x) / 2 + (nx / NL) * OFF, y + h / 2, (a.z + b.z) / 2 + (nz / NL) * OFF);
    w.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    w.userData.role = 'bulwark-guard';
    g.add(w); collide.push(w);
    i0 = i; acc = 0;
  }
}

function bulwarkOn(THREE, path, y, h, mat, capMat, collide) {
  const g = new THREE.Group();
  const T = 0.07, CW = 0.15, CH = 0.10;
  g.add(loftRibbon(THREE, path, [{ u: -T, v: 0 }, { u: -T, v: h }, { u: T, v: h }, { u: T, v: 0 }], y, mat));
  g.add(loftRibbon(THREE, path, [{ u: -CW, v: 0 }, { u: -CW, v: CH }, { u: CW, v: CH }, { u: CW, v: 0 }], y + h, capMat, { closedSection: true }));
  railGuard(THREE, path, y, h, g, collide);
  return g;
}

function bulwark(THREE, z0, z1, y, h, mat, capMat, segs, inset, collide) {
  const g = new THREE.Group();
  for (const side of [-1, 1]) g.add(bulwarkOn(THREE, edgePath(z0, z1, segs, side, inset), y, h, mat, capMat, collide));
  return g;
}

/* ================================================================ 程序纹理（无 DOM 依赖） */

function makeTeakTexture(THREE) {
  const N = 512, data = new Uint8Array(N * N * 4);
  const plank = 16;                       // 0.15 m / 4.8 m × 512
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // 预先转为线性值并以 NoColorSpace 上传：sRGB8_ALPHA8 的自动 mipmap 在部分 ANGLE Metal 驱动上会生成全黑层级
  const lin = (v) => Math.round(255 * Math.pow(Math.min(255, v) / 255, 2.2));
  const rowTone = [], rowOff = [];
  for (let r = 0; r < N / plank; r++) { rowTone.push(0.86 + rnd() * 0.22); rowOff.push(Math.floor(rnd() * N)); }
  for (let v = 0; v < N; v++) {
    const r = Math.floor(v / plank), inRow = v % plank;
    for (let u = 0; u < N; u++) {
      const i = (v * N + u) * 4;
      let k = rowTone[r] * (0.94 + 0.06 * Math.sin((u + rowOff[r]) * 0.09 + r));
      if (inRow === 0) k *= 0.35;                              // 捻缝
      if (((u + rowOff[r]) % 320) < 2) k *= 0.45;              // 板端对接
      data[i] = lin(168 * k); data[i + 1] = lin(120 * k); data[i + 2] = lin(78 * k); data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

let _signMat = null;
function signMaterial(THREE, fallback) {
  if (_signMat) return _signMat;
  if (typeof document === 'undefined') return fallback;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const x = c.getContext('2d');
  x.fillStyle = '#b3261e'; x.fillRect(0, 0, 256, 96);
  x.strokeStyle = '#ffffff'; x.lineWidth = 6; x.strokeRect(5, 5, 246, 86);
  x.fillStyle = '#ffffff'; x.font = 'bold 54px "PingFang SC","Heiti SC",sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('未开放', 128, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  return _signMat;
}
