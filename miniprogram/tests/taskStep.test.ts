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

test('有时间线证据时：完整链路全部 done（含真实接收记录）', () => {
  const happened = new Set([
    'task.created', 'task.accepted', 'task.started',
    'task.submitted', 'task.approved',
  ]);
  const steps = taskSteps('APPROVED', null, happened)!;
  assert.ok(steps.every((s) => s.state === 'done'));
});

test('证据缺失时不得虚构历史：PENDING→START 跳过接收，接收节点不打勾', () => {
  // 后端允许 PENDING 直接 START，时间线无 task.accepted
  const happened = new Set(['task.created', 'task.started']);
  const steps = taskSteps('IN_PROGRESS', null, happened)!;
  // 派发有证据 done；接收无证据 → 不得为 done；执行为当前
  assert.equal(steps[0].state, 'done');
  assert.equal(steps[1].state, 'todo');
  assert.equal(steps[2].state, 'current');
});

test('退回后重提中：已提交过一版但未通过，提交节点仍为 done、复核/完成未达成', () => {
  const happened = new Set([
    'task.created', 'task.accepted', 'task.started', 'task.submitted',
  ]);
  const steps = taskSteps('IN_PROGRESS', 'REJECTED', happened)!;
  assert.equal(steps[3].state, 'done'); // 提交动作真实发生
  assert.equal(steps[4].state, 'todo'); // 复核未通过
  assert.equal(steps[5].state, 'todo'); // 未完成
});

test('未拿到时间线（undefined）时退化为状态基线，不报错', () => {
  const steps = taskSteps('APPROVED', null, undefined)!;
  assert.equal(steps.length, 6);
  assert.ok(steps.every((s) => s.state === 'done'));
});
