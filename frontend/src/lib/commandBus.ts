/**
 * 命令总线骨架：语音/文本命令解析 + 白名单执行。
 * 阶段 B 只开放导航与聚焦两类命令；AI 面板与语音输入在阶段 H 接入同一执行点。
 */
export type Command =
  | { type: 'navigate'; to: string }
  | { type: 'focus'; target: FocusTarget }
  | { type: 'close-ai' };

export type FocusTarget = 'reach-a' | 'reach-b' | 'reach-c' | 'overview';

export const NAV_WHITELIST = [
  '/',
  '/analysis',
  '/disposal',
  '/inspection',
  '/review',
  '/admin',
  '/river-3d',
] as const;

export const FOCUS_WHITELIST: FocusTarget[] = ['reach-a', 'reach-b', 'reach-c', 'overview'];

const NAV_ALIASES: Record<string, string> = {
  智慧监测总览: '/',
  监测总览: '/',
  总览: '/',
  首页: '/',
  水环境分析: '/analysis',
  分析: '/analysis',
  异常研判与处置: '/disposal',
  异常研判: '/disposal',
  研判: '/disposal',
  处置: '/disposal',
  巡检协同中心: '/inspection',
  巡检协同: '/inspection',
  巡检: '/inspection',
  事件复盘与报告: '/review',
  事件复盘: '/review',
  复盘: '/review',
  报告: '/review',
  数据与系统管理: '/admin',
  数据管理: '/admin',
  系统管理: '/admin',
  管理: '/admin',
  '3d': '/river-3d',
  '3d河流': '/river-3d',
};

const FOCUS_ALIASES: Record<string, FocusTarget> = {
  上游: 'reach-a',
  中游: 'reach-b',
  下游: 'reach-c',
  全景: 'overview',
  全河段: 'overview',
  总览: 'overview',
};

const NAV_VERBS = ['打开', '进入', '切换到', '跳转到', '去', '看'];
const FOCUS_VERBS = ['聚焦', '飞到', '定位到', '定位', '看'];

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/[。！？，、\s]/g, '');
}

export function isAllowedNavigation(to: string): boolean {
  return (NAV_WHITELIST as readonly string[]).includes(to);
}

/** 解析中文命令文本；无法识别返回 null（不做模糊猜测）。 */
export function parseCommand(text: string): Command | null {
  const raw = normalize(text);
  if (!raw) return null;

  for (const verb of FOCUS_VERBS) {
    if (!raw.startsWith(verb)) continue;
    const rest = raw.slice(verb.length);
    const target = FOCUS_ALIASES[rest];
    if (target) return { type: 'focus', target };
  }

  if (raw === '关闭助手' || raw === '关闭ai' || raw === '收起助手') return { type: 'close-ai' };

  for (const verb of NAV_VERBS) {
    if (!raw.startsWith(verb)) continue;
    const rest = raw.slice(verb.length);
    const to = NAV_ALIASES[rest];
    if (to) return { type: 'navigate', to };
  }

  const direct = NAV_ALIASES[raw];
  if (direct) return { type: 'navigate', to: direct };

  return null;
}

export interface CommandHandlers {
  navigate: (to: string) => void;
  focus?: (target: FocusTarget) => void;
  closeAi?: () => void;
}

/** 唯一执行点：先过白名单再交给宿主，未知命令直接忽略。 */
export function executeCommand(command: Command, handlers: CommandHandlers): boolean {
  switch (command.type) {
    case 'navigate':
      if (!isAllowedNavigation(command.to)) return false;
      handlers.navigate(command.to);
      return true;
    case 'focus':
      if (!FOCUS_WHITELIST.includes(command.target)) return false;
      handlers.focus?.(command.target);
      return true;
    case 'close-ai':
      handlers.closeAi?.();
      return true;
    default:
      return false;
  }
}
