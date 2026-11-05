import { useEffect, useRef } from 'react';
import { api } from '@/services/apiClient';
import { subscribeRealtimeStream } from '@/services/useRealtimeStream';
import { playAlertTone } from '@/services/alertSound';
import {
  alertItemId,
  decideAlert,
  DEMO_ALERT_RULE_PARAMS,
  metricLabel,
  parseRuleParams,
  statusLabel,
  stationLabel,
  thresholdLabel,
  type AlertRuleParams,
  type GlobalAlertItem,
} from '@/services/alertRules';
import { useGlobalAlertStore } from '@/store/alerts';
import type { EventDetail, StreamMessage } from '@/types/contract';

const EVENT_MESSAGE_TYPES = new Set([
  'change.detected',
  'event.created',
  'event.updated',
  'event.status-changed',
]);

function eventIdOf(msg: StreamMessage): string | null {
  const payload = (msg.payload ?? {}) as { eventId?: unknown };
  return typeof payload.eventId === 'string' && payload.eventId ? payload.eventId : null;
}

function formatValue(value: number, unit: string | null | undefined): string {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return unit ? `${text} ${unit}` : text;
}

/** 全局 F9 告警监听：复用现有 SSE 总线与事件 API，不新建事件系统。 */
export function useGlobalAlerts(): void {
  const effectRef = useRef(0);
  const ruleParamsRef = useRef<AlertRuleParams>(DEMO_ALERT_RULE_PARAMS);

  useEffect(() => {
    effectRef.current += 1;
    const effectId = effectRef.current;
    let cancelled = false;
    let baselineReady = false;
    const mountedAt = Date.now();
    const buffered: StreamMessage[] = [];
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pending: GlobalAlertItem[] = [];

    const flush = () => {
      flushTimer = null;
      if (cancelled || pending.length === 0) return;
      const batch = pending;
      pending = [];
      const store = useGlobalAlertStore.getState();
      store.pushBatch(batch);
      if (batch.some((item) => item.severity === 'severe') && store.soundEnabled) {
        playAlertTone();
      }
    };

    const enqueue = (item: GlobalAlertItem) => {
      pending = pending.filter((existing) => existing.eventId !== item.eventId);
      pending.push(item);
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 600);
    };

    const evaluate = async (eventId: string) => {
      let detail: EventDetail;
      try {
        detail = await api.event(eventId);
      } catch {
        return;
      }
      if (cancelled || effectId !== effectRef.current) return;

      const store = useGlobalAlertStore.getState();
      const decision = decideAlert(store.seen[eventId], detail);
      if (!decision) {
        store.updateSeen(detail);
        return;
      }

      const trigger = detail.trigger;
      const reachId = trigger?.reachId ?? detail.scopeReachIds[0] ?? '';
      let value = '—';
      if (trigger && reachId) {
        try {
          const latest = await api.latest(reachId);
          const observation = latest.find((item) => item.metric === trigger.metric);
          if (observation) value = formatValue(observation.value, observation.unit);
        } catch {
          // 当前值失败不影响告警本身
        }
      }
      if (cancelled || effectId !== effectRef.current) return;

      const at = new Date().toISOString();
      enqueue({
        id: alertItemId(detail.eventId, decision.kind, at),
        eventId: detail.eventId,
        kind: decision.kind,
        severity: decision.severity,
        title: detail.title,
        status: detail.status,
        statusLabel: statusLabel(detail.status),
        priority: detail.priority,
        station: stationLabel(reachId),
        reachId,
        metricLabel: metricLabel(trigger?.metric ?? detail.eventType),
        value,
        threshold: thresholdLabel(detail, ruleParamsRef.current),
        at,
        read: false,
        to: `/events/${encodeURIComponent(detail.eventId)}/workbench`,
      });
      store.updateSeen(detail);
    };

    const schedule = (eventId: string) => {
      const existing = timers.get(eventId);
      if (existing) clearTimeout(existing);
      timers.set(eventId, setTimeout(() => {
        timers.delete(eventId);
        void evaluate(eventId);
      }, 250));
    };

    const handle = (msg: StreamMessage) => {
      if (!EVENT_MESSAGE_TYPES.has(msg.messageType)) return;
      const eventId = eventIdOf(msg);
      if (!eventId) return;
      if (!baselineReady) {
        buffered.push(msg);
        return;
      }
      schedule(eventId);
    };

    const unsubscribe = subscribeRealtimeStream(handle);

    // 阈值展示复用后端当前规则版本；失败时保留 demo-rules-v1 兜底值。
    void api.diagnostics()
      .then((diag) => {
        if (!cancelled) ruleParamsRef.current = parseRuleParams(diag.ruleParams);
      })
      .catch(() => undefined);

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      // 手动事件动作没有 SSE 推送（后端仅自动确认/恢复时通知），用现有事件 API 低频兜底。
      pollTimer = setInterval(async () => {
        if (cancelled || !baselineReady) return;
        try {
          const result = await api.events({ pageSize: 200 });
          if (cancelled) return;
          const store = useGlobalAlertStore.getState();
          for (const event of result.items) {
            const decision = decideAlert(store.seen[event.eventId], event);
            if (decision) schedule(event.eventId);
            else store.updateSeen(event);
          }
        } catch {
          // 网络失败保留现有告警状态，等待下次轮询
        }
      }, 8000);
    };

    const baseline = api.events({ pageSize: 200 })
      .then((result) => {
        if (cancelled) return;
        // 页面加载前已存在的事件静默建立基线；加载后新产生的事件仍由 SSE 提醒。
        useGlobalAlertStore.getState().seedSeen(result.items.filter((event) => {
          const seenAt = Date.parse(event.firstSeenAt);
          return !Number.isFinite(seenAt) || seenAt <= mountedAt;
        }));
      })
      .catch(() => undefined);
    void Promise.race([
      baseline,
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]).then(() => {
      if (cancelled) return;
      baselineReady = true;
      for (const msg of buffered.splice(0)) handle(msg);
      startPolling();
    });

    return () => {
      cancelled = true;
      unsubscribe();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      if (flushTimer) clearTimeout(flushTimer);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);
}
