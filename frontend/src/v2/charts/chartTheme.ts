export const chartFont =
  '"Cascadia Code", "JetBrains Mono", "SFMono-Regular", Consolas, monospace';

export const chartColors = {
  A: '#5aa9ff',
  B: '#ff6f5e',
  C: '#4fe6d2',
  danger: '#ff6f5e',
  warn: '#ffc46b',
  tide: '#4fe6d2',
} as const;

export const chartText = {
  axis: '#8aaab2',
  axisName: '#7c9fa7',
  muted: '#7fa4ab',
  strong: '#eaf7f5',
  tooltipBody: '#a7c2c8',
} as const;

export const chartGrid = {
  splitLine: 'rgba(120, 205, 210, 0.07)',
  axisLine: 'rgba(120, 205, 210, 0.14)',
  axisPointer: 'rgba(160, 230, 230, 0.3)',
} as const;

export const chartAnimation = {
  duration: 900,
  easing: 'cubicOut',
} as const;

export const chartTooltipBase = {
  backgroundColor: 'rgba(4,20,27,0.96)',
  borderColor: 'rgba(120,205,210,0.24)',
  borderWidth: 1,
  padding: [10, 12] as [number, number],
  textStyle: { color: '#e3f4f1', fontSize: 11, fontFamily: chartFont },
  extraCssText:
    'backdrop-filter: blur(12px); box-shadow: 0 14px 44px -14px rgba(0,0,0,0.9); border-radius: 2px;',
};

interface TooltipParam {
  axisValueLabel: string;
  marker: string;
  seriesName: string;
  value: number;
}

export function makeTrendTooltip(unit: string, decimals = 1, threshold?: number) {
  return (params: unknown) => {
    const list = params as TooltipParam[];
    if (!list?.length) return '';
    const rows = list
      .map((item) => {
        const exceeded =
          threshold !== undefined &&
          item.seriesName.includes('B') &&
          Number(item.value) > threshold;
        return `<div style="display:flex;align-items:center;gap:10px;margin-top:5px;">${item.marker}<span style="color:${chartText.tooltipBody};min-width:46px;">${item.seriesName}</span><b style="color:${chartText.strong};font-weight:600;">${item.value?.toFixed?.(decimals)}</b><span style="color:${chartText.muted};font-size:9px;">${unit}</span>${exceeded ? '<span style="color:#ff8f80;font-size:8px;letter-spacing:.08em;">超阈值</span>' : ''}</div>`;
      })
      .join('');
    return `<div style="font-size:9px;letter-spacing:.14em;color:${chartText.muted};">${list[0].axisValueLabel}</div>${rows}`;
  };
}
