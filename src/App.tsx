import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import RealtimeToast from '@/components/RealtimeToast';
import NotFound from '@/pages/NotFound';

function lazyWithRetry<T extends React.ComponentType<object>>(
  importer: () => Promise<{ default: T }>,
  chunkName: string,
) {
  return lazy(async () => {
    const retryKey = `xmt:lazy-retry:${chunkName}`;

    try {
      const module = await importer();
      sessionStorage.removeItem(retryKey);
      return module;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isChunkLoadError =
        /Failed to fetch dynamically imported module/i.test(message) ||
        /Importing a module script failed/i.test(message) ||
        /error loading dynamically imported module/i.test(message);

      if (isChunkLoadError && typeof window !== 'undefined') {
        const hasRetried = sessionStorage.getItem(retryKey) === '1';

        if (!hasRetried) {
          sessionStorage.setItem(retryKey, '1');
          window.location.reload();
          return new Promise<never>(() => {});
        }

        sessionStorage.removeItem(retryKey);
      }

      throw error;
    }
  });
}

const Login = lazyWithRetry(() => import('@/pages/Login'), 'Login');
const Home = lazyWithRetry(() => import('@/pages/Home'), 'Home');
const Topics = lazyWithRetry(() => import('@/pages/Topics'), 'Topics');
const TopicDetail = lazyWithRetry(() => import('@/pages/TopicDetail'), 'TopicDetail');
const AddTopic = lazyWithRetry(() => import('@/pages/AddTopic'), 'AddTopic');
const Production = lazyWithRetry(() => import('@/pages/Production'), 'Production');
const ProductionDetail = lazyWithRetry(() => import('@/pages/ProductionDetail'), 'ProductionDetail');
const Shooting = lazyWithRetry(() => import('@/pages/Shooting'), 'Shooting');
const ShootingDetail = lazyWithRetry(() => import('@/pages/ShootingDetail'), 'ShootingDetail');
const Publishing = lazyWithRetry(() => import('@/pages/Publishing'), 'Publishing');
const PublishingDetail = lazyWithRetry(() => import('@/pages/PublishingDetail'), 'PublishingDetail');
const Analytics = lazyWithRetry(() => import('@/pages/Analytics'), 'Analytics');
const Users = lazyWithRetry(() => import('@/pages/Users'), 'Users');
const Resources = lazyWithRetry(() => import('@/pages/Resources'), 'Resources');
const Messages = lazyWithRetry(() => import('@/pages/Messages'), 'Messages');
const Kanban = lazyWithRetry(() => import('@/pages/Kanban'), 'Kanban');
const CalendarPage = lazyWithRetry(() => import('@/pages/Calendar'), 'CalendarPage');
const Inspirations = lazyWithRetry(() => import('@/pages/Inspirations'), 'Inspirations');
const Achievements = lazyWithRetry(() => import('@/pages/Achievements'), 'Achievements');
const ActivityLog = lazyWithRetry(() => import('@/pages/ActivityLog'), 'ActivityLog');
const DouyinAnalytics = lazyWithRetry(() => import('@/pages/DouyinAnalytics'), 'DouyinAnalytics');
const PermissionManagement = lazyWithRetry(() => import('@/pages/PermissionManagement'), 'PermissionManagement');
const WorkflowDesigner = lazyWithRetry(() => import('@/pages/WorkflowDesigner'), 'WorkflowDesigner');
const NotificationSettings = lazyWithRetry(() => import('@/pages/NotificationSettings'), 'NotificationSettings');
const ExportPage = lazyWithRetry(() => import('@/pages/ExportPage'), 'ExportPage');
const PomodoroPage = lazyWithRetry(() => import('@/pages/PomodoroPage'), 'PomodoroPage');
const BackupPage = lazyWithRetry(() => import('@/pages/BackupPage'), 'BackupPage');

function PageLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#5c7cfa]/20 border-t-[#5c7cfa]" />
        <p className="text-xs font-medium text-[#636983]">加载中...</p>
      </div>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    const savedTheme = (localStorage.getItem('xmt_theme') as 'light' | 'dark') || 'dark';
    document.documentElement.className = savedTheme;
  }, []);

  return (
    <ErrorBoundary>
      <RealtimeToast />
      <Router>
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/topics" element={<Topics />} />
                <Route path="/topics/add" element={<AddTopic />} />
                <Route path="/topics/:id" element={<TopicDetail />} />
                <Route path="/production" element={<Production />} />
                <Route path="/production/:id" element={<ProductionDetail />} />
                <Route path="/shooting" element={<Shooting />} />
                <Route path="/shooting/:id" element={<ShootingDetail />} />
                <Route path="/publishing" element={<Publishing />} />
                <Route path="/publishing/:id" element={<PublishingDetail />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/users" element={<Users />} />
                <Route path="/resources" element={<Resources />} />
                <Route path="/messages" element={<Messages />} />
                <Route path="/kanban" element={<Kanban />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/inspirations" element={<Inspirations />} />
                <Route path="/achievements" element={<Achievements />} />
                <Route path="/activity" element={<ActivityLog />} />
                <Route path="/douyin" element={<DouyinAnalytics />} />
                <Route path="/permissions" element={<PermissionManagement />} />
                <Route path="/workflow-designer" element={<WorkflowDesigner />} />
                <Route path="/notification-settings" element={<NotificationSettings />} />
                <Route path="/export" element={<ExportPage />} />
                <Route path="/pomodoro" element={<PomodoroPage />} />
                <Route path="/backup" element={<BackupPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </Router>
    </ErrorBoundary>
  );
}
