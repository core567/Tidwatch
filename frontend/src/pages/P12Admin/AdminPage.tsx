import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';

/**
 * P12 系统管理与运行诊断（M1 基础版）。
 * M0 展示真实后端健康；M1 起增加数据源、规则版本、场景控制、日志与审计。
 */
export default function AdminPage() {
  const { data: health, isLoading, isError, error } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 10000,
  });

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', color: 'var(--tw-primary-800)' }}>P12 系统管理与运行诊断</h2>
      <div className="card" style={{ maxWidth: 640 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>服务健康</div>
        {isLoading && <div className="muted">检测中…</div>}
        {isError && (
          <div style={{ color: 'var(--tw-danger)' }}>
            后端不可达：{(error as Error)?.message}
            <div className="muted" style={{ marginTop: 6 }}>
              请在 backend/ 目录启动：.venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
            </div>
          </div>
        )}
        {health && (
          <table style={{ width: 100, borderCollapse: 'collapse', fontSize: 13.5 }}>
            <tbody>
              <Row k="服务状态" v={health.status} />
              <Row k="数据库" v={health.database} />
              <Row k="版本" v={health.version} />
              <Row k="规则版本" v="demo-rules-v1（教学阈值）" />
              <Row k="MQTT 接入" v="M1 启用（M0 仅自检脚本）" />
            </tbody>
          </table>
        )}
      </div>
      <div className="card" style={{ maxWidth: 640, marginTop: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>M1 将提供</div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 2 }}>
          数据源状态 · 规则版本管理 · S1–S5 场景启动/暂停/加速/重置/故障注入 ·
          操作审计（Run Trace）· 日志导出 · MQTT Broker 连通性诊断
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <tr>
      <td style={{ padding: '7px 0', color: 'var(--tw-text-secondary)', width: 120 }}>{k}</td>
      <td style={{ padding: '7px 0' }}>{v}</td>
    </tr>
  );
}
