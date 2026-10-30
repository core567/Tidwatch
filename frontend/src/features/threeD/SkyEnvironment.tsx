import {useEffect} from 'react';
import {useThree} from '@react-three/fiber';
import {Scene,SphereGeometry,Mesh,MeshBasicMaterial,BackSide,Color,CanvasTexture,SRGBColorSpace,PMREMGenerator} from 'three';
/** Local sky irradiance; no HDR download and no indoor light-box reflections. */
export default function SkyEnvironment(){
 const {gl,scene}=useThree();
 useEffect(()=>{
  const c=document.createElement('canvas');c.width=256;c.height=128;const ctx=c.getContext('2d')!;
  const g=ctx.createLinearGradient(0,0,0,128);g.addColorStop(0,'#78a1ce');g.addColorStop(.45,'#cfdfeb');g.addColorStop(.55,'#a0aa84');g.addColorStop(1,'#5a6648');ctx.fillStyle=g;ctx.fillRect(0,0,256,128);
  const map=new CanvasTexture(c);map.colorSpace=SRGBColorSpace;
  const geometry=new SphereGeometry(80,32,16),material=new MeshBasicMaterial({map,side:BackSide});const environment=new Scene();environment.add(new Mesh(geometry,material));environment.background=new Color('#b9d6ea');
  const generator=new PMREMGenerator(gl),target=generator.fromScene(environment,.04,.1,100);const previous=scene.environment;
  scene.environment=target.texture;scene.environmentIntensity=.38;
  return()=>{scene.environment=previous;target.dispose();generator.dispose();geometry.dispose();material.dispose();map.dispose()};
 },[gl,scene]);return null;
}
