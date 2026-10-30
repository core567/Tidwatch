import { lazy, Suspense } from 'react';
import { Navigate, Route, BrowserRouter as Router, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppLayout from './app/layout/AppLayout';
import OverviewPage from './pages/P01Overview/OverviewPage';
import ReachDetailPage from './pages/P02ReachDetail/ReachDetailPage';
import AnalysisPage from './pages/Analysis/AnalysisPage';
import EventsPage from './pages/P03Events/EventsPage';
import WorkbenchPage from './pages/P04Workbench/WorkbenchPage';
import TasksPage from './pages/P05Tasks/TasksPage';
import EvidencePage from './pages/P06Evidence/EvidencePage';
import ReviewListPage from './pages/Review/ReviewListPage';
import EventReviewPage from './pages/Review/EventReviewPage';
// P08 旧研判单组件保留在代码库（pages/P08Reviews），路由已合并到 /review/:id
import ReportsPage from './pages/P09Reports/ReportsPage';
import MobilePage from './pages/P10Mobile/MobilePage';
import FieldVoicePage from './pages/P11FieldVoice/FieldVoicePage';
import AdminPage from './pages/Admin/AdminPage';
// 旧 P12 管理页源文件保留（pages/P12Admin），G2 后 /admin 使用分类管理页
// 3D 页（含 three.js 与 PBR 纹理）体积大，懒加载使其他页面不承担其首屏成本。
const MonitorPage = lazy(() => import('./pages/Monitor/MonitorPage'));

function MonitorRoute() {
  return (
    <Suspense
      fallback={
        <div className="state-box" style={{ height: 'calc(100vh - var(--tw-topbar-h) - 48px)' }}>
          3D 监测页加载中…
        </div>
      }
    >
      <MonitorPage />
    </Suspense>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function DisposalEventRedirect() {
  const { eventId } = useParams();
  return <Navigate to={`/events/${eventId}/workbench`} replace />;
}

/** 旧研判单链接统一跳转到新版正式复盘详情（F5 合并）。 */
function LegacyReviewRedirect() {
  const { eventId } = useParams();
  return <Navigate to={`/review/${eventId}`} replace />;
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
            {/* 01 智慧监测总览：卡片式总览为首页；3D 数字空间在 /monitor（独立开发） */}
            <Route path="/" element={<OverviewPage />} />
            <Route path="/monitor" element={<MonitorRoute />} />

            {/* 02 水环境分析（阶段 G 上线真实页面） */}
            {/* 02 水环境分析正式页；旧 P02 单断面详情保留 */}
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/reaches/:reachId" element={<ReachDetailPage />} />

            {/* 03 异常研判与处置（阶段 D 上线三栏工作台） */}
            <Route path="/disposal" element={<Navigate to="/events" replace />} />
            <Route path="/disposal/:eventId" element={<DisposalEventRedirect />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:eventId/workbench" element={<WorkbenchPage />} />
            <Route path="/evidence" element={<EvidencePage />} />
            {/* 3D 数字空间：新旧入口统一到 MonitorPage；旧 P07 文件保留待验收后清理 */}
            <Route path="/river-3d" element={<MonitorRoute />} />

            {/* 04 巡检协同中心（阶段 E 上线） */}
            <Route path="/inspection" element={<Navigate to="/tasks" replace />} />
            <Route path="/tasks" element={<TasksPage />} />

            {/* 05 事件复盘与报告（阶段 F 上线事件复盘列表；暂落月报/频次页） */}
            {/* 05 事件复盘：/review 列表（F2）、/review/:id 详情（F3） */}
            <Route path="/review" element={<ReviewListPage />} />
            <Route path="/review/:eventId" element={<EventReviewPage />} />
            {/* 旧研判单路由保留为兼容跳转，指向新版复盘详情 */}
            <Route path="/reviews/:eventId" element={<LegacyReviewRedirect />} />
            <Route path="/reviews" element={<Navigate to="/review" replace />} />
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
