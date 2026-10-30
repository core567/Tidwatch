import * as THREE from 'three';
import { NODE_ANCHORS, OVERVIEW_CAMERA, RIVER_CURVE, sampleTerrainHeight, type NodeAnchor } from './riverGeometry.ts';

export interface CameraView {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** 全景位姿（初始/返回）。 */
export const OVERVIEW_VIEW: CameraView = {
  position: OVERVIEW_CAMERA.position.clone(),
  target: OVERVIEW_CAMERA.target.clone(),
};

/** 相机从河岸节点的上游侧俯视，取景随实际岸上锚点移动。 */
function stationView(anchor: NodeAnchor): CameraView {
  const p = anchor.position;
  const tan = RIVER_CURVE.getTangentAt(anchor.t).normalize();
  const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
  const position = p
    .clone()
    .addScaledVector(tan, -4.2)
    .addScaledVector(side, 7.5)
    .add(new THREE.Vector3(0, 6.5, 0));
  position.y = Math.max(position.y, sampleTerrainHeight(position.x, position.z) + 3);
  const target = p.clone().add(new THREE.Vector3(0, 1.2, 0));
  return { position, target };
}

export const STATION_VIEWS: Record<string, CameraView> = Object.fromEntries(
  NODE_ANCHORS.map((a) => [a.reachId, stationView(a)]),
);

export function viewFor(view: string): CameraView {
  return Object.prototype.hasOwnProperty.call(STATION_VIEWS, view) ? STATION_VIEWS[view] : OVERVIEW_VIEW;
}
