import { Vector3 } from 'three';

const TERRAIN_CLEARANCE = 1.8;

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 先对直线路径求抬升量，飞行时保留起终点并沿平滑弧线越过地形。 */
export function createCameraFlight(from: Vector3, to: Vector3, terrainHeight: (x: number, z: number) => number) {
  const start = from.clone();
  const end = to.clone();
  const point = new Vector3();
  let lift = Math.min(4, Math.hypot(end.x - start.x, end.z - start.z) * 0.08);
  for (let i = 1; i < 128; i++) {
    const k = i / 128;
    point.lerpVectors(start, end, k);
    const required = terrainHeight(point.x, point.z) + TERRAIN_CLEARANCE + 0.2 - point.y;
    lift = Math.max(lift, required / (4 * k * (1 - k)));
  }

  return {
    positionAt(t: number): Vector3 {
      if (t <= 0) return start.clone();
      if (t >= 1) return end.clone();
      const k = easeInOutCubic(t);
      const position = new Vector3().lerpVectors(start, end, k);
      position.y += lift * 4 * k * (1 - k);
      // 密集采样间仍做实时净空约束，防止窄地形尖峰漏采。
      position.y = Math.max(position.y, terrainHeight(position.x, position.z) + TERRAIN_CLEARANCE);
      return position;
    },
  };
}
