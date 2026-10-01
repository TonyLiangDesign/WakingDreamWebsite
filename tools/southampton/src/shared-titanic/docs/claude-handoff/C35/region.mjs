/**
 * C35-R1 · 前部大楼梯与多层门厅 · 区域三维草模（工程暂定，placementStatus = provisional）
 *
 * 坐标系：walk-authoring-v0（米，+Y 向上，+Z 向艏，+X 右舷）。
 *   甲板标高取冻结快照 ship-reference.js:20-23 的 DECK_LEVELS 近似值；
 *   不做 presentation 纵向换算（worldZ），不做任何尺度变换。
 *
 * 用法：import { buildRegion } from './region.mjs'; scene.add(buildRegion(THREE));
 *   · 由调用方注入 THREE；本模块不导入 three、不创建 renderer、不改全局。
 *   · 所有几何都放在世界坐标（Group 本身位于原点、无旋转缩放）。
 *   · 分组：root → deck-<BOAT|A|B|C|D> → deck-<X>.<category>，可按层或按类别开关。
 *
 * 不含：细小饰件、灯光、碰撞代理、交互；不重复 C21（A 甲板公共厅）/C24（D 甲板接待厅）。
 * “现状”= DISPATCH-09 冻结快照 staircase.js / boatdeck.js 中的数值；“工程暂定”= 本草模的假设，不是史实。
 */

export const REGION_ID = 'C35-forward-grand-stair';
export const PLACEMENT_STATUS = 'provisional';

export const COORDINATE_SYSTEM = Object.freeze({
  id: 'walk-authoring-v0',
  units: 'metres',
  axes: { x: 'starboard', y: 'up', z: 'forward' },
  origin: '艇甲板面 y=0；楼梯区沿用现状 staircase.js/boatdeck.js 的作者坐标（未做纵向登记换算）',
  source: 'ship-reference.js:6-9,20-31；staircase.js:21；boatdeck.js:25',
});

export const DECKS = Object.freeze(['BOAT', 'A', 'B', 'C', 'D']);

/** 甲板地面 y（ship-reference.js:20-23，近似值，待图纸）。 */
export const DECK_Y = Object.freeze({ BOAT: 0, A: -3.1, B: -6, C: -8.9, D: -11.8 });

export const CATEGORIES = Object.freeze([
  'shaft',      // 井道（楼梯井空腔示意体量）
  'flights',    // 梯段
  'landings',   // 层间休息平台
  'foyer',      // 门厅楼板（本层地面，含楼板开口切分）
  'openings',   // 楼板开口轮廓标记
  'interfaces', // 相邻区域接口标记
  'walls',      // 墙体（艏/艉/左舷）
  'wallsStbd',  // 右舷墙体（纵剖时隐藏）
  'guards',     // 护栏代理（井口/梯段/平台）
  'cover',      // 上盖（艇甲板中央舱室顶板中本区一段，含穹顶开口）
  'dome',       // 穹顶基础体量
  'clock',      // 钟面雕板基础体量
]);

export const CATEGORY_LABELS = Object.freeze({
  shaft: '井道', flights: '梯段', landings: '休息平台', foyer: '门厅楼板', openings: '楼板开口',
  interfaces: '接口标记', walls: '墙体', wallsStbd: '右舷墙体', guards: '护栏代理',
  cover: '上盖', dome: '穹顶', clock: '钟面雕板',
});

const S = 'docs/agent-mailbox/specs/inputs/DISPATCH-09/';
const ST = 'staircase.js', BD = 'boatdeck.js', SR = 'ship-reference.js', SA = 'spatial-audit.md';

/**
 * 参数表：每项 { v, kind: '现状' | '工程暂定' | '推导', src, note }。
 * src 中的文件均指 DISPATCH-09 冻结快照（前缀见 SOURCE_ROOT），行号为快照行号。
 */
export const SOURCE_ROOT = S;
export const PARAMS = Object.freeze({
  deckY: { v: DECK_Y, kind: '现状', src: `${SR}:20-23`, note: '甲板标高为 legacy 近似值（deckStatus: legacy-approximation-awaiting-plans，ship-reference.js:17）' },
  slabT: { v: 0.16, kind: '现状', src: `${ST}:207-208`, note: '现状平台地面盒厚 0.16，顶面即甲板面' },
  wallT: { v: 0.16, kind: '现状', src: `${ST}:224`, note: '现状橡木墙板厚 0.16' },
  hallHalfW: { v: 6.6, kind: '现状', src: `${ST}:49`, note: 'A–D 层楼梯间半宽 ROOM_HALF' },
  hallZ0: { v: 63.7, kind: '现状', src: `${ST}:60`, note: '楼梯间艉墙 ROOM_Z0' },
  hallZ1: { v: 74.6, kind: '现状', src: `${ST}:60`, note: '楼梯间艏墙 ROOM_Z1' },
  boatWell: { v: { x0: -4.4, x1: 4.4, z0: 67.0, z1: 73.0 }, kind: '现状', src: `${ST}:45；${BD}:136-140`, note: '艇甲板楼梯井开口；甲板面按此切四块' },
  boatFoyer: { v: { halfW: 6.78, z0: 62.2, z1: 73.8, h: 2.9 }, kind: '现状', src: `${ST}:362`, note: '艇甲板层门厅镶板范围 vx/vz0/vz1/VH' },
  boatDoor: { v: { z0: 68.0, z1: 71.2, h: 2.35 }, kind: '现状', src: `${BD}:43,67；${ST}:365`, note: '中央舱室两舷“前部大楼梯门厅”门洞与净高' },
  house: { v: { halfW: 7.0, z1: 74.0, wallH: 2.95, roofY0: 2.95, roofY1: 3.23 }, kind: '现状', src: `${BD}:29,60-61,309`, note: '中央舱室半宽、艏端、净高与顶板（H+0.14 处 0.28 厚）' },
  dome: { v: { x: 0, y: 3.1, z: 70, R: 4.2, baseW: 9.6, baseH: 0.55, ringW: 8.8, ringH: 0.35, sphereDy: 0.9 }, kind: '现状', src: `${BD}:390-398,420,1066`, note: '穹顶位置、半径、基座与铁圈；本草模把基座/铁圈改为中空方框，玻璃穹只做半球体量' },
  roofOpening: { v: { x0: -4.2, x1: 4.2, z0: 65.8, z1: 74.0 }, kind: '工程暂定', src: `${BD}:309,390,1066`, note: '现状舱顶板连续穿过穹顶下方（封口）；按穹顶半径开方孔，艏向截止于中央舱室艏端 74.0' },
  mainFlight: { v: { x0: -1.8, x1: 1.8, zTop: 73.0, n: 18, going: 0.29, dir: -1 }, kind: '现状', src: `${ST}:151-152,267,298`, note: '艇甲板→A 主梯：18 级、踏步 0.29、宽 3.6、由艏向艉下行' },
  mainRise: { v: 3.1 / 18, kind: '工程暂定', src: `${ST}:151`, note: '现状 0.172×18=3.096，比层高 3.1 少 4 mm，梯脚错台；改为 3.1/18 整除闭合' },
  aSideDoor: { v: { z0: 69.2, z1: 70.9, h: 2.25 }, kind: '现状', src: `${ST}:221,229`, note: 'A 层两舷门洞（现状注释：通 A 甲板封闭散步长廊）' },
  lowerSideDoor: { v: { z0: 69.4, z1: 70.9, h: 2.1 }, kind: '现状', src: `${ST}:742,744`, note: 'B/C/D 层两舷门洞' },
  aftDoor: { v: { w: 1.5, h: 2.1 }, kind: '现状', src: `${ST}:742,755-765`, note: 'B/C/D 层艉墙中线门洞' },
  fwdDoor: { v: { x0: 4.85, x1: 6.05, h: 2.1 }, kind: '工程暂定', src: `${ST}:755-765`, note: '现状艏墙中线门洞在新布置下正对下行开口/梯下低净空，改到两侧走道端部（两舷对称）' },
  clock: { v: { panelZ: 67.78 - 3.6, panelH: 2.55, panelT: 0.22, r: 0.46, cy: 1.72 }, kind: '现状', src: `${ST}:400,425,545,567`, note: '雕板 z=botZ−3.6、高 2.55、钟半径 0.46、钟心 A+1.72；雕板两侧补满到侧墙（:524-527）' },
  lowerScheme: { v: '双侧分跑下行 → 艏端休息平台 → 中央单跑向艉回折', kind: '工程暂定', src: `${ST}:200,651-661,710-781`, note: '现状 A 以下为同一平面位置交替方向的直跑剪刀梯，无休息平台，梯段首尾上下重叠、净空为零（见 layout.json currentStateFindings）；改为每层两半跑的工程方案，非史实' },
  halfDrop: { v: 1.45, kind: '推导', src: `${SR}:21`, note: '层高 2.9 / 2' },
  lowerN: { v: 9, kind: '工程暂定', src: '—', note: '每半跑 9 级：rise 0.1611、2r+g=0.602' },
  lowerGoing: { v: 0.28, kind: '工程暂定', src: `${ST}:661`, note: '现状下行踏步约 0.288；取 0.28 以在 10.9 m 进深内放下 1.3 m 平台' },
  sideFlightX: { v: { x0: 2.2, x1: 4.4 }, kind: '工程暂定', src: `${ST}:45`, note: '两侧分跑宽 2.2，外沿对齐艇甲板井口半宽 4.4' },
  centralFlightX: { v: { x0: -1.5, x1: 1.5 }, kind: '工程暂定', src: `${ST}:655`, note: '中央回折跑宽 3.0（现状下行梯宽 3.4）' },
  lowerOpening: { v: { x0: -4.4, x1: 4.4, z0: 73.2 - 9 * 0.28, z1: 74.52 }, kind: '工程暂定', src: `${ST}:45,200`, note: '现状 DOWN 开口 x±3.9 z68.0–73.4；新开口与艇甲板井口同宽，艏向到墙内皮' },
  landing: { v: { x0: -4.4, x1: 4.4, z0: 73.2, z1: 74.5, t: 0.2 }, kind: '工程暂定', src: '—', note: '艏端休息平台进深 1.3 m、厚 0.2' },
  flightSoffitT: { v: 0.3, kind: '工程暂定', src: '—', note: '梯段梯头处结构厚度，底面为直线斜板' },
  railH: { v: 1.0, kind: '工程暂定', src: `${ST}:178,183`, note: '护栏代理高度（现状栏板 0.86+扶手、碰撞墙 1.2）' },
  headroom: { v: 2.0, kind: '工程暂定', src: '—', note: '检查用最小净高；门洞净高 2.1–2.35 均高于此值' },
  dFloor: { v: 'closed', kind: '工程暂定', src: `${ST}:651；${SA}:64`, note: '现状楼梯续到 E；本任务范围止于 D，D 层楼板封闭，E 续梯只留接口标记' },
});

/* ------------------------------------------------------------------ 布局数据 */

const r3 = (n) => Math.round(n * 1e6) / 1e6;

/** 纯数据布局：几何构造与 check.mjs 共用。 */
export function computeLayout() {
  const T = PARAMS.slabT.v, WT = PARAMS.wallT.v;
  const HW = PARAMS.hallHalfW.v, HZ0 = PARAMS.hallZ0.v, HZ1 = PARAMS.hallZ1.v;
  const well = PARAMS.boatWell.v, bf = PARAMS.boatFoyer.v, house = PARAMS.house.v;
  const N = PARAMS.lowerN.v, G = PARAMS.lowerGoing.v, HD = PARAMS.halfDrop.v;
  const land = PARAMS.landing.v;
  const openZ0 = r3(land.z0 - N * G);          // 70.68
  const openZ1 = PARAMS.lowerOpening.v.z1;     // 74.52（墙内皮）
  const sx = PARAMS.sideFlightX.v, cx = PARAMS.centralFlightX.v;

  const decks = {};
  const flights = [], landings = [], slabs = [], openings = [], walls = [], guards = [], interfaces = [], shafts = [];
  const above = { BOAT: null, A: 'BOAT', B: 'A', C: 'B', D: 'C' };

  for (const d of DECKS) {
    const y = DECK_Y[d];
    const ceil = d === 'BOAT' ? house.roofY0 : DECK_Y[above[d]] - T;
    decks[d] = {
      floorY: y, ceilingY: r3(ceil), clearHeight: r3(ceil - y),
      footprint: d === 'BOAT' ? { x0: -bf.halfW, x1: bf.halfW, z0: bf.z0, z1: bf.z1 } : { x0: -HW, x1: HW, z0: HZ0, z1: HZ1 },
      heightSource: d === 'BOAT' ? `${ST}:362（门厅镶板高 2.9）；${BD}:61,309（舱顶底 2.95）` : `${SR}:20-23；上层楼板底 = 上层甲板 − ${T}`,
    };
  }

  /* ---- 艇甲板层 ---- */
  {
    const y = 0;
    // 楼板：区域范围取门厅与 A 层楼梯间在平面上的并集外框，挖去井口
    const X = bf.halfW, Z0 = bf.z0, Z1 = HZ1;
    for (const [id, x0, x1, z0, z1] of [
      ['aft', -X, X, Z0, well.z0], ['fwd', -X, X, well.z1, Z1],
      ['port', -X, well.x0, well.z0, well.z1], ['stbd', well.x1, X, well.z0, well.z1],
    ]) slabs.push({ id: `BOAT-slab-${id}`, deck: 'BOAT', x0, x1, z0, z1, y0: y - T, y1: y });
    openings.push({ id: 'BOAT-well', deck: 'BOAT', ...well, y, src: PARAMS.boatWell.src, kind: '现状' });
    shafts.push({ id: 'BOAT-well-shaft', deck: 'BOAT', x0: well.x0, x1: well.x1, z0: well.z0, z1: well.z1, y0: DECK_Y.A, y1: 0 });
    const ro = PARAMS.roofOpening.v;
    shafts.push({ id: 'BOAT-dome-lightwell', deck: 'BOAT', x0: ro.x0, x1: ro.x1, z0: ro.z0, z1: ro.z1, y0: 0, y1: house.roofY1 });

    // 门厅墙（镶板线 x=±6.78），两舷门洞
    const bd = PARAMS.boatDoor.v;
    for (const s of [-1, 1]) {
      walls.push({ id: `BOAT-wall-${s > 0 ? 'stbd' : 'port'}`, deck: 'BOAT', axis: 'x', at: s * bf.halfW, a: bf.z0, b: bf.z1, y0: y, h: bf.h, t: WT,
        gaps: [{ a: bd.z0, b: bd.z1, h: bd.h, iface: `IF-BOAT-${s > 0 ? 'stbd' : 'port'}-door` }], side: s > 0 ? 'stbd' : 'port' });
    }
    for (const [nm, z] of [['aft', bf.z0], ['fwd', bf.z1]]) {
      walls.push({ id: `BOAT-wall-${nm}`, deck: 'BOAT', axis: 'z', at: z, a: -(bf.halfW - WT / 2), b: bf.halfW - WT / 2, y0: y, h: bf.h, t: WT, gaps: [], side: nm });
    }
    // 主梯
    const mf = PARAMS.mainFlight.v;
    flights.push(mkFlight({ id: 'BOAT-main', deck: 'BOAT', x0: mf.x0, x1: mf.x1, zTop: mf.zTop, yTop: 0, n: mf.n, rise: PARAMS.mainRise.v, going: mf.going, dir: mf.dir,
      topOn: 'BOAT-slab-fwd', footOn: 'A-slab-aft', role: '艇甲板→A 主梯（现状保留）' }));
    // 井口护栏：梯口只让出梯段宽度
    guards.push(g('BOAT-rail-aft', 'BOAT', well.x0, well.x1, well.z0 - 0.06, well.z0, y));
    guards.push(g('BOAT-rail-fwd-port', 'BOAT', well.x0, mf.x0, well.z1, well.z1 + 0.06, y));
    guards.push(g('BOAT-rail-fwd-stbd', 'BOAT', mf.x1, well.x1, well.z1, well.z1 + 0.06, y));
    guards.push(g('BOAT-rail-port', 'BOAT', well.x0 - 0.06, well.x0, well.z0, well.z1, y));
    guards.push(g('BOAT-rail-stbd', 'BOAT', well.x1, well.x1 + 0.06, well.z0, well.z1, y));
  }

  /* ---- A–D 层 ---- */
  const DOWN_DECKS = ['A', 'B', 'C'];
  for (const d of ['A', 'B', 'C', 'D']) {
    const y = DECK_Y[d];
    const dk = decks[d];
    const hasOpening = DOWN_DECKS.includes(d);
    if (hasOpening) {
      for (const [id, x0, x1, z0, z1] of [
        ['aft', -HW, HW, HZ0, openZ0], ['port', -HW, -4.4, openZ0, HZ1], ['stbd', 4.4, HW, openZ0, HZ1], ['fwd', -4.4, 4.4, openZ1, HZ1],
      ]) slabs.push({ id: `${d}-slab-${id}`, deck: d, x0, x1, z0, z1, y0: y - T, y1: y });
      openings.push({ id: `${d}-opening`, deck: d, x0: -4.4, x1: 4.4, z0: openZ0, z1: openZ1, y, src: PARAMS.lowerOpening.src, kind: '工程暂定' });
      shafts.push({ id: `${d}-shaft`, deck: d, x0: -4.4, x1: 4.4, z0: openZ0, z1: openZ1, y0: y - 2 * HD, y1: y });
    } else {
      slabs.push({ id: `${d}-slab-aft`, deck: d, x0: -HW, x1: HW, z0: HZ0, z1: HZ1, y0: y - T, y1: y });
    }

    // 墙
    const top = dk.ceilingY;
    const sideDoor = d === 'A' ? PARAMS.aSideDoor.v : PARAMS.lowerSideDoor.v;
    const sideTarget = d === 'A' ? 'A 甲板封闭散步长廊（promenade-a 现状；两舷散步区属 C37 范围）' : `${d} 层两舷走廊（现状门洞，去向未登记）`;
    for (const s of [-1, 1]) {
      const sn = s > 0 ? 'stbd' : 'port';
      walls.push({ id: `${d}-wall-${sn}`, deck: d, axis: 'x', at: s * HW, a: HZ0, b: HZ1, y0: y, h: r3(top - y), t: WT,
        gaps: [{ a: sideDoor.z0, b: sideDoor.z1, h: sideDoor.h, iface: `IF-${d}-${sn}-door` }], side: sn });
      interfaces.push({ id: `IF-${d}-${sn}-door`, deck: d, type: 'door', axis: 'x', at: s * HW, a: sideDoor.z0, b: sideDoor.z1, y, h: sideDoor.h,
        target: sideTarget, status: '现状门洞（接合对象未验证）', src: d === 'A' ? PARAMS.aSideDoor.src : PARAMS.lowerSideDoor.src });
    }
    const aftGaps = d === 'A' ? [] : [{ a: -PARAMS.aftDoor.v.w / 2, b: PARAMS.aftDoor.v.w / 2, h: PARAMS.aftDoor.v.h, iface: `IF-${d}-aft-door` }];
    const fwdGaps = d === 'A' ? [] : [
      { a: -PARAMS.fwdDoor.v.x1, b: -PARAMS.fwdDoor.v.x0, h: PARAMS.fwdDoor.v.h, iface: `IF-${d}-fwd-port-door` },
      { a: PARAMS.fwdDoor.v.x0, b: PARAMS.fwdDoor.v.x1, h: PARAMS.fwdDoor.v.h, iface: `IF-${d}-fwd-stbd-door` },
    ];
    walls.push({ id: `${d}-wall-aft`, deck: d, axis: 'z', at: HZ0, a: -(HW - WT / 2), b: HW - WT / 2, y0: y, h: r3(top - y), t: WT, gaps: aftGaps, side: 'aft' });
    walls.push({ id: `${d}-wall-fwd`, deck: d, axis: 'z', at: HZ1, a: -(HW - WT / 2), b: HW - WT / 2, y0: y, h: r3(top - y), t: WT, gaps: fwdGaps, side: 'fwd' });

    const aftTarget = {
      A: 'C21 · A 甲板公共厅方向（现状艉墙为雕板实墙，无门；接合方式未知）',
      B: 'B 甲板头等舱走廊 corridor-b（spatial-audit.md:119：走廊止于 z≈63.4）',
      C: 'C 甲板头等舱走廊方向（corridor-c 现状观察点 z=26.4，接合未验证）',
      D: 'C24 · D 甲板接待厅（reception-d 现状观察点 z=50.6；只标接口，不建厅）',
    }[d];
    if (d === 'A') {
      interfaces.push({ id: 'IF-A-aft-unknown', deck: 'A', type: 'unknown', axis: 'z', at: HZ0, a: -1.5, b: 1.5, y, h: 2.1, target: aftTarget, status: '未知接口（无门洞）', src: `${ST}:246-250；${SA}:65` });
      interfaces.push({ id: 'IF-A-fwd-unknown', deck: 'A', type: 'unknown', axis: 'z', at: HZ1, a: -1.5, b: 1.5, y, h: 2.1, target: 'A 层艏侧（客舱/电梯方向，现状艏墙实墙）', status: '未知接口（无门洞）', src: `${ST}:246-250；${SA}:131` });
    } else {
      interfaces.push({ id: `IF-${d}-aft-door`, deck: d, type: 'door', axis: 'z', at: HZ0, a: -0.75, b: 0.75, y, h: 2.1, target: aftTarget, status: '现状门洞（接合未验证）', src: `${PARAMS.aftDoor.src}${d === 'B' ? `；${SA}:119` : d === 'D' ? `；${SA}:87` : `；${SA}:82`}` });
      for (const s of [-1, 1]) {
        interfaces.push({ id: `IF-${d}-fwd-${s > 0 ? 'stbd' : 'port'}-door`, deck: d, type: 'door', axis: 'z', at: HZ1, a: s > 0 ? PARAMS.fwdDoor.v.x0 : -PARAMS.fwdDoor.v.x1, b: s > 0 ? PARAMS.fwdDoor.v.x1 : -PARAMS.fwdDoor.v.x0, y, h: 2.1,
          target: `大楼梯前部客舱 forward-cabins（${SA}:77，B/C/D）`, status: '工程暂定门位（由现状中线门迁移）', src: PARAMS.fwdDoor.src });
      }
    }

    // 下行模块：两侧分跑 → 平台 → 中央回折
    if (hasOpening) {
      const yl = r3(y - HD), yb = r3(y - 2 * HD);
      const next = { A: 'B', B: 'C', C: 'D' }[d];
      for (const s of [-1, 1]) {
        const sn = s > 0 ? 'stbd' : 'port';
        flights.push(mkFlight({ id: `${d}-side-${sn}`, deck: d, x0: s > 0 ? sx.x0 : -sx.x1, x1: s > 0 ? sx.x1 : -sx.x0, zTop: openZ0, yTop: y, n: N, rise: HD / N, going: G, dir: 1,
          topOn: `${d}-slab-aft`, footOn: `${d}-landing`, role: `${d}→${d}/${next} 休息平台 · ${sn === 'stbd' ? '右舷' : '左舷'}分跑（工程暂定）` }));
      }
      landings.push({ id: `${d}-landing`, deck: d, x0: land.x0, x1: land.x1, z0: land.z0, z1: land.z1, y1: yl, y0: r3(yl - land.t), role: `${d}/${next} 层间休息平台（工程暂定）` });
      flights.push(mkFlight({ id: `${d}-central`, deck: d, x0: cx.x0, x1: cx.x1, zTop: land.z0, yTop: yl, n: N, rise: HD / N, going: G, dir: -1,
        topOn: `${d}-landing`, footOn: `${next}-slab-aft`, role: `${d}/${next} 休息平台→${next} 中央回折跑（工程暂定）` }));

      // 护栏：开口艉沿（让出梯口）、两侧沿、平台缺口与外沿、梯段两侧
      const rz0 = openZ0 - 0.06;
      if (d === 'A') {
        guards.push(g('A-rail-open-aft', 'A', -sx.x0, sx.x0, rz0, openZ0, y));
      } else {
        guards.push(g(`${d}-rail-open-aft-port`, d, -sx.x0, cx.x0, rz0, openZ0, y));
        guards.push(g(`${d}-rail-open-aft-stbd`, d, cx.x1, sx.x0, rz0, openZ0, y));
      }
      guards.push(g(`${d}-rail-open-port`, d, -4.46, -4.4, openZ0, openZ1, y));
      guards.push(g(`${d}-rail-open-stbd`, d, 4.4, 4.46, openZ0, openZ1, y));
      guards.push(g(`${d}-rail-landing-gap-port`, d, -sx.x0, cx.x0, land.z0, land.z0 + 0.06, yl));
      guards.push(g(`${d}-rail-landing-gap-stbd`, d, cx.x1, sx.x0, land.z0, land.z0 + 0.06, yl));
      guards.push(g(`${d}-rail-landing-port`, d, -4.46, -4.4, land.z0, land.z1, yl));
      guards.push(g(`${d}-rail-landing-stbd`, d, 4.4, 4.46, land.z0, land.z1, yl));
    } else {
      // D：E 甲板续梯接口（未建）
      interfaces.push({ id: 'IF-D-E-down', deck: 'D', type: 'unknown-plate', x0: -4.4, x1: 4.4, z0: openZ0, z1: openZ1, y,
        target: 'E 甲板续梯（现状楼梯续到 E，staircase.js:651；spatial-audit.md:64 登记 BOAT–E）', status: '未知接口（本任务不建，D 层楼板封闭）', src: PARAMS.dFloor.src });
    }
  }

  // 艇甲板层接口
  const bd = PARAMS.boatDoor.v;
  for (const s of [-1, 1]) {
    const sn = s > 0 ? 'stbd' : 'port';
    interfaces.push({ id: `IF-BOAT-${sn}-door`, deck: 'BOAT', type: 'door', axis: 'x', at: s * PARAMS.boatFoyer.v.halfW, a: bd.z0, b: bd.z1, y: 0, h: bd.h,
      target: `艇甲板${sn === 'stbd' ? '右' : '左'}舷步道（boatdeck.js 中央舱室门洞；救生艇甲板属 C40 范围）`, status: '现状门洞（门厅镶板线 6.78 与舱壁 7.0 之间 0.22 m 未建）', src: PARAMS.boatDoor.src });
  }
  interfaces.push({ id: 'IF-BOAT-dome', deck: 'BOAT', type: 'roof-opening', ...PARAMS.roofOpening.v, y: PARAMS.house.v.roofY1,
    target: 'boatdeck.js 中央舱室顶板与穹顶（主线需在顶板上开同尺寸孔）', status: '工程暂定开口（现状顶板封口）', src: PARAMS.roofOpening.src });

  // 主梯两侧与分跑/中央跑两侧的斜栏板
  for (const f of flights) {
    const edges = f.id === 'BOAT-main' ? [f.x0, f.x1] : [f.x0, f.x1];
    for (const ex of edges) guards.push({ id: `${f.id}-balustrade-${ex > 0 ? 'stbd' : 'port'}${Math.abs(ex).toFixed(1)}`, deck: f.deck, sloped: true, flight: f.id, x: ex });
  }

  // 穹顶与钟
  const dm = PARAMS.dome.v, ck = PARAMS.clock.v;
  const dome = { id: 'BOAT-dome', deck: 'BOAT', center: [dm.x, dm.y, dm.z], R: dm.R, base: { outer: dm.baseW, inner: 2 * dm.R, y0: dm.y + 0.27 - dm.baseH / 2, h: dm.baseH },
    ring: { outer: dm.ringW, inner: 2 * dm.R, y0: dm.y + 0.72 - dm.ringH / 2, h: dm.ringH }, sphereY: dm.y + dm.sphereDy, crownY: dm.y + dm.sphereDy + dm.R,
    extentZ: [dm.z - dm.baseW / 2, dm.z + dm.baseW / 2] };
  const clock = { id: 'A-clock-panel', deck: 'A', x0: -(PARAMS.hallHalfW.v - WT / 2), x1: PARAMS.hallHalfW.v - WT / 2, z: r3(ck.panelZ), t: ck.panelT, y0: DECK_Y.A, h: ck.panelH,
    clockCenter: [0, r3(DECK_Y.A + ck.cy), r3(ck.panelZ + ck.panelT / 2 + 0.06)], r: ck.r };

  const cover = [];
  {
    const ro = PARAMS.roofOpening.v, h = PARAMS.house.v, X = h.halfW, Z0 = PARAMS.boatFoyer.v.z0;
    for (const [id, x0, x1, z0, z1] of [['aft', -X, X, Z0, ro.z0], ['port', -X, ro.x0, ro.z0, ro.z1], ['stbd', ro.x1, X, ro.z0, ro.z1]]) {
      cover.push({ id: `BOAT-cover-${id}`, deck: 'BOAT', x0, x1, z0, z1, y0: h.roofY0, y1: h.roofY1 });
    }
  }

  return {
    regionId: REGION_ID, placementStatus: PLACEMENT_STATUS, coordinateSystem: COORDINATE_SYSTEM,
    deckY: DECK_Y, decks, flights, landings, slabs, openings, walls, guards, interfaces, shafts, dome, clock, cover,
    derived: { lowerOpeningZ0: openZ0, lowerOpeningZ1: openZ1, mainFlightFootZ: flights[0].zFoot },
  };

  function g(id, deck, x0, x1, z0, z1, y0) {
    return { id, deck, x0: r3(x0), x1: r3(x1), z0: r3(z0), z1: r3(z1), y0: r3(y0), h: PARAMS.railH.v };
  }
}

function mkFlight(f) {
  const run = f.going * f.n, drop = f.rise * f.n;
  return {
    ...f, width: r3(f.x1 - f.x0), run: r3(run), drop: r3(drop),
    zFoot: r3(f.zTop + f.dir * run), yFoot: r3(f.yTop - drop), rise: r3(f.rise),
    stepRule: r3(2 * f.rise + f.going),
  };
}

/** 梯段上某 z 处的踏面高度（与几何同一公式）。 */
export function treadY(f, z) {
  const t = (z - f.zTop) * f.dir / f.going;
  const k = Math.min(f.n - 1, Math.max(0, Math.floor(t)));
  return f.yTop - f.rise * k;
}

/* ------------------------------------------------------------------ 机位 */

export function viewpoints() {
  const A = DECK_Y.A, D = DECK_Y.D, B = DECK_Y.B;
  return {
    overview: { label: '全景纵剖', pos: [30, 9, 44], target: [0, -4.5, 69], fov: 42, preset: { wallsStbd: false, cover: true, shaft: false } },
    section: { label: '侧立纵剖', pos: [52, -1.8, 69.2], target: [0, -1.8, 69.2], fov: 26, preset: { wallsStbd: false, cover: true, shaft: true } },
    plan: { label: '平面·艇甲板', pos: [0, 42, 69.21], target: [0, -6, 69.2], fov: 30, hideAbove: null, preset: { cover: false, dome: false, wallsStbd: true } },
    planA: { label: '平面·A', pos: [0, 40, 69.21], target: [0, -6, 69.2], fov: 30, hideAbove: 'A', preset: { cover: false, dome: false, wallsStbd: true } },
    planB: { label: '平面·B', pos: [0, 37, 69.21], target: [0, -8, 69.2], fov: 30, hideAbove: 'B', preset: { cover: false, dome: false, wallsStbd: true } },
    planC: { label: '平面·C', pos: [0, 34, 69.21], target: [0, -10, 69.2], fov: 30, hideAbove: 'C', preset: { cover: false, dome: false, wallsStbd: true } },
    planD: { label: '平面·D', pos: [0, 31, 69.21], target: [0, -12, 69.2], fov: 30, hideAbove: 'D', preset: { cover: false, dome: false, wallsStbd: true } },
    eyeBoat: { label: '人眼·艇甲板门厅望井口', pos: [5.9, 1.68, 69.6], target: [0, -1.2, 70.6], fov: 72, eye: true, preset: { wallsStbd: true, cover: true, shaft: false } },
    eyeADome: { label: '人眼·A 层平台望穹顶', pos: [-3.2, A + 1.68, 67.4], target: [0, 6.2, 70.2], fov: 72, eye: true, preset: { wallsStbd: true, cover: true, shaft: false } },
    eyeAClock: { label: '人眼·A 层梯脚望钟面', pos: [2.6, A + 1.68, 68.6], target: [0, A + 1.6, 64.2], fov: 72, eye: true, preset: { wallsStbd: true, cover: true, shaft: false } },
    eyeBLanding: { label: '人眼·A/B 休息平台望回折跑', pos: [3.3, B + 1.45 + 1.68, 74.1], target: [0, B + 0.6, 70.0], fov: 72, eye: true, preset: { wallsStbd: true, cover: true, shaft: false } },
    eyeDFoyer: { label: '人眼·D 层门厅望梯段', pos: [0.4, D + 1.68, 64.5], target: [0, D + 1.5, 72.5], fov: 72, eye: true, preset: { wallsStbd: true, cover: true, shaft: false } },
  };
}

/* ------------------------------------------------------------------ 构造 */

export function buildRegion(THREE, opts = {}) {
  if (!THREE || !THREE.Group) throw new TypeError('buildRegion(THREE): 需要注入 three 模块');
  const L = computeLayout();
  const root = new THREE.Group();
  root.name = REGION_ID;

  const mats = makeMaterials(THREE);
  const groups = {};
  for (const d of DECKS) {
    const dg = new THREE.Group();
    dg.name = `deck-${d}`;
    dg.userData = { deck: d, floorY: DECK_Y[d] };
    groups[d] = {};
    for (const c of CATEGORIES) {
      const cg = new THREE.Group();
      cg.name = `deck-${d}.${c}`;
      cg.userData = { deck: d, category: c };
      dg.add(cg);
      groups[d][c] = cg;
    }
    root.add(dg);
  }
  const add = (deck, cat, mesh, ud) => {
    mesh.userData = { deck, category: cat, ...ud };
    mesh.castShadow = false; mesh.receiveShadow = true;
    groups[deck][cat].add(mesh);
    return mesh;
  };
  const box = (x0, x1, y0, y1, z0, z1, mat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return m;
  };

  // 楼板
  for (const s of L.slabs) {
    const m = box(s.x0, s.x1, s.y0, s.y1, s.z0, s.z1, s.deck === 'BOAT' ? mats.boatSlab : mats.slab);
    m.name = s.id;
    add(s.deck, 'foyer', m, { kind: 'slab', id: s.id, solid: true });
  }
  // 上盖
  for (const c of L.cover) {
    const m = box(c.x0, c.x1, c.y0, c.y1, c.z0, c.z1, mats.cover);
    m.name = c.id;
    add('BOAT', 'cover', m, { kind: 'cover', id: c.id, solid: true });
  }
  // 平台
  for (const l of L.landings) {
    const m = box(l.x0, l.x1, l.y0, l.y1, l.z0, l.z1, mats.landing);
    m.name = l.id;
    add(l.deck, 'landings', m, { kind: 'landing', id: l.id, solid: true });
  }
  // 梯段
  for (const f of L.flights) {
    const m = new THREE.Mesh(flightGeometry(THREE, f, PARAMS.flightSoffitT.v), f.deck === 'BOAT' ? mats.mainFlight : mats.flight);
    m.name = f.id;
    add(f.deck, 'flights', m, { kind: 'flight', id: f.id, solid: true });
  }
  // 墙（按门洞切段 + 过梁）
  for (const w of L.walls) {
    const cat = w.side === 'stbd' ? 'wallsStbd' : 'walls';
    const mat = w.deck === 'BOAT' ? mats.boatWall : mats.wall;
    const cuts = [...w.gaps].sort((p, q) => p.a - q.a);
    let cur = w.a, i = 0;
    const seg = (a, b, y0, y1, tag) => {
      if (b - a < 1e-3 || y1 - y0 < 1e-3) return;
      const m = w.axis === 'x'
        ? box(w.at - w.t / 2, w.at + w.t / 2, y0, y1, a, b, mat)
        : box(a, b, y0, y1, w.at - w.t / 2, w.at + w.t / 2, mat);
      m.name = `${w.id}-${tag}${i++}`;
      add(w.deck, cat, m, { kind: 'wall', id: w.id, solid: true });
    };
    for (const c of cuts) {
      seg(cur, c.a, w.y0, w.y0 + w.h, 'seg');
      seg(c.a, c.b, w.y0 + c.h, w.y0 + w.h, 'lintel');
      cur = c.b;
    }
    seg(cur, w.b, w.y0, w.y0 + w.h, 'seg');
  }
  // 护栏
  for (const r of L.guards) {
    if (r.sloped) {
      const f = L.flights.find((q) => q.id === r.flight);
      const len = Math.hypot(f.run, f.drop);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, len), mats.guard);
      m.position.set(r.x, (f.yTop + f.yFoot) / 2 + f.rise / 2 + 0.45, (f.zTop + f.zFoot) / 2);
      m.rotation.x = f.dir * Math.atan2(f.drop, f.run);
      m.name = r.id;
      add(r.deck, 'guards', m, { kind: 'guard', id: r.id, solid: true, sloped: true });
    } else {
      const m = box(r.x0, r.x1, r.y0, r.y0 + r.h, r.z0, r.z1, mats.guard);
      m.name = r.id;
      add(r.deck, 'guards', m, { kind: 'guard', id: r.id, solid: true });
    }
  }
  // 开口轮廓（非实体）
  for (const o of L.openings) {
    const y = o.y + 0.012, e = 0.05;
    const mat = o.kind === '现状' ? mats.openingExisting : mats.opening;
    for (const [x0, x1, z0, z1] of [[o.x0, o.x1, o.z0, o.z0 + e], [o.x0, o.x1, o.z1 - e, o.z1], [o.x0, o.x0 + e, o.z0, o.z1], [o.x1 - e, o.x1, o.z0, o.z1]]) {
      const m = box(x0, x1, y, y + 0.02, z0, z1, mat);
      m.name = `${o.id}-edge`;
      add(o.deck, 'openings', m, { kind: 'opening-marker', id: o.id, solid: false });
    }
  }
  // 井道空腔示意（非实体）
  for (const s of L.shafts) {
    const m = box(s.x0, s.x1, s.y0, s.y1, s.z0, s.z1, mats.shaft);
    m.name = s.id;
    m.renderOrder = 2;
    add(s.deck, 'shaft', m, { kind: 'shaft-volume', id: s.id, solid: false });
  }
  // 接口标记（非实体）
  for (const f of L.interfaces) {
    const mat = /unknown/.test(f.type) ? mats.ifaceUnknown : /暂定/.test(f.status) ? mats.ifaceProvisional : mats.iface;
    let m;
    if (f.type === 'door' || f.type === 'unknown') {
      const hh = f.h ?? 2.1;
      m = f.axis === 'x'
        ? box(f.at - 0.03, f.at + 0.03, f.y + 0.02, f.y + hh, f.a, f.b, mat)
        : box(f.a, f.b, f.y + 0.02, f.y + hh, f.at - 0.03, f.at + 0.03, mat);
    } else {
      m = box(f.x0, f.x1, f.y + 0.02, f.y + 0.06, f.z0, f.z1, mat);
    }
    m.name = f.id;
    m.renderOrder = 3;
    add(f.deck, 'interfaces', m, { kind: 'interface-marker', id: f.id, solid: false, target: f.target, status: f.status });
  }
  // 穹顶：中空基座框 + 中空铁圈 + 玻璃半球 + 顶冠
  {
    const dm = L.dome, [cx, , cz] = dm.center;
    const frame = (outer, inner, y0, h, mat, tag) => {
      const o = outer / 2, n = inner / 2;
      for (const [x0, x1, z0, z1, k] of [[-o, o, -o, -n, 'a'], [-o, o, n, o, 'f'], [-o, -n, -n, n, 'p'], [n, o, -n, n, 's']]) {
        const m = box(cx + x0, cx + x1, y0, y0 + h, cz + z0, cz + z1, mat);
        m.name = `BOAT-dome-${tag}-${k}`;
        add('BOAT', 'dome', m, { kind: 'dome-frame', id: dm.id, solid: true });
      }
    };
    frame(dm.base.outer, dm.base.inner, dm.base.y0, dm.base.h, mats.domeBase, 'base');
    frame(dm.ring.outer, dm.ring.inner, dm.ring.y0, dm.ring.h, mats.iron, 'ring');
    const sph = new THREE.Mesh(new THREE.SphereGeometry(dm.R, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.glass);
    sph.position.set(cx, dm.sphereY, cz);
    sph.name = 'BOAT-dome-glass';
    sph.renderOrder = 4;
    add('BOAT', 'dome', sph, { kind: 'dome-glass', id: dm.id, solid: false });
    for (let i = 0; i < 3; i++) {
      const rr = dm.R * [0.999, 0.94, 0.72][i], yy = dm.sphereY + dm.R * [0.0, 0.33, 0.69][i];
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.05, 5, 36), mats.iron);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx, yy, cz);
      ring.name = `BOAT-dome-hoop${i}`;
      add('BOAT', 'dome', ring, { kind: 'dome-hoop', id: dm.id, solid: false });
    }
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 0.5, 12), mats.iron);
    crown.position.set(cx, dm.crownY, cz);
    crown.name = 'BOAT-dome-crown';
    add('BOAT', 'dome', crown, { kind: 'dome-crown', id: dm.id, solid: true });
  }
  // 钟面雕板
  {
    const c = L.clock;
    const p = box(c.x0, c.x1, c.y0, c.y0 + c.h, c.z - c.t / 2, c.z + c.t / 2, mats.panel);
    p.name = 'A-clock-panel';
    add('A', 'clock', p, { kind: 'clock-panel', id: c.id, solid: true });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, 0.12, 28), mats.panelDark);
    cyl.rotation.x = Math.PI / 2;
    cyl.position.set(...c.clockCenter);
    cyl.name = 'A-clock-case';
    add('A', 'clock', cyl, { kind: 'clock-case', id: c.id, solid: true });
    const dial = new THREE.Mesh(new THREE.CylinderGeometry(c.r * 0.85, c.r * 0.85, 0.02, 28), mats.dial);
    dial.rotation.x = Math.PI / 2;
    dial.position.set(c.clockCenter[0], c.clockCenter[1], c.clockCenter[2] + 0.065);
    dial.name = 'A-clock-dial';
    add('A', 'clock', dial, { kind: 'clock-dial', id: c.id, solid: true });
  }

  let meshCount = 0;
  root.traverse((o) => { if (o.isMesh) meshCount++; });
  root.userData = {
    regionId: REGION_ID, placementStatus: PLACEMENT_STATUS, coordinateSystem: COORDINATE_SYSTEM.id,
    decks: [...DECKS], categories: [...CATEGORIES], meshCount, layout: L,
  };
  root.updateMatrixWorld(true);
  return root;
}

/** 梯段实体：阶梯轮廓（z–y 平面）沿 x 挤出。 */
function flightGeometry(THREE, f, soffitT) {
  const shape = new THREE.Shape();
  shape.moveTo(f.zTop, f.yTop);
  for (let k = 0; k < f.n; k++) {
    const z = f.zTop + f.dir * f.going * (k + 1);
    const y = f.yTop - f.rise * k;
    shape.lineTo(z, y);
    shape.lineTo(z, y - f.rise);
  }
  shape.lineTo(f.zTop, f.yTop - soffitT);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: f.x1 - f.x0, bevelEnabled: false, steps: 1 });
  geo.rotateY(-Math.PI / 2);   // 轮廓 x→世界 z，挤出方向→世界 −x
  geo.translate(f.x1, 0, 0);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function makeMaterials(THREE) {
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...extra });
  const ghost = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  return {
    slab: std('#8a3c34'),            // 门厅地面（地毯色块）
    boatSlab: std('#a88a62'),        // 艇甲板层门厅地面
    landing: std('#b05a3e'),
    flight: std('#9c7446'),
    mainFlight: std('#8a6238'),
    wall: std('#c9ae84', { side: THREE.DoubleSide }),
    boatWall: std('#b89a6c', { side: THREE.DoubleSide }),
    cover: std('#e4ddcb', { side: THREE.DoubleSide }),
    guard: std('#2e2a26', { roughness: 0.6 }),
    panel: std('#6d4525'),
    panelDark: std('#452c15'),
    dial: std('#ded2b4'),
    domeBase: std('#8b6a45'),
    iron: std('#3a3d42', { roughness: 0.55, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: '#a9cde0', roughness: 0.1, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }),
    opening: std('#e0457b', { emissive: '#5a0f28' }),
    openingExisting: std('#f0a030', { emissive: '#4a2a00' }),
    shaft: ghost('#58c8e8', 0.08),
    iface: ghost('#3fbf6f', 0.55),
    ifaceProvisional: ghost('#e6c84a', 0.55),
    ifaceUnknown: ghost('#b36ae2', 0.5),
  };
}
