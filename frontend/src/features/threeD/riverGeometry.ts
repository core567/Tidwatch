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

/** 水面横剖面：中央微凹、两岸微抬，叠加沿程细微波纹（纯视觉，非水动力）。 */
function waterProfile(u: number, t: number): number {
  const centerDip = -0.045 * (1 - u * u);
  const ripple = 0.018 * Math.sin(t * 42 + u * 2.6);
  return centerDip + ripple;
}

/** 带横剖面起伏的水面网格（横向 crossSegments 段）。 */
export function buildWaterGeometry(
  curve: CatmullRomCurve3,
  width: number,
  segments = RIBBON_SEGMENTS,
  crossSegments = 6,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cols = crossSegments + 1;

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const side = new Vector3(-tangent.z, 0, tangent.x).normalize();
    for (let j = 0; j <= crossSegments; j++) {
      const u = (j / crossSegments) * 2 - 1;
      const p = center.clone().addScaledVector(side, (u * width) / 2);
      positions.push(p.x, waterProfile(u, t), p.z);
      uvs.push((u + 1) / 2, t * 24);
    }
    if (i < segments) {
      for (let j = 0; j < crossSegments; j++) {
        const a = i * cols + j;
        indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** 确定性伪噪声：同一坐标恒得同一值，保证场景刷新不抖动。 */
function bankNoise(t: number, d: number, seed: number): number {
  return (
    Math.sin(t * 31.7 + d * 9.3 + seed) * 0.5 +
    Math.sin(t * 13.1 - d * 5.7 + seed * 2.3) * 0.3 +
    Math.sin(t * 57.3 + d * 17.9 + seed * 0.7) * 0.2
  );
}

/**
 * 单侧河岸地形：从 innerWidth/2 向外扩展到 outerWidth/2，
 * 高度随离水距离抬升并叠加确定性起伏，远端淡出到雾中。
 */
export function buildBankGeometry(
  curve: CatmullRomCurve3,
  innerWidth: number,
  outerWidth: number,
  sideSign: 1 | -1,
  segments = RIBBON_SEGMENTS,
  crossSegments = 10,
  seed = 1,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const cols = crossSegments + 1;
  const innerHalf = innerWidth / 2;
  const outerHalf = outerWidth / 2;
  const near = new THREE.Color('#a9bf9d');
  const far = new THREE.Color('#7d9475');

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const center = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const side = new Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(sideSign);
    for (let j = 0; j <= crossSegments; j++) {
      const k = j / crossSegments;
      const dist = innerHalf + (outerHalf - innerHalf) * k;
      const p = center.clone().addScaledVector(side, dist);
      const rise = 1.15 * Math.pow(k, 1.25) + bankNoise(t, k, seed) * 0.55 * k;
      positions.push(p.x, rise - 0.02, p.z);
      uvs.push(k, t * 24);
      const c = near.clone().lerp(far, Math.min(1, k * 1.15));
      colors.push(c.r, c.g, c.b);
    }
    if (i < segments) {
      for (let j = 0; j < crossSegments; j++) {
        const a = i * cols + j;
        // 两侧三角形绕序相反，保证法线朝上
        if (sideSign > 0) {
          indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
        } else {
          indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
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

/**
 * 河谷谷地地形：大范围缓起伏地表，河道走向处下沉形成河谷，
 * 向外逐渐抬升为丘陵，营造空间纵深。确定性噪声，刷新不抖动。
 * 视觉示意，不代表真实高程。
 */
export function buildValleyGeometry(
  size = 150,
  segments = 96,
  halfWidth = 11,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const cols = segments + 1;

  const valleyFloor = new THREE.Color('#cdd8c4');
  const meadow = new THREE.Color('#9fb48d');
  const far = new THREE.Color('#82977a');

  for (let iz = 0; iz <= segments; iz++) {
    for (let ix = 0; ix <= segments; ix++) {
      const x = (ix / segments - 0.5) * size;
      const z = (iz / segments - 0.5) * size;
      // 到河道曲线的近似横向距离：沿曲线采样取最近
      let minD = Infinity;
      for (let k = 0; k <= 80; k++) {
        const c = RIVER_CURVE.getPointAt(k / 80);
        const d = Math.hypot(x - c.x, z - c.z);
        if (d < minD) minD = d;
      }
      // 河谷：近处低，远处抬升
      const v = Math.max(0, minD - halfWidth);
      const ridge = 0.018 * v * v;
      const n =
        Math.sin(x * 0.18 + z * 0.11) * 0.18 +
        Math.sin(x * 0.07 - z * 0.13) * 0.28;
      const y = -0.35 + ridge + n * (0.4 + Math.min(1, v / 30));
      positions.push(x, y, z);

      // 近河谷为滩涂草甸，远为低饱和丘陵
      const k = Math.min(1, minD / (size * 0.5));
      const c =
        minD < halfWidth
          ? valleyFloor.clone().lerp(meadow, 0.3)
          : meadow.clone().lerp(far, k);
      colors.push(c.r, c.g, c.b);
    }
    if (iz < segments) {
      for (let ix = 0; ix < segments; ix++) {
        const a = iz * cols + ix;
        indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
