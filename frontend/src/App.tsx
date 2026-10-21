import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppLayout from './app/layout/AppLayout';
import LoginPage from './pages/Login/LoginPage';
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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/reaches/:reachId" element={<ReachDetailPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/:eventId/workbench" element={<WorkbenchPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/evidence" element={<EvidencePage />} />
            <Route path="/river-3d" element={<River3DPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/mobile" element={<MobilePage />} />
            <Route path="/field-voice" element={<FieldVoicePage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
