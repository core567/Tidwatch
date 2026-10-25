// pages/tasks/tasks.ts - 巡检任务列表（M0 占位骨架，M3 对接真实接口与 WS 推送）
import { listTasks } from '../../services/api';
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
    newTaskBadge: 0, // 实时收到的待处理新任务数
  },

  privateUnsub: null as null | (() => void),
  privateMsgUnsub: null as null | (() => void),
  seenTaskIds: new Set<string>(),
  loadedOnce: false,

  onLoad() {
    // 确保全局连接存在（单例，重复调用不会建第二条）
    wsClient.connect();
    this.privateUnsub = wsClient.onStateChange((s) => {
      this.setData({
        wsState: s,
        wsStateText:
          s === 'open' ? '已连接' : s === 'connecting' ? '连接中（将自动重连）' : '已断开（将自动重连）',
      });
      // 重连成功后强制重拉，补偿断线期间漏掉的任务（快照双保险）
      if (s === 'open' && this.loadedOnce) this.loadTasks({ silent: true });
    });
    // 实时消息：新任务/任务变化 → 刷新列表 + 角标
    this.privateMsgUnsub = wsClient.onMessage((msg) =>
      this.handleRealtime(msg as StreamMessage<StreamTaskPayload>),
    );
    this.loadTasks();
  },

  handleRealtime(msg: StreamMessage<StreamTaskPayload>): void {
    if (msg.messageType === 'task.created') {
      const tid = msg.payload?.taskId;
      if (tid && !this.seenTaskIds.has(tid)) {
        wx.vibrateShort?.({ type: 'light' });
      }
      this.setData({ newTaskBadge: this.data.newTaskBadge + 1 });
      this.loadTasks({ silent: true });
    } else if (msg.messageType === 'task.updated') {
      this.loadTasks({ silent: true });
    } else if (
      msg.messageType === 'event.created' ||
      msg.messageType === 'event.updated' ||
      msg.messageType === 'blindspot.opened'
    ) {
      // 异常事件/盲区也提示巡检人员关注
      this.loadTasks({ silent: true });
    }
  },

  onUnload() {
    this.privateUnsub?.();
    this.privateMsgUnsub?.();
  },

  onShow() {
    // 从详情/回填返回时刷新；查看后清零角标
    if (this.loadedOnce) this.loadTasks({ silent: true });
    if (this.data.newTaskBadge > 0) this.setData({ newTaskBadge: 0 });
  },

  onPullDownRefresh() {
    this.loadTasks().finally(() => wx.stopPullDownRefresh());
  },

  async loadTasks(opts: { silent?: boolean } = {}): Promise<void> {
    if (!opts.silent) this.setData({ uiState: 'loading', errorMsg: '' });
    try {
      const res = await listTasks({ page: 1, pageSize: 50 });
      const tasks: TaskView[] = (res.items ?? []).map((t) => ({
        ...t,
        dueAtText: formatDateTime(t.dueAt),
      }));
      // 记录当前任务 id 集合（用于新任务角标）
      tasks.forEach((t) => this.seenTaskIds.add(t.taskId));
      this.loadedOnce = true;
      this.setData({ tasks, uiState: tasks.length ? 'success' : 'empty' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      logger.error('tasks', 'load failed', msg);
      if (!opts.silent) this.setData({ uiState: 'error', errorMsg: msg });
    }
  },

  openTask(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/task-detail/task-detail?taskId=${encodeURIComponent(id)}` });
  },
});
