import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createBrowserRouter, Navigate, Route, Routes, RouterProvider, useNavigate } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import Layout from '@/components/Layout';
import ProtectedRoute from '@/components/ProtectedRoute';
import RealtimeToast from '@/components/RealtimeToast';
import RoleGuard from '@/components/RoleGuard';
import NotFound from '@/pages/NotFound';
import { isAndroid } from '@/platform/runtime';
import { shouldUseMobileLayout } from '@/platform/mobile-layout';
import { useAppStore, useAuthStore } from '@/store';
import { installNativeAuthRuntime, refreshNativeSession } from '@/auth/native/native-auth-runtime';
import { nativeRefreshCredentials, nativeUserProfile } from '@/auth/native/secure-credentials';
import { getPublicSystemSettings } from '@/api/systemSettings';
import { resolveInitialTheme } from '@/lib/systemSettings';
import { RouteNavigationGuardProvider } from '@/hooks/useRouteNavigationGuard';
import { revokeMobileDevice } from '@/api';
import { apiFetch } from '@/api/transport';

function LogoutRedirect() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const token = useAuthStore((state) => state.token);
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    if (isAndroid() && token) {
      void revokeMobileDevice().catch(() => undefined);
      void apiFetch('/v1/auth/mobile/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined);
      void nativeRefreshCredentials.clear().catch(() => undefined);
      nativeUserProfile.clear();
    }
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate, token]);

  return <PageLoading />;
}

function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
}

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
const MobileHome = lazyWithRetry(() => import('@/pages/mobile/MobileHome'), 'MobileHome');
const Topics = lazyWithRetry(() => import('@/pages/Topics'), 'Topics');
const MobileTopics = lazyWithRetry(() => import('@/pages/mobile/MobileTopics'), 'MobileTopics');
const MobileMessages = lazyWithRetry(() => import('@/pages/mobile/MobileMessages'), 'MobileMessages');
const MobileMe = lazyWithRetry(() => import('@/pages/mobile/MobileMe'), 'MobileMe');
const MobileNotificationSettings = lazyWithRetry(() => import('@/pages/mobile/MobileNotificationSettings'), 'MobileNotificationSettings');
const MobileDaily = lazyWithRetry(() => import('@/pages/mobile/MobileDaily'), 'MobileDaily');
const MobileTopicDetail = lazyWithRetry(() => import('@/pages/mobile/MobileTopicDetail'), 'MobileTopicDetail');
const MobileAddTopic = lazyWithRetry(() => import('@/pages/mobile/MobileAddTopic'), 'MobileAddTopic');
const MobileWorkHub = lazyWithRetry(() => import('@/pages/mobile/MobileWorkHub'), 'MobileWorkHub');
const MobileProduction = lazyWithRetry(() => import('@/pages/mobile/MobileProduction'), 'MobileProduction');
const MobileProductionEditor = lazyWithRetry(() => import('@/pages/mobile/MobileProductionEditor'), 'MobileProductionEditor');
const TopicDetail = lazyWithRetry(() => import('@/pages/TopicDetail'), 'TopicDetail');
const AddTopic = lazyWithRetry(() => import('@/pages/AddTopic'), 'AddTopic');
const Production = lazyWithRetry(() => import('@/pages/Production'), 'Production');
const ProductionDetail = lazyWithRetry(() => import('@/pages/ProductionDetail'), 'ProductionDetail');
const Shooting = lazyWithRetry(() => import('@/pages/Shooting'), 'Shooting');
const ShootingDetail = lazyWithRetry(() => import('@/pages/ShootingDetail'), 'ShootingDetail');
const Publishing = lazyWithRetry(() => import('@/pages/Publishing'), 'Publishing');
const PublishingDetail = lazyWithRetry(() => import('@/pages/PublishingDetail'), 'PublishingDetail');
const Analytics = lazyWithRetry(() => import('@/pages/Analytics'), 'Analytics');
const ContentTimelineView = lazyWithRetry(() => import('@/pages/ContentTimelineView'), 'ContentTimelineView');
const ContentLab = lazyWithRetry(() => import('@/pages/ContentLab'), 'ContentLab');
const Users = lazyWithRetry(() => import('@/pages/Users'), 'Users');
const AssetCenter = lazyWithRetry(() => import('@/pages/AssetCenter'), 'AssetCenter');
const ContentTopicAssets = lazyWithRetry(() => import('@/pages/ContentTopicAssets'), 'ContentTopicAssets');
const ResourceLibrary = lazyWithRetry(() => import('@/pages/ResourceLibrary'), 'ResourceLibrary');
const KnowledgeLibrary = lazyWithRetry(() => import('@/pages/KnowledgeLibrary'), 'KnowledgeLibrary');
const ResourceDetail = lazyWithRetry(() => import('@/pages/ResourceDetail'), 'ResourceDetail');
const ResourceSearch = lazyWithRetry(() => import('@/pages/ResourceSearch'), 'ResourceSearch');
const PublishedArchives = lazyWithRetry(() => import('@/pages/Resources'), 'PublishedArchives');
const Messages = lazyWithRetry(() => import('@/pages/Messages'), 'Messages');
const CalendarPage = lazyWithRetry(() => import('@/pages/Calendar'), 'CalendarPage');
const Inspirations = lazyWithRetry(() => import('@/pages/Inspirations'), 'Inspirations');
const Achievements = lazyWithRetry(() => import('@/pages/Achievements'), 'Achievements');
const ActivityLog = lazyWithRetry(() => import('@/pages/ActivityLog'), 'ActivityLog');
const CreatorDashboard = lazyWithRetry(() => import('@/pages/creator-center/CreatorDashboard'), 'CreatorDashboard');
const CreatorWorks = lazyWithRetry(() => import('@/pages/creator-center/CreatorWorks'), 'CreatorWorks');
const CreatorWorkDetail = lazyWithRetry(() => import('@/pages/creator-center/CreatorWorkDetail'), 'CreatorWorkDetail');
const CreatorTrends = lazyWithRetry(() => import('@/pages/creator-center/CreatorTrends'), 'CreatorTrends');
const CreatorReports = lazyWithRetry(() => import('@/pages/creator-center/CreatorReports'), 'CreatorReports');
const PermissionManagement = lazyWithRetry(() => import('@/pages/PermissionManagement'), 'PermissionManagement');
const AnonymousFeedbackAdmin = lazyWithRetry(() => import('@/pages/AnonymousFeedbackAdmin'), 'AnonymousFeedbackAdmin');
const AnonymousFeedback = lazyWithRetry(() => import('@/pages/AnonymousFeedback'), 'AnonymousFeedback');
const WorkflowDesigner = lazyWithRetry(() => import('@/pages/WorkflowDesigner'), 'WorkflowDesigner');
const TemplateManagement = lazyWithRetry(() => import('@/pages/TemplateManagement'), 'TemplateManagement');
const NotificationSettings = lazyWithRetry(() => import('@/pages/NotificationSettings'), 'NotificationSettings');
const ExportPage = lazyWithRetry(() => import('@/pages/ExportPage'), 'ExportPage');
const PomodoroPage = lazyWithRetry(() => import('@/pages/PomodoroPage'), 'PomodoroPage');
const BackupPage = lazyWithRetry(() => import('@/pages/BackupPage'), 'BackupPage');
const DailyReportPage = lazyWithRetry(() => import('@/pages/DailyReportPage'), 'DailyReportPage');
const RetrospectivesPage = lazyWithRetry(() => import('@/pages/RetrospectivesPage'), 'RetrospectivesPage');
const RetrospectiveDetailPage = lazyWithRetry(() => import('@/pages/RetrospectiveDetailPage'), 'RetrospectiveDetailPage');
const AuthRolloutStatus = lazyWithRetry(() => import('@/pages/AuthRolloutStatus'), 'AuthRolloutStatus');

function PageLoading() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-studio-primary/20 border-t-studio-cyan" />
        <p className="text-xs font-medium text-studio-text-muted">加载中...</p>
      </div>
    </div>
  );
}

/**
 * Runs before route guards so a cold Android start can exchange the Keystore
 * refresh credential for an in-memory access token. Layout is protected, so
 * placing this there would always redirect a restored session to /login first.
 */
function NativeSessionBootstrap({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((state) => state.token);
  const tokenAtBoot = useRef(token);
  const [ready, setReady] = useState(() => !isAndroid());

  useEffect(() => {
    if (!isAndroid()) return;
    const removeRuntime = installNativeAuthRuntime();
    let cancelled = false;

    void (async () => {
      if (!tokenAtBoot.current) {
        try {
          await refreshNativeSession();
        } catch {
          await nativeRefreshCredentials.clear().catch(() => undefined);
          nativeUserProfile.clear();
        }
      }
      if (!cancelled) setReady(true);
    })();

    return () => {
      cancelled = true;
      removeRuntime();
    };
  }, []);

  return ready ? children : <PageLoading />;
}

function AppRoutes() {
  const [mobileLayout] = useState(() => shouldUseMobileLayout(isAndroid(), window.innerWidth));

  return (
      <RouteNavigationGuardProvider>
        <NativeSessionBootstrap>
          <Suspense fallback={<PageLoading />}>
            <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/logout" element={<LogoutRedirect />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout mobileLayout={mobileLayout} />}>
<Route path="/" element={mobileLayout ? <MobileHome /> : <Home />} />
                <Route path="/home" element={mobileLayout ? <MobileHome /> : <Home />} />
                <Route path="/dashboard" element={mobileLayout ? <MobileHome /> : <Home />} />
                <Route path="/topics" element={mobileLayout ? <MobileTopics /> : <Topics />} />
                <Route element={<RoleGuard permissions={['topic:create']} />}>
                  <Route path="/topics/add" element={mobileLayout ? <MobileAddTopic /> : <AddTopic />} />
                </Route>
                <Route path="/topics/:id" element={mobileLayout ? <MobileTopicDetail /> : <TopicDetail />} />
                <Route path="/production" element={mobileLayout ? <MobileWorkHub /> : <Production />} />
                <Route path="/production/content" element={mobileLayout ? <MobileProduction /> : <Production />} />
                <Route path="/production/content/:id" element={mobileLayout ? <MobileProductionEditor /> : <ProductionDetail />} />
                <Route path="/production/:id" element={mobileLayout ? <MobileProductionEditor /> : <ProductionDetail />} />
                <Route path="/shooting/:id" element={<ShootingDetail />} />
                <Route path="/publishing/:id" element={<PublishingDetail />} />
                <Route path="/resources" element={<Navigate replace to="/asset-center" />} />
                <Route path="/asset-center" element={<AssetCenter />} />
                <Route path="/asset-center/published-archives" element={<PublishedArchives />} />
                <Route path="/asset-center/content-topics" element={<ContentTopicAssets />} />
                <Route path="/asset-center/resources" element={<ResourceLibrary />} />
                <Route path="/asset-center/resources/:id" element={<ResourceDetail />} />
                <Route path="/asset-center/knowledge" element={<KnowledgeLibrary />} />
                <Route path="/asset-center/search" element={<ResourceSearch />} />
                <Route path="/asset-center/projects" element={<ResourceLibrary fixedLibraryType="project" />} />
                <Route path="/asset-center/media" element={<ResourceLibrary fixedLibraryType="media" />} />
                <Route path="/messages" element={mobileLayout ? <MobileMessages /> : <Messages />} />
                <Route path="/kanban" element={<Navigate replace to="/topics?view=board" state={{ mobileReturnTo: '/production' }} />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/inspirations" element={<Inspirations />} />
                <Route path="/achievements" element={<Achievements />} />
                <Route path="/anonymous-feedback" element={<AnonymousFeedback />} />
                <Route path="/me" element={<MobileMe />} />
                <Route path="/notification-settings" element={isAndroid() ? <MobileNotificationSettings /> : <NotificationSettings />} />
                <Route path="/pomodoro" element={<PomodoroPage />} />
                <Route element={<RoleGuard permissions={['workflow:shooting']} />}>
                  <Route path="/shooting" element={<Shooting />} />
                </Route>
                <Route element={<RoleGuard permissions={['workflow:publishing']} />}>
                  <Route path="/publishing" element={<Publishing />} />
                </Route>
                <Route element={<RoleGuard permissions={['analytics:view']} />}>
                  <Route path="/analytics" element={<Analytics />} />
                </Route>
                <Route element={<RoleGuard permissions={['creator:data:view']} />}>
                  <Route path="/douyin-operations" element={<CreatorDashboard />} />
                  <Route path="/douyin-operations/:section" element={<CreatorDashboard />} />
                  <Route path="/douyin-creator-center" element={<CreatorDashboard />} />
                  <Route path="/analytics/creator-center" element={<CreatorDashboard />} />
                  <Route path="/analytics/creator-center/works" element={<CreatorWorks />} />
                  <Route path="/analytics/creator-center/reviews" element={<CreatorWorks reviewMode />} />
                  <Route path="/analytics/creator-center/content/:id" element={<CreatorWorkDetail />} />
                  <Route path="/analytics/creator-center/work/:id" element={<CreatorWorkDetail />} />
                  <Route path="/analytics/creator-center/trends" element={<CreatorTrends />} />
                </Route>
                <Route element={<RoleGuard permissions={['creator:report:view']} />}>
                  <Route path="/analytics/creator-center/reports" element={<CreatorReports />} />
                </Route>
                <Route element={<RoleGuard permissions={['analytics:view']} />}>
                </Route>
                <Route element={<RoleGuard permissions={['analytics:retro:view']} />}>
                  <Route path="/retrospectives" element={<RetrospectivesPage />} />
                  <Route path="/retrospectives/:id" element={<RetrospectiveDetailPage />} />
                </Route>
                <Route element={<RoleGuard permissions={['analytics:view']} />}>
                  <Route path="/content-timeline" element={<ContentTimelineView />} />
                  <Route path="/content-lab" element={<ContentLab />} />
                  <Route path="/collaboration-dashboard" element={<Navigate replace to="/content-lab?tab=collaboration-timeline" />} />
                  <Route path="/collaboration-ux" element={<Navigate replace to="/content-lab?tab=collaboration-experience" />} />
                  <Route path="/content-intelligence" element={<Navigate replace to="/content-lab?tab=insights" />} />
                  <Route path="/content-generation" element={<Navigate replace to="/content-lab?tab=generation" />} />
                  <Route path="/content-os" element={<Navigate replace to="/content-lab?tab=overview" />} />
                </Route>
                <Route element={<RoleGuard permissions={['user:logs']} />}>
                  <Route path="/activity" element={<ActivityLog />} />
                </Route>
                <Route element={<RoleGuard permissions={['system:douyin']} />}>
                  <Route path="/douyin" element={<CreatorDashboard />} />
                </Route>
                <Route element={<RoleGuard permissions={['system:template']} />}>
                  <Route path="/workflow-designer" element={<WorkflowDesigner />} />
                  <Route path="/templates" element={<TemplateManagement />} />
                </Route>
                <Route element={<RoleGuard permissions={['export:data']} />}>
                  <Route path="/export" element={<ExportPage />} />
                </Route>
                <Route path="/daily-report" element={mobileLayout ? <MobileDaily /> : <DailyReportPage />} />
                <Route path="/daily-report/team" element={<DailyReportPage />} />
                <Route path="/daily-report/summary" element={<DailyReportPage />} />
                <Route element={<RoleGuard permissions={['user:view']} />}>
                  <Route path="/users" element={<Users />} />
                </Route>
                <Route element={<RoleGuard permissions={['system:role', 'system:permission']} requireAll />}>
                  <Route path="/permissions" element={<PermissionManagement />} />
                </Route>
                <Route element={<RoleGuard permissions={['system:backup']} />}>
                  <Route path="/backup" element={<BackupPage />} />
                </Route>
                <Route element={<RoleGuard roles={['admin']} />}>
                  <Route path="/admin/anonymous-feedback" element={<AnonymousFeedbackAdmin />} />
                  <Route path="/admin/auth-rollout" element={<AuthRolloutStatus />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </NativeSessionBootstrap>
      </RouteNavigationGuardProvider>
  );
}

const appRouter = createBrowserRouter([{ path: '*', element: <AppRoutes /> }]);

export default function App() {
  const setTheme = useAppStore((state) => state.setTheme);
  useEffect(() => {
    const applySystemDefault = async () => {
      try {
        const settings = await getPublicSystemSettings();
        const preference = localStorage.getItem('xmt_theme');
        setTheme(resolveInitialTheme(preference, settings.system.defaultTheme), false);
      } catch {
        // Keep the existing local/default theme if the public settings endpoint is unavailable.
      }
    };

    try {
      const preference = localStorage.getItem('xmt_theme');
      if (preference === 'light' || preference === 'dark') {
        applyTheme(preference);
      } else {
        void applySystemDefault();
      }
    } catch {
      void applySystemDefault();
    }

    window.addEventListener('xmt-settings-changed', applySystemDefault);
    return () => window.removeEventListener('xmt-settings-changed', applySystemDefault);
  }, [setTheme]);

  return (
    <ErrorBoundary>
      <RealtimeToast />
      <RouterProvider router={appRouter} />
    </ErrorBoundary>
  );
}
