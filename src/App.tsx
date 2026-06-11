import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import ErrorBoundary from "@/components/ErrorBoundary";
import RealtimeToast from "@/components/RealtimeToast";

function lazyWithRetry<T extends React.ComponentType<any>>(
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

const Login = lazyWithRetry(() => import("@/pages/Login"), "Login");
const Home = lazyWithRetry(() => import("@/pages/Home"), "Home");
const Topics = lazyWithRetry(() => import("@/pages/Topics"), "Topics");
const TopicDetail = lazyWithRetry(() => import("@/pages/TopicDetail"), "TopicDetail");
const AddTopic = lazyWithRetry(() => import("@/pages/AddTopic"), "AddTopic");
const Production = lazyWithRetry(() => import("@/pages/Production"), "Production");
const ProductionDetail = lazyWithRetry(() => import("@/pages/ProductionDetail"), "ProductionDetail");
const Shooting = lazyWithRetry(() => import("@/pages/Shooting"), "Shooting");
const ShootingDetail = lazyWithRetry(() => import("@/pages/ShootingDetail"), "ShootingDetail");
const Publishing = lazyWithRetry(() => import("@/pages/Publishing"), "Publishing");
const PublishingDetail = lazyWithRetry(() => import("@/pages/PublishingDetail"), "PublishingDetail");
const Analytics = lazyWithRetry(() => import("@/pages/Analytics"), "Analytics");
const Users = lazyWithRetry(() => import("@/pages/Users"), "Users");
const Resources = lazyWithRetry(() => import("@/pages/Resources"), "Resources");
const Messages = lazyWithRetry(() => import("@/pages/Messages"), "Messages");
const Kanban = lazyWithRetry(() => import("@/pages/Kanban"), "Kanban");
const CalendarPage = lazyWithRetry(() => import("@/pages/Calendar"), "CalendarPage");
const Inspirations = lazyWithRetry(() => import("@/pages/Inspirations"), "Inspirations");
const Achievements = lazyWithRetry(() => import("@/pages/Achievements"), "Achievements");
const ActivityLog = lazyWithRetry(() => import("@/pages/ActivityLog"), "ActivityLog");
const DouyinAnalytics = lazyWithRetry(() => import("@/pages/DouyinAnalytics"), "DouyinAnalytics");
const PermissionManagement = lazyWithRetry(() => import("@/pages/PermissionManagement"), "PermissionManagement");
const WorkflowDesigner = lazyWithRetry(() => import("@/pages/WorkflowDesigner"), "WorkflowDesigner");
const NotificationSettings = lazyWithRetry(() => import("@/pages/NotificationSettings"), "NotificationSettings");
const ExportPage = lazyWithRetry(() => import("@/pages/ExportPage"), "ExportPage");
const PomodoroPage = lazyWithRetry(() => import("@/pages/PomodoroPage"), "PomodoroPage");
const BackupPage = lazyWithRetry(() => import("@/pages/BackupPage"), "BackupPage");

function PageLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#5c7cfa]/20 border-t-[#5c7cfa]"></div>
        <p className="text-xs font-medium text-[#636983]">Мгдижа...</p>
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
            <Route path="/" element={
              <Layout>
                <Home />
              </Layout>
            } />
            <Route path="/topics" element={
              <Layout>
                <Topics />
              </Layout>
            } />
            <Route path="/topics/add" element={
              <Layout>
                <AddTopic />
              </Layout>
            } />
            <Route path="/topics/:id" element={
              <Layout>
                <TopicDetail />
              </Layout>
            } />
            <Route path="/production" element={
              <Layout>
                <Production />
              </Layout>
            } />
            <Route path="/production/:id" element={
              <Layout>
                <ProductionDetail />
              </Layout>
            } />
            <Route path="/shooting" element={
              <Layout>
                <Shooting />
              </Layout>
            } />
            <Route path="/shooting/:id" element={
              <Layout>
                <ShootingDetail />
              </Layout>
            } />
            <Route path="/publishing" element={
              <Layout>
                <Publishing />
              </Layout>
            } />
            <Route path="/publishing/:id" element={
              <Layout>
                <PublishingDetail />
              </Layout>
            } />
            <Route path="/analytics" element={
              <Layout>
                <Analytics />
              </Layout>
            } />
            <Route path="/users" element={
              <Layout>
                <Users />
              </Layout>
            } />
            <Route path="/resources" element={
              <Layout>
                <Resources />
              </Layout>
            } />
            <Route path="/messages" element={
              <Layout>
                <Messages />
              </Layout>
            } />
            <Route path="/kanban" element={
              <Layout>
                <Kanban />
              </Layout>
            } />
            <Route path="/calendar" element={
              <Layout>
                <CalendarPage />
              </Layout>
            } />
            <Route path="/inspirations" element={
              <Layout>
                <Inspirations />
              </Layout>
            } />
            <Route path="/achievements" element={
              <Layout>
                <Achievements />
              </Layout>
            } />
            <Route path="/activity" element={
              <Layout>
                <ActivityLog />
              </Layout>
            } />
            <Route path="/douyin" element={
              <Layout>
                <DouyinAnalytics />
              </Layout>
            } />
            <Route path="/permissions" element={
              <Layout>
                <PermissionManagement />
              </Layout>
            } />
            <Route path="/workflow-designer" element={
              <Layout>
                <WorkflowDesigner />
              </Layout>
            } />
            <Route path="/notification-settings" element={
              <Layout>
                <NotificationSettings />
              </Layout>
            } />
            <Route path="/export" element={
              <Layout>
                <ExportPage />
              </Layout>
            } />
            <Route path="/pomodoro" element={
              <Layout>
                <PomodoroPage />
              </Layout>
            } />
            <Route path="/backup" element={
              <Layout>
                <BackupPage />
              </Layout>
            } />
          </Routes>
        </Suspense>
      </Router>
    </ErrorBoundary>
  );
}
