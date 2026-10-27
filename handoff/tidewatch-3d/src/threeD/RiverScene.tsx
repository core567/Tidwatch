import { useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';
import RiverCorridor from './RiverCorridor';
import MonitorNode from './MonitorNode';
import CameraRig from './CameraRig';
import { NODE_ANCHORS, OVERVIEW_CAMERA, buildValleyGeometry } from './riverGeometry';
import type { Reach } from '../types/contract';

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
  const valleyGeo = useMemo(() => buildValleyGeometry(), []);

  useEffect(() => () => valleyGeo.dispose(), [valleyGeo]);

  return (
    <Canvas
      shadows
      dpr={[1, 1.8]}
      camera={{
        position: [OVERVIEW_CAMERA.position.x, OVERVIEW_CAMERA.position.y, OVERVIEW_CAMERA.position.z],
        fov: OVERVIEW_CAMERA.fov,
        near: 0.1,
        far: 260,
      }}
      onCreated={({ gl, scene }) => {
        gl.setClearColor('#dfe9f1');
        scene.fog = new THREE.Fog('#dfe9f1', 60, 150);
      }}
      style={{ width: '100%', height: '100%' }}
    >
      <ambientLight intensity={0.6} color="#eaf3ff" />
      <hemisphereLight args={['#dcecff', '#8aa07e', 0.9]} />
      <directionalLight
        position={[-18, 30, 16]}
        intensity={1.4}
        color="#fff7ec"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-46}
        shadow-camera-right={46}
        shadow-camera-top={46}
        shadow-camera-bottom={-46}
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

      {/* 缓起伏河谷谷地（确定性，视觉示意，非真实高程） */}
      <mesh geometry={valleyGeo} receiveShadow>
        <meshStandardMaterial vertexColors roughness={1} metalness={0} />
      </mesh>

      <OrbitControls
        ref={controlsRef}
        makeDefault
        target={[OVERVIEW_CAMERA.target.x, OVERVIEW_CAMERA.target.y, OVERVIEW_CAMERA.target.z]}
        enableDamping
        dampingFactor={0.08}
        minDistance={8}
        maxDistance={95}
        maxPolarAngle={Math.PI / 2.15}
      />
      <CameraRig controls={controlsRef} />
    </Canvas>
  );
}
