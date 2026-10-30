import {useMemo,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import {NODE_ANCHORS} from './riverGeometry';
import {BRIDGE} from './landscapeLayout';
import {useCameraStore} from './cameraStore';

/** Optional DOM connection; the host explicitly opts in by providing its information-panel selector. */
export function InfoConnector({panelSelector}:{panelSelector?:string}){
 const path=useRef<SVGPathElement>(null),elapsed=useRef(0);
 const {camera,gl,size}=useThree();
 const point=useMemo(()=>NODE_ANCHORS[0].position.clone(),[]);
 useFrame((_,delta)=>{
  elapsed.current+=delta;if(elapsed.current<.05||!path.current)return;elapsed.current=0;
  const state=useCameraStore.getState(),anchor=NODE_ANCHORS.find(a=>a.reachId===state.view);
  let panel: HTMLElement | null = null;
  try { panel=panelSelector?document.querySelector<HTMLElement>(panelSelector):null; } catch { path.current.setAttribute('d',''); return; }
  if(!anchor||!panel||state.flying||size.width<680){path.current.setAttribute('d','');return}
  point.copy(anchor.position);point.y+=1.35;point.project(camera);
  if(point.z>1||Math.abs(point.x)>1||Math.abs(point.y)>1){path.current.setAttribute('d','');return}
  const canvas=gl.domElement.getBoundingClientRect(),r=panel.getBoundingClientRect();
  const x=(point.x+1)*size.width/2,y=(1-point.y)*size.height/2,endX=r.left-canvas.left,endY=r.top-canvas.top+43;
  path.current.setAttribute('d',`M${x},${y} L${x+18},${y-20} L${endX-18},${endY} L${endX},${endY}`);
 });
 if(!panelSelector)return null;
 return <Html fullscreen calculatePosition={() => [size.width / 2, size.height / 2]} zIndexRange={[22,22]} style={{pointerEvents:'none'}}><svg className="info-connector" width={size.width} height={size.height} aria-hidden="true"><path ref={path} fill="none" stroke="#b0cddd" strokeWidth="1" opacity=".55"/></svg></Html>;
}
export function BridgeCaption(){
 const view=useCameraStore(s=>s.view);
 return <Html position={[BRIDGE.x+.85,BRIDGE.deckY+.8,BRIDGE.z]} center zIndexRange={[10,0]} style={{pointerEvents:'none',display:view==='overview'?'block':'none'}}><span className="bridge-caption">跨河桥 · 示意</span></Html>;
}

