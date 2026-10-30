import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useStreamState } from '@/store/stream';
import { Button, PageHeader, Tag } from '@/components/ui';
import { OnlineBadge } from '@/components/StatusBits';
import RiverScene from '@/features/threeD/RiverScene';
import NodeDetailPanel from '@/features/threeD/NodeDetailPanel';
import { useCameraStore } from '@/features/threeD/cameraStore';
import type { ActiveEvent } from '@/types/contract';

/**
 * P07 3D 河流数字空间：示意河谷 + A/B/C 节点 + 相机飞行 + 异常脉冲。
 * 节点面板聚合官方实时水质、模拟趋势与关联事件，并可跳转 P02/P04。
 */
export default function River3DPage() {
  const streamState = useStreamState();
  const { view, flyTo } = useCameraStore();

  const reachesQ = useQuery({
    queryKey: ['reaches'],
    queryFn: api.reaches,
    refetchInterval: 15000,
  });
  const eventsQ = useQuery({
    queryKey: ['events', 'ACTIVE'],
    queryFn: () => api.events({ status: 'ACTIVE', pageSize: 100 }),
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
      <PageHeader
        code="P07"
        title="3D 河流数字空间"
        badges={
          <>
            <Tag tone="outline">示意拓扑 · 非导航地图</Tag>
            <Tag tone={streamState === 'open' ? 'ok' : 'muted'}>
              实时 {streamState === 'open' ? '已连接' : '未连接'}
            </Tag>
            {abnormalReachIds.length > 0 && (
              <Tag tone="danger">{abnormalReachIds.length} 个断面存在活动事件</Tag>
            )}
          </>
        }
        description="河谷地形与水面为视觉示意（确定性噪声），不代表真实高程或水动力；节点异常高亮来自 MQTT 模拟事件。"
        actions={
          <>
            {view !== 'overview' && (
              <Button variant="ghost" onClick={() => flyTo('overview')}>
                ← 返回全景
              </Button>
            )}
            <span className="tw-tiny">点击节点飞行 · 拖拽旋转 · 滚轮缩放</span>
          </>
        }
      />

      <div className="card" style={{ flex: 1, padding: 0, position: 'relative', overflow: 'hidden' }}>
        {reachesQ.isLoading ? (
          <div className="state-box">3D 场景加载中…</div>
        ) : (
          <>
            {/* V2 RiverScene 点击时内部已 flyTo，回调只做选择同步，避免重复飞行。 */}
            <RiverScene
              reaches={reaches}
              abnormalReachIds={abnormalReachIds}
              onSelectNode={() => {}}
            />

            {/* 左侧节点列表：与点击节点共用 flyTo 动作 */}
            <div
              style={{
                position: 'absolute',
                left: 14,
                top: 14,
                background: 'rgba(255,255,255,.94)',
                borderRadius: 8,
                padding: '10px 12px',
                boxShadow: 'var(--tw-shadow)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                fontSize: 13,
              }}
            >
              <div className="tw-tiny" style={{ marginBottom: 2 }}>
                逻辑断面（上游 → 下游）
              </div>
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
                      {abnormal ? <Tag tone="danger">异常</Tag> : <OnlineBadge status={r.onlineStatus} />}
                    </button>
                  );
                })}
            </div>

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
                background: 'rgba(255,255,255,.85)',
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
