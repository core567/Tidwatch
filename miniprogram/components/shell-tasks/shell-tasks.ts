// components/shell-tasks/shell-tasks.ts
// 单页面架构下的「任务」模块组件：
// - 四个模块常驻同一 Page（hidden 显隐），本组件首次被激活（active=true）时才拉数；
// - 再次进入复用已有数据，从 task-detail 返回时静默刷新；
// - WebSocket 只注册一次监听器（wsClient 为全壳共享单例，不重复连接）。
import { listTasks, listReaches } from '../../services/api';
import type { InspectionTask } from '../../services/api';
import { wsClient } from '../../utils/ws';
import {
  summarize,
  filterTasks,
  toTaskView,
  type TaskFilterKey,
  type TaskView,
  type TaskSummary,
} from '../../utils/taskFilters';
import { buildActivities, type TaskActivity } from '../../utils/taskActivity';
import { formatRelative } from '../../utils/util';
import { taskStatusView, ACTION_NAMES } from '../../utils/taskLabels';

const FILTERS: { key: TaskFilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'todo', label: '待处理' },
  { key: 'doing', label: '进行中' },
  { key: 'review', label: '待复核' },
  { key: 'done', label: '已完成' },
];

interface ActivityView extends TaskActivity {
  atText: string;
  kindText: string;
  kindClass: string;
}

interface TaskRow extends TaskView {
  reachName: string;
  actionText: string;
  dueText: string;
  isRejected: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type ShellThis = {
  data: any;
  setData: (d: Record<string, unknown>) => void;
  triggerEvent: (name: string, detail?: unknown) => void;
  ensureInit: () => void;
  load: (silent?: boolean) => Promise<void>;
  applyFilter: (key: TaskFilterKey) => void;
  _unsubMsg?: (() => void) | null;
  _unsubState?: (() => void) | null;
  _inited?: boolean;
  _loaded?: boolean;
  _seq?: number;
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
    activeFilter: 'all' as TaskFilterKey,
    summary: { todo: 0, doing: 0, review: 0, done: 0 } as TaskSummary,
    allTasks: [] as InspectionTask[],
    tasks: [] as TaskRow[],
    activities: [] as ActivityView[],
    reachNames: {} as Record<string, string>,
    total: 0,
    updatedText: '',
    wsOpen: false,
  } as Record<string, unknown>,

  // 从 task-detail navigateTo 返回时 Page onShow 触发：静默刷新闭环后的状态
  pageLifetimes: {
    show(this: ShellThis) {
      if (this.data.active && this._loaded) this.load(true);
    },
  },

  lifetimes: {
    attached(this: ShellThis) {
      // 兜底：初始就处于激活态时（如默认 tab=任务）直接初始化；_inited 防重复
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
          (msg.messageType === 'task.created' ||
            msg.messageType === 'task.updated') &&
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
        const [res, reaches] = await Promise.all([
          listTasks({ page: 1, pageSize: 50 }),
          listReaches().catch(() => [] as { reachId: string; name: string; officialCandidateName?: string }[]),
        ]);
        if (seq !== this._seq) return; // 丢弃过期响应
        const all: InspectionTask[] = res.items ?? [];
        const reachMap: Record<string, string> = {};
        reaches.forEach((r) => {
          reachMap[r.reachId] = r.officialCandidateName || r.name;
        });

        // 最近动态：仅由任务真实字段派生（退回/提交/通过/新派发），无记录则不显示
        const activities: ActivityView[] = buildActivities(all)
          .slice(0, 6)
          .map((a) => ({
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
            kindClass:
              a.kind === 'rejected' ? 'red' : a.kind === 'approved' ? 'ok' : 'blue',
          }));

        this.setData({
          loading: false,
          errorMsg: '',
          allTasks: all,
          reachNames: reachMap,
          summary: summarize(all),
          total: all.length,
          activities,
          updatedText: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        });
        this.applyFilter(this.data.activeFilter as TaskFilterKey);
        this._loaded = true;
      } catch (e) {
        if (seq !== this._seq) return;
        // 静默刷新失败保留旧列表；首次失败才进错误态
        if (!this._loaded) {
          this.setData({ loading: false, errorMsg: e instanceof Error ? e.message : '任务加载失败' });
        }
      }
    },

    onFilter(this: ShellThis, e: WechatMiniprogram.TouchEvent) {
      const key = (e.currentTarget.dataset as { key: TaskFilterKey }).key;
      this.setData({ activeFilter: key });
      this.applyFilter(key);
    },

    applyFilter(this: ShellThis, key: TaskFilterKey) {
      const all = (this.data.allTasks ?? []) as InspectionTask[];
      const rows: TaskRow[] = filterTasks(all, key).map((raw) => {
        const t = toTaskView(raw);
        const sv = taskStatusView(t.status, t.latestReview?.decision);
        return {
          ...t,
          reachName: this.data.reachNames[t.reachId] || t.reachId,
          actionText: ACTION_NAMES[t.actionType] ?? t.actionType,
          statusText: sv.text,
          statusTone: sv.tone,
          dueText: t.dueAt ? formatRelative(t.dueAt) : '无截止',
          isRejected: t.status === 'IN_PROGRESS' && t.latestReview?.decision === 'REJECTED',
        };
      });
      this.setData({ tasks: rows });
    },

    openTask(this: ShellThis, e: WechatMiniprogram.TouchEvent) {
      const id = (e.currentTarget.dataset as { id: string }).id;
      this.triggerEvent('navigate', { type: 'task', id });
    },
  },
});
