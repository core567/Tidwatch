import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import { CaseWorkbenchV2 } from './CaseWorkbenchV2';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/ui.css';
import '../../styles/assessment.css';

/** 深链页：与 /events 共用同一套原版研判工作台视觉与真实操作。 */
export default function WorkbenchV2Page() {
  const { eventId = '' } = useParams();
  const navigate = useNavigate();

  return (
    <div className="v2-scope">
      <div className="v2-page v2-workbench-page">
        <div className="v2-page-intro">
          <div className="v2-page-intro__main">
            <div className="v2-eyebrow v2-eyebrow--bare v2-intro-line">
              <span>CASE WORKBENCH · {eventId}</span>
            </div>
            <h1 className="v2-page-title">异常研判与处置<em>WORKBENCH</em></h1>
            <p className="v2-page-situation">完整研判工作台 · 真实事件、证据、假设、时间线与处置操作。</p>
          </div>
          <div className="v2-row" style={{ gap: 8 }}>
            <button type="button" className="v2-btn v2-btn--ghost" onClick={() => navigate('/events')}>
              <Icon name="arrow-right" size={12} style={{ transform: 'rotate(180deg)' }} />事件中心
            </button>
          </div>
        </div>
        <CaseWorkbenchV2 eventId={eventId} />
      </div>
    </div>
  );
}
