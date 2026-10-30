import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { getAuthRolloutStatus, type AuthRolloutStatusData } from '@/api/authRollout';
import { GlassPanel, PageHeader, PageShell, StatusPill } from '@/components/studio';
import { getAuthRolloutModeLabel, getExistingLoginReadiness } from './authRolloutPresentation';

type Check = { label: string; description: string; ready: boolean };
type RiskEvent = AuthRolloutStatusData['risk']['events'][number];

const riskDescriptions: Record<string, string> = {
  REFRESH_FAILURE_RATE: '登录状态续期失败偏多。建议先暂停扩大试用并排查原因。',
  CSRF_FAILURES: '检测到较多可疑请求。请先完成安全排查，再扩大试用。',
  TOKEN_REUSE: '检测到重复使用的登录凭证。建议立即暂停扩大试用并处理相关账号。',
  EXPIRED_SESSIONS: '登录状态过期偏多。请确认是否影响用户继续使用，再扩大试用。',
};

function describeRisk(event: RiskEvent) {
  return riskDescriptions[event.code] || '登录安全检查发现异常。请展开管理员技术明细查看排查信息。';
}

function formatRiskValue(event: RiskEvent, value: number) {
  return event.code === 'REFRESH_FAILURE_RATE' ? `${(value * 100).toFixed(1)}%` : String(value);
}

function configSourceLabel(source: AuthRolloutStatusData['runtime']['effectiveConfigSource']) {
  const labels = {
    runtime_env_file: '部署配置文件',
    pm2_process_env: '服务启动配置',
    development_env: '本地开发配置',
  };
  return labels[source];
}

function exporterLabel(source: AuthRolloutStatusData['exporters']['source'][number]) {
  const labels = {
    memory: '进程内记录',
    prometheus: 'Prometheus 外部监控',
    opentelemetry: 'OpenTelemetry 外部监控',
  };
  return labels[source];
}

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function ReadinessCheck({ check }: { check: Check }) {
  return <div className="flex items-start gap-3 rounded-button border border-studio-border-soft bg-studio-surface-soft p-4">
    {check.ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-studio-success" /> : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-studio-amber" />}
    <div><p className="text-sm font-semibold text-studio-text-primary">{check.label}</p><p className="mt-1 text-xs leading-5 text-studio-text-secondary">{check.description}</p></div>
  </div>;
}

function RecheckAction({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return <>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{loading ? '正在重新检查登录安全状态' : ''}</span>
    <button type="button" onClick={onClick} disabled={loading} className="xmt-btn xmt-btn-secondary inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-studio-focus-ring">
      <RefreshCw aria-hidden="true" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>
      重新检查
    </button>
  </>;
}

export default function AuthRolloutStatus() {
  const [data, setData] = useState<AuthRolloutStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getAuthRolloutStatus());
    } catch {
      setError('登录安全状态暂时无法读取，请稍后重新检查。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decision = useMemo(() => {
    if (!data) return null;
    const external = data.exporters.status.filter((item) => item.kind !== 'memory');
    const externalReady = external.some((item) => item.enabled && item.healthy && Boolean(item.lastExportAt));
    const externalEnabled = external.some((item) => item.enabled);
    const externalHealthy = external.some((item) => item.enabled && item.healthy);
    const socketReady = data.socketBridge.socketBridgeEnabled && data.socketBridge.socketBridgeApproval;
    const loginReadiness = getExistingLoginReadiness(data.runtime.effectiveRolloutMode, data.rollout.mode, data.rollout.percentage);
    const checks: Check[] = [
      { label: '保留现有登录方式', ...loginReadiness },
      { label: '外部监控已确认', ready: externalReady, description: externalReady ? '监控系统已确认收到新数据；开始试用前，还需确认告警有人接收。' : !externalEnabled ? '尚未启用外部监控。请先完成监控配置并确认看板有新数据。' : !externalHealthy ? '外部监控暂不可用。请先恢复监控服务，再扩大试用范围。' : '监控系统还没有确认收到新数据。请先确认监控看板有最新记录。' },
      { label: '实时协作服务衔接', ready: socketReady, description: socketReady ? `实时协作已通过单独审批，目前有 ${data.socketBridge.socketV1EligibleUserCount} 个账号符合接入条件。` : !data.socketBridge.socketBridgeApproval ? '实时协作尚未完成单独审批。开始小范围试用前，请先确定 2–3 个内部测试账号和回退安排。' : '实时协作已获批，但尚未启用。暂不扩大新版登录方式的试用范围。' },
      { label: '登录安全检查', ready: data.risk.status === 'healthy', description: data.risk.status === 'healthy' ? '近期未发现需要暂停试用的安全异常。' : `发现 ${data.risk.events.length} 项安全异常，请先处理后再扩大试用。` },
    ];
    const ready = checks.every((item) => item.ready);
    return {
      checks,
      ready,
      title: ready ? '可以开始少量内部账号试用' : '暂不扩大新版登录试用范围',
      next: ready ? '下一步：请由两人复核试用名单，并安排 2–3 个内部账号在固定时段试用。' : '下一步：先完成以上准备，再重新检查；请勿直接扩大试用范围。',
    };
  }, [data]);

  if (loading && !data) return <PageShell><div role="status" aria-live="polite" aria-atomic="true" className="flex min-h-64 items-center justify-center text-studio-text-secondary"><RefreshCw aria-hidden="true" className="mr-3 h-5 w-5 animate-spin"/>正在检查登录安全状态</div></PageShell>;
  if (!data || !decision) return <PageShell>
    <PageHeader title="登录安全升级" actions={<RecheckAction loading={loading} onClick={() => void load()} />}/>
    <GlassPanel className="p-6"><p role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'} className="text-studio-coral-contrast">{error || '暂时无法读取状态'}</p></GlassPanel>
  </PageShell>;

  const hour = data.metrics.lastHour;
  const lastExternalScrape = data.exporters.status.filter((item) => item.kind !== 'memory' && item.lastExportAt).map((item) => String(item.lastExportAt)).sort().at(-1);
  return <PageShell>
    <PageHeader title="登录安全升级" description="确认系统是否已准备好让少量内部账号试用新版登录方式" actions={<RecheckAction loading={loading} onClick={() => void load()} />}/>
    {error ? <div role="alert" className="rounded-button border border-studio-coral/30 bg-studio-coral/10 px-4 py-3 text-sm text-studio-coral-contrast">{error}</div> : null}

    <GlassPanel className={`p-6 ${decision.ready ? 'border-studio-success/30' : 'border-studio-amber/30'}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${decision.ready ? 'bg-studio-success/10 text-studio-success-contrast' : 'bg-studio-amber/10 text-studio-amber-contrast'}`}><ShieldCheck className="h-6 w-6"/></div>
          <div><p className="text-xs font-semibold text-studio-text-secondary">当前结论</p><h2 className="mt-1 text-xl font-bold text-studio-text-primary">{decision.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-studio-text-secondary">{decision.next}</p></div>
        </div>
        <StatusPill tone={decision.ready ? 'success' : 'amber'}>{decision.ready ? '准备就绪' : '有前置项未完成'}</StatusPill>
      </div>
    </GlassPanel>

    <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <GlassPanel className="p-6">
        <h2 className="text-base font-semibold text-studio-text-primary">进入下一阶段前要完成什么</h2>
        <p className="mt-1 text-xs text-studio-text-secondary">每一项都通过后，才适合让少量内部账号试用。</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{decision.checks.map((check) => <ReadinessCheck key={check.label} check={check}/>)}</div>
      </GlassPanel>
      <GlassPanel className="p-6">
        <h2 className="text-base font-semibold text-studio-text-primary">当前运行概况</h2>
        <dl className="mt-5 space-y-4 text-sm">
          <div className="flex items-center justify-between gap-3"><dt className="text-studio-text-secondary">当前登录方式</dt><dd className="font-semibold text-studio-text-primary">{getAuthRolloutModeLabel(data.runtime.effectiveRolloutMode, data.rollout.percentage)}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-studio-text-secondary">试用账号</dt><dd className="font-semibold text-studio-text-primary">{data.rollout.allowlistCount} 人</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-studio-text-secondary">近 60 分钟登录次数</dt><dd className="font-semibold text-studio-text-primary">{hour.categories.login}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-studio-text-secondary">登录续期失败率</dt><dd className="font-semibold text-studio-text-primary">{(hour.refreshFailureRate * 100).toFixed(1)}%</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-studio-text-secondary">安全异常次数</dt><dd className="font-semibold text-studio-text-primary">{hour.categories.securityEvents}</dd></div>
        </dl>
      </GlassPanel>
    </section>

    {data.risk.events.length > 0 ? <GlassPanel className="p-6"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-studio-coral"/><h2 className="font-semibold text-studio-text-primary">需要先处理</h2></div><div className="mt-4 space-y-2">{data.risk.events.map((risk) => <div key={risk.code} className="flex items-start gap-3 rounded-button bg-studio-coral/8 p-4"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-studio-coral"/><p className="text-sm text-studio-text-secondary">{describeRisk(risk)}</p></div>)}</div></GlassPanel> : null}

    <details className="rounded-card border border-studio-border-soft bg-studio-card">
      <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 text-sm font-semibold text-studio-text-primary">管理员技术明细（排查时展开）<ChevronDown className="h-4 w-4"/></summary>
      <div className="grid gap-4 border-t border-studio-border-soft p-6 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div><p className="text-xs text-studio-text-secondary">配置来源</p><p className="mt-1 font-medium">{configSourceLabel(data.runtime.effectiveConfigSource)}</p></div>
        <div><p className="text-xs text-studio-text-secondary">新版登录机制 / 网页版</p><p className="mt-1 font-medium">{data.runtime.effectiveAuthV1Enabled ? '开' : '关'} / {data.runtime.effectiveAuthWebEnabled ? '开' : '关'}</p></div>
        <div><p className="text-xs text-studio-text-secondary">监控记录来源</p><p className="mt-1 font-medium">{data.exporters.source.map(exporterLabel).join('、') || '无'}</p></div>
        <div><p className="text-xs text-studio-text-secondary">最近监控确认时间</p><p className="mt-1 font-medium">{lastExternalScrape ? formatTime(lastExternalScrape) : '尚未验证'}</p></div>
        <div><p className="text-xs text-studio-text-secondary">状态生成时间</p><p className="mt-1 font-medium">{formatTime(data.generatedAt)}</p></div>
        {data.risk.events.length > 0 ? <div className="sm:col-span-2 xl:col-span-4"><p className="text-xs text-studio-text-secondary">风险排查记录</p><ul className="mt-1 space-y-1 font-medium">{data.risk.events.map((risk) => <li key={risk.code}><code>{risk.code}</code> · {risk.reason}（当前值 {formatRiskValue(risk, risk.value)}，触发阈值 {formatRiskValue(risk, risk.threshold)}）</li>)}</ul></div> : null}
      </div>
    </details>
  </PageShell>;
}
