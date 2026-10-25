import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SseClient, type ConnectionState } from '@/services/sse';
import { useNotificationStore, type PushNotificationInput } from '@/store/notifications';
import { useStreamStore } from '@/store/stream';
import type { StreamMessage } from '@/types/contract';

function payloadOf(msg: StreamMessage): Record<string, unknown> {
  return (msg.payload ?? {}) as Record<string, unknown>;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

/** 实时消息 → 通知条目；高频的 focus/observation 不进通知，避免刷屏。 */
function toNotification(msg: StreamMessage): PushNotificationInput | null {
  const p = payloadOf(msg);
  const eventId = str(p.eventId);
  const taskId = str(p.taskId);
  const reachId = str(p.reachId);

  switch (msg.messageType) {
    case 'change.detected': {
      const metric = str(p.metric);
      return {
        title: '检测到异常变化',
        description: [reachId, metric].filter(Boolean).join(' · ') || undefined,
        tone: 'watch',
        to: '/events',
      };
    }
    case 'event.status-changed': {
      const status = str(p.status) ?? '—';
      const tone = status === 'RECOVERED' ? 'ok' : status === 'ESCALATED' ? 'danger' : 'watch';
      return {
        title: `事件状态：${status}`,
        description: eventId ? `事件 ${eventId}` : undefined,
        tone,
        to: eventId ? `/events/${eventId}/workbench` : '/events',
      };
    }
    case 'event.updated':
      return {
        title: '事件更新',
        description: eventId ? `事件 ${eventId}` : undefined,
        tone: 'info',
        to: eventId ? `/events/${eventId}/workbench` : '/events',
      };
    case 'task.created':
      return {
        title: '新巡检任务',
        description: [taskId, reachId].filter(Boolean).join(' · ') || undefined,
        tone: 'info',
        to: '/tasks',
      };
    case 'task.updated':
      return {
        title: `任务状态：${str(p.status) ?? '已更新'}`,
        description: taskId ? `任务 ${taskId}` : undefined,
        tone: 'watch',
        to: '/tasks',
      };
    case 'blindspot.created':
    case 'blindspot.opened':
      return {
        title: '监测盲区',
        description: reachId ? `${reachId} 数据缺失` : undefined,
        tone: 'danger',
        to: '/events',
      };
    case 'blindspot.resolved':
      return {
        title: '盲区已解除',
        description: reachId ? `${reachId} 数据恢复` : undefined,
        tone: 'ok',
        to: '/events',
      };
    default:
      return null;
  }
}

/**
 * 全局 SSE：observation/reach 消息到达时让相关查询失效重拉。
 * 演示模式免登录：默认恒连接；重连后额外整体失效一次（补放 + 快照双保险）。
 * 由 AppLayout 持有唯一连接，页面通过 useStreamState() 读取连接状态。
 */
export function useRealtimeStream(enabled: boolean = true) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnectionState>('disconnected');
  const clientRef = useRef<SseClient | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let resnapshot = false;
    const client = new SseClient({
      onStateChange: (s) => {
        setState(s);
        useStreamStore.getState().setState(s);
        if (s === 'open') {
          if (resnapshot) {
            // 断线重连后强制重拉
            void queryClient.invalidateQueries();
          }
          resnapshot = true;
        }
      },
      onMessage: (msg) => {
        const notice = toNotification(msg);
        if (notice) useNotificationStore.getState().push(notice);

        switch (msg.messageType) {
          case 'observation.created': {
            const reachId = (msg.payload as { reachId?: string } | undefined)?.reachId;
            if (reachId) {
              void queryClient.invalidateQueries({ queryKey: ['latest', reachId] });
              void queryClient.invalidateQueries({
                predicate: (q) =>
                  q.queryKey[0] === 'observations' && q.queryKey[1] === reachId,
              });
            }
            void queryClient.invalidateQueries({ queryKey: ['reaches'] });
            break;
          }
          case 'reach.status-changed':
            void queryClient.invalidateQueries({ queryKey: ['reaches'] });
            break;
          case 'event.created':
          case 'event.updated':
          case 'event.status-changed':
          case 'change.detected':
          case 'focus.updated':
          case 'focus.resolved':
          case 'blindspot.created':
          case 'blindspot.opened':
          case 'blindspot.resolved':
          case 'task.created':
          case 'task.updated':
            void queryClient.invalidateQueries({ queryKey: ['events'] });
            void queryClient.invalidateQueries({
              predicate: (q) =>
                q.queryKey[0] === 'event' || q.queryKey[0] === 'tasks' ||
                q.queryKey[0] === 'review' || q.queryKey[0] === 'evidence' ||
                q.queryKey[0] === 'hypotheses' || q.queryKey[0] === 'blindspots',
            });
            break;
          default:
            break;
        }
      },
    });
    clientRef.current = client;
    client.connect();
    return () => client.close();
  }, [enabled, queryClient]);

  return state;
}
