import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import { Button, Card, EmptyState, Tag } from '@/components/ui';
import { formatTime, reachName } from '@/components/EventBits';
import type { ImportBatch, ImportPreview } from '@/types/contract';
import './admin.css';

const ACCEPT = '.csv,.xlsx,.xls';

/** 官方月报导入：文件选择 → 解析预览/校验 → 确认 → 结果/撤销。 */
export default function MonthlyImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState<ImportBatch | null>(null);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  const batchesQ = useQuery({ queryKey: ['import-batches'], queryFn: api.importBatches });
  const batches = (batchesQ.data ?? []) as ImportBatch[];

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setConfirmed(null);
    setBusy(true);
    try {
      const res = await api.previewImport(file);
      setPreview(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
      setPreview(null);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      const b = await api.confirmImport(preview.batchId, {});
      setConfirmed(b);
      setPreview(null);
      await qc.invalidateQueries({ queryKey: ['import-batches'] });
      await qc.invalidateQueries({ queryKey: ['monthly'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(batchId: string) {
    setBusy(true);
    setError('');
    try {
      await api.revokeImport(batchId);
      setConfirmRevokeId(null);
      await qc.invalidateQueries({ queryKey: ['import-batches'] });
      await qc.invalidateQueries({ queryKey: ['monthly'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tw-stack">
      <Card
        title="导入官方水质月报"
        subtitle="支持 .csv / .xlsx / .xls；先解析校验、人工确认后才写库，不影响模拟观测"
        actions={
          <>
            <input ref={fileRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={onFile} />
            <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? '处理中…' : '选择文件解析'}
            </Button>
          </>
        }
      >
        {error && <div className="tw-import-error">解析失败：{error}</div>}
        {!preview && !confirmed && !error && (
          <div className="tw-tiny">选择文件后将显示列识别、断面匹配与逐行校验结果；含错误的行不会被导入。</div>
        )}
        {confirmed && (
          <div className="tw-import-ok">
            已确认导入：{confirmed.originalFilename}，写入 {confirmed.rowCount} 行（批次 {confirmed.batchId.slice(0, 16)}…）。
            可在下方批次列表撤销。
          </div>
        )}
        {preview && <PreviewTable preview={preview} busy={busy} onConfirm={confirm} onCancel={() => setPreview(null)} />}
      </Card>

      <Card
        title="导入批次"
        subtitle="仅可撤销「已确认」批次；撤销只删除该批次导入的月报记录，不影响模拟观测/事件/任务"
        actions={<Button size="sm" variant="ghost" onClick={() => batchesQ.refetch()}>刷新</Button>}
        padded={false}
      >
        {batches.length === 0 ? (
          <EmptyState title="暂无导入批次" description="导入月报后在此追踪与撤销。" />
        ) : (
          <div className="tw-batch-list">
            {batches.map((b) => (
              <div key={b.batchId} className="tw-batch-row">
                <div>
                  <div className="tw-row" style={{ gap: 8 }}>
                    <b>{b.originalFilename}</b>
                    <BatchStatus status={b.status} />
                    {b.publishedPeriod && <Tag tone="outline">{b.publishedPeriod}</Tag>}
                  </div>
                  <div className="tw-tiny">
                    {b.rowCount} 行 · {b.importedBy ?? '—'} · {formatTime(b.createdAt)} · {b.batchId.slice(0, 16)}…
                  </div>
                </div>
                {b.status === 'CONFIRMED' && (
                  confirmRevokeId === b.batchId ? (
                    <div className="tw-row" style={{ gap: 6 }}>
                      <span className="tw-tiny">确认仅撤销本批次 {b.rowCount} 行？</span>
                      <Button size="sm" variant="danger" disabled={busy} onClick={() => revoke(b.batchId)}>确认撤销</Button>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmRevokeId(null)}>取消</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmRevokeId(b.batchId)}>撤销导入</Button>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function BatchStatus({ status }: { status: ImportBatch['status'] }) {
  const map = { CONFIRMED: ['已确认', 'ok'], REVOKED: ['已撤销', 'muted'], PREVIEW: ['待确认', 'watch'] } as const;
  const [text, tone] = map[status];
  return <Tag tone={tone}>{text}</Tag>;
}

function PreviewTable({
  preview,
  busy,
  onConfirm,
  onCancel,
}: {
  preview: ImportPreview;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [showErrorsOnly, setShowErrorsOnly] = useState(true);
  const errorRows = preview.rows.filter((r) => r.errors.length > 0);
  const shown = showErrorsOnly ? errorRows : preview.rows;
  const hasError = preview.invalidRows > 0;

  return (
    <div className="tw-stack">
      <div className="tw-preview-summary">
        <Tag tone="watch">文件 {preview.originalFilename}</Tag>
        <Tag tone={hasError ? 'danger' : 'ok'}>有效 {preview.validRows} / 错误 {preview.invalidRows} / 共 {preview.totalRows}</Tag>
        {preview.publishedPeriod && <Tag tone="outline">月份 {preview.publishedPeriod}</Tag>}
      </div>
      {hasError && (
        <div className="tw-import-error">
          存在 {preview.invalidRows} 个错误行，确认时将跳过这些行，仅导入 {preview.validRows} 个有效行。
        </div>
      )}
      <div className="tw-row" style={{ gap: 8 }}>
        <Button size="sm" variant="ghost" onClick={() => setShowErrorsOnly((v) => !v)}>
          {showErrorsOnly ? `只看错误（${errorRows.length}）` : '查看全部行'}
        </Button>
      </div>
      <div className="tw-preview-table">
        <table>
          <thead>
            <tr><th>行</th><th>月份</th><th>断面</th><th>现状类别</th><th>匹配断面</th><th>问题</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.rowNo} className={r.errors.length ? 'is-error' : ''}>
                <td>{r.rowNo}</td>
                <td>{String(r.normalized.period ?? '')}</td>
                <td>{String(r.normalized.sectionName ?? '')}</td>
                <td>{String(r.normalized.currentClass ?? '')}</td>
                <td>{r.matchedReachId ? reachName(r.matchedReachId) : <span className="tw-tiny">未匹配</span>}</td>
                <td>
                  {r.errors.map((x, i) => <div key={i} className="tw-cell-error">{x}</div>)}
                  {r.warnings.map((x, i) => <div key={`w${i}`} className="tw-cell-warn">{x}</div>)}
                  {r.errors.length === 0 && r.warnings.length === 0 && <span className="tw-tiny">通过</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tw-row" style={{ gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>取消</Button>
        <Button disabled={busy || preview.validRows === 0} onClick={onConfirm}>
          {busy ? '导入中…' : `确认导入 ${preview.validRows} 行`}
        </Button>
      </div>
    </div>
  );
}
