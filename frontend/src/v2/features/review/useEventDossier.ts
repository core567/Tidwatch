import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import type {
  EventDetail,
  EventReviewDetail,
  Observation,
  Recommendation,
  RecoveryAssessment,
  RecoveryWindow,
  TimelineItem,
} from '@/types/contract';

export interface EventDossier {
  event?: EventDetail;
  review?: EventReviewDetail;
  assess?: RecoveryAssessment;
  timeline: TimelineItem[];
  recommendations: Recommendation[];
  observations: Observation[];
}

/** 后端时间字符串可能是无时区 ISO；统一按 UTC 解释用于计算，不改变原始展示值。 */
export function timeMs(iso: string | null | undefined): number {
  if (!iso) return NaN;
  const normalized = /([zZ]|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}Z`;
  return Date.parse(normalized);
}

function toNaive(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

export function matchingWindow(
  assess: RecoveryAssessment | undefined,
  reachId: string | undefined,
  metric: string | undefined,
  phase: RecoveryWindow['phase'],
): RecoveryWindow | undefined {
  if (!assess || !reachId || !metric) return undefined;
  return assess.windows.find(
    (w) => w.reachId === reachId && w.metric === metric && w.phase === phase,
  );
}

export interface ChartWindow {
  start: string | null;
  end: string | null;
  from: string;
  to: string;
  unit: string;
  baseline: number | null;
  threshold: number | number[] | null;
}

export function buildChartWindow(dossier: {
  event?: EventDetail;
  assess?: RecoveryAssessment;
}): ChartWindow | null {
  const { event, assess } = dossier;
  const trigger = event?.trigger;
  const first = timeMs(event?.firstSeenAt);
  if (!trigger || !Number.isFinite(first)) return null;

  const anchor = timeMs(assess?.anchor.at);
  const updated = timeMs(event?.updatedAt);
  const endMs = Number.isFinite(anchor) ? anchor : Number.isFinite(updated) ? updated : first;
  const start = event?.firstSeenAt ?? null;
  const end = assess?.anchor.at ?? event?.updatedAt ?? null;

  const baseWin = matchingWindow(assess, trigger.reachId, trigger.metric, 'BASELINE');
  const postWin = matchingWindow(assess, trigger.reachId, trigger.metric, 'POST');

  return {
    start,
    end,
    from: toNaive(first - 12 * 3600_000),
    to: toNaive(endMs + 6 * 3600_000),
    unit: postWin?.unit || baseWin?.unit || '',
    baseline: baseWin?.median ?? null,
    threshold: postWin?.threshold ?? null,
  };
}

export function useEventDossier(eventId: string) {
  const eventQ = useQuery({
    queryKey: ['v2-review-event', eventId],
    queryFn: () => api.event(eventId),
    enabled: !!eventId,
    refetchInterval: 30000,
  });
  const reviewQ = useQuery({
    queryKey: ['v2-review-detail', eventId],
    queryFn: () => api.eventReviewDetail(eventId),
    enabled: !!eventId,
    refetchInterval: 15000,
  });
  const assessQ = useQuery({
    queryKey: ['v2-review-assess', eventId],
    queryFn: () => api.recoveryAssessment(eventId),
    enabled: !!eventId,
    refetchInterval: 30000,
  });
  const timelineQ = useQuery({
    queryKey: ['v2-review-timeline', eventId],
    queryFn: () => api.eventTimeline(eventId),
    enabled: !!eventId,
    refetchInterval: 15000,
  });
  const recoQ = useQuery({
    queryKey: ['v2-review-recommendations', eventId],
    queryFn: () => api.eventRecommendations(eventId),
    enabled: !!eventId,
    refetchInterval: 30000,
  });

  const base = useMemo(
    () => ({
      event: eventQ.data as EventDetail | undefined,
      review: reviewQ.data as EventReviewDetail | undefined,
      assess: assessQ.data as RecoveryAssessment | undefined,
      timeline: timelineQ.data?.items ?? [],
      recommendations: recoQ.data?.items ?? [],
      observations: [] as Observation[],
    }),
    [eventQ.data, reviewQ.data, assessQ.data, timelineQ.data, recoQ.data],
  );

  const chartWindow = useMemo(() => buildChartWindow(base), [base]);

  const trigger = base.event?.trigger;
  const obsQ = useQuery({
    queryKey: [
      'v2-review-observations',
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
    refetchInterval: 30000,
  });

  const dossier: EventDossier = useMemo(
    () => ({ ...base, observations: (obsQ.data?.items ?? []) as Observation[] }),
    [base, obsQ.data],
  );

  return {
    ...dossier,
    chartWindow,
    observationsLoading: obsQ.isLoading,
    loading: reviewQ.isLoading || eventQ.isLoading,
    error: reviewQ.error ?? eventQ.error,
    refetch: () => {
      void eventQ.refetch();
      void reviewQ.refetch();
      void assessQ.refetch();
      void timelineQ.refetch();
      void recoQ.refetch();
      void obsQ.refetch();
    },
  };
}
