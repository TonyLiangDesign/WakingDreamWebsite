import * as T from 'three';
import { sheer } from './dimensions.js';

// The wheelhouse is a compact room aft of the navigating bridge, not the
// full-width glazed facade used by the previous presentation draft.
export function buildNavigationBridge(m,kit){
  const g=new T.Group();g.name='NavigationBridge';const k=kit(g);
  const wood=new T.MeshStandardMaterial({color:'#51422f',roughness:.7});
  const brass=new T.MeshStandardMaterial({color:'#8b794e',metalness:.58,roughness:.38});
  const interior=new T.MeshStandardMaterial({color:'#555347',roughness:.92});
  const glazing=m.glass.clone();glazing.color.set('#283a40');glazing.roughness=.24;glazing.metalness=.3;
  const y0=.1,front=86.5,back=76.5,half=13.65;
  const edge=x=>front-1.65*Math.pow(Math.abs(x)/half,4);
  const plan=(extra=0)=>{
    const shape=new T.Shape();shape.moveTo(-half-extra,-back);shape.lineTo(half+extra,-back);
    for(let i=0;i<=64;i++){const x=(half+extra)*(1-i/32);shape.lineTo(x,-edge(x)-extra);}
    shape.closePath();return shape;
  };
  const slab=(y,h,material,extra=0)=>{
    const geo=new T.ExtrudeGeometry(plan(extra),{depth:h,steps:1,bevelEnabled:false});geo.rotateX(-Math.PI/2);
    const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/2.5,uv.getY(i)/2.5);
    return k.mesh(geo,material,0,y,0);
  };
  slab(-.16,.27,m.deck);slab(2.79,.16,m.enamel,.17);
  // A closed roof soffit, thin cornice and structural posts instead of a heavy
  // white box. Open side passages remain above the solid bridge deck.
  for(let i=0;i<48;i++){
    const x0=-half+2*half*i/48,x1=-half+2*half*(i+1)/48;
    const a=new T.Vector3(x0,0,edge(x0)),b=new T.Vector3(x1,0,edge(x1));
    const x=(x0+x1)/2,z=(a.z+b.z)/2,angle=-Math.atan2(b.z-a.z,b.x-a.x),length=a.distanceTo(b)+.01;
    k.box(length,.96,.18,m.enamel,x,y0+.48,z).rotation.y=angle;
    k.box(length,.07,.23,wood,x,1.09,z).rotation.y=angle;
    k.box(length,.24,.15,m.enamel,x,2.74,z+.04).rotation.y=angle;
  }
  // The central navigating shelter has its own front windows. The smaller
  // wheelhouse behind it is a separate room, not a substitute for this screen.
  const shelter=new T.Group();shelter.name='NavigatingShelterEnclosure';g.add(shelter);
  const sk=kit(shelter),screenHalf=6.55,pitch=2*screenHalf/9;
  for(let i=0;i<9;i++){
    const x=-screenHalf+pitch*(i+.5),z=edge(x),angle=Math.atan(6.6*Math.pow(x,3)/Math.pow(half,4));
    sk.box(pitch-.16,1.49,.065,glazing,x,1.855,z-.065).rotation.y=angle;
    sk.box(.052,1.49,.13,m.enamel,x,1.855,z+.015).rotation.y=angle;
  }
  for(let i=0;i<=9;i++){
    const x=-screenHalf+pitch*i;
    sk.box(.17,1.66,.20,m.enamel,x,1.91,edge(x));
  }
  // Return walls and a continuous rear partition prevent the oblique ray from
  // exiting the other side of the sheltered central room into the sky.
  for(const side of [-1,1]){
    const x=side*screenHalf,depth=edge(screenHalf)-back;
    sk.box(.16,.98,depth,m.enamel,x,.60,(back+edge(screenHalf))/2);
    sk.box(.16,.30,depth,m.enamel,x,2.64,(back+edge(screenHalf))/2);
    sk.box(.07,1.44,depth,glazing,x,1.80,(back+edge(screenHalf))/2);
    for(const z of [76.6,79,81.5,84,86.4])sk.box(.21,1.48,.12,m.enamel,x,1.82,z);
    sk.box(2.4,2.58,.18,m.enamel,side*5.4,1.42,back+.06);
  }
  for(const x of [-half,-10,-8,8,10,half]){
    k.box(.095,1.55,.12,m.enamel,x,1.87,edge(x));
  }
  // Enclosed central wheelhouse with five divided timber windows. The rear and
  // side walls, floor and ceiling all exist, including behind the dark glazing.
  k.box(8.6,.18,5.4,m.deck,0,.14,79.2);
  k.box(8.6,2.54,.18,interior,0,1.42,76.55);
  k.box(8.6,.94,.2,m.enamel,0,.59,81.8);
  k.box(8.6,.39,.2,m.enamel,0,2.58,81.8);
  k.box(8.7,.15,5.55,m.enamel,0,2.73,79.2);
  const window=(x,y,z,w,h)=>{
    k.box(w,h,.04,glazing,x,y,z-.055);
    for(const s of [-1,1]){
      k.box(.075,h+.14,.15,wood,x+s*(w/2+.037),y,z);
      k.box(w+.22,.075,.15,wood,x,y+s*(h/2+.037),z);
    }
    k.box(.04,h,.12,wood,x,y,z+.015);
    k.box(w,.038,.12,wood,x,y+.15,z+.02);
  };
  for(let i=0;i<5;i++)window((i-2)*1.63,1.72,81.92,1.36,1.25);
  for(const s of [-1,1]){
    k.box(.2,2.54,5.25,m.enamel,s*4.28,1.42,79.2);
    k.box(.035,1.12,1.15,glazing,s*4.39,1.73,80.15);
    for(const dz of [-.62,.62])k.box(.07,1.26,.075,wood,s*4.42,1.73,80.15+dz);
    for(const y of [1.11,2.35])k.box(.07,.075,1.32,wood,s*4.42,y,80.15);
    k.box(.08,2.08,.94,wood,s*4.41,1.18,78.1);
    k.box(.025,.7,.62,glazing,s*4.46,1.64,78.1);
    k.box(.1,.05,.19,brass,s*4.49,1.12,77.8);
    // Side wings with inward return walls and a clear route around the room.
    k.box(.18,1.0,8.1,m.enamel,s*half,.61,80.65);
    k.box(.23,.06,8.1,wood,s*half,1.15,80.65);
    k.box(.09,1.53,.1,m.enamel,s*half,1.9,78.5);
    k.box(3.2,1.0,.17,m.enamel,s*12.05,.61,76.75);
    // Knee brackets carry the wing; navigation signal lamps sit on the roof.
    k.rod([s*13.45,-.1,84.5],[s*11.5,-2.3,84.5],.065,m.enamel);
    k.mesh(new T.CylinderGeometry(.075,.09,.6,10),brass,s*12.5,3.26,83.8);
    const light=k.mesh(new T.CylinderGeometry(.19,.19,.35,16),m.black,s*12.5,3.6,83.8);light.rotation.x=Math.PI/2;
    k.mesh(new T.CircleGeometry(.15,20),glazing,s*12.5,3.6,84.0);
    for(const z of [78,81.5])k.box(.065,.07,2.3,m.enamel,s*13.0,2.63,z);
  }
  // Bridge instruments read as small brass silhouettes from the exterior.
  for(const x of [-2.1,2.1]){
    k.mesh(new T.CylinderGeometry(.1,.18,1.05,12),brass,x,.65,84.5);
    const head=k.mesh(new T.CylinderGeometry(.28,.28,.14,24),brass,x,1.35,84.5);head.rotation.x=Math.PI/2;
    k.mesh(new T.CircleGeometry(.23,24),m.enamel,x,1.35,84.58);
    k.rod([x,1.35,84.61],[x+.18,1.77,84.61],.025,brass);
  }
  k.mesh(new T.CylinderGeometry(.2,.27,1.0,16),wood,0,.64,84.65);
  k.mesh(new T.SphereGeometry(.26,20,12),brass,0,1.27,84.65);
  k.mesh(new T.TorusGeometry(.45,.035,8,32),wood,0,1.34,83.6);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;k.rod([0,1.34,83.6],[Math.cos(a)*.55,1.34+Math.sin(a)*.55,83.6],.024,wood);}
  return g;
}

export function buildCargoCranes(m,kit){
  const g=new T.Group();g.name='ForwardElectricCargoCranes';
  for(const side of [-1,1]){
    const crane=new T.Group();crane.position.set(side*10.5,-8.5+sheer(96),96);g.add(crane);
    const k=kit(crane);
    k.mesh(new T.CylinderGeometry(.59,.83,1.75,20),m.enamel,0,.88,0);
    k.mesh(new T.CylinderGeometry(.79,.79,.16,24),m.black,0,1.82,0);
    k.box(1.48,1.02,1.66,m.enamel,0,2.4,0);
    k.box(1.16,.58,.03,m.shadow,0,2.42,.851);
    k.box(1.67,.12,1.87,m.enamel,0,2.97,0);
    k.mesh(new T.CylinderGeometry(.38,.38,1.13,20),m.black,0,2.3,-.96).rotation.z=Math.PI/2;
    const start=new T.Vector3(0,2.9,.35),end=new T.Vector3(-side*2.1,4.6,8.3);
    const along=end.clone().sub(start),cross=new T.Vector3(.3,0,0);
    for(const s of [-1,1])k.rod(start.clone().addScaledVector(cross,s).toArray(),end.clone().addScaledVector(cross,s*.32).toArray(),.062,m.enamel);
    for(let i=0;i<8;i++){
      const a=start.clone().addScaledVector(along,i/8),b=start.clone().addScaledVector(along,(i+1)/8);
      const wa=.3*(1-.68*i/8),wb=.3*(1-.68*(i+1)/8);
      k.rod([a.x-wa,a.y,a.z],[b.x+wb,b.y,b.z],.033,m.enamel);
      k.rod([a.x+wa,a.y,a.z],[b.x-wb,b.y,b.z],.033,m.enamel);
    }
    k.rod([0,3.3,-.7],end.toArray(),.018,m.wire);
    k.rod(end.toArray(),[end.x,1.15,end.z],.018,m.wire);
    k.mesh(new T.TorusGeometry(.16,.03,6,18,Math.PI*1.65),m.black,end.x,1.02,end.z);
    for(const x of [-.55,.55])k.rod([x,.18,.55],[x,2.9,.55],.024,m.rail);
    for(let y=.3;y<2.8;y+=.32)k.rod([-.55,y,.55],[.55,y,.55],.021,m.rail);
  }
  return g;
}
