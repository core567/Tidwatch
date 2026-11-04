import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import { Panel } from '../../components/ui/Panel';
import { PanelState } from '../../components/ui/PanelState';
import { EventReportPanel } from './EventReportPanel';
import { ReviewArchivePanel } from './ReviewArchivePanel';
import { formatDuration, useReviewArchive } from './useReviewArchive';
import { useEventDossier } from './useEventDossier';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../styles/layout.css';
import '../../styles/ui.css';
import '../../styles/review.css';
import '../../styles/review-layout.css';

/**
 * F7.1.3 事件复盘总览：图二双栏档案。
 * 左栏事件档案（真实 /events 分页），右栏选中事件的完整复盘报告（真实 API）。
 */
export default function ReviewV2ListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [priority, setPriority] = useState('');
  const [selectedId, setSelectedId] = useState<string | undefined>();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(keyword.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  useEffect(() => {
    setPage(1);
  }, [debounced, priority]);

  const archive = useReviewArchive({ page, query: debounced, priority });
  const dossier = useEventDossier(selectedId ?? '');

  useEffect(() => {
    if (archive.list.length === 0) {
      setSelectedId(undefined);
      return;
    }
    if (!selectedId || !archive.list.some((e) => e.eventId === selectedId)) {
      setSelectedId(archive.list[0].eventId);
    }
  }, [archive.list, selectedId]);

  const stats = archive.stats;
  const selected = archive.list.find((e) => e.eventId === selectedId);

  return (
    <div className="v2-scope">
      <div className="v2-page v2-review-page">
        <div className="v2-page-intro">
          <div className="v2-page-intro__main">
            <div className="v2-eyebrow v2-eyebrow--bare v2-intro-line">
              <span>REVIEW · ARCHIVE &amp; REPORTS</span>
              <button
                type="button"
                className="v2-review-sync"
                onClick={archive.refetch}
                disabled={archive.listLoading || archive.statsLoading}
              >
                <Icon name="refresh" size={11} className={archive.listLoading ? 'v2-is-spinning' : undefined} />
                {archive.listLoading ? '同步中' : '刷新'}
              </button>
            </div>
            <h1 className="v2-page-title">事件复盘与报告<em>REVIEW &amp; REPORT</em></h1>
            <p className="v2-page-situation">
              近 30 天共 <b>{stats.total30d} 起</b>事件，已恢复 <b>{stats.archived} 起</b>、已闭环 <b>{stats.closedCount} 起</b>（含无法判定 {stats.unresolved} 起）、未闭环 <b>{stats.active} 起</b>，高风险 <b>{stats.highRisk} 起</b>；平均闭环 <b>{formatDuration(stats.avgCloseMs)}</b>。按编号、标题或风险等级检索历史事件，右侧直接查看基于事件记录的复盘报告。
            </p>
          </div>
          <div className="v2-readouts">
            <div className="v2-readout">
              <span className="v2-readout__label">RECOVERED · 30D</span>
              <div className="v2-readout__value">{String(stats.archived).padStart(2, '0')}<small>起</small></div>
              <div className="v2-readout__sub">已恢复 · 可复盘归档</div>
            </div>
            <div className="v2-readout">
              <span className="v2-readout__label">HIGH RISK</span>
              <div className="v2-readout__value">{String(stats.highRisk).padStart(2, '0')}<small>起</small></div>
              <div className="v2-readout__sub"><span className="v2-status-dot v2-status-dot--danger" />高风险事件</div>
            </div>
            <div className="v2-readout">
              <span className="v2-readout__label">AVG CLOSE</span>
              <div className="v2-readout__value v2-readout__value--text">{formatDuration(stats.avgCloseMs)}</div>
              <div className="v2-readout__sub">平均闭环 · {stats.closedCount} 起</div>
            </div>
            <div className="v2-readout">
              <span className="v2-readout__label">IN PROGRESS</span>
              <div className="v2-readout__value">{String(stats.active).padStart(2, '0')}<small>起</small></div>
              <div className="v2-readout__sub">未闭环 · 研判或处置中</div>
            </div>
          </div>
        </div>

        <div className="v2-review-layout">
          <div className="v2-review-archive-col">
            {archive.listError ? (
              <div className="v2-panel v2-state-page">
                <div className="v2-state__title">事件档案加载失败</div>
                <p className="v2-muted">{(archive.listError as Error).message}</p>
                <button type="button" className="v2-btn v2-btn--primary" onClick={archive.refetch}>重新加载</button>
              </div>
            ) : (
              <ReviewArchivePanel
                events={archive.list}
                total={archive.total}
                stats={stats}
                selectedId={selectedId}
                query={keyword}
                onQuery={setKeyword}
                priority={priority}
                onPriority={setPriority}
                onSelect={setSelectedId}
                page={page}
                onPage={setPage}
                loading={archive.listLoading}
                fetchedTotal={archive.statsTotal}
              />
            )}
          </div>

          <div className="v2-review-report-col">
            {selectedId ? (
              <EventReportPanel
                dossier={dossier}
                onOpenDetail={() => navigate(`/review/${selectedId}`)}
                onOpenReport={() => navigate(`/review/${selectedId}/report`)}
              />
            ) : (
              <Panel code="02" title="事件复盘报告" en="INCIDENT REPORT" className="v2-report-panel">
                <div className="v2-state-page">
                  <PanelState
                    variant="empty"
                    title={archive.listLoading ? '正在检索事件档案…' : '没有匹配的历史事件'}
                    desc="请调整搜索关键词或风险筛选条件。"
                  />
                </div>
              </Panel>
            )}
          </div>
        </div>

        {selected && (
          <p className="v2-review-footnote v2-muted">
            当前选中 <b className="v2-mono">{selected.eventId}</b> · 数据来自事件复盘、恢复评估、统一时间线与现场巡检接口；恢复评估为规则只读结论，不改变事件状态。
          </p>
        )}
      </div>
    </div>
  );
}
