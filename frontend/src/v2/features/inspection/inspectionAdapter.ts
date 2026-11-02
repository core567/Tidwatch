/**
 * InspectionAdapter：真实巡检任务（七态状态机）→ v2 看板/列表/详情视觉形状。
 * - 七态 → 四列分组仅用于视觉：DRAFT/PENDING→待派发，ACCEPTED/IN_PROGRESS→进行中，
 *   SUBMITTED→待复核，APPROVED/CANCELLED→已归档（已完成/已取消标签区分，原始状态同时显示）
 * - 不复制任何业务判断；动作可用性以真实状态为准（非法迁移由后端 409 拦截）
 */
import type { InspectionTask as ApiTask } from '@/types/contract';
import { stationIdOf } from '../overview/overviewAdapter';
import type { StationId } from '../../types';

export type BoardColumn = '待派发' | '进行中' | '待复核' | '已归档';

export const TASK_STATUS_CN: Record<string, string> = {
  DRAFT: '草稿', PENDING: '待派发', ACCEPTED: '已接单', IN_PROGRESS: '执行中',
  SUBMITTED: '待复核', APPROVED: '已完成', CANCELLED: '已取消',
};

export function boardColumnOf(status: string): BoardColumn {
  switch (status) {
    case 'DRAFT':
    case 'PENDING':
      return '待派发';
    case 'ACCEPTED':
    case 'IN_PROGRESS':
      return '进行中';
    case 'SUBMITTED':
      return '待复核';
    case 'APPROVED':
    case 'CANCELLED':
    default:
      return '已归档';
  }
}

export interface BoardTask {
  id: string;
  title: string;
  stationId: StationId;
  assignee: string;
  status: BoardColumn;
  originalStatus: string;
  originalStatusCn: string;
  priority: '高' | '中' | '低';
  time: string;
  eventId?: string | null;
  latestVersion?: number | null;
  isCancelled: boolean;
  reachId: string;
}

export function toBoardTask(t: ApiTask): BoardTask {
  return {
    id: t.taskId,
    title: t.title,
    stationId: stationIdOf(t.reachId),
    assignee: t.assignee ?? '未指派',
    status: boardColumnOf(t.status),
    originalStatus: t.status,
    originalStatusCn: TASK_STATUS_CN[t.status] ?? t.status,
    priority: '中',
    time: t.createdAt.slice(5, 16).replace('T', ' '),
    eventId: t.eventId,
    latestVersion: t.latestVersion ?? null,
    isCancelled: t.status === 'CANCELLED',
    reachId: t.reachId,
  };
}

/** 状态机允许的前端动作（与后端 task_service 校验一致；非法迁移仍由后端 409 兜底） */
export function taskActions(status: string): string[] {
  switch (status) {
    case 'DRAFT':
      return ['DISPATCH', 'CANCEL'];
    case 'PENDING':
      return ['ACCEPT', 'START', 'CANCEL'];
    case 'ACCEPTED':
      return ['START', 'CANCEL'];
    case 'IN_PROGRESS':
      return ['CANCEL'];
    case 'SUBMITTED':
      return ['APPROVE', 'REJECT', 'CANCEL'];
    case 'APPROVED':
    case 'CANCELLED':
    default:
      return [];
  }
}

export const TASK_ACTION_CN: Record<string, string> = {
  DISPATCH: '正式派发', ACCEPT: '接收任务', START: '开始执行',
  CANCEL: '取消任务', APPROVE: '复核通过', REJECT: '复核退回',
};
