import type { ActiveEvent, InspectionTask } from '@/types/contract';

/** 异常处置六阶段（与任务 7 态对齐；已完成对应阶段 E 的 APPROVED）。 */
export const DISPOSAL_STEPS = ['发现', '研判', '待派发', '巡检中', '待复核', '已完成'] as const;

/** 任务在当前 5 态下推进到的阶段；APPROVED（阶段 E 上线后）映射到“已完成”。 */
const TASK_STAGE: Record<string, number> = {
  PENDING: 2, // 已派发待接收
  ACCEPTED: 3,
  IN_PROGRESS: 3,
  SUBMITTED: 4,
  APPROVED: 5,
};

/** 选中事件最新的一个未取消任务。 */
export function latestOpenTask(
  tasks: InspectionTask[],
  eventId: string,
): InspectionTask | undefined {
  return tasks
    .filter((t) => t.eventId === eventId && t.status !== 'CANCELLED')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

/**
 * 由真实事件状态 + 任务状态推导当前阶段索引（0–5）。
 * 无任务时按事件状态落到“发现/研判”；事件已恢复且任务未闭环时仍如实反映任务阶段。
 */
export function disposalStage(event: ActiveEvent, task: InspectionTask | undefined): number {
  if (task && TASK_STAGE[task.status] !== undefined) return TASK_STAGE[task.status];
  return event.status === 'OPEN' ? 0 : 1;
}
