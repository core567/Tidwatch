import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import RiverCorridor from './RiverCorridor';
import MonitorNode from './MonitorNode';
import CameraRig from './CameraRig';
import { NODE_ANCHORS, OVERVIEW_CAMERA } from './riverGeometry';
import type { Reach } from '@/types/contract';

interface Props {
  reaches: Reach[];
  abnormalReachIds: string[];
  onSelectNode: (reachId: string) => void;
}

function statusOf(reaches: Reach[], reachId: string): Reach['onlineStatus'] | 'UNKNOWN' {
  return reaches.find((r) => r.reachId === reachId)?.onlineStatus ?? 'UNKNOWN';
}

/**
 * 单一持续 3D 场景。M2：节点点击/列表切换只改变相机位姿（CameraRig 平滑飞行），
 * Canvas 与河廊几何体常驻，不随选择销毁重建。
 */
export default function RiverScene({ reaches, abnormalReachIds, onSelectNode }: Props) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  return (
    <Canvas
      shadows
      dpr={[1, 1.8]}
      camera={{
        position: [OVERVIEW_CAMERA.position.x, OVERVIEW_CAMERA.position.y, OVERVIEW_CAMERA.position.z],
        fov: OVERVIEW_CAMERA.fov,
        near: 0.1,
        far: 200,
      }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor('#d7e4ee');
        scene.fog = new THREE.Fog('#d7e4ee', 44, 96);
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.55} color="#e8f2ff" />
      <hemisphereLight args={['#dcecff', '#7d8f74', 0.85]} />
      <directionalLight
        position={[-16, 26, 14]}
        intensity={1.35}
        color="#fff6e8"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />

      <RiverCorridor />
      {NODE_ANCHORS.map((anchor) => (
        <MonitorNode
          key={anchor.reachId}
          anchor={anchor}
          onlineStatus={statusOf(reaches, anchor.reachId)}
          abnormal={abnormalReachIds.includes(anchor.reachId)}
          onClick={onSelectNode}
        />
      ))}

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.35, 0]} receiveShadow>
        <planeGeometry args={[120, 90]} />
        <meshStandardMaterial color="#d9e3d4" roughness={1} />
      </mesh>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[OVERVIEW_CAMERA.target.x, OVERVIEW_CAMERA.target.y, OVERVIEW_CAMERA.target.z]}
        enableDamping
        dampingFactor={0.08}
        minDistance={8}
        maxDistance={70}
        maxPolarAngle={Math.PI / 2.15}
      />
      <CameraRig controls={controlsRef} />
    </Canvas>
  );
}
