// SSE 客户端（PC Web）：自动重连 + Last-Event-ID 补放 + 消息幂等。
// 重连后页面仍应重拉一次快照（补放 + 快照双保险，GRP 8.4）。
import { getToken } from './apiClient';
import type { StreamMessage } from '@/types/contract';

export type ConnectionState = 'disconnected' | 'connecting' | 'open';

export interface SseOptions {
  onMessage: (msg: StreamMessage) => void;
  onStateChange?: (state: ConnectionState) => void;
}

export class SseClient {
  private es: EventSource | null = null;
  private lastEventId: string | null = null;
  private seenIds = new Set<string>();
  private closedByUser = false;
  private reconnectDelay = 1000;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: SseOptions) {}

  connect(): void {
    this.closedByUser = false;
    this.open();
  }

  private open(): void {
    const token = getToken();
    if (!token) return;
    this.options.onStateChange?.('connecting');

    // EventSource 原生会在重连时自动带 Last-Event-ID；首连用 query 补放
    const url = `/api/stream?token=${encodeURIComponent(token)}${
      this.lastEventId ? `&resumeFrom=${encodeURIComponent(this.lastEventId)}` : ''
    }`;
    this.es = new EventSource(url);

    this.es.onopen = () => {
      this.reconnectDelay = 1000;
      this.options.onStateChange?.('open');
    };

    this.es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as StreamMessage;
        if (msg.messageId) {
          this.lastEventId = msg.messageId;
          if (this.seenIds.has(msg.messageId)) return; // 幂等：补放不重复处理
          this.seenIds.add(msg.messageId);
          if (this.seenIds.size > 500) {
            this.seenIds = new Set([...this.seenIds].slice(-300));
          }
        }
        if (msg.messageType !== 'ping') this.options.onMessage(msg);
      } catch {
        // 忽略无法解析的帧（如 keepalive 注释不会进 onmessage）
      }
    };

    this.es.onerror = () => {
      this.options.onStateChange?.('disconnected');
      this.es?.close();
      this.es = null;
      if (!this.closedByUser) {
        // 指数退避上限 30s
        this.timer = setTimeout(() => this.open(), this.reconnectDelay);
        this.reconnectDelay = Math.min(30000, this.reconnectDelay * 2);
      }
    };
  }

  close(): void {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    this.es?.close();
    this.es = null;
  }
}
