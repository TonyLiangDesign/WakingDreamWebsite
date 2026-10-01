import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 静态几何合批。
 *
 * 这一步不是「优化」，是这个场景能不能用的前提。
 * 逐件建出来的甲板有四千八百个 Mesh，每帧主渲染一次、阴影图一次、
 * AO 的深度法线一次——实测一万七千次 draw call，在 RX 6900 XT 上只有 5 fps。
 * 瓶颈完全在提交次数上，和三角面数没关系（才 47 万）。
 *
 * 做法：把世界变换烘进顶点，按【材质 × 空间分块】合并。
 *   · 按材质合并 → draw call 从几千降到几十
 *   · 再按 z 分块 → 视锥剔除仍然有效，站在船尾时船头那几块不必提交
 *
 * 不动的东西：
 *   · InstancedMesh（本来就是一次提交）
 *   · 不可见的碰撞代理（不渲染，但射线要用，必须保持独立对象）
 *   · 标了 userData.noMerge 的（比如需要单独动的件）
 */

/**
 * 上层建筑的前后壁。和 bow.js 的 `BOW.FRONT_Z`、stern.js 的 `STERN.BACK_Z`
 * 是同一条线（interior/README.md 第 3 节也写着这两个数）。
 *
 * 这两条线把整条船分成三段，而这个划分对剔除极其关键：
 * **上层建筑之内，头顶永远有东西；之外（前后井甲板、艏楼、艉楼、靠泊桥），
 * 头顶就是天。** 下面所有「露天还是舱里」的判断都落在这一条上。
 */
const STERN_Z = -47.0;
const BOW_Z = 91.5;

/**
 * z 方向的分块长度（米）。
 *
 * 原来是 34。听上去「块小一点、剔除更准」，实测反过来：
 * 合批的批次里有大量【长条形】的东西（船壳、长廊、走廊、苏格兰路），
 * 一件几何体本来就横跨好几个块，切得再细也切不开它；
 * three 的视锥剔除又是拿**包围球**做的，长条的包围球半径大得离谱，
 * 站在船里沿着船轴看出去时，几乎每一块都算「在视锥内」——
 * 块数（= draw call）实打实地涨，剔除一点没多剔。
 *
 * 所以反过来走：**先按船体分段，再谈分块**。
 * `zBin` 把艉部、上层建筑、艏部各自分开（这一刀是必须的，见 cullByDeck：
 * 艏艉那两段露天，剔除规则和舱里不一样，不能混进同一个桶），
 * 上层建筑那一段 138.5 m 再按 CHUNK 切。CHUNK 给到 140 就是不再细切了——
 * 实测五个机位的 draw call 一路降到 CHUNK≈140 才收敛，再大没有收益。
 * 代价是每批的三角面多一些（视锥内提交的三角约多两成），
 * 但这个场景的瓶颈从来是提交次数，不是三角面。
 */
const CHUNK = 140;

/** 桶的 z 档：艉部 / 上层建筑第 n 段 / 艏部。 */
function zBin(z) {
  if (z < STERN_Z) return 'S';
  if (z > BOW_Z) return 'B';
  return Math.floor((z - STERN_Z) / CHUNK);
}

/**
 * 甲板面与各层的天花，按层剔除和分桶都用这一套数。
 *
 * DECK_FLOOR 和 interior/kit.js 的 `DECK` 是同一张表，只是末尾多一格：
 * 机器处所（锅炉舱 / 主机舱）的舱底在 −24.4，而它的「上一层」不是 G，
 * 是 F 甲板的地面 −17.6——这一格的净高有近七米，是客舱层的两倍多。
 * G（−20.5）在这一格【中间】，不能当成独立一层：不然人站在 G 的梯台上，
 * 带子的下沿会切在 −23.7，正好把脚下的舱底板剔掉。
 *
 * DECK_CEIL 是每层的天花，也就是上一层的地面。艇甲板没有上一层，写 Infinity。
 */
const DECK_FLOOR = [0, -3.1, -6.0, -8.9, -11.8, -14.7, -17.6, -24.4];
const DECK_CEIL = [Infinity, 0, -3.1, -6.0, -8.9, -11.8, -14.7, -17.6];

/**
 * 几何体归到哪一层（分桶用）。容差只给 0.15：
 * 地面（正好落在甲板面上）归本层，而挂在天花上的东西（本层地面 +2.6）
 * 也要归本层——所以判据是「在这层地面【之上】」，不是「离哪层近」。
 */
function deckOfY(y) {
  for (let i = 0; i < DECK_FLOOR.length; i++) if (y >= DECK_FLOOR[i] - 0.15) return i;
  return DECK_FLOOR.length - 1;
}

/**
 * 相机在哪一层。
 *
 * 传进来的是【相机】的高度，也就是脚下甲板面 + 眼高 1.68。
 * 层高 2.9 而眼高 1.68，所以拿「甲板面 + 1.0」当门槛，
 * 上下各留 0.7 m 以上的余量，走楼梯、跨门槛都不会跳档。
 */
function deckOfCamera(camY) {
  for (let i = 0; i < DECK_FLOOR.length; i++) if (camY >= DECK_FLOOR[i] + 1.0) return i;
  return DECK_FLOOR.length - 1;
}

/**
 * 把几何体规整成统一的形态，否则 mergeGeometries 会直接拒绝整批。
 *
 * 三件事必须统一，少一件就报错：
 *   · 属性集合（只留 position / normal / uv）
 *   · **有没有 index** —— 最容易漏的一条。THREE 的基本体都带索引，
 *     但只要原型里混进一个非索引的几何体（比如某处 toNonIndexed 过的、
 *     或者自己手写的放样），merge 就会报「make sure index attribute
 *     exists among all geometries, or in none of them」，然后
 *     **整批静默丢掉**——控制台一行红字，画面上少一把椅子，没人会注意。
 *   · 多材质分组（带端盖的圆柱）在这里没有意义，清掉。
 */
function normalize(geo) {
  const g = geo.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  // morphAttributes 也要清：merge 同样要求全有或全无
  g.morphAttributes = {};
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  if (g.groups.length > 1) g.clearGroups();
  return g;
}

/**
 * 把一件道具的原型压成「每种材质一个 Mesh」。
 *
 * 救生艇有七十来个零件、躺椅三十来个、吊艇架十几个，而它们各自要复制
 * 二十到四十份。先 clone 再整场合批的话，进场时要处理六千多个 Mesh，
 * 光合批这一步就要二十多秒——无头浏览器直接超时。
 * 先把原型压扁，复制出去的就是四五个 Mesh 而不是七十个，
 * 总量降一个数量级，最终的合批结果完全一样。
 */
/** 压扁的累计耗时，进场慢的时候要能看出是不是卡在这儿。 */
export const FLATTEN_STAT = { calls: 0, ms: 0, geos: 0 };

export function flattenProto(group) {
  const _t0 = performance.now();
  FLATTEN_STAT.calls++;
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const m = o.material;
    if (!m || Array.isArray(m) || m.visible === false) return;
    if (!o.geometry?.attributes?.position) return;
    let b = byMat.get(m.uuid);
    if (!b) { b = { mat: m, geos: [] }; byMat.set(m.uuid, b); }
    const g = normalize(o.geometry);
    g.applyMatrix4(o.matrixWorld);
    b.geos.push(g);
  });
  const out = new THREE.Group();
  for (const b of byMat.values()) {
    const g = b.geos.length === 1 ? b.geos[0] : mergeGeometries(b.geos, false);
    if (!g) {
      /**
       * 走到这里说明规整还是没规整干净。静默丢几何是最难查的一类问题——
       * 画面上少一把椅子，没人会注意；所以这里要把每件几何体的形态
       * 全都打出来，看一眼就知道是哪一项不一致。
       */
      const dump = b.geos.map((x, i) => `#${i}{`
        + `attr:${Object.keys(x.attributes).sort().join('+')},`
        + `idx:${x.index ? x.index.count : 'NONE'},`
        + `pos:${x.attributes.position.count},`
        + `grp:${x.groups.length},`
        + `morph:${Object.keys(x.morphAttributes || {}).length}}`).join(' ');
      console.warn(`[压扁失败] 材质 ${b.mat.name}/${b.mat.uuid.slice(0, 6)}，`
        + `${b.geos.length} 件被丢弃  ${dump}`);
      continue;
    }
    const mesh = new THREE.Mesh(g, b.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    out.add(mesh);
  }
  FLATTEN_STAT.ms += performance.now() - _t0;
  return out;
}

const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _box = new THREE.Box3();

/**
 * 把一桶几何体焊成一个。
 *
 * 不走 clone + mergeGeometries。那条路对每件几何体都要先复制一份完整的
 * 属性缓冲、再复制进合并结果；三千多件下来光是分配和 GC 就要十几秒，
 * 进场时整个页面卡死不动，无头浏览器直接超时。
 * 这里先数清总量、一次性开好数组，然后把顶点【边变换边写】进去，
 * 中间不产生任何临时几何体。
 */
function weld(list) {
  let nv = 0, ni = 0;
  for (const { geo } of list) {
    nv += geo.attributes.position.count;
    ni += geo.index ? geo.index.count : geo.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);

  let vo = 0, io = 0;
  for (const { geo, mat } of list) {
    const p = geo.attributes.position;
    const n = geo.attributes.normal;
    const t = geo.attributes.uv;
    const count = p.count;
    _nm.getNormalMatrix(mat);

    for (let i = 0; i < count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(mat);
      const o3 = (vo + i) * 3;
      pos[o3] = _v.x; pos[o3 + 1] = _v.y; pos[o3 + 2] = _v.z;
      if (n) {
        _v.fromBufferAttribute(n, i).applyMatrix3(_nm).normalize();
        nor[o3] = _v.x; nor[o3 + 1] = _v.y; nor[o3 + 2] = _v.z;
      }
      if (t) { uv[(vo + i) * 2] = t.getX(i); uv[(vo + i) * 2 + 1] = t.getY(i); }
    }
    if (geo.index) {
      const src = geo.index;
      for (let i = 0; i < src.count; i++) idx[io + i] = src.getX(i) + vo;
      io += src.count;
    } else {
      for (let i = 0; i < count; i++) idx[io + i] = vo + i;
      io += count;
    }
    vo += count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

export function bakeStatic(root) {
  root.updateWorldMatrix(true, true);
  // Batches are children of root. Bake in root-local space, otherwise a registered
  // ship's transform is applied once in the vertices and a second time at render.
  const rootInverse = root.matrixWorld.clone().invert();

  const buckets = new Map();   // key: 材质 + z 分块
  const doomed = [];

  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (o.userData.noMerge) return;
    const m = o.material;
    if (!m || Array.isArray(m)) return;
    if (m.visible === false) return;          // 碰撞代理：留着给射线用
    if (!o.geometry?.attributes?.position) return;

    /**
     * 分桶的键：材质 × z 分段 × 【所在层】。
     *
     * 加上层这一维，是为了让「站在甲板上时不渲染底下三层的室内」成为可能：
     * 只按 z 分的话，一个桶会同时包含艇甲板的栏杆和 D 甲板餐厅的桌子，
     * 想剔除其中一半就只能整桶一起留下。
     *
     * 两处曾经踩过的坑：
     *
     * ① 分层用的是 `Math.round(y / 3)`。层高 2.9、档宽 3，两套刻度对不齐：
     *    档的边界落在 y = −1.5 / −4.5 / −7.5…，而一层的空间是
     *    −3.1…−0.5 / −6.0…−3.4…——**每一层都横跨两个档**，
     *    于是同一层的地板和天花被拆进两个桶（批次白白多一倍），
     *    而 A 甲板的天花又和艇甲板的地板挤进同一个桶（想剔哪个都剔不掉）。
     *    现在直接按甲板表归档，一层就是一档。
     *
     * ② 归档看的是 `getWorldPosition`，也就是对象的**原点**。
     *    房间里大量几何体是 `flattenProto` 压出来的，原点留在房间的
     *    局部原点上，和它自己的几何体差着十几米——一件贴着 D 甲板地面的
     *    东西会因为原点在 B 甲板而被归去 B 甲板那一档。
     *    现在按**世界包围盒的中心**归档，几何体在哪儿就归哪儿。
     *    顺带地，同一个桶里的东西在空间上真的挨在一起了，
     *    合出来的包围球小得多，视锥剔除才真的起作用。
     */
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const localMatrix = rootInverse.clone().multiply(o.matrixWorld);
    _box.copy(o.geometry.boundingBox).applyMatrix4(localMatrix);
    const key = m.uuid
      + '#' + zBin((_box.min.z + _box.max.z) / 2)
      + '#' + deckOfY((_box.min.y + _box.max.y) / 2);
    let b = buckets.get(key);
    if (!b) { b = { mat: m, list: [] }; buckets.set(key, b); }
    b.list.push({ geo: o.geometry, mat: localMatrix });
    doomed.push(o);
  });

  const merged = new THREE.Group();
  merged.name = 'BakedStatic';
  let calls = 0;
  for (const b of buckets.values()) {
    const geo = weld(b.list);
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // 记下这一批的上下沿，供按层剔除用
    geo.computeBoundingBox();
    mesh.userData.yMin = geo.boundingBox.min.y;
    mesh.userData.yMax = geo.boundingBox.max.y;
    // 这一批在不在上层建筑之外（艏艉那两段露天的地方）——见 cullByDeck
    const zc = (geo.boundingBox.min.z + geo.boundingBox.max.z) / 2;
    mesh.userData.openEnd = zc < STERN_Z || zc > BOW_Z;
    // 水平范围，给「下面一层只留身边这一段」用
    mesh.userData.xMin = geo.boundingBox.min.x;
    mesh.userData.xMax = geo.boundingBox.max.x;
    mesh.userData.zMin = geo.boundingBox.min.z;
    mesh.userData.zMax = geo.boundingBox.max.z;
    merged.add(mesh);
    calls++;
  }

  /**
   * 原件保留在场景图里，只是不渲染。
   *
   * 第一版直接 remove 掉，结果甲板面整片「消失」——不是画面上消失，
   * 是碰撞上消失：buildDeckPlate 返回的是一个 Group，碰撞列表里存的是
   * 这个 Group，递归射线检测到的子 Mesh 被摘走之后就什么都打不到，
   * 人一传送上艇甲板就直接掉到水里。
   *
   * visible=false 的对象 WebGLRenderer 不会提交，但 Raycaster 照样命中，
   * 而且矩阵还会跟着更新——合批的收益一分不少，碰撞一点不动。
   */
  for (const o of doomed) o.visible = false;

  root.add(merged);
  return { batches: calls, merged: doomed.length };
}


/**
 * 按层剔除。
 *
 * 室内建出来之后，站在艇甲板上也要渲染底下三层的走廊、客舱、餐厅——
 * 而这些东西**一个像素都看不见**：它们被船壳整个包着。
 * 视锥剔除帮不上忙（它们确实在视锥里），three 也不做遮挡剔除。
 * 所以按高度直接关掉：只保留和玩家所在那一层相交的批次。
 *
 * 跨层的批次（贯穿四层的楼梯井、机舱竖井、烟囱、桅杆、主机）
 * 包围盒本来就很高，只要和带子相交就会留下，不会被误杀。
 *
 * ── 带子不能拿「相机高度 ± 常数」来划 ────────────────────────
 *
 * 老写法是 `camY − 6 … camY + 8`：一条 14 m 高的带子，而客舱层高只有
 * 2.9 m，一次留下四到五层。想收窄却收不动，因为同一个常数要同时伺候
 * 两种层高完全不同的空间——上沿给 3.4 就够客舱用，可锅炉舱净高六米，
 * 它【自己的天花】在 6.2 m 高处，当场被剔掉，人在锅炉之间抬头看见天空。
 *
 * 现在按**玩家所在那一层的地板和天花**来划：
 *   下沿 = 本层地板 − below    （能透过楼梯井、舱口看见下面一层）
 *   上沿 = 本层天花 + above    （天花本身，以及天花上面那层的地面陈设）
 * 层高不再是一个常数，锅炉舱那一格自己就是七米高，天花自然留得住；
 * 客舱层那一格只有 2.9 m，收得紧紧的。
 *
 * `below` 给 3.2 是有讲究的：下面一层的**地板**在本层地板 −2.9，
 * 板本身还有厚度，3.2 刚好把「下面一整层，连地板带家具」整个包进来。
 * 收到 1.5 会出更难看的毛病——不是整层不见，是**半层不见**：
 * 下层那些高过 1.4 m 的柜子衣橱还在，矮桌矮床没了。
 *
 * 上沿写的是「天花 + above」而不是「天花 − 一点」：一层的天花就是
 * 上一层的地面，上一层的家具全都**坐在这个高度上**（包围盒下沿正好等于
 * 天花高度），所以这样划等于「本层 + 完整的上一层」——故意留得宽一格，
 * 楼梯口、天窗、货舱口这些通上去的地方才不会露馅。
 *
 * ── 露天的地方不封顶 ──────────────────────────────────
 *
 * 麻烦在于「上一层」这个概念只在舱里成立。人站在艉楼甲板上往艏看，
 * 头顶是天，眼前是整条船：四根烟囱（下沿 y=1.1）、两根桅杆、
 * 一整片索具，全都远在「B 甲板的天花 −3.1」之上。给了上限就当场消失。
 *
 * 所以先判断**人是不是在露天下**，判据就两条，都来自船体本身的尺寸：
 *   · 站在艇甲板上（最上面一层，头顶没有别的甲板）；
 *   · 或者人在上层建筑的前后壁之外（z > 91.5 / z < −47）——
 *     那里是前后井甲板、艏楼、艉楼、靠泊桥，全部露天。
 * 露天就不封顶。舱里（上层建筑之内、艇甲板以下）才按天花封。
 *
 * 还有一条对称的：人在露天时，**艏艉那两段（openEnd）整段不按层剔**。
 * 从艇甲板前缘俯看前井甲板，那里的绞车、吊杆柱、锚链在 −8.5，
 * 比艇甲板低了三层，按层早剔没了——可它们就明晃晃地在画面里。
 * 艏艉在上层建筑外面，本来就是一眼看到底的，不参与分层这套。
 *
 * ── 楼梯井：光看「人在第几层」是不够的 ─────────────────────
 *
 * 大楼梯是一口从艇甲板通到 D 甲板的**竖井**。人站在 A 到 B 之间的
 * 梯段上，按高度算「在 B 甲板」，于是上沿封在 B 的天花 −3.1——
 * 可他抬头看见的是二十米高的井口、艇甲板层的舱壁和穹顶。
 * 实拍过一张：整片井口连同穹顶消失，正上方一块天。
 *
 * 所以上沿还要问一句「头顶到底有没有东西」：`ceilY` 是调用方从
 * 相机往正上方打一条射线、在**碰撞几何**上取到的第一个命中高度
 * （见 main.js）。这个数只用来**抬高**上沿，不会压低它：
 *   · 梯井里射线穿过井口，打不到近处的甲板 → 上沿放开，井口全留；
 *   · 舱里射线打在上一层的地板上 → 和甲板表给的是同一个数；
 *   · 射线打在上铺、行李架这类家具上 → 比甲板表低，被 max 挡掉，
 *     不会因为一件家具就把天花剔了。
 *
 * ── 下面一层只留身边这一段 ────────────────────────────────
 *
 * `below` 把下面一整层原封不动地留着，代价不小：大楼梯 A 平台那一个机位，
 * 视锥里两百六十多批，B 甲板一层就占九十多批。
 * 可下面那一层【只能从身边的梯口、舱口看见】——隔着一层甲板，
 * 四十米外的那一层和你之间是实打实的地板。
 * 所以完全在本层地面以下的批次再过一道水平距离：`reach` 之外不留。
 * 判的是批次包围盒到相机的水平距离，长条形的批次只要有一头够得着就留。
 *
 * 只对【下面】这么做，上面不做：人在露天甲板上时，头顶的烟囱、桅杆、
 * 索具离得再远也看得见，一加距离限制，从艉楼往艏看四根烟囱就没了。
 */
export function cullByDeck(merged, cam,
  { below = 3.2, above = 1.5, reach = 45, ceilY = Infinity } = {}) {
  const i = deckOfCamera(cam.y);
  const open = i === 0 || cam.z < STERN_Z || cam.z > BOW_Z;
  const floor = DECK_FLOOR[i];
  const lo = floor - below;
  const hi = (open || ceilY === Infinity)
    ? Infinity
    : Math.max(DECK_CEIL[i], ceilY) + above;
  const r2 = reach * reach;
  for (const m of merged.children) {
    const d = m.userData;
    if (d.yMin === undefined) continue;
    let keep = (d.yMax >= lo && d.yMin <= hi) || (open && d.openEnd);
    // 整个在本层地面以下、又不在艏艉那两段的：远了就不留
    if (keep && !d.openEnd && d.yMax < floor - 0.2) {
      const dx = Math.max(d.xMin - cam.x, 0, cam.x - d.xMax);
      const dz = Math.max(d.zMin - cam.z, 0, cam.z - d.zMax);
      if (dx * dx + dz * dz > r2) keep = false;
    }
    m.visible = keep;
  }
}
