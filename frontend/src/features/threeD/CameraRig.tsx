import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { viewFor } from './stationViews';
import { useCameraStore } from './cameraStore';

const FLY_DURATION = 1.15;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * 监听 view 变化，在当前位姿与目标位姿间平滑插值。
 * 飞行期间禁用 OrbitControls，结束后交还控制权（target 已同步）。
 */
export default function CameraRig({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const view = useCameraStore((s) => s.view);
  const setFlying = useCameraStore((s) => s.setFlying);

  const anim = useRef<{
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    elapsed: number;
  } | null>(null);

  useEffect(() => {
    const targetView = viewFor(view);
    const ctrl = controls.current;
    const fromTarget = ctrl ? ctrl.target.clone() : new THREE.Vector3(0, 0, 0);
    anim.current = {
      fromPos: camera.position.clone(),
      toPos: targetView.position.clone(),
      fromTarget,
      toTarget: targetView.target.clone(),
      elapsed: 0,
    };
    if (ctrl) ctrl.enabled = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useFrame((_, delta) => {
    const a = anim.current;
    const ctrl = controls.current;
    if (!a || !ctrl) return;
    a.elapsed += Math.min(delta, 0.05);
    const t = Math.min(1, a.elapsed / FLY_DURATION);
    const k = easeInOutCubic(t);
    camera.position.lerpVectors(a.fromPos, a.toPos, k);
    ctrl.target.lerpVectors(a.fromTarget, a.toTarget, k);
    ctrl.update();
    if (t >= 1) {
      anim.current = null;
      ctrl.enabled = true;
      setFlying(false);
    }
  });

  return null;
}
