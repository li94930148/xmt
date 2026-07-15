import { queryAll } from '../../database/utils.js';

export async function analyzeVideoTrends(accountId: number) {
  const videos = await queryAll<Record<string, unknown>>(`SELECT publish_time, views, likes, comments, shares, collects FROM social_videos WHERE account_id = ?`, [accountId]);
  const byDate = new Map<string, { count: number; views: number; interaction: number }>();
  for (const video of videos) { const date = String(video.publish_time || '').slice(0, 10) || '未知日期'; const views = Number(video.views || 0); const interaction = views > 0 ? (Number(video.likes || 0) + Number(video.comments || 0) + Number(video.shares || 0) + Number(video.collects || 0)) / views : 0; const item = byDate.get(date) || { count: 0, views: 0, interaction: 0 }; item.count += 1; item.views += views; item.interaction += interaction; byDate.set(date, item); }
  const dates = [...byDate.entries()].map(([date, value]) => ({ date, ...value, averageViews: value.count ? value.views / value.count : 0, averageInteraction: value.count ? value.interaction / value.count : 0 }));
  const best = [...dates].sort((a, b) => b.averageViews - a.averageViews)[0] || null;
  const frequency = dates.reduce((sum, item) => sum + item.count, 0);
  return { videoCount: videos.length, publishFrequency: frequency, dates, bestTimeSlot: best?.date || null, highestPerformanceDate: best?.date || null, averageViews: videos.length ? videos.reduce((sum, video) => sum + Number(video.views || 0), 0) / videos.length : 0, averageInteraction: videos.length ? dates.reduce((sum, item) => sum + item.averageInteraction, 0) / dates.length : 0 };
}
