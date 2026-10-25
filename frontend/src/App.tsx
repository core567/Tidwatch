import { Navigate, Route, BrowserRouter as Router, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppLayout from './app/layout/AppLayout';
import OverviewPage from './pages/P01Overview/OverviewPage';
import ReachDetailPage from './pages/P02ReachDetail/ReachDetailPage';
import EventsPage from './pages/P03Events/EventsPage';
import WorkbenchPage from './pages/P04Workbench/WorkbenchPage';
import TasksPage from './pages/P05Tasks/TasksPage';
import EvidencePage from './pages/P06Evidence/EvidencePage';
import River3DPage from './pages/P07River3D/River3DPage';
import ReviewsPage from './pages/P08Reviews/ReviewsPage';
import ReportsPage from './pages/P09Reports/ReportsPage';
import MobilePage from './pages/P10Mobile/MobilePage';
import FieldVoicePage from './pages/P11FieldVoice/FieldVoicePage';
import AdminPage from './pages/P12Admin/AdminPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function DisposalEventRedirect() {
  const { eventId } = useParams();
  return <Navigate to={`/events/${eventId}/workbench`} replace />;
}

function ReviewEventRedirect() {
  const { eventId } = useParams();
  return <Navigate to={`/reviews/${eventId}`} replace />;
}

/**
 * 六页导航在阶段 B 先指向现有可用页面，后续阶段逐页替换为真实新页面。
 * 旧路由全部保留，直到对应新页面验收通过。
 */
export default function App() {
  // V1.0 本地演示模式：免登录，打开即进入综合监测总览
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route element={<AppLayout />}>
            {/* 01 智慧监测总览 */}
            <Route path="/" element={<OverviewPage />} />

            {/* 02 水环境分析（阶段 G 上线真实页面） */}
            <Route path="/analysis" element={<Navigate to="/reaches/reach-c" replace />} />
            <Route path="/reaches/:reachId" element={<ReachDetailPage />} />

            {/* 03 异常研判与处置（阶段 D 上线三栏工作台） */}
            <Route path="/disposal" element={<Navigate to="/events" replace />} />
            <Route path="/disposal/:eventId" element={<DisposalEventRedirect />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:eventId/workbench" element={<WorkbenchPage />} />
            <Route path="/evidence" element={<EvidencePage />} />
            <Route path="/river-3d" element={<River3DPage />} />

            {/* 04 巡检协同中心（阶段 E 上线） */}
            <Route path="/inspection" element={<Navigate to="/tasks" replace />} />
            <Route path="/tasks" element={<TasksPage />} />

            {/* 05 事件复盘与报告（阶段 F 上线事件复盘列表；暂落月报/频次页） */}
            <Route path="/review" element={<Navigate to="/reports" replace />} />
            <Route path="/review/:eventId" element={<ReviewEventRedirect />} />
            <Route path="/reviews/:eventId" element={<ReviewsPage />} />
            <Route path="/reviews" element={<Navigate to="/events" replace />} />
            <Route path="/reports" element={<ReportsPage />} />

            {/* 06 数据与系统管理（阶段 G 迁移 P12/P10/P11） */}
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/mobile" element={<MobilePage />} />
            <Route path="/field-voice" element={<FieldVoicePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
