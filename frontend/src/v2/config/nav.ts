import type { IconName } from '../components/ui/Icon';

export interface NavItem {
  path: string;
  index: string;
  label: string;
  en: string;
  icon: IconName;
  phase: 1 | 2 | 3 | 4;
  summary: string;
  modules: string[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/',
    index: '01',
    label: '智慧监测总览',
    en: 'OVERVIEW',
    icon: 'overview',
    phase: 1,
    summary: '河流整体态势、断面状态与业务概览',
    modules: ['河流态势主轴', '预警摘要', '实时指标带', '趋势与处置流水线'],
  },
  {
    path: '/analysis',
    index: '02',
    label: '水环境分析',
    en: 'ANALYSIS',
    icon: 'analysis',
    phase: 2,
    summary: '断面指标对比、历史趋势与异常区间',
    modules: [
      '断面切换与指标分组',
      '水位 / 浊度 / pH / 溶解氧 / 氨氮趋势',
      '上中下游同期对比',
      '异常区间与阈值标注',
    ],
  },
  {
    path: '/events',
    index: '03',
    label: '异常研判与处置',
    en: 'ASSESSMENT',
    icon: 'assessment',
    phase: 2,
    summary: '事件证据、研判假设、时间线与处置建议',
    modules: [
      '异常事件队列与风险分级',
      '证据链与研判假设面板',
      '事件时间线与状态流转',
      '处置建议与关联巡检任务',
    ],
  },
  {
    path: '/tasks',
    index: '04',
    label: '巡检协同中心',
    en: 'INSPECTION',
    icon: 'inspection',
    phase: 3,
    summary: '任务派发、现场执行、反馈与复核闭环',
    modules: [
      '任务看板与派发流程',
      '现场测量数据与照片回传',
      '提交、审核与退回',
      '历史任务与人员视图',
    ],
  },
  {
    path: '/review',
    index: '05',
    label: '事件复盘与报告',
    en: 'REVIEW',
    icon: 'review',
    phase: 3,
    summary: '历史事件回溯、处置效果与报告导出',
    modules: [
      '历史事件检索与统计',
      '异常前后数据对比',
      '处置过程与恢复情况',
      '复盘报告查看与导出',
    ],
  },
  {
    path: '/admin',
    index: '06',
    label: '数据与系统管理',
    en: 'SYSTEM',
    icon: 'system',
    phase: 4,
    summary: '数据源状态、连接健康度与运行日志',
    modules: [
      '官方数据源与模拟数据状态',
      '后端与实时连接健康度',
      '演示场景管理',
      '系统运行日志',
    ],
  },
  {
    path: '/monitor',
    index: '07',
    label: '数字孪生',
    en: 'TWIN',
    icon: 'twin',
    phase: 4,
    summary: '3D 河流场景容器与断面信息面板',
    modules: [
      '3D 场景显示区域容器',
      '断面切换与监测点面板',
      '关键指标与风险提示浮层',
      '场景工具栏与全景复位',
    ],
  },
  {
    path: '/assistant',
    index: '08',
    label: 'AI 智能助手',
    en: 'ASSISTANT',
    icon: 'assistant',
    phase: 4,
    summary: '真实数据问答、会话历史、语音与业务导航',
    modules: [
      '真实问答与会话历史',
      '快捷问题与能力入口',
      '语音输入与确定性指令',
      '页面导航与 3D 节点控制',
    ],
  },
];

export function findNavItem(pathname: string): NavItem {
  if (pathname === '/') return NAV_ITEMS[0];
  return NAV_ITEMS.find((item) => item.path !== '/' && pathname.startsWith(item.path)) ?? NAV_ITEMS[0];
}
