export function AnalysisSkeleton() {
  return (
    <div className="v2-page" aria-busy="true" aria-live="polite">
      <div className="v2-page-intro">
        <div className="v2-page-intro__main" style={{ width: '100%' }}>
          <div className="v2-skeleton v2-skeleton-line" style={{ width: 300 }} />
          <div
            className="v2-skeleton v2-skeleton-line"
            style={{ width: 280, height: 32, marginTop: 14 }}
          />
          <div
            className="v2-skeleton v2-skeleton-line"
            style={{ width: 560, maxWidth: '100%', marginTop: 14 }}
          />
        </div>
        <div className="v2-readouts">
          {[0, 1, 2].map((i) => (
            <div className="v2-readout" key={i}>
              <div className="v2-skeleton v2-skeleton-line" style={{ width: 70 }} />
              <div className="v2-skeleton v2-skeleton-line" style={{ width: 58, height: 26 }} />
              <div className="v2-skeleton v2-skeleton-line" style={{ width: 86 }} />
            </div>
          ))}
        </div>
      </div>

      <div className="v2-grid">
        <div className="v2-col-3">
          <div className="v2-panel v2-skeleton-panel" style={{ minHeight: 520 }}>
            <div className="v2-skeleton v2-skeleton-block" style={{ height: 440 }} />
          </div>
        </div>
        <div className="v2-col-9">
          <div className="v2-panel v2-skeleton-panel" style={{ minHeight: 520 }}>
            <div className="v2-skeleton v2-skeleton-block" style={{ height: 440 }} />
          </div>
        </div>
        <div className="v2-col-5">
          <div className="v2-panel v2-skeleton-panel" style={{ minHeight: 340 }}>
            <div className="v2-skeleton v2-skeleton-block" style={{ height: 260 }} />
          </div>
        </div>
        <div className="v2-col-4">
          <div className="v2-panel v2-skeleton-panel" style={{ minHeight: 340 }}>
            <div className="v2-skeleton v2-skeleton-block" style={{ height: 260 }} />
          </div>
        </div>
        <div className="v2-col-3">
          <div className="v2-panel v2-skeleton-panel" style={{ minHeight: 340 }}>
            <div className="v2-skeleton v2-skeleton-block" style={{ height: 260 }} />
          </div>
        </div>
      </div>
    </div>
  );
}
