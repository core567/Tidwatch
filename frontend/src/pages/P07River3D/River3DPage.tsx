/**
 * P07 河道地图与 3D 数字空间。
 * M1：河流三维轮廓 + A/B/C 三节点 + 全景 + 旋转/缩放/平移。
 * M2：镜头飞行、详情面板、异常联动。
 * 当前 M0 仅占位，避免在无数据链路时提前堆视觉。
 */
export default function River3DPage() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, color: 'var(--tw-primary-800)' }}>P07 3D 河流数字空间</h2>
        <span className="badge badge-watch">3D 全景计划于 M1 实现</span>
      </div>
      <div className="card">
        <div className="state-box" style={{ padding: '64px 24px' }}>
          <div style={{ fontSize: 15 }}>单一场景：河流全景 ↔ 镜头平滑飞行至 A/B/C 局部</div>
          <div className="muted" style={{ fontSize: 13, maxWidth: 560, textAlign: 'center', lineHeight: 1.9 }}>
            技术选型 React Three Fiber + Three.js（已在 M0 安装依赖）。
            真实站点坐标核实前使用逻辑节点 A/B/C 并标注「示意拓扑」；
            流向粒子仅为示意动画，不代表真实水动力数据。
          </div>
        </div>
      </div>
    </div>
  );
}
