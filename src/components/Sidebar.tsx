import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Search, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { navigationSections, canAccessNavigationItem, canAccessNavigationSection, findNavigationSectionByPath, isNavigationItemActive } from '@/config/navigation';
import { useAppStore, useAuthStore, useMessageStore } from '../store';
import { usePermission } from '../hooks/usePermission';
import NotificationBadge from './studio/NotificationBadge';
import { useEffect, useRef, useState } from 'react';

const SIDEBAR_STATE_KEY = 'xmt_sidebar_state';

function readExpandedGroup(pathname: string) {
  try {
    const stored = localStorage.getItem(SIDEBAR_STATE_KEY);
    if (!stored) return undefined;
    const state = JSON.parse(stored) as { expandedGroup?: string | null; pathname?: string };
    if (state.pathname && state.pathname !== pathname) return undefined;
    return typeof state.expandedGroup === 'string' || state.expandedGroup === null ? state.expandedGroup : undefined;
  } catch {
    return undefined;
  }
}

function persistExpandedGroup(expandedGroup: string | null, pathname: string) {
  localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify({ expandedGroup, pathname }));
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  theme: 'light' | 'dark';
  onOpenCommandPalette?: () => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({
  collapsed,
  onToggle,
  onOpenCommandPalette,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const authStore = useAuthStore();
  const messageStore = useMessageStore();
  const systemSettings = useAppStore((state) => state.systemSettings);
  const { loading: permissionLoading, hasAnyPermission, hasAllPermissions } = usePermission();
  const navigate = useNavigate();
  const location = useLocation();
  const isDebugMode = authStore.user?.role === 'admin' && new URLSearchParams(location.search).has('debug');
  const initialRouteGroup = findNavigationSectionByPath(location.pathname)?.id ?? null;
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => {
    const storedGroup = readExpandedGroup(location.pathname);
    return storedGroup === undefined ? initialRouteGroup : storedGroup;
  });
  const previousPathname = useRef(location.pathname);

  const handleNavigate = (path: string) => {
    navigate(path);
    onMobileClose?.();
  };

  const handleLogout = () => {
    authStore.logout();
    onMobileClose?.();
    navigate('/login');
  };

  const visibleSections = navigationSections
    .filter((section) => canAccessNavigationSection(section, authStore.user?.role) && (!section.debugOnly || isDebugMode))
    .map((section) => ({
      ...section,
      items: permissionLoading
        ? []
        : section.items.filter((item) =>
            canAccessNavigationItem(item, {
              hasAnyPermission,
              hasAllPermissions,
            }, authStore.user?.role),
          ),
    }))
    .filter((section) => section.items.length > 0);

  useEffect(() => {
    if (previousPathname.current === location.pathname) {
      return;
    }

    previousPathname.current = location.pathname;
    const nextGroup = findNavigationSectionByPath(location.pathname)?.id ?? null;
    setExpandedGroup(nextGroup);
    persistExpandedGroup(nextGroup, location.pathname);
  }, [location.pathname]);

  const desktopAsideClass = collapsed ? 'w-[72px]' : 'w-[232px]';
  const shellClass =
    'border-studio-border-soft bg-studio-surface-glass text-studio-text-primary shadow-card backdrop-blur-2xl';

  const renderMenu = (isMobile: boolean) => (
    <div className="flex h-full flex-col overflow-hidden">
      <div className={`flex min-h-20 items-center border-b border-studio-border-soft py-3 ${collapsed && !isMobile ? 'justify-center px-2' : 'gap-3 px-4'}`}>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[16px] border border-studio-border-soft bg-white/[0.06] shadow-glow-primary">
          <img src={systemSettings.branding.logo || '/logo.png'} alt="XMT" className="h-8 w-8 object-contain" />
        </div>

        {(!collapsed || isMobile) && (
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-bold tracking-normal text-studio-text-primary">
              {systemSettings.system.name || '新媒体工作台'}
            </h1>
          </div>
        )}

        {isMobile ? (
          <button
            type="button"
            onClick={onMobileClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-button text-studio-text-secondary transition hover:bg-white/[0.06] hover:text-studio-text-primary"
            aria-label="关闭导航菜单"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className={`${collapsed && !isMobile ? 'px-2' : 'px-3'} py-3`}>
        <button
          type="button"
          onClick={() => {
            onOpenCommandPalette?.();
            onMobileClose?.();
          }}
          title="搜索命令 / 内容"
          className={`flex w-full items-center rounded-button border border-studio-border-soft bg-white/[0.04] p-2.5 text-sm text-studio-text-muted transition-all duration-200 hover:border-studio-border-active hover:bg-white/[0.07] hover:text-studio-text-primary ${isMobile ? 'gap-3' : 'justify-center'}`}
        >
          <Search className="h-[18px] w-[18px] shrink-0" />
          {isMobile && <span className="font-medium">搜索命令 / 内容</span>}
        </button>
      </div>

      <nav className={`flex-1 overflow-y-auto pb-3 ${collapsed && !isMobile ? 'px-2' : 'px-3'}`}>
        {visibleSections.map((section, sectionIndex) => {
          const SectionIcon = section.icon;
          const expanded = expandedGroup === section.id;
          const hasActiveItem = section.items.some((item) => isNavigationItemActive(location.pathname, item.path));
          const isDirectEntry = section.id === 'home' && section.items.length === 1;

          if (isDirectEntry) {
            const item = section.items[0];
            return <div key={section.label} className={sectionIndex > 0 ? 'mt-4' : ''}><button type="button" onClick={() => handleNavigate(item.path)} title={section.label} className={`flex w-full items-center rounded-button text-left transition-colors ${collapsed && !isMobile ? 'justify-center px-2' : 'gap-3 px-3'} ${hasActiveItem ? 'bg-studio-primary/12 text-studio-text-primary' : 'text-studio-text-muted hover:bg-white/[0.04] hover:text-studio-text-secondary'}`} style={{ minHeight: 'var(--sidebar-nav-item-height)', fontSize: 'var(--sidebar-nav-font-size)' }}><SectionIcon className="shrink-0" style={{ width: 'var(--sidebar-icon-size)', height: 'var(--sidebar-icon-size)' }} />{(!collapsed || isMobile) && <span className="font-semibold">{section.label}</span>}</button></div>;
          }

          return (
          <div key={section.label} className={sectionIndex > 0 ? 'mt-4' : ''}>
            <button
              type="button"
              onClick={() => {
                const nextGroup = expanded ? null : section.id;
                setExpandedGroup(nextGroup);
                persistExpandedGroup(nextGroup, location.pathname);
              }}
              title={section.label}
              className={`flex w-full items-center rounded-button text-left transition-colors ${collapsed && !isMobile ? 'justify-center px-2' : 'gap-2 px-3'} ${hasActiveItem ? 'text-studio-text-secondary' : 'text-studio-text-muted hover:bg-white/[0.04] hover:text-studio-text-secondary'}`}
              style={{ minHeight: 'var(--sidebar-nav-item-height)', fontSize: 'var(--sidebar-nav-font-size)' }}
              aria-expanded={expanded}
            >
              <SectionIcon className="shrink-0" style={{ width: 'var(--sidebar-icon-size)', height: 'var(--sidebar-icon-size)' }} />
              {(!collapsed || isMobile) && <span className="flex-1 font-semibold">{section.label}</span>}
              {(!collapsed || isMobile) && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? '' : '-rotate-90'}`} />}
            </button>

            {collapsed && !isMobile && sectionIndex > 0 ? <div className="mx-2 my-3 border-t border-studio-border-soft" /> : null}

            <ul className={`${expanded && (!collapsed || isMobile) ? 'space-y-1' : 'hidden'} mt-1`}>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = isNavigationItemActive(location.pathname, item.path);
                const isMessages = item.path === '/messages';

                return (
                  <li key={item.path}>
                    <button
                      type="button"
                      onClick={() => handleNavigate(item.path)}
                      title={item.label}
                      className={`group relative flex w-full items-center gap-3 rounded-button text-left transition-all duration-200 ${
                        collapsed && !isMobile ? 'justify-center' : ''
                      } ${collapsed && !isMobile ? 'px-2' : 'px-3'} ${
                        isActive
                          ? 'border border-studio-border-active bg-studio-primary/14 text-studio-text-primary shadow-glow-primary'
                          : 'border border-transparent text-studio-text-secondary hover:border-studio-border-soft hover:bg-white/[0.055] hover:text-studio-text-primary'
                      }`}
                      style={{ minHeight: 'var(--sidebar-nav-item-height)', fontSize: 'var(--sidebar-subnav-font-size)' }}
                    >
                      {isActive ? <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-studio-cyan" /> : null}

                      <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[12px] ${isActive ? 'bg-white/[0.08] text-studio-cyan' : 'text-studio-text-muted group-hover:text-studio-cyan'}`}>
                        <Icon style={{ width: 'var(--sidebar-icon-size)', height: 'var(--sidebar-icon-size)' }} />
                        {isMessages ? <NotificationBadge count={messageStore.unreadCount} /> : null}
                      </span>

                      {(!collapsed || isMobile) && <span className="truncate font-medium">{item.label}</span>}

                      {collapsed && !isMobile ? (
                        <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-button border border-studio-border-soft bg-studio-surface px-3 py-2 text-xs font-medium text-studio-text-primary opacity-0 shadow-card transition-opacity group-hover:opacity-100">
                          {item.label}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          );
        })}
      </nav>

      <div className={`border-t border-studio-border-soft ${collapsed && !isMobile ? 'p-2' : 'p-3'}`}>
        <button
          type="button"
          onClick={handleLogout}
          className={`group flex w-full items-center gap-3 rounded-button py-2.5 text-studio-text-muted transition-all duration-200 hover:bg-studio-coral/10 hover:text-studio-coral ${
            collapsed && !isMobile ? 'justify-center' : ''
          } ${collapsed && !isMobile ? 'px-2' : 'px-3'}`}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {(!collapsed || isMobile) && <span className="text-sm font-medium">退出登录</span>}
        </button>
      </div>

      {!isMobile && (
        <button
          type="button"
          onClick={onToggle}
          className="absolute -right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-studio-border-soft bg-studio-surface text-studio-text-muted shadow-card transition-all duration-200 hover:border-studio-border-active hover:text-studio-cyan"
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );

  return (
    <>
      <aside className={`sticky top-0 z-30 hidden h-screen self-start border-r transition-[width] duration-300 md:block ${desktopAsideClass} ${shellClass}`}>
        {renderMenu(false)}
      </aside>

      <div
        className={`fixed inset-0 z-50 transition-all duration-300 md:hidden ${
          mobileOpen ? 'pointer-events-auto bg-black/60 opacity-100' : 'pointer-events-none bg-black/0 opacity-0'
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
