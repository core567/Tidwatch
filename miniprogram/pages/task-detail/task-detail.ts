// pages/task-detail/task-detail.ts
import { getTask, actTask, listSubmissions, listReviews, listReaches } from '../../services/api';
import { getToken } from '../../utils/auth';
import { wsClient } from '../../utils/ws';
import { ENV } from '../../config/env';
import { formatDateTime } from '../../utils/util';
import { ACTION_NAMES, taskStatusView, CONCLUSION_NAMES } from '../../utils/taskLabels';
import { taskSteps, type TaskStep } from '../../utils/taskStep';
import { suggestedMetrics, MANUAL_METRICS, type ManualMetricDef } from '../../utils/taskRequirements';

interface SubmissionView {
  submissionId: string;
  version: number;
  conclusion: string;
  conclusionText: string;
  observationNote: string;
  submittedAtText: string;
  photoCount: number;
  measureCount: number;
  measures: { label: string; text: string; unmeasured: boolean }[];
  reviewDecision: string;
  reviewComment: string;
  reviewer: string;
  reviewedAtText: string;
}

Page({
  data: {
    taskId: '',
    uiState: 'loading' as 'loading' | 'success' | 'error',
    errorMsg: '',
    task: null as InspectionTask | null,
    actionText: '',
    dueAtText: '—',
    statusText: '',
    statusTone: '',
    rejected: false,
    rejectedAtText: '',
    reachName: '',
    completedAtText: '—',
    steps: null as TaskStep[] | null,
    suggestedMeasures: [] as ManualMetricDef[],
    submittedPhotos: [] as { attachmentId: string; tempPath: string }[],
    submissions: [] as SubmissionView[],
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
      const sv = taskStatusView(task.status, task.latestReview?.decision);
      const rejected =
        task.status === 'IN_PROGRESS' && task.latestReview?.decision === 'REJECTED';
      this.setData({
        task,
        actionText: ACTION_NAMES[task.actionType] ?? task.actionType,
        dueAtText: formatDateTime(task.dueAt),
        statusText: sv.text,
        statusTone: sv.tone,
        rejected,
        rejectedAtText: rejected ? formatDateTime(task.latestReview?.reviewedAt) : '',
        completedAtText: formatDateTime(task.completedAt),
        steps: taskSteps(task.status, task.latestReview?.decision),
        suggestedMeasures: suggestedMetrics(task.actionType)
          .map((k) => MANUAL_METRICS.find((m) => m.key === k))
          .filter(Boolean) as ManualMetricDef[],
        uiState: 'success',
      });
      this.loadReachName(task.reachId);
      if ((task.attachmentIds?.length ?? 0) > 0) this.loadSubmittedPhotos(task.attachmentIds);
      this.loadVersions();
    } catch (e) {
      this.setData({ uiState: 'error', errorMsg: e instanceof Error ? e.message : '未知错误' });
    }
  },

  async loadReachName(reachId: string): Promise<void> {
    try {
      const reaches = await listReaches();
      const hit = reaches.find((r) => r.reachId === reachId);
      if (hit) this.setData({ reachName: hit.officialCandidateName || hit.name });
    } catch {
      // 名称为增强信息，失败保留 reachId 兜底
    }
  },

  async loadVersions(): Promise<void> {
    try {
      const [subs, reviews] = await Promise.all([
        listSubmissions(this.data.taskId) as Promise<Record<string, unknown>[]>,
        listReviews(this.data.taskId) as Promise<Record<string, unknown>[]>,
      ]);
      const reviewByVersion = new Map<number, Record<string, unknown>>();
      (reviews as Record<string, unknown>[]).forEach((r) => {
        reviewByVersion.set(r.version as number, r);
      });
      const views: SubmissionView[] = (subs as Record<string, unknown>[]).map((s) => {
        const v = (s.version as number) ?? 0;
        const rv = reviewByVersion.get(v);
        const rawMeasures = (s.measurements as Record<string, unknown>[] | undefined) ?? [];
        const measures = rawMeasures.map((m) => {
          const key = String(m.metric ?? '');
          const def = MANUAL_METRICS.find((d) => d.key === key);
          const value = m.value;
          const reason = (m.unmeasuredReason as string) ?? '';
          return {
            label: def?.label ?? key,
            text:
              value === null || value === undefined
                ? `未测 · ${reason || '原因未填'}`
                : `${value}${def?.unit ?? ''}`,
            unmeasured: value === null || value === undefined,
          };
        });
        return {
          submissionId: s.submissionId as string,
          version: v,
          conclusion: s.conclusion as string,
          conclusionText: CONCLUSION_NAMES[s.conclusion as string] ?? (s.conclusion as string),
          observationNote: s.observationNote as string,
          submittedAtText: formatDateTime(s.submittedAt as string),
          photoCount: ((s.attachmentIds as string[]) ?? []).length,
          measureCount: measures.length,
          measures,
          reviewDecision: (rv?.decision as string) ?? '',
          reviewComment: (rv?.comment as string) ?? '',
          reviewer: (rv?.reviewer as string) ?? '',
          reviewedAtText: rv?.reviewedAt ? formatDateTime(rv.reviewedAt as string) : '',
        };
      });
      this.setData({ submissions: views });
    } catch {
      // 版本为增强信息，失败不阻塞详情
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
        if (res.statusCode === 200) photos.push({ attachmentId, tempPath: res.tempFilePath });
      } catch {
        // 单张失败不阻塞
      }
    }
    this.setData({ submittedPhotos: photos });
  },

  previewImage(e: WechatMiniprogram.TouchEvent): void {
    const src = (e.currentTarget.dataset as { src: string }).src;
    wx.previewImage({ current: src, urls: this.data.submittedPhotos.map((p) => p.tempPath) });
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
      await actTask(this.data.taskId, action);
      wx.showToast({ title: '操作成功', icon: 'success' });
      this.load();
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

  goRecord(): void {
    wx.navigateTo({ url: `/pages/record/record?taskId=${encodeURIComponent(this.data.taskId)}` });
  },

  openEvent(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/event-detail/event-detail?eventId=${encodeURIComponent(id)}` });
  },
});
