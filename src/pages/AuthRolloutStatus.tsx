import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LogIn,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { getAuthRolloutStatus, type AuthRolloutStatusData } from '@/api/authRollout';
import { GlassPanel, PageHeader, PageShell, StatusPill } from '@/components/studio';

const MODE_LABELS = {
  disabled: '已关闭',
  legacy: 'Legacy',
  internal: '内部账号',
  allowlist: '白名单',
  percentage: '比例灰度',
} as const;

function MetricCell({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Activity }) {
  return (
    <div className="min-w-0 border-b border-studio-border-soft p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="flex items-center gap-2 text-xs font-semibold text-studio-text-muted">
        <Icon className="h-4 w-4 text-studio-cyan" />
        {label}
      </div>
      <p className="mt-3 text-2xl font-bold text-studio-text-primary">{value}</p>
    </div>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

export default function AuthRolloutStatus() {
  const [data, setData] = useState<AuthRolloutStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userIdInput, setUserIdInput] = useState('');

  const load = useCallback(async (userId?: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAuthRolloutStatus(userId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '认证迁移状态加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const diagnose = () => {
    const userId = Number(userIdInput);
    if (Number.isSafeInteger(userId) && userId > 0) void load(userId);
    else setError('请输入有效的正整数用户 ID');
  };

  if (loading && !data) {
    return <PageShell><div className="flex min-h-64 items-center justify-center text-studio-text-secondary"><RefreshCw className="mr-3 h-5 w-5 animate-spin" />正在读取灰度运行状态</div></PageShell>;
  }

  if (!data) {
    return <PageShell><PageHeader title="认证迁移状态" /><GlassPanel className="p-6 text-studio-coral">{error}</GlassPanel></PageShell>;
  }

  const hour = data.metrics.lastHour;
  return (
    <PageShell>
      <PageHeader
        title="认证迁移状态"
        description="只读查看 Auth 灰度模式、运行指标、停止风险与配置审计；本页面不能修改灰度配置。"
        actions={<StatusPill tone={data.risk.status === 'healthy' ? 'success' : 'coral'}>{data.risk.status === 'healthy' ? '运行正常' : '需要停止评估'}</StatusPill>}
      />

      {error ? <div className="rounded-button border border-studio-coral/30 bg-studio-coral/10 px-4 py-3 text-sm text-studio-coral">{error}</div> : null}

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <GlassPanel className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-studio-text-muted">当前灰度模式</p>
              <div className="mt-2 flex items-center gap-3">
                <ShieldCheck className="h-7 w-7 text-studio-cyan" />
                <h2 className="text-2xl font-bold text-studio-text-primary">{MODE_LABELS[data.rollout.mode]}</h2>
              </div>
            </div>
            <StatusPill tone={data.rollout.enabled ? 'amber' : 'muted'}>{data.rollout.enabled ? '灰度能力可用' : '保持 Legacy'}</StatusPill>
          </div>
          <dl className="mt-6 grid gap-4 border-t border-studio-border-soft pt-5 sm:grid-cols-3">
            <div><dt className="text-xs text-studio-text-muted">比例</dt><dd className="mt-1 text-sm font-semibold text-studio-text-primary">{data.rollout.percentage}%</dd></div>
            <div><dt className="text-xs text-studio-text-muted">白名单用户</dt><dd className="mt-1 text-sm font-semibold text-studio-text-primary">{data.rollout.allowlistCount}</dd></div>
            <div><dt className="text-xs text-studio-text-muted">内部用户</dt><dd className="mt-1 text-sm font-semibold text-studio-text-primary">{data.rollout.internalCount}</dd></div>
          </dl>
        </GlassPanel>

        <GlassPanel className="p-6">
          <h2 className="text-base font-semibold text-studio-text-primary">用户准入诊断</h2>
          <div className="mt-4 flex gap-2">
            <input
              value={userIdInput}
              onChange={(event) => setUserIdInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') diagnose(); }}
              inputMode="numeric"
              placeholder={`当前用户 ${data.diagnostic.userId}`}
              aria-label="用户 ID"
              className="min-w-0 flex-1 rounded-button border border-studio-border-soft bg-white/[0.04] px-3 py-2.5 text-sm text-studio-text-primary outline-none focus:border-studio-border-active"
            />
            <button type="button" onClick={diagnose} className="inline-flex items-center gap-2 rounded-button bg-studio-primary px-4 py-2.5 text-sm font-semibold text-white">
              <Search className="h-4 w-4" />诊断
            </button>
          </div>
          <div className="mt-4 rounded-button border border-studio-border-soft bg-white/[0.035] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-studio-text-primary">用户 #{data.diagnostic.userId}</span>
              <StatusPill tone={data.diagnostic.enabled ? 'success' : 'muted'}>{data.diagnostic.enabled ? '命中 Web Auth' : '继续 Legacy'}</StatusPill>
            </div>
            <p className="mt-3 text-sm leading-6 text-studio-text-secondary">{data.diagnostic.reason}</p>
          </div>
        </GlassPanel>
      </div>

      <GlassPanel className="overflow-hidden">
        <div className="border-b border-studio-border-soft px-6 py-5">
          <h2 className="text-base font-semibold text-studio-text-primary">最近 60 分钟</h2>
          <p className="mt-1 text-xs text-studio-text-muted">指标为当前进程内只读聚合，服务重启后重新计数。</p>
        </div>
        <div className="grid md:grid-cols-4">
          <MetricCell label="登录" value={hour.categories.login} icon={LogIn} />
          <MetricCell label="刷新成功" value={hour.categories.refresh} icon={RefreshCw} />
          <MetricCell label="退出" value={hour.categories.logout} icon={CheckCircle2} />
          <MetricCell label="失败事件" value={hour.categories.failure} icon={AlertTriangle} />
        </div>
        <div className="border-t border-studio-border-soft px-6 py-4 text-sm text-studio-text-secondary">
          Refresh 失败率：<span className="font-semibold text-studio-text-primary">{(hour.refreshFailureRate * 100).toFixed(1)}%</span>
        </div>
      </GlassPanel>

      <div className="grid gap-5 xl:grid-cols-2">
        <GlassPanel className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-studio-text-primary">停止条件</h2>
            <span className="text-xs text-studio-text-muted">窗口 {data.thresholds.windowMinutes} 分钟</span>
          </div>
          {data.risk.events.length === 0 ? (
            <div className="mt-5 flex items-start gap-3 rounded-button border border-studio-success/25 bg-studio-success/8 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-studio-success" />
              <div><p className="text-sm font-semibold text-studio-text-primary">未触发停止条件</p><p className="mt-1 text-xs text-studio-text-secondary">继续观察指标，不代表已获准扩大真实用户。</p></div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {data.risk.events.map((risk) => <div key={risk.code} className="rounded-button border border-studio-coral/30 bg-studio-coral/8 p-4"><p className="text-sm font-semibold text-studio-coral">{risk.reason}</p><p className="mt-1 text-xs text-studio-text-secondary">当前 {risk.value.toFixed(3)} / 阈值 {risk.threshold}</p></div>)}
            </div>
          )}
          <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-button bg-white/[0.035] p-3"><dt className="text-xs text-studio-text-muted">Refresh失败率</dt><dd className="mt-1 font-semibold text-studio-text-primary">{(data.thresholds.refreshFailureRate * 100).toFixed(0)}%</dd></div>
            <div className="rounded-button bg-white/[0.035] p-3"><dt className="text-xs text-studio-text-muted">CSRF失败</dt><dd className="mt-1 font-semibold text-studio-text-primary">{data.thresholds.csrfFailureCount}</dd></div>
            <div className="rounded-button bg-white/[0.035] p-3"><dt className="text-xs text-studio-text-muted">Token reuse</dt><dd className="mt-1 font-semibold text-studio-text-primary">{data.thresholds.tokenReuseCount}</dd></div>
            <div className="rounded-button bg-white/[0.035] p-3"><dt className="text-xs text-studio-text-muted">Expired</dt><dd className="mt-1 font-semibold text-studio-text-primary">{data.thresholds.expiredCount}</dd></div>
          </dl>
        </GlassPanel>

        <GlassPanel className="overflow-hidden">
          <div className="border-b border-studio-border-soft px-6 py-5">
            <h2 className="text-base font-semibold text-studio-text-primary">配置审计</h2>
            <p className="mt-1 text-xs text-studio-text-muted">只展示配置载入与治理记录，不提供修改操作。</p>
          </div>
          <div className="divide-y divide-studio-border-soft">
            {data.audits.map((audit) => (
              <div key={`${audit.created_at}-${audit.action}`} className="px-6 py-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-studio-text-primary">{audit.action}</span>
                  <span className="text-xs text-studio-text-muted">{formatTime(audit.created_at)}</span>
                </div>
                <p className="mt-2 text-sm text-studio-text-secondary">{audit.reason}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-studio-text-muted"><Clock3 className="h-3.5 w-3.5" />执行者：{audit.actor}</div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      <p className="text-right text-xs text-studio-text-muted">生成时间：{formatTime(data.generatedAt)}</p>
    </PageShell>
  );
}
