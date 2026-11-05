import { Icon } from '../../components/ui/Icon';
import { useAlertUnreadCount, useGlobalAlertStore } from '@/store/alerts';

/** V2 顶栏告警入口：只打开全局告警历史，不新建 SSE 或事件系统。 */
export function AlertBell() {
  const unread = useAlertUnreadCount();
  const open = useGlobalAlertStore((state) => state.panelOpen);
  const togglePanel = useGlobalAlertStore((state) => state.togglePanel);

  return (
    <button
      type="button"
      className={`v2-alert-bell${open ? ' is-open' : ''}`}
      onClick={() => togglePanel()}
      aria-label={`异常告警${unread > 0 ? `（${unread} 条未读）` : ''}`}
      aria-expanded={open}
      title="查看异常告警历史"
    >
      <Icon name="assessment" size={14} />
      <span>告警</span>
      {unread > 0 ? <em>{unread > 99 ? '99+' : unread}</em> : null}
    </button>
  );
}
