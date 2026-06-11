import { FormEvent } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, HelpCircle, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';

type EnterpriseLoginLayoutProps = {
  systemName: string;
  systemLogo?: string;
  systemIcon?: string;
  username: string;
  password: string;
  showPassword: boolean;
  remember: boolean;
  loading: boolean;
  errorMessage: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onTogglePassword: () => void;
  onRememberChange: (value: boolean) => void;
  onForgotPassword: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
};

const platformHighlights = [
  {
    title: '流程协同',
    description: '选题、创作、拍摄、发布在同一条工作流里闭环推进。',
  },
  {
    title: '可追溯管理',
    description: '支持版本留痕、成员协作和阶段状态清晰回溯。',
  },
  {
    title: '数据驱动复盘',
    description: '从执行到复盘沉淀为更稳健的内容生产方法。',
  },
];

const trustPoints = [
  '企业级内容生产入口',
  '统一账号与权限体系',
  '适配桌面与移动端访问',
];

function BrandMark({ systemLogo, systemIcon, systemName }: { systemLogo?: string; systemIcon?: string; systemName: string }) {
  if (systemLogo) {
    return <img src={systemLogo} alt={systemName} className="h-12 w-12 rounded-2xl object-cover shadow-[0_12px_30px_rgba(15,23,42,0.18)]" />;
  }

  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-500 to-indigo-500 text-base font-semibold text-white shadow-[0_14px_32px_rgba(14,116,144,0.28)]">
      {systemIcon || systemName.slice(0, 1)}
    </div>
  );
}

export default function EnterpriseLoginLayout({
  systemName,
  systemLogo,
  systemIcon,
  username,
  password,
  showPassword,
  remember,
  loading,
  errorMessage,
  onUsernameChange,
  onPasswordChange,
  onTogglePassword,
  onRememberChange,
  onForgotPassword,
  onSubmit,
}: EnterpriseLoginLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#04111f] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_28%),radial-gradient(circle_at_85%_15%,rgba(99,102,241,0.18),transparent_24%),radial-gradient(circle_at_70%_78%,rgba(14,165,233,0.14),transparent_24%),linear-gradient(135deg,#06101d_0%,#0a1729_46%,#0f172a_100%)]" />
      <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.28) 1px, transparent 1px)', backgroundSize: '88px 88px' }} />
      <div className="absolute left-[12%] top-[14%] h-64 w-64 rounded-full bg-cyan-400/18 blur-[120px]" />
      <div className="absolute bottom-[8%] right-[10%] h-72 w-72 rounded-full bg-blue-500/14 blur-[140px]" />

      <div className="relative mx-auto flex min-h-screen max-w-[1480px] flex-col justify-center gap-10 px-5 py-8 sm:px-8 lg:grid lg:grid-cols-[1.06fr_0.94fr] lg:items-center lg:px-10 xl:px-14">
        <section className="order-2 lg:order-1">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-xs uppercase tracking-[0.24em] text-cyan-200/88 backdrop-blur-xl">
              <Sparkles className="h-3.5 w-3.5" />
              企业内容协同平台
            </div>

            <div className="mt-7 flex items-center gap-4">
              <BrandMark systemLogo={systemLogo} systemIcon={systemIcon} systemName={systemName} />
              <div>
                <p className="text-xs uppercase tracking-[0.28em] text-slate-400">Management Console</p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-white">{systemName}</p>
              </div>
            </div>

            <h1 className="mt-8 text-[clamp(3rem,7vw,6rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-white">
              更稳的内容协作，
              <br />
              从登录开始。
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300/78">
              面向企业级后台与 SaaS 协作场景打造的统一入口，将账号、流程、权限与团队协同收束在同一块高效工作台里。
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {platformHighlights.map((item) => (
                <div key={item.title} className="rounded-[28px] border border-white/10 bg-white/[0.045] p-5 shadow-[0_24px_50px_rgba(2,6,23,0.22)] backdrop-blur-xl">
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="mt-3 text-sm leading-6 text-slate-300/72">{item.description}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {trustPoints.map((item) => (
                <div key={item} className="inline-flex items-center gap-2 rounded-full border border-cyan-400/16 bg-cyan-400/[0.07] px-3.5 py-2 text-sm text-cyan-50/88">
                  <ShieldCheck className="h-4 w-4 text-cyan-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="order-1 lg:order-2 lg:justify-self-end">
          <div className="relative w-full max-w-[520px]">
            <div className="absolute inset-0 rounded-[34px] bg-white/8 blur-2xl" />
            <div className="relative overflow-hidden rounded-[34px] border border-white/14 bg-white/[0.07] p-6 shadow-[0_40px_120px_rgba(2,6,23,0.48)] backdrop-blur-[24px] sm:p-8">
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.11)_0%,rgba(255,255,255,0.03)_100%)]" />
              <div className="relative">
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Sign In</p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">欢迎登录</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300/76">请输入账号信息，进入你的企业级协作工作台。</p>
                  </div>
                  <div className="hidden rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-right sm:block">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Access</p>
                    <p className="mt-1 text-sm font-medium text-white">Secure Portal</p>
                  </div>
                </div>

                {errorMessage && (
                  <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-400/22 bg-rose-400/[0.10] px-4 py-3 text-sm text-rose-100">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-300" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <form onSubmit={onSubmit} className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">用户名 / 邮箱</label>
                    <div className="group relative">
                      <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-cyan-300" />
                      <input
                        value={username}
                        onChange={(event) => onUsernameChange(event.target.value)}
                        className="h-13 w-full rounded-2xl border border-white/10 bg-[#0f1d32]/72 pl-11 pr-4 text-[15px] text-white outline-none transition-all placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-[#13233d]/82 focus:shadow-[0_0_0_4px_rgba(34,211,238,0.12)]"
                        placeholder="请输入用户名或邮箱"
                        autoComplete="username"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-200">密码</label>
                    <div className="group relative">
                      <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-cyan-300" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(event) => onPasswordChange(event.target.value)}
                        className="h-13 w-full rounded-2xl border border-white/10 bg-[#0f1d32]/72 pl-11 pr-12 text-[15px] text-white outline-none transition-all placeholder:text-slate-500 focus:border-cyan-300/55 focus:bg-[#13233d]/82 focus:shadow-[0_0_0_4px_rgba(34,211,238,0.12)]"
                        placeholder="请输入密码"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={onTogglePassword}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-cyan-200"
                        aria-label="切换密码可见状态"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 pt-1">
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-300">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(event) => onRememberChange(event.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-transparent text-cyan-300 focus:ring-cyan-300/35 focus:ring-offset-0"
                      />
                      记住我
                    </label>
                    <button type="button" onClick={onForgotPassword} className="text-sm font-medium text-cyan-200 transition hover:text-cyan-100">
                      忘记密码
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="group mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 via-sky-400 to-indigo-500 text-[15px] font-semibold text-slate-950 shadow-[0_20px_45px_rgba(14,165,233,0.34)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_60px_rgba(14,165,233,0.38)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 rounded-full border-2 border-slate-950/25 border-t-slate-950 animate-spin" />
                        登录中...
                      </>
                    ) : (
                      <>
                        登录系统
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 rounded-2xl border border-white/10 bg-[#091528]/55 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <HelpCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-cyan-300" />
                    <div>
                      <p className="text-sm font-medium text-white">登录支持</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">若当前环境未接入找回密码流程，可通过管理员或运维同事协助重置账号密码。</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
