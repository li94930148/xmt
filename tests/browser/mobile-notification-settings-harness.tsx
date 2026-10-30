import { createRoot } from 'react-dom/client';
import { createMemoryRouter, Outlet, RouterProvider, useNavigate } from 'react-router-dom';
import MobileNotificationSettings from '../../src/pages/mobile/MobileNotificationSettings';
import { useAuthStore } from '../../src/store';
import { RouteNavigationGuardProvider } from '../../src/hooks/useRouteNavigationGuard';
import '../../src/index.css';

useAuthStore.setState({
  token: 'mobile-notification-fixture',
  user: {
    id: 73,
    username: 'mobile-notification-fixture',
    email: 'mobile-notification@example.test',
    role: 'editor',
    name: '通知设置验收',
    enabled: true,
    created_at: '2026-10-30T00:00:00.000Z',
    updated_at: '2026-10-30T00:00:00.000Z',
  },
  isLoggedIn: true,
});

function FixtureLayout() {
  return <RouteNavigationGuardProvider><Outlet /></RouteNavigationGuardProvider>;
}

function PersonalSettingsFixture() {
  const navigate = useNavigate();
  return <main className="min-h-screen bg-studio-app p-4 text-studio-text-primary">
    <h1>个人设置夹具</h1>
    <button type="button" onClick={() => navigate('/notification-settings')}>返回通知偏好夹具</button>
  </main>;
}

const router = createMemoryRouter([
  {
    element: <FixtureLayout />,
    children: [
      { path: '/notification-settings', element: <main className="min-h-screen bg-studio-app p-4 text-studio-text-primary"><MobileNotificationSettings /></main> },
      { path: '/me', element: <PersonalSettingsFixture /> },
    ],
  },
], { initialEntries: ['/me', '/notification-settings'], initialIndex: 1 });

createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
