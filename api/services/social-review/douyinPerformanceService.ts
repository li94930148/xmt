import type { Browser, BrowserContext } from 'playwright';
import type { NormalizedVideoSnapshot, SocialAccount } from '@shared/types/social-review';
import { decryptCredentialStorageState, getActiveCredentialByRef } from './credentials.js';
import { execute, queryOne } from '../../database/utils.js';

const CONTENT_URL = 'https://creator.douyin.com/creator-micro/data-center/content';
const OPERATION_URL = 'https://creator.douyin.com/creator-micro/data-center/operation';
const PERFORMANCE_PATH = '/janus/douyin/creator/data/item_analysis/item_performance';
const HOT_VIDEO_PATH = '/dp/douyin/v1/creator/item/hot_video';
const TIMEOUT = 30000;
type StorageState = NonNullable<Parameters<Browser['newContext']>[0]>['storageState'];

export interface VideoPerformanceMetrics {
  externalVideoId: string;
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  collects?: number;
  averagePlayDuration?: number;
  completionRate?: number;
  bounceRate?: number;
  source: string;
}

type SourceSummary = { endpoint: 'item_performance' | 'hot_video'; status: 'success' | 'failed'; receivedCount: number; matchedCount: number; updatedCount: number };
export type DouyinPerformanceSyncResult = {
  metricsByExternalVideoId: Map<string, VideoPerformanceMetrics>;
  apiCalled: boolean;
  itemCount: number;
  metricReceivedCount: number;
  updateCount: number;
  missingItemCount: number;
  ignoredZeroValues: number;
  sources: SourceSummary[];
  metrics: { viewsUpdated: number; likesUpdated: number; commentsUpdated: number; sharesUpdated: number; collectsUpdated: number };
};

function state(value: unknown): StorageState {
  const candidate = value && typeof value === 'object' && 'storageState' in value ? (value as { storageState?: unknown }).storageState : value;
  if (!candidate || typeof candidate !== 'object') throw new Error('采集凭据无法用于性能同步。');
  return candidate as StorageState;
}
function metric(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.trim().replace(/,/g, ''))) return null;
  const parsed = Number(value.trim().replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}
function empty(): DouyinPerformanceSyncResult {
  return { metricsByExternalVideoId: new Map(), apiCalled: false, itemCount: 0, metricReceivedCount: 0, updateCount: 0, missingItemCount: 0, ignoredZeroValues: 0, sources: [], metrics: { viewsUpdated: 0, likesUpdated: 0, commentsUpdated: 0, sharesUpdated: 0, collectsUpdated: 0 } };
}
function merge(target: Map<string, VideoPerformanceMetrics>, id: string, patch: Omit<VideoPerformanceMetrics, 'externalVideoId'>, stats: DouyinPerformanceSyncResult) {
  const current = target.get(id) || { externalVideoId: id, source: patch.source };
  for (const key of ['views', 'likes', 'comments', 'shares', 'collects'] as const) {
    const value = patch[key];
    if (value == null) continue;
    if (value === 0) { stats.ignoredZeroValues += 1; continue; }
    current[key] = value;
  }
  for (const key of ['averagePlayDuration', 'completionRate', 'bounceRate'] as const) if (patch[key] != null) current[key] = patch[key];
  current.source = current.source === patch.source ? current.source : `${current.source},${patch.source}`;
  target.set(id, current);
}

export async function collectDouyinPerformanceMetrics(account: SocialAccount, videos: NormalizedVideoSnapshot[]): Promise<DouyinPerformanceSyncResult> {
  const result = empty();
  const targetIds = new Set(videos.map((video) => video.external_video_id).filter((id): id is string => Boolean(id)));
  if (account.platform !== 'douyin' || !account.credential_ref || !targetIds.size) return result;
  const credential = await getActiveCredentialByRef(account.credential_ref);
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: process.env.SOCIAL_COLLECT_HEADLESS !== 'false' });
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({ storageState: state(await decryptCredentialStorageState(credential)) });
    const page = await context.newPage();
    for (const source of [{ endpoint: 'item_performance', path: PERFORMANCE_PATH, url: CONTENT_URL }, { endpoint: 'hot_video', path: HOT_VIDEO_PATH, url: OPERATION_URL }] as const) {
      try {
        const pending = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === source.path, { timeout: TIMEOUT });
        await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
        const response = await pending;
        if (!response.ok()) throw new Error('性能接口请求失败。');
        const payload = await response.json() as Record<string, unknown>;
        const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.data) ? payload.data : [];
        let matched = 0;
        for (const row of items) {
          const item = row && typeof row === 'object' ? row as Record<string, unknown> : {};
          const id = source.endpoint === 'item_performance' ? (item.item_id == null ? '' : String(item.item_id)) : (item.ItemId == null ? '' : String(item.ItemId));
          if (!id || !targetIds.has(id)) continue;
          matched += 1;
          const socialVideo = await queryOne<Record<string, unknown>>('SELECT id FROM social_videos WHERE platform = ? AND account_id = ? AND external_video_id = ? LIMIT 1', ['douyin', account.id, id]);
          if (socialVideo?.id) await execute(`INSERT INTO video_identity_mappings (platform, account_id, source_type, source_video_id, social_video_id, confidence, updated_at) VALUES (?, ?, ?, ?, ?, 'high', datetime('now', '+8 hours')) ON CONFLICT(platform, account_id, source_type, source_video_id) DO UPDATE SET social_video_id = excluded.social_video_id, confidence = excluded.confidence, updated_at = excluded.updated_at`, ['douyin', account.id, source.endpoint, id, Number(socialVideo.id)]);
          if (source.endpoint === 'item_performance') merge(result.metricsByExternalVideoId, id, { source: source.endpoint, views: metric(item.play_count) ?? undefined, averagePlayDuration: metric(item.average_play_duration) ?? undefined, completionRate: metric(item.completion_rate_5s) ?? undefined, bounceRate: metric(item.bounce_rate_2s) ?? undefined }, result);
          else merge(result.metricsByExternalVideoId, id, { source: source.endpoint, views: metric(item.PlayCount) ?? undefined, likes: metric(item.LikeCount) ?? undefined, comments: metric(item.CommentCount) ?? undefined, shares: metric(item.ShareCount) ?? undefined }, result);
        }
        result.sources.push({ endpoint: source.endpoint, status: 'success', receivedCount: items.length, matchedCount: matched, updatedCount: 0 });
        await execute('INSERT INTO video_identity_mapping_diagnostics (source, source_id_type, matched_field, matched_count, unmatched_count) VALUES (?, ?, ?, ?, ?)', [source.endpoint, source.endpoint === 'hot_video' ? 'ItemId' : 'item_id', 'external_video_id', matched, Math.max(0, items.length - matched)]);
      } catch {
        result.sources.push({ endpoint: source.endpoint, status: 'failed', receivedCount: 0, matchedCount: 0, updatedCount: 0 });
      }
    }
    result.apiCalled = result.sources.some((source) => source.status === 'success');
    result.itemCount = result.sources.reduce((total, source) => total + source.receivedCount, 0);
    result.metricReceivedCount = result.metricsByExternalVideoId.size;
    result.updateCount = result.metricsByExternalVideoId.size;
    result.missingItemCount = Math.max(0, targetIds.size - new Set([...result.metricsByExternalVideoId.keys()]).size);
    for (const value of result.metricsByExternalVideoId.values()) {
      if (value.views != null) result.metrics.viewsUpdated += 1;
      if (value.likes != null) result.metrics.likesUpdated += 1;
      if (value.comments != null) result.metrics.commentsUpdated += 1;
      if (value.shares != null) result.metrics.sharesUpdated += 1;
      if (value.collects != null) result.metrics.collectsUpdated += 1;
    }
    for (const source of result.sources) source.updatedCount = source.endpoint === 'item_performance' ? result.metrics.viewsUpdated : result.metrics.likesUpdated + result.metrics.commentsUpdated + result.metrics.sharesUpdated + result.metrics.collectsUpdated;
    return result;
  } finally { await context?.close().catch(() => undefined); await browser.close().catch(() => undefined); }
}

export function mergeDouyinPerformanceMetrics(videos: NormalizedVideoSnapshot[], performance: DouyinPerformanceSyncResult) {
  return videos.map((video) => {
    const value = video.external_video_id ? performance.metricsByExternalVideoId.get(video.external_video_id) : undefined;
    return value ? { ...video, views: value.views ?? video.views, likes: value.likes ?? video.likes, comments: value.comments ?? video.comments, shares: value.shares ?? video.shares, collects: value.collects ?? video.collects } : video;
  });
}
