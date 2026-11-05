import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/services/apiClient';
import { Drawer } from '../../components/ui/Drawer';

/**
 * F6 新建任务（v2 深色）：复用原 CreateTaskModal 的真实 createTask 流程与
 * 「存草稿（DRAFT）/ 直接派发（PENDING）」区分，不改变后端语义。
 */
export default function CreateTaskModalV2({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reachId, setReachId] = useState('reach-c');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function submit(draft: boolean) {
    if (title.trim().length < 2) {
      setError('任务标题至少 2 个字');
      return;
    }
    setBusy(draft ? 'draft' : 'dispatch');
    setError('');
    try {
      await api.createTask({
        reachId,
        title: title.trim(),
        reason: reason.trim(),
        priority: 'NORMAL',
        draft,
      });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
      setBusy(null);
    }
  }

  return (
    <Drawer
      open
      title="新建巡检任务"
      subtitle="草稿可继续编辑；直接派发后进入待接收"
      onClose={() => (busy ? undefined : onClose())}
    >
      <div className="v2-create-task">
        <label className="v2-field">
          <span className="v2-field__label">监测断面</span>
          <select value={reachId} onChange={(e) => setReachId(e.target.value)} className="v2-select" style={{ width: '100%' }}>
            <option value="reach-a">上游 A</option>
            <option value="reach-b">中游 B</option>
            <option value="reach-c">下游 C</option>
          </select>
        </label>
        <label className="v2-field">
          <span className="v2-field__label">任务标题</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：现场核查 C 断面水位"
            className="v2-input"
            style={{ width: '100%' }}
            autoFocus
          />
        </label>
        <label className="v2-field">
          <span className="v2-field__label">说明</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="v2-textarea" />
        </label>
        {error && <div className="v2-case-actions__error">{error}</div>}
        <div className="v2-row" style={{ justifyContent: 'space-between' }}>
          <button type="button" className="v2-btn v2-btn--ghost" disabled={busy !== null} onClick={() => void submit(true)}>
            {busy === 'draft' ? '保存中…' : '存草稿'}
          </button>
          <div className="v2-row" style={{ gap: 8 }}>
            <button type="button" className="v2-btn v2-btn--ghost" onClick={onClose}>取消</button>
            <button type="button" className="v2-btn v2-btn--primary" disabled={busy !== null} onClick={() => void submit(false)}>
              {busy === 'dispatch' ? '派发中…' : '直接派发'}
            </button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
