// pages/profile/profile.ts - 巡检人员个人工作中心
// 身份与统计口径：
// - 有 JWT：/auth/me 为真实登录用户，任务用 mine=true 按该用户 assignee 过滤；
// - 无 JWT（本地演示）：后端 demo 兜底返回 u-admin，页面明确标注「演示模式」，
//   统计为演示身份的任务，绝不伪装成真实 JWT 用户。
import { getMe, listTasks, type InspectionTask } from '../../services/api';
import { getSessionMode, logoutToDemo } from '../../utils/auth';
import { wsClient } from '../../utils/ws';
import { isVoicePluginAvailable } from '../../services/voice';
import { syncTabSelected, TAB_INDEX } from '../../utils/tabbar';
import { taskStatusView } from '../../utils/taskLabels';
import { reachDisplayName } from '../../utils/reachView';
import { formatRelative } from '../../utils/util';
import { connectionData } from '../../utils/connection';

type PageState = 'loading' | 'ready' | 'error';

type BucketKey = 'todo' | 'doing' | 'review' | 'rejected' | 'done';

interface TodoView {
  taskId: string;
  title: string;
  reachName: string;
  statusText: string;
  tone: string;
  dueText: string;
  isRejected: boolean;
  reviewComment: string;
  order: number;
}

interface ActivityView {
  taskId: string;
  title: string;
  text: string;
  atText: string;
  kind: string;
}

const ROLE_TEXT: Record<string, string> = {
  admin: '管理员',
  analyst: '分析人员',
  inspector: '巡检人员',
};

Page({
  data: {
    pageState: 'loading' as PageState,
    errorMsg: '',
    // 身份
    displayName: '巡检人员',
    avatarText: '·',
    username: '',
    roleText: '巡检人员',
    mode: 'demo' as 'jwt' | 'demo',
    modeText: '演示模式',
    wsState: 'disconnected' as 'disconnected' | 'connecting' | 'open',
    wsStateText: '未连接',
    connTone: 'ok' as 'ok' | 'offline' | 'stale',
    connText: '',
    voiceAvailable: false,
    // 概览
    stats: { todo: 0, doing: 0, review: 0, rejected: 0, done: 0 } as Record<BucketKey, number>,
    // 待办（待接收+进行中，退回置顶）
    todos: [] as TodoView[],
    // 最近动态（退回/提交/通过/派发）
    activities: [] as ActivityView[],
    showHelp: false,
  },

  fetchSeq: 0,
  unsubState: null as null | (() => void),
  unsubMsg: null as null | (() => void),
  loadedOnce: false,
  wsState: 'disconnected' as 'disconnected' | 'connecting' | 'open',
  lastRefreshFailed: false,
  dataUpdatedAt: null as number | null,

  onLoad() {
    this.load();
    wsClient.connect();
    this.unsubState = wsClient.onStateChange((s) => {
      this.wsState = s;
      this.setData({
        wsState: s,
        wsStateText: s === 'open' ? '实时已连接' : s === 'connecting' ? '连接中' : '已断开',
        ...connectionData(s === 'open', this.lastRefreshFailed, this.dataUpdatedAt),
      });
    });
    this.unsubMsg = wsClient.onMessage((msg) => {
      if (msg.messageType === 'task.created' || msg.messageType === 'task.updated') {
        if (this.loadedOnce) this.load(true);
      }
    });
  },

  onShow() {
    syncTabSelected(this, TAB_INDEX.profile);
    this.setData({ voiceAvailable: isVoicePluginAvailable() });
    // 每次进入刷新（审核状态可能在 PC 端变化），首次由 onLoad 负责
    if (this.loadedOnce) this.load(true);
  },

  onUnload() {
    this.unsubState?.();
    this.unsubMsg?.();
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  async load(silent = false): Promise<void> {
    const seq = ++this.fetchSeq;
    if (!silent && !this.loadedOnce) this.setData({ pageState: 'loading' });
    try {
      const mode = getSessionMode();
      const [me, tasksRes] = await Promise.all([
        getMe(),
        listTasks({ mine: true, page: 1, pageSize: 50 }).catch(() => ({ items: [] as InspectionTask[] })),
      ]);
      if (seq !== this.fetchSeq) return;
      const tasks = tasksRes.items ?? [];

      const stats: Record<BucketKey, number> = { todo: 0, doing: 0, review: 0, rejected: 0, done: 0 };
      const todos: TodoView[] = [];
      const activities: ActivityView[] = [];

      tasks.forEach((t) => {
        const sv = taskStatusView(t.status, t.latestReview?.decision);
        const isRejected = t.status === 'IN_PROGRESS' && t.latestReview?.decision === 'REJECTED';
        // 分桶
        if (t.status === 'PENDING') stats.todo += 1;
        else if (t.status === 'ACCEPTED' || t.status === 'IN_PROGRESS') stats.doing += 1;
        else if (t.status === 'SUBMITTED') stats.review += 1;
        else if (t.status === 'APPROVED') stats.done += 1;
        else if (t.status === 'CANCELLED' || t.status === 'DRAFT') {
          // 不计入现场工作概览
        }
        if (isRejected) stats.rejected += 1;

        // 待办列表：待接收 + 进行中（含退回），排序优先级 退回 > 待接收 > 进行中
        if (t.status === 'PENDING' || t.status === 'ACCEPTED' || t.status === 'IN_PROGRESS') {
          todos.push({
            taskId: t.taskId,
            title: t.title,
            reachName: t.reachId ? reachDisplayName(t.reachId) : '',
            statusText: sv.text,
            tone: sv.tone,
            dueText: t.dueAt ? formatRelative(t.dueAt) : '截止时间未设置',
            isRejected,
            reviewComment: isRejected ? t.latestReview?.comment ?? 'PC 已退回，请补充后重新提交' : '',
            // 0=退回 1=待接收 2=已接收待开始 3=进行中
            order: isRejected ? 0 : t.status === 'PENDING' ? 1 : t.status === 'ACCEPTED' ? 2 : 3,
          });
        }

        // 最近动态
        const r = t.latestReview;
        if (isRejected && r) {
          activities.push({
            taskId: t.taskId,
            title: t.title,
            text: `PC 退回：${r.comment || '请补充'}`,
            atText: formatRelative(r.reviewedAt),
            kind: 'rejected',
          });
        } else if (r?.decision === 'APPROVED') {
          activities.push({
            taskId: t.taskId,
            title: t.title,
            text: `PC 复核通过${(t.latestVersion ?? 0) > 0 ? `（v${t.latestVersion}）` : ''}`,
            atText: formatRelative(r.reviewedAt),
            kind: 'approved',
          });
        } else if (t.status === 'SUBMITTED') {
          activities.push({
            taskId: t.taskId,
            title: t.title,
            text: `已提交 v${t.latestVersion ?? ''}，待 PC 复核`,
            atText: formatRelative(t.observedAt || t.createdAt),
            kind: 'submitted',
          });
        } else if (t.status === 'PENDING') {
          activities.push({
            taskId: t.taskId,
            title: t.title,
            text: '收到新的巡检任务',
            atText: formatRelative(t.createdAt),
            kind: 'created',
          });
        }
      });

      // 待办：按 退回 > 待接收 > 已接收 > 进行中 排序
      todos.sort((a, b) => a.order - b.order);
      // 动态按时间近似倒序（已由接口 desc 保证，这里取前 8）
      const recentActivities = activities.slice(0, 8);

      // 种子 displayName 存在历史编码问题时退回 username，避免显示乱码
      const dn = me.displayName || '';
      const usableDn = dn && /[一-龥a-zA-Z0-9 ]/.test(dn) && !/�/.test(dn) ? dn : '';
      this.setData({
        pageState: 'ready',
        displayName: usableDn || me.username || '巡检人员',
        avatarText: (me.username || '巡').slice(0, 1).toUpperCase(),
        username: me.username || '',
        roleText: ROLE_TEXT[me.role] ?? me.role ?? '巡检人员',
        mode,
        modeText: mode === 'jwt' ? '已登录' : '演示模式',
        stats,
        todos,
        activities: recentActivities,
      });
      this.loadedOnce = true;
      this.lastRefreshFailed = false;
      this.dataUpdatedAt = Date.now();
      this.setData(connectionData(this.wsState === 'open', false, this.dataUpdatedAt));
    } catch (e) {
      if (seq !== this.fetchSeq) return;
      if (!this.loadedOnce) {
        this.setData({ pageState: 'error', errorMsg: e instanceof Error ? e.message : '未知错误' });
      } else {
        this.lastRefreshFailed = true;
        this.setData(connectionData(this.wsState === 'open', true, this.dataUpdatedAt));
      }
    }
  },

  openTask(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/task-detail/task-detail?taskId=${encodeURIComponent(id)}` });
  },

  toggleHelp(): void {
    this.setData({ showHelp: !this.data.showHelp });
  },

  goLogin(): void {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  /** JWT 模式：退出后清 token，回到演示模式（后端 demo 兜底） */
  onLogout(): void {
    wx.showModal({
      title: '退出登录',
      content: '退出后将回到本地演示模式（数据为演示环境，非你的专属任务）。确定退出？',
      confirmText: '退出',
      confirmColor: '#d84c4c',
      success: (res) => {
        if (!res.confirm) return;
        logoutToDemo();
        wx.showToast({ title: '已回到演示模式', icon: 'none' });
        this.load(true);
      },
    });
  },
});
