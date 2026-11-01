import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, title, subtitle, onClose, children, footer }: ModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="v2-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="v2-modal__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="v2-modal__panel">
        <header className="v2-modal__head">
          <div>
            <span className="v2-eyebrow v2-eyebrow--bare">NEW FIELD TASK</span>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="v2-btn v2-btn--icon v2-btn--ghost"
            onClick={onClose}
            aria-label="关闭弹窗"
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="v2-modal__body">{children}</div>
        {footer && <footer className="v2-modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
