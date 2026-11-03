import type { RiskPoint } from './reviewModel';

export function RiskRail({ points }: { points: RiskPoint[] }) {
  if (points.length === 0) {
    return <p className="v2-report-empty">暂无状态迁移记录</p>;
  }
  return (
    <div className="v2-risk-rail">
      <span className="v2-risk-rail__track" aria-hidden="true" />
      {points.map((point, index) => (
        <span className={`v2-risk-rail__point v2-risk-rail__point--${point.risk}`} key={`${point.time}-${index}`}>
          <i className="v2-risk-rail__dot" />
          <em className="v2-mono">{point.time}</em>
          <b>{point.label}</b>
        </span>
      ))}
    </div>
  );
}
