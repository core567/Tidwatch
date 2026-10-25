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
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.9, 40]} />
          <meshBasicMaterial color={abnormal ? '#d84c4c' : '#1e6fe0'} transparent opacity={0.12} />
        </mesh>
      )}

      {/* 混凝土基座台 */}
      <mesh position={[0, 0.12, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.52, 0.66, 0.24, 24]} />
        <meshStandardMaterial color="#c7d0d8" roughness={0.9} metalness={0.05} />
      </mesh>

      {/* 监测桩体 */}
      <mesh position={[0, 0.95, 0]} material={mat} castShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick(anchor.reachId);
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'default')}
      >
        <cylinderGeometry args={[selected ? 0.13 : 0.1, selected ? 0.17 : 0.13, 1.5, 20]} />
      </mesh>

      {/* 桩顶状态球 */}
      <mesh position={[0, 1.85, 0]} material={mat} castShadow>
        <sphereGeometry args={[abnormal ? 0.34 : 0.28, 24, 24]} />
      </mesh>
      {/* 状态球内芯高光 */}
      <mesh position={[0.09, 1.94, 0.09]}>
        <sphereGeometry args={[abnormal ? 0.1 : 0.085, 12, 12]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.55} />
      </mesh>

      {/* 地面脉冲环（异常扩散 / 选中呼吸） */}
      <mesh ref={ringRef} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} material={ringMat}>
        <ringGeometry args={[0.85, 1.25, 44]} />
      </mesh>

      {/* 仅异常时保留告警光柱 */}
      {abnormal && (
        <mesh position={[0, 3.3, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 3.0, 10]} />
          <meshBasicMaterial color={baseColor} transparent opacity={0.28} />
        </mesh>
      )}

      <Html position={[0, 2.55, 0]} center distanceFactor={17} zIndexRange={[20, 0]}>
        <div
          onClick={() => onClick(anchor.reachId)}
          style={{
            whiteSpace: 'nowrap',
            background: selected ? 'rgba(30,111,224,.96)' : 'rgba(255,255,255,.95)',
            color: selected ? '#fff' : '#183650',
            fontSize: 12,
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 7,
            border: `1px solid ${abnormal ? '#d84c4c' : 'rgba(37,99,166,.28)'}`,
            cursor: 'pointer',
            userSelect: 'none',
            boxShadow: '0 2px 10px rgba(8,31,56,.18)',
          }}
        >
          {anchor.name} · {abnormal ? '异常' : TEXT[onlineStatus] ?? '未知'}
        </div>
      </Html>
    </group>
  );
}
