import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore, useUnreadCount } from '@/store/notifications';

const TONE_DOT: Record<string, string> = {
  info: '#1e6fe0',
  ok: '#12a594',
  watch: '#e8902a',
  danger: '#d84c4c',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return iso;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  return `${Math.floor(hour / 24)} 天前`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const items = useNotificationStore((s) => s.items);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const markRead = useNotificationStore((s) => s.markRead);
  const clear = useNotificationStore((s) => s.clear);
  const unread = useUnreadCount();
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="tw-bell" ref={ref}>
      <button
        className="tw-bell-btn"
        aria-label={`通知${unread > 0 ? `（${unread} 条未读）` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>◔</span>
        <span className="tw-bell-label">通知</span>
        {unread > 0 ? <span className="tw-bell-badge">{unread > 99 ? '99+' : unread}</span> : null}
      </button>

      {open ? (
        <div className="tw-bell-panel" role="dialog" aria-label="通知中心">
          <div className="tw-bell-head">
            <strong>通知</strong>
            <div className="tw-bell-head-actions">
              <button onClick={markAllRead} disabled={unread === 0}>全部已读</button>
              <button onClick={clear} disabled={items.length === 0}>清空</button>
            </div>
          </div>
          <div className="tw-bell-list">
            {items.length === 0 ? (
              <div className="tw-bell-empty">暂无通知。实时事件与任务变化会出现在这里。</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  className={`tw-bell-item${n.read ? '' : ' is-unread'}`}
                  onClick={() => {
                    markRead(n.id);
                    if (n.to) {
                      navigate(n.to);
                      setOpen(false);
                    }
                  }}
                >
                  <span className="tw-bell-dot" style={{ background: TONE_DOT[n.tone] }} />
                  <span className="tw-bell-item-main">
                    <span className="tw-bell-item-title">{n.title}</span>
                    {n.description ? <span className="tw-bell-item-desc">{n.description}</span> : null}
                  </span>
                  <span className="tw-bell-time">{timeAgo(n.at)}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
