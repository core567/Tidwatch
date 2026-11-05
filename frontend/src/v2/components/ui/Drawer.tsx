import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

interface DrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'default' | 'wide';
}

export function Drawer({
  open,
  title,
  subtitle,
  eyebrow = 'EVIDENCE ARCHIVE',
  onClose,
  children,
  footer,
  size = 'default',
}: DrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // 仅在开关状态变化时执行：调用方每次渲染都会传入新的 onClose，
  // 若把它放进依赖数组，抽屉内每次输入都会重跑并抢走输入框焦点。
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!panelRef.current?.contains(document.activeElement)) {
      closeRef.current?.focus();
    }
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="v2-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div className="v2-drawer__backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        className={`v2-drawer__panel ${
          size === 'wide' ? 'v2-drawer__panel--wide' : ''
        }`.trim()}
      >
        <header className="v2-drawer__head">
          <div className="v2-drawer__heading">
            <span className="v2-eyebrow v2-eyebrow--bare">{eyebrow}</span>
            <h2 id="drawer-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="v2-btn v2-btn--icon v2-btn--ghost"
            onClick={onClose}
            aria-label="关闭抽屉"
          >
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="v2-drawer__body">{children}</div>
        {footer && <footer className="v2-drawer__footer">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}
