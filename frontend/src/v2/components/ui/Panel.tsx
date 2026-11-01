import type { ReactNode } from 'react';

interface PanelProps {
  code?: string;
  title: string;
  en?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({
  code,
  title,
  en,
  actions,
  footer,
  children,
  className = '',
  bodyClassName = '',
}: PanelProps) {
  return (
    <section className={`v2-panel ${className}`.trim()}>
      <header className="v2-panel__head">
        {code && <span className="v2-panel__code">{code}</span>}
        <h2 className="v2-panel__title">{title}</h2>
        {en && <span className="v2-panel__en">{en}</span>}
        {actions && <div className="v2-panel__actions">{actions}</div>}
      </header>
      <div className={`v2-panel__body ${bodyClassName}`.trim()}>{children}</div>
      {footer && <div className="v2-panel__footer">{footer}</div>}
    </section>
  );
}
