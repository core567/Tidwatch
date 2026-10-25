import type { EventAction } from '@/types/contract';

/** 事件人工动作文案；可执行集合由后端 EventDetail.allowedActions 决定。 */
export const EVENT_ACTION_LABEL: Record<EventAction, string> = {
  START_INVESTIGATION: '开始研判',
  ESCALATE: '升级事件',
  KEEP_MONITORING: '持续观察',
  NARROW_SCOPE: '收窄范围',
  MARK_RECOVERY_PENDING: '标记待恢复',
  CONFIRM_RECOVERED: '确认恢复',
  MARK_UNRESOLVED: '标记无法判定',
  REOPEN: '重新打开',
};
