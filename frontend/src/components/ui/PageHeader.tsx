import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** 页面编号，如 P01 */
  code?: string;
  title: string;
  description?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({
  code,
  title,
  description,
  badges,
  actions,
}: PageHeaderProps) {
  return (
    <header className="tw-page-header">
      <div className="tw-page-header-main">
        {code && <div className="tw-page-header-kicker">{code}</div>}
        <h1 className="tw-page-header-title">{title}</h1>
        {badges && <div className="tw-page-header-badges">{badges}</div>}
        {description && <p className="tw-page-header-desc">{description}</p>}
      </div>
      {actions && <div className="tw-page-header-actions">{actions}</div>}
    </header>
  );
}
