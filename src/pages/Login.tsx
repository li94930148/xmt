import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { changePassword, login } from '../api';
import { useAppStore, useAuthStore } from '../store';
import { loadRememberedCredentials, persistRememberedCredentials } from '../utils/rememberedCredentials';

type LoginLayoutMode = 'style1' | 'style2' | 'style3';

type LoginPageSettings = {
  systemName?: string;
  systemIcon?: string;
  systemLogo?: string;
  loginLayout?: LoginLayoutMode;
};

const SETTINGS_KEY = 'xmt_system_settings';

const defaultSettings: Required<LoginPageSettings> = {
  systemName: '山东岚曜信息科技有限公司',
  systemIcon: '岚',
  systemLogo: '',
  loginLayout: 'style1',
};

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

function loadLoginSettings(): Required<LoginPageSettings> {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
  } catch {
    return defaultSettings;
  }
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
        <p className="mt-3 text-sm leading-6 text-white/55">为保障账号安全，首次登录需设置新密码后方可使用系统。</p>

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
          <button onClick={onCancel} className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-white/70 transition hover:bg-white/[0.06]">
            退出登录
          </button>
          <button onClick={onConfirm} disabled={loading} className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/92 disabled:cursor-not-allowed disabled:opacity-70">
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

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const authStore = useAuthStore();
  const appStore = useAppStore();

  const [settings, setSettings] = useState<Required<LoginPageSettings>>(loadLoginSettings);
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
    const handleSettingsChanged = () => setSettings(loadLoginSettings());
    window.addEventListener('xmt-settings-changed', handleSettingsChanged);
    return () => window.removeEventListener('xmt-settings-changed', handleSettingsChanged);
  }, []);

  useEffect(() => {
    document.title = settings.systemName;
  }, [settings.systemName]);

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
      const message = '请输入用户名或邮箱，并填写密码。';
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

      appStore.addNotification({ title: '登录成功', message: `欢迎回来，${result.user.name}`, type: 'success' });
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
      appStore.addNotification({ title: '修改成功', message: '密码已更新，请重新登录', type: 'success' });
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

  const layout = settings.loginLayout || 'style1';

  const layoutNode = useMemo(() => {
    if (layout === 'style2') {
      return (
        <StyleShell>
          <div className="relative min-h-screen overflow-hidden bg-[#050508]">
            <div className="absolute inset-0">
              <div className="absolute left-[15%] top-[8%] h-[700px] w-[700px] rounded-full bg-amber-500/[0.07] blur-[200px]" />
              <div className="absolute right-[10%] top-[12%] h-[500px] w-[500px] rounded-full bg-yellow-600/[0.05] blur-[180px]" />
              <div className="absolute bottom-[5%] left-[40%] h-[400px] w-[400px] rounded-full bg-orange-500/[0.04] blur-[160px]" />
              <div className="absolute left-[60%] top-[60%] h-[300px] w-[300px] rounded-full bg-rose-500/[0.03] blur-[140px]" />
            </div>

            <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'linear-gradient(rgba(212,175,55,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,55,0.4) 1px, transparent 1px)', backgroundSize: '80px 80px' }} />

            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
            <div className="absolute top-1/2 left-0 w-px h-[500px] -translate-y-1/2 bg-gradient-to-b from-transparent via-amber-500/15 to-transparent" />
            <div className="absolute top-1/2 right-0 w-px h-[500px] -translate-y-1/2 bg-gradient-to-b from-transparent via-amber-500/15 to-transparent" />

            <div className={`relative z-10 flex min-h-screen items-center justify-center px-5 transition-all duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
              <div className="w-full max-w-[460px]">
                <div className="mb-10 text-center">
                  <div className="relative mx-auto mb-6 inline-flex">
                    <div className="absolute -inset-3 rounded-full bg-amber-500/10 blur-xl" />
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-yellow-600/5 to-transparent text-3xl font-light text-amber-200/90 shadow-[0_0_60px_rgba(212,175,55,0.12)]">
                      {settings.systemIcon || settings.systemName.slice(0, 1)}
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-4 mb-5">
                    <div className="h-px w-12 bg-gradient-to-r from-transparent to-amber-500/40" />
                    <p className="text-[11px] uppercase tracking-[0.4em] text-amber-400/50 font-medium">Private Access</p>
                    <div className="h-px w-12 bg-gradient-to-l from-transparent to-amber-500/40" />
                  </div>
                  <h2 className="text-4xl font-extralight tracking-tight">
                    <span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 bg-clip-text text-transparent">欢迎回来</span>
                  </h2>
                  <p className="mt-4 text-sm leading-6 text-white/30">输入凭证以访问您的专属工作空间</p>
                </div>

                <div className="relative">
                  <div className="absolute -inset-px rounded-[32px] bg-gradient-to-b from-amber-500/20 via-amber-500/5 to-amber-500/10" />
                  <div className="absolute -inset-px rounded-[32px] bg-gradient-to-r from-amber-500/10 via-transparent to-amber-500/10" />
                  <div className="relative rounded-[32px] border border-amber-500/10 bg-black/60 p-10 shadow-[0_40px_100px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(212,175,55,0.08)] backdrop-blur-3xl">
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-px w-32 h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />

                    {errorMessage && (
                      <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-5 py-3.5 text-sm text-red-200/90">
                        <span className="text-red-400/80">!</span>
                        {errorMessage}
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div>
                        <label className="mb-2.5 block text-[13px] font-medium text-amber-200/40 tracking-wide">账号</label>
                        <div className="group relative">
                          <input
                            value={username}
                            onChange={(e) => {
                              setUsername(e.target.value);
                              if (errorMessage) setErrorMessage('');
                            }}
                            className="h-14 w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 text-[15px] text-white/90 outline-none transition-all duration-500 placeholder:text-white/20 focus:border-amber-500/30 focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(212,175,55,0.06),0_0_30px_rgba(212,175,55,0.05)]"
                            placeholder="请输入账号"
                            autoComplete="username"
                          />
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-0 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent transition-all duration-700 group-focus-within:w-[80%]" />
                        </div>
                      </div>

                      <div>
                        <label className="mb-2.5 block text-[13px] font-medium text-amber-200/40 tracking-wide">密码</label>
                        <div className="group relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              if (errorMessage) setErrorMessage('');
                            }}
                            className="h-14 w-full rounded-2xl border border-white/[0.06] bg-white/[0.03] px-5 pr-14 text-[15px] text-white/90 outline-none transition-all duration-500 placeholder:text-white/20 focus:border-amber-500/30 focus:bg-white/[0.05] focus:shadow-[0_0_0_4px_rgba(212,175,55,0.06),0_0_30px_rgba(212,175,55,0.05)]"
                            placeholder="请输入密码"
                            autoComplete="current-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute right-5 top-1/2 -translate-y-1/2 text-white/20 transition-colors hover:text-amber-300/60"
                            aria-label="切换密码可见状态"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-0 bg-gradient-to-r from-transparent via-amber-400/60 to-transparent transition-all duration-700 group-focus-within:w-[80%]" />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <label className="flex cursor-pointer items-center gap-3 text-sm text-white/35 transition-colors hover:text-white/50">
                          <div className="relative">
                            <input
                              type="checkbox"
                              checked={remember}
                              onChange={(e) => setRemember(e.target.checked)}
                              className="peer sr-only"
                            />
                            <div className="h-4 w-4 rounded border border-white/15 bg-white/[0.03] transition-all peer-checked:border-amber-500/50 peer-checked:bg-amber-500/20" />
                            <svg className="absolute left-0 top-0 h-4 w-4 text-amber-300 opacity-0 transition-opacity peer-checked:opacity-100" viewBox="0 0 16 16" fill="none">
                              <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                          记住密码
                        </label>
                        <button type="button" onClick={handleForgotPassword} className="text-sm text-amber-400/40 transition-colors hover:text-amber-300/70">
                          忘记密码？
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="group relative mt-3 flex h-14 w-full items-center justify-center gap-3 overflow-hidden rounded-2xl text-[15px] font-medium tracking-wide transition-all duration-500 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 transition-all duration-500" />
                        <div className="absolute inset-0 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                        <div className="absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)', transform: 'translateX(-100%)', animation: 'none' }} />
                        <div className="absolute inset-0 shadow-[0_8px_32px_rgba(212,175,55,0.25)] group-hover:shadow-[0_12px_40px_rgba(212,175,55,0.35)]" />
                        {loading ? (
                          <span className="relative h-5 w-5 rounded-full border-2 border-black/20 border-t-black/60 animate-spin" />
                        ) : (
                          <>
                            <span className="relative text-black/80 group-hover:text-black/90">进入系统</span>
                            <ArrowRight className="relative h-4 w-4 text-black/50 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-black/70" />
                          </>
                        )}
                      </button>
                    </form>

                    <div className="mt-8 flex items-center gap-4">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/[0.06]" />
                      <span className="text-[11px] text-white/15 tracking-widest uppercase">Secured</span>
                      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/[0.06]" />
                    </div>

                    <div className="mt-6 flex justify-center gap-8">
                      {[
                        { icon: 'AES', label: '加密传输' },
                        { icon: 'JWT', label: '令牌认证' },
                        { icon: 'RBAC', label: '权限管控' },
                      ].map((item) => (
                        <div key={item.icon} className="flex flex-col items-center gap-1.5">
                          <span className="text-[10px] font-semibold tracking-wider text-amber-400/30">{item.icon}</span>
                          <span className="text-[10px] text-white/15">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-10 text-center">
                  <p className="text-[11px] tracking-[0.2em] text-white/10">{settings.systemName}</p>
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
          <div className="relative min-h-screen overflow-hidden bg-white">
            <div className="min-h-screen lg:grid lg:grid-cols-2">
              <div className="relative hidden bg-[#0c0f1a] lg:flex lg:flex-col lg:justify-between overflow-hidden p-12 xl:p-16">
                <div className="absolute inset-0">
                  <div className="absolute -left-[30%] top-[20%] h-[500px] w-[500px] rounded-full bg-amber-500/8 blur-[150px]" />
                  <div className="absolute bottom-[15%] right-[10%] h-[350px] w-[350px] rounded-full bg-orange-500/6 blur-[120px]" />
                </div>
                <div className="absolute inset-0 opacity-[0.025]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

                <div className={`relative z-10 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-sm font-semibold text-amber-300/80">
                      {settings.systemIcon || settings.systemName.slice(0, 1)}
                    </div>
                    <span className="text-sm font-medium text-white/70">{settings.systemName}</span>
                  </div>
                </div>

                <div className={`relative z-10 max-w-md transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                  <p className="text-xs uppercase tracking-[0.3em] text-amber-400/50 font-medium">新媒体内容中台</p>
                  <h1 className="mt-5 text-[clamp(2.5rem,5vw,4.5rem)] font-bold leading-[1.05] tracking-tight text-white">
                    从想法到发布
                    <br />
                    一条链路走完
                  </h1>
                  <p className="mt-6 text-base leading-7 text-white/35">
                    选题立项、脚本撰写、拍摄排期、多平台分发与数据复盘——把散落的流程串成一条清晰的内容生产线。
                  </p>

                  <div className="mt-10 flex gap-6">
                    {[
                      { value: '4', label: '生产阶段' },
                      { value: '∞', label: '版本追溯' },
                      { value: '∞', label: '团队协同' },
                    ].map((item) => (
                      <div key={item.label}>
                        <p className="text-3xl font-bold text-white/80">{item.value}</p>
                        <p className="mt-1 text-xs text-white/25">{item.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={`relative z-10 transition-all duration-700 delay-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                  <p className="text-[11px] text-white/12 tracking-wider">{settings.systemName} · 内容生产协作平台</p>
                </div>
              </div>

              <div className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
                <div className={`w-full max-w-[380px] transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
                  <div className="mb-10 lg:hidden">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-base font-semibold text-white mb-4">
                      {settings.systemIcon || settings.systemName.slice(0, 1)}
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">从想法到发布</h1>
                    <p className="mt-2 text-sm text-slate-400">新媒体内容中台</p>
                  </div>

                  <div className="mb-8">
                    <h2 className="text-2xl font-bold text-slate-900">登录</h2>
                    <p className="mt-2 text-sm text-slate-400">输入账号信息以继续</p>
                  </div>

                  {errorMessage && (
                    <div className="mb-5 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                      <span className="text-red-400">!</span>
                      {errorMessage}
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">账号</label>
                      <input
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          if (errorMessage) setErrorMessage('');
                        }}
                        className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-slate-900 outline-none transition-all placeholder:text-slate-300 focus:border-amber-400 focus:bg-white focus:shadow-[0_0_0_3px_rgba(245,158,11,0.08)]"
                        placeholder="请输入账号"
                        autoComplete="username"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">密码</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (errorMessage) setErrorMessage('');
                          }}
                          className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 pr-12 text-slate-900 outline-none transition-all placeholder:text-slate-300 focus:border-amber-400 focus:bg-white focus:shadow-[0_0_0_3px_rgba(245,158,11,0.08)]"
                          placeholder="请输入密码"
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 transition-colors hover:text-slate-500"
                          aria-label="切换密码可见状态"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-500">
                        <input
                          type="checkbox"
                          checked={remember}
                          onChange={(e) => setRemember(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-400/30 focus:ring-offset-0"
                        />
                        记住密码
                      </label>
                      <button type="button" onClick={handleForgotPassword} className="text-sm text-amber-600 transition-colors hover:text-amber-700">
                        忘记密码？
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="group mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {loading ? (
                        <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      ) : (
                        <>
                          进入系统
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                        </>
                      )}
                    </button>
                  </form>

                  <p className="mt-8 text-center text-[11px] text-slate-300 tracking-wider">
                    {settings.systemName}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </StyleShell>
      );
    }

    return (
      <StyleShell>
        <div className="min-h-screen bg-[#0a0a0a] overflow-hidden relative text-white">
          <div
            className="fixed inset-0 opacity-[0.03] pointer-events-none z-50"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E")`,
              backgroundSize: '128px 128px',
            }}
          />

          <div className="fixed top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-[#c8a832]/20 to-transparent rotate-12 translate-x-[30vw] pointer-events-none" />
          <div className="fixed top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-[#c8a832]/10 to-transparent rotate-12 translate-x-[32vw] pointer-events-none" />

          <div className="min-h-screen flex">
            <div className="hidden lg:flex lg:w-[55%] relative items-center justify-center overflow-hidden">
              <div className="absolute inset-0">
                <div className="absolute top-1/3 left-1/4 w-[500px] h-[500px] bg-[#c8a832]/5 rounded-full blur-[150px]" />
                <div className="absolute bottom-1/4 right-1/3 w-[300px] h-[300px] bg-[#c8a832]/3 rounded-full blur-[100px]" />
              </div>

              <div className="absolute inset-0 opacity-[0.04]">
                {[...Array(8)].map((_, i) => (
                  <div key={`h-${i}`} className="absolute w-full h-px bg-white" style={{ top: `${(i + 1) * 12.5}%` }} />
                ))}
                {[...Array(12)].map((_, i) => (
                  <div key={`v-${i}`} className="absolute h-full w-px bg-white" style={{ left: `${(i + 1) * 8.33}%` }} />
                ))}
              </div>

              <div className="relative z-10 px-16 max-w-xl">
                <div className={`transition-all duration-1000 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <div className="flex items-center gap-4 mb-12">
                    <div className="w-12 h-12 border border-[#c8a832]/40 flex items-center justify-center">
                      <div className="w-3 h-3 bg-[#c8a832]" />
                    </div>
                    <div className="h-px w-16 bg-[#c8a832]/30" />
                    <span className="text-[#c8a832]/60 text-xs tracking-[0.3em] uppercase font-medium">Str.2025</span>
                  </div>
                </div>

                <div className={`transition-all duration-1000 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <h1 className="text-[clamp(3rem,8vw,7rem)] font-extralight leading-[0.9] tracking-tight text-white/90 mb-2">
                    岚曜
                  </h1>
                  <div className="flex items-center gap-6 mt-6 mb-10">
                    <div className="h-px w-24 bg-gradient-to-r from-[#c8a832] to-transparent" />
                    <span className="text-[#c8a832] text-sm tracking-[0.2em] font-medium">LAN YAO</span>
                  </div>
                </div>

                <div className={`transition-all duration-1000 delay-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <p className="text-white/30 text-lg leading-relaxed font-light max-w-md">
                    从一个选题开始，
                    <br />
                    经过脚本、拍摄与剪辑，
                    <br />
                    让好内容被更多人看到。
                  </p>
                </div>

                <div className={`mt-16 transition-all duration-1000 delay-600 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                  <div className="flex items-center gap-3 text-white/15 text-xs tracking-widest">
                    <div className="w-1.5 h-1.5 border border-white/20 rotate-45" />
                    <span>新媒体协作管理系统</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="w-full lg:w-[45%] flex items-center justify-center relative">
              <div className="lg:hidden absolute top-8 left-0 right-0 text-center">
                <h1 className="text-3xl font-extralight text-white/80 tracking-tight">岚曜</h1>
                <p className="text-white/20 text-xs tracking-[0.3em] mt-1 uppercase">新媒体协作管理系统</p>
              </div>

              <div className={`w-full max-w-[400px] px-8 lg:px-0 transition-all duration-1000 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}>
                <div className="mb-10">
                  <h2 className="text-white/80 text-2xl font-light tracking-tight mb-2">欢迎回来</h2>
                  <p className="text-white/25 text-sm">请输入你的账户信息</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="group">
                    <label className="block text-white/30 text-xs tracking-wider uppercase mb-3 font-medium">用户名</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full bg-transparent border-b border-white/10 pb-3 text-white/90 text-base focus:outline-none focus:border-[#c8a832]/60 transition-colors duration-500 placeholder-white/15"
                        placeholder="输入用户名"
                        required
                      />
                      <div className="absolute bottom-0 left-0 w-0 h-px bg-[#c8a832] group-focus-within:w-full transition-all duration-700" />
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-white/30 text-xs tracking-wider uppercase mb-3 font-medium">密码</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-transparent border-b border-white/10 pb-3 pr-10 text-white/90 text-base focus:outline-none focus:border-[#c8a832]/60 transition-colors duration-500 placeholder-white/15"
                        placeholder="输入密码"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-0 bottom-3 text-white/20 hover:text-white/50 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <div className="absolute bottom-0 left-0 w-0 h-px bg-[#c8a832] group-focus-within:w-full transition-all duration-700" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="remember"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="w-3.5 h-3.5 rounded border-white/20 bg-transparent text-[#c8a832] focus:ring-[#c8a832]/40 focus:ring-offset-0 cursor-pointer"
                    />
                    <label htmlFor="remember" className="text-white/30 text-xs tracking-wider cursor-pointer hover:text-white/50 transition-colors">
                      记住密码
                    </label>
                  </div>

                  <div className="pt-4">
                    <button type="submit" disabled={loading} className="relative w-full group/btn overflow-hidden">
                      <div className="absolute inset-0 border border-[#c8a832]/30 transition-all duration-500 group-hover/btn:border-[#c8a832]/60 group-hover/btn:bg-[#c8a832]/5" />
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#c8a832]/10 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000" />
                      <div className="relative flex items-center justify-center gap-3 py-4 px-6">
                        {loading ? (
                          <div className="flex items-center gap-3">
                            <div className="w-4 h-4 border border-[#c8a832]/40 border-t-[#c8a832] rounded-full animate-spin" />
                            <span className="text-[#c8a832]/80 text-sm tracking-wider">验证中</span>
                          </div>
                        ) : (
                          <>
                            <span className="text-[#c8a832]/80 text-sm tracking-[0.2em] font-medium group-hover/btn:text-[#c8a832] transition-colors">登录</span>
                            <ArrowRight className="w-4 h-4 text-[#c8a832]/40 group-hover/btn:text-[#c8a832]/80 group-hover/btn:translate-x-1 transition-all duration-300" />
                          </>
                        )}
                      </div>
                    </button>
                  </div>
                </form>

                <div className={`mt-10 transition-all duration-1000 delay-900 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="h-px flex-1 bg-white/5" />
                    <span className="text-white/15 text-xs tracking-wider">其他方式</span>
                    <div className="h-px flex-1 bg-white/5" />
                  </div>
                  <div className="flex gap-3">
                    {[
                      { name: '微信', char: '微' },
                      { name: '企微', char: '企' },
                      { name: '邮箱', char: '@' },
                    ].map((item) => (
                      <button key={item.name} className="flex-1 group/other" type="button">
                        <div className="border border-white/5 py-3 flex flex-col items-center gap-2 transition-all duration-300 group-hover/other:border-white/15 group-hover/other:bg-white/[0.02]">
                          <span className="text-white/25 text-sm font-light group-hover/other:text-white/50 transition-colors">{item.char}</span>
                          <span className="text-white/15 text-[10px] tracking-wider">{item.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`mt-12 text-center transition-all duration-1000 delay-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
                  <p className="text-white/10 text-[10px] tracking-widest uppercase">Lanyao Media Management System</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </StyleShell>
    );
  }, [errorMessage, handleForgotPassword, handleSubmit, layout, loading, mounted, password, remember, settings, showPassword, username]);

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






