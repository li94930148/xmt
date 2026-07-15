import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Activity, BarChart3, CircleAlert, CircleCheck, Eye, Heart, RefreshCw, ShieldCheck, TrendingUp, Video } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { ErrorState, LoadingState, PageHeader, PageToolbar } from '../components/common';
import { generateSocialReport, getSocialAccount, getSocialContentInsights, getSocialDashboard, getSocialDailySummary, getSocialDataQuality, getSocialAccountVideos, getSocialLatestReport, getSocialMetricStatus, getSocialOperationSuggestions, syncSocialExport, type AccountDashboard, type ContentInsights, type DailySummary, type DataQuality, type FeaturePattern, type MetricStatus, type OperationSuggestion, type SocialReviewReport, type SocialVideoReview } from '../api/socialReview';
import { useThemeStyles } from '../hooks/useThemeStyles';

function count(value: number | null | undefined) { return value == null ? '暂无数据' : Number(value).toLocaleString('zh-CN'); }
function percent(value: number | null | undefined) { return value == null ? '暂无数据' : `${(Number(value) * 100).toFixed(1)}%`; }
function dateText(value: string | null) { if (!value) return '暂无记录'; const date = new Date(value.replace(' ', 'T')); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false }); }
function platformText(platform: string) { return ({ douyin: '抖音', kuaishou: '快手', xiaohongshu: '小红书', shipinhao: '视频号', tiktok: 'TikTok', bilibili: '哔哩哔哩', weibo: '微博', other: '其他' } as Record<string, string>)[platform] || platform; }

export default function SocialReviewAccountDetail() {
  const styles = useThemeStyles();
  const navigate = useNavigate();
  const { id } = useParams();
  const accountId = Number(id || 0);
  const [account, setAccount] = useState<{ accountName: string; displayName: string | null; platform: string; active: boolean } | null>(null);
  const [dashboard, setDashboard] = useState<AccountDashboard | null>(null);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [quality, setQuality] = useState<DataQuality | null>(null);
  const [metricStatus, setMetricStatus] = useState<MetricStatus | null>(null);
  const [videos, setVideos] = useState<SocialVideoReview[]>([]);
  const [report, setReport] = useState<SocialReviewReport | null>(null);
  const [contentInsights, setContentInsights] = useState<ContentInsights | null>(null);
  const [operationSuggestions, setOperationSuggestions] = useState<OperationSuggestion[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | '90d'>('30d');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  const load = useCallback(async () => {
    if (!accountId) { setError('账号信息无效。'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const [accountResult, dashboardResult, dailyResult, qualityResult, videoResult, metricStatusResult] = await Promise.all([
        getSocialAccount(accountId), getSocialDashboard(accountId), getSocialDailySummary(accountId), getSocialDataQuality(accountId), getSocialAccountVideos(accountId, 1, 20), getSocialMetricStatus(accountId),
      ]);
      setAccount(accountResult.account); setDashboard(dashboardResult); setSummary(dailyResult); setQuality(qualityResult); setVideos(videoResult.items || []); setMetricStatus(metricStatusResult);
      const [reportResult, contentResult, suggestionResult] = await Promise.allSettled([getSocialLatestReport(accountId), getSocialContentInsights(accountId), getSocialOperationSuggestions(accountId)]);
      if (reportResult.status === 'fulfilled') { setReport(reportResult.value); setSelectedPeriod((reportResult.value.periodType || '30d') as '7d' | '30d' | '90d'); }
      if (contentResult.status === 'fulfilled') setContentInsights(contentResult.value);
      if (suggestionResult.status === 'fulfilled') setOperationSuggestions(suggestionResult.value.items || []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : '数据暂时无法加载，请稍后重试。'); }
    finally { setLoading(false); }
  }, [accountId]);

  useEffect(() => { void load(); }, [load]);
  const handleSync = async () => {
    setSyncing(true); setSyncMessage('');
    try { const result = await syncSocialExport(accountId); setSyncMessage(`同步完成：新增 ${result.insertCount} 条，更新 ${result.updateCount} 条，跳过 ${result.skipCount} 条。`); await load(); }
    catch (syncError) { setSyncMessage(syncError instanceof Error ? syncError.message : '作品数据同步失败，请稍后重试。'); }
    finally { setSyncing(false); }
  };
  const handleReportPeriod = async (period: '7d' | '30d' | '90d') => {
    setSelectedPeriod(period); setGeneratingReport(true);
    try { const next = await generateSocialReport(accountId, period); setReport(next as SocialReviewReport); }
    catch (reportError) { setSyncMessage(reportError instanceof Error ? reportError.message : '复盘报告生成失败，请稍后重试。'); }
    finally { setGeneratingReport(false); }
  };
  if (loading) return <LoadingState type="page" text="正在加载账号复盘数据..." />;
  if (error) return <ErrorState title="账号复盘数据加载失败" description={error} actionText="重新加载" onRetry={() => void load()} />;
  if (!account || !dashboard || !summary || !quality) return <EmptyState icon={Video} title="暂无复盘数据" description="当前账号暂无可展示的数据。" />;

  const qualityState = quality.errors.length ? { label: '异常', color: 'text-red-500 bg-red-500/15', icon: CircleAlert } : quality.warnings.length ? { label: '提醒', color: 'text-amber-500 bg-amber-500/15', icon: CircleAlert } : { label: '正常', color: 'text-emerald-500 bg-emerald-500/15', icon: CircleCheck };
  const QualityIcon = qualityState.icon;
  const patternGroups: Array<{ label: string; items: FeaturePattern[] }> = report?.report ? [
    { label: '高表现关键词', items: report.report.contentPatterns.highPerformanceKeywords },
    { label: '高表现分类', items: report.report.contentPatterns.highPerformanceCategories },
    { label: '发布时间规律', items: report.report.contentPatterns.highPerformancePublishTimeBuckets },
    { label: '视频长度规律', items: report.report.contentPatterns.highPerformanceDurationLevels },
  ] : [];

  return <div className="space-y-6">
    <PageHeader title={account.displayName || account.accountName} description={`${platformText(account.platform)}账号复盘`} backButton={{ to: '/social-review', label: '返回账号运营中心' }} actions={<div className="flex flex-wrap gap-3"><button type="button" onClick={() => void handleSync()} disabled={syncing} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${styles.buttonPrimary} disabled:cursor-not-allowed disabled:opacity-60`}><RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />{syncing ? '正在同步' : '同步作品数据'}</button><button type="button" onClick={() => void load()} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${styles.buttonSecondary}`}><RefreshCw className="h-4 w-4" />刷新数据</button></div>}>
      <div className="flex flex-wrap items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${account.active ? 'bg-emerald-500/15 text-emerald-500' : 'bg-zinc-500/15 text-zinc-500'}`}>{account.active ? '账号已启用' : '账号未启用'}</span><span className={`text-sm ${styles.textSecondary}`}>健康评分 {percent(dashboard.health.healthScore)}</span><span className={`text-sm ${styles.textSecondary}`}>最近采集 {dateText(summary.collection.lastSuccessAt)}</span><span className={`text-sm ${styles.textSecondary}`}>凭据状态 {summary.collection.latestFailureType ? '需关注' : '正常'}</span></div>
    </PageHeader>
    {syncMessage ? <div className={`rounded-xl border px-4 py-3 text-sm ${syncMessage.includes('失败') || syncMessage.includes('无法') ? 'border-red-500/25 bg-red-500/10 text-red-500' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500'}`}>{syncMessage}</div> : null}

    <PageToolbar left={<span className={`text-sm ${styles.textSecondary}`}>今日摘要</span>} right={<span className={`text-sm ${styles.textMuted}`}>{summary.summaryDate}</span>} />
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{[
      { label: '新增视频', value: `${summary.newVideoCount} 条`, icon: Video, color: '#38bdf8' },
      { label: '播放变化', value: percent(summary.viewsGrowth), icon: Eye, color: '#a78bfa' },
      { label: '互动变化', value: percent(summary.interactionChange), icon: Heart, color: '#fb7185' },
      { label: '最佳内容', value: summary.bestContent?.title || '暂无内容', icon: TrendingUp, color: '#34d399' },
    ].map((item) => { const Icon = item.icon; return <div key={item.label} className={`${styles.card} p-5`}><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className={`text-sm ${styles.textMuted}`}>{item.label}</p><p className={`mt-2 truncate font-semibold ${item.label === '最佳内容' ? 'text-base' : 'text-3xl'} ${styles.textPrimary}`}>{item.value}</p>{item.label === '最佳内容' && summary.bestContent ? <p className={`mt-1 text-xs ${styles.textMuted}`}>{count(summary.bestContent.views)} 播放</p> : null}</div><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${item.color}1f`, color: item.color }}><Icon className="h-5 w-5" /></span></div></div>; })}</section>

    <section className={`${styles.card} overflow-hidden`}><div className={`flex items-center justify-between border-b px-5 py-4 ${styles.border}`}><div className="flex items-center gap-2"><Video className="h-5 w-5 text-rose-400" /><h2 className={`text-base font-semibold ${styles.textPrimary}`}>作品复盘列表</h2></div><span className={`text-sm ${styles.textMuted}`}>共 {videos.length} 条</span></div>{videos.length === 0 ? <div className="p-8"><EmptyState icon={Video} title="暂无作品数据" description="完成作品采集后可查看内容复盘。" /></div> : <div className="overflow-x-auto"><table className="min-w-[1240px] w-full text-left text-sm"><thead className={styles.tableHeader}><tr className={styles.textMuted}><th className="px-5 py-3 font-medium">作品</th><th className="px-4 py-3 font-medium">发布时间</th><th className="px-4 py-3 text-right font-medium">播放量</th><th className="px-4 py-3 text-right font-medium">播放排名</th><th className="px-4 py-3 font-medium">生命周期</th><th className="px-4 py-3 text-right font-medium">点赞</th><th className="px-4 py-3 text-right font-medium">评论</th><th className="px-4 py-3 text-right font-medium">分享</th><th className="px-4 py-3 text-right font-medium">收藏</th><th className="px-4 py-3 font-medium">评分模式</th><th className="px-5 py-3 text-right font-medium">爆款评分</th></tr></thead><tbody>{videos.map((video) => <tr key={video.id} className={`border-t ${styles.tableRow} ${styles.tableHover}`}><td className="px-5 py-4"><button type="button" onClick={() => navigate(`/social-review/accounts/${accountId}/videos/${video.id}`)} className="flex min-w-[220px] items-center gap-3 text-left"><span className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-500/10 text-brand-400">{video.coverUrl ? <img src={video.coverUrl} alt="" className="h-full w-full object-cover" /> : <Video className="h-4 w-4" />}</span><span className={`max-w-[220px] truncate font-medium ${styles.textPrimary}`}>{video.title || '暂无作品名称'}</span></button></td><td className={`px-4 py-4 ${styles.textSecondary}`}>{dateText(video.publishTime)}</td><td className={`px-4 py-4 text-right ${styles.textPrimary}`}>{count(video.views)}</td><td className={`px-4 py-4 text-right ${styles.textPrimary}`}>{video.playRank ? `第 ${video.playRank} 名` : '暂无数据'}</td><td className={`px-4 py-4 ${styles.textSecondary}`}>{({ early: '早期', growth: '增长', stable: '稳定', decline: '回落' } as Record<string, string>)[video.lifecycleStage || ''] || '暂无数据'}</td><td className={`px-4 py-4 text-right ${styles.textPrimary}`}>{count(video.likes)}</td><td className={`px-4 py-4 text-right ${styles.textPrimary}`}>{count(video.comments)}</td><td className={`px-4 py-4 text-right ${styles.textPrimary}`}>{count(video.shares)}</td><td className={`px-4 py-4 text-right ${styles.textPrimary}`}>{count(video.collects)}</td><td className={`px-4 py-4 ${styles.textSecondary}`}>{video.scoreMode === 'play_only' ? '仅播放数据' : '完整指标'}</td><td className="px-5 py-4 text-right text-rose-400">{video.hotScore.toFixed(2)}</td></tr>)}</tbody></table></div>}</section>

    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]"><aside className={`${styles.card} overflow-hidden`}><div className={`flex items-center justify-between border-b px-5 py-4 ${styles.border}`}><div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-cyan-400" /><h2 className={`text-base font-semibold ${styles.textPrimary}`}>数据质量</h2></div><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${qualityState.color}`}><QualityIcon className="h-3.5 w-3.5" />{qualityState.label}</span></div><div className="space-y-3 p-5">{quality.errors.length + quality.warnings.length === 0 ? <p className={`text-sm ${styles.textSecondary}`}>当前账号数据完整，采集状态正常。</p> : [...quality.errors, ...quality.warnings].map((item) => <div key={item.code} className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-sm text-amber-500">{item.message}</div>)}</div></aside><aside className={`${styles.card} overflow-hidden`}><div className={`border-b px-5 py-4 ${styles.border}`}><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-violet-400" /><h2 className={`text-base font-semibold ${styles.textPrimary}`}>账号表现</h2></div></div><dl className={`space-y-3 p-5 text-sm ${styles.textSecondary}`}><div className="flex justify-between"><dt>平均播放</dt><dd className={styles.textPrimary}>{count(dashboard.health.averageViews)}</dd></div><div className="flex justify-between"><dt>平均互动率</dt><dd className={styles.textPrimary}>{percent(dashboard.health.averageInteractionRate)}</dd></div><div className="flex justify-between"><dt>粉丝变化</dt><dd className={styles.textPrimary}>{percent(dashboard.health.followerGrowth)}</dd></div><div className="flex justify-between"><dt>采集成功率</dt><dd className={styles.textPrimary}>{percent(summary.collection.successRate)}</dd></div></dl></aside></div>
    <section className={`${styles.card} overflow-hidden`}>
      <div className={`flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${styles.border}`}>
        <div><h2 className={`text-base font-semibold ${styles.textPrimary}`}>周期复盘报告</h2><p className={`mt-1 text-sm ${styles.textMuted}`}>查看账号内容、表现排行与规则建议</p></div>
        <div className="flex gap-2">{(['7d', '30d', '90d'] as const).map((period) => <button key={period} type="button" disabled={generatingReport} onClick={() => void handleReportPeriod(period)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${selectedPeriod === period ? styles.buttonPrimary : styles.buttonSecondary}`}>{period === '7d' ? '7天' : period === '30d' ? '30天' : '90天'}</button>)}</div>
      </div>
      {report?.report ? <div className="space-y-5 p-5">
        <div className={`flex flex-wrap gap-2 text-xs ${styles.textSecondary}`}><span className={styles.textMuted}>指标完整度：</span>{[['播放', report.report.metricAvailability?.views ?? metricStatus?.views], ['点赞', report.report.metricAvailability?.likes ?? metricStatus?.likes], ['评论', report.report.metricAvailability?.comments ?? metricStatus?.comments], ['分享', report.report.metricAvailability?.shares ?? metricStatus?.shares], ['收藏', report.report.metricAvailability?.collects ?? metricStatus?.collects]].map(([label, available]) => <span key={String(label)} className={`rounded-full px-2 py-1 ${available ? 'bg-emerald-500/15 text-emerald-500' : 'bg-zinc-500/15 text-zinc-500'}`}>{label}：{available ? '已获取' : '暂无'}</span>)}</div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><div><p className={styles.textMuted}>作品数量</p><p className={`mt-1 text-xl font-semibold ${styles.textPrimary}`}>{report.report.summary.videoCount}</p></div><div><p className={styles.textMuted}>平均播放</p><p className={`mt-1 text-xl font-semibold ${styles.textPrimary}`}>{count(report.report.summary.averageViews)}</p></div><div><p className={styles.textMuted}>平均互动</p><p className={`mt-1 text-xl font-semibold ${styles.textPrimary}`}>{percent(report.report.summary.averageInteractionRate)}</p></div><div><p className={styles.textMuted}>最高表现</p><p className={`mt-1 truncate text-sm font-semibold ${styles.textPrimary}`}>{report.report.performanceRanking.topViews?.title || '暂无周期作品'}</p></div></div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2"><div><h3 className={`text-sm font-medium ${styles.textPrimary}`}>内容分类</h3>{report.report.contentDistribution.categories.length ? <div className={`mt-3 space-y-2 text-sm ${styles.textSecondary}`}>{report.report.contentDistribution.categories.map((item) => <p key={item.category}>{item.category} · {item.count} 条 · {count(item.avgViews)} 平均播放</p>)}</div> : <p className={`mt-3 text-sm ${styles.textMuted}`}>当前周期没有可统计的内容分类。</p>}</div><div><h3 className={`text-sm font-medium ${styles.textPrimary}`}>运营建议</h3>{report.report.suggestions.length ? <div className={`mt-3 space-y-2 text-sm ${styles.textSecondary}`}>{report.report.suggestions.map((item) => <p key={`${item.feature}-${item.suggestion}`}>{item.suggestion}</p>)}</div> : <p className={`mt-3 text-sm ${styles.textMuted}`}>当前周期暂无有数据支撑的运营建议。</p>}</div></div>
      </div> : <div className="p-8"><EmptyState icon={BarChart3} title="暂无复盘报告" description="完成采集后可生成并查看账号周期复盘。" /></div>}
    </section>

    <section className={`${styles.card} overflow-hidden`}>
      <div className={`border-b px-5 py-4 ${styles.border}`}><h2 className={`text-base font-semibold ${styles.textPrimary}`}>内容规律</h2><p className={`mt-1 text-sm ${styles.textMuted}`}>仅展示有数据支持的高表现特征</p></div>
      {report?.report ? <div className="grid grid-cols-1 gap-px bg-theme-border md:grid-cols-2 xl:grid-cols-4">{patternGroups.map(({ label, items }) => <div key={label} className="bg-theme-card p-5"><h3 className={`text-sm font-medium ${styles.textPrimary}`}>{label}</h3>{items.length ? <div className={`mt-3 space-y-2 text-sm ${styles.textSecondary}`}>{items.map((item) => <p key={item.feature}>{item.feature} · {count(item.avgViews)} 平均播放</p>)}</div> : <p className={`mt-3 text-sm ${styles.textMuted}`}>暂无有数据支撑的规律。</p>}</div>)}</div> : <div className="p-8"><EmptyState icon={TrendingUp} title="暂无内容规律" description="生成周期报告后将展示高表现内容特征。" /></div>}
      {contentInsights?.highPerformanceFeatures.length ? <p className={`border-t px-5 py-3 text-sm ${styles.textMuted}`}>当前账号已识别 {contentInsights.highPerformanceFeatures.length} 项高表现特征。</p> : null}
    </section>

    <section className={`${styles.card} overflow-hidden`}>
      <div className={`flex items-center justify-between border-b px-5 py-4 ${styles.border}`}><div><h2 className={`text-base font-semibold ${styles.textPrimary}`}>热门作品排行</h2><p className={`mt-1 text-sm ${styles.textMuted}`}>按爆款评分排序，点击进入作品详情</p></div><TrendingUp className="h-5 w-5 text-rose-400" /></div>
      {videos.length ? <div className="divide-y divide-theme-border">{[...videos].sort((a, b) => b.hotScore - a.hotScore).slice(0, 5).map((video, index) => <button type="button" key={video.id} onClick={() => navigate(`/social-review/accounts/${accountId}/videos/${video.id}`)} className={`flex w-full items-center gap-4 px-5 py-4 text-left ${styles.tableHover}`}><span className={`w-5 text-sm font-semibold ${index < 3 ? 'text-rose-400' : styles.textMuted}`}>{index + 1}</span><span className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-500/10 text-brand-400">{video.coverUrl ? <img src={video.coverUrl} alt="" className="h-full w-full object-cover" /> : <Video className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className={`block truncate font-medium ${styles.textPrimary}`}>{video.title || '未填写作品名称'}</span><span className={`mt-1 block text-xs ${styles.textMuted}`}>{count(video.views)} 播放 · {count(video.likes)} 点赞 · {count(video.comments)} 评论 · {count(video.shares)} 分享</span></span><span className="text-right text-sm text-rose-400">爆款评分 {video.hotScore.toFixed(2)}</span></button>)}</div> : <div className="p-8"><EmptyState icon={TrendingUp} title="暂无热门作品" description="完成作品采集后将展示热门作品排行。" /></div>}
    </section>

    <section className={`${styles.card} overflow-hidden`}>
      <div className={`flex items-center justify-between border-b px-5 py-4 ${styles.border}`}><div><h2 className={`text-base font-semibold ${styles.textPrimary}`}>运营建议</h2><p className={`mt-1 text-sm ${styles.textMuted}`}>基于当前账号内容与表现数据生成</p></div><Activity className="h-5 w-5 text-amber-400" /></div>
      {operationSuggestions.length ? <div className="divide-y divide-theme-border">{operationSuggestions.map((item) => <div key={item.id} className="px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className={`font-medium ${styles.textPrimary}`}>{item.title}</h3><span className={`text-xs ${styles.textMuted}`}>来源：{item.source === 'system' ? '系统规则' : item.source}</span></div><p className={`mt-2 text-sm ${styles.textSecondary}`}>{item.content}</p></div>)}</div> : <div className="p-8"><EmptyState icon={Activity} title="暂无运营建议" description="当前没有满足规则条件的建议，继续积累作品数据后再查看。" /></div>}
    </section>
  </div>;
}
