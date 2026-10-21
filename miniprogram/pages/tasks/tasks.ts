// pages/tasks/tasks.ts - 巡检任务列表（M0 占位骨架，M3 对接真实接口与 WS 推送）
import { listTasks } from '../../services/api';
import { isLoggedIn } from '../../utils/auth';
import { wsClient } from '../../utils/ws';
import { formatDateTime } from '../../utils/util';
import { logger } from '../../utils/logger';

type UiState = 'loading' | 'success' | 'empty' | 'error';

const ACTION_NAMES: Record<string, string> = {
  CONTINUE_OBSERVE: '持续观察',
  FOCUS_REACH_B: '重点观察 B',
  FOCUS_REACH_C: '重点观察 C',
  KEEP_LOCAL_SCOPE: '保持局部关注',
  INSPECT_DATA_LINK: '检查数据链路',
  MANUAL_CHECK: '现场人工核查',
  RE_EVALUATE_AFTER_RECOVERY: '恢复后再评估',
};

const STATUS_NAMES: Record<string, string> = {
  PENDING: '待接收',
  ACCEPTED: '已接收',
  IN_PROGRESS: '进行中',
  SUBMITTED: '已提交',
  CANCELLED: '已取消',
};

interface TaskView extends InspectionTask {
  dueAtText: string;
}

Page({
  data: {
    uiState: 'loading' as UiState,
    errorMsg: '',
    tasks: [] as TaskView[],
    wsState: 'disconnected',
    wsStateText: '未连接',
    reachNames: {} as Record<string, string>,
    actionNames: ACTION_NAMES,
    statusNames: STATUS_NAMES,
  },

  privateUnsub: null as null | (() => void),

  onLoad() {
    if (!isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.privateUnsub = wsClient.onStateChange((s) => {
      this.setData({
        wsState: s,
        wsStateText:
          s === 'open' ? '已连接' : s === 'connecting' ? '连接中（将自动重连）' : '已断开（将自动重连）',
      });
    });
    // M3 后端就绪后开启 WS：connectRealtime()（services/api.ts）
    this.loadTasks();
  },

  onUnload() {
    this.privateUnsub?.();
  },

  onShow() {
    // 从详情/回填返回时刷新
    if (isLoggedIn() && this.data.uiState !== 'loading') this.loadTasks();
  },

  onPullDownRefresh() {
    this.loadTasks().finally(() => wx.stopPullDownRefresh());
  },

  async loadTasks(): Promise<void> {
    this.setData({ uiState: 'loading', errorMsg: '' });
    try {
      const res = await listTasks({ page: 1, pageSize: 50 });
      const tasks: TaskView[] = (res.items ?? []).map((t) => ({
        ...t,
        dueAtText: formatDateTime(t.dueAt),
      }));
      this.setData({ tasks, uiState: tasks.length ? 'success' : 'empty' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      logger.error('tasks', 'load failed', msg);
      this.setData({ uiState: 'error', errorMsg: msg });
    }
  },

  openTask(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/task-detail/task-detail?taskId=${encodeURIComponent(id)}` });
  },
});
