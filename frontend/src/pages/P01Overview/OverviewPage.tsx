import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';

/**
 * P01 综合监测总览（M0 骨架）。
 * M1 接入：断面卡（在线状态/最新指标/新鲜度）、活动事件流、模拟模式标识。
 */
export default function OverviewPage() {
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: api.health });

  return (
    <div>
      <h2 style={{ margin: '0 0 16px', color: 'var(--tw-primary-800)' }}>P01 综合监测总览</h2>
      <div className="card">
        <div style={{ fontSize: 15, marginBottom: 8 }}>工程骨架已就绪</div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.9 }}>
          后端版本：{health?.version ?? '—'}　数据库：{health?.database ?? '—'}
          <br />
          M1 将在此页实现：三断面状态卡、在线率、数据新鲜度、活动事件流、趋势缩略图。
          <br />
          所有连续观测数据将标注
          <span className="source-tag source-tag-simulated" style={{ margin: '0 4px' }}>模拟数据</span>
          ；官方月报为
          <span className="source-tag source-tag-official" style={{ margin: '0 4px' }}>官方公开</span>
          月度类别背景，不展示为连续曲线。
        </div>
      </div>
    </div>
  );
}
