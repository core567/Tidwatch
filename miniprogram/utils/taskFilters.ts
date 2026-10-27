// 任务列表唯一的数据派生入口（纯函数，可单测，不依赖 wx 运行时）：
//
//   服务端任务数组 ──toTaskView 规范化──► 原始视图集合 allViews
//                                          │
//                    summarize(allViews) ──┤── filterTasks(allViews, key) ──► 可见列表 views
//
// 页面在任何时刻只允许通过 commitViews() 一次 setData 同时提交
// { allViews, views, summary, listEmpty }，禁止分别写入造成中间态渲染。
//
// 状态机事实（后端 app/schemas/task.py）：任务只有
// DRAFT / PENDING / ACCEPTED / IN_PROGRESS / SUBMITTED / APPROVED / CANCELLED 七态。
// 不存在 REJECTED 任务状态：PC 退回后任务回到 IN_PROGRESS，
// 审核结论在 latestReview.decision，展示层派生「需重提」文案，但分类仍属“进行中”。

import type { InspectionTask } from '../services/api';
import { formatDateTime } from './util';
import { taskStatusView } from './taskLabels';

export type TaskFilterKey = 'todo' | 'doing' | 'review' | 'done' | 'all';

/** 一个任务状态所属的工作台分类；DRAFT/CANCELLED 不进任何待办分类，仅“全部”可见 */
export type TaskBucket = 'todo' | 'doing' | 'review' | 'done' | 'none';

export interface TaskView extends InspectionTask {
  dueAtText: string;
  statusText: string;
  statusTone: string;
  isUrgent: boolean;
}

export interface TaskSummary {
  todo: number;
  doing: number;
  review: number;
  done: number;
}

export function classifyStatus(status: string): TaskBucket {
  switch (status) {
    case 'PENDING':
      return 'todo';
    case 'ACCEPTED':
    case 'IN_PROGRESS':
      // 被退回（latestReview.decision=REJECTED）的任务仍是 IN_PROGRESS，
      // 只改变展示文案/颜色，不改变分类。
      return 'doing';
    case 'SUBMITTED':
      return 'review';
    case 'APPROVED':
      return 'done';
    default:
      // DRAFT / CANCELLED / 未知状态
      return 'none';
  }
}

/** 单个任务是否命中筛选分类（“全部”对已取消也可见，草稿正常不应下发给小程序） */
export function matchFilter(task: InspectionTask, key: TaskFilterKey): boolean {
  if (key === 'all') return true;
  return classifyStatus(task.status) === key;
}

export function filterTasks(tasks: InspectionTask[], key: TaskFilterKey): InspectionTask[] {
  return tasks.filter((t) => matchFilter(t, key));
}

export function summarize(tasks: InspectionTask[]): TaskSummary {
  const summary: TaskSummary = { todo: 0, doing: 0, review: 0, done: 0 };
  for (const t of tasks) {
    const bucket = classifyStatus(t.status);
    if (bucket === 'none') continue;
    summary[bucket] += 1;
  }
  return summary;
}

/** 规范化单条任务：状态文案/颜色、截止时间、紧迫标记 */
export function toTaskView(task: InspectionTask): TaskView {
  const sv = taskStatusView(task.status, task.latestReview?.decision);
  return {
    ...task,
    dueAtText: formatDateTime(task.dueAt),
    statusText: sv.text,
    statusTone: sv.tone,
    isUrgent: task.status === 'PENDING' && task.priority === 'HIGH',
  };
}

/** 以 taskId 去重合并（后写覆盖），再按创建时间倒序，保证实时推送后顺序稳定 */
export function mergeTasks(prev: InspectionTask[], incoming: InspectionTask[]): InspectionTask[] {
  const byId = new Map<string, InspectionTask>();
  for (const t of prev) byId.set(t.taskId, t);
  for (const t of incoming) byId.set(t.taskId, t);
  return [...byId.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
