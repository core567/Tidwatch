import {useMemo,useEffect,useLayoutEffect,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {BufferGeometry,Float32BufferAttribute,InstancedMesh,Object3D,Color,DoubleSide,CanvasTexture,MeshStandardMaterial,SRGBColorSpace} from 'three';
import {meadowPoints} from './meadowLayout';
import {useSceneSettings} from './sceneSettings';
export default function Meadow(){
 const quality=useSceneSettings(s=>s.quality),motion=useSceneSettings(s=>s.motion),ref=useRef<InstancedMesh>(null!);
 const points=useMemo(()=>meadowPoints(9000),[]),count={low:0,medium:4500,high:9000}[quality];
 const assets=useMemo(()=>{
  const g=new BufferGeometry(),p:number[]=[],uv:number[]=[],n:number[]=[];
  for(let i=0;i<4;i++){
   const a=i*Math.PI/4,dx=Math.cos(a)*.48,dz=Math.sin(a)*.48;
   for(const [x,y] of [[-1,0],[1,0],[1,1],[-1,0],[1,1],[-1,1]]){p.push(x*dx+y*.12,y,x*dz);uv.push((x+1)/2,y);n.push(0,1,0)}
  }
  g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setAttribute('normal',new Float32BufferAttribute(n,3));
  const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d')!;
  for(let i=0;i<43;i++){
   const x=28+(i*113)%454,h=170+(i*71)%320,lean=Math.sin(i*3.7)*100;
   ctx.fillStyle=i%7===0?'#d7cca2':i%3===0?'#b5c28c':'#c1d29b';
   ctx.beginPath();ctx.moveTo(x-3,512);ctx.quadraticCurveTo(x+lean*.25,512-h*.55,x+lean,512-h);ctx.quadraticCurveTo(x+lean*.18+7,512-h*.45,x+4,512);ctx.fill();
   if(i%9===0){ctx.strokeStyle='#cabd88';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,512);ctx.lineTo(x+lean*.5,512-h);ctx.stroke();for(let k=0;k<7;k++){ctx.beginPath();ctx.ellipse(x+lean*.5+Math.sin(k)*4,512-h+k*6,2,5,-.5,0,Math.PI*2);ctx.fill()}}
  }
  const map=new CanvasTexture(c);map.colorSpace=SRGBColorSpace;map.anisotropy=8;
  const time={value:0};const m=new MeshStandardMaterial({map,alphaTest:.4,alphaToCoverage:true,side:DoubleSide,roughness:.95});
  m.onBeforeCompile=s=>{s.uniforms.uMeadowTime=time;s.vertexShader='uniform float uMeadowTime; varying float vMeadowDistance;\n'+s.vertexShader;
   s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    float phase=instanceMatrix[3].x*.73+instanceMatrix[3].z*.39;
    transformed.x+=sin(uMeadowTime*1.3+phase)*position.y*position.y*.07;
    vMeadowDistance=distance(cameraPosition,(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz);`);
   s.fragmentShader='varying float vMeadowDistance;\n'+s.fragmentShader;
   s.fragmentShader=s.fragmentShader.replace('#include <alphatest_fragment>',`diffuseColor.a*=1.-smoothstep(24.,52.,vMeadowDistance);\n#include <alphatest_fragment>`);
   s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal*=faceDirection;');
  };m.customProgramCacheKey=()=> 'grass-crosscards-v2';return {g,m,map,time};
 },[]);
 useLayoutEffect(()=>{const m=new Object3D();points.forEach((p,i)=>{m.position.set(p.x,p.y-.012,p.z);m.rotation.y=i*2.4;m.scale.set(p.scale*2.2,p.scale*1.3,p.scale*2.2);m.updateMatrix();ref.current.setMatrixAt(i,m.matrix);ref.current.setColorAt(i,new Color(i%7===0?'#a89a6f':'#91a16b'))});ref.current.instanceMatrix.needsUpdate=true;ref.current.instanceColor!.needsUpdate=true;ref.current.computeBoundingSphere()},[points]);
 useFrame((_,dt)=>{if(motion)assets.time.value+=Math.min(dt,.05)});
 useEffect(()=>()=>{assets.g.dispose();assets.m.dispose();assets.map.dispose()},[assets]);
 return <instancedMesh name="floodplain-meadow" ref={ref} args={[assets.g,assets.m,9000]} count={count} receiveShadow/>;
}
