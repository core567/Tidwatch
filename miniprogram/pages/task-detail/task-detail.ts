// pages/task-detail/task-detail.ts
import { getTask, actTask } from '../../services/api';
import { formatDateTime } from '../../utils/util';

const ACTION_NAMES: Record<string, string> = {
  CONTINUE_OBSERVE: '持续观察',
  FOCUS_REACH_B: '重点观察 B',
  FOCUS_REACH_C: '重点观察 C',
  KEEP_LOCAL_SCOPE: '保持局部关注',
  INSPECT_DATA_LINK: '检查数据链路',
  MANUAL_CHECK: '现场人工核查',
  RE_EVALUATE_AFTER_RECOVERY: '恢复后再评估',
};

Page({
  data: {
    taskId: '',
    uiState: 'loading' as 'loading' | 'success' | 'error',
    errorMsg: '',
    task: null as InspectionTask | null,
    actionText: '',
    dueAtText: '—',
  },

  onLoad(query: Record<string, string | undefined>) {
    const id = query.taskId ?? '';
    this.setData({ taskId: id });
    if (!id) {
      this.setData({ uiState: 'error', errorMsg: '缺少任务编号' });
      return;
    }
    this.load();
  },

  async load(): Promise<void> {
    this.setData({ uiState: 'loading', errorMsg: '' });
    try {
      const task = await getTask(this.data.taskId);
      this.setData({
        task,
        actionText: ACTION_NAMES[task.actionType] ?? task.actionType,
        dueAtText: formatDateTime(task.dueAt),
        uiState: 'success',
      });
    } catch (e) {
      this.setData({ uiState: 'error', errorMsg: e instanceof Error ? e.message : '未知错误' });
    }
  },

  async onAccept(): Promise<void> {
    await this.doAction('ACCEPT');
  },
  async onStart(): Promise<void> {
    await this.doAction('START');
  },

  async doAction(action: 'ACCEPT' | 'START' | 'CANCEL'): Promise<void> {
    try {
      wx.showLoading({ title: '提交中' });
      const task = await actTask(this.data.taskId, action);
      this.setData({ task, uiState: 'success' });
      wx.showToast({ title: '操作成功', icon: 'success' });
    } catch (e) {
      wx.showModal({
        title: '操作被拒绝',
        content: e instanceof Error ? e.message : '状态冲突或网络错误',
        showCancel: false,
      });
    } finally {
      wx.hideLoading();
    }
  },

  goRecord(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/record/record?taskId=${encodeURIComponent(id)}` });
  },

  openEvent(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/event-detail/event-detail?eventId=${encodeURIComponent(id)}` });
  },
});
