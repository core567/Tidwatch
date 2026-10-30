import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshStandardMaterial, TextureLoader, SRGBColorSpace } from 'three';
import { useSceneSettings } from './sceneSettings';
import albedoUrl from './assets/ground-albedo.png';
import normalUrl from './assets/ground-normal.png';
import roughnessUrl from './assets/ground-roughness.png';
interface Props { riverTerrain?: boolean; waterLevelUniform?: { value: number } }
/** World-space PBR. Caustics are evaluated on the bed, never on an overlay plane. */
export default function TerrainMaterial({riverTerrain=false,waterLevelUniform}:Props) {
 const motion=useSceneSettings(s=>s.motion),quality=useSceneSettings(s=>s.quality);
 const textures=useMemo(()=>{const loader=new TextureLoader();const maps=[albedoUrl,normalUrl,roughnessUrl].map(url=>loader.load(url));maps[0].colorSpace=SRGBColorSpace;maps.forEach(t=>{t.anisotropy=8});return maps},[]);
 const uniforms=useMemo(()=>({uGroundColor:{value:textures[0]},uGroundNormal:{value:textures[1]},uGroundRough:{value:textures[2]},
  uGroundTime:{value:0},uTerrainWaterLevel:waterLevelUniform??{value:0},uGroundDetail:{value:1}}),[textures,waterLevelUniform]);
 useFrame((_,dt)=>{uniforms.uGroundDetail.value=quality==='low'?0:1;if(motion)uniforms.uGroundTime.value+=Math.min(dt,.05)});
 const material=useMemo(()=>{
  const mat=new MeshStandardMaterial({vertexColors:true,roughness:.94});
  mat.defines=riverTerrain?{RIVER_TERRAIN:1}:{};
  mat.customProgramCacheKey=()=>`ground-pbr-v2-${riverTerrain}`;
  mat.onBeforeCompile=s=>{
   Object.assign(s.uniforms,uniforms);
   s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>
    varying vec3 vGround;
    #ifdef RIVER_TERRAIN
    attribute vec3 terrainSurface; varying vec3 vSurface;
    #endif`).replace('#include <begin_vertex>',`#include <begin_vertex>
    vGround=(modelMatrix*vec4(transformed,1.)).xyz;
    #ifdef RIVER_TERRAIN
    vSurface=terrainSurface;
    #endif`);
   s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 vGround;
    #ifdef RIVER_TERRAIN
    varying vec3 vSurface;
    #endif
    uniform sampler2D uGroundColor,uGroundNormal,uGroundRough;
    uniform float uTerrainWaterLevel,uGroundTime,uGroundDetail;
    float gh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float gn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(gh(i),gh(i+vec2(1,0)),f.x),mix(gh(i+vec2(0,1)),gh(i+1.),f.x),f.y);}
    vec2 tileUV(vec2 p,vec2 tile){return tile*.5+.004+fract(p)*.492;}
    vec4 groundSample(sampler2D tex,vec2 p,vec4 weights) {
     return textureGrad(tex,tileUV(p,vec2(0,1)),dFdx(p)*.492,dFdy(p)*.492)*weights.x+
      textureGrad(tex,tileUV(p,vec2(1,1)),dFdx(p)*.492,dFdy(p)*.492)*weights.y+
      textureGrad(tex,tileUV(p,vec2(0,0)),dFdx(p)*.492,dFdy(p)*.492)*weights.z+
      textureGrad(tex,tileUV(p,vec2(1,0)),dFdx(p)*.492,dFdy(p)*.492)*weights.w;
    }
    float caustic(vec2 p){
     vec2 cell=floor(p),f=fract(p);float first=10.,second=10.;
     for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
      vec2 o=vec2(float(x),float(y)),id=cell+o;
      vec2 seed=vec2(gh(id),gh(id+13.7));
      vec2 r=o+.5+.29*sin(seed*6.28+uGroundTime*.65)-f;
      float d=dot(r,r);
      if(d<first){second=first;first=d;}else second=min(second,d);
     }
     return 1.-smoothstep(.015,.095,second-first);
    }`);
   s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec2 ground=vGround.xz;float macro=gn(ground*.08),wet=1.-smoothstep(.01,.16,vGround.y-uTerrainWaterLevel);
    vec4 weights=vec4(.0,.0,1.,.0);
    #ifdef RIVER_TERRAIN
     float sand=smoothstep(.12,.78,vSurface.y+(gn(ground*.7)-.5)*.21);
     float wood=smoothstep(.4,.8,vSurface.z)*.65;
     float mud=wet*.42;
     weights=vec4(sand*(1.-mud),sand*mud,(1.-sand)*(1.-wood),(1.-sand)*wood);
    #endif
    vec2 gp=ground/3.2;
    vec3 albedo=groundSample(uGroundColor,gp,weights).rgb;
    vec3 offsetColor=groundSample(uGroundColor,gp*1.37+vec2(.37,.19),weights).rgb;
    albedo=mix(albedo,offsetColor,.23);
    float field=0.;
    #ifdef RIVER_TERRAIN
     field=smoothstep(10.,18.,vSurface.x);
    #endif
    vec2 fieldUv=(ground+vec2(gn(ground*.05)*2.))/vec2(19.,14.);
    vec2 fieldCell=floor(fieldUv);
    float parcel=gh(fieldCell);
    vec3 crop=mix(vec3(.64,.85,.53),vec3(1.30,1.14,.85),parcel);
    albedo*=mix(vec3(1),crop,field*.80);
    vec2 edge=min(fract(fieldUv),1.-fract(fieldUv));
    float boundary=1.-smoothstep(.006,.018,min(edge.x,edge.y));
    albedo=mix(albedo,albedo*.74,field*boundary*.55);
    diffuseColor.rgb=mix(diffuseColor.rgb,albedo,.98)*(.92+macro*.15);
    diffuseColor.rgb*=mix(1.,.70,wet*weights.x);
    float bedDepth=uTerrainWaterLevel-vGround.y;
    float causticMask=smoothstep(.008,.065,bedDepth)*(1.-smoothstep(.32,.85,bedDepth));
    if(uGroundDetail>.5 && causticMask>.001) {
      float footprint=max(length(dFdx(ground)),length(dFdy(ground)));
      float c=caustic(ground*4.8+vec2(uGroundTime*.07,0.));
      diffuseColor.rgb+=vec3(.20,.18,.10)*c*causticMask*(1.-smoothstep(.035,.13,footprint));
    }`);
   s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    roughnessFactor=groundSample(uGroundRough,gp,weights).r;roughnessFactor=mix(roughnessFactor,.63,wet*.5);`);
   s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    vec3 detail=groundSample(uGroundNormal,gp,weights).xyz*2.-1.;
    float fade=1.-smoothstep(.12,.65,max(length(dFdx(gp)),length(dFdy(gp))));
    normal=normalize(normal+mat3(viewMatrix)*vec3(detail.x,0.,-detail.y)*.42*fade);`);
  };return mat;
 },[riverTerrain,uniforms]);
 useEffect(()=>()=>{material.dispose();textures.forEach(t=>t.dispose())},[material,textures]);
 return <primitive object={material} attach="material"/>;
}
