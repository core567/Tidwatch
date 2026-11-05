import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import { useCameraStore, type View3d } from '@/features/threeD/cameraStore';
import { useAlertUnreadCount, useGlobalAlertStore } from '@/store/alerts';
import { useGlobalAlerts } from '@/services/useGlobalAlerts';
import { unlockAlertSound } from '@/services/alertSound';
import type { GlobalAlertItem } from '@/services/alertRules';
import '../../styles/global-alerts.css';

function timeText(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('zh-CN', { hour12: false });
}

function AlertRow({
  item,
  onView,
  onLocate,
}: {
  item: GlobalAlertItem;
  onView: (item: GlobalAlertItem) => void;
  onLocate: (item: GlobalAlertItem) => void;
}) {
  return (
    <div className={`f9-alert-row f9-alert-row--${item.severity}`}>
      <div className="f9-alert-row__main">
        <b>{item.station} · {item.metricLabel}</b>
        <span>{item.title} · {item.eventId} · {item.statusLabel}</span>
        <span className="f9-mono">{item.value} · 阈值 {item.threshold}</span>
      </div>
      <div className="f9-alert-row__actions">
        <button type="button" onClick={() => onView(item)}>查看详情</button>
        {item.reachId ? <button type="button" onClick={() => onLocate(item)}>定位</button> : null}
      </div>
    </div>
  );
}

/** F9 全局告警：顶部弹窗 + 历史面板；只消费现有 SSE/事件 API。 */
export default function GlobalAlertCenter() {
  useGlobalAlerts();
  const location = useLocation();
  const navigate = useNavigate();
  const batch = useGlobalAlertStore((state) => state.activeBatch);
  const items = useGlobalAlertStore((state) => state.items);
  const panelOpen = useGlobalAlertStore((state) => state.panelOpen);
  const soundEnabled = useGlobalAlertStore((state) => state.soundEnabled);
  const unread = useAlertUnreadCount();
  const dismissBatch = useGlobalAlertStore((state) => state.dismissBatch);
  const togglePanel = useGlobalAlertStore((state) => state.togglePanel);
  const markRead = useGlobalAlertStore((state) => state.markRead);
  const markAllRead = useGlobalAlertStore((state) => state.markAllRead);
  const clearHistory = useGlobalAlertStore((state) => state.clearHistory);
  const toggleSound = useGlobalAlertStore((state) => state.toggleSound);

  useEffect(() => {
    if (batch.length === 0 || panelOpen) return;
    const severe = batch.some((item) => item.severity === 'severe');
    const timer = window.setTimeout(dismissBatch, severe ? 14000 : 9000);
    return () => window.clearTimeout(timer);
  }, [batch, panelOpen, dismissBatch]);

  if (location.pathname.startsWith('/login')) return null;

  const severe = batch.some((item) => item.severity === 'severe');
  const recoveryOnly = batch.length > 0 && batch.every((item) => item.severity === 'recovery');
  const tone = recoveryOnly ? 'recovery' : severe ? 'severe' : 'general';
  const title = recoveryOnly ? '恢复通知' : severe ? '严重异常告警' : '异常提醒';

  const handleSound = () => {
    if (!soundEnabled) unlockAlertSound();
    toggleSound();
  };

  const openItem = (item: GlobalAlertItem) => {
    markRead(item.id);
    dismissBatch();
    navigate(item.to);
  };

  const locateItem = (item: GlobalAlertItem) => {
    markRead(item.id);
    dismissBatch();
    if (item.reachId) useCameraStore.getState().flyTo(item.reachId as View3d);
    navigate('/monitor');
  };

  return (
    <>
      {batch.length > 0 && !panelOpen ? (
        <section className={`f9-alert-card f9-alert-card--${tone}`} role="alert" aria-live="assertive">
          <header className="f9-alert-card__head">
            <span className="f9-alert-card__icon"><Icon name="assessment" size={16} /></span>
            <div className="f9-alert-card__title">
              <b>{title}</b>
              <span>{batch.length} 起 · 实时监测链路</span>
            </div>
            <div className="f9-alert-card__actions">
              <button type="button" onClick={() => togglePanel(true)} title="查看告警历史">
                <Icon name="history" size={13} />历史
              </button>
              <button type="button" onClick={handleSound} title="开启或关闭告警声音">
                {soundEnabled ? '声音：开' : '声音：关'}
              </button>
              <button type="button" className="f9-alert-close" onClick={dismissBatch} aria-label="关闭告警">
                <Icon name="close" size={13} />
              </button>
            </div>
          </header>
          <div className="f9-alert-card__rows">
            {batch.map((item) => (
              <AlertRow key={item.id} item={item} onView={openItem} onLocate={locateItem} />
            ))}
          </div>
        </section>
      ) : null}

      {panelOpen ? (
        <>
          <div className="f9-alert-backdrop" onClick={() => togglePanel(false)} aria-hidden="true" />
          <aside className="f9-alert-history" role="dialog" aria-label="异常告警历史">
            <header className="f9-alert-history__head">
              <div>
                <b>异常告警历史</b>
                <span>{unread} 条未读 · {items.length} 条记录</span>
              </div>
              <div className="f9-alert-history__actions">
                <button type="button" onClick={handleSound}>{soundEnabled ? '声音：开' : '声音：关'}</button>
                <button type="button" onClick={markAllRead} disabled={unread === 0}>全部已读</button>
                <button type="button" onClick={clearHistory} disabled={items.length === 0}>清空</button>
                <button type="button" className="f9-alert-close" onClick={() => togglePanel(false)} aria-label="关闭历史">
                  <Icon name="close" size={13} />
                </button>
              </div>
            </header>
            <div className="f9-alert-history__list">
              {items.length === 0 ? (
                <p className="f9-alert-empty">暂无告警通知。新异常、升级或恢复会出现在这里。</p>
              ) : items.map((item) => (
                <article key={item.id} className={`f9-alert-history-item${item.read ? '' : ' is-unread'}`}>
                  <div className="f9-alert-history-item__head">
                    <span className={`f9-alert-dot f9-alert-dot--${item.severity}`} />
                    <b>{item.station} · {item.metricLabel}</b>
                    <em>{timeText(item.at)}</em>
                  </div>
                  <p>{item.title}</p>
                  <div className="f9-alert-history-item__meta">
                    <span>{item.eventId}</span>
                    <span>{item.statusLabel}</span>
                    <span>{item.value} · 阈值 {item.threshold}</span>
                  </div>
                  <div className="f9-alert-history-item__actions">
                    <button type="button" onClick={() => openItem(item)}>查看详情</button>
                    {item.reachId ? <button type="button" onClick={() => locateItem(item)}>定位</button> : null}
                  </div>
                </article>
              ))}
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}
