// pages/record/record.ts - 现场采集 V2
// - 人工复测项由任务类型“建议”派生（非全局硬编码必填）
// - 数值只做格式校验；建议项允许“填值”或“选择未测原因”
// - 照片单张独立上传/失败重试；提交前统一完整性检查
import {
  getTask,
  uploadPhoto,
  submitTaskResult,
  type InspectionTask,
} from '../../services/api';
import { taskStatusView } from '../../utils/taskLabels';
import {
  MANUAL_METRICS,
  UNMEASURED_REASONS,
  suggestedMetrics,
  metricDef,
  validateMetricFormat,
  checkMeasurements,
  buildMeasurementsPayload,
  type ManualMetricKey,
  type MeasureState,
} from '../../utils/taskRequirements';
import { startVoiceRecognition, type VoiceResult } from '../../services/voice';
import { formatDateTime } from '../../utils/util';

type PhotoStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';
interface VoiceHandle { stop: () => void }

interface PhotoItem {
  localPath: string;
  status: PhotoStatus;
  statusText: string;
  attachmentId?: string;
}

interface MeasureRow extends MeasureState {
  label: string;
  unit: string;
  hint: string;
  input: 'decimal' | 'level';
  suggested: boolean;
  error: string;
}

const PHOTO_MAX = 6;
const PHOTO_STATUS_TEXT: Record<PhotoStatus, string> = {
  pending: '待上传',
  uploading: '上传中',
  uploaded: '已上传',
  failed: '上传失败',
};

Page({
  data: {
    taskId: '',
    ctxState: 'loading' as 'loading' | 'ready' | 'error',
    ctxError: '',
    task: null as InspectionTask | null,
    statusText: '',
    rejected: false,
    rejectComment: '',
    rejectReviewer: '',
    rejectedAtText: '',
    nextVersion: 1,
    measures: [] as MeasureRow[],
    observationNote: '',
    conclusion: 'NORMAL' as 'NORMAL' | 'ABNORMAL' | 'UNCERTAIN',
    photos: [] as PhotoItem[],
    submitting: false,
    errorMsg: '',
    checkItems: [] as { ok: boolean; text: string }[],
    voiceState: '' as '' | 'start' | 'stop' | 'error',
    voiceSource: '' as '' | 'VOICE_PLUGIN' | 'MANUAL_FALLBACK',
    voiceHint: '',
  },

  _voice: null as VoiceHandle | null,

  onLoad(query: Record<string, string | undefined>) {
    const taskId = query.taskId ?? '';
    this.setData({ taskId });
    if (!taskId) {
      this.setData({ ctxState: 'error', ctxError: '缺少任务编号' });
      return;
    }
    this.loadContext();
  },

  async loadContext(): Promise<void> {
    this.setData({ ctxState: 'loading', ctxError: '' });
    try {
      const task = await getTask(this.data.taskId);
      const sv = taskStatusView(task.status, task.latestReview?.decision);
      const rejected = task.status === 'IN_PROGRESS' && task.latestReview?.decision === 'REJECTED';
      const suggested = suggestedMetrics(task.actionType);
      const measures: MeasureRow[] = MANUAL_METRICS.map((def) => ({
        key: def.key,
        label: def.label,
        unit: def.unit,
        hint: def.hint,
        input: def.input,
        suggested: suggested.includes(def.key),
        raw: '',
        reason: '',
        error: '',
      }));
      this.setData({
        task,
        ctxState: 'ready',
        statusText: sv.text,
        rejected,
        rejectComment: rejected ? task.latestReview?.comment ?? '' : '',
        rejectReviewer: rejected ? task.latestReview?.reviewer ?? '' : '',
        rejectedAtText: rejected ? formatDateTime(task.latestReview?.reviewedAt) : '',
        nextVersion: (task.latestVersion ?? 0) + 1,
        measures,
      });
      this.refreshChecks();
    } catch (e) {
      this.setData({ ctxState: 'error', ctxError: e instanceof Error ? e.message : '未知错误' });
    }
  },

  // ---------- 复测项 ----------
  onMeasureInput(e: WechatMiniprogram.CustomEvent<{ value: string }> | WechatMiniprogram.Input) {
    const key = (e.currentTarget.dataset as { key: ManualMetricKey }).key;
    const raw = (e as WechatMiniprogram.Input).detail.value;
    this.patchMeasure(key, { raw, reason: '' });
  },

  onStep(e: WechatMiniprogram.TouchEvent) {
    const { key, delta } = e.currentTarget.dataset as { key: ManualMetricKey; delta: string };
    const row = this.data.measures.find((m) => m.key === key);
    if (!row) return;
    const cur = row.raw === '' ? 0 : Number(row.raw) || 0;
    const next = Math.max(0, Math.min(3, cur + Number(delta)));
    this.patchMeasure(key, { raw: String(next), reason: '' });
  },

  /** 未测原因（native actionSheet） */
  onPickReason(e: WechatMiniprogram.TouchEvent) {
    const key = (e.currentTarget.dataset as { key: ManualMetricKey }).key;
    wx.showActionSheet({
      itemList: [...UNMEASURED_REASONS],
      success: (res) => {
        this.patchMeasure(key, { raw: '', reason: UNMEASURED_REASONS[res.tapIndex] });
      },
      fail: () => undefined,
    });
  },

  onClearReason(e: WechatMiniprogram.TouchEvent) {
    const key = (e.currentTarget.dataset as { key: ManualMetricKey }).key;
    this.patchMeasure(key, { reason: '' });
  },

  patchMeasure(key: ManualMetricKey, patch: Partial<MeasureRow>): void {
    const measures = this.data.measures.map((m) => {
      if (m.key !== key) return m;
      const next = { ...m, ...patch };
      // 实时格式校验（仅在有值时）
      if (next.raw !== '') {
        const f = validateMetricFormat(key, next.raw);
        next.error = f.ok ? '' : f.error;
      } else {
        next.error = '';
      }
      return next;
    });
    this.setData({ measures });
    this.refreshChecks();
  },

  // ---------- 观察记录 / 语音 ----------
  onVoiceStart(): void {
    if (this.data.voiceState === 'start') return;
    this.setData({ voiceState: 'start', voiceHint: '正在聆听…' });
    this._voice = startVoiceRecognition({
      onState: (state) => this.setData({ voiceState: state }),
      onResult: (r: VoiceResult) => {
        if (r.text) {
          const sep = this.data.observationNote ? ' ' : '';
          this.setData({
            observationNote: this.data.observationNote + sep + r.text,
            voiceSource: r.source,
            voiceHint: r.source === 'VOICE_PLUGIN' ? '已通过语音转写追加' : '',
            voiceState: 'stop',
          });
        } else {
          this.setData({
            voiceSource: 'MANUAL_FALLBACK',
            voiceHint: r.fallbackReason || '请手动输入现场记录',
            voiceState: 'error',
          });
        }
        this.refreshChecks();
      },
    });
  },
  onVoiceEnd(): void {
    this._voice?.stop();
    this._voice = null;
    if (this.data.voiceState === 'start') this.setData({ voiceState: 'stop', voiceHint: '识别中…' });
  },
  onNoteInput(e: WechatMiniprogram.TextareaInput): void {
    this.setData({ observationNote: e.detail.value, voiceSource: 'MANUAL_FALLBACK' });
    this.refreshChecks();
  },
  onConclusionChange(e: WechatMiniprogram.CustomEvent<{ value: string }>): void {
    this.setData({ conclusion: e.detail.value as 'NORMAL' | 'ABNORMAL' | 'UNCERTAIN' });
    this.refreshChecks();
  },

  // ---------- 照片 ----------
  /** 直接调起后置摄像头拍照 */
  takePhoto(): void {
    this.choosePhotoFrom('camera');
  },

  /** 从相册选择 */
  chooseAlbum(): void {
    this.choosePhotoFrom('album');
  },

  /**
   * @param source 'camera' 直接开摄像头；'album' 仅相册
   * 用户取消不报错；权限拒绝/设备不支持给出可理解提示，不影响已填记录。
   */
  choosePhotoFrom(source: 'camera' | 'album'): void {
    const remain = PHOTO_MAX - this.data.photos.length;
    if (remain <= 0) {
      wx.showToast({ title: `最多上传 ${PHOTO_MAX} 张`, icon: 'none' });
      return;
    }
    wx.chooseMedia({
      // 按剩余可传数量动态设置
      count: remain,
      mediaType: ['image'],
      // 关键：单一来源——拍照仅摄像头、相册仅相册
      sourceType: [source],
      camera: 'back',
      sizeType: ['compressed'],
      success: (res) => {
        const added: PhotoItem[] = res.tempFiles.map((f) => ({
          localPath: f.tempFilePath,
          status: 'pending',
          statusText: PHOTO_STATUS_TEXT.pending,
        }));
        this.setData({ photos: [...this.data.photos, ...added] });
        this.refreshChecks();
        // 选择完成后自动开始上传
        added.forEach((_, offset) => {
          const idx = this.data.photos.length - added.length + offset;
          void this.uploadOne(idx);
        });
      },
      fail: (err) => {
        const msg = String(err?.errMsg ?? '');
        // 用户主动取消：静默处理，不弹错误、不清空表单
        if (/cancel/i.test(msg)) return;
        if (source === 'camera') {
          // 权限拒绝 / 设备无摄像头等
          if (/auth|deny|permission/i.test(msg)) {
            wx.showModal({
              title: '无法使用摄像头',
              content: '请在小程序设置中允许使用摄像头，或改用相册选择照片。',
              confirmText: '去相册',
              cancelText: '取消',
              success: (r) => { if (r.confirm) this.choosePhotoFrom('album'); },
            });
          } else if (/not support|unsupported/i.test(msg)) {
            wx.showToast({ title: '当前设备不支持拍照，请用相册', icon: 'none' });
          } else {
            wx.showToast({ title: '拍照失败，请重试或改用相册', icon: 'none' });
          }
        } else {
          wx.showToast({ title: '无法打开相册，请重试', icon: 'none' });
        }
      },
    });
  },
  previewPhoto(e: WechatMiniprogram.TouchEvent): void {
    const idx = Number((e.currentTarget.dataset as { idx: number }).idx);
    const urls = this.data.photos.map((p) => p.localPath);
    wx.previewImage({ current: urls[idx], urls });
  },
  removePhoto(e: WechatMiniprogram.TouchEvent): void {
    const idx = Number((e.currentTarget.dataset as { idx: number }).idx);
    const photos = [...this.data.photos];
    photos.splice(idx, 1);
    this.setData({ photos });
    this.refreshChecks();
  },
  async retryPhoto(e: WechatMiniprogram.TouchEvent): Promise<void> {
    const idx = Number((e.currentTarget.dataset as { idx: number }).idx);
    await this.uploadOne(idx);
  },

  async uploadOne(idx: number): Promise<boolean> {
    const photos = [...this.data.photos];
    const item = photos[idx];
    if (!item || item.status === 'uploaded' || item.status === 'uploading') return item?.status === 'uploaded';
    photos[idx] = { ...item, status: 'uploading', statusText: PHOTO_STATUS_TEXT.uploading };
    this.setData({ photos });
    try {
      const meta = await uploadPhoto(item.localPath);
      const cur = [...this.data.photos];
      cur[idx] = { ...item, status: 'uploaded', statusText: PHOTO_STATUS_TEXT.uploaded, attachmentId: meta.attachmentId };
      this.setData({ photos: cur });
      this.refreshChecks();
      return true;
    } catch {
      const cur = [...this.data.photos];
      cur[idx] = { ...item, status: 'failed', statusText: PHOTO_STATUS_TEXT.failed };
      this.setData({ photos: cur });
      this.refreshChecks();
      return false;
    }
  },

  async uploadAllPhotos(): Promise<boolean> {
    for (let i = 0; i < this.data.photos.length; i++) {
      const st = this.data.photos[i].status;
      if (st === 'uploaded') continue;
      const ok = await this.uploadOne(i);
      if (!ok) return false;
    }
    return true;
  },

  // ---------- 提交前检查（纯展示实时清单） ----------
  refreshChecks(): void {
    const { measures, observationNote, photos } = this.data;
    const suggested = measures.filter((m) => m.suggested).map((m) => m.key) as ManualMetricKey[];
    const states: MeasureState[] = measures.map((m) => ({ key: m.key, raw: m.raw, reason: m.reason }));
    const measureCheck = checkMeasurements(states, suggested);

    const items: { ok: boolean; text: string }[] = [];
    // 建议测量项
    if (suggested.length === 0) {
      items.push({ ok: true, text: '本任务类型无建议复测项，测量项全部选填' });
    } else {
      const labels = suggested.map((k) => metricDef(k).label).join('、');
      const filled = states.filter((s) => suggested.includes(s.key) && (s.raw !== '' || s.reason !== '')).length;
      items.push({
        ok: measureCheck.ok && filled === suggested.length,
        text: `建议测量项（${labels}）：已填值或注明未测原因 ${filled}/${suggested.length}`,
      });
    }
    // 格式错误
    for (const m of measures) {
      if (m.error) items.push({ ok: false, text: `「${m.label}」${m.error}` });
    }
    items.push({ ok: observationNote.trim().length > 0, text: '现场观察记录已填写' });
    items.push({ ok: true, text: '现场结论已选择' });
    const failed = photos.some((p) => p.status === 'failed');
    const pending = photos.some((p) => p.status === 'pending');
    items.push({
      ok: !failed && !pending,
      text: photos.length === 0 ? '未添加照片（无强制照片要求时可提交）' : failed ? '有照片上传失败，请单张重试' : pending ? '照片待上传' : `${photos.length} 张照片已上传`,
    });
    // 完整性状态只体现在清单；errorMsg 保留给提交/网络错误，不在输入中置红
    this.setData({ checkItems: items });
  },

  async onSubmit(): Promise<void> {
    if (!this.data.taskId) {
      this.setData({ errorMsg: '缺少任务编号' });
      return;
    }
    this.refreshChecks();
    const measureBlocking = !checkMeasurements(
      this.data.measures.map((m) => ({ key: m.key, raw: m.raw, reason: m.reason })),
      this.data.measures.filter((m) => m.suggested).map((m) => m.key) as ManualMetricKey[],
    ).ok;
    const blocking = this.data.checkItems.some((i) => !i.ok) || measureBlocking;
    if (blocking) {
      wx.showToast({ title: '请先完成检查项', icon: 'none' });
      return;
    }
    this.setData({ submitting: true, errorMsg: '' });
    try {
      const photosOk = await this.uploadAllPhotos();
      if (!photosOk) {
        this.setData({ submitting: false, errorMsg: '存在照片上传失败，请单张重试或移除后提交' });
        return;
      }
      const states: MeasureState[] = this.data.measures.map((m) => ({ key: m.key, raw: m.raw, reason: m.reason }));
      await submitTaskResult(this.data.taskId, {
        observationNote: this.data.observationNote.trim(),
        observedAt: new Date().toISOString(),
        attachmentIds: this.data.photos.map((p) => p.attachmentId).filter(Boolean) as string[],
        conclusion: this.data.conclusion,
        requestReevaluate: this.data.conclusion === 'ABNORMAL',
        measurements: buildMeasurementsPayload(states),
      });
      // 后端确认成功后才提示并返回；不用固定延时掩盖问题。
      // navigateBack 带 success/fail 回调：成功回上一页由 task-detail onShow 静默刷新；
      // 极端情况下导航栈为空则 fail 真实报错并停留在本页（输入仍保留）。
      wx.showToast({ title: '提交成功', icon: 'success', duration: 1500 });
      wx.navigateBack({
        fail: (err) => {
          this.setData({
            submitting: false,
            errorMsg: `提交已保存，但返回任务详情失败：${err?.errMsg ?? '未知错误'}，请点左上角返回`,
          });
        },
      });
    } catch (e) {
      // 提交失败：停留本页，复测值/照片/观察记录均保留，解除提交锁允许重试
      this.setData({ submitting: false, errorMsg: e instanceof Error ? e.message : '提交失败' });
    }
  },
});
