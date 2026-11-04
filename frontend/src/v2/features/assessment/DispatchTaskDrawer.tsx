import { useState } from 'react';
import { api, ApiError } from '@/services/apiClient';
import { reachName } from '@/components/EventBits';
import type { Recommendation } from '@/types/contract';
import { Drawer } from '../../components/ui/Drawer';

export function DispatchTaskDrawer({
  eventId, rec, onClose, onDone,
}: {
  eventId: string;
  rec: Recommendation;
  onClose: () => void;
  onDone: () => void;
}) {
  const reachId = rec.suggestedTask?.reachId ?? rec.reachIds?.[0] ?? 'reach-a';
  const [title, setTitle] = useState(`现场核查 ${reachName(reachId)}`);
  const [reasonTxt, setReasonTxt] = useState(rec.reason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (title.trim().length < 2) { setError('任务标题至少 2 个字符'); return; }
    setBusy(true);
    setError('');
    try {
      await api.createTask({ eventId, reachId, title: title.trim(), reason: reasonTxt.trim() });
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Drawer open title="派发现场核查" subtitle="规则仅生成草稿，需人工确认后创建" onClose={onClose}>
      <div className="v2-stack" style={{ gap: 12 }}>
        <div className="v2-field">
          <span className="v2-field__label">关联事件</span>
          <span className="v2-mono">{eventId}</span>
        </div>
        <div className="v2-field">
          <span className="v2-field__label">目标断面</span>
          <span className="v2-mono">{reachName(reachId)}</span>
        </div>
        <div className="v2-field">
          <span className="v2-field__label">任务标题</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="v2-input" style={{ width: '100%' }} />
        </div>
        <div className="v2-field">
          <span className="v2-field__label">派发理由</span>
          <textarea value={reasonTxt} onChange={(e) => setReasonTxt(e.target.value)} className="v2-textarea" rows={3} />
        </div>
        {error && <div className="v2-case-actions__error">{error}</div>}
        <div className="v2-row" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="v2-btn v2-btn--ghost" onClick={onClose}>取消</button>
          <button type="button" className="v2-btn v2-btn--primary" onClick={() => void submit()} disabled={busy}>
            {busy ? '派发中…' : '确认派发'}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
