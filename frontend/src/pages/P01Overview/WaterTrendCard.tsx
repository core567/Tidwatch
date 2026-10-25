import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import * as echarts from 'echarts';
import { api } from '@/services/apiClient';
import { Card, EmptyState, Segmented, Tag } from '@/components/ui';
import SourceTag from '@/components/SourceTag';
import { formatTime } from '@/components/EventBits';
import { OFFICIAL_METRICS, formatOfficialValue, waterClassTone } from '@/lib/metrics';
import type { Observation, OfficialAutoLatest } from '@/types/contract';

type Kind = 'sim' | 'official';

const METRIC_TABS: { key: string; label: string; kind: Kind }[] = [
  { key: 'ph', label: 'pH', kind: 'official' },
  { key: 'dissolvedOxygen', label: '溶解氧', kind: 'official' },
  { key: 'ammoniaN', label: '氨氮', kind: 'official' },
  { key: 'waterLevel', label: '水位', kind: 'sim' },
  { key: 'flowLevel', label: '流量', kind: 'sim' },
];

const REACH_TABS = [
  { value: 'all', label: '全部河段' },
  { value: 'reach-a', label: '上游 A' },
  { value: 'reach-b', label: '中游 B' },
  { value: 'reach-c', label: '下游 C' },
];

const RANGE_TABS = [
  { value: '30', label: '近 30 分钟' },
  { value: '120', label: '近 2 小时' },
  { value: '480', label: '近 8 小时' },
  { value: 'all', label: '全部' },
];

const SIM_META: Record<string, { name: string; unit: string }> = {
  waterLevel: { name: '水位', unit: 'm' },
  flowLevel: { name: '水流等级（流量代理）', unit: '级' },
};

const REACH_COLORS: Record<string, string> = {
  'reach-a': '#1e6fe0',
  'reach-b': '#12a594',
  'reach-c': '#e8902a',
};

const REACH_LABEL: Record<string, string> = {
  'reach-a': '上游 A',
  'reach-b': '中游 B',
  'reach-c': '下游 C',
};

/** 教学阈值（demo-rules-v1），非官方防汛标准。 */
const THRESHOLDS: Record<string, { value: number; label: string; color: string }[]> = {
  waterLevel: [
    { value: 7.0, label: '高水位警戒 7.0', color: '#e8902a' },
    { value: 8.5, label: '洪水预警 8.5', color: '#d84c4c' },
  ],
};

export default function WaterTrendCard() {
  const [metricKey, setMetricKey] = useState('waterLevel');
  const [reach, setReach] = useState('all');
  const [range, setRange] = useState('120');

  const metric = METRIC_TABS.find((m) => m.key === metricKey)!;
  const reachIds = reach === 'all' ? ['reach-a', 'reach-b', 'reach-c'] : [reach];
  const from = useMemo(
    () => (range === 'all' ? undefined : new Date(Date.now() - Number(range) * 60_000).toISOString()),
    [range],
  );

  return (
    <Card
      title="河流水质趋势"
      subtitle={
        metric.kind === 'sim'
          ? metricKey === 'flowLevel'
            ? '流量真实数据源未接入，当前以 MQTT 模拟「水流等级」作为代理展示，非实测流量'
            : '连续序列来自 MQTT 模拟链路，按观测时间组织；水位无真实数据源'
          : '官方自动站仅发布每日 00:00 快照，平台无公开历史序列接口，仅展示当前值，不生成连续曲线'
      }
      actions={
        metric.kind === 'sim' ? <SourceTag source="SIMULATED" /> : <SourceTag source="OFFICIAL_AUTO" />
      }
    >
      <div className="tw-row" style={{ gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Segmented
          ariaLabel="选择指标"
          value={metricKey}
          onChange={setMetricKey}
          options={METRIC_TABS.map((m) => ({ value: m.key, label: m.label }))}
        />
        <Segmented ariaLabel="选择河段" value={reach} onChange={setReach} options={REACH_TABS} />
        {metric.kind === 'sim' ? (
          <Segmented ariaLabel="选择时间范围" value={range} onChange={setRange} options={RANGE_TABS} />
        ) : null}
      </div>

      {metric.kind === 'sim' ? (
        <SimTrend metricKey={metricKey} reachIds={reachIds} from={from} />
      ) : (
        <OfficialSnapshot metricKey={metricKey} reachIds={reachIds} />
      )}
    </Card>
  );
}

function SimTrend({
  metricKey,
  reachIds,
  from,
}: {
  metricKey: string;
  reachIds: string[];
  from: string | undefined;
}) {
  const results = useQueries({
    queries: reachIds.map((rid) => ({
      queryKey: ['observations', rid, metricKey, from],
      queryFn: () => api.observations(rid, { metric: metricKey, from, order: 'asc', pageSize: 500 }),
      refetchInterval: 15000,
    })),
  });

  const loading = results.some((r) => r.isLoading);
  const byReach = results.map((r, i) => ({
    reachId: reachIds[i],
    rows: (r.data?.items ?? []) as Observation[],
  }));
  const allRows = byReach.flatMap((b) => b.rows);
  const meta = SIM_META[metricKey];

  if (loading) return <div className="state-box">历史加载中…</div>;
  if (allRows.length === 0) {
    return (
      <EmptyState
        title={`所选时间范围无「${meta.name}」数据`}
        description="可运行 S2 场景发布器产生模拟数据（见 simulator/README.md）；无数据时不绘制曲线。"
      />
    );
  }

  const times = allRows
    .map((r) => r.observedAt)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  const scenarios = [...new Set(allRows.map((r) => r.scenarioId).filter(Boolean))];
  const badCount = allRows.filter((r) => r.qualityFlag !== 'GOOD').length;

  // 越过教学阈值的模拟点：必须标明来自哪个模拟场景，不能被误读为真实异常
  const limit = metricKey === 'waterLevel' ? 7.0 : null;
  const breaches = limit === null ? [] : allRows.filter((r) => r.value >= limit);
  const breachScenarios = [...new Set(breaches.map((r) => r.scenarioId).filter(Boolean))];
  const peak = breaches.length
    ? breaches.reduce((a, b) => (b.value > a.value ? b : a))
    : null;

  return (
    <>
      <div className="tw-row tw-small" style={{ gap: 10, marginBottom: 8, color: 'var(--tw-text-secondary)', flexWrap: 'wrap' }}>
        <SourceTag source="SIMULATED" />
        <span>
          数据时间 {formatTime(times[0])} ~ {formatTime(times[times.length - 1])}
        </span>
        <span>·</span>
        <span>
          单位 <b>{meta.unit}</b>
        </span>
        <span>·</span>
        <span>{allRows.length} 个观测点</span>
        {scenarios.length > 0 && (
          <Tag tone="watch" title="异常曲线来自 MQTT 模拟场景，非真实水情">
            模拟场景 {scenarios.join(', ')}
          </Tag>
        )}
        {badCount > 0 && <Tag tone="danger">{badCount} 个异常/可疑质量点</Tag>}
      </div>
      {peak ? (
        <div className="tw-trend-breach">
          模拟异常：最高 {peak.value} {meta.unit}（{formatTime(peak.observedAt)}）超过教学警戒 7.0 m，
          来自 MQTT <b>{breachScenarios.join('、') || peak.sourceName || '模拟场景'}</b>，
          非官方真实异常。阈值线为 demo-rules-v1 教学规则，非官方防汛标准。
        </div>
      ) : null}
      <TrendChart byReach={byReach} unit={meta.unit} thresholds={THRESHOLDS[metricKey] ?? []} />
    </>
  );
}

function OfficialSnapshot({ metricKey, reachIds }: { metricKey: string; reachIds: string[] }) {
  const def = OFFICIAL_METRICS.find((m) => m.key === metricKey)!;
  const officialQ = useQuery({
    queryKey: ['official-auto'],
    queryFn: () => api.officialAuto(),
    refetchInterval: 60000,
  });
  const official = (officialQ.data ?? []) as OfficialAutoLatest[];

  if (officialQ.isLoading) return <div className="state-box">官方数据加载中…</div>;

  const cells = reachIds.map((rid) => {
    const latest = official.find((o) => o.reachId === rid);
    const record = latest?.records?.[0];
    return { rid, latest, record };
  });
  const anyData = cells.some((c) => typeof c.record?.[def.key] === 'number');

  if (!anyData) {
    return (
      <EmptyState
        title={`三站均暂无「${def.label}」官方快照`}
        description="可在数据与系统管理「官方实时数据」中手动拉取；无数据不等于现场正常。"
      />
    );
  }

  return (
    <>
      <div className="tw-grid tw-grid-3">
        {cells.map(({ rid, latest, record }) => {
          const value = formatOfficialValue(record, def);
          return (
            <div key={rid} className="tw-stat" style={{ padding: '12px 14px' }}>
              <div className="tw-stat-label">
                {REACH_LABEL[rid]}
                {record?.waterClass ? (
                  <Tag tone={waterClassTone(record.waterClass)}>{record.waterClass} 类</Tag>
                ) : null}
              </div>
              <div className="tw-stat-value">
                {value === null ? '暂无数据' : value}
                {value !== null && def.unit ? <small>{def.unit}</small> : null}
              </div>
              <div className="tw-stat-hint">
                {record ? formatTime(record.observedAt) : '官方无记录'}
                {latest ? ` · ${latest.dataState === 'LIVE' ? '快照有效' : '快照过期'}` : ''}
              </div>
            </div>
          );
        })}
      </div>
      <div className="tw-tiny" style={{ marginTop: 10, lineHeight: 1.7 }}>
        国家地表水自动监测实时数据发布系统每日 00:00 快照；历史序列无公开接口，本卡片不做插值或趋势推断。
        {def.hint ? ` 教学参考：${def.hint}。` : ''}
      </div>
    </>
  );
}

function TrendChart({
  byReach,
  unit,
  thresholds,
}: {
  byReach: { reachId: string; rows: Observation[] }[];
  unit: string;
  thresholds: { value: number; label: string; color: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chart.setOption({
      grid: { left: 52, right: 20, top: 30, bottom: 36 },
      tooltip: { trigger: 'axis' },
      legend: {
        top: 0,
        right: 8,
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { fontSize: 11, color: '#5d7186' },
      },
      xAxis: { type: 'time', axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value', name: unit, scale: true, nameTextStyle: { fontSize: 11 } },
      series: [
        ...byReach.map(({ reachId, rows }) => ({
          name: REACH_LABEL[reachId] ?? reachId,
          type: 'line' as const,
          showSymbol: false,
          smooth: true,
          lineStyle: { width: 2, color: REACH_COLORS[reachId] },
          itemStyle: { color: REACH_COLORS[reachId] },
          data: rows.map((r) => [new Date(r.observedAt).getTime(), r.value]),
          markLine: {
            silent: true,
            symbol: 'none',
            data: thresholds.map((t) => ({
              yAxis: t.value,
              name: t.label,
              lineStyle: { color: t.color, type: 'dashed' as const, width: 1 },
              label: { color: t.color, fontSize: 10 },
            })),
          },
        })),
        ...byReach
          .filter(({ rows }) => rows.some((r) => r.qualityFlag !== 'GOOD'))
          .map(({ reachId, rows }) => ({
            name: `${REACH_LABEL[reachId] ?? reachId} 异常点`,
            type: 'scatter' as const,
            symbolSize: 8,
            itemStyle: { color: '#d84c4c' },
            data: rows
              .filter((r) => r.qualityFlag !== 'GOOD')
              .map((r) => [new Date(r.observedAt).getTime(), r.value, r.qualityFlag]),
          })),
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      chart.dispose();
    };
  }, [byReach, unit, thresholds]);

  return <div ref={ref} style={{ width: '100%', height: 248 }} />;
}
