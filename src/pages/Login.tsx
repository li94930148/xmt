import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { changePassword, getPublicSystemSettings, login } from '../api';
import { mobileLogin } from '../api/auth';
import { notifyNativeTokenIssued } from '@/auth/native/native-auth-runtime';
import { getNativeEndpointConfigurationError, isAndroid } from '@/platform/runtime';
import { nativeRefreshCredentials, nativeUserProfile } from '@/auth/native/secure-credentials';
import { LoginError } from '../api/auth';
import { completeWebLogin, completeWebLoginRedirect } from '../auth/web/web-auth-runtime';
import { useAppStore, useAuthStore } from '../store';
import { loadRememberedCredentials, persistRememberedCredentials } from '../utils/rememberedCredentials';
import {
  applyDocumentBranding,
  defaultSystemSettings,
  ManagedSystemSettings,
} from '@/lib/systemSettings';
import LoginHero from '../components/xmt-ui/LoginHero';


function formatRetryAfter(seconds?: number) {
  if (!seconds || seconds <= 0) return '';

  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} 分钟后再试。`;
}

function resolveLoginErrorMessage(error: unknown) {
  if (error instanceof LoginError) {
    if (error.kind === 'rate_limited') {
      const retryText = formatRetryAfter(error.retryAfterSeconds);
      const rateLimitMessage = error.rateLimitDimension === 'login_ip'
        ? '当前网络登录请求较多，请稍后重试。'
        : error.rateLimitDimension === 'login_account'
          ? '该账号连续登录失败次数较多，请检查密码后再试。'
          : error.rateLimitDimension === 'api'
            ? '系统请求较多，请稍后重试。'
            : '';
      const remainingText = typeof error.remainingAttempts === 'number'
        ? `还可以尝试 ${error.remainingAttempts} 次。`
        : '';

      if (retryText) {
        if (rateLimitMessage) {
          return `${rateLimitMessage} 请在 ${retryText}`;
        }
        return `试错次数过多，请在 ${retryText}`;
      }
      if (remainingText) {
        return `登录失败次数较多，请谨慎重试。${remainingText}`;
      }
      return '登录失败次数较多，请稍后再试。';
    }

    return error.message;
  }

  return '当前服务暂时不可用，请稍后再试。';
}
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
    <div className="xmt-overlay xmt-overlay-center z-50 px-4">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-studio-app-bg p-8 text-white shadow-2xl">
        <p className="text-xs uppercase tracking-[0.28em] text-studio-text-secondary">首次登录</p>
        <h3 className="mt-3 text-2xl font-semibold">请先修改初始密码</h3>
        <p className="mt-3 text-sm leading-6 text-studio-text-secondary">
          为保障账号安全，首次登录后需先设置新密码。
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="password"
            value={oldPwd}
            onChange={(event) => onOldPwdChange(event.target.value)}
            className="h-12 w-full rounded-2xl border border-studio-border-soft bg-white/[0.05] px-4 text-white outline-none placeholder:text-studio-text-secondary"
            placeholder="当前密码"
          />
          <input
            type="password"
            value={newPwd}
            onChange={(event) => onNewPwdChange(event.target.value)}
            className="h-12 w-full rounded-2xl border border-studio-border-soft bg-white/[0.05] px-4 text-white outline-none placeholder:text-studio-text-secondary"
            placeholder="新密码（至少 6 位）"
          />
          <input
            type="password"
            value={confirmPwd}
            onChange={(event) => onConfirmPwdChange(event.target.value)}
            className="h-12 w-full rounded-2xl border border-studio-border-soft bg-white/[0.05] px-4 text-white outline-none placeholder:text-studio-text-secondary"
            placeholder="确认新密码"
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-studio-text-secondary transition hover:bg-white/[0.06]"
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

function FilingLinks({ light = false }: { light?: boolean }) {
  const linkClass = light
    ? 'text-studio-text-secondary hover:text-studio-text-primary'
    : 'text-studio-text-muted/80 hover:text-studio-primary';

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-4 z-20 px-4 text-center text-xs leading-6 text-studio-text-muted sm:bottom-5">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <a
          href="https://beian.miit.gov.cn/"
          rel="noreferrer"
          target="_blank"
          className={`transition-colors ${linkClass}`}
        >
          鲁ICP备2026036685号
        </a>
        <a
          href="https://beian.mps.gov.cn/#/query/webSearch?code=37091102000948"
          rel="noreferrer"
          target="_blank"
          className={`transition-colors ${linkClass}`}
        >
          鲁公网安备37091102000948号
        </a>
      </div>
    </div>
  );
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
    ? 'border-studio-border-soft bg-white/[0.05] text-studio-text-primary placeholder:text-studio-text-muted focus:border-studio-border-active'
    : 'border-studio-border-soft bg-studio-surface-soft text-studio-text-primary placeholder:text-studio-text-secondary';
  const labelClass = dark ? 'text-studio-text-secondary' : 'text-studio-text-muted';
  const helperClass = dark ? 'text-studio-text-secondary' : 'text-studio-text-muted';
  const linkClass = dark ? 'text-studio-primary-contrast hover:text-studio-primary' : 'text-studio-primary hover:opacity-80';
  const buttonClass = dark
    ? 'xmt-btn-primary text-white'
    : 'bg-studio-primary text-white hover:opacity-92';

  return (
    <>
      <div className="mb-6">
        <h2 className={`text-2xl font-semibold ${dark ? 'text-white' : 'text-studio-text-primary'}`}>{welcomeTitle}</h2>
        <p className={`mt-2 text-sm ${helperClass}`}>{welcomeMessage}</p>
      </div>

      {errorMessage && (
        <div className={`mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm ${dark ? 'border-studio-coral/20 bg-studio-coral/[0.06] text-studio-coral/90' : 'border-studio-coral bg-studio-coral text-studio-coral'}`}>
          <span className="text-studio-coral">!</span>
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
              className={`absolute right-4 top-1/2 -translate-y-1/2 ${dark ? 'text-studio-text-secondary hover:text-studio-text-secondary' : 'text-studio-text-secondary hover:text-studio-text-muted'}`}
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
              className="h-4 w-4 rounded border-studio-border-soft text-studio-primary focus:ring-studio-primary/30 focus:ring-offset-0"
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
            <span className={`h-4 w-4 animate-spin rounded-full border-2 ${dark ? 'border-white/25 border-t-white' : 'border-white/30 border-t-white'}`} />
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
  // A packaged Android build may be opened before its API endpoint is supplied.
  // Show the actionable configuration issue in the login shell instead of failing
  // during application bootstrap and leaving a blank native screen.
  const [errorMessage, setErrorMessage] = useState(() => getNativeEndpointConfigurationError() || '');
  const loginRequestInFlight = useRef(false);

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
    if (loginRequestInFlight.current) return;
    const endpointConfigurationError = getNativeEndpointConfigurationError();
    if (endpointConfigurationError) {
      setErrorMessage(endpointConfigurationError);
      return;
    }
    setErrorMessage('');

    if (!username.trim() || !password.trim()) {
      const message = '请输入账号并填写密码。';
      setErrorMessage(message);
      appStore.addNotification({ title: '登录失败', message, type: 'error' });
      return;
    }

    loginRequestInFlight.current = true;
    setLoading(true);
    try {
      const result = isAndroid() ? await mobileLogin(username.trim(), password) : await login(username.trim(), password);
      if (isAndroid()) {
        await nativeRefreshCredentials.set((result as typeof result & { refreshToken: string }).refreshToken);
        nativeUserProfile.set(result.user);
        authStore.loginV1(result.user, result.accessToken);
        notifyNativeTokenIssued({ expiresInSeconds: (result as typeof result & { expiresIn: number }).expiresIn }, 'login');
      } else if (result.authMode === 'v1-web') {
        completeWebLogin(result, authStore.loginV1);
      } else {
        authStore.login(result.user, result.accessToken, { persist: remember ? 'local' : 'session' });
      }
      try {
        await persistRememberedCredentials(remember, username.trim(), password);
      } catch {
        // Remembering credentials is optional and must not invalidate a completed login.
      }

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
      if (result.authMode === 'v1-web') {
        completeWebLoginRedirect(result.user.id);
      }
    } catch (error) {
      const message = resolveLoginErrorMessage(error);
      setErrorMessage(message);
      appStore.addNotification({ title: '登录失败', message, type: 'error' });
    } finally {
      loginRequestInFlight.current = false;
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
          <div className="relative min-h-screen overflow-hidden bg-studio-app-bg">
            <LoginHero />
            <div className="absolute inset-0">
              <div className="absolute left-[15%] top-[8%] h-[700px] w-[700px] rounded-full bg-studio-primary/[0.12] blur-[200px]" />
              <div className="absolute right-[10%] top-[12%] h-[500px] w-[500px] rounded-full bg-studio-violet/[0.10] blur-[180px]" />
              <div className="absolute bottom-[5%] left-[40%] h-[400px] w-[400px] rounded-full bg-studio-cyan/[0.08] blur-[160px]" />
            </div>

            <div className={`relative z-10 flex min-h-screen items-center justify-center px-5 py-12 pb-24 transition-all duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
              <div className="w-full max-w-[460px]">
                <div className="mb-10 text-center">
                  <div className="relative mx-auto mb-6 inline-flex h-20 w-20 items-center justify-center rounded-full border border-studio-border-active bg-gradient-to-br from-studio-primary/15 via-studio-violet/10 to-transparent text-3xl font-light text-studio-primary-contrast shadow-glow-primary">
                    <BrandMark settings={settings} roundedClass="rounded-full" />
                  </div>
                  <div className="flex items-center justify-center gap-4 mb-5">
                    <div className="h-px w-12 bg-gradient-to-r from-transparent to-studio-primary/50" />
                    <p className="text-[11px] uppercase tracking-[0.4em] text-studio-cyan font-medium">{brandName}</p>
                    <div className="h-px w-12 bg-gradient-to-l from-transparent to-studio-primary/50" />
                  </div>
                  <p className="mx-auto max-w-md text-sm leading-6 text-studio-text-secondary">{brandDescription}</p>
                </div>

                <div className="studio-sheen relative overflow-hidden rounded-panel border border-studio-border-soft bg-studio-surface-glass p-10 shadow-floating backdrop-blur-3xl">
                  <LoginForm {...commonFormProps} dark />
                </div>
              </div>
            </div>
            <FilingLinks />
          </div>
        </StyleShell>
      );
    }

    if (layout === 'style3') {
      return (
        <StyleShell>
          <div className="relative min-h-screen overflow-hidden bg-white pb-20">
            <LoginHero />
            <div className="min-h-screen lg:grid lg:grid-cols-2">
              <div className="relative hidden bg-studio-app-bg lg:flex lg:flex-col lg:justify-between overflow-hidden p-12 xl:p-16">
                <div className={`relative z-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white/[0.06] text-sm font-semibold text-studio-primary-contrast">
                      <BrandMark settings={settings} roundedClass="rounded-xl" />
                    </div>
                    <span className="text-sm font-medium text-studio-text-secondary">{settings.system.name}</span>
                  </div>
                </div>

                <div className={`relative z-10 max-w-md transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                  <p className="text-xs uppercase tracking-[0.3em] text-studio-cyan font-medium">{brandName}</p>
                  <h1 className="mt-5 text-[clamp(2.5rem,5vw,4.5rem)] font-bold leading-[1.05] tracking-tight text-white">
                    {welcomeTitle}
                  </h1>
                  <p className="mt-6 text-base leading-7 text-studio-text-secondary">{brandDescription}</p>
                </div>

                <div className={`relative z-10 transition-all duration-700 delay-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                  <p className="text-[11px] text-studio-text-muted tracking-wider">{settings.system.name} · 内容生产协作平台</p>
                </div>
              </div>

              <div className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
                <div className={`w-full max-w-[380px] transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                  <div className="mb-10 lg:hidden">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-studio-surface text-base font-semibold text-white">
                      <BrandMark settings={settings} roundedClass="rounded-2xl" />
                    </div>
                    <h1 className="text-2xl font-bold text-studio-text-primary">{brandName}</h1>
                    <p className="mt-2 text-sm text-studio-text-muted">{brandDescription}</p>
                  </div>

                  <LoginForm {...commonFormProps} dark={false} />
                  <p className="mt-8 text-center text-[11px] text-studio-text-secondary tracking-wider">{settings.system.name}</p>
                </div>
              </div>
            </div>
            <FilingLinks light />
          </div>
        </StyleShell>
      );
    }

    return (
      <StyleShell>
        <div className="relative min-h-screen overflow-hidden bg-studio-app-bg text-white">
          <LoginHero />
          <div
            className="pointer-events-none fixed inset-0 z-50 opacity-[0.03]"
            style={{
              backgroundImage:
                'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")',
              backgroundSize: '128px 128px',
            }}
          />

          <div className="pointer-events-none fixed right-0 top-0 h-full w-px translate-x-[30vw] rotate-12 bg-gradient-to-b from-transparent via-studio-primary/20 to-transparent" />
          <div className="pointer-events-none fixed right-0 top-0 h-full w-px translate-x-[32vw] rotate-12 bg-gradient-to-b from-transparent via-studio-primary/10 to-transparent" />

          <div className="min-h-screen flex pb-20">
            <div className="hidden lg:flex lg:w-[55%] relative items-center justify-center overflow-hidden">
              <div className="absolute inset-0">
                <div className="absolute left-1/4 top-1/3 h-[500px] w-[500px] rounded-full bg-studio-primary/[0.08] blur-[150px]" />
                <div className="absolute bottom-1/4 right-1/3 h-[300px] w-[300px] rounded-full bg-studio-primary/[0.06] blur-[100px]" />
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
                    <div className="flex h-12 w-12 items-center justify-center border border-studio-primary/40">
                      <div className="h-3 w-3 bg-studio-primary" />
                    </div>
                    <div className="h-px w-16 bg-studio-primary/[0.06]0" />
                    <span className="text-studio-primary/80 text-xs tracking-[0.3em] uppercase font-medium">STR.2025</span>
                  </div>
                </div>

                <div className={`transition-all duration-1000 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <h1 className="mb-2 text-[clamp(3rem,8vw,7rem)] font-extralight leading-[0.9] tracking-tight text-studio-text-primary">
                    岚曜
                  </h1>
                  <div className="mb-10 mt-6 flex items-center gap-6">
                    <div className="h-px w-24 bg-gradient-to-r from-studio-primary to-transparent" />
                    <span className="text-sm font-medium tracking-[0.2em] text-studio-primary">LAN YAO</span>
                  </div>
                </div>

                <div className={`transition-all duration-1000 delay-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <p className="max-w-md text-lg font-light leading-relaxed text-studio-text-secondary">
                    从一个选题开始，
                    <br />
                    经过脚本、拍摄与剪辑，
                    <br />
                    让好内容被更多人看到。
                  </p>
                </div>

                <div className={`mt-16 transition-all duration-1000 delay-600 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <div className="flex items-center gap-3 text-xs tracking-widest text-studio-text-muted">
                    <div className="h-1.5 w-1.5 rotate-45 border border-white/20" />
                    <span>新媒体协作管理系统</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full lg:w-[45%] flex items-center justify-center relative">
              <div className="absolute left-0 right-0 top-8 text-center lg:hidden">
                <h1 className="text-3xl font-extralight tracking-tight text-studio-text-primary">岚曜</h1>
                <p className="mt-1 text-xs uppercase tracking-[0.3em] text-studio-text-muted">新媒体协作管理系统</p>
              </div>

              <div className={`w-full max-w-[400px] px-8 lg:px-0 transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                <div className="mb-10">
                  <h2 className="mb-2 text-2xl font-light tracking-tight text-studio-text-primary">欢迎回来</h2>
                  <p className="text-sm text-studio-text-secondary">请输入你的账户信息</p>
                </div>

                {errorMessage && (
                  <div className="mb-6 rounded border border-studio-coral/20 bg-studio-coral/5 px-4 py-3 text-sm text-studio-coral/90">
                    {errorMessage}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="group">
                    <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-studio-text-secondary">用户名</label>
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
                        className="w-full border-b border-studio-border-soft bg-transparent pb-3 text-base text-studio-text-primary placeholder-studio-text-muted transition-colors duration-500 focus:border-studio-border-active focus:outline-none"
                        placeholder="输入用户名"
                        autoComplete="username"
                        required
                      />
                      <div className="absolute bottom-0 left-0 h-px w-0 bg-studio-primary transition-all duration-700 group-focus-within:w-full" />
                    </div>
                  </div>

                  <div className="group">
                    <label className="mb-3 block text-xs font-medium uppercase tracking-wider text-studio-text-secondary">密码</label>
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
                        className="w-full border-b border-studio-border-soft bg-transparent pb-3 pr-10 text-base text-studio-text-primary placeholder-studio-text-muted transition-colors duration-500 focus:border-studio-border-active focus:outline-none"
                        placeholder="输入密码"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute bottom-3 right-0 text-studio-text-muted transition-colors hover:text-white/50"
                        aria-label="切换密码可见状态"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      <div className="absolute bottom-0 left-0 h-px w-0 bg-studio-primary transition-all duration-700 group-focus-within:w-full" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <label className="flex cursor-pointer items-center gap-2 text-xs tracking-wider text-studio-text-secondary transition-colors hover:text-white/50">
                      <input
                        type="checkbox"
                        id="remember"
                        checked={remember}
                        onChange={(event) => setRemember(event.target.checked)}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-white/20 bg-transparent text-studio-primary focus:ring-studio-primary/30 focus:ring-offset-0"
                      />
                      记住密码
                    </label>
                  </div>

                  <div className="pt-4">
                    <button type="submit" disabled={loading} className="xmt-btn xmt-btn-primary relative w-full overflow-hidden group/btn min-h-12 rounded-button px-6 py-4 text-sm font-semibold tracking-[0.18em] text-white">
                      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover/btn:translate-x-full" />
                      <div className="relative flex items-center justify-center gap-3">
                        {loading ? (
                          <div className="flex items-center gap-3">
                            <div className="h-4 w-4 animate-spin rounded-full border border-white/30 border-t-white" />
                            <span className="text-sm tracking-wider">验证中</span>
                          </div>
                        ) : (
                          <>
                            <span className="text-sm font-semibold tracking-[0.18em]">登录</span>
                            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
                          </>
                        )}
                      </div>
                    </button>
                  </div>
                </form>

                <div className={`mt-10 transition-all duration-1000 delay-900 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                  <div className="mb-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-studio-border-soft" />
                    <span className="text-xs tracking-wider text-studio-text-muted">其他方式</span>
                    <div className="h-px flex-1 bg-studio-border-soft" />
                  </div>
                  <div className="flex gap-3">
                    {[
                      { name: '微信', char: '微' },
                      { name: '企微', char: '企' },
                      { name: '邮箱', char: '@' },
                    ].map((item) => (
                      <button key={item.name} className="flex-1 group/other" type="button">
                        <div className="flex flex-col items-center gap-2 border border-white/5 py-3 transition-all duration-300 group-hover/other:border-white/15 group-hover/other:bg-white/[0.02]">
                          <span className="text-sm font-light text-studio-text-secondary transition-colors group-hover/other:text-white/50">{item.char}</span>
                          <span className="text-[10px] tracking-wider text-studio-text-muted">{item.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-12 text-center">
                  <p className="text-[10px] uppercase tracking-widest text-studio-text-muted">
                    LANYAO MEDIA MANAGEMENT SYSTEM
                  </p>
                </div>
              </div>
            </div>
          </div>
          <FilingLinks />
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
