// components/source-tag/source-tag.ts
const LABEL_MAP: Record<string, string> = {
  OFFICIAL_PUBLIC: '官方公开',
  SIMULATED: '模拟数据',
  EXTERNAL: '外部数据',
  RULE_OUTPUT: '规则输出',
  MODEL_OUTPUT: '模型输出',
  MANUAL: '人工记录',
};

Component({
  properties: {
    source: {
      type: String,
      value: 'SIMULATED',
    },
  },
  data: {
    label: '模拟数据',
    theme: 'simulated',
  },
  observers: {
    source(v: string) {
      const key = (v || '') as SourceType;
      this.setData({
        label: LABEL_MAP[key] ?? v ?? '未知来源',
        theme: mapTheme(key),
      });
    },
  },
});

function mapTheme(s: string): string {
  switch (s) {
    case 'OFFICIAL_PUBLIC':
      return 'official';
    case 'SIMULATED':
      return 'simulated';
    case 'MANUAL':
      return 'manual';
    case 'EXTERNAL':
      return 'external';
    case 'RULE_OUTPUT':
      return 'rule';
    case 'MODEL_OUTPUT':
      return 'model';
    default:
      return 'neutral';
  }
}
