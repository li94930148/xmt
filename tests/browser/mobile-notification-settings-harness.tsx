import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MobileNotificationSettings from '../../src/pages/mobile/MobileNotificationSettings';
import { useAuthStore } from '../../src/store';
import '../../src/index.css';

useAuthStore.setState({ token: 'mobile-notification-fixture' });

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/notification-settings']}>
    <Routes>
      <Route path="/notification-settings" element={<main className="min-h-screen bg-studio-app p-4 text-studio-text-primary"><MobileNotificationSettings /></main>} />
    </Routes>
  </MemoryRouter>,
);
