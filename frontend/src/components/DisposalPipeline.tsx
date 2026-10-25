import { DISPOSAL_STEPS } from '@/lib/disposalStage';

/** 异常处置流程条：stage 为当前阶段索引（0–5），由真实事件/任务状态推导。 */
export function DisposalPipeline({ stage }: { stage: number }) {
  return (
    <div className="tw-pipeline-sticky">
      <div className="tw-pipeline-flow">
        {DISPOSAL_STEPS.map((label, i) => (
          <div key={label} className="tw-pipeline-step-wrap">
            <div
              className={`tw-pipeline-dot${i < stage ? ' is-done' : ''}${i === stage ? ' is-current' : ''}`}
            />
            <span
              className={`tw-pipeline-txt${i < stage ? ' is-done' : ''}${i === stage ? ' is-current' : ''}`}
            >
              {label}
            </span>
            {i < DISPOSAL_STEPS.length - 1 && (
              <span className={`tw-pipeline-link${i < stage ? ' is-done' : ''}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DisposalPipeline;
