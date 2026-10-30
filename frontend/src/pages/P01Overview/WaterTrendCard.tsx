import { useEffect, useMemo, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { Card, EmptyState, Segmented, Tag } from '@/components/ui';
import SourceTag from '@/components/SourceTag';
import { formatTime } from '@/components/EventBits';
import { OFFICIAL_METRICS, formatOfficialValue, waterClassTone } from '@/lib/metrics';
import { buildReachTrends } from '@/lib/reachTrends';
import ReachTrendChart from '@/components/TrendChart';
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
  const [viewMode, setViewMode] = useState<'full' | 'focus'>('focus');
  const results = useQueries({
    queries: reachIds.map((rid) => ({
      queryKey: ['observations', rid, metricKey, from],
      queryFn: () => api.observations(rid, { metric: metricKey, from, order: 'asc', pageSize: 2000 }),
      refetchInterval: 15000,
    })),
  });

  const loading = results.some((r) => r.isLoading);
  const isError = results.some((r) => r.isError);
  const byReach = results.map((r, i) => ({
    reachId: reachIds[i],
    rows: (r.data?.items ?? []) as Observation[],
  }));
  const allRows = byReach.flatMap((b) => b.rows);
  const meta = SIM_META[metricKey];

  useEffect(() => { setViewMode('focus'); }, [metricKey, from]);

  const trend = useMemo(() => {
    const inputs = byReach.map((b) => ({
      reachId: b.reachId,
      name: REACH_LABEL[b.reachId] ?? b.reachId,
      color: REACH_COLORS[b.reachId] ?? '#666',
      rows: b.rows,
    }));
    return buildReachTrends(inputs, 15 * 60 * 1000, metricKey === 'waterLevel' ? [7.0, 8.5] : [], {
      queryStart: from ? new Date(from).getTime() : null,
      queryEnd: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricKey, from, ...results.map((r) => r.data)]);

  if (loading) return <div className="state-box">历史加载中…</div>;
  if (isError && allRows.length === 0) {
    return (
      <EmptyState
        title={`「${meta.name}」数据请求失败`}
        description="后端服务可能不可用；不会用旧数据伪装为实时结果。"
      />
    );
  }
  if (allRows.length === 0) {
    return (
      <EmptyState
        title={`所选时间范围无「${meta.name}」有效观测`}
        description="可运行 S2 场景产生模拟数据；无数据时不绘制水平假线。"
      />
    );
  }

  const scenarios = [...new Set(allRows.map((r) => r.scenarioId).filter(Boolean))];
  const badCount = allRows.filter((r) => r.qualityFlag !== 'GOOD').length;

  // 越过教学阈值的模拟点：必须标明来自哪个模拟场景，不能被误读为真实异常
  const limit = metricKey === 'waterLevel' ? 7.0 : null;
  const breaches = limit === null ? [] : allRows.filter((r) => r.value >= limit);
  const breachScenarios = [...new Set(breaches.map((r) => r.scenarioId).filter(Boolean))];
  const peak = breaches.length
    ? breaches.reduce((a, b) => (b.value > a.value ? b : a))
    : null;
  const totalOutliers = trend.stats.reduce((n, s) => n + s.outlierCount, 0);

  return (
    <>
      <div className="tw-row tw-small" style={{ gap: 10, marginBottom: 8, color: 'var(--tw-text-secondary)', flexWrap: 'wrap' }}>
        <SourceTag source="SIMULATED" />
        <span>
          有效数据 {trend.spanStart ? formatTime(new Date(trend.spanStart).toISOString()) : '—'} ~{' '}
          {trend.spanEnd ? formatTime(new Date(trend.spanEnd).toISOString()) : '—'}
        </span>
        <span>·</span>
        <span>单位 <b>{meta.unit}</b></span>
        <span>·</span>
        <span>{allRows.length} 个观测点</span>
        {scenarios.length > 0 && (
          <Tag tone="watch" title="异常曲线来自 MQTT 模拟场景，非真实水情">
            模拟场景 {scenarios.join(', ')}
          </Tag>
        )}
        {badCount > 0 && <Tag tone="danger">{badCount} 个异常/可疑质量点</Tag>}
        <Segmented
          ariaLabel="视图范围"
          value={viewMode}
          onChange={(v) => setViewMode(v as 'full' | 'focus')}
          options={[
            { value: 'full', label: '完整范围' },
            { value: 'focus', label: '聚焦数据' },
          ]}
        />
      </div>
      {peak ? (
        <div className="tw-trend-breach">
          模拟异常：最高 {peak.value} {meta.unit}（{formatTime(peak.observedAt)}）超过教学警戒 7.0 m，
          来自 MQTT <b>{breachScenarios.join('、') || peak.sourceName || '模拟场景'}</b>，
          非官方真实异常。共 {totalOutliers} 个越限点。阈值线为 demo-rules-v1 教学规则，非官方防汛标准。
        </div>
      ) : null}
      <ReachTrendChart
        data={trend}
        unit={meta.unit}
        height={248}
        viewMode={viewMode}
        thresholds={THRESHOLDS[metricKey] ?? []}
      />
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
