import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
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

export function TopBar() {
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

  return (
    <header className="v2-topbar">
      <div className="v2-topbar__where">
        <b>汉江 · 武汉段</b>
        <span>
          <span className="v2-status-dot" style={{ width: 5, height: 5 }} />
          监测站网 3/3 在线
        </span>
      </div>
      <div className="v2-topbar__rule" />
      <div className="v2-topbar__section">
        <b>{current.label}</b>
        <span>{current.en}</span>
      </div>

      <div className="v2-topbar__right">
        <Badge tone="demo">DEMO · 模拟数据</Badge>
        <div className="v2-topbar__clock">
          <b>{time}</b>
          <span>{date} · UTC+8</span>
        </div>
        <Link to="/assistant" className="v2-ai-btn">
          <span className="v2-ai-btn__glow" />
          <Icon name="assistant" size={15} />
          AI 助手
        </Link>
      </div>
    </header>
  );
}
