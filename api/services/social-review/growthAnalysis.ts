import { queryAll } from '../../database/utils.js';

export function calculateGrowth(current: number | null | undefined, previous: number | null | undefined) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  return previousValue > 0 ? (currentValue - previousValue) / previousValue : 0;
}

export async function analyzeVideoGrowth(videoId: number) {
  const rows = await queryAll<Record<string, unknown>>(`SELECT snapshot_date, views, likes, comments, shares, collects
    FROM video_metric_snapshots WHERE video_id = ? ORDER BY snapshot_date DESC`, [videoId]);
  const current = rows[0] || null;
  const previous = rows[1] || null;
  return {
    videoId, current, previous,
    viewsGrowth: calculateGrowth(current?.views as number, previous?.views as number),
    likesGrowth: calculateGrowth(current?.likes as number, previous?.likes as number),
    commentsGrowth: calculateGrowth(current?.comments as number, previous?.comments as number),
    sharesGrowth: calculateGrowth(current?.shares as number, previous?.shares as number),
    growthScore: Math.max(0, Math.min(1, calculateGrowth(current?.views as number, previous?.views as number))),
  };
}

export async function analyzeAccountGrowth(accountId: number) {
  const videos = await queryAll<Record<string, unknown>>(`SELECT id, internal_video_key, external_video_id, title
    FROM social_videos WHERE account_id = ? ORDER BY id DESC`, [accountId]);
  const items = [];
  for (const video of videos) {
    const growth = await analyzeVideoGrowth(Number(video.id));
    items.push({ ...video, ...growth });
  }
  return { accountId, items, videoCount: items.length };
}
