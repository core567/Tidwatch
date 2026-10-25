import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface DrawerProps {
  open: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number | string;
}

export default function Drawer({
  open,
  title,
  subtitle,
  onClose,
  footer,
  width = 480,
  children,
}: PropsWithChildren<DrawerProps>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="tw-overlay tw-overlay-right"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="tw-drawer" role="dialog" aria-modal="true" style={{ width }}>
        <div className="tw-drawer-head">
          <div>
            <h3 className="tw-modal-title">{title}</h3>
            {subtitle ? <p className="tw-modal-subtitle">{subtitle}</p> : null}
          </div>
          <button className="tw-icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="tw-drawer-body">{children}</div>
        {footer ? <div className="tw-drawer-foot">{footer}</div> : null}
      </aside>
    </div>,
    document.body,
  );
}
