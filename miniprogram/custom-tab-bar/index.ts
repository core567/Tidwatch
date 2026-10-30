// custom-tab-bar/index.ts — V2 自定义底部导航（自绘 SVG 图标，无 PNG 资源）
// 选中态由各 tab 页 onShow 调用 syncSelected() 同步（见 utils/tabbar.ts）。
import { TAB_ICONS } from './icons';

interface TabItem {
  pagePath: string;
  text: string;
  icon: string;
  iconActive: string;
}

Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/tasks/tasks', text: '任务', icon: TAB_ICONS.tasks.normal, iconActive: TAB_ICONS.tasks.active },
      { pagePath: '/pages/events/events', text: '事件', icon: TAB_ICONS.events.normal, iconActive: TAB_ICONS.events.active },
      { pagePath: '/pages/reaches/reaches', text: '监测', icon: TAB_ICONS.monitor.normal, iconActive: TAB_ICONS.monitor.active },
      { pagePath: '/pages/profile/profile', text: '我的', icon: TAB_ICONS.me.normal, iconActive: TAB_ICONS.me.active },
    ] as TabItem[],
  },

  lifetimes: {
    attached() {
      // 自定义 tabBar 实例随 tab 页创建，首帧先按当前路由同步选中项，
      // 避免默认 0（任务）闪一下再被目标页 onShow 修正
      this.syncFromRoute();
    },
  },

  methods: {
    /** 根据当前页面栈顶部路由设置选中 index */
    syncFromRoute() {
      const pages = getCurrentPages();
      const cur = pages[pages.length - 1];
      const route = cur ? `/${cur.route}` : '';
      const idx = this.data.list.findIndex((it) => it.pagePath === route);
      if (idx >= 0 && idx !== this.data.selected) {
        this.setData({ selected: idx });
      }
    },

    onTap(e: WechatMiniprogram.TouchEvent) {
      const idx = Number((e.currentTarget.dataset as { idx: number }).idx);
      const item = this.data.list[idx];
      if (!item || idx === this.data.selected) return;
      // 立即更新本实例选中态（无需等目标页 onShow），消除高亮延迟
      this.setData({ selected: idx });
      wx.switchTab({ url: item.pagePath });
    },
  },
});
