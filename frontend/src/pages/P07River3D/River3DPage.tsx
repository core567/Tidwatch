import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useAuthStore } from '@/store/auth';
import { useRealtimeStream } from '@/services/useRealtimeStream';
import { OnlineBadge } from '@/components/StatusBits';
import RiverScene from '@/features/threeD/RiverScene';
import NodeDetailPanel from '@/features/threeD/NodeDetailPanel';
import { useCameraStore } from '@/features/threeD/cameraStore';
import type { ActiveEvent } from '@/types/contract';

/**
 * P07 3D 河流数字空间。
 * M1：河廊全景 + A/B/C + 旋转/缩放/平移 + 实时状态。
 * M2：点击节点/列表 → 同一持续场景内相机平滑飞行 → 详情面板；异常节点红色脉冲。
 */
export default function River3DPage() {
  const navigate = useNavigate();
  const authenticated = useAuthStore((s) => s.authenticated);
  const streamState = useRealtimeStream(authenticated);
  const { view, flyTo } = useCameraStore();

  const reachesQ = useQuery({
    queryKey: ['reaches'],
    queryFn: api.reaches,
    enabled: authenticated,
    refetchInterval: 15000,
  });
  // 活动事件用于异常节点高亮
  const eventsQ = useQuery({
    queryKey: ['events', 'ACTIVE'],
    queryFn: () => api.events({ status: 'ACTIVE', pageSize: 100 }),
    enabled: authenticated,
    refetchInterval: 8000,
  });

  const reaches = reachesQ.data ?? [];
  const abnormalReachIds = useMemo(() => {
    const items = (eventsQ.data?.items ?? []) as ActiveEvent[];
    return [...new Set(items.flatMap((e) => e.scopeReachIds))];
  }, [eventsQ.data]);

  const selectedReach = view !== 'overview' ? reaches.find((r) => r.reachId === view) : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 92px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, color: 'var(--tw-primary-800)', fontSize: 18 }}>P07 3D 河流数字空间</h2>
        <span className="badge badge-offline">示意拓扑 · 非导航地图</span>
        <span className="source-tag source-tag-simulated">模拟数据</span>
        <span className={`badge ${streamState === 'open' ? 'badge-ok' : 'badge-offline'}`}>
          实时：{streamState === 'open' ? '已连接' : '未连接'}
        </span>
        {view !== 'overview' && (
          <button className="btn-primary" style={{ padding: '4px 12px', fontSize: 12 }} onClick={() => flyTo('overview')}>
            ← 返回全景
          </button>
        )}
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
          点击节点飞行 · 拖拽旋转 · 滚轮缩放 · 右键平移
        </span>
      </div>

      <div className="card" style={{ flex: 1, padding: 0, position: 'relative', overflow: 'hidden' }}>
        {!authenticated ? (
          <div className="state-box">
            <div>请先登录查看 3D 实时场景</div>
            <button className="btn-primary" onClick={() => navigate('/login')}>前往登录</button>
          </div>
        ) : reachesQ.isLoading ? (
          <div className="state-box">3D 场景加载中…</div>
        ) : (
          <>
            <RiverScene
              reaches={reaches}
              abnormalReachIds={abnormalReachIds}
              onSelectNode={(id) => flyTo(id as 'reach-a' | 'reach-b' | 'reach-c')}
            />

            {/* 左侧节点列表：与点击节点共用 flyTo 动作 */}
            <div
              style={{
                position: 'absolute',
                left: 14,
                top: 14,
                background: 'rgba(255,255,255,.92)',
                borderRadius: 8,
                padding: '10px 12px',
                boxShadow: 'var(--tw-shadow)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
              }}
            >
              {reaches
                .slice()
                .sort((a, b) => a.topoOrder - b.topoOrder)
                .map((r) => {
                  const abnormal = abnormalReachIds.includes(r.reachId);
                  const active = view === r.reachId;
                  return (
                    <button
                      key={r.reachId}
                      onClick={() => flyTo(r.reachId as 'reach-a' | 'reach-b' | 'reach-c')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        border: active ? '1px solid var(--tw-accent)' : '1px solid transparent',
                        borderRadius: 6,
                        padding: '3px 6px',
                        background: active ? 'var(--tw-accent-soft)' : 'none',
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ minWidth: 52, textAlign: 'left' }}>{r.name}</span>
                      {abnormal ? <span className="badge badge-danger">异常</span> : <OnlineBadge status={r.onlineStatus} />}
                    </button>
                  );
                })}
            </div>

            {/* 节点详情面板（M2） */}
            {selectedReach && (
              <NodeDetailPanel reach={selectedReach} onClose={() => flyTo('overview')} />
            )}

            <div
              style={{
                position: 'absolute',
                right: 14,
                bottom: 12,
                fontSize: 11,
                color: 'var(--tw-text-secondary)',
                background: 'rgba(255,255,255,.8)',
                padding: '3px 8px',
                borderRadius: 4,
              }}
            >
              流向箭头为示意动画，非真实水动力数据
            </div>
          </>
        )}
      </div>
    </div>
  );
}
