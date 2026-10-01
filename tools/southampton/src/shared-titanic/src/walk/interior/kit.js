import * as THREE from 'three';
import { getMaterial, uvBox, uvCyl } from '../materials.js';
import { LEGACY_WALK } from '../../data/ship-reference.js';

/**
 * 室内构件库。
 *
 * 要把这条船的里面都建出来——头等舱、三等舱、餐厅、走廊、卧室——
 * 靠一间屋子写一个模块是铺不开的：每间屋子都要地板、天花、四面墙、
 * 踢脚、檐口、门洞、灯具、碰撞代理，这些东西写第三遍的时候就知道
 * 必须抽出来。这个文件就是那套构件。
 *
 * 约定（全船统一，改了会连累所有房间）：
 *   · 坐标沿用艇甲板：艇甲板面 y=0，船头 +z，右舷 +x
 *   · 房间用「地面 y + 层高」描述，不用绝对上下沿
 *   · 每个构件函数返回的 Group 上挂 userData.collide：要进碰撞列表的对象
 */

/* ------------------------------------------------- 甲板层高 */

/**
 * 各层甲板的高度。
 *
 * 奥林匹克级的甲板间距不是均匀的：客舱层约 2.9 m，机器处所更高。
 * 这里取一套够用的近似值，全船共用——一旦某个房间自己算高度，
 * 楼梯就对不上了。
 */
export const DECK = LEGACY_WALK.deck;

/** 相邻两层之间的净高（层高减去楼板厚度）。 */
export const HEADROOM = 2.62;

/* ----------------------------------------------------- 工具 */

export const box = (w, h, d, m) => uvBox(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m));
export const cyl = (rt, rb, h, seg, m, open = false) =>
  uvCyl(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), m));

export function put(o, x, y, z, ry = 0) {
  o.position.set(x, y, z);
  if (ry) o.rotation.y = ry;
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

export const INVIS = new THREE.MeshBasicMaterial({ visible: false });

/* ------------------------------------------------- 灯位登记 */

/**
 * 灯位登记表。
 *
 * 室内没有天光，每间屋子都想要几盏灯——而 three 的前向渲染里，
 * 场景中每多一盏点光源，**整条船**每个片元都要多算一次光照，
 * 着色器还会因为灯数变化而重编译。第一版楼梯间放了十六盏，
 * 直接把帧率和进场时间一起拖垮了。
 *
 * 所以：房间只登记「这里该有一盏什么样的灯」，不真的创建 Light。
 * 真正的光源由 lightpool.js 维护一个固定大小的池子，
 * 每帧把池子里的灯挪到离玩家最近的几个登记点上。
 * 灯的总数恒定 → 不重编译；离玩家远的房间不花一分钱。
 */
export const LIGHTS = [];

/** 登记一个灯位。color 用十六进制数，range 是衰减半径。 */
export function light(x, y, z, { color = 0xffd2a0, intensity = 6, range = 9 } = {}) {
  LIGHTS.push({ pos: new THREE.Vector3(x, y, z), color, intensity, range });
}

/**
 * 灯泡的自发光材质，全船共用一份（每盏灯各建一个材质会毁掉合批）。
 *
 * 强度这个数是和 engine.js 的泛光阈值绑在一起的，改一个就得看另一个。
 * 后期链里的颜色是【线性 HDR】（RenderPass 渲到浮点 RT，色调映射在
 * OutputPass 才做），所以这里的 emissiveIntensity 就是泛光高通拿到的亮度。
 *
 * 原来是 4.0：过了 ACES（曝光 0.92）之后落在 0.93 以上，灯泡本身先被
 * 顶到接近纯白——三个通道全挤到一起，暖色没了；再加上泛光阈值 1.02，
 * 整只灯泡都在阈值以上四倍，镜头一靠近就是一个烧掉的白盘子，
 * 光晕把周围的天花也一起削平。
 *
 * 2.3 的落点是 ACES ≈ 0.92，蓝通道还留在 0.85——灯泡是亮的、暖的，
 * 但三个通道没有挤到一起，还看得出是黄光而不是一块白；
 * 同时高出泛光阈值（1.35，见 engine.js）将近一倍，远看该有的晕一点没少。
 */
export const BULB = new THREE.MeshStandardMaterial({
  color: '#3a2f1e', emissive: new THREE.Color('#ffd9a6'),
  emissiveIntensity: 2.3, roughness: 0.35,
});
export const BULB_COOL = new THREE.MeshStandardMaterial({
  color: '#2b2f33', emissive: new THREE.Color('#ffeccb'),
  emissiveIntensity: 2.0, roughness: 0.35,
});

/* ----------------------------------------------------- 地面 */

/**
 * 铺一块地。
 *
 * 单独做一个函数，是因为「木纹朝哪边」这件事已经错过两次了：
 * 直接拿 BoxGeometry 当地板，uvBox 会按 (宽, 深) 铺，
 * 于是板缝横着走——一条一百多米的长廊，地板的板缝横着排，
 * 一眼假。这里强制 u 沿船长、v 沿船宽，而且用世界坐标算 UV，
 * 相邻两块地拼起来板缝是连续的。
 *
 * 返回的是一张没有厚度的平面：玩家的落地射线照样打得到，
 * 而少一半的面。
 */
export function floorPlanks(x0, x1, z0, z1, y, mat, tile = 5.0) {
  const geo = new THREE.PlaneGeometry(
    x1 - x0, z1 - z0, 2, Math.max(2, Math.round((z1 - z0) / 8)));
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getZ(i) + cz) / tile, (pos.getX(i) + cx) / tile);
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(cx, y, cz);
  m.receiveShadow = true;
  return m;
}

/** 无方向的地面（地毯、油地毡、瓷砖）：UV 也按世界坐标，免得块与块之间错位。 */
export function floorFlat(x0, x1, z0, z1, y, mat, tile = 2.4) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) + cx) / tile, (pos.getZ(i) + cz) / tile);
  }
  const m = new THREE.Mesh(geo, mat);
  m.position.set(cx, y, cz);
  m.receiveShadow = true;
  return m;
}

/* ------------------------------------------------- 房间外壳 */

/**
 * 一间屋子的壳：地板、天花、四面墙，外加踢脚和檐口。
 *
 * `openings` 是墙上的洞：每一项 `{ side, at, w, h, sill }`
 *   side  'n' = +z 那面，'s' = −z，'e' = +x，'w' = −x
 *   at    洞的中心在那面墙上的坐标（n/s 用 x，e/w 用 z）
 *   w,h   洞的宽和高
 *   sill  洞的下沿离地高度，默认 0（门）；开窗就给个窗台高
 *
 * 墙按洞切成段来建，而不是先建整墙再「挖」——three 没有布尔运算，
 * 拿一块板盖住洞口那种做法近看一眼就穿帮。
 */
export function shell(opt) {
  const {
    x0, x1, z0, z1, y, h = HEADROOM,
    floor, ceil, wall, skirt = null, cornice = null,
    t = 0.14,                 // 墙厚
    openings = [],
    noCeil = false, noFloor = false,
    walls = 'nsew',           // 需要哪几面墙
  } = opt;

  const g = new THREE.Group();
  const collide = [];
  const W = x1 - x0, D = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  if (!noFloor) {
    const f = box(W, 0.14, D, floor);
    f.position.set(cx, y - 0.07, cz);
    f.castShadow = false;
    g.add(f); collide.push(f);
  }
  if (!noCeil) {
    const c = box(W, 0.12, D, ceil);
    c.position.set(cx, y + h + 0.06, cz);
    g.add(c);
  }

  /** 在一面墙上按洞切段。axis 方向上从 a0 到 a1。 */
  const runWall = (side, a0, a1, place) => {
    const holes = openings.filter((o) => o.side === side)
      .map((o) => ({ ...o, lo: o.at - o.w / 2, hi: o.at + o.w / 2 }))
      .sort((p, q) => p.lo - q.lo);
    let cur = a0;
    for (const o of holes) {
      if (o.lo > cur) place(cur, o.lo, 0, h);          // 洞之前的整段墙
      const sill = o.sill || 0;
      if (sill > 0.001) place(o.lo, o.hi, 0, sill);     // 窗台下的矮墙
      const top = sill + o.h;
      if (top < h - 0.001) place(o.lo, o.hi, top, h - top);  // 洞上方的过梁
      cur = Math.max(cur, o.hi);
    }
    if (cur < a1) place(cur, a1, 0, h);
  };

  const mkNS = (zAt, side) => (a, b, yy, hh) => {
    if (b - a < 0.005 || hh < 0.005) return;
    const m = box(b - a, hh, t, wall);
    m.position.set((a + b) / 2, y + yy + hh / 2, zAt);
    g.add(m);
    const c = box(b - a, hh, t + 0.25, INVIS);
    c.position.copy(m.position);
    g.add(c); collide.push(c);
  };
  const mkEW = (xAt, side) => (a, b, yy, hh) => {
    if (b - a < 0.005 || hh < 0.005) return;
    const m = box(t, hh, b - a, wall);
    m.position.set(xAt, y + yy + hh / 2, (a + b) / 2);
    g.add(m);
    const c = box(t + 0.25, hh, b - a, INVIS);
    c.position.copy(m.position);
    g.add(c); collide.push(c);
  };

  if (walls.includes('n')) runWall('n', x0, x1, mkNS(z1, 'n'));
  if (walls.includes('s')) runWall('s', x0, x1, mkNS(z0, 's'));
  if (walls.includes('e')) runWall('e', z0, z1, mkEW(x1, 'e'));
  if (walls.includes('w')) runWall('w', z0, z1, mkEW(x0, 'w'));

  // 踢脚与檐口：屋子有没有「装修过」全看这两条线
  if (skirt) {
    if (walls.includes('n')) g.add(put(box(W, 0.26, 0.06, skirt), cx, y + 0.13, z1 - t / 2 - 0.03));
    if (walls.includes('s')) g.add(put(box(W, 0.26, 0.06, skirt), cx, y + 0.13, z0 + t / 2 + 0.03));
    if (walls.includes('e')) g.add(put(box(0.06, 0.26, D, skirt), x1 - t / 2 - 0.03, y + 0.13, cz));
    if (walls.includes('w')) g.add(put(box(0.06, 0.26, D, skirt), x0 + t / 2 + 0.03, y + 0.13, cz));
  }
  if (cornice) {
    const cy = y + h - 0.09;
    if (walls.includes('n')) g.add(put(box(W, 0.14, 0.12, cornice), cx, cy, z1 - t / 2 - 0.06));
    if (walls.includes('s')) g.add(put(box(W, 0.14, 0.12, cornice), cx, cy, z0 + t / 2 + 0.06));
    if (walls.includes('e')) g.add(put(box(0.12, 0.14, D, cornice), x1 - t / 2 - 0.06, cy, cz));
    if (walls.includes('w')) g.add(put(box(0.12, 0.14, D, cornice), x0 + t / 2 + 0.06, cy, cz));
  }

  g.userData.collide = collide;
  return g;
}

/* --------------------------------------------------- 门与窗 */

/**
 * 一扇门：门套 + 门扇 + 黄铜把手 + 门楣。
 * `ry` 决定门朝哪边；门扇默认虚掩，开一点角度——
 * 一排全部关死的门看上去像画上去的。
 */
export function door(x, y, z, ry, {
  w = 0.86, h = 2.05, frame, leaf, brass, ajar = 0,
} = {}) {
  const g = new THREE.Group();
  const d = new THREE.Group();
  d.add(put(box(0.10, h + 0.16, w + 0.18, frame), 0, (h + 0.16) / 2, 0));   // 门套
  const swing = new THREE.Group();
  const panel = put(box(0.055, h - 0.06, w - 0.04, leaf), 0.03, (h - 0.06) / 2, (w - 0.04) / 2);
  swing.add(panel);
  // 门板上的两块凹线板
  for (const py of [h * 0.28, h * 0.68]) {
    swing.add(put(box(0.07, h * 0.3, w * 0.62, frame), 0.035, py, (w - 0.04) / 2));
  }
  swing.position.set(0, 0, -(w - 0.04) / 2);
  swing.rotation.y = ajar;
  d.add(swing);
  const handle = cyl(0.022, 0.022, 0.13, 8, brass);
  handle.rotation.z = Math.PI / 2;
  swing.add(put(handle, 0.09, 1.02, w - 0.18));
  g.add(d);
  g.position.set(x, y, z);
  g.rotation.y = ry;
  return g;
}

/**
 * 舷窗。三等舱与下层客舱的窗户是圆的，不是方的——
 * 这一点是「你在哪一层、坐几等舱」最直接的提示。
 */
export function porthole(x, y, z, ry, { r = 0.22, brass, glass } = {}) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 8, 20), brass);
  g.add(put(ring, 0, 0, 0));
  const pane = new THREE.Mesh(new THREE.CircleGeometry(r - 0.02, 20), glass);
  g.add(put(pane, 0, 0, -0.02));
  // 外圈的六颗压紧螺栓
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), brass),
      Math.cos(a) * (r + 0.07), Math.sin(a) * (r + 0.07), 0.01));
  }
  g.position.set(x, y, z);
  g.rotation.y = ry;
  return g;
}

/* ----------------------------------------------------- 灯具 */

/** 吸顶灯：黄铜底座 + 乳白玻璃球。头等舱走廊、客舱用的就是这种。 */
export function ceilingLamp(x, y, z, { brass, warm = true, r = 0.13, reg = true } = {}) {
  const g = new THREE.Group();
  g.add(put(cyl(0.10, 0.13, 0.07, 12, brass), 0, 0, 0));
  g.add(put(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), warm ? BULB : BULB_COOL), 0, -r * 0.75, 0));
  g.position.set(x, y, z);
  // 强度和半径都比第一版大：房间的净高只有 2.6 m，
  // 半径 7.5 m 的球在地面上只剩很小一圈，走两步就进黑区。
  if (reg) light(x, y - r, z, { intensity: 7.5, range: 11 });
  return g;
}

/** 壁灯：挑臂加一个罩子，走廊两侧交错着挂。 */
export function wallLamp(x, y, z, ry, { brass, reg = true } = {}) {
  const g = new THREE.Group();
  g.add(put(box(0.16, 0.20, 0.05, brass), 0, 0, -0.02));
  g.add(put(cyl(0.02, 0.02, 0.20, 6, brass).rotateZ(Math.PI / 2), 0.10, 0.04, 0));
  g.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 9), BULB), 0.20, 0.02, 0));
  g.position.set(x, y, z);
  g.rotation.y = ry;
  if (reg) light(x + Math.cos(ry) * 0.2, y, z - Math.sin(ry) * 0.2, { intensity: 4.4, range: 8 });
  return g;
}

/* --------------------------------------------------- 常用料 */

/** 一套室内常用材质，取一次到处用（getMaterial 自带缓存，重复取不会重复生成）。 */
export function palette() {
  return {
    oak: getMaterial('oak', { color: '#7a5834' }),
    oakDark: getMaterial('oak', { color: '#5a3d22' }),
    mahogany: getMaterial('oak', { color: '#6b3324', tileMeters: 0.55 }),
    walnut: getMaterial('oak', { color: '#4e3520', tileMeters: 0.5 }),
    pine: getMaterial('oak', { color: '#b08f5e', tileMeters: 0.45 }),
    wood: getMaterial('teak', { trim: true }),
    teak: getMaterial('teak', {}),
    carpet: getMaterial('carpet', {}),
    carpetBlue: getMaterial('carpet', { color: '#2f3f56' }),
    carpetGreen: getMaterial('carpet', { color: '#35462f' }),
    gilt: getMaterial('gilt', {}),
    brass: getMaterial('brass', {}),
    glass: getMaterial('glass', {}),
    // 舱内的白漆钢板：板大、搭接浅、几乎没有磨损——室内不淋雨
    enamel: getMaterial('paintedSteel', {
      color: '#ece7dc', plateH: 0.9, plateW: 1.5, inout: 0.002,
      wearAmt: 0.12, seam: 0.25, seed: 5,
    }),
    enamelCream: getMaterial('paintedSteel', {
      color: '#ded6c2', plateH: 0.9, plateW: 1.5, inout: 0.002,
      wearAmt: 0.15, seam: 0.25, seed: 23,
    }),
    steel: getMaterial('paintedSteel', {
      color: '#8d8c88', plateH: 0.8, plateW: 1.3, inout: 0.004,
      wearAmt: 0.6, grime: 0.2, seed: 47,
    }),
    // 室内的门、门套、天花、家具刷的漆：光面，没有铆钉
    paint: getMaterial('paint', { color: '#ece7dc' }),
    paintCream: getMaterial('paint', { color: '#ddd6c4' }),
    paintWhite: getMaterial('paint', { color: '#f2eee6', gloss: 0.28 }),
    tile: getMaterial('tile', {}),
    lino: getMaterial('lino', {}),
  };
}
