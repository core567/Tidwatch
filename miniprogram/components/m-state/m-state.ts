// components/m-state/m-state.ts — 统一加载/空/错误三态
Component({
  properties: {
    // loading | empty | error
    type: { type: String, value: 'empty' },
    title: { type: String, value: '' },
    desc: { type: String, value: '' },
    retryText: { type: String, value: '重试' },
    showRetry: { type: Boolean, value: false },
  },
  methods: {
    onRetry() {
      this.triggerEvent('retry');
    },
  },
});
