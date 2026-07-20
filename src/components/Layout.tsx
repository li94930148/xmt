import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, Moon, Search, Settings, Sun, User, LogOut, ChevronRight } from 'lucide-react';
import { getMe, getPublicSystemSettings, getUnreadCount } from '../api';
import { useAuthStore, useAppStore, useMessageStore } from '../store';
import { buildBreadcrumbs } from '../config/navigation';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import KeyboardHelp from './KeyboardHelp';
import UpdateNotification from './UpdateNotification';
import { useSocket } from '../hooks/useSocket';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { usePermission } from '../hooks/usePermission';
import { getRoleDisplayName } from '../lib/roles';
import { applyDocumentBranding } from '@/lib/systemSettings';
import { AnimatedPage, AppShell, Topbar } from '@/components/studio';

declare const __APP_VERSION__: string;

interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

function NotificationItem({ notification }: { notification: Notification }) {
  const removeNotification = useAppStore((state) => state.removeNotification);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      removeNotification(notification.id);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [notification.id, removeNotification]);

  const typeStyles: Record<Notification['type'], { bg: string; border: string; text: string; icon: string }> = {
    success: { bg: 'bg-[#51cf66]/10', border: 'border-[#51cf66]/30', text: 'text-[#51cf66]', icon: '✓' },
    error: { bg: 'bg-[#ff6b6b]/10', border: 'border-[#ff6b6b]/30', text: 'text-[#ff6b6b]', icon: '×' },
    warning: { bg: 'bg-[#ffd43b]/10', border: 'border-[#ffd43b]/30', text: 'text-[#ffd43b]', icon: '!' },
    info: { bg: 'bg-[#5c7cfa]/10', border: 'border-[#5c7cfa]/30', text: 'text-[#5c7cfa]', icon: 'i' },
  };

  const style = typeStyles[notification.type] || typeStyles.info;

  return (
    <div className={`max-w-sm rounded-xl border p-4 shadow-soft backdrop-blur-sm ${style.bg} ${style.border}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${style.bg} ${style.text}`}>
          {style.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${style.text}`}>{notification.title}</p>
          <p className="mt-1 text-xs opacity-80" style={{ color: 'var(--color-text-secondary)' }}>
            {notification.message}
          </p>
        </div>
        <button
          onClick={() => removeNotification(notification.id)}
          className="flex-shrink-0 text-current opacity-40 transition-opacity hover:opacity-70"
          aria-label="关闭通知"
        >
          <span className="text-sm">&times;</span>
        </button>
      </div>
    </div>
  );
}

function Breadcrumbs() {
  const location = useLocation();
  const crumbs = useMemo(() => buildBreadcrumbs(location.pathname), [location.pathname]);

  return (
    <nav aria-label="面包屑" className="flex flex-wrap items-center gap-2 text-sm text-theme-text-secondary">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <div key={`${crumb.label}-${index}`} className="flex items-center gap-2">
            {index > 0 && <ChevronRight className="h-4 w-4 opacity-45" />}
            {crumb.path && !isLast ? (
              <Link to={crumb.path} className="transition-colors hover:text-theme-text">
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-medium text-theme-text' : ''}>{crumb.label}</span>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function Layout() {
  const [loading, setLoading] = useState(true);
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const loginUser = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);

  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useAppStore((state) => state.toggleSidebar);
  const notifications = useAppStore((state) => state.notifications);
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const fontSize = useAppStore((state) => state.fontSize);
  const setSystemSettings = useAppStore((state) => state.setSystemSettings);
  const { hasPermission } = usePermission();

  const unreadCount = useMessageStore((state) => state.unreadCount);
  const setUnreadCount = useMessageStore((state) => state.setUnreadCount);

  useSocket();

  useKeyboardShortcuts({
    onCommandPalette: useCallback(() => setShowCmdPalette((value) => !value), []),
    onShowHelp: useCallback(() => setShowHelp(true), []),
    onEscape: useCallback(() => {
      setShowCmdPalette(false);
      setShowHelp(false);
      setUserMenuOpen(false);
      setMobileNavOpen(false);
    }, []),
  });

  useEffect(() => {
    document.documentElement.style.setProperty('--system-font-size', `${fontSize}px`);
    document.documentElement.style.fontSize = `${fontSize}px`;
  }, [fontSize]);

  useEffect(() => {
    let cancelled = false;

    const hydrateSystemSettings = async () => {
      try {
        const settings = await getPublicSystemSettings();
        if (cancelled) {
          return;
        }

        setSystemSettings(settings);
        applyDocumentBranding(settings);
      } catch {
        // Public branding fetch failure should not block app rendering.
      }
    };

    void hydrateSystemSettings();

    const handleSystemSettingsChanged = () => {
      void hydrateSystemSettings();
    };

    window.addEventListener('xmt-settings-changed', handleSystemSettingsChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('xmt-settings-changed', handleSystemSettingsChanged);
    };
  }, [setSystemSettings]);

  useEffect(() => {
    setMobileNavOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    let ignore = false;

    async function hydrateSession() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const nextUser = await getMe();
        if (ignore) {
          return;
        }

        loginUser(nextUser, token);

        try {
          const unread = await getUnreadCount();
          if (!ignore) {
            setUnreadCount(unread.unreadCount);
          }
        } catch {
          // 消息未读数失败不阻断页面进入
        }

        const lastSeenVersion = localStorage.getItem('xmt_last_version_seen');
        if (!ignore && lastSeenVersion !== __APP_VERSION__) {
          setShowUpdateNotification(true);
        }
      } catch {
        if (ignore) {
          return;
        }

        logout();
        navigate('/login', {
          replace: true,
          state: {
            from: {
              pathname: window.location.pathname,
              search: window.location.search,
              hash: window.location.hash,
            },
          },
        });
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    void hydrateSession();

    return () => {
      ignore = true;
    };
  }, [loginUser, logout, navigate, setUnreadCount, token]);

  useEffect(() => {
    if (user?.force_change_password && location.pathname !== '/notification-settings') {
      navigate('/notification-settings', {
        replace: true,
        state: {
          from: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
          },
        },
      });
    }
  }, [location.hash, location.pathname, location.search, navigate, user?.force_change_password]);

  const handleCloseUpdateNotification = useCallback(() => {
    setShowUpdateNotification(false);
    localStorage.setItem('xmt_last_version_seen', __APP_VERSION__);
  }, []);

  const handleGoToChangelog = useCallback(() => {
    navigate('/notification-settings');
    sessionStorage.setItem('xmt_show_changelog', 'true');
  }, [navigate]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  const settingsMenuLabel = hasPermission('system:settings') ? '设置中心' : '个人设置';

  if (loading) {
    return (
      <AppShell className="flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-10 w-10 animate-spin rounded-full border-3 border-studio-primary/20 border-t-studio-cyan"
            style={{ borderWidth: '3px' }}
          />
          <p className="text-sm font-medium text-studio-text-muted">加载中...</p>
        </div>
      </AppShell>
    );
  }

  const sidebarWidth = sidebarCollapsed ? '72px' : '232px';

  return (
    <AppShell
      className="md:grid md:h-screen md:overflow-hidden md:transition-[grid-template-columns] md:duration-300"
      style={{ gridTemplateColumns: `${sidebarWidth} minmax(0, 1fr)` }}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        theme={theme}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        onOpenCommandPalette={() => {
          setMobileNavOpen(false);
          setShowCmdPalette(true);
        }}
      />

      <div className="min-h-screen min-w-0 md:h-screen md:min-h-0 md:overflow-y-auto">
        <Topbar>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-button text-studio-text-secondary transition-colors hover:bg-white/[0.06] hover:text-studio-text-primary md:hidden"
              aria-label="打开导航菜单"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button onClick={() => setShowCmdPalette(true)} className="relative hidden min-w-0 items-center md:flex">
              <Search className="absolute left-3 h-4 w-4 text-studio-text-muted" />
              <div
                className="w-[min(18rem,34vw)] min-w-0 rounded-button border border-studio-border-soft bg-white/[0.05] py-2 pl-9 pr-16 text-left text-sm text-studio-text-muted transition-all duration-200 hover:border-studio-border-active"
              >
                搜索选题、稿件、成员...
              </div>
              <kbd
                className="absolute right-3 rounded border border-studio-border-soft px-1.5 py-0.5 text-[10px] text-studio-text-muted"
              >
                Ctrl K
              </kbd>
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => navigate('/messages')}
              className={`relative rounded-xl p-2.5 transition-all duration-200 ${
                theme === 'dark'
                  ? 'text-[#9aa0b0] hover:bg-[#1e2030] hover:text-[#e8eaed]'
                  : 'text-[#5f6672] hover:bg-[#f1f3f5] hover:text-[#1a1d2e]'
              }`}
              aria-label="打开消息中心"
            >
              <Bell className="h-[18px] w-[18px]" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#ff6b6b] px-1 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={toggleTheme}
              className={`rounded-xl p-2.5 transition-all duration-200 ${
                theme === 'dark'
                  ? 'text-[#9aa0b0] hover:bg-[#1e2030] hover:text-[#ffd43b]'
                  : 'text-[#5f6672] hover:bg-[#f1f3f5] hover:text-[#f08c00]'
              }`}
              title={theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
              aria-label="切换主题"
            >
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>

            <div className={`relative ml-1 border-l pl-3 ${theme === 'dark' ? 'border-[#2a2d3e]' : 'border-[#e5e7eb]'}`}>
              <button
                onClick={() => setUserMenuOpen((value) => !value)}
                className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-theme-hover"
                aria-label="打开用户菜单"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#5c7cfa] to-[#748ffc] shadow-sm shadow-[#5c7cfa]/20">
                  <User className="h-4 w-4 text-white" />
                </div>
                <div className="hidden text-right lg:block">
                  <p className={`text-sm font-semibold leading-tight ${theme === 'dark' ? 'text-[#e8eaed]' : 'text-[#1a1d2e]'}`}>
                    {user?.name}
                  </p>
                  <p className={`text-[11px] ${theme === 'dark' ? 'text-[#636983]' : 'text-[#9aa0b0]'}`}>
                    {getRoleDisplayName(user?.role)}
                  </p>
                </div>
              </button>

              {userMenuOpen && (
                <div
                  className={`absolute right-0 top-[calc(100%+10px)] w-52 rounded-2xl border p-2 shadow-2xl ${
                    theme === 'dark' ? 'border-[#2a2d3e] bg-[#161822]' : 'border-[#e5e7eb] bg-white'
                  }`}
                >
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      navigate('/notification-settings');
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-theme-text-secondary transition hover:bg-theme-hover hover:text-theme-text"
                  >
                    <Settings className="h-4 w-4" />
                    {settingsMenuLabel}
                  </button>
                  <button
                    onClick={handleLogout}
                    className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-theme-text-secondary transition hover:bg-theme-hover hover:text-[#ff6b6b]"
                  >
                    <LogOut className="h-4 w-4" />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </Topbar>

        <main className="px-4 py-4 sm:px-6 sm:py-6">
          <div className="mx-auto w-full max-w-7xl space-y-4">
            <Breadcrumbs />
            <AnimatedPage className="min-h-[calc(100vh-8rem)]">
              <Outlet />
            </AnimatedPage>
          </div>
        </main>
      </div>

      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))}
      </div>

      <CommandPalette isOpen={showCmdPalette} onClose={() => setShowCmdPalette(false)} />
      {showUpdateNotification && (
        <UpdateNotification onClose={handleCloseUpdateNotification} onGoToChangelog={handleGoToChangelog} />
      )}
      <KeyboardHelp isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </AppShell>
  );
}
