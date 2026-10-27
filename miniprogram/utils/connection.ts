// 连接/数据新鲜度的统一展示判定（纯函数，可单测）。
// 目的：网络断开或静默刷新失败时，即使页面仍显示旧数据，也要明确提醒，
// 但不阻塞操作、不清空已有内容（区分首次加载错误与"旧数据+刷新失败"）。

export type ConnectionTone = 'ok' | 'offline' | 'stale';

export interface ConnectionState {
  /** 实时通道是否连接 */
  wsOpen: boolean;
  /** 最近一次静默刷新是否失败（首次加载失败不算，那是错误页） */
  lastRefreshFailed: boolean;
  /** 当前展示数据的时间戳（ms）；未知传 null */
  dataUpdatedAt: number | null;
  /** 判定基准时间（ms），默认当前 */
  now?: number;
  /** 超过该时长视为数据陈旧（默认 30 分钟） */
  staleMs?: number;
}

/**
 * 返回提示条状态：
 * - offline：实时通道断开或静默刷新失败（旧数据可能不是最新）
 * - stale：连接正常但数据已超过陈旧阈值
 * - ok：不提示
 */
export function connectionTone(s: ConnectionState): ConnectionTone {
  if (!s.wsOpen || s.lastRefreshFailed) return 'offline';
  const now = s.now ?? Date.now();
  const staleMs = s.staleMs ?? 30 * 60 * 1000;
  if (s.dataUpdatedAt !== null && now - s.dataUpdatedAt > staleMs) return 'stale';
  return 'ok';
}

export const CONNECTION_TEXT: Record<ConnectionTone, string> = {
  ok: '实时已连接',
  offline: '网络不可用，当前为上次加载的数据',
  stale: '数据可能不是最新，下拉可刷新',
};

/**
 * 计算并返回用于 m-connection-bar 的 setData 片段。
 * 页面在 WS 状态变化、静默刷新成功/失败、首次加载后调用。
 */
export function connectionData(
  wsOpen: boolean,
  lastRefreshFailed: boolean,
  dataUpdatedAt: number | null,
  now?: number,
): { connTone: ConnectionTone; connText: string } {
  const tone = connectionTone({ wsOpen, lastRefreshFailed, dataUpdatedAt, now });
  return { connTone: tone, connText: tone === 'ok' ? '' : CONNECTION_TEXT[tone] };
}

export class ThrottledRunner {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastRun = 0;
  constructor(
    private readonly fn: () => void,
    private readonly minGapMs = 400,
  ) {}

  schedule(): void {
    if (this.timer) return;
    const wait = Math.max(0, this.minGapMs - (Date.now() - this.lastRun));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.lastRun = Date.now();
      this.fn();
    }, wait);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
