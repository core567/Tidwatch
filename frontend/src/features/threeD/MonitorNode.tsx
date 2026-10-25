import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { NodeAnchor } from './riverGeometry';
import { useCameraStore } from './cameraStore';
import type { ReachOnlineStatus } from '@/types/contract';

const COLOR: Record<string, string> = {
  ONLINE: '#12a594',
  STALE: '#e8902a',
  OFFLINE: '#94a3b8',
};
const TEXT: Record<string, string> = {
  ONLINE: '在线',
  STALE: '陈旧',
  OFFLINE: '离线',
};

interface Props {
  anchor: NodeAnchor;
  onlineStatus: ReachOnlineStatus | 'UNKNOWN';
  abnormal: boolean; // 是否有活动异常事件
  onClick: (reachId: string) => void;
}

/** 监测桩：柱体 + 状态球 + 地面状态环（异常脉冲）+ 光柱 + 文字标签。 */
export default function MonitorNode({ anchor, onlineStatus, abnormal, onClick }: Props) {
  const selected = useCameraStore((s) => s.view === anchor.reachId);
  const ringRef = useRef<THREE.Mesh>(null);
  const baseColor = abnormal ? '#d84c4c' : COLOR[onlineStatus] ?? COLOR.OFFLINE;

  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: baseColor, emissive: baseColor, emissiveIntensity: abnormal ? 0.7 : 0.35 }),
    [baseColor],
  );
  const ringMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: abnormal ? 0.8 : 0.55,
        side: THREE.DoubleSide,
      }),
    [baseColor],
  );

  useFrame(({ clock }) => {
    if (!ringRef.current) return;
    if (abnormal) {
      const t = (clock.elapsedTime * 2.2) % 1;
      const s = 1 + t * 0.9;
      ringRef.current.scale.setScalar(s);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
    } else if (selected) {
      ringRef.current.scale.setScalar(1.25);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.7;
    } else {
      ringRef.current.scale.setScalar(1);
      (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.5;
    }
  });

  return (
    <group position={anchor.position}>
      {/* 选中/异常时的地面高亮盘 */}
      {(selected || abnormal) && (
        <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.7, 40]} />
          <meshBasicMaterial color={abnormal ? '#d84c4c' : '#1e6fe0'} transparent opacity={0.12} />
        </mesh>
      )}

      <mesh
        position={[0, 0.75, 0]}
        material={mat}
        castShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick(anchor.reachId);
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'default')}
      >
        <cylinderGeometry args={[selected ? 0.26 : 0.19, selected ? 0.34 : 0.26, 1.5, 20]} />
      </mesh>
      <mesh position={[0, 1.72, 0]} material={mat} castShadow>
        <sphereGeometry args={[abnormal ? 0.45 : 0.37, 22, 22]} />
      </mesh>

      <mesh ref={ringRef} position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
        <ringGeometry args={[0.72, 1.08, 40]} />
      </mesh>

      <mesh position={[0, 3.1, 0]}>
        <cylinderGeometry args={[abnormal ? 0.07 : 0.045, abnormal ? 0.07 : 0.045, 3.1, 10]} />
        <meshBasicMaterial color={baseColor} transparent opacity={abnormal ? 0.32 : 0.16} />
      </mesh>

      <Html position={[0, 2.7, 0]} center distanceFactor={17} zIndexRange={[20, 0]}>
        <div
          onClick={() => onClick(anchor.reachId)}
          style={{
            whiteSpace: 'nowrap',
            background: selected ? 'rgba(30,111,224,.95)' : 'rgba(11,42,74,.88)',
            color: '#fff',
            fontSize: 12,
            padding: '3px 9px',
            borderRadius: 6,
            border: `1px solid ${baseColor}`,
            cursor: 'pointer',
            userSelect: 'none',
            boxShadow: '0 2px 8px rgba(8,31,56,.25)',
          }}
        >
          {anchor.name} · {abnormal ? '异常' : TEXT[onlineStatus] ?? '未知'}
        </div>
      </Html>
    </group>
  );
}
