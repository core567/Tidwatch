import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { SseClient, type ConnectionState } from '@/services/sse';
import { getToken } from '@/services/apiClient';

/**
 * 全局 SSE：observation/reach 消息到达时让相关查询失效重拉。
 * 重连后额外整体失效一次（补放 + 快照双保险，GRP 8.4）。
 */
export function useRealtimeStream(enabled: boolean) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ConnectionState>('disconnected');
  const clientRef = useRef<SseClient | null>(null);

  useEffect(() => {
    if (!enabled || !getToken()) return;
    let resnapshot = false;
    const client = new SseClient({
      onStateChange: (s) => {
        setState(s);
        if (s === 'open') {
          if (resnapshot) {
            // 断线重连后强制重拉
            void queryClient.invalidateQueries();
          }
          resnapshot = true;
        }
      },
      onMessage: (msg) => {
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
            void queryClient.invalidateQueries({ queryKey: ['events'] });
            void queryClient.invalidateQueries({
              predicate: (q) => q.queryKey[0] === 'event',
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
