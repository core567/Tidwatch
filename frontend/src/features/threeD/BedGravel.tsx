import {useMemo,useEffect,useLayoutEffect,useRef} from 'react';
import {InstancedMesh,IcosahedronGeometry,Object3D,Color} from 'three';
import {sampleTerrainHeight,sampleRiverAtX} from './riverGeometry';
import {useSceneSettings} from './sceneSettings';
export default function BedGravel(){
 const quality=useSceneSettings(s=>s.quality),ref=useRef<InstancedMesh>(null!);
 const stones=useMemo(()=>{const out=[];let seed=8819;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  for(let i=0;out.length<500&&i<15000;i++){const x=(rand()-.5)*95,s=sampleRiverAtX(x),side=rand()<.5?-1:1,z=(side<0?s.leftBankZ:s.rightBankZ)-side*(.08+rand()*.65),y=sampleTerrainHeight(x,z);if(y>-.018||y<-.4)continue;out.push({x,y,z,w:.055+rand()**2*.17,h:.026+rand()*.06})}return out},[]);
 const geometry=useMemo(()=>new IcosahedronGeometry(.5,1),[]);
 useLayoutEffect(()=>{const m=new Object3D();stones.forEach((s,i)=>{m.position.set(s.x,s.y+s.h*.1,s.z);m.scale.set(s.w,s.h,s.w*(.6+i%3*.15));m.rotation.set(i*.11,i*2.4,0);m.updateMatrix();ref.current.setMatrixAt(i,m.matrix);ref.current.setColorAt(i,new Color(['#a99b7a','#8b8b7a','#b7ad91','#777a6c'][i%4]))});ref.current.instanceMatrix.needsUpdate=true;ref.current.instanceColor!.needsUpdate=true;ref.current.computeBoundingSphere()},[stones]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <instancedMesh name="submerged-gravel" ref={ref} args={[geometry,undefined,500]} count={{low:0,medium:220,high:500}[quality]} receiveShadow><meshStandardMaterial roughness={.74}/></instancedMesh>;
}
