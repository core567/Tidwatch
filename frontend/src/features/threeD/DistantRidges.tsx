import {useEffect,useMemo} from 'react';
import {buildRidge} from './ridgeGeometry';
import {useSceneSettings} from './sceneSettings';
export default function DistantRidges(){const low=useSceneSettings(s=>s.quality==='low'),ridges=useMemo(()=>[0,1,2].map(i=>buildRidge(i,low)),[low]);useEffect(()=>()=>ridges.forEach(g=>g.dispose()),[ridges]);return <group name="distant-ridges">{ridges.map((g,i)=><mesh key={i} geometry={g}><meshStandardMaterial vertexColors roughness={1}/></mesh>)}</group>}
