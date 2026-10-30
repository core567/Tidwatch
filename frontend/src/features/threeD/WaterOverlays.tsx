import {useEffect,useMemo,useRef} from 'react';
import {useFrame} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import {BufferGeometry,Float32BufferAttribute,Group,DoubleSide} from 'three';
import {sampleRiverSection} from './riverGeometry';
import {normalizeInfluenceRanges,type InfluenceRange} from './sceneOverlays';
import {SCENE_STATUS_COLORS} from './scenePalette';
const EMPTY_RANGES:readonly InfluenceRange[]=[];
function rangeGeometry(range:InfluenceRange){
 const p:number[]=[],indices:number[]=[];const count=Math.max(4,Math.ceil((range.endT-range.startT)*180));
 for(let i=0;i<=count;i++){const s=sampleRiverSection(range.startT+(range.endT-range.startT)*i/count),center=(s.leftBankZ+s.rightBankZ)/2;for(const side of [-1,1])p.push(s.x,0,center+side*s.width*.35);if(i<count){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2)}}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setIndex(indices);g.computeBoundingSphere();return g;
}
function RangeOverlay({range}:{range:InfluenceRange}){
 const geometry=useMemo(()=>rangeGeometry(range),[range.startT,range.endT]);
 const middle=sampleRiverSection((range.startT+range.endT)/2);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 return <group><mesh geometry={geometry} renderOrder={2}><meshBasicMaterial color={SCENE_STATUS_COLORS.ABNORMAL} transparent opacity={.13} depthWrite={false} side={DoubleSide}/></mesh>
 <Html position={[middle.x,.45,(middle.leftBankZ+middle.rightBankZ)/2]} center zIndexRange={[12,0]}><span className="range-caption">{range.label||'关联范围'} · {range.source==='SIMULATED'?'模拟演示':'宿主提供'}</span></Html></group>;
}
export default function WaterOverlays({level,directions=false,ranges=EMPTY_RANGES}:{level:{value:number};directions?:boolean;ranges?:readonly InfluenceRange[]}){
 const group=useRef<Group>(null);
 const valid=useMemo(()=>normalizeInfluenceRanges(ranges),[ranges]);
 const arrows=useMemo(()=>{
  const points:number[]=[];for(const t of [.27,.58,.78]){const s=sampleRiverSection(t),z=(s.leftBankZ+s.rightBankZ)/2;
   const at=(along:number,across:number)=>[s.x+s.tangentX*along-s.tangentZ*across,0,z+s.tangentZ*along+s.tangentX*across];
   points.push(...at(-.85,0),...at(.65,0),...at(.65,0),...at(.12,.25),...at(.65,0),...at(.12,-.25));}
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(points,3));return g;
 },[]);
 useEffect(()=>()=>arrows.dispose(),[arrows]);
 useFrame(()=>{if(group.current)group.current.position.y=level.value+.018});
 return <group ref={group} name="water-annotations"><lineSegments geometry={arrows} visible={directions}><lineBasicMaterial color="#c8e6df" transparent opacity={.38} depthWrite={false}/></lineSegments>{valid.map(range=><RangeOverlay key={range.id} range={range}/>)}</group>;
}

