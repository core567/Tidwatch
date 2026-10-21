// pages/reach-detail/reach-detail.ts - M0 展示监测点元数据；指标在 M1 对接观测接口
import { getReach } from '../../services/api';
import { isLoggedIn } from '../../utils/auth';
import { formatDateTime } from '../../utils/util';

const ROLE_TEXT: Record<string, string> = {
  upstream: '上游 A',
  midstream: '中游 B',
  downstream: '下游 C',
};
const STATUS_TEXT: Record<string, string> = {
  ONLINE: '在线',
  STALE: '数据陈旧',
  OFFLINE: '离线',
};
const BADGE_CLASS: Record<string, string> = {
  ONLINE: 'tw-badge-ok',
  STALE: 'tw-badge-watch',
  OFFLINE: 'tw-badge-offline',
};

Page({
  data: {
    reachId: '',
    uiState: 'loading' as 'loading' | 'success' | 'error',
    errorMsg: '',
    reach: null as Reach | null,
    roleText: '',
    statusText: '',
    badgeClass: 'tw-badge-offline',
    lastText: '—',
  },

  onLoad(query: Record<string, string | undefined>) {
    if (!isLoggedIn()) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    const id = query.reachId ?? '';
    this.setData({ reachId: id });
    if (!id) {
      this.setData({ uiState: 'error', errorMsg: '缺少监测点编号' });
      return;
    }
    this.load();
  },

  async load(): Promise<void> {
    this.setData({ uiState: 'loading', errorMsg: '' });
    try {
      const reach = await getReach(this.data.reachId);
      this.setData({
        reach,
        roleText: ROLE_TEXT[reach.role] ?? reach.role,
        statusText: STATUS_TEXT[reach.onlineStatus] ?? reach.onlineStatus,
        badgeClass: BADGE_CLASS[reach.onlineStatus] ?? 'tw-badge-offline',
        lastText: formatDateTime(reach.lastObservedAt),
        uiState: 'success',
      });
    } catch (e) {
      this.setData({ uiState: 'error', errorMsg: e instanceof Error ? e.message : '未知错误' });
    }
  },
});
