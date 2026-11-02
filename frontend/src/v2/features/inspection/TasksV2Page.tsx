import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useOverviewData } from '../overview/OverviewV2Page';
import { toBoardTask, TASK_STATUS_CN, type BoardColumn } from './inspectionAdapter';
import { TaskBoard } from './TaskBoard';
import TaskDetailV2Drawer from './TaskDetailV2Drawer';
import CreateTaskModalV2 from './CreateTaskModalV2';
import { Segmented } from '../../components/ui/Segmented';
import { Icon } from '../../components/ui/Icon';
import type { InspectionTask } from '@/types/contract';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/ui.css';
import '../../styles/inspection.css';

const COLUMNS: { status: BoardColumn; tone: string }[] = [
  { status: '待派发', tone: 'idle' },
  { status: '进行中', tone: 'active' },
  { status: '待复核', tone: 'review' },
  { status: '已归档', tone: 'closed' },
];

/**
 * F6 巡检协同中心：看板/列表双视图，真实七态任务，四列视觉分组。
 * 任务详情与派发复用原项目完整业务抽屉（测量/照片/版本化提交/复核）。
 */
export default function TasksV2Page() {
  const real = useOverviewData(); // stations
  const [view, setView] = useState<'board' | 'list'>('board');
  const [statusFilter, setStatusFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const tasksQ = useQuery({
    queryKey: ['tasks', 'v2-board', statusFilter],
    queryFn: () => api.tasks({ status: statusFilter || undefined, includeDrafts: true, pageSize: 100 }),
    refetchInterval: 8000,
  });

  const boardTasks = useMemo(() => {
    const list = (tasksQ.data?.items ?? []) as InspectionTask[];
    return list
      .map(toBoardTask)
      .filter((t) =>
        keyword
          ? t.title.includes(keyword) || t.id.includes(keyword) || t.assignee.includes(keyword)
          : true,
      )
      // 适配 TaskBoard 的 InspectionTask 形状（映射为其所需字段）
      .map((t) => ({
        id: t.id,
        title: t.title,
        stationId: t.stationId,
        assignee: t.assignee,
        status: t.status,
        priority: t.priority,
        time: t.time,
        dueAt: '—',
        submittedAt: t.originalStatus === 'APPROVED' ? t.time : undefined,
        checklist: [] as { id: string; label: string; done: boolean }[],
        eventId: t.eventId,
        originalStatus: t.originalStatus,
        originalStatusCn: t.originalStatusCn,
        isCancelled: t.isCancelled,
        latestVersion: t.latestVersion,
      }));
  }, [tasksQ.data, keyword]);

  const total = tasksQ.data?.total ?? 0;
  const queryError = tasksQ.error as Error | null;

  return (
    <div className="v2-scope">
      <div className="v2-page v2-tasks-page">
        <div className="v2-page-intro">
          <div className="v2-page-intro__main">
            <div className="v2-eyebrow v2-eyebrow--bare v2-intro-line">
              <span>FIELD INSPECTION · 真实任务链路</span>
            </div>
            <h1 className="v2-page-title">巡检协同中心<em>FIELD TASKS</em></h1>
            <p className="v2-page-situation">
              共 {total} 项任务 · 状态与操作由后端七态状态机控制（{Object.values(TASK_STATUS_CN).join(' / ')}）
            </p>
          </div>
        </div>

        <div className="v2-filter-bar">
          <div className="v2-filter-chips">
            <button
              type="button"
              className={`v2-filter-chip ${statusFilter === '' ? 'v2-is-active' : ''}`.trim()}
              onClick={() => setStatusFilter('')}
            >
              全部
            </button>
            {Object.entries(TASK_STATUS_CN).map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={`v2-filter-chip ${statusFilter === k ? 'v2-is-active' : ''}`.trim()}
                onClick={() => setStatusFilter(k)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="v2-filter-controls">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索任务编号 / 标题 / 责任人"
              className="v2-input"
            />
            <Segmented
              ariaLabel="任务视图切换"
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: '看板视图' },
                { value: 'list', label: '列表视图' },
              ]}
            />
            <button type="button" className="v2-btn v2-btn--primary" onClick={() => setShowCreate(true)}>
              <Icon name="plus" size={12} />新建任务
            </button>
          </div>
        </div>

        {queryError ? (
          <div className="v2-panel v2-state-page">
            <div className="v2-state__title">任务数据加载失败</div>
            <p className="v2-muted">{queryError.message}</p>
            <button type="button" className="v2-btn v2-btn--primary" onClick={() => void tasksQ.refetch()}>
              重新加载
            </button>
          </div>
        ) : view === 'board' ? (
          <TaskBoard
            tasks={boardTasks as never}
            stations={real.data?.stations ?? []}
            memberFilter={null}
            onClearFilter={() => undefined}
            onOpenTask={(id) => setOpenTaskId(id)}
          />
        ) : (
          <div className="v2-task-list-panel">
            <table className="v2-task-table">
              <thead>
                <tr>
                  <th>任务编号</th>
                  <th>标题</th>
                  <th>断面</th>
                  <th>责任人</th>
                  <th>业务状态</th>
                  <th>原始状态</th>
                  <th>版本</th>
                  <th>关联事件</th>
                  <th>创建时间</th>
                </tr>
              </thead>
              <tbody>
                {boardTasks.map((t) => (
                  <tr key={t.id} className="v2-task-table__row" onClick={() => setOpenTaskId(t.id)}>
                    <td className="v2-mono">{t.id.slice(0, 10)}…</td>
                    <td>{t.title}</td>
                    <td>{real.data?.stations.find((s) => s.id === t.stationId)?.name.replace(' 断面', '')}</td>
                    <td>{t.assignee}</td>
                    <td><span className={`v2-board-col__dot v2-board-col__dot--${COLUMNS.find((c) => c.status === t.status)?.tone}`} />{t.status}</td>
                    <td className="v2-mono">{t.originalStatusCn}（{t.originalStatus}）</td>
                    <td className="v2-mono">{t.latestVersion ? `v${t.latestVersion}` : '—'}</td>
                    <td className="v2-mono">{t.eventId ?? '—'}</td>
                    <td className="v2-mono">{t.time}</td>
                  </tr>
                ))}
                {boardTasks.length === 0 && (
                  <tr><td colSpan={9} className="v2-muted" style={{ textAlign: 'center', padding: 24 }}>当前筛选下暂无任务</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openTaskId && <TaskDetailV2Drawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />}
      {showCreate && <CreateTaskModalV2 onClose={() => setShowCreate(false)} />}
    </div>
  );
}
