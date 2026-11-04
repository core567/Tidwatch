import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import type { ImportBatch, ImportPreview } from '@/types/contract';
import { formatTime, reachName } from '@/components/EventBits';
import { Badge } from '../../components/ui/Badge';
import { Icon } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';
import { PanelState } from '../../components/ui/PanelState';

const ACCEPT = '.csv,.xlsx,.xls';

function BatchBadge({ status }: { status: ImportBatch['status'] }) {
  const map = {
    CONFIRMED: ['已确认', 'live'],
    REVOKED: ['已撤销', 'default'],
    PREVIEW: ['待确认', 'mid'],
  } as const;
  const [text, tone] = map[status];
  return <Badge tone={tone}>{text}</Badge>;
}

export function MonthlyImportV2Panel({
  batches, loading, error, onReload,
}: {
  batches: ImportBatch[];
  loading: boolean;
  error?: Error | null;
  onReload: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [panelError, setPanelError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPanelError(''); setNotice(''); setPreview(null); setConfirming(false); setBusy(true);
    try {
      const result = await api.previewImport(file);
      setPreview(result);
    } catch (exc) {
      setPanelError(exc instanceof ApiError ? exc.message : (exc as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function confirmImport() {
    if (!preview) return;
    setBusy(true); setPanelError(''); setNotice(''); setConfirming(false);
    try {
      const batch = await api.confirmImport(preview.batchId, {});
      setNotice(`已确认导入 ${batch.originalFilename}，写入 ${batch.rowCount} 行；可在批次列表整批撤销。`);
      setPreview(null);
      await qc.invalidateQueries({ queryKey: ['import-batches'] });
      await qc.invalidateQueries({ queryKey: ['monthly'] });
      onReload();
    } catch (exc) {
      setPanelError(exc instanceof ApiError ? exc.message : (exc as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(batchId: string) {
    setBusy(true); setPanelError(''); setNotice('');
    try {
      await api.revokeImport(batchId);
      setRevokeId(null);
      setNotice('批次已撤销；仅移除该批月报记录，不影响模拟观测/事件/任务。');
      await qc.invalidateQueries({ queryKey: ['import-batches'] });
      await qc.invalidateQueries({ queryKey: ['monthly'] });
      onReload();
    } catch (exc) {
      setPanelError(exc instanceof ApiError ? exc.message : (exc as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const errorRows = preview?.rows.filter((row) => row.errors.length > 0) ?? [];
  const hasError = (preview?.invalidRows ?? 0) > 0;

  return (
    <Panel
      code="03"
      title="官方月报导入"
      en="OFFICIAL HISTORY IMPORT"
      className="v2-sys-panel v2-sys-import-panel"
      actions={<Badge tone="station">OFFICIAL_HISTORY · 可追溯/可撤销</Badge>}
    >
      <div className="v2-sys-import-head">
        <div>
          <b>导入官方水质月报</b>
          <p>支持 .csv / .xlsx / .xls；先解析校验、人工确认后再写库。月报独立于模拟观测与事件。</p>
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={onFile} />
        <button type="button" className="v2-btn v2-btn--primary" disabled={busy} onClick={() => fileRef.current?.click()}>
          <Icon name="download" size={12} />{busy ? '处理中…' : '选择文件解析'}
        </button>
      </div>

      {panelError && <div className="v2-sys-inline-error">操作失败：{panelError}</div>}
      {notice && <div className="v2-sys-inline-ok">{notice}</div>}

      {preview && (
        <div className="v2-sys-preview">
          <div className="v2-sys-import-summary">
            <Badge tone="default">{preview.originalFilename}</Badge>
            <Badge tone={hasError ? 'high' : 'live'}>有效 {preview.validRows} / 错误 {preview.invalidRows} / 共 {preview.totalRows}</Badge>
            {preview.publishedPeriod && <Badge tone="station">月份 {preview.publishedPeriod}</Badge>}
            {errorRows.length > 0 && (
              <button type="button" className="v2-sys-link" onClick={() => setShowAllRows((v) => !v)}>
                {showAllRows ? '只看错误' : '查看全部行'}
              </button>
            )}
          </div>
          {hasError && (
            <div className="v2-sys-inline-warn">
              存在 {preview.invalidRows} 个错误行；确认时跳过错误行，仅写入 {preview.validRows} 个有效行。
            </div>
          )}
          <div className="v2-sys-table-wrap v2-sys-preview-table">
            <table className="v2-sys-table">
              <thead><tr><th>行</th><th>月份</th><th>断面</th><th>类别</th><th>匹配断面</th><th>问题</th></tr></thead>
              <tbody>
                {(showAllRows || errorRows.length === 0 ? preview.rows : errorRows).map((row) => (
                  <tr key={row.rowNo} className={row.errors.length ? 'is-error' : ''}>
                    <td className="v2-mono">{row.rowNo}</td>
                    <td>{String(row.normalized.period ?? '—')}</td>
                    <td>{String(row.normalized.sectionName ?? '—')}</td>
                    <td>{String(row.normalized.currentClass ?? '—')}</td>
                    <td>{row.matchedReachId ? reachName(row.matchedReachId) : <span className="v2-muted">未匹配</span>}</td>
                    <td>
                      {row.errors.map((err, i) => <div key={i} className="v2-sys-cell-error">{err}</div>)}
                      {row.warnings.map((warn, i) => <div key={`w${i}`} className="v2-sys-cell-warn">{warn}</div>)}
                      {row.errors.length === 0 && row.warnings.length === 0 && <span className="v2-muted">通过</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {confirming ? (
            <div className="v2-sys-confirm v2-sys-confirm--block">
              <span>确认将 <b>{preview.validRows}</b> 行写入官方月报？写入后可按批次整批撤销。</span>
              <div>
                <button type="button" className="v2-btn v2-btn--primary v2-btn--sm" disabled={busy || preview.validRows === 0} onClick={() => void confirmImport()}>{busy ? '导入中…' : '确认写入'}</button>
                <button type="button" className="v2-btn v2-btn--ghost v2-btn--sm" onClick={() => setConfirming(false)}>取消</button>
              </div>
            </div>
          ) : (
            <div className="v2-sys-import-actions">
              <button type="button" className="v2-btn v2-btn--ghost v2-btn--sm" onClick={() => setPreview(null)}>取消</button>
              <button type="button" className="v2-btn v2-btn--primary" disabled={busy || preview.validRows === 0} onClick={() => setConfirming(true)}>
                确认导入 {preview.validRows} 行
              </button>
            </div>
          )}
        </div>
      )}

      <div className="v2-sys-subhead v2-sys-batches-head">
        <h4>导入批次</h4>
        <span className="v2-mono">BATCH HISTORY</span>
        <button type="button" className="v2-sys-link" onClick={onReload}>刷新</button>
      </div>

      {loading && batches.length === 0 && <PanelState variant="loading" />}
      {error && batches.length === 0 && <div className="v2-sys-inline-error">批次加载失败：{error.message}</div>}
      {!loading && !error && batches.length === 0 && <div className="v2-sys-inline-muted">暂无导入批次，导入月报后可在此追踪与撤销。</div>}

      {batches.length > 0 && (
        <div className="v2-sys-batch-list">
          {[...batches].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')).map((batch) => (
            <div className="v2-sys-batch" key={batch.batchId}>
              <div className="v2-sys-batch__main">
                <span className="v2-sys-batch__title">
                  <b>{batch.originalFilename}</b>
                  <BatchBadge status={batch.status} />
                  {batch.publishedPeriod && <span className="v2-sys-batch__period">{batch.publishedPeriod}</span>}
                </span>
                <span className="v2-sys-batch__meta">
                  {batch.rowCount} 行 · {batch.importedBy ?? '—'} · {formatTime(batch.createdAt)} · <span className="v2-mono">{batch.batchId.slice(0, 16)}…</span>
                </span>
              </div>
              {batch.status === 'CONFIRMED' && (
                revokeId === batch.batchId ? (
                  <div className="v2-sys-confirm">
                    <span>确认仅撤销本批次 {batch.rowCount} 行？</span>
                    <button type="button" className="v2-btn v2-btn--danger v2-btn--sm" disabled={busy} onClick={() => void revoke(batch.batchId)}>确认撤销</button>
                    <button type="button" className="v2-btn v2-btn--ghost v2-btn--sm" onClick={() => setRevokeId(null)}>取消</button>
                  </div>
                ) : (
                  <button type="button" className="v2-btn v2-btn--ghost v2-btn--sm" onClick={() => setRevokeId(batch.batchId)}>撤销导入</button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      <p className="v2-sys-note">
        撤销只删除该批次导入的官方月报记录，不影响模拟观测、事件、任务和现场证据；操作需二次确认。
      </p>
    </Panel>
  );
}
