import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { EVENT_STATUS, reachName } from '@/components/EventBits';
import type {
  EventDetail, EventReviewDetail, Observation, RecoveryAssessment, TaskSubmission,
  TaskReviewRecord, TimelineItem, Evidence, Recommendation,
} from '@/types/contract';
import { buildChartWindow } from './useEventDossier';

export interface ReportTrend {
  observations: Observation[];
  start: string | null;
  end: string | null;
  unit: string;
  baseline: number | null;
  threshold: number | number[] | null;
}

export interface ReportData {
  event: EventReviewDetail;
  eventDetail?: EventDetail;
  assess?: RecoveryAssessment;
  trend: ReportTrend | null;
  timeline: TimelineItem[];
  submissions: { task: { id: string; title: string; reachId: string; status: string; assignee: string | null }; subs: TaskSubmission[]; reviews: TaskReviewRecord[] }[];
  evidence: { supporting: Evidence[]; counter: Evidence[] };
  recommendations: Recommendation[];
  generatedAt: string;
}

const CONCLUSION_CN: Record<string, string> = { NORMAL: '未见明显异常', ABNORMAL: '发现异常', UNCERTAIN: '无法确认' };

export function useReportData(eventId: string) {
  const [generatedAt] = useState(() => new Date().toISOString());
  const reviewQ = useQuery({ queryKey: ['report-review', eventId], queryFn: () => api.eventReviewDetail(eventId) });
  const eventQ = useQuery({ queryKey: ['report-event', eventId], queryFn: () => api.event(eventId) });
  const assessQ = useQuery({ queryKey: ['report-recovery', eventId], queryFn: () => api.recoveryAssessment(eventId) });
  const timelineQ = useQuery({ queryKey: ['report-timeline', eventId], queryFn: () => api.eventTimeline(eventId) });
  const evidenceQ = useQuery({ queryKey: ['report-evidence', eventId], queryFn: () => api.evidence(eventId) });
  const recoQ = useQuery({ queryKey: ['report-recommendations', eventId], queryFn: () => api.eventRecommendations(eventId) });

  const review = reviewQ.data as EventReviewDetail | undefined;
  const eventDetail = eventQ.data as EventDetail | undefined;
  const assess = assessQ.data as RecoveryAssessment | undefined;
  const chartWindow = buildChartWindow({ event: eventDetail, assess });
  const trigger = eventDetail?.trigger;
  const obsQ = useQuery({
    queryKey: [
      'report-observations',
      eventId,
      trigger?.reachId,
      trigger?.metric,
      chartWindow?.from,
      chartWindow?.to,
    ],
    queryFn: () =>
      api.observations(trigger!.reachId, {
        metric: trigger!.metric,
        from: chartWindow!.from,
        to: chartWindow!.to,
        order: 'asc',
        page: 1,
        pageSize: 5000,
      }),
    enabled: !!(trigger && chartWindow),
  });

  // 每个任务的提交与复核
  const taskIds = review?.tasks.map((t) => t.id) ?? [];
  const tasksQ = useQuery({
    queryKey: ['report-task-details', eventId, taskIds.join(',')],
    enabled: taskIds.length > 0,
    queryFn: async () => {
      const out: ReportData['submissions'] = [];
      for (const id of taskIds) {
        const [subs, reviews] = await Promise.all([api.taskSubmissions(id), api.taskReviews(id)]);
        const meta = review?.tasks.find((t) => t.id === id);
        out.push({
          task: {
            id, title: meta?.title ?? id, reachId: meta?.reachId ?? '—',
            status: meta?.status ?? '—', assignee: null,
          },
          subs: subs as TaskSubmission[],
          reviews: reviews as TaskReviewRecord[],
        });
      }
      return out;
    },
  });

  const allEvidence = (evidenceQ.data ?? []) as Evidence[];
  const coreQueries = [reviewQ, eventQ, assessQ, timelineQ, evidenceQ, recoQ];
  const coreReady = coreQueries.every((q) => q.isSuccess);
  const coreError = coreQueries.find((q) => q.isError)?.error;
  const tasksReady = taskIds.length === 0 || tasksQ.isSuccess;
  const obsEnabled = !!(trigger && chartWindow);
  const obsReady = !obsEnabled || obsQ.isSuccess;
  const ready = !!review && coreReady && tasksReady && obsReady;
  const data: ReportData | null = ready
    ? {
        event: review!,
        eventDetail,
        assess,
        trend: chartWindow
          ? {
              observations: (obsQ.data?.items ?? []) as Observation[],
              start: chartWindow.start,
              end: chartWindow.end,
              unit: chartWindow.unit,
              baseline: chartWindow.baseline,
              threshold: chartWindow.threshold,
            }
          : null,
        timeline: (timelineQ.data?.items ?? []) as TimelineItem[],
        submissions: tasksQ.data ?? [],
        evidence: {
          supporting: allEvidence.filter((e) => e.polarity === 'SUPPORT'),
          counter: allEvidence.filter((e) => e.polarity !== 'SUPPORT'),
        },
        recommendations: recoQ.data?.items ?? [],
        generatedAt,
      }
    : null;

  return {
    data,
    ready,
    loading: !ready && !coreError && !tasksQ.error && !obsQ.error,
    error: coreError ?? tasksQ.error ?? obsQ.error ?? reviewQ.error,
    cn: { EVENT_STATUS, reachName, CONCLUSION_CN },
  };
}
