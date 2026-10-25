import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DISPOSAL_STEPS, disposalStage, latestOpenTask } from './disposalStage.ts';
import type { ActiveEvent, InspectionTask } from '@/types/contract';

const ev = (status: ActiveEvent['status']): ActiveEvent =>
  ({ eventId: 'TW-x', status } as ActiveEvent);
const task = (status: string, at = '2026-10-25T10:00:00', eventId = 'TW-x'): InspectionTask =>
  ({ taskId: `t-${status}-${at}`, eventId, status, createdAt: at } as InspectionTask);

test('阶段数固定为 6 且顺序正确', () => {
  assert.deepEqual([...DISPOSAL_STEPS], ['发现', '研判', '待派发', '巡检中', '待复核', '已完成']);
});

test('无任务时按事件状态落到发现/研判', () => {
  assert.equal(disposalStage(ev('OPEN'), undefined), 0);
  assert.equal(disposalStage(ev('INVESTIGATING'), undefined), 1);
  assert.equal(disposalStage(ev('ESCALATED'), undefined), 1);
});

test('任务状态决定推进阶段', () => {
  assert.equal(disposalStage(ev('INVESTIGATING'), task('PENDING')), 2);
  assert.equal(disposalStage(ev('INVESTIGATING'), task('ACCEPTED')), 3);
  assert.equal(disposalStage(ev('INVESTIGATING'), task('IN_PROGRESS')), 3);
  assert.equal(disposalStage(ev('INVESTIGATING'), task('SUBMITTED')), 4);
  assert.equal(disposalStage(ev('RECOVERED'), task('APPROVED')), 5);
});

test('已取消任务不参与，回退到事件阶段', () => {
  assert.equal(disposalStage(ev('OPEN'), task('CANCELLED')), 0);
});

test('latestOpenTask 取最新未取消任务且只看本事件', () => {
  const list = [
    task('PENDING', '2026-10-25T09:00:00'),
    task('SUBMITTED', '2026-10-25T11:00:00'),
    task('CANCELLED', '2026-10-25T12:00:00'),
    task('IN_PROGRESS', '2026-10-25T10:00:00', 'TW-other'),
  ];
  const got = latestOpenTask(list, 'TW-x');
  assert.equal(got?.status, 'SUBMITTED');
});
