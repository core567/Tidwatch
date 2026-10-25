import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import { OnlineBadge } from '@/components/StatusBits';
import SourceTag from '@/components/SourceTag';
import {
  Button,
  DataStateBadge,
  EmptyState,
  MiniSparkline,
  Tag,
} from '@/components/ui';
import { EventStatusBadge, formatTime, shortTime } from '@/components/EventBits';
import {
  OFFICIAL_METRICS,
  formatOfficialValue,
  simMetricName,
  simMetricUnit,
  waterClassTone,
} from '@/lib/metrics';
import { EVENT_ACTION_LABEL } from '@/lib/eventActions';
import type { ActiveEvent, Observation, Reach, Recommendation } from '@/types/contract';

/** 3D 节点详情：官方快照 / MQTT 模拟 / 关联事件与按状态机动态操作。 */
export default function NodeDetailPanel({
  reach,
  onClose,
}: {
  reach: Reach;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const officialQ = useQuery({
    queryKey: ['official-auto', reach.reachId],
    queryFn: () => api.officialAuto(reach.reachId),
    refetchInterval: 60000,
  });
  const latestQ = useQuery({
    queryKey: ['latest', reach.reachId],
    queryFn: () => api.latest(reach.reachId),
    refetchInterval: 8000,
  });
  const turbQ = useQuery({
    queryKey: ['obs', reach.reachId, 'turbidity', 'spark'],
    queryFn: () =>
      api.observations(reach.reachId, { metric: 'turbidity', order: 'asc', pageSize: 24 }),
    refetchInterval: 8000,
  });
  const eventsQ = useQuery({
    queryKey: ['events', 'ACTIVE', reach.reachId],
    queryFn: () => api.events({ status: 'ACTIVE', reachId: reach.reachId, pageSize: 5 }),
    refetchInterval: 8000,
  });

  const official = (officialQ.data ?? [])[0];
  const record = official?.records?.[0];
  const simulated = (latestQ.data ?? []) as Observation[];
  const byMetric = new Map(simulated.map((m) => [m.metric, m]));
  const goodObs = simulated.filter((m) => m.qualityFlag === 'GOOD');
  const latestValidAt = goodObs
    .map((m) => m.observedAt)
    .sort()
    .at(-1);
  const series = (turbQ.data?.items ?? []).map((o) => ({
    value: o.value,
    label: shortTime(o.observedAt),
  }));
  const events = (eventsQ.data?.items ?? []) as ActiveEvent[];
  const activeEvent = events[0];

  async function runAction(action: keyof typeof EVENT_ACTION_LABEL) {
    if (!activeEvent) return;
    setActionError('');
    setBusy(action);
    try {
      await api.eventAction(activeEvent.eventId, action);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: ['event', activeEvent.eventId] }),
      ]);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <aside className="tw-node-panel">
      <div className="tw-row-between" style={{ marginBottom: 4 }}>
        <div className="tw-row">
          <b style={{ fontSize: 16, color: 'var(--tw-primary-800)' }}>{reach.name}</b>
          <OnlineBadge status={reach.onlineStatus} />
        </div>
        <button className="tw-icon-btn" onClick={onClose} aria-label="返回全景">
          ×
        </button>
      </div>
      <div className="tw-tiny" style={{ marginBottom: 12 }}>
        {reach.role === 'upstream' ? '上游' : reach.role === 'midstream' ? '中游' : '下游'} ·{' '}
        {reach.reachId} · 示意拓扑，坐标未核实
      </div>

      {/* 官方快照 */}
      <div className="tw-row-between" style={{ marginBottom: 6 }}>
        <span className="tw-section-title" style={{ margin: 0 }}>官方实时水质</span>
        {official && official.dataState !== 'LIVE' && <DataStateBadge state={official.dataState} />}
      </div>
      {!official ? (
        <div className="tw-tiny">官方数据未拉取（可在数据与系统管理手动拉取）</div>
      ) : !record ? (
        <EmptyState title="官方暂无该站数据" description="无数据不等于现场正常。" />
      ) : (
        <>
          <div className="tw-row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <SourceTag source="OFFICIAL_AUTO" />
            {record.waterClass && (
              <Tag tone={waterClassTone(record.waterClass)}>{record.waterClass} 类</Tag>
            )}
            <span className="tw-tiny">{official.stationName}</span>
          </div>
          <div className="tw-tiny" style={{ marginBottom: 8 }}>
            观测 {formatTime(record.observedAt)}
            {record.mappingStatus === 'UNVERIFIED' ? ' · 上下游对应待核' : ''}
          </div>
          <div className="tw-node-metric-grid">
            {['ph', 'dissolvedOxygen', 'ammoniaN'].map((key) => {
              const def = OFFICIAL_METRICS.find((m) => m.key === key)!;
              return (
                <div key={key} className="tw-stat">
                  <div className="tw-stat-label">{def.label}</div>
                  <div className="tw-stat-value" style={{ fontSize: 17 }}>
                    {formatOfficialValue(record, def) ?? '—'}
                    {def.unit ? <small>{def.unit}</small> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* MQTT 模拟观测 */}
      <div className="tw-node-divider">
        <div className="tw-row-between" style={{ marginBottom: 6 }}>
          <span className="tw-section-title" style={{ margin: 0 }}>连续观测（含水位/浊度）</span>
          <SourceTag source="SIMULATED" />
        </div>
        <div className="tw-tiny" style={{ marginBottom: 6 }}>
          最近有效观测：{latestValidAt ? formatTime(latestValidAt) : '暂无有效观测'}
        </div>
        {simulated.length === 0 ? (
          <div className="tw-tiny">暂无有效观测（MQTT 未接入或尚未上报），历史观测不冒充实时数据。</div>
        ) : (
          <>
            <div className="tw-node-metric-grid">
              {(['waterLevel', 'flowLevel', 'turbidity'] as const).map((key) => {
                const m = byMetric.get(key);
                return (
                  <div key={key} className="tw-stat">
                    <div className="tw-stat-label">{simMetricName(key)}</div>
                    <div className="tw-stat-value" style={{ fontSize: 17 }}>
                      {m ? m.value : '—'}
                      {m ? <small>{simMetricUnit(m.unit, key)}</small> : null}
                    </div>
                    {m && m.qualityFlag !== 'GOOD' && (
                      <div className="tw-stat-hint">质量 {m.qualityFlag}</div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="tw-tiny" style={{ marginTop: 6, color: 'var(--tw-watch)' }}>
              流量真实数据源未接入，「{simMetricName('flowLevel')}」为模拟代理值，非实测流量。
            </div>
            <div style={{ marginTop: 6 }}>
              <MiniSparkline points={series} height={42} unit="NTU" emptyText="暂无连续浊度序列" />
            </div>
          </>
        )}
      </div>

      {/* 关联活动事件 + 状态机操作 */}
      <div className="tw-node-divider">
        <div className="tw-row-between" style={{ marginBottom: 6 }}>
          <span className="tw-section-title" style={{ margin: 0 }}>关联活动事件</span>
          <span className="tw-tiny">{eventsQ.data?.total ?? 0} 起</span>
        </div>
        {!activeEvent ? (
          <div className="tw-tiny">本断面暂无未闭环事件。</div>
        ) : (
          <ActiveEventBlock event={activeEvent} busy={busy} onAction={runAction} error={actionError} />
        )}
      </div>

      <div className="tw-row" style={{ marginTop: 14, flexWrap: 'wrap', gap: 8 }}>
        <Button size="sm" onClick={() => navigate(`/reaches/${reach.reachId}`)}>断面详情</Button>
        <Button size="sm" variant="ghost" onClick={() => navigate('/')}>返回总览</Button>
        {activeEvent && (
          <Button size="sm" variant="ghost" onClick={() => navigate(`/events/${activeEvent.eventId}/workbench`)}>
            进入研判
          </Button>
        )}
      </div>
    </aside>
  );
}

function ActiveEventBlock({
  event,
  busy,
  onAction,
  error,
}: {
  event: ActiveEvent;
  busy: string | null;
  onAction: (a: keyof typeof EVENT_ACTION_LABEL) => void;
  error: string;
}) {
  const detailQ = useQuery({
    queryKey: ['event', event.eventId],
    queryFn: () => api.event(event.eventId),
    refetchInterval: 10000,
  });
  const recQ = useQuery({
    queryKey: ['event-recs', event.eventId],
    queryFn: () => api.eventRecommendations(event.eventId),
    refetchInterval: 30000,
  });

  const allowed = detailQ.data?.allowedActions ?? [];
  const recs = (recQ.data?.items ?? []) as Recommendation[];

  return (
    <div>
      <div className="tw-node-event">
        <div className="tw-row-between">
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--tw-primary-800)' }}>
            {event.title}
          </span>
          <EventStatusBadge status={event.status} />
        </div>
        <div className="tw-tiny" style={{ marginTop: 3 }}>
          {event.trigger
            ? `触发 ${simMetricName(event.trigger.metric)} · ${event.trigger.direction} · 幅度 ${event.trigger.magnitude.toFixed(2)}`
            : '持续变化触发'}
          {' '}· 发现 {shortTime(event.firstSeenAt)} · <SourceTag source="SIMULATED" />
        </div>
      </div>

      {recs.length > 0 && (
        <div className="tw-node-recs">
          {recs.slice(0, 3).map((r) => (
            <div key={r.code} className="tw-tiny" title={r.reason}>
              <Tag tone={r.priority === 'HIGH' ? 'danger' : r.priority === 'LOW' ? 'muted' : 'watch'}>
                {r.title}
              </Tag>
            </div>
          ))}
        </div>
      )}

      <div className="tw-node-actions">
        {allowed.length === 0 && <span className="tw-tiny">当前状态暂无可执行动作</span>}
        {allowed.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={a === 'ESCALATE' || a === 'MARK_UNRESOLVED' ? 'danger' : 'ghost'}
            disabled={busy !== null}
            onClick={() => onAction(a)}
          >
            {busy === a ? '执行中…' : EVENT_ACTION_LABEL[a] ?? a}
          </Button>
        ))}
      </div>
      {error && <div className="tw-tiny" style={{ color: 'var(--tw-danger)', marginTop: 6 }}>{error}</div>}
      <div className="tw-tiny" style={{ marginTop: 6 }}>
        动作由后端状态机校验，非法迁移会被拒绝（409），前端不硬编码转换。
      </div>
    </div>
  );
}
