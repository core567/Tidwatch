import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { OnlineBadge } from '@/components/StatusBits';
import SourceTag from '@/components/SourceTag';
import {
  Button,
  DataStateBadge,
  EmptyState,
  MiniSparkline,
  Stat,
  Tag,
} from '@/components/ui';
import { EventStatusBadge, shortTime } from '@/components/EventBits';
import {
  OFFICIAL_METRICS,
  formatOfficialValue,
  simMetricName,
  simMetricUnit,
  waterClassTone,
} from '@/lib/metrics';
import type { Reach } from '@/types/contract';

/** 3D 节点详情：官方实时快照 + MQTT 模拟趋势 + 关联事件 + 跳转。 */
export default function NodeDetailPanel({
  reach,
  onClose,
}: {
  reach: Reach;
  onClose: () => void;
}) {
  const navigate = useNavigate();

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
  const seriesQ = useQuery({
    queryKey: ['obs', reach.reachId, 'turbidity', 'spark'],
    queryFn: () =>
      api.observations(reach.reachId, { metric: 'turbidity', order: 'asc', pageSize: 24 }),
    refetchInterval: 8000,
  });
  const eventsQ = useQuery({
    queryKey: ['events', 'ACTIVE', reach.reachId],
    queryFn: () => api.events({ status: 'ACTIVE', reachId: reach.reachId, pageSize: 5 }),
    refetchInterval: 10000,
  });

  const official = (officialQ.data ?? [])[0];
  const record = official?.records?.[0];
  const simulated = latestQ.data ?? [];
  const series = (seriesQ.data?.items ?? []).map((o) => ({
    value: o.value,
    label: shortTime(o.observedAt),
  }));
  const events = eventsQ.data?.items ?? [];

  return (
    <aside
      style={{
        position: 'absolute',
        right: 14,
        top: 14,
        width: 320,
        maxHeight: 'calc(100% - 28px)',
        overflowY: 'auto',
        background: 'rgba(255,255,255,.97)',
        borderRadius: 10,
        boxShadow: '0 6px 24px rgba(8,31,56,.18)',
        padding: 16,
      }}
    >
      <div className="tw-row-between" style={{ marginBottom: 6 }}>
        <div className="tw-row">
          <b style={{ fontSize: 16, color: 'var(--tw-primary-800)' }}>{reach.name}</b>
          <OnlineBadge status={reach.onlineStatus} />
        </div>
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16, color: '#8aa0b8' }}
          aria-label="返回全景"
        >
          ✕
        </button>
      </div>
      <div className="tw-tiny" style={{ marginBottom: 12 }}>
        {reach.reachId} · 坐标未核实，当前为示意拓扑
      </div>

      <div className="tw-row-between" style={{ marginBottom: 6 }}>
        <span className="tw-section-title" style={{ margin: 0 }}>
          官方实时水质
        </span>
        <SourceTag source="OFFICIAL_AUTO" />
      </div>
      {official ? (
        <>
          <div className="tw-row" style={{ marginBottom: 8 }}>
            <DataStateBadge state={official.dataState} />
            {record?.waterClass && (
              <Tag tone={waterClassTone(record.waterClass)}>{record.waterClass} 类</Tag>
            )}
            <span className="tw-tiny">{official.stationName}</span>
          </div>
          <div className="tw-tiny" style={{ marginBottom: 8 }}>
            观测 {record ? new Date(record.observedAt).toLocaleString('zh-CN', { hour12: false }) : '—'}
            {record?.mappingStatus === 'UNVERIFIED' ? ' · 上下游对应待核' : ''}
          </div>
          {record ? (
            <div className="tw-stat-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {OFFICIAL_METRICS.slice(0, 4).map((def) => (
                <Stat
                  key={def.key as string}
                  label={def.label}
                  value={formatOfficialValue(record, def)}
                  digits={def.digits}
                  unit={def.unit}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="官方暂无该站数据" description="无数据不等于现场正常。" />
          )}
        </>
      ) : (
        <div className="tw-tiny">官方数据未拉取（可在系统管理手动拉取）</div>
      )}

      <div style={{ marginTop: 14, borderTop: '1px solid #eef2f7', paddingTop: 10 }}>
        <div className="tw-row-between" style={{ marginBottom: 6 }}>
          <span className="tw-section-title" style={{ margin: 0 }}>
            模拟观测趋势
          </span>
          <SourceTag source="SIMULATED" />
        </div>
        {simulated.length === 0 ? (
          <div className="tw-tiny">暂无模拟观测</div>
        ) : (
          <>
            <div className="tw-row" style={{ gap: 12, fontSize: 13 }}>
              {simulated.map((m) => (
                <span key={m.metric} className="tw-muted">
                  {simMetricName(m.metric)}{' '}
                  <b style={{ color: 'var(--tw-primary-800)' }}>{m.value}</b>{' '}
                  {simMetricUnit(m.unit, m.metric)}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 6 }}>
              <MiniSparkline points={series} height={42} unit="NTU" emptyText="暂无连续浊度序列" />
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 14, borderTop: '1px solid #eef2f7', paddingTop: 10 }}>
        <div className="tw-row-between" style={{ marginBottom: 6 }}>
          <span className="tw-section-title" style={{ margin: 0 }}>
            关联活动事件
          </span>
          <span className="tw-tiny">{eventsQ.data?.total ?? 0} 起</span>
        </div>
        {events.length === 0 ? (
          <div className="tw-tiny">本断面暂无未闭环事件</div>
        ) : (
          events.map((e) => (
            <button
              key={e.eventId}
              type="button"
              onClick={() => navigate(`/events/${e.eventId}/workbench`)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                border: 'none',
                background: 'none',
                padding: '5px 0',
                cursor: 'pointer',
              }}
            >
              <div className="tw-row-between">
                <span style={{ fontSize: 13, color: 'var(--tw-primary-800)' }}>{e.title}</span>
                <EventStatusBadge status={e.status} />
              </div>
            </button>
          ))
        )}
      </div>

      <div className="tw-row" style={{ marginTop: 14 }}>
        <Button size="sm" onClick={() => navigate(`/reaches/${reach.reachId}`)}>
          断面详情
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            events[0] ? navigate(`/events/${events[0].eventId}/workbench`) : navigate('/events')
          }
        >
          查看事件
        </Button>
      </div>
    </aside>
  );
}
