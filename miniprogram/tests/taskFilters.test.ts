// 任务列表派生逻辑测试（零依赖：tsc 编译后用 node --test 运行）
// 覆盖验收要求：状态分类、退回/取消分类、快速切筛选、筛选后刷新、实时推送合并。
import { test } from 'node:test';
import assert = require('node:assert/strict');
import {
  classifyStatus,
  filterTasks,
  matchFilter,
  mergeTasks,
  summarize,
  toTaskView,
  type TaskFilterKey,
} from '../utils/taskFilters';
import type { InspectionTask } from '../services/api';

function makeTask(over: Partial<InspectionTask> & { taskId: string; status: string }): InspectionTask {
  return {
    eventId: null,
    focusId: null,
    reachId: 'reach-a',
    actionType: 'MANUAL_CHECK',
    title: `任务 ${over.taskId}`,
    priority: 'NORMAL',
    assignee: 'inspector',
    dueAt: null,
    reason: '',
    resultNote: null,
    resultConclusion: null,
    attachmentIds: [],
    completedAt: null,
    createdAt: '2026-10-27T10:00:00',
    ...over,
  } as InspectionTask;
}

const STATUSES = [
  'DRAFT',
  'PENDING',
  'ACCEPTED',
  'IN_PROGRESS',
  'SUBMITTED',
  'APPROVED',
  'CANCELLED',
] as const;

function oneOfEach(): InspectionTask[] {
  return STATUSES.map((s, i) =>
    makeTask({ taskId: `t-${s}`, status: s, createdAt: `2026-10-27T10:00:0${i}` }),
  );
}

test('PENDING 只出现在待处理与全部分类', () => {
  const t = makeTask({ taskId: 't1', status: 'PENDING' });
  assert.equal(classifyStatus(t.status), 'todo');
  for (const key of ['todo', 'doing', 'review', 'done', 'all'] as TaskFilterKey[]) {
    assert.equal(matchFilter(t, key), key === 'todo' || key === 'all');
  }
  assert.deepEqual(filterTasks(oneOfEach(), 'todo').map((x) => x.taskId), ['t-PENDING']);
});

test('ACCEPTED / IN_PROGRESS 出现在进行中与全部分类', () => {
  for (const status of ['ACCEPTED', 'IN_PROGRESS'] as const) {
    const t = makeTask({ taskId: `t-${status}`, status });
    assert.equal(classifyStatus(status), 'doing');
    for (const key of ['todo', 'doing', 'review', 'done', 'all'] as TaskFilterKey[]) {
      assert.equal(matchFilter(t, key), key === 'doing' || key === 'all');
    }
  }
  const ids = filterTasks(oneOfEach(), 'doing').map((x) => x.taskId).sort();
  assert.deepEqual(ids, ['t-ACCEPTED', 't-IN_PROGRESS']);
});

test('SUBMITTED 出现在待复核与全部分类', () => {
  const t = makeTask({ taskId: 't1', status: 'SUBMITTED' });
  assert.equal(classifyStatus('SUBMITTED'), 'review');
  for (const key of ['todo', 'doing', 'review', 'done', 'all'] as TaskFilterKey[]) {
    assert.equal(matchFilter(t, key), key === 'review' || key === 'all');
  }
  assert.equal(filterTasks(oneOfEach(), 'review')[0].taskId, 't-SUBMITTED');
});

test('APPROVED 出现在已完成与全部分类', () => {
  const t = makeTask({ taskId: 't1', status: 'APPROVED' });
  assert.equal(classifyStatus('APPROVED'), 'done');
  for (const key of ['todo', 'doing', 'review', 'done', 'all'] as TaskFilterKey[]) {
    assert.equal(matchFilter(t, key), key === 'done' || key === 'all');
  }
  assert.equal(filterTasks(oneOfEach(), 'done')[0].taskId, 't-APPROVED');
});

test('退回不是独立任务状态：IN_PROGRESS + REJECTED 仍分类为进行中，仅展示派生“需重提”', () => {
  const rejected = makeTask({
    taskId: 't-rej',
    status: 'IN_PROGRESS',
    latestReview: { decision: 'REJECTED', comment: '照片不清', reviewer: 'u-admin', reviewedAt: '2026-10-27T09:00:00' },
  });
  assert.equal(classifyStatus(rejected.status), 'doing');
  assert.equal(matchFilter(rejected, 'doing'), true);
  assert.equal(matchFilter(rejected, 'review'), false);
  const view = toTaskView(rejected);
  assert.equal(view.statusText, '需重提');
  assert.equal(view.statusTone, 'danger');
  // 普通进行中仍是“进行中”
  assert.equal(toTaskView(makeTask({ taskId: 't2', status: 'IN_PROGRESS' })).statusText, '进行中');
});

test('CANCELLED / DRAFT 不进任何待办分类，仅全部可见', () => {
  for (const status of ['CANCELLED', 'DRAFT'] as const) {
    const t = makeTask({ taskId: `t-${status}`, status });
    assert.equal(classifyStatus(status), 'none');
    for (const key of ['todo', 'doing', 'review', 'done'] as TaskFilterKey[]) {
      assert.equal(matchFilter(t, key), false, `${status} 不应出现在 ${key}`);
    }
    assert.equal(matchFilter(t, 'all'), true);
  }
});

test('汇总与可见列表来自同一份集合，四桶计数正确且不含取消/草稿', () => {
  const s = summarize(oneOfEach());
  assert.deepEqual(s, { todo: 1, doing: 2, review: 1, done: 1 });
});

test('快速连续切换筛选：每次结果只取决于原始集合与当前筛选', () => {
  const all = oneOfEach();
  const seq: TaskFilterKey[] = ['review', 'todo', 'done', 'doing', 'all', 'review', 'todo'];
  const expect: Record<TaskFilterKey, string[]> = {
    todo: ['t-PENDING'],
    doing: ['t-ACCEPTED', 't-IN_PROGRESS'],
    review: ['t-SUBMITTED'],
    done: ['t-APPROVED'],
    all: STATUSES.map((s) => `t-${s}`),
  };
  for (const key of seq) {
    const got = filterTasks(all, key)
      .map((x) => x.taskId)
      .sort();
    assert.deepEqual(got, [...expect[key]].sort(), `分类 ${key} 内容错误`);
  }
});

test('筛选后下拉刷新：服务器新数据合并后仍按当前筛选派生，其他分类任务不串入', () => {
  // 当前停留在“待复核”，本地有 1 个 SUBMITTED
  const prev = [makeTask({ taskId: 't-sub', status: 'SUBMITTED', createdAt: '2026-10-27T08:00:00' })];
  // 刷新返回：新增一个 PENDING，原 SUBMITTED 不变
  const incoming = [
    prev[0],
    makeTask({ taskId: 't-new', status: 'PENDING', createdAt: '2026-10-27T11:00:00' }),
  ];
  const merged = mergeTasks(prev, incoming);
  const summary = summarize(merged);
  assert.deepEqual(summary, { todo: 1, doing: 0, review: 1, done: 0 });
  // 当前筛选仍是 review：只能看到 SUBMITTED，PENDING 不得串入
  const visible = filterTasks(merged, 'review');
  assert.deepEqual(visible.map((x) => x.taskId), ['t-sub']);
});

test('当前分类收到 WebSocket 新任务：合并去重后该任务出现，重复推送不产生重复行', () => {
  const pending = makeTask({ taskId: 't-p1', status: 'PENDING', createdAt: '2026-10-27T08:00:00' });
  // WS 重放两次同任务（messageId 去重在 ws 层，这里防 merge 再保一道）
  let all = mergeTasks([], [pending]);
  all = mergeTasks(all, [pending]);
  assert.equal(all.length, 1);
  // 模拟 task.created 后整表重拉，响应里多了第二个待接收任务
  const p2 = makeTask({ taskId: 't-p2', status: 'PENDING', createdAt: '2026-10-27T12:00:00' });
  all = mergeTasks(all, [pending, p2]);
  const visible = filterTasks(all, 'todo');
  assert.deepEqual(visible.map((x) => x.taskId), ['t-p2', 't-p1']); // 创建时间倒序
  assert.deepEqual(summarize(all), { todo: 2, doing: 0, review: 0, done: 0 });
});

test('实时推送任务状态迁移：PENDING→IN_PROGRESS 后自动从待接收消失、进入进行中', () => {
  const before = [makeTask({ taskId: 't1', status: 'PENDING', createdAt: '2026-10-27T08:00:00' })];
  const after = mergeTasks(before, [
    makeTask({ taskId: 't1', status: 'IN_PROGRESS', createdAt: '2026-10-27T08:00:00' }),
  ]);
  assert.equal(after.length, 1);
  assert.equal(filterTasks(after, 'todo').length, 0);
  assert.equal(filterTasks(after, 'doing').length, 1);
});

test('mergeTasks 以 taskId 去重且按创建时间倒序', () => {
  const a = makeTask({ taskId: 'a', status: 'PENDING', createdAt: '2026-10-27T08:00:00' });
  const b = makeTask({ taskId: 'b', status: 'PENDING', createdAt: '2026-10-27T10:00:00' });
  const merged = mergeTasks([a], [b, a]);
  assert.deepEqual(merged.map((x) => x.taskId), ['b', 'a']);
});
