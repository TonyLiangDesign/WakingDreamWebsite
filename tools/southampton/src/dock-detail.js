import * as THREE from 'three';
import { surface, paint } from './surface.js';
import { Builder, mat } from './builder.js';
import { mulberry32 } from './textures.js';

// Close-range berth materials, isolated from the distant port's catalogue.
let MATERIALS;
const PAVING_PARS = /* glsl */`
  float berthHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  vec2 berthCell(vec2 p) {
    float row = floor(p.y / 0.17);
    return vec2(floor((p.x + mod(row, 2.0) * 0.145) / 0.29), row);
  }
  float berthEdge(vec2 p) {
    float row = floor(p.y / 0.17);
    vec2 f = fract(vec2((p.x + mod(row, 2.0) * 0.145) / 0.29, p.y / 0.17));
    vec2 e = min(f, 1.0-f) * vec2(0.29, 0.17);
    return min(e.x,e.y);
  }
  float berthHeight(vec2 p) { return smoothstep(0.003, 0.018, berthEdge(p)) * 0.004; }
`;
const PAVING = /* glsl */`
  {
    vec2 p = vLocalP.xz;
    float aa = max(length(dFdx(p)), length(dFdy(p)));
    float h = berthHash(berthCell(p));
    float bevel = smoothstep(0.003, 0.017 + aa*0.5, berthEdge(p));
    float seams = mix(bevel, 0.87, smoothstep(0.04,0.19,aa));
    float grit = texture2D(uGrimeTex, p / 0.37).g;
    vec3 stone = diffuse * mix(vec3(0.72,0.75,0.77),vec3(1.16,1.10,1.00),h);
    stone *= (0.94+0.12*grit) * mix(0.30,1.0,seams);
    float wheel = exp(-pow((p.y+65.6)/0.34,2.0)) + exp(-pow((p.y+70.5)/0.34,2.0));
    float oil = smoothstep(0.69,0.86,gBroad) * smoothstep(0.55,0.76,gMid);
    stone *= 1.0 - 0.10*wheel - 0.25*oil;
    base = stone * (0.85+0.18*gBroad);
    tpOrmV = vec3(0.85-0.13*oil, mix(0.64,1.0,seams), 0.0);
  }
`;

export function dockMaterials(M) {
  if (MATERIALS) return MATERIALS;
  const setts = surface({ set:'setts', color:0x797367, scale:1.1, roughness:0.94,
    minRough:0.60, normalScale:0.22, grime:0.16, rust:0, variation:0.06,
    name:'berth-worn-granite-setts', extra:{key:'berth-setts-v1', fragmentPars:PAVING_PARS, fragment:PAVING} });
  const pavingCompile = setts.onBeforeCompile;
  setts.onBeforeCompile = (shader, renderer) => {
    pavingCompile(shader,renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', `
      if (abs(vLocalN.y) > 0.7) {
        vec2 p=vLocalP.xz;
        float e=0.005;
        vec2 grad=vec2(berthHeight(p+vec2(e,0.0))-berthHeight(p-vec2(e,0.0)),
                       berthHeight(p+vec2(0.0,e))-berthHeight(p-vec2(0.0,e)))/(2.0*e);
        float fade=1.0-smoothstep(0.025,0.11,length(fwidth(p)));
        normal=normalize(normal-(vVX*grad.x+vVZ*grad.y)*fade);
      }
      #include <lights_physical_fragment>`);
  };
  const steel = surface({set:'plate', scale:1.8, color:0x53635b, roughness:0.76,
    minRough:0.46, normalScale:0.20, metalness:0.10, grime:0.20, streaks:0.25,
    rust:0.07, variation:0.12, name:'berth-aged-painted-steel'});
  MATERIALS={...M, setts,
    coping:surface({set:'ashlar',scale:1.2,color:0xaaa598,normalScale:0.65,
      roughness:0.88,minRough:0.66,grime:0.18,streaks:0.2,variation:0.12,rust:0,name:'berth-granite-coping'}),
    shedClad:surface({set:'corrugated',scale:0.72,color:0x788477,normalScale:0.5,
      roughness:0.88,minRough:0.62,grime:0.22,streaks:0.34,rust:0.05,
      groundDirt:0.24,groundY:4.6,variation:0.14,name:'berth-galvanized-cladding'}),
    shedTrim:steel, craneSteel:steel,
    rail:paint(0x60615e,0.34,0.72,{name:'berth-polished-rail-head'}),
    dockJoint:paint(0x45433d,0.95,0,{name:'berth-stone-joint'}),
    dockIron:surface({set:'plate',scale:1,color:0x282c2a,roughness:0.67,metalness:0.35,
      normalScale:0.18,grime:0.12,rust:0.10,variation:0.10,name:'berth-cast-iron-details'}),
    dockBolt:paint(0x70746c,0.5,0.45,{name:'berth-worn-fasteners'}),
    dockGlass:new THREE.MeshStandardMaterial({color:0x273943,roughness:0.19,
      metalness:0,envMapIntensity:0.8,name:'berth-crane-glass'}),
  };
  return MATERIALS;
}

function bevelBlock(w,h,d,b=0.025) {
  const shape=new THREE.Shape([new THREE.Vector2(-w/2+b,-d/2+b),
    new THREE.Vector2(w/2-b,-d/2+b),new THREE.Vector2(w/2-b,d/2-b),new THREE.Vector2(-w/2+b,d/2-b)]);
  return new THREE.ExtrudeGeometry(shape,{depth:h-2*b,steps:1,bevelEnabled:true,
    bevelSize:b,bevelThickness:b,bevelSegments:1,curveSegments:1}).rotateX(-Math.PI/2).translate(0,b,0);
}

export function buildQuayDetails(M,D) {
  const b=new Builder(M), rnd=mulberry32(44034), E=D.east,Q=D.Q;
  // Separate, bevelled coping stones catch light and have actual narrow joints.
  for(let x=E.x0;x<E.x1-0.1;) {
    const w=Math.min(1.7+rnd()*0.7,E.x1-x);
    b.add('coping',bevelBlock(w-0.035,0.58,1.34),mat(x+w/2,Q-0.555,E.z-0.62));
    x+=w;
  }
  // Rails: dark flanges, segmented joints and a narrow polished top, not four flat stripes.
  const zs=[E.z-3.2,E.z-10.2,E.z-6.7-0.72,E.z-6.7+0.72];
  for(const z of zs) {
    b.box('dockIron',E.x0-30,Q+0.009,z-0.115,E.x1-E.x0+30,0.045,0.23);
    for(let x=E.x0-20;x<E.x1;x+=12) {
      b.box('dockIron',x-0.3,Q+0.055,z-0.105,0.6,0.075,0.065);
      for(const dx of [-0.20,0,0.20]) b.cyl('dockBolt',x+dx,Q+0.091,z-0.071,0.018,0.018,0.04,6,Math.PI/2,0,0);
    }
  }
  // Modest drainage grates and access lids on the service side of the apron.
  for(let x=E.x0+15;x<E.x1-6;x+=24) {
    const z=E.z-12.65;
    b.box('dockIron',x-0.4,Q+0.035,z-0.22,0.8,0.016,0.44);
    for(let k=0;k<10;k++) b.box('dockBolt',x-0.35+k*0.075,Q+0.055,z-0.2,0.02,0.013,0.4);
    b.box('coping',x+1.2,Q+0.031,z-0.55,0.8,0.025,0.75);
    b.box('dockIron',x+1.22,Q+0.06,z-0.53,0.76,0.016,0.71);
  }
  // Steel gallery connection plates, visible rivets, bases, and framed shed glazing.
  const gy=Q+D.galleryY,zW=E.z-D.eastApron;
  for(const [x0,x1] of [[-210,-15],[-7,188]]) {
    for(let x=x0;x<x1;x+=6) {
      b.box('dockIron',x-0.38,Q+0.05,zW-0.12,0.76,0.12,0.64);
      for(const y of [Q+1.1,gy-3.45,gy-0.6]) {
        b.box('shedTrim',x-0.30,y,zW+0.19,0.60,0.62,0.05);
        for(const dx of [-0.2,0.2]) for(const dy of [0.12,0.49])
          b.cyl('dockBolt',x+dx,y+dy,zW+0.245,0.025,0.025,0.02,8,Math.PI/2);
      }
      const zg=zW+4.0;
      b.box('dockIron',x-0.16,gy-0.78,zg-0.22,0.32,0.76,0.11);
      for(const dy of [0.10,0.35,0.60]) b.cyl('dockBolt',x,gy-0.73+dy,zg-0.095,0.023,0.023,0.02,8,Math.PI/2);
    }
    for(let x=x0+1.5;x<x1-2;x+=3) {
      const y=gy+0.9,z=zW+0.035;
      for(const dx of [-0.04,0.8,1.6]) b.box('shedTrim',x+dx,y-0.04,z,0.05,1.88,0.055);
      for(const dy of [-0.04,0.9,1.8]) b.box('shedTrim',x-0.04,y+dy,z,1.68,0.05,0.06);
      b.box('shedTrim',x-0.11,y-0.11,z,1.82,0.09,0.16);
    }
  }
  // Bollards have bolted plinths; small details occupy metres, not the whole yard.
  for(let x=E.x0+8;x<E.x1-4;x+=24) {
    const z=E.z-2.2;
    b.add('dockIron',bevelBlock(0.85,0.10,0.85,0.018),mat(x,Q+0.031,z));
    for(const dx of [-0.31,0.31]) for(const dz of [-0.31,0.31])
      b.cyl('dockBolt',x+dx,Q+0.155,z+dz,0.035,0.035,0.05,6);
  }
  return b.build({name:'Berth44-close-details'});
}

export function craneCabDetails(b,rot,slew) {
  // Sidelights, mullions and sills give the machinery house a readable human scale.
  for(const s of [-1,1]) {
    for(const x of [-2.85,-1.55,-0.25]) {
      const p=rot(x,2.55,s*1.73);
      b.add('dockGlass',new THREE.BoxGeometry(1.02,1.18,0.025),mat(...p,0,slew,0));
      for(const dx of [-0.56,0,0.56]) b.strut('craneSteel',rot(x+dx,1.91,s*1.77),rot(x+dx,3.18,s*1.77),0.045);
      for(const y of [1.92,2.55,3.18]) b.strut('craneSteel',rot(x-0.58,y,s*1.77),rot(x+0.58,y,s*1.77),0.045);
    }
  }
  const front=rot(1.455,2.48,0);
  b.add('dockGlass',new THREE.BoxGeometry(0.025,1.42,2.55),mat(...front,0,slew,0));
  for(const z of [-1.32,-0.44,0.44,1.32])
    b.strut('craneSteel',rot(1.48,1.72,z),rot(1.48,3.24,z),0.055);
  for(const y of [1.72,2.48,3.24])
    b.strut('craneSteel',rot(1.48,y,-1.36),rot(1.48,y,1.36),0.055);
  const rear=rot(-3.855,2.72,0);
  b.add('dockGlass',new THREE.BoxGeometry(0.025,0.91,2.45),mat(...rear,0,slew,0));
  for(const z of [-1.27,-0.42,0.42,1.27])
    b.strut('craneSteel',rot(-3.88,2.21,z),rot(-3.88,3.22,z),0.055);
  for(const y of [2.21,2.72,3.22])
    b.strut('craneSteel',rot(-3.88,y,-1.30),rot(-3.88,y,1.30),0.055);
}
