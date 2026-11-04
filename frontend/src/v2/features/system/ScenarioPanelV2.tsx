import { useState } from 'react';
import { api, ApiError } from '@/services/apiClient';
import { Icon } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';
import type { ScenarioStatus } from './scenarioTypes';

const SCENARIOS = [
  { id: 'S1', name: 'S1 稳定基线', desc: '三断面正常，零异常事件', speed: 12, tone: 'calm' },
  { id: 'S2', name: 'S2 A→B 变化', desc: '单事件、范围 A/B、时序 9 分钟', speed: 10, tone: 'watch' },
  { id: 'S3', name: 'S3 A→B→C', desc: '范围扩到三断面（Golden Demo）', speed: 10, tone: 'alert' },
  { id: 'S4', name: 'S4 反例', desc: 'C 稳定不扩展，假设被反证', speed: 12, tone: 'level' },
  { id: 'S5', name: 'S5 离线盲区', desc: '关键观察点 C 中断形成盲区', speed: 12, tone: 'watch' },
];

export function ScenarioPanelV2({
  status, error, loading, onRefresh,
}: {
  status?: ScenarioStatus;
  error?: Error | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const [draftId, setDraftId] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmStart, setConfirmStart] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const running = !!status?.running;
  const active = running ? SCENARIOS.find((s) => s.id === status?.scenario) : undefined;
  const draft = SCENARIOS.find((s) => s.id === draftId);
  const alternatives = SCENARIOS.filter((s) => s.id !== active?.id);

  async function start() {
    if (!draft) return;
    setBusy(true); setActionError(''); setNotice('');
    try {
      await api.startScenario(draft.id, draft.speed);
      setNotice(`已启动 ${draft.name}；模拟数据将经 MQTT 链路进入系统。`);
      setConfirmStart(false);
      setDraftId('');
      onRefresh();
    } catch (exc) {
      setActionError(exc instanceof ApiError ? exc.message : (exc as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    setBusy(true); setActionError(''); setNotice('');
    try {
      await api.stopScenario();
      setNotice('已发送停止指令。');
      setConfirmStop(false);
      onRefresh();
    } catch (exc) {
      setActionError(exc instanceof ApiError ? exc.message : (exc as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      code="04"
      title="演示场景"
      en="DEMO SCENARIO"
      className="scenario-panel"
      footer={
        <div className="scenario-actions">
          <span className="scenario-actions__note">
            SIMULATED · 启动会写入模拟观测，需二次确认
          </span>
          {running ? (
            <button type="button" className="v2-btn v2-btn--danger v2-btn--sm" onClick={() => setConfirmStop(true)}>
              停止当前场景
            </button>
          ) : (
            <button
              type="button"
              className="v2-btn v2-btn--primary v2-btn--sm"
              disabled={!draft || busy}
              onClick={() => setConfirmStart(true)}
            >
              启动选中场景
            </button>
          )}
        </div>
      }
    >
      {loading && !status && <div className="v2-sys-inline-muted">场景状态加载中…</div>}
      {error && !status && <div className="v2-sys-inline-error">场景状态加载失败：{error.message}</div>}

      {active ? (
        <div className={`scenario-current scenario-current--${active.tone}`}>
          <div className="scenario-current__head">
            <span className="v2-mono">{active.id}</span>
            <span className="scenario-current__active"><span className="v2-status-dot" style={{ width: 5, height: 5 }} />当前场景</span>
            <span className="scenario-current__window v2-mono">
              {status?.startedAt ?? '运行中'}
            </span>
          </div>
          <b className="scenario-current__name">{active.name}</b>
          <p>{active.desc}</p>
          <div className="scenario-tags">
            <span>SIMULATED</span>
            <span>速度 {status?.speed ?? active.speed}x</span>
            {status?.finishedAt && <span>完成 {status.finishedAt}</span>}
          </div>
        </div>
      ) : (
        <div className="scenario-current scenario-current--calm">
          <div className="scenario-current__head">
            <span className="v2-mono">IDLE</span>
            <span className="scenario-current__active"><span className="v2-status-dot v2-status-dot--idle" style={{ width: 5, height: 5 }} />空闲</span>
            <span className="scenario-current__window v2-mono">
              {status?.finishedAt ? `最近完成 ${status.finishedAt}` : '未启动'}
            </span>
          </div>
          <b className="scenario-current__name">当前无运行场景</b>
          <p>选择 S1–S5 后启动；场景经 MQTT 模拟链路生成数据。</p>
        </div>
      )}

      <div className="scenario-options">
        <span className="scenario-options__label">
          可选场景 <span className="v2-mono">{String(alternatives.length).padStart(2, '0')}</span>
        </span>
        {alternatives.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className={`scenario-option ${draftId === scenario.id ? 'is-selected' : ''}`.trim()}
            onClick={() => { setDraftId(scenario.id); setNotice(''); setActionError(''); }}
            aria-pressed={draftId === scenario.id}
            disabled={running}
          >
            <span className={`scenario-option__dot scenario-option__dot--${scenario.tone}`} />
            <span className="scenario-option__main">
              <b>{scenario.name}</b>
              <em>{scenario.desc}</em>
            </span>
            <span className="scenario-option__radio">
              {draftId === scenario.id && <Icon name="check" size={10} />}
            </span>
          </button>
        ))}
      </div>

      {confirmStart && draft && (
        <div className="v2-sys-confirm v2-sys-confirm--block">
          <span>确认启动 <b>{draft.name}</b>？将向 MQTT 写入模拟观测，可能触发事件与任务。</span>
          <div>
            <button type="button" className="v2-btn v2-btn--primary v2-btn--sm" disabled={busy} onClick={() => void start()}>{busy ? '启动中…' : '确认启动'}</button>
            <button type="button" className="v2-btn v2-btn--ghost v2-btn--sm" onClick={() => setConfirmStart(false)}>取消</button>
          </div>
        </div>
      )}
      {confirmStop && (
        <div className="v2-sys-confirm v2-sys-confirm--block">
          <span>停止会终止当前模拟数据流，确认停止？</span>
          <div>
            <button type="button" className="v2-btn v2-btn--danger v2-btn--sm" disabled={busy} onClick={() => void stop()}>{busy ? '停止中…' : '确认停止'}</button>
            <button type="button" className="v2-btn v2-btn--ghost v2-btn--sm" onClick={() => setConfirmStop(false)}>取消</button>
          </div>
        </div>
      )}

      {notice && <div className="v2-sys-inline-ok">{notice}</div>}
      {actionError && <div className="v2-sys-inline-error">{actionError}</div>}
    </Panel>
  );
}
