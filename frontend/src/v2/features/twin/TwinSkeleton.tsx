export function TwinSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <div className="twin-head">
        <div className="twin-head__main" style={{ width: '100%' }}>
          <div className="skeleton skeleton-line" style={{ width: 300 }} />
          <div
            className="skeleton skeleton-line"
            style={{ width: 320, height: 30, marginTop: 12 }}
          />
        </div>
      </div>
      <div className="panel skeleton-panel" style={{ height: 640 }}>
        <div className="skeleton skeleton-block" style={{ height: 600 }} />
      </div>
    </div>
  );
}
