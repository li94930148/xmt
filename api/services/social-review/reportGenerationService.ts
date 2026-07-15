import { execute, queryAll, queryOne } from '../../database/utils.js';
import { analyzeAccountHealth } from './accountHealthService.js';
import { refreshAccountVideoContentFeatures } from './videoContentFeatureService.js';
import { inspectSocialDataQuality } from './socialDataQualityService.js';

export type ReportPeriod = '7d' | '30d' | '90d';

function number(value: unknown) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function dateOnly(date: Date) { return date.toISOString().slice(0, 10); }
function rate(row: Record<string, unknown>) { const views = number(row.views); return views > 0 ? (number(row.likes) + number(row.comments) + number(row.shares) + number(row.collects)) / views : 0; }
function metricRate(row: Record<string, unknown>, field: 'likes' | 'comments' | 'shares' | 'collects') { const views = number(row.views); return views > 0 && row[field] != null ? number(row[field]) / views : null; }

function periodRange(period: ReportPeriod) {
  const days = Number(period.slice(0, -1));
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return { periodStart: dateOnly(start), periodEnd: dateOnly(end) };
}

async function reportVideos(accountId: number, periodStart: string, periodEnd: string) {
  return queryAll<Record<string, unknown>>(
    `SELECT id, title, publish_time, views, likes, comments, shares, collects
       FROM social_videos WHERE account_id = ? AND date(publish_time) BETWEEN ? AND ?`, [accountId, periodStart, periodEnd],
  );
}

export async function generateAccountReport(accountId: number, options: { period?: ReportPeriod } = {}) {
  const period = options.period || '30d';
  const { periodStart, periodEnd } = periodRange(period);
  await refreshAccountVideoContentFeatures(accountId);
  const videos = await reportVideos(accountId, periodStart, periodEnd);
  const health = await analyzeAccountHealth(accountId);
  const dataQuality = await inspectSocialDataQuality(accountId);
  const avgViews = videos.length ? videos.reduce((sum, row) => sum + number(row.views), 0) / videos.length : 0;
  const avgInteractionRate = videos.length ? videos.reduce((sum, row) => sum + rate(row), 0) / videos.length : 0;
  const followerRows = await queryAll<Record<string, unknown>>(
    `SELECT followers, snapshot_date FROM social_snapshots WHERE account_id = ? AND snapshot_date BETWEEN ? AND ? ORDER BY snapshot_date ASC`, [accountId, periodStart, periodEnd],
  );
  const followerChange = followerRows.length >= 2 ? number(followerRows.at(-1)?.followers) - number(followerRows[0]?.followers) : 0;
  const top = (compare: (a: Record<string, unknown>, b: Record<string, unknown>) => number) => {
    const item = [...videos].sort(compare)[0];
    return item ? { videoId: Number(item.id), title: item.title || null, metrics: { views: number(item.views), interactionRate: rate(item), shares: number(item.shares) } } : null;
  };
  let fastestGrowth: { videoId: number; title: string | null; metrics: { viewsGrowth: number } } | null = null;
  for (const video of videos) {
    const snapshots = await queryAll<Record<string, unknown>>(`SELECT views FROM video_metric_snapshots WHERE video_id = ? ORDER BY snapshot_date DESC LIMIT 2`, [Number(video.id)]);
    if (snapshots.length < 2 || number(snapshots[1].views) <= 0) continue;
    const viewsGrowth = (number(snapshots[0].views) - number(snapshots[1].views)) / number(snapshots[1].views);
    if (!fastestGrowth || viewsGrowth > fastestGrowth.metrics.viewsGrowth) fastestGrowth = { videoId: Number(video.id), title: video.title ? String(video.title) : null, metrics: { viewsGrowth } };
  }
  const categoryRows = await queryAll<Record<string, unknown>>(
    `SELECT f.feature_value AS category, v.id AS video_id, v.views, v.likes, v.comments, v.shares, v.collects
       FROM video_content_features f JOIN social_videos v ON v.id = f.video_id
      WHERE v.account_id = ? AND date(v.publish_time) BETWEEN ? AND ? AND f.feature_type = 'content_category'`, [accountId, periodStart, periodEnd],
  );
  const grouped = new Map<string, { feature: string; count: number; views: number; interaction: number; shares: number; videoIds: number[] }>();
  const featureRows = await queryAll<Record<string, unknown>>(
    `SELECT f.feature_type, f.feature_value, v.id AS video_id, v.views, v.likes, v.comments, v.shares, v.collects
       FROM video_content_features f JOIN social_videos v ON v.id = f.video_id
      WHERE v.account_id = ? AND date(v.publish_time) BETWEEN ? AND ?`, [accountId, periodStart, periodEnd],
  );
  for (const row of featureRows) {
    const key = `${row.feature_type}:${row.feature_value}`;
    const entry = grouped.get(key) || { feature: String(row.feature_value), count: 0, views: 0, interaction: 0, shares: 0, videoIds: [] };
    entry.count += 1; entry.views += number(row.views); entry.interaction += rate(row); entry.shares += number(row.shares); entry.videoIds.push(Number(row.video_id)); grouped.set(key, entry);
  }
  const qualified = [...grouped.entries()].map(([key, item]) => ({ key, ...item, avgViews: item.views / item.count, avgInteractionRate: item.interaction / item.count, avgShares: item.shares / item.count }))
    .filter((item) => item.count >= 2 && (item.avgViews > avgViews * 1.1 || item.avgInteractionRate > avgInteractionRate * 1.1));
  const byType = (type: string) => qualified.filter((item) => item.key.startsWith(`${type}:`)).map(({ feature, avgViews: featureAvgViews, avgInteractionRate, avgShares, count }) => ({ feature, avgViews: featureAvgViews, avgInteractionRate, avgShares, count }));
  const categoryDistribution = categoryRows.reduce((map, row) => { const key = String(row.category); const item = map.get(key) || { category: key, count: 0, views: 0, interaction: 0 }; item.count += 1; item.views += number(row.views); item.interaction += rate(row); map.set(key, item); return map; }, new Map<string, { category: string; count: number; views: number; interaction: number }>());
  const categories = [...categoryDistribution.values()].map((item) => ({ category: item.category, count: item.count, avgViews: item.views / item.count, avgInteractionRate: item.interaction / item.count }));
  const averageMetricRate = (field: 'likes' | 'comments' | 'shares' | 'collects') => { const values = videos.map((row) => metricRate(row, field)).filter((value): value is number => value != null); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; };
  const report = {
    summary: { videoCount: videos.length, newVideoCount: videos.length, averageViews: avgViews, averageInteractionRate: avgInteractionRate, averageLikeRate: averageMetricRate('likes'), averageCommentRate: averageMetricRate('comments'), averageShareRate: averageMetricRate('shares'), averageCollectRate: averageMetricRate('collects'), followerChange, accountHealth: health, dataQualityStatus: { warningCount: dataQuality.warnings.length, errorCount: dataQuality.errors.length } },
    metricAvailability: { views: videos.some((row) => row.views != null), likes: videos.some((row) => row.likes != null), comments: videos.some((row) => row.comments != null), shares: videos.some((row) => row.shares != null), collects: videos.some((row) => row.collects != null) },
    contentDistribution: { categoryCount: categories.length, categories, highPerformanceCategories: byType('content_category') },
    performanceRanking: { topViews: top((a, b) => number(b.views) - number(a.views)), topInteraction: top((a, b) => rate(b) - rate(a)), topShares: top((a, b) => number(b.shares) - number(a.shares)), fastestGrowth },
    contentPatterns: { highPerformanceKeywords: byType('title_keyword'), highPerformanceCategories: byType('content_category'), highPerformancePublishTimeBuckets: byType('publish_time_bucket'), highPerformanceDurationLevels: byType('duration_level') },
    suggestions: qualified.slice(0, 5).map((item) => ({ feature: item.feature, reason: item.avgViews > avgViews * 1.1 ? '平均播放高于账号平均水平。' : '平均互动率高于账号平均水平。', suggestion: `${item.feature}类内容表现较好，可以继续测试。` })),
  };
  const representative = qualified.sort((a, b) => b.avgInteractionRate - a.avgInteractionRate)[0];
  if (representative) await execute(
    `INSERT INTO video_insights (video_id, type, content, source, created_at) VALUES (?, 'account_report', ?, 'system', datetime('now', '+8 hours'))
     ON CONFLICT(video_id, type, source) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`,
    [representative.videoIds[0], `近${period.slice(0, -1)}天${representative.feature}类内容平均互动率较高。`],
  );
  await execute(
    `INSERT INTO social_review_reports (account_id, report_type, period_type, period_start, period_end, summary_json, report_json, created_at, updated_at)
     VALUES (?, 'account_review', ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
     ON CONFLICT(account_id, report_type, period_start, period_end) DO UPDATE SET period_type = excluded.period_type, summary_json = excluded.summary_json, report_json = excluded.report_json, updated_at = excluded.updated_at`,
    [accountId, period, periodStart, periodEnd, JSON.stringify(report), JSON.stringify(report)],
  );
  return { accountId, reportType: 'account_review', periodType: period, periodStart, periodEnd, report };
}

export async function generateSocialReviewReport(accountId: number, period: ReportPeriod = '30d') {
  return generateAccountReport(accountId, { period });
}

export async function getLatestSocialReviewReport(accountId: number) {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT id, account_id, report_type, period_type, period_start, period_end, report_json, summary_json, created_at, updated_at
       FROM social_review_reports WHERE account_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1`, [accountId],
  );
  if (!row) return null;
  let summary = null;
  try { summary = JSON.parse(String(row.report_json || row.summary_json || 'null')); } catch { summary = null; }
  return { id: Number(row.id), accountId: Number(row.account_id), reportType: row.report_type, periodType: row.period_type, periodStart: row.period_start, periodEnd: row.period_end, report: summary, createdAt: row.created_at, updatedAt: row.updated_at };
}
