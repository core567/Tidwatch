/**
 * 单页面常驻容器（Single-Page Shell）。
 *
 * 关键：整个页面只有一个 Page 实例，四个模块通过 activeTab + hidden 显隐，
 * 不调用 wx.switchTab / redirectTo / reLaunch（仅在进入业务详情时 navigateTo）。
 * 模块组件全部常驻 wxml（靠 hidden 保留实例与数据）：
 * - 监测（shell-monitor）：第二阶段已接正式接口；
 * - 任务（shell-tasks）：第三阶段 A 已接正式接口，首次激活才初始化，之后复用；
 * - 事件 / 我的：第三阶段 B/C 前仍为标注的静态演示面板。
 */

interface TabDef {
  key: string;
  label: string;
}

const TABS: TabDef[] = [
  { key: 'tasks', label: '任务' },
  { key: 'events', label: '事件' },
  { key: 'monitor', label: '监测' },
  { key: 'me', label: '我的' },
];

Page({
  data: {
    tabs: TABS,
    activeTab: 'tasks',
    // 模块徽章：四个模块均已接正式接口（「我的」为系统与演示中心）
    demoFlag: '单页面工作台',
    loadCount: 0,
    showCount: 0,
    switchCount: 0,
    lastSwitchCost: 0,
    // 复核通知未读数（由 shell-notify 组件上报，驱动底部「任务」红点）
    notifyUnread: 0,
  },

  onLoad() {
    this.setData({ loadCount: this.data.loadCount + 1 });
    console.log('[shell] onLoad #', this.data.loadCount);
  },

  onShow() {
    this.setData({ showCount: this.data.showCount + 1 });
    console.log('[shell] onShow #', this.data.showCount);
    // 从任务详情返回：通知可能已被标记已读，通知组件静默补拉校正红点
    const notify = this.selectComponent('#notify') as { pageShow?: () => void } | null;
    notify?.pageShow?.();
  },

  /** shell-notify 上报未读数 */
  onNotifyUnread(e: WechatMiniprogram.CustomEvent) {
    const unread = Number((e.detail ?? {}).unread ?? 0);
    if (unread !== this.data.notifyUnread) this.setData({ notifyUnread: unread });
  },

  /** 点击通知：进入对应任务详情（navigateTo，不切模块、不用 switchTab） */
  onOpenTaskFromNotify(e: WechatMiniprogram.CustomEvent) {
    const taskId = (e.detail ?? {}).taskId as string | undefined;
    if (taskId) {
      wx.navigateTo({ url: `/pages/task-detail/task-detail?taskId=${encodeURIComponent(taskId)}` });
    }
  },

  /** 底部导航：仅切换 activeTab，无任何 wx 导航 API */
  onTabTap(e: WechatMiniprogram.TouchEvent) {
    const key = (e.currentTarget.dataset as { key: string }).key;
    if (!key || key === this.data.activeTab) return;
    const t0 = Date.now();
    this.setData({ activeTab: key });
    const cost = Date.now() - t0;
    this.setData({
      switchCount: this.data.switchCount + 1,
      lastSwitchCost: cost,
    });
    console.log('[shell] switch ->', key, 'setData 耗时(ms):', cost, '总切换:', this.data.switchCount + 1);
  },

  /** 模块内跳转正式详情页（离开单页面，进入既有详情页，闭环操作复用正式页） */
  onNavigate(e: WechatMiniprogram.CustomEvent) {
    const { type, id } = (e.detail ?? {}) as { type?: string; id?: string };
    if (type === 'reach' && id) {
      wx.navigateTo({ url: `/pages/reach-detail/reach-detail?reachId=${encodeURIComponent(id)}` });
    } else if (type === 'task' && id) {
      wx.navigateTo({ url: `/pages/task-detail/task-detail?taskId=${encodeURIComponent(id)}` });
    } else if (type === 'event' && id) {
      wx.navigateTo({ url: `/pages/event-detail/event-detail?eventId=${encodeURIComponent(id)}` });
    }
  },
});
