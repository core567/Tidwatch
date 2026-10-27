// 任务 7 态 → 六步流程条（派发/接收/执行/提交/复核/完成）
// 纯展示映射，不改变任何状态；CANCELLED 不展示流程条。
export interface TaskStep {
  key: string;
  label: string;
  state: 'done' | 'current' | 'todo';
}

const BASE_STEPS = ['派发', '接收', '执行', '提交', '复核', '完成'];

export function taskSteps(
  status: string,
  latestDecision?: string | null,
): TaskStep[] | null {
  if (status === 'CANCELLED') return null;

  // 当前所在步骤下标
  let cur = 0;
  switch (status) {
    case 'DRAFT': cur = 0; break;
    case 'PENDING': cur = 1; break;
    case 'ACCEPTED': cur = 2; break;
    case 'IN_PROGRESS': cur = 2; break;
    case 'SUBMITTED': cur = 4; break; // 提交已完成，等待 PC 复核
    case 'APPROVED': cur = 5; break;
  }

  return BASE_STEPS.map((label, i) => {
    let state: TaskStep['state'] = i < cur ? 'done' : i === cur ? 'current' : 'todo';
    // APPROVED：全部完成（含“完成”步）
    if (status === 'APPROVED') state = 'done';
    return { key: `step-${i}`, label, state };
  }).map((s, i) => {
    // 执行步骤被退回：标签与色调提示（状态仍是 IN_PROGRESS，不发明新状态）
    if (
      i === 2 &&
      status === 'IN_PROGRESS' &&
      latestDecision === 'REJECTED'
    ) {
      return { ...s, label: '退回重提' };
    }
    // 复核步骤等待中
    if (i === 4 && status === 'SUBMITTED') return { ...s, label: 'PC 复核中' };
    return s;
  });
}
