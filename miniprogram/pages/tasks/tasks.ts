// pages/tasks/tasks.ts - 巡检工作台 V2
//
// 数据流（M1 已修复，V2 视觉重构保持不变）：
//   allTasks（规范化原始集合）─► derive() 同一 setData 派生 summary/tasks/listEmpty
//   切筛选纯本地派生；下拉/WS/onShow 只更新原始集合；fetchSeq 丢弃过期响应。
import { listTasks, listReaches, listEvents } from '../../services/api';
import { wsClient } from '../../utils/ws';
import { connectionData } from '../../utils/connection';
import { logger } from '../../utils/logger';
import { ACTION_NAMES } from '../../utils/taskLabels';
import { syncTabSelected, TAB_INDEX } from '../../utils/tabbar';
import { buildActivities, type TaskActivity } from '../../utils/taskActivity';
import { formatRelative } from '../../utils/util';
import {
  filterTasks,
  mergeTasks,
  summarize,
  toTaskView,
  type TaskFilterKey,
  type TaskSummary,
  type TaskView,
} from '../../utils/taskFilters';

type PageState = 'loading' | 'ready' | 'error';

interface FilterItem {
  key: TaskFilterKey;
  label: string;
}

interface ActivityView extends TaskActivity {
  atText: string;
  kindText: string;
  kindClass: string;
}

/** 进度环 SVG（data URI，零图片资源；基础库无 btoa，用 encodeURIComponent） */
function ringIcon(pct: number): string {
  const r = 31;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = c * (1 - clamped / 100);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="74" height="74" viewBox="0 0 74 74">` +
    `<circle cx="37" cy="37" r="${r}" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="7"/>` +
    `<circle cx="37" cy="37" r="${r}" fill="none" stroke="url(#g)" stroke-width="7" stroke-linecap="round"` +
    ` stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" transform="rotate(-90 37 37)"/>` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#3FD6E4"/><stop offset="1" stop-color="#1E6FE0"/></linearGradient></defs></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 6) return '凌晨好';
  if (h < 12) return '上午好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
}

function dateText(d = new Date()): string {
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${week}`;
}

Page({
  data: {
    pageState: 'loading' as PageState,
    errorMsg: '',
    allTasks: [] as InspectionTask[],
    tasks: [] as TaskView[],
    summary: { todo: 0, doing: 0, review: 0, done: 0 } as TaskSummary,
    listEmpty: false,
    filters: [
      { key: 'todo', label: '待处理' },
      { key: 'doing', label: '进行中' },
      { key: 'review', label: '待复核' },
      { key: 'done', label: '已完成' },
      { key: 'all', label: '全部' },
    ] as FilterItem[],
    filterLabels: [] as string[],
    activeFilter: 'todo' as TaskFilterKey,
    hotTasks: [] as TaskView[],
    activities: [] as ActivityView[],
    wsState: 'disconnected',
    wsStateText: '未连接',
    reachNames: {} as Record<string, string>,
    actionNames: ACTION_NAMES,
    newTaskBadge: 0,
    connTone: 'ok' as 'ok' | 'offline' | 'stale',
    connText: '',
    activeEventCount: 0,
    greeting: greeting(),
    dateText: dateText(),
    todoHint: '',
    progressPct: 0,
    ringIcon: '',
  },

  privateUnsub: null as null | (() => void),
  privateMsgUnsub: null as null | (() => void),
  fetchSeq: 0,
  seenTaskIds: new Set<string>(),
  loadedOnce: false,
  wsOpen: false,
  lastRefreshFailed: false,
  dataUpdatedAt: null as number | null,

  onLoad() {
    wsClient.connect();
    this.privateUnsub = wsClient.onStateChange((s) => {
      this.wsOpen = s === 'open';
      this.setData({
        wsState: s,
        wsStateText:
          s === 'open'
            ? '实时已连接'
            : s === 'connecting'
              ? '连接中（自动重连）'
              : '已断开（自动重连）',
        ...connectionData(this.wsOpen, this.lastRefreshFailed, this.dataUpdatedAt),
      });
      if (s === 'open' && this.loadedOnce) this.loadTasks({ silent: true });
    });
    this.privateMsgUnsub = wsClient.onMessage((msg) =>
      this.handleRealtime(msg as StreamMessage<StreamTaskPayload>),
    );
    this.loadTasks();
    this.loadReachNames();
    this.loadEventCount();
  },

  handleRealtime(msg: StreamMessage<StreamTaskPayload>): void {
    if (
      msg.messageType === 'task.created' ||
      msg.messageType === 'task.updated' ||
      msg.messageType === 'event.created' ||
      msg.messageType === 'event.updated' ||
      msg.messageType === 'blindspot.opened'
    ) {
      if (msg.messageType === 'task.created') {
        const tid = msg.payload?.taskId;
        if (tid && !this.seenTaskIds.has(tid)) wx.vibrateShort?.({ type: 'light' });
        this.setData({ newTaskBadge: this.data.newTaskBadge + 1 });
      }
      this.loadTasks({ silent: true });
      if (msg.messageType.startsWith('event.')) this.loadEventCount(true);
    }
  },

  onUnload() {
    this.privateUnsub?.();
    this.privateMsgUnsub?.();
  },

  onShow() {
    syncTabSelected(this, TAB_INDEX.tasks);
    if (this.loadedOnce) this.loadTasks({ silent: true });
    if (this.data.newTaskBadge > 0) this.setData({ newTaskBadge: 0 });
  },

  onPullDownRefresh() {
    this.loadTasks({ silent: true }).finally(() => wx.stopPullDownRefresh());
  },

  async loadReachNames(): Promise<void> {
    try {
      const reaches = await listReaches();
      const map: Record<string, string> = {};
      reaches.forEach((r) => {
        map[r.reachId] = r.officialCandidateName || r.name;
      });
      this.setData({ reachNames: map });
    } catch {
      // 名称加载失败时卡片以 reachId 兜底
    }
  },

  async loadEventCount(silent = false): Promise<void> {
    try {
      const res = await listEvents({ page: 1, pageSize: 50 });
      const active = (res.items ?? []).filter(
        (e) => e.status !== 'RECOVERED' && e.status !== 'UNRESOLVED',
      ).length;
      this.setData({ activeEventCount: active });
    } catch (e) {
      if (!silent) logger.error('tasks', 'event count failed', String(e));
    }
  },

  onFilter(e: WechatMiniprogram.TouchEvent) {
    const key = (e.currentTarget.dataset as { key: TaskFilterKey }).key;
    if (key === this.data.activeFilter) return;
    this.setData({ activeFilter: key });
    this.commitViews(this.data.allTasks);
  },

  /** 四格玻璃指标点按 = 切换筛选 */
  onQuickFilter(e: WechatMiniprogram.TouchEvent) {
    const key = (e.currentTarget.dataset as { key: TaskFilterKey }).key;
    this.setData({ activeFilter: key });
    this.commitViews(this.data.allTasks);
  },

  async loadTasks(opts: { silent?: boolean } = {}): Promise<void> {
    const seq = ++this.fetchSeq;
    if (!opts.silent && !this.loadedOnce) this.setData({ pageState: 'loading', errorMsg: '' });
    try {
      const res = await listTasks({ page: 1, pageSize: 50 });
      if (seq !== this.fetchSeq) return;
      const incoming = res.items ?? [];
      incoming.forEach((t) => this.seenTaskIds.add(t.taskId));
      this.loadedOnce = true;
      this.lastRefreshFailed = false;
      this.dataUpdatedAt = Date.now();
      const all = mergeTasks(this.data.allTasks, incoming);
      this.setData({
        pageState: 'ready',
        errorMsg: '',
        ...this.derive(all, this.data.activeFilter),
        ...connectionData(this.wsOpen, false, this.dataUpdatedAt),
      });
    } catch (e) {
      if (seq !== this.fetchSeq) return;
      const msg = e instanceof Error ? e.message : '未知错误';
      logger.error('tasks', 'load failed', msg);
      if (!opts.silent || !this.loadedOnce) {
        this.setData({ pageState: 'error', errorMsg: msg });
      } else {
        this.lastRefreshFailed = true;
        this.setData(connectionData(this.wsOpen, true, this.dataUpdatedAt));
      }
    }
  },

  /** 唯一派生函数：原始集合 + 筛选 → 视图/汇总/空态/高优/动态/进度，一次提交 */
  derive(all: InspectionTask[], key: TaskFilterKey) {
    const summary = summarize(all);
    const total = summary.todo + summary.doing + summary.review + summary.done;
    const progressPct = total > 0 ? Math.round((summary.done / total) * 100) : 0;
    const views = filterTasks(all, key).map(toTaskView);
    // 高优且未完成（不含已完成/取消/草稿）
    const hotTasks = all
      .filter(
        (t) =>
          t.priority === 'HIGH' &&
          ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED'].includes(t.status),
      )
      .map(toTaskView)
      .slice(0, 5);
    const activities: ActivityView[] = buildActivities(all).map((a) => ({
      ...a,
      atText: formatRelative(a.at),
      kindText:
        a.kind === 'rejected'
          ? '复核退回'
          : a.kind === 'submitted'
            ? '我的提交'
            : a.kind === 'approved'
              ? '复核通过'
              : '新任务',
      kindClass: a.kind === 'rejected' ? 'red' : a.kind === 'approved' ? 'ok' : 'blue',
    }));
    const counts: Record<TaskFilterKey, number> = {
      todo: summary.todo,
      doing: summary.doing,
      review: summary.review,
      done: summary.done,
      all: all.filter((t) => t.status !== 'DRAFT').length,
    };
    return {
      allTasks: all,
      tasks: views,
      summary,
      listEmpty: views.length === 0,
      progressPct,
      ringIcon: ringIcon(progressPct),
      todoHint: summary.todo > 0 ? `你有 ${summary.todo} 个待接收任务` : '暂无待接收任务',
      hotTasks,
      activities,
      filterLabels: this.data.filters.map((f) => `${f.label} ${counts[f.key]}`),
    };
  },

  commitViews(all: InspectionTask[]): void {
    this.setData(this.derive(all, this.data.activeFilter));
  },

  openTask(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/task-detail/task-detail?taskId=${encodeURIComponent(id)}` });
  },

  goEvents(): void {
    wx.switchTab({ url: '/pages/events/events' });
  },
  goReaches(): void {
    wx.switchTab({ url: '/pages/reaches/reaches' });
  },
});
