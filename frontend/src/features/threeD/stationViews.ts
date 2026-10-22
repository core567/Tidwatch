import * as THREE from 'three';
import { NODE_ANCHORS, OVERVIEW_CAMERA, RIVER_CURVE, type NodeAnchor } from './riverGeometry.ts';

export interface CameraView {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** 全景位姿（初始/返回）。 */
export const OVERVIEW_VIEW: CameraView = {
  position: OVERVIEW_CAMERA.position.clone(),
  target: OVERVIEW_CAMERA.target.clone(),
};

/**
 * 节点局部视角：相机位于节点侧前方（上游方向）并抬高，看向节点。
 * 从曲线切向自动计算，真实坐标核实后只需替换曲线，视角自动跟随。
 */
function stationView(anchor: NodeAnchor): CameraView {
  const p = RIVER_CURVE.getPointAt(anchor.t);
  const tan = RIVER_CURVE.getTangentAt(anchor.t).normalize();
  const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
  const position = p
    .clone()
    .addScaledVector(tan, -4.2) // 偏向上游
    .addScaledVector(side, 5.2) // 侧向拉开
    .add(new THREE.Vector3(0, 5.2, 0)); // 抬高俯视
  const target = p.clone().add(new THREE.Vector3(0, 1.2, 0));
  return { position, target };
}

export const STATION_VIEWS: Record<string, CameraView> = Object.fromEntries(
  NODE_ANCHORS.map((a) => [a.reachId, stationView(a)]),
);

export function viewFor(view: string): CameraView {
  return STATION_VIEWS[view] ?? OVERVIEW_VIEW;
}
