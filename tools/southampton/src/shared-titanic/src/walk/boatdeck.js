import * as THREE from 'three';
import { getMaterial, uvBox, uvCyl, uvPlane, TILE } from './materials.js';
import { buildBridge } from './bridge.js';
import { buildBow } from './bow.js';
import { buildStern } from './stern.js';
import { buildStaircase, WELL } from './staircase.js';
import { flattenProto } from './bake.js';
import { furnitureCollision } from './interior/furniture-collision.js';

/**
 * 救生艇甲板——可行走版本。
 *
 * 和 ship.js 里那套完全不同的东西：那套是给 200 米外的剪影用的，
 * 这套是给 2 米视距用的。同一个构件在两边的做法没有可比性——
 * 比如栏杆，远景里是三根细杆，这里是立柱 + 底座法兰 + 螺栓 +
 * 三道横杆 + 柚木扶手，因为走过去时你会看见它们。
 *
 * 布局按奥林匹克级的实际配置：
 *   艏端  舰桥 / 舵机室 / 高级船员舱 / 马可尼无线电室
 *   其后  1 号烟囱、前部大楼梯玻璃穹顶、健身房
 *   舯部  2、3 号烟囱
 *   艉部  4 号通风假囱、后部大楼梯入口
 * 两舷各留约 6 米宽的通道，救生艇沿通道外侧成列。
 */

const DECK_Y = 0;            // 本模块自成坐标系，甲板面为 y=0；装配时整体抬到船上
const DECK_HALF_W = 13.0;    // 甲板半宽
const FWD = 88;              // 甲板前缘 z
const AFT = -46;             // 甲板后缘 z
const HOUSE_HALF_W = 7.0;    // 中央舱室半宽——两舷各留 6 m 通道

/**
 * 中央舱室两舷的门洞（z 区间，两舷对称）。
 *
 * 必须是全模块共用的一份数据：墙按它切段（buildDeckhouse），
 * 碰撞代理也按它断开（buildWalkableBoatDeck）。
 * 这两处原来各写各的常数，加一道门就得记着改两个地方——
 * 漏一处的后果是门看得见走不进去，比没有门更糟。
 * 按 z 从小到大排列，切墙的时候是顺着走的。
 */
const HOUSE_DOORS = [
  { z0: 10.8, z1: 13.2 },   // 高级船员起居区
  { z0: 42.5, z1: 45.5 },   // 健身房
  { z0: 68.0, z1: 71.2 },   // 前部大楼梯门厅
];
const DECK_TILE = 5.0;       // 甲板贴图一格 5 米：柚木每段约 5 m，接头缝正好落在格边

/* ---------------------------------------------- 中央舱室的一份尺寸 */

/**
 * 舱壁与窗洞的尺寸只写这一处。
 *
 * 墙要按窗洞切段、玻璃要嵌进洞里、室内（`interior/rooms/deckhouse-boat.js`）
 * 那一排窗也照着同一个 z 排——三处各写各的常数就会出现
 * 「外面开了洞、里面对着墙」。
 *
 * 舱壁钢板厚 0.22，这个厚度【就是】窗洞的进深：窗扇退进去 0.07，
 * 剩下的 0.15 是能看见的窗套内侧。原来的做法是把一个 0.14 m 深的
 * 窗套整件贴在墙【外面】，从斜侧看是一块浮在白墙外的补丁。
 */
const HOUSE_Z0 = -30, HOUSE_Z1 = 74;
const HOUSE_H = 2.95;        // 舱壁净高
const WALL_T = 0.22;         // 舱壁钢板厚
const WIN_STEP = 2.35;       // 窗间距
const WIN_W = 0.84;          // 窗洞宽（沿 z）
const WIN_H = 0.92;          // 窗洞高
const WIN_Y = 1.68;          // 洞心高：正好是站着平视的高度
const DOOR_H = 2.35;         // 门洞净高
/** 画在舱壁上的柚木门扇（不是通道口，只是门）。 */
const DOOR_ZS = [-24, -6, 18, 66];

/** 舷侧舱壁上方窗的中心 z。墙的切段、玻璃、室内那排窗共用这一份。 */
function houseWindowZs() {
  const out = [];
  for (let z = HOUSE_Z0 + 3; z < HOUSE_Z1 - 3; z += WIN_STEP) {
    if (DOOR_ZS.some((d) => Math.abs(z - d) < 1.3)) continue;
    // 让开三道真门洞：窗洞半宽 0.42，再留一点余量
    if (HOUSE_DOORS.some((d) => z > d.z0 - 0.9 && z < d.z1 + 0.9)) continue;
    out.push(z);
  }
  return out;
}

/** 顺手的构造函数。 */
// 每个箱体/圆柱在建出来的一刻就按真实尺寸铺 UV，
// 免得某一处忘了配 repeat 就出现一片被抹成条纹的表面。
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

/* ------------------------------------------------------ 甲板面 */

/**
 * 柚木甲板。UV 按【真实尺度】铺：贴图一格 2 米、每格 13 条板，
 * 也就是板宽 15 cm。这个比例错了，整片甲板一眼就假——
 * 人对脚下木板的宽度有非常强的直觉。
 */
function buildDeckPlate(mats) {
  const g = new THREE.Group();
  const m = getMaterial('teak', { tileMeters: DECK_TILE });

  /**
   * 一块矩形甲板。UV 按【真实尺度】铺：贴图一格 5 米、每格 33 条板，
   * 也就是板宽 15 cm。这个比例错了，整片甲板一眼就假——
   * 人对脚下木板的宽度有非常强的直觉。
   *
   * 注意 u 沿船长（木纹方向）、v 沿船宽（板缝方向），而且 UV 用的是
   * 世界坐标而不是 0..1，这样四块拼起来板缝是连续的，看不出接缝。
   */
  const patch = (x0, x1, z0, z1) => {
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 2, Math.max(2, Math.round((z1 - z0) / 6)));
    geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    const pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const wx = pos.getX(i) + (x0 + x1) / 2;
      const wz = pos.getZ(i) + (z0 + z1) / 2;
      uv.setXY(i, wz / DECK_TILE, wx / DECK_TILE);
    }
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set((x0 + x1) / 2, DECK_Y, (z0 + z1) / 2);
    mesh.receiveShadow = true;
    mesh.name = 'DeckPlate';
    g.add(mesh);
    return mesh;
  };

  // 楼梯井在甲板中央开了一个洞，甲板面绕着它切成四块
  const HW = DECK_HALF_W;
  patch(-HW, HW, WELL.z1, FWD);
  patch(-HW, HW, AFT, WELL.z0);
  patch(-HW, WELL.x0, WELL.z0, WELL.z1);
  patch(WELL.x1, HW, WELL.z0, WELL.z1);

  // 舷边的水沟与踢脚：甲板边缘不是一条干净的线
  const steel = getMaterial('paintedSteel', { color: '#d8d3c6' });
  const len = FWD - AFT;
  for (const s of [-1, 1]) {
    g.add(put(box(0.5, 0.09, len, steel), s * (DECK_HALF_W - 0.25), 0.045, (FWD + AFT) / 2));
  }
  return g;
}

/* -------------------------------------------------------- 栏杆 */

/**
 * 舷边栏杆。
 *
 * 近看的要点全在细节：立柱不是光杆，底部有法兰盘和四颗螺栓；
 * 三道横杆穿过立柱上的孔；顶上是一根柚木扶手，手扶的位置磨得发亮。
 * 立柱用实例化——四百多根，逐个建 Mesh 会把 draw call 打满。
 */
function buildRailings(mats) {
  const g = new THREE.Group();
  const steel = getMaterial('paintedSteel', { color: '#e2ddd0' });
  const teak = getMaterial('teak', {});
  const brass = getMaterial('brass', {});

  const H = 1.12;
  const step = 1.55;
  const len = FWD - AFT - 2;
  const n = Math.floor(len / step);

  // 立柱：主杆 + 法兰 + 螺栓，合成一个几何体再实例化
  const postGeo = (() => {
    const parts = [];
    const shaft = new THREE.CylinderGeometry(0.032, 0.038, H, 10);
    shaft.translate(0, H / 2, 0);
    parts.push(shaft);
    const flange = new THREE.CylinderGeometry(0.085, 0.095, 0.05, 12);
    flange.translate(0, 0.025, 0);
    parts.push(flange);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const b = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 6);
      b.translate(Math.cos(a) * 0.062, 0.062, Math.sin(a) * 0.062);
      parts.push(b);
    }
    // 球形柱头
    const cap = new THREE.SphereGeometry(0.042, 10, 8);
    cap.translate(0, H, 0);
    parts.push(cap);
    return mergeGeos(parts);
  })();

  for (const s of [-1, 1]) {
    const inst = new THREE.InstancedMesh(postGeo, steel, n + 1);
    inst.castShadow = true;
    const mtx = new THREE.Matrix4();
    for (let i = 0; i <= n; i++) {
      mtx.makeTranslation(s * (DECK_HALF_W - 0.42), DECK_Y, AFT + 1 + i * step);
      inst.setMatrixAt(i, mtx);
    }
    inst.instanceMatrix.needsUpdate = true;
    g.add(inst);

    // 三道横杆
    for (const hy of [H * 0.34, H * 0.62, H * 0.86]) {
      const bar = cyl(0.019, 0.019, len, 8, steel);
      bar.rotation.x = Math.PI / 2;
      g.add(put(bar, s * (DECK_HALF_W - 0.42), DECK_Y + hy, (FWD + AFT) / 2));
    }
    // 柚木扶手
    const cap = box(0.11, 0.055, len, teak);
    g.add(put(cap, s * (DECK_HALF_W - 0.42), DECK_Y + H + 0.03, (FWD + AFT) / 2));
  }
  // 艉端落差护栏：与两舷相接，船内/后井甲板另有入口。
  const edgeZ = AFT + 0.1, edgeX = DECK_HALF_W - 0.42;
  for (let i = 0; i <= 18; i++) {
    g.add(put(cyl(0.032, 0.038, H, 10, steel), -edgeX + 2 * edgeX * i / 18, H / 2, edgeZ));
  }
  for (const hy of [H * 0.34, H * 0.62, H * 0.86]) {
    g.add(put(cyl(0.019, 0.019, 2 * edgeX, 8, steel).rotateZ(Math.PI / 2), 0, hy, edgeZ));
  }
  g.add(put(box(2 * edgeX, 0.055, 0.11, teak), 0, H + 0.03, edgeZ));
  return g;
}

/** 把一组 BufferGeometry 合成一个（自带简化版，避免再引一个 addon）。 */
function mergeGeos(list) {
  let pos = [], nor = [], uv = [], idx = [], off = 0;
  for (const g of list) {
    const gg = g.index ? g.toNonIndexed() : g;
    const p = gg.attributes.position.array;
    const nn = gg.attributes.normal ? gg.attributes.normal.array : null;
    const uu = gg.attributes.uv ? gg.attributes.uv.array : null;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    if (nn) for (let i = 0; i < nn.length; i++) nor.push(nn[i]);
    if (uu) for (let i = 0; i < uu.length; i++) uv.push(uu[i]);
    off += p.length / 3;
    gg.dispose?.();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (nor.length === pos.length) out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  else out.computeVertexNormals();
  if (uv.length / 2 === pos.length / 3) out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/* ---------------------------------------------------- 中央舱室 */

/**
 * 中央的高级船员舱与公共舱室外壁。
 * 关键是「墙不是一块板」：有踢脚、有腰线、有门框、有窗框、有排水管，
 * 还有一整排铆钉——铆钉走法线图，不占几何。
 */
function buildDeckhouse() {
  const g = new THREE.Group();
  const SUPER = { plateH: 0.52, plateW: 0.82, inout: 0.004, wearAmt: 0.45, grime: 0.10, seam: 0.6 };
  const wall = getMaterial('paintedSteel', { color: '#e6e1d4', ...SUPER });
  const trim = getMaterial('paintedSteel', { color: '#d6d0c0', ...SUPER });
  const teak = getMaterial('teak', { trim: true });
  const brass = getMaterial('brass', {});
  const glass = getMaterial('glass', {});

  const H = HOUSE_H;
  const z0 = HOUSE_Z0, z1 = HOUSE_Z1;
  const len = z1 - z0;
  const curtainM = getMaterial('paint', { color: '#d8cfb8' });
  const sash = getMaterial('teak', { trim: true });
  const winZs = houseWindowZs();

  /** 一段舱壁钢板。墙是由这些段拼起来的，洞就是「没有段的地方」。 */
  const panel = (s, za, zb, y0, y1) => {
    if (zb - za < 0.005 || y1 - y0 < 0.005) return;
    g.add(put(box(WALL_T, y1 - y0, zb - za, wall),
      s * HOUSE_HALF_W, (y0 + y1) / 2, (za + zb) / 2));
  };

  /**
   * 两舷的长墙。
   *
   * 墙沿 z 被切成一串段：门洞（到 DOOR_H 为止空着）、窗洞（窗台以下和
   * 窗头以上各留一段）、其余是整高的板。这样窗洞的四个侧面就是
   * **钢板本身的断面**——从斜侧掠过去看得见 0.22 m 的进深，
   * 而不是一圈浮在墙外的框。
   *
   * 上一版是「整墙 + 贴在外面的窗套」：从正面看还行，
   * 稍微一斜就是一块贴上去的补丁，连影子都投在白墙上。
   */
  const doorWood = getMaterial('teak', { trim: true });
  for (const s of [-1, 1]) {
    const cuts = [];
    for (const d of HOUSE_DOORS) cuts.push({ z0: d.z0, z1: d.z1, door: true });
    for (const z of winZs) cuts.push({ z0: z - WIN_W / 2, z1: z + WIN_W / 2, door: false });
    cuts.sort((a, b) => a.z0 - b.z0);

    let cur = z0;
    for (const c of cuts) {
      if (c.z0 > cur) panel(s, cur, c.z0, 0, H);
      if (c.door) {
        panel(s, c.z0, c.z1, DOOR_H, H);                       // 过梁
        // 门洞两侧与上沿的柚木门套
        g.add(put(box(0.30, 0.16, c.z1 - c.z0 + 0.3, doorWood),
          s * HOUSE_HALF_W, DOOR_H, (c.z0 + c.z1) / 2));
        for (const dz of [c.z0, c.z1]) {
          g.add(put(box(0.30, DOOR_H, 0.16, doorWood), s * HOUSE_HALF_W, DOOR_H / 2, dz));
        }
      } else {
        panel(s, c.z0, c.z1, 0, WIN_Y - WIN_H / 2);            // 窗台以下
        panel(s, c.z0, c.z1, WIN_Y + WIN_H / 2, H);            // 窗头以上
      }
      cur = Math.max(cur, c.z1);
    }
    if (cur < z1) panel(s, cur, z1, 0, H);
  }
  g.add(put(box(HOUSE_HALF_W * 2, H, WALL_T, wall), 0, H / 2, z1));
  g.add(put(box(HOUSE_HALF_W * 2, H, WALL_T, wall), 0, H / 2, z0));
  // 顶板（上面是罗经甲板，不可走，但有厚度）
  g.add(put(box(HOUSE_HALF_W * 2 + 0.5, 0.28, len + 0.5, trim), 0, H + 0.14, (z0 + z1) / 2));
  // 腰线与踢脚——让墙有分层，不是一块平板
  for (const s of [-1, 1]) {
    g.add(put(box(0.08, 0.12, len, trim), s * (HOUSE_HALF_W + 0.11), 0.22, (z0 + z1) / 2));
    g.add(put(box(0.06, 0.07, len, trim), s * (HOUSE_HALF_W + 0.11), H - 0.42, (z0 + z1) / 2));
  }

  /**
   * 窗里的东西。
   *
   * 洞已经是真的洞了，这里往洞里装：
   *   · 窗帘板贴在舱壁【内】表面，把洞的另一头堵上。
   *     没有它的话，健身房那一段还好（室内自己有窗），
   *     其余九十米的舱室是空的，一眼能从这舷看穿到那舷。
   *   · 玻璃退进外表面 0.07 m——这 7 cm 是「凹进去」读得出来的全部原因。
   *   · 柚木窗扇做成四条边框加一条中梃，不是一块板；
   *     实心板会把窗帘板整个挡住，等于白开了洞。
   *   · 外面只留一条滴水窗台，探出 3 cm。
   *
   * 全部是轴对齐的盒子，两舷各建一次，不做任何镜像。
   */
  const XO = HOUSE_HALF_W + WALL_T / 2;    // 舱壁外表面 7.11
  const XI = HOUSE_HALF_W - WALL_T / 2;    // 舱壁内表面 6.89
  for (const z of winZs) {
    for (const s of [-1, 1]) {
      // 窗帘板：厚 0.02，贴内表面往外一点，正好塞在洞里
      g.add(put(box(0.02, WIN_H + 0.01, WIN_W + 0.01, curtainM), s * (XI + 0.012), WIN_Y, z));
      // 玻璃
      g.add(put(box(0.016, WIN_H - 0.055, WIN_W - 0.055, glass), s * (XO - 0.075), WIN_Y, z));
      // 柚木窗扇：上下冒头 + 两条边梃 + 一条中梃
      const gx = s * (XO - 0.055);
      for (const sy of [-1, 1]) {
        g.add(put(box(0.045, 0.05, WIN_W - 0.02, sash), gx, WIN_Y + sy * (WIN_H / 2 - 0.035), z));
      }
      for (const sz of [-1, 1]) {
        g.add(put(box(0.045, WIN_H - 0.02, 0.05, sash), gx, WIN_Y, z + sz * (WIN_W / 2 - 0.035)));
      }
      g.add(put(box(0.042, WIN_H - 0.09, 0.035, sash), gx, WIN_Y, z));
      // 滴水窗台：唯一探出墙面的一件，3 cm
      g.add(put(box(0.09, 0.045, WIN_W + 0.14, trim), s * (XO + 0.015), WIN_Y - WIN_H / 2 - 0.028, z));
    }
  }

  // 门：柚木门扇 + 黄铜把手 + 舷窗形观察窗 + 门槛
  for (const z of DOOR_ZS) {
    for (const s of [-1, 1]) {
      const d = new THREE.Group();
      d.add(put(box(0.10, 2.05, 0.92, trim), 0, 1.03, 0));          // 门框
      d.add(put(box(0.07, 1.92, 0.80, teak), 0.035, 1.00, 0));      // 门扇
      const win = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), glass);
      win.rotation.y = Math.PI / 2;
      d.add(put(win, 0.075, 1.48, 0));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.028, 6, 16), brass);
      ring.rotation.y = Math.PI / 2;
      d.add(put(ring, 0.078, 1.48, 0));
      const handle = cyl(0.022, 0.022, 0.16, 8, brass);
      handle.rotation.z = Math.PI / 2;
      d.add(put(handle, 0.10, 0.98, 0.30));
      d.add(put(box(0.30, 0.06, 0.95, brass), 0, 0.03, 0));          // 门槛
      d.position.set(s * (HOUSE_HALF_W + 0.05), 0, z);
      d.rotation.y = s > 0 ? 0 : Math.PI;
      g.add(d);
    }
  }
  return g;
}

/* --------------------------------------------------- 大楼梯穹顶 */

/**
 * 前部大楼梯的玻璃穹顶。
 * 这是艇甲板上最有辨识度的一件——锻铁骨架撑着弧形玻璃，
 * 底下就是那道著名的楼梯。走到它旁边能看见里面的吊灯光。
 */
function buildStaircaseDome() {
  const g = new THREE.Group();
  const iron = getMaterial('paintedSteel', { color: '#3a3d42' });
  const brass = getMaterial('brass', {});
  const glass = getMaterial('glass', {});
  const teak = getMaterial('teak', {});

  const R = 4.2;
  // 基座
  g.add(put(box(R * 2 + 1.2, 0.55, R * 2 + 1.2, teak), 0, 0.27, 0));
  g.add(put(box(R * 2 + 0.4, 0.35, R * 2 + 0.4, iron), 0, 0.72, 0));

  // 玻璃穹：半球
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  g.add(put(dome, 0, 0.9, 0));

  /**
   * 锻铁肋：经线 + 两道纬线。
   *
   * TorusGeometry 本来就躺在 XY 平面上、而且包含 Y 轴，四分之一段正好是
   * 从赤道到天顶的一条经线，只需要绕 Y 转就能分布一圈。
   * 上一版先 rotation.x = π/2 再 rotateY，两次旋转复合之后经线倒向了，
   * 每根肋从穹顶中心往下吊 4.2 米——穿过甲板、穿过楼梯井，
   * 在大楼梯里变成两根莫名其妙的灰杆子。
   */
  for (let i = 0; i < 12; i++) {
    const geo = new THREE.TorusGeometry(R, 0.045, 6, 24, Math.PI / 2);
    geo.rotateY((i / 12) * Math.PI * 2);
    g.add(put(new THREE.Mesh(geo, iron), 0, 0.9, 0));
  }
  for (const [rr, yy] of [[R * 0.94, 0.9 + R * 0.33], [R * 0.72, 0.9 + R * 0.69]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.035, 6, 40), iron);
    ring.rotation.x = Math.PI / 2;
    g.add(put(ring, 0, yy, 0));
  }
  // 顶部通风冠
  g.add(put(cyl(0.55, 0.7, 0.5, 14, brass), 0, 0.9 + R, 0));
  g.add(put(cyl(0.8, 0.8, 0.08, 14, brass), 0, 0.9 + R + 0.29, 0));

  // 穹顶里的吊灯——走近能看见暖光从玻璃透出来
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 14, 10),
    new THREE.MeshStandardMaterial({
      color: '#2a2318', emissive: new THREE.Color('#ffcf8a'),
      emissiveIntensity: 3.0, roughness: 0.4,
    }));
  g.add(put(bulb, 0, 1.9, 0));
  const light = new THREE.PointLight(0xffcf8a, 24, 26, 2);
  light.position.set(0, 2.0, 0);
  g.add(light);
  return g;
}

/* ------------------------------------------------------ 救生艇 */

/**
 * 救生艇。
 *
 * 近看必须是「造出来的船」而不是一个碗：搭接的板列、肋骨、坐板、
 * 桨、艇首柱、盖在上面的帆布罩和捆绳。20 艘，总定员 1 178——
 * 而船上有 2 224 人。这个数字要在走过它们时被感觉到，
 * 所以它们必须看起来是真的能坐人的东西。
 */
function buildLifeboat() {
  const g = new THREE.Group();
  /**
   * 艇体用「板宽 15 cm」的刷漆钢板参数冒充搭接木板。
   * 第一版艇体根本没写 UV，贴图整张废掉，走到跟前就是一块灰板——
   * 而救生艇是艇甲板上离眼睛最近、出现次数最多的东西。
   */
  const hullMat = getMaterial('paintedSteel', {
    color: '#eae5d6', seed: 21, plateH: 0.062, plateW: 1.1,
    inout: 0.010, wearAmt: 0.7, seam: 0.5, rivetR: 0.0032, rivetH: 0.55,
  });
  const teak = getMaterial('teak', { trim: true });
  const canvasM = getMaterial('canvas', {});
  const ropeM = getMaterial('rope', {});

  const L = 9.1, B = 2.8, D = 1.2;   // 标准艇：30 英尺 × 9 英尺

  // 艇体：放样，尖艏尖艉
  const NL = 22, NV = 7, ring = 2 * NV + 1;
  const pos = [], idx = [], uvs = [];
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i <= NL; i++) {
    const t = i / NL;
    const taper = Math.sin(Math.pow(t, 0.92) * Math.PI);
    const hb = (B / 2) * Math.pow(taper, 0.55);
    const yk = -D * (0.45 + 0.55 * taper);
    const ys = 0.16 + 0.30 * Math.pow(Math.abs(t - 0.5) * 2, 2.2);   // 舷弧翘起
    for (let k = 0; k < ring; k++) {
      const side = k < NV ? -1 : 1;
      const v = k <= NV ? 1 - k / NV : (k - NV) / NV;
      pos.push(side * hb * Math.pow(sm(0, 0.55, v), 0.75), yk + v * (ys - yk), -L / 2 + t * L);
      // u 沿艇长、v 绕艇周：板缝方向跟着 v，搭接线于是是纵向的，和真艇一致
      uvs.push((t * L) / 2.5, ((k / (ring - 1)) * 2.2) / 2.5);
    }
  }
  for (let i = 0; i < NL; i++) for (let k = 0; k < ring - 1; k++) {
    const a = i * ring + k;
    idx.push(a, a + 1, a + ring, a + 1, a + ring + 1, a + ring);
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  hull.setIndex(idx);
  hull.computeVertexNormals();
  const hullMesh = new THREE.Mesh(hull, hullMat);
  hullMesh.castShadow = true;
  g.add(hullMesh);

  // 舷顶条（gunwale）
  for (const s of [-1, 1]) {
    for (let i = 0; i < NL; i++) {
      const t = i / NL, t2 = (i + 1) / NL;
      const hb = (B / 2) * Math.pow(Math.sin(Math.pow(t, 0.92) * Math.PI), 0.55);
      const hb2 = (B / 2) * Math.pow(Math.sin(Math.pow(t2, 0.92) * Math.PI), 0.55);
      const y = 0.16 + 0.30 * Math.pow(Math.abs(t - 0.5) * 2, 2.2);
      const y2 = 0.16 + 0.30 * Math.pow(Math.abs(t2 - 0.5) * 2, 2.2);
      const a = new THREE.Vector3(s * hb, y, -L / 2 + t * L);
      const b = new THREE.Vector3(s * hb2, y2, -L / 2 + t2 * L);
      const seg = box(0.09, 0.07, a.distanceTo(b) * 1.05, teak);
      seg.position.copy(a).lerp(b, 0.5);
      seg.lookAt(b);
      g.add(seg);
    }
  }
  // 坐板
  for (const z of [-2.9, -1.4, 0.1, 1.6, 3.1]) {
    const t = (z + L / 2) / L;
    const hb = (B / 2) * Math.pow(Math.sin(Math.pow(t, 0.92) * Math.PI), 0.55);
    g.add(put(box(hb * 2 * 0.94, 0.055, 0.30, teak), 0, 0.06, z));
  }
  // 桨：斜插在艇内
  for (let i = 0; i < 6; i++) {
    const oar = new THREE.Group();
    oar.add(put(cyl(0.028, 0.036, 3.6, 7, teak), 0, 0, 0));
    oar.add(put(box(0.13, 0.02, 0.75, teak), 0, -1.9, 0));
    oar.rotation.set(Math.PI / 2, 0, 0.05 * (i - 2.5));
    oar.position.set(-0.6 + (i % 3) * 0.6, 0.10, -0.4 + Math.floor(i / 3) * 0.5);
    g.add(oar);
  }
  /**
   * 帆布罩。
   *
   * 第一版给了半径 1.34 m 的半圆筒，结果罩子比艇还高，从通道上看过去
   * 是一个巨大的光滑灰圆顶——完全盖掉了刚做出来的艇壳。
   * 真实的罩子只是绷在一根脊杆上，比舷顶高出一尺多，整体是扁的。
   */
  const RIDGE = 0.62;

  /**
   * 帆布罩。
   *
   * 注意变换全部烘进几何体，不要用 mesh.rotation + mesh.scale：
   * Three 的矩阵是 T·R·S，缩放先于旋转作用在局部轴上。上一版先把半圆筒
   * 转了两次再 scale.x，结果被拉长的是竖直方向——甲板上每条艇背后立起
   * 一片两米高的白色鳍片，从通道上看比艇本身还显眼。
   */
  const cg = new THREE.CylinderGeometry(RIDGE, RIDGE, L * 0.76, 18, 1, true, 0, Math.PI);
  cg.rotateZ(Math.PI / 2);              // 轴 Y → X，圆拱朝上
  cg.rotateY(Math.PI / 2);              // 轴 X → Z，顺着艇长
  cg.scale((B * 0.47) / RIDGE, 1, 1);   // 横向拉到艇宽
  const cover = new THREE.Mesh(cg, canvasM);
  cover.material.side = THREE.DoubleSide;
  g.add(put(cover, 0, 0.18, 0));

  // 脊杆：罩子底下撑着的那根
  g.add(put(cyl(0.045, 0.045, L * 0.78, 8, teak).rotateX(Math.PI / 2), 0, 0.18 + RIDGE, 0));

  // 横向捆绳。TorusGeometry 本来就躺在 XY 平面上，正好是「横过艇宽的一道箍」，
  // 不需要任何旋转；只把半径按艇宽/拱高烘进几何体。
  for (const z of [-3.0, -1.8, -0.6, 0.6, 1.8, 3.0]) {
    const tg = new THREE.TorusGeometry(1.0, 0.017, 5, 22, Math.PI);
    tg.scale(B * 0.49, RIDGE * 1.05, 1);
    g.add(put(new THREE.Mesh(tg, ropeM), 0, 0.18, z));
  }

  // 艇首柱
  g.add(put(box(0.10, 0.55, 0.22, teak), 0, 0.30, L / 2 - 0.1));
  return g;
}

/* -------------------------------------------------------- 吊艇架 */

/** 韦林式吊艇架：弯臂 + 滑车组 + 绳索。近看要有滑轮和绳。 */
function buildDavit() {
  const g = new THREE.Group();
  const steel = getMaterial('paintedSteel', { color: '#e2ddd0' });
  const ropeM = getMaterial('rope', {});
  const H = 3.5, reach = 2.3;

  g.add(put(box(0.42, 0.14, 0.42, steel), 0, 0.07, 0));       // 底座
  g.add(put(cyl(0.10, 0.14, H, 10, steel), 0, H / 2, 0));     // 立柱
  // 弯臂
  const seg = 6;
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg;
    const p0 = new THREE.Vector3(reach * t0 * t0, H + reach * 0.6 * Math.sin(t0 * Math.PI * 0.5), 0);
    const p1 = new THREE.Vector3(reach * t1 * t1, H + reach * 0.6 * Math.sin(t1 * Math.PI * 0.5), 0);
    const arm = cyl(0.075, 0.085, p0.distanceTo(p1) * 1.08, 8, steel);
    arm.position.copy(p0).lerp(p1, 0.5);
    arm.lookAt(p1); arm.rotateX(Math.PI / 2);
    g.add(arm);
  }
  // 顶端滑车 + 垂下的绳
  const tip = new THREE.Vector3(reach, H + reach * 0.6, 0);
  const block = cyl(0.11, 0.11, 0.09, 12, steel);
  block.rotation.z = Math.PI / 2;
  g.add(put(block, tip.x, tip.y - 0.12, 0));
  g.add(put(cyl(0.016, 0.016, 2.0, 6, ropeM), tip.x, tip.y - 1.15, 0));
  const lower = cyl(0.09, 0.09, 0.08, 10, steel);
  lower.rotation.z = Math.PI / 2;
  g.add(put(lower, tip.x, tip.y - 2.2, 0));
  // 立柱上缠的余绳
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.032, 6, 16), ropeM);
  coil.rotation.x = Math.PI / 2;
  g.add(put(coil, 0, 0.85, 0));
  return g;
}

/* ------------------------------------------------------ 通风筒 */

/**
 * 扫掠弯管。
 *
 * 沿 XY 平面内的一段圆弧扫出一根管子，半径可以沿程变化——
 * 通风筒的弯头和末端张开的喇叭口是【同一个面】，一次扫完。
 *
 * 弧的起点在局部原点，切线朝 +Y（接上直筒）；扫过 arc 弧度之后
 * 切线转到大致 +X，开口朝侧面。这就是 cowl ventilator 的形状。
 *
 * 为什么不能拿一段斜圆锥去接直筒（上一版的做法）：
 * 圆锥的截面始终垂直于它自己的轴，把它整体斜过来之后，
 * 底口那个圆和直筒顶口那个圆既不共面也不同心，接缝必然错开一大截；
 * 加上一块单独转角的红色圆片，读出来就是一片朝旁边翘出去的尖鳍。
 *
 * flip=true 生成朝内的一层（喇叭口里面那面红漆）。不是靠 scale.x=-1
 * 翻面——那样绕序和法线全反，表面会黑掉——而是直接按相反的顺序写索引。
 */
function sweepElbow({ bendR, arc, radial, segs = 20, rings = 14, flip = false }) {
  const pos = [], uv = [], idx = [];
  const at = (i, j) => i * (segs + 1) + j;
  for (let i = 0; i <= rings; i++) {
    const u = i / rings, t = u * arc;
    const r = radial(u);
    // 弧心在 (bendR, 0)；切线 T=(sin t, cos t, 0)，面内法线 N=(cos t, −sin t, 0)，B=(0,0,1)
    const px = bendR * (1 - Math.cos(t)), py = bendR * Math.sin(t);
    const nx = Math.cos(t), ny = -Math.sin(t);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      pos.push(px + r * ca * nx, py + r * ca * ny, r * sa);
      // UV 按真实尺度：u 绕管周、v 沿弧长，贴图一格 1 m
      uv.push((a * r), t * bendR);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
    if (flip) idx.push(a, c, b, c, d, b);
    else idx.push(a, b, c, c, b, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();

  /**
   * 焊接接缝处的法线。
   *
   * j=0 和 j=segs 是同一条棱上的两份顶点（UV 要断开，位置却重合）。
   * computeVertexNormals 各算各的，每份只拿到一半的相邻面，
   * 于是弯头外弧上会有一道明显的亮线——一根本该光滑的管子上
   * 凭空多出一条棱。把两份加起来再归一化就没了。
   */
  const nrm = geo.attributes.normal;
  for (let i = 0; i <= rings; i++) {
    const a = at(i, 0), b = at(i, segs);
    const x = nrm.getX(a) + nrm.getX(b);
    const y = nrm.getY(a) + nrm.getY(b);
    const z = nrm.getZ(a) + nrm.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    nrm.setXYZ(a, x / l, y / l, z / l);
    nrm.setXYZ(b, x / l, y / l, z / l);
  }
  return geo;
}

/**
 * 通风筒（cowl ventilator）。
 *
 * 三段：直立的筒身 → 四分之一圆的弯头 → 末端张开的喇叭口。
 * 弯头和喇叭口是一次扫掠出来的同一个面，所以不存在接缝。
 * 开口内侧是红漆（同一段扫掠、半径缩 5%、绕序翻过来），
 * 外侧是浅黄褐。喉部封一块红色圆片，免得从口子里看进去是个空洞。
 *
 * 这个原型要复制 18 份，Mesh 数按份计——现在是 7 个。
 */
function buildVentCowl() {
  const g = new THREE.Group();
  const buff = getMaterial('paintedSteel', { color: '#cdb691', seed: 33 });
  const red = getMaterial('paintedSteel', { color: '#8e3628', seed: 44 });

  const R = 0.50;                      // 筒身半径
  const H = 1.78;                      // 直筒高（弯头起点）
  const BEND = 0.86;                   // 弯头中心线半径
  const ARC = Math.PI / 2 + 0.10;      // 多扫一点，口子略朝下——真筒都这样，免得灌雨

  // 半径沿程：前 55% 保持筒径，之后张开成喇叭
  const radial = (u) => {
    const t = Math.max(0, (u - 0.55) / 0.45);
    return R * (1 + 0.62 * t * t);
  };
  const MOUTH_R = radial(1);

  // 底座法兰
  g.add(put(cyl(R * 1.24, R * 1.42, 0.13, 16, buff), 0, 0.065, 0));
  // 直筒（微锥）
  g.add(put(cyl(R, R * 1.05, H, 18, buff, true), 0, H / 2, 0));
  // 筒身中段的接头箍
  g.add(put(new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, 0.035, 6, 20), buff)
    .rotateX(Math.PI / 2), 0, H * 0.52, 0));

  // 弯头 + 喇叭口：外皮
  g.add(put(new THREE.Mesh(sweepElbow({ bendR: BEND, arc: ARC, radial }), buff), 0, H, 0));
  // 同一段的内皮，红漆，绕序翻过来所以法线朝内
  g.add(put(new THREE.Mesh(
    sweepElbow({ bendR: BEND, arc: ARC, radial: (u) => radial(u) * 0.95, flip: true }), red), 0, H, 0));
  // 喉部的封板：朝上，堵住直筒那个空洞
  const throat = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 18), red);
  throat.geometry.rotateX(-Math.PI / 2);
  g.add(put(throat, 0, H + 0.03, 0));

  // 口沿的卷边。环面本来躺在 XY 平面、轴朝 +Z：
  // 先转到轴朝 +Y，再绕 Z 转 −ARC，轴就对上了开口的切线方向。
  const lip = new THREE.TorusGeometry(MOUTH_R, 0.034, 6, 26);
  lip.rotateX(-Math.PI / 2);
  lip.rotateZ(-ARC);
  g.add(put(new THREE.Mesh(lip, buff),
    BEND * (1 - Math.cos(ARC)), H + BEND * Math.sin(ARC), 0));

  return g;
}

/* ------------------------------------------------------ 烟囱 */

/**
 * 烟囱底部。直径 7.4 m——走到跟前是一堵弧形的墙。
 * 近看的关键是箍圈、检修梯、拉索耳板，以及底部的围裙。
 */
function buildFunnelBase(dummy = false) {
  const g = new THREE.Group();
  const buff = getMaterial('paintedSteel', { color: '#cdb691', seed: 33 });
  const black = getMaterial('paintedSteel', { color: '#15171b', seed: 55 });
  const steel = getMaterial('paintedSteel', { color: '#d2ccbe' });
  const R = 3.7, H = 17.0;

  // 底部围裙
  g.add(put(cyl(R + 0.35, R + 0.7, 1.1, 40, steel), 0, 0.55, 0));
  // 筒身（微锥）
  const body = cyl(R * 0.94, R, H, 40, buff, true);
  g.add(put(body, 0, 1.1 + H / 2, 0));
  // 顶部黑箍
  g.add(put(cyl(R * 0.95, R * 0.95, 3.0, 40, black, true), 0, 1.1 + H - 1.0, 0));
  // 加强箍
  for (const y of [4.5, 9.0, 13.5]) {
    g.add(put(new THREE.Mesh(new THREE.TorusGeometry(R * 0.98, 0.06, 8, 44), steel), 0, y, 0));
  }
  // 检修梯：一列踏棍
  for (let y = 1.6; y < H; y += 0.36) {
    g.add(put(cyl(0.022, 0.022, 0.44, 6, steel).rotateZ(Math.PI / 2), R * 0.99, y, 0));
  }
  for (const sz of [-0.22, 0.22]) {
    g.add(put(cyl(0.026, 0.026, H - 1.4, 6, steel), R * 0.99, 1.6 + (H - 1.4) / 2, sz));
  }
  // 拉索耳板与拉索
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    g.add(put(box(0.3, 0.3, 0.06, steel),
      Math.cos(a) * R * 1.0, 11.5, Math.sin(a) * R * 1.0, a));
  }
  if (dummy) {
    // 四号是通风假囱，顶上有格栅
    g.add(put(cyl(R * 0.9, R * 0.9, 0.1, 40, black), 0, 1.1 + H, 0));
  }
  return g;
}

/* ------------------------------------------------- 甲板小件 */

/**
 * 白星线的折叠躺椅。
 *
 * 柚木条板、可调的靠背、前端带一段脚踏。比例按老照片来：
 * 座面离甲板只有 32 cm，靠背向后倒得很厉害——这两点决定了它一眼是
 * 「船上的躺椅」而不是「公园长凳」。
 */
function buildDeckChair() {
  const g = new THREE.Group();
  // 上过清漆的柚木，比甲板深一档——不然在浅色甲板上整把椅子会糊掉
  const teak = getMaterial('oak', { color: '#946234', tileMeters: 0.38 });

  /**
   * 每一根木件都在【椅子自己的坐标系里】算好位置和角度，直接 put()。
   * 全程不建任何中间 Group，也就没有「组转了、件没跟着转」的余地。
   *
   * 上一版塌成一堆木条的原因就在这里：靠背是一摞【水平】薄板
   * （0.56 × 0.016 厚 × 0.062 深）叠在一个 Group 里，再把 Group 绕 X
   * 转 31°。板条自身的截面还是水平的——转完仍然是一摞近乎平躺的薄板，
   * 沿一条斜线排开，读出来就是散落的木条而不是靠背。
   * 靠背板条的【薄方向必须垂直于靠背平面】，这才是它的立面。
   *
   * 椅子正面朝局部 +z（装配时右舷转 +π/2 朝舷外）。
   */
  const W = 0.56;                                   // 椅宽

  // ---- 座面：从 (z −0.20, y 0.345) 斜到 (z +0.45, y 0.385)，往后微倾
  const SZ0 = -0.20, SZ1 = 0.45, SY0 = 0.345, SY1 = 0.385;
  // rotation.x = θ 把局部 +z 压低 sinθ；要让 +z 端抬高，θ 取负
  const seatTilt = -Math.atan2(SY1 - SY0, SZ1 - SZ0);
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    const s = box(W, 0.020, 0.072, teak);
    s.rotation.x = seatTilt;
    g.add(put(s, 0, SY0 + t * (SY1 - SY0), SZ0 + t * (SZ1 - SZ0)));
  }
  // 座面两侧的边梁——板条要搭在什么东西上，不然还是悬空的条
  for (const sx of [-1, 1]) {
    const r = box(0.042, 0.052, SZ1 - SZ0 + 0.06, teak);
    r.rotation.x = seatTilt;
    g.add(put(r, sx * (W / 2 - 0.012), (SY0 + SY1) / 2, (SZ0 + SZ1) / 2));
  }

  // ---- 靠背：从 (z −0.20, y 0.36) 斜到 (z −0.58, y 1.00)
  const BZ0 = -0.20, BZ1 = -0.58, BY0 = 0.36, BY1 = 1.00;
  const bdy = BY1 - BY0, bdz = BZ1 - BZ0;
  // 让局部 +y 轴对上靠背的斜线方向，于是板条的薄方向（局部 z）正好是靠背法线
  const backTilt = Math.atan2(bdz, bdy);
  for (let i = 0; i < 7; i++) {
    const t = 0.05 + ((i + 0.5) / 7) * 0.90;
    const s = box(W, 0.088, 0.020, teak);
    s.rotation.x = backTilt;
    g.add(put(s, 0, BY0 + t * bdy, BZ0 + t * bdz));
  }
  for (const sx of [-1, 1]) {
    const r = box(0.042, Math.hypot(bdy, bdz) + 0.04, 0.034, teak);
    r.rotation.x = backTilt;
    g.add(put(r, sx * (W / 2 - 0.012), BY0 + bdy / 2, BZ0 + bdz / 2));
  }

  // ---- 四条腿：前腿略前倾、后腿后撑，撑开折叠椅那个「人」字
  for (const sx of [-1, 1]) {
    const x = sx * 0.245;
    const fr = box(0.036, 0.40, 0.036, teak);
    fr.rotation.x = Math.atan2(0.30 - 0.40, 0.365);      // 下端 z=0.40 → 上端 z=0.30
    g.add(put(fr, x, 0.1825, 0.35));
    const bk = box(0.036, 0.45, 0.036, teak);
    bk.rotation.x = Math.atan2(-0.22 + 0.44, 0.36);      // 下端 z=−0.44 → 上端 z=−0.22
    g.add(put(bk, x, 0.18, -0.33));
  }
  // 前后两道横撑
  g.add(put(box(W, 0.028, 0.028, teak), 0, 0.12, 0.368));
  g.add(put(box(W, 0.028, 0.028, teak), 0, 0.12, -0.395));

  // ---- 扶手：前低后高，一根从前腿顶一直搭到靠背上
  for (const sx of [-1, 1]) {
    const x = sx * 0.30;
    const arm = box(0.048, 0.032, 0.63, teak);
    arm.rotation.x = Math.atan2(0.70 - 0.60, 0.61);      // 前端 (z 0.33) 比后端低 0.10
    g.add(put(arm, x, 0.65, 0.025));
    g.add(put(box(0.034, 0.26, 0.034, teak), x, 0.49, 0.325));   // 前立柱
    g.add(put(box(0.034, 0.26, 0.034, teak), x, 0.585, -0.28));  // 后立柱，落在靠背边梁上
  }

  // ---- 脚踏：座面前沿再翻出去一段，向下斜
  const FZ0 = 0.45, FZ1 = 0.80, FY0 = SY1, FY1 = 0.30;
  const footTilt = -Math.atan2(FY1 - FY0, FZ1 - FZ0);
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    const s = box(0.52, 0.018, 0.070, teak);
    s.rotation.x = footTilt;
    g.add(put(s, 0, FY0 + t * (FY1 - FY0), FZ0 + t * (FZ1 - FZ0)));
  }
  for (const sx of [-1, 1]) {
    const r = box(0.038, 0.045, 0.40, teak);
    r.rotation.x = footTilt;
    g.add(put(r, sx * 0.25, (FY0 + FY1) / 2, (FZ0 + FZ1) / 2));
    // 脚踏那头的小支腿，不然前面 0.35 m 是悬空的
    const lg = box(0.030, 0.33, 0.030, teak);
    lg.rotation.x = Math.atan2(0.78 - 0.82, 0.30);
    g.add(put(lg, sx * 0.235, 0.15, 0.80));
  }
  return g;
}

/** 柚木长椅：靠背与座面都是条板，中间留缝。 */
function buildBench() {
  const g = new THREE.Group();
  const teak = getMaterial('teak', { trim: true });
  const iron = getMaterial('paintedSteel', { color: '#3a3d42' });
  for (let i = 0; i < 5; i++) {
    g.add(put(box(1.82, 0.035, 0.085, teak), 0, 0.44, -0.22 + i * 0.11));
  }
  for (let i = 0; i < 4; i++) {
    const s = put(box(1.82, 0.035, 0.085, teak), 0, 0.60 + i * 0.115, -0.30);
    s.rotation.x = -0.22;
    g.add(s);
  }
  for (const sx of [-0.78, 0.78]) {
    g.add(put(box(0.06, 0.44, 0.06, iron), sx, 0.22, -0.18));
    g.add(put(box(0.06, 0.44, 0.06, iron), sx, 0.22, 0.18));
    const back = put(box(0.05, 0.52, 0.05, iron), sx, 0.70, -0.31);
    back.rotation.x = -0.22;
    g.add(back);
  }
  return g;
}

/** 甲板灯：黄铜灯罩 + 玻璃 + 实际发光。 */
/** 灯泡的自发光材质，全船共用一份。 */
const BULB = new THREE.MeshStandardMaterial({
  color: '#2a2318', emissive: new THREE.Color('#ffd9a0'),
  emissiveIntensity: 5.0, roughness: 0.3,
});

function buildDeckLamp() {
  const g = new THREE.Group();
  const brass = getMaterial('brass', {});
  g.add(put(cyl(0.05, 0.06, 0.30, 10, brass), 0, -0.15, 0));
  g.add(put(new THREE.Mesh(new THREE.ConeGeometry(0.20, 0.22, 12, 1, true), brass), 0, -0.38, 0));
  // 材质必须共用。每盏灯各建一个 MeshStandardMaterial 的话，
  // 二十八盏灯就是二十八种材质，合批时谁也合不到一起，白白多出二十八次提交。
  g.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), BULB), 0, -0.46, 0));
  return g;
}

/* ═════════════════════════════════════════════════ 装配 */

export function buildWalkableBoatDeck() {
  const root = new THREE.Group();
  root.name = 'BoatDeck';
  const collide = [];      // 参与碰撞的对象

  const deck = buildDeckPlate();
  root.add(deck);
  collide.push(deck);

  const invisible = new THREE.MeshBasicMaterial({ visible: false });

  const house = buildDeckhouse();
  root.add(house);
  /**
   * 舱壁的碰撞用不可见代理，而不是把整个 house 丢进碰撞列表：
   * 门洞必须真的是洞。拿整组做碰撞的话，射线会打到门洞上方那块过梁，
   * 人被挡在门外——门看得见走不进去，比没有门更糟。
   */
  {
    const hz0 = -30, hz1 = 74;
    // 舱壁按 HOUSE_DOORS 切成几段——和 buildDeckhouse 切墙用的是同一份数据
    const segs = [];
    let cur = hz0;
    for (const d of HOUSE_DOORS) {
      if (d.z0 > cur) segs.push([cur, d.z0]);
      cur = Math.max(cur, d.z1);
    }
    if (cur < hz1) segs.push([cur, hz1]);
    for (const s of [-1, 1]) {
      for (const [a, b] of segs) {
        const w = box(0.5, 3.0, b - a, invisible);
        w.position.set(s * HOUSE_HALF_W, 1.5, (a + b) / 2);
        root.add(w); collide.push(w);
      }
    }
    for (const z of [hz0, hz1]) {
      const w = box(HOUSE_HALF_W * 2, 3.0, 0.5, invisible);
      w.position.set(0, 1.5, z);
      root.add(w); collide.push(w);
    }
  }

  // 前部大楼梯：从右舷门洞进去，沿主梯下到 A 甲板
  const stair = buildStaircase();
  root.add(stair);
  collide.push(...stair.userData.collide);

  root.add(buildRailings());
  // 栏杆要挡住人，但只用一块不可见的薄墙做碰撞——
  // 拿几百根细杆做射线检测又慢又容易从缝里钻出去
  for (const s of [-1, 1]) {
    const wall = box(0.2, 1.3, FWD - AFT, invisible);
    wall.position.set(s * (DECK_HALF_W - 0.42), 0.65, (FWD + AFT) / 2);
    root.add(wall);
    collide.push(wall);
  }

  const aftGuard = box(2 * (DECK_HALF_W - 0.42), 1.3, 0.2, invisible);
  aftGuard.name = 'BoatDeckEquipment:aft-guard';
  aftGuard.position.set(0, 0.65, AFT + 0.1);
  root.add(aftGuard); collide.push(aftGuard);

  // 烟囱：z 位置沿用外形版，但这里是可走到跟前的实体
  const funnelZ = [58, 28, -2, -32];
  funnelZ.forEach((z, i) => {
    const f = buildFunnelBase(i === 3);
    f.position.set(0, 0, z);
    root.add(f);
    // 碰撞用一个圆柱代理
    const proxy = cyl(4.3, 4.6, 3, 16, invisible);
    proxy.position.set(0, 1.5, z);
    root.add(proxy);
    collide.push(proxy);
  });

  /**
   * 烟囱拉索。
   *
   * 七米多直径、十九米高的烟囱不可能是自己站住的，每根都靠一圈钢索
   * 拉在甲板上。这几根线几乎不花面数，但它们是这条船天际线的一半——
   * 少了它们，四个烟囱看上去像四个插在甲板上的桶。
   */
  {
    const wire = getMaterial('rope', { color: '#4d4a44' });
    /**
     * 拉索落在中央舱室的顶上，不是落在通道里。
     * 第一版把索脚放在 x≈8.5——正好是人走的那条线，
     * 一根钢索从眼睛高度横穿过去，而且还挡住路。
     */
    const ROOF_Y = 3.25;
    for (const z of funnelZ) {
      for (const s of [-1, 1]) {
        for (const [dz, dx] of [[-7.5, 6.4], [7.5, 6.4], [0, 6.8]]) {
          const top = new THREE.Vector3(s * 2.6, 13.2, z + dz * 0.22);
          const bot = new THREE.Vector3(s * dx, ROOF_Y, z + dz);
          const c = cyl(0.026, 0.026, top.distanceTo(bot), 5, wire);
          c.position.copy(top).lerp(bot, 0.5);
          c.lookAt(bot); c.rotateX(Math.PI / 2);
          root.add(c);
          // 舱室顶上的系索板
          root.add(put(box(0.30, 0.18, 0.24, getMaterial('paintedSteel', { color: '#cfc9ba' })),
            s * dx, ROOF_Y + 0.09, z + dz));
        }
      }
    }
  }

  /**
   * 躺椅。
   *
   * 白星线的折叠柚木躺椅——这条船上最日常、也最容易让人代入的一件东西。
   * 沿舱壁一排排码在通道内侧，留出走的宽度。
   */
  {
    const chair = flattenProto(buildDeckChair());
    for (let i = 0; i < 26; i++) {
      const z = 54 - i * 4.4;
      // 甲板到 AFT 就没了，循环再往下走就会有一排躺椅浮在海面上
      if (z < AFT + 3) break;
      if (Math.abs(z - 58) < 5 || Math.abs(z - 28) < 5
        || Math.abs(z + 2) < 5 || Math.abs(z + 32) < 5) continue;   // 让开烟囱
      // C66 通道整理：让开门洞、筒座、长凳与艉端横连；保留主船木条模型。
      if (z < HOUSE_Z0 + 0.8
        || HOUSE_DOORS.some(d => z > d.z0 - 1 && z < d.z1 + 1)
        || Array.from({ length: 9 }, (_, j) => 64 - j * 12.6).some(vz => Math.abs(z - vz) < 1.45)
        || Array.from({ length: 9 }, (_, j) => 57.5 - j * 12.6).some(bz => Math.abs(z - bz) < 1.35)) continue;
      for (const s of [-1, 1]) {
        const c = chair.clone();
        c.position.set(s * (HOUSE_HALF_W + 0.85), 0, z);
        // 椅子的正面是局部 +z；右舷要朝舷外（+x），所以是 +π/2，不是 −π/2
        c.rotation.y = s * Math.PI / 2;
        c.name = `BoatDeckChair:${s}:${i}`;
        root.add(c);
        furnitureCollision(root, collide, c, c.name);
      }
    }
  }

  // 艏楼、前井甲板、前桅：舰桥正前方看得见的全部内容
  const bow = buildBow();
  root.add(bow);
  collide.push(...bow.userData.collide);

  // 艉部：后井甲板、艉楼、主桅、巡洋舰艉
  const stern = buildStern();
  root.add(stern);
  collide.push(...stern.userData.collide);

  // 舰桥：甲板前端，玩家最该走过去的地方
  const bridge = buildBridge();
  root.add(bridge);
  collide.push(...bridge.userData.collide);

  // 大楼梯穹顶
  const dome = buildStaircaseDome();
  dome.position.set(0, 3.1, 70);   // 坐在中央舱室顶上
  root.add(dome);

  /**
   * 甲板布置。
   *
   * 第一版把救生艇摆在 x=±9.9、通风筒摆在 ±8.5，两者的外廓直接重叠，
   * 玩家沿通道走会不停穿进艇壳里——这是「能不能逛」的问题，不是观感问题。
   * 工程布置：艇在外侧、通风筒在内侧，沿 x≈±9.15 行走。
   * 筒座与艇代理之间最窄约 1.1 m；艇数、艇型与历史分组尚未定案。
   */
  const BOAT_X = DECK_HALF_W - 1.85;   // 艇中线，艇宽 2.8 → 外廓到 12.5，刚好在栏杆里
  const DAVIT_X = DECK_HALF_W - 0.55;
  const VENT_X = HOUSE_HALF_W + 0.85;

  const boatProto = flattenProto(buildLifeboat());
  const davitProto = flattenProto(buildDavit());
  const ventProto = flattenProto(buildVentCowl());
  const benchProto = flattenProto(buildBench());
  const lampProto = flattenProto(buildDeckLamp());
  for (let i = 0; i < 10; i++) {
    // 最后一对向艏收回 1.8 m，使艇身和吊艇架落在甲板后缘以内。
    // 这是边界修复，均布艇位仍为工程暂定。
    // 艏端首对收至 z=74，避开桥翼遮篷和探照灯；与第二对仍不重叠。
    const z = i === 0 ? 74 : Math.max(78 - i * 13.4, AFT + 5.2);
    for (const s of [-1, 1]) {
      const b = boatProto.clone();
      b.name = `BoatDeckBoat:${s}:${i}`;
      b.position.set(s * BOAT_X, 1.35, z);
      b.rotation.y = s > 0 ? 0 : Math.PI;
      root.add(b);
      // 艇身的碰撞代理：真几何是薄壳，射线容易漏进去
      const hull = box(2.9, 1.6, 9.3, invisible);
      hull.position.set(s * BOAT_X, 1.35, z);
      root.add(hull);
      collide.push(hull);

      for (const dz of [-3.6, 3.6]) {
        const d = davitProto.clone();
        d.position.set(s * DAVIT_X, 0, z + dz);
        d.rotation.y = s > 0 ? 0 : Math.PI;
        root.add(d);
        const post = cyl(0.22, 0.22, 3.5, 10, invisible);
        post.name = `BoatDeckEquipment:davit:${s}:${i}:${dz}`;
        post.position.set(s * DAVIT_X, 1.75, z + dz);
        root.add(post); collide.push(post);
      }
    }
  }

  // 甲板灯的 z 位置，通风筒要用它来决定喇叭口朝哪边（见下）
  const lampZs = [];
  for (let i = 0; i < 14; i++) {
    const z = 68 - i * 9.4;
    if (z < HOUSE_Z0 + 0.5) break;
    lampZs.push(z);
  }

  /**
   * 通风筒的朝向。
   *
   * 喇叭口离筒轴将近一米七，朝向选错会直接怼进别的东西里，所以不能随手给角度：
   *
   * 一、必须朝【舷外】偏一点。朝内偏的话口子会啃进舱壁的窗套——
   *     rotation.y 的偏置对左右舷不是同一个符号，上一版两舷都用同一个
   *     +0.4/−0.35，结果有一半的筒是朝里张的。
   *     朝舷外只偏 0.30 rad：再多口子就伸进通道，人要撞头。
   * 二、前后朝向按【离甲板灯远的那一边】挑。灯挂在 2.55 m 的挑臂上，
   *     正好在喇叭口的高度带里；两者 z 间距最近只有 1 m，
   *     选错方向就会看见一盏灯吊在通风筒嘴里。
   */
  const DELTA = 0.30;
  for (let i = 0; i < 9; i++) {
    const z = 64 - i * 12.6;
    // 口心大约在筒轴前方 0.9 m 处，两个候选各算一遍到最近灯的距离
    const gap = (dz) => Math.min(...lampZs.map((lz) => Math.abs(z + dz - lz)));
    const aft = gap(-0.9) >= gap(0.9);
    for (const s of [-1, 1]) {
      const v = ventProto.clone();
      v.position.set(s * VENT_X, 0, z);
      // 朝艉：θ = π/2 − s·δ；朝艏：θ = −π/2 + s·δ。两舷都朝舷外偏 δ。
      v.rotation.y = aft ? (Math.PI / 2 - s * DELTA) : (-Math.PI / 2 + s * DELTA);
      root.add(v);
      const proxy = cyl(0.72, 0.72, 2.4, 16, invisible);
      proxy.name = `BoatDeckEquipment:vent:${s}:${i}`;
      proxy.position.set(s * VENT_X, 1.2, z);
      root.add(proxy);
      collide.push(proxy);
    }
  }

  for (let i = 0; i < 9; i++) {
    const z = 57.5 - i * 12.6;
    // 长凳靠着舱壁摆，正好会有一条落在新开的健身房门洞前面——
    // 一张长凳横在门口，门就白开了
    if (HOUSE_DOORS.some((d) => z > d.z0 - 0.8 && z < d.z1 + 0.8)) continue;
    for (const s of [-1, 1]) {
      const b = benchProto.clone();
      b.position.set(s * (HOUSE_HALF_W + 0.62), 0, z);
      b.rotation.y = s * Math.PI / 2;
      b.name = `BoatDeckBench:${s}:${i}`;
      root.add(b);
      furnitureCollision(root, collide, b, b.name);
    }
  }

  // 甲板灯：挂在舱室外壁的挑臂上
  const brass = getMaterial('brass', {});
  for (const z of lampZs) {
    for (const s of [-1, 1]) {
      const arm = box(0.7, 0.05, 0.05, brass);
      arm.position.set(s * (HOUSE_HALF_W + 0.35), 2.55, z);
      root.add(arm);
      const lamp = lampProto.clone();
      lamp.position.set(s * (HOUSE_HALF_W + 0.68), 2.55, z);
      root.add(lamp);
    }
  }

  root.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });

  return { root, collide, DECK_HALF_W, FWD, AFT };
}
