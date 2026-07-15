import { beijingToday } from '../../database/utils.js';
import { execute, queryAll, queryOne } from '../../database/utils.js';

export type VideoMetricSnapshotInput = {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  collects?: number | null;
};

function metric(value: number | null | undefined) {
  return Math.max(0, Number(value || 0));
}

function interactionRate(values: VideoMetricSnapshotInput) {
  const views = metric(values.views);
  return views > 0 ? (metric(values.likes) + metric(values.comments) + metric(values.shares) + metric(values.collects)) / views : 0;
}

export async function saveVideoMetricSnapshot(videoId: number, snapshotDate: string, values: VideoMetricSnapshotInput) {
  await execute(`INSERT INTO video_metric_snapshots (video_id, views, likes, comments, shares, collects, interaction_rate, snapshot_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(video_id, snapshot_date) DO UPDATE SET
      views = excluded.views, likes = excluded.likes, comments = excluded.comments,
      shares = excluded.shares, collects = excluded.collects, interaction_rate = excluded.interaction_rate`, [
    videoId, metric(values.views), metric(values.likes), metric(values.comments), metric(values.shares), metric(values.collects), interactionRate(values), snapshotDate,
  ]);
  return queryOne(`SELECT id, video_id, views, likes, comments, shares, collects, interaction_rate, snapshot_date, created_at
    FROM video_metric_snapshots WHERE video_id = ? AND snapshot_date = ?`, [videoId, snapshotDate]);
}

export async function saveCurrentVideoMetricSnapshots(accountId: number, snapshotDate = beijingToday()) {
  const videos = await queryAll<Record<string, unknown>>(
    `SELECT id, views, likes, comments, shares, collects FROM social_videos WHERE account_id = ?`, [accountId],
  );
  for (const video of videos) {
    await saveVideoMetricSnapshot(Number(video.id), snapshotDate, video);
  }
  return { snapshotDate, count: videos.length };
}
