import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { viewFor } from './stationViews.ts';
import { useCameraStore } from './cameraStore.ts';
import { createCameraFlight, easeInOutCubic } from './cameraPath.ts';
import { sceneObstacleHeight } from './landscapeLayout.ts';
import { useSceneSettings } from './sceneSettings';

const FLY_DURATION = 1.35;

/** 每次请求从当前位姿出发；飞行期间禁用操作，完成或卸载后交还控制权。 */
export default function CameraRig({ controls }: { controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const view = useCameraStore((s) => s.view);
  const requestId = useCameraStore((s) => s.requestId);
  const setFlying = useCameraStore((s) => s.setFlying);
  const anim = useRef<{
    path: ReturnType<typeof createCameraFlight>;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    elapsed: number;
  } | null>(null);
  const lookTarget = useRef(new THREE.Vector3());
  const activeControls = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    if (requestId === 0) return;
    const targetView = viewFor(view);
    const ctrl = controls.current;
    const fromPos = camera.position.clone();
    const fromTarget = ctrl ? ctrl.target.clone() : lookTarget.current.clone();
    if (ctrl) {
      activeControls.current = ctrl;
      ctrl.enabled = false;
      // 清掉用户旋转的剩余阻尼，防止飞行完成后继续漂移。
      const damping = ctrl.enableDamping;
      ctrl.enableDamping = false;
      ctrl.update();
      ctrl.enableDamping = damping;
      camera.position.copy(fromPos);
      ctrl.target.copy(fromTarget);
      camera.lookAt(fromTarget);
    }
    anim.current = {
      path: createCameraFlight(fromPos, targetView.position, sceneObstacleHeight),
      fromTarget,
      toTarget: targetView.target.clone(),
      elapsed: 0,
    };
    setFlying(true);
  }, [view, requestId, camera, controls, setFlying]);

  useEffect(() => () => {
    anim.current = null;
    const ctrl = activeControls.current ?? controls.current;
    if (ctrl) ctrl.enabled = true;
    setFlying(false);
  }, [controls, setFlying]);

  useFrame((_, delta) => {
    const a = anim.current;
    if (!a) return;
    const ctrl = controls.current;
    a.elapsed += delta;
    const t = useSceneSettings.getState().motion ? Math.min(1, a.elapsed / FLY_DURATION) : 1;
    camera.position.copy(a.path.positionAt(t));
    lookTarget.current.lerpVectors(a.fromTarget, a.toTarget, easeInOutCubic(t));
    if (ctrl) {
      activeControls.current = ctrl;
      ctrl.enabled = false;
      ctrl.target.copy(lookTarget.current);
    }
    camera.lookAt(lookTarget.current);
    if (t >= 1) {
      anim.current = null;
      if (ctrl) {
        ctrl.update();
        ctrl.enabled = true;
      }
      setFlying(false);
    }
  });

  return null;
}
