// components/shell-notify/shell-notify.ts
// V2.2 复核通知中心（常驻单页面顶部，不新增底部模块）：
// - 复用全壳唯一 wsClient（不新建连接），挂载即补拉未读数/列表（断线重连/重进可恢复）；
// - 收到 notification.created：震动+轻提示（退回警示/通过成功），刷新未读与列表；
// - 铃铛下拉面板展示通知，点击按任务标记已读并 triggerEvent('open-task')；
// - 未读数经 triggerEvent('unread') 上报 Shell，用于底部「任务」红点。
// 网络失败保留已有数据，不展示虚假成功。
import {
  listNotifications,
  getUnreadCount,
  markNotificationsRead,
  type TaskNotification,
} from '../../services/api';
import { wsClient } from '../../utils/ws';
import { formatRelative } from '../../utils/util';

/* eslint-disable @typescript-eslint/no-explicit-any */
type ShellThis = {
  data: any;
  setData: (d: Record<string, unknown>) => void;
  triggerEvent: (name: string, detail?: unknown) => void;
  refresh: (silent?: boolean) => Promise<void>;
  _unsubMsg?: (() => void) | null;
  _unsubState?: (() => void) | null;
  _loaded?: boolean;
  _seq?: number;
};

Component({
  data: {
    open: false,
    loading: false,
    unread: 0,
    notifications: [] as (TaskNotification & { atText: string; rejected: boolean })[],
  } as Record<string, unknown>,

  lifetimes: {
    attached(this: ShellThis) {
      this.refresh();
      // 复用共享 WS：只注册本组件监听，不 connect 新连接（监测/任务等模块已 connect）
      this._unsubMsg = wsClient.onMessage((msg) => {
        if (msg.messageType !== 'notification.created') return;
        const p = (msg.payload ?? {}) as {
          type?: string; taskId?: string; title?: string; body?: string;
        };
        // 仅处理复核通知
        if (p.type !== 'TASK_REJECTED' && p.type !== 'TASK_APPROVED') return;
        // 轻提示，不弹强制模态打断
        wx.vibrateShort?.({ type: 'light' });
        wx.showToast({
          title: p.type === 'TASK_REJECTED' ? '任务被退回，请补充' : '任务复核通过',
          icon: 'none',
          duration: 2200,
        });
        this.refresh(true);
      });
      // 重连成功后补拉（wsClient 在 open 时不自动重拉通知，这里补一次）
      this._unsubState = wsClient.onStateChange((s) => {
        if (s === 'open' && this._loaded) this.refresh(true);
      });
      wsClient.connect();
    },
    detached(this: ShellThis) {
      this._unsubMsg?.();
      this._unsubState?.();
    },
  },

  methods: {
    togglePanel(this: ShellThis) {
      const next = !this.data.open;
      this.setData({ open: next });
      if (next) this.refresh(true);
    },

    closePanel(this: ShellThis) {
      this.setData({ open: false });
    },

    /** 从详情返回时由页面调用：静默补拉（已读状态可能变化） */
    pageShow(this: ShellThis) {
      if (this._loaded) this.refresh(true);
    },

    async refresh(this: ShellThis, silent = false) {
      const seq = (this._seq ?? 0) + 1;
      this._seq = seq;
      if (!silent) this.setData({ loading: true });
      try {
        const [listRes, countRes] = await Promise.all([
          listNotifications(false).catch(() => null),
          getUnreadCount().catch(() => null),
        ]);
        if (seq !== this._seq) return;
        const items = listRes?.items ?? [];
        const notifications = items.slice(0, 30).map((n) => ({
          ...n,
          atText: n.createdAt ? formatRelative(n.createdAt) : '',
          rejected: n.type === 'TASK_REJECTED',
        }));
        const unread = countRes?.unread ?? this.data.unread;
        this.setData({
          loading: false,
          notifications,
          unread,
        });
        // 红点上报给 Shell（底部任务 tab）
        this.triggerEvent('unread', { unread });
        this._loaded = true;
      } catch {
        // 失败保留已有消息，不清空、不伪造
        if (seq === this._seq) this.setData({ loading: false });
      }
    },

    /** 点击通知：按任务标记已读 → 关闭面板 → 进入任务详情 */
    async onTapNotification(this: ShellThis, e: WechatMiniprogram.TouchEvent) {
      const { id, taskid } = e.currentTarget.dataset as { id: string; taskid: string };
      if (!taskid) return;
      // 乐观更新该条已读，再请求后端；失败回退由下次 refresh 纠正
      const list = (this.data.notifications as any[]).map((n) =>
        n.notificationId === id ? { ...n, isRead: true } : n,
      );
      this.setData({ notifications: list, open: false });
      try {
        const res = await markNotificationsRead({ notificationId: id });
        this.setData({ unread: res.unread });
        this.triggerEvent('unread', { unread: res.unread });
      } catch {
        this.refresh(true);
      }
      this.triggerEvent('open-task', { taskId: taskid });
    },
  },
});
