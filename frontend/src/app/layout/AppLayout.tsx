import { useEffect, useState, type PropsWithChildren } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useRealtimeStream } from '@/services/useRealtimeStream';
import { useStreamState } from '@/store/stream';
import { Tag, ToastViewport } from '@/components/ui';
import NotificationBell from './NotificationBell';
import './layout.css';

interface NavItem {
  code: string;
  label: string;
  to: string;
  isActive: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { code: '01', label: '智慧监测总览', to: '/', isActive: (p) => p === '/' },
  {
    code: '02',
    label: '水环境分析',
    to: '/analysis',
    isActive: (p) => p.startsWith('/analysis') || p.startsWith('/reaches'),
  },
  {
    code: '03',
    label: '异常研判与处置',
    to: '/disposal',
    isActive: (p) => p.startsWith('/disposal') || p.startsWith('/events') || p.startsWith('/evidence'),
  },
  {
    code: '04',
    label: '巡检协同中心',
    to: '/inspection',
    isActive: (p) => p.startsWith('/inspection') || p.startsWith('/tasks'),
  },
  {
    code: '05',
    label: '事件复盘与报告',
    to: '/review',
    isActive: (p) => p.startsWith('/review') || p.startsWith('/reports'),
  },
  {
    code: '06',
    label: '数据与系统管理',
    to: '/admin',
    isActive: (p) => p.startsWith('/admin') || p.startsWith('/mobile') || p.startsWith('/field-voice'),
  },
];

const COLLAPSE_KEY = 'tw_sidebar_collapsed';

export default function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const the3dPage = location.pathname.startsWith('/river-3d');

  useRealtimeStream();
  const streamState = useStreamState();

  const { data: health, isError } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 10000,
    retry: 1,
  });

  const { data: reaches } = useQuery({
    queryKey: ['reaches'],
    queryFn: api.reaches,
    staleTime: 30000,
  });

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const activeItem = NAV_ITEMS.find((item) => item.isActive(location.pathname));
  const backendState = isError
    ? { text: '后端未连接', tone: 'danger' as const }
    : health?.status === 'ok'
      ? { text: '后端正常', tone: 'ok' as const }
      : { text: '服务降级', tone: 'watch' as const };

  const selectedReach = /^\/reaches\/([^/]+)/.exec(location.pathname)?.[1] ?? '';

  return (
    <div className="tw-shell">
      <aside className={`tw-sidebar${collapsed ? ' is-collapsed' : ''}`}>
        <div className="tw-sidebar-brand">
          <span className="tw-sidebar-logo">TW</span>
          <div className="tw-sidebar-brand-text">
            <div className="tw-sidebar-brand-name">TideWatch</div>
            <div className="tw-sidebar-brand-sub">汉江武汉段 · 监测与研判</div>
          </div>
        </div>
        <nav className="tw-sidebar-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.code}
              to={item.to}
              className={`tw-nav-item${item.isActive(location.pathname) ? ' is-active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="tw-nav-code">{item.code}</span>
              <span className="tw-nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="tw-sidebar-foot">
          <div className="tw-sidebar-foot-inner">
            <div className="tw-sidebar-foot-title">本地演示模式</div>
            <div className="tw-sidebar-foot-desc">免登录 · 数据含模拟/官方来源标注</div>
          </div>
        </div>
      </aside>

      <div className="tw-main">
        <header className="tw-topbar">
          <div className="tw-topbar-left">
            <button
              className="tw-collapse-btn"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
              title={collapsed ? '展开侧栏' : '折叠侧栏'}
            >
              {collapsed ? '»' : '«'}
            </button>
            <span className="tw-topbar-title">
              {activeItem ? `${activeItem.code} ${activeItem.label}` : 'TideWatch'}
            </span>
          </div>

          <div className="tw-topbar-right">
            {the3dPage ? <Tag tone="outline">3D 数字空间</Tag> : null}
            <select
              className="tw-select"
              aria-label="选择河段"
              value={selectedReach}
              onChange={(e) => {
                navigate(e.target.value ? `/reaches/${e.target.value}` : '/');
              }}
            >
              <option value="">河段：全部</option>
              {(reaches ?? []).map((r) => (
                <option key={r.reachId} value={r.reachId}>
                  {r.name}
                </option>
              ))}
            </select>
            <Tag tone={backendState.tone}>{backendState.text}</Tag>
            <Tag tone={streamState === 'open' ? 'ok' : streamState === 'connecting' ? 'watch' : 'muted'}>
              实时{streamState === 'open' ? '已连接' : streamState === 'connecting' ? '连接中' : '未连接'}
            </Tag>
            <span className="tw-topbar-divider" />
            <NotificationBell />
          </div>
        </header>

        <main className="tw-content">{children ?? <Outlet />}</main>
      </div>

      <ToastViewport />
    </div>
  );
}
