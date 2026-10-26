/**
 * 命令总线骨架：语音/文本命令解析 + 白名单执行。
 * 阶段 B 只开放导航与聚焦两类命令；AI 面板与语音输入在阶段 H 接入同一执行点。
 */
export type Command =
  | { type: 'navigate'; to: string }
  | { type: 'focus'; target: FocusTarget }
  | { type: 'focus3d'; target: FocusTarget }
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

const EVENT_RE = /tw-?\d+/i;

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

/** 解析断面/全景目标（去掉 3d/图/节点 等后缀词）。 */
function resolveFocus(rest: string): FocusTarget | null {
  if (/全景|总览|全河段/.test(rest)) return 'overview';
  for (const [alias, target] of Object.entries(FOCUS_ALIASES)) {
    if (alias !== '全景' && alias !== '总览' && alias !== '全河段' && rest.includes(alias)) return target;
  }
  return null;
}

/** 解析中文命令文本；无法识别返回 null（不做模糊猜测）。 */
export function parseCommand(text: string): Command | null {
  const raw = normalize(text);
  if (!raw) return null;

  if (raw === '关闭助手' || raw === '关闭ai' || raw === '收起助手') return { type: 'close-ai' };

  // 事件直达：打开 TW-002 / 查看 TW-002 事件
  const ev = raw.match(EVENT_RE);
  if (ev) {
    const id = ev[0].toUpperCase().replace('TW', 'TW-').replace('TW--', 'TW-');
    // 形如 tw002 → TW-002
    const norm = id.replace(/^TW-?/, 'TW-').replace('TW--', 'TW-');
    return { type: 'navigate', to: `/events/${norm}/workbench` };
  }

  // 3D 节点/全景（含“3d/图/节点”关键词）→ 先进入 3D 页再聚焦
  if (/3d|三维|河流图|全景|节点/.test(raw)) {
    for (const verb of [...FOCUS_VERBS, ...NAV_VERBS]) {
      if (raw.startsWith(verb)) {
        const target = resolveFocus(raw.slice(verb.length));
        if (target) return { type: 'focus3d', target };
      }
    }
    // “上游a的3d图” 这种无动词
    const target = resolveFocus(raw);
    if (target && /上游|中游|下游|全景/.test(raw)) return { type: 'focus3d', target };
    if (/3d|三维|河流图/.test(raw)) return { type: 'focus3d', target: 'overview' };
  }

  // 普通聚焦（已在相关页面时）
  for (const verb of FOCUS_VERBS) {
    if (!raw.startsWith(verb)) continue;
    const target = resolveFocus(raw.slice(verb.length));
    if (target) return { type: 'focus', target };
  }

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
  /** 先进入 3D 页再聚焦（宿主负责等待场景就绪） */
  focus3d?: (target: FocusTarget) => void;
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
    case 'focus3d':
      if (!FOCUS_WHITELIST.includes(command.target)) return false;
      handlers.focus3d?.(command.target);
      return true;
    case 'close-ai':
      handlers.closeAi?.();
      return true;
    default:
      return false;
  }
}
