import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';

interface ScenarioMeta {
  id: string;
  name: string;
  desc: string;
  speed: number;
}
const SCENARIOS: ScenarioMeta[] = [
  { id: 'S1', name: 'S1 稳定基线', desc: '三断面正常，零异常事件', speed: 12 },
  { id: 'S2', name: 'S2 A→B 变化', desc: '单事件、范围 A/B、时序 9 分钟', speed: 10 },
  { id: 'S3', name: 'S3 A→B→C', desc: '范围扩到三断面（Golden Demo）', speed: 10 },
  { id: 'S4', name: 'S4 反例', desc: 'C 稳定不扩展，假设被反证', speed: 12 },
  { id: 'S5', name: 'S5 离线盲区', desc: '关键观察点 C 中断形成盲区', speed: 12 },
];

export function ScenarioConsole() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const statusQ = useQuery({
    queryKey: ['scenario-status'],
    queryFn: api.scenarioStatus,

    refetchInterval: 2000,
  });
  const status = statusQ.data;
  // 演示模式免登录：场景控制台对所有访问者开放
  const isAdmin = true;

  async function start(s: ScenarioMeta) {
    setError('');
    setBusy(s.id);
    try {
      await api.startScenario(s.id, s.speed);
      queryClient.invalidateQueries({ queryKey: ['scenario-status'] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  async function stop() {
    await api.stopScenario();
    queryClient.invalidateQueries({ queryKey: ['scenario-status'] });
  }

  if (!isAdmin) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <b>场景控制台</b>
        <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
          场景由 MQTT 模拟数据驱动，仅管理员可在 P12 启动；也可在服务器运行 simulator/run_scenario.py
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <b style={{ fontSize: 15 }}>场景控制台（经真实 MQTT 链路）</b>
        {status?.running ? (
          <>
            <span className="badge badge-danger">运行中：{status.scenario}</span>
            <button className="btn-primary" style={{ padding: '4px 12px', fontSize: 12, marginLeft: 'auto' }} onClick={stop}>
              停止
            </button>
          </>
        ) : (
          <span className="badge badge-ok" style={{ marginLeft: 'auto' }}>空闲</span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            disabled={busy !== null || status?.running}
            onClick={() => start(s)}
            style={{
              textAlign: 'left', padding: 12, borderRadius: 8, cursor: 'pointer',
              border: '1px solid var(--tw-border)', background: '#fff', fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600 }}>{s.name}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{s.desc}</div>
            {busy === s.id && <div style={{ color: 'var(--tw-accent)', marginTop: 6 }}>启动中…</div>}
          </button>
        ))}
      </div>
      {error && <div style={{ color: 'var(--tw-danger)', fontSize: 12.5, marginTop: 8 }}>{error}</div>}
      {status?.finishedAt && !status.running && (
        <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          最近：{status.scenario} 完成（退出码 {status.returncode ?? '—'}），{status.finishedAt}
        </div>
      )}
      <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
        场景数据经 Mosquitto→后端校验→事件→推送完整链路，启动后可在 P01/P03/P07 实时观察；建议先“场景重置”（reset 数据库）。
      </p>
    </div>
  );
}
