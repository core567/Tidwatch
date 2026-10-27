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

  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const idx = Number((e.currentTarget.dataset as { idx: number }).idx);
      const item = this.data.list[idx];
      if (!item || idx === this.data.selected) return;
      wx.switchTab({ url: item.pagePath });
    },
  },
});
