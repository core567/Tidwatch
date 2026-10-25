import type { PropsWithChildren, ReactNode } from 'react';

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** 内容区是否自带内边距（表格类传 false） */
  padded?: boolean;
  className?: string;
}

export default function Card({
  title,
  subtitle,
  actions,
  padded = true,
  className,
  children,
}: PropsWithChildren<CardProps>) {
  return (
    <section className={`tw-card ${className ?? ''}`.trim()}>
      {(title || actions) && (
        <div className="tw-card-header">
          <div>
            {title && <h2 className="tw-card-title">{title}</h2>}
            {subtitle && <p className="tw-card-subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="tw-card-actions">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'tw-card-body' : 'tw-card-body tw-card-body-flush'}>
        {children}
      </div>
    </section>
  );
}
