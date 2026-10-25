import { PropsWithChildren } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/apiClient';

interface NavItem {
  to: string;
  code: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', code: 'P01', label: '综合监测总览' },
  { to: '/events', code: 'P03', label: '异常事件中心' },
  { to: '/river-3d', code: 'P07', label: '3D 河流数字空间' },
  { to: '/tasks', code: 'P05', label: '巡检与观察任务' },
  { to: '/evidence', code: 'P06', label: '证据与智能分析' },
  { to: '/reports', code: 'P09', label: '历史分析与报告' },
  { to: '/mobile', code: 'P10', label: '移动巡检端' },
  { to: '/field-voice', code: 'P11', label: '语音与现场感知' },
  { to: '/admin', code: 'P12', label: '系统管理与诊断' },
];

export default function AppLayout({ children }: PropsWithChildren) {
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
          <div style={{ color: '#fff' }}>本地演示模式</div>
          <div style={{ color: '#8fb0d0', marginTop: 2, lineHeight: 1.5 }}>
            免登录 · 数据含模拟/官方来源标注
          </div>
        </div>
      </aside>

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
