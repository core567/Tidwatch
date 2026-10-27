// utils/tabbar.ts - tab 页选中态同步（custom-tab-bar 固定组件实例）
export const TAB_INDEX = {
  tasks: 0,
  events: 1,
  reaches: 2,
  profile: 3,
} as const;

export function syncTabSelected(
  page: { getTabBar?: () => { setData: (d: Record<string, unknown>) => void } | null },
  index: number,
): void {
  if (typeof page.getTabBar !== 'function') return;
  const bar = page.getTabBar();
  if (bar) bar.setData({ selected: index });
}
