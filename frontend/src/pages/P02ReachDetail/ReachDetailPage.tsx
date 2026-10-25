import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as echarts from 'echarts';
import { api } from '@/services/apiClient';
import { OnlineBadge, RelativeTime } from '@/components/StatusBits';
import SourceTag from '@/components/SourceTag';
import {
  Button,
  Card,
  DataStateBadge,
  EmptyState,
  PageHeader,
  Segmented,
  Stat,
  Tag,
} from '@/components/ui';
import { EventStatusBadge, formatTime, reachName, shortTime } from '@/components/EventBits';
import {
  OFFICIAL_EXTRA_METRICS,
  OFFICIAL_METRICS,
  formatOfficialValue,
  simMetricName,
  simMetricUnit,
  waterClassTone,
} from '@/lib/metrics';
import type { Observation } from '@/types/contract';

const METRICS = [
  { key: 'waterLevel', name: '水位', unit: 'm' },
  { key: 'turbidity', name: '浊度', unit: 'NTU' },
  { key: 'flowLevel', name: '水流等级', unit: '级' },
];

const RANGES = [
  { label: '近 30 分钟', minutes: 30 },
  { label: '近 2 小时', minutes: 120 },
  { label: '近 8 小时', minutes: 480 },
  { label: '全部', minutes: undefined },
];

/** 教学阈值（demo-rules-v1），非真实防汛/预警标准。 */
const THRESHOLDS: Record<string, { value: number; label: string; color: string }[]> = {
  waterLevel: [
    { value: 7.0, label: '高水位警戒 7.0', color: '#e8902a' },
    { value: 8.5, label: '洪水预警 8.5', color: '#d84c4c' },
  ],
  turbidity: [{ value: 60, label: '浑浊阈值 60', color: '#e8902a' }],
  flowLevel: [],
};

export default function ReachDetailPage() {
  const { reachId = '' } = useParams();
  const navigate = useNavigate();
  const [metric, setMetric] = useState('waterLevel');
  const [minutes, setMinutes] = useState<number | undefined>(120);

  const reachQ = useQuery({
    queryKey: ['reach', reachId],
    queryFn: () => api.reach(reachId),
    enabled: !!reachId,
  });
  const latestQ = useQuery({
    queryKey: ['latest', reachId],
    queryFn: () => api.latest(reachId),
  });
  const officialQ = useQuery({
    queryKey: ['official-auto', reachId],
    queryFn: () => api.officialAuto(reachId),
    refetchInterval: 60000,
  });
  const eventsQ = useQuery({
    queryKey: ['events', 'reach', reachId],
    queryFn: () => api.events({ reachId, status: 'ACTIVE', pageSize: 10 }),
    refetchInterval: 15000,
  });

  const from = useMemo(
    () => (minutes ? new Date(Date.now() - minutes * 60_000).toISOString() : undefined),
    [minutes],
  );
  const historyQ = useQuery({
    queryKey: ['observations', reachId, metric, from],
    queryFn: () => api.observations(reachId, { metric, from, order: 'asc', pageSize: 500 }),
    refetchInterval: 10000,
  });

  if (reachQ.isLoading) return <div className="state-box">加载中…</div>;
  if (reachQ.isError) {
    return (
      <div className="state-box">
        断面加载失败：{(reachQ.error as Error).message}
        <Link to="/">返回总览</Link>
      </div>
    );
  }

  const reach = reachQ.data!;
  const latest = (latestQ.data ?? []) as Observation[];
  const rows = (historyQ.data?.items ?? []) as Observation[];
  const metricMeta = METRICS.find((m) => m.key === metric)!;
  const offline = reach.onlineStatus !== 'ONLINE';
  const official = (officialQ.data ?? [])[0];
  const record = official?.records?.[0];
  const events = eventsQ.data?.items ?? [];
  const extraMetrics = OFFICIAL_EXTRA_METRICS.filter(
    (m) => typeof record?.[m.key] === 'number',
  );

  return (
    <div className="tw-stack">
      <PageHeader
        code="P02"
        title={`${reach.name}（${reach.reachId}）`}
        badges={
          <>
            <OnlineBadge status={reach.onlineStatus} />
            {reach.coordinateStatus === 'LOGICAL' && <Tag tone="muted">示意拓扑</Tag>}
            {official?.stationName && (
              <Tag tone="outline">官方站 {official.stationName}（示意关联）</Tag>
            )}
          </>
        }
        description="官方自动站快照与 MQTT 模拟连续观测分开展示：官方为离散现状值，不做插值或连续趋势推断。"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate('/events')}>
              事件中心
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/river-3d')}>
              3D 视图
            </Button>
          </>
        }
      />

      {offline && (
        <div className="card" style={{ borderLeft: '4px solid var(--tw-watch)', fontSize: 13.5 }}>
          该监测点当前{reach.onlineStatus === 'STALE' ? '数据陈旧' : '离线'}：最后有效观测时间{' '}
          <b>
            {reach.lastSeenAt
              ? new Date(reach.lastSeenAt).toLocaleString('zh-CN', { hour12: false })
              : '无'}
          </b>
          。无数据不等于现场正常，将形成监测盲区并触发链路检查。
        </div>
      )}

      <Card
        title="官方实时水质"
        subtitle={
          record
            ? `${record.stationName} · 观测 ${formatTime(record.observedAt)} · ${record.province ?? ''}${record.basin ?? ''}`
            : '尚未拉取官方数据'
        }
        actions={
          <div className="tw-row">
            <SourceTag source="OFFICIAL_AUTO" />
            <DataStateBadge state={official?.dataState ?? 'NO_DATA'} />
            {record?.waterClass && (
              <Tag tone={waterClassTone(record.waterClass)}>{record.waterClass} 类</Tag>
            )}
          </div>
        }
      >
        {!record ? (
          <EmptyState
            title="官方暂无该断面数据"
            description="可在 P12 系统管理「官方实时数据」手动拉取。该站为示意关联，上下游对应关系待核实；无数据不等于现场正常。"
            action={
              <Button size="sm" variant="ghost" onClick={() => navigate('/admin')}>
                去系统管理
              </Button>
            }
          />
        ) : (
          <>
            <div className="tw-stat-grid">
              {[...OFFICIAL_METRICS, ...extraMetrics].map((def) => (
                <Stat
                  key={def.key as string}
                  label={def.label}
                  value={formatOfficialValue(record, def)}
                  digits={def.digits}
                  unit={def.unit}
                  hint={def.hint}
                />
              ))}
            </div>
            <div className="tw-tiny" style={{ marginTop: 10 }}>
              官方仅发布当前快照，本页不绘制连续曲线；数据缺失显示“暂无数据”，不按 0 处理。
              {record.mappingStatus === 'UNVERIFIED' && ' 官方站与逻辑断面的上下游对应为示意关联。'}
            </div>
          </>
        )}
      </Card>

      <Card
        title="模拟观测趋势"
        subtitle="连续序列来自 MQTT 模拟链路，驱动事件机与 3D 高亮；水位/流量无真实数据源"
        actions={<SourceTag source="SIMULATED" />}
      >
        <div className="tw-row-between" style={{ marginBottom: 12 }}>
          <Segmented
            ariaLabel="选择指标"
            value={metric}
            onChange={setMetric}
            options={METRICS.map((m) => ({ value: m.key, label: m.name }))}
          />
          <Segmented
            ariaLabel="选择时间范围"
            value={String(minutes ?? 'all')}
            onChange={(v) => setMinutes(v === 'all' ? undefined : Number(v))}
            options={RANGES.map((r) => ({ value: String(r.minutes ?? 'all'), label: r.label }))}
          />
        </div>

        <div className="tw-stat-grid" style={{ marginBottom: 12 }}>
          {latest.length === 0 && (
            <div className="tw-tiny">暂无最新模拟观测（MQTT 未接入或尚未上报）</div>
          )}
          {latest.map((m) => (
            <Stat
              key={m.metric}
              label={simMetricName(m.metric)}
              value={m.value}
              unit={simMetricUnit(m.unit, m.metric)}
              hint={`观测 ${shortTime(m.observedAt)}`}
            />
          ))}
        </div>

        {historyQ.isLoading ? (
          <div className="state-box">历史加载中…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title={`所选时间范围无「${metricMeta.name}」数据`}
            description="可运行 S1 场景发布器产生模拟数据（见 simulator/README.md）。"
          />
        ) : (
          <Chart
            rows={rows}
            name={metricMeta.name}
            unit={metricMeta.unit}
            thresholds={THRESHOLDS[metric] ?? []}
          />
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          按观测时间（observedAt）组织；最近入库 <RelativeTime iso={latest[0]?.ingestedAt} />
          {rows.some((r) => r.scenarioId) &&
            '　场景：' +
              [...new Set(rows.map((r) => r.scenarioId).filter(Boolean))].join(', ')}
        </div>
        <div className="tw-tiny" style={{ marginTop: 4 }}>
          图中横向参考线为教学阈值（demo-rules-v1），非官方防汛或水质预警标准。
        </div>
      </Card>

      <Card
        title="关联活动事件"
        subtitle={`本断面未闭环事件 ${eventsQ.data?.total ?? 0} 起`}
        actions={
          <Button size="sm" variant="ghost" onClick={() => navigate('/events')}>
            全部事件
          </Button>
        }
        padded={false}
      >
        {events.length === 0 ? (
          <EmptyState
            title="本断面暂无未闭环事件"
            description="事件触发后将在此列出，可进入研判工作台。"
          />
        ) : (
          <div>
            {events.map((e) => (
              <button
                key={e.eventId}
                type="button"
                onClick={() => navigate(`/events/${e.eventId}/workbench`)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  borderBottom: '1px solid #eef2f7',
                  background: 'transparent',
                  padding: '10px 20px',
                  cursor: 'pointer',
                }}
              >
                <div className="tw-row-between">
                  <span style={{ fontWeight: 600, color: 'var(--tw-primary-800)' }}>
                    {e.title}
                  </span>
                  <div className="tw-row">
                    {e.priority === 'HIGH' && <Tag tone="danger">高优先</Tag>}
                    <EventStatusBadge status={e.status} />
                  </div>
                </div>
                <div className="tw-tiny" style={{ marginTop: 4 }}>
                  首次发现 {formatTime(e.firstSeenAt)} · 范围{' '}
                  {e.scopeReachIds.map(reachName).join(' / ')}
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Chart({
  rows,
  name,
  unit,
  thresholds,
}: {
  rows: Observation[];
  name: string;
  unit: string;
  thresholds: { value: number; label: string; color: string }[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: 'canvas' });
    chart.setOption({
      grid: { left: 48, right: 20, top: 28, bottom: 40 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'time', axisLabel: { fontSize: 11 } },
      yAxis: { type: 'value', name: unit, scale: true },
      series: [
        {
          name,
          type: 'line',
          showSymbol: rows.length <= 60,
          symbolSize: 5,
          smooth: true,
          lineStyle: { width: 2, color: '#1e6fe0' },
          itemStyle: { color: '#1e6fe0' },
          data: rows.map((r) => [new Date(r.observedAt).getTime(), r.value]),
          markLine: {
            silent: true,
            symbol: 'none',
            label: { fontSize: 10, color: '#5d7186', formatter: '{b}' },
            data: thresholds.map((t) => ({
              yAxis: t.value,
              name: t.label,
              lineStyle: { color: t.color, type: 'dashed', width: 1 },
              label: { color: t.color },
            })),
          },
        },
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
  }, [rows, name, unit, thresholds]);

  return <div ref={ref} style={{ width: '100%', height: 320 }} />;
}
