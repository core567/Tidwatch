/**
 * TwinAdapter：把首页聚合数据（真实 API 或演示内存数据，二者同构 OverviewData）
 * 映射为 Twin 视觉组件所需形状。不产生任何业务判断，仅做字段转换。
 */
import type { OverviewData, StationId } from '../../types';
import type { TwinData, TwinMetric, TwinStation } from './twinTypes';

const TONE_RISK_CODE: Record<string, string> = { good: 'R0', watch: 'R1', alert: 'R3' };

const POSITIONS: Record<StationId, { x: number; y: number }> = {
  A: { x: 130, y: 120 },
  B: { x: 500, y: 180 },
  C: { x: 870, y: 140 },
};

export function buildTwinData(data: OverviewData, demo = false): TwinData {
  const stations: TwinStation[] = data.stations.map((s) => ({
    id: s.id,
    name: s.name,
    waterClass: s.waterClass ?? '—',
    tone: s.tone,
    statusLabel: demo ? '模拟在线' : s.statusLabel,
    riskCode: TONE_RISK_CODE[s.tone] ?? 'R0',
    summary: demo ? '场景演示 · 内存模拟' : `${s.statusLabel} · ${s.location}`,
    coordinates: '示意位置 · 非真实坐标',
    updatedAt: s.updatedAt,
    position: POSITIONS[s.id],
    metrics: data.metrics[s.id].map(
      (m): TwinMetric => ({
        key: m.key,
        label: m.label,
        en: m.en,
        value: m.value,
        unit: m.unit,
        precision: m.precision,
        tone: m.stale ? 'watch' : s.tone === 'alert' ? 'alert' : 'good',
        spark: m.spark,
      }),
    ),
  }));

  const lead = data.alerts.find((a) => a.risk === 'high') ?? data.alerts[0];

  return {
    demo,
    updatedAt: data.updatedAt,
    sceneName: demo ? '场景演示剧本（内存）' : '汉江示意河段 · 原生 Three.js 场景',
    location: '上游 A → 中游 B → 下游 C',
    riverLength: '76 逻辑单位',
    flowSpeed: '—',
    stations,
    activeRisk: lead
      ? {
          eventId: lead.id,
          title: lead.title,
          riskCode: lead.riskCode,
          status: lead.status,
          stationId: lead.stationId,
          reading: lead.metricValue,
        }
      : {
          eventId: '',
          title: '暂无活跃风险',
          riskCode: 'R0',
          status: '正常监测',
          stationId: 'B',
          reading: '—',
        },
  };
}
