import * as T from 'three';
import { getMaterial, uvBox } from '../walk/materials.js';
import { breadth, sheer, LENGTH_SCALE, BOAT_STATIONS, A_SCREEN_END } from './dimensions.js';
import { buildNavigationBridge, buildCargoCranes } from './navigation-bridge.js';
import { buildForemast, buildForedeckHardware, FOREMAST_Z } from './foremast.js';

export function palette() {
  const enamel = getMaterial('paintedSteel', { color:'#d5d2c4', seed:182, plateW:3.6, plateH:1.15, inout:.0007, wearAmt:.15, grime:.07 });
  enamel.metalness=.04; enamel.normalScale.setScalar(.22); enamel.roughness=.78;enamel.roughnessMap=null;
  const buff = getMaterial('paintedSteel', {color:'#b58037',seed:183,plateW:3.2,plateH:1.4,inout:.0008,wearAmt:.16,grime:.12});
  buff.metalness=.02;buff.normalScale.setScalar(.18);buff.roughness=.84;buff.roughnessMap=null;
  return {
    enamel, buff,
    shadow:new T.MeshStandardMaterial({color:'#1c2425',roughness:.88}),
    glass:new T.MeshStandardMaterial({color:'#172b31',roughness:.19,metalness:.46,envMapIntensity:.65}),
    black:new T.MeshStandardMaterial({color:'#111314',roughness:.73,metalness:.08}),
    teak:getMaterial('teak',{trim:true}),
    rail:new T.MeshStandardMaterial({color:'#c9c5b8',roughness:.56,metalness:.22}),
    wire:new T.MeshStandardMaterial({color:'#363632',roughness:.75,metalness:.2}),
    deck:getMaterial('teak',{}),
  };
}

export function kit(g) {
  const mesh=(geo,m,x=0,y=0,z=0)=>{const o=new T.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;g.add(o);return o;};
  const box=(w,h,d,m,x,y,z)=>{const o=mesh(new T.BoxGeometry(w,h,d),m,x,y,z);uvBox(o);return o;};
  const rod=(a,b,r,m)=>{
    const p=new T.Vector3(...a),q=new T.Vector3(...b);
    const o=mesh(new T.CylinderGeometry(r,r,p.distanceTo(q),6),m);
    o.position.copy(p).add(q).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),q.sub(p).normalize());return o;
  };
  return {mesh,box,rod};
}

export function rebuildWalkDetails(root) {
  root.updateMatrixWorld(true);
  const remove=[];
  let boatProto,davitProto;
  for(const child of root.children) {
    if(child.position.z===70 && child.position.y===3.1)remove.push(child);
    if(child.isGroup && Math.abs(Math.abs(child.position.x)-11.15)<.01 && child.position.y===1.35){boatProto??=child.clone();remove.push(child);}
    if(child.isGroup && Math.abs(Math.abs(child.position.x)-12.55)<.15 && child.position.y===0){davitProto??=child.clone();remove.push(child);}
    const bounds=new T.Box3().setFromObject(child);
    const size=bounds.getSize(new T.Vector3());
    // Four original circular funnels, including overlapping black/buff tubes.
    if(child.isGroup && [58,28,-2,-32].includes(child.position.z) && bounds.max.y>15 && size.x<10) remove.push(child);
    // Replace the narrow old wheelhouse with a complete projecting bridge.
    if(child.isGroup && bounds.min.z>74 && bounds.max.z<90 && size.x>20 && bounds.max.y>2) remove.push(child);
  }
  root.traverse(child=>{
    // Replace the old mast/nest assembly as a whole, including the incorrectly
    // vertical nest rim and unsupported rigging endpoints.
    if(child.isGroup && Math.abs(child.position.z-FOREMAST_Z)<.01 && Math.abs(child.position.y-12.9)<.01)remove.push(child);
    if(child.isMesh){
      const p=child.geometry.parameters??{},nearMast=Math.abs(child.position.z-FOREMAST_Z)<.45;
      const mastPart=nearMast && ((p.height===33 && p.radiusTop===.28) || (p.height===1 && p.radiusTop===.60) || (p.height===.42 && p.radiusTop===.018) || (p.height===.44 && p.radiusTop===.09) || (p.height===2.4 && p.radiusTop===.07) || (p.radius===.13 && child.position.y>20));
      const b=new T.Box3().setFromObject(child);
      const mastStay=[.035,.028,.030].includes(p.radiusTop) && b.max.y>10 && b.max.z>118 && b.min.z>85;
      if(mastPart || mastStay)remove.push(child);
    }
    // Replace the old rectangular anchor assemblies, not deck winches.
    if(child.isGroup && child.position.z===138.5 && Math.abs(child.position.y+9.2)<.01)remove.push(child);
    if(child.isGroup && Math.abs(Math.abs(child.position.x)-5.4)<.01 && Math.abs(child.position.y+8.5)<.01 && [94.5,114].includes(child.position.z))remove.push(child);
  });
  for(const o of remove) o.removeFromParent();
  if(!boatProto || !davitProto)throw new Error('Deck boat/davit prototypes were not found');
  // Presentation-only finish: distinguish canvas, painted planking and the
  // slender steel lifting gear without changing the walk model's materials.
  const hullFinish=boatProto.children.find(o=>o.material?.name==='paintedSteel')?.material;
  const coverFinish=boatProto.children.find(o=>o.material?.name==='canvas')?.material;
  const boatFinishes=new Map();
  for(const [source,color,roughness] of [[hullFinish,'#d1cec2',.82],[coverFinish,'#b7b09e',.98]]){
    if(!source)continue;const finish=source.clone();finish.color.set(color);finish.roughness=roughness;
    finish.roughnessMap=null;finish.metalness=.015;finish.envMapIntensity=.25;boatFinishes.set(source,finish);
  }
  boatProto.traverse(o=>{if(boatFinishes.has(o.material))o.material=boatFinishes.get(o.material);});
  const davitSource=davitProto.children.find(o=>o.isMesh)?.material;
  if(davitSource){
    const finish=davitSource.clone();finish.color.set('#b2b6af');finish.roughness=.69;finish.roughnessMap=null;finish.metalness=.12;
    davitProto.traverse(o=>{
      if(o.material!==davitSource || !o.geometry)return;
      o.material=finish;o.geometry=o.geometry.clone();
      // These prototypes were already merged by the walk builder. Contract the
      // upper arm surface along its normals while keeping the lifting reach.
      const p=o.geometry.attributes.position,n=o.geometry.attributes.normal;
      for(let i=0;i<p.count;i++){
        const inset=.019*T.MathUtils.smoothstep(p.getY(i),3.3,3.55);
        p.setXYZ(i,p.getX(i)-n.getX(i)*inset,p.getY(i)-n.getY(i)*inset,p.getZ(i)-n.getZ(i)*inset);
      }
      o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();
    });
  }
  const supports=kit(root),chock=getMaterial('teak',{trim:true});
  for(const side of [-1,1]){
    BOAT_STATIONS.forEach((z,i)=>{
      const boat=boatProto.clone();const scale=i===0?25/30:1;
      boat.position.set(side*11.1,1.45,z);boat.rotation.y=side>0?0:Math.PI;
      boat.scale.set(scale,scale,scale/LENGTH_SCALE);root.add(boat);
      for(const dz of [-2.5,2.5])supports.box(1.8*scale,.48,.26,chock,side*11.1,.24,z+dz*scale/LENGTH_SCALE);
      for(const dz of [-3.3,3.3]){
        const davit=davitProto.clone();davit.position.set(side*12.6,0,z+dz*scale/LENGTH_SCALE);
        davit.rotation.y=side>0?Math.PI:0;davit.scale.set(.78,.78,.78/LENGTH_SCALE);root.add(davit);
      }
    });
    for(const roof of [false,true]){
      const raft=boatProto.clone();raft.position.set(side*(roof?5.6:8.15),roof?3.62:.55,roof?69.5:77);
      raft.rotation.y=0;raft.scale.set(.75,.35,.70/LENGTH_SCALE);root.add(raft);
    }
  }
  const flatten=new T.Group();flatten.name='WalkExteriorFittings';
  const mastMaterial=new T.MeshStandardMaterial({color:'#9d7547',roughness:.82,metalness:.02});
  root.updateMatrixWorld(true);
  root.traverse(o=>{
    if(!o.isMesh || Array.isArray(o.material) || !o.material.visible || !o.visible)return;
    const b=new T.Box3().setFromObject(o), sz=b.getSize(new T.Vector3());
    const isSkin=b.min.y< -23 && sz.z>10;
    const isFront=b.min.z>90.5 && b.max.z<92.5 && b.min.y<.2 && b.max.y> -8.6;
    const isBack=b.min.z> -47.7 && b.max.z< -46.2 && b.min.y<.2 && b.max.y> -8.6;
    const oldBowWall=b.min.z>116 && sz.z>25 && b.min.y> -6.05 && b.max.y< -4.5 && sz.x>3 && sz.y>.04 && sz.y<1.2;
    const oldHawse=o.geometry.type==='TorusGeometry' && b.min.z>137 && b.max.z<140 && b.max.y< -6;
    const oldStay=o.geometry.type==='CylinderGeometry' && o.geometry.parameters?.radiusTop===.026 && b.max.y>12 && b.max.y<15;
    if(isSkin || isFront || isBack || oldStay || oldBowWall || oldHawse)return;
    const geometry=o.geometry.clone().applyMatrix4(o.matrixWorld);
    const p=geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const z=p.getZ(i);let oldWidth=14.1;
      if(z>91.5){const t=T.MathUtils.clamp((z-91.5)/54.5,0,1);oldWidth=13.8*Math.pow(1-Math.pow(t,2.6),.55)+.35*(1-t);}
      if(z< -47){const t=T.MathUtils.clamp((-47-z)/49,0,1);oldWidth=13.8*Math.pow(1-Math.pow(t,3.1),.42)+.5*(1-t);}
      const ratio=oldWidth>.05?breadth(z)/oldWidth:1;
      let y=p.getY(i);
      // Raise the mainmast and its upper stays together so the antenna span
      // clears every funnel instead of passing through the third/fourth tops.
      if(z< -47 && y>5)y+=(y-5)*.65;
      p.setXYZ(i,p.getX(i)*ratio,y+sheer(z),z);
    }
    geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const isMast=sz.y>12 && sz.x<1.7 && sz.z<2 && b.max.y>17;
    const m=new T.Mesh(geometry,isMast?mastMaterial:o.material);m.name=o.name;m.castShadow=m.receiveShadow=true;flatten.add(m);
  });
  // Tone down the close-up textures and remove expensive refractive glass.
  const glass=new T.MeshStandardMaterial({color:'#1e323a',metalness:.4,roughness:.18});
  const done=new Set();
  flatten.traverse(o=>{
    if(!o.isMesh)return;
    if(o.material.transmission>0){o.material=glass;return;}
    if(done.has(o.material))return;done.add(o.material);
    if(o.material.normalScale)o.material.normalScale.multiplyScalar(.4);
    o.material.envMapIntensity=.55;
  });
  return flatten;
}

export function buildSuperstructure(m=palette()) {
  const g=new T.Group();g.name='TieredSuperstructure';const {box,rod,mesh}=kit(g);
  const frontZ=(d,x)=>d.z1-1.8*Math.pow(Math.abs(x)/d.x,4);
  const frontAngle=(d,x)=>Math.atan(7.2*Math.pow(x,3)/Math.pow(d.x,4));
  const slab=(d,y,material)=>{
    const shape=new T.Shape();shape.moveTo(-d.x,-d.z0);shape.lineTo(d.x,-d.z0);
    for(let i=0;i<=48;i++){const x=d.x-2*d.x*i/48;shape.lineTo(x,-frontZ(d,x));}
    shape.closePath();const geo=new T.ExtrudeGeometry(shape,{depth:.18,bevelEnabled:false,steps:1});geo.rotateX(-Math.PI/2);
    const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/2.5,uv.getY(i)/2.5);
    mesh(geo,material,0,y,0);
  };
  const fascia=(d,y,h,material)=>{
    const p=[],uv=[],idx=[];
    for(let i=0;i<=64;i++){const x=-d.x+2*d.x*i/64,z=frontZ(d,x);p.push(x,y,z,x,y+h,z);uv.push(x/2.5,y/2.5,x/2.5,(y+h)/2.5);if(i<64){const a=i*2;idx.push(a,a+2,a+1,a+1,a+2,a+3);}}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeVertexNormals();mesh(geo,material);
  };
  // Three strongly separated horizontal decks. Side openings are geometry gaps,
  // with dark inboard walls providing real depth and consistent silhouettes.
  const levels=[{y:-5.85,h:2.72,z0:-47,z1:91.5,x:13.72,pitch:2.45,opening:1.02,sill:1.03,paneH:1.13,frontCount:13,frontW:1.16},
    {y:-3.05,h:2.83,z0:-44,z1:89.7,x:13.36,pitch:2.64,opening:1.92,sill:.82,paneH:1.70,frontCount:16,frontW:1.46}];
  // Replacing the old full-height front facade left C deck completely open.
  // Build an actual closed compartment with a deck and transverse bulkhead;
  // this also seals the oblique sightline through the forward well deck.
  const cDeck=box(27.98,2.98,6.5,m.enamel,0,-7.16,88.05);cDeck.name='ForwardCDeckClosedCompartment';
  box(28.05,.24,7.1,m.deck,0,-8.56,88.25).name='ForwardCDeckFloor';
  for(const x of [-10.4,10.4]){
    box(1.18,2.1,.08,m.rail,x,-7.2,91.35);
    box(.91,1.82,.06,m.enamel,x,-7.18,91.41);
    box(.23,.035,.055,m.black,x+.28,-7.08,91.46);
  }
  for(const x of [-7,-3.5,0,3.5,7]){
    mesh(new T.CircleGeometry(.18,24),m.glass,x,-6.6,91.34);
    mesh(new T.TorusGeometry(.195,.028,6,24),m.rail,x,-6.6,91.36);
  }
  for(const d of levels){
    slab(d,d.y,m.deck);slab({...d,x:d.x+.2,z0:d.z0-.1,z1:d.z1+.1},d.y+d.h,m.enamel);
    const sideEnd=d.z1-1.8;
    box(2*(d.x-2.7),d.h-.16,sideEnd-d.z0-.3,m.shadow,0,d.y+d.h/2,(d.z0+sideEnd)/2).name='ClosedInnerDeckhouse';
    for(const side of [-1,1]){
      box(.17,d.h,sideEnd-d.z0,m.shadow,side*(d.x-2.7),d.y+d.h/2,(d.z0+sideEnd)/2);
      box(.22,d.sill,sideEnd-d.z0,m.enamel,side*d.x,d.y+d.sill/2,(d.z0+sideEnd)/2);
      const head=d.h-d.sill-d.paneH;
      box(.27,head,sideEnd-d.z0,m.enamel,side*d.x,d.y+d.h-head/2,(d.z0+sideEnd)/2);
      for(let z=d.z0+.8;z<sideEnd-d.pitch;z+=d.pitch){
        const paneH=d.paneH;
        box(.25,paneH,d.pitch-d.opening,m.enamel,side*d.x,d.y+d.sill+paneH/2,z);
        // A-deck aft promenade stays open; the forward section is glazed.
        if(d.y< -4 || z>A_SCREEN_END)box(.025,paneH-.08,d.opening-.08,m.glass,side*(d.x-.11),d.y+d.sill+paneH/2,z+d.pitch/2);
        if(d.y> -4 && z<=A_SCREEN_END)for(const h of [1.18,1.48])rod([side*d.x,d.y+h,z],[side*d.x,d.y+h,Math.min(z+d.pitch,d.z1)],.025,m.rail);
      }
      // Thin deck gutters cast the long horizontal shadows absent in the draft.
      box(.32,.08,sideEnd-d.z0,m.shadow,side*(d.x+.03),d.y-.07,(d.z0+sideEnd)/2);
    }
    for(const z of [d.z1,d.z0]){
      const outward=z===d.z1?1:-1;
      if(outward===1){
        // B deck has small individual windows in a substantial wall. A deck
        // carries the taller promenade screen, with slender divided glazing.
        fascia(d,d.y,d.sill,m.enamel);
        fascia(d,d.y+d.sill+d.paneH,d.h-d.sill-d.paneH,m.enamel);
        fascia({...d,z1:d.z1-.35},d.y+d.sill,d.paneH,m.shadow);
        const pitch=2*d.x/d.frontCount;
        for(let i=0;i<d.frontCount;i++){
          const x=-d.x+pitch*(i+.5),f=frontZ(d,x),angle=frontAngle(d,x);
          box(d.frontW,d.paneH-.08,.035,m.glass,x,d.y+d.sill+d.paneH/2,f-.11).rotation.y=angle;
          // Solid piers, not empty intervals between decorative window decals.
          const post=-d.x+pitch*i;
          if(i>0)box(pitch-d.frontW,d.paneH,.28,m.enamel,post,d.y+d.sill+d.paneH/2,frontZ(d,post)).rotation.y=frontAngle(d,post);
          if(d.y>-4)box(.042,d.paneH-.08,.06,m.enamel,x,d.y+d.sill+d.paneH/2,f-.035).rotation.y=angle;
        }
        // Close the final half-pier where the curved face meets the side wall.
        for(const side of [-1,1])box((pitch-d.frontW)/2,d.paneH,.28,m.enamel,side*(d.x-(pitch-d.frontW)/4),d.y+d.sill+d.paneH/2,frontZ(d,side*d.x)).rotation.y=frontAngle(d,side*d.x);
        continue;
      }
      box(d.x*2,.85,.25,m.enamel,0,d.y+.42,z);
      box(d.x*2,.25,.32,m.enamel,0,d.y+d.h-.12,z);
      box(d.x*2,d.h-1.1,.06,m.shadow,0,d.y+(d.h+.6)/2,z-outward*.42);
      for(let x=-d.x+.38;x<d.x;x+=1.78){
        box(.2,d.h-1.1,.28,m.enamel,x,d.y+(d.h+.6)/2,z);
        box(1.48,d.h-1.22,.035,m.glass,x+.85,d.y+(d.h+.6)/2,z-outward*.12);
      }
    }
  }
  // The walk mesh contains real doors but its separate interiors are not
  // loaded here. Recessed vestibule walls stop cross-ship sky sightlines.
  const interiors=new T.Group();interiors.name='BoatDeckVestibules';g.add(interiors);
  const ik=kit(interiors);
  for(const side of [-1,1])for(const z of [12,44,69.5]){
    ik.box(.18,2.76,4.8,m.shadow,side*5.9,1.48,z);
    for(const end of [-1,1])ik.box(1.13,2.76,.16,m.shadow,side*6.47,1.48,z+end*2.4);
    ik.box(1.22,.16,4.85,m.enamel,side*6.45,2.92,z);
  }
  g.add(buildNavigationBridge(m,kit),buildCargoCranes(m,kit),buildForemast(m,kit),buildForedeckHardware(m,kit));
  return g;
}

export function buildFunnels() {
  const g=new T.Group();g.name='RakedOvalFunnels';const m=palette();const {rod}=kit(g);
  [58,28,-2,-32].forEach((z,index)=>{
    const f=new T.Group();f.position.set(0,3.1,z);f.rotation.x=-.105;g.add(f);
    const k=kit(f), height=18.8+index*.25, rx=2.72, rz=3.7;
    const tube=(bottom,top,material)=>{
      const geo=new T.CylinderGeometry(1,1,top-bottom,64,1,true);geo.scale(rx,1,rz);
      const uv=geo.attributes.uv,circumference=Math.PI*(3*(rx+rz)-Math.sqrt((3*rx+rz)*(rx+3*rz)));
      for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*circumference/2.5,(bottom+uv.getY(i)*(top-bottom))/2.5);
      return k.mesh(geo,material,0,(bottom+top)/2,0);
    };
    tube(0,height-5.0,m.buff);tube(height-5,height,m.black);
    const inner=new T.MeshStandardMaterial({color:'#080909',side:T.BackSide,roughness:1});
    const innerGeo=new T.CylinderGeometry(1,1,5.1,64,1,true);innerGeo.scale(rx-.12,1,rz-.12);k.mesh(innerGeo,inner,0,height-2.55,0);
    const cap=new T.CircleGeometry(1,64);cap.rotateX(-Math.PI/2);cap.scale(rx-.1,1,rz-.1);k.mesh(cap,m.black,0,height-4.9,0);
    for(const y of [.18,height-5,height-.05]){
      const ring=new T.TorusGeometry(1,.018,5,64);ring.rotateX(Math.PI/2);ring.scale(rx,1,rz);k.mesh(ring,y>height-5.1?m.black:m.buff,0,y,0);
    }
    k.box(6.5,.9,8.5,m.enamel,0,.05,0);
    for(let y=1;y<height-.2;y+=.38){k.rod([rx+.06,y,-.22],[rx+.06,y,.22],.022,m.wire);}
    for(const dz of [-.26,.26])k.rod([rx+.08,.7,dz],[rx+.08,height-.2,dz],.025,m.wire);
    // Six fine stays follow the new funnel rake; no obsolete low attachment points.
    for(const side of [-1,1])for(const dz of [-7.5,0,7.5]){
      rod([side*2.45,17.4,z-1.5+dz*.13],[side*6.65,3.26,z+dz],.023,m.wire);
    }
  });
  return g;
}
