import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NODE_VISUAL_COLORS, type NodeVisualStatus } from './nodeVisual';

function NodeAlertMeshes({ tier, animate }: { tier: Exclude<NodeVisualStatus, 'normal'>; animate: boolean }) {
  const ringGeometry = useMemo(() => new THREE.RingGeometry(0.9, 1.25, 64), []);
  const beamGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.09, 0.24, 3.0, 12, 1, true),
    [],
  );
  const beaconGeometry = useMemo(() => new THREE.OctahedronGeometry(0.22, 0), []);
  const materials = useMemo(() => {
    const color = NODE_VISUAL_COLORS[tier];
    const make = (opacity: number) =>
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
    return {
      ringA: make(0),
      ringB: make(0),
      beam: make(0),
      beacon: make(0.82),
      staticRing: make(0.16),
    };
  }, [tier]);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const beacon = useRef<THREE.Mesh>(null);

  useEffect(
    () => () => {
      ringGeometry.dispose();
      beamGeometry.dispose();
      beaconGeometry.dispose();
      Object.values(materials).forEach((material) => material.dispose());
    },
    [ringGeometry, beamGeometry, beaconGeometry, materials],
  );

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    if (tier === 'abnormal') {
      const updateRing = (mesh: THREE.Mesh | null, material: THREE.MeshBasicMaterial, offset: number) => {
        if (!mesh) return;
        const phase = animate ? (time * 0.42 + offset) % 1 : 0.28 + offset * 0.4;
        mesh.scale.setScalar(1 + phase * 3.0);
        material.opacity = (1 - phase) * 0.5;
      };
      updateRing(ringA.current, materials.ringA, 0);
      updateRing(ringB.current, materials.ringB, 0.5);
      materials.beam.opacity = animate ? 0.24 + 0.08 * Math.sin(time * 2.2) : 0.28;
      materials.beacon.opacity = animate ? 0.72 + 0.2 * Math.sin(time * 2.6) : 0.82;
      if (beacon.current) beacon.current.scale.setScalar(animate ? 0.92 + 0.12 * Math.sin(time * 2.6) : 1);
    } else if (tier === 'watch' || tier === 'recovery') {
      const pulse = animate ? 0.5 + 0.5 * Math.sin(time * 1.6) : 0.5;
      if (ringA.current) ringA.current.scale.setScalar(1 + pulse * 0.1);
      materials.ringA.opacity = 0.16 + pulse * 0.14;
    }
  });

  if (tier === 'abnormal') {
    return (
      <group name="node-alert-effects">
        <mesh
          ref={ringA}
          rotation-x={-Math.PI / 2}
          position={[0, 0.12, 0]}
          geometry={ringGeometry}
          material={materials.ringA}
          name="alert-ring-0"
        />
        <mesh
          ref={ringB}
          rotation-x={-Math.PI / 2}
          position={[0, 0.12, 0]}
          geometry={ringGeometry}
          material={materials.ringB}
          name="alert-ring-1"
        />
        <mesh
          position={[0, 1.5, 0]}
          geometry={beamGeometry}
          material={materials.beam}
          name="alert-beam"
        />
        <mesh
          ref={beacon}
          position={[0, 5.8, 0]}
          geometry={beaconGeometry}
          material={materials.beacon}
          name="alert-beacon"
        />
      </group>
    );
  }

  return (
    <group name="node-alert-effects">
      <mesh
        ref={ringA}
        rotation-x={-Math.PI / 2}
        position={[0, 0.12, 0]}
        geometry={ringGeometry}
        material={tier === 'offline' ? materials.staticRing : materials.ringA}
        name="alert-ring-0"
      />
    </group>
  );
}

export default function NodeAlertEffects({
  tier,
  animate,
}: {
  tier: NodeVisualStatus;
  animate: boolean;
}) {
  if (tier === 'normal') return null;
  return <NodeAlertMeshes tier={tier} animate={animate} />;
}
