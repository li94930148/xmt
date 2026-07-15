import { execute, queryAll } from '../../database/utils.js';

export type OperationSuggestion = {
  type: 'content_direction' | 'publish_strategy' | 'performance_warning' | 'growth_opportunity';
  title: string;
  content: string;
  source: 'system';
};

type FeatureStats = { feature: string; count: number; avgViews: number; avgInteractionRate: number; avgShareRate: number; avgCollectRate: number };

function number(value: unknown) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function interactionRate(row: Record<string, unknown>) { const views = number(row.views); return views > 0 ? (number(row.likes) + number(row.comments) + number(row.shares) + number(row.collects)) / views : 0; }

async function featureStats(accountId: number, featureType: string) {
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT f.feature_value, v.views, v.likes, v.comments, v.shares, v.collects
       FROM video_content_features f JOIN social_videos v ON v.id = f.video_id
      WHERE v.account_id = ? AND f.source = 'system' AND f.feature_type = ?`, [accountId, featureType],
  );
  const groups = new Map<string, { count: number; views: number; interaction: number; share: number; collect: number }>();
  for (const row of rows) {
    const feature = String(row.feature_value);
    const item = groups.get(feature) || { count: 0, views: 0, interaction: 0, share: 0, collect: 0 };
    item.count += 1; item.views += number(row.views); item.interaction += interactionRate(row); item.share += number(row.views) > 0 ? number(row.shares) / number(row.views) : 0; item.collect += number(row.views) > 0 ? number(row.collects) / number(row.views) : 0; groups.set(feature, item);
  }
  return [...groups.entries()].map(([feature, item]): FeatureStats => ({ feature, count: item.count, avgViews: item.views / item.count, avgInteractionRate: item.interaction / item.count, avgShareRate: item.share / item.count, avgCollectRate: item.collect / item.count }));
}

export async function generateAccountSuggestions(accountId: number) {
  const videos = await queryAll<Record<string, unknown>>(
    `SELECT id, publish_time, views, likes, comments, shares, collects FROM social_videos WHERE account_id = ? ORDER BY publish_time DESC, id DESC`, [accountId],
  );
  const avgViews = videos.length ? videos.reduce((sum, row) => sum + number(row.views), 0) / videos.length : 0;
  const suggestions: OperationSuggestion[] = [];
  const categories = await featureStats(accountId, 'content_category');
  for (const item of categories) if (item.count >= 3 && item.avgViews > avgViews) suggestions.push({ type: 'content_direction', title: '内容方向表现较好', content: `${item.feature}类型内容近期平均播放优于账号平均水平。`, source: 'system' });
  const averageShareRate = videos.length ? videos.reduce((sum, row) => sum + (number(row.views) > 0 ? number(row.shares) / number(row.views) : 0), 0) / videos.length : 0;
  const averageCollectRate = videos.length ? videos.reduce((sum, row) => sum + (number(row.views) > 0 ? number(row.collects) / number(row.views) : 0), 0) / videos.length : 0;
  for (const item of categories) if (item.count >= 2 && item.avgInteractionRate > 0 && item.avgInteractionRate > (videos.reduce((sum, row) => sum + interactionRate(row), 0) / Math.max(1, videos.length)) * 1.15) suggestions.push({ type: 'content_direction', title: '互动率表现较好', content: `${item.feature}类型内容的平均互动率较高，可继续测试该内容方向。`, source: 'system' });
  for (const item of categories) if (item.count >= 2 && averageShareRate > 0 && item.avgShareRate > averageShareRate * 1.15) suggestions.push({ type: 'growth_opportunity', title: '分享率表现较好', content: `${item.feature}类型内容的分享率较高，适合继续验证传播性选题。`, source: 'system' });
  for (const item of categories) if (item.count >= 2 && averageCollectRate > 0 && item.avgCollectRate > averageCollectRate * 1.15) suggestions.push({ type: 'growth_opportunity', title: '收藏率表现较好', content: `${item.feature}类型内容的收藏率较高，可继续测试实用性内容表达。`, source: 'system' });
  const buckets = await featureStats(accountId, 'publish_time_bucket');
  for (const item of buckets) if (item.count >= 2 && item.avgViews > avgViews * 1.2) suggestions.push({ type: 'publish_strategy', title: '发布时间表现较好', content: `${item.feature}发布的作品平均播放明显高于其他时段。`, source: 'system' });
  const durations = await featureStats(accountId, 'duration_level');
  for (const item of durations) if (item.count >= 2 && (item.avgViews > avgViews * 1.1 || item.avgInteractionRate > 0 && item.avgInteractionRate > (videos.reduce((sum, row) => sum + interactionRate(row), 0) / Math.max(1, videos.length)) * 1.1)) suggestions.push({ type: 'growth_opportunity', title: '视频长度存在机会', content: `${item.feature}长度作品的播放或互动表现较好，可继续测试该长度范围。`, source: 'system' });
  const recent = videos.slice(0, 3);
  if (recent.length === 3 && avgViews > 0 && recent.every((row) => number(row.views) < avgViews * 0.7)) suggestions.push({ type: 'performance_warning', title: '近期作品播放偏低', content: '最近三条作品播放均低于账号平均水平，建议优先复盘选题与发布时间。', source: 'system' });

  await execute(`DELETE FROM social_operation_suggestions WHERE account_id = ? AND source = 'system'`, [accountId]);
  for (const item of suggestions) await execute(
    `INSERT INTO social_operation_suggestions (account_id, type, title, content, source, created_at)
     VALUES (?, ?, ?, ?, 'system', datetime('now', '+8 hours')) ON CONFLICT(account_id, type, title, content) DO NOTHING`,
    [accountId, item.type, item.title, item.content],
  );
  return suggestions;
}

export async function listAccountSuggestions(accountId: number) {
  return queryAll<Record<string, unknown>>(
    `SELECT id, type, title, content, source, created_at AS createdAt
       FROM social_operation_suggestions WHERE account_id = ? AND source = 'system' ORDER BY id DESC`, [accountId],
  );
}
