export type NodeLabelLod = 'far' | 'mid' | 'near';

export interface NodeLabelFrame {
  id: string;
  x: number;
  y: number;
  scale: number;
  distance: number;
  lod: NodeLabelLod;
  visible: boolean;
}

/** 由 Canvas 内的投影器写入、由 DOM Overlay 读取；每帧覆盖，不触发 React 重渲染。 */
export const nodeLabelFrames: Record<string, NodeLabelFrame> = {};

export function clearNodeLabelFrames(): void {
  for (const key of Object.keys(nodeLabelFrames)) delete nodeLabelFrames[key];
}

/** 带缓冲的层级切换：近景 18/23，远景 52/46，避免阈值附近闪烁。 */
export function resolveLabelLod(distance: number, previous: NodeLabelLod): NodeLabelLod {
  if (previous === 'near') {
    if (distance > 23) return distance >= 52 ? 'far' : 'mid';
    return 'near';
  }
  if (previous === 'far') {
    if (distance < 46) return distance <= 18 ? 'near' : 'mid';
    return 'far';
  }
  if (distance <= 18) return 'near';
  if (distance >= 52) return 'far';
  return 'mid';
}

/** 距离越远标签越小；最小/最大尺寸由 CSS 与这里共同约束。 */
export function labelScaleForDistance(distance: number): number {
  return Math.min(1.05, Math.max(0.82, 1.14 - (distance - 14) * 0.009));
}
