import { useEffect, useMemo } from 'react';
import { App } from '@capacitor/app';
import { Bell, FileText, Home, LogOut, Settings, BriefcaseBusiness } from 'lucide-react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { User } from '@/types';
import { handleBackButton, isAndroid } from '@/platform/runtime';
import { useNetworkState } from '@/platform/network';
import { resolveMobileDeepLink } from '@/platform/deep-link';

const tabs = [
  { path: '/', label: '首页', icon: Home },
  { path: '/topics', label: '选题', icon: FileText },
  { path: '/production', label: '工作', icon: BriefcaseBusiness },
  { path: '/messages', label: '消息', icon: Bell },
  { path: '/me', label: '我的', icon: Settings },
];

export function MobileShell({ user, unreadCount, onLogout }: { user: User | null; unreadCount: number; onLogout: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const current = useMemo(() => tabs.find((tab) => tab.path === '/' ? location.pathname === '/' : location.pathname.startsWith(tab.path)), [location.pathname]);
  const networkState = useNetworkState();

  useEffect(() => {
    if (!isAndroid()) return;
    let lastBack = 0;
    const listener = App.addListener('backButton', () => {
      const decision = handleBackButton(location.pathname, lastBack);
      lastBack = decision.nextBackAt;
      if (decision.action === 'navigate-back') {
        navigate(-1);
        return;
      }
      if (decision.action === 'exit-app') { void App.exitApp(); return; }
      window.dispatchEvent(new CustomEvent('xmt-toast', { detail: { message: '再次返回将退出 XMT' } }));
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [location.pathname, navigate]);

  useEffect(() => {
    const onDeepLink = (event: Event) => {
      const path = resolveMobileDeepLink((event as CustomEvent<{ url?: string }>).detail?.url ?? '');
      if (path) navigate(path);
    };
    window.addEventListener('xmt-deep-link', onDeepLink);
    return () => window.removeEventListener('xmt-deep-link', onDeepLink);
  }, [navigate]);

  return <div className="min-h-dvh bg-studio-bg text-theme-text" style={{ paddingTop: 'env(safe-area-inset-top)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
    <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-studio-border-soft bg-studio-surface/95 px-4 backdrop-blur">
      <div><p className="text-xs text-studio-text-muted">XMT 移动办公</p><h1 className="text-base font-semibold">{current?.label ?? '工作台'}</h1></div>
      <button onClick={onLogout} aria-label="退出登录" className="flex h-11 w-11 items-center justify-center rounded-xl text-studio-text-secondary"><LogOut className="h-5 w-5" /></button>
    </header>
    {networkState !== 'online' ? <div role="status" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-300">{networkState === 'offline' ? '网络不可用，正在使用本地内容与草稿。' : networkState === 'poor_network' ? '网络较弱，草稿会保存在本机；请确认后再提交。' : '网络已恢复，正在重新连接。'}</div> : null}
    <main className="min-h-[calc(100dvh-8.5rem)] px-4 py-4 pb-28" style={{ fontSize: 'var(--system-font-size)' }}>
      <div className="mx-auto w-full max-w-xl"><Outlet /></div>
    </main>
    <nav aria-label="移动主导航" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-studio-border-soft bg-studio-surface/95 px-2 pt-2 backdrop-blur" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)', paddingLeft: 'max(env(safe-area-inset-left), 8px)', paddingRight: 'max(env(safe-area-inset-right), 8px)' }}>
      {tabs.map((tab) => {
        const Icon = tab.icon; const active = current?.path === tab.path;
        return <button key={tab.path} onClick={() => navigate(tab.path)} className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-xs ${active ? 'text-studio-cyan' : 'text-studio-text-muted'}`}>
          <Icon className="h-5 w-5" />{tab.label}
          {tab.path === '/messages' && unreadCount > 0 ? <span className="absolute ml-5 -mt-6 rounded-full bg-red-500 px-1 text-[10px] text-white">{unreadCount > 9 ? '9+' : unreadCount}</span> : null}
        </button>;
      })}
    </nav>
    <div className="sr-only">当前用户：{user?.name ?? '未知'}</div>
  </div>;
}
