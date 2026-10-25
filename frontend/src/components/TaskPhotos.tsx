import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';

/** 任务回填照片：点击展开，图片经带 token 的 fetch 读取（不能直接用 <img src>）。 */
export function TaskPhotos({ taskId, count }: { taskId: string; count: number }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['task-attachments', taskId],
    queryFn: () => api.taskAttachments(taskId),
    enabled: open && count > 0,
  });

  if (count === 0) return <span className="muted">—</span>;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ border: 'none', background: 'none', color: 'var(--tw-accent)', cursor: 'pointer', fontSize: 12.5 }}
      >
        {count} 张照片 {open ? '▲' : '▼'}
      </button>
      {open && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
          {(q.data?.items ?? []).map((a) => (
            <PhotoThumb key={a.attachmentId} url={a.contentUrl} onOpen={setPreview} />
          ))}
          {q.isLoading && <span className="muted" style={{ fontSize: 12 }}>加载中…</span>}
        </div>
      )}
      {preview && (
        <div
          onClick={() => {
            URL.revokeObjectURL(preview);
            setPreview(null);
          }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}
        >
          <img src={preview} alt="巡检照片" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8 }} />
        </div>
      )}
    </>
  );
}

function PhotoThumb({ url, onOpen }: { url: string; onOpen: (u: string) => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let obj = '';
    let alive = true;
    fetch(url)
      .then((r) => r.blob())
      .then((b) => {
        obj = URL.createObjectURL(b);
        if (alive) setSrc(obj);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (obj) URL.revokeObjectURL(obj);
    };
  }, [url]);
  return (
    <div
      onClick={() => src && onOpen(src)}
      style={{ width: 56, height: 56, borderRadius: 6, overflow: 'hidden', background: '#f0f4f8', cursor: 'pointer' }}
    >
      {src ? (
        <img src={src} alt="附件" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ width: '100%', height: '100%' }} />
      )}
    </div>
  );
}
