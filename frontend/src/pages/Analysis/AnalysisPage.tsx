import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  Segmented,
  Table,
  Td,
  Th,
  Tag,
} from '@/components/ui';
import TrendChart from '@/components/TrendChart';
import { exportObservationsCsv } from '@/lib/exportCsv';
import { formatTime, reachName } from '@/components/EventBits';
import SourceTag from '@/components/SourceTag';
import { useStreamState } from '@/store/stream';
import { simMetricName } from '@/lib/metrics';
import type { Observation } from '@/types/contract';
import './analysis.css';

const REACHES = ['reach-a', 'reach-b', 'reach-c'];
const RANGES = [
  { value: '60', label: '近 1 小时' },
  { value: '360', label: '近 6 小时' },
  { value: '1440', label: '近 24 小时' },
  { value: '10080', label: '近 7 天' },
];

/** 连续观测指标（MQTT 模拟），官方每日快照不参与曲线。 */
const SIM_METRICS = [
  { key: 'waterLevel', name: '水位', unit: 'm' },
  { key: 'turbidity', name: '浊度', unit: 'NTU' },
  { key: 'flowLevel', name: '水流等级', unit: '级' },
];

/** 教学阈值（demo-rules-v1），非真实防汛/预警标准。 */
const THRESHOLDS: Record<string, { value: number; label: string; color: string }[]> = {
  waterLevel: [
    { value: 7.0, label: '高水位警戒 7.0', color: '#e8902a' },
    { value: 8.5, label: '洪水预警 8.5', color: '#d84c4c' },
  ],
  turbidity: [{ value: 60, label: '浑浊阈值 60', color: '#e8902a' }],
  flowLevel: [],
};

function isoAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

export default function AnalysisPage() {
  const stream = useStreamState();
  const [metric, setMetric] = useState('waterLevel');
  const [rangeMin, setRangeMin] = useState('10080');

  const [tableMetric, setTableMetric] = useState('');
  const [tableSource, setTableSource] = useState('');
  const [tableQuality, setTableQuality] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');

  const metricDef = SIM_METRICS.find((m) => m.key === metric) ?? SIM_METRICS[0];
  const unit = metricDef.unit;
  const rangeFrom = useMemo(() => isoAgo(Number(rangeMin)), [rangeMin]);

  // 多断面趋势（固定 3 断面，hooks 顺序稳定）
  const trendA = useQuery({
    queryKey: ['analysis-trend', 'reach-a', metric, rangeFrom],
    queryFn: () => api.observations('reach-a', { metric, from: rangeFrom, order: 'asc', pageSize: 500 }),
    refetchInterval: 30000,
  });
  const trendB = useQuery({
    queryKey: ['analysis-trend', 'reach-b', metric, rangeFrom],
    queryFn: () => api.observations('reach-b', { metric, from: rangeFrom, order: 'asc', pageSize: 500 }),
    refetchInterval: 30000,
  });
  const trendC = useQuery({
    queryKey: ['analysis-trend', 'reach-c', metric, rangeFrom],
    queryFn: () => api.observations('reach-c', { metric, from: rangeFrom, order: 'asc', pageSize: 500 }),
    refetchInterval: 30000,
  });
  const trendQ = [trendA, trendB, trendC];

  // 三断面最新值（指标概览）
  const latestA = useQuery({ queryKey: ['analysis-latest', 'reach-a'], queryFn: () => api.latest('reach-a'), refetchInterval: 30000 });
  const latestB = useQuery({ queryKey: ['analysis-latest', 'reach-b'], queryFn: () => api.latest('reach-b'), refetchInterval: 30000 });
  const latestC = useQuery({ queryKey: ['analysis-latest', 'reach-c'], queryFn: () => api.latest('reach-c'), refetchInterval: 30000 });
  const latestQ: Record<string, typeof latestA> = { 'reach-a': latestA, 'reach-b': latestB, 'reach-c': latestC };

  // 原始观测分页表
  const [tableReach, setTableReach] = useState('reach-a');
  const tableQ = useQuery({
    queryKey: ['analysis-table', tableReach, tableMetric, tableSource, tableQuality, page],
    queryFn: () =>
      api.observations(tableReach, {
        metric: tableMetric || undefined,
        sourceType: tableSource || undefined,
        quality: tableQuality || undefined,
        order: 'desc',
        page,
        pageSize: 15,
      }),
  });
  const tableRows = (tableQ.data?.items ?? []) as Observation[];
  const tableTotal = tableQ.data?.total ?? 0;

  const series = trendQ.map((q, i) => ({
    reachId: REACHES[i],
    name: reachName(REACHES[i]),
    color: ['#1e6fe0', '#12a594', '#e8902a'][i],
    rows: (q.data?.items ?? []) as Observation[],
  }));

  // 缺测断面（无任何数据）
  const emptyReaches = REACHES.filter((_, i) => trendQ[i].data && (trendQ[i].data?.items?.length ?? 0) === 0);
  const totalPoints = series.reduce((n, s) => n + s.rows.length, 0);
  const stalePoints = series.reduce(
    (n, s) => n + s.rows.filter((r) => r.qualityFlag !== 'GOOD').length,
    0,
  );

  async function doExport() {
    setExporting(true);
    setExportMsg('正在分批导出…');
    try {
      const blob = await exportObservationsCsv(REACHES, {
        metric: metric || undefined,
        from: rangeFrom,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `观测导出_${metric}_${rangeMin}min.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setExportMsg('导出完成（含 BOM，Excel 可直接打开）');
    } catch (e) {
      setExportMsg(`导出失败：${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="tw-stack">
      <PageHeader
        code="P02"
        title="水环境分析"
        badges={
          <Tag tone={stream === 'open' ? 'ok' : 'muted'}>
            实时 {stream === 'open' ? '已连接' : '未连接'}
          </Tag>
        }
        description="MQTT 模拟连续观测多断面趋势与质量；官方自动站为每日离散快照，不参与连续曲线。"
        actions={
          <Button size="sm" onClick={doExport} disabled={exporting}>
            {exporting ? '导出中…' : '⬇ 导出当前筛选 CSV'}
          </Button>
        }
      />
      {exportMsg && <div className="tw-tiny" style={{ color: 'var(--tw-accent)' }}>{exportMsg}</div>}

      {/* 指标概览 */}
      <div className="tw-analysis-kpis">
        {REACHES.map((r) => {
          const q = latestQ[r];
          const items = (q.data ?? []) as Observation[];
          const m = items.find((o) => o.metric === metric);
          return (
            <Card key={r} className="tw-analysis-kpi">
              <div className="tw-kpi-label">{reachName(r)}</div>
              {q.isLoading ? (
                <div className="tw-tiny">加载中…</div>
              ) : m ? (
                <>
                  <div className="tw-kpi-value">
                    {m.value} <small>{m.unit}</small>
                  </div>
                  <div className="tw-tiny">{formatTime(m.observedAt)}</div>
                  <div className="tw-row" style={{ gap: 6, marginTop: 4 }}>
                    <SourceTag source={m.sourceType} />
                    <Tag tone={m.qualityFlag === 'GOOD' ? 'ok' : 'watch'}>
                      {m.qualityFlag === 'GOOD' ? '质量 GOOD' : `质量 ${m.qualityFlag}`}
                    </Tag>
                  </div>
                </>
              ) : (
                <div className="tw-tiny">该指标暂无观测（未接入或缺测）</div>
              )}
            </Card>
          );
        })}
      </div>

      {/* 趋势主图 */}
      <Card
        title={`${simMetricName(metricDef.key)} 多断面对比`}
        subtitle={`单位 ${unit} · 时间范围：${RANGES.find((x) => x.value === rangeMin)?.label} · 共 ${totalPoints} 个点`}
        actions={<SourceTag source="SIMULATED" />}
      >
        <div className="tw-filter-bar" style={{ marginBottom: 10 }}>
          <Segmented ariaLabel="选择指标" value={metric} onChange={setMetric}
            options={SIM_METRICS.map((m) => ({ value: m.key, label: simMetricName(m.key) }))} />
          <Segmented ariaLabel="时间范围" value={rangeMin} onChange={setRangeMin}
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))} />
        </div>
        {trendQ.some((q) => q.isError) && (
          <EmptyState title="趋势数据加载失败" description="请检查后端服务后重试。" />
        )}
        {totalPoints === 0 && !trendQ.some((q) => q.isLoading) ? (
          <EmptyState title="所选范围无观测数据" description="可能未接入该指标或时间窗内缺测；未补零、未连线。" />
        ) : (
          <>
            <TrendChart
              series={series}
              unit={unit}
              thresholds={(THRESHOLDS[metric] ?? []).map((t) => ({ value: t.value, label: t.label, color: t.color }))}
            />
            {emptyReaches.length > 0 && (
              <div className="tw-tiny" style={{ marginTop: 6 }}>
                缺测断面：{emptyReaches.map(reachName).join('、')}（断点处不连线）
              </div>
            )}
            {stalePoints > 0 && (
              <div className="tw-tiny" style={{ marginTop: 4 }}>非 GOOD 质量点：{stalePoints} 个（已包含在序列中并可在质量列筛选）</div>
            )}
          </>
        )}
      </Card>

      {/* 原始观测记录 */}
      <Card title="原始观测记录" subtitle="按断面/指标/来源/质量筛选，分页查看；CSV 导出覆盖当前筛选的全部记录">
        <div className="tw-filter-bar" style={{ marginBottom: 10 }}>
          <select className="tw-filter-select" value={tableReach} onChange={(e) => { setTableReach(e.target.value); setPage(1); }}>
            {REACHES.map((r) => <option key={r} value={r}>{reachName(r)}</option>)}
          </select>
          <select className="tw-filter-select" value={tableMetric} onChange={(e) => { setTableMetric(e.target.value); setPage(1); }}>
            <option value="">全部指标</option>
            {SIM_METRICS.map((m) => <option key={m.key} value={m.key}>{simMetricName(m.key)}</option>)}
          </select>
          <select className="tw-filter-select" value={tableSource} onChange={(e) => { setTableSource(e.target.value); setPage(1); }}>
            <option value="">全部来源</option>
            <option value="SIMULATED">MQTT 模拟</option>
            <option value="OFFICIAL_AUTO">官方快照</option>
          </select>
          <select className="tw-filter-select" value={tableQuality} onChange={(e) => { setTableQuality(e.target.value); setPage(1); }}>
            <option value="">全部质量</option>
            <option value="GOOD">GOOD</option>
            <option value="STALE">STALE</option>
            <option value="MISSING">MISSING</option>
          </select>
        </div>
        {tableQ.isError ? (
          <EmptyState title="记录加载失败" />
        ) : tableRows.length === 0 ? (
          <EmptyState title="无符合条件的记录" />
        ) : (
          <>
            <Table>
              <thead>
                <tr><Th>观测时间</Th><Th>指标</Th><Th>数值</Th><Th>来源</Th><Th>质量</Th></tr>
              </thead>
              <tbody>
                {tableRows.map((o) => (
                  <tr key={o.observationId}>
                    <Td className="tw-tiny">{formatTime(o.observedAt)}</Td>
                    <Td>{simMetricName(o.metric)}</Td>
                    <Td>{o.value} {o.unit}</Td>
                    <Td><SourceTag source={o.sourceType} /></Td>
                    <Td>
                      <Tag tone={o.qualityFlag === 'GOOD' ? 'ok' : 'watch'}>{o.qualityFlag}</Tag>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <TablePager page={page} total={tableTotal} pageSize={15} onPage={setPage} />
          </>
        )}
      </Card>

      <div className="tw-tiny tw-muted">
        数据来源说明：MQTT 模拟观测（SIMULATED）为连续序列；官方自动站（OFFICIAL_AUTO）为每日离散快照，仅在断面详情/概览显示，不插值为曲线。
      </div>
    </div>
  );
}

function TablePager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="tw-analysis-pager">
      <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</Button>
      <span className="tw-tiny">{page} / {pages}（共 {total} 条）</span>
      <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>下一页</Button>
    </div>
  );
}
