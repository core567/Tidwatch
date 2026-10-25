import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useStreamState } from '@/store/stream';
import { Tag } from '@/components/ui';
import { OnlineBadge } from '@/components/StatusBits';
import { ScenarioConsole } from '@/components/ScenarioConsole';
import RiverScene from '@/features/threeD/RiverScene';
import NodeDetailPanel from '@/features/threeD/NodeDetailPanel';
import WebGLErrorBoundary from '@/features/threeD/WebGLErrorBoundary';
import { useCameraStore } from '@/features/threeD/cameraStore';
import type { ActiveEvent, Reach } from '@/types/contract';
import './monitor.css';

/**
 * 01 智慧监测总览（3D 数字孪生为主体）。
 * 画布占满主内容区；节点/图例/场景控制为浮层，详情面板覆盖在画布上，不挤压 3D。
 */
export default function MonitorPage() {
  const streamState = useStreamState();
  const { view, flyTo } = useCameraStore();
  const [showConsole, setShowConsole] = useState(false);

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
  const scenarioQ = useQuery({
    queryKey: ['scenario-status'],
    queryFn: api.scenarioStatus,
    refetchInterval: 3000,
  });

  const reaches = reachesQ.data ?? [];
  const ordered = useMemo(
    () => reaches.slice().sort((a, b) => a.topoOrder - b.topoOrder),
    [reaches],
  );
  const abnormalReachIds = useMemo(() => {
    const items = (eventsQ.data?.items ?? []) as ActiveEvent[];
    return [...new Set(items.flatMap((e) => e.scopeReachIds))];
  }, [eventsQ.data]);

  const selectedReach: Reach | undefined =
    view !== 'overview' ? reaches.find((r) => r.reachId === view) : undefined;
  const scenarioRunning = scenarioQ.data?.running ?? false;

  return (
    <div className="tw-monitor">
      <WebGLErrorBoundary>
        {reachesQ.isLoading ? (
          <div className="state-box">3D 场景加载中…</div>
        ) : (
          <RiverScene
            reaches={reaches}
            abnormalReachIds={abnormalReachIds}
            onSelectNode={(id) => flyTo(id as 'reach-a' | 'reach-b' | 'reach-c')}
          />
        )}
      </WebGLErrorBoundary>

      {/* 顶部状态条 */}
      <div className="tw-monitor-topbar">
        <div className="tw-monitor-title">
          <span>3D 河流数字空间</span>
          <span className="tw-tiny">示意河谷 · 非导航地图，地形/水面为视觉示意</span>
        </div>
        <div className="tw-row" style={{ gap: 6 }}>
          <Tag tone={streamState === 'open' ? 'ok' : streamState === 'connecting' ? 'watch' : 'muted'}>
            实时{streamState === 'open' ? '已连接' : streamState === 'connecting' ? '连接中' : '未连接'}
          </Tag>
          {abnormalReachIds.length > 0 && <Tag tone="danger">{abnormalReachIds.length} 断面异常</Tag>}
          {scenarioRunning && <Tag tone="watch">场景 {scenarioQ.data?.scenario} 运行中</Tag>}
        </div>
      </div>

      {/* 左上：节点导航 + 图例 */}
      <div className="tw-monitor-left">
        <div className="tw-monitor-card">
          <div className="tw-tiny" style={{ marginBottom: 6 }}>逻辑断面（上游 → 下游）</div>
          {ordered.map((r) => {
            const abnormal = abnormalReachIds.includes(r.reachId);
            const active = view === r.reachId;
            return (
              <button
                key={r.reachId}
                className={`tw-monitor-node${active ? ' is-active' : ''}`}
                onClick={() => flyTo(r.reachId as 'reach-a' | 'reach-b' | 'reach-c')}
              >
                <span className="tw-monitor-node-name">{r.name}</span>
                {abnormal ? <Tag tone="danger">异常</Tag> : <OnlineBadge status={r.onlineStatus} />}
              </button>
            );
          })}
          {view !== 'overview' && (
            <button className="tw-monitor-overview-btn" onClick={() => flyTo('overview')}>
              ← 返回全景
            </button>
          )}
        </div>

        <div className="tw-monitor-card tw-monitor-legend">
          <div className="tw-tiny" style={{ marginBottom: 6 }}>图例</div>
          <span><i className="dot" style={{ background: '#12a594' }} />在线</span>
          <span><i className="dot" style={{ background: '#e8902a' }} />数据陈旧</span>
          <span><i className="dot" style={{ background: '#94a3b8' }} />离线</span>
          <span><i className="dot" style={{ background: '#d84c4c' }} />异常脉冲</span>
        </div>
      </div>

      {/* 场景控制台入口 */}
      <div className="tw-monitor-console">
        <button className="tw-monitor-console-btn" onClick={() => setShowConsole(true)}>
          场景控制台 S1–S5 {scenarioRunning ? '· 运行中' : ''}
        </button>
      </div>

      {/* 右下提示 */}
      <div className="tw-monitor-hint">点击节点飞行 · 拖拽旋转 · 滚轮缩放 · 流向为示意动画</div>

      {/* 节点详情（覆盖层，不挤压场景） */}
      {selectedReach && <NodeDetailPanel reach={selectedReach} onClose={() => flyTo('overview')} />}

      {/* 场景控制台抽屉 */}
      {showConsole && (
        <div className="tw-overlay tw-overlay-right" onMouseDown={(e) => e.target === e.currentTarget && setShowConsole(false)}>
          <aside className="tw-drawer" style={{ width: 560 }} role="dialog" aria-modal="true">
            <div className="tw-drawer-head">
              <div>
                <h3 className="tw-modal-title">场景控制台</h3>
                <p className="tw-modal-subtitle">经真实 MQTT 链路触发，异常将实时联动节点高亮</p>
              </div>
              <button className="tw-icon-btn" onClick={() => setShowConsole(false)} aria-label="关闭">×</button>
            </div>
            <div className="tw-drawer-body">
              <ScenarioConsole />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
