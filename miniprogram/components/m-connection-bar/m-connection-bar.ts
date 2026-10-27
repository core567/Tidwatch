// 连接/数据状态提示条：纯展示，非阻塞，不替代错误页。
// - offline：网络/通道不可用，当前是上次数据
// - stale：数据可能过期
// ok 时不渲染。
Component({
  properties: {
    tone: { type: String, value: 'ok' },
    text: { type: String, value: '' },
  },
});
