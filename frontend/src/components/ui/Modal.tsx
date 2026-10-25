import { useEffect, type PropsWithChildren, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  open: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  width?: number | string;
}

export default function Modal({
  open,
  title,
  subtitle,
  onClose,
  footer,
  width = 520,
  children,
}: PropsWithChildren<ModalProps>) {
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
      className="tw-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tw-modal" role="dialog" aria-modal="true" style={{ width }}>
        <div className="tw-modal-head">
          <div>
            <h3 className="tw-modal-title">{title}</h3>
            {subtitle ? <p className="tw-modal-subtitle">{subtitle}</p> : null}
          </div>
          <button className="tw-icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="tw-modal-body">{children}</div>
        {footer ? <div className="tw-modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
