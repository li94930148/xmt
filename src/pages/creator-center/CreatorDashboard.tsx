import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, CalendarRange, Gauge, Heart, Play, Share2, Users, Video } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createCreatorAgentBindingCode, getCreatorAgentStatus, getDouyinDashboard, getDouyinSyncLogs, type CreatorAgentStatus, type DouyinDashboardData } from '@/api/creatorCenter';
import CreatorCoverImage from '@/components/common/CreatorCoverImage';
import CreatorTopicSuggestionsPanel from '@/components/topics/CreatorTopicSuggestionsPanel';
import CreatorProfileCard from '@/components/xmt-ui/CreatorProfileCard';
import ActionButton from '@/components/studio/ActionButton';
import { ErrorState, LoadingState, MetricCard, PageHeader, Panel, asRecord, formatDate, formatNumber, num } from './shared';
import { ReactBitsPageScene } from '@/features/reactbits-appearance/slots/ReactBitsPageScene';
import { ReactBitsHeadingSlot } from '@/features/reactbits-appearance/slots/ReactBitsHeadingSlot';
import { ReactBitsCardSlot } from '@/features/reactbits-appearance/ReactBitsCardSlot';
import { ReactBitsRevealSlot } from '@/features/reactbits-appearance/ReactBitsRevealSlot';

export function GrowthBlock({ title, data, official }: { title: string; data: DouyinDashboardData['growth_7d']; official: boolean }) {
  const metrics = [
    { label: '粉丝净变化', value: data?.fans, color: 'text-studio-success-contrast', missing: '缺少可比粉丝快照' },
    { label: official ? '新增播放' : '播放变化', value: data?.plays, color: 'text-studio-cyan-contrast', missing: official ? '缺少该周期官方导出' : '缺少可比历史快照' },
    { label: official ? '新增互动' : '互动变化', value: data?.interactions, color: 'text-studio-coral-contrast', missing: official ? '缺少该周期官方导出' : '缺少可比历史快照' },
  ];
  return <div className="rounded-xl bg-studio-surface p-4">
    <p className="text-sm font-medium">{title}</p>
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {metrics.map(metric => <div key={metric.label} className="min-w-0 text-center">
        <b className={metric.color}>{metric.value == null ? '—' : `${metric.value >= 0 ? '+' : ''}${formatNumber(metric.value)}`}</b>
        <span className="mt-1 block text-xs text-studio-text-muted">{metric.label}</span>
        {metric.value == null ? <span className="mt-1 block text-xs text-studio-amber-contrast">{metric.missing}</span> : null}
      </div>)}
    </div>
  </div>;
}

export default function CreatorDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const accountUid = searchParams.get('account_id')?.trim() || undefined;
  const [data, setData] = useState<DouyinDashboardData | null>(null);
  const [loadedAccountUid, setLoadedAccountUid] = useState<string | undefined>();
  const [logs, setLogs] = useState<Array<Record<string, unknown>> | null>(null);
  const [agentStatus, setAgentStatus] = useState<CreatorAgentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncLogsError, setSyncLogsError] = useState('');
  const [agentStatusError, setAgentStatusError] = useState('');
  const [binding, setBinding] = useState<{code:string;expiresAt:string}|null>(null);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindingError, setBindingError] = useState('');
  const loadRequestRef = useRef(0);
  const bindingLockRef = useRef(false);
  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError('');
    setSyncLogsError('');
    setAgentStatusError('');
    const [dashboardResult, syncLogsResult, statusResult] = await Promise.allSettled([
      getDouyinDashboard(accountUid),
      getDouyinSyncLogs(accountUid),
      getCreatorAgentStatus(),
    ]);
    if (requestId !== loadRequestRef.current) return;
    if (dashboardResult.status === 'fulfilled') setData(dashboardResult.value);
    else setError(dashboardResult.reason instanceof Error ? dashboardResult.reason.message : '抖音数据驾驶舱加载失败');
    if (dashboardResult.status === 'fulfilled') setLoadedAccountUid(accountUid);
    if (syncLogsResult.status === 'fulfilled') setLogs(syncLogsResult.value);
    else setSyncLogsError(syncLogsResult.reason instanceof Error ? syncLogsResult.reason.message : '同步记录加载失败');
    if (statusResult.status === 'fulfilled') setAgentStatus(statusResult.value);
    else setAgentStatusError(statusResult.reason instanceof Error ? statusResult.reason.message : '采集端状态加载失败');
    setLoading(false);
  }, [accountUid]);
  useEffect(() => { void load(); }, [load]);
  const hasCurrentAccountData = data !== null && loadedAccountUid === accountUid;
  if (!hasCurrentAccountData && loading) return <LoadingState />;
  if (!hasCurrentAccountData && error) return <div className="mx-auto max-w-[1500px] space-y-4 pb-12"><ErrorState message={error} /><button type="button" onClick={() => void load()} disabled={loading} className="xmt-btn xmt-btn-secondary inline-flex min-h-10 items-center gap-2 px-4 disabled:opacity-60">{loading ? '正在重新加载…' : '重新加载数据'}</button></div>;
  if (!hasCurrentAccountData || !data) return <LoadingState />;
  const account = asRecord(data.account);
  const lastLog = logs?.[0];
  const agent = agentStatus?.agents.find((item) => !accountUid || item.account_id === accountUid) || agentStatus?.agents[0];
  const accountQuery = accountUid ? `?account_id=${encodeURIComponent(accountUid)}` : '';
  const official = data.data_source === 'douyin_official_export';
  const agentStatusLabel = agentStatusError ? '采集端状态暂不可用' : !agentStatus ? '采集端状态未读取' : agent?.online ? '采集端在线' : '采集端离线';
  const agentStatusTone = !agentStatusError && agentStatus && agent?.online ? 'bg-studio-success/10 text-studio-success-contrast' : 'bg-studio-amber/10 text-studio-amber-contrast';
  const createBindingCode = async () => {
    const accountId = String(account.douyin_uid || '');
    if (!accountId || bindingLockRef.current) return;
    bindingLockRef.current = true;
    setBindingBusy(true);
    setBindingError('');
    try {
      const value = await createCreatorAgentBindingCode(accountId);
      setBinding({ code: value.binding_code, expiresAt: value.expires_at });
    } catch (cause) {
      setBindingError(cause instanceof Error ? cause.message : '绑定码创建失败');
    } finally {
      bindingLockRef.current = false;
      setBindingBusy(false);
    }
  };

  return <ReactBitsPageScene page="creator"><div className="mx-auto max-w-[1500px] space-y-6 pb-12">
    <div className="sr-only"><ReactBitsHeadingSlot>抖音数据驾驶舱</ReactBitsHeadingSlot></div><PageHeader title="抖音数据驾驶舱" description="账号与内容表现概览" loading={loading} onRefresh={() => void load()} refreshLabel="刷新数据" actions={<span className={`inline-flex h-10 items-center rounded-lg px-3 text-sm ${agentStatusTone}`}>{agentStatusLabel}</span>} />
    {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-studio-coral/30 bg-studio-coral/8 p-4 text-sm text-studio-coral-contrast"><span>驾驶舱刷新失败，仍显示最近一次成功数据：{error}</span><button type="button" onClick={() => void load()} disabled={loading} className="xmt-btn xmt-btn-secondary inline-flex min-h-9 items-center gap-2 px-3 disabled:opacity-60">重新加载</button></div> : null}
    <ReactBitsRevealSlot className="block"><ReactBitsCardSlot semantic="creator-profile" className="min-w-0"><CreatorProfileCard
      avatarUrl={typeof account.avatar === 'string' ? account.avatar : undefined}
      name={String(account.nickname || account.account_name || '抖音账号')}
      uid={String(account.douyin_uid || account.account_id || account.platform_uid || '')}
      dataStatus={data.data_status}
      fansCount={data.metrics.fans_count}
      worksCount={data.metrics.works_count}
      playCount={data.metrics.play_count}
      onViewWorks={() => navigate(`/analytics/creator-center/works${accountQuery}`)}
    /></ReactBitsCardSlot></ReactBitsRevealSlot>
    <Panel title="Creator Agent" description="本机采集设备与浏览器状态">
      <div className="mb-4 flex flex-wrap items-center gap-3"><span className={`inline-flex min-h-9 items-center rounded-lg px-3 text-sm ${agentStatusTone}`}>{agentStatusLabel}</span>{agentStatusError ? <p role="alert" className="text-sm text-studio-coral-contrast">采集端状态读取失败；点击页面上方“刷新数据”重试。</p> : null}</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div><span className="text-xs text-studio-text-muted">设备</span><p className="mt-1 font-medium">{agentStatusError && !agent ? '暂不可用' : agent?.device_name || '尚未绑定'}</p></div><div><span className="text-xs text-studio-text-muted">浏览器</span><p className="mt-1 font-medium">{agentStatusError && !agent ? '暂不可用' : agent?.browser_type || '未就绪'} {!agentStatusError || agent ? agent?.browser_version || '' : ''}</p></div><div><span className="text-xs text-studio-text-muted">兼容状态</span><p className="mt-1 font-medium">{agentStatusError && !agent ? '暂不可用' : agent?.browser_compatibility || '未检测'}</p></div><div><span className="text-xs text-studio-text-muted">抖音登录</span><p className="mt-1 font-medium">{agentStatusError && !agent ? '暂不可用' : agent?.browser_login_status === 'valid' ? '正常' : agent?.browser_login_status ? '未确认' : agentStatusError ? '暂不可用' : '未确认'}</p></div></div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><ActionButton type="button" variant="primary" disabled={bindingBusy||!account.douyin_uid} onClick={()=>void createBindingCode()}>{bindingBusy?'正在创建…':'创建一次性绑定码'}</ActionButton>{binding?<div role="status" className="rounded-lg bg-studio-surface px-4 py-2"><code className="font-semibold">{binding.code}</code><span className="ml-3 text-xs text-studio-text-muted">有效期至 {formatDate(binding.expiresAt,true)} · 仅可使用一次</span></div>:null}</div>
      {bindingError?<p role="alert" className="mt-3 text-sm text-studio-coral-contrast">{bindingError}</p>:null}
    </Panel>
    <div className={`rounded-xl border p-4 text-sm ${data.data_status==='ready'?'border-studio-success/30 bg-studio-success/10':'border-studio-amber/30 bg-studio-amber/10'}`}><b>{data.data_status==='ready'?'数据正常':'数据不完整'}</b><span className="ml-3 text-studio-text-muted">{official?'抖音官方导出优先':'采集数据'} · 更新于 {formatDate(official?data.official_snapshot_at:data.last_success_at,true)} · {data.metrics.works_count} 条作品</span></div>
    <ReactBitsRevealSlot className="block"><section data-testid="creator-core-metrics" className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MetricCard label="粉丝" value={data.metrics.fans_count == null ? '暂无数据' : data.metrics.fans_count} icon={Users} />
      <MetricCard label={official?'官方作品':'入库作品'} value={data.metrics.works_count} icon={Video} accent="violet" />
      <MetricCard label="累计播放" value={data.metrics.play_count} icon={Play} accent="blue" />
      <MetricCard label="互动率" value={`${(data.metrics.interaction_rate * 100).toFixed(2)}%`} icon={Heart} accent="rose" />
      <MetricCard label="分享率" value={`${(data.metrics.share_rate * 100).toFixed(2)}%`} icon={Share2} accent="blue" />
      <MetricCard label="爆款作品" value={data.metrics.viral_works_count} icon={Gauge} accent="emerald" />
    </section></ReactBitsRevealSlot>
    <section className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
      <Panel title="周期表现" description={official ? '播放、互动按官方周期逐日合计；粉丝按真实期初与期末总量计算' : `${data.snapshot_count} 个日快照`}>
        <div className="grid gap-4"><GrowthBlock title="近 7 天" data={data.growth_7d} official={official} /><GrowthBlock title="近 30 天" data={data.growth_30d} official={official} /></div>
        <button type="button" onClick={() => navigate('/analytics/creator-center/trends')} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-studio-cyan-contrast"><CalendarRange className="h-4 w-4" />查看完整趋势</button>
      </Panel>
      <ReactBitsCardSlot semantic="content-highlight" className="min-w-0"><Panel title="作品表现 TOP 5">
        <div className="space-y-2">
          {data.top_works.map((work, index) => <button type="button" key={work.id} onClick={() => navigate(`/analytics/creator-center/work/${work.id}${accountQuery}`)} className="flex w-full items-center gap-4 rounded-xl bg-studio-surface p-3 text-left transition hover:ring-1 hover:ring-studio-cyan/40">
            <span className="w-6 text-center text-sm font-semibold text-studio-text-muted">{index + 1}</span>
            <CreatorCoverImage work={work} className="h-14 w-20 rounded-lg object-cover" />
            <div className="min-w-0 flex-1"><p className="truncate font-medium">{work.title}</p><p className="mt-1 text-xs text-studio-text-muted">{work.performance.is_viral ? '爆款 · ' : ''}评分 {work.performance.score} · 播放 {formatNumber(work.play_count)}</p></div>
            <div className="text-right"><b>{(work.performance.interaction_rate * 100).toFixed(2)}%</b><p className="text-xs text-studio-text-muted">互动率</p></div>
          </button>)}
          {data.top_works.length === 0 ? <p className="py-10 text-center text-sm text-studio-text-muted">尚未识别到合法抖音作品</p> : null}
        </div>
      </Panel></ReactBitsCardSlot>
    </section>
    <CreatorTopicSuggestionsPanel data={data.topic_suggestions} unavailable={loading || Boolean(error)} />
    <Panel title="最近同步">
      {syncLogsError ? <p role="alert" className="mb-4 rounded-lg border border-studio-coral/30 bg-studio-coral/8 p-3 text-sm text-studio-coral-contrast">同步记录读取失败；{logs?.length ? '仍显示最近一次成功读取的记录。' : '当前同步指标尚未确认。'}请点击页面上方“刷新数据”重试。</p> : logs && logs.length === 0 ? <p className="mb-4 text-sm text-studio-text-muted">尚无同步记录；首次同步后会显示在这里。</p> : logs === null ? <p role="status" className="mb-4 text-sm text-studio-text-muted">同步记录尚未确认。</p> : null}
      <div className="grid gap-4 sm:grid-cols-4">
        <MetricCard label="同步时间" value={lastLog ? formatDate(lastLog.sync_time, true) : '—'} icon={CalendarRange} />
        <MetricCard label="采集请求" value={lastLog ? num(lastLog.api_count) : '—'} icon={Activity} accent="blue" />
        <MetricCard label="成功作品" value={lastLog ? num(lastLog.success_count) : '—'} icon={Video} accent="emerald" />
        <MetricCard label="识别失败" value={lastLog ? num(lastLog.failed_count) : '—'} icon={Activity} accent="rose" />
      </div>
    {lastLog?.error_message ? <p className="mt-4 rounded-lg bg-studio-coral/10 p-3 text-sm text-studio-coral-contrast">{String(lastLog.error_message)}</p> : null}
    </Panel>
  </div></ReactBitsPageScene>;
}
