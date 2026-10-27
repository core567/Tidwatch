// pages/reach-detail/reach-detail.ts V2
// 链路状态与数据分离：OFFLINE 仍展示最后有效观测；官方快照独立分区，不进趋势线。
import {
  getReach,
  listLatestMetrics,
  listObservations,
  listOfficialAuto,
  listEvents,
} from '../../services/api';
import { formatDateTime } from '../../utils/util';
import {
  OFFICIAL_METRICS,
  simMetricUnit,
  waterClassTone,
  formatOfficialValue,
  type OfficialMetricDef,
} from '../../utils/metrics';
import { freshness, type Freshness } from '../../utils/freshness';
import { latestMetricViews, formatMetricValue } from '../../utils/reachView';
import { filterByWindow, HOUR_MS, normalizePoints, type SparkPoint } from '../../utils/sparkline';
import { eventStatusView } from '../../utils/eventLabels';

type MetricKey = 'waterLevel' | 'turbidity' | 'flowLevel';
type UiState = 'loading' | 'ready' | 'error';

interface WindowTab {
  key: string;
  label: string;
  ms: number;
}

const METRIC_TABS: { key: MetricKey; label: string; unit: string }[] = [
  { key: 'waterLevel', label: '水位', unit: 'm' },
  { key: 'turbidity', label: '浊度', unit: 'NTU' },
  { key: 'flowLevel', label: '水流', unit: '级' },
];

const WINDOW_TABS: WindowTab[] = [
  { key: '1h', label: '近 1 小时', ms: HOUR_MS },
  { key: '6h', label: '近 6 小时', ms: 6 * HOUR_MS },
  { key: '24h', label: '近 24 小时', ms: 24 * HOUR_MS },
  { key: '7d', label: '近 7 天', ms: 7 * 24 * HOUR_MS },
];

/**
 * navigateTo 原生侧滑转场时长上限（iOS 约 300ms / 安卓约 280–450ms，低端机偏慢）。
 * 仅用于首次进入时延后挂载 canvas 原生节点，规避转场期间原生层穿透到旧页面。
 * 期间显示普通 WXML 骨架，进入后切指标/窗口不走此闸门，零额外延迟。
 */
const ENTER_GUARD_MS = 450;

Page({
  data: {
    reachId: '',
    pageState: 'loading' as UiState,
    errorMsg: '',
    reach: null as Reach | null,
    letter: '',
    stationText: '',
    seenText: '—',
    linkBadgeClass: 'off',
    linkBadgeText: '链路中断',
    metrics: [] as { key: string; label: string; value: string; unit: string }[],
    metricTabs: METRIC_TABS,
    windowTabs: WINDOW_TABS,
    activeMetric: 'waterLevel' as MetricKey,
    activeWindow: '24h' as string,
    currentValue: '—',
    currentUnit: 'm',
    currentAtText: '',
    currentFresh: null as Freshness | null,
    sparkPoints: [] as SparkPoint[],
    sparkAlertFrom: '',
    chartSpanText: '',
    chartPointText: '',
    chartEmpty: false,
    /** 页面已完成首次布局且处于可见状态时才允许 canvas 绘制（防转场闪现） */
    chartActive: false,
    anchorText: '',
    official: null as OfficialAutoRecord | null,
    officialItems: [] as { def: OfficialMetricDef; text: string }[],
    officialTone: 'off',
    officialStateText: '',
    relatedEvents: [] as {
      eventId: string;
      title: string;
      statusText: string;
      tone: string;
      firstSeenAt: string;
    }[],
  },

  // 非响应式实例状态
  _ready: false,
  _visible: false,
  _entered: false,
  _sparkGen: 0,
  _enterSeq: 0,
  _enterTimer: null as ReturnType<typeof setTimeout> | null,

  onLoad(query: Record<string, string | undefined>) {
    const id = query.reachId ?? '';
    this.setData({
      reachId: id,
      letter: { 'reach-a': 'A', 'reach-b': 'B', 'reach-c': 'C' }[id] ?? '·',
    });
    if (!id) {
      this.setData({ pageState: 'error', errorMsg: '缺少监测点编号' });
      return;
    }
    this.load();
  },

  onReady() {
    this._ready = true;
    this.scheduleEnterReveal();
  },

  onShow() {
    this._visible = true;
    // 首次进入由 onReady 调度；从下层返回本页（本页仍在栈中）时直接放行
    if (this._ready && this._entered) this.activateChart();
  },

  onHide() {
    // 返回/切后台：取消进入闸门、卸载 canvas（wx:if），返回转场期间不会有原生层残留
    this._visible = false;
    this._enterSeq = (this._enterSeq ?? 0) + 1;
    if (this._enterTimer) {
      clearTimeout(this._enterTimer);
      this._enterTimer = null;
    }
    this.deactivateChart();
  },

  onUnload() {
    this._visible = false;
    this._ready = false;
    this._enterSeq = (this._enterSeq ?? 0) + 1;
    if (this._enterTimer) {
      clearTimeout(this._enterTimer);
      this._enterTimer = null;
    }
    this._sparkGen += 1;
    this.deactivateChart();
  },

  /**
   * 首次进入时，延迟到 navigateTo 转场动画结束后才挂载 canvas 原生节点。
   *
   * 为什么需要这个延时（不是为掩盖数据/布局问题）：
   * - 数据与布局在 onReady 时就已正确，组件也有数据就绪与 nextTick 闸门；
   * - 但 canvas 2d 原生层在「整个新 webview 被原生导航控制器侧滑」期间不会跟随
   *   webview 的位移动画，节点一旦绘制就以最终屏幕位置浮在尚未离场的列表页上；
   * - 微信没有暴露 navigateTo 转场结束事件，页内 SelectorQuery 的坐标又是相对
   *   自身 webview（恒为 0），无法据此判断动画进度；
   * - 因此只能让原生节点在转场时长之后再物理挂载（wx:if）。该延时只用于「首次进入
   *   详情页」这一次；进入后切换指标/时间窗口不经过此闸门，即时重绘。
   * - 可被 onHide/onUnload 通过世代号取消，快速返回不会误绘。
   */
  scheduleEnterReveal(): void {
    if (!this._ready || !this._visible || this._entered) return;
    const seq = (this._enterSeq = (this._enterSeq ?? 0) + 1);
    if (this._enterTimer) clearTimeout(this._enterTimer);
    this._enterTimer = setTimeout(() => {
      this._enterTimer = null;
      if (seq !== this._enterSeq || !this._visible || !this._ready) return;
      this._entered = true;
      this.activateChart();
    }, ENTER_GUARD_MS);
  },

  activateChart(): void {
    if (!this._ready || !this._visible) return;
    if (!this.data.chartActive) this.setData({ chartActive: true });
  },

  deactivateChart(): void {
    if (this.data.chartActive) this.setData({ chartActive: false });
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  async load(silent = false): Promise<void> {
    if (!silent) this.setData({ pageState: 'loading', errorMsg: '' });
    try {
      const [reach, latest, officialGroups, eventsRes] = await Promise.all([
        getReach(this.data.reachId),
        listLatestMetrics(this.data.reachId).catch(() => []),
        listOfficialAuto().catch(() => []),
        listEvents({ reachId: this.data.reachId, page: 1, pageSize: 20 }).catch(() => ({ items: [] })),
      ]);
      const latestRow = latest.find((o) => o.metric === this.data.activeMetric);
      const official =
        (officialGroups.find((g) => g.reachId === this.data.reachId)?.records ?? []).find(
          (r) => r.dataState !== undefined,
        ) ?? null;
      const officialItems = OFFICIAL_METRICS.slice(0, 6).map((def) => ({
        def,
        text: formatOfficialValue(official, def),
      }));
      const relatedEvents = ((eventsRes as PageResult<ActiveEvent>).items ?? [])
        .slice(0, 3)
        .map((e) => ({
          eventId: e.eventId,
          title: e.title,
          firstSeenAt: e.firstSeenAt,
          statusText: eventStatusView(e.status).text,
          tone: eventStatusView(e.status).tone,
        }));

      const fr = freshness(latestRow?.observedAt ?? reach.lastSeenAt);
      this.setData({
        pageState: 'ready',
        reach,
        stationText: reach.officialCandidateName
          ? `${reach.officialCandidateName}（候选站 · 待核实）`
          : '逻辑点（示意拓扑）',
        seenText: formatDateTime(reach.lastSeenAt),
        linkBadgeClass: reach.onlineStatus === 'ONLINE' ? 'on' : reach.onlineStatus === 'STALE' ? 'stale' : 'off',
        linkBadgeText:
          reach.onlineStatus === 'ONLINE' ? '链路在线' : reach.onlineStatus === 'STALE' ? '数据陈旧' : '链路中断',
        metrics: latestMetricViews(latest),
        currentValue: latestRow ? formatMetricValue(latestRow.metric, latestRow.value) : '—',
        currentUnit: latestRow ? simMetricUnit(latestRow.unit, latestRow.metric) : '',
        currentAtText: latestRow ? formatDateTime(latestRow.observedAt) : formatDateTime(reach.lastSeenAt),
        currentFresh: fr,
        official,
        officialItems,
        officialTone: waterClassTone(official?.waterClass),
        officialStateText: official
          ? official.dataState === 'STALE'
            ? `数据已陈旧 · 发布于 ${Math.round((official.ageMinutes ?? 0) / 60)} 小时前（STALE）`
            : '快照数据（非连续实时）'
          : '暂无官方自动站快照',
        relatedEvents,
      });
      this.loadSpark(this.data.activeMetric, this.data.activeWindow, !silent);
    } catch (e) {
      this.setData({ pageState: 'error', errorMsg: e instanceof Error ? e.message : '未知错误' });
    }
  },

  async loadSpark(metric: MetricKey, windowKey: string, autoPick = false): Promise<void> {
    // 每次趋势请求一个世代号，快速切换指标/窗口/页面离开时丢弃过期响应
    const gen = ++this._sparkGen;
    try {
      const res = await listObservations(this.data.reachId, {
        metric,
        page: 1,
        pageSize: 500,
        order: 'desc',
      });
      if (gen !== this._sparkGen || !this._visible) return;
      const all = normalizePoints(
        res.items.map((o) => ({
          t: o.observedAt,
          v: o.value,
          sourceType: o.sourceType,
          scenarioId: o.scenarioId,
        })),
      );
      const anchor = all.length ? new Date(all[all.length - 1].t).getTime() : undefined;

      // 首次进入：自动选一个能覆盖足够点数的窗口（数据稀疏时放大到 7d），
      // 用户手动切换后以其选择为准，不再覆盖。
      let effectiveKey = windowKey;
      if (autoPick && anchor !== undefined) {
        for (const candidate of WINDOW_TABS) {
          const win = filterByWindow(all, candidate.ms, anchor);
          effectiveKey = candidate.key;
          if (win.length >= 8) break;
        }
      }
      const tab = WINDOW_TABS.find((t) => t.key === effectiveKey) ?? WINDOW_TABS[2];
      const windowed = filterByWindow(all, tab.ms, anchor);

      const spanText =
        windowed.length >= 2
          ? `${formatDateTime(windowed[0].t)} — ${formatDateTime(windowed[windowed.length - 1].t)}`
          : '';
      const activeEvents = this.data.relatedEvents
        .filter((e) => e.firstSeenAt)
        .map((e) => e.firstSeenAt)
        .sort()[0];
      // 数据处理完成后再校验一次：若期间切了指标/窗口或离开了页面则不落盘
      if (gen !== this._sparkGen || !this._visible) return;
      this.setData({
        sparkPoints: windowed,
        sparkAlertFrom: activeEvents ?? '',
        activeWindow: effectiveKey,
        chartSpanText: spanText,
        chartPointText: `${windowed.length} 个观测点`,
        chartEmpty: windowed.length === 0,
        anchorText: anchor
          ? `时间窗口以最后有效观测 ${formatDateTime(new Date(anchor).toISOString())} 为终点`
          : '',
      });
    } catch {
      this.setData({ sparkPoints: [], chartEmpty: true, chartSpanText: '', chartPointText: '' });
    }
  },

  onMetricTap(e: WechatMiniprogram.TouchEvent): void {
    const key = (e.currentTarget.dataset as { key: MetricKey }).key;
    if (key === this.data.activeMetric) return;
    const row = this.data.metrics.find((m) => m.key === key);
    this.setData({
      activeMetric: key,
      currentValue: row?.value ?? '—',
      currentUnit: row?.unit ?? '',
    });
    this.loadSpark(key, this.data.activeWindow);
  },

  onWindowTap(e: WechatMiniprogram.TouchEvent): void {
    const key = (e.currentTarget.dataset as { key: string }).key;
    if (key === this.data.activeWindow) return;
    this.setData({ activeWindow: key });
    this.loadSpark(this.data.activeMetric, key);
  },

  openEvent(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/event-detail/event-detail?eventId=${encodeURIComponent(id)}` });
  },
});
