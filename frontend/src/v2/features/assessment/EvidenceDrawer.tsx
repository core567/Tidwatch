import type { AssessmentEvent } from './assessmentTypes';
import { Drawer } from '../../components/ui/Drawer';
import { Icon } from '../../components/ui/Icon';
import { Sparkline } from '../../components/ui/Sparkline';
import { EVIDENCE_ICON, EVIDENCE_LABEL, RISK_CODE, RISK_LABEL } from './meta';

interface EvidenceDrawerProps {
  event: AssessmentEvent | null;
  open: boolean;
  onClose: () => void;
}

export function EvidenceDrawer({ event, open, onClose }: EvidenceDrawerProps) {
  if (!event) return null;

  return (
    <Drawer
      open={open}
      title="证据档案"
      subtitle={`${event.id} · ${event.title}`}
      onClose={onClose}
    >
      <div className="v2-drawer-summary">
        <div>
          <span>风险等级</span>
          <b>
            {RISK_CODE[event.risk]} · {RISK_LABEL[event.risk]}
          </b>
        </div>
        <div>
          <span>证据数量</span>
          <b>{String(event.evidence.length).padStart(2, '0')} 项</b>
        </div>
        <div>
          <span>发生时间</span>
          <b className="v2-mono">{event.occurredAt}</b>
        </div>
      </div>

      <div className="v2-drawer-evidence-list">
        {event.evidence.map((item) => (
          <article className="v2-drawer-evidence" key={item.id}>
            <header className="v2-drawer-evidence__head">
              <span className={`v2-drawer-evidence__type v2-drawer-evidence__type--${item.type}`}>
                <Icon name={EVIDENCE_ICON[item.type]} size={15} />
                {EVIDENCE_LABEL[item.type]}
              </span>
              <span className="v2-mono">{item.time}</span>
            </header>
            <h3>{item.title}</h3>
            <p>{item.desc}</p>
            {item.spark && (
              <div className="v2-drawer-evidence__spark">
                <Sparkline
                  values={item.spark}
                  width={300}
                  height={52}
                  tone={event.risk === 'high' ? 'alert' : 'watch'}
                />
                <span className="v2-mono">最近 8 个采样周期</span>
              </div>
            )}
            <footer className="v2-drawer-evidence__foot">
              <span className="v2-mono">记录编号 {item.id}</span>
              {item.value && <b className="v2-mono">{item.value}</b>}
            </footer>
          </article>
        ))}
      </div>

      <p className="v2-drawer-note">
        以上证据由监测引擎自动归集，用于展示证据链的组织方式，均为演示数据。
      </p>
    </Drawer>
  );
}
