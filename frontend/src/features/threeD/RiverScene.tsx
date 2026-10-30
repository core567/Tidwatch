import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import RiverCorridor from './RiverCorridor';
import Infrastructure from './Infrastructure';
import Ecology from './Ecology';
import SkyDome from './SkyDome';
import DistantRidges from './DistantRidges';
import Meadow from './Meadow';
import BedGravel from './BedGravel';
import ForestBelt from './ForestBelt';
import SceneFinish from './SceneFinish';
import SkyEnvironment from './SkyEnvironment';
import { useSceneSettings, QUALITY_SETTINGS } from './sceneSettings';
import { sceneObstacleHeight } from './landscapeLayout';
import MonitorNode from './MonitorNode';
import CameraRig from './CameraRig';
import { NODE_ANCHORS, OVERVIEW_CAMERA } from './riverGeometry';
import { useCameraStore, type View3d } from './cameraStore';
import WebGLErrorBoundary from './WebGLErrorBoundary';
import { BridgeCaption, InfoConnector } from './SceneAnnotations';
import type { InfluenceRange } from './sceneOverlays';
import type { Reach } from '@/types/contract';

export interface RiverSceneProps {
  reaches: Reach[];
  abnormalReachIds: string[];
  onSelectNode: (reachId: string) => void;
  selectedReachId?: string | null;
  onViewChange?: (view: View3d) => void;
  influenceRanges?: readonly InfluenceRange[];
  infoPanelSelector?: string;
}

function SceneGuard({ controls, onLost }: { controls: React.RefObject<OrbitControlsImpl | null>; onLost: () => void }) {
  const { gl, camera, scene } = useThree();
  const elapsed = useRef(0);
  const frames = useRef(0);
  const inspect = new URLSearchParams(window.location.search).has('inspect');
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => { event.preventDefault(); onLost(); };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.dataset.ready = 'true';
    if(inspect) (canvas as HTMLCanvasElement & {__pose?: (p:number[],t:number[])=>void}).__pose=(p,t)=>{
      const ctrl=controls.current;if(!ctrl)return;const damping=ctrl.enableDamping;ctrl.enableDamping=false;ctrl.update();camera.position.fromArray(p);ctrl.target.fromArray(t);camera.lookAt(ctrl.target);ctrl.update();ctrl.enableDamping=damping;
    };
    return () => { delete (canvas as HTMLCanvasElement & {__pose?:unknown}).__pose;canvas.removeEventListener('webglcontextlost', lost); document.body.style.cursor = 'auto'; };
  }, [gl, onLost]);
  useFrame((_, delta) => {
    const ctrl = controls.current;
    if (ctrl && !useCameraStore.getState().flying) {
      const x = THREE.MathUtils.clamp(ctrl.target.x, -36, 36);
      const z = THREE.MathUtils.clamp(ctrl.target.z, -22, 22);
      camera.position.x += x - ctrl.target.x;
      camera.position.z += z - ctrl.target.z;
      ctrl.target.set(x, THREE.MathUtils.clamp(ctrl.target.y, 0, 5), z);
      camera.position.y = Math.max(camera.position.y, sceneObstacleHeight(camera.position.x, camera.position.z) + 2.2);
    }
    if (!inspect) return;
    frames.current++;
    elapsed.current += delta;
    if (elapsed.current < 0.25) return;
    const terrain = scene.getObjectByName('terrain') as THREE.Mesh | undefined;
    const ds = gl.domElement.dataset;
    const waterMesh = scene.getObjectByName('river-water') as THREE.Mesh | undefined;
    ds.waterTriangles = String(waterMesh?.geometry.index?.count ? waterMesh.geometry.index.count / 3 : 0);
    ds.waterVertices = String(waterMesh?.geometry.getAttribute('position')?.count ?? 0);
    ds.quality = useSceneSettings.getState().quality;
    ds.motion = String(useSceneSettings.getState().motion);
    ds.shadows = String(gl.shadowMap.enabled);
    ds.renderDpr = String(gl.getPixelRatio());
    ds.controlsEnabled = String(ctrl?.enabled);
    ds.clearance = String(camera.position.y - sceneObstacleHeight(camera.position.x, camera.position.z));
    ds.nodes = JSON.stringify(NODE_ANCHORS.map(a => ({id: a.reachId, position: a.position.clone().add(new THREE.Vector3(0, 0.55, 0)).project(camera).toArray()})));
    ds.position = JSON.stringify(camera.position.toArray());
    ds.target = JSON.stringify(ctrl?.target.toArray());
    ds.flying = String(useCameraStore.getState().flying);
    ds.view = useCameraStore.getState().view;
    ds.terrain = terrain?.geometry.uuid ?? '';
    ds.geometryCount = String(gl.info.memory.geometries);
    ds.drawCalls = String(gl.info.render.calls);
    ds.triangles = String(gl.info.render.triangles);
    ds.textures = String(gl.info.memory.textures);
    ds.fps = String(Math.round(frames.current / elapsed.current));
    elapsed.current = 0; frames.current = 0;
  }, -2);
  return null;
}

function SceneContent({ reaches, abnormalReachIds, onSelectNode, selectedReachId, onViewChange, influenceRanges, infoPanelSelector }: RiverSceneProps) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const [lost, setLost] = useState(false);
  const quality = useSceneSettings(s => s.quality);
  const motion = useSceneSettings(s => s.motion);
  const shadows = useSceneSettings(s => s.shadows);
  const settings = QUALITY_SETTINGS[quality];
  const shadowEnabled = shadows && settings.shadowSize > 0;
  useEffect(() => {
    if (selectedReachId === undefined) return;
    const target = selectedReachId === null ? 'overview' : selectedReachId;
    if (target !== 'overview' && !NODE_ANCHORS.some(a => a.reachId === target)) return;
    if (useCameraStore.getState().view !== target) useCameraStore.getState().flyTo(target as View3d);
  }, [selectedReachId]);
  useEffect(() => useCameraStore.subscribe((state, previous) => {
    if (state.view !== previous.view) onViewChange?.(state.view);
  }), [onViewChange]);
  if (lost) return <div role="alert" className="scene-message">
    <h2>三维画面已暂停</h2><p>浏览器的图形上下文已丢失，请重新加载场景。</p>
    <button onClick={() => window.location.reload()}>重新加载</button>
  </div>;
  const select = (id: string) => {
    if (!NODE_ANCHORS.some(a => a.reachId === id)) return;
    useCameraStore.getState().flyTo(id as View3d);
    onSelectNode(id);
  };
  return <Canvas shadows={shadowEnabled} dpr={[1, settings.dpr]}
    fallback={<div role="alert" className="scene-message">当前浏览器无法创建 WebGL 三维环境。请使用开启硬件加速的 Chrome 或 Edge。</div>}
    camera={{position: OVERVIEW_CAMERA.position.toArray(), fov: OVERVIEW_CAMERA.fov, near: 0.1, far: 600}}
    onCreated={({gl, scene}) => {
      gl.setClearColor('#c8d8de');
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = 1.05; gl.shadowMap.type = THREE.PCFSoftShadowMap;
      scene.fog = new THREE.Fog('#c3d6e1', 100, 340);
    }}>
    <SkyDome /><SkyEnvironment /><DistantRidges /><Meadow /><BedGravel /><ForestBelt /><SceneFinish />
    <ambientLight intensity={0.08} color="#f0f3ea" />
    <hemisphereLight args={['#b9d6ea', '#6d7355', .65]} />
    <directionalLight position={[35,20,-30]} intensity={.2} color="#a9c4d6" />
    <directionalLight key={settings.shadowSize} position={[-36, 33, 34]} intensity={2.7} color="#ffd7ac" castShadow={shadowEnabled}
      shadow-mapSize-width={settings.shadowSize || 512} shadow-mapSize-height={settings.shadowSize || 512} shadow-radius={3} shadow-bias={-0.0002}
      shadow-normalBias={0.025} shadow-camera-left={-64} shadow-camera-right={64}
      shadow-camera-top={64} shadow-camera-bottom={-64} shadow-camera-far={220} />
    <RiverCorridor influenceRanges={influenceRanges} />
    <BridgeCaption />
    <InfoConnector panelSelector={infoPanelSelector} />
    <Infrastructure />
    <Ecology quality={quality} animate={motion} />
    {NODE_ANCHORS.map(anchor => <MonitorNode key={anchor.reachId} anchor={anchor}
      name={reaches.find(r => r.reachId === anchor.reachId)?.name}
      onlineStatus={reaches.find(r => r.reachId === anchor.reachId)?.onlineStatus ?? 'UNKNOWN'}
      abnormal={abnormalReachIds.includes(anchor.reachId)} onClick={select} />)}
    <OrbitControls ref={controlsRef} makeDefault target={OVERVIEW_CAMERA.target.toArray()}
      enableDamping dampingFactor={0.08} minDistance={7} maxDistance={85}
      minPolarAngle={0.22} maxPolarAngle={Math.PI / 2.5} />
    <CameraRig controls={controlsRef} />
    <SceneGuard controls={controlsRef} onLost={() => setLost(true)} />
  </Canvas>;
}

export default function RiverScene(props: RiverSceneProps) {
  return <WebGLErrorBoundary><SceneContent {...props} /></WebGLErrorBoundary>;
}





