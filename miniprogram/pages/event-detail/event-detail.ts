// pages/event-detail/event-detail.ts - M0 占位；M3 对接 getEventDetail 后渲染时间线/范围/证据
import { isLoggedIn } from '../../utils/auth';

Page({
  data: {
    eventId: '',
    uiState: 'loading' as 'loading' | 'success' | 'error',
    errorMsg: '',
    detail: null as Record<string, unknown> | null,
  },

  onLoad(query: Record<string, string | undefined>) {
    if (!isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const id = query.eventId ?? '';
    if (!id) {
      this.setData({ uiState: 'error', errorMsg: '缺少事件编号' });
      return;
    }
    // M0：不调用尚未存在的后端，直接以占位成功态展示
    this.setData({ eventId: id, uiState: 'success' });
  },

  load(): void {
    this.onLoad({ eventId: this.data.eventId });
  },
});
