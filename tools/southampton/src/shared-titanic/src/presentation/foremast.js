import * as T from 'three';
import { breadth, sheer } from './dimensions.js';

export const FOREMAST_Z=118.6;
export function buildForemast(m,kit){
  const g=new T.Group();g.name='DetailedForemast';const k=kit(g);
  const y0=-5.9+sheer(FOREMAST_Z),z=FOREMAST_Z;
  const paint=new T.MeshStandardMaterial({color:'#a48654',roughness:.74,metalness:.08});
  const iron=new T.MeshStandardMaterial({color:'#41433e',roughness:.74,metalness:.2});
  const brass=new T.MeshStandardMaterial({color:'#82734f',roughness:.53,metalness:.4});
  const radius=y=>.51-(y/33)*.23;
  const ring=(r,t,y,mat)=>{const geo=new T.TorusGeometry(r,t,8,48);geo.rotateX(Math.PI/2);return k.mesh(geo,mat,0,y0+y,z);};
  const bolt=(x,y,zz,r=.04)=>k.mesh(new T.CylinderGeometry(r,r,.055,6),iron,x,y,zz);
  k.mesh(new T.CylinderGeometry(.28,.51,33,48),paint,0,y0+16.5,z).name='ForemastShaft';
  k.mesh(new T.CylinderGeometry(.59,.72,.85,32),paint,0,y0+.43,z);
  k.mesh(new T.CylinderGeometry(.81,.81,.11,32),iron,0,y0+.065,z);
  for(let i=0;i<12;i++){const a=i*Math.PI/6;bolt(Math.cos(a)*.70,y0+.145,z+Math.sin(a)*.70,.048);}
  for(const y of [.85,7.9,15.6,22.8,29.5])ring(radius(y)+.012,.027,y,paint);
  // A small mast-access door, hinges and a dog latch establish human scale.
  k.box(.39,.73,.06,iron,0,y0+.57,z+.61);
  k.box(.33,.64,.035,paint,0,y0+.57,z+.651);
  for(const y of [.38,.79])k.box(.11,.048,.06,iron,-.15,y0+y,z+.679);
  k.box(.10,.045,.06,brass,.10,y0+.56,z+.681);

  const nest=new T.Group();nest.position.set(0,y0+18.8,z);nest.name='CrowsNest';g.add(nest);
  const n=kit(nest);
  const profile=[[.96,0],[1.13,1.23],[1.19,1.25],[1.19,1.32],[1.08,1.32],[.90,.075]].map(p=>new T.Vector2(...p));
  n.mesh(new T.LatheGeometry(profile,64),m.enamel);
  n.mesh(new T.CylinderGeometry(.96,.96,.085,48),m.deck,0,.025,0);
  const rim=new T.TorusGeometry(1.135,.052,10,64);rim.rotateX(Math.PI/2);
  n.mesh(rim,m.enamel,0,1.30,0).name='HorizontalNestRim';
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6;
    n.rod([Math.cos(a)*.97,.10,Math.sin(a)*.97],[Math.cos(a)*1.13,1.24,Math.sin(a)*1.13],.018,m.rail);
  }
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    n.rod([Math.cos(a)*radius(17.8),-1.05,Math.sin(a)*radius(17.8)],[Math.cos(a)*.91,-.02,Math.sin(a)*.91],.048,paint);
  }
  n.box(.56,.04,.49,iron,.46,.083,-.38);
  n.box(.10,.055,.035,brass,.47,.123,-.50);
  n.box(.25,.38,.16,m.teak,-.63,.57,.48);
  n.box(.13,.21,.06,iron,-.63,.58,.58);
  n.rod([-.25,.48,.19],[-.63,.48,.43],.035,iron);
  n.rod([-.25,.12,.19],[-.63,.48,.43],.027,iron);
  n.rod([.19,.10,.39],[-.63,.10,.42],.014,iron);
  n.rod([-.63,.10,.42],[-.63,.41,.42],.014,iron);
  // Phone conduit follows the mast with physical clamps instead of floating.
  k.rod([.19,y0+.85,z+.48],[.19,y0+18.9,z+.39],.014,iron);
  for(let y=1.1;y<18.8;y+=1.75){
    const surface=Math.sqrt(radius(y)**2-.19**2),conduit=.48-(y-.85)/18.05*.09;
    k.box(.08,.045,conduit-surface+.035,paint,.19,y0+y,z+(surface+conduit)/2);
  }
  k.rod([0,y0+30.25,z+.27],[0,y0+30.25,z+.57],.035,iron);
  k.mesh(new T.CylinderGeometry(.10,.13,.48,12),brass,0,y0+30.5,z+.57);
  k.mesh(new T.CylinderGeometry(.125,.125,.23,20),m.glass,0,y0+30.73,z+.57);
  k.mesh(new T.CylinderGeometry(.15,.15,.035,20),iron,0,y0+30.86,z+.57);
  k.mesh(new T.CylinderGeometry(.065,.085,2.35,20),paint,0,y0+34.12,z);

  const stay=(top,end)=>{
    const a=new T.Vector3(...top),b=new T.Vector3(...end),dir=a.clone().sub(b).normalize();
    k.rod(b.clone().addScaledVector(dir,.90).toArray(),a.toArray(),.024,m.wire);
    const mid=b.clone().addScaledVector(dir,.52),link=new T.Group();link.position.copy(mid);link.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir);g.add(link);
    const t=kit(link);t.rod([0,-.5,0],[0,.5,0],.022,iron);
    for(const s of [-1,1])t.rod([s*.06,-.25,0],[s*.06,.25,0],.025,iron);
    for(const y of [-.25,.25])t.box(.15,.065,.07,iron,0,y,0);
    k.box(.45,.08,.43,iron,b.x,b.y-.14,b.z);
    const eye=k.mesh(new T.TorusGeometry(.105,.035,8,20),iron,b.x,b.y,b.z);
    eye.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(-dir.z,0,dir.x).normalize());
    for(const dx of [-.16,.16])bolt(b.x+dx,b.y-.07,b.z+.14,.032);
  };
  stay([0,y0+29.5,z],[0,-5.9+sheer(143)+.20,143]);
  for(const side of [-1,1]){
    stay([0,y0+28,z],[side*(breadth(126)-1.15),-5.9+sheer(126)+.20,126]);
    stay([0,y0+18.2,z],[side*(breadth(120.5)-1.1),-5.9+sheer(120.5)+.20,120.5]);
    stay([0,y0+26.5,z],[side*9,.18+sheer(86),86]);
  }
  return g;
}

// Add small components to the inherited equipment at its remapped coordinates.
export function buildForedeckHardware(m,kit){
  const g=new T.Group();g.name='ForedeckHardware';const k=kit(g);
  const iron=new T.MeshStandardMaterial({color:'#343b3b',roughness:.77,metalness:.18});
  const brass=new T.MeshStandardMaterial({color:'#7c7255',roughness:.64,metalness:.3});
  const remap=(x,z)=>{const t=T.MathUtils.clamp((z-91.5)/54.5,0,1);return x*breadth(z)/(13.8*Math.pow(1-Math.pow(t,2.6),.55)+.35*(1-t));};
  const wheel=(x,y,z,r)=>{
    k.mesh(new T.TorusGeometry(r,.032,8,32),iron,x,y,z);
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5;k.rod([x,y,z],[x+Math.cos(a)*r,y+Math.sin(a)*r,z],.019,iron);}
    k.mesh(new T.CylinderGeometry(.085,.085,.13,12),brass,x,y,z).rotation.x=Math.PI/2;
  };
  for(const side of [-1,1]){
    const z=123.5,y=-5.9+sheer(z),x=remap(side*4,z);
    wheel(x+side*.91,y+1.33,z+1.05,.32);
    k.rod([x+side*.91,y+1.33,z+.40],[x+side*.91,y+1.33,z+1.05],.055,iron);
    for(const s of [-1,1]){
      k.box(.23,.62,.43,iron,x+s*.49,y+.87,z+.98);
      k.mesh(new T.CylinderGeometry(.075,.075,.035,6),brass,x+s*.49,y+1.20,z+.99);
    }
    const cz=129,cy=-5.9+sheer(cz),cx=remap(side*(4-.9*(cz-124.6)/14.4),cz);
    k.box(.93,.13,1.06,iron,cx,cy+.08,cz);
    for(const s of [-1,1])k.box(.13,.33,.75,iron,cx+s*.32,cy+.26,cz);
    const pawl=k.box(.45,.16,.62,iron,cx,cy+.40,cz);pawl.rotation.x=.22;
    wheel(cx+side*.48,cy+.52,cz-.2,.17);
    for(const dz of [-.4,.4])for(const dx of [-.33,.33])k.mesh(new T.CylinderGeometry(.045,.045,.035,6),iron,cx+dx,cy+.17,cz+dz);
  }
  for(const [z,w,d] of [[99,7.4,6.2],[109.5,6.6,5.6]]){
    const y=-8.5+sheer(z);
    for(const side of [-1,1])for(let dz=-d/2+.45;dz<d/2;dz+=.92){
      const x=remap(side*(w/2+.09),z+dz);
      k.box(.16,.15,.27,iron,x,y+.72,z+dz);
      k.box(.28,.075,.10,brass,x,y+.82,z+dz);
    }
  }
  return g;
}
