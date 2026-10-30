// components/shell-events/shell-events.ts
// 单页面架构下的「事件」模块组件：
// - 四个模块常驻同一 Page（hidden 显隐），本组件首次被激活（active=true）时才拉数；
// - 再次进入复用已有数据，从 event-detail 返回时静默刷新；
// - WebSocket 只注册一次监听器（wsClient 为全壳共享单例，不重复连接）；
// - 现场端只读：研判/处置/状态流转在 PC 端，组件不提供写操作入口。
import { listEvents, listTasks } from '../../services/api';
import type { InspectionTask } from '../../services/api';
import { wsClient } from '../../utils/ws';
import { eventStatusView, isEventActive } from '../../utils/eventLabels';
import { reachDisplayNames } from '../../utils/reachView';
import { simMetricName } from '../../utils/metrics';
import { formatRelative } from '../../utils/util';

type EventFilter = 'all' | 'active' | 'recovery' | 'recovered';

const FILTERS: { key: EventFilter; label: string }[] = [
  { key: 'active', label: '活动中' },
  { key: 'all', label: '全部' },
  { key: 'recovery', label: '待恢复' },
  { key: 'recovered', label: '已恢复' },
];

interface EventView {
  eventId: string;
  title: string;
  statusText: string;
  statusTone: string;
  priorityText: string;
  active: boolean;
  scopeText: string;
  updatedText: string;
  triggerText: string;
  relatedTaskId: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type ShellThis = {
  data: any;
  setData: (d: Record<string, unknown>) => void;
  triggerEvent: (name: string, detail?: unknown) => void;
  ensureInit: () => void;
  load: (silent?: boolean) => Promise<void>;
  commit: (filter: EventFilter) => void;
  scheduleWsReload: () => void;
  _unsubMsg?: (() => void) | null;
  _unsubState?: (() => void) | null;
  _inited?: boolean;
  _loaded?: boolean;
  _seq?: number;
  _wsScheduled?: boolean;
};

Component({
  properties: {
    active: {
      type: Boolean,
      value: false,
      observer(this: ShellThis, val: boolean) {
        if (!val) return;
        const first = !this._inited;
        this.ensureInit();
        // 非首次激活：复用已有数据（无骨架），仅静默拉取一次，补齐离开期间的变更
        if (!first && this._loaded) this.load(true);
      },
    },
  },

  data: {
    loading: true,
    errorMsg: '',
    filters: FILTERS,
    activeFilter: 'active' as EventFilter,
    counts: { all: 0, active: 0, recovery: 0, recovered: 0 } as Record<EventFilter, number>,
    allEvents: [] as ActiveEvent[],
    events: [] as EventView[],
    listEmpty: false,
    updatedText: '',
    wsOpen: false,
  } as Record<string, unknown>,

  // 从 event-detail navigateTo 返回时 Page onShow：激活且已加载则静默刷新
  pageLifetimes: {
    show(this: ShellThis) {
      if (this.data.active && this._loaded) this.load(true);
    },
  },

  lifetimes: {
    attached(this: ShellThis) {
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
      this._unsubMsg = wsClient.onMessage((msg) => {
        if (
          !this.data.active ||
          !(
            msg.messageType === 'event.created' ||
            msg.messageType === 'event.updated' ||
            msg.messageType === 'event.status-changed' ||
            msg.messageType === 'task.created' ||
            msg.messageType === 'task.updated' ||
            msg.messageType === 'blindspot.opened' ||
            msg.messageType === 'blindspot.resolved'
          )
        ) {
          return;
        }
        // 仅激活期实时刷新（合并一次业务操作的连发消息）；非激活期切回时静默补拉
        this.scheduleWsReload();
      });
      this._unsubState = wsClient.onStateChange((s) => {
        this.setData({ wsOpen: s === 'open' });
      });
      wsClient.connect();
    },

    /** 一次状态机迁移可能连发多条 WS 消息，合并为一个微任务后的单次静默拉取 */
    scheduleWsReload(this: ShellThis) {
      if (this._wsScheduled) return;
      this._wsScheduled = true;
      wx.nextTick(() => {
        this._wsScheduled = false;
        if (this._loaded) this.load(true);
      });
    },

    onRetry(this: ShellThis) {
      this.load();
    },

    async load(this: ShellThis, silent = false) {
      const seq = (this._seq ?? 0) + 1;
      this._seq = seq;
      if (!silent) this.setData({ loading: true, errorMsg: '' });
      try {
        // 事件 + 任务并行：关联任务来自真实 listTasks(eventId 维度在派生时按 eventId 归并)
        const [eventsRes, tasksRes] = await Promise.all([
          listEvents({ page: 1, pageSize: 50 }),
          listTasks({ page: 1, pageSize: 50 }).catch(() => ({ items: [] as InspectionTask[] })),
        ]);
        if (seq !== this._seq) return; // 丢弃过期响应
        const allEvents = eventsRes.items ?? [];
        this.setData({
          loading: false,
          errorMsg: '',
          allEvents,
          tasksById: tasksRes.items ?? [],
          updatedText: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        });
        this.commit(this.data.activeFilter as EventFilter);
        this._loaded = true;
      } catch (e) {
        if (seq !== this._seq) return;
        // 静默刷新失败保留旧列表；首次失败才进错误态
        if (!this._loaded) {
          this.setData({ loading: false, errorMsg: e instanceof Error ? e.message : '事件加载失败' });
        }
      }
    },

    onFilter(this: ShellThis, e: WechatMiniprogram.TouchEvent) {
      const key = (e.currentTarget.dataset as { key: EventFilter }).key;
      this.setData({ activeFilter: key });
      this.commit(key);
    },

    /** 唯一派生入口：原始事件 + 任务 -> 分桶计数 / 可见列表，一次 setData */
    commit(this: ShellThis, filter: EventFilter) {
      const all = (this.data.allEvents ?? []) as ActiveEvent[];
      const tasks = (this.data.tasksById ?? []) as InspectionTask[];
      const tasksByEvent = new Map<string, InspectionTask>();
      tasks.forEach((t) => {
        if (t.eventId && !tasksByEvent.has(t.eventId)) tasksByEvent.set(t.eventId, t);
      });

      const counts: Record<EventFilter, number> = { all: 0, active: 0, recovery: 0, recovered: 0 };
      const views: EventView[] = all
        .slice()
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .map((ev) => {
          const active = isEventActive(ev.status);
          if (active) counts.active += 1;
          if (ev.status === 'RECOVERY_PENDING') counts.recovery += 1;
          if (ev.status === 'RECOVERED') counts.recovered += 1;
          counts.all += 1;
          const sv = eventStatusView(ev.status);
          return {
            eventId: ev.eventId,
            title: ev.title,
            statusText: sv.text,
            statusTone: sv.tone,
            priorityText: ({ HIGH: '高', NORMAL: '中', LOW: '低' } as Record<string, string>)[ev.priority] ?? ev.priority,
            active,
            scopeText: reachDisplayNames(ev.scopeReachIds ?? []).join(' / '),
            updatedText: formatRelative(ev.updatedAt),
            triggerText: ev.trigger
              ? `${simMetricName(ev.trigger.metric)} ${ev.trigger.direction === 'UP' ? '↑' : '↓'} ${ev.trigger.magnitude}`
              : '',
            relatedTaskId: ev.eventId ? (tasksByEvent.get(ev.eventId)?.taskId ?? null) : null,
          };
        });

      const visible = views.filter((v) => {
        if (filter === 'all') return true;
        if (filter === 'active') return v.active;
        const raw = all.find((e) => e.eventId === v.eventId)?.status;
        if (filter === 'recovery') return raw === 'RECOVERY_PENDING';
        if (filter === 'recovered') return raw === 'RECOVERED';
        return true;
      });

      this.setData({
        counts,
        events: visible,
        listEmpty: visible.length === 0,
      });
    },

    openEvent(this: ShellThis, e: WechatMiniprogram.TouchEvent) {
      const id = (e.currentTarget.dataset as { id: string }).id;
      this.triggerEvent('navigate', { type: 'event', id });
    },
  },
});
