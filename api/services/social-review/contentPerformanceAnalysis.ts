import { execute, queryAll } from '../../database/utils.js';

type FeaturePerformance = {
  featureType: string;
  feature: string;
  avgViews: number;
  avgInteractionRate: number;
  avgShares: number;
  count: number;
  videoIds: number[];
};

function number(value: unknown) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

export async function analyzeContentPerformance(accountId: number, syncInsights = false) {
  const videos = await queryAll<Record<string, unknown>>(
    `SELECT id, views, likes, comments, shares, collects FROM social_videos WHERE account_id = ?`, [accountId],
  );
  const averageViews = videos.length ? videos.reduce((sum, item) => sum + number(item.views), 0) / videos.length : 0;
  const interactionRate = (item: Record<string, unknown>) => number(item.views) > 0
    ? (number(item.likes) + number(item.comments) + number(item.shares) + number(item.collects)) / number(item.views) : 0;
  const averageInteractionRate = videos.length ? videos.reduce((sum, item) => sum + interactionRate(item), 0) / videos.length : 0;
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT f.feature_type, f.feature_value, v.id AS video_id, v.views, v.likes, v.comments, v.shares, v.collects
       FROM video_content_features f JOIN social_videos v ON v.id = f.video_id
      WHERE v.account_id = ? AND f.source = 'system'`, [accountId],
  );
  const grouped = new Map<string, FeaturePerformance>();
  for (const row of rows) {
    const featureType = String(row.feature_type);
    const feature = String(row.feature_value);
    const key = `${featureType}:${feature}`;
    const current = grouped.get(key) || { featureType, feature, avgViews: 0, avgInteractionRate: 0, avgShares: 0, count: 0, videoIds: [] };
    current.count += 1;
    current.avgViews += number(row.views);
    current.avgInteractionRate += interactionRate(row);
    current.avgShares += number(row.shares);
    current.videoIds.push(Number(row.video_id));
    grouped.set(key, current);
  }
  const allFeatures = [...grouped.values()].map((item) => ({
    ...item,
    avgViews: item.count ? item.avgViews / item.count : 0,
    avgInteractionRate: item.count ? item.avgInteractionRate / item.count : 0,
    avgShares: item.count ? item.avgShares / item.count : 0,
  }));
  const highPerformanceFeatures = allFeatures
    .filter((item) => item.count >= 2 && (item.avgViews > averageViews * 1.1 || item.avgInteractionRate > averageInteractionRate * 1.1))
    .sort((a, b) => (b.avgViews / Math.max(1, averageViews)) + (b.avgInteractionRate / Math.max(0.0001, averageInteractionRate)) - ((a.avgViews / Math.max(1, averageViews)) + (a.avgInteractionRate / Math.max(0.0001, averageInteractionRate))))
    .slice(0, 20);
  if (syncInsights) {
    for (const feature of highPerformanceFeatures) {
      const content = feature.avgViews > averageViews * 1.1
        ? `${feature.feature}类内容平均播放高于账号平均水平。`
        : `包含${feature.feature}特征的视频互动率较高。`;
      const representativeVideoId = feature.videoIds[0];
      await execute(
        `INSERT INTO video_insights (video_id, type, content, source, created_at) VALUES (?, 'content_pattern', ?, 'system', datetime('now', '+8 hours'))
         ON CONFLICT(video_id, type, source) DO UPDATE SET content = excluded.content, created_at = excluded.created_at`,
        [representativeVideoId, content],
      );
    }
  }
  return {
    accountId,
    averageViews,
    averageInteractionRate,
    highPerformanceFeatures: highPerformanceFeatures.map(({ videoIds, ...item }) => item),
  };
}
