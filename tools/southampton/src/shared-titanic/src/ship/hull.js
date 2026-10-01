/** Canonical Titanic shell, selected from the improved presentation model. */
import * as T from 'three';
import { getMaterial } from '../walk/materials.js';
import { breadth, sheer, WATERLINE, KEEL } from '../presentation/dimensions.js';

export const width = breadth;
const clamp = T.MathUtils.clamp;
export function hullTop(z) {
  return (z > 117 || z < -72 ? -5.9 : z > 91.5 || z < -47 ? -8.5 : -5.95) + sheer(z);
}
export function station(z, y) {
  const bow=Math.pow(clamp((z-91.5)/54.5,0,1),2.5);
  const stern=Math.pow(clamp((-47-z)/49,0,1),2.4);
  // Deck breaks clip the shell; they must not alter its underlying sections.
  const sectionTop=-5.9+sheer(z);
  const depth=clamp((sectionTop-y)/(sectionTop-KEEL),0,1);
  const submerged=clamp((WATERLINE-y)/(WATERLINE-KEEL),0,1);
  // Upright sides at the waterline, round bilge, fine entrance and tucked stern.
  const section=Math.pow(Math.max(.001,1-Math.pow(submerged,2.7)),.44);
  const flare=1-(.025+.16*bow)*depth;
  return [breadth(z)*flare*section,z-2.7*bow*depth+8*stern*depth];
}
function plating(material) {
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 hullUV;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nhullUV=uv*3.2;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 hullUV;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 q=hullUV;
      float row=floor(q.y/.92);
      vec2 plate=vec2((q.x+mod(row,2.)*1.6)/3.2,q.y/.92);
      vec2 df=abs(fract(plate)-.5);
      vec2 aa=max(fwidth(plate),vec2(.0001));
      float seam=max(smoothstep(.497-aa.x,.5,df.x),smoothstep(.496-aa.y,.5,df.y));
      float variation=fract(sin(dot(floor(plate),vec2(32.1,71.7)))*351.7);
      vec2 rivetCell=vec2(fract(q.x/.145)-.5,abs(fract(q.y/.92)-.5)-.457);
      float rivet=1.-smoothstep(.035,.11,length(rivetCell*vec2(1.,6.3)));
      rivet*=1.-smoothstep(.045,.16,max(fwidth(q.x),fwidth(q.y)));
      float streak=pow(.5+.5*sin(q.x*7.31),12.)*.018;
      diffuseColor.rgb*=.93+variation*.10-seam*.16-streak+rivet*.08;
      float wet=1.-smoothstep(${WATERLINE.toFixed(4)},${(WATERLINE+1.2).toFixed(4)},q.y);
      diffuseColor.rgb*=1.-wet*.2;
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor,.38,.86);');
  };
  material.customProgramCacheKey=()=> 'exterior-plating-v3';
  return material;
}
export function buildHull() {
  const group=new T.Group();group.name='ContinuousRivetedHull';
  const black=plating(getMaterial('paintedSteel',{color:'#141a1d',seed:73,plateW:3.2,plateH:.92,inout:.001,wearAmt:.13,grime:.09}));
  black.roughness=.76;black.metalness=.12;black.normalScale.setScalar(.25);black.envMapIntensity=.48;
  const red=getMaterial('paintedSteel',{color:'#50251f',seed:74,inout:.001,wearAmt:.3,grime:.2});
  const bronze=new T.MeshStandardMaterial({color:'#192023',roughness:.88,metalness:.04});
  const glass=new T.MeshStandardMaterial({color:'#0b1619',roughness:.26,metalness:.35});
  const yellow=new T.MeshStandardMaterial({color:'#9c793e',roughness:.75,metalness:.02});
  const stations=[...new Set([...Array.from({length:485},(_,i)=>i*.5-96),...[-72,-47,91.5,117].flatMap(z=>[z-.001,z+.001])])].sort((a,b)=>a-b);
  function skin(y0,upper,material){
    const positions=[],uv=[],indices=[],rows=64;
    // Common horizontal rings prevent deck-height steps from dragging a crease
    // down the otherwise smooth shell. Only the upper boundary is clipped.
    const maxUpper=Math.max(...stations.map(upper));
    for(const side of [-1,1]){
      const offset=positions.length/3;
      for(const z of stations)for(let j=0;j<=rows;j++){
        const y=Math.min(upper(z),T.MathUtils.lerp(y0,maxUpper,j/rows)),[x,zz]=station(z,y);
        positions.push(side*x,y,zz);uv.push(z/3.2,y/3.2);
      }
      for(let i=0;i<stations.length-1;i++)for(let j=0;j<rows;j++){
        const a=offset+i*(rows+1)+j,b=a+1,c=a+rows+1,d=c+1;
        if(side>0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
      }
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
    const mesh=new T.Mesh(geo,material);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
  }
  skin(KEEL,()=>WATERLINE-.22,red);skin(WATERLINE-.22,hullTop,black);
  // Gold sheer lines terminate at actual deck breaks; they do not turn down
  // the vertical cut and frame each well-deck bulwark like a rectangular panel.
  for(const side of [-1,1])for(const [z0,z1] of [[-96,-72.002],[-71.998,-47.002],[-46.998,91.498],[91.502,116.998],[117.002,146]]){
    const p=stations.filter(z=>z>=z0&&z<=z1).map(z=>{const y=hullTop(z)-.2,[x,zz]=station(z,y);return new T.Vector3(side*(x+.018),y,zz);});
    const path=new T.CatmullRomCurve3(p,false,'centripetal');
    group.add(new T.Mesh(new T.TubeGeometry(path,Math.max(16,p.length),.034,5,false),yellow));
  }
  const ports=[];
  for(const side of [-1,1])for(const [row,y] of [-7.65,-10.45,-13.4,-16.1].entries()){
    for(let z=-85;z<139;z+=row===0?2.42:3.06){
      if(z>142-row*2.5 || breadth(z)<3 || (Math.floor((z+85)/3.06)%13===0 && row>0))continue;
      const yy=y+sheer(z),[x,zz]=station(z,yy);ports.push([side*(x+.034),yy,zz,side,z]);
    }
  }
  const discs=new T.InstancedMesh(new T.CircleGeometry(.22,16),glass,ports.length);
  const rings=new T.InstancedMesh(new T.TorusGeometry(.222,.014,5,20),bronze,ports.length);
  const obj=new T.Object3D();
  ports.forEach(([x,y,z,side,srcZ],i)=>{
    obj.position.set(x,y,z);const [wx,wz]=station(srcZ+.1,y),[vx,vz]=station(srcZ-.1,y);
    obj.lookAt(x+side*(wz-vz)*10,y,z-(wx-vx)*10);obj.updateMatrix();discs.setMatrixAt(i,obj.matrix);rings.setMatrixAt(i,obj.matrix);
  });group.add(discs,rings);
  // Flush shell doors, hinge straps and handles; no floating rectangular overlays.
  for(const side of [-1,1])for(const z of [-30,55]){
    const [x,zz]=station(z,-11.6),m=new T.Mesh(new T.BoxGeometry(.06,2.6,2.05),black);m.position.set(side*(x+.016),-11.6,zz);group.add(m);
    for(const dz of [-.96,.96]){const hinge=new T.Mesh(new T.BoxGeometry(.065,.16,.24),bronze);hinge.position.set(side*(x+.06),-11.2,zz+dz);group.add(hinge);}
  }
  // Bow nameplate follows the local shell tangent.
  const c=document.createElement('canvas');c.width=1024;c.height=128;const ctx=c.getContext('2d');ctx.clearRect(0,0,1024,128);ctx.fillStyle='#c7af72';ctx.font='72px serif';ctx.textAlign='center';ctx.fillText('T I T A N I C',512,91);
  const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;
  for(const side of [-1,1]){
    const z=132,y=-7.55+sheer(132),[x,zz]=station(z,y),[x1,z1]=station(z+.1,y),[x0,z0]=station(z-.1,y);
    const label=new T.Mesh(new T.PlaneGeometry(4.5,.56),new T.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:.75,polygonOffset:true,polygonOffsetFactor:-2}));
    label.position.set(side*(x+.07),y,zz);label.lookAt(label.position.x+side*(z1-z0),y,zz-(x1-x0));group.add(label);
  }
  return group;
}
