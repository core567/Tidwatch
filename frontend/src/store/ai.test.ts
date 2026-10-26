import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useAiStore, formatMsgTime } from './ai.ts';

function reset() {
  useAiStore.setState({ conversations: [], activeId: '' });
}

test('新会话与追加消息、首条用户消息生成标题', () => {
  reset();
  const id = useAiStore.getState().newConversation();
  useAiStore.getState().append({ role: 'user', text: '查询上游 A 当前水位是多少' });
  useAiStore.getState().append({ role: 'assistant', text: '4.78 m', mode: 'rule', tools: ['reach_latest'] });
  const c = useAiStore.getState().conversations.find((x) => x.id === id)!;
  assert.equal(c.messages.length, 2);
  assert.ok(c.title.startsWith('查询上游 A'));
  assert.equal(c.messages[0].at > 0, true);
  assert.equal(c.messages[1].mode, 'rule');
});

test('会话切换相互隔离', () => {
  reset();
  const a = useAiStore.getState().newConversation();
  useAiStore.getState().append({ role: 'user', text: 'A 会话' });
  const b = useAiStore.getState().newConversation();
  useAiStore.getState().append({ role: 'user', text: 'B 会话' });
  useAiStore.getState().select(a);
  useAiStore.getState().append({ role: 'user', text: 'A 再问' });
  const ca = useAiStore.getState().conversations.find((x) => x.id === a)!;
  const cb = useAiStore.getState().conversations.find((x) => x.id === b)!;
  assert.equal(ca.messages.length, 2);
  assert.equal(cb.messages.length, 1);
});

test('删除与清空', () => {
  reset();
  const a = useAiStore.getState().newConversation();
  const b = useAiStore.getState().newConversation();
  useAiStore.getState().remove(a);
  assert.equal(useAiStore.getState().conversations.length, 1);
  assert.equal(useAiStore.getState().activeId, b);
  useAiStore.getState().clearAll();
  assert.equal(useAiStore.getState().conversations.length, 0);
});

test('formatMsgTime 当天显示时分', () => {
  const now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 5).getTime();
  assert.match(formatMsgTime(ts), /^09:05$/);
  const old = new Date(2020, 0, 2, 8, 0).getTime();
  assert.match(formatMsgTime(old), /^1\/2 08:00$/);
});
