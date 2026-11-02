import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Backdrop } from './components/layout/Backdrop';
import { SideRail } from './components/layout/SideRail';
import { TopBar, type TopBarStatus } from './components/layout/TopBar';
import { useStreamState } from '@/store/stream';
import { useRealtimeStream } from '@/services/useRealtimeStream';
import { api } from '@/services/apiClient';
import AiAssistant from '@/components/AiAssistant';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/ui.css';

/**
 * F2.1 新版首页专用外壳（复用 F1 的 SideRail/TopBar/Backdrop 视觉结构）。
 * - 只在新版首页路由使用；其他页面仍由原 AppLayout 承载，避免双壳渲染。
 * - 复用主项目唯一的实时链路（useRealtimeStream）与 SSE 状态 store。
 * - AI 助手以全局悬浮按钮形式保留原业务入口（不新增第二套路由）。
 */
export default function V2HomeShell() {
  useRealtimeStream();
  const streamState = useStreamState();
  const reachesQ = useQuery({
    queryKey: ['reaches'],
    queryFn: api.reaches,
    refetchInterval: 15000,
  });

  const onlineCount = (reachesQ.data ?? []).filter((r) => r.onlineStatus === 'ONLINE').length;
  const status: TopBarStatus = {
    streamState,
    onlineCount,
    totalCount: (reachesQ.data ?? []).length,
  };

  return (
    <div className="v2-scope">
      <div className="v2-app">
        <Backdrop />
        <SideRail />
        <div className="v2-app__main">
          <TopBar status={status} />
          <Outlet />
        </div>
      </div>
      <AiAssistant />
    </div>
  );
}
