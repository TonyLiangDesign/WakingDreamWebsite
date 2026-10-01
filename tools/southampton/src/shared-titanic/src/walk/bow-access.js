import * as THREE from 'three';
import { buildRegion } from '../../docs/claude-handoff/C64/region.mjs';
import { uvBox, uvCyl } from './materials.js';
import { getMaterial } from './materials.js';
import { light, BULB, palette } from './interior/kit.js';

// Adopt only the accepted C64 stairs, drop-edge rails and shortened breakwater.
// Decks, equipment, front wall and canonical hull remain owned by the main ship.
export function buildBowAccess(materials, invisible) {
  const candidate = buildRegion(THREE), root = new THREE.Group(), collide = [];
  root.name = 'BowAccess:C64';
  root.userData = { source: 'C64-R1', placementStatus: 'engineering-provisional' };
  const parts = [candidate.getObjectByName('forecastle-break'),
    ...candidate.getObjectByName('well-deck').children.filter(o => o.name.startsWith('breakwater-') || o.name.startsWith('col-breakwater-'))];
  for (const part of parts) {
    const copy = part.clone(true);
    copy.traverse(o => {
      if (!o.isMesh) return;
      o.geometry = o.geometry.clone();
      if (o.userData.collider) { o.material = invisible; collide.push(o); }
      else {
        o.material = materials[o.material.name] ?? materials.trim;
        if (o.geometry.type === 'CylinderGeometry') uvCyl(o); else uvBox(o);
      }
      o.name = `BowAccess:${o.name}`;
    });
    root.add(copy);
  }
  // C75-R2：C 层横厅 → 前井甲板的右舷工程暂定围护通道（独立命名组，自带碰撞）
  const passage = buildForwardCPassage(invisible);
  root.add(passage);
  collide.push(...passage.userData.collide);
  root.userData.collide = collide;
  return root;
}

/**
 * C75-R2 · C 层横厅至前井甲板的右舷围护通道（engineering-provisional）。
 *
 * 作者坐标（walk-authoring-v0，统一登记由 registration.js 只应用一次）：
 *   · 内净 x 7.60…9.60（中心 8.6，宽 2.0）；外包络 x 7.44…9.76、z 77.3…91.95、y −9.04…−6.15。
 *   · 内端接 forward-cabins.js 的 C 横厅前壁门（z 77.6，净 x 7.90…9.30、y −8.9…−6.7）。
 *   · 外端接 bow.js 的上层建筑前壁门（z 91.5，净 x 7.90…9.30、y −8.5…−6.3）。
 *   · 地板 y −8.9 自带可见面与碰撞，一直接到台阶；不依赖 z ≤ 82 的兜底面。
 *   · 末端两级实体踏步各 0.20：第一踏面 z 89.6…90.2 顶 −8.7；第二踏面/平台 z 90.2…91.95 顶 −8.5，
 *     与前井甲板面齐平并少量压接。
 *   · 天花：z ≤ 82.02 下表面 −6.60 / 上表面 −6.54（避开 B 层兜底面底面 −6.53，C 地板上净 2.30）；
 *     z ≥ 82.02 抬到下表面 −6.25 / 上表面 −6.15（高平台上净 2.25），转折处立一块封口板。
 *   · 只加三盏登记灯位（走 lightpool，不新建 Light），不放家具，不复刻船壳或艏楼。
 * 位置尚无历史图纸认证，仅作可游览连接的工程暂定占位，等待后续总布置校准。
 */
export const FORWARD_C_PASSAGE = {
  id: 'C75-R2-forward-c-starboard-passage',
  placementStatus: 'engineering-provisional',
  inner: { x0: 7.60, x1: 9.60 },
  envelope: { x0: 7.44, x1: 9.76, y0: -9.04, y1: -6.15, z0: 77.3, z1: 91.95 },
  floorY: -8.9,
  hallDoor: { z: 77.6, x0: 7.90, x1: 9.30, y0: -8.9, y1: -6.7 },
  frontDoor: { z: 91.5, x0: 7.90, x1: 9.30, y0: -8.5, y1: -6.3 },
  steps: [
    { z0: 89.6, z1: 90.2, top: -8.7 },
    { z0: 90.2, z1: 91.95, top: -8.5 },
  ],
  ceilingLow: { z0: 77.6, z1: 82.02, bottom: -6.60, top: -6.54 },
  ceilingHigh: { z0: 82.02, z1: 91.25, bottom: -6.25, top: -6.15 },
};

export function buildForwardCPassage(invisible) {
  const P = FORWARD_C_PASSAGE, E = P.envelope, PAL = palette();
  const g = new THREE.Group(), collide = [];
  g.name = 'BowAccess:C75-forward-c-passage';
  g.userData = { source: 'C75-R2', placementStatus: P.placementStatus, envelope: E };

  // 墙与天花沿用室内调色板的漆面（与 C 层客舱同一共享实例，不改其参数）
  const wall = PAL.paintCream;
  const ceil = PAL.paintWhite;
  const floor = getMaterial('lino', { color: '#6b5a45' });
  floor.envMapIntensity = 0.45;
  const tread = getMaterial('lino', { color: '#5a4a38' });
  tread.envMapIntensity = 0.45;
  const trim = getMaterial('oak', { color: '#5a3d22' });
  const brass = getMaterial('brass', {});

  const solid = (name, x0, x1, y0, y1, z0, z1, mat, { collider = true, visible = true } = {}) => {
    if (visible) {
      const m = uvBox(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat));
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      m.castShadow = true; m.receiveShadow = true;
      m.name = `C75Passage:${name}`;
      g.add(m);
    }
    if (collider) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), invisible);
      c.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      c.castShadow = false; c.receiveShadow = false;
      c.name = `C75PassageCollider:${name}`;
      g.add(c); collide.push(c);
    }
  };

  const [s1, s2] = P.steps;
  const { x0: IX0, x1: IX1 } = P.inner;
  const HALL_FACE = P.hallDoor.z + 0.06;   // 横厅前壁可见板前表面
  const FRONT_FACE = P.frontDoor.z - 0.25; // 上层建筑前壁可见板后表面

  /* 地板：可见面从横厅地板边 z 77.6 起；碰撞从 77.3 起压接横厅楼板，宽到包络 */
  solid('floor', E.x0, E.x1, E.y0, P.floorY, P.hallDoor.z, s1.z0, floor, { collider: false });
  solid('floor', E.x0, E.x1, E.y0, P.floorY, E.z0, s1.z0, floor, { visible: false });

  /* 两级实体踏步：可见体止于前壁中心（z 91.5，之后是井甲板自己的柚木面），碰撞延到 91.95 */
  solid('step-1', E.x0, E.x1, E.y0, s1.top, s1.z0, s1.z1, tread);
  solid('step-2', E.x0, E.x1, E.y0, s2.top, s2.z0, P.frontDoor.z, tread, { collider: false });
  solid('step-2', E.x0, E.x1, E.y0, s2.top, s2.z0, E.z1, tread, { visible: false });
  // 踏步前沿的黄铜防滑条：仅可见，不进碰撞
  for (const s of P.steps) {
    solid(`nosing-${s.top}`, IX0, IX1, s.top, s.top + 0.012, s.z0, s.z0 + 0.06, brass, { collider: false });
  }

  /* 侧墙：前段顶到低天花上表面，后段顶到高天花上表面；碰撞与可见同尺寸 */
  const cl = P.ceilingLow, ch = P.ceilingHigh;
  for (const [tag, xa, xb] of [['port', E.x0, IX0], ['stbd', IX1, E.x1]]) {
    solid(`wall-${tag}-low`, xa, xb, E.y0, cl.top, HALL_FACE, cl.z1, wall);
    solid(`wall-${tag}-high`, xa, xb, E.y0, ch.top, ch.z0, FRONT_FACE, wall);
    // 踢脚
    solid(`skirt-${tag}-low`, tag === 'port' ? IX0 : IX1 - 0.03, tag === 'port' ? IX0 + 0.03 : IX1,
      P.floorY, P.floorY + 0.18, HALL_FACE, s1.z0, trim, { collider: false });
  }

  /* 天花：前段低、后段高，转折处一块封口板 */
  solid('ceiling-low', E.x0, E.x1, cl.bottom, cl.top, cl.z0, cl.z1, ceil);
  solid('ceiling-high', E.x0, E.x1, ch.bottom, ch.top, ch.z0, ch.z1, ceil);
  solid('ceiling-riser', IX0, IX1, cl.bottom, ch.top, ch.z0, ch.z0 + 0.06, ceil);

  /**
   * 局部稳定照明：三盏吸顶灯，只登记灯位（lightpool 负责真光源，不改灯池规模）。
   * 用贴顶的扁灯罩而不是 kit 的吊球灯：低天花段只有 2.30 净高，吊球会吃掉 0.2 m。
   * 灯具最低点离天花 ≤ 0.07，任何位置的净高都不低于 2.2。
   */
  const dome = new THREE.SphereGeometry(0.11, 16, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  for (const [z, y] of [[79.9, cl.bottom], [84.6, ch.bottom], [88.9, ch.bottom]]) {
    const lamp = new THREE.Group();
    lamp.name = `C75Passage:lamp-${z}`;
    const base = uvCyl(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.025, 16), brass));
    base.position.set(0, -0.0125, 0);
    const shade = new THREE.Mesh(dome, BULB);
    shade.scale.set(1, 0.38, 1);
    shade.position.set(0, -0.025, 0);
    lamp.add(base, shade);
    lamp.position.set(8.6, y, z);
    g.add(lamp);
    light(8.6, y - 0.12, z, { intensity: 7.5, range: 11 });
  }

  g.userData.collide = collide;
  return g;
}
