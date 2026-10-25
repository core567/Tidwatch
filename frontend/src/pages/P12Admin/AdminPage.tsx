import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Diagnostics, type IngestionErrorItem } from '@/services/apiClient';
import { useRealtimeStream } from '@/services/useRealtimeStream';
import { ScenarioConsole } from '@/components/ScenarioConsole';
import OfficialAutoPanel from '@/components/OfficialAutoPanel';
import { PageHeader } from '@/components/ui';

const REASON_TEXT: Record<string, string> = {
  INVALID_JSON: '非法 JSON',
  SCHEMA_VIOLATION: '契约校验失败',
  TOPIC_MISMATCH: 'Topic 与断面不符',
  UNKNOWN_REACH: '未知监测点',
  UNKNOWN_METRIC: '未知指标',
  UNIT_MISMATCH: '单位不一致',
  OUT_OF_RANGE: '超出量程',
};

export default function AdminPage() {
  const streamState = useRealtimeStream();
  const [showAllErrors, setShowAllErrors] = useState(false);

  const healthQ = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 10000,
  });
  const diagQ = useQuery({
    queryKey: ['diagnostics'],
    queryFn: api.diagnostics,
    refetchInterval: 10000,
  });


  if (healthQ.isLoading) return <div className="state-box">检测中…</div>;
  if (healthQ.isError)
    return (
      <div className="state-box">
        后端不可达：{(healthQ.error as Error).message}
        <div className="muted" style={{ marginTop: 6 }}>
          启动：backend/.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
          <br />
          需要 MQTT 时加环境变量 MQTT_ENABLED=true
        </div>
      </div>
    );

  const d = diagQ.data as Diagnostics | undefined;

  return (
    <div>
      <PageHeader
        code="P12"
        title="系统管理与运行诊断"
        description="服务健康、数据链路、官方实时数据拉取与场景控制。本地演示模式免登录。"
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>服务</div>
        <Kv k="服务状态" v={healthQ.data?.status} ok={healthQ.data?.status === 'ok'} />
        <Kv k="数据库" v={healthQ.data?.database} ok={healthQ.data?.database === 'ok'} />
        <Kv k="应用版本" v={healthQ.data?.version} />
        <Kv
          k="SSE 实时通道（本浏览器）"
          v={streamState === 'open' ? '已连接' : streamState === 'connecting' ? '连接中' : '未连接'}
          ok={streamState === 'open'}
        />
      </div>

      {d && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>MQTT 数据链路</div>
            <Kv
              k="入库服务"
              v={d.mqtt.enabled ? '已启用（随服务启动）' : '未启用（MQTT_ENABLED=true 开启）'}
              ok={d.mqtt.enabled}
            />
            <Kv k="Broker" v={`${d.mqtt.host}:${d.mqtt.port}`} />
            <Kv k="订阅前缀" v={d.mqtt.topicPrefix} />
            <Kv k="陈旧阈值" v={`${d.mqtt.staleSeconds} 秒无数据 → STALE`} />
            <Kv k="规则版本" v={`${d.ruleVersion}（${d.ruleLabel ?? ''}）`} />
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>数据统计</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
              <Stat label="在线断面" value={d.counts.reachesOnline} tone="ok" />
              <Stat label="陈旧断面" value={d.counts.reachesStale} tone="watch" />
              <Stat label="离线断面" value={d.counts.reachesOffline} tone="off" />
              <Stat label="观测记录" value={d.counts.observations} />
              <Stat label="已处理消息" value={d.counts.processedMessages} />
              <Stat label="重复消息" value={d.counts.duplicateMessages} tone="watch" />
              <Stat label="坏消息（死信）" value={d.counts.ingestionErrors} tone="danger" />
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>最近坏消息（ingestion_errors）</div>
              <button className="btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => diagQ.refetch()}>
                刷新
              </button>
            </div>
            {d.latestErrors.length === 0 && <div className="muted">暂无死信，消息链路健康</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--tw-text-secondary)' }}>
                  <th style={{ padding: 6 }}>时间</th>
                  <th style={{ padding: 6 }}>原因</th>
                  <th style={{ padding: 6 }}>Topic</th>
                  <th style={{ padding: 6 }}>详情</th>
                </tr>
              </thead>
              <tbody>
                {(showAllErrors ? d.latestErrors : d.latestErrors.slice(0, 5)).map((e: IngestionErrorItem) => (
                  <tr key={e.errorId} style={{ borderTop: '1px solid var(--tw-border)' }}>
                    <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                      {e.receivedAt ? new Date(e.receivedAt).toLocaleTimeString('zh-CN') : ''}
                    </td>
                    <td style={{ padding: 6 }}>
                      <span className="badge badge-danger">{REASON_TEXT[e.reason] ?? e.reason}</span>
                    </td>
                    <td style={{ padding: 6 }} className="muted">
                      {e.topic ?? '—'}
                    </td>
                    <td style={{ padding: 6 }} className="muted">
                      {e.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {d.latestErrors.length > 5 && (
              <button
                style={{ marginTop: 10, border: 'none', background: 'none', color: 'var(--tw-accent)', cursor: 'pointer' }}
                onClick={() => setShowAllErrors((v) => !v)}
              >
                {showAllErrors ? '收起' : `展开全部 ${d.latestErrors.length} 条`}
              </button>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <OfficialAutoPanel />
      </div>

      <ScenarioConsole />
    </div>
  );
}

function Kv({ k, v, ok }: { k: string; v?: string; ok?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 13.5, maxWidth: 640 }}>
      <span className="muted">{k}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {ok !== undefined && <span className={`badge ${ok ? 'badge-ok' : 'badge-offline'}`}>{ok ? '正常' : '异常'}</span>}
        {v}
      </span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'watch' | 'danger' | 'off' }) {
  const color = {
    ok: 'var(--tw-ok)',
    watch: 'var(--tw-watch)',
    danger: 'var(--tw-danger)',
    off: 'var(--tw-offline)',
  }[tone ?? 'off'];
  return (
    <div style={{ border: '1px solid var(--tw-border)', borderRadius: 8, padding: '10px 14px' }}>
      <div className="muted" style={{ fontSize: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: tone ? color : 'var(--tw-primary-800)' }}>{value}</div>
    </div>
  );
}
