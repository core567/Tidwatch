import * as THREE from 'three';
import { CatmullRomCurve3, Vector3 } from 'three';

/**
 * 示意性河道中轴曲线（非真实地理走向）。
 * 真实站点坐标核实后，可在此用 VERIFIED 坐标替换，节点组件无需改动。
 */
export const RIVER_CURVE: CatmullRomCurve3 = new CatmullRomCurve3(
  [
    new Vector3(-26, 0, -8),
    new Vector3(-13, 0, 5),
    new Vector3(0, 0, -3),
    new Vector3(13, 0, 7),
    new Vector3(26, 0, -4),
  ],
  false,
  'catmullrom',
  0.5,
);

export const WATER_WIDTH = 4.6;
export const BANK_WIDTH = 13;
export const RIBBON_SEGMENTS = 140;

export interface NodeAnchor {
  reachId: string;
  name: string;
  t: number;
  position: Vector3;
}

/** A/B/C 沿河道的逻辑位置（上游→中游→下游）。M2 镜头飞行复用这些锚点。 */
export const NODE_ANCHORS: NodeAnchor[] = [
  { reachId: 'reach-a', name: '上游 A', t: 0.12, position: RIVER_CURVE.getPointAt(0.12) },
  { reachId: 'reach-b', name: '中游 B', t: 0.5, position: RIVER_CURVE.getPointAt(0.5) },
  { reachId: 'reach-c', name: '下游 C', t: 0.88, position: RIVER_CURVE.getPointAt(0.88) },
];

/** 沿曲线生成有宽度的带状几何体（水面 / 堤岸共用）。 */
export function buildRibbonGeometry(
  curve: CatmullRomCurve3,
  width: number,
  y: number,
  segments = RIBBON_SEGMENTS,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    // 水平面内的法向：( -tz, 0, tx )
    const side = new Vector3(-tangent.z, 0, tangent.x).normalize();

    const left = center.clone().addScaledVector(side, width / 2);
    const right = center.clone().addScaledVector(side, -width / 2);
    positions.push(left.x, y, left.z, right.x, y, right.z);
    uvs.push(0, t * 20, 1, t * 20);

    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export const OVERVIEW_CAMERA = {
  position: new Vector3(0, 26, 30),
  target: new Vector3(0, 0, 0),
  fov: 45,
};
