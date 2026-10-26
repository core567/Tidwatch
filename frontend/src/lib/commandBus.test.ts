import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCommand, isAllowedNavigation } from './commandBus.ts';

test('页面导航白名单', () => {
  assert.deepEqual(parseCommand('打开水环境分析'), { type: 'navigate', to: '/analysis' });
  assert.deepEqual(parseCommand('进入巡检协同中心'), { type: 'navigate', to: '/inspection' });
  assert.deepEqual(parseCommand('打开数据与系统管理'), { type: 'navigate', to: '/admin' });
  assert.deepEqual(parseCommand('打开智慧监测总览'), { type: 'navigate', to: '/' });
});

test('事件直达工作台', () => {
  assert.deepEqual(parseCommand('打开 TW-002 事件'), { type: 'navigate', to: '/events/TW-002/workbench' });
  assert.deepEqual(parseCommand('tw002'), { type: 'navigate', to: '/events/TW-002/workbench' });
});

test('3D 节点聚焦（先导航再聚焦）', () => {
  assert.deepEqual(parseCommand('打开上游 A 的 3D 图'), { type: 'focus3d', target: 'reach-a' });
  assert.deepEqual(parseCommand('聚焦上游A的3D节点'), { type: 'focus3d', target: 'reach-a' });
  assert.deepEqual(parseCommand('切换到中游B 3D'), { type: 'focus3d', target: 'reach-b' });
  assert.deepEqual(parseCommand('下游c 3d图'), { type: 'focus3d', target: 'reach-c' });
});

test('返回 3D 全景', () => {
  assert.deepEqual(parseCommand('返回河流全景'), { type: 'focus3d', target: 'overview' });
  assert.deepEqual(parseCommand('打开3D全景'), { type: 'focus3d', target: 'overview' });
});

test('普通聚焦（非 3D 语境）', () => {
  // 无 3D/节点/图关键词时，"聚焦上游A" 是普通 focus
  assert.deepEqual(parseCommand('聚焦上游A'), { type: 'focus', target: 'reach-a' });
});

test('关闭助手', () => {
  assert.deepEqual(parseCommand('关闭助手'), { type: 'close-ai' });
});

test('无法识别返回 null，白名单外拒绝', () => {
  assert.equal(parseCommand('随便聊聊天气'), null);
  assert.equal(isAllowedNavigation('/secret'), false);
  assert.equal(isAllowedNavigation('/analysis'), true);
});
