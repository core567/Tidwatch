// 任务流程步骤条映射测试
import { test } from 'node:test';
import assert = require('node:assert/strict');
import { taskSteps } from '../utils/taskStep';

test('各状态步骤位置正确', () => {
  const pending = taskSteps('PENDING')!;
  assert.equal(pending.filter((s) => s.state === 'current')[0].label, '接收');

  const inp = taskSteps('IN_PROGRESS')!;
  assert.equal(inp.filter((s) => s.state === 'current')[0].label, '执行');

  const sub = taskSteps('SUBMITTED')!;
  assert.equal(sub.filter((s) => s.state === 'current')[0].label, 'PC 复核中');

  const done = taskSteps('APPROVED')!;
  assert.ok(done.every((s) => s.state === 'done'));

  assert.equal(taskSteps('CANCELLED'), null);
});

test('退回时执行步标签变为“退回重提”但状态机不变', () => {
  const steps = taskSteps('IN_PROGRESS', 'REJECTED')!;
  const execStep = steps[2];
  assert.equal(execStep.label, '退回重提');
  assert.equal(execStep.state, 'current');
  // 已通过的步骤仍是 done
  assert.deepEqual(steps.slice(0, 2).map((s) => s.state), ['done', 'done']);
});
