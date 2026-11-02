import type { PipelineStage } from '../../types';
import { Panel } from '../../components/ui/Panel';
import { Icon } from '../../components/ui/Icon';

export function PipelinePanel({ stages }: { stages: PipelineStage[] }) {
  const totalFlow = stages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <Panel
      code="05"
      title="事件处置流水线"
      en="DISPOSAL PIPELINE"
      className="v2-pipeline-panel"
      footer={
        <>
          <span className="v2-pipeline-panel__foot">
            <span className="v2-status-dot" />
            当前各阶段合计 <b className="v2-mono">{totalFlow}</b> 项
          </span>
          <span
            className="v2-pipeline-panel__foot v2-pipeline-panel__foot--right"
            title="平均响应时长暂无统计口径"
          >
            平均响应 <b className="v2-mono">—</b>
            <Icon name="arrow-right" size={12} />
          </span>
        </>
      }
    >
      <div className="v2-pipeline">
        <span className="v2-pipeline__beam" aria-hidden="true" />
        <div className="v2-pipeline__legend">
          <span />
          <span>阶段 / 当前提示</span>
          <span className="v2-mono">当前数量</span>
        </div>
        {stages.map((stage, i) => (
          <div
            key={stage.key}
            className={`v2-stage ${stage.active ? 'v2-is-active' : ''}`.trim()}
          >
            <div className="v2-stage__rail">
              <span className="v2-stage__dot" />
              {i < stages.length - 1 && <span className="v2-stage__line" />}
            </div>
            <div className="v2-stage__main">
              <span className="v2-stage__label">
                {stage.label}
                <em>{stage.en}</em>
                {stage.active && (
                  <span className="v2-stage__live">
                    <i />
                    当前活跃
                  </span>
                )}
              </span>
              <span className="v2-stage__hint">{stage.hint}</span>
            </div>
            <span
              className="v2-stage__count v2-mono"
              title={`当前数量 ${stage.count}`}
            >
              {String(stage.count).padStart(2, '0')}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
