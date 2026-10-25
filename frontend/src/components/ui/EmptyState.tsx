import type { ReactNode } from 'react';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  title = '暂无数据',
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="tw-empty">
      <div className="tw-empty-title">{title}</div>
      {description && <div className="tw-empty-desc">{description}</div>}
      {action && <div className="tw-empty-action">{action}</div>}
    </div>
  );
}
