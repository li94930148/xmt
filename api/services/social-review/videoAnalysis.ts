import { execute, queryAll } from '../../database/utils.js';
import { calculateGrowth } from './growthAnalysis.js';

export type VideoPerformance = {
  videoId: number;
  views: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  collects: number | null;
  likeRate: number | null;
  commentRate: number | null;
  shareRate: number | null;
  collectRate: number | null;
  interactionRate: number | null;
  playScore: number;
  interactionScore: number;
  shareScore: number;
  growthScore: number;
  hotScore: number;
  scoreMode: 'play_only' | 'full';
  averageViews: number;
  averageInteractionRate: number;
  growthAnomaly: boolean;
  performanceLevel: 'high' | 'normal' | 'low';
};

function rate(value: number, views: number) { return views > 0 ? value / views : 0; }

export function calculateVideoPerformance(video: Record<string, unknown>, maxViews: number, maxInteraction: number, growthScore = 0, averageViews = 0, averageInteractionRate = 0, maxRates = { like: 1, comment: 1, share: 1, collect: 1 }): VideoPerformance {
  const views = Number(video.views || 0);
  const hasInteraction = ['likes', 'comments', 'shares', 'collects'].some((key) => video[key] != null);
  const likes = video.likes == null ? null : Number(video.likes);
  const comments = video.comments == null ? null : Number(video.comments);
  const shares = video.shares == null ? null : Number(video.shares);
  const collects = video.collects == null ? null : Number(video.collects);
  const interactionRate = hasInteraction && views > 0 ? ((likes || 0) + (comments || 0) + (shares || 0) + (collects || 0)) / views : null;
  const playScore = maxViews > 0 ? views / maxViews : 0;
  const interactionScore = interactionRate != null && maxInteraction > 0 ? interactionRate / maxInteraction : 0;
  const likeRate = likes == null ? null : rate(likes, views); const commentRate = comments == null ? null : rate(comments, views); const shareScore = shares == null ? null : rate(shares, views); const collectRate = collects == null ? null : rate(collects, views);
  const growthAnomaly = growthScore >= 0.3;
  const performanceLevel = views >= averageViews * 1.5 || growthAnomaly || (interactionRate != null && views >= averageViews && interactionRate >= averageInteractionRate) ? 'high' : 'normal';
  const scoreMode = hasInteraction ? 'full' : 'play_only';
  const normalized = { like: likeRate == null ? 0 : likeRate / Math.max(maxRates.like, Number.EPSILON), comment: commentRate == null ? 0 : commentRate / Math.max(maxRates.comment, Number.EPSILON), share: shareScore == null ? 0 : shareScore / Math.max(maxRates.share, Number.EPSILON), collect: collectRate == null ? 0 : collectRate / Math.max(maxRates.collect, Number.EPSILON) };
  return { videoId: Number(video.id), views, likes, comments, shares, collects, likeRate, commentRate, shareRate: shareScore, collectRate, interactionRate, playScore, interactionScore, shareScore: normalized.share, growthScore, hotScore: scoreMode === 'play_only' ? playScore : playScore * 0.3 + normalized.like * 0.2 + normalized.comment * 0.15 + normalized.share * 0.15 + normalized.collect * 0.1 + growthScore * 0.1, scoreMode, averageViews, averageInteractionRate, growthAnomaly, performanceLevel };
}

export async function listVideoPerformance(accountId?: number) {
  const videos = await queryAll<Record<string, unknown>>(`SELECT id, account_id, internal_video_key, external_video_id, title, video_url, cover_url, publish_time, likes, comments, shares, collects, views, source_type FROM social_videos ${accountId ? 'WHERE account_id = ?' : ''} ORDER BY id DESC`, accountId ? [accountId] : []);
  const maxViews = Math.max(0, ...videos.map((video) => Number(video.views || 0)));
  const maxInteraction = Math.max(0, ...videos.map((video) => { const views = Number(video.views || 0); return views > 0 && ['likes','comments','shares','collects'].some((key) => video[key] != null) ? (Number(video.likes || 0) + Number(video.comments || 0) + Number(video.shares || 0) + Number(video.collects || 0)) / views : 0; }));
  const averageViews = videos.length ? videos.reduce((sum, video) => sum + Number(video.views || 0), 0) / videos.length : 0;
  const averageInteractionRate = videos.length ? videos.reduce((sum, video) => {
    const views = Number(video.views || 0);
    return sum + (views > 0 ? (Number(video.likes || 0) + Number(video.comments || 0) + Number(video.shares || 0) + Number(video.collects || 0)) / views : 0);
  }, 0) / videos.length : 0;
  const maxRates = videos.reduce<{ like: number; comment: number; share: number; collect: number }>((max, video) => { const views = Number(video.views || 0); if (views <= 0) return max; return { like: Math.max(max.like, Number(video.likes || 0) / views), comment: Math.max(max.comment, Number(video.comments || 0) / views), share: Math.max(max.share, Number(video.shares || 0) / views), collect: Math.max(max.collect, Number(video.collects || 0) / views) }; }, { like: 0, comment: 0, share: 0, collect: 0 });
  const items = [];
  for (const video of videos) {
    const history = await queryAll<Record<string, unknown>>(`SELECT views FROM video_metric_snapshots WHERE video_id = ? ORDER BY snapshot_date DESC LIMIT 2`, [Number(video.id)]);
    const growthScore = Math.max(0, Math.min(1, calculateGrowth(Number(history[0]?.views || video.views || 0), Number(history[1]?.views || 0))));
    items.push({ ...video, performance: calculateVideoPerformance(video, maxViews, maxInteraction, growthScore, averageViews, averageInteractionRate, maxRates) });
  }
  for (const item of items) await execute(`INSERT INTO video_performance_scores (video_id, play_score, interaction_score, growth_score, hot_score) VALUES (?, ?, ?, ?, ?) ON CONFLICT(video_id) DO UPDATE SET play_score = excluded.play_score, interaction_score = excluded.interaction_score, growth_score = excluded.growth_score, hot_score = excluded.hot_score`, [item.performance.videoId, item.performance.playScore, item.performance.interactionScore, item.performance.growthScore, item.performance.hotScore]);
  return items;
}

export async function listHotVideos(accountId?: number) { const items = await listVideoPerformance(accountId); return [...items].sort((a, b) => b.performance.hotScore - a.performance.hotScore); }
