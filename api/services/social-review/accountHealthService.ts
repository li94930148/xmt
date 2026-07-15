import { queryAll } from '../../database/utils.js';

export async function analyzeAccountHealth(accountId: number) {
  const videos = await queryAll<Record<string, unknown>>(`SELECT publish_time, views, likes, comments, shares, collects
    FROM social_videos WHERE account_id = ?`, [accountId]);
  const snapshots = await queryAll<Record<string, unknown>>(`SELECT followers, snapshot_date FROM social_snapshots
    WHERE account_id = ? ORDER BY snapshot_date DESC`, [accountId]);
  const averageViews = videos.length ? videos.reduce((sum, item) => sum + Number(item.views || 0), 0) / videos.length : 0;
  const interactionVideos = videos.filter((item) => ['likes','comments','shares','collects'].some((key) => item[key] != null));
  const averageInteractionRate = interactionVideos.length ? interactionVideos.reduce((sum, item) => {
    const views = Number(item.views || 0);
    return sum + (views ? (Number(item.likes || 0) + Number(item.comments || 0) + Number(item.shares || 0) + Number(item.collects || 0)) / views : 0);
  }, 0) / interactionVideos.length : null;
  const dates = new Set(videos.map((item) => String(item.publish_time || '').slice(0, 10)).filter(Boolean));
  const latestFollowers = Number(snapshots[0]?.followers || 0);
  const previousFollowers = Number(snapshots[1]?.followers || 0);
  const followerGrowth = previousFollowers > 0 ? (latestFollowers - previousFollowers) / previousFollowers : 0;
  const publishFrequency = dates.size ? videos.length / dates.size : 0;
  const healthScore = Math.max(0, Math.min(1, Math.min(1, publishFrequency / 7) * 0.3 + (averageInteractionRate == null ? 0 : Math.min(1, averageInteractionRate * 10) * 0.35) + Math.min(1, averageViews / 10000) * 0.35));
  return { accountId, videoCount: videos.length, publishFrequency, averageViews, averageInteractionRate, followerGrowth, healthScore };
}
