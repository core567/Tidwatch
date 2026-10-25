// pages/task-detail/task-detail.ts
import { getTask, actTask } from '../../services/api';
import { getToken } from '../../utils/auth';
import { wsClient } from '../../utils/ws';
import { ENV } from '../../config/env';
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
    submittedPhotos: [] as { attachmentId: string; tempPath: string }[],
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

  privateUnsub: null as null | (() => void),

  onUnload() {
    this.privateUnsub?.();
  },

  onShow() {
    // 确保 WS 已连接；收到本任务的更新时静默重拉
    wsClient.connect();
    if (this.data.taskId) {
      this.privateUnsub?.();
      this.privateUnsub = wsClient.onMessage((raw) => {
        const msg = raw as StreamMessage<StreamTaskPayload>;
        if (
          (msg.messageType === 'task.updated' && msg.payload?.taskId === this.data.taskId) ||
          (msg.messageType === 'task.created' && msg.payload?.taskId === this.data.taskId)
        ) {
          this.load();
        }
      });
    }
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
      // 已回填任务：鉴权下载照片到本地临时路径用于回显
      if ((task.attachmentIds?.length ?? 0) > 0) {
        this.loadSubmittedPhotos(task.attachmentIds);
      }
    } catch (e) {
      this.setData({ uiState: 'error', errorMsg: e instanceof Error ? e.message : '未知错误' });
    }
  },

  async loadSubmittedPhotos(ids: string[]): Promise<void> {
    const token = getToken();
    const photos: { attachmentId: string; tempPath: string }[] = [];
    for (const attachmentId of ids) {
      try {
        const res: WechatMiniprogram.DownloadFileSuccessCallbackResult = await new Promise(
          (resolve, reject) => {
            wx.downloadFile({
              url: `${ENV.API_BASE_URL}/api/inspection-tasks/uploads/${attachmentId}/content`,
              header: token ? { Authorization: `Bearer ${token}` } : {},
              success: resolve,
              fail: reject,
            });
          },
        );
        if (res.statusCode === 200) {
          photos.push({ attachmentId, tempPath: res.tempFilePath });
        }
      } catch {
        // 单张失败不阻塞详情页
      }
    }
    this.setData({ submittedPhotos: photos });
  },

  previewImage(e: WechatMiniprogram.TouchEvent): void {
    const src = (e.currentTarget.dataset as { src: string }).src;
    const urls = this.data.submittedPhotos.map((p) => p.tempPath);
    wx.previewImage({ current: src, urls });
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
