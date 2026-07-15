import express, { type NextFunction, type Request, type Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { execute, executeInsert, queryAll, queryOne } from '../database/utils.js';
import { getCredentialSummaryByAccountId } from '../services/social-review/credentials.js';
import { collectDouyinPerformanceMetrics } from '../services/social-review/douyinPerformanceService.js';
import {
  createIngestionJob,
  getIngestionJob,
  getSocialAccount,
  listSocialAccounts,
  runSocialCollection,
} from '../services/social-review/runner.js';
import { listHotVideos, listVideoPerformance, type VideoPerformance } from '../services/social-review/videoAnalysis.js';
import { analyzeVideoTrends } from '../services/social-review/videoTrendAnalysis.js';
import { analyzeAccountGrowth } from '../services/social-review/growthAnalysis.js';
import { analyzeAccountHealth } from '../services/social-review/accountHealthService.js';
import { createDailySchedule, listScheduledJobs, runScheduledJob, updateScheduleEnabled } from '../services/social-review/socialIngestionScheduler.js';
import { refreshIngestionHealth } from '../services/social-review/ingestionHealthService.js';
import { inspectSocialDataQuality } from '../services/social-review/socialDataQualityService.js';
import { getDailySummary, listSocialAccountsOverview } from '../services/social-review/operationsService.js';
import { syncLatestOfficialExport } from '../services/social-review/socialExportSyncService.js';
import { getVideoLifecycle, listVideoInsights, refreshVideoInsights } from '../services/social-review/videoLifecycleAnalysis.js';
import { refreshAccountVideoContentFeatures, listVideoContentFeatures } from '../services/social-review/videoContentFeatureService.js';
import { analyzeContentPerformance } from '../services/social-review/contentPerformanceAnalysis.js';
import { generateAccountReport, getLatestSocialReviewReport, type ReportPeriod } from '../services/social-review/reportGenerationService.js';
import { generateAccountSuggestions, listAccountSuggestions } from '../services/social-review/operationSuggestionService.js';

const router = express.Router();

router.use(authenticate);

function sendData(res: Response, data: unknown) {
  res.json({ success: true, data });
}

function handleError(error: unknown, res: Response) {
  const message = error instanceof Error ? error.message : '服务暂时不可用，请稍后重试。';
  const status = /不存在/.test(message) ? 404 : /仅允许|权限|未启用/.test(message) ? 400 : 500;
  const normalizedStatus = /未启用|仅管理员|请选择|仅支持|账号/.test(message) ? 400 : status;
  res.status(normalizedStatus).json({ success: false, message });
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'admin') return next();
  return res.status(403).json({ success: false, message: '仅管理员可管理采集计划。' });
}

function accountDto(account: Record<string, unknown>) {
  return {
    id: Number(account.id),
    platform: String(account.platform || ''),
    externalAccountId: account.external_account_id || null,
    accountName: String(account.account_name || ''),
    displayName: account.display_name || null,
    profileUrl: account.profile_url || null,
    avatarUrl: account.avatar_url || null,
    active: Number(account.active) === 1 || account.active === true,
    fetchStrategy: account.fetch_strategy || null,
    credentialRef: account.credential_ref || null,
    remark: account.remark || null,
    lastFetchedAt: account.last_fetched_at || null,
    createdAt: account.created_at || null,
    updatedAt: account.updated_at || null,
  };
}

function snapshotDto(snapshot: Record<string, unknown> | null) {
  if (!snapshot) return null;
  return {
    id: Number(snapshot.id),
    accountId: Number(snapshot.account_id),
    platform: snapshot.platform,
    snapshotDate: snapshot.snapshot_date,
    followers: snapshot.followers,
    followingCount: snapshot.following_count,
    likesTotal: snapshot.likes_total,
    videoCount: snapshot.video_count,
    worksCount: snapshot.works_count,
    engagementEst: snapshot.engagement_est,
    sourceMethod: snapshot.source_method,
    sourceProject: snapshot.source_project,
    fetchedAt: snapshot.fetched_at,
    createdAt: snapshot.created_at,
  };
}

function jobDto(job: Record<string, unknown> | null) {
  if (!job) return null;
  return {
    id: Number(job.id),
    accountId: job.account_id == null ? null : Number(job.account_id),
    platform: job.platform,
    strategy: job.strategy,
    status: job.status,
    triggerSource: job.trigger_source || 'manual',
    retryCount: job.retry_count,
    failureType: job.failure_type || null,
    lastError: job.last_error,
    startedAt: job.started_at,
    finishedAt: job.finished_at,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

router.get('/options', async (_req, res) => {
  sendData(res, {
    platforms: ['douyin', 'kuaishou', 'xiaohongshu', 'shipinhao', 'tiktok', 'bilibili', 'weibo', 'other'],
    fetchStrategies: ['manual', 'api', 'scraper', 'import', 'native_playwright'],
  });
});

router.get('/accounts', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 100);
    const accounts = await listSocialAccounts(limit);
    sendData(res, { items: accounts.map((account) => accountDto(account as unknown as Record<string, unknown>)) });
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/accounts/overview', requirePermission('analytics:view'), async (_req, res) => {
  try { sendData(res, { items: await listSocialAccountsOverview() }); } catch (error) { handleError(error, res); }
});

router.post('/accounts', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const platform = String(body.platform || 'douyin');
    const externalAccountId = String(body.externalAccountId || '');
    const accountName = String(body.accountName || '');
    if (!externalAccountId || !accountName) {
      return res.status(400).json({ success: false, message: '账号名称和平台账号不能为空。' });
    }

    const existing = await queryOne<Record<string, unknown>>(
      `SELECT id FROM social_accounts WHERE platform = ? AND external_account_id = ?`,
      [platform, externalAccountId],
    );
    if (existing) {
      return res.status(409).json({ success: false, message: '账号已存在。' });
    }

    const id = await executeInsert(
      `INSERT INTO social_accounts
        (platform, external_account_id, account_name, display_name, profile_url, active, fetch_strategy,
         remark, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))`,
      [
        platform,
        externalAccountId,
        accountName,
        body.displayName ? String(body.displayName) : accountName,
        body.profileUrl ? String(body.profileUrl) : null,
        body.active === false ? 0 : 1,
        String(body.fetchStrategy || 'manual'),
        body.remark ? String(body.remark) : null,
      ],
    );
    const account = await getSocialAccount(id);
    sendData(res, { account: account ? accountDto(account as unknown as Record<string, unknown>) : null });
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/accounts/:id', async (req, res) => {
  try {
    const accountId = Number(req.params.id);
    const account = await getSocialAccount(accountId);
    if (!account) return res.status(404).json({ success: false, message: '账号不存在。' });
    const latestSnapshot = await queryOne<Record<string, unknown>>(
      `SELECT id, account_id, platform, snapshot_date, followers, following_count, likes_total,
              video_count, works_count, engagement_est, source_method, source_project, fetched_at, created_at
         FROM social_snapshots
        WHERE account_id = ?
        ORDER BY fetched_at DESC, id DESC
        LIMIT 1`,
      [accountId],
    );
    sendData(res, {
      account: {
        ...accountDto(account as unknown as Record<string, unknown>),
        latestSnapshot: snapshotDto(latestSnapshot),
      },
    });
  } catch (error) {
    handleError(error, res);
  }
});

router.patch('/accounts/:id', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    await execute(
      `UPDATE social_accounts
          SET active = COALESCE(?, active),
              remark = COALESCE(?, remark),
              updated_at = datetime('now', '+8 hours')
        WHERE id = ?`,
      [
        typeof body.active === 'boolean' ? (body.active ? 1 : 0) : null,
        body.remark ? String(body.remark) : null,
        Number(req.params.id),
      ],
    );
    const account = await getSocialAccount(Number(req.params.id));
    sendData(res, { account: account ? accountDto(account as unknown as Record<string, unknown>) : null });
  } catch (error) {
    handleError(error, res);
  }
});

router.delete('/accounts/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await execute(`DELETE FROM social_scheduled_jobs WHERE account_id = ?`, [id]);
    await execute(`DELETE FROM social_ingestion_health WHERE account_id = ?`, [id]);
    await execute(`DELETE FROM social_videos WHERE account_id = ?`, [id]);
    await execute(`DELETE FROM social_snapshots WHERE account_id = ?`, [id]);
    await execute(`DELETE FROM social_ingestion_jobs WHERE account_id = ?`, [id]);
    await execute(`DELETE FROM social_accounts WHERE id = ?`, [id]);
    sendData(res, { message: '账号已删除。' });
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/accounts/:id/snapshots', async (req, res) => {
  try {
    const rows = await queryAll<Record<string, unknown>>(
      `SELECT id, account_id, platform, snapshot_date, followers, following_count, likes_total,
              video_count, works_count, engagement_est, source_method, source_project, fetched_at, created_at
         FROM social_snapshots
        WHERE account_id = ?
        ORDER BY fetched_at DESC, id DESC
        LIMIT 50`,
      [Number(req.params.id)],
    );
    sendData(res, { items: rows.map(snapshotDto) });
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/accounts/:id/snapshots/latest', async (req, res) => {
  try {
    const row = await queryOne<Record<string, unknown>>(
      `SELECT id, account_id, platform, snapshot_date, followers, following_count, likes_total,
              video_count, works_count, engagement_est, source_method, source_project, fetched_at, created_at
         FROM social_snapshots
        WHERE account_id = ?
        ORDER BY fetched_at DESC, id DESC
        LIMIT 1`,
      [Number(req.params.id)],
    );
    sendData(res, { snapshot: snapshotDto(row) });
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/accounts/:id/videos', requirePermission('analytics:view'), async (req, res) => {
  try {
    const accountId = Number(req.params.id);
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 20)));
    const allItems = await listVideoPerformance(accountId) as Array<Record<string, unknown> & { performance: VideoPerformance }>;
    const start = (page - 1) * limit;
    const rankedIds = [...allItems].sort((a, b) => Number(b.views || 0) - Number(a.views || 0)).map((item) => Number(item.id));
    const items = await Promise.all(allItems.slice(start, start + limit).map(async (item) => {
      const lifecycle = await getVideoLifecycle(Number(item.id));
      return {
        id: item.id,
        title: item.title || null,
        publishTime: item.publish_time || null,
        coverUrl: item.cover_url || null,
        views: item.views ?? null,
        likes: item.likes ?? null,
        comments: item.comments ?? null,
        shares: item.shares ?? null,
        collects: item.collects ?? null,
        interactionRate: item.performance.interactionRate,
        hotScore: item.performance.hotScore,
        scoreMode: item.performance.scoreMode,
        lifecycleStage: lifecycle?.growthStage || null,
        playRank: rankedIds.indexOf(Number(item.id)) + 1,
        sourceType: item.source_type || null,
      };
    }));
    sendData(res, { items, pagination: { page, limit, total: allItems.length, totalPages: Math.ceil(allItems.length / limit) } });
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/accounts/:id/sync-export', requirePermission('analytics:view'), async (req, res) => {
  try {
    const result = await syncLatestOfficialExport(Number(req.params.id));
    if (!result.success) return res.status(200).json({ success: false, data: result, message: result.message });
    sendData(res, result);
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/accounts/:id/performance-sync', requirePermission('analytics:view'), async (req, res) => {
  try {
    const accountId = Number(req.params.id);
    if (accountId !== 2) return res.status(200).json({ success: false, errorType: 'performance_sync_failed', message: '仅支持账号 2 的性能同步。' });
    const account = await getSocialAccount(accountId);
    if (!account || account.platform !== 'douyin' || !account.active) return res.status(200).json({ success: false, errorType: 'performance_sync_failed', message: '账号不可用于性能同步。' });
    const credential = await getCredentialSummaryByAccountId(accountId);
    if (!credential.hasCredential) return res.status(200).json({ success: false, error: '账号未配置采集凭据' });
    if (credential.status !== 'active') return res.status(200).json({ success: false, error: '账号登录状态已失效，请重新授权' });
    const source = ['manual', 'scheduled', 'system'].includes(String(req.body?.source)) ? String(req.body.source) : 'manual';
    const videos = await queryAll<Record<string, unknown>>('SELECT external_video_id FROM social_videos WHERE account_id = ? AND external_video_id IS NOT NULL', [accountId]);
    const performance = await collectDouyinPerformanceMetrics(account, videos.map((video) => ({ platform: 'douyin', external_video_id: String(video.external_video_id) })));
    for (const metric of performance.metricsByExternalVideoId.values()) {
      await execute(`UPDATE social_videos SET views = CASE WHEN ? > 0 THEN ? ELSE views END, likes = CASE WHEN ? > 0 THEN ? ELSE likes END, comments = CASE WHEN ? > 0 THEN ? ELSE comments END, shares = CASE WHEN ? > 0 THEN ? ELSE shares END, collects = CASE WHEN ? > 0 THEN ? ELSE collects END WHERE account_id = ? AND external_video_id = ?`, [metric.views ?? 0, metric.views ?? 0, metric.likes ?? 0, metric.likes ?? 0, metric.comments ?? 0, metric.comments ?? 0, metric.shares ?? 0, metric.shares ?? 0, metric.collects ?? 0, metric.collects ?? 0, accountId, metric.externalVideoId]);
    }
    sendData(res, { accountId, source, summary: { received: performance.itemCount, matched: performance.metricReceivedCount, updated: performance.updateCount, skipped: performance.missingItemCount }, metrics: performance.metrics, ignoredZeroValues: performance.ignoredZeroValues, performance_sync_summary: { accountId, sourceCount: performance.sources.length, sources: performance.sources, metrics: performance.metrics, ignoredZeroValues: performance.ignoredZeroValues, skippedCount: performance.missingItemCount } });
  } catch {
    res.status(200).json({ success: false, errorType: 'performance_sync_failed', message: '性能数据同步失败' });
  }
});

router.get('/accounts/:accountId/videos/:videoId', requirePermission('analytics:view'), async (req, res) => {
  try {
    const accountId = Number(req.params.accountId);
    const videoId = Number(req.params.videoId);
    const item = (await listVideoPerformance(accountId) as Array<Record<string, unknown> & { performance: VideoPerformance }>).find((video) => Number(video.id) === videoId);
    if (!item) return res.status(404).json({ success: false, message: '作品不存在。' });
    const lifecycle = await getVideoLifecycle(videoId);
    sendData(res, { video: {
      id: item.id, title: item.title || null, publishTime: item.publish_time || null, coverUrl: item.cover_url || null,
      views: item.views ?? null, likes: item.likes ?? null, comments: item.comments ?? null, shares: item.shares ?? null,
      collects: item.collects ?? null, interactionRate: item.performance.interactionRate, hotScore: item.performance.hotScore,
      playScore: item.performance.playScore, interactionScore: item.performance.interactionScore, growthScore: item.performance.growthScore,
      scoreMode: item.performance.scoreMode,
      lifecycleStage: lifecycle?.growthStage || null,
      growthSpeed: lifecycle?.growthSpeed || null,
      sourceType: item.source_type || null,
    } });
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/videos/:id/lifecycle', requirePermission('analytics:view'), async (req, res) => {
  try {
    const lifecycle = await getVideoLifecycle(Number(req.params.id));
    if (!lifecycle) return res.status(404).json({ success: false, message: '作品不存在。' });
    sendData(res, lifecycle);
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/videos/:id/insights', requirePermission('analytics:view'), async (req, res) => {
  try {
    const videoId = Number(req.params.id);
    const lifecycle = await getVideoLifecycle(videoId);
    if (!lifecycle) return res.status(404).json({ success: false, message: '作品不存在。' });
    await refreshVideoInsights(videoId);
    sendData(res, { videoId, items: await listVideoInsights(videoId) });
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/accounts/:id/jobs', async (req, res) => {
  try {
    const account = await getSocialAccount(Number(req.params.id));
    if (!account) return res.status(404).json({ success: false, message: '账号不存在。' });
    const job = await createIngestionJob(account, 'pending');
    sendData(res, { job: jobDto(job) });
  } catch (error) {
    handleError(error, res);
  }
});

router.post('/accounts/:id/collect', async (req, res) => {
  try {
    const accountId = Number(req.params.id);
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const rawCollectMode = typeof body.collectMode === 'string' ? body.collectMode : typeof body.mode === 'string' ? body.mode : 'standard';
    if (!['standard', 'official-export', 'creator-item-api'].includes(rawCollectMode)) {
      return res.status(400).json({ success: false, message: '采集模式不支持。' });
    }
    const result = await runSocialCollection(accountId, {
      contentPath: typeof body.contentPath === 'string' ? body.contentPath : null,
      exportPath: typeof body.exportPath === 'string' ? body.exportPath : null,
      collectMode: rawCollectMode as 'standard' | 'official-export' | 'creator-item-api',
    });
    const payload = {
      job: jobDto(result.job),
      account: accountDto(result.account as unknown as Record<string, unknown>),
      snapshot: snapshotDto(result.snapshot),
      videoCount: result.videoCount,
      diagnostics: result.diagnostics || [],
      message: result.errorMessage || '采集完成。',
    };
    if (result.errorMessage) {
      return res.status(200).json({ success: true, data: payload, message: result.errorMessage });
    }
    sendData(res, payload);
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/accounts/:id/credentials', async (req, res) => {
  try {
    sendData(res, await getCredentialSummaryByAccountId(Number(req.params.id)));
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/accounts/:id/health', requirePermission('analytics:view'), async (req, res) => {
  try { sendData(res, { health: await refreshIngestionHealth(Number(req.params.id)) }); } catch (error) { handleError(error, res); }
});

router.get('/accounts/:id/data-quality', requirePermission('analytics:view'), async (req, res) => {
  try { sendData(res, await inspectSocialDataQuality(Number(req.params.id))); } catch (error) { handleError(error, res); }
});

router.get('/accounts/:id/metric-status', requirePermission('analytics:view'), async (req, res) => {
  try {
    const accountId = Number(req.params.id);
    const row = await queryOne<Record<string, unknown>>(
      `SELECT
         SUM(CASE WHEN views IS NOT NULL AND views > 0 THEN 1 ELSE 0 END) AS views_available,
         SUM(CASE WHEN likes IS NOT NULL THEN 1 ELSE 0 END) AS likes_available,
         SUM(CASE WHEN comments IS NOT NULL THEN 1 ELSE 0 END) AS comments_available,
         SUM(CASE WHEN shares IS NOT NULL THEN 1 ELSE 0 END) AS shares_available,
         SUM(CASE WHEN collects IS NOT NULL THEN 1 ELSE 0 END) AS collects_available
       FROM social_videos
       WHERE account_id = ?`,
      [accountId],
    );
    sendData(res, {
      views: Number(row?.views_available || 0) > 0,
      likes: Number(row?.likes_available || 0) > 0,
      comments: Number(row?.comments_available || 0) > 0,
      shares: Number(row?.shares_available || 0) > 0,
      collects: Number(row?.collects_available || 0) > 0,
    });
  } catch (error) {
    handleError(error, res);
  }
});

router.get('/accounts/:id/daily-summary', requirePermission('analytics:view'), async (req, res) => {
  try { sendData(res, await getDailySummary(Number(req.params.id))); } catch (error) { handleError(error, res); }
});

router.post('/jobs/batch', async (_req, res) => {
  sendData(res, { message: '批量采集未执行。', created: 0 });
});

router.get('/jobs', async (_req, res) => {
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT id, account_id, platform, strategy, status, trigger_source, retry_count, failure_type, last_error,
            started_at, finished_at, created_at, updated_at
       FROM social_ingestion_jobs
      ORDER BY id DESC
      LIMIT 50`,
  );
  sendData(res, { items: rows.map(jobDto) });
});

router.get('/schedules', requireAdmin, async (_req, res) => {
  try { sendData(res, { items: await listScheduledJobs() }); } catch (error) { handleError(error, res); }
});

router.post('/schedules', requireAdmin, async (req, res) => {
  try {
    const accountId = Number(req.body?.accountId);
    const scheduleType = String(req.body?.scheduleType || 'daily');
    if (!Number.isInteger(accountId) || accountId < 1) return res.status(400).json({ success: false, message: '请选择有效账号。' });
    if (scheduleType !== 'daily') return res.status(400).json({ success: false, message: '当前仅支持每日采集计划。' });
    const schedule = await createDailySchedule(accountId, req.body?.enabled !== false);
    sendData(res, { schedule });
  } catch (error) { handleError(error, res); }
});

router.patch('/schedules/:id', requireAdmin, async (req, res) => {
  try {
    if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ success: false, message: '请提供计划启用状态。' });
    sendData(res, { schedule: await updateScheduleEnabled(Number(req.params.id), req.body.enabled) });
  } catch (error) { handleError(error, res); }
});

router.post('/schedules/:id/run', requireAdmin, async (req, res) => {
  try {
    const result = await runScheduledJob(Number(req.params.id), { dryRun: req.body?.dryRun === true });
    sendData(res, result);
  } catch (error) { handleError(error, res); }
});

router.get('/jobs/:id', async (req, res) => {
  const job = await getIngestionJob(Number(req.params.id));
  if (!job) return res.status(404).json({ success: false, message: '任务不存在。' });
  sendData(res, { job: jobDto(job) });
});

router.get('/metrics/overview', async (_req, res) => {
  const accounts = await queryOne<Record<string, unknown>>(`SELECT COUNT(*) AS count FROM social_accounts`);
  const snapshots = await queryOne<Record<string, unknown>>(`SELECT COUNT(*) AS count FROM social_snapshots`);
  const videos = await queryOne<Record<string, unknown>>(`SELECT COUNT(*) AS count FROM social_videos`);
  sendData(res, {
    accountCount: Number(accounts?.count || 0),
    snapshotCount: Number(snapshots?.count || 0),
    videoCount: Number(videos?.count || 0),
  });
});

router.get('/metrics/platforms', async (_req, res) => {
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT platform, COUNT(*) AS account_count FROM social_accounts GROUP BY platform ORDER BY platform`,
  );
  sendData(res, { items: rows });
});

router.get('/metrics/jobs', async (_req, res) => {
  const rows = await queryAll<Record<string, unknown>>(
    `SELECT status, COUNT(*) AS count FROM social_ingestion_jobs GROUP BY status ORDER BY status`,
  );
  sendData(res, { items: rows });
});

router.post('/metrics/rollups', async (_req, res) => {
  sendData(res, { message: '指标汇总已校验。' });
});

router.get('/videos/performance', requirePermission('analytics:view'), async (req, res) => {
  try { sendData(res, { items: await listVideoPerformance(req.query.accountId ? Number(req.query.accountId) : undefined) }); } catch (error) { handleError(error, res); }
});

router.get('/videos/hot', requirePermission('analytics:view'), async (req, res) => {
  try { sendData(res, { items: await listHotVideos(req.query.accountId ? Number(req.query.accountId) : undefined) }); } catch (error) { handleError(error, res); }
});

router.get('/accounts/:id/trends', requirePermission('analytics:view'), async (req, res) => {
  try { sendData(res, { analysis: await analyzeVideoTrends(Number(req.params.id)) }); } catch (error) { handleError(error, res); }
});

router.get('/accounts/:id/analysis', requirePermission('analytics:view'), async (req, res) => {
  try { const items = await listVideoPerformance(Number(req.params.id)); const trends = await analyzeVideoTrends(Number(req.params.id)); sendData(res, { accountId: Number(req.params.id), videoCount: items.length, averageViews: trends.averageViews, averageInteraction: trends.averageInteraction, hotVideos: [...items].sort((a, b) => b.performance.hotScore - a.performance.hotScore).slice(0, 10), trends }); } catch (error) { handleError(error, res); }
});

router.get('/accounts/:id/dashboard', requirePermission('analytics:view'), async (req, res) => {
  try {
    const accountId = Number(req.params.id);
    const [health, performance, trends] = await Promise.all([analyzeAccountHealth(accountId), listVideoPerformance(accountId), analyzeVideoTrends(accountId)]);
    sendData(res, { accountId, health, trends, topVideos: [...performance].sort((a, b) => b.performance.hotScore - a.performance.hotScore).slice(0, 10) });
  } catch (error) { handleError(error, res); }
});

router.get('/accounts/:id/content-ranking', requirePermission('analytics:view'), async (req, res) => {
  try { sendData(res, { accountId: Number(req.params.id), items: (await listHotVideos(Number(req.params.id))).slice(0, 50) }); } catch (error) { handleError(error, res); }
});

router.get('/accounts/:id/content-insights', requirePermission('analytics:view'), async (req, res) => {
  try {
    const accountId = Number(req.params.id);
    await refreshAccountVideoContentFeatures(accountId);
    sendData(res, await analyzeContentPerformance(accountId, true));
  } catch (error) { handleError(error, res); }
});

router.get('/accounts/:id/suggestions', requirePermission('analytics:view'), async (req, res) => {
  try {
    const accountId = Number(req.params.id);
    await generateAccountSuggestions(accountId);
    sendData(res, { items: await listAccountSuggestions(accountId) });
  } catch (error) { handleError(error, res); }
});

router.get('/accounts/:id/reports/latest', requirePermission('analytics:view'), async (req, res) => {
  try {
    const report = await getLatestSocialReviewReport(Number(req.params.id));
    if (!report) return res.status(404).json({ success: false, message: '暂无复盘报告。' });
    sendData(res, report);
  } catch (error) { handleError(error, res); }
});

router.post('/accounts/:id/reports/generate', requirePermission('analytics:view'), async (req, res) => {
  try {
    const period = typeof req.body?.period === 'string' ? req.body.period : '30d';
    if (!['7d', '30d', '90d'].includes(period)) return res.status(400).json({ success: false, message: '报告周期仅支持 7d、30d 或 90d。' });
    sendData(res, await generateAccountReport(Number(req.params.id), { period: period as ReportPeriod }));
  } catch (error) { handleError(error, res); }
});

router.get('/accounts/:id/growth', requirePermission('analytics:view'), async (req, res) => {
  try { sendData(res, await analyzeAccountGrowth(Number(req.params.id))); } catch (error) { handleError(error, res); }
});

router.get('/videos/:id/tags', requirePermission('analytics:view'), async (req, res) => {
  try { sendData(res, { items: await queryAll('SELECT id, video_id, tag, source, created_at FROM video_tags WHERE video_id = ? ORDER BY id DESC', [Number(req.params.id)]) }); } catch (error) { handleError(error, res); }
});

router.post('/videos/:id/tags', requirePermission('analytics:view'), async (req, res) => {
  try { const tag = String(req.body?.tag || '').trim(); if (!tag) return res.status(400).json({ success: false, message: '标签不能为空。' }); const id = await executeInsert(`INSERT INTO video_tags (video_id, tag, source) VALUES (?, ?, 'manual') ON CONFLICT(video_id, tag) DO NOTHING`, [Number(req.params.id), tag]); sendData(res, { id, videoId: Number(req.params.id), tag, source: 'manual' }); } catch (error) { handleError(error, res); }
});

router.delete('/videos/:videoId/tags/:tagId', requirePermission('analytics:view'), async (req, res) => {
  try { await execute('DELETE FROM video_tags WHERE id = ? AND video_id = ?', [Number(req.params.tagId), Number(req.params.videoId)]); sendData(res, { message: '标签已删除。' }); } catch (error) { handleError(error, res); }
});

router.get('/videos/:id/categories', requirePermission('analytics:view'), async (req, res) => {
  try {
    const items = await queryAll(`SELECT c.id, c.name, r.video_id AS videoId, r.source, r.created_at AS createdAt
      FROM video_category_relations r JOIN content_categories c ON c.id = r.category_id WHERE r.video_id = ? ORDER BY c.name`, [Number(req.params.id)]);
    sendData(res, { items });
  } catch (error) { handleError(error, res); }
});

router.get('/videos/:id/content-features', requirePermission('analytics:view'), async (req, res) => {
  try { sendData(res, { items: await listVideoContentFeatures(Number(req.params.id)) }); } catch (error) { handleError(error, res); }
});

router.post('/videos/:id/categories', requirePermission('analytics:view'), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: '分类名称不能为空。' });
    await execute(`INSERT INTO content_categories (name) VALUES (?) ON CONFLICT(name) DO NOTHING`, [name]);
    const category = await queryOne<Record<string, unknown>>('SELECT id, name, created_at FROM content_categories WHERE name = ?', [name]);
    await execute(`INSERT INTO video_category_relations (video_id, category_id, source) VALUES (?, ?, 'manual') ON CONFLICT(video_id, category_id) DO NOTHING`, [Number(req.params.id), Number(category?.id)]);
    sendData(res, { videoId: Number(req.params.id), category: { id: Number(category?.id), name, source: 'manual' } });
  } catch (error) { handleError(error, res); }
});

router.delete('/videos/:videoId/categories/:categoryId', requirePermission('analytics:view'), async (req, res) => {
  try { await execute('DELETE FROM video_category_relations WHERE video_id = ? AND category_id = ?', [Number(req.params.videoId), Number(req.params.categoryId)]); sendData(res, { message: '分类已删除。' }); } catch (error) { handleError(error, res); }
});

export default router;
