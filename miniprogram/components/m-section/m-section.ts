// components/m-section/m-section.ts — 白色分区卡（渐变竖条标题 + 右侧操作槽）
Component({
  options: {
    multipleSlots: true,
  },
  properties: {
    title: { type: String, value: '' },
    more: { type: String, value: '' },
  },
  methods: {
    onMore() {
      this.triggerEvent('more');
    },
  },
});
