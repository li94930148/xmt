import { execute, queryAll, queryOne } from '../../database/utils.js';

type MetricPoint = {
  snapshotDate: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  collects: number;
  interactionRate: number;
};

function number(value: unknown) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function dateValue(value: unknown) { const date = new Date(String(value || '')); return Number.isNaN(date.getTime()) ? null : date; }
function daysBetween(start: Date, end: Date) { return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000)); }
function growth(current: number, baseline: number) { return baseline > 0 ? (current - baseline) / baseline : null; }

function pointAtOrBefore(points: MetricPoint[], target: Date) {
  return [...points].reverse().find((point) => {
    const date = dateValue(point.snapshotDate);
    return date !== null && date <= target;
  }) || null;
}

export async function getVideoLifecycle(videoId: number) {
  const video = await queryOne<Record<string, unknown>>(
    `SELECT id, account_id, publish_time, views, likes, comments, shares, collects
       FROM social_videos WHERE id = ? LIMIT 1`, [videoId],
  );
  if (!video) return null;
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT snapshot_date, views, likes, comments, shares, collects, interaction_rate
       FROM video_metric_snapshots WHERE video_id = ? ORDER BY snapshot_date ASC`, [videoId],
  );
  const history = rows.map((row): MetricPoint => {
    const views = number(row.views);
    const likes = number(row.likes);
    const comments = number(row.comments);
    const shares = number(row.shares);
    const collects = number(row.collects);
    return {
      snapshotDate: String(row.snapshot_date), views, likes, comments, shares, collects,
      interactionRate: views > 0 ? (likes + comments + shares + collects) / views : 0,
    };
  });
  const publishDate = dateValue(video.publish_time) || dateValue(history[0]?.snapshotDate) || new Date();
  const current: MetricPoint = history.at(-1) || {
    snapshotDate: new Date().toISOString().slice(0, 10), views: number(video.views), likes: number(video.likes), comments: number(video.comments),
    shares: number(video.shares), collects: number(video.collects), interactionRate: number(video.views) > 0 ? (number(video.likes) + number(video.comments) + number(video.shares) + number(video.collects)) / number(video.views) : 0,
  };
  const firstDay = pointAtOrBefore(history, new Date(publishDate.getTime() + 86_400_000));
  const baseline = history[0] || null;
  const point3 = pointAtOrBefore(history, new Date(publishDate.getTime() + 3 * 86_400_000));
  const point7 = pointAtOrBefore(history, new Date(publishDate.getTime() + 7 * 86_400_000));
  const point30 = pointAtOrBefore(history, new Date(publishDate.getTime() + 30 * 86_400_000));
  const recent = history.length >= 2 ? history.at(-2)! : null;
  const recentGrowth = recent ? growth(current.views, recent.views) : null;
  const ageDays = daysBetween(publishDate, new Date());
  const growthStage = recentGrowth !== null && recentGrowth < -0.05 ? 'decline'
    : ageDays < 3 ? 'early' : ageDays < 30 && (recentGrowth === null || recentGrowth > 0.02) ? 'growth' : 'stable';
  const elapsedDays = recent ? Math.max(1, daysBetween(dateValue(recent.snapshotDate) || new Date(), dateValue(current.snapshotDate) || new Date())) : 0;
  return {
    videoId, publishTime: video.publish_time || null, current,
    historicalTrend: history,
    firstDayPerformance: firstDay,
    growth: { day3: baseline && point3 ? growth(point3.views, baseline.views) : null, day7: baseline && point7 ? growth(point7.views, baseline.views) : null, day30: baseline && point30 ? growth(point30.views, baseline.views) : null },
    growthStage, growthSpeed: { viewsPerDay: recent ? (current.views - recent.views) / elapsedDays : 0, recentGrowthRate: recentGrowth }, ageDays,
  };
}

export async function refreshVideoInsights(videoId: number) {
  const video = await queryOne<Record<string, unknown>>(`SELECT id, account_id, views, likes, comments, shares, collects FROM social_videos WHERE id = ?`, [videoId]);
  if (!video) return [];
  const accountRows = await queryAll<Record<string, unknown>>(`SELECT views, likes, comments, shares, collects FROM social_videos WHERE account_id = ?`, [Number(video.account_id)]);
  const average = (selector: (item: Record<string, unknown>) => number) => accountRows.length ? accountRows.reduce((sum, item) => sum + selector(item), 0) / accountRows.length : 0;
  const viewAverage = average((item) => number(item.views));
  const rate = (item: Record<string, unknown>, key: string) => number(item.views) > 0 ? number(item[key]) / number(item.views) : 0;
  const shareAverage = average((item) => rate(item, 'shares'));
  const commentAverage = average((item) => rate(item, 'comments'));
  const lifecycle = await getVideoLifecycle(videoId);
  const candidates: Array<{ type: string; content: string }> = [];
  if (viewAverage > 0 && number(video.views) >= viewAverage * 1.5) candidates.push({ type: 'above_average_views', content: '播放量超过账号平均值 50%。' });
  if (shareAverage > 0 && rate(video, 'shares') > shareAverage * 1.25) candidates.push({ type: 'high_share_rate', content: '分享率高于账号平均水平。' });
  if (commentAverage > 0 && rate(video, 'comments') > commentAverage * 2) candidates.push({ type: 'abnormal_comment_rate', content: '评论率显著高于账号平均水平。' });
  if (lifecycle && lifecycle.ageDays >= 7 && Number(lifecycle.growth.day7 || 0) > 0.2) candidates.push({ type: 'long_tail_growth', content: '发布一周后仍保持明显增长。' });
  for (const item of candidates) await execute(
    `INSERT INTO video_insights (video_id, type, content, source, created_at) VALUES (?, ?, ?, 'system', datetime('now', '+8 hours'))
     ON CONFLICT(video_id, type, source) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`, [videoId, item.type, item.content],
  );
  return candidates;
}

export async function refreshAccountVideoInsights(accountId: number) {
  const videos = await queryAll<Record<string, unknown>>(`SELECT id FROM social_videos WHERE account_id = ?`, [accountId]);
  for (const video of videos) await refreshVideoInsights(Number(video.id));
  return { count: videos.length };
}

export async function listVideoInsights(videoId: number) {
  return queryAll<Record<string, unknown>>(`SELECT id, type, content, source, created_at FROM video_insights WHERE video_id = ? AND source = 'system' ORDER BY id DESC`, [videoId]);
}
