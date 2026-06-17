import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { changePassword, getPublicSystemSettings, login } from '../api';
import { useAppStore, useAuthStore } from '../store';
import { loadRememberedCredentials, persistRememberedCredentials } from '../utils/rememberedCredentials';
import {
  applyDocumentBranding,
  defaultSystemSettings,
  ManagedSystemSettings,
} from '@/lib/systemSettings';

function resolveRedirectTarget(state: unknown) {
  if (
    state &&
    typeof state === 'object' &&
    'from' in state &&
    state.from &&
    typeof state.from === 'object' &&
    'pathname' in state.from &&
    typeof state.from.pathname === 'string'
  ) {
    const from = state.from as { pathname: string; search?: string; hash?: string };
    return `${from.pathname}${from.search || ''}${from.hash || ''}`;
  }

  return '/';
}

function ChangePasswordModal({
  show,
  oldPwd,
  newPwd,
  confirmPwd,
  loading,
  onOldPwdChange,
  onNewPwdChange,
  onConfirmPwdChange,
  onCancel,
  onConfirm,
}: {
  show: boolean;
  oldPwd: string;
  newPwd: string;
  confirmPwd: string;
  loading: boolean;
  onOldPwdChange: (value: string) => void;
  onNewPwdChange: (value: string) => void;
  onConfirmPwdChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  if (!show) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-slate-950 p-8 text-white shadow-2xl">
        <p className="text-xs uppercase tracking-[0.28em] text-white/35">首次登录</p>
        <h3 className="mt-3 text-2xl font-semibold">请先修改初始密码</h3>
        <p className="mt-3 text-sm leading-6 text-white/55">
          为保障账号安全，首次登录后需先设置新密码。
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="password"
            value={oldPwd}
            onChange={(event) => onOldPwdChange(event.target.value)}
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-white outline-none placeholder:text-white/25"
            placeholder="当前密码"
          />
          <input
            type="password"
            value={newPwd}
            onChange={(event) => onNewPwdChange(event.target.value)}
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-white outline-none placeholder:text-white/25"
            placeholder="新密码（至少 6 位）"
          />
          <input
            type="password"
            value={confirmPwd}
            onChange={(event) => onConfirmPwdChange(event.target.value)}
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-white outline-none placeholder:text-white/25"
            placeholder="确认新密码"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.06]"
          >
            退出登录
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/92 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? '保存中...' : '更新密码'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StyleShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

type LoginFormProps = {
  username: string;
  password: string;
  remember: boolean;
  showPassword: boolean;
  loading: boolean;
  errorMessage: string;
  welcomeTitle: string;
  welcomeMessage: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRememberChange: (value: boolean) => void;
  onTogglePassword: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
  onForgotPassword: () => void;
  dark?: boolean;
};

function LoginForm({
  username,
  password,
  remember,
  showPassword,
  loading,
  errorMessage,
  welcomeTitle,
  welcomeMessage,
  onUsernameChange,
  onPasswordChange,
  onRememberChange,
  onTogglePassword,
  onSubmit,
  onForgotPassword,
  dark = true,
}: LoginFormProps) {
  const surfaceClass = dark
    ? 'border-white/10 bg-white/[0.04] text-white placeholder:text-white/25'
    : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-300';
  const labelClass = dark ? 'text-white/45' : 'text-slate-600';
  const helperClass = dark ? 'text-white/55' : 'text-slate-400';
  const linkClass = dark ? 'text-amber-300/80 hover:text-amber-200' : 'text-amber-600 hover:text-amber-700';
  const buttonClass = dark
    ? 'bg-white text-black hover:bg-white/92'
    : 'bg-slate-900 text-white hover:bg-slate-800';

  return (
    <>
      <div className="mb-6">
        <h2 className={`text-2xl font-semibold ${dark ? 'text-white' : 'text-slate-900'}`}>{welcomeTitle}</h2>
        <p className={`mt-2 text-sm ${helperClass}`}>{welcomeMessage}</p>
      </div>

      {errorMessage && (
        <div className={`mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${dark ? 'border-red-500/20 bg-red-500/[0.06] text-red-200/90' : 'border-red-200 bg-red-50 text-red-600'}`}>
          <span className="text-red-400">!</span>
          {errorMessage}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label className={`mb-2 block text-sm font-medium ${labelClass}`}>账号</label>
          <input
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            className={`h-12 w-full rounded-xl border px-4 outline-none transition-all ${surfaceClass}`}
            placeholder="请输入账号"
            autoComplete="username"
          />
        </div>

        <div>
          <label className={`mb-2 block text-sm font-medium ${labelClass}`}>密码</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              className={`h-12 w-full rounded-xl border px-4 pr-12 outline-none transition-all ${surfaceClass}`}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={onTogglePassword}
              className={`absolute right-4 top-1/2 -translate-y-1/2 ${dark ? 'text-white/35 hover:text-white/70' : 'text-slate-300 hover:text-slate-500'}`}
              aria-label="切换密码可见状态"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className={`flex cursor-pointer items-center gap-2.5 text-sm ${helperClass}`}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => onRememberChange(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400/30 focus:ring-offset-0"
            />
            记住密码
          </label>
          <button type="button" onClick={onForgotPassword} className={`text-sm transition-colors ${linkClass}`}>
            忘记密码？
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`group mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-70 ${buttonClass}`}
        >
          {loading ? (
            <span className={`h-4 w-4 animate-spin rounded-full border-2 ${dark ? 'border-black/20 border-t-black' : 'border-white/30 border-t-white'}`} />
          ) : (
            <>
              进入系统
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </button>
      </form>
    </>
  );
}

function BrandMark({
  settings,
  roundedClass,
  textClass,
}: {
  settings: ManagedSystemSettings;
  roundedClass: string;
  textClass?: string;
}) {
  if (settings.branding.logo) {
    return (
      <img
        src={settings.branding.logo}
        alt={settings.system.name}
        className={`h-full w-full object-contain ${roundedClass}`}
      />
    );
  }

  return <span className={textClass}>{settings.system.icon || settings.system.name.slice(0, 1)}</span>;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const authStore = useAuthStore();
  const appStore = useAppStore();
  const setSystemSettings = useAppStore((state) => state.setSystemSettings);

  const [settings, setSettings] = useState<ManagedSystemSettings>(defaultSystemSettings);
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [changePwdLoading, setChangePwdLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateRememberedCredentials() {
      const remembered = await loadRememberedCredentials();
      if (cancelled) {
        return;
      }

      setRemember(remembered.remember);
      setUsername(remembered.username);
      setPassword(remembered.password);
    }

    void hydrateRememberedCredentials();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const hydrateSystemSettings = async () => {
      try {
        const nextSettings = await getPublicSystemSettings();
        if (cancelled) {
          return;
        }

        setSettings(nextSettings);
        setSystemSettings(nextSettings);
        applyDocumentBranding(nextSettings);
      } catch {
        if (!cancelled) {
          applyDocumentBranding(defaultSystemSettings);
        }
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
    if (!authStore.token || showChangePassword) {
      return;
    }

    const nextPath = authStore.user?.force_change_password
      ? '/notification-settings'
      : resolveRedirectTarget(location.state);

    navigate(nextPath, { replace: true });
  }, [authStore.token, authStore.user?.force_change_password, location.state, navigate, showChangePassword]);

  const handleSubmit = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    setErrorMessage('');

    if (!username.trim() || !password.trim()) {
      const message = '请输入账号并填写密码。';
      setErrorMessage(message);
      appStore.addNotification({ title: '登录失败', message, type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const result = await login(username.trim(), password);
      authStore.login(result.user, result.token, { persist: remember ? 'local' : 'session' });
      await persistRememberedCredentials(remember, username.trim(), password);

      if (result.user.force_change_password || result.forceChangePassword) {
        setOldPwd(password);
        setNewPwd('');
        setConfirmPwd('');
        setShowChangePassword(true);
        return;
      }

      appStore.addNotification({
        title: '登录成功',
        message: `欢迎回来，${result.user.name}`,
        type: 'success',
      });
      navigate(resolveRedirectTarget(location.state), { replace: true });
    } catch (error) {
      const message = (error as Error).message || '账号或密码错误';
      setErrorMessage(message);
      appStore.addNotification({ title: '登录失败', message, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [appStore, authStore, location.state, navigate, password, remember, username]);

  const handleForgotPassword = useCallback(() => {
    appStore.addNotification({
      title: '忘记密码',
      message: '当前系统未接入找回密码流程，请联系管理员重置密码。',
      type: 'info',
    });
  }, [appStore]);

  const handleChangePassword = async () => {
    if (newPwd.length < 6) {
      appStore.addNotification({ title: '修改失败', message: '新密码至少需要 6 位', type: 'error' });
      return;
    }

    if (newPwd !== confirmPwd) {
      appStore.addNotification({ title: '修改失败', message: '两次输入的新密码不一致', type: 'error' });
      return;
    }

    setChangePwdLoading(true);
    try {
      await changePassword(oldPwd, newPwd);
      await persistRememberedCredentials(remember, username.trim(), newPwd);
      appStore.addNotification({
        title: '修改成功',
        message: '密码已更新，请重新登录',
        type: 'success',
      });
      authStore.logout();
      setShowChangePassword(false);
      setPassword(newPwd);
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (error) {
      appStore.addNotification({ title: '修改失败', message: (error as Error).message, type: 'error' });
    } finally {
      setChangePwdLoading(false);
    }
  };

  const welcomeTitle = settings.login.welcomeTitle;
  const welcomeMessage = settings.login.welcomeMessage;
  const brandName = settings.branding.brandName || settings.system.name;
  const brandDescription = settings.branding.brandDescription || settings.system.description;
  const layout = settings.login.layout || 'style1';

  const commonFormProps = {
    username,
    password,
    remember,
    showPassword,
    loading,
    errorMessage,
    welcomeTitle,
    welcomeMessage,
    onUsernameChange: (value: string) => {
      setUsername(value);
      if (errorMessage) {
        setErrorMessage('');
      }
    },
    onPasswordChange: (value: string) => {
      setPassword(value);
      if (errorMessage) {
        setErrorMessage('');
      }
    },
    onRememberChange: setRemember,
    onTogglePassword: () => setShowPassword((prev) => !prev),
    onSubmit: handleSubmit,
    onForgotPassword: handleForgotPassword,
  } satisfies LoginFormProps;

  const layoutNode = useMemo(() => {
    if (layout === 'style2') {
      return (
        <StyleShell>
          <div className="relative min-h-screen overflow-hidden bg-[#050508]">
            <div className="absolute inset-0">
              <div className="absolute left-[15%] top-[8%] h-[700px] w-[700px] rounded-full bg-amber-500/[0.07] blur-[200px]" />
              <div className="absolute right-[10%] top-[12%] h-[500px] w-[500px] rounded-full bg-yellow-600/[0.05] blur-[180px]" />
              <div className="absolute bottom-[5%] left-[40%] h-[400px] w-[400px] rounded-full bg-orange-500/[0.04] blur-[160px]" />
            </div>

            <div className={`relative z-10 flex min-h-screen items-center justify-center px-5 transition-all duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
              <div className="w-full max-w-[460px]">
                <div className="mb-10 text-center">
                  <div className="relative mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-yellow-600/5 to-transparent text-3xl font-light text-amber-200/90 shadow-[0_0_60px_rgba(212,175,55,0.12)]">
                    <BrandMark settings={settings} roundedClass="rounded-full" />
                  </div>
                  <div className="flex items-center justify-center gap-4 mb-5">
                    <div className="h-px w-12 bg-gradient-to-r from-transparent to-amber-500/40" />
                    <p className="text-[11px] uppercase tracking-[0.4em] text-amber-400/50 font-medium">{brandName}</p>
                    <div className="h-px w-12 bg-gradient-to-l from-transparent to-amber-500/40" />
                  </div>
                  <p className="mx-auto max-w-md text-sm leading-6 text-white/35">{brandDescription}</p>
                </div>

                <div className="rounded-[32px] border border-amber-500/10 bg-black/60 p-10 shadow-[0_40px_100px_rgba(0,0,0,0.6)] backdrop-blur-3xl">
                  <LoginForm {...commonFormProps} dark />
                </div>
              </div>
            </div>
          </div>
        </StyleShell>
      );
    }

    if (layout === 'style3') {
      return (
        <StyleShell>
          <div className="min-h-screen overflow-hidden bg-white">
            <div className="min-h-screen lg:grid lg:grid-cols-2">
              <div className="relative hidden bg-[#0c0f1a] lg:flex lg:flex-col lg:justify-between overflow-hidden p-12 xl:p-16">
                <div className={`relative z-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06] text-sm font-semibold text-amber-300/80">
                      <BrandMark settings={settings} roundedClass="rounded-xl" />
                    </div>
                    <span className="text-sm font-medium text-white/70">{settings.system.name}</span>
                  </div>
                </div>

                <div className={`relative z-10 max-w-md transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-400/50 font-medium">{brandName}</p>
                  <h1 className="mt-5 text-[clamp(2.5rem,5vw,4.5rem)] font-bold leading-[1.05] tracking-tight text-white">
                    {welcomeTitle}
                  </h1>
                  <p className="mt-6 text-base leading-7 text-white/35">{brandDescription}</p>
                </div>

                <div className={`relative z-10 transition-all duration-700 delay-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                  <p className="text-[11px] text-white/12 tracking-wider">{settings.system.name} · 内容生产协作平台</p>
                </div>
              </div>

              <div className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
                <div className={`w-full max-w-[380px] transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                  <div className="mb-10 lg:hidden">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 text-base font-semibold text-white">
                      <BrandMark settings={settings} roundedClass="rounded-2xl" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">{brandName}</h1>
                    <p className="mt-2 text-sm text-slate-400">{brandDescription}</p>
                  </div>

                  <LoginForm {...commonFormProps} dark={false} />
                  <p className="mt-8 text-center text-[11px] text-slate-300 tracking-wider">{settings.system.name}</p>
                </div>
              </div>
            </div>
          </div>
        </StyleShell>
      );
    }

    return (
      <StyleShell>
        <div className="relative min-h-screen overflow-hidden bg-[#0a0a0a] text-white">
          <div
            className="pointer-events-none fixed inset-0 z-50 opacity-[0.03]"
            style={{
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")',
              backgroundSize: '128px 128px',
            }}
          />

          <div className="pointer-events-none fixed right-0 top-0 h-full w-px translate-x-[30vw] rotate-12 bg-gradient-to-b from-transparent via-[#c8a832]/20 to-transparent" />
          <div className="pointer-events-none fixed right-0 top-0 h-full w-px translate-x-[32vw] rotate-12 bg-gradient-to-b from-transparent via-[#c8a832]/10 to-transparent" />

          <div className="min-h-screen flex">
            <div className="hidden lg:flex lg:w-[55%] relative items-center justify-center overflow-hidden">
              <div className="absolute inset-0">
                <div className="absolute left-1/4 top-1/3 h-[500px] w-[500px] rounded-full bg-[#c8a832]/5 blur-[150px]" />
                <div className="absolute bottom-1/4 right-1/3 h-[300px] w-[300px] rounded-full bg-[#c8a832]/3 blur-[100px]" />
              </div>

              <div className="absolute inset-0 opacity-[0.04]">
                {[...Array(8)].map((_, index) => (
                  <div
                    key={`h-${index}`}
                    className="absolute h-px w-full bg-white"
                    style={{ top: `${(index + 1) * 12.5}%` }}
                  />
                ))}
                {[...Array(12)].map((_, index) => (
                  <div
                    key={`v-${index}`}
                    className="absolute h-full w-px bg-white"
                    style={{ left: `${(index + 1) * 8.33}%` }}
                  />
                ))}
              </div>

              <div className="relative z-10 px-16 max-w-xl">
                <div className={`transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <div className="mb-12 flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center border border-[#c8a832]/40">
                      <div className="h-3 w-3 bg-[#c8a832]" />
                    </div>
                    <div className="h-px w-16 bg-[#c8a832]/30" />
                    <span className="text-[#c8a832]/60 text-xs tracking-[0.3em] uppercase font-medium">STR.2025</span>
                  </div>
                </div>

                <div className={`transition-all duration-1000 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <h1 className="mb-2 text-[clamp(3rem,8vw,7rem)] font-extralight leading-[0.9] tracking-tight text-white/90">
                    岚曜
                  </h1>
                  <div className="mb-10 mt-6 flex items-center gap-6">
                    <div className="h-px w-24 bg-gradient-to-r from-[#c8a832] to-transparent" />
                    <span className="text-sm font-medium tracking-[0.2em] text-[#c8a832]">LAN YAO</span>
                  </div>
                </div>

                <div className={`transition-all duration-1000 delay-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <p className="max-w-md text-lg font-light leading-relaxed text-white/30">
                    从一个选题开始，
                    <br />
                    经过脚本、拍摄与剪辑，
                    <br />
                    让好内容被更多人看到。
                  </p>
                </div>

                <div className={`mt-16 transition-all duration-1000 delay-600 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <div className="flex items-center gap-3 text-xs tracking-widest text-white/15">
                    <div className="h-1.5 w-1.5 rotate-45 border border-white/20" />
                    <span>新媒体协作管理系统</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full lg:w-[45%] flex items-center justify-center relative">
              <div className="absolute left-0 right-0 top-8 text-center lg:hidden">
                <h1 className="text-3xl font-extralight tracking-tight text-white/80">岚曜</h1>
                <p className="mt-1 text-xs uppercase tracking-[0.3em] text-white/20">新媒体协作管理系统</p>
              </div>

              <div className={`w-full max-w-[400px] px-8 lg:px-0 transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                <div className="mb-10">
                  <h2 className="mb-2 text-2xl font-light tracking-tight text-white/80">欢迎回来</h2>
                  <p className="text-sm text-white/25">请输入你的账户信息</p>
                </div>

                {errorMessage && (
                  <div className="mb-6 rounded border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-200/90">
                    {errorMessage}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="group">
                    <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-white/30">用户名</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={username}
                        onChange={(event) => {
                          setUsername(event.target.value);
                          if (errorMessage) {
                            setErrorMessage('');
                          }
                        }}
                        className="w-full border-b border-white/10 bg-transparent pb-3 text-base text-white/90 placeholder-white/15 transition-colors duration-500 focus:border-[#c8a832]/60 focus:outline-none"
                        placeholder="输入用户名"
                        autoComplete="username"
                        required
                      />
                      <div className="absolute bottom-0 left-0 h-px w-0 bg-[#c8a832] transition-all duration-700 group-focus-within:w-full" />
                    </div>
                  </div>

                  <div className="group">
                    <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-white/30">密码</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          if (errorMessage) {
                            setErrorMessage('');
                          }
                        }}
                        className="w-full border-b border-white/10 bg-transparent pb-3 pr-10 text-base text-white/90 placeholder-white/15 transition-colors duration-500 focus:border-[#c8a832]/60 focus:outline-none"
                        placeholder="输入密码"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute bottom-3 right-0 text-white/20 transition-colors hover:text-white/50"
                        aria-label="切换密码可见状态"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <div className="absolute bottom-0 left-0 h-px w-0 bg-[#c8a832] transition-all duration-700 group-focus-within:w-full" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <label className="flex cursor-pointer items-center gap-2 text-xs tracking-wider text-white/30 transition-colors hover:text-white/50">
                      <input
                        type="checkbox"
                        id="remember"
                        checked={remember}
                        onChange={(event) => setRemember(event.target.checked)}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-white/20 bg-transparent text-[#c8a832] focus:ring-[#c8a832]/40 focus:ring-offset-0"
                      />
                      记住密码
                    </label>
                  </div>

                  <div className="pt-4">
                    <button type="submit" disabled={loading} className="relative w-full overflow-hidden group/btn">
                      <div className="absolute inset-0 border border-[#c8a832]/30 transition-all duration-500 group-hover/btn:border-[#c8a832]/60 group-hover/btn:bg-[#c8a832]/5" />
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-[#c8a832]/10 to-transparent transition-transform duration-1000 group-hover/btn:translate-x-full" />
                      <div className="relative flex items-center justify-center gap-3 px-6 py-4">
                        {loading ? (
                          <div className="flex items-center gap-3">
                            <div className="h-4 w-4 animate-spin rounded-full border border-[#c8a832]/40 border-t-[#c8a832]" />
                            <span className="text-sm tracking-wider text-[#c8a832]/80">验证中</span>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm font-medium tracking-[0.2em] text-[#c8a832]/80 transition-colors group-hover/btn:text-[#c8a832]">
                              登录
                            </span>
                            <ArrowRight className="h-4 w-4 text-[#c8a832]/40 transition-all duration-300 group-hover/btn:translate-x-1 group-hover/btn:text-[#c8a832]/80" />
                          </>
                        )}
                      </div>
                    </button>
                  </div>
                </form>

                <div className={`mt-10 transition-all duration-1000 delay-900 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                  <div className="mb-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/5" />
                    <span className="text-xs tracking-wider text-white/15">其他方式</span>
                    <div className="h-px flex-1 bg-white/5" />
                  </div>
                  <div className="flex gap-3">
                    {[
                      { name: '微信', char: '微' },
                      { name: '企微', char: '企' },
                      { name: '邮箱', char: '@' },
                    ].map((item) => (
                      <button key={item.name} className="flex-1 group/other" type="button">
                        <div className="flex flex-col items-center gap-2 border border-white/5 py-3 transition-all duration-300 group-hover/other:border-white/15 group-hover/other:bg-white/[0.02]">
                          <span className="text-sm font-light text-white/25 transition-colors group-hover/other:text-white/50">{item.char}</span>
                          <span className="text-[10px] tracking-wider text-white/15">{item.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-12 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/10">
                    LANYAO MEDIA MANAGEMENT SYSTEM
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </StyleShell>
    );
  }, [
    brandDescription,
    brandName,
    commonFormProps,
    errorMessage,
    handleForgotPassword,
    handleSubmit,
    layout,
    loading,
    mounted,
    password,
    remember,
    settings,
    showPassword,
    username,
    welcomeMessage,
    welcomeTitle,
  ]);

  return (
    <>
      {layoutNode}
      <ChangePasswordModal
        show={showChangePassword}
        oldPwd={oldPwd}
        newPwd={newPwd}
        confirmPwd={confirmPwd}
        loading={changePwdLoading}
        onOldPwdChange={setOldPwd}
        onNewPwdChange={setNewPwd}
        onConfirmPwdChange={setConfirmPwd}
        onCancel={() => {
          authStore.logout();
          setShowChangePassword(false);
        }}
        onConfirm={handleChangePassword}
      />
    </>
  );
}
