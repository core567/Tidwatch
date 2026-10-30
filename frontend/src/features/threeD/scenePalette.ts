/** Semantic status colors from the 222 brief; connection state and event state are independent. */
export const SCENE_STATUS_COLORS = {
  ONLINE: '#17B8A6',
  STALE: '#F3A53A',
  OFFLINE: '#8DA2B8',
  UNKNOWN: '#8DA2B8',
  ABNORMAL: '#E65A60',
  SELECTED: '#2684FF',
} as const;
export const SCENE_STATUS_LABELS = {
  ONLINE: '在线', STALE: '数据陈旧', OFFLINE: '离线', UNKNOWN: '状态未知',
} as const;
