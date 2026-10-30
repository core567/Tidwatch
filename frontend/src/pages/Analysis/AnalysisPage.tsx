import { useEffect, useMemo, useState } from 'react';
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
import { buildReachTrends } from '@/lib/reachTrends';
import { exportObservationsCsv } from '@/lib/exportCsv';
import { formatTime, reachName } from '@/components/EventBits';
import SourceTag from '@/components/SourceTag';
import { useStreamState } from '@/store/stream';
import { simMetricName } from '@/lib/metrics';
import type { Observation } from '@/types/contract';
import './analysis.css';

const REACHES = ['reach-a', 'reach-b', 'reach-c'];
const REACH_COLORS = ['#1e6fe0', '#12a594', '#e8902a'];
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

/**
 * 越限阈值镜像自后端 app/rules/thresholds.py（DEMO_RULES_V1）。
 * 教学演示规则，非真实防汛/官方预警标准；改后端规则时需同步此处。
 * 前端不提供规则接口，故以此常量保持一致，不臆造其它阈值。
 */
const RULE_THRESHOLDS: Record<string, number[]> = {
  waterLevel: [7.0, 8.5],
  turbidity: [60],
  flowLevel: [],
};
const THRESHOLD_LINES: Record<string, { value: number; label: string; color: string }[]> = {
  waterLevel: [
    { value: 8.5, label: '洪水预警 ≥ 8.5', color: '#d84c4c' },
    { value: 7.0, label: '高水位警戒 ≥ 7.0', color: '#e8902a' },
  ],
  turbidity: [{ value: 60, label: '水质浑浊 ≥ 60', color: '#e8902a' }],
  flowLevel: [],
};
/** 缺测断线阈值：相邻点间隔超过 15 分钟视为缺测 */
const GAP_MS = 15 * 60 * 1000;

function isoAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

function fmt(n: number | null, unit: string): string {
  return n === null ? '—' : `${Number.isInteger(n) ? n : n.toFixed(2)} ${unit}`;
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

  // 视图模式：完整查询窗口（保留右侧缺测） / 聚焦有效数据
  const [viewMode, setViewMode] = useState<'full' | 'focus'>('full');

  // 多断面趋势（固定 3 断面，hooks 顺序稳定）
  const trendA = useQuery({
    queryKey: ['analysis-trend', 'reach-a', metric, rangeFrom],
    queryFn: () => api.observations('reach-a', { metric, from: rangeFrom, order: 'asc', pageSize: 2000 }),
    refetchInterval: 30000,
  });
  const trendB = useQuery({
    queryKey: ['analysis-trend', 'reach-b', metric, rangeFrom],
    queryFn: () => api.observations('reach-b', { metric, from: rangeFrom, order: 'asc', pageSize: 2000 }),
    refetchInterval: 30000,
  });
  const trendC = useQuery({
    queryKey: ['analysis-trend', 'reach-c', metric, rangeFrom],
    queryFn: () => api.observations('reach-c', { metric, from: rangeFrom, order: 'asc', pageSize: 2000 }),
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
    color: REACH_COLORS[i],
    rows: (q.data?.items ?? []) as Observation[],
  }));

  // 真实数据构建：排序/去重/缺测断线/异常点/覆盖与统计（纯函数，便于测试）
  const trend = useMemo(
    () =>
      buildReachTrends(series, GAP_MS, RULE_THRESHOLDS[metric] ?? [], {
        queryStart: new Date(rangeFrom).getTime(),
        queryEnd: Date.now(),
      }),
    // series 由 trendQ 数据派生；以各查询返回数据、指标、窗口起点为依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metric, rangeFrom, ...trendQ.map((q) => q.data)],
  );

  // 缺测断面（当前时间窗内无点）
  const emptyReaches = REACHES.filter(
    (r) => (trend.coverage.find((c) => c.reachId === r)?.count ?? 0) === 0,
  );
  const totalPoints = trend.coverage.reduce((n, c) => n + c.count, 0);
  const totalOutliers = trend.stats.reduce((n, s) => n + s.outlierCount, 0);
  const totalGaps = trend.stats.reduce((n, s) => n + s.gaps.length, 0);

  const rangeLabel = RANGES.find((x) => x.value === rangeMin)?.label ?? '';

  // 切换指标或时间范围时，默认回到“完整范围”模式（视图切换显式、可预期）
  useEffect(() => {
    setViewMode('full');
  }, [metric, rangeMin]);

  // 空态用：三断面在该指标上的最后一条有效观测（即使不在所选窗口内）
  const latestMetricObs = useMemo(() => {
    let latest: Observation | null = null;
    for (const r of REACHES) {
      const items = (latestQ[r].data ?? []) as Observation[];
      const m = items.find((o) => o.metric === metric);
      if (m && (latest === null || new Date(m.observedAt).getTime() > new Date(latest.observedAt).getTime())) {
        latest = m;
      }
    }
    return latest;
  }, [latestA, latestB, latestC, metric]);

  /** 空态“查看最近有效数据”：切到 7 天并聚焦实际数据 */
  function showRecentData() {
    setRangeMin('10080');
    setViewMode('focus');
  }

  function refreshTrend() {
    trendA.refetch();
    trendB.refetch();
    trendC.refetch();
  }

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
          {totalPoints > 0 && (
            <Segmented
              ariaLabel="视图范围"
              value={viewMode}
              onChange={(v) => setViewMode(v as 'full' | 'focus')}
              options={[
                { value: 'full', label: '完整范围' },
                { value: 'focus', label: '聚焦数据' },
              ]}
            />
          )}
        </div>

        {trendQ.some((q) => q.isLoading) && <div className="tw-muted" style={{ padding: '24px 0' }}>历史加载中…</div>}
        {!trendQ.some((q) => q.isLoading) && trendQ.some((q) => q.isError) && (
          <div className="tw-empty-actions">
            <EmptyState title="趋势数据请求失败" description="可能是后端服务不可用；不会用旧数据伪装为实时结果。" />
            <Button size="sm" onClick={refreshTrend}>重新加载</Button>
          </div>
        )}
        {!trendQ.some((q) => q.isLoading || q.isError) && totalPoints === 0 && (
          <div className="tw-empty-actions">
            <EmptyState
              title="该时间范围内无有效观测"
              description={
                latestMetricObs
                  ? `最近一条有效观测：${formatTime(latestMetricObs.observedAt)}，已超出所选范围（数据可能已过期，非实时）。`
                  : '该指标暂无任何观测记录；未补零、未绘制水平假线。'
              }
            />
            <div className="tw-row" style={{ gap: 10, justifyContent: 'center' }}>
              {latestMetricObs && (
                <Button size="sm" onClick={showRecentData}>查看最近有效数据</Button>
              )}
              <Button size="sm" variant="ghost" onClick={refreshTrend}>刷新数据</Button>
            </div>
          </div>
        )}
        {totalPoints > 0 && !trendQ.some((q) => q.isLoading || q.isError) && (
          <>
            {/* 有效数据覆盖情况：查询范围 vs 实际覆盖 */}
            <div className="tw-cov">
              <div className="tw-cov-head">
                <b>数据覆盖</b>
                <span className="tw-tiny">
                  {viewMode === 'full'
                    ? '完整范围：保留真实缺测，右侧空白＝该时段无观测'
                    : '聚焦数据：按实际首末观测确定横轴（两端留白）'}
                </span>
              </div>
              <div className="tw-tiny" style={{ marginBottom: 8 }}>
                查询范围：{rangeLabel} · 实际有效数据 {trend.spanStart ? formatTime(new Date(trend.spanStart).toISOString()) : '—'} ~ {trend.spanEnd ? formatTime(new Date(trend.spanEnd).toISOString()) : '—'}
              </div>
              <div className="tw-cov-grid">
                {trend.coverage.map((c) => (
                  <div key={c.reachId} className="tw-cov-cell">
                    <div className="tw-cov-name">{c.reachName}</div>
                    <div className="tw-tiny">有效点 {c.count}{c.duplicated > 0 ? `（去重 ${c.duplicated}）` : ''}</div>
                    <div className="tw-tiny">{c.firstAt ? formatTime(c.firstAt) : '—'} 起</div>
                    <div className="tw-tiny">{c.lastAt ? formatTime(c.lastAt) : '—'} 止</div>
                  </div>
                ))}
              </div>
            </div>

            <TrendChart
              data={trend}
              unit={unit}
              thresholds={THRESHOLD_LINES[metric] ?? []}
              viewMode={viewMode}
            />

            {/* 统计摘要：基于当前时间窗的真实有效数据 */}
            <div className="tw-stats-sum">
              <div className="tw-stats-title">
                <b>统计摘要</b>
                <span className="tw-tiny">{rangeLabel} · 越限按 demo-rules 阈值（{
                  (THRESHOLD_LINES[metric] ?? []).map((t) => t.value).join(' / ') || '无'
                } {unit}）</span>
              </div>
              <table className="tw-stats-table">
                <thead>
                  <tr>
                    <th>断面</th><th>有效点</th><th>最小</th><th>最大</th>
                    <th>异常点</th><th>覆盖率</th><th>缺测区间</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.stats.map((s) => (
                    <tr key={s.reachId}>
                      <td>{s.reachName}</td>
                      <td>{s.count}</td>
                      <td>{fmt(s.min, unit)}</td>
                      <td>{fmt(s.max, unit)}</td>
                      <td>{s.outlierCount > 0
                        ? <span style={{ color: '#d84c4c', fontWeight: 700 }}>{s.outlierCount}</span>
                        : 0}</td>
                      <td>{s.coveragePct}%</td>
                      <td>{s.gaps.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalOutliers > 0 && (
                <div className="tw-tiny" style={{ marginTop: 6, color: '#d84c4c' }}>
                  共 {totalOutliers} 个真实越限点（来自 S2/S3 模拟场景注入，原始值保留、未平滑）。
                </div>
              )}
              {totalGaps === 0 && totalPoints > 0 && (
                <div className="tw-tiny" style={{ marginTop: 6 }}>当前窗口各断面观测连续，无缺测缺口。</div>
              )}
              {emptyReaches.length > 0 && (
                <div className="tw-tiny" style={{ marginTop: 6 }}>
                  窗口内缺测断面：{emptyReaches.map(reachName).join('、')}（不补点、不连线）。
                </div>
              )}
            </div>
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
