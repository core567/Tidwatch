import { api } from '@/services/apiClient';
import type { Observation } from '@/types/contract';

export interface CsvFilter {
  metric?: string;
  sourceType?: string;
  quality?: string;
  from?: string;
  to?: string;
}

const PAGE_SIZE = 500; // 后端单页上限

/** 把值转为 CSV 单元格（含逗号/引号/换行时加引号转义）。 */
function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * 按当前筛选条件导出**全部**符合记录（跨断面、分页拉满，不静默截断）。
 * 任一分页不足或失败时抛出，由调用方提示。
 */
export async function exportObservationsCsv(
  reachIds: string[],
  filter: CsvFilter,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob> {
  const header = ['观测时间', '入库时间', '断面', '指标', '数值', '单位', '数据来源', '来源名称', '质量', '规则版本'];
  const lines: string[] = [header.map(csvCell).join(',')];
  let grandTotal = 0;

  for (const reachId of reachIds) {
    let page = 1;
    let fetched = 0;
    let total = Infinity;
    while (fetched < total) {
      const res = await api.observations(reachId, { ...filter, page, pageSize: PAGE_SIZE, order: 'asc' });
      total = res.total;
      const items = (res.items ?? []) as Observation[];
      if (items.length === 0) break;
      for (const o of items) {
        lines.push([
          o.observedAt, o.ingestedAt, o.reachId, o.metric, o.value, o.unit,
          o.sourceType, o.sourceName ?? '', o.qualityFlag, o.ruleVersion,
        ].map(csvCell).join(','));
      }
      fetched += items.length;
      grandTotal += items.length;
      onProgress?.(grandTotal, total);
      page += 1;
      // 安全保护：后端异常返回空 total 时避免死循环
      if (fetched >= total || items.length < PAGE_SIZE) break;
    }
  }

  // BOM 保证 Excel 正确识别 UTF-8 中文
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}
