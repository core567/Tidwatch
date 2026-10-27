// pages/event-detail/event-detail.ts V2
// 移动现场协同视图（只读）：状态/触发/范围 + 关联任务 + 关键时间线 +
// 规则建议（非 AI）+ 恢复评估因子 + 开放盲区。不做状态写操作。
import {
  getEventDetail,
  listEventTimeline,
  listRecommendations,
  getRecoveryAssessment,
  listBlindSpots,
  listTasks,
} from '../../services/api';
import { formatDateTime } from '../../utils/util';
import { eventStatusView, triggerMetricText } from '../../utils/eventLabels';
import { digestTimeline, type Milestone } from '../../utils/timelineDigest';
import { taskStatusView } from '../../utils/taskLabels';
import { reachDisplayName, reachDisplayNames } from '../../utils/reachView';
import { wsClient } from '../../utils/ws';

type UiState = 'loading' | 'ready' | 'error';

interface AssessmentFactor {
  code: string;
  detail: string;
  passed: boolean | null;
  weightText: string;
}

const RECOMMENDATION_NAME: Record<string, string> = {
  BLINDSPOT: '监测盲区',
  EVENT_ACTION: '事件动作',
  OBSERVATION: '持续观测',
  DISPATCH_TASK: '巡检建议',
};

/** 恢复评估结果 -> 展示色调与业务化的证据结论（文案来自结果枚举，不猜测因子内容） */
const RECOVERY_RESULT_META: Record<string, { tone: string; evidenceText: string }> = {
  RECOVERED_SUPPORTED: { tone: 'is-ok', evidenceText: '证据充分，规则支持恢复判定' },
  NEEDS_OBSERVATION: { tone: 'is-watch', evidenceText: '证据不足，需继续观测' },
  INSUFFICIENT_EVIDENCE: { tone: 'is-off', evidenceText: '证据不足，无法判定恢复' },
};

Page({
  data: {
    eventId: '',
    pageState: 'loading' as UiState,
    errorMsg: '',
    title: '',
    statusText: '',
    statusTone: '',
    priorityText: '',
    active: true,
    scope: [] as string[],
    trigger: { metric: '—', direction: '', magnitude: '' },
    firstSeenText: '',
    updatedText: '',
    ruleVersion: '',
    relatedTasks: [] as {
      taskId: string;
      title: string;
      statusText: string;
      tone: string;
      canExecute: boolean;
      reviewSummary: string;
    }[],
    milestones: [] as (Milestone & { atText: string; actorText: string })[],
    blindSummary: { opened: 0, resolved: 0, flapping: 0 },
    openBlinds: [] as { reachId: string; reachName: string; reason: string; startText: string }[],
    recommendations: [] as { title: string; reason: string; categoryText: string; priorityClass: string }[],
    ruleSource: '',
    assessment: null as {
      result: string;
      label: string;
      resultClass: string;
      evidenceText: string;
      evaluatedText: string;
      ruleVersion: string;
      passedFactors: AssessmentFactor[];
      failedFactors: AssessmentFactor[];
      unknownFactors: AssessmentFactor[];
      blockers: AssessmentFactor[];
      disclaimers: string[];
    } | null,
    showAllTimeline: false,
    showRules: false,
  },

  fetchSeq: 0,
  unsubMsg: null as null | (() => void),
  unsubState: null as null | (() => void),
  wsScheduled: false,

  onLoad(query: Record<string, string | undefined>) {
    const id = query.eventId ?? '';
    this.setData({ eventId: id });
    if (!id) {
      this.setData({ pageState: 'error', errorMsg: '缺少事件编号' });
      return;
    }
    this.load();
    wsClient.connect();
    this.unsubMsg = wsClient.onMessage((msg) => {
      const payload = (msg.payload ?? {}) as { eventId?: string; eventRef?: string };
      const aboutThis = payload.eventId === id || payload.eventRef === id;
      const relevant =
        msg.messageType === 'event.created' ||
        msg.messageType === 'event.updated' ||
        msg.messageType === 'event.status-changed' ||
        msg.messageType === 'task.created' ||
        msg.messageType === 'task.updated' ||
        msg.messageType === 'blindspot.opened' ||
        msg.messageType === 'blindspot.resolved';
      // 仅当消息明确属于本事件时刷新；无关联信息的消息不触发，避免无关空刷
      if (relevant && aboutThis) this.scheduleWsReload();
    });
    this.unsubState = wsClient.onStateChange((s) => {
      if (s === 'open' && this.data.pageState === 'ready') this.scheduleWsReload();
    });
  },

  onHide() {
    this.wsScheduled = false;
  },

  onUnload() {
    this.unsubMsg?.();
    this.unsubState?.();
    this.unsubMsg = null;
    this.unsubState = null;
    this.wsScheduled = false;
  },

  /** 合并连续 WS 消息为一次静默重拉；fetchSeq 保证乱序时旧响应被丢弃 */
  scheduleWsReload() {
    if (this.wsScheduled) return;
    this.wsScheduled = true;
    wx.nextTick(() => {
      this.wsScheduled = false;
      if (this.data.pageState === 'ready') this.load(true);
    });
  },

  onPullDownRefresh() {
    this.load(true).finally(() => wx.stopPullDownRefresh());
  },

  async load(silent = false): Promise<void> {
    const seq = ++this.fetchSeq;
    if (!silent) this.setData({ pageState: 'loading', errorMsg: '' });
    const id = this.data.eventId;
    try {
      const [detail, timeline, recs, assessment, blindsRes, tasksRes] = await Promise.all([
        getEventDetail(id),
        listEventTimeline(id).catch(() => ({ items: [] })),
        listRecommendations(id).catch(() => null),
        getRecoveryAssessment(id).catch(() => null),
        listBlindSpots({ active: true }).catch(() => []),
        listTasks({ eventId: id, page: 1, pageSize: 20 }).catch(() => ({ items: [] })),
      ]);
      if (seq !== this.fetchSeq) return;

      const sv = eventStatusView(detail.status);
      const digest = digestTimeline(timeline.items as unknown as Parameters<typeof digestTimeline>[0]);
      const milestones = digest.milestones.map((m) => ({
        ...m,
        atText: formatDateTime(m.at),
        actorText: m.actor === 'SYSTEM' ? '系统规则' : m.actor === 'RULE' ? '规则引擎' : m.actor,
      }));

      const scopeReachIds = new Set(detail.scopeReachIds ?? []);
      const openBlinds = (blindsRes as BlindSpot[])
        .filter((b) => scopeReachIds.has(b.reachId))
        .map((b) => ({
          reachId: b.reachId,
          reachName: reachDisplayName(b.reachId),
          reason: b.reason,
          startText: formatDateTime(b.startAt),
        }));

      const relatedTasks = (tasksRes.items ?? []).map((t) => {
        const tv = taskStatusView(t.status, t.latestReview?.decision);
        const canExecute = t.status === 'PENDING' || t.status === 'ACCEPTED' || t.status === 'IN_PROGRESS';
        // 现场提交与 PC 审核摘要（同一后端任务数据，不在此伪造状态）
        let reviewSummary = '';
        if (t.latestReview?.decision === 'REJECTED') {
          reviewSummary = `PC 已退回 · ${t.latestReview.reviewer ?? ''}`;
        } else if (t.latestReview?.decision === 'APPROVED') {
          reviewSummary = `PC 已通过 · ${t.latestReview.reviewer ?? ''}`;
        } else if (t.status === 'SUBMITTED') {
          reviewSummary = `已提交 v${t.latestVersion ?? ''}，待 PC 复核`;
        } else if ((t.latestVersion ?? 0) > 0) {
          reviewSummary = `已提交 v${t.latestVersion}`;
        }
        return {
          taskId: t.taskId,
          title: t.title,
          statusText: tv.text,
          tone: tv.tone,
          canExecute,
          reviewSummary,
        };
      });

      const recommendations = (recs?.items ?? []).map((r) => ({
        title: r.title,
        reason: r.reason,
        categoryText: RECOMMENDATION_NAME[r.category] ?? r.category,
        priorityClass: r.priority === 'HIGH' ? 'is-high' : r.priority === 'LOW' ? 'is-low' : 'is-normal',
      }));

      let assessmentView = null;
      if (assessment) {
        // 严格按后端三态分组：passed=true 已满足 / false 未满足 / null 数据不足。
        // 不依据文字猜测，不把事件状态 RECOVERED 当作评估通过。
        type FactorView = {
          code: string;
          detail: string;
          passed: boolean | null;
          weightText: string;
        };
        const allFactors: FactorView[] = (assessment.factors ?? []).map((f) => ({
          code: f.code,
          detail: f.detail,
          passed: f.passed,
          weightText: f.weight === 'hard' ? '硬条件' : f.weight === 'high' ? '高权重' : '参考',
        }));
        const passedFactors = allFactors.filter((f) => f.passed === true);
        const failedFactors = allFactors.filter((f) => f.passed === false);
        const unknownFactors = allFactors.filter((f) => f.passed === null);

        const resultMeta = RECOVERY_RESULT_META[assessment.result] ?? {
          tone: 'is-off',
          evidenceText: '评估结论待确认',
        };
        // 阻碍恢复判定的关键条件 = 未满足项（false）；数据不足项单独提示补证
        const blockers = failedFactors;

        assessmentView = {
          result: assessment.result,
          label: assessment.label,
          resultClass: resultMeta.tone,
          evidenceText: resultMeta.evidenceText,
          evaluatedText: formatDateTime(assessment.evaluatedAt),
          ruleVersion: assessment.ruleVersion,
          passedFactors,
          failedFactors,
          unknownFactors,
          blockers,
          disclaimers: (assessment as unknown as { disclaimers?: string[] }).disclaimers ?? [],
        };
      }

      this.setData({
        pageState: 'ready',
        title: detail.title,
        statusText: sv.text,
        statusTone: sv.tone,
        priorityText: { HIGH: '高', NORMAL: '中', LOW: '低' }[detail.priority] ?? detail.priority,
        active: detail.status !== 'RECOVERED' && detail.status !== 'UNRESOLVED',
        scope: reachDisplayNames(detail.scopeReachIds ?? []),
        trigger: {
          metric: detail.trigger ? triggerMetricText(detail.trigger.metric) : '—',
          direction: detail.trigger?.direction === 'UP' ? '升高 ↑' : detail.trigger?.direction === 'DOWN' ? '降低 ↓' : '',
          magnitude: detail.trigger ? `${formatMagnitude(detail.trigger.magnitude, detail.trigger.metric)}` : '',
        },
        firstSeenText: formatDateTime(detail.firstSeenAt),
        updatedText: formatDateTime(detail.updatedAt),
        ruleVersion: detail.ruleVersion,
        relatedTasks,
        milestones,
        blindSummary: { opened: digest.blindOpened, resolved: digest.blindResolved, flapping: digest.transitionFlapping },
        openBlinds,
        recommendations,
        ruleSource: recs?.source ?? '',
        assessment: assessmentView,
      });
    } catch (e) {
      if (seq !== this.fetchSeq) return;
      this.setData({ pageState: 'error', errorMsg: e instanceof Error ? e.message : '未知错误' });
    }
  },

  toggleTimeline(): void {
    this.setData({ showAllTimeline: !this.data.showAllTimeline });
  },

  toggleRules(): void {
    // 用页面级独立字段，避免深层嵌套对象 setData 在部分基础库不触发视图更新
    this.setData({ showRules: !this.data.showRules });
  },

  openTask(e: WechatMiniprogram.TouchEvent): void {
    const id = (e.currentTarget.dataset as { id: string }).id;
    wx.navigateTo({ url: `/pages/task-detail/task-detail?taskId=${encodeURIComponent(id)}` });
  },
});

function formatMagnitude(v: number, metric: string): string {
  if (metric === 'flowLevel') return String(v);
  // toFixed 在小程序基础库可用；v 来自后端数字
  return typeof v.toFixed === 'function' ? v.toFixed(2) : String(v);
}
