import * as THREE from 'three';
import { getMaterial, uvBox, uvCyl } from './materials.js';
import { flattenProto } from './bake.js';
import { light as regLight, BULB as STAIR_BULB } from './interior/kit.js';
import { DECK_LEVELS } from '../data/ship-reference.js';
import { buildLowerStair } from './lower-stair.js';

/**
 * 前部大楼梯。
 *
 * 全船最有名的一个空间，也是「上船逛」这件事真正的目的地：
 * 甲板再细致也是户外，只有走进这间屋子，船才从「一条船」变成「一个地方」。
 *
 * 按 A 甲板层的实况搭：
 *   · 顶上是锻铁与玻璃的穹顶（在 boatdeck.js 里，这里只负责它底下的光）
 *   · 一段宽阔的主梯从艇甲板层降到 A 甲板平台
 *   · 平台正面是那块著名的橡木雕板，中央一座钟
 *   · 两侧再各分一段梯往下（做出去向，不做到底）
 *   · 栏杆是锻铁涡卷加鎏金饰件，扶手是橡木
 *   · 灯具：穹顶下一盏大吊灯，柱头各一盏
 *
 * 坐标沿用艇甲板：艇甲板面 y=0，船头 +z。
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

/** 楼梯间在甲板上开的洞。boatdeck 要照着它把甲板面切成四块。 */
/**
 * 楼梯在艇甲板上开的洞。boatdeck 照这个把甲板面切成四块。
 *
 * z1 必须【正好等于】梯段的起点 TOP_Z。原来洞开到 73.6 而梯段从 73.0 开始，
 * 中间 0.6 m 既没有甲板也没有踏步——而那 0.6 m 正好横在
 * 「从门厅走向大楼梯」的必经路线上，一步踩空直接摔到 A 甲板。
 * 这种缝是所有楼梯口最容易出的错：两边各自按自己的数收边，谁也没量中间。
 */
export const WELL = { x0: -4.4, x1: 4.4, z0: 67.0, z1: 73.0 };

export const STAIR = {
  A_Y: DECK_LEVELS.A,        // A 甲板地面
  ROOM_HALF: 6.6,            // 楼梯间半宽
  /**
   * 房间的艉端墙紧贴着那块雕板。
   *
   * 第一版给到 z=60，雕板在 66.6，中间留了一个三米多深、没有光、
   * 也没有任何东西的死角——人走进去只看见一片全黑，以为场景坏了。
   * 房间的边界应该落在最后一件有内容的东西后面。
   * 第二版收到 65.9，又反过来把平台压成了一米宽的缝：
   * 人下了梯就贴在雕板上，退不开，那块板根本看不全。
   * 平台要留得下人——三米半，正好能站在梯脚把整块板收进视野。
   */
  ROOM_Z0: 63.7, ROOM_Z1: 74.6,
};

/* ------------------------------------------------------- 构件 */

/**
 * 锻铁栏板。
 *
 * 大楼梯的栏杆不是竖杆，是一块块锻铁涡卷嵌在框里，中央一枚鎏金饰。
 * 逐个涡卷做成真几何太贵，用「细杆弯成 S」的近似：
 * 三段圆柱拼出涡卷的走向，远看和照片上的疏密关系是对的。
 */
function ironPanel(len, h, iron, gilt) {
  const g = new THREE.Group();
  g.add(put(box(len, 0.05, 0.07, iron), 0, h - 0.025, 0));      // 上框
  g.add(put(box(len, 0.05, 0.07, iron), 0, 0.025, 0));          // 下框

  const n = Math.max(1, Math.round(len / 0.42));
  for (let i = 0; i < n; i++) {
    const cx = -len / 2 + (len / n) * (i + 0.5);
    const cw = len / n;
    // S 形涡卷：上下两个反向的四分之一圆
    for (const s of [-1, 1]) {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(cw * 0.26, 0.012, 5, 12, Math.PI * 0.95), iron);
      arc.rotation.z = s > 0 ? 0 : Math.PI;
      g.add(put(arc, cx, h / 2 + s * cw * 0.26, 0));
    }
    g.add(put(cyl(0.011, 0.011, h - 0.08, 6, iron), cx, h / 2, 0));
    // 中央的鎏金小饰件
    g.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), gilt), cx, h / 2, 0.012));
  }
  return g;
}

/** 一段直梯：踏步 + 踢面 + 两侧梯帮。 */
function flight(steps, w, rise, going, mat, riserMat) {
  const g = new THREE.Group();
  for (let i = 0; i < steps; i++) {
    const y = -rise * (i + 1);
    const z = -going * (i + 0.5);
    g.add(put(box(w, 0.05, going + 0.03, mat), 0, y + rise - 0.025, z));   // 踏面
    g.add(put(box(w, rise, 0.04, riserMat), 0, y + rise / 2, z - going / 2));
  }
  return g;
}

/* ------------------------------------------------------- 主体 */

export function buildStaircase() {
  const g = new THREE.Group();
  const collide = [];

  const oak = getMaterial('oak', { color: '#7a5834' });
  const oakDark = getMaterial('oak', { color: '#5a3d22' });
  const carpet = getMaterial('carpet', {});
  const gilt = getMaterial('gilt', {});
  const iron = getMaterial('paintedSteel', {
    color: '#2a2622', seed: 91, plateH: 2, plateW: 2, inout: 0, wearAmt: 0.2,
  });
  const white = getMaterial('paintedSteel', {
    color: '#e8e2d2', plateH: 0.9, plateW: 1.4, inout: 0.002, wearAmt: 0.2, seam: 0.3,
  });
  const glass = getMaterial('glass', {});
  const invis = new THREE.MeshBasicMaterial({ visible: false });

  /**
   * 灯泡用自发光材质，不配光源。
   *
   * 这间屋子第一版给了十六盏点光源，加上别处的一共十八盏。
   * three 的前向渲染里每个片元都要把所有灯遍历一遍——不只是室内，
   * 整条船的每一块甲板都在为这十八盏灯付代价；着色器编译也从几秒
   * 涨到了两分多钟（无头浏览器退到软件渲染时直接卡死）。
   * 真正需要投出光照关系的只有几盏：吊灯、梯段的下照、雕板的重点光。
   * 其余灯具只要「自己亮」就够了——人眼看的是灯亮不亮，不是它照没照到墙。
   */
  const bulbMat = new THREE.MeshStandardMaterial({
    color: '#3a2f1e', emissive: new THREE.Color('#ffd9a6'),
    /**
     * 2.6，不是 4.2。
     *
     * 柱头那两个球灯离镜头只有两三米，4.2 下三个通道全部溢出，
     * 灯泡成了一个没有形状的纯白圆盘，旁边的橡木柱头也被泛光削平。
     * 全船的 `kit.js` 里 BULB 已经因为同样的原因从 4.0 降到 2.3，
     * 这里是楼梯自己的一份材质，当时漏了。远看照旧有光晕。
     */
    emissiveIntensity: 2.6, roughness: 0.35,
  });
  const globe = (r = 0.12) => new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), bulbMat);

  const { A_Y, ROOM_HALF, ROOM_Z0, ROOM_Z1 } = STAIR;
  const RISE = 0.172, GOING = 0.29, STEPS = 18;   // 18 × 0.172 ≈ 3.1 m
  const FLIGHT_W = 3.6;

  /**
   * 梯井口的护栏。
   *
   * `axis` 是护栏所在的那条线（ry=0 时是某个 z，ry=π/2 时是某个 x），
   * 护栏沿另一个轴从 a 铺到 b；`gap` 给出梯段的开口，只在那一格断开。
   *
   * 原来这里是「梯段落在哪一头，那一头整条都不拦」。可井口宽 8.8 m，
   * 梯段只有 3.6 m——两边各剩 2.6 m 的空档，既没地板也没栏杆。
   * 人朝楼梯走过去偏半米就直接掉进井里，一路穿过 A、B、C、D 四层平台
   * 摔到 E 甲板，十八米。画面上那儿还立着锻铁栏板，所以看着完全正常。
   *
   * 栏杆拦不住人是这套代码里反复出现的一类错：装饰网格和碰撞代理是
   * 两套东西，加了前者很容易忘了后者。
   */
  const wellRail = (ry, axis, a, b, y, gap) => {
    const spans = gap
      ? [[a, gap[0]], [gap[1], b]]
      : [[a, b]];
    for (const [s0, s1] of spans) {
      const len = s1 - s0;
      if (len < 0.25) continue;
      const mid = (s0 + s1) / 2;
      const px = ry ? axis : mid;
      const pz = ry ? mid : axis;
      const p = ironPanel(len, 0.86, iron, gilt);
      p.position.set(px, y + 0.02, pz);
      p.rotation.y = ry;
      g.add(p);
      g.add(put(box(ry ? 0.09 : len, 0.07, ry ? len : 0.09, oakDark), px, y + 0.92, pz));
      const w = box(ry ? 0.3 : len, 1.2, ry ? len : 0.3, invis);
      w.position.set(px, y + 0.6, pz);
      g.add(w); collide.push(w);
    }
  };

  /* ------------------------------------------------ A 甲板层 */

  // A 层地面和下行开口由已接入的 lower-stair 一起生成。

  /**
   * 四面墙：橡木镶板，下有护壁板，上有檐口。
   *
   * 两侧墙在 z≈70 处各开一道门洞，通往 A 甲板封闭散步长廊。
   * 没有这道洞，人下了大楼梯就困在一间十四米长的屋子里，
   * 「逛船」到此为止——所以这道洞比屋子里任何一件装修都重要。
   */
  const WH = 2.95;
  const OUT_Z0 = 69.2, OUT_Z1 = 70.9;
  for (const s of [-1, 1]) {
    for (const [a, b] of [[ROOM_Z0, OUT_Z0], [OUT_Z1, ROOM_Z1]]) {
      g.add(put(box(0.16, WH, b - a, oak), s * ROOM_HALF, A_Y + WH / 2, (a + b) / 2));
      g.add(put(box(0.22, 0.34, b - a, oakDark), s * (ROOM_HALF - 0.04), A_Y + 0.17, (a + b) / 2));
      g.add(put(box(0.24, 0.16, b - a, oakDark), s * (ROOM_HALF - 0.05), A_Y + WH - 0.08, (a + b) / 2));
    }
    // 门洞上方的过梁与两侧门套
    g.add(put(box(0.18, WH - 2.25, OUT_Z1 - OUT_Z0, oak), s * ROOM_HALF, A_Y + 2.25 + (WH - 2.25) / 2, (OUT_Z0 + OUT_Z1) / 2));
    g.add(put(box(0.24, 0.16, OUT_Z1 - OUT_Z0 + 0.3, oakDark), s * (ROOM_HALF - 0.04), A_Y + 2.25, (OUT_Z0 + OUT_Z1) / 2));
    for (const dz of [OUT_Z0, OUT_Z1]) {
      g.add(put(box(0.24, 2.25, 0.16, oakDark), s * (ROOM_HALF - 0.04), A_Y + 1.125, dz));
    }
    // 壁柱：每 2.4 m 一根，把长墙分段
    for (let z = ROOM_Z0 + 1.2; z < ROOM_Z1; z += 2.4) {
      g.add(put(box(0.12, WH - 0.5, 0.34, oakDark), s * (ROOM_HALF - 0.10), A_Y + 0.34 + (WH - 0.5) / 2, z));
      g.add(put(box(0.16, 0.10, 0.42, gilt), s * (ROOM_HALF - 0.12), A_Y + WH - 0.22, z));
    }
    // 碰撞也要跟着断开，否则门看得见走不进去
    for (const [a, b] of [[ROOM_Z0, OUT_Z0], [OUT_Z1, ROOM_Z1]]) {
      const w = box(0.4, 3.2, b - a, invis);
      w.position.set(s * ROOM_HALF, A_Y + 1.6, (a + b) / 2);
      g.add(w); collide.push(w);
    }
  }
  for (const z of [ROOM_Z0, ROOM_Z1]) {
    g.add(put(box(ROOM_HALF * 2, WH, 0.16, oak), 0, A_Y + WH / 2, z));
    const w = box(ROOM_HALF * 2, 3.2, 0.4, invis);
    w.position.set(0, A_Y + 1.6, z); g.add(w); collide.push(w);
  }
  // A 甲板的顶（= 艇甲板地板的背面），楼梯井处留空
  for (const [x0, x1, z0, z1] of [
    [-ROOM_HALF, ROOM_HALF, ROOM_Z0, WELL.z0],
    [-ROOM_HALF, ROOM_HALF, WELL.z1, ROOM_Z1],
    [-ROOM_HALF, WELL.x0, WELL.z0, WELL.z1],
    [WELL.x1, ROOM_HALF, WELL.z0, WELL.z1],
  ]) {
    g.add(put(box(x1 - x0, 0.14, z1 - z0, white), (x0 + x1) / 2, -0.22, (z0 + z1) / 2));
  }

  /* ---------------------------------------------- 主梯与平台 */

  /**
   * 主梯从楼梯井的船头一侧下来，落在 A 甲板的平台上。
   * 走向是往船尾——这样从艇甲板的入口进来正好是「下去」的方向。
   */
  const TOP_Z = 73.0;
  const fl = flight(STEPS, FLIGHT_W, RISE, GOING, oak, oakDark);
  fl.position.set(0, 0, TOP_Z);
  g.add(fl);
  // 梯段上铺的地毯（比踏面窄，两边留出木头的边）
  for (let i = 0; i < STEPS; i++) {
    g.add(put(box(FLIGHT_W - 0.9, 0.02, GOING + 0.02, carpet),
      0, -RISE * i - 0.005, TOP_Z - GOING * (i + 0.5)));
  }
  /**
   * 梯段的碰撞：一块斜板 + 两侧的挡墙。
   *
   * 斜板代替逐级踏步——射线打台阶容易卡在踢面上。
   * 但只有斜板是不够的：斜板的宽度正好等于梯段宽，人往边上偏十厘米
   * 就踏空了，而那个位置在画面上明明还在锻铁栏杆的【里面】。
   * 栏杆是纯装饰网格，从来没进过碰撞列表——看得见拦不住，是最坑人的一种。
   */
  {
    const run = GOING * STEPS, drop = RISE * STEPS;
    const ramp = box(FLIGHT_W, 0.3, Math.hypot(run, drop), invis);
    ramp.position.set(0, -drop / 2 + 0.08, TOP_Z - run / 2);
    ramp.rotation.x = -Math.atan2(drop, run);
    g.add(ramp); collide.push(ramp);
    for (const s of [-1, 1]) {
      const side = box(0.3, 1.5, Math.hypot(run, drop), invis);
      side.position.set(s * (FLIGHT_W / 2 + 0.1), -drop / 2 + 0.7, TOP_Z - run / 2);
      side.rotation.x = -Math.atan2(drop, run);
      g.add(side); collide.push(side);
    }
  }

  const botZ = TOP_Z - GOING * STEPS;

  /**
   * 梯段的底面。
   *
   * 平台是通的，人可以走到梯底下去——而那底下原来什么都没有，
   * 一片纯黑，看上去像是场景漏了一块。补一块斜的橡木底板，
   * 顺便把梯脚的封边也做出来。
   */
  {
    const run = GOING * STEPS, drop = RISE * STEPS;
    const soffit = box(FLIGHT_W + 0.3, 0.10, Math.hypot(run, drop), oakDark);
    soffit.position.set(0, -drop / 2 - 0.16, TOP_Z - run / 2);
    soffit.rotation.x = -Math.atan2(drop, run);
    g.add(soffit);
    for (const s of [-1, 1]) {
      const side = box(0.09, 0.44, Math.hypot(run, drop), oakDark);
      side.position.set(s * (FLIGHT_W / 2 + 0.14), -drop / 2 - 0.02, TOP_Z - run / 2);
      side.rotation.x = -Math.atan2(drop, run);
      g.add(side);
    }
  }

  // 梯段两侧的栏板与橡木扶手
  for (const s of [-1, 1]) {
    const x = s * (FLIGHT_W / 2 + 0.06);
    for (let i = 0; i < STEPS; i += 3) {
      const y0 = -RISE * i, z0 = TOP_Z - GOING * i;
      const seg = ironPanel(GOING * 3 * 1.04, 0.82, iron, gilt);
      seg.position.set(x, y0 - RISE * 1.5 + 0.41, z0 - GOING * 1.5);
      seg.rotation.y = Math.PI / 2;
      seg.rotation.x = Math.atan2(RISE * 3, GOING * 3) * -1;
      g.add(seg);
    }
    // 扶手：一根沿梯段倾斜的橡木条
    const run = GOING * STEPS, drop = RISE * STEPS;
    const rail = box(0.075, 0.075, Math.hypot(run, drop), oakDark);
    rail.position.set(x, -drop / 2 + 0.86, TOP_Z - run / 2);
    rail.rotation.x = -Math.atan2(drop, run);
    g.add(rail);
    // 起步柱与柱头灯——那盏小天使灯就在这个位置
    g.add(put(cyl(0.10, 0.13, 1.02, 12, oakDark), x, -0.51 + 0.0, TOP_Z + 0.18));
    g.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.10, 14, 10), gilt), x, 0.08, TOP_Z + 0.18));
    const post = put(cyl(0.11, 0.14, 1.06, 12, oakDark), x, A_Y + 0.53, botZ - 0.2);
    g.add(post);
    const lampBase = put(cyl(0.07, 0.10, 0.30, 10, gilt), x, A_Y + 1.20, botZ - 0.2);
    g.add(lampBase);
    g.add(put(globe(0.16), x, A_Y + 1.52, botZ - 0.2));
  }

  /**
   * 艇甲板层门厅的镶板。
   *
   * 楼梯井上面那一圈原来露的是中央舱室的刷漆钢舱壁——
   * 人从甲板进门，脚下是柚木、面前是钢板，再往下才突然变成橡木和地毯，
   * 三种材质之间没有过渡。给门厅包一圈同样的橡木，上下才是一间屋子。
   */
  {
    /**
     * 注意这几个数要比中央舱室的舱壁【再往里缩一点】。
     * 第一版把镶板放在和钢舱壁完全重合的位置上，钢板的内表面反而更靠里，
     * 于是从楼梯上往上看，本该是橡木的一整面墙全是奶白色的刷漆钢——
     * 楼上楼下像两条船。
     */
    const VH = 2.9, vz0 = 62.2, vz1 = 73.8, vx = 6.78;
    // 门洞（z 68.0–71.2）处必须断开，否则刚开的门又被镶板堵死
    for (const s of [-1, 1]) {
      for (const [a, b] of [[vz0, 68.0], [71.2, vz1]]) {
        g.add(put(box(0.10, VH, b - a, oak), s * vx, VH / 2, (a + b) / 2));
        g.add(put(box(0.14, 0.30, b - a, oakDark), s * (vx - 0.03), 0.15, (a + b) / 2));
        g.add(put(box(0.16, 0.14, b - a, oakDark), s * (vx - 0.03), VH - 0.07, (a + b) / 2));
      }
      for (const z of [63.2, 66.2, 72.6]) {
        g.add(put(box(0.09, VH - 0.5, 0.30, oakDark), s * (vx - 0.06), 0.30 + (VH - 0.5) / 2, z));
        // 壁灯
        const sc = put(cyl(0.06, 0.09, 0.24, 10, gilt), s * (vx - 0.16), 1.95, z);
        g.add(sc);
        g.add(put(globe(0.11), s * (vx - 0.16), 2.14, z));
      }
    }
    for (const z of [vz0, vz1]) {
      g.add(put(box(vx * 2, VH, 0.10, oak), 0, VH / 2, z));
      g.add(put(box(vx * 2, 0.30, 0.14, oakDark), 0, 0.15, z + (z === vz0 ? 0.04 : -0.04)));
    }
  }

  // 楼梯井四周的护栏（艇甲板层）
  wellRail(0, WELL.z0, WELL.x0, WELL.x1, 0);
  wellRail(Math.PI / 2, WELL.x0, WELL.z0, WELL.z1, 0);
  wellRail(Math.PI / 2, WELL.x1, WELL.z0, WELL.z1, 0);
  // 梯口这一头只让出梯段那 3.6 m，两侧的空档照拦
  wellRail(0, WELL.z1, WELL.x0, WELL.x1, 0, [-FLIGHT_W / 2, FLIGHT_W / 2]);

  /* --------------------------------------- 平台正面的雕板与钟 */

  /**
   * 「荣誉与光荣加冕时间」。
   *
   * 平台正面那块雕板是这间屋子的正脸：中央一座钟，两侧各一个人像浮雕，
   * 外面一圈橡木涡卷。浮雕当然做不了，但这块板的分格、比例和那座钟
   * 必须在——照片里人一眼认出来的就是它。
   */
  const panelZ = botZ - 3.6;

  /**
   * 细木纹的橡木。
   *
   * 通用的 `oak` 材质是照**甲板厚板**调的：板宽 25 公分，板缝又深又直。
   * 铺在地上很对，可铺在这块雕板上，全船最讲究的一面墙读起来像间木板棚——
   * 一块 2.5 m 高的板上横着十道均匀的深缝，比什么装饰都抢眼。
   * 细木作的木纹尺度和甲板差一个数量级，所以这里单独取一份小尺度的。
   */
  const panelOak = getMaterial('oak', { color: '#6d4525', tileMeters: 0.16 });
  const panelDark = getMaterial('oak', { color: '#452c15', tileMeters: 0.14 });
  /**
   * 平贴的镏金线脚不能用 `gilt`。
   *
   * `gilt` 是金属度很高的真金属：在一个只有几盏暖灯的木头房间里，
   * 一块正对着你的平板金属反射到的是**屋子里的暗部**，读出来是橄榄绿的，
   * 不是金的。钟的圆环没这个问题，因为曲面总能扫到高光。
   * 建筑上的贴金本来也不是镜面——底下是石膏和木头，
   * 所以这里用低金属度的「金漆」，让它靠自身的颜色亮起来。
   */
  const giltFlat = new THREE.MeshStandardMaterial({
    color: '#c9a24a', roughness: 0.42, metalness: 0.28,
  });

  g.add(put(box(5.0, 2.55, 0.22, panelOak), 0, A_Y + 1.28, panelZ));
  g.add(put(box(5.4, 0.20, 0.34, panelDark), 0, A_Y + 2.62, panelZ));

  /**
   * 「荣誉与光荣加冕时间」。
   *
   * 钟两侧那两个人像是这块板出名的原因，也是这条船被照得最多的一处细节。
   * 真雕不可能，但**必须有层次**：第一版是两块 1.15 × 1.65 的平板加两道金条，
   * 读起来就是两块空木板——比不做还糟，因为它占着位置却什么都不是。
   *
   * 做法是把浮雕拆成几层前后错开的体块：底龛（凹进去）、
   * 人像的躯干与头（凸出来）、外扬的两臂、脚下的台座，
   * 再加一圈镏金的卷草框。每一层差一两公分，
   * 光一打就有明暗——**人认浮雕靠的是那层明暗，不是靠看清五官。**
   */
  const relief = (s) => {
    const cx = s * 1.42, cy = A_Y + 1.42, cz = panelZ + 0.11;
    // 底龛：比周围凹一点，四边压一道细线
    g.add(put(box(1.24, 1.80, 0.05, panelDark), cx, cy, cz - 0.02));
    for (const [dx, dy, w, h] of [
      [0, 0.93, 1.36, 0.07], [0, -0.93, 1.36, 0.07],
      [-0.68, 0, 0.07, 1.94], [0.68, 0, 0.07, 1.94],
    ]) {
      g.add(put(box(w, h, 0.09, giltFlat), cx + dx, cy + dy, cz + 0.03));
    }

    /**
     * 人像。
     *
     * 比例是这里唯一重要的事。第一版躯干做到 0.44 宽、起伏 0.17 深，
     * 在 1.24 宽的龛里就是一个方头方脑的木头人——**近人形而不像人，
     * 比一块空板更让人出戏**。浮雕读的是轮廓和那一层明暗：
     * 身体要窄（肩宽不到龛宽的三分之一）、要有从裙裾到肩的收分、
     * 起伏要浅（总共 9 公分，分三层），头只有全身的七分之一。
     * 五官一个都不做——低浮雕本来就看不清五官。
     */
    const H = 1.46;                      // 全身高
    const foot = cy - 0.80;              // 脚下
    g.add(put(box(0.62, 0.10, 0.13, panelOak), cx, foot + 0.05, cz + 0.04));   // 台座
    g.add(put(box(0.50, 0.07, 0.15, panelOak), cx, foot + 0.13, cz + 0.05));
    // 裙裾：三段逐渐收窄，做出立姿的收分
    const skirt = [[0.34, 0.30, 0.07], [0.29, 0.26, 0.08], [0.24, 0.22, 0.09]];
    skirt.forEach(([w, h2, d], i) => {
      g.add(put(box(w, h2, d, panelOak), cx, foot + 0.20 + i * 0.26 + h2 / 2, cz + 0.03 + i * 0.005));
    });
    // 衣褶：四道窄棱，比裙裾再凸一点点
    for (const d of [-0.09, -0.03, 0.03, 0.09]) {
      g.add(put(box(0.035, 0.70, 0.10, panelOak), cx + d, foot + 0.56, cz + 0.045));
    }
    // 腰以上
    g.add(put(box(0.24, 0.34, 0.10, panelOak), cx, foot + 1.02, cz + 0.05));
    g.add(put(box(0.34, 0.08, 0.10, panelOak), cx, foot + 1.21, cz + 0.05));   // 肩
    g.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.098, 12, 10), panelOak),
      cx, foot + 1.34, cz + 0.055));
    /**
     * 两条手臂都垂着、贴着身体。
     *
     * 试过让一条手臂朝钟举起来——「加冕时间」本来就是这个动作。
     * 但一根横着支出去的方棒在低浮雕里读成一块路牌，
     * 整个人像的轮廓被它切断了。**动作做不出来就别做**：
     * 垂着的双臂让轮廓从裙裾一路收到肩，人一眼认得出是个立像；
     * 那个动作交给中间那顶镏金花冠去暗示。
     */
    for (const d of [-1, 1]) {
      const arm = box(0.072, 0.46, 0.085, panelOak);
      arm.position.set(cx + d * 0.155, foot + 0.98, cz + 0.055);
      arm.rotation.z = -d * 0.075;
      g.add(arm);
    }
    // 手里各垂一支镏金的桂枝
    g.add(put(box(0.05, 0.26, 0.06, giltFlat), cx - s * 0.17, foot + 0.66, cz + 0.07));
  };

  for (const s of [-1, 1]) {
    g.add(put(box(0.26, 2.40, 0.30, panelDark), s * 2.35, A_Y + 1.25, panelZ));
    g.add(put(box(0.20, 0.16, 0.36, giltFlat), s * 2.35, A_Y + 2.48, panelZ));
    relief(s);
  }

  /**
   * 钟周围的卷草。
   *
   * 钟是个圆，板是个方，中间需要一点东西把两者接上——
   * 真板上是一圈雕出来的卷草和一顶花冠。这里用几段扭过角度的短条
   * 排成放射状，加一顶花冠，够了。
   */
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.31;
    const leaf = box(0.30, 0.07, 0.06, panelOak);
    leaf.position.set(Math.sin(a) * 0.64, A_Y + 1.72 + Math.cos(a) * 0.64, panelZ + 0.10);
    leaf.rotation.z = -a;
    g.add(leaf);
  }
  g.add(put(box(0.56, 0.10, 0.09, giltFlat), 0, A_Y + 2.44, panelZ + 0.12));
  for (const d of [-0.20, 0, 0.20]) {
    g.add(put(box(0.11, 0.20, 0.10, giltFlat), d, A_Y + 2.55, panelZ + 0.12));
  }
  // 雕板两侧补满到侧墙：板只有 5 米宽，两边空着的话人能绕到板后面，
  // 那后面什么都没有。
  for (const s of [-1, 1]) {
    g.add(put(box(ROOM_HALF - 2.5, 2.55, 0.22, panelOak), s * (2.5 + (ROOM_HALF - 2.5) / 2), A_Y + 1.28, panelZ));
    g.add(put(box(ROOM_HALF - 2.5, 0.20, 0.34, panelDark), s * (2.5 + (ROOM_HALF - 2.5) / 2), A_Y + 2.62, panelZ));
  }
  {
    const w = box(ROOM_HALF * 2, 3.2, 0.5, invis);
    w.position.set(0, A_Y + 1.6, panelZ); g.add(w); collide.push(w);
  }

  /**
   * 钟。
   *
   * 朝向这件事在这里错了两次，记一下：
   * 楼梯是从 +z 一侧降下来的，人站在平台上朝 −z 看这块板，
   * 所以钟必须装在板的【+z 面】上，也就是 panelZ + 0.12，
   * 而不是 −0.12——装反了从平台上根本看不见钟，
   * 板上只剩一片空木头，而这块板的全部意义就是那座钟。
   * 既然朝 +z，CircleGeometry 的默认朝向就是对的，不要再转 180°。
   */
  const FACE = 0.12;
  const clock = new THREE.Group();
  clock.add(put(cyl(0.46, 0.46, 0.12, 28, oakDark).rotateX(Math.PI / 2), 0, 0, 0));
  clock.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 10, 30), gilt), 0, 0, 0.08));
  // 表盘用素面：拿橡木材质当盘面的话，上面会横过一道道板缝
  const dialMat = new THREE.MeshStandardMaterial({ color: '#ded2b4', roughness: 0.55, metalness: 0 });
  clock.add(put(new THREE.Mesh(new THREE.CircleGeometry(0.39, 28), dialMat), 0, 0, 0.06));
  for (let i = 0; i < 12; i++) {                       // 时标
    const a = (i / 12) * Math.PI * 2;
    const t = box(0.030, 0.085, 0.02, gilt);
    t.position.set(Math.sin(a) * 0.31, Math.cos(a) * 0.31, 0.075);
    t.rotation.z = -a;
    clock.add(t);
  }
  // 指针停在 2 点 20 分——沉没的时刻
  const hand = (len, w, ang) => {
    const h = box(w, len, 0.015, getMaterial('oak', { color: '#241a12' }));
    h.position.set(Math.sin(ang) * len / 2, Math.cos(ang) * len / 2, 0.088);
    h.rotation.z = -ang;
    return h;
  };
  clock.add(hand(0.22, 0.030, Math.PI * 2 * (2.33 / 12)));
  clock.add(hand(0.33, 0.020, Math.PI * 2 * (20 / 60)));
  clock.add(put(new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), gilt), 0, 0, 0.10));
  clock.position.set(0, A_Y + 1.72, panelZ + FACE);
  /**
   * 钟上的零件一律不投影。
   *
   * 时标只有三厘米宽，但它们在盘面上投下的硬边影子有一指长，
   * 十二道影子放射开来，整个盘面变成一朵黑色的星——
   * 离表盘几厘米的小件，影子的信息量是负的。
   */
  clock.traverse((o) => { o.castShadow = false; });
  g.add(clock);

  // 钟两侧的浮雕位也得在 +z 面上
  const spot = new THREE.SpotLight(0xffdcb0, 26, 11, 0.95, 0.7, 2);
  spot.position.set(0, A_Y + 2.60, panelZ + 2.2);
  spot.target.position.set(0, A_Y + 1.72, panelZ);
  g.add(spot); g.add(spot.target);

  /* ------------------------------------------------ 灯与气氛 */

  // 穹顶底下的大吊灯：这间屋子的主光源
  const chand = new THREE.Group();
  chand.add(put(cyl(0.03, 0.03, 1.5, 6, gilt), 0, 0.75, 0));
  chand.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 28), gilt), 0, 0, 0));
  chand.add(put(new THREE.Mesh(new THREE.TorusGeometry(0.40, 0.030, 8, 24), gilt), 0, 0.26, 0));
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    chand.add(put(globe(0.075), Math.cos(a) * 0.62, 0.07, Math.sin(a) * 0.62));
    chand.add(put(cyl(0.014, 0.014, 0.26, 5, gilt), Math.cos(a) * 0.62, 0.22, Math.sin(a) * 0.62));
  }
  chand.position.set(0, 1.55, 69.0);
  g.add(chand);
  /**
   * 吊灯的光源要放在灯具下方一点。
   *
   * 放在鎏金环正中的话，环本身被自己照出一圈极亮的高光，
   * 再经泛光一放大就成了一团没有形状的白光球——灯反而看不见了。
   */
  const main = new THREE.PointLight(0xffd8a6, 19, 26, 2);
  main.position.set(0, 1.18, 69.0);
  g.add(main);
  // 墙角只补一盏，放在平台上方——四盏点光源换来的那点均匀度
  // 不值整条船每帧多算四次光照。
  const fill = new THREE.PointLight(0xffd9ae, 9, 16, 2);
  fill.position.set(0, A_Y + 2.4, botZ - 1.6);
  g.add(fill);

  /**
   * 梯段的下照光。
   *
   * 吊灯挂在楼梯井正中、离踏步三米多，衰减之后梯面上几乎没有光，
   * 从平台往上看是一段发黑的台阶。楼梯是这间屋子的主角，
   * 它自己得有一盏灯。
   */
  // 要挂在楼梯井的高处往下照。放在踏步上方半米的话，
  // 一个没有灯具的点光源会在梯面上烧出一块亮斑，像有人掉了个手电筒。
  const stairLamp = new THREE.PointLight(0xffd9ab, 26, 20, 2);
  stairLamp.position.set(0, 0.85, TOP_Z - GOING * STEPS * 0.5);
  g.add(stairLamp);

  // 穹顶透下来的日光：一盏向下的聚光，让楼梯上有一块亮
  // 穹顶透下来的日光原来是一盏单独的聚光，和吊灯位置几乎重合、
  // 作用也几乎重合——合并掉，省一盏。

  /**
   * 这里原来有两个「往下的去向」：门框加一块纯黑的平面，假装后面是往下的梯。
   * 现在下行的三段梯是真的了，这两个假门反而成了最糟的一种东西——
   * 看起来能走，走过去是一堵墙。删掉。
   */

  // 旧剪刀梯上下重叠、转身处净空为零；改用已审的分跑与休息平台。
  const lower = buildLowerStair();
  g.add(lower);
  collide.push(...lower.userData.collide);

  /* ------------------------------------- A 甲板平台上的陈设 */

  /**
   * 平台不能空着。
   *
   * 这块地方十三米长、十三米宽，铺完地毯之后是一整片没有任何东西的红色。
   * 人从艇甲板下来，第一眼看到的就是它——一个空房间，
   * 再华丽的雕板也救不回来。真船上这里靠墙摆着长沙发和扶手椅，
   * 角上是棕榈盆栽：**家具的作用不是「有家具」，是给这块地方一个尺度**，
   * 沙发的高度让人立刻知道这间屋子有多大。
   *
   * 陈设全部压成原型再克隆——一把椅子十几个 Mesh，
   * 摆六把就是一百个，那是这条船上最不值的一百个。
   */
  {
    const velvet = getMaterial('carpet', { color: '#6d3038' });
    const potMat = getMaterial('paint', { color: '#8c5a3c', gloss: 0.3 });
    const leafMat = getMaterial('paint', { color: '#3b5730', gloss: 0.16 });

    const settee = (() => {
      const q = new THREE.Group();
      q.add(put(box(1.94, 0.18, 0.70, velvet), 0, 0.44, 0));
      q.add(put(box(2.06, 0.12, 0.78, oakDark), 0, 0.32, 0));
      q.add(put(box(2.06, 0.66, 0.16, velvet), 0, 0.78, -0.31));
      q.add(put(box(2.14, 0.10, 0.20, oakDark), 0, 1.14, -0.33));
      for (const sx of [-0.98, 0.98]) {
        q.add(put(box(0.16, 0.46, 0.70, velvet), sx, 0.70, 0));
        q.add(put(box(0.10, 0.12, 0.76, oakDark), sx, 0.95, 0));
      }
      for (const sx of [-0.88, 0.88]) for (const sz of [-0.28, 0.28]) {
        q.add(put(cyl(0.035, 0.05, 0.30, 8, oakDark), sx, 0.15, sz));
      }
      return flattenProto(q);
    })();

    const palm = (() => {
      const q = new THREE.Group();
      q.add(put(cyl(0.27, 0.20, 0.42, 14, potMat), 0, 0.21, 0));
      q.add(put(cyl(0.30, 0.30, 0.06, 14, potMat), 0, 0.42, 0));
      q.add(put(cyl(0.04, 0.055, 0.72, 6, leafMat), 0, 0.78, 0));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + (i % 2) * 0.25;
        for (const [t, len, wid, drop] of [[0.36, 0.40, 0.09, 0.05], [0.68, 0.42, 0.06, 0.20]]) {
          const l = box(wid, 0.018, len, leafMat);
          l.position.set(Math.cos(a) * t, 1.18 - drop - (i % 3) * 0.07, Math.sin(a) * t);
          l.rotation.set(drop > 0.1 ? 0.9 : 0.42, -a, 0);
          q.add(l);
        }
      }
      return flattenProto(q);
    })();

    // 两侧墙前各一张长沙发，两头各一张对着雕板
    for (const s of [-1, 1]) {
      const q = settee.clone();
      q.position.set(s * (ROOM_HALF - 0.75), A_Y, 66.2);
      q.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(q);
      const w = box(0.9, 1.2, 2.2, invis);
      w.position.set(s * (ROOM_HALF - 0.75), A_Y + 0.6, 66.2);
      g.add(w); collide.push(w);

      const p2 = palm.clone();
      p2.position.set(s * (ROOM_HALF - 0.8), A_Y, ROOM_Z1 - 1.0);
      g.add(p2);
      const p3 = palm.clone();
      p3.position.set(s * (ROOM_HALF - 0.8), A_Y, botZ - 1.1);
      g.add(p3);
    }
  }

  g.userData.collide = collide;
  return g;
}
