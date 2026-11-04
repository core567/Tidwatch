import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import RiverScene from '@/features/threeD/RiverScene';
import { useCameraStore, type View3d } from '@/features/threeD/cameraStore';
import { useSceneSettings } from '@/features/threeD/sceneSettings';
import { buildNodeVisualMap, NODE_VISUAL_LABELS, type NodeVisualState, type NodeVisualStatus } from '@/features/threeD/nodeVisual';
import { api } from '@/services/apiClient';
import { useDemoStore } from '../../demo/demoStore';
import { useDemoOverviewData } from '../../demo/useDemoOverviewData';
import { useOverviewData } from '../overview/OverviewV2Page';
import { STATION_MAP, stationIdOf } from '../overview/overviewAdapter';
import { Badge } from '../../components/ui/Badge';
import { PanelState } from '../../components/ui/PanelState';
import type { StationId, OverviewData } from '../../types';
import type { ActiveEvent } from '@/types/contract';
import { buildTwinData } from './twinAdapter';
import { TwinScene } from './TwinScene';
import { NodeLabelOverlay } from './NodeLabelOverlay';
import { TwinSceneBar } from './TwinSceneBar';
import { TwinStationHud } from './TwinStationHud';
import { TwinMetricHud } from './TwinMetricHud';
import { TwinSceneToolbar } from './TwinSceneToolbar';
import { TwinSkeleton } from './TwinSkeleton';
import type { TwinView } from './types';
import type { TwinMetric, TwinStation } from './twinTypes';
import type { TwinRiskInfo } from './types';
import '../../styles/twin.css';

/** WebGL 能力探测：不支持时使用 2D 示意图层（正常运行时 3D 为主场景） */
function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function aggregateMetrics(stations: TwinStation[]): TwinMetric[] {
  const ref = stations[0]?.metrics ?? [];
  return ref.map((metric, index) => {
    const items = stations.map((s) => s.metrics[index]).filter((m) => m && m.value !== null);
    const values = items.map((m) => m.value as number);
    const tone = items.some((m) => m.tone === 'alert')
      ? 'alert'
      : items.some((m) => m.tone === 'watch')
        ? 'watch'
        : 'good';
    return {
      ...metric,
      value: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      tone,
      spark: metric.spark.map((_, i) =>
        +(
          stations.reduce((sum, s) => sum + (s.metrics[index]?.spark[i] ?? 0), 0) / stations.length
        ).toFixed(2),
      ),
    };
  });
}

/**
 * F3 数字孪生页：原生 Three.js RiverScene 以 React 组件树方式挂载到
 * TwinScene 的 3D 槽位；相机与 cameraStore 双向同步；HUD 消费真实/演示聚合数据。
 */
export default function TwinV2Page() {
  const demoEnabled = useDemoStore((s) => s.enabled);
  const demo = useDemoOverviewData();
  const real = useOverviewData();
  const reachesQ = useQuery({ queryKey: ['reaches'], queryFn: api.reaches, refetchInterval: 15000 });
  const eventsQ = useQuery({
    queryKey: ['events', 'ACTIVE', 'twin'],
    queryFn: () => api.events({ status: 'ACTIVE', pageSize: 50 }),
    refetchInterval: 8000,
  });

  const [view, setView] = useState<TwinView>('overview');
  const [flowOn, setFlowOn] = useState(true);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(true);
  const mountRef = useRef<HTMLDivElement>(null);
  const webglOk = useMemo(supportsWebGL, []);

  const overview: OverviewData | null = demoEnabled ? demo.data : real.data;
  const data = overview ? buildTwinData(overview, demoEnabled) : null;

  // 聚焦节点时展开断面侧栏，返回全景时收起；不触发相机切换。
  useEffect(() => {
    setLeftOpen(view !== 'overview');
  }, [view]);

  // cameraStore → 本地 view：外部相机命令（AI 助手等）驱动 Twin 选中态
  const cameraView = useCameraStore((s) => s.view);
  useEffect(() => {
    setView(cameraView === 'overview' ? 'overview' : stationIdOf(cameraView));
  }, [cameraView]);

  // 流向示意开关 → 场景 settings（真实 3D 的示意流向，默认开启）
  useEffect(() => {
    useSceneSettings.getState().setDirections(flowOn);
  }, [flowOn]);

  // 本地选择 → 相机飞行（2D fallback 按钮 / HUD 列表 / 工具栏复位）
  const flyToView = (v: TwinView) => {
    useCameraStore.getState().flyTo(v === 'overview' ? 'overview' : (STATION_MAP[v] as View3d));
  };
  // 3D 场景内部节点点击：场景已完成 flyTo，这里只同步 Twin 选中态
  const handleNodeSelect = (reachId: string) => setView(stationIdOf(reachId));

  const reaches = reachesQ.data ?? [];

  const nodeVisuals = useMemo(() => {
    if (demoEnabled) {
      const map: Record<string, NodeVisualState> = {};
      for (const station of demo.data.stations) {
        const reachId = STATION_MAP[station.id];
        const alert = demo.data.alerts.find((item) => item.stationId === station.id);
        let tier: NodeVisualStatus =
          station.tone === 'alert' ? 'abnormal' : station.tone === 'watch' ? 'watch' : 'normal';
        if (alert?.status === '恢复中') tier = 'recovery';
        map[reachId] = {
          tier,
          offline: false,
          eventId: alert?.id,
          eventTitle: alert?.title,
          eventStatus: alert?.status,
        };
      }
      return map;
    }
    return buildNodeVisualMap(
      reachesQ.data ?? [],
      (eventsQ.data?.items ?? []) as ActiveEvent[],
    );
  }, [demoEnabled, demo.data, reachesQ.data, eventsQ.data]);

  const abnormalReachIds = useMemo(
    () => Object.entries(nodeVisuals)
      .filter(([, state]) => state.tier === 'abnormal')
      .map(([reachId]) => reachId),
    [nodeVisuals],
  );

  const nodeVisualStatuses = useMemo(
    () => Object.fromEntries(
      Object.entries(nodeVisuals).map(([reachId, state]) => [reachId, state.tier]),
    ) as Record<string, NodeVisualStatus>,
    [nodeVisuals],
  );

  const loading = !demoEnabled && real.loading && !data;
  if (loading) return <TwinSkeleton />;

  if (!data) {
    return (
      <div className="v2-scope">
        <div className="v2-page">
          <div className="v2-panel v2-state-page">
            <PanelState variant="error" title="数字孪生场景暂时不可用" desc={(real.error as Error | undefined)?.message ?? '无法加载断面信息，请稍后重试。'} />
          </div>
        </div>
      </div>
    );
  }

  const station = view === 'overview' ? undefined : data.stations.find((s) => s.id === view);
  const abnormalStations = data.stations.filter((s) => {
    const state = nodeVisuals[STATION_MAP[s.id]];
    return state?.tier === 'abnormal' || state?.tier === 'recovery';
  });
  const metrics = station ? station.metrics : aggregateMetrics(data.stations);
  const risk: TwinRiskInfo = data.activeRisk.eventId
    ? {
        tone: data.stations.find((s) => s.id === data.activeRisk.stationId)?.tone ?? 'alert',
        code: data.activeRisk.riskCode,
        title: data.activeRisk.title,
        status: data.activeRisk.status,
        desc: `${data.stations.find((s) => s.id === data.activeRisk.stationId)?.name ?? '当前断面'} · ${data.activeRisk.reading}${demoEnabled ? '（演示剧本）' : ''}`,
        link: demoEnabled ? '' : `/events/${encodeURIComponent(data.activeRisk.eventId)}/workbench`,
        linkLabel: '进入研判',
      }
    : {
        tone: 'good',
        code: 'R0',
        title: '暂无活跃风险',
        status: '正常监测',
        desc: '当前无未闭环事件。',
        link: '',
        linkLabel: '',
      };

  return (
    <div className="v2-page v2-twin-page">
        {demoEnabled && (
          <div className="v2-demo-banner" role="alert" style={{ marginBottom: 12 }}>
            <span className="v2-demo-banner__flag">场景演示 · 模拟数据</span>
            <span className="v2-demo-banner__phase">
              当前阶段：{demo.phase.label} · 演示时间 {demo.data.updatedAt}
            </span>
            <div className="v2-demo-banner__controls">
              <button type="button" className="v2-demo-ctl v2-demo-ctl--exit" onClick={() => useDemoStore.getState().disable()}>
                退出演示
              </button>
            </div>
          </div>
        )}

        <div className="v2-twin-head">
          <div className="v2-twin-head__main">
            <div className="v2-eyebrow v2-eyebrow--bare v2-intro-line">
              <span>DIGITAL TWIN · {data.updatedAt} · {webglOk ? 'LIVE 3D' : '2D FALLBACK'}</span>
            </div>
            <h1 className="v2-twin-title">
              数字孪生河流
              <em>DIGITAL TWIN</em>
            </h1>
            <p className="v2-twin-subtitle">
              {webglOk
                ? '原生 Three.js 河道场景（复用原项目 riverGeometry / cameraStore / MonitorNode）；HUD 为覆盖层，不依赖渲染器。'
                : '当前浏览器不支持 WebGL，降级为 2D 示意图层。'}
            </p>
          </div>
          <div className="v2-twin-head__meta">
            <label className="v2-twin-locate" title="按真实事件范围定位异常节点">
              <select
                className="v2-select v2-twin-locate__select"
                aria-label="定位异常节点"
                defaultValue=""
                disabled={abnormalStations.length === 0}
                onChange={(event) => {
                  const id = event.currentTarget.value as StationId;
                  if (id) flyToView(id);
                  event.currentTarget.value = '';
                }}
              >
                <option value="">
                  {abnormalStations.length
                    ? `定位异常（${abnormalStations.length}）`
                    : '无异常节点'}
                </option>
                {abnormalStations.map((item) => {
                  const state = nodeVisuals[STATION_MAP[item.id]];
                  return (
                    <option key={item.id} value={item.id}>
                      {item.name.replace(' 断面', '')} · {NODE_VISUAL_LABELS[state?.tier ?? 'normal']}
                    </option>
                  );
                })}
              </select>
            </label>
            {!demoEnabled && (
              <button type="button" className="v2-intro-sync" onClick={() => useDemoStore.getState().enable()}>
                场景演示
              </button>
            )}
            <Badge tone={demoEnabled ? 'demo' : 'live'}>{demoEnabled ? '场景演示 · SIMULATED' : 'LIVE 3D'}</Badge>
            <span className="v2-mono">
              {data.riverLength} · 流速 {data.flowSpeed}
            </span>
          </div>
        </div>

        <section className="v2-twin-stage" data-scene-mode={webglOk ? '3d' : 'fallback'}>
          {webglOk ? (
            <TwinScene
              stations={data.stations}
              view={view}
              flowOn={flowOn}
              labelsOn
              terrainOn
              mountRef={mountRef}
              onSelectStation={(id: StationId) => flyToView(id)}
              mode="3d"
            >
              <div className="v2-twin-scene__mount-child">
                <RiverScene
                  reaches={reaches}
                  abnormalReachIds={abnormalReachIds}
                  nodeVisuals={nodeVisualStatuses}
                  compactLabels
                  onSelectNode={handleNodeSelect}
                  selectedReachId={view === 'overview' ? null : STATION_MAP[view]}
                  onViewChange={(v) => setView(v === 'overview' ? 'overview' : stationIdOf(v))}
                />
                <NodeLabelOverlay
                  stations={data.stations}
                  nodeStates={nodeVisuals}
                  onSelect={(id) => flyToView(id)}
                />
              </div>
            </TwinScene>
          ) : (
            <TwinScene
              stations={data.stations}
              view={view}
              flowOn={flowOn}
              labelsOn
              terrainOn
              mountRef={mountRef}
              onSelectStation={(id: StationId) => setView(id)}
              mode="fallback"
            />
          )}

          <TwinSceneBar
            view={view}
            stations={data.stations}
            location={data.location}
            updatedAt={data.updatedAt}
            onViewChange={(v) => (webglOk ? flyToView(v) : setView(v))}
            mode3d={webglOk}
            demoLabel={demoEnabled ? '场景演示 · SIMULATED' : undefined}
          />

          <TwinStationHud
            stations={data.stations}
            view={view}
            location={data.location}
            updatedAt={data.updatedAt}
            open={leftOpen}
            onToggle={() => setLeftOpen((v) => !v)}
            onViewChange={(v) => (webglOk ? flyToView(v) : setView(v))}
            nodeStates={nodeVisuals}
          />

          <TwinMetricHud
            view={view}
            station={station}
            metrics={metrics}
            risk={risk}
            open={rightOpen}
            onToggle={() => setRightOpen((v) => !v)}
            sceneLabel={demoEnabled ? '场景演示 · 3D' : webglOk ? 'LIVE 3D' : '2D 示意模式'}
          />

          <TwinSceneToolbar
            flowOn={flowOn}
            labelsOn
            terrainOn
            onToggleFlow={() => setFlowOn((v) => !v)}
            onToggleLabels={() => undefined}
            onToggleTerrain={() => undefined}
            onReset={() => flyToView('overview')}
            mode={webglOk ? '3d' : 'fallback'}
          />

          <div className="v2-twin-legend">
            <span><i className="v2-twin-legend__dot v2-twin-legend__dot--good" />正常</span>
            <span><i className="v2-twin-legend__dot v2-twin-legend__dot--watch" />关注</span>
            <span><i className="v2-twin-legend__dot v2-twin-legend__dot--alert" />异常</span>
            <span><i className="v2-twin-legend__dot v2-twin-legend__dot--recovery" />恢复观察</span>
            <span><i className="v2-twin-legend__dot v2-twin-legend__dot--offline" />离线</span>
            <span className="v2-mono">
              {webglOk ? '原生 Three.js 场景 · 相机由 cameraStore 驱动' : '2D 示意图层 · WebGL 不可用'}
            </span>
          </div>

          <div className="v2-twin-coords v2-mono">示意位置 · 非真实坐标</div>
        </section>
    </div>
  );
}
