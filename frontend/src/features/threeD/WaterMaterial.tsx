import { useEffect, useMemo } from 'react';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { useFrame } from '@react-three/fiber';
import { Color, MeshStandardMaterial, Vector2, PlaneGeometry, Matrix4 } from 'three';
import { BRIDGE } from './landscapeLayout';
import { SCENE_CONFIG } from './sceneConfig';

export type WaterQuality = 'low' | 'medium' | 'high';
export interface WaterMaterialProps {
  quality?: WaterQuality;
  animate?: boolean;
  waterLevelUniform?: { value: number };
}
const waterFunctions = /* glsl */`
  uniform sampler2D uReflection; uniform float uHasReflection; varying vec4 vReflectionCoord;
  uniform vec2 uBridge; varying vec2 vWaterWorld;
  uniform float uWaterTime;
  uniform float uWaterLevel;
  uniform vec2 uRiverScale;
  uniform vec3 uDeepWater;
  uniform vec3 uShallowWater;
  uniform vec3 uSkyHorizon;
  uniform vec3 uSkyZenith;
  varying vec2 vRiverUv;
  varying vec3 vRiverFlow;
  varying float vBedHeight; varying float vFloodLevel;
  float waterHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec3 waterNoise(vec2 p) {
    vec2 cell = floor(p), f = fract(p);
    vec2 blend = f*f*f*(f*(f*6.0-15.0)+10.0);
    vec2 slope = 30.0*f*f*(f*(f-2.0)+1.0);
    float a=waterHash(cell), b=waterHash(cell+vec2(1.0,0.0));
    float c=waterHash(cell+vec2(0.0,1.0)), d=waterHash(cell+vec2(1.0,1.0));
    float k=a-b-c+d;
    return vec3(a+(b-a)*blend.x+(c-a)*blend.y+k*blend.x*blend.y,
      slope*(vec2(b-a,c-a)+k*blend.yx));
  }
  vec2 waterSlope(vec2 p, vec2 frequency, float amplitude, float angle) {
    float c=cos(angle),s=sin(angle);
    mat2 rotation=mat2(c,s,-s,c), inverseRotation=mat2(c,-s,s,c);
    vec2 samplePosition=(rotation*p)*frequency;
    float footprint=max(length(dFdx(samplePosition)),length(dFdy(samplePosition)));
    float resolved=1.0-smoothstep(0.3,1.1,footprint);
    return inverseRotation*(waterNoise(samplePosition).yz*frequency)*amplitude*resolved;
  }
`;

/** Wet/dry classification uses the same triangles as the river bed, including at nonzero demo levels. */
export default function WaterMaterial({quality='medium',animate=true,waterLevelUniform}:WaterMaterialProps) {
  const localLevel=useMemo(()=>({value:0}),[]);
  const level=waterLevelUniform??localLevel;
  const uniforms=useMemo(()=>({
    uBridge:{value:new Vector2(BRIDGE.x,BRIDGE.z)},uWaterTime:{value:0},uWaterLevel:level,
    uRiverScale:{value:new Vector2(SCENE_CONFIG.waterWidth,SCENE_CONFIG.terrainExtent/60)},
    uDeepWater:{value:new Color('#1d4a52')},uShallowWater:{value:new Color('#7fa58e')},
    uSkyHorizon:{value:new Color('#c8d8de')},uSkyZenith:{value:new Color('#5c8cb8')},
  }),[level]);
  const reflector=useMemo(()=>{const r=new Reflector(new PlaneGeometry(1,1),{textureWidth:512,textureHeight:512,clipBias:.003});r.rotation.x=-Math.PI/2;r.visible=false;return r},[]);
  const reflectionUniforms=useMemo(()=>({uReflection:{value:reflector.getRenderTarget().texture},uReflectionMatrix:{value:(reflector.material as any).uniforms.textureMatrix.value as Matrix4},uHasReflection:{value:0}}),[reflector]);
  useEffect(()=>()=>{reflector.geometry.dispose();reflector.dispose()},[reflector]);
  useFrame(({gl,scene,camera})=>{reflectionUniforms.uHasReflection.value=quality==='high'?1:0;if(quality!=='high')return;const water=scene.getObjectByName('river-water');if(!water)return;water.visible=false;reflector.position.y=level.value;reflector.updateMatrixWorld();try{(reflector.onBeforeRender as any)(gl,scene,camera)}finally{water.visible=true}});
  const material=useMemo(()=>{
    const result=new MeshStandardMaterial({color:'#ffffff',roughness:.17,metalness:0,transparent:true,depthWrite:false});
    result.name=`river-water-refine-${quality}`;
    result.defines={WATER_DETAIL:quality==='low'?0:quality==='medium'?1:2};
    result.customProgramCacheKey=()=>`tidewatch-water-refine222-v2-${quality}`;
    result.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms,reflectionUniforms);
      shader.vertexShader=shader.vertexShader
        .replace('#include <common>',`#include <common>
          uniform mat4 uReflectionMatrix; varying vec4 vReflectionCoord;
          varying vec2 vWaterWorld; attribute vec2 flowDirection; attribute float bedHeight; attribute float floodLevel;
          uniform float uWaterLevel;
          varying vec2 vRiverUv; varying vec3 vRiverFlow; varying float vBedHeight; varying float vFloodLevel;`)
        .replace('#include <begin_vertex>',`#include <begin_vertex>
          transformed.y=uWaterLevel;vWaterWorld=transformed.xz; vReflectionCoord=uReflectionMatrix*vec4(transformed,1.);
          vBedHeight=bedHeight;vFloodLevel=floodLevel;vRiverUv=uv;
          vRiverFlow=normalize(mat3(modelMatrix)*vec3(flowDirection.x,0.0,flowDirection.y));`);
      shader.fragmentShader=shader.fragmentShader
        .replace('#include <common>',`#include <common>\n${waterFunctions}`)
        .replace('#include <color_fragment>',`#include <color_fragment>
          if(vBedHeight>uWaterLevel || vFloodLevel>uWaterLevel+.0000001)discard;
          float waterDepth=max(0.0,uWaterLevel-vBedHeight);
          vec2 riverPosition=vec2(vRiverUv.x-.5,vRiverUv.y)*uRiverScale;
          float bedPatch=waterNoise(riverPosition*vec2(.31,.12)+vec2(19.4,-7.8)).x;
          float depthTone=1.0-exp(-waterDepth*(2.5+bedPatch*.6));
          diffuseColor.rgb=mix(uShallowWater,uDeepWater,depthTone);
          diffuseColor.rgb*=.97+bedPatch*.06;
          diffuseColor.a=mix(.65,.95,depthTone);
          float foam=(1.-smoothstep(.005,.045,waterDepth))*smoothstep(.4,.8,bedPatch)*.32;
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.82,.86,.78),foam);`)
        .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
          roughnessFactor=mix(.28,.22,depthTone);
          #if WATER_DETAIL==0
            roughnessFactor+=.04;
          #endif`)
        .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
          float currentSpeed=mix(.25,.42,smoothstep(.0,.6,waterDepth));
          vec2 current=riverPosition-vec2(0.0,uWaterTime*currentSpeed);
          vec2 warp=vec2(waterNoise(current*.37+13.7).x,waterNoise(current*.31-8.4).x)-.5;
          vec2 rippleSlope=waterSlope(current+warp*.45,vec2(2.1,.8),.009,.13);
          rippleSlope+=waterSlope(current+vec2(12.3,-5.4),vec2(5.2,2.1),.003,-.43);
          #if WATER_DETAIL>0
            rippleSlope+=waterSlope(current+vec2(-8.7,3.2)+vec2(0.0,uWaterTime*.025),vec2(8.0,6.7),.0010,1.12);
          #endif
          #if WATER_DETAIL>1
            rippleSlope+=waterSlope(current+vec2(23.1,15.6),vec2(15.7,12.9),.0006,-.39);
          #endif
          #if WATER_DETAIL>0
            vec2 pierDelta=vWaterWorld-uBridge;float pierZ=min(abs(pierDelta.y-1.9),abs(pierDelta.y+1.9));
            float wake=exp(-abs(pierDelta.x)*1.3-pierZ*2.5)*sin(length(vec2(pierDelta.x,pierZ))*13.-uWaterTime*2.);
            rippleSlope+=vec2(wake*.008,wake*.004);
          #endif
          rippleSlope*=smoothstep(.002,.10,waterDepth);
          vec3 flow=normalize(vRiverFlow),across=normalize(cross(flow,vec3(0.0,1.0,0.0)));
          vec3 worldRippleNormal=normalize(vec3(0.0,1.0,0.0)-across*rippleSlope.x-flow*rippleSlope.y);
          normal=normalize(mat3(viewMatrix)*worldRippleNormal);`)
        .replace('#include <lights_physical_fragment>',`#include <lights_physical_fragment>
          material.specularColor=vec3(.0204);`)
        .replace('#include <opaque_fragment>',`
          vec3 reflectedDirection=inverseTransformDirection(reflect(-normalize(vViewPosition),normal),viewMatrix);
          float skyHeight=smoothstep(0.0,.85,reflectedDirection.y);
          vec3 reflectedSky=mix(uSkyHorizon,uSkyZenith,skyHeight);
          float viewCosine=max(dot(normal,normalize(vViewPosition)),0.0);
          float waterFresnel=.0204+.9796*pow(1.0-viewCosine,5.0);
          if(uHasReflection>.5){vec2 uv=vReflectionCoord.xy/vReflectionCoord.w+rippleSlope*.012;vec3 mirror=texture2D(uReflection,uv).rgb;mirror+=texture2D(uReflection,uv+vec2(.002,0)).rgb;mirror+=texture2D(uReflection,uv-vec2(.002,0)).rgb;reflectedSky=mix(reflectedSky,mirror/3.,.65);}
          float glint=pow(max(dot(reflectedDirection,normalize(vec3(-36.,33.,34.))),0.),240.);
          outgoingLight=outgoingLight*(1.0-waterFresnel)+reflectedSky*waterFresnel*.8+vec3(1.,.76,.43)*glint*.22;
          #include <opaque_fragment>`);
    };
    return result;
  },[quality,uniforms,reflectionUniforms]);
  useFrame((_,delta)=>{if(animate)uniforms.uWaterTime.value+=Math.min(delta,.05)});
  useEffect(()=>()=>material.dispose(),[material]);
  return <primitive object={material} attach="material"/>;
}
