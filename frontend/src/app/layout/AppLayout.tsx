import { PropsWithChildren } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';
import { useAuthStore } from '@/store/auth';

interface NavItem {
  to: string;
  code: string;
  label: string;
  priority: 'P0' | 'P1' | 'P2';
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', code: 'P01', label: '综合监测总览', priority: 'P0' },
  { to: '/events', code: 'P03', label: '异常事件中心', priority: 'P0' },
  { to: '/events/demo/workbench', code: 'P04', label: '演化研判工作台', priority: 'P0' },
  { to: '/river-3d', code: 'P07', label: '3D 河流数字空间', priority: 'P0' },
  { to: '/tasks', code: 'P05', label: '巡检与观察任务', priority: 'P1' },
  { to: '/evidence', code: 'P06', label: '证据与智能分析', priority: 'P1' },
  { to: '/reviews', code: 'P08', label: '研判单与复盘', priority: 'P1' },
  { to: '/reports', code: 'P09', label: '历史分析与报告', priority: 'P1' },
  { to: '/mobile', code: 'P10', label: '移动巡检端', priority: 'P2' },
  { to: '/field-voice', code: 'P11', label: '语音与现场感知', priority: 'P2' },
  { to: '/admin', code: 'P12', label: '系统管理与诊断', priority: 'P0' },
];

export default function AppLayout({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const { user, authenticated, logout } = useAuthStore();
  const { data: health, isError } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 10000,
    retry: 1,
  });

  const backendState = isError
    ? { text: '后端未连接', cls: 'badge-danger' }
    : health?.status === 'ok'
      ? { text: '后端正常', cls: 'badge-ok' }
      : { text: '服务降级', cls: 'badge-watch' };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* 侧边导航 */}
      <aside
        style={{
          width: 216,
          flexShrink: 0,
          background: 'var(--tw-primary-800)',
          color: '#cfe0f2',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#fff', letterSpacing: 1 }}>
            TideWatch
          </div>
          <div style={{ fontSize: 11, color: '#8fb0d0', marginTop: 2 }}>
            汉江武汉段 · 监测与研判
          </div>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 20px',
                fontSize: 13.5,
                color: isActive ? '#fff' : '#a9c2dc',
                background: isActive ? 'rgba(30,111,224,.35)' : 'transparent',
                borderLeft: isActive ? '3px solid #4d94ff' : '3px solid transparent',
              })}
            >
              <span style={{ fontSize: 11, color: '#6f8db0', width: 28 }}>{item.code}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,.08)', fontSize: 12 }}>
          {authenticated && user ? (
            <>
              <div style={{ color: '#fff' }}>{user.displayName}</div>
              <div style={{ color: '#8fb0d0', marginBottom: 8 }}>{user.role}</div>
              <button
                className="btn-primary"
                style={{ width: '100%', padding: '6px 0', background: 'rgba(255,255,255,.12)' }}
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                退出登录
              </button>
            </>
          ) : (
            <button className="btn-primary" style={{ width: '100%', padding: '6px 0' }} onClick={() => navigate('/login')}>
              登录
            </button>
          )}
        </div>
      </aside>

      {/* 右侧：全局状态条 + 内容区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header
          style={{
            height: 44,
            flexShrink: 0,
            background: 'var(--tw-surface)',
            borderBottom: '1px solid var(--tw-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '0 20px',
            fontSize: 12.5,
          }}
        >
          <span className={`badge ${backendState.cls}`}>{backendState.text}</span>
          <span className="source-tag source-tag-simulated">模拟演示模式</span>
          <span className="muted">规则版本 demo-rules-v1（教学阈值）</span>
          <span className="muted" style={{ marginLeft: 'auto' }}>
            示意拓扑：上游 A → 中游 B → 下游 C
          </span>
        </header>
        <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>{children ?? <Outlet />}</main>
      </div>
    </div>
  );
}
