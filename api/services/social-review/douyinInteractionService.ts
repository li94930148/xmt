import type { Browser, BrowserContext } from 'playwright';
import type { NormalizedVideoSnapshot, SocialAccount } from '@shared/types/social-review';
import { decryptCredentialStorageState, getActiveCredentialByRef } from './credentials.js';
import { triggerDouyinCreatorItemList } from './adapters/douyin-playwright-v3.js';

const CONTENT_URL = 'https://creator.douyin.com/creator-micro/data-center/content';
const LIST_PATH = '/web/api/creator/item/list';
type StorageState = NonNullable<Parameters<Browser['newContext']>[0]>['storageState'];

export type DouyinInteractionMetric = { externalVideoId: string; likes?: number; comments?: number; shares?: number; collects?: number; source: 'creator_item_list_metrics' };
export type DouyinInteractionSyncResult = { metricsByExternalVideoId: Map<string, DouyinInteractionMetric>; interaction_sync_summary: { source: string; requestMode: 'fields'; received: number; matched: number; matchedItems: number; unmatched: number; likesUpdated: number; commentsUpdated: number; sharesUpdated: number; collectsUpdated: number; ignoredZero: number; pageOpened: boolean; tabClicked: boolean; requestTriggered: boolean; receivedItems: number } };

function state(value: unknown): StorageState {
  const candidate = value && typeof value === 'object' && 'storageState' in value ? (value as { storageState?: unknown }).storageState : value;
  if (!candidate || typeof candidate !== 'object') throw new Error('采集凭据无法用于互动指标同步。');
  return candidate as StorageState;
}
function metric(value: unknown) { const parsed = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN; return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null; }

export async function collectDouyinInteractionMetrics(account: SocialAccount, videos: NormalizedVideoSnapshot[]): Promise<DouyinInteractionSyncResult> {
  const targetIds = new Set(videos.map((item) => item.external_video_id).filter((id): id is string => Boolean(id)));
  const output: DouyinInteractionSyncResult = { metricsByExternalVideoId: new Map(), interaction_sync_summary: { source: 'creator_item_list_metrics', requestMode: 'fields', received: 0, matched: 0, matchedItems: 0, unmatched: 0, likesUpdated: 0, commentsUpdated: 0, sharesUpdated: 0, collectsUpdated: 0, ignoredZero: 0, pageOpened: false, tabClicked: false, requestTriggered: false, receivedItems: 0 } };
  if (account.platform !== 'douyin' || !account.credential_ref || !targetIds.size) return output;
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: process.env.SOCIAL_COLLECT_HEADLESS !== 'false' });
  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({ storageState: state(await decryptCredentialStorageState(await getActiveCredentialByRef(account.credential_ref))) });
    const page = await context.newPage();
    const captured = new Promise<import('playwright').Response | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), 12000);
      page.on('response', (response) => { if (response.request().resourceType() !== 'fetch' && response.request().resourceType() !== 'xhr') return; const url = new URL(response.url()); if (url.pathname !== LIST_PATH || !url.searchParams.has('fields') || !url.searchParams.has('start_time') || !url.searchParams.has('end_time') || !url.searchParams.has('need_cooperation') || !url.searchParams.has('need_long_article')) return; clearTimeout(timer); resolve(response); });
    });
    await page.goto(CONTENT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    output.interaction_sync_summary.pageOpened = true;
    output.interaction_sync_summary.tabClicked = await triggerDouyinCreatorItemList(page);
    const response = await captured;
    output.interaction_sync_summary.requestTriggered = Boolean(response);
    const raw = response ? await response.text() : '';
    const payload = raw ? JSON.parse(raw.replace(/("id"\s*:\s*)(\d{16,})(?=\s*[,}])/g, '$1"$2"')) as { items?: unknown[] } : {};
    const rows = Array.isArray(payload.items) ? payload.items.map((value) => { const item = value && typeof value === 'object' ? value as Record<string, unknown> : {}; const metrics = item.metrics && typeof item.metrics === 'object' ? item.metrics as Record<string, unknown> : {}; return { id: item.id == null ? null : String(item.id), likes: metrics.like_count, comments: metrics.comment_count, shares: metrics.share_count, collects: metrics.favorite_count }; }) : [];
    output.interaction_sync_summary.receivedItems = rows.length;
    output.interaction_sync_summary.received = rows.length;
    for (const row of rows) {
      if (!row.id || !targetIds.has(row.id)) { output.interaction_sync_summary.unmatched += 1; continue; }
      output.interaction_sync_summary.matched += 1;
      output.interaction_sync_summary.matchedItems += 1;
      const values = { likes: metric(row.likes), comments: metric(row.comments), shares: metric(row.shares), collects: metric(row.collects) };
      const patch: DouyinInteractionMetric = { externalVideoId: row.id, source: 'creator_item_list_metrics' };
      for (const key of ['likes', 'comments', 'shares', 'collects'] as const) {
        const value = values[key];
        if (value == null) continue;
        if (value === 0) { output.interaction_sync_summary.ignoredZero += 1; continue; }
        patch[key] = value;
        output.interaction_sync_summary[`${key}Updated` as 'likesUpdated' | 'commentsUpdated' | 'sharesUpdated' | 'collectsUpdated'] += 1;
      }
      output.metricsByExternalVideoId.set(row.id, patch);
    }
    return output;
  } finally { await context?.close().catch(() => undefined); await browser.close().catch(() => undefined); }
}

export function mergeDouyinInteractionMetrics(videos: NormalizedVideoSnapshot[], result: DouyinInteractionSyncResult) {
  return videos.map((video) => { const patch = video.external_video_id ? result.metricsByExternalVideoId.get(video.external_video_id) : null; return patch ? { ...video, likes: patch.likes ?? video.likes, comments: patch.comments ?? video.comments, shares: patch.shares ?? video.shares, collects: patch.collects ?? video.collects } : video; });
}
