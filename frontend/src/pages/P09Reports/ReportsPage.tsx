import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useAuthStore } from '@/store/auth';
import { reachName } from '@/components/EventBits';

const CLASS_CN: Record<string, string> = {
  'Ⅰ': 'Ⅰ类（优）', 'Ⅱ': 'Ⅱ类（良）', 'Ⅲ': 'Ⅲ类', 'Ⅳ': 'Ⅳ类', 'Ⅴ': 'Ⅴ类',
};

export default function ReportsPage() {
  const authenticated = useAuthStore((s) => s.authenticated);
  const monthlyQ = useQuery({
    queryKey: ['monthly'], queryFn: api.monthlyStats, enabled: authenticated,
  });
  const freqQ = useQuery({
    queryKey: ['event-freq'], queryFn: api.eventFrequency, enabled: authenticated,
  });

  if (!authenticated) return <div className="card state-box">请先登录</div>;

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', color: 'var(--tw-primary-800)' }}>P09 历史分析与报告</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <section className="card">
          <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>官方月报数据（2026-07 汉江）</h3>
          {monthlyQ.isLoading && <div className="muted">加载中…</div>}
          {monthlyQ.data && (
            <>
              <div style={{ fontSize: 13, color: 'var(--tw-text-secondary)', marginBottom: 8 }}>
                共 {monthlyQ.data.totalRecords} 条记录 · {monthlyQ.data.totalBatches} 个导入批次
              </div>
              <Bars title="按水质类别" data={monthlyQ.data.byClass} fmt={(k) => CLASS_CN[k] ?? k} color="var(--tw-accent)" />
              <Bars title="按断面" data={monthlyQ.data.byReach} fmt={reachName} color="var(--tw-ok)" />
            </>
          )}
        </section>

        <section className="card">
          <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>异常事件频次</h3>
          {freqQ.isLoading && <div className="muted">加载中…</div>}
          {freqQ.data && (
            <>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tw-primary-800)' }}>
                {freqQ.data.totalEvents}
                <span style={{ fontSize: 13, fontWeight: 400 }} className="muted"> 个事件</span>
              </div>
              <Bars title="按状态" data={freqQ.data.byStatus} color="var(--tw-watch)" />
              <Bars title="涉及断面次数" data={freqQ.data.eventsPerReach} fmt={reachName} color="var(--tw-danger)" />
            </>
          )}
        </section>
      </div>

      <section className="card">
        <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>导入批次</h3>
        {monthlyQ.isLoading ? (
          <div className="muted">加载中…</div>
        ) : (monthlyQ.data?.batches.length ?? 0) === 0 ? (
          <div className="muted" style={{ fontSize: 13 }}>
            暂无月报数据。官方月报仅支持在系统管理（P12）通过 CSV/Excel 预览→确认导入。
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--tw-text-secondary)' }}>
                <Th>期间</Th><Th>发布机构</Th><Th>状态</Th><Th>记录数</Th><Th>原文</Th>
              </tr>
            </thead>
            <tbody>
              {monthlyQ.data!.batches.map((b) => (
                <tr key={b.batchId} style={{ borderTop: '1px solid var(--tw-border)' }}>
                  <Td>{b.period}</Td>
                  <Td>{b.agency ?? '—'}</Td>
                  <Td><span className={`badge ${b.status === 'CONFIRMED' ? 'badge-ok' : 'badge-watch'}`}>{b.status}</span></Td>
                  <Td>{b.rowCount}</Td>
                  <Td>{b.sourceUrl ? <a href={b.sourceUrl} target="_blank" rel="noreferrer">链接</a> : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          月报数据为月度水质类别（非连续传感器值），不参与异常事件检测；统计仅作背景与达标分析。
        </p>
      </section>
    </div>
  );
}

function Bars({
  title, data, fmt, color,
}: {
  title: string;
  data: Record<string, number>;
  fmt?: (k: string) => string;
  color: string;
}) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (entries.length === 0) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{title}</div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, marginBottom: 3 }}>
          <span style={{ width: 110 }}>{fmt ? fmt(k) : k}</span>
          <div style={{ flex: 1, background: '#f0f4f8', borderRadius: 4, height: 16 }}>
            <div style={{ width: `${(v / max) * 100}%`, background: color, height: '100%', borderRadius: 4, minWidth: 2 }} />
          </div>
          <b style={{ width: 28 }}>{v}</b>
        </div>
      ))}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: '8px 10px', fontWeight: 500, fontSize: 12.5 }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '9px 10px' }}>{children}</td>;
}
