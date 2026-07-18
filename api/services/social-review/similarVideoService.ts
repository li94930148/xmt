import { queryAll, queryOne } from '../../database/utils.js';

type Candidate = Record<string, unknown>;
const words = (value: unknown) => new Set(String(value || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []);
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((word) => b.has(word)).length;

export async function listSimilarVideos(videoId: number) {
  const target = await queryOne<Candidate>(`SELECT id, account_id, title, cover_url, publish_time, duration FROM social_videos WHERE id = ?`, [videoId]);
  if (!target) return [];
  const targetFeatures = await queryAll<Candidate>(`SELECT feature_type, feature_value FROM video_content_features WHERE video_id = ?`, [videoId]);
  const featureKeys = new Set(targetFeatures.map((row) => `${row.feature_type}:${row.feature_value}`));
  const candidates = await queryAll<Candidate>(`SELECT id, title, cover_url, publish_time, duration, views FROM social_videos WHERE account_id = ? AND id <> ? ORDER BY publish_time DESC LIMIT 100`, [target.account_id, videoId]);
  const ids = candidates.map((row) => Number(row.id));
  const features = ids.length ? await queryAll<Candidate>(`SELECT video_id, feature_type, feature_value FROM video_content_features WHERE video_id IN (${ids.map(() => '?').join(',')})`, ids) : [];
  const byVideo = new Map<number, Set<string>>();
  for (const row of features) { const set = byVideo.get(Number(row.video_id)) || new Set<string>(); set.add(`${row.feature_type}:${row.feature_value}`); byVideo.set(Number(row.video_id), set); }
  const targetWords = words(target.title);
  return candidates.map((row) => {
    const candidateFeatures = byVideo.get(Number(row.id)) || new Set<string>();
    const categoryScore = [...featureKeys].some((key) => key.startsWith('content_category:') && candidateFeatures.has(key)) ? 4 : 0;
    const keywordScore = overlap(targetWords, words(row.title)) * 2 + [...featureKeys].filter((key) => key.includes('keyword:') && candidateFeatures.has(key)).length;
    const durationScore = target.duration != null && row.duration != null && Math.abs(Number(target.duration) - Number(row.duration)) <= 30 ? 1 : 0;
    const timeScore = target.publish_time && row.publish_time && Math.abs(new Date(String(target.publish_time)).getTime() - new Date(String(row.publish_time)).getTime()) <= 30 * 86400000 ? 1 : 0;
    return { id: Number(row.id), title: row.title || null, coverUrl: row.cover_url || null, publishTime: row.publish_time || null, views: row.views ?? null, score: categoryScore + keywordScore + durationScore + timeScore };
  }).filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 10);
}
