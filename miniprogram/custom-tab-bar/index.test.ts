// 【仅隔离测试用】最小 Tab 测试环境的自定义 TabBar。
// 由 scripts/use-tab-test.sh / use-tab-prod.sh 切换，正式环境不会用到本组件。
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
      { pagePath: '/pages/_tabtest/tt-tasks', text: 'T1', icon: TAB_ICONS.tasks.normal, iconActive: TAB_ICONS.tasks.active },
      { pagePath: '/pages/_tabtest/tt-events', text: 'T2', icon: TAB_ICONS.events.normal, iconActive: TAB_ICONS.events.active },
      { pagePath: '/pages/_tabtest/tt-reaches', text: 'T3', icon: TAB_ICONS.monitor.normal, iconActive: TAB_ICONS.monitor.active },
      { pagePath: '/pages/_tabtest/tt-profile', text: 'T4', icon: TAB_ICONS.me.normal, iconActive: TAB_ICONS.me.active },
    ] as TabItem[],
  },
  lifetimes: {
    attached() { this.syncFromRoute(); },
  },
  methods: {
    syncFromRoute() {
      const pages = getCurrentPages();
      const cur = pages[pages.length - 1];
      const route = cur ? `/${cur.route}` : '';
      const idx = this.data.list.findIndex((it) => it.pagePath === route);
      if (idx >= 0 && idx !== this.data.selected) this.setData({ selected: idx });
    },
    onTap(e: WechatMiniprogram.TouchEvent) {
      const idx = Number((e.currentTarget.dataset as { idx: number }).idx);
      const item = this.data.list[idx];
      if (!item || idx === this.data.selected) return;
      this.setData({ selected: idx });
      wx.switchTab({ url: item.pagePath });
    },
  },
});
