import type { TaskPriority, TaskStatus } from './inspectionTypes';

export const TASK_STATUS_KEY: Record<TaskStatus, string> = {
  待派发: 'pending',
  进行中: 'active',
  待复核: 'review',
  已归档: 'closed',
};

export const PRIORITY_KEY: Record<TaskPriority, string> = {
  高: 'high',
  中: 'mid',
  低: 'low',
};

export const TASK_STAGES = ['派发', '执行', '提交', '复核'];

export const STAGE_BY_TASK_STATUS: Record<TaskStatus, number> = {
  待派发: 0,
  进行中: 1,
  待复核: 3,
  已归档: 4,
};
