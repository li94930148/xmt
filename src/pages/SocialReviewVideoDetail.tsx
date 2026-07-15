import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, BarChart3, Eye, Heart, MessageCircle, RefreshCw, Share2, Star, Video } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { ErrorState, LoadingState, PageHeader, PageToolbar } from '../components/common';
import { getSocialAccount, getSocialVideo, type SocialVideoReview } from '../api/socialReview';
import { useThemeStyles } from '../hooks/useThemeStyles';

function count(value: number | null | undefined) { return value == null ? '暂无数据' : Number(value).toLocaleString('zh-CN'); }
function percent(value: number | null | undefined) { return value == null ? '暂无数据' : `${(Number(value) * 100).toFixed(1)}%`; }
function dateText(value: string | null) { if (!value) return '暂无记录'; const date = new Date(value.replace(' ', 'T')); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false }); }

export default function SocialReviewVideoDetail() {
  const styles = useThemeStyles();
  const navigate = useNavigate();
  const { accountId: accountIdText, videoId: videoIdText } = useParams();
  const accountId = Number(accountIdText || 0);
  const videoId = Number(videoIdText || 0);
  const [accountName, setAccountName] = useState('账号作品');
  const [video, setVideo] = useState<(SocialVideoReview & { playScore: number; interactionScore: number; growthScore: number; growthSpeed?: { viewsPerDay: number; recentGrowthRate: number | null } | null }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [accountResult, videoResult] = await Promise.all([getSocialAccount(accountId), getSocialVideo(accountId, videoId)]);
      setAccountName(accountResult.account.displayName || accountResult.account.accountName); setVideo(videoResult.video);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : '作品数据暂时无法加载，请稍后重试。'); }
    finally { setLoading(false); }
  }, [accountId, videoId]);

  useEffect(() => { void load(); }, [load]);
  if (loading) return <LoadingState type="page" text="正在加载作品复盘数据..." />;
  if (error) return <ErrorState title="作品数据加载失败" description={error} actionText="重新加载" onRetry={() => void load()} />;
  if (!video) return <EmptyState icon={Video} title="暂无作品数据" description="当前作品不存在或暂时没有可展示的数据。" />;

  const metricCards = [
    { label: '播放量', value: count(video.views), icon: Eye, color: 'text-sky-400' },
    { label: '点赞', value: count(video.likes), icon: Heart, color: 'text-rose-400' },
    { label: '评论', value: count(video.comments), icon: MessageCircle, color: 'text-violet-400' },
    { label: '分享', value: count(video.shares), icon: Share2, color: 'text-emerald-400' },
    { label: '收藏', value: count(video.collects), icon: Star, color: 'text-amber-400' },
  ];

  return <div className="space-y-6">
    <PageHeader title={video.title || '作品复盘'} description={`账号：${accountName}`} backButton={{ onClick: () => navigate(`/social-review/accounts/${accountId}`), label: '返回作品复盘列表' }} actions={<button type="button" onClick={() => void load()} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${styles.buttonSecondary}`}><RefreshCw className="h-4 w-4" />刷新数据</button>} />
    <PageToolbar left={<span className={`text-sm ${styles.textSecondary}`}>作品基础信息</span>} />
    <section className={`${styles.card} overflow-hidden`}><div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-[180px_1fr]"><div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-brand-500/10 text-brand-400 md:aspect-[4/3]">{video.coverUrl ? <img src={video.coverUrl} alt="" className="h-full w-full object-cover" /> : <Video className="h-8 w-8" />}</div><div className="min-w-0"><h2 className={`text-xl font-semibold ${styles.textPrimary}`}>{video.title || '暂无作品名称'}</h2><dl className={`mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 ${styles.textSecondary}`}><div><dt className="text-xs">发布时间</dt><dd className={`mt-1 ${styles.textPrimary}`}>{dateText(video.publishTime)}</dd></div><div><dt className="text-xs">当前播放</dt><dd className={`mt-1 ${styles.textPrimary}`}>{count(video.views)}</dd></div><div><dt className="text-xs">增长阶段</dt><dd className={`mt-1 ${styles.textPrimary}`}>{({ early: '早期', growth: '增长', stable: '稳定', decline: '回落' } as Record<string, string>)[video.lifecycleStage || ''] || '暂无数据'}</dd></div><div><dt className="text-xs">爆款评分模式</dt><dd className={`mt-1 ${styles.textPrimary}`}>{video.scoreMode === 'play_only' ? '仅播放数据' : '完整指标'}</dd></div></dl></div></div></section>
    <section className="grid grid-cols-2 gap-4 md:grid-cols-5">{metricCards.map((item) => { const Icon = item.icon; return <div key={item.label} className={`${styles.card} p-4`}><div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${item.color}`} /><span className={`text-sm ${styles.textMuted}`}>{item.label}</span></div><p className={`mt-3 text-2xl font-semibold ${styles.textPrimary}`}>{item.value}</p></div>; })}</section>
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2"><section className={`${styles.card} p-6`}><div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-violet-400" /><h2 className={`text-base font-semibold ${styles.textPrimary}`}>表现趋势</h2></div><dl className={`mt-5 space-y-3 text-sm ${styles.textSecondary}`}><div className="flex justify-between"><dt>发布时间</dt><dd className={styles.textPrimary}>{dateText(video.publishTime)}</dd></div><div className="flex justify-between"><dt>当前播放</dt><dd className={styles.textPrimary}>{count(video.views)}</dd></div><div className="flex justify-between"><dt>日均播放增长</dt><dd className={styles.textPrimary}>{video.growthSpeed ? count(video.growthSpeed.viewsPerDay) : '暂无数据'}</dd></div></dl></section><section className={`${styles.card} p-6`}><div className="flex items-center gap-2"><ArrowUpRight className="h-5 w-5 text-emerald-400" /><h2 className={`text-base font-semibold ${styles.textPrimary}`}>数据来源说明</h2></div><dl className={`mt-5 space-y-3 text-sm ${styles.textSecondary}`}><div className="flex justify-between"><dt>播放来源</dt><dd className={styles.textPrimary}>创作者中心性能接口</dd></div><div className="flex justify-between"><dt>互动数据</dt><dd className={styles.textPrimary}>{video.likes == null && video.comments == null && video.shares == null && video.collects == null ? '暂无开放数据' : '已获取'}</dd></div><div className="flex justify-between"><dt>互动率</dt><dd className={styles.textPrimary}>{percent(video.interactionRate)}</dd></div></dl></section></div>
  </div>;
}
