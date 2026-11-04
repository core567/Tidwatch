import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { findNavItem } from '../../config/nav';
import { Badge } from '../ui/Badge';
import { Icon } from '../ui/Icon';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export interface TopBarStatus {
  /** 实时通道状态（来自全局 SSE store） */
  streamState: string;
  /** 断面在线数（来自真实 reaches 数据） */
  onlineCount: number;
  totalCount: number;
}

/**
 * 新版顶栏：分区标题 + 时钟 + 实时连接状态（真实数据）。
 * 原 TidewatchWeb 的固定演示徽章与硬编码在线数已移除。
 */
export function TopBar({ status }: { status?: TopBarStatus }) {
  const { pathname } = useLocation();
  const current = findNavItem(pathname);
  const now = useClock();

  useEffect(() => {
    document.title = `${current.label} · TideWatch`;
  }, [current.label]);

  const time = now.toLocaleTimeString('zh-CN', { hour12: false });
  const date = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

  const streamOnline = status?.streamState === 'open';
  const dataLive = streamOnline && (status?.onlineCount ?? 0) > 0;

  return (
    <header className="v2-topbar">
      <div className="v2-topbar__where">
        <b>汉江 · 武汉段</b>
        <span>
          <span
            className={`v2-status-dot ${streamOnline ? '' : 'v2-status-dot--idle'}`}
            style={{ width: 5, height: 5 }}
          />
          {streamOnline
            ? '实时通道已连接'
            : status?.streamState === 'connecting'
              ? '实时通道连接中'
              : '实时通道未连接'}
        </span>
      </div>
      <div className="v2-topbar__rule" />
      <div className="v2-topbar__section">
        <b>{current.label}</b>
        <span>{current.en}</span>
      </div>

      <div className="v2-topbar__right">
        <Badge tone={dataLive ? 'live' : 'mid'}>
          {dataLive ? 'LIVE' : streamOnline ? 'SSE' : 'OFFLINE'}
        </Badge>
        <span className="v2-topbar__stations v2-mono">
          {status && status.totalCount > 0
            ? `站点 ${status.onlineCount}/${status.totalCount} 在线`
            : '站点状态加载中'}
        </span>
        <div className="v2-topbar__clock">
          <b>{time}</b>
          <span>{date} · UTC+8</span>
        </div>
        <NavLink
          to="/assistant"
          className={({ isActive }) => `v2-ai-btn ${isActive ? 'v2-ai-btn--active' : ''}`.trim()}
          title="打开 AI 智能助手"
        >
          <span className="v2-ai-btn__glow" />
          <Icon name="assistant" size={15} />
          AI 助手
        </NavLink>
      </div>
    </header>
  );
}
