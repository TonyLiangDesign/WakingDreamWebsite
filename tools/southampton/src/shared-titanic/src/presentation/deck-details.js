import * as T from 'three';
import { palette, kit } from './structure.js';
import { breadth, sheer } from './dimensions.js';
import { station } from '../ship/hull.js';

function curveTube(points,radius,material){
  return new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),points.length*3,radius,6,false),material);
}

// Local XY is the shell tangent plane; local Z points out of the hull.
function onShell(object,side,z,y,offset=.04){
  const [x,zz]=station(z,y),[xa,za]=station(z-.05,y),[xb,zb]=station(z+.05,y);
  const normal=new T.Vector3(side*(zb-za),0,-(xb-xa)).normalize();
  object.position.set(side*x,y,zz);object.position.addScaledVector(normal,offset);
  object.lookAt(object.position.clone().add(normal));
  return object;
}

export function buildDeckDetails(){
  const g=new T.Group();g.name='ForecastleAndRoofDetails';
  const m=palette(),k=kit(g);
  const iron=new T.MeshStandardMaterial({color:'#24292a',roughness:.79,metalness:.22});
  const recess=new T.MeshStandardMaterial({color:'#080c0d',roughness:.91});
  const roof=new T.MeshStandardMaterial({color:'#99988b',roughness:.94});

  // The forecastle has a low white sheer strake BELOW the open railing.
  // Uniform opaque walls above the deck hid the ground tackle in the walk mesh.
  for(const side of [-1,1]){
    const pos=[],uv=[],idx=[],rails=[[],[],[]];
    for(let i=0;i<=150;i++){
      const z=117+29*i/150,deckY=-5.9+sheer(z);
      for(const y of [deckY-.78,deckY+.04]){
        const [x,zz]=station(z,y);pos.push(side*(x+.02),y,zz);uv.push(z*.2,y);
      }
      if(i<150){const a=i*2;idx.push(...(side>0?[a,a+1,a+2,a+1,a+3,a+2]:[a,a+2,a+1,a+1,a+2,a+3]));}
      for(let r=0;r<3;r++)rails[r].push(new T.Vector3(side*Math.max(0,breadth(z)-.12),deckY+.36+r*.34,z));
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();
    k.mesh(geo,m.enamel);
    for(let r=0;r<3;r++)g.add(curveTube(rails[r],r===2?.028:.018,m.rail));
    for(let z=117;z<145.6;z+=1.65){
      const x=side*(breadth(z)-.12),y=-5.9+sheer(z);
      k.rod([x,y,z],[x,y+1.06,z],.032,m.rail);
      if(Math.round((z-117)/1.65)%3===0)k.rod([x-side*.48,y,z],[x,y+.78,z],.023,m.rail);
    }
    for(let z=120;z<142;z+=2.1){
      const opening=new T.Mesh(new T.CircleGeometry(.135,20),recess);
      g.add(onShell(opening,side,z,-6.22+sheer(z),.045));
    }

    // Cast hawse lip surrounds a dark throat. The shank seats into that throat;
    // the crown and flukes stand away from the shell and cast their own shadows.
    const anchor=new T.Group(),a=kit(anchor);
    a.mesh(new T.CircleGeometry(.44,40),recess,0,1.1,.02).scale.set(1,.74,1);
    const lip=new T.Shape();lip.absellipse(0,0,.53,.40,0,Math.PI*2,false);
    const throat=new T.Path();throat.absellipse(0,0,.40,.28,0,Math.PI*2,true);lip.holes.push(throat);
    a.mesh(new T.ExtrudeGeometry(lip,{depth:.11,steps:1,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2}),iron,0,1.1,.03);
    const body=new T.Group();body.position.set(.035,1.08,.09);body.rotation.set(-.19,0,side*.11);anchor.add(body);
    const cast=kit(body);
    // Tapered forged shank, a rounded pivot crown, and two separately pitched
    // three-dimensional palms replace the former flat heraldic anchor outline.
    const shank=new T.CylinderGeometry(.10,.17,1.87,4,1);shank.rotateY(Math.PI/4);
    cast.mesh(shank,iron,0,-.94,.08);
    const crown=cast.mesh(new T.CylinderGeometry(.235,.235,1.04,16),iron,0,-1.88,.12);crown.rotation.z=Math.PI/2;
    cast.box(.61,.38,.49,iron,0,-1.91,.16);
    for(const sign of [-1,1]){
      const palm=new T.Shape();palm.moveTo(sign*.25,-1.97);palm.lineTo(sign*.79,-2.12);
      palm.lineTo(sign*.94,-1.33);palm.lineTo(sign*.57,-1.12);palm.lineTo(sign*.48,-1.70);palm.closePath();
      const geo=new T.ExtrudeGeometry(palm,{depth:.25,steps:1,bevelEnabled:true,bevelSize:.07,bevelThickness:.065,bevelSegments:2});
      const fluke=cast.mesh(geo,iron,0,0,.13);fluke.rotation.y=sign*.20;
      cast.rod([sign*.20,-1.90,.33],[sign*.66,-1.48,.39],.095,iron);
    }
    cast.mesh(new T.TorusGeometry(.125,.045,10,24),iron,0,-.08,.06).rotation.y=.4;
    g.add(onShell(anchor,side,138.5,-8.52+sheer(138.5),.055));

    // Narrow shell rubbing strip and recessed scuppers, following actual shell.
    const rub=[];
    for(let z=-87;z<141;z+=1){const y=-9.25+sheer(z),[x,zz]=station(z,y);rub.push(new T.Vector3(side*(x+.015),y,zz));}
    g.add(curveTube(rub,.018,iron));
    for(let z=94;z<115;z+=3.4){
      const scupper=new T.Mesh(new T.PlaneGeometry(.6,.11),recess);
      g.add(onShell(scupper,side,z,-8.32+sheer(z),.035));
    }
  }

  // Enclose the grand staircase glazing in a low roof housing rather than an
  // exposed hemispherical bubble. Add skylights, ventilator curbs and roof seams.
  k.box(8.5,.65,7.5,m.enamel,0,3.55,70);
  for(const s of [-1,1]){
    const pane=k.box(4.45,.08,7.1,m.glass,s*2.05,4.15,70);pane.rotation.z=-s*.15;
    for(let z=66.6;z<=73.5;z+=.69){
      k.rod([0,4.5,z],[s*4.3,3.83,z],.038,m.enamel);
    }
  }
  k.rod([0,4.5,66.4],[0,4.5,73.6],.05,m.enamel);
  for(const z of [17,-14,-42]){
    k.box(5.8,.5,5.3,m.enamel,0,3.55,z);
    k.box(5.9,.09,5.45,roof,0,3.86,z);
    for(let dz=-2.2;dz<2.3;dz+=.42)for(const s of [-1,1]){
      const louver=k.box(2.35,.05,.21,iron,s*1.32,3.93,z+dz);louver.rotation.x=.24;
    }
  }
  for(let z=-42;z<78;z+=2.15){
    if([58,28,-2,-32,70,17,-14,-42].some(c=>Math.abs(c-z)<4.7))continue;
    k.box(13.4,.022,.026,roof,0,3.27,z);
  }

  // Fine paired Marconi antenna wires between the two masts.
  const mastEnds=[[118.6,28.5+sheer(118.6)],[-70.5,29.3+sheer(-70.5)]];
  for(const [z,y] of mastEnds)k.rod([-.76,y,z],[.76,y,z],.026,m.rail);
  for(const x of [-.65,.65]){
    const points=[];for(let i=0;i<=32;i++){const t=i/32;points.push(new T.Vector3(x,mastEnds[0][1]*(1-t)+mastEnds[1][1]*t-Math.sin(t*Math.PI)*1.2,118.6*(1-t)-70.5*t));}
    g.add(curveTube(points,.012,m.wire));
  }
  return g;
}
