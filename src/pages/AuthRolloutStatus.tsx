import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { getAuthRolloutStatus, type AuthRolloutStatusData } from '@/api/authRollout';
import { GlassPanel, PageHeader, PageShell, StatusPill } from '@/components/studio';

type Check = { label: string; description: string; ready: boolean };

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function ReadinessCheck({ check }: { check: Check }) {
  return <div className="flex items-start gap-3 rounded-button border border-studio-border-soft bg-white/[0.035] p-4">
    {check.ready ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-studio-success" /> : <CircleDashed className="mt-0.5 h-5 w-5 shrink-0 text-studio-amber" />}
    <div><p className="text-sm font-semibold text-studio-text-primary">{check.label}</p><p className="mt-1 text-xs leading-5 text-studio-text-secondary">{check.description}</p></div>
  </div>;
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录安全状态加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decision = useMemo(() => {
    if (!data) return null;
    const external = data.exporters.status.filter((item) => item.kind !== 'memory');
    const externalReady = external.some((item) => item.enabled && item.healthy && Boolean(item.lastExportAt));
    const externalReason = external.map((item) => item.reason).find(Boolean);
    const socketReady = data.socketBridge.socketBridgeEnabled && data.socketBridge.socketBridgeApproval;
    const checks: Check[] = [
      { label: '保持安全基线', ready: data.runtime.effectiveRolloutMode === 'legacy' || data.rollout.mode === 'allowlist', description: data.runtime.effectiveRolloutMode === 'legacy' ? '正式用户仍走原登录链路，可以随时安全准备下一阶段。' : '当前只允许明确名单，不会自动扩大到其他用户。' },
      { label: '外部监控与告警', ready: externalReady, description: externalReady ? '已收到允许来源的指标抓取；仍需在灰度审批中附上告警接收证据。' : externalReason || '尚未收到外部监控抓取，不能把进程内指标当作持久观测证据。' },
      { label: 'Socket / 协作会话衔接', ready: socketReady, description: socketReady ? `协作连接已通过独立审批门禁，当前准入 ${data.socketBridge.socketV1EligibleUserCount} 人。` : !data.socketBridge.socketBridgeApproval ? 'Socket Bridge 尚未取得独立审批；先确定 2–3 个普通测试账号和回滚窗口。' : 'Socket Bridge 已审批但运行开关未生效，暂不扩大登录迁移。' },
      { label: '运行风险', ready: data.risk.status === 'healthy', description: data.risk.status === 'healthy' ? '当前窗口没有触发停止条件。' : `已触发 ${data.risk.events.length} 个停止条件，应先处理异常。` },
    ];
    const ready = checks.every((item) => item.ready);
    return {
      checks,
      ready,
      title: ready ? '可以准备小范围内部账号验证' : '暂不进入真实用户扩大阶段',
      next: ready ? '下一步：按双人复核名单进行 2–3 个普通账号的固定观察窗口验证。' : '下一步：先补齐未通过项目，再运行认证灰度预检查；不要直接切换比例灰度。',
    };
  }, [data]);

  if (loading && !data) return <PageShell><div className="flex min-h-64 items-center justify-center text-studio-text-secondary"><RefreshCw className="mr-3 h-5 w-5 animate-spin"/>正在检查登录安全状态</div></PageShell>;
  if (!data || !decision) return <PageShell><PageHeader title="登录安全升级"/><GlassPanel className="p-6 text-studio-coral">{error || '暂时无法读取状态'}</GlassPanel></PageShell>;

  const hour = data.metrics.lastHour;
  const lastExternalScrape = data.exporters.status.filter((item) => item.kind !== 'memory' && item.lastExportAt).map((item) => String(item.lastExportAt)).sort().at(-1);
  return <PageShell>
    <PageHeader title="登录安全升级" description="判断新登录机制是否具备进入下一阶段的条件" actions={<button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-button border border-studio-border-soft px-4 text-sm font-semibold"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>重新检查</button>}/>
    {error ? <div role="alert" className="rounded-button border border-studio-coral/30 bg-studio-coral/10 px-4 py-3 text-sm text-studio-coral">{error}</div> : null}

    <GlassPanel className={`p-6 ${decision.ready ? 'border-studio-success/30' : 'border-studio-amber/30'}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${decision.ready ? 'bg-studio-success/10 text-studio-success' : 'bg-studio-amber/10 text-studio-amber'}`}><ShieldCheck className="h-6 w-6"/></div>
          <div><p className="text-xs font-semibold text-studio-text-muted">当前结论</p><h2 className="mt-1 text-xl font-bold text-studio-text-primary">{decision.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-studio-text-secondary">{decision.next}</p></div>
        </div>
        <StatusPill tone={decision.ready ? 'success' : 'amber'}>{decision.ready ? '准备就绪' : '有前置项未完成'}</StatusPill>
      </div>
    </GlassPanel>

    <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <GlassPanel className="p-6">
        <h2 className="text-base font-semibold text-studio-text-primary">进入下一阶段前要完成什么</h2>
        <p className="mt-1 text-xs text-studio-text-muted">每一项都通过后，才适合开始小范围真实账号验证。</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{decision.checks.map((check) => <ReadinessCheck key={check.label} check={check}/>)}</div>
      </GlassPanel>
      <GlassPanel className="p-6">
        <h2 className="text-base font-semibold text-studio-text-primary">当前运行概况</h2>
        <dl className="mt-5 space-y-4 text-sm">
          <div className="flex items-center justify-between gap-3"><dt className="text-studio-text-muted">正式登录</dt><dd className="font-semibold text-studio-text-primary">{data.runtime.effectiveRolloutMode === 'legacy' ? '原登录机制' : '小范围新机制'}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-studio-text-muted">灰度名单</dt><dd className="font-semibold text-studio-text-primary">{data.rollout.allowlistCount} 人</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-studio-text-muted">近 60 分钟登录</dt><dd className="font-semibold text-studio-text-primary">{hour.categories.login}</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-studio-text-muted">刷新失败率</dt><dd className="font-semibold text-studio-text-primary">{(hour.refreshFailureRate * 100).toFixed(1)}%</dd></div>
          <div className="flex items-center justify-between gap-3"><dt className="text-studio-text-muted">安全事件</dt><dd className="font-semibold text-studio-text-primary">{hour.categories.securityEvents}</dd></div>
        </dl>
      </GlassPanel>
    </section>

    {data.risk.events.length > 0 ? <GlassPanel className="p-6"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-studio-coral"/><h2 className="font-semibold text-studio-text-primary">需要先处理</h2></div><div className="mt-4 space-y-2">{data.risk.events.map((risk) => <div key={risk.code} className="flex items-start gap-3 rounded-button bg-studio-coral/8 p-4"><XCircle className="mt-0.5 h-4 w-4 shrink-0 text-studio-coral"/><p className="text-sm text-studio-text-secondary">{risk.reason}</p></div>)}</div></GlassPanel> : null}

    <details className="rounded-card border border-studio-border-soft bg-studio-card">
      <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-5 text-sm font-semibold text-studio-text-primary">技术明细（运维排查时查看）<ChevronDown className="h-4 w-4"/></summary>
      <div className="grid gap-4 border-t border-studio-border-soft p-6 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div><p className="text-xs text-studio-text-muted">配置来源</p><p className="mt-1 font-medium">{data.runtime.effectiveConfigSource}</p></div>
        <div><p className="text-xs text-studio-text-muted">Auth v1 / Web</p><p className="mt-1 font-medium">{data.runtime.effectiveAuthV1Enabled ? '开' : '关'} / {data.runtime.effectiveAuthWebEnabled ? '开' : '关'}</p></div>
        <div><p className="text-xs text-studio-text-muted">指标出口</p><p className="mt-1 font-medium">{data.exporters.source.join(' + ') || '无'}</p></div>
        <div><p className="text-xs text-studio-text-muted">最近外部抓取</p><p className="mt-1 font-medium">{lastExternalScrape ? formatTime(lastExternalScrape) : '尚未验证'}</p></div>
        <div><p className="text-xs text-studio-text-muted">状态生成时间</p><p className="mt-1 font-medium">{formatTime(data.generatedAt)}</p></div>
      </div>
    </details>
  </PageShell>;
}
