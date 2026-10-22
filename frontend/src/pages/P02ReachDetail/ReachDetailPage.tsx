import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as echarts from 'echarts';
import { api } from '@/services/apiClient';
import { useAuthStore } from '@/store/auth';
import { OnlineBadge, RelativeTime, SourceTag } from '@/components/StatusBits';
import type { Observation } from '@/types/contract';

const METRICS = [
  { key: 'waterLevel', name: '水位', unit: 'm' },
  { key: 'turbidity', name: '浊度', unit: 'NTU' },
  { key: 'flowLevel', name: '水流等级', unit: '0-3' },
];

const RANGES = [
  { label: '近 30 分钟', minutes: 30 },
  { label: '近 2 小时', minutes: 120 },
  { label: '近 8 小时', minutes: 480 },
  { label: '全部', minutes: undefined },
];

export default function ReachDetailPage() {
  const { reachId = '' } = useParams();
  const authenticated = useAuthStore((s) => s.authenticated);
  const [metric, setMetric] = useState('waterLevel');
  const [minutes, setMinutes] = useState<number | undefined>(120);

  const reachQ = useQuery({
    queryKey: ['reach', reachId],
    queryFn: () => api.reach(reachId),
    enabled: authenticated && !!reachId,
  });
  const latestQ = useQuery({
    queryKey: ['latest', reachId],
    queryFn: () => api.latest(reachId),
    enabled: authenticated,
  });

  const from = useMemo(
    () => (minutes ? new Date(Date.now() - minutes * 60_000).toISOString() : undefined),
    [minutes],
  );
  const historyQ = useQuery({
    queryKey: ['observations', reachId, metric, from],
    queryFn: () =>
      api.observations(reachId, { metric, from, order: 'asc', pageSize: 500 }),
    enabled: authenticated,
    refetchInterval: 10000,
  });

  if (!authenticated) return <div className="card state-box">请先登录</div>;
  if (reachQ.isLoading) return <div className="state-box">加载中…</div>;
  if (reachQ.isError)
    return (
      <div className="state-box">
        断面加载失败：{(reachQ.error as Error).message}
        <Link to="/">返回总览</Link>
      </div>
    );

  const reach = reachQ.data!;
  const latest = (latestQ.data ?? []) as Observation[];
  const rows = (historyQ.data?.items ?? []) as Observation[];
  const metricMeta = METRICS.find((m) => m.key === metric)!;
  const offline = reach.onlineStatus !== 'ONLINE';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: 'var(--tw-primary-800)' }}>
          P02 {reach.name}（{reach.reachId}）
        </h2>
        <OnlineBadge status={reach.onlineStatus} />
        {reach.coordinateStatus === 'LOGICAL' && <span className="badge badge-offline">示意拓扑</span>}
      </div>

      {offline && (
        <div
          className="card"
          style={{ borderLeft: '4px solid var(--tw-watch)', marginBottom: 16, fontSize: 13.5 }}
        >
          该监测点当前{reach.onlineStatus === 'STALE' ? '数据陈旧' : '离线'}：
          最后有效观测时间 <b>{reach.lastSeenAt ? new Date(reach.lastSeenAt).toLocaleString('zh-CN') : '无'}</b>。
          无数据不等于现场正常，将形成监测盲区并触发链路检查。
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
        {latest.length === 0 && <div className="muted">暂无最新观测</div>}
        {latest.map((m) => (
          <div key={m.metric} className="card" style={{ padding: '12px 16px' }}>
            <div className="muted" style={{ fontSize: 12 }}>
              {METRICS.find((x) => x.key === m.metric)?.name ?? m.metric}
            </div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>
              {m.value}
              <span style={{ fontSize: 12, fontWeight: 400 }} className="muted">
                {' '}
                {m.unit}
              </span>
            </div>
            <div style={{ marginTop: 4 }}>
              <SourceTag source={m.sourceType} />
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => setMetric(m.key)}
                className={metric === m.key ? 'btn-primary' : ''}
                style={{
                  padding: '5px 12px',
                  fontSize: 13,
                  border: '1px solid var(--tw-border)',
                  borderRadius: 6,
                  background: metric === m.key ? undefined : '#fff',
                  color: metric === m.key ? undefined : 'var(--tw-text)',
                  cursor: 'pointer',
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setMinutes(r.minutes)}
                style={{
                  padding: '5px 10px',
                  fontSize: 12,
                  border: '1px solid var(--tw-border)',
                  borderRadius: 6,
                  background: minutes === r.minutes ? 'var(--tw-primary-800)' : '#fff',
                  color: minutes === r.minutes ? '#fff' : 'var(--tw-text)',
                  cursor: 'pointer',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {historyQ.isLoading ? (
          <div className="state-box">历史加载中…</div>
        ) : rows.length === 0 ? (
          <div className="state-box">
            所选时间范围无「{metricMeta.name}」数据
            <div className="muted" style={{ fontSize: 12 }}>
              可运行 S1 场景发布器产生模拟数据（见 simulator/README.md）
            </div>
          </div>
        ) : (
          <Chart rows={rows} name={metricMeta.name} unit={metricMeta.unit} />
        )}
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          数据按观测时间（observedAt）组织；最近入库时间 <RelativeTime iso={latest[0]?.ingestedAt} />
          {rows.some((r) => r.scenarioId) && '　场景：' + [...new Set(rows.map((r) => r.scenarioId).filter(Boolean))].join(', ')}
        </div>
      </div>
    </div>
  );
}

function Chart({ rows, name, unit }: { rows: Observation[]; name: string; unit: string }) {
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
        },
      ],
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [rows, name, unit]);

  return <div ref={ref} style={{ width: '100%', height: 320 }} />;
}
