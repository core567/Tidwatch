// pages/reaches/reaches.ts - 监测点列表（只读，M3 对接）
import { listReaches } from '../../services/api';
import { isLoggedIn } from '../../utils/auth';
import { formatRelative } from '../../utils/util';
import { logger } from '../../utils/logger';

type UiState = 'loading' | 'success' | 'empty' | 'error';

const STATUS_NAMES: Record<string, string> = {
  ONLINE: '在线',
  STALE: '数据陈旧',
  OFFLINE: '离线',
};

const BADGE_CLASS: Record<string, string> = {
  ONLINE: 'tw-badge-ok',
  STALE: 'tw-badge-watch',
  OFFLINE: 'tw-badge-offline',
};

interface ReachView extends Reach {
  lastObservedAtText: string;
}

Page({
  data: {
    uiState: 'loading' as UiState,
    errorMsg: '',
    reaches: [] as ReachView[],
    statusNames: STATUS_NAMES,
    badgeClass: BADGE_CLASS,
  },

  onLoad() {
    if (!isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this.loadReaches();
  },

  onPullDownRefresh() {
    this.loadReaches().finally(() => wx.stopPullDownRefresh());
  },

  async loadReaches(): Promise<void> {
    this.setData({ uiState: 'loading', errorMsg: '' });
    try {
      const items = await listReaches();
      const reaches: ReachView[] = (items ?? [])
        .slice()
        .sort((a, b) => a.topoOrder - b.topoOrder)
        .map((r) => ({ ...r, lastObservedAtText: formatRelative(r.lastObservedAt) }));
      this.setData({ reaches, uiState: reaches.length ? 'success' : 'empty' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      logger.error('reaches', 'load failed', msg);
      this.setData({ uiState: 'error', errorMsg: msg });
    }
  },

  openReach(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/reach-detail/reach-detail?reachId=${encodeURIComponent(id)}` });
  },
});
