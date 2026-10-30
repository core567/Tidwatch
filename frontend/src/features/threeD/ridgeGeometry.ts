import {BufferGeometry,Float32BufferAttribute,Color} from 'three';
const hash=(x:number,z:number)=>{const h=Math.sin(x*127.1+z*311.7)*43758.5453;return h-Math.floor(h)};
function noise(x:number,z:number){const a=Math.floor(x),b=Math.floor(z);let u=x-a,v=z-b;u=u*u*(3-2*u);v=v*v*(3-2*v);return (hash(a,b)*(1-u)+hash(a+1,b)*u)*(1-v)+(hash(a,b+1)*(1-u)+hash(a+1,b+1)*u)*v}
function ridge(x:number,z:number){let sum=0,amp=.58,f=.036;for(let i=0;i<4;i++){const r=1-Math.abs(noise(x*f+19*i,z*f-13*i)*2-1);sum+=r*r*amp;f*=2.17;amp*=.49}return sum}
/** Warped ridge axes and different erosion phases break the old concentric sine-wave silhouette. */
export function buildRidge(layer:number,low=false){
 const p:number[]=[],c:number[]=[],idx:number[]=[];const rows=low?12:28,cols=low?96:480;
 const foot=new Color(['#586b45','#6a7e6b','#879eaa'][layer]);const rock=new Color(['#9b9981','#8d9a92','#a1b0b6'][layer]);
 for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
  const a=i/cols*Math.PI*2,t=j/rows,axis=120+layer*32;
  const warp=noise(Math.cos(a)*3.4+layer*8,Math.sin(a)*3.4)*14;
  const r=axis+t*(45+layer*3)+warp*Math.sin(t*Math.PI);
  const x=Math.cos(a)*r,z=Math.sin(a)*r;
  const wx=x+18*(noise(x*.019+layer*7,z*.021)-.5),wz=z+16*(noise(x*.023,z*.015+11)-.5);
  const crest=.36+noise(Math.cos(a)*4.1+layer*13,Math.sin(a)*4.1)*.26;
  const profile=t<crest?Math.pow(Math.sin(t/crest*Math.PI*.5),1.3):Math.pow(Math.sin((1-t)/(1-crest)*Math.PI*.5),2.1);
  const macro=.70+.30*noise(x*.022+layer*17,z*.018-layer*11);
  const ribs=ridge(wx+layer*53,wz-layer*37);
  const height=(18+layer*5)*macro*(.55+ribs*.62);
  const gully=Math.pow(1-Math.abs(noise(wx*.13,wz*.13)*2-1),7)*.9*Math.sin(t*Math.PI);
  const y=-3+Math.max(0,height*profile-gully);
  p.push(x,y,z);
  const exposed=Math.min(1,Math.max(0,(ribs-.65)*1.3+Math.pow(profile,2)*.35));
  const col=foot.clone().lerp(rock,exposed),strata=.94+Math.sin(y*2.2+noise(x*.09,z*.07)*4)*.03;
  col.multiplyScalar(strata*(.91+noise(x*.16,z*.16)*.18));c.push(col.r,col.g,col.b);
  if(i<cols&&j<rows){const n=j*(cols+1)+i;idx.push(n,n+1,n+cols+1,n+1,n+cols+2,n+cols+1)}
 }
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('color',new Float32BufferAttribute(c,3));g.setIndex(idx);g.computeVertexNormals();g.computeBoundingSphere();return g;
}
