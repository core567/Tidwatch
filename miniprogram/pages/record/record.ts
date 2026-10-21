// pages/record/record.ts - 现场巡检记录与拍照上传（M3 对接真实接口）
import { uploadPhoto, submitTaskResult } from '../../services/api';

type PhotoStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

interface PhotoItem {
  localPath: string;
  status: PhotoStatus;
  statusText: string;
  attachmentId?: string;
}

const STATUS_TEXT: Record<PhotoStatus, string> = {
  pending: '待上传',
  uploading: '上传中',
  uploaded: '已上传',
  failed: '上传失败',
};

Page({
  data: {
    taskId: '',
    observationNote: '',
    conclusion: 'NORMAL' as 'NORMAL' | 'ABNORMAL' | 'UNCERTAIN',
    photos: [] as PhotoItem[],
    submitting: false,
    errorMsg: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    this.setData({ taskId: query.taskId ?? '' });
  },

  onNoteInput(e: WechatMiniprogram.TextareaInput): void {
    this.setData({ observationNote: e.detail.value });
  },
  onConclusionChange(e: WechatMiniprogram.CustomEvent<{ value: string }>): void {
    this.setData({
      conclusion: e.detail.value as 'NORMAL' | 'ABNORMAL' | 'UNCERTAIN',
    });
  },

  choosePhoto(): void {
    wx.chooseMedia({
      count: 6 - this.data.photos.length,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      success: (res) => {
        const added: PhotoItem[] = res.tempFiles.map((f) => ({
          localPath: f.tempFilePath,
          status: 'pending',
          statusText: STATUS_TEXT.pending,
        }));
        this.setData({ photos: [...this.data.photos, ...added] });
      },
    });
  },

  previewPhoto(e: WechatMiniprogram.TouchEvent): void {
    const idx = (e.currentTarget.dataset as { idx: number }).idx;
    const urls = this.data.photos.map((p) => p.localPath);
    wx.previewImage({ current: urls[idx], urls });
  },

  removePhoto(e: WechatMiniprogram.TouchEvent): void {
    const idx = (e.currentTarget.dataset as { idx: number }).idx;
    const photos = [...this.data.photos];
    photos.splice(idx, 1);
    this.setData({ photos });
  },

  async uploadAllPhotos(): Promise<boolean> {
    const photos = [...this.data.photos];
    for (let i = 0; i < photos.length; i++) {
      if (photos[i].status === 'uploaded') continue;
      photos[i] = { ...photos[i], status: 'uploading', statusText: STATUS_TEXT.uploading };
      this.setData({ photos });
      try {
        const meta = await uploadPhoto(photos[i].localPath);
        photos[i] = {
          ...photos[i],
          status: 'uploaded',
          statusText: STATUS_TEXT.uploaded,
          attachmentId: meta.attachmentId,
        };
      } catch (e) {
        photos[i] = { ...photos[i], status: 'failed', statusText: STATUS_TEXT.failed };
        this.setData({ photos });
        return false;
      }
      this.setData({ photos });
    }
    return true;
  },

  async onSubmit(): Promise<void> {
    if (!this.data.taskId) {
      this.setData({ errorMsg: '缺少任务编号' });
      return;
    }
    if (!this.data.observationNote.trim()) {
      this.setData({ errorMsg: '请填写现场观察记录' });
      return;
    }
    this.setData({ submitting: true, errorMsg: '' });
    try {
      const ok = await this.uploadAllPhotos();
      if (!ok) {
        this.setData({ errorMsg: '存在照片上传失败，请重试或移除后提交', submitting: false });
        return;
      }
      await submitTaskResult(this.data.taskId, {
        observationNote: this.data.observationNote.trim(),
        observedAt: new Date().toISOString(),
        attachmentIds: this.data.photos.map((p) => p.attachmentId).filter(Boolean) as string[],
        conclusion: this.data.conclusion,
        requestReevaluate: this.data.conclusion === 'ABNORMAL',
      });
      wx.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e) {
      this.setData({ errorMsg: e instanceof Error ? e.message : '提交失败' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
