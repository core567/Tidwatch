/** 恢复评估因子英文码 → 中文业务名称（F5 可读性优化）。 */
export const RECOVERY_FACTOR_CN: Record<string, { name: string; short: string }> = {
  F1_ANCHOR: { name: '处置完成可追溯', short: '处置锚点' },
  F2_OBSERVATION_RETURN: { name: '处置后观测回落', short: '观测回落' },
  F3_SAMPLE_QUALITY: { name: '数据质量与样本量', short: '样本质量' },
  F4_REVIEW_CLOSED: { name: '现场复核闭环', short: '复核闭环' },
  F5_NO_OPEN_BLINDSPOT: { name: '无未消除监测盲区', short: '无开放盲区' },
  F6_FIELD_EVIDENCE: { name: '现场证据完整性', short: '现场证据' },
  F7_PERSISTENCE: { name: '恢复持续性', short: '持续性' },
};
