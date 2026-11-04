/** 把 AI 规则回答中的内部字段/技术标识转成面向用户的表述；原文可在“原始回答”中查看。 */
const REPLACEMENTS: [RegExp, string][] = [
  [/enum0-3/gi, '（0–3 级）'],
  [/SIMULATED/gi, '模拟数据'],
  [/OFFICIAL_AUTO/gi, '官方自动站'],
  [/OFFICIAL_HISTORY/gi, '官方月报'],
  [/OFFICIAL_PUBLIC/gi, '官方公开数据'],
  [/MANUAL/gi, '人工记录'],
  [/RULE_OUTPUT/gi, '规则输出'],
  [/MODEL_OUTPUT/gi, '模型输出'],
  [/\bGOOD\b/g, '数据可信'],
  [/\bSUSPECT\b/g, '数据存疑'],
  [/\bINVALID\b/g, '数据无效'],
  [/\bMISSING\b/g, '数据缺失'],
  [/\bSTALE\b/g, '数据陈旧'],
  [/\bNEEDS_OBSERVATION\b/g, '仍需观察'],
  [/\bRECOVERED_SUPPORTED\b/g, '已恢复（规则支持）'],
  [/\bINSUFFICIENT_EVIDENCE\b/g, '证据不足'],
  [/\bINVESTIGATING\b/g, '研判中'],
  [/\bRECOVERED\b/g, '已恢复'],
  [/\bUNRESOLVED\b/g, '无法判定'],
  [/\bOPEN\b/g, '待初查'],
  [/\bMONITORING\b/g, '持续观察'],
  [/\bESCALATED\b/g, '已升级'],
  [/\bNARROWED\b/g, '范围收窄'],
  [/\bRECOVERY_PENDING\b/g, '待确认恢复'],
  [/\breach-a\b/g, '上游 A'],
  [/\breach-b\b/g, '中游 B'],
  [/\breach-c\b/g, '下游 C'],
  [/\bwaterLevel\b/g, '水位'],
  [/\bturbidity\b/g, '浊度'],
  [/\bflowLevel\b/g, '水流等级'],
  [/\bF1_ANCHOR\b/g, '复核锚点'],
  [/\bF2_OBSERVATION_RETURN\b/g, '观测回到基线'],
  [/\bF3_SAMPLE_QUALITY\b/g, '样本质量'],
  [/\bF4_REVIEW_CLOSED\b/g, '现场复核闭环'],
  [/\bF5_NO_OPEN_BLINDSPOT\b/g, '无未消除盲区'],
  [/\bF6_FIELD_EVIDENCE\b/g, '现场证据'],
  [/\bF7_PERSISTENCE\b/g, '越限持续性'],
];

export function humanizeAssistantText(text: string): string {
  return REPLACEMENTS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), text);
}

export interface ParsedAnswer {
  lead: string;
  bullets: { label: string | null; value: string }[];
  paragraphs: string[];
}

/** 把“首行结论 + - 列表 + 说明段落”的规则回答拆成可读结构。 */
export function parseAssistantAnswer(text: string): ParsedAnswer {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { lead: '', bullets: [], paragraphs: [] };

  const clean = (line: string) => humanizeAssistantText(line.replace(/^[-•]\s*/, ''));
  const firstIsBullet = /^[-•]/.test(lines[0]);
  const lead = firstIsBullet ? '' : clean(lines[0]);
  const rest = firstIsBullet ? lines : lines.slice(1);
  const bullets = rest
    .filter((line) => /^[-•]/.test(line))
    .map((line) => {
      const cleaned = clean(line);
      const match = cleaned.match(/^([^：:]{2,16})[：:]\s*(.+)$/);
      return match
        ? { label: match[1], value: match[2] }
        : { label: null, value: cleaned };
    });
  const paragraphs = rest
    .filter((line) => !/^[-•]/.test(line))
    .map(clean);
  return { lead, bullets, paragraphs };
}
