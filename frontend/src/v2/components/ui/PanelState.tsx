import { Icon } from './Icon';

interface PanelStateProps {
  variant: 'loading' | 'empty' | 'error';
  title?: string;
  desc?: string;
  action?: React.ReactNode;
}

export function PanelState({ variant, title, desc, action }: PanelStateProps) {
  if (variant === 'loading') {
    return (
      <div className="v2-state v2-state--loading" aria-busy="true" aria-live="polite">
        <div className="v2-skeleton v2-skeleton-block" style={{ width: '100%' }} />
        <div className="v2-skeleton v2-skeleton-line" style={{ width: '70%' }} />
      </div>
    );
  }

  return (
    <div className={`v2-state ${variant === 'error' ? 'v2-state--error' : ''}`.trim()} role="status">
      <div className="v2-state__icon">
        <Icon name={variant === 'error' ? 'close' : 'wave'} size={20} />
      </div>
      <div className="v2-state__title">{title ?? (variant === 'error' ? '数据加载失败' : '暂无数据')}</div>
      {desc && <p className="v2-state__desc">{desc}</p>}
      {action}
    </div>
  );
}
