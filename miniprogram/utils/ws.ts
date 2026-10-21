// utils/ws.ts - WebSocket 统一封装（小程序端实时通道，对后端 /api/ws）
//
// 设计要点（对齐 GRP 8.4 与用户决定）：
// - 全局单连接，页面 subscribe / unsubscribe 监听，不各自建连；
// - JWT 通过 query 参数传递（小程序 wx.connectSocket 自定义 header 在真机支持不稳定）；
// - 25s 心跳；断线指数退避重连（1s 起，上限 30s）；
// - 消息按 messageId 幂等去重；记录最后消息 id，重连后发送 resumeFrom，
//   同时页面必须在 onOpen 回调里重拉一次快照（重放 + 快照双保险）；
// - 登出时 manualClose，不再重连。

import { ENV } from '../config/env';
import { getToken, clearSession } from './auth';
import { logger } from './logger';

type ConnectionState = 'disconnected' | 'connecting' | 'open';

type MessageHandler = (msg: StreamMessage) => void;
type StateHandler = (state: ConnectionState) => void;

const RESUME_KEY = 'tw_ws_resume_id';
const SEEN_LIMIT = 500;

class WsClient {
  private task: WechatMiniprogram.SocketTask | null = null;
  private state: ConnectionState = 'disconnected';
  private manualClosed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;

  private messageHandlers = new Set<MessageHandler>();
  private stateHandlers = new Set<StateHandler>();
  private seenIds: string[] = [];

  onMessage(h: MessageHandler): () => void {
    this.messageHandlers.add(h);
    return () => this.messageHandlers.delete(h);
  }

  onStateChange(h: StateHandler): () => void {
    this.stateHandlers.add(h);
    h(this.state);
    return () => this.stateHandlers.delete(h);
  }

  getState(): ConnectionState {
    return this.state;
  }

  connect(): void {
    if (this.state === 'open' || this.state === 'connecting') return;
    const token = getToken();
    if (!token) {
      logger.warn('ws', 'no token, skip connect');
      return;
    }
    this.manualClosed = false;
    this.setState('connecting');

    const resumeFrom = wx.getStorageSync(RESUME_KEY) || '';
    const url =
      `${ENV.WS_URL}?token=${encodeURIComponent(token)}` +
      (resumeFrom ? `&resumeFrom=${encodeURIComponent(resumeFrom)}` : '');

    let task: WechatMiniprogram.SocketTask;
    try {
      task = wx.connectSocket({ url, fail: () => undefined });
    } catch (e) {
      logger.error('ws', 'connectSocket threw', e);
      this.scheduleReconnect();
      return;
    }
    this.task = task;

    task.onOpen(() => {
      this.attempts = 0;
      this.setState('open');
      logger.info('ws', 'connected');
      this.startHeartbeat();
      // 通知页面：连接已建立，须重拉快照补齐错过的消息
      this.emitState();
    });

    task.onMessage((res) => {
      this.handleRaw(res.data);
    });

    task.onError((err) => {
      logger.error('ws', 'socket error', err.errMsg);
      // onError 后通常紧跟 onClose，重连交给 onClose 统一调度
    });

    task.onClose(() => {
      logger.warn('ws', 'closed');
      this.stopHeartbeat();
      this.task = null;
      this.setState('disconnected');
      if (!this.manualClosed) this.scheduleReconnect();
    });
  }

  disconnect(): void {
    this.manualClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    try {
      this.task?.close({});
    } catch (e) {
      logger.warn('ws', 'close failed');
    }
    this.task = null;
    this.setState('disconnected');
  }

  /** 登出：断开并清空 resume 标记 */
  logout(): void {
    wx.removeStorageSync(RESUME_KEY);
    this.seenIds = [];
    this.disconnect();
  }

  private scheduleReconnect(): void {
    if (this.manualClosed) return;
    if (!getToken()) {
      // 登录态已失效，不重连
      clearSession();
      return;
    }
    const delay = Math.min(ENV.WS_RECONNECT_MAX_MS, 1000 * Math.pow(2, this.attempts));
    this.attempts += 1;
    logger.info('ws', `reconnect in ${delay}ms (attempt ${this.attempts})`);
    this.setState('connecting');
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'ping', at: new Date().toISOString() });
    }, ENV.WS_HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private send(payload: Record<string, unknown>): void {
    if (this.state !== 'open' || !this.task) return;
    this.task.send({ data: JSON.stringify(payload), fail: () => undefined });
  }

  private setState(s: ConnectionState): void {
    if (this.state === s) return;
    this.state = s;
    this.emitState();
  }

  private emitState(): void {
    this.stateHandlers.forEach((h) => h(this.state));
  }

  private handleRaw(data: string | ArrayBuffer): void {
    if (typeof data !== 'string') return; // 本项目只收 JSON 文本帧
    let msg: StreamMessage;
    try {
      msg = JSON.parse(data) as StreamMessage;
    } catch (e) {
      logger.error('ws', 'invalid json frame dropped', e);
      return;
    }
    if (!msg || !msg.messageId || !msg.messageType) {
      logger.warn('ws', 'frame missing messageId/type, dropped');
      return;
    }
    if (msg.messageType === 'ping') return; // 服务端心跳，不派发给页面
    if (this.seenIds.includes(msg.messageId)) return; // 幂等：重放不重复处理
    this.seenIds.push(msg.messageId);
    if (this.seenIds.length > SEEN_LIMIT) this.seenIds.splice(0, this.seenIds.length - SEEN_LIMIT);
    wx.setStorageSync(RESUME_KEY, msg.messageId);
    this.messageHandlers.forEach((h) => {
      try {
        h(msg);
      } catch (e) {
        logger.error('ws', 'handler error', e);
      }
    });
  }
}

export const wsClient = new WsClient();
