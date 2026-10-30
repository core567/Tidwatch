// 任务 7 态 → 六步流程条（派发/接收/执行/提交/复核/完成）
// 纯展示映射，不改变任何状态；CANCELLED 不展示流程条。
//
// 节点真实性：
// - 先按当前状态推导节点位置（基线）；
// - 若提供 happened（来自 /timeline 的 business_events.action_type 集合），
//   凡没有真实动作记录支撑的“已完成”节点一律降级为未开始——
//   后端允许 PENDING → START 跳过接收，此时不得把“接收”画成 ✓。
// - 时间线加载失败时不传 happened，退化为状态基线（接口恢复后自动回到证据模式）。
export interface TaskStep {
  key: string;
  label: string;
  state: 'done' | 'current' | 'todo';
}

const BASE_STEPS = ['派发', '接收', '执行', '提交', '复核', '完成'];

// 每个节点“确已发生”所需的时间线动作（任一命中即可）
const STEP_PROOF: (string[] | null)[] = [
  ['task.created', 'task.dispatched'], // 派发（task.drafted 仅为草稿，不算派发）
  ['task.accepted'],                   // 接收（PENDING→START 跳过时缺失）
  ['task.started'],                    // 执行
  ['task.submitted'],                  // 提交（退回后曾提交也成立）
  ['task.approved'],                   // 复核（退回不算完成）
  ['task.approved'],                   // 完成
];

export function taskSteps(
  status: string,
  latestDecision?: string | null,
  happened?: ReadonlySet<string>,
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

  let steps: TaskStep[] = BASE_STEPS.map((label, i) => {
    let state: TaskStep['state'] = i < cur ? 'done' : i === cur ? 'current' : 'todo';
    // 无时间线证据时的基线：APPROVED 视为全部完成（有证据时下面会被纠正）
    if (status === 'APPROVED') state = 'done';
    return { key: `step-${i}`, label, state };
  });

  // 证据模式：节点状态完全由真实时间线动作决定，不由最终状态反推：
  // - 有真实动作记录 → done（如退回后“提交”确实发生过）；
  // - 当前所在节点 → 始终 current（即便其动作已发生，如已开始、执行中）；
  // - 无记录的未来节点 → todo，绝不虚构；
  // - APPROVED 的“完成”节点也必须有 task.approved 才打勾。
  if (happened) {
    steps = steps.map((s, i) => {
      if (i === cur && status !== 'APPROVED') return s; // 当前节点保持高亮
      const proof = STEP_PROOF[i];
      const evidenced = proof?.some((a) => happened.has(a));
      return { ...s, state: evidenced ? ('done' as const) : ('todo' as const) };
    });
  }

  return steps.map((s, i) => {
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
