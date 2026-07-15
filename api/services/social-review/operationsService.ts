import { queryAll, queryOne } from '../../database/utils.js';
import { analyzeAccountGrowth, calculateGrowth } from './growthAnalysis.js';
import { refreshIngestionHealth } from './ingestionHealthService.js';
import { listHotVideos } from './videoAnalysis.js';

export async function listSocialAccountsOverview() {
  const accounts = await queryAll<Record<string, unknown>>(`SELECT id, account_name, display_name, platform, active, last_fetched_at
    FROM social_accounts ORDER BY id DESC`);
  const items = [];
  for (const account of accounts) {
    const accountId = Number(account.id);
    const [credential, job, schedule, health] = await Promise.all([
      queryOne<Record<string, unknown>>(`SELECT status FROM social_credentials WHERE account_id = ? ORDER BY updated_at DESC LIMIT 1`, [accountId]),
      queryOne<Record<string, unknown>>(`SELECT status, failure_type, finished_at, created_at FROM social_ingestion_jobs WHERE account_id = ? ORDER BY id DESC LIMIT 1`, [accountId]),
      queryOne<Record<string, unknown>>(`SELECT enabled, next_run_at FROM social_scheduled_jobs WHERE account_id = ? AND schedule_type = 'daily'`, [accountId]),
      refreshIngestionHealth(accountId),
    ]);
    items.push({
      accountId, accountName: account.account_name, displayName: account.display_name || null, platform: account.platform,
      active: Number(account.active) === 1, lastFetchedAt: account.last_fetched_at || null,
      credentialStatus: credential?.status || null,
      latestJob: job ? { status: job.status, failureType: job.failure_type || null, finishedAt: job.finished_at || null, createdAt: job.created_at || null } : null,
      nextRunAt: Number(schedule?.enabled) === 1 ? schedule?.next_run_at || null : null,
      scheduleEnabled: Number(schedule?.enabled) === 1,
      health,
    });
  }
  return items;
}

export async function getDailySummary(accountId: number) {
  const today = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).slice(0, 10);
  const [newVideos, growth, hotVideos, health] = await Promise.all([
    queryOne<Record<string, unknown>>(`SELECT COUNT(*) AS count FROM social_videos WHERE account_id = ? AND substr(created_at, 1, 10) = ?`, [accountId, today]),
    analyzeAccountGrowth(accountId),
    listHotVideos(accountId),
    refreshIngestionHealth(accountId),
  ]);
  let currentViews = 0;
  let previousViews = 0;
  let currentInteractions = 0;
  let previousInteractions = 0;
  for (const item of growth.items) {
    const current = item.current as Record<string, unknown> | null;
    const previous = item.previous as Record<string, unknown> | null;
    currentViews += Number(current?.views || 0);
    previousViews += Number(previous?.views || 0);
    currentInteractions += Number(current?.likes || 0) + Number(current?.comments || 0) + Number(current?.shares || 0) + Number(current?.collects || 0);
    previousInteractions += Number(previous?.likes || 0) + Number(previous?.comments || 0) + Number(previous?.shares || 0) + Number(previous?.collects || 0);
  }
  const best = hotVideos[0] as (Record<string, unknown> & { performance: { hotScore: number; views: number } }) | undefined;
  return {
    accountId, summaryDate: today, newVideoCount: Number(newVideos?.count || 0),
    viewsGrowth: calculateGrowth(currentViews, previousViews),
    interactionChange: calculateGrowth(currentInteractions, previousInteractions),
    bestContent: best ? { videoId: Number(best.id), title: best.title || null, publishTime: best.publish_time || null, hotScore: best.performance.hotScore, views: best.performance.views } : null,
    collection: { lastSuccessAt: health.lastSuccessAt, lastFailedAt: health.lastFailedAt, successRate: health.successRate, latestFailureType: health.lastFailureType },
  };
}
