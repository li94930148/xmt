import { ArrowLeft, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store';

export default function NotFound() {
  const navigate = useNavigate();
  const isLoggedIn = useAuthStore((state) => state.isLoggedIn);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl rounded-[28px] border border-studio-border-soft bg-studio-surface-glass p-8 text-center shadow-floating backdrop-blur-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-studio-primary">404</p>
        <h1 className="mt-4 text-3xl font-semibold text-theme-text">页面不存在</h1>
        <p className="mt-3 text-sm leading-7 text-theme-text-secondary">
          你访问的地址不存在，或者当前版本已经调整了页面入口。可以返回上一页，或回到默认工作台继续操作。
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-studio-border-soft px-5 py-3 text-sm font-medium text-studio-text-primary transition hover:bg-studio-surface-soft"
          >
            <ArrowLeft className="h-4 w-4" />
            返回上一页
          </button>
          <button
            onClick={() => navigate(isLoggedIn ? '/' : '/login')}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-studio-primary px-5 py-3 text-sm font-medium text-white transition hover:bg-studio-primary"
          >
            <Home className="h-4 w-4" />
            {isLoggedIn ? '回到工作台' : '前往登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
