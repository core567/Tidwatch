import {useEffect} from 'react';
import {useThree} from '@react-three/fiber';
import {Html} from '@react-three/drei';
import {useSceneSettings} from './sceneSettings';
/** Display grading only: no extra scene render, and DOM status labels retain their exact palette. */
export default function SceneFinish(){const quality=useSceneSettings(s=>s.quality),{gl,size}=useThree();useEffect(()=>{gl.domElement.style.filter=quality==='high'?'contrast(1.04) saturate(1.025)':'none';return()=>{gl.domElement.style.filter=''}},[quality,gl]);if(quality!=='high')return null;return <Html fullscreen calculatePosition={()=>[size.width/2,size.height/2]} zIndexRange={[1,1]} style={{pointerEvents:'none'}}><div aria-hidden="true" style={{width:size.width,height:size.height,background:'radial-gradient(ellipse at center, transparent 45%, rgba(12,24,32,.09) 100%)',pointerEvents:'none'}}/></Html>}
