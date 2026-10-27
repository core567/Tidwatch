// 工作台最近动态派生测试（全部基于任务真实字段，不编造事件）
import { test } from 'node:test';
import assert = require('node:assert/strict');
import { buildActivities, type TaskActivity } from '../utils/taskActivity';
import type { InspectionTask } from '../services/api';

function task(over: Partial<InspectionTask> & Pick<InspectionTask, 'taskId' | 'status' | 'title' | 'createdAt'>): InspectionTask {
  return {
    eventId: null, focusId: null, reachId: 'reach-a', actionType: 'MANUAL_CHECK',
    priority: 'NORMAL', assignee: null, dueAt: null, reason: '', resultNote: null,
    resultConclusion: null, attachmentIds: [], completedAt: null, ...over,
  } as InspectionTask;
}

test('每种状态最多贡献一条动态且退回优先', () => {
  const tasks = [
    task({ taskId: 't1', status: 'PENDING', title: '待接收任务', createdAt: '2026-10-27T08:00:00' }),
    task({
      taskId: 't2', status: 'IN_PROGRESS', title: '退回任务', createdAt: '2026-10-27T07:00:00',
      latestReview: { decision: 'REJECTED', comment: '照片不清', reviewer: 'u-admin', reviewedAt: '2026-10-27T09:14:00' },
    }),
    task({ taskId: 't3', status: 'SUBMITTED', title: '待复核任务', createdAt: '2026-10-27T06:00:00', latestVersion: 2, observedAt: '2026-10-27T10:00:00' }),
    task({ taskId: 't4', status: 'APPROVED', title: '完成任务', createdAt: '2026-10-27T05:00:00', completedAt: '2026-10-27T11:00:00' }),
    task({ taskId: 't5', status: 'ACCEPTED', title: '无动态', createdAt: '2026-10-27T04:00:00' }),
  ];
  const acts = buildActivities(tasks);
  // ACCEPTED/IN_PROGRESS(无退回) 不产生动态
  assert.equal(acts.length, 4);
  // 按时间倒序
  assert.deepEqual(acts.map((a) => a.taskId), ['t4', 't3', 't2', 't1']);
  const kinds = Object.fromEntries(acts.map((a) => [a.taskId, a.kind])) as Record<string, TaskActivity['kind']>;
  assert.equal(kinds.t2, 'rejected');
  assert.match(acts.find((a) => a.taskId === 't2')!.desc, /照片不清/);
  assert.equal(kinds.t3, 'submitted');
  assert.equal(kinds.t4, 'approved');
  assert.equal(kinds.t1, 'created');
});

test('普通进行中任务不产生动态', () => {
  const acts = buildActivities([task({ taskId: 't', status: 'IN_PROGRESS', title: 'x', createdAt: '2026-10-27T08:00:00' })]);
  assert.equal(acts.length, 0);
});
