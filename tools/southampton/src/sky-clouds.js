// A compact volume layer for the port sky. It shares the existing sun, weather
// controls and environment bake; no panorama, external asset or extra draw call.
const NOISE = /* glsl */`
  float portCloudHash(vec3 p) {
    p=fract(p*0.1031); p+=dot(p,p.yzx+33.33);
    return fract((p.x+p.y)*p.z);
  }
  float portCloudNoise(vec3 p) {
    vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(portCloudHash(i),portCloudHash(i+vec3(1,0,0)),f.x),
                   mix(portCloudHash(i+vec3(0,1,0)),portCloudHash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(portCloudHash(i+vec3(0,0,1)),portCloudHash(i+vec3(1,0,1)),f.x),
                   mix(portCloudHash(i+vec3(0,1,1)),portCloudHash(i+vec3(1,1,1)),f.x),f.y),f.z);
  }
  float portCloudFbm(vec3 p) {
    float n=portCloudNoise(p)*0.57;
    p=p*2.13+vec3(7.1,11.3,17.9); n+=portCloudNoise(p)*0.28;
    p=p*2.07+vec3(23.4,9.7,5.8); n+=portCloudNoise(p)*0.15;
    return n;
  }
  float portCloudDensity(vec3 p,float bottom,float thickness) {
    float h=(p.y-bottom)/thickness;
    float profile=smoothstep(0.0,0.15,h)*(1.0-smoothstep(0.50,1.0,h));
    vec3 q=p*cloudScale*1.8;
    q.xz+=time*cloudSpeed*vec2(0.9,0.25);
    float weather=0.5+0.5*noise(p.xz*0.00035);
    float threshold=1.0-cloudCoverage+(weather-0.5)*0.17;
    float shape=portCloudFbm(q);
    return smoothstep(threshold-0.035,threshold+0.12,shape)*profile;
  }
`;

const CLOUDS = /* glsl */`
  // Clouds: integrate a finite 3D density layer rather than a flat soft mask.
  if(direction.y>0.012 && cloudCoverage>0.0) {
    float bottom=950.0+(1.0-cloudElevation)*1000.0;
    float thickness=540.0;
    float start=bottom/max(direction.y,0.012);
    float finish=(bottom+thickness)/max(direction.y,0.012);
    float stepSize=(finish-start)/48.0;
    float trans=1.0;
    vec3 scattered=vec3(0.0);
    vec3 sunColor=vSunE*Fex*0.22*0.04;
    vec3 ambient=Lin*0.04;
    float horizon=smoothstep(0.012,0.12,direction.y);
    for(int ci=0;ci<48;ci++) {
      float jitter=portCloudHash(vec3(gl_FragCoord.xy,float(ci)+17.0));
      vec3 p=direction*(start+(float(ci)+jitter)*stepSize);
      float density=portCloudDensity(p,bottom,thickness);
      if(density>0.008) {
        float sunDensity=portCloudDensity(p+vSunDirection*95.0,bottom,thickness);
        float sunTrans=exp(-sunDensity*3.0);
        float shade=0.22+sunTrans*0.78;
        vec3 radiance=ambient*0.85+sunColor*shade;
        // A little forward scattering is confined to the thin illuminated rim.
        float silver=clamp(0.51/pow(1.49-cosTheta*1.4,1.5),0.0,2.0);
        radiance+=sunColor*silver*0.09*(1.0-density);
        radiance=mix(texColor,radiance,clamp(Fex,vec3(0),vec3(1)));
        float alpha=(1.0-exp(-density*cloudDensity*0.018*stepSize))*horizon;
        scattered+=trans*alpha*radiance;
        trans*=1.0-alpha;
      }
      if(trans<0.025) break;
    }
    texColor=texColor*trans+scattered;
  }
`;

export function installPortClouds(material) {
  const original=material.fragmentShader;
  const cloudBlock=/\/\/ Clouds\s*[\s\S]*?(?=\s*gl_FragColor\s*=)/;
  if(!cloudBlock.test(original)) throw new Error('Sky cloud shader layout changed');
  material.fragmentShader=original
    .replace(/void main\(\)\s*\{/,NOISE+'\nvoid main() {')
    .replace(cloudBlock,CLOUDS);
  material.needsUpdate=true;
}
