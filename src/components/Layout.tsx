import { useState, useEffect, useCallback } from 'react';
import { useAuthStore, useAppStore, useMessageStore } from '../store';
import { useNavigate } from 'react-router-dom';
import { getMe, getUnreadCount } from '../api';
import Sidebar from './Sidebar';
import CommandPalette from './CommandPalette';
import KeyboardHelp from './KeyboardHelp';
import UpdateNotification from './UpdateNotification';
import { User, Bell, Sun, Moon, Search } from 'lucide-react';
import { useSocket } from '../hooks/useSocket';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

// 声明全局变量
declare const __APP_VERSION__: string;

interface Notification {
  id: number;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

function NotificationItem({ notification }: { notification: Notification }) {
  const appStore = useAppStore();

  useEffect(() => {
    const timer = setTimeout(() => {
      appStore.removeNotification(notification.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notification.id, appStore]);

  const typeStyles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    success: { bg: 'bg-[#51cf66]/10', border: 'border-[#51cf66]/30', text: 'text-[#51cf66]', icon: '✓' },
    error: { bg: 'bg-[#ff6b6b]/10', border: 'border-[#ff6b6b]/30', text: 'text-[#ff6b6b]', icon: '✕' },
    warning: { bg: 'bg-[#ffd43b]/10', border: 'border-[#ffd43b]/30', text: 'text-[#ffd43b]', icon: '!' },
    info: { bg: 'bg-[#5c7cfa]/10', border: 'border-[#5c7cfa]/30', text: 'text-[#5c7cfa]', icon: 'i' },
  };

  const style = typeStyles[notification.type] || typeStyles.info;

  return (
    <div
      className={`max-w-sm p-4 rounded-xl shadow-soft border animate-slide-in ${style.bg} ${style.border} backdrop-blur-sm`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${style.bg} ${style.text}`}>
          {style.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${style.text}`}>{notification.title}</p>
          <p className="text-xs mt-1 opacity-80" style={{ color: 'var(--color-text-secondary)' }}>{notification.message}</p>
        </div>
        <button
          onClick={() => appStore.removeNotification(notification.id)}
          className="text-current opacity-40 hover:opacity-70 transition-opacity flex-shrink-0"
        >
          <span className="text-sm">&times;</span>
        </button>
      </div>
    </div>
  );
}

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [loading, setLoading] = useState(true);
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const authStore = useAuthStore();
  const appStore = useAppStore();
  const messageStore = useMessageStore();
  const navigate = useNavigate();
  
  useSocket();

  useKeyboardShortcuts({
    onCommandPalette: useCallback(() => setShowCmdPalette((v) => !v), []),
    onShowHelp: useCallback(() => setShowHelp(true), []),
    onEscape: useCallback(() => {
      setShowCmdPalette(false);
      setShowHelp(false);
    }, []),
  });

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('xmt_token');

      if (!token) {
        navigate('/login');
        setLoading(false);
        return;
      }

      try {
        const user = await getMe();
        authStore.login(user, token);

        // 强制修改密码拦截
        if (user.force_change_password) {
          navigate('/notification-settings');
          return;
        }

        try {
          const unread = await getUnreadCount();
          messageStore.setUnreadCount(unread.unreadCount);
        } catch (e) {
          console.error('Failed to fetch unread count:', e);
        }

        // 检查是否需要显示更新提示
        checkUpdateNotification();
      } catch (error) {
        localStorage.removeItem('xmt_token');
        localStorage.removeItem('xmt_user');
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  // 检查更新提示
  const checkUpdateNotification = () => {
    const lastSeenVersion = localStorage.getItem('xmt_last_seen_version');
    const currentVersion = __APP_VERSION__;

    if (lastSeenVersion !== currentVersion) {
      // 版本不同，显示更新提示
      setShowUpdateNotification(true);
    }
  };

  // 关闭更新提示
  const handleCloseUpdateNotification = () => {
    setShowUpdateNotification(false);
    // 记录用户已看过当前版本
    localStorage.setItem('xmt_last_seen_version', __APP_VERSION__);
  };

  // 跳转到更新日志
  const handleGoToChangelog = () => {
    navigate('/notification-settings');
    // 设置一个标志，让 NotificationSettings 页面自动切换到更新日志 Tab
    sessionStorage.setItem('xmt_show_changelog', 'true');
  };

  // 应用系统字体大小
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--system-font-size', `${appStore.fontSize}px`);
    root.style.fontSize = `${appStore.fontSize}px`;
  }, [appStore.fontSize]);

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${appStore.theme === 'dark' ? 'bg-[#0f1117]' : 'bg-white'}`}>
        <div className="flex flex-col items-center gap-4">
          <div className={`w-10 h-10 border-3 rounded-full animate-spin ${
            appStore.theme === 'dark' ? 'border-[#2a2d3e] border-t-[#5c7cfa]' : 'border-[#e5e7eb] border-t-[#4263eb]'
          }`} style={{ borderWidth: '3px' }}></div>
          <p className={`text-sm font-medium ${appStore.theme === 'dark' ? 'text-[#636983]' : 'text-[#9aa0b0]'}`}>加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${appStore.theme === 'dark' ? 'bg-[#0f1117]' : 'bg-[#f8f9fa]'}`}>
      <Sidebar 
        collapsed={appStore.sidebarCollapsed} 
        onToggle={appStore.toggleSidebar} 
        theme={appStore.theme}
        onOpenCommandPalette={() => setShowCmdPalette(true)}
      />
      
      <main className={`transition-all duration-300 ${appStore.sidebarCollapsed ? 'ml-[72px]' : 'ml-64'}`}>
        {/* 顶部导航栏 */}
        <header className={`h-16 border-b px-6 flex items-center justify-between sticky top-0 z-40 ${
          appStore.theme === 'dark' 
            ? 'bg-[#0f1117]/80 border-[#2a2d3e] backdrop-blur-xl' 
            : 'bg-white/80 border-[#e5e7eb] backdrop-blur-xl'
        }`}>
          <div className="flex items-center gap-4">
            {/* 搜索栏 — 点击打开 Command Palette */}
            <button
              onClick={() => setShowCmdPalette(true)}
              className={`relative hidden md:flex items-center cursor-pointer`}
            >
              <Search className={`absolute left-3 w-4 h-4 ${appStore.theme === 'dark' ? 'text-[#636983]' : 'text-[#9aa0b0]'}`} />
              <div
                className={`w-64 pl-9 pr-4 py-2 text-sm rounded-xl border text-left transition-all duration-200 ${
                  appStore.theme === 'dark'
                    ? 'bg-[#1e2030] border-[#2a2d3e] text-[#636983]'
                    : 'bg-[#f8f9fa] border-[#e5e7eb] text-[#9aa0b0]'
                }`}
              >
                搜索...
              </div>
              <kbd className={`absolute right-3 text-[10px] px-1.5 py-0.5 rounded border ${
                appStore.theme === 'dark' ? 'border-[#2a2d3e] text-[#636983]' : 'border-[#e5e7eb] text-[#9aa0b0]'
              }`}>⌘K</kbd>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            {/* 通知按钮 */}
            <button
              onClick={() => navigate('/messages')}
              className={`relative p-2.5 rounded-xl transition-all duration-200 ${
                appStore.theme === 'dark' 
                  ? 'text-[#9aa0b0] hover:text-[#e8eaed] hover:bg-[#1e2030]' 
                  : 'text-[#5f6672] hover:text-[#1a1d2e] hover:bg-[#f1f3f5]'
              }`}
            >
              <Bell className="w-[18px] h-[18px]" />
              {messageStore.unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 bg-[#ff6b6b] text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-scale-in">
                  {messageStore.unreadCount > 9 ? '9+' : messageStore.unreadCount}
                </span>
              )}
            </button>

            {/* 主题切换 */}
            <button
              onClick={appStore.toggleTheme}
              className={`p-2.5 rounded-xl transition-all duration-200 ${
                appStore.theme === 'dark' 
                  ? 'text-[#9aa0b0] hover:text-[#ffd43b] hover:bg-[#1e2030]' 
                  : 'text-[#5f6672] hover:text-[#f08c00] hover:bg-[#f1f3f5]'
              }`}
              title={appStore.theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
            >
              {appStore.theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
            
            {/* 用户信息 */}
            <div className={`flex items-center gap-3 pl-4 ml-2 border-l ${
              appStore.theme === 'dark' ? 'border-[#2a2d3e]' : 'border-[#e5e7eb]'
            }`}>
              <div className="w-9 h-9 bg-gradient-to-br from-[#5c7cfa] to-[#748ffc] rounded-xl flex items-center justify-center shadow-sm shadow-[#5c7cfa]/20">
                <User className="w-4 h-4 text-white" />
              </div>
              <div className="text-right hidden lg:block">
                <p className={`text-sm font-semibold leading-tight ${appStore.theme === 'dark' ? 'text-[#e8eaed]' : 'text-[#1a1d2e]'}`}>
                  {authStore.user?.name}
                </p>
                <p className={`text-[11px] ${appStore.theme === 'dark' ? 'text-[#636983]' : 'text-[#9aa0b0]'}`}>
                  {authStore.user?.role === 'admin' ? '管理员' : authStore.user?.role === 'director' ? '编导' : '成员'}
                </p>
              </div>
            </div>
          </div>
        </header>
        
        {/* 页面内容 */}
        <div className="p-6 animate-fade-in">
          {children}
        </div>
      </main>

      {/* 通知弹窗 */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {appStore.notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))}
      </div>

      {/* Command Palette */}
      <CommandPalette isOpen={showCmdPalette} onClose={() => setShowCmdPalette(false)} />

      {/* Update Notification */}
      {showUpdateNotification && (
        <UpdateNotification
          onClose={handleCloseUpdateNotification}
          onGoToChangelog={handleGoToChangelog}
        />
      )}

      {/* Keyboard Help */}
      <KeyboardHelp isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </div>
  );
}
