import { useEffect, useState } from 'react';
import { Bell, ChevronLeft, ChevronRight, LogOut, Search, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { navigationSections, canAccessNavigationItem, isNavigationItemActive } from '@/config/navigation';
import { useAuthStore, useMessageStore } from '../store';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  theme: 'light' | 'dark';
  onOpenCommandPalette?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function getInitialSettings() {
  try {
    const saved = localStorage.getItem('xmt_system_settings');
    if (saved) {
      const settings = JSON.parse(saved);
      return {
        logo: settings.systemLogo || '',
        name: settings.systemName || '新媒体协作管理系统',
      };
    }
  } catch {
    // Ignore invalid local settings and fall back to defaults.
  }

  return { logo: '', name: '新媒体协作管理系统' };
}

export default function Sidebar({
  collapsed,
  onToggle,
  theme,
  onOpenCommandPalette,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const authStore = useAuthStore();
  const messageStore = useMessageStore();
  const navigate = useNavigate();
  const location = useLocation();
  const initial = getInitialSettings();
  const [systemLogo, setSystemLogo] = useState(initial.logo);
  const [systemName, setSystemName] = useState(initial.name);

  useEffect(() => {
    const loadSettings = () => {
      const next = getInitialSettings();
      setSystemLogo(next.logo);
      setSystemName(next.name);
    };

    window.addEventListener('storage', loadSettings);
    window.addEventListener('xmt-settings-changed', loadSettings);

    return () => {
      window.removeEventListener('storage', loadSettings);
      window.removeEventListener('xmt-settings-changed', loadSettings);
    };
  }, []);

  const handleNavigate = (path: string) => {
    navigate(path);
    onMobileClose?.();
  };

  const handleLogout = () => {
    authStore.logout();
    onMobileClose?.();
    navigate('/login');
  };

  const role = authStore.user?.role;
  const visibleSections = navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccessNavigationItem(role, item.roles)),
    }))
    .filter((section) => section.items.length > 0);

  const desktopAsideClass = collapsed ? 'w-[72px]' : 'w-64';
  const shellClass =
    theme === 'dark'
      ? 'bg-[#0f1117]/95 border-[#2a2d3e] text-[#e8eaed] backdrop-blur-xl'
      : 'bg-white/95 border-[#e5e7eb] text-[#1a1d2e] backdrop-blur-xl';

  const renderMenu = (isMobile: boolean) => (
    <div className="flex h-full flex-col">
      <div
        className={`flex h-16 items-center border-b px-4 ${
          collapsed && !isMobile ? 'justify-center' : 'gap-3'
        } ${theme === 'dark' ? 'border-[#2a2d3e]' : 'border-[#e5e7eb]'}`}
      >
        <div
          className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl transition-transform duration-200 hover:scale-105 ${
            theme === 'dark'
              ? 'bg-gradient-to-br from-[#5c7cfa]/20 to-[#748ffc]/20'
              : 'bg-gradient-to-br from-[#4263eb]/10 to-[#5c7cfa]/10'
          }`}
        >
          <img src={systemLogo || '/logo.png'} alt="Logo" className="h-8 w-8 object-contain" />
        </div>

        {(!collapsed || isMobile) && (
          <div className="min-w-0 flex-1">
            <h1 className={`truncate text-sm font-bold tracking-tight ${theme === 'dark' ? 'text-[#e8eaed]' : 'text-[#1a1d2e]'}`}>
              {systemName}
            </h1>
            <p className={`text-[10px] font-medium uppercase tracking-wider ${theme === 'dark' ? 'text-[#636983]' : 'text-[#9aa0b0]'}`}>
              Management
            </p>
          </div>
        )}

        {isMobile && (
          <button
            type="button"
            onClick={onMobileClose}
            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
              theme === 'dark'
                ? 'text-[#9aa0b0] hover:bg-[#1e2030] hover:text-[#e8eaed]'
                : 'text-[#5f6672] hover:bg-[#f1f3f5] hover:text-[#1a1d2e]'
            }`}
            aria-label="关闭菜单"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {(collapsed || isMobile) && (
        <div className="px-3 py-2">
          <button
            type="button"
            onClick={() => {
              onOpenCommandPalette?.();
              onMobileClose?.();
            }}
            className={`flex w-full items-center rounded-xl p-2.5 transition-all duration-200 ${
              collapsed && !isMobile ? 'justify-center' : 'gap-3'
            } ${
              theme === 'dark'
                ? 'text-[#636983] hover:bg-[#1e2030] hover:text-[#e8eaed]'
                : 'text-[#9aa0b0] hover:bg-[#f1f3f5] hover:text-[#1a1d2e]'
            }`}
          >
            <Search className="h-[18px] w-[18px] shrink-0" />
            {(!collapsed || isMobile) && <span className="text-sm font-medium">搜索命令</span>}
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto py-3">
        {visibleSections.map((section, sectionIndex) => (
          <div key={section.label} className={sectionIndex > 0 ? 'mt-1' : ''}>
            {(!collapsed || isMobile) && (
              <div className={`px-6 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                theme === 'dark' ? 'text-[#4a4f6a]' : 'text-[#b0b5c3]'
              }`}>
                {section.label}
              </div>
            )}

            {collapsed && !isMobile && sectionIndex > 0 && (
              <div className={`mx-3 my-1 border-t ${theme === 'dark' ? 'border-[#2a2d3e]/50' : 'border-[#e5e7eb]/50'}`} />
            )}

            <ul className={`${collapsed && !isMobile ? 'space-y-0.5 px-2' : 'space-y-0.5 px-3'}`}>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = isNavigationItemActive(location.pathname, item.path);

                return (
                  <li key={item.path}>
                    <button
                      type="button"
                      onClick={() => handleNavigate(item.path)}
                      className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 ${
                        collapsed && !isMobile ? 'justify-center' : ''
                      } ${
                        isActive
                          ? theme === 'dark'
                            ? 'bg-[#5c7cfa]/10 text-[#5c7cfa]'
                            : 'bg-[#4263eb]/10 text-[#4263eb]'
                          : theme === 'dark'
                            ? 'text-[#9aa0b0] hover:bg-[#1e2030] hover:text-[#e8eaed]'
                            : 'text-[#5f6672] hover:bg-[#f1f3f5] hover:text-[#1a1d2e]'
                      }`}
                    >
                      {isActive && (
                        <div
                          className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full ${
                            theme === 'dark' ? 'bg-[#5c7cfa]' : 'bg-[#4263eb]'
                          }`}
                        />
                      )}

                      <Icon className={`h-[18px] w-[18px] shrink-0 transition-transform duration-200 ${
                        isActive ? 'scale-110' : 'group-hover:scale-105'
                      }`} />

                      {(!collapsed || isMobile) && <span className="text-sm font-medium">{item.label}</span>}

                      {collapsed && !isMobile && (
                        <div
                          className={`pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-medium opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${
                            theme === 'dark'
                              ? 'bg-[#252840] text-[#e8eaed] shadow-lg shadow-black/20'
                              : 'bg-[#1a1d2e] text-white shadow-lg shadow-black/10'
                          }`}
                        >
                          {item.label}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={`space-y-0.5 border-t p-3 ${theme === 'dark' ? 'border-[#2a2d3e]' : 'border-[#e5e7eb]'}`}>
        <button
          type="button"
          onClick={() => handleNavigate('/messages')}
          className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 ${
            collapsed && !isMobile ? 'justify-center' : ''
          } ${
            theme === 'dark'
              ? 'text-[#9aa0b0] hover:bg-[#1e2030] hover:text-[#e8eaed]'
              : 'text-[#5f6672] hover:bg-[#f1f3f5] hover:text-[#1a1d2e]'
          }`}
        >
          <Bell className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-105" />
          {(!collapsed || isMobile) && <span className="text-sm font-medium">消息中心</span>}
          {messageStore.unreadCount > 0 && (
            <span
              className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#ff6b6b] px-1 text-[10px] font-bold text-white ${
                collapsed && !isMobile ? 'absolute right-1.5 top-1.5' : 'ml-auto'
              }`}
            >
              {messageStore.unreadCount > 99 ? '99+' : messageStore.unreadCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2 transition-all duration-200 ${
            collapsed && !isMobile ? 'justify-center' : ''
          } ${
            theme === 'dark'
              ? 'text-[#636983] hover:bg-[#1e2030] hover:text-[#ff6b6b]'
              : 'text-[#9aa0b0] hover:bg-[#fff5f5] hover:text-[#e03131]'
          }`}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-105" />
          {(!collapsed || isMobile) && <span className="text-sm font-medium">退出登录</span>}
        </button>
      </div>

      {!isMobile && (
        <button
          type="button"
          onClick={onToggle}
          className={`absolute -right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border transition-all duration-200 hover:scale-110 ${
            theme === 'dark'
              ? 'border-[#2a2d3e] bg-[#161822] text-[#636983] hover:border-[#5c7cfa] hover:text-[#e8eaed]'
              : 'border-[#e5e7eb] bg-white text-[#9aa0b0] shadow-sm hover:border-[#4263eb] hover:text-[#1a1d2e]'
          }`}
          aria-label={collapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );

  return (
    <>
      <aside className={`fixed left-0 top-0 z-40 hidden h-screen border-r transition-all duration-300 md:block ${desktopAsideClass} ${shellClass}`}>
        {renderMenu(false)}
      </aside>

      <div
        className={`fixed inset-0 z-50 md:hidden transition-all duration-300 ${
          mobileOpen ? 'pointer-events-auto bg-black/50 opacity-100' : 'pointer-events-none bg-black/0 opacity-0'
        }`}
        onClick={onMobileClose}
        aria-hidden={!mobileOpen}
      >
        <aside
          className={`h-full w-[88vw] max-w-sm border-r shadow-2xl transition-transform duration-300 ${shellClass} ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          {renderMenu(true)}
        </aside>
      </div>
    </>
  );
}
