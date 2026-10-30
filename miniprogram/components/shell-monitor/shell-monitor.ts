// components/shell-monitor/shell-monitor.ts
// 单页面架构下的「监测」模块组件：自己管理数据与一次 WS 订阅，
// 由常驻 Page 用 hidden 显隐（组件常驻，状态与连接复用，不随切换重建）。
import {
  listReaches,
  listLatestMetrics,
  listBlindSpots,
  listEvents,
} from '../../services/api';
import { wsClient } from '../../utils/ws';
import { latestMetricViews } from '../../utils/reachView';
import { formatDateTime } from '../../utils/util';
import { freshness } from '../../utils/freshness';

const REACH_IDS = ['reach-a', 'reach-b', 'reach-c'];
const LETTER: Record<string, string> = { 'reach-a': 'A', 'reach-b': 'B', 'reach-c': 'C' };

/* eslint-disable @typescript-eslint/no-explicit-any */
type ShellThis = {
  data: any;
  setData: (d: Record<string, unknown>) => void;
  triggerEvent: (name: string, detail?: unknown) => void;
  ensureInit: () => void;
  load: (silent?: boolean) => Promise<void>;
  locate: (id: string) => void;
  _unsubMsg?: (() => void) | null;
  _unsubState?: (() => void) | null;
  _inited?: boolean;
  _loaded?: boolean;
  _seq?: number;
};

function buildRiverSvg(): string {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 180" fill="none">' +
    '<path d="M-20 140 C 140 40, 300 220, 620 60" stroke="#7fb0e8" stroke-width="46" ' +
    'stroke-linecap="round" fill="none" opacity="0.55"/>' +
    '<path d="M-20 140 C 140 40, 300 220, 620 60" stroke="#2f7fe0" stroke-width="20" ' +
    'stroke-linecap="round" fill="none" opacity="0.5"/>' +
    '<path d="M-20 132 C 140 32, 300 212, 620 52" stroke="#a9d2ff" stroke-width="3" ' +
    'stroke-linecap="round" fill="none" opacity="0.7"/>' +
    '<text x="30" y="40" fill="#9fb8d6" font-size="13">上游</text>' +
    '<text x="500" y="150" fill="#9fb8d6" font-size="13">下游</text>' +
    '</svg>';
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

Component({
  properties: {
    active: {
      type: Boolean,
      value: false,
      observer(this: ShellThis, val: boolean) {
        if (!val) return;
        const first = !this._inited;
        this.ensureInit();
        // 非首次激活：复用数据（无骨架），仅静默补拉一次离开期间的变更
        if (!first && this._loaded) this.load(true);
      },
    },
  },

  data: {
    loading: true,
    errorMsg: '',
    cards: [] as any[],
    offlineCount: 0,
    activeEventCount: 0,
    updatedText: '',
    selectedId: 'reach-a',
    scrollToId: '',
    events: [] as any[],
    riverSvg: '',
    wsOpen: false,
  } as Record<string, unknown>,

  pageLifetimes: {
    show(this: ShellThis) {
      if (this.data.active && this._loaded) this.load(true);
    },
  },

  lifetimes: {
    attached(this: ShellThis) {
      // SVG 与数据无关，可立即构建；数据与订阅延迟到首次激活
      this.setData({ riverSvg: buildRiverSvg() });
      if (this.data.active) this.ensureInit();
    },
    detached(this: ShellThis) {
      this._unsubMsg?.();
      this._unsubState?.();
    },
  },

  methods: {
    /** 首次激活初始化（只执行一次）：拉数 + 注册一次 WS 监听 */
    ensureInit(this: ShellThis) {
      if (this._inited) return;
      this._inited = true;
      this.load();
      // WS 只订阅一次：组件常驻，hidden 不触发 detached
      this._unsubMsg = wsClient.onMessage((msg) => {
        if (
          (msg.messageType === 'reach.status-changed' ||
            msg.messageType === 'observation.created') &&
          this.data.active &&
          this._loaded
        ) {
          // 仅激活期实时刷新；非激活期切回时由 active observer 静默补拉一次
          this.load(true);
        }
      });
      this._unsubState = wsClient.onStateChange((s) => {
        this.setData({ wsOpen: s === 'open' });
      });
      wsClient.connect();
    },

    onRetry(this: ShellThis) {
      this.load();
    },

    async load(this: ShellThis, silent = false) {
      const seq = (this._seq ?? 0) + 1;
      this._seq = seq;
      if (!silent) this.setData({ loading: true, errorMsg: '' });
      try {
        const [reachRes, latestAll, blindsRes, eventsRes] = await Promise.all([
          listReaches(),
          Promise.all(REACH_IDS.map((id) => listLatestMetrics(id))),
          listBlindSpots({ active: true }).catch(() => []),
          listEvents({ page: 1, pageSize: 5 }).catch(() => ({ items: [], total: 0 })),
        ]);
        if (seq !== this._seq) return; // 丢弃过期响应

        const blindBy = new Map<string, number>();
        (blindsRes as { reachId?: string }[]).forEach((b) => {
          if (b.reachId) blindBy.set(b.reachId, (blindBy.get(b.reachId) ?? 0) + 1);
        });

        const selectedId = this.data.selectedId;
        const cards = reachRes.map((r) => {
          const items = latestAll[REACH_IDS.indexOf(r.reachId)] ?? [];
          const views = latestMetricViews(items);
          const wRaw = items.find((o) => o.metric === 'waterLevel');
          const tRaw = items.find((o) => o.metric === 'turbidity');
          const wv = views.find((v) => v.key === 'waterLevel');
          const tv = views.find((v) => v.key === 'turbidity');
          void freshness(r.lastSeenAt);
          const blind = blindBy.get(r.reachId) ?? 0;
          return {
            reachId: r.reachId,
            name: r.name,
            letter: LETTER[r.reachId] ?? '·',
            onlineStatus: r.onlineStatus,
            seenText: r.lastSeenAt ? formatDateTime(r.lastSeenAt) : '—',
            waterValue: wv ? `${wv.value} ${wv.unit}` : '—',
            waterTime: wRaw ? formatDateTime(wRaw.observedAt) : '—',
            turbValue: tv ? `${tv.value} ${tv.unit}` : '—',
            turbTime: tRaw ? formatDateTime(tRaw.observedAt) : '—',
            blindCount: blind,
            selected: r.reachId === selectedId,
            isOffline: r.onlineStatus !== 'ONLINE',
            isAlert: r.onlineStatus !== 'ONLINE' || blind > 0,
          };
        });

        const evItems = ((eventsRes as { items?: { eventId: string }[] }).items ?? []).slice(0, 3);

        this.setData({
          loading: false,
          errorMsg: '',
          cards,
          offlineCount: cards.filter((c) => c.isAlert).length,
          activeEventCount: (eventsRes as { total?: number }).total ?? 0,
          updatedText: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          events: evItems,
        });
        this._loaded = true;
      } catch (e) {
        if (seq !== this._seq) return;
        // 静默刷新失败保留已有内容；仅首次加载进入错误态
        if (!silent || !this._loaded) {
          this.setData({ loading: false, errorMsg: e instanceof Error ? e.message : '监测数据加载失败' });
        }
      }
    },

    onTapStation(this: ShellThis, e: WechatMiniprogram.TouchEvent) {
      const id = (e.currentTarget.dataset as { id: string }).id;
      this.locate(id);
    },

    locate(this: ShellThis, id: string) {
      this.setData({
        selectedId: id,
        cards: this.data.cards.map((c: any) => ({ ...c, selected: c.reachId === id })),
        scrollToId: `sm-card-${id}`,
      });
      setTimeout(() => this.setData({ scrollToId: '' }), 500);
    },

    goDetail(this: ShellThis, e: WechatMiniprogram.TouchEvent) {
      const id = (e.currentTarget.dataset as { id: string }).id;
      this.triggerEvent('navigate', { type: 'reach', id });
    },
  },
});
