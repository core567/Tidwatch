import {useEffect,useLayoutEffect,useMemo,useRef} from 'react';
import {InstancedMesh,Object3D,Color,DoubleSide,MeshStandardMaterial} from 'three';
import {sampleTerrainHeight} from './riverGeometry';
import {infrastructureExcluded} from './landscapeLayout';
import {treeGeometry,foliageAtlas} from './Ecology';
import {useSceneSettings} from './sceneSettings';
export default function ForestBelt(){
 const q=useSceneSettings(s=>s.quality),ref=useRef<InstancedMesh>(null!),trunk=useRef<InstancedMesh>(null!);
 const points=useMemo(()=>{const out=[];let seed=59137;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
  const groves=[[-58,-54,29,18],[7,-69,30,20],[69,-44,28,22],[-88,32,20,20],[83,48,24,22]];
  for(let i=0;out.length<280&&i<10000;i++){const g=groves[i%groves.length],a=rand()*6.28,r=Math.sqrt(rand()),x=g[0]+Math.cos(a)*r*g[2],z=g[1]+Math.sin(a)*r*g[3],w=2.4+rand()*3.8;
   if(infrastructureExcluded(x,z,w*.5))continue;out.push({x,z,y:sampleTerrainHeight(x,z),width:w,height:3.4+rand()*3.7})}return out},[]);
 const assets=useMemo(()=>{const geom=treeGeometry('deciduous',1,4),map=foliageAtlas();return {...geom,map,
  leaf:new MeshStandardMaterial({map,alphaTest:.42,alphaToCoverage:true,side:DoubleSide,vertexColors:true,roughness:1,emissive:'#344638',emissiveIntensity:.18}),
  bark:new MeshStandardMaterial({color:'#777462',roughness:1})}},[]);
 useEffect(()=>()=>{assets.crown.dispose();assets.trunk.dispose();assets.map.dispose();assets.leaf.dispose();assets.bark.dispose()},[assets]);
 useLayoutEffect(()=>{const m=new Object3D();points.forEach((p,i)=>{m.position.set(p.x,p.y,p.z);m.rotation.y=i*2.4;m.scale.set(p.width,p.height,p.width);m.updateMatrix();ref.current.setMatrixAt(i,m.matrix);trunk.current.setMatrixAt(i,m.matrix);ref.current.setColorAt(i,new Color(i%3===0?'#c6d0ae':i%3===1?'#d8dcba':'#b8c9a9'))});for(const mesh of [ref.current,trunk.current]){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere()}ref.current.instanceColor!.needsUpdate=true},[points]);
 const count=Math.min(points.length,{low:80,medium:180,high:280}[q]);
 return <group name="forest-groves"><instancedMesh ref={ref} args={[assets.crown,assets.leaf,280]} count={count}/><instancedMesh ref={trunk} args={[assets.trunk,assets.bark,280]} count={count}/></group>;
}
