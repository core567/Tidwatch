// pages/reaches/reaches.ts - 水环境监测 V2
// 链路状态（onlineStatus）与最后有效观测（latest + lastSeenAt）分开表达：
// OFFLINE 是 MQTT 链路中断，不等于没有有效观测值，也不代表现场异常。
import {
  listReaches,
  listLatestMetrics,
  listBlindSpots,
  listEvents,
} from '../../services/api';
import { formatRelative } from '../../utils/util';
import { logger } from '../../utils/logger';
import { syncTabSelected, TAB_INDEX } from '../../utils/tabbar';
import { latestMetricViews } from '../../utils/reachView';
import { diag } from '../../utils/diag';
import { wsClient } from '../../utils/ws';
import { connectionData } from '../../utils/connection';

type UiState = 'loading' | 'ready' | 'error';

interface ReachCard extends Reach {
  letter: string;
  roleShort: string;
  stationText: string;
  seenText: string;
  metrics: { key: string; label: string; value: string; unit: string }[];
  latestAt: string | null;
  blindCount: number;
  eventId: string | null;
}

Page({
  data: {
    pageState: 'loading' as UiState,
    errorMsg: '',
    cards: [] as ReachCard[],
    linkOfflineCount: 0,
    blindTotal: 0,
    activeEventTotal: 0,
    wsState: 'disconnected',
    wsStateText: '',
    connTone: 'ok' as 'ok' | 'offline' | 'stale',
    connText: '',
  },

  privateUnsubState: null as null | (() => void),
  privateUnsubMsg: null as null | (() => void),
  fetchSeq: 0,

  onLoad() {
    this.load();
    wsClient.connect();
    this.privateUnsubState = wsClient.onStateChange((s) => {
      const inst = this as unknown as { wsOpen: boolean; lastRefreshFailed: boolean; dataUpdatedAt: number | null };
      inst.wsOpen = s === 'open';
      this.setData({
        wsState: s,
        wsStateText: s === 'open' ? '实时已连接' : s === 'connecting' ? '连接中' : '链路中断',
        ...connectionData(inst.wsOpen, inst.lastRefreshFailed ?? false, inst.dataUpdatedAt ?? null),
      });
    });
    this.privateUnsubMsg = wsClient.onMessage((msg) => {
      if (!diag.allowWs()) return; // 排查开关
      if (msg.messageType === 'reach.status-changed' || msg.messageType === 'observation.created') {
        if ((this as unknown as { loadedOnce?: boolean }).loadedOnce) this.load(true);
      }
    });
  },

  onShow() {
    syncTabSelected(this, TAB_INDEX.reaches);
    if ((this as unknown as { loadedOnce?: boolean }).loadedOnce) this.load(true);
  },

  onUnload() {
    this.privateUnsubState?.();
    this.privateUnsubMsg?.();
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  async load(silent = false): Promise<void> {
    if (!diag.allowRequest()) return; // 排查开关
    const seq = ++this.fetchSeq;
    // 仅首次加载显示骨架；已有数据后静默刷新不清空（避免切回 Tab 闪骨架）
    if (!silent && !(this as unknown as { loadedOnce?: boolean }).loadedOnce) {
      this.setData({ pageState: 'loading', errorMsg: '' });
    }
    try {
      const [reaches, blinds, eventsRes] = await Promise.all([
        listReaches(),
        listBlindSpots({ active: true }).catch(() => [] as BlindSpot[]),
        listEvents({ page: 1, pageSize: 50 }).catch(() => ({ items: [] })),
      ]);
      if (seq !== this.fetchSeq) return;

      const blindByReach = new Map<string, number>();
      (blinds as BlindSpot[]).forEach((b) => {
        blindByReach.set(b.reachId, (blindByReach.get(b.reachId) ?? 0) + 1);
      });
      const eventByReach = new Map<string, string>();
      ((eventsRes as PageResult<ActiveEvent>).items ?? []).forEach((e) => {
        if (e.status === 'RECOVERED' || e.status === 'UNRESOLVED') return;
        e.scopeReachIds?.forEach((r) => eventByReach.set(r, e.eventId));
      });

      // 每个断面最新指标（单接口失败不拖垮整页）
      const sorted = [...reaches].sort((a, b) => a.topoOrder - b.topoOrder);
      const cards = await Promise.all(
        sorted.map(async (r, i): Promise<ReachCard> => {
          let latest: Observation[] = [];          try {
            latest = await listLatestMetrics(r.reachId);
          } catch (e) {
            logger.error('reaches', `latest ${r.reachId} failed`, String(e));
          }
          const latestAt = latest.map((o) => o.observedAt).sort().pop() ?? null;
          return {
            ...r,
            letter: ['A', 'B', 'C'][i] ?? String(i + 1),
            roleShort: ['UP', 'MID', 'DN'][i] ?? '',
            stationText: r.officialCandidateName
              ? `${r.officialCandidateName}（候选站 · 待核实）`
              : '逻辑点（示意拓扑）',
            seenText: formatRelative(r.lastSeenAt),
            metrics: latestMetricViews(latest),
            latestAt,
            blindCount: blindByReach.get(r.reachId) ?? 0,
            eventId: eventByReach.get(r.reachId) ?? null,
          };
        }),
      );
      if (seq !== this.fetchSeq) return;

      this.setData({
        pageState: 'ready',
        cards,
        linkOfflineCount: reaches.filter((r) => r.onlineStatus === 'OFFLINE').length,
        blindTotal: (blinds as BlindSpot[]).length,
        activeEventTotal: ((eventsRes as PageResult<ActiveEvent>).items ?? []).filter(
          (e) => e.status !== 'RECOVERED' && e.status !== 'UNRESOLVED',
        ).length,
      });
      (this as unknown as { loadedOnce: boolean }).loadedOnce = true;
      (this as unknown as { lastRefreshFailed: boolean }).lastRefreshFailed = false;
      (this as unknown as { dataUpdatedAt: number }).dataUpdatedAt = Date.now();
      this.refreshConn();
    } catch (e) {
      if (seq !== this.fetchSeq) return;
      const msg = e instanceof Error ? e.message : '未知错误';
      if (!(this as unknown as { loadedOnce?: boolean }).loadedOnce) {
        this.setData({ pageState: 'error', errorMsg: msg });
      } else {
        // 已有数据：静默失败保留旧数据，仅顶部提示
        (this as unknown as { lastRefreshFailed: boolean }).lastRefreshFailed = true;
        this.refreshConn();
      }
    }
  },

  refreshConn(): void {
    const inst = this as unknown as { wsOpen: boolean; lastRefreshFailed: boolean; dataUpdatedAt: number | null };
    this.setData(connectionData(inst.wsOpen ?? false, inst.lastRefreshFailed ?? false, inst.dataUpdatedAt ?? null));
  },

  openReach(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/reach-detail/reach-detail?reachId=${encodeURIComponent(id)}` });
  },

  openEvent(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/event-detail/event-detail?eventId=${encodeURIComponent(id)}` });
  },
});

