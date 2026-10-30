import { BufferGeometry, Float32BufferAttribute } from 'three';
import { sampleRiverAtX } from './riverGeometry.ts';
import { SCENE_CONFIG } from './sceneConfig.ts';
import { WATER_DEMO_RANGE } from './waterLevelConfig.ts';
export { WATER_DEMO_RANGE, clampDemoWaterLevel } from './waterLevelConfig.ts';

/** Minimum level at which each vertex connects to the existing channel across the piecewise-linear bed. */
function connectionLevels(terrain: BufferGeometry): Float64Array {
  const p=terrain.getAttribute('position'),index=terrain.getIndex()!;
  const neighbors: number[][]=Array.from({length:p.count},()=>[]);
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);
    neighbors[a].push(b,c);neighbors[b].push(a,c);neighbors[c].push(a,b);
  }
  const levels=new Float64Array(p.count).fill(Infinity);
  const heap:{id:number;level:number}[]=[];
  const push=(id:number,level:number)=>{
    let i=heap.length;heap.push({id,level});
    while(i>0){const parent=(i-1)>>1;if(heap[parent].level<=level)break;heap[i]=heap[parent];i=parent}
    heap[i]={id,level};
  };
  const pop=()=>{
    const first=heap[0],last=heap.pop()!;
    if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].level<heap[child].level)child++;if(heap[child].level>=last.level)break;heap[i]=heap[child];i=child}heap[i]=last}
    return first;
  };
  for(let i=0;i<p.count;i++)if(p.getY(i)<=0){levels[i]=p.getY(i);push(i,levels[i])}
  while(heap.length){
    const {id,level}=pop();if(level!==levels[id])continue;
    for(const next of neighbors[id]){
      const candidate=Math.max(level,p.getY(next));
      if(candidate<=WATER_DEMO_RANGE.max+.00001 && candidate<levels[next]){levels[next]=candidate;push(next,candidate)}
    }
  }
  return levels;
}

/** Flatten actual bed triangles. Bed height clips the shoreline; flood level excludes isolated pockets. */
export function buildWaterSurface(terrain: BufferGeometry): BufferGeometry {
  const source=terrain.getAttribute('position'),sourceIndices=terrain.getIndex();
  if(!sourceIndices)throw new Error('Water surface requires indexed terrain');
  const connected=connectionLevels(terrain);
  const positions:number[]=[],bed:number[]=[],normals:number[]=[],uvs:number[]=[],flow:number[]=[],flood:number[]=[],indices:number[]=[];
  const remap=new Map<string,number>();
  const rowDirections=new Map<number,{x:number;z:number;left:number;width:number}>();
  const vertex=(id:number,floodLevel:number)=>{
    const key=id+':'+floodLevel,previous=remap.get(key);if(previous!==undefined)return previous;
    const x=source.getX(id),y=source.getY(id),z=source.getZ(id);
    let row=rowDirections.get(x);
    if(!row){const s=sampleRiverAtX(x),a=sampleRiverAtX(x-.25),b=sampleRiverAtX(x+.25);
      const dz=(b.leftBankZ+b.rightBankZ-a.leftBankZ-a.rightBankZ)/2,length=Math.hypot(.5,dz);
      row={x:.5/length,z:dz/length,left:s.leftBankZ,width:s.rightBankZ-s.leftBankZ};rowDirections.set(x,row)}
    const index=bed.length;positions.push(x,0,z);bed.push(y);normals.push(0,1,0);flood.push(floodLevel);
    uvs.push((z-row.left)/row.width,(x/SCENE_CONFIG.terrainExtent+.5)*60);flow.push(row.x,row.z);remap.set(key,index);return index;
  };
  for(let i=0;i<sourceIndices.count;i+=3){
    const a=sourceIndices.getX(i),b=sourceIndices.getX(i+1),c=sourceIndices.getX(i+2);
    const floodLevel=Math.max(WATER_DEMO_RANGE.min,Math.min(connected[a],connected[b],connected[c]));
    if(floodLevel<=WATER_DEMO_RANGE.max+.00001)indices.push(vertex(a,floodLevel),vertex(b,floodLevel),vertex(c,floodLevel));
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new Float32BufferAttribute(normals,3));
  geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));
  geometry.setAttribute('flowDirection',new Float32BufferAttribute(flow,2));
  geometry.setAttribute('bedHeight',new Float32BufferAttribute(bed,1));
  geometry.setAttribute('floodLevel',new Float32BufferAttribute(flood,1));
  geometry.setIndex(indices);geometry.computeBoundingBox();
  geometry.boundingBox!.min.y=WATER_DEMO_RANGE.min;geometry.boundingBox!.max.y=WATER_DEMO_RANGE.max;
  geometry.computeBoundingSphere();geometry.boundingSphere!.radius+=WATER_DEMO_RANGE.max;
  return geometry;
}
