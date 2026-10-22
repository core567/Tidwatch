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
        gl.setClearColor('#dfeaf4');
        scene.fog = new THREE.Fog('#dfeaf4', 55, 110);
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <hemisphereLight args={['#cfe8ff', '#8a9a7a', 0.9]} />
      <directionalLight position={[12, 24, 10]} intensity={1.1} castShadow />

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

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]} receiveShadow>
        <planeGeometry args={[90, 60]} />
        <meshStandardMaterial color="#e7efe6" roughness={1} />
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
