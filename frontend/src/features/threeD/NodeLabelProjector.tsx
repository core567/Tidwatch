import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { NODE_ANCHORS } from './riverGeometry';
import { sceneObstacleHeight } from './landscapeLayout';
import {
  clearNodeLabelFrames,
  labelScaleForDistance,
  nodeLabelFrames,
  resolveLabelLod,
} from './nodeLabelProjection';

const LABEL_OFFSET_Y = 4.2;
const OCCLUSION_INTERVAL = 0.12;
const OCCLUSION_SAMPLES = 14;

function terrainOccluded(cameraPosition: THREE.Vector3, target: THREE.Vector3): boolean {
  for (let index = 1; index <= OCCLUSION_SAMPLES; index += 1) {
    const t = (index / OCCLUSION_SAMPLES) * 0.86;
    const x = cameraPosition.x + (target.x - cameraPosition.x) * t;
    const y = cameraPosition.y + (target.y - cameraPosition.y) * t;
    const z = cameraPosition.z + (target.z - cameraPosition.z) * t;
    if (y < sceneObstacleHeight(x, z) - 0.08) return true;
  }
  return false;
}

/**
 * Canvas 内的轻量投影器：只计算屏幕坐标、距离、LOD 和遮挡状态，
 * 写入模块级帧缓存，由 DOM Overlay 读取并更新标签，不触发 React 每帧渲染。
 */
export default function NodeLabelProjector() {
  const { camera, size, gl } = useThree();
  const occluded = useRef<Record<string, boolean>>({});
  const lastCheck = useRef(-1);
  const lastCamera = useRef(new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0));
  const lastDebug = useRef(-1);
  const work = useMemo(() => new THREE.Vector3(), []);
  const cameraSpace = useMemo(() => new THREE.Vector3(), []);
  const projected = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => () => clearNodeLabelFrames(), []);

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;
    const checkNow = now - lastCheck.current > OCCLUSION_INTERVAL
      || camera.position.distanceTo(lastCamera.current) > 0.05;
    if (checkNow) {
      lastCheck.current = now;
      lastCamera.current.copy(camera.position);
    }

    for (const anchor of NODE_ANCHORS) {
      work.copy(anchor.position);
      work.y += LABEL_OFFSET_Y;
      cameraSpace.copy(work).applyMatrix4(camera.matrixWorldInverse);
      projected.copy(work).project(camera);
      const behind = cameraSpace.z > -0.5;
      const inFrustum = projected.x >= -1.06 && projected.x <= 1.06
        && projected.y >= -1.06 && projected.y <= 1.06
        && projected.z >= -1 && projected.z <= 1;
      if (checkNow) occluded.current[anchor.reachId] = terrainOccluded(camera.position, work);
      const visible = !behind && inFrustum && !occluded.current[anchor.reachId];
      const distance = camera.position.distanceTo(work);
      const previous = nodeLabelFrames[anchor.reachId];
      const lod = resolveLabelLod(distance, previous?.lod ?? 'mid');
      const targetScale = labelScaleForDistance(distance);
      const scale = previous
        ? previous.scale + (targetScale - previous.scale) * (1 - Math.exp(-delta * 10))
        : targetScale;
      nodeLabelFrames[anchor.reachId] = {
        id: anchor.reachId,
        x: ((projected.x + 1) / 2) * size.width,
        y: ((1 - projected.y) / 2) * size.height,
        scale,
        distance,
        lod,
        visible,
      };
    }

    if (now - lastDebug.current > 0.1) {
      lastDebug.current = now;
      const canvas = gl.domElement;
      canvas.dataset.labelMode = 'overlay';
      canvas.dataset.labelFrames = JSON.stringify(nodeLabelFrames);
    }
  });

  return null;
}
