import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Clapperboard, Eye, EyeOff, Play } from 'lucide-react';
import { changePassword, login } from '../api';
import EnterpriseLoginLayout from '../components/login/EnterpriseLoginLayout';
import { useAppStore, useAuthStore } from '../store';

type LoginLayoutMode = 'style1' | 'style2' | 'style3';

type LoginPageSettings = {
  systemName?: string;
  systemIcon?: string;
  systemLogo?: string;
  loginLayout?: LoginLayoutMode;
};

type LoginTheme = 'dark' | 'light' | 'cinematic';

const SETTINGS_KEY = 'xmt_system_settings';
const REMEMBER_KEY = 'xmt_login_remember';
const USERNAME_KEY = 'xmt_login_username';
const PASSWORD_KEY = 'xmt_login_password';

const defaultSettings: Required<LoginPageSettings> = {
  systemName: '山东岚曜信息科技有限公司',
  systemIcon: '岚',
  systemLogo: '',
  loginLayout: 'style1',
};

const styleOptions: Record<LoginLayoutMode, { title: string; subtitle: string }> = {
  style1: {
    title: '样式一',
    subtitle: '当前经典版式',
  },
  style2: {
    title: '样式二',
    subtitle: 'Apple 风格',
  },
  style3: {
    title: '样式三',
    subtitle: '影视飓风首页风格',
  },
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

function loadRememberedAccount() {
  try {
    const remember = localStorage.getItem(REMEMBER_KEY) === 'true';
    return {
      remember,
      username: remember ? localStorage.getItem(USERNAME_KEY) || '' : '',
      password: remember ? localStorage.getItem(PASSWORD_KEY) || '' : '',
    };
  } catch {
    return { remember: false, username: '', password: '' };
  }
}

function persistRememberedAccount(remember: boolean, username: string, password: string) {
  if (remember) {
    localStorage.setItem(REMEMBER_KEY, 'true');
    localStorage.setItem(USERNAME_KEY, username);
    localStorage.setItem(PASSWORD_KEY, password);
    return;
  }

  localStorage.removeItem(REMEMBER_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(PASSWORD_KEY);
}

function LoginForm({
  username,
  password,
  showPassword,
  remember,
  loading,
  theme,
  systemName,
  onUsernameChange,
  onPasswordChange,
  onTogglePassword,
  onRememberChange,
  onSubmit,
}: {
  username: string;
  password: string;
  showPassword: boolean;
  remember: boolean;
  loading: boolean;
  theme: LoginTheme;
  systemName: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onRememberChange: (value: boolean) => void;
  onSubmit: (event: FormEvent) => Promise<void>;
}) {
  const themeClasses = {
    dark: {
      panel: 'border-white/10 bg-black/40 text-white backdrop-blur-2xl',
      title: 'text-white',
      secondary: 'text-white/62',
      muted: 'text-white/38',
      input: 'border-white/10 bg-white/[0.06] text-white placeholder:text-white/28 focus:border-white/30',
      button: 'bg-white text-black hover:bg-white/92',
      checkbox: 'border-white/20 bg-transparent text-white',
    },
    light: {
      panel: 'border-white/70 bg-white/78 text-slate-900 shadow-[0_30px_80px_rgba(15,23,42,0.12)] backdrop-blur-3xl',
      title: 'text-slate-900',
      secondary: 'text-slate-600',
      muted: 'text-slate-500',
      input: 'border-slate-200 bg-white/90 text-slate-900 placeholder:text-slate-400 focus:border-slate-400',
      button: 'bg-slate-900 text-white hover:bg-slate-800',
      checkbox: 'border-slate-300 bg-white text-slate-900',
    },
    cinematic: {
      panel: 'border-white/10 bg-slate-950/78 text-white shadow-[0_30px_90px_rgba(2,6,23,0.5)] backdrop-blur-2xl',
      title: 'text-white',
      secondary: 'text-white/62',
      muted: 'text-white/35',
      input: 'border-white/10 bg-slate-900/70 text-white placeholder:text-white/28 focus:border-cyan-400/40',
      button: 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 hover:brightness-105',
      checkbox: 'border-white/20 bg-transparent text-cyan-200',
    },
  }[theme];

  return (
    <div className={`w-full max-w-[430px] rounded-[30px] border p-8 sm:p-10 ${themeClasses.panel}`}>
      <div className="mb-8">
        <p className={`text-xs uppercase tracking-[0.28em] ${themeClasses.muted}`}>账号登录</p>
        <h2 className={`mt-3 text-3xl font-semibold tracking-tight ${themeClasses.title}`}>欢迎进入{systemName}</h2>
        <p className={`mt-3 text-sm leading-6 ${themeClasses.secondary}`}>以内容策划、创作协同、流程推进和数据复盘为核心的一体化工作台。</p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className={`mb-2 block text-sm ${themeClasses.secondary}`}>账号</label>
          <input
            value={username}
            onChange={(event) => onUsernameChange(event.target.value)}
            className={`h-12 w-full rounded-2xl border px-4 outline-none transition-colors ${themeClasses.input}`}
            placeholder="请输入账号"
          />
        </div>

        <div>
          <label className={`mb-2 block text-sm ${themeClasses.secondary}`}>密码</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              className={`h-12 w-full rounded-2xl border px-4 pr-12 outline-none transition-colors ${themeClasses.input}`}
              placeholder="请输入密码"
            />
            <button
              type="button"
              onClick={onTogglePassword}
              className={`absolute right-4 top-1/2 -translate-y-1/2 ${themeClasses.muted}`}
              aria-label="切换密码可见状态"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <label className={`flex items-center gap-2 text-sm ${themeClasses.secondary}`}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => onRememberChange(event.target.checked)}
              className={`h-4 w-4 rounded border ${themeClasses.checkbox}`}
            />
            记住密码
          </label>
          <span className={`text-xs ${themeClasses.muted}`}>建议仅在个人设备开启</span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-70 ${themeClasses.button}`}
        >
          {loading ? '登录中...' : '进入系统'}
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
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
        <p className="mt-3 text-sm leading-6 text-white/55">为了保护账号安全，系统要求先完成一次密码更新后再继续使用。</p>

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
  const remembered = loadRememberedAccount();

  const [settings, setSettings] = useState<Required<LoginPageSettings>>(loadLoginSettings);
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState(remembered.username);
  const [password, setPassword] = useState(remembered.password);
  const [remember, setRemember] = useState(remembered.remember);
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
      authStore.login(result.user, result.token);
      persistRememberedAccount(remember, username.trim(), password);

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
      appStore.addNotification({ title: '修改成功', message: '密码已更新，请重新登录', type: 'success' });
      authStore.logout();
      setShowChangePassword(false);
      setPassword('');
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
      persistRememberedAccount(remember, username.trim(), '');
    } catch (error) {
      appStore.addNotification({ title: '修改失败', message: (error as Error).message, type: 'error' });
    } finally {
      setChangePwdLoading(false);
    }
  };

  const layout = settings.loginLayout || 'style1';
  const theme: LoginTheme = layout === 'style2' ? 'light' : layout === 'style3' ? 'cinematic' : 'dark';

  const sharedForm = useMemo(
    () => (
      <LoginForm
        username={username}
        password={password}
        showPassword={showPassword}
        remember={remember}
        loading={loading}
        theme={theme}
        systemName={settings.systemName}
        onUsernameChange={setUsername}
        onPasswordChange={setPassword}
        onTogglePassword={() => setShowPassword((prev) => !prev)}
        onRememberChange={setRemember}
        onSubmit={handleSubmit}
      />
    ),
    [handleSubmit, loading, password, remember, settings.systemName, showPassword, theme, username],
  );

  const layoutNode = useMemo(() => {
    if (layout === 'style2') {
      return (
        <StyleShell>
          <EnterpriseLoginLayout
            systemName={settings.systemName}
            systemLogo={settings.systemLogo}
            systemIcon={settings.systemIcon}
            username={username}
            password={password}
            showPassword={showPassword}
            remember={remember}
            loading={loading}
            errorMessage={errorMessage}
            onUsernameChange={(value) => {
              setUsername(value);
              if (errorMessage) setErrorMessage('');
            }}
            onPasswordChange={(value) => {
              setPassword(value);
              if (errorMessage) setErrorMessage('');
            }}
            onTogglePassword={() => setShowPassword((prev) => !prev)}
            onRememberChange={setRemember}
            onForgotPassword={handleForgotPassword}
            onSubmit={handleSubmit}
          />
        </StyleShell>
      );
    }

    if (layout === 'style3') {
      return (
        <StyleShell>
          <div className="relative min-h-screen overflow-hidden bg-[#020617] text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(34,211,238,0.18),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(59,130,246,0.18),transparent_24%),linear-gradient(135deg,#020617_0%,#07152d_55%,#03111f_100%)]" />
            <div className="absolute inset-0 opacity-[0.14]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '72px 72px' }} />

            <div className={`relative mx-auto flex min-h-screen max-w-7xl flex-col gap-10 px-6 py-8 transition-all duration-1000 lg:px-12 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
              <div className="flex items-center justify-between rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-400/16 text-cyan-300">
                    <Clapperboard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{settings.systemName}</p>
                    <p className="text-xs uppercase tracking-[0.22em] text-white/40">影视内容协作工作台</p>
                  </div>
                </div>
                <div className="hidden items-center gap-5 text-sm text-white/55 lg:flex">
                  <span>探源</span>
                  <span>记录</span>
                  <span>传播</span>
                </div>
              </div>

              <div className="grid flex-1 gap-8 lg:grid-cols-[1.3fr_0.9fr] lg:items-center">
                <div className="space-y-8">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/8 px-4 py-2 text-xs uppercase tracking-[0.24em] text-cyan-300">
                      <Play className="h-3.5 w-3.5" />
                      {styleOptions.style3.subtitle}
                    </div>
                    <h1 className="mt-6 max-w-4xl text-[clamp(3rem,8vw,6.4rem)] font-semibold leading-[0.92] tracking-tight">
                      像内容首页一样
                      <br />
                      进入创作状态
                    </h1>
                    <p className="mt-5 max-w-2xl text-lg leading-8 text-white/65">
                      参考影视媒体首页的节奏感，但保持企业系统的克制与效率，把选题、创作、拍摄、发布与复盘收束在同一个入口里。
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    {[
                      { title: '内容链路', value: '选题→创作→发布', desc: '以流程协同推动内容生产' },
                      { title: '创作气质', value: '纪实 / 文旅 / 城市', desc: '突出公司简介中的文化记录视角' },
                      { title: '团队协同', value: '多角色并行', desc: '适合导演、运营、成员共同推进' },
                    ].map((item) => (
                      <div key={item.title} className="rounded-[28px] border border-white/10 bg-white/[0.05] p-5 backdrop-blur-xl">
                        <p className="text-xs uppercase tracking-[0.24em] text-white/35">{item.title}</p>
                        <p className="mt-3 text-2xl font-semibold">{item.value}</p>
                        <p className="mt-2 text-sm text-white/52">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:justify-self-end">{sharedForm}</div>
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
                    探索内容的源头，
                    <br />
                    记录创作的轨迹，
                    <br />
                    传播故事的力量。
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
  }, [errorMessage, handleForgotPassword, handleSubmit, layout, loading, mounted, password, remember, settings, sharedForm, showPassword, username]);

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







