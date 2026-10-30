import {sampleSurfaceContext,NODE_ANCHORS} from './riverGeometry.ts';
import {infrastructureExcluded} from './landscapeLayout.ts';
export function meadowPoints(count=4500){const out:{x:number;y:number;z:number;scale:number}[]=[];let seed=74567;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};for(let i=0;i<180000&&out.length<count;i++){const x=(rand()-.5)*150,z=(rand()-.5)*100,s=sampleSurfaceContext(x,z);if(s.bankDistance<1.3||s.slope>.38||infrastructureExcluded(x,z,.35)||NODE_ANCHORS.some(a=>Math.hypot(x-a.position.x,z-a.position.z)<4))continue;if(rand()>(.5+.35*Math.sin(x*.24+Math.sin(z*.1))*Math.sin(z*.17)))continue;out.push({x,y:s.height,z,scale:.13+rand()*.2})}return out}

