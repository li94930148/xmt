import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ChevronRight, CircleAlert, CircleCheck, Clock3, KeyRound, RefreshCw, ShieldCheck, TrendingUp, Video } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { ErrorState, LoadingState, PageHeader, PageToolbar } from '../components/common';
import { getSocialAccountsOverview, getSocialDailySummary, getSocialHotVideos, getSocialIngestionJobs, getSocialLatestReport, getSocialLatestSnapshot, getSocialDataQuality, getSocialDashboard, getSocialMetricStatus, type IngestionJob, type MetricStatus, type SocialAccountOverview, type VideoPerformanceItem } from '../api/socialReview';
import { useThemeStyles } from '../hooks/useThemeStyles';

function formatDate(value: string | null) {
  if (!value) return '暂无记录';
  const date = new Date(value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function formatCount(value: number | null | undefined) {
  return value == null ? '暂无数据' : Number(value).toLocaleString('zh-CN');
}

function formatPercent(value: number | null | undefined) {
  return value == null ? '暂无数据' : `${(Number(value) * 100).toFixed(1)}%`;
}

function platformLabel(platform: string) {
  const labels: Record<string, string> = { douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书', shipinhao: '视频号', tiktok: 'TikTok', bilibili: '哔哩哔哩', weibo: '微博', other: '其他' };
  return labels[platform] || platform;
}

function jobLabel(status: string | null) {
  const labels: Record<string, string> = { success: '采集成功', failed: '采集失败', running: '采集中', pending: '等待采集' };
  return labels[status || ''] || '暂无采集记录';
}

function credentialLabel(status: string | null) {
  const labels: Record<string, string> = { active: '凭据可用', expired: '凭据已失效', revoked: '凭据已撤销' };
  return labels[status || ''] || '未配置凭据';
}

function statusClass(status: string | null) {
  if (status === 'success' || status === 'active') return 'bg-emerald-500/15 text-emerald-500';
  if (status === 'failed' || status === 'expired' || status === 'revoked') return 'bg-red-500/15 text-red-500';
  return 'bg-amber-500/15 text-amber-500';
}

export default function SocialReview() {
  const styles = useThemeStyles();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<SocialAccountOverview[]>([]);
  const [videos, setVideos] = useState<VideoPerformanceItem[]>([]);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [accountViews, setAccountViews] = useState<Record<number, { followers: number | null; healthScore: number; viewsGrowth: number; interactionChange: number | null; newVideoCount: number; quality: '正常' | '需关注' | '异常'; metricStatus: MetricStatus | null; report: { period: string | null; videoCount: number; averageViews: number; averageInteractionRate: number | null; topTitle: string | null } | null }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [overview, hot, jobList] = await Promise.all([getSocialAccountsOverview(), getSocialHotVideos(), getSocialIngestionJobs()]);
      const overviewItems = overview.items || [];
      setAccounts(overviewItems);
      setVideos(hot.items || []);
      setJobs(jobList.items || []);
      const detailEntries = await Promise.all(overviewItems.map(async (account) => {
        try {
          const [snapshot, dashboard, daily, quality, report, metricStatus] = await Promise.all([
            getSocialLatestSnapshot(account.accountId), getSocialDashboard(account.accountId), getSocialDailySummary(account.accountId), getSocialDataQuality(account.accountId), getSocialLatestReport(account.accountId), getSocialMetricStatus(account.accountId),
          ]);
          return [account.accountId, {
            followers: snapshot.snapshot?.followers ?? null,
            healthScore: dashboard.health.healthScore,
            viewsGrowth: daily.viewsGrowth,
            interactionChange: daily.interactionChange,
            newVideoCount: daily.newVideoCount,
            quality: quality.errors.length ? '异常' : quality.warnings.length ? '需关注' : '正常',
            metricStatus,
            report: { period: report.periodType, videoCount: report.report.summary.videoCount, averageViews: report.report.summary.averageViews, averageInteractionRate: report.report.summary.averageInteractionRate, topTitle: report.report.performanceRanking.topViews?.title || null },
          }] as const;
        } catch { return [account.accountId, { followers: null, healthScore: 0, viewsGrowth: 0, interactionChange: null, newVideoCount: 0, quality: '需关注' as const, metricStatus: null, report: null }] as const; }
      }));
      setAccountViews(Object.fromEntries(detailEntries));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '数据暂时无法加载，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <LoadingState type="page" text="正在加载短视频复盘数据..." />;
  if (error) return <ErrorState title="短视频复盘数据加载失败" description={error} actionText="重新加载" onRetry={() => void load()} />;

  const successAccounts = accounts.filter((item) => item.latestJob?.status === 'success').length;
  const activeCredentials = accounts.filter((item) => item.credentialStatus === 'active').length;
  const todayNewVideos = Object.values(accountViews).reduce((sum, item) => sum + item.newVideoCount, 0);
  const totalVideos = Object.values(accountViews).reduce((sum, item) => sum + (item.report?.videoCount || 0), 0);
  const viewsGrowth = Object.values(accountViews).reduce((sum, item) => sum + item.viewsGrowth, 0);
  const latestTopVideo = videos[0]?.title || Object.values(accountViews).find((item) => item.report?.topTitle)?.report?.topTitle || null;
  const metricStatuses = Object.values(accountViews).map((item) => item.metricStatus).filter((item): item is MetricStatus => item !== null);
  const viewsAvailable = metricStatuses.some((item) => item.views);
  const interactionAvailable = metricStatuses.some((item) => item.likes || item.comments || item.shares || item.collects);

  return (
    <div className="space-y-6">
      <PageHeader
        title="短视频复盘"
        description="集中查看账号运营、内容表现与采集状态。"
        actions={
          <button type="button" onClick={() => void load()} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${styles.buttonSecondary}`}>
            <RefreshCw className="h-4 w-4" />刷新数据
          </button>
        }
      />

      <PageToolbar
        left={<span className={`text-sm ${styles.textSecondary}`}>账号运营中心</span>}
        right={<span className={`text-sm ${styles.textMuted}`}>已接入账号 {accounts.length} 个</span>}
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { label: '已接入账号', value: accounts.length, icon: Video, color: '#38bdf8' },
          { label: '最近采集成功', value: successAccounts, icon: CircleCheck, color: '#34d399' },
          { label: '可用采集凭据', value: activeCredentials, icon: KeyRound, color: '#a78bfa' },
        ].map((item) => {
          const Icon = item.icon;
          return <div key={item.label} className={`${styles.card} p-5`}><div className="flex items-center justify-between"><div><p className={`text-sm ${styles.textMuted}`}>{item.label}</p><p className={`mt-2 text-3xl font-semibold ${styles.textPrimary}`}>{item.value}</p></div><span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${item.color}1f`, color: item.color }}><Icon className="h-5 w-5" /></span></div></div>;
        })}
      </section>

      <section className={`${styles.card} overflow-hidden`}>
        <div className={`border-b px-5 py-4 ${styles.border}`}><h2 className={`text-base font-semibold ${styles.textPrimary}`}>今日运营摘要</h2></div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
          {[['作品数量', formatCount(totalVideos)], ['今日新增作品', formatCount(todayNewVideos)], ['播放增长', formatPercent(viewsGrowth)], ['最高播放作品', latestTopVideo || '暂无数据'], ['当前数据完整度', viewsAvailable ? (interactionAvailable ? '播放与互动已获取' : '播放已获取，互动暂无') : '暂无播放数据']].map(([label, value]) => <div key={label}><p className={`text-sm ${styles.textMuted}`}>{label}</p><p className={`mt-2 truncate text-lg font-semibold ${styles.textPrimary}`}>{value}</p></div>)}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[['播放数据', viewsAvailable ? '正常' : '暂无'], ['互动数据', interactionAvailable ? '正常' : '暂无'], ['采集状态', successAccounts === accounts.length && accounts.length > 0 ? '正常' : '需关注'], ['凭据状态', activeCredentials === accounts.length && accounts.length > 0 ? '正常' : '需关注']].map(([label, value]) => <div key={label} className={`${styles.card} flex items-center justify-between p-5`}><span className={`text-sm ${styles.textMuted}`}>{label}</span><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${value === '正常' ? 'bg-emerald-500/15 text-emerald-500' : value === '暂无' ? 'bg-zinc-500/15 text-zinc-500' : 'bg-amber-500/15 text-amber-500'}`}>{value}</span></div>)}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {accounts.map((account) => {
          const view = accountViews[account.accountId];
          const qualityClass = view?.quality === '正常' ? 'text-emerald-500 bg-emerald-500/15' : view?.quality === '异常' ? 'text-red-500 bg-red-500/15' : 'text-amber-500 bg-amber-500/15';
          return <article key={account.accountId} className={`${styles.card} p-5`}>
            <div className="flex items-start justify-between gap-4"><div className="min-w-0"><h2 className={`truncate text-base font-semibold ${styles.textPrimary}`}>{account.displayName || account.accountName}</h2><p className={`mt-1 text-sm ${styles.textMuted}`}>{platformLabel(account.platform)} · 最近采集 {formatDate(account.lastFetchedAt)}</p></div><button type="button" onClick={() => navigate(`/social-review/accounts/${account.accountId}`)} className="text-sm font-medium text-brand-500 hover:text-brand-400">进入复盘</button></div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><p className={styles.textMuted}>粉丝数量</p><p className={`mt-1 font-semibold ${styles.textPrimary}`}>{formatCount(view?.followers)}</p></div><div><p className={styles.textMuted}>播放增长</p><p className={`mt-1 font-semibold ${styles.textPrimary}`}>{formatPercent(view?.viewsGrowth)}</p></div><div><p className={styles.textMuted}>互动率变化</p><p className={`mt-1 font-semibold ${styles.textPrimary}`}>{formatPercent(view?.interactionChange)}</p></div><div><p className={styles.textMuted}>健康评分</p><p className={`mt-1 font-semibold ${styles.textPrimary}`}>{formatPercent(view?.healthScore)}</p></div></div>
            <div className="mt-4 flex items-center justify-between border-t pt-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${qualityClass}`}>数据质量：{view?.quality || '需关注'}</span><span className={`text-sm ${styles.textSecondary}`}>热门作品 {formatCount(view?.report?.videoCount)}</span></div>
          </article>;
        })}
      </section>

      <section className={`${styles.card} overflow-hidden`}><div className={`flex items-center justify-between border-b px-5 py-4 ${styles.border}`}><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-violet-400" /><h2 className={`text-base font-semibold ${styles.textPrimary}`}>最新复盘报告</h2></div><span className={`text-sm ${styles.textMuted}`}>按账号展示最近生成结果</span></div><div className="grid grid-cols-1 gap-px bg-theme-border md:grid-cols-2">{accounts.map((account) => { const report = accountViews[account.accountId]?.report; return <button key={account.accountId} type="button" onClick={() => navigate(`/social-review/accounts/${account.accountId}`)} className={`p-5 text-left transition-colors ${styles.tableHover}`}>{report ? <><p className={`font-medium ${styles.textPrimary}`}>{account.displayName || account.accountName} · {report.period || '最近周期'}</p><div className={`mt-3 grid grid-cols-3 gap-3 text-sm ${styles.textSecondary}`}><span>作品 {report.videoCount}</span><span>均播 {formatCount(report.averageViews)}</span><span>互动 {formatPercent(report.averageInteractionRate)}</span></div><p className={`mt-3 truncate text-sm ${styles.textMuted}`}>最高表现：{report.topTitle || '暂无周期作品'}</p></> : <p className={`text-sm ${styles.textMuted}`}>暂无复盘报告</p>}</button>; })}</div></section>

      <section className={`${styles.card} overflow-hidden`}>
        <div className={`flex items-center justify-between border-b px-5 py-4 ${styles.border}`}><h2 className={`text-base font-semibold ${styles.textPrimary}`}>账号列表</h2><span className={`text-sm ${styles.textMuted}`}>查看账号复盘详情</span></div>
        {accounts.length === 0 ? <div className="p-8"><EmptyState icon={Video} title="暂无复盘数据" description="请先添加账号并完成一次采集。" /></div> : (
          <div className="overflow-x-auto"><table className="min-w-[960px] w-full text-left text-sm"><thead className={styles.tableHeader}><tr className={styles.textMuted}><th className="px-5 py-3 font-medium">账号名称</th><th className="px-4 py-3 font-medium">平台</th><th className="px-4 py-3 font-medium">采集状态</th><th className="px-4 py-3 font-medium">凭据状态</th><th className="px-4 py-3 font-medium">健康度</th><th className="px-4 py-3 font-medium">最近采集</th><th className="px-4 py-3 font-medium">下次采集</th><th className="px-5 py-3 font-medium" /></tr></thead><tbody>
            {accounts.map((account) => <tr key={account.accountId} className={`border-t ${styles.tableRow} ${styles.tableHover}`}><td className="px-5 py-4"><div className={`font-medium ${styles.textPrimary}`}>{account.displayName || account.accountName}</div><div className={`mt-1 text-xs ${styles.textMuted}`}>{account.accountName}</div></td><td className={`px-4 py-4 ${styles.textSecondary}`}>{platformLabel(account.platform)}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(account.latestJob?.status || null)}`}>{jobLabel(account.latestJob?.status || null)}</span></td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(account.credentialStatus)}`}>{credentialLabel(account.credentialStatus)}</span></td><td className={`px-4 py-4 font-medium ${styles.textPrimary}`}>{formatPercent(account.health.successRate)}</td><td className={`px-4 py-4 ${styles.textSecondary}`}>{formatDate(account.lastFetchedAt)}</td><td className={`px-4 py-4 ${styles.textSecondary}`}>{account.nextRunAt ? formatDate(account.nextRunAt) : '暂无计划'}</td><td className="px-5 py-4"><button type="button" onClick={() => navigate(`/social-review/accounts/${account.accountId}`)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-500 hover:text-brand-400">查看详情<ChevronRight className="h-4 w-4" /></button></td></tr>)}
          </tbody></table></div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className={`${styles.card} overflow-hidden`}><div className={`flex items-center justify-between border-b px-5 py-4 ${styles.border}`}><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-rose-400" /><h2 className={`text-base font-semibold ${styles.textPrimary}`}>热门作品</h2></div><span className={`text-sm ${styles.textMuted}`}>按爆款评分排序</span></div>{videos.length === 0 ? <div className="p-8"><EmptyState icon={TrendingUp} title="暂无热门作品" description="采集到视频数据后会在这里显示。" /></div> : <div className="divide-y divide-theme-border">{videos.slice(0, 6).map((video, index) => <div key={video.id} className="flex items-center gap-4 px-5 py-4"><span className={`w-5 text-sm font-semibold ${index < 3 ? 'text-rose-400' : styles.textMuted}`}>{index + 1}</span><div className="min-w-0 flex-1"><p className={`truncate font-medium ${styles.textPrimary}`}>{video.title || '未填写作品名称'}</p><p className={`mt-1 text-xs ${styles.textMuted}`}>{formatDate(video.publish_time)}</p></div><div className="text-right"><p className={`text-sm font-medium ${styles.textPrimary}`}>{formatCount(video.views)} 播放</p><p className="mt-1 text-xs text-rose-400">爆款评分 {video.performance.hotScore.toFixed(2)}</p></div></div>)}</div>}</section>
        <section className={`${styles.card} overflow-hidden`}><div className={`flex items-center justify-between border-b px-5 py-4 ${styles.border}`}><div className="flex items-center gap-2"><Activity className="h-5 w-5 text-amber-400" /><h2 className={`text-base font-semibold ${styles.textPrimary}`}>采集监控</h2></div><span className={`text-sm ${styles.textMuted}`}>最近任务</span></div>{jobs.length === 0 ? <div className="p-8"><EmptyState icon={Clock3} title="暂无采集记录" description="账号采集完成后会在这里显示任务状态。" /></div> : <div className="divide-y divide-theme-border">{jobs.slice(0, 6).map((job) => <div key={job.id} className="flex items-center gap-4 px-5 py-4"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${statusClass(job.status)}`}>{job.status === 'failed' ? <CircleAlert className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className={`font-medium ${styles.textPrimary}`}>{jobLabel(job.status)}</p><p className={`mt-1 truncate text-xs ${job.status === 'failed' ? 'text-red-400' : styles.textMuted}`}>{job.lastError || job.failureType || '任务执行正常'}</p></div><span className={`text-xs ${styles.textMuted}`}>{formatDate(job.finishedAt || job.startedAt)}</span></div>)}</div>}</section>
      </div>
    </div>
  );
}
