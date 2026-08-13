import { ChevronRight, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, useAuthStore } from '@/store';

export default function MobileMe() {
  const navigate = useNavigate(); const user = useAuthStore((state) => state.user); const theme = useAppStore((state) => state.theme); const toggleTheme = useAppStore((state) => state.toggleTheme);
  return <div className="space-y-4"><section className="rounded-2xl border border-studio-border-soft bg-studio-surface p-5"><p className="text-lg font-semibold">{user?.name ?? '我的账号'}</p><p className="mt-1 text-sm text-studio-text-muted">{user?.role ?? '成员'}</p></section><section className="overflow-hidden rounded-2xl border border-studio-border-soft bg-studio-surface"><button onClick={toggleTheme} className="flex min-h-14 w-full items-center justify-between px-4 text-sm"><span className="inline-flex items-center gap-3">{theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}主题</span><span className="text-studio-text-muted">{theme === 'dark' ? '深色' : '浅色'}</span></button><button onClick={() => navigate('/notification-settings')} className="flex min-h-14 w-full items-center justify-between border-t border-studio-border-soft px-4 text-sm"><span>个人与通知设置</span><ChevronRight className="h-5 w-5 text-studio-text-muted" /></button></section><p className="px-1 text-xs text-studio-text-muted">XMT Mobile v{__APP_VERSION__}</p></div>;
}
