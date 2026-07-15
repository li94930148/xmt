import { execute, queryAll, queryOne } from '../../database/utils.js';
import { syncVideoContentCategory } from './contentCategoryService.js';

type Feature = { featureType: string; featureValue: string };

const KEYWORDS = ['泰山', '山东', '旅游', '历史', '文化', '城市', '家乡', '景点', '人物'];

function text(value: unknown) { return typeof value === 'string' ? value.trim() : ''; }

function durationLevel(value: unknown) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return 'short';
  if (seconds <= 300) return 'medium';
  return 'long';
}

function publishTimeBucket(value: unknown) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return null;
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return '上午';
  if (hour >= 12 && hour < 18) return '下午';
  if (hour >= 18 && hour < 24) return '晚上';
  return '凌晨';
}

function featuresFromVideo(video: Record<string, unknown>, category: string | null): Feature[] {
  const title = text(video.title);
  const features: Feature[] = [];
  for (const keyword of KEYWORDS) if (title.includes(keyword)) features.push({ featureType: 'title_keyword', featureValue: keyword });
  for (const match of title.matchAll(/#([^#\s]+)/g)) {
    const hashtag = match[1].trim().replace(/[，。！!?]/g, '');
    if (hashtag) features.push({ featureType: 'hashtag_keyword', featureValue: hashtag });
  }
  if (category && category !== '其他') features.push({ featureType: 'content_category', featureValue: category });
  const duration = durationLevel(video.duration);
  if (duration) features.push({ featureType: 'duration_level', featureValue: duration });
  const bucket = publishTimeBucket(video.publish_time);
  if (bucket) features.push({ featureType: 'publish_time_bucket', featureValue: bucket });
  return features.filter((feature, index, all) => all.findIndex((item) => item.featureType === feature.featureType && item.featureValue === feature.featureValue) === index);
}

export async function refreshVideoContentFeatures(videoId: number) {
  const video = await queryOne<Record<string, unknown>>(`SELECT id, title, duration, publish_time FROM social_videos WHERE id = ?`, [videoId]);
  if (!video) return [];
  const category = await syncVideoContentCategory(videoId, text(video.title));
  const features = featuresFromVideo(video, category);
  await execute(`DELETE FROM video_content_features WHERE video_id = ? AND source = 'system'`, [videoId]);
  for (const feature of features) await execute(
    `INSERT INTO video_content_features (video_id, feature_type, feature_value, source, created_at)
     VALUES (?, ?, ?, 'system', datetime('now', '+8 hours')) ON CONFLICT(video_id, feature_type, feature_value) DO NOTHING`,
    [videoId, feature.featureType, feature.featureValue],
  );
  return features;
}

export async function refreshAccountVideoContentFeatures(accountId: number) {
  const rows = await queryAll<Record<string, unknown>>(`SELECT id FROM social_videos WHERE account_id = ?`, [accountId]);
  let count = 0;
  for (const row of rows) count += (await refreshVideoContentFeatures(Number(row.id))).length;
  return { videoCount: rows.length, featureCount: count };
}

export async function listVideoContentFeatures(videoId: number) {
  return queryAll<Record<string, unknown>>(
    `SELECT id, feature_type AS featureType, feature_value AS featureValue, source, created_at AS createdAt
       FROM video_content_features WHERE video_id = ? ORDER BY feature_type, feature_value`, [videoId],
  );
}
