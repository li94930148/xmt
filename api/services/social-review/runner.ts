import type { NormalizedAccountSnapshot, NormalizedVideoSnapshot, SocialAccount } from '@shared/types/social-review';
import { createHash } from 'node:crypto';
import { execute, executeInsert, queryAll, queryOne } from '../../database/utils.js';
import { sanitizeErrorMessage } from './credentialCrypto.js';
import { getSocialFetchAdapter } from './adapters/index.js';
import type { SocialCollectOptions } from './adapters/base.js';
import { saveCurrentVideoMetricSnapshots } from './videoMetricSnapshotService.js';
import { classifyIngestionFailure, type IngestionFailureType } from './ingestionFailure.js';
import { credentialHealthCheck, markCredentialExpired } from './credentials.js';
import { listVideoPerformance } from './videoAnalysis.js';
import { analyzeAccountHealth } from './accountHealthService.js';
import { refreshIngestionHealth } from './ingestionHealthService.js';
import { syncVideoContentCategory } from './contentCategoryService.js';
import { refreshAccountVideoInsights } from './videoLifecycleAnalysis.js';
import { refreshAccountVideoContentFeatures } from './videoContentFeatureService.js';
import { analyzeContentPerformance } from './contentPerformanceAnalysis.js';
import { generateAccountReport } from './reportGenerationService.js';
import { generateAccountSuggestions } from './operationSuggestionService.js';
import { collectDouyinPerformanceMetrics, mergeDouyinPerformanceMetrics, type DouyinPerformanceSyncResult } from './douyinPerformanceService.js';
import { collectDouyinInteractionMetrics, mergeDouyinInteractionMetrics } from './douyinInteractionService.js';
import type { SocialCollectDiagnostic } from './adapters/base.js';

type DbAccountRow = Record<string, unknown>;

function toBoolean(value: unknown) {
  return Number(value) === 1 || value === true;
}

function toAccount(row: DbAccountRow): SocialAccount {
  return {
    id: Number(row.id),
    platform: String(row.platform) as SocialAccount['platform'],
    external_account_id: row.external_account_id ? String(row.external_account_id) : null,
    account_name: String(row.account_name || ''),
    display_name: row.display_name ? String(row.display_name) : null,
    profile_url: row.profile_url ? String(row.profile_url) : null,
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    owner_id: row.owner_id == null ? null : Number(row.owner_id),
    active: toBoolean(row.active),
    fetch_strategy: String(row.fetch_strategy || 'manual') as SocialAccount['fetch_strategy'],
    cookie_ref: row.cookie_ref ? String(row.cookie_ref) : null,
    credential_ref: row.credential_ref ? String(row.credential_ref) : null,
    remark: row.remark ? String(row.remark) : null,
    last_fetched_at: row.last_fetched_at ? String(row.last_fetched_at) : null,
    created_at: String(row.created_at || ''),
    updated_at: String(row.updated_at || ''),
  };
}

function toJson(value: unknown) {
  if (value == null) return null;
  return JSON.stringify(value);
}

function metricForWrite(incoming: unknown, existing: unknown) {
  const incomingNumber = Number(incoming);
  const existingNumber = Number(existing);
  const hasIncoming = incoming !== null && incoming !== undefined && Number.isFinite(incomingNumber) && incomingNumber >= 0;
  const hasExisting = existing !== null && existing !== undefined && Number.isFinite(existingNumber) && existingNumber >= 0;
  if (hasIncoming && incomingNumber > 0) return Math.round(incomingNumber);
  if (hasExisting) return Math.round(existingNumber);
  return hasIncoming ? Math.round(incomingNumber) : null;
}

function performanceDiagnostics(result: DouyinPerformanceSyncResult): SocialCollectDiagnostic[] {
  const at = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
  return [
    { type: 'performance_api_called', message: '已调用作品性能指标接口。', count: result.apiCalled ? 1 : 0, at, safePathname: '/janus/douyin/creator/data/item_analysis/item_performance' },
    { type: 'performance_item_count', message: '作品性能接口返回作品数量。', count: result.itemCount, at },
    { type: 'performance_metric_received', message: '已接收作品性能指标数量。', count: result.metricReceivedCount, at },
    { type: 'performance_update_count', message: '待更新作品性能指标数量。', count: result.updateCount, at },
    { type: 'performance_missing_item_count', message: '未匹配到性能指标的作品数量。', count: result.missingItemCount, at },
  ];
}

function appendPerformanceSummary(snapshot: NormalizedAccountSnapshot, performance: DouyinPerformanceSyncResult) {
  const base = snapshot.raw_json && typeof snapshot.raw_json === 'object' && !Array.isArray(snapshot.raw_json)
    ? snapshot.raw_json as Record<string, unknown>
    : {};
  return {
    ...snapshot,
    raw_json: {
      ...base,
      performanceSummary: {
        apiCalled: performance.apiCalled,
        itemCount: performance.itemCount,
        metricReceivedCount: performance.metricReceivedCount,
        updateCount: performance.updateCount,
        missingItemCount: performance.missingItemCount,
        ignoredZeroValues: performance.ignoredZeroValues,
        metrics: performance.metrics,
        sources: performance.sources,
      },
    },
  };
}

export async function getSocialAccount(accountId: number) {
  const row = await queryOne<DbAccountRow>(
    `SELECT id, platform, external_account_id, account_name, display_name, profile_url, avatar_url,
            owner_id, active, fetch_strategy, cookie_ref, credential_ref, remark, last_fetched_at,
            created_at, updated_at
       FROM social_accounts
      WHERE id = ?`,
    [accountId],
  );
  return row ? toAccount(row) : null;
}

export async function createIngestionJob(account: SocialAccount, status = 'running', triggerSource: 'manual' | 'scheduled' = 'manual', retryCount = 0) {
  const jobId = await executeInsert(
    `INSERT INTO social_ingestion_jobs
      (account_id, platform, strategy, status, trigger_source, retry_count, started_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
    [account.id, account.platform, account.fetch_strategy, status, triggerSource, retryCount],
  );
  return getIngestionJob(jobId);
}

export async function getIngestionJob(jobId: number) {
  return queryOne<Record<string, unknown>>(
    `SELECT id, account_id, platform, strategy, status, trigger_source, retry_count, failure_type, last_error,
            started_at, finished_at, created_at, updated_at
       FROM social_ingestion_jobs
      WHERE id = ?`,
    [jobId],
  );
}

async function updateJobSuccess(jobId: number) {
  await execute(
    `UPDATE social_ingestion_jobs
        SET status = 'success',
            last_error = NULL,
            finished_at = datetime('now', '+8 hours'),
            updated_at = datetime('now', '+8 hours')
      WHERE id = ?`,
    [jobId],
  );
  const job = await getIngestionJob(jobId);
  if (job?.account_id != null) await refreshIngestionHealth(Number(job.account_id));
}

async function updateJobFailed(jobId: number, errorMessage: string, failureType: IngestionFailureType) {
  await execute(
    `UPDATE social_ingestion_jobs
        SET status = 'failed',
            last_error = ?,
            failure_type = ?,
            finished_at = datetime('now', '+8 hours'),
            updated_at = datetime('now', '+8 hours')
      WHERE id = ?`,
    [errorMessage, failureType, jobId],
  );
  const job = await getIngestionJob(jobId);
  if (job?.account_id != null) await refreshIngestionHealth(Number(job.account_id));
}

export async function saveSocialSnapshot(
  account: SocialAccount,
  snapshot: NormalizedAccountSnapshot,
  videos: NormalizedVideoSnapshot[],
) {
  await execute(
    `INSERT INTO social_snapshots
      (account_id, platform, snapshot_date, followers, following_count, likes_total, video_count,
       works_count, engagement_est, source_method, source_project, raw_json, fetched_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
     ON CONFLICT(account_id, snapshot_date) DO UPDATE SET
       followers = excluded.followers,
       following_count = excluded.following_count,
       likes_total = excluded.likes_total,
       video_count = excluded.video_count,
       works_count = excluded.works_count,
       engagement_est = excluded.engagement_est,
       source_method = excluded.source_method,
       source_project = excluded.source_project,
       raw_json = excluded.raw_json,
       fetched_at = excluded.fetched_at`,
    [
      account.id,
      account.platform,
      snapshot.snapshot_date,
      snapshot.followers ?? null,
      snapshot.following_count ?? null,
      snapshot.likes_total ?? null,
      snapshot.video_count ?? null,
      snapshot.works_count ?? null,
      snapshot.engagement_est ?? null,
      snapshot.source_method ?? null,
      snapshot.source_project ?? null,
      toJson(snapshot.raw_json),
      snapshot.fetched_at ?? new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }),
    ],
  );

  const saved = await queryOne<Record<string, unknown>>(
    `SELECT id, account_id, platform, snapshot_date, followers, following_count, likes_total,
            video_count, works_count, engagement_est, source_method, source_project, fetched_at, created_at
       FROM social_snapshots
      WHERE account_id = ? AND snapshot_date = ?
      LIMIT 1`,
    [account.id, snapshot.snapshot_date],
  );
  const snapshotId = Number(saved?.id || 0);
  let insertCount = 0;
  let updateCount = 0;

  for (const video of videos) {
    const internalVideoKey = video.internal_video_key || (video.external_video_id
      ? `${account.platform}:${account.id}:${video.external_video_id}`
      : `${account.platform}:${account.id}:fallback:${createHash('sha256').update(`${account.platform}|${account.id}|${String(video.title || '').trim().replace(/\s+/g, ' ').toLowerCase()}|${String(video.publish_time || '').slice(0, 10)}`).digest('hex').slice(0, 24)}`);
    let existing = video.external_video_id
      ? await queryOne<Record<string, unknown>>('SELECT id, likes, comments, shares, collects, views FROM social_videos WHERE platform = ? AND account_id = ? AND external_video_id = ? LIMIT 1', [account.platform, account.id, video.external_video_id])
      : await queryOne<Record<string, unknown>>('SELECT id, likes, comments, shares, collects, views FROM social_videos WHERE platform = ? AND account_id = ? AND internal_video_key = ? LIMIT 1', [account.platform, account.id, internalVideoKey]);
    if (!existing?.id && video.external_video_id && video.title && video.publish_time) {
      existing = await queryOne<Record<string, unknown>>(
        `SELECT id, likes, comments, shares, collects, views
           FROM social_videos
          WHERE platform = ? AND account_id = ? AND title = ? AND publish_time = ?
          LIMIT 1`,
        [account.platform, account.id, video.title, video.publish_time],
      );
    }
    if (existing?.id) {
      updateCount += 1;
      await execute(`UPDATE social_videos SET snapshot_id = ?, internal_video_key = ?, external_video_id = ?, title = ?, video_url = ?, cover_url = ?, publish_time = ?, likes = ?, comments = ?, shares = ?, collects = ?, views = ?, duration = ?, status = ?, visibility = ?, source_type = ?, raw_json = ? WHERE id = ?`, [snapshotId, internalVideoKey, video.external_video_id ?? null, video.title ?? null, video.video_url ?? null, video.cover_url ?? null, video.publish_time ?? null, metricForWrite(video.likes, existing.likes), metricForWrite(video.comments, existing.comments), metricForWrite(video.shares, existing.shares), metricForWrite(video.collects, existing.collects), metricForWrite(video.views, existing.views), video.duration ?? null, video.status ?? null, video.visibility ?? null, video.source_type ?? 'social_review', toJson(video.raw_json), existing.id]);
      if (video.title) await syncVideoContentCategory(Number(existing.id), video.title);
    } else {
      insertCount += 1;
      await execute(`INSERT INTO social_videos (account_id, snapshot_id, platform, internal_video_key, external_video_id, title, video_url, cover_url, publish_time, likes, comments, shares, collects, views, duration, status, visibility, source_type, raw_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))`, [account.id, snapshotId, account.platform, internalVideoKey, video.external_video_id ?? null, video.title ?? null, video.video_url ?? null, video.cover_url ?? null, video.publish_time ?? null, metricForWrite(video.likes, null), metricForWrite(video.comments, null), metricForWrite(video.shares, null), metricForWrite(video.collects, null), metricForWrite(video.views, null), video.duration ?? null, video.status ?? null, video.visibility ?? null, video.source_type ?? 'social_review', toJson(video.raw_json)]);
      const inserted = await queryOne<Record<string, unknown>>('SELECT id FROM social_videos WHERE platform = ? AND account_id = ? AND internal_video_key = ? LIMIT 1', [account.platform, account.id, internalVideoKey]);
      if (inserted?.id && video.title) await syncVideoContentCategory(Number(inserted.id), video.title);
    }
  }

  await execute(
    `UPDATE social_accounts
        SET last_fetched_at = ?, updated_at = datetime('now', '+8 hours')
      WHERE id = ?`,
    [snapshot.fetched_at ?? new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }), account.id],
  );
  await saveCurrentVideoMetricSnapshots(account.id, snapshot.snapshot_date);
  await refreshAccountVideoInsights(account.id);
  await refreshAccountVideoContentFeatures(account.id);
  await analyzeContentPerformance(account.id, true);
  await generateAccountReport(account.id, { period: '30d' });
  await generateAccountSuggestions(account.id);
  await listVideoPerformance(account.id);
  await analyzeAccountHealth(account.id);

  return { ...saved, insertCount, updateCount };
}

export async function runSocialCollection(accountId: number, options: SocialCollectOptions = {}, triggerSource: 'manual' | 'scheduled' = 'manual', retryCount = 0) {
  if (accountId !== 2) {
    throw new Error('本阶段仅允许显式采集账号 ID 2。');
  }

  const account = await getSocialAccount(accountId);
  if (!account) {
    throw new Error('账号不存在。');
  }
  if (!account.active) {
    throw new Error('账号未启用。');
  }
  const credentialHealth = await credentialHealthCheck(accountId);
  if (credentialHealth.status !== 'active') {
    const job = await createIngestionJob(account, 'running', triggerSource, retryCount);
    await updateJobFailed(Number(job?.id || 0), credentialHealth.reason || '账号登录已失效，请重新登录', 'credential_expired');
    return { job: await getIngestionJob(Number(job?.id || 0)), account, snapshot: null, videoCount: 0, insertCount: 0, updateCount: 0, diagnostics: [{ type: 'credential_health' as SocialCollectDiagnostic['type'], message: credentialHealth.reason || '账号登录状态不可用', count: 0, at: new Date().toISOString() }], errorMessage: 'credential_expired' };
  }

  const job = await createIngestionJob(account, 'running', triggerSource, retryCount);
  const jobId = Number(job?.id || 0);

  try {
    const result = await getSocialFetchAdapter(account).collect(account, options);
    const usePerformanceApi = account.platform === 'douyin' && options.collectMode === 'creator-item-api';
    const performance = usePerformanceApi ? await collectDouyinPerformanceMetrics(account, result.videos) : null;
    const interactions = usePerformanceApi ? await collectDouyinInteractionMetrics(account, result.videos) : null;
    const videos = interactions ? mergeDouyinInteractionMetrics(performance ? mergeDouyinPerformanceMetrics(result.videos, performance) : result.videos, interactions) : performance ? mergeDouyinPerformanceMetrics(result.videos, performance) : result.videos;
    const snapshot = await saveSocialSnapshot(account, performance ? appendPerformanceSummary(result.accountSnapshot, performance) : result.accountSnapshot, videos);
    await updateJobSuccess(jobId);
    return {
      job: await getIngestionJob(jobId),
      account,
      snapshot,
      videoCount: videos.length,
      insertCount: Number(snapshot.insertCount || 0),
      updateCount: Number(snapshot.updateCount || 0),
      diagnostics: [...(result.diagnostics || []), ...(performance ? performanceDiagnostics(performance) : []), ...(interactions ? [{ type: 'interaction_sync_summary' as SocialCollectDiagnostic['type'], message: '作品互动指标同步摘要。', count: interactions.interaction_sync_summary.matched, at: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }), safePathname: '/web/api/creator/item/list', interactionSyncSummary: interactions.interaction_sync_summary } as SocialCollectDiagnostic] : [])],
    };
  } catch (error) {
    const safeMessage = sanitizeErrorMessage(error);
    const failureType = classifyIngestionFailure(error);
    if (failureType === 'credential_expired' && account.credential_ref) {
      await markCredentialExpired(account.credential_ref, '登录凭据已失效，请重新扫码登录。');
    }
    await updateJobFailed(jobId, safeMessage, failureType);
    return {
      job: await getIngestionJob(jobId),
      account,
      snapshot: null,
      videoCount: 0,
      insertCount: 0,
      updateCount: 0,
      diagnostics: [],
      errorMessage: safeMessage,
    };
  }
}

export async function listSocialAccounts(limit = 50) {
  const rows = await queryAll<DbAccountRow>(
    `SELECT id, platform, external_account_id, account_name, display_name, profile_url, avatar_url,
            owner_id, active, fetch_strategy, cookie_ref, credential_ref, remark, last_fetched_at,
            created_at, updated_at
       FROM social_accounts
      ORDER BY id DESC
      LIMIT ?`,
    [limit],
  );
  return rows.map(toAccount);
}
