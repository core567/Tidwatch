// components/m-metric/m-metric.ts — 指标值卡（数值/单位/名称/观测时间/来源标）
Component({
  properties: {
    label: { type: String, value: '' },
    value: { type: null, value: null as string | number | null },
    unit: { type: String, value: '' },
    time: { type: String, value: '' },
    source: { type: String, value: '' }, // SIMULATED / OFFICIAL_PUBLIC / MANUAL
    tone: { type: String, value: 'navy' }, // navy | ok | watch | danger
    digits: { type: Number, value: -1 }, // >=0 时按位数格式化
  },
  data: {
    display: '—',
    sourceText: '',
    sourceClass: '',
  },
  observers: {
    'value,digits'(v: unknown, digits: number) {
      let display = '—';
      if (typeof v === 'number' && Number.isFinite(v)) {
        display = digits >= 0 ? v.toFixed(digits) : String(v);
      } else if (typeof v === 'string' && v !== '') {
        display = v;
      }
      this.setData({ display });
    },
    'source'(s: string) {
      const map: Record<string, [string, string]> = {
        SIMULATED: ['模拟数据', 'm-src-sim'],
        OFFICIAL_PUBLIC: ['官方公开', 'm-src-gov'],
        MANUAL: ['人工测量', 'm-src-man'],
      };
      const hit = map[s] ?? ['', ''];
      this.setData({ sourceText: hit[0], sourceClass: hit[1] });
    },
  },
});
