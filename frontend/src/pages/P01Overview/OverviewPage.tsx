import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useRealtimeStream } from '@/services/useRealtimeStream';
import {
  Button,
  Card,
  DataStateBadge,
  EmptyState,
  MiniSparkline,
  PageHeader,
  Stat,
  Tag,
} from '@/components/ui';
import { EventStatusBadge, formatTime, reachName, shortTime } from '@/components/EventBits';
import { OnlineBadge, RelativeTime } from '@/components/StatusBits';
import SourceTag from '@/components/SourceTag';
import {
  OFFICIAL_METRICS,
  formatOfficialValue,
  simMetricName,
  simMetricUnit,
  waterClassTone,
} from '@/lib/metrics';
import type {
  InspectionTask,
  Observation,
  OfficialAutoLatest,
  OfficialAutoRecord,
  Reach,
} from '@/types/contract';

const TASK_OPEN: InspectionTask['status'][] = ['PENDING', 'ACCEPTED', 'IN_PROGRESS'];

export default function OverviewPage() {
  const navigate = useNavigate();
  const streamState = useRealtimeStream();

  const reachesQ = useQuery({
    queryKey: ['reaches'],
    queryFn: api.reaches,
    refetchInterval: 15000,
  });
  const officialQ = useQuery({
    queryKey: ['official-auto'],
    queryFn: () => api.officialAuto(),
    refetchInterval: 60000,
  });
  const eventsQ = useQuery({
    queryKey: ['events', 'active'],
    queryFn: () => api.events({ status: 'ACTIVE', pageSize: 8 }),
    refetchInterval: 15000,
  });
  const tasksQ = useQuery({
    queryKey: ['tasks', 'overview'],
    queryFn: () => api.tasks(),
    refetchInterval: 15000,
  });

  const reaches = reachesQ.data ?? [];
  const official = officialQ.data ?? [];
  const events = eventsQ.data?.items ?? [];
  const openTasks = (tasksQ.data?.items ?? []).filter((t) => TASK_OPEN.includes(t.status));
  const liveStations = official.filter((o) => o.dataState === 'LIVE').length;
  const latestOfficial = official
    .flatMap((o) => o.records)
    .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())[0];

  if (reachesQ.isLoading) return <div className="state-box">加载中…</div>;
  if (reachesQ.isError) {
    return (
      <div className="state-box">
        <div>断面数据加载失败：{(reachesQ.error as Error).message}</div>
        <Button onClick={() => reachesQ.refetch()}>重试</Button>
      </div>
    );
  }

  return (
    <div className="tw-stack">
      <PageHeader
        code="P01"
        title="综合监测总览"
        badges={
          <>
            <Tag tone={streamState === 'open' ? 'ok' : 'muted'}>
              实时通道{' '}
              {streamState === 'open' ? '已连接' : streamState === 'connecting' ? '连接中' : '未连接'}
            </Tag>
            <Tag tone="outline">示意拓扑：上游 A → 中游 B → 下游 C</Tag>
            <Tag tone="outline">规则版本 demo-rules-v1（教学阈值）</Tag>
          </>
        }
        description="官方自动站实时水质与 MQTT 模拟观测分离展示：官方数据仅作现状快照，模拟链路驱动异常事件与 3D 联动。"
        actions={
          <>
            <Button variant="ghost" onClick={() => navigate('/river-3d')}>
              进入 3D 河流空间
            </Button>
            <Button onClick={() => navigate('/events')}>查看异常事件</Button>
          </>
        }
      />

      <div className="tw-stat-grid">
        <Stat
          label="活动事件"
          value={eventsQ.data?.total ?? 0}
          unit="起"
          tone={(eventsQ.data?.total ?? 0) > 0 ? 'danger' : 'ok'}
          hint="未闭环事件（不含已恢复/无法判定）"
        />
        <Stat
          label="待处理任务"
          value={openTasks.length}
          unit="项"
          tone={openTasks.length > 0 ? 'watch' : 'ok'}
          hint="待接收 / 已接收 / 进行中"
        />
        <Stat
          label="官方实时站点"
          value={`${liveStations}/${official.length || 3}`}
          tone={
            liveStations === 0 ? 'muted' : liveStations === official.length ? 'ok' : 'watch'
          }
          hint={
            latestOfficial
              ? `最近观测 ${formatTime(latestOfficial.observedAt)}`
              : '尚未拉取官方数据'
          }
        />
        <Stat
          label="模拟观测链路"
          value={reaches.filter((r) => r.onlineStatus === 'ONLINE').length}
          unit={`/ ${reaches.length || 3} 在线`}
          tone={reaches.some((r) => r.onlineStatus === 'ONLINE') ? 'ok' : 'watch'}
          hint="MQTT 模拟数据驱动事件与 3D 高亮"
        />
      </div>

      <div
        className="tw-grid"
        style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(300px, 1fr)' }}
      >
        <div className="tw-stack">
          <div className="tw-grid tw-grid-3">
            {reaches.map((r) => (
              <ReachCard
                key={r.reachId}
                reach={r}
                official={official.find((o) => o.reachId === r.reachId)}
                onOpen={() => navigate(`/reaches/${r.reachId}`)}
              />
            ))}
          </div>

          <Card title="快捷入口" subtitle="从总览进入核心业务链路">
            <div className="tw-grid tw-grid-2">
              {[
                {
                  title: '3D 河流数字空间',
                  desc: '查看断面空间关系与实时事件高亮',
                  to: '/river-3d',
                },
                { title: '异常事件中心', desc: '按状态机筛选并进入研判工作台', to: '/events' },
                { title: '巡检与观察任务', desc: '派发、执行、回填现场结论', to: '/tasks' },
                { title: '历史分析与报告', desc: '官方月报类别与事件频次统计', to: '/reports' },
              ].map((item) => (
                <div key={item.to} className="tw-row-between">
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--tw-primary-800)' }}>
                      {item.title}
                    </div>
                    <div className="tw-tiny">{item.desc}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => navigate(item.to)}>
                    进入
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="tw-stack">
          <Card
            title="活动事件"
            subtitle={`共 ${eventsQ.data?.total ?? 0} 起未闭环`}
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('/events')}>
                全部
              </Button>
            }
            padded={false}
          >
            {events.length === 0 ? (
              <EmptyState
                title="当前无活动事件"
                description="MQTT 模拟链路触发异常后会在此出现。"
              />
            ) : (
              <div>
                {events.map((e) => (
                  <button
                    key={e.eventId}
                    type="button"
                    onClick={() => navigate(`/events/${e.eventId}/workbench`)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid #eef2f7',
                      background: 'transparent',
                      padding: '10px 20px',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="tw-row-between">
                      <span style={{ fontWeight: 600, color: 'var(--tw-primary-800)' }}>
                        {e.title}
                      </span>
                      <EventStatusBadge status={e.status} />
                    </div>
                    <div className="tw-row tw-tiny" style={{ marginTop: 4 }}>
                      <span>{e.scopeReachIds.map(reachName).join(' / ')}</span>
                      <span>·</span>
                      <span>{shortTime(e.firstSeenAt)}</span>
                      {e.priority === 'HIGH' && <Tag tone="danger">高优先</Tag>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card
            title="待办任务"
            subtitle={`共 ${openTasks.length} 项`}
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('/tasks')}>
                全部
              </Button>
            }
            padded={false}
          >
            {openTasks.length === 0 ? (
              <EmptyState
                title="暂无待办任务"
                description="从事件工作台或任务页可派发现场核查。"
              />
            ) : (
              <div>
                {openTasks.slice(0, 6).map((t) => (
                  <button
                    key={t.taskId}
                    type="button"
                    onClick={() => navigate('/tasks')}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid #eef2f7',
                      background: 'transparent',
                      padding: '10px 20px',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="tw-row-between">
                      <span style={{ fontWeight: 600, color: 'var(--tw-primary-800)' }}>
                        {t.title}
                      </span>
                      <Tag
                        tone={
                          t.priority === 'HIGH'
                            ? 'danger'
                            : t.priority === 'LOW'
                              ? 'muted'
                              : 'watch'
                        }
                      >
                        {taskStatusText(t.status)}
                      </Tag>
                    </div>
                    <div className="tw-row tw-tiny" style={{ marginTop: 4 }}>
                      <span>{reachName(t.reachId)}</span>
                      <span>·</span>
                      <span>{taskActionText(t.actionType)}</span>
                      {t.dueAt && (
                        <>
                          <span>·</span>
                          <span>截止 {shortTime(t.dueAt)}</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <div className="tw-row tw-small" style={{ gap: 10, color: 'var(--tw-text-secondary)' }}>
          <SourceTag source="OFFICIAL_AUTO" />
          <span>官方自动站：国家地表水自动监测实时数据发布系统，每日快照，只读。</span>
          <SourceTag source="SIMULATED" />
          <span>MQTT 模拟：驱动事件机与 3D 高亮，非真实水情。</span>
          <Tag tone="muted">水位/流量：未接入真实数据源</Tag>
        </div>
      </Card>
    </div>
  );
}

function ReachCard({
  reach,
  official,
  onOpen,
}: {
  reach: Reach;
  official?: OfficialAutoLatest;
  onOpen: () => void;
}) {
  const record: OfficialAutoRecord | undefined = official?.records?.[0];
  const state = official?.dataState ?? 'NO_DATA';

  return (
    <Card
      title={
        <span>
          {reach.name}{' '}
          <span className="tw-tiny" style={{ fontWeight: 400 }}>
            {reach.reachId}
          </span>
        </span>
      }
      subtitle={
        official?.stationName ? `官方站 ${official.stationName}（示意关联）` : '未关联官方站点'
      }
      actions={<OnlineBadge status={reach.onlineStatus} />}
      padded={false}
    >
      <div style={{ padding: '12px 20px' }}>
        <div className="tw-row-between" style={{ marginBottom: 8 }}>
          <div className="tw-row">
            <DataStateBadge state={state} />
            {record?.waterClass && (
              <Tag tone={waterClassTone(record.waterClass)}>{record.waterClass} 类</Tag>
            )}
            {record?.mappingStatus === 'UNVERIFIED' && <Tag tone="outline">上下游待核</Tag>}
          </div>
          <span className="tw-tiny">
            {record ? formatTime(record.observedAt) : '官方无记录'}
          </span>
        </div>

        {state === 'NO_DATA' ? (
          <EmptyState
            title="官方暂无该站数据"
            description="可在系统管理「官方实时数据」中手动拉取；无数据不等于现场正常。"
          />
        ) : (
          <div
            className="tw-stat-grid"
            style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
          >
            {OFFICIAL_METRICS.slice(0, 4).map((def) => (
              <Stat
                key={def.key as string}
                label={def.label}
                value={formatOfficialValue(record, def)}
                digits={def.digits}
                unit={def.unit}
                emptyText="暂无数据"
              />
            ))}
          </div>
        )}

        <div style={{ marginTop: 12, borderTop: '1px solid #eef2f7', paddingTop: 10 }}>
          <div className="tw-row-between" style={{ marginBottom: 6 }}>
            <span className="tw-section-title" style={{ margin: 0 }}>
              模拟观测
            </span>
            <SourceTag source="SIMULATED" />
          </div>
          <SimBlock reachId={reach.reachId} />
        </div>

        <div className="tw-row-between" style={{ marginTop: 10 }}>
          <RelativeTime iso={reach.lastSeenAt} />
          <Button size="sm" variant="ghost" onClick={onOpen}>
            断面详情 ›
          </Button>
        </div>
      </div>
    </Card>
  );
}

function SimBlock({ reachId }: { reachId: string }) {
  const latestQ = useQuery({
    queryKey: ['latest', reachId],
    queryFn: () => api.latest(reachId),
    refetchInterval: 20000,
  });
  const seriesQ = useQuery({
    queryKey: ['obs', reachId, 'turbidity', 'spark'],
    queryFn: () =>
      api.observations(reachId, { metric: 'turbidity', order: 'asc', pageSize: 24 }),
    refetchInterval: 20000,
  });

  const metrics = (latestQ.data ?? []) as Observation[];
  const series = (seriesQ.data?.items ?? []).map((o) => ({
    value: o.value,
    label: shortTime(o.observedAt),
  }));

  if (metrics.length === 0) {
    return <div className="tw-tiny">暂无模拟观测（MQTT 未接入或尚未上报）</div>;
  }

  return (
    <>
      <div className="tw-row" style={{ gap: 14, fontSize: 13 }}>
        {metrics.map((m) => (
          <span key={m.metric} className="tw-muted">
            {simMetricName(m.metric)}{' '}
            <b style={{ color: 'var(--tw-primary-800)' }}>{m.value}</b>{' '}
            {simMetricUnit(m.unit, m.metric)}
          </span>
        ))}
      </div>
      <div style={{ marginTop: 6 }}>
        <MiniSparkline points={series} height={34} unit="NTU" emptyText="暂无连续浊度序列" />
      </div>
    </>
  );
}

function taskStatusText(status: InspectionTask['status']): string {
  return {
    PENDING: '待接收',
    ACCEPTED: '已接收',
    IN_PROGRESS: '进行中',
    SUBMITTED: '已提交',
    CANCELLED: '已取消',
  }[status];
}

function taskActionText(action: string): string {
  return (
    {
      CONTINUE_OBSERVE: '持续观察',
      FOCUS_REACH_B: '重点观察 B',
      FOCUS_REACH_C: '重点观察 C',
      KEEP_LOCAL_SCOPE: '保持局部关注',
      INSPECT_DATA_LINK: '检查数据链路',
      MANUAL_CHECK: '现场人工核查',
      RE_EVALUATE_AFTER_RECOVERY: '恢复后再评估',
    }[action] ?? action
  );
}
