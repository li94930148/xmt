import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import ErrorBoundary from "@/components/ErrorBoundary";
import RealtimeToast from "@/components/RealtimeToast";

// 懒加载页面组件
const Login = lazy(() => import("@/pages/Login"));
const Home = lazy(() => import("@/pages/Home"));
const Topics = lazy(() => import("@/pages/Topics"));
const TopicDetail = lazy(() => import("@/pages/TopicDetail"));
const AddTopic = lazy(() => import("@/pages/AddTopic"));
const Production = lazy(() => import("@/pages/Production"));
const ProductionDetail = lazy(() => import("@/pages/ProductionDetail"));
const Shooting = lazy(() => import("@/pages/Shooting"));
const ShootingDetail = lazy(() => import("@/pages/ShootingDetail"));
const Publishing = lazy(() => import("@/pages/Publishing"));
const PublishingDetail = lazy(() => import("@/pages/PublishingDetail"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Users = lazy(() => import("@/pages/Users"));
const Resources = lazy(() => import("@/pages/Resources"));
const Messages = lazy(() => import("@/pages/Messages"));
const Kanban = lazy(() => import("@/pages/Kanban"));
const CalendarPage = lazy(() => import("@/pages/Calendar"));
const Inspirations = lazy(() => import("@/pages/Inspirations"));
const Achievements = lazy(() => import("@/pages/Achievements"));
const ActivityLog = lazy(() => import("@/pages/ActivityLog"));
const DouyinAnalytics = lazy(() => import("@/pages/DouyinAnalytics"));
const PermissionManagement = lazy(() => import("@/pages/PermissionManagement"));
const WorkflowDesigner = lazy(() => import("@/pages/WorkflowDesigner"));
const NotificationSettings = lazy(() => import("@/pages/NotificationSettings"));
const ExportPage = lazy(() => import("@/pages/ExportPage"));
const PomodoroPage = lazy(() => import("@/pages/PomodoroPage"));
const BackupPage = lazy(() => import("@/pages/BackupPage"));

// 加载中占位
function PageLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-[3px] border-[#5c7cfa]/20 border-t-[#5c7cfa] rounded-full animate-spin"></div>
        <p className="text-xs text-[#636983] font-medium">加载中...</p>
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
