import {
  Document, Page, Text, View, StyleSheet, Font, Image,
} from '@react-pdf/renderer';
import { useMemo } from 'react';
import { EVENT_STATUS, reachName } from '@/components/EventBits';
import type { ReportData } from './useReportData';
import type { TimelineItem } from '@/types/contract';
import { blindSpotTime, buildBlindSpotSummary } from './blindspotModel';
import { ReportTrendChart } from './ReportTrendChartPdf';
import { ACTION_CN, FACTOR_CN } from './reviewModel';

// 中文字体嵌入（Noto Sans SC，SIL OFL 1.1；来源与许可证见 public/fonts/NotoSansSC-LICENSE.txt）
Font.register({
  family: 'CN',
  fonts: [
    { src: '/fonts/NotoSansSC-Regular.ttf', fontWeight: 400 },
    { src: '/fonts/NotoSansSC-Bold.ttf', fontWeight: 700 },
  ],
});

const C = {
  ink: '#0e2029', line: '#c7d5da', muted: '#5d7580',
  tide: '#0c8f80', danger: '#c0392b', warn: '#b8771a',
  panel: '#f3f7f8', panelLine: '#dbe6e9', header: '#0e2a33',
};

const styles = StyleSheet.create({
  page: { paddingTop: 52, paddingBottom: 60, paddingHorizontal: 48, fontSize: 10, color: C.ink, fontFamily: 'CN' },
  header: { position: 'absolute', top: 0, left: 0, right: 0, height: 32, backgroundColor: C.header, color: '#cfe9e7', fontSize: 8, paddingHorizontal: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 36, paddingHorizontal: 48, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', fontSize: 8, color: C.muted, borderTopWidth: 1, borderTopColor: C.line, borderTopStyle: 'solid' },

  // 封面
  cover: { marginTop: 96 },
  coverBrand: { fontSize: 12, color: C.tide, letterSpacing: 4, marginBottom: 22, textAlign: 'center', lineHeight: 1.4 },
  coverTitle: { fontSize: 32, color: C.ink, textAlign: 'center', marginBottom: 30, lineHeight: 1.15, letterSpacing: 1 },
  coverSub: { fontSize: 11, color: C.muted, textAlign: 'center', marginBottom: 18, lineHeight: 1.5, letterSpacing: 1.2 },
  coverRule: { width: 64, height: 2, backgroundColor: C.tide, alignSelf: 'center', marginBottom: 34 },
  coverCard: { borderWidth: 1, borderColor: C.line, borderStyle: 'solid', borderRadius: 6, padding: 24, marginHorizontal: 50 },
  coverRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.panelLine, borderBottomStyle: 'solid' },
  coverLabel: { color: C.muted, lineHeight: 1.4 }, coverValue: { fontWeight: 'bold', maxWidth: 320, textAlign: 'right', lineHeight: 1.4 },

  chapter: { marginTop: 22 },
  chapterTitle: { fontSize: 15, color: C.tide, borderBottomWidth: 2, borderBottomColor: C.tide, borderBottomStyle: 'solid', paddingBottom: 5, marginBottom: 12, lineHeight: 1.3 },
  h3: { fontSize: 11.5, fontWeight: 'bold', marginTop: 12, marginBottom: 6, color: C.ink, lineHeight: 1.35 },
  p: { fontSize: 10, color: C.ink, marginBottom: 5, lineHeight: 1.55 },
  muted: { fontSize: 9, color: C.muted, lineHeight: 1.5 },

  // 统计卡片
  statGrid: { flexDirection: 'row', gap: 10, marginVertical: 10 },
  stat: { flex: 1, borderWidth: 1, borderColor: C.line, borderStyle: 'solid', borderRadius: 5, padding: 12 },
  statNum: { fontSize: 24, fontWeight: 'bold', lineHeight: 1.1 },
  statLbl: { fontSize: 9, color: C.muted, marginTop: 3, lineHeight: 1.35 },

  // 表格
  table: { borderWidth: 1, borderColor: C.line, borderStyle: 'solid', borderRadius: 4, marginVertical: 8 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.panelLine, borderBottomStyle: 'solid' },
  trHead: { backgroundColor: C.panel, fontWeight: 'bold' },
  td: { flex: 1, padding: 7, fontSize: 9, lineHeight: 1.45 },
  tdCompact: { flex: 1, padding: 4, fontSize: 8, lineHeight: 1.35 },
  tdLbl: { color: C.muted, flex: 1 },
  tdVal: { flex: 2 },

  // 时间线
  tl: { marginLeft: 6 },
  tlItem: { flexDirection: 'row', paddingBottom: 9, paddingLeft: 4 },
  tlDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.tide, marginRight: 10, marginTop: 4 },
  tlDotMuted: { backgroundColor: '#9bb3bb' },
  tlDotDanger: { backgroundColor: C.danger },
  tlMain: { flex: 1, borderLeftWidth: 0 },
  tlTime: { fontSize: 8, color: C.muted, lineHeight: 1.35 },
  tlAction: { fontSize: 10, fontWeight: 'bold', lineHeight: 1.35 },
  tlNote: { fontSize: 9, color: C.muted, lineHeight: 1.45 },

  // 提交块
  sub: { borderWidth: 1, borderColor: C.line, borderStyle: 'solid', borderRadius: 5, padding: 12, marginVertical: 8, lineHeight: 1.45 },
  tag: { fontSize: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, marginRight: 6, borderWidth: 1, borderColor: C.line, borderStyle: 'solid' },
  photo: { width: 90, height: 90, margin: 4, borderRadius: 3, objectFit: 'cover' },
  empty: { color: C.muted, fontSize: 9, paddingVertical: 4, lineHeight: 1.4 },
  pageBreak: { break: 'page' },
  keep: { break: 'avoid' },
});

const BIZ_CN: Record<string, string> = {
  EVENT: '事件', TASK: '任务', SUBMISSION: '现场提交', REVIEW: '复核',
  ASSESSMENT: '研判', EVIDENCE: '证据', BLINDSPOT: '盲区扫描',
  ATTACHMENT: '附件', RECOVERY: '恢复评估',
};

const TASK_STATUS_CN: Record<string, string> = {
  DRAFT: '草稿', PENDING: '待派发', ACCEPTED: '已接收', IN_PROGRESS: '执行中',
  SUBMITTED: '待复核', APPROVED: '已通过', CANCELLED: '已取消',
};

const METRIC_CN: Record<string, string> = {
  waterLevel: '水位', turbidity: '浊度', flowLevel: '水流等级',
};

const PHASE_CN: Record<string, string> = {
  BASELINE: '基线期', ANOMALY: '异常期', POST: '恢复期',
};

function metricName(metric: string | undefined): string {
  return metric ? METRIC_CN[metric] ?? metric : '触发指标';
}

function num(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

function timeMs(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const normalized = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
  return Date.parse(normalized);
}

function fmt(iso?: string | null): string {
  if (!iso) return '—';
  return iso.replace('T', ' ').slice(0, 16);
}

function ReportFooter({ eventId, generatedAt }: { eventId: string; generatedAt: string }) {
  return (
    <View style={styles.footer} fixed>
      <Text>{eventId}</Text>
      <Text>生成 {fmt(generatedAt)}</Text>
      <Text
        fixed
        style={{ width: 56, textAlign: 'right', fontFamily: 'Helvetica' }}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

export function ReportDocument({ data, origin }: { data: ReportData; origin: string }) {
  const { event: e, assess, timeline: allTimeline, submissions, evidence, recommendations } = data;
  const statusText = EVENT_STATUS[e.status]?.text ?? e.status;
  const blind = buildBlindSpotSummary(e.blindSpots ?? [], allTimeline);
  // 完整报告时间线：排除 BLINDSPOT 高频扫描日志，并去掉同一分钟的镜像重复记录。
  const timeline = useMemo(() => {
    const seen = new Set<string>();
    const out: TimelineItem[] = [];
    for (const item of allTimeline) {
      if (item.bizType === 'BLINDSPOT') continue;
      const key = [
        item.actionType,
        item.taskRef ?? '',
        item.submissionRef ?? '',
        item.reviewRef ?? '',
        item.description ?? '',
        item.toStatus ?? '',
        item.occurredAt.slice(0, 16),
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [allTimeline]);
  const photoUrls = useMemo(() => {
    const map: Record<string, string> = {};
    submissions.forEach((g) => g.subs.forEach((s) => s.attachmentIds.forEach((id) => { map[id] = `${origin}/api/inspection-tasks/uploads/${id}/content`; })));
    return map;
  }, [submissions, origin]);

  const passN = assess?.factors.filter((f) => f.passed === true).length ?? 0;
  const failN = assess?.factors.filter((f) => f.passed === false).length ?? 0;
  const unknownN = (assess?.factors.length ?? 0) - passN - failN;
  const reachText = e.scope.map(reachName).join(' → ') || '—';

  const trigger = data.eventDetail?.trigger;
  const windows = assess?.windows ?? [];
  const focusReach = trigger?.reachId ?? windows[0]?.reachId;
  const focusMetric = trigger?.metric ?? windows[0]?.metric;
  const baseWin = windows.find((w) => w.reachId === focusReach && w.metric === focusMetric && w.phase === 'BASELINE');
  const anomalyWin = windows.find((w) => w.reachId === focusReach && w.metric === focusMetric && w.phase === 'ANOMALY');
  const postWin = windows.find((w) => w.reachId === focusReach && w.metric === focusMetric && w.phase === 'POST');
  const trendUnit = data.trend?.unit || postWin?.unit || baseWin?.unit || '';
  const trendPeak = useMemo(() => {
    const trend = data.trend;
    if (!trend) return null;
    const start = timeMs(trend.start);
    const end = timeMs(trend.end);
    const values = trend.observations
      .filter((o) => {
        const t = timeMs(o.observedAt);
        return o.qualityFlag !== 'INVALID' && o.qualityFlag !== 'MISSING'
          && Number.isFinite(o.value)
          && (!Number.isFinite(start) || t >= start)
          && (!Number.isFinite(end) || t <= end);
      })
      .map((o) => o.value);
    return values.length ? Math.max(...values) : null;
  }, [data.trend]);

  return (
    <Document
      title={`事件复盘报告 ${e.eventId}`}
      author="TideWatch 智慧河流监测与研判系统"
      onRender={undefined}
    >
      {/* 封面 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed><Text>TideWatch 智慧河流监测与研判系统</Text><Text>事件复盘报告</Text></View>
        <View style={styles.cover}>
          <Text style={styles.coverBrand}>TIDEWATCH · RIVER INTELLIGENCE</Text>
          <Text style={styles.coverTitle}>事件复盘报告</Text>
          <Text style={styles.coverSub}>EVENT REVIEW &amp; RECOVERY REPORT</Text>
          <View style={styles.coverRule} />
          <View style={styles.coverCard}>
            <View style={styles.coverRow}><Text style={styles.coverLabel}>事件编号</Text><Text style={styles.coverValue}>{e.eventId}</Text></View>
            <View style={styles.coverRow}><Text style={styles.coverLabel}>事件标题</Text><Text style={styles.coverValue}>{e.title}</Text></View>
            <View style={styles.coverRow}><Text style={styles.coverLabel}>风险等级</Text><Text style={styles.coverValue}>{e.priority === 'HIGH' ? '高风险' : e.priority === 'LOW' ? '低风险' : '中风险'}</Text></View>
            <View style={styles.coverRow}><Text style={styles.coverLabel}>当前状态</Text><Text style={styles.coverValue}>{statusText}</Text></View>
            <View style={styles.coverRow}><Text style={styles.coverLabel}>涉及断面</Text><Text style={styles.coverValue}>{reachText}</Text></View>
            <View style={styles.coverRow}><Text style={styles.coverLabel}>首次发现</Text><Text style={styles.coverValue}>{fmt(e.firstSeenAt)}</Text></View>
            <View style={styles.coverRow}><Text style={styles.coverLabel}>报告生成</Text><Text style={styles.coverValue}>{fmt(data.generatedAt)}</Text></View>
          </View>
        </View>
        <ReportFooter eventId={e.eventId} generatedAt={data.generatedAt} />
      </Page>

      {/* 第一章 概况 + 第二章 恢复评估 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed><Text>TideWatch</Text><Text>事件复盘报告</Text></View>
        <View style={styles.chapter} minPresenceAhead={90}>
          <Text style={styles.chapterTitle}>一、事件概况</Text>
          <View style={styles.table}>
            <View style={[styles.tr, styles.trHead]}><Text style={styles.td}>项目</Text><Text style={styles.td}>内容</Text></View>
            <View style={styles.tr}><Text style={[styles.td, styles.tdLbl]}>事件编号</Text><Text style={[styles.td, styles.tdVal]}>{e.eventId}</Text></View>
            <View style={styles.tr}><Text style={[styles.td, styles.tdLbl]}>当前业务状态</Text><Text style={[styles.td, styles.tdVal]}>{statusText}</Text></View>
            <View style={styles.tr}><Text style={[styles.td, styles.tdLbl]}>首次发现</Text><Text style={[styles.td, styles.tdVal]}>{fmt(e.firstSeenAt)}</Text></View>
            <View style={styles.tr}><Text style={[styles.td, styles.tdLbl]}>最近更新</Text><Text style={[styles.td, styles.tdVal]}>{fmt(e.updatedAt)}</Text></View>
            <View style={styles.tr}><Text style={[styles.td, styles.tdLbl]}>涉及范围</Text><Text style={[styles.td, styles.tdVal]}>{reachText}</Text></View>
          </View>
          <Text style={styles.h3}>范围演化（{e.scopeHistory.length} 个版本）</Text>
          {e.scopeHistory.length === 0 ? <Text style={styles.empty}>无范围版本记录</Text> : e.scopeHistory.map((s) => (
            <View key={s.version} style={styles.tr}>
              <Text style={[styles.td, { flex: 0 }]}>v{s.version}</Text>
              <Text style={styles.td}>{s.reaches.map(reachName).join(' → ') || '—'} {s.reason ? `· ${s.reason}` : ''}</Text>
            </View>
          ))}
        </View>

        <View style={styles.chapter} minPresenceAhead={90}>
          <Text style={styles.chapterTitle}>二、恢复评估</Text>
          {!assess ? <Text style={styles.empty}>未获取恢复评估结果</Text> : (
            <>
              <Text style={styles.p}>评估结论：<Text style={{ fontWeight: 'bold', color: assess.result === 'RECOVERED_SUPPORTED' ? C.tide : C.warn }}>{assess.label}</Text>（{assess.ruleVersion}，{fmt(assess.evaluatedAt)}）</Text>
              <View style={styles.statGrid}>
                <View style={styles.stat}><Text style={[styles.statNum, { color: C.tide }]}>{passN}</Text><Text style={styles.statLbl}>评估通过</Text></View>
                <View style={styles.stat}><Text style={[styles.statNum, { color: C.danger }]}>{failN}</Text><Text style={styles.statLbl}>不满足</Text></View>
                <View style={styles.stat}><Text style={[styles.statNum, { color: C.muted }]}>{unknownN}</Text><Text style={styles.statLbl}>信息不足</Text></View>
              </View>
              {assess.factors.map((f) => (
                <View key={f.code} style={[styles.keep, { marginBottom: 8 }]} wrap={false}>
                  <Text style={{ fontSize: 10, fontWeight: 'bold' }}>
                    {f.passed === true ? '✓ ' : f.passed === false ? '✗ ' : '○ '}
                    {FACTOR_CN[f.code] ?? f.code}
                    <Text style={styles.muted}>（{f.passed === true ? '通过' : f.passed === false ? '不满足' : '信息不足'} · {f.code}）</Text>
                  </Text>
                  <Text style={styles.muted}>{f.detail}</Text>
                </View>
              ))}
              <View wrap={false}>
              <Text style={styles.h3}>评估窗口（真实采样）</Text>
              {windows.length === 0 ? <Text style={styles.empty}>无评估窗口数据</Text> : (
                <View style={styles.table}>
                  <View style={[styles.tr, styles.trHead]}>
                    <Text style={[styles.tdCompact, { flex: 0.8 }]}>断面</Text>
                    <Text style={[styles.tdCompact, { flex: 0.8 }]}>指标</Text>
                    <Text style={[styles.tdCompact, { flex: 0.7 }]}>阶段</Text>
                    <Text style={[styles.tdCompact, { flex: 0.5 }]}>样本</Text>
                    <Text style={[styles.tdCompact, { flex: 0.7 }]}>中位数</Text>
                    <Text style={[styles.tdCompact, { flex: 0.7 }]}>P95</Text>
                    <Text style={[styles.tdCompact, { flex: 0.9 }]}>阈值</Text>
                    <Text style={[styles.tdCompact, { flex: 0.7 }]}>越限</Text>
                  </View>
                  {windows.map((w, index) => (
                    <View key={`${w.reachId}-${w.metric}-${w.phase}-${index}`} style={styles.tr} wrap={false}>
                      <Text style={[styles.tdCompact, { flex: 0.8 }]}>{reachName(w.reachId)}</Text>
                      <Text style={[styles.tdCompact, { flex: 0.8 }]}>{metricName(w.metric)}</Text>
                      <Text style={[styles.tdCompact, { flex: 0.7 }]}>{PHASE_CN[w.phase] ?? w.phase}</Text>
                      <Text style={[styles.tdCompact, { flex: 0.5 }]}>{w.sampleCount}</Text>
                      <Text style={[styles.tdCompact, { flex: 0.7 }]}>{num(w.median)} {w.unit}</Text>
                      <Text style={[styles.tdCompact, { flex: 0.7 }]}>{num(w.p95)}</Text>
                      <Text style={[styles.tdCompact, { flex: 0.9 }]}>{w.threshold === null ? '—' : Array.isArray(w.threshold) ? w.threshold.join(' / ') : String(w.threshold)}</Text>
                      <Text style={[styles.tdCompact, { flex: 0.7 }]}>{w.exceedRatio === null ? '—' : `${Math.round(w.exceedRatio * 100)}%`}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={[styles.muted, { marginTop: 8 }]}>说明：恢复评估为规则只读结论，不会自动改变事件业务状态。</Text>
              </View>
            </>
          )}
        </View>
        <ReportFooter eventId={e.eventId} generatedAt={data.generatedAt} />
      </Page>

      {/* 第三章 处置前后对比 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed><Text>TideWatch</Text><Text>事件复盘报告</Text></View>
        <View style={styles.chapter} minPresenceAhead={90}>
          <Text style={styles.chapterTitle}>三、处置前后数据对比</Text>
          <Text style={styles.muted}>数据来自现场任务提交的测量记录；缺失指标明确标注未获取，不做插值或推测。</Text>

          <Text style={styles.h3}>关键指标摘要（{metricName(focusMetric)}）</Text>
          <View style={styles.statGrid}>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: C.ink }]}>{num(baseWin?.median)}</Text>
              <Text style={styles.statLbl}>基线中位数 · {baseWin?.sampleCount ?? 0} 样本</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: C.warn }]}>{num(anomalyWin?.p95)}</Text>
              <Text style={styles.statLbl}>异常期 P95 · {anomalyWin?.sampleCount ?? 0} 样本</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: C.tide }]}>{num(postWin?.median)}</Text>
              <Text style={styles.statLbl}>恢复期中位数 · {postWin?.sampleCount ?? 0} 样本</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: C.danger }]}>{num(trendPeak)}</Text>
              <Text style={styles.statLbl}>实测峰值 · {trendUnit || '—'}</Text>
            </View>
          </View>
          <Text style={[styles.muted, { marginBottom: 2 }]}>
            基线 {fmt(baseWin?.start)} → {fmt(baseWin?.end)}；异常 {fmt(anomalyWin?.start)} → {fmt(anomalyWin?.end)}；恢复 {fmt(postWin?.start)} → {fmt(postWin?.end)}。
          </Text>
          {data.trend ? (
            <ReportTrendChart
              observations={data.trend.observations}
              start={data.trend.start}
              end={data.trend.end}
              baseline={data.trend.baseline}
              threshold={data.trend.threshold}
              unit={trendUnit}
              metricLabel={metricName(focusMetric)}
            />
          ) : (
            <Text style={styles.empty}>未获取触发指标观测序列，趋势图不生成。</Text>
          )}

          <Text style={styles.h3}>现场提交测量记录</Text>
          {submissions.length === 0 ? <Text style={styles.empty}>该事件无关联巡检任务与现场测量数据</Text> : submissions.map((g, gi) => (
            <View key={g.task.id} style={[styles.keep, { marginBottom: 14 }]}>
              <Text style={styles.h3}>任务 {gi + 1}：{g.task.title}（{TASK_STATUS_CN[g.task.status] ?? g.task.status}）</Text>
              {g.subs.length === 0 ? <Text style={styles.empty}>无提交版本</Text> : [...g.subs].reverse().map((s) => (
                <View key={s.submissionId} style={styles.sub}>
                  <Text>v{s.version} · {s.conclusion === 'NORMAL' ? '未见明显异常' : s.conclusion === 'ABNORMAL' ? '发现异常' : '无法确认'} · {fmt(s.submittedAt)} · {s.submittedBy}</Text>
                  <Text style={styles.muted}>现场记录：{s.observationNote || '（无）'}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        <ReportFooter eventId={e.eventId} generatedAt={data.generatedAt} />
      </Page>

      {/* 第四章 时间线 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed><Text>TideWatch</Text><Text>事件复盘报告</Text></View>
        <View style={styles.chapter} minPresenceAhead={90}>
          <Text style={styles.chapterTitle}>四、处置流程与统一时间线</Text>
          <Text style={styles.muted}>按业务发生时间排序，保留任务派发、现场提交、复核、证据与再评估记录；盲区扫描明细见附录。</Text>
          <View style={styles.tl}>
            {timeline.map((t, i) => (
              <View key={i} style={[styles.tlItem, styles.keep]} wrap={false}>
                <View style={[styles.tlDot, t.bizType === 'RECOVERY' ? { backgroundColor: C.tide } : t.bizType === 'TASK' || t.bizType === 'SUBMISSION' ? { backgroundColor: C.tide } : { backgroundColor: '#9bb3bb' }]} />
                <View style={styles.tlMain}>
                  <Text style={styles.tlTime}>{fmt(t.occurredAt)} · {t.actor}{t.actorRole ? ` / ${t.actorRole}` : ''} · {BIZ_CN[t.bizType] ?? t.bizType}</Text>
                  <Text style={styles.tlAction}>{ACTION_CN[t.actionType] ?? t.actionType}</Text>
                  {t.description ? <Text style={styles.tlNote}>{t.description}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>
        <ReportFooter eventId={e.eventId} generatedAt={data.generatedAt} />
      </Page>

      {/* 第五章 现场核查与复核 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed><Text>TideWatch</Text><Text>事件复盘报告</Text></View>
        <View style={styles.chapter} minPresenceAhead={90}>
          <Text style={styles.chapterTitle}>五、现场核查与复核</Text>
          {submissions.length === 0 ? <Text style={styles.empty}>无现场任务</Text> : submissions.map((g) => (
            <View key={g.task.id} style={{ marginBottom: 16 }}>
              <Text style={styles.h3}>{g.task.title}</Text>
              <Text style={styles.muted}>{g.task.id} · {reachName(g.task.reachId)} · 状态 {TASK_STATUS_CN[g.task.status] ?? g.task.status}</Text>
              {[...g.subs].reverse().map((s) => (
                <View key={s.submissionId} style={[styles.sub, styles.keep]} wrap={false}>
                  <Text style={{ fontWeight: 'bold' }}>v{s.version} · {s.conclusion === 'NORMAL' ? '未见明显异常' : s.conclusion === 'ABNORMAL' ? '发现异常' : '无法确认'} · {fmt(s.submittedAt)}</Text>
                  <Text style={styles.p}>{s.observationNote || '（无现场记录）'}</Text>
                  {g.reviews.filter((r) => r.version === s.version).map((r) => (
                    <Text key={r.reviewId} style={{ fontSize: 9, color: r.decision === 'APPROVED' ? C.tide : C.danger }}>
                      复核{r.decision === 'APPROVED' ? '通过' : '退回'}：{r.comment || '（无意见）'} · {r.reviewer} · {fmt(r.reviewedAt)}
                    </Text>
                  ))}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {s.attachmentIds.length === 0
                      ? <Text style={styles.empty}>本版本无照片</Text>
                      : s.attachmentIds.map((id) => <Image key={id} src={photoUrls[id]} style={styles.photo} />)}
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
        <ReportFooter eventId={e.eventId} generatedAt={data.generatedAt} />
      </Page>

      {/* 第六章 证据 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed><Text>TideWatch</Text><Text>事件复盘报告</Text></View>
        <View style={styles.chapter} minPresenceAhead={90}>
          <Text style={styles.chapterTitle}>六、证据与附件</Text>
          <Text style={styles.h3}>支持证据（{evidence.supporting.length}）</Text>
          {evidence.supporting.length === 0 ? <Text style={styles.empty}>无</Text> : evidence.supporting.map((ev) => (
            <View key={ev.evidenceId} style={styles.tr}><Text style={[styles.td, { flex: 0.6 }]}>{ev.type}</Text><Text style={styles.td}>{ev.note ?? ev.sourceRef}</Text><Text style={[styles.td, { flex: 1.2, color: C.muted }]}>{ev.qualityFlag ?? '—'}</Text></View>
          ))}
          <Text style={styles.h3}>反证 / 缺失（{evidence.counter.length}）</Text>
          {evidence.counter.length === 0 ? <Text style={styles.empty}>无</Text> : evidence.counter.map((ev) => (
            <View key={ev.evidenceId} style={styles.tr}><Text style={[styles.td, { flex: 0.6 }]}>{ev.polarity}</Text><Text style={styles.td}>{ev.note ?? ev.sourceRef}</Text></View>
          ))}
        </View>

        {/* 第七章 结论 */}
        <View style={styles.chapter} minPresenceAhead={90}>
          <Text style={styles.chapterTitle}>七、复盘结论</Text>
          <Text style={styles.p}>当前业务状态：{statusText}。{assess ? `规则恢复评估结论：${assess.label}。` : ''}</Text>
          <Text style={styles.h3}>未解决问题（{e.unresolved.length}）</Text>
          {e.unresolved.length === 0 ? <Text style={styles.empty}>无</Text> : (
            <View>{e.unresolved.map((u, i) => <Text key={i} style={styles.p}>· {u}</Text>)}</View>
          )}
          <Text style={styles.h3}>规则处置建议（{recommendations.length}）</Text>
          {recommendations.length === 0 ? <Text style={styles.empty}>当前无规则处置建议</Text> : (
            <View>
              {recommendations.map((item, i) => (
                <Text key={`${item.code}-${i}`} style={styles.p}>
                  · {item.title}{item.reason ? ` —— ${item.reason}` : ''}
                </Text>
              ))}
            </View>
          )}
          <Text style={[styles.muted, { marginTop: 16 }]}>
            数据来源：MQTT 模拟观测、官方自动站快照、现场人工记录与规则建议。报告生成时间 {fmt(data.generatedAt)}。
          </Text>
        </View>
        <ReportFooter eventId={e.eventId} generatedAt={data.generatedAt} />
      </Page>

      {/* 附录：监测盲区审计记录（不受屏幕折叠影响，完整保留） */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed><Text>TideWatch</Text><Text>事件复盘报告 · 附录</Text></View>
        <View style={styles.chapter} minPresenceAhead={90}>
          <Text style={styles.chapterTitle}>附录、监测盲区审计记录</Text>
          <Text style={styles.p}>
            共 {blind.total} 条盲区快照记录：已解除 {blind.resolved} 条，未解除 {blind.unresolved} 条。
            首次/最近时间取自统一时间线的盲区开启与解除审计事件；记录按断面与盲区类型分组，只读保留。
          </Text>
          <View style={styles.statGrid}>
            <View style={styles.stat}><Text style={[styles.statNum, { color: C.ink }]}>{blind.total}</Text><Text style={styles.statLbl}>记录总数</Text></View>
            <View style={styles.stat}><Text style={[styles.statNum, { color: C.danger }]}>{blind.unresolved}</Text><Text style={styles.statLbl}>未解除</Text></View>
            <View style={styles.stat}><Text style={[styles.statNum, { color: C.tide }]}>{blind.resolved}</Text><Text style={styles.statLbl}>已解除</Text></View>
          </View>

          <Text style={styles.h3}>分组汇总</Text>
          <View style={styles.table}>
            <View style={[styles.tr, styles.trHead]}>
              <Text style={[styles.td, { flex: 0.8 }]}>断面</Text>
              <Text style={[styles.td, { flex: 2 }]}>盲区类型</Text>
              <Text style={[styles.td, { flex: 0.5 }]}>总数</Text>
              <Text style={[styles.td, { flex: 0.5 }]}>未解除</Text>
              <Text style={[styles.td, { flex: 1 }]}>首次开启</Text>
              <Text style={[styles.td, { flex: 1 }]}>最近开启</Text>
              <Text style={[styles.td, { flex: 1 }]}>最近解除</Text>
            </View>
            {blind.groups.map((group) => (
              <View key={group.key} style={styles.tr}>
                <Text style={[styles.td, { flex: 0.8 }]}>{reachName(group.reachId)}</Text>
                <Text style={[styles.td, { flex: 2 }]}>{group.reason}</Text>
                <Text style={[styles.td, { flex: 0.5 }]}>{group.total}</Text>
                <Text style={[styles.td, { flex: 0.5, color: group.unresolved ? C.danger : C.muted }]}>{group.unresolved}</Text>
                <Text style={[styles.td, { flex: 1 }]}>{blindSpotTime(group.firstOpenedAt)}</Text>
                <Text style={[styles.td, { flex: 1 }]}>{blindSpotTime(group.lastOpenedAt)}</Text>
                <Text style={[styles.td, { flex: 1 }]}>{blindSpotTime(group.lastResolvedAt)}</Text>
              </View>
            ))}
          </View>
        </View>

        {blind.groups.map((group) => (
          <View key={group.key} style={{ marginTop: 12 }}>
            <View wrap={false}>
              <Text style={styles.h3}>{reachName(group.reachId)} · {group.reason}</Text>
              <Text style={styles.muted}>
                记录 {group.total} · 已解除 {group.resolved} · 未解除 {group.unresolved}
              </Text>
            </View>
            <View style={styles.table}>
              <View style={[styles.tr, styles.trHead]}>
                <Text style={[styles.td, { flex: 0.3 }]}>序号</Text>
                <Text style={[styles.td, { flex: 0.6 }]}>状态</Text>
                <Text style={styles.td}>影响说明</Text>
              </View>
              {group.records.map((record, index) => (
                <View key={`${group.key}-${index}`} style={styles.tr}>
                  <Text style={[styles.td, { flex: 0.3 }]}>{String(index + 1).padStart(3, '0')}</Text>
                  <Text style={[styles.td, { flex: 0.6, color: record.resolved ? C.tide : C.danger }]}>
                    {record.resolved ? '已解除' : '未解除'}
                  </Text>
                  <Text style={styles.td}>{record.impact ?? record.reason}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
        <ReportFooter eventId={e.eventId} generatedAt={data.generatedAt} />
      </Page>
    </Document>
  );
}
