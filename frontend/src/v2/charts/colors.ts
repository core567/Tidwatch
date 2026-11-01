/** F1 占位：新版视觉的断面 ID（A/B/C）。接入真实数据时经适配层映射到主项目 reach-a/b/c。 */
export type StationId = 'A' | 'B' | 'C';

export const STATION_COLORS: Record<StationId, string> = {
  A: '#5aa9ff',
  B: '#ff6f5e',
  C: '#4fe6d2',
};
