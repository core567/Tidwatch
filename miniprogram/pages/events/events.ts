// pages/events/events.ts - 异常事件列表（只读，M3 对接）
import { listEvents, type EventListQuery } from '../../services/api';
import { formatDateTime } from '../../utils/util';
import { logger } from '../../utils/logger';

type UiState = 'loading' | 'success' | 'empty' | 'error';

const STATUS_NAMES: Record<string, string> = {
  OPEN: '待初查',
  INVESTIGATING: '研判中',
  MONITORING: '持续观察',
  ESCALATED: '升级关注',
  NARROWED: '范围收窄',
  RECOVERY_PENDING: '待确认恢复',
  RECOVERED: '已恢复',
  UNRESOLVED: '无法判定',
};

const BADGE_CLASS: Record<string, string> = {
  OPEN: 'tw-badge-watch',
  INVESTIGATING: 'tw-badge-watch',
  MONITORING: 'tw-badge-watch',
  ESCALATED: 'tw-badge-danger',
  NARROWED: 'tw-badge-ok',
  RECOVERY_PENDING: 'tw-badge-watch',
  RECOVERED: 'tw-badge-ok',
  UNRESOLVED: 'tw-badge-offline',
};

interface EventView extends ActiveEvent {
  scopeText: string;
  updatedAtText: string;
}

Page({
  data: {
    uiState: 'loading' as UiState,
    errorMsg: '',
    activeStatus: '',
    filters: [
      { label: '全部', value: '' },
      { label: '活动中', value: 'ACTIVE' },
      { label: '待初查', value: 'OPEN' },
      { label: '研判中', value: 'INVESTIGATING' },
      { label: '升级', value: 'ESCALATED' },
      { label: '已恢复', value: 'RECOVERED' },
    ],
    events: [] as EventView[],
    statusNames: STATUS_NAMES,
    badgeClass: BADGE_CLASS,
  },

  onLoad() {
    this.loadEvents();
  },

  onPullDownRefresh() {
    this.loadEvents().finally(() => wx.stopPullDownRefresh());
  },

  onFilter(e: WechatMiniprogram.TouchEvent): void {
    const value = (e.currentTarget.dataset as { value: string }).value;
    this.setData({ activeStatus: value });
    this.loadEvents();
  },

  async loadEvents(): Promise<void> {
    this.setData({ uiState: 'loading', errorMsg: '' });
    try {
      // 'ACTIVE' 为前端聚合筛选（非终态），后端不支持时拉全部后本地过滤
      const wantActive = this.data.activeStatus === 'ACTIVE';
      const query: EventListQuery = { page: 1, pageSize: 50 };
      if (this.data.activeStatus && !wantActive) {
        query.status = this.data.activeStatus as EventStatus;
      }
      const res = await listEvents(query);
      let items = res.items ?? [];
      if (wantActive) {
        items = items.filter((ev) => ev.status !== 'RECOVERED' && ev.status !== 'UNRESOLVED');
      }
      const events: EventView[] = items.map((ev) => ({
        ...ev,
        scopeText: (ev.scopeReachIds ?? []).map((r) => r.replace('reach-', '').toUpperCase()).join(' / ') || '—',
        updatedAtText: formatDateTime(ev.updatedAt),
      }));
      this.setData({ events, uiState: events.length ? 'success' : 'empty' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知错误';
      logger.error('events', 'load failed', msg);
      this.setData({ uiState: 'error', errorMsg: msg });
    }
  },

  openEvent(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/event-detail/event-detail?eventId=${encodeURIComponent(id)}` });
  },
});
