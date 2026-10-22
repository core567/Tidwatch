import { useMemo } from 'react';
import * as THREE from 'three';
import { buildRibbonGeometry, RIVER_CURVE, WATER_WIDTH, BANK_WIDTH } from './riverGeometry';

/**
 * 示意河廊：带状水面 + 两岸地形 + 流向箭头（示意动画，非水动力数据）。
 * 几何体只构建一次，组件常驻不销毁。
 */
export default function RiverCorridor() {
  const waterGeo = useMemo(
    () => buildRibbonGeometry(RIVER_CURVE, WATER_WIDTH, 0),
    [],
  );
  const bankGeo = useMemo(
    () => buildRibbonGeometry(RIVER_CURVE, BANK_WIDTH, -0.05),
    [],
  );

  const arrows = useMemo(() => {
    const pts: { pos: [number, number, number]; rotY: number }[] = [];
    for (const t of [0.25, 0.5, 0.75]) {
      const p = RIVER_CURVE.getPointAt(t);
      const tan = RIVER_CURVE.getTangentAt(t);
      pts.push({ pos: [p.x, 0.12, p.z], rotY: Math.atan2(tan.x, tan.z) });
    }
    return pts;
  }, []);

  return (
    <group>
      {/* 堤岸/地形 */}
      <mesh geometry={bankGeo} receiveShadow>
        <meshStandardMaterial color="#c9d8c2" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* 水面 */}
      <mesh geometry={waterGeo} position={[0, 0.02, 0]}>
        <meshStandardMaterial
          color="#1b5f8f"
          roughness={0.35}
          metalness={0.15}
          transparent
          opacity={0.92}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 流向示意箭头（明确标识为示意，不代表真实流速） */}
      {arrows.map((a, i) => (
        <mesh key={i} position={a.pos} rotation={[0, a.rotY, 0]}>
          <coneGeometry args={[0.35, 1.2, 16]} />
          <meshStandardMaterial color="#7fc4e8" emissive="#2a6f96" emissiveIntensity={0.35} />
        </mesh>
      ))}
    </group>
  );
}
