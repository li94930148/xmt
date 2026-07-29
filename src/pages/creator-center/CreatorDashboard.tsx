import { useCallback, useEffect, useState } from 'react';
import { Activity, CalendarRange, Gauge, Heart, Play, Share2, Users, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createCreatorAgentBindingCode, getCreatorAgentStatus, getDouyinDashboard, getDouyinSyncLogs, type CreatorAgentStatus, type DouyinDashboardData } from '@/api/creatorCenter';
import ImageFallback from '@/components/common/ImageFallback';
import { AccountHeader, EmptyState, ErrorState, LoadingState, MetricCard, PageHeader, Panel, asRecord, formatDate, formatNumber, num } from './shared';

function GrowthBlock({ title, data }: { title: string; data: DouyinDashboardData['growth_7d'] }) {
  return <div className="rounded-xl bg-studio-surface p-4">
    <p className="text-sm font-medium">{title}</p>
    {data ? <div className="mt-4 grid grid-cols-3 gap-3 text-center">
      <div><b className="text-emerald-500">{data.fans == null ? '暂不可用' : `${data.fans >= 0 ? '+' : ''}${formatNumber(data.fans)}`}</b><span className="mt-1 block text-xs text-studio-text-muted">粉丝</span></div>
      <div><b className="text-cyan-500">{data.plays >= 0 ? '+' : ''}{formatNumber(data.plays)}</b><span className="mt-1 block text-xs text-studio-text-muted">播放</span></div>
      <div><b className="text-rose-500">{data.interactions >= 0 ? '+' : ''}{formatNumber(data.interactions)}</b><span className="mt-1 block text-xs text-studio-text-muted">互动</span></div>
    </div> : <p className="mt-4 text-sm text-studio-text-muted">历史快照不足，完成跨周期同步后显示增长。</p>}
  </div>;
}

export default function CreatorDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState<DouyinDashboardData | null>(null);
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [agentStatus, setAgentStatus] = useState<CreatorAgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [binding, setBinding] = useState<{code:string;expiresAt:string}|null>(null);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindingError, setBindingError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dashboard, syncLogs, status] = await Promise.all([getDouyinDashboard(), getDouyinSyncLogs(), getCreatorAgentStatus()]);
      setData(dashboard);
      setLogs(syncLogs);
      setAgentStatus(status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '抖音数据驾驶舱加载失败');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (loading && !data) return <LoadingState />;
  if (error && !data) return <ErrorState message={error} />;
  if (!data) return <EmptyState />;
  const account = asRecord(data.account);
  const lastLog = logs[0];
  const agent = agentStatus?.agents[0];

  return <div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <PageHeader title="抖音数据驾驶舱" description="账号与内容表现概览" loading={loading} onRefresh={() => void load()} refreshLabel="刷新数据" actions={<span className={`inline-flex h-10 items-center rounded-lg px-3 text-sm ${agent?.online?'bg-emerald-500/10 text-emerald-500':'bg-amber-500/10 text-amber-600'}`}>{agent?.online?'采集端在线':'采集端离线'}</span>} />
    <AccountHeader account={account} />
    <Panel title="Creator Agent" description="本机采集设备与浏览器状态">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-xs text-studio-text-muted">设备</span><p className="mt-1 font-medium">{agent?.device_name||'尚未绑定'}</p></div><div><span className="text-xs text-studio-text-muted">浏览器</span><p className="mt-1 font-medium">{agent?.browser_type||'未就绪'} {agent?.browser_version||''}</p></div><div><span className="text-xs text-studio-text-muted">兼容状态</span><p className="mt-1 font-medium">{agent?.browser_compatibility||'未检测'}</p></div><div><span className="text-xs text-studio-text-muted">抖音登录</span><p className="mt-1 font-medium">{agent?.browser_login_status==='valid'?'正常':'未确认'}</p></div></div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={bindingBusy||!account.douyin_uid} className="h-10 rounded-lg bg-studio-cyan px-4 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-50" onClick={()=>{setBindingBusy(true);setBindingError('');void createCreatorAgentBindingCode(String(account.douyin_uid||'')).then(value=>setBinding({code:value.binding_code,expiresAt:value.expires_at})).catch(cause=>setBindingError(cause instanceof Error?cause.message:'绑定码创建失败')).finally(()=>setBindingBusy(false));}}>{bindingBusy?'正在创建…':'创建一次性绑定码'}</button>{binding?<div className="rounded-lg bg-studio-surface px-4 py-2"><code className="font-semibold">{binding.code}</code><span className="ml-3 text-xs text-studio-text-muted">15 分钟内有效，仅可使用一次</span></div>:null}</div>
      {bindingError?<p role="alert" className="mt-3 text-sm text-red-500">{bindingError}</p>:null}
    </Panel>
    <div className={`rounded-xl border p-4 text-sm ${data.data_status==='ready'?'border-emerald-500/30 bg-emerald-500/10':'border-amber-500/30 bg-amber-500/10'}`}><b>{data.data_status==='ready'?'数据正常':'数据不完整'}</b><span className="ml-3 text-studio-text-muted">最后同步 {formatDate(data.last_success_at,true)} · {data.metrics.works_count} 条作品</span></div>
    <section data-testid="creator-core-metrics" className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MetricCard label="粉丝" value={data.metrics.fans_count == null ? '暂无数据' : data.metrics.fans_count} icon={Users} />
      <MetricCard label="入库作品" value={data.metrics.works_count} icon={Video} accent="violet" />
      <MetricCard label="累计播放" value={data.metrics.play_count} icon={Play} accent="blue" />
      <MetricCard label="互动率" value={`${(data.metrics.interaction_rate * 100).toFixed(2)}%`} icon={Heart} accent="rose" />
      <MetricCard label="分享率" value={`${(data.metrics.share_rate * 100).toFixed(2)}%`} icon={Share2} accent="blue" />
      <MetricCard label="爆款作品" value={data.metrics.viral_works_count} icon={Gauge} accent="emerald" />
    </section>
    <section className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
      <Panel title="周期增长" description={`${data.snapshot_count} 个日快照`}>
        <div className="grid gap-4"><GrowthBlock title="近 7 天" data={data.growth_7d} /><GrowthBlock title="近 30 天" data={data.growth_30d} /></div>
        <button type="button" onClick={() => navigate('/analytics/creator-center/trends')} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-studio-cyan"><CalendarRange className="h-4 w-4" />查看完整趋势</button>
      </Panel>
      <Panel title="作品表现 TOP 5">
        <div className="space-y-2">
          {data.top_works.map((work, index) => <button type="button" key={work.id} onClick={() => navigate(`/analytics/creator-center/work/${work.id}`)} className="flex w-full items-center gap-4 rounded-xl bg-studio-surface p-3 text-left transition hover:ring-1 hover:ring-studio-cyan/40">
            <span className="w-6 text-center text-sm font-semibold text-studio-text-muted">{index + 1}</span>
            <ImageFallback src={work.cover_url} alt={work.title} className="h-14 w-20 rounded-lg object-cover" />
            <div className="min-w-0 flex-1"><p className="truncate font-medium">{work.title}</p><p className="mt-1 text-xs text-studio-text-muted">{work.performance.is_viral ? '爆款 · ' : ''}评分 {work.performance.score} · 播放 {formatNumber(work.play_count)}</p></div>
            <div className="text-right"><b>{(work.performance.interaction_rate * 100).toFixed(2)}%</b><p className="text-xs text-studio-text-muted">互动率</p></div>
          </button>)}
          {data.top_works.length === 0 ? <p className="py-10 text-center text-sm text-studio-text-muted">尚未识别到合法抖音作品</p> : null}
        </div>
      </Panel>
    </section>
    <Panel title="最近同步">
      <div className="grid gap-4 sm:grid-cols-4">
        <MetricCard label="同步时间" value={lastLog ? formatDate(lastLog.sync_time, true) : '—'} icon={CalendarRange} />
        <MetricCard label="采集请求" value={num(lastLog?.api_count)} icon={Activity} accent="blue" />
        <MetricCard label="成功作品" value={num(lastLog?.success_count)} icon={Video} accent="emerald" />
        <MetricCard label="识别失败" value={num(lastLog?.failed_count)} icon={Activity} accent="rose" />
      </div>
      {lastLog?.error_message ? <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{String(lastLog.error_message)}</p> : null}
    </Panel>
  </div>;
}
