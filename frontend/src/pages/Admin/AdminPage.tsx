import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type Diagnostics, type IngestionErrorItem } from '@/services/apiClient';
import { useStreamState } from '@/store/stream';
import OfficialAutoPanel from '@/components/OfficialAutoPanel';
import { ScenarioConsole } from '@/components/ScenarioConsole';
import { Card, EmptyState, PageHeader, Tag } from '@/components/ui';
import MonthlyImportPanel from './MonthlyImportPanel';
import './admin.css';

const REASON_TEXT: Record<string, string> = {
  INVALID_JSON: '非法 JSON',
  SCHEMA_VIOLATION: '契约校验失败',
  TOPIC_MISMATCH: 'Topic 与断面不符',
  UNKNOWN_REACH: '未知监测点',
  UNKNOWN_METRIC: '未知指标',
  UNIT_MISMATCH: '单位不一致',
  OUT_OF_RANGE: '超出量程',
};

const TABS = [
  { key: 'status', label: '数据源与运行状态' },
  { key: 'import', label: '官方月报导入' },
  { key: 'realtime', label: '官方实时数据' },
  { key: 'scenario', label: '场景控制台' },
  { key: 'help', label: '系统说明与帮助' },
];

export default function AdminPageV2() {
  const streamState = useStreamState();
  const [tab, setTab] = useState('status');

  return (
    <div className="tw-stack">
      <PageHeader
        code="P12"
        title="数据与系统管理"
        badges={<Tag tone={streamState === 'open' ? 'ok' : 'muted'}>实时 {streamState === 'open' ? '已连接' : '未连接'}</Tag>}
        description="数据源、官方月报导入、运行诊断与说明；模拟/官方数据物理隔离，本页不提供密钥与环境配置修改。"
      />

      <div className="tw-admin-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={`tw-admin-tab ${tab === t.key ? 'is-active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'status' && <SystemStatus />}
      {tab === 'import' && <MonthlyImportPanel />}
      {tab === 'realtime' && <OfficialAutoPanel />}
      {tab === 'scenario' && <ScenarioConsole />}
      {tab === 'help' && <HelpPanel />}
    </div>
  );
}

function SystemStatus() {
  const healthQ = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 10000 });
  const diagQ = useQuery({ queryKey: ['diagnostics'], queryFn: api.diagnostics, refetchInterval: 10000 });
  const [showAll, setShowAll] = useState(false);

  if (healthQ.isLoading) return <div className="state-box">检测中…</div>;
  if (healthQ.isError)
    return (
      <div className="state-box">
        后端不可达：{(healthQ.error as Error).message}
      </div>
    );

  const d = diagQ.data as Diagnostics | undefined;
  const errors = (d?.latestErrors ?? []) as IngestionErrorItem[];

  return (
    <div className="tw-stack">
      <Card title="服务与数据源">
        <div className="tw-admin-kv">
          <Kv k="服务状态" v={healthQ.data?.status} ok={healthQ.data?.status === 'ok'} />
          <Kv k="数据库" v={healthQ.data?.database} ok={healthQ.data?.database === 'ok'} />
          <Kv k="应用版本" v={healthQ.data?.version} />
          {d && (
            <>
              <Kv k="MQTT" v={d.mqtt.enabled ? `启用 ${d.mqtt.host}:${d.mqtt.port}` : '未启用'} ok={d.mqtt.enabled} />
              <Kv k="陈旧判定" v={`${d.mqtt.staleSeconds} 秒无数据 → STALE`} />
              <Kv k="规则版本" v={`${d.ruleVersion}（${d.ruleLabel ?? ''}）`} />
            </>
          )}
        </div>
      </Card>

      {d && (
        <Card title="数据统计">
          <div className="tw-admin-stats">
            <Stat label="在线断面" value={d.counts.reachesOnline} tone="ok" />
            <Stat label="陈旧断面" value={d.counts.reachesStale} tone="watch" />
            <Stat label="离线断面" value={d.counts.reachesOffline} tone="off" />
            <Stat label="观测记录" value={d.counts.observations} />
            <Stat label="已处理消息" value={d.counts.processedMessages} />
            <Stat label="重复消息" value={d.counts.duplicateMessages} tone="watch" />
            <Stat label="坏消息（死信）" value={d.counts.ingestionErrors} tone="danger" />
          </div>
        </Card>
      )}

      <Card
        title="最近坏消息（ingestion_errors）"
        actions={<button className="tw-btn-ghost" onClick={() => diagQ.refetch()}>刷新</button>}
      >
        {errors.length === 0 ? (
          <EmptyState title="暂无死信，消息链路健康" />
        ) : (
          <>
            <table className="tw-admin-table">
              <thead>
                <tr><th>时间</th><th>原因</th><th>Topic</th><th>详情</th></tr>
              </thead>
              <tbody>
                {(showAll ? errors : errors.slice(0, 8)).map((e) => (
                  <tr key={e.errorId}>
                    <td className="tw-tiny">{e.receivedAt ? new Date(e.receivedAt).toLocaleString('zh-CN') : ''}</td>
                    <td><Tag tone="danger">{REASON_TEXT[e.reason] ?? e.reason}</Tag></td>
                    <td className="tw-tiny">{e.topic ?? '—'}</td>
                    <td className="tw-tiny">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {errors.length > 8 && (
              <button className="tw-btn-ghost" onClick={() => setShowAll((v) => !v)}>
                {showAll ? '收起' : `展开全部 ${errors.length} 条`}
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function HelpPanel() {
  return (
    <Card title="系统说明与数据口径">
      <ul className="tw-admin-help">
        <li><b>数据来源</b>：MQTT 模拟观测（SIMULATED，教学链路）、官方自动站快照（OFFICIAL_AUTO，每日离散）、官方历史月报（人工导入）、现场人工记录（MANUAL）。</li>
        <li><b>隔离原则</b>：模拟与官方数据分表、分来源标签；官方快照不插值、不画连续曲线；月报导入按批次可追溯、可整批撤销。</li>
        <li><b>阈值口径</b>：界面阈值为 demo-rules-v1 教学阈值，非真实防汛/预警标准。</li>
        <li><b>状态与评估</b>：事件/任务状态由状态机人工合法操作驱动；恢复评估为只读规则输出，不自动改状态。</li>
        <li><b>未接入能力</b>：密钥、环境变量、规则在线编辑、模型/AI 配置在本系统中未开放管理入口（展示为未接入，不提供修改）。</li>
        <li><b>免责声明</b>：本系统为竞赛原型，监测结论不替代专业部门判断；时序先后不代表因果。</li>
      </ul>
    </Card>
  );
}

function Kv({ k, v, ok }: { k: string; v?: string; ok?: boolean }) {
  return (
    <div className="tw-admin-kv-row">
      <span className="tw-tiny">{k}</span>
      <span className={ok === undefined ? '' : ok ? 'tw-kv-ok' : 'tw-kv-bad'}>{v ?? '—'}</span>
    </div>
  );
}
function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'watch' | 'off' | 'danger' }) {
  return (
    <div className={`tw-admin-stat ${tone ? `tone-${tone}` : ''}`}>
      <div className="tw-admin-stat-v">{value}</div>
      <div className="tw-tiny">{label}</div>
    </div>
  );
}
