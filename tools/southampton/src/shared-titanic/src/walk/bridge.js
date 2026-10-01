import * as THREE from 'three';
import { getMaterial, uvBox, uvCyl } from './materials.js';

/**
 * 航行舰桥。
 *
 * 艇甲板的前端，也是整条船上最该让人走到的地方——所以单独成一个模块。
 * 构成按 1912 年的实况：
 *   · 驾驶室（wheelhouse）：柚木框的大窗、舵轮、罗经柜、海图桌
 *   · 驾驶室前方的敞开舰桥，前沿一道弧形挡风屏，屏上压柚木帽条
 *   · 两翼一直伸到舷侧，翼端各有一座小遮篷——瞭望和靠泊时站人的地方
 *   · 屏前立两台车钟和一座罗经柜
 *
 * 尺度按奥林匹克级：舰桥宽度与船宽齐平，驾驶室只占中间八米出头。
 * 坐标沿用 boatdeck 的：甲板面 y=0，船头 +z。
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

/** 上层建筑的钢板参数：板大、搭接浅。舷侧外板那套用在舱壁上会像砌砖。 */
const SUPER = { plateH: 0.52, plateW: 0.82, inout: 0.004, wearAmt: 0.45, grime: 0.10, seam: 0.6 };

export const BRIDGE = {
  WH_HALF: 4.15, WH_H: 2.85,
  WH_Z0: 76.4, WH_Z1: 81.2,     // 驾驶室后缘 / 前缘
  SCREEN_Z: 85.6,               // 挡风屏中线最前处
  WING_X: 12.55,
  SIDE_DOOR_Z: 77.5, SIDE_DOOR_W: 1.4, SIDE_DOOR_H: 2.2,
  /**
   * 屏高。
   *
   * 1.34 m 时站在舰桥上正好把整个艏部遮掉：眼高 1.68，屏在两米外，
   * 越过屏顶的视线一路压到水平线以下，结果井甲板和艏楼全被挡住，
   * 只剩几个系缆桩浮在海面上——一个本该是全船最好的机位，看出去什么都没有。
   * 真船的挡风屏大约齐腰（1.0–1.1 m），刚好能看见艏楼甲板面，
   * 而近处的井甲板仍然被挡住——照片上就是这个关系。
   */
  SH: 1.02,
};

export function buildBridge() {
  const g = new THREE.Group();
  g.name = 'Bridge';
  const collide = [];

  const wall = getMaterial('paintedSteel', { color: '#e6e1d4', ...SUPER });
  const trim = getMaterial('paintedSteel', { color: '#d6d0c0', ...SUPER });
  const dark = getMaterial('paintedSteel', { color: '#2b2f35', ...SUPER, seed: 61 });
  const teak = getMaterial('teak', {});
  const wood = getMaterial('teak', { trim: true });   // 细木件
  const brass = getMaterial('brass', {});
  const glass = getMaterial('glass', {});
  const invis = new THREE.MeshBasicMaterial({ visible: false });

  const { WH_HALF, WH_H, WH_Z0, WH_Z1, SCREEN_Z, WING_X, SH, SIDE_DOOR_Z, SIDE_DOOR_W, SIDE_DOOR_H } = BRIDGE;

  /* ---------------------------------------------------- 驾驶室 */

  const wz = (WH_Z0 + WH_Z1) / 2, wd = WH_Z1 - WH_Z0;
  // 两舷门洞同时用于可见墙与碰撞；位置沿原侧门，宽度为工程通行调整。
  const door0 = SIDE_DOOR_Z - SIDE_DOOR_W / 2, door1 = SIDE_DOOR_Z + SIDE_DOOR_W / 2;
  for (const s of [-1, 1]) {
    for (const [a, b] of [[WH_Z0, door0], [door1, WH_Z1]]) {
      g.add(put(box(0.18, WH_H, b - a, wall), s * WH_HALF, WH_H / 2, (a + b) / 2));
      const proxy = put(box(0.3, WH_H, b - a, invis), s * WH_HALF, WH_H / 2, (a + b) / 2);
      proxy.name = `BridgeWall:${s}:${a}`;
      g.add(proxy); collide.push(proxy);
    }
    g.add(put(box(0.18, WH_H - SIDE_DOOR_H, SIDE_DOOR_W, wall), s * WH_HALF, (WH_H + SIDE_DOOR_H) / 2, SIDE_DOOR_Z));
    for (const z of [door0, door1]) g.add(put(box(0.24, SIDE_DOOR_H, 0.08, wood), s * WH_HALF, SIDE_DOOR_H / 2, z));
    g.add(put(box(0.24, 0.08, SIDE_DOOR_W + 0.08, wood), s * WH_HALF, SIDE_DOOR_H, SIDE_DOOR_Z));
    const threshold = put(box(0.52, 0.04, SIDE_DOOR_W, brass), s * WH_HALF, 0.02, SIDE_DOOR_Z);
    threshold.name = `BridgeThreshold:${s}`; g.add(threshold); collide.push(threshold);
  }
  g.add(put(box(WH_HALF * 2, WH_H, 0.18, wall), 0, WH_H / 2, WH_Z0));

  // 前壁只做窗下墙与窗上梁，中间是一整排窗——驾驶室的辨识点就在这排窗
  g.add(put(box(WH_HALF * 2, 1.02, 0.20, wall), 0, 0.51, WH_Z1));
  g.add(put(box(WH_HALF * 2, 0.62, 0.20, wall), 0, WH_H - 0.31, WH_Z1));
  /**
   * 五扇窗。框要真的做成「框」——上下左右四根边料围一圈。
   * 第一版拿一整块实心板当框，玻璃贴在它前面，结果整面前壁是一堵木墙，
   * 一扇窗都看不见。
   */
  const WW = 1.30, WH_ = 1.22, FR = 0.085;
  for (let i = 0; i < 5; i++) {
    const x = -WH_HALF + 0.55 + i * ((WH_HALF * 2 - 1.1) / 4);
    const zf = WH_Z1 + 0.02;
    g.add(put(box(WW + FR * 2, FR, 0.13, wood), x, 1.63 + WH_ / 2 + FR / 2, zf));
    g.add(put(box(WW + FR * 2, FR, 0.13, wood), x, 1.63 - WH_ / 2 - FR / 2, zf));
    for (const sx of [-1, 1]) {
      g.add(put(box(FR, WH_, 0.13, wood), x + sx * (WW / 2 + FR / 2), 1.63, zf));
    }
    g.add(put(box(0.045, WH_, 0.10, wood), x, 1.63, zf));           // 中梃
    g.add(put(box(WW, WH_, 0.02, glass), x, 1.63, WH_Z1 - 0.02));   // 玻璃退到框后面
  }

  // 门扇固定敞开并折靠前侧墙面；不宣称已经接入开关门交互。
  for (const s of [-1, 1]) {
    const leafZ = door1 + (SIDE_DOOR_W - 0.1) / 2;
    g.add(put(box(0.10, 2.02, SIDE_DOOR_W - 0.1, wood), s * (WH_HALF + 0.18), 1.01, leafZ));
    const dw = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), glass);
    dw.rotation.y = s * Math.PI / 2;
    g.add(put(dw, s * (WH_HALF + 0.24), 1.55, leafZ));
    g.add(put(box(0.09, 1.06, 1.06, wood), s * (WH_HALF + 0.05), 1.63, wz + 1.2));
    g.add(put(box(0.04, 0.90, 0.90, glass), s * (WH_HALF + 0.10), 1.63, wz + 1.2));
  }

  g.add(put(box(WH_HALF * 2 + 0.55, 0.22, wd + 0.7, trim), 0, WH_H + 0.11, wz));

  // 侧壁已按门洞分段，后壁与前窗仍封闭。
  for (const z of [WH_Z0, WH_Z1]) {
    const w = box(WH_HALF * 2, 2.6, 0.3, invis);
    w.position.set(0, 1.3, z); g.add(w); collide.push(w);
  }

  /* ------------------------------- 驾驶室内：舵轮、罗经、海图桌 */

  const wheel = new THREE.Group();
  wheel.add(put(cyl(0.13, 0.19, 0.95, 12, wood), 0, 0.47, 0));
  wheel.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 10, 40), wood), 0, 1.12, 0));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sp = cyl(0.026, 0.026, 1.04, 6, wood);
    sp.rotation.z = Math.PI / 2 + a;
    wheel.add(put(sp, 0, 1.12, 0));
    // 舵柄从轮缘伸出来一小截——舵轮之所以一眼认得出来就靠这一圈
    const hand = cyl(0.030, 0.024, 0.22, 6, wood);
    hand.position.set(Math.cos(a) * 0.63, 1.12 + Math.sin(a) * 0.63, 0);
    hand.rotation.z = a + Math.PI / 2;
    wheel.add(hand);
  }
  wheel.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 20), brass), 0, 1.12, 0.06));
  const WHEEL_Z = WH_Z1 - 1.30;
  wheel.position.set(0, 0, WHEEL_Z);
  g.add(wheel);

  /**
   * 驾驶室里这几件道具原先一件都没有碰撞，人一走就穿进轮辐中间——
   * 站在舵轮位置上，整幅画面只剩轮缘和轮辐。
   *
   * 用不可见的简形包住，不拿真几何做碰撞：轮缘+舵柄最外到轴心 0.74 m，
   * 一个 r=0.62 的圆柱加上人的 0.34 m 半径，人正好停在舵柄外面；
   * 再大就会把舵轮和前壁之间那条缝彻底堵死。
   */
  {
    const w = cyl(0.62, 0.62, 1.90, 10, invis);
    w.position.set(0, 0.95, WHEEL_Z); g.add(w); collide.push(w);
  }

  const binnacle = (x, z) => {
    const b = new THREE.Group();
    b.add(put(cyl(0.17, 0.26, 0.92, 14, wood), 0, 0.46, 0));
    b.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 12), brass), 0, 1.06, 0));
    b.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.03, 8, 22), brass), 0, 1.02, 0));
    for (const sx of [-1, 1]) {   // 弗林德斯球：磁罗经两侧的软铁球
      b.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 8), dark), sx * 0.34, 0.98, 0));
    }
    b.position.set(x, 0, z);
    return b;
  };
  // 两座罗经柜：驾驶室里一座，屏后的敞开舰桥上一座。各一根细圆柱包住柜身
  for (const bz of [WH_Z1 - 2.65, SCREEN_Z - 1.55]) {
    g.add(binnacle(0, bz));
    const w = cyl(0.32, 0.32, 1.35, 10, invis);
    w.position.set(0, 0.675, bz); g.add(w); collide.push(w);
  }

  const TABLE_Z = WH_Z0 + 0.95;
  g.add(put(box(1.9, 0.06, 0.85, wood), -2.2, 0.86, TABLE_Z));
  for (const sx of [-0.85, 0.85]) for (const sz of [-0.35, 0.35]) {
    g.add(put(box(0.07, 0.86, 0.07, wood), -2.2 + sx, 0.43, TABLE_Z));
  }
  {   // 海图桌：一只齐桌面高的矮箱子，桌面以上不挡视线
    const w = box(1.90, 0.90, 0.85, invis);
    w.position.set(-2.2, 0.45, TABLE_Z); g.add(w); collide.push(w);
  }

  /* ------------------------------------------------------ 车钟 */

  const telegraph = (x) => {
    const t = new THREE.Group();
    t.add(put(cyl(0.12, 0.20, 1.06, 14, brass), 0, 0.53, 0));
    const head = cyl(0.30, 0.30, 0.17, 20, brass);
    head.rotation.x = Math.PI / 2;
    t.add(put(head, 0, 1.26, 0));
    t.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.035, 8, 24), brass), 0, 1.26, 0));
    for (const sz of [-0.11, 0.11]) {
      const h = box(0.05, 0.48, 0.04, brass);
      h.rotation.z = 0.55;
      t.add(put(h, 0.09, 1.42, sz));
    }
    t.position.set(x, 0, SCREEN_Z - 1.00);
    return t;
  };
  for (const tx of [-2.4, 2.4]) {
    g.add(telegraph(tx));
    // 钟头 r=0.30 最宽，代理照这个尺寸收一圈就够
    const w = cyl(0.30, 0.30, 1.55, 10, invis);
    w.position.set(tx, 0.775, SCREEN_Z - 1.00); g.add(w); collide.push(w);
  }

  /* --------------------------------------------- 弧形挡风屏 */

  /**
   * 屏是一条向前鼓出的弧：中线最靠前，往两翼逐渐后收。
   * 用 40 段直板拼，段与段之间按切线转向——分段少了会看出折角。
   */
  const arc = (u) => new THREE.Vector3(
    u * WING_X, 0, SCREEN_Z - Math.pow(Math.abs(u), 2.0) * 2.4);

  const segs = 40;
  for (let i = 0; i < segs; i++) {
    const a = arc(-1 + (2 * i) / segs), b = arc(-1 + (2 * (i + 1)) / segs);
    const len = a.distanceTo(b);
    const ry = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    const panel = box(len * 1.03, SH, 0.16, wall);
    panel.position.copy(a).lerp(b, 0.5).setY(SH / 2);
    panel.rotation.y = ry;
    g.add(panel);
    const cap = box(len * 1.03, 0.09, 0.32, wood);
    cap.position.copy(panel.position).setY(SH + 0.045);
    cap.rotation.y = ry;
    g.add(cap);
  }
  /**
   * 屏背面的加强筋。
   *
   * 一块两米外的白漆平板，即使有铆钉法线，在逆光下也读不出任何东西——
   * 而它占了舰桥这个机位下半幅画面。真船的屏背面每隔一米左右就有一根
   * 竖向扶强材，顶上再压一道横向角钢；这些构件的自阴影才是这面墙的内容。
   */
  for (let i = 0; i <= 28; i++) {
    const u = -1 + (2 * i) / 28;
    const p0 = arc(u);
    const t0 = arc(Math.min(1, u + 0.01)), t1 = arc(Math.max(-1, u - 0.01));
    const ry = Math.atan2(t0.x - t1.x, t0.z - t1.z) - Math.PI / 2;
    const rib = box(0.09, SH - 0.12, 0.13, trim);
    rib.position.set(p0.x, (SH - 0.12) / 2, p0.z - 0.14);
    rib.rotation.y = ry;
    g.add(rib);
  }
  for (let i = 0; i < segs; i++) {
    const a = arc(-1 + (2 * i) / segs), b = arc(-1 + (2 * (i + 1)) / segs);
    const ry = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    const ang = box(a.distanceTo(b) * 1.04, 0.10, 0.20, trim);
    ang.position.copy(a).lerp(b, 0.5).setY(SH - 0.16);
    ang.position.z -= 0.16;
    ang.rotation.y = ry;
    g.add(ang);
  }

  for (let i = 0; i < 10; i++) {
    const a = arc(-1 + (2 * i) / 10), b = arc(-1 + (2 * (i + 1)) / 10);
    const w = box(a.distanceTo(b) * 1.06, 1.6, 0.45, invis);
    w.position.copy(a).lerp(b, 0.5).setY(0.8);
    w.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) - Math.PI / 2;
    g.add(w); collide.push(w);
  }

  /* ------------------------------------------ 两翼与翼端遮篷 */

  const wingZ0 = WH_Z0 - 0.5, wingZ1 = SCREEN_Z - 2.4;
  for (const s of [-1, 1]) {
    // 舷墙延伸到弧形挡风屏端点，补上原来 2.1 m 的可见缺口。
    const wingLength = wingZ1 - wingZ0, wingCentre = (wingZ0 + wingZ1) / 2;
    g.add(put(box(0.16, SH, wingLength, wall), s * WING_X, SH / 2, wingCentre));
    g.add(put(box(0.32, 0.09, wingLength, wood), s * WING_X, SH + 0.045, wingCentre));
    const w = box(0.4, 1.6, wingLength, invis);
    w.name = `BridgeWingGuard:${s}`;
    w.position.set(s * WING_X, 0.8, wingCentre); g.add(w); collide.push(w);

    const cz = 81.6;
    for (const dz of [-0.9, 0.9]) for (const dx of [0, 1.5]) {
      const px = s * (WING_X - 0.45) - s * dx;
      g.add(put(cyl(0.055, 0.055, 2.35, 8, trim), px, 1.17, cz + dz));
      /**
       * 四根立柱各配一根细代理，而不是合成一个框：合成框会把遮篷底下
       * 整块地面封掉，而那里正是翼端站人的位置。柱子本身只有 0.11 m 粗，
       * 代理取 r=0.10——人停在离柱心 0.43 m 处，柱间 1.5 m 仍走得过去。
       */
      const w = cyl(0.10, 0.10, 2.30, 8, invis);
      w.position.set(px, 1.15, cz + dz); g.add(w); collide.push(w);
    }
    g.add(put(box(2.1, 0.14, 2.6, trim), s * (WING_X - 1.2), 2.41, cz));

    // 翼端探照灯：靠泊和搜寻时用，也给这一角一个亮点
    g.add(put(cyl(0.16, 0.22, 0.85, 12, trim), s * (WING_X - 0.7), SH + 0.42, cz - 2.4));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), brass);
    g.add(put(lamp, s * (WING_X - 0.7), SH + 1.05, cz - 2.4));
    // 灯座架在舷墙高度上（y 1.0 起），齐腰那条射线正好扫到它
    {
      const w = cyl(0.26, 0.26, 1.50, 10, invis);
      w.position.set(s * (WING_X - 0.7), 1.60, cz - 2.4); g.add(w); collide.push(w);
    }
  }

  /**
   * 驾驶室内的灯。
   *
   * 白天从外面看没什么，但人一走进去，没有室内光源的房间会黑成一个洞——
   * 顶板挡住了太阳，环境光又被墙吃掉。一盏暖色点光把舵轮和罗经柜的
   * 黄铜提起来，这个房间才算「有人用过」。
   */
  const bulb = new THREE.PointLight(0xffd9a0, 6.0, 11, 2);
  bulb.position.set(0, WH_H - 0.35, (WH_Z0 + WH_Z1) / 2 + 0.4);
  g.add(bulb);
  const shade = cyl(0.16, 0.10, 0.14, 12, brass);
  g.add(put(shade, 0, WH_H - 0.22, (WH_Z0 + WH_Z1) / 2 + 0.4));

  g.userData.collide = collide;
  return g;
}
