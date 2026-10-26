import { createRoot } from 'react-dom/client';
import AnnouncementStrip from '../../src/components/AnnouncementStrip';
import { useAuthStore } from '../../src/store';
import type { User } from '../../src/types';
import '../../src/index.css';

const role = new URLSearchParams(window.location.search).get('role') === 'editor' ? 'editor' : 'admin';
const fixtureUser = {
  id: 901,
  username: 'announcement-strip-qa',
  name: '公告条验收',
  role,
  email: 'announcement-strip@example.invalid',
  enabled: true,
  force_change_password: false,
} as User;
useAuthStore.setState({ user: fixtureUser, token: 'announcement-strip-fixture', isLoggedIn: true });

createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-studio-app p-4 text-studio-text-primary">
    <AnnouncementStrip />
  </main>,
);
