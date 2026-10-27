import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  BANK_WIDTH,
  RIVER_CURVE,
  WATER_WIDTH,
  buildBankGeometry,
  buildWaterGeometry,
} from './riverGeometry';

/** 程序化水面纹理：细横纹 + 波光，低频流动动画仅作视觉示意。 */
function makeWaterTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#1d6a9e');
  grad.addColorStop(0.5, '#2278ad');
  grad.addColorStop(1, '#1a5f91');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 60; i++) {
    const y = (i / 60) * size + ((i * 37) % 11);
    ctx.strokeStyle = `rgba(210, 240, 255, ${0.035 + ((i * 13) % 7) * 0.008})`;
    ctx.lineWidth = 0.6 + ((i * 5) % 4) * 0.35;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 16) {
      ctx.lineTo(x, y + Math.sin((x / size) * Math.PI * 2 + i) * 2.6);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 28);
  tex.anisotropy = 4;
  return tex;
}

/**
 * 示意河廊：带横剖面起伏的水面 + 两岸起伏地形 + 流向箭头。
 * 地形与水面为视觉示意（确定性噪声），不代表真实高程或水动力。
 */
export default function RiverCorridor() {
  const waterGeo = useMemo(() => buildWaterGeometry(RIVER_CURVE, WATER_WIDTH, 160, 8), []);
  const bankLeft = useMemo(
    () => buildBankGeometry(RIVER_CURVE, WATER_WIDTH + 0.1, BANK_WIDTH, 1, 150, 12, 1.3),
    [],
  );
  const bankRight = useMemo(
    () => buildBankGeometry(RIVER_CURVE, WATER_WIDTH + 0.1, BANK_WIDTH, -1, 150, 12, 4.7),
    [],
  );
  const waterTex = useMemo(() => makeWaterTexture(), []);

  useEffect(() => {
    return () => {
      waterGeo.dispose();
      bankLeft.dispose();
      bankRight.dispose();
      waterTex.dispose();
    };
  }, [waterGeo, bankLeft, bankRight, waterTex]);

  const arrows = useMemo(() => {
    const pts: { pos: [number, number, number]; rotY: number }[] = [];
    for (const t of [0.2, 0.36, 0.52, 0.68, 0.84]) {
      const p = RIVER_CURVE.getPointAt(t);
      const tan = RIVER_CURVE.getTangentAt(t);
      pts.push({ pos: [p.x, 0.05, p.z], rotY: Math.atan2(tan.x, tan.z) });
    }
    return pts;
  }, []);

  useFrame((_, delta) => {
    waterTex.offset.y -= delta * 0.04;
  });

  return (
    <group>
      <mesh geometry={bankLeft} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.98} metalness={0} />
      </mesh>
      <mesh geometry={bankRight} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.98} metalness={0} />
      </mesh>

      <mesh geometry={waterGeo} receiveShadow>
        <meshStandardMaterial
          map={waterTex}
          color="#ffffff"
          roughness={0.26}
          metalness={0.12}
          transparent
          opacity={0.95}
        />
      </mesh>

      {/* 流向示意箭头（非真实流速/水动力） */}
      {arrows.map((a, i) => (
        <mesh key={i} position={a.pos} rotation={[0, a.rotY, 0]}>
          <coneGeometry args={[0.16, 0.55, 12]} />
          <meshBasicMaterial color="#b9e4ff" transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  );
}
