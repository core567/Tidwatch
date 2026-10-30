import { useEffect, useMemo } from 'react';
import TerrainMaterial from './TerrainMaterial';
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BRIDGE, BUILDING, BUILDING_BASE, ROAD_HALF_WIDTH, ROAD_PROFILE_OFFSETS, roadPoint, roadShoulderPoint } from './landscapeLayout';
import { sampleTerrainHeight, sampleSurfaceContext } from './riverGeometry';

type Surface = 'masonry' | 'metal' | 'road' | 'earthwork';
export function createInfrastructure(onlyBuilding=false) {
  const parts: Record<Surface, BufferGeometry[]> = { masonry: [], metal: [], road: [], earthwork: [] };
  const add = (geometry: BufferGeometry, color: string, surface: Surface) => {
    if (!geometry.getAttribute('color')) {
      const c = new Color(color), count = geometry.getAttribute('position').count, colors = [];
      for (let i = 0; i < count; i++) colors.push(c.r, c.g, c.b);
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    }
    geometry.deleteAttribute('uv'); parts[surface].push(geometry);
  };
  const box = (x:number,y:number,z:number,w:number,h:number,d:number,color:string,surface:Surface='masonry',yaw=0) =>
    add(new BoxGeometry(w,h,d).rotateY(yaw).translate(x,y,z),color,surface);
  if(!onlyBuilding){
  const b=BRIDGE;
  // Existing load path and crossing stay fixed; fine pieces share the four material batches.
  box(b.x,b.deckY-.17,b.z,b.width+.22,.34,b.halfSpan*2,'#b4b8ad');
  box(b.x,b.deckY+.008,b.z,b.width,.02,b.halfSpan*2,'#626c6d','road');
  for(const side of [-1,1]) {
    box(b.x+side*(b.width/2+.04),b.deckY+.06,b.z,.14,.15,b.halfSpan*2,'#c9ccbf');
    box(b.x+side*(b.width/2+.10),b.deckY-.12,b.z,.035,.13,b.halfSpan*2,'#8c9792');
    for(const height of [.3,.6]) box(b.x+side*(b.width/2+.04),b.deckY+height,b.z,.045,.045,b.halfSpan*2,'#6b7e81','metal');
    for(let z=-b.halfSpan+.1;z<=b.halfSpan;z+=.75)
      box(b.x+side*(b.width/2+.04),b.deckY+.32,b.z+z,.055,.63,.055,'#738588','metal');
    box(b.x+side*.51,b.deckY-.36,b.z,.17,.18,b.halfSpan*2,'#8e9991');
    // Low curb slots suggest drainage without adding another visual layer above the rail.
    for(let z=-b.halfSpan+.65;z<b.halfSpan-.4;z+=1.5)
      box(b.x+side*(b.width/2-.025),b.deckY+.045,b.z+z,.018,.035,.12,'#526467','metal');
  }
  for(const offset of [-b.halfSpan+.3,-1.9,1.9,b.halfSpan-.3]) {
    const ground=sampleTerrainHeight(b.x,b.z+offset),height=b.deckY-.36-ground;
    add(new CylinderGeometry(.25,.33,height,12).translate(b.x,ground+height/2,b.z+offset),'#b6b8ac','masonry');
    box(b.x,b.deckY-.31,b.z+offset,b.width-.1,.22,.62,'#b2b8ae');
    box(b.x,ground+.04,b.z+offset,.9,.22,.9,'#a2a99b');
  }
  for(const sign of [-1,1]) box(b.x,b.deckY+.022,b.z+sign*(b.halfSpan-.12),b.width,.005,.028,'#4e6062','road');
  for(let z=-b.halfSpan+.3;z<b.halfSpan-.2;z+=1.4) box(b.x,b.deckY+.025,b.z+z,.045,.008,.6,'#d7d8cc','road');
  // Road and earthwork use every profile knot, including the exact deck endpoints.
  const shoulderGrass=new Color('#697f63'),shoulderWood=new Color('#40594a'),shoulderSoil=new Color('#8a8270');
  for(const sign of [-1,1]) {
    const positions:number[]=[],indices:number[]=[],shoulderPositions:number[]=[],shoulderIndices:number[]=[],shoulderColors:number[]=[];
    const offsets=ROAD_PROFILE_OFFSETS.filter(offset=>sign*offset>=b.halfSpan).sort((a,c)=>sign*(a-c));
    const shoulderCols=8,stride=shoulderCols*2,color=new Color();
    for(let i=0;i<offsets.length;i++) {
      const offset=offsets[i],p=roadPoint(offset);
      positions.push(p.x-ROAD_HALF_WIDTH,p.y+.018,p.z,p.x+ROAD_HALF_WIDTH,p.y+.018,p.z);
      for(const side of [-1,1]) for(let j=0;j<shoulderCols;j++) {
        const fraction=j/(shoulderCols-1),q=roadShoulderPoint(offset,side,fraction);
        shoulderPositions.push(q.x,q.y,q.z);
        const woodland=sampleSurfaceContext(q.x,q.z).woodland;
        const patch=.5+.5*Math.sin(q.x*.11+Math.sin(q.z*.17))*Math.cos(q.z*.085-.7);
        color.copy(shoulderGrass).lerp(shoulderWood,woodland*.79).lerp(shoulderSoil,patch*.26);
        // Gravel next to the asphalt blends toward the same muted grass palette at the toe.
        color.lerp(shoulderSoil,Math.pow(1-fraction,3)*.72).multiplyScalar(.93+patch*.08);
        shoulderColors.push(color.r,color.g,color.b);
      }
      if(i<offsets.length-1) {
        const a=i*2;
        if(sign>0) indices.push(a,a+2,a+1,a+1,a+2,a+3);
        else indices.push(a,a+1,a+2,a+1,a+3,a+2);
        for(let sideIndex=0;sideIndex<2;sideIndex++) for(let j=0;j<shoulderCols-1;j++) {
          const k=i*stride+sideIndex*shoulderCols+j,side=sideIndex*2-1;
          if(sign*side<0) shoulderIndices.push(k,k+1,k+stride,k+1,k+stride+1,k+stride);
          else shoulderIndices.push(k,k+stride,k+1,k+1,k+stride,k+stride+1);
        }
      }
      if(i%7===0&&i<offsets.length-2) {
        const before=roadPoint(offset-.15),after=roadPoint(offset+.15);
        box(p.x,p.y+.035,p.z,.035,.009,.5,'#d7d8cc','road',Math.atan2(after.x-before.x,after.z-before.z));
      }
    }
    const surface=new BufferGeometry();surface.setAttribute('position',new Float32BufferAttribute(positions,3));surface.setIndex(indices);surface.computeVertexNormals();add(surface,'#67716d','road');
    const shoulder=new BufferGeometry();shoulder.setAttribute('position',new Float32BufferAttribute(shoulderPositions,3));shoulder.setAttribute('color',new Float32BufferAttribute(shoulderColors,3));shoulder.setIndex(shoulderIndices);shoulder.computeVertexNormals();add(shoulder,'#697f63','earthwork');
  }
  }
  const h=BUILDING,y=BUILDING_BASE;
  box(h.x,y-.18,h.z,h.width+.3,.4,h.depth+.3,'#babbae');
  box(h.x,y+.62,h.z,h.width,1.24,h.depth,'#d2d1c4');
  box(h.x,y+1.31,h.z,h.width+.22,.15,h.depth+.26,'#526b70','metal');
  for(const side of [-1,1]) {
    box(h.x+side*(h.width/2+.08),y+1.35,h.z,.06,.08,h.depth+.25,'#7b8d8b','metal');
    box(h.x,y+1.35,h.z+side*(h.depth/2+.10),h.width+.22,.08,.06,'#7b8d8b','metal');
  }
  box(h.x+.75,y+1.61,h.z-.2,.7,.44,.55,'#b6c1b6');
  for(let i=0;i<5;i++) box(h.x+.75,y+1.48+i*.055,h.z+.081,.53,.018,.012,'#71827d','metal');
  for(const side of [-1,1]) for(const offset of [-.8,.7]) {
    const x=h.x+offset,z=h.z+side*(h.depth/2+.025);
    box(x,y+.76,z,.58,.46,.025,'#3f5e66','metal');
    for(const edge of [-1,1]) {
      box(x+edge*.30,y+.76,z+side*.017,.035,.51,.025,'#aab7b2','metal');
      box(x,y+.76+edge*.25,z+side*.017,.63,.035,.025,'#aab7b2','metal');
    }
    box(x,y+.76,z+side*.023,.022,.46,.025,'#9eaeaa','metal');
    box(x,y+.495,z+side*.045,.68,.04,.10,'#c0c4b8');
  }
  box(h.x-.25,y+.46,h.z+h.depth/2+.025,.43,.9,.035,'#365662','metal');
  box(h.x-.25,y+.12,h.z+h.depth/2+.047,.36,.15,.015,'#637b80','metal');
  box(h.x-.11,y+.47,h.z+h.depth/2+.058,.024,.12,.026,'#c2cbc4','metal');
  box(h.x-.25,y+1.02,h.z+h.depth/2+.16,.71,.07,.36,'#647d80','metal');
  box(h.x-.25,y+.04,h.z+h.depth/2+.3,.72,.12,.6,'#c0c1b1');
  add(new CylinderGeometry(.025,.025,1.18,8).translate(h.x+h.width/2-.07,y+.66,h.z+h.depth/2+.055),'#91a39d','metal');
  const result=Object.fromEntries(Object.entries(parts).map(([name,list])=>{
    const merged=list.length?mergeGeometries(list)!:new BufferGeometry();list.forEach(g=>g.dispose());merged.computeBoundingSphere();return[name,merged];
  })) as Record<Surface,BufferGeometry>;
  return result;
}

function createRoadMaterial() {
  const material=new MeshStandardMaterial({vertexColors:true,roughness:.96});
  material.customProgramCacheKey=()=> 'tidewatch-asphalt-grain-222';
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRoadWorld;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvRoadWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vRoadWorld;
      float roadGrain(vec2 p){return fract(sin(dot(floor(p),vec2(127.1,311.7)))*43758.5453);}`)
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec2 grainPosition=vRoadWorld.xz*19.0;
        float footprint=max(length(dFdx(grainPosition)),length(dFdy(grainPosition)));
        float grain=mix(roadGrain(grainPosition),.5,smoothstep(.3,1.0,footprint));
        diffuseColor.rgb*=.96+grain*.08;`);
  };
  return material;
}

export default function Infrastructure() {
 const geometry=useMemo(createInfrastructure,[]),roadMaterial=useMemo(createRoadMaterial,[]);
 useEffect(()=>()=>{Object.values(geometry).forEach(g=>g.dispose());roadMaterial.dispose()},[geometry,roadMaterial]);
 return <group name="schematic-infrastructure">
  <mesh geometry={geometry.masonry} receiveShadow castShadow><meshStandardMaterial vertexColors roughness={.88}/></mesh>
  <mesh geometry={geometry.metal} receiveShadow castShadow><meshStandardMaterial vertexColors roughness={.5} metalness={.35}/></mesh>
  <mesh name="road-earthwork" geometry={geometry.earthwork} receiveShadow><TerrainMaterial /></mesh>
  <mesh geometry={geometry.road} receiveShadow><primitive object={roadMaterial} attach="material"/></mesh>
 </group>;
}
