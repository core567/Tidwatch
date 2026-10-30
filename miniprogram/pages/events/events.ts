// pages/events/events.ts - 异常事件协同中心 V2
// 一次拉取后本地聚合/筛选（与任务页同一模式）：避免点筛选全屏 loading、避免重复请求竞争。
import { listEvents, listTasks, type TaskListQuery, type InspectionTask } from '../../services/api';
import { logger } from '../../utils/logger';
import { syncTabSelected, TAB_INDEX } from '../../utils/tabbar';
import { eventStatusView, isEventActive } from '../../utils/eventLabels';
import { formatRelative } from '../../utils/util';
import { simMetricName } from '../../utils/metrics';
import { reachDisplayNames } from '../../utils/reachView';
import { wsClient } from '../../utils/ws';
import { connectionData } from '../../utils/connection';
import { diag } from '../../utils/diag';

type PageState = 'loading' | 'ready' | 'error';
type EventFilter = 'all' | 'active' | 'recovery' | 'recovered';

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
  relatedTaskTitle: string;
}

Page({
  data: {
    pageState: 'loading' as PageState,
    errorMsg: '',
    activeFilter: 'active' as EventFilter,
    filters: [
      { key: 'active', label: '活动中' },
      { key: 'all', label: '全部' },
      { key: 'recovery', label: '待恢复' },
      { key: 'recovered', label: '已恢复' },
    ] as { key: EventFilter; label: string }[],
    filterLabels: [] as string[],
    counts: { all: 0, active: 0, recovery: 0, recovered: 0 } as Record<EventFilter, number>,
    events: [] as EventView[],
    listEmpty: false,
    connTone: 'ok' as 'ok' | 'offline' | 'stale',
    connText: '',
  },

  fetchSeq: 0,
  loadedOnce: false,
  allEvents: [] as ActiveEvent[],
  tasks: [] as InspectionTask[],
  wsOpen: false,
  lastRefreshFailed: false,
  dataUpdatedAt: null as number | null,
  unsubMsg: null as null | (() => void),
  unsubState: null as null | (() => void),
  /** WS 触发的静默刷新节流，避免一次状态机迁移连发多条消息导致密集请求 */
  wsScheduled: false,

  onLoad() {
    this.load();
    wsClient.connect();
    // 仅订阅一次；onUnload 取消，避免重复订阅
    this.unsubMsg = wsClient.onMessage((msg) => {
      if (!diag.allowWs()) return; // 排查开关：禁用 WS 触发的更新
      if (
        msg.messageType === 'event.created' ||
        msg.messageType === 'event.updated' ||
        msg.messageType === 'event.status-changed' ||
        msg.messageType === 'task.created' ||
        msg.messageType === 'task.updated' ||
        msg.messageType === 'blindspot.opened' ||
        msg.messageType === 'blindspot.resolved'
      ) {
        this.scheduleWsReload();
      }
    });
    this.unsubState = wsClient.onStateChange((s) => {
      this.wsOpen = s === 'open';
      this.refreshConn();
      // 重连成功后补拉一次，追平断线期间的变更
      if (s === 'open' && this.loadedOnce) this.scheduleWsReload();
    });
  },

  /** 根据 WS/刷新结果/数据年龄更新顶部连接提示条 */
  refreshConn(): void {
    this.setData(connectionData(this.wsOpen, this.lastRefreshFailed, this.dataUpdatedAt));
  },

  onShow() {
    syncTabSelected(this, TAB_INDEX.events);
    if (this.loadedOnce) this.load(true);
  },

  onHide() {
    // 离开 tab：取消挂起的节流刷新，防止不可见时更新
    this.wsScheduled = false;
  },

  onUnload() {
    this.unsubMsg?.();
    this.unsubState?.();
    this.unsubMsg = null;
    this.unsubState = null;
    this.wsScheduled = false;
  },

  /**
   * WS 消息可能在一次业务操作中连发多条（事件状态+任务）。
   * 合并为一个微任务后的单次静默拉取，且仍由 fetchSeq 丢弃过期响应，
   * 保证旧数据不会覆盖新数据（乱序安全）。
   */
  scheduleWsReload() {
    if (this.wsScheduled) return;
    this.wsScheduled = true;
    wx.nextTick(() => {
      this.wsScheduled = false;
      if (this.loadedOnce) this.load(true);
    });
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  async load(silent = false): Promise<void> {
    if (!diag.allowRequest()) return; // 排查开关：禁用业务请求
    const seq = ++this.fetchSeq;
    if (!silent && !this.loadedOnce) this.setData({ pageState: 'loading', errorMsg: '' });
    try {
      const query: TaskListQuery = { page: 1, pageSize: 50 };
      const [eventsRes, tasksRes] = await Promise.all([
        listEvents({ page: 1, pageSize: 50 }),
        listTasks(query),
      ]);
      if (seq !== this.fetchSeq) return;
      this.allEvents = eventsRes.items ?? [];
      this.tasks = tasksRes.items ?? [];
      this.loadedOnce = true;
      this.lastRefreshFailed = false;
      this.dataUpdatedAt = Date.now();
      this.commit(this.data.activeFilter);
      this.setData({ pageState: 'ready' });
      this.refreshConn();
    } catch (e) {
      if (seq !== this.fetchSeq) return;
      const msg = e instanceof Error ? e.message : '未知错误';
      logger.error('events', 'load failed', msg);
      if (!this.loadedOnce) {
        this.setData({ pageState: 'error', errorMsg: msg });
      } else {
        // 已有数据：不清空、不跳错误页，仅顶部提示当前为旧数据
        this.lastRefreshFailed = true;
        this.refreshConn();
      }
    }
  },

  onFilter(e: WechatMiniprogram.TouchEvent): void {
    const key = (e.currentTarget.dataset as { key: EventFilter }).key;
    if (key === this.data.activeFilter) return;
    this.setData({ activeFilter: key });
    this.commit(key);
  },

  /** 唯一派生入口：原始事件+任务 -> 分桶计数/可见列表，一次 setData */
  commit(filter: EventFilter): void {
    const tasksByEvent = new Map<string, InspectionTask>();
    this.tasks.forEach((t) => {
      if (t.eventId && !tasksByEvent.has(t.eventId)) tasksByEvent.set(t.eventId, t);
    });

    const counts: Record<EventFilter, number> = { all: 0, active: 0, recovery: 0, recovered: 0 };
    const views: EventView[] = this.allEvents
      .slice()
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map((ev) => {
        const active = isEventActive(ev.status);
        if (active) counts.active += 1;
        if (ev.status === 'RECOVERY_PENDING') counts.recovery += 1;
        if (ev.status === 'RECOVERED') counts.recovered += 1;
        counts.all += 1;
        const sv = eventStatusView(ev.status);
        const task = ev.eventId ? tasksByEvent.get(ev.eventId) : null;
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
          relatedTaskId: task?.taskId ?? null,
          relatedTaskTitle: task?.title ?? '',
        };
      });

    const visible = views.filter((v) => {
      if (filter === 'all') return true;
      if (filter === 'active') return v.active;
      if (filter === 'recovery') {
        const raw = this.allEvents.find((e) => e.eventId === v.eventId);
        return raw?.status === 'RECOVERY_PENDING';
      }
      if (filter === 'recovered') {
        const raw = this.allEvents.find((e) => e.eventId === v.eventId);
        return raw?.status === 'RECOVERED';
      }
      return true;
    });

    this.setData({
      counts,
      events: visible,
      listEmpty: visible.length === 0,
      filterLabels: this.data.filters.map(
        (f) => `${f.label} ${f.key === 'all' ? counts.all : counts[f.key as Exclude<EventFilter, 'all'>]}`,
      ),
    });
  },

  openEvent(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/event-detail/event-detail?eventId=${encodeURIComponent(id)}` });
  },
});
