import { Link } from 'react-router-dom';
import type { AssessmentEvent, AssessmentStatus } from './assessmentTypes';
import type { Station } from '../../types';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Icon } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';
import { Sparkline } from '../../components/ui/Sparkline';
import {
  CASE_STAGES,
  EVIDENCE_ICON,
  RISK_CODE,
  RISK_LABEL,
  STAGE_BY_STATUS,
  STATUS_KEY,
} from './meta';

interface CaseWorkbenchProps {
  event: AssessmentEvent;
  stations: Station[];
  onOpenEvidence: () => void;
  onStatusChange: (next: AssessmentStatus) => void;
  onSuggestion: (label: string) => void;
}

const riskTone: Record<AssessmentEvent['risk'], BadgeTone> = {
  high: 'high',
  medium: 'mid',
  low: 'default',
};

export function CaseWorkbench({
  event,
  stations,
  onOpenEvidence,
  onStatusChange,
  onSuggestion,
}: CaseWorkbenchProps) {
  const station = stations.find((s) => s.id === event.stationId);
  const primaryHypothesis =
    event.hypotheses.find((h) => h.selected) ?? event.hypotheses[0];
  const alternatives = event.hypotheses.filter((h) => h !== primaryHypothesis);
  const currentStage = STAGE_BY_STATUS[event.status];

  const actions =
    event.status === '已闭环' ? (
      <Link to="/review" className="v2-btn v2-btn--primary">
        查看复盘报告
        <Icon name="arrow-right" size={13} className="v2-btn__arrow" />
      </Link>
    ) : event.status === '待复核' ? (
      <>
        <button type="button" className="v2-btn v2-btn--ghost" onClick={() => onStatusChange('处置中')}>
          退回整改
        </button>
        <button type="button" className="v2-btn v2-btn--primary" onClick={() => onStatusChange('已闭环')}>
          审核通过并闭环
          <Icon name="check" size={13} />
        </button>
      </>
    ) : event.status === '处置中' ? (
      <>
        <button type="button" className="v2-btn v2-btn--ghost" onClick={() => onSuggestion('转派任务')}>
          转派任务
        </button>
        <button type="button" className="v2-btn v2-btn--primary" onClick={() => onStatusChange('待复核')}>
          提交复核
          <Icon name="arrow-right" size={13} className="v2-btn__arrow" />
        </button>
      </>
    ) : (
      <>
        <button type="button" className="v2-btn v2-btn--ghost" onClick={() => onStatusChange('已闭环')}>
          标记误报
        </button>
        <button type="button" className="v2-btn v2-btn--primary" onClick={() => onStatusChange('处置中')}>
          确认研判并派发
          <Icon name="arrow-right" size={13} className="v2-btn__arrow" />
        </button>
      </>
    );

  return (
    <Panel
      code="02"
      title="事件研判工作台"
      en="CASE WORKBENCH"
      className="v2-case-panel"
      actions={
        <span className="v2-case-panel__count v2-mono">
          证据归档 {String(event.evidence.length).padStart(2, '0')}
        </span>
      }
      footer={
        <div className="v2-case-actions">
          <span className="v2-case-actions__state">
            <span
              className={`v2-status-dot v2-status-dot--${
                event.risk === 'high' ? 'danger' : event.risk === 'medium' ? 'warn' : 'idle'
              }`}
            />
            当前状态 · {event.status}
            <span className="v2-case-actions__elapsed">已持续 {event.elapsed}</span>
          </span>
          <div className="v2-case-actions__buttons">{actions}</div>
        </div>
      }
    >
      <div className="v2-case-head">
        <div className="v2-case-head__main">
          <div className="v2-case-head__meta">
            <span className="v2-case-head__id v2-mono">{event.id}</span>
            <Badge tone={riskTone[event.risk]}>
              {RISK_CODE[event.risk]} · {RISK_LABEL[event.risk]}
            </Badge>
            <span className={`v2-case-status v2-case-status--${STATUS_KEY[event.status]}`}>
              {event.status}
            </span>
            <span className="v2-case-head__divider" />
            <span className="v2-mono">{event.occurredAt}</span>
            <span className="v2-case-head__dot">·</span>
            <span>{station?.name.replace(' 断面', '')}断面</span>
            <span className="v2-case-head__dot">·</span>
            <span>{event.location}</span>
          </div>
          <h3 className="v2-case-title">{event.title}</h3>
          <p className="v2-case-summary">{event.summary}</p>
        </div>

        <div className={`v2-case-reading v2-case-reading--${event.reading.tone}`}>
          <span className="v2-case-reading__label">{event.reading.label}</span>
          <div className="v2-case-reading__value">
            <b className="v2-mono">{event.reading.value}</b>
            {event.reading.unit && <small>{event.reading.unit}</small>}
          </div>
          <span className="v2-case-reading__delta v2-mono">{event.reading.delta}</span>
          <span className="v2-case-reading__coords v2-mono">{event.coordinates}</span>
        </div>
      </div>

      <ol className="v2-case-stages" aria-label="事件处置阶段">
        {CASE_STAGES.map((label, index) => {
          const state =
            currentStage >= CASE_STAGES.length
              ? 'done'
              : index < currentStage
                ? 'done'
                : index === currentStage
                  ? 'active'
                  : 'todo';
          return (
            <li key={label} className={`v2-case-stage v2-case-stage--${state}`}>
              <span className="v2-case-stage__node">
                {state === 'done' ? (
                  <Icon name="check" size={10} />
                ) : (
                  String(index + 1).padStart(2, '0')
                )}
              </span>
              <span className="v2-case-stage__label">{label}</span>
              {index < CASE_STAGES.length - 1 && <span className="v2-case-stage__line" />}
            </li>
          );
        })}
      </ol>

      <div className="v2-case-body">
        <div className="v2-case-col">
          <section className="v2-case-section">
            <header className="v2-case-section__head">
              <h4>关键证据</h4>
              <span>EVIDENCE</span>
              <button type="button" className="v2-panel-link v2-case-section__link" onClick={onOpenEvidence}>
                查看全部 {event.evidence.length} 项
                <Icon name="arrow-right" size={12} />
              </button>
            </header>
            <div className="v2-evidence-list">
              {event.evidence.slice(0, 3).map((item) => (
                <div className="v2-evidence-item" key={item.id}>
                  <span className={`v2-evidence-item__type v2-evidence-item__type--${item.type}`}>
                    <Icon name={EVIDENCE_ICON[item.type]} size={15} />
                  </span>
                  <div className="v2-evidence-item__main">
                    <div className="v2-evidence-item__title">
                      {item.title}
                      <span className="v2-mono">{item.time}</span>
                    </div>
                    <p>{item.desc}</p>
                  </div>
                  <div className="v2-evidence-item__side">
                    {item.spark && (
                      <Sparkline
                        values={item.spark}
                        width={78}
                        height={22}
                        tone={event.risk === 'high' ? 'alert' : 'watch'}
                      />
                    )}
                    {item.value && <span className="v2-evidence-item__value v2-mono">{item.value}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="v2-case-section">
            <header className="v2-case-section__head">
              <h4>研判假设</h4>
              <span>HYPOTHESIS</span>
              <span className="v2-case-section__aside v2-mono">首选置信度 {primaryHypothesis.confidence}%</span>
            </header>
            <div className="v2-hypothesis-main">
              <div className="v2-hypothesis-main__head">
                <h5>{primaryHypothesis.title}</h5>
                <b className="v2-mono">{primaryHypothesis.confidence}%</b>
              </div>
              <div className="v2-confidence-bar">
                <i style={{ width: `${primaryHypothesis.confidence}%` }} />
              </div>
              <p>{primaryHypothesis.basis}</p>
            </div>
            {alternatives.length > 0 && (
              <div className="v2-hypothesis-alts">
                {alternatives.map((item) => (
                  <div className="v2-hypothesis-alt" key={item.title}>
                    <span className="v2-hypothesis-alt__title">{item.title}</span>
                    <span className="v2-hypothesis-alt__confidence v2-mono">{item.confidence}%</span>
                    <p>{item.basis}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="v2-case-section v2-case-section--last">
            <header className="v2-case-section__head">
              <h4>处置建议</h4>
              <span>NEXT ACTIONS</span>
            </header>
            <ol className="v2-suggestion-list">
              {event.suggestions.map((item) => (
                <li
                  className={`v2-suggestion v2-suggestion--${
                    item.priority === '高' ? 'high' : item.priority === '中' ? 'mid' : 'low'
                  }`}
                  key={item.title}
                >
                  <span className="v2-suggestion__priority">{item.priority}</span>
                  <div className="v2-suggestion__main">
                    <b>{item.title}</b>
                    <p>{item.desc}</p>
                  </div>
                  <button
                    type="button"
                    className="v2-suggestion__action"
                    onClick={() => onSuggestion(item.action)}
                  >
                    {item.action}
                    <Icon name="chevron-right" size={12} />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="v2-case-col v2-case-col--side">
          <section className="v2-case-section">
            <header className="v2-case-section__head">
              <h4>事件时间线</h4>
              <span>TIMELINE</span>
            </header>
            <ol className="v2-case-timeline">
              {event.timeline.map((step, index) => (
                <li
                  className={`v2-case-timeline__item v2-case-timeline__item--${step.state}`}
                  key={`${step.action}-${index}`}
                >
                  <span className="v2-case-timeline__dot" />
                  <div className="v2-case-timeline__main">
                    <div className="v2-case-timeline__meta">
                      <span className="v2-mono">{step.time}</span>
                      <em>{step.actor}</em>
                    </div>
                    <b>{step.action}</b>
                    {step.note && <p>{step.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="v2-case-section v2-case-section--last">
            <header className="v2-case-section__head">
              <h4>关联巡检任务</h4>
              <span>FIELD TASK</span>
            </header>
            {event.linkedTask ? (
              <Link to="/inspection" className="v2-linked-task">
                <span className="v2-linked-task__top">
                  <span className="v2-mono">{event.linkedTask.id}</span>
                  <span className="v2-linked-task__status">{event.linkedTask.status}</span>
                  <Icon name="arrow-up-right" size={13} className="v2-linked-task__arrow" />
                </span>
                <b>{event.linkedTask.title}</b>
                <span className="v2-linked-task__meta">
                  <span>执行人 {event.linkedTask.assignee}</span>
                  <span className="v2-mono">{event.linkedTask.time}</span>
                </span>
              </Link>
            ) : (
              <div className="v2-linked-task v2-linked-task--empty">
                <span className="v2-status-dot v2-status-dot--idle" />
                尚未关联巡检任务，确认研判后可派发
              </div>
            )}
          </section>

          <div className="v2-case-side-note">
            <span>证据由监测引擎自动归集</span>
            <span className="v2-mono">DEMO</span>
          </div>
        </div>
      </div>
    </Panel>
  );
}
