import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { reachName } from '@/components/EventBits';
import SourceTag from '@/components/SourceTag';
import { Button, Card, EmptyState, PageHeader, Tag } from '@/components/ui';

const CLASS_CN: Record<string, string> = {
  'Ⅰ': 'Ⅰ类（优）', 'Ⅱ': 'Ⅱ类（良）', 'Ⅲ': 'Ⅲ类', 'Ⅳ': 'Ⅳ类', 'Ⅴ': 'Ⅴ类',
};

export default function ReportsPage() {
  const navigate = useNavigate();
  const monthlyQ = useQuery({ queryKey: ['monthly'], queryFn: api.monthlyStats });
  const freqQ = useQuery({ queryKey: ['event-freq'], queryFn: api.eventFrequency });

  const hasMonthly = (monthlyQ.data?.totalRecords ?? 0) > 0;

  return (
    <div className="tw-stack">
      <PageHeader
        code="P09"
        title="历史分析与月报统计"
        badges={<Tag tone="outline">业务分析与报告中心</Tag>}
        description="官方月报为月度水质类别背景数据；异常事件频次来自本地事件库。两类统计口径独立，不构成因果结论。"
        actions={
          <Button size="sm" variant="ghost" onClick={() => navigate('/review')}>
            ← 事件复盘
          </Button>
        }
      />

      {/* 官方月报统计（仅统计与趋势；导入/批次管理在 06）。四态严格互斥 */}
      <Card
        title="官方月报统计"
        subtitle="月度水质类别（人工导入），非连续传感器值，不参与实时事件检测"
        actions={<SourceTag source="OFFICIAL_AUTO" />}
      >
        {monthlyQ.isLoading && <div className="tw-tiny">正在加载月报统计…</div>}

        {!monthlyQ.isLoading && monthlyQ.isError && (
          <div className="tw-monthly-error">
            <EmptyState
              title="月报统计加载失败"
              description={(monthlyQ.error as Error)?.message || '统计接口请求失败，请稍后重试。'}
            />
            <Button size="sm" onClick={() => monthlyQ.refetch()}>重试</Button>
          </div>
        )}

        {!monthlyQ.isLoading && !monthlyQ.isError && !hasMonthly && (
          <div className="tw-monthly-empty">
            <EmptyState
              title="暂无官方月报数据"
              description="月报的上传、解析、校验、确认与批次撤销统一在「数据与系统管理」中完成。"
            />
            <Button size="sm" onClick={() => navigate('/admin')}>
              前往数据与系统管理导入
            </Button>
          </div>
        )}

        {!monthlyQ.isLoading && !monthlyQ.isError && hasMonthly && monthlyQ.data && (
          <>
            <div className="tw-tiny" style={{ marginBottom: 8 }}>
              共 {monthlyQ.data.totalRecords} 条月报记录 · 来自 {monthlyQ.data.totalBatches} 个导入批次
              （批次管理与撤销请前往「数据与系统管理」）
            </div>
            <div className="tw-monthly-grid">
              <div>
                <Bars title="按水质类别" data={monthlyQ.data.byClass} fmt={(k) => CLASS_CN[k] ?? k} color="var(--tw-accent)" />
              </div>
              <div>
                <Bars title="按断面" data={monthlyQ.data.byReach} fmt={reachName} color="var(--tw-ok)" />
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div className="tw-muted" style={{ fontSize: 12, marginBottom: 6 }}>按月份</div>
              <Bars title="" data={monthlyQ.data.byPeriod} color="var(--tw-watch)" />
            </div>
          </>
        )}
      </Card>

      {/* 异常事件频次：口径完全独立 */}
      <Card
        title="异常事件频次"
        subtitle="来自活动事件库（含已结束），由 MQTT 模拟观测驱动；与官方月报无因果关系"
        actions={<SourceTag source="SIMULATED" />}
      >
        {freqQ.isLoading && <div className="tw-tiny">加载中…</div>}
        {freqQ.isError && <EmptyState title="事件频次加载失败" />}
        {freqQ.data && (
          <>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--tw-primary-800)', marginBottom: 8 }}>
              {freqQ.data.totalEvents}
              <span style={{ fontSize: 13, fontWeight: 400 }} className="tw-muted"> 个事件</span>
            </div>
            <div className="tw-monthly-grid">
              <div>
                <Bars title="按状态" data={freqQ.data.byStatus} color="var(--tw-watch)" />
              </div>
              <div>
                <Bars title="涉及断面次数" data={freqQ.data.eventsPerReach} fmt={reachName} color="var(--tw-danger)" />
              </div>
            </div>
          </>
        )}
      </Card>

      <div className="tw-tiny tw-muted">
        口径说明：官方月报（OFFICIAL_AUTO/人工导入）为月度类别数据，仅作达标背景分析；异常事件频次来自模拟连续观测与规则检测。
        两者数据来源与统计周期不同，本页不对其相关性或因果作任何推断。月报的导入与批次撤销请在「数据与系统管理」操作。
      </div>
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
  if (entries.length === 0) {
    return (
      <div>
        <div className="tw-muted" style={{ fontSize: 12, marginBottom: 4 }}>{title}</div>
        <div className="tw-tiny" style={{ padding: '6px 0' }}>暂无数据</div>
      </div>
    );
  }
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div>
      {title && <div className="tw-muted" style={{ fontSize: 12, marginBottom: 4 }}>{title}</div>}
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
