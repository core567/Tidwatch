import type { SourceType } from '@/types/contract';

const LABEL: Record<SourceType, string> = {
  OFFICIAL_PUBLIC: '官方公开',
  OFFICIAL_AUTO: '官方实时',
  SIMULATED: '模拟数据',
  EXTERNAL: '外部数据',
  RULE_OUTPUT: '规则输出',
  MODEL_OUTPUT: '模型输出',
  MANUAL: '人工记录',
};

const THEME: Partial<Record<SourceType, string>> = {
  OFFICIAL_PUBLIC: 'source-tag-official',
  OFFICIAL_AUTO: 'source-tag-official',
  SIMULATED: 'source-tag-simulated',
  MANUAL: 'source-tag-manual',
};

export default function SourceTag({ source }: { source: SourceType }) {
  return <span className={`source-tag ${THEME[source] ?? ''}`}>{LABEL[source]}</span>;
}
