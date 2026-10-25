import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { reachName } from '@/components/EventBits';
import { Card, PageHeader, Table, Td, Th, Tag } from '@/components/ui';

const CLASS_CN: Record<string, string> = {
  'Ⅰ': 'Ⅰ类（优）', 'Ⅱ': 'Ⅱ类（良）', 'Ⅲ': 'Ⅲ类', 'Ⅳ': 'Ⅳ类', 'Ⅴ': 'Ⅴ类',
};

export default function ReportsPage() {
  const monthlyQ = useQuery({
    queryKey: ['monthly'], queryFn: api.monthlyStats,
  });
  const freqQ = useQuery({
    queryKey: ['event-freq'], queryFn: api.eventFrequency,
  });

  return (
    <div className="tw-stack">
      <PageHeader
        code="P09"
        title="历史分析与报告"
        badges={<Tag tone="outline">月报仅作背景，不参与实时事件检测</Tag>}
        description="官方月报按月度水质类别统计；异常事件频次来自本地事件库，两者口径分开。"
      />

      <div className="tw-grid tw-grid-2">
        <Card title="官方月报数据（2026-07 汉江）" subtitle="月度水质类别，非连续传感器值">
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
        </Card>

        <Card title="异常事件频次" subtitle="来自活动事件库（含已结束）">
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
        </Card>
      </div>

      <Card title="导入批次" padded={false}>
        {monthlyQ.isLoading ? (
          <div className="muted" style={{ padding: 16 }}>加载中…</div>
        ) : (monthlyQ.data?.batches.length ?? 0) === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: 16 }}>
            暂无月报数据。官方月报仅支持在系统管理（P12）通过 CSV/Excel 预览→确认导入。
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>期间</Th><Th>发布机构</Th><Th>状态</Th><Th>记录数</Th><Th>原文</Th>
              </tr>
            </thead>
            <tbody>
              {monthlyQ.data!.batches.map((b) => (
                <tr key={b.batchId}>
                  <Td>{b.period}</Td>
                  <Td>{b.agency ?? '—'}</Td>
                  <Td><Tag tone={b.status === 'CONFIRMED' ? 'ok' : 'watch'}>{b.status}</Tag></Td>
                  <Td>{b.rowCount}</Td>
                  <Td>{b.sourceUrl ? <a href={b.sourceUrl} target="_blank" rel="noreferrer">链接</a> : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div className="muted" style={{ fontSize: 12, padding: '0 16px 14px' }}>
          月报数据为月度水质类别（非连续传感器值），不参与异常事件检测；统计仅作背景与达标分析。
        </div>
      </Card>
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
