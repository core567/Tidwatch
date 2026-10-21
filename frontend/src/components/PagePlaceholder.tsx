interface PlaceholderProps {
  code: string;
  title: string;
  milestone: 'M1' | 'M2' | 'M3';
  description: string;
}

/**
 * M0 页面占位：明确标注计划里程碑，避免把未实现功能误读为已完成。
 */
export default function PagePlaceholder({ code, title, milestone, description }: PlaceholderProps) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: 'var(--tw-primary-800)' }}>
          {code} {title}
        </h2>
        <span className="badge badge-watch">计划于 {milestone} 实现</span>
      </div>
      <div className="card">
        <div className="state-box" style={{ padding: '56px 24px' }}>
          <div style={{ fontSize: 15, color: 'var(--tw-text)' }}>{description}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            当前为 M0 工程骨架阶段，业务接口就绪后在此页面实现。
          </div>
        </div>
      </div>
    </div>
  );
}
