import type { AssessmentEvent } from './assessmentTypes';
import type { Station } from '../../types';
import { Badge } from '../../components/ui/Badge';
import { Icon } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';
import { PanelState } from '../../components/ui/PanelState';
import { RISK_CODE, RISK_LABEL, STATUS_KEY } from './meta';

interface EventQueueProps {
  events: AssessmentEvent[];
  total: number;
  stations: Station[];
  selectedId?: string;
  onSelect: (id: string) => void;
}

export function EventQueue({
  events,
  total,
  stations,
  selectedId,
  onSelect,
}: EventQueueProps) {
  return (
    <Panel
      code="01"
      title="事件队列"
      en="EVENT QUEUE"
      className="v2-queue-panel"
      bodyClassName="v2-queue-panel__body"
      actions={<Badge>显示 {events.length} / {total}</Badge>}
      footer={
        <span className="v2-queue-panel__foot">
          <span className="v2-status-dot v2-status-dot--warn" style={{ width: 5, height: 5 }} />
          按风险与状态排序 · 数据来自实时监测链路
        </span>
      }
    >
      {events.length === 0 ? (
        <PanelState
          variant="empty"
          title="没有匹配的事件"
          desc="请调整状态或风险筛选条件后重试。"
        />
      ) : (
        <div className="v2-queue-list">
          {events.map((event) => {
            const station = stations.find((s) => s.id === event.stationId);
            const isSelected = selectedId === event.id;
            return (
              <button
                key={event.id}
                type="button"
                className={`v2-queue-card v2-queue-card--${event.risk} ${
                  isSelected ? 'v2-is-selected' : ''
                }`.trim()}
                onClick={() => onSelect(event.id)}
                aria-pressed={isSelected}
              >
                <span className="v2-queue-card__bar" />
                <span className="v2-queue-card__top">
                  <span className={`v2-queue-card__risk v2-queue-card__risk--${event.risk}`}>
                    {RISK_CODE[event.risk]} · {RISK_LABEL[event.risk]}
                  </span>
                  <span className="v2-queue-card__id v2-mono">{event.id}</span>
                  <span className="v2-queue-card__time v2-mono">
                    {event.occurredAt.slice(11, 19)}
                  </span>
                </span>
                <span className="v2-queue-card__title">{event.title}</span>
                <span className="v2-queue-card__meta">
                  <span>{station?.name.replace(' 断面', '')}</span>
                  <i />
                  <span className={`v2-queue-card__status v2-queue-card__status--${STATUS_KEY[event.status]}`}>
                    {event.status}
                  </span>
                  <span className="v2-queue-card__elapsed">{event.elapsed}</span>
                </span>
                <span className="v2-queue-card__foot">
                  <span className="v2-queue-card__reading v2-mono">
                    {event.reading.label}
                    <b>
                      {event.reading.value !== '—' && event.reading.delta?.startsWith('升高') ? '↑' : event.reading.delta?.startsWith('下降') ? '↓' : ''}
                      {event.reading.value}
                    </b>
                    <em>{event.reading.unit}</em>
                  </span>
                  <span className="v2-queue-card__evidence">
                    {event.evidence.length} 项证据
                  </span>
                  <Icon name="chevron-right" size={13} className="v2-queue-card__chevron" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
