// 任务状态/动作/结论的统一中文文案与颜色（只读展示，不新增后端状态）
// 任务状态：DRAFT/PENDING/ACCEPTED/IN_PROGRESS/SUBMITTED/APPROVED/CANCELLED
// 注意：不存在 REJECTED 任务状态——PC 退回后任务回到 IN_PROGRESS，
// 审核结论在 task.latestReview.decision（APPROVED/REJECTED）。

export interface StatusView {
  text: string;
  tone: 'ok' | 'watch' | 'danger' | 'offline';
}

const TASK_STATUS: Record<string, StatusView> = {
  DRAFT: { text: '草稿', tone: 'offline' },
  PENDING: { text: '待接收', tone: 'danger' },
  ACCEPTED: { text: '已接收', tone: 'watch' },
  IN_PROGRESS: { text: '进行中', tone: 'watch' },
  SUBMITTED: { text: '待复核', tone: 'watch' },
  APPROVED: { text: '已完成', tone: 'ok' },
  CANCELLED: { text: '已取消', tone: 'offline' },
};

export function taskStatusView(status: string, latestDecision?: string | null): StatusView {
  // 进行中但最近一次被退回：用警示色提示需要重提
  if (status === 'IN_PROGRESS' && latestDecision === 'REJECTED') {
    return { text: '需重提', tone: 'danger' };
  }
  return TASK_STATUS[status] ?? { text: status, tone: 'offline' };
}

export const ACTION_NAMES: Record<string, string> = {
  CONTINUE_OBSERVE: '持续观察',
  FOCUS_REACH_B: '重点观察 B',
  FOCUS_REACH_C: '重点观察 C',
  KEEP_LOCAL_SCOPE: '保持局部关注',
  INSPECT_DATA_LINK: '检查数据链路',
  MANUAL_CHECK: '现场人工核查',
  RE_EVALUATE_AFTER_RECOVERY: '恢复后再评估',
};

export const CONCLUSION_NAMES: Record<string, string> = {
  NORMAL: '未见明显异常',
  ABNORMAL: '发现异常，建议再评估',
  UNCERTAIN: '无法确认',
};
