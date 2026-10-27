// 工作台“最近动态”：仅从任务列表的真实字段派生，不编造业务事件。
import type { InspectionTask } from '../services/api';

export type ActivityKind = 'rejected' | 'submitted' | 'approved' | 'created';

export interface TaskActivity {
  kind: ActivityKind;
  taskId: string;
  title: string;
  eventId: string | null;
  /** ISO 时间：取该事件最可能的发生时间 */
  at: string;
  desc: string;
}

/**
 * 从任务集合提取每条任务上“最新的一件事”：
 * - 退回 > 提交 > 完成 > 新派发（按信息重要性取一条，避免重复刷屏）。
 */
export function buildActivities(tasks: InspectionTask[], now: number = Date.now()): TaskActivity[] {
  const out: TaskActivity[] = [];
  for (const t of tasks) {
    const review = t.latestReview;
    if (t.status === 'IN_PROGRESS' && review?.decision === 'REJECTED') {
      out.push({
        kind: 'rejected',
        taskId: t.taskId,
        title: t.title,
        eventId: t.eventId,
        at: review.reviewedAt,
        desc: review.comment ? `退回：${review.comment}` : 'PC 端退回，需补充后重新提交',
      });
      continue;
    }
    if (t.status === 'APPROVED') {
      out.push({
        kind: 'approved',
        taskId: t.taskId,
        title: t.title,
        eventId: t.eventId,
        at: t.completedAt ?? t.createdAt,
        desc: '复核通过，任务完成',
      });
      continue;
    }
    if (t.status === 'SUBMITTED') {
      out.push({
        kind: 'submitted',
        taskId: t.taskId,
        title: t.title,
        eventId: t.eventId,
        at: t.observedAt ?? t.createdAt,
        desc: `已提交 v${t.latestVersion ?? 1}，等待 PC 复核`,
      });
      continue;
    }
    if (t.status === 'PENDING') {
      out.push({
        kind: 'created',
        taskId: t.taskId,
        title: t.title,
        eventId: t.eventId,
        at: t.createdAt,
        desc: '新任务派发，待接收',
      });
    }
  }
  void now;
  return out.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 8);
}
