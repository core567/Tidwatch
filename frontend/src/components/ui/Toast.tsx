import { useNotificationStore } from '@/store/notifications';

export default function ToastViewport() {
  const toasts = useNotificationStore((s) => s.toasts);
  const dismiss = useNotificationStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="tw-toast-viewport" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="tw-toast" data-tone={t.tone}>
          <div className="tw-toast-main">
            <div className="tw-toast-title">{t.title}</div>
            {t.description ? <div className="tw-toast-desc">{t.description}</div> : null}
          </div>
          <button className="tw-icon-btn" onClick={() => dismiss(t.id)} aria-label="关闭提示">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
