import { execute, queryOne } from '../../database/utils.js';

export type SocialIngestionHealth = {
  accountId: number;
  lastSuccessAt: string | null;
  lastFailedAt: string | null;
  successRate: number;
  totalJobs: number;
  successJobs: number;
  failedJobs: number;
  lastFailureType: string | null;
  updatedAt: string | null;
};

export async function refreshIngestionHealth(accountId: number): Promise<SocialIngestionHealth> {
  const summary = await queryOne<Record<string, unknown>>(`SELECT
      COUNT(CASE WHEN status IN ('success', 'failed') THEN 1 END) AS total_jobs,
      COUNT(CASE WHEN status = 'success' THEN 1 END) AS success_jobs,
      COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed_jobs,
      MAX(CASE WHEN status = 'success' THEN finished_at END) AS last_success_at,
      MAX(CASE WHEN status = 'failed' THEN finished_at END) AS last_failed_at
    FROM social_ingestion_jobs WHERE account_id = ?`, [accountId]);
  const latestFailure = await queryOne<Record<string, unknown>>(`SELECT failure_type FROM social_ingestion_jobs
    WHERE account_id = ? AND status = 'failed' ORDER BY finished_at DESC, id DESC LIMIT 1`, [accountId]);
  const totalJobs = Number(summary?.total_jobs || 0);
  const successJobs = Number(summary?.success_jobs || 0);
  const failedJobs = Number(summary?.failed_jobs || 0);
  const successRate = totalJobs ? successJobs / totalJobs : 0;
  await execute(`INSERT INTO social_ingestion_health
    (account_id, last_success_at, last_failed_at, success_rate, total_jobs, success_jobs, failed_jobs, last_failure_type, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+8 hours'))
    ON CONFLICT(account_id) DO UPDATE SET last_success_at = excluded.last_success_at, last_failed_at = excluded.last_failed_at,
      success_rate = excluded.success_rate, total_jobs = excluded.total_jobs, success_jobs = excluded.success_jobs,
      failed_jobs = excluded.failed_jobs, last_failure_type = excluded.last_failure_type, updated_at = excluded.updated_at`, [
    accountId, summary?.last_success_at || null, summary?.last_failed_at || null, successRate, totalJobs, successJobs, failedJobs, latestFailure?.failure_type || null,
  ]);
  const saved = await queryOne<Record<string, unknown>>(`SELECT updated_at FROM social_ingestion_health WHERE account_id = ?`, [accountId]);
  return {
    accountId, lastSuccessAt: summary?.last_success_at ? String(summary.last_success_at) : null,
    lastFailedAt: summary?.last_failed_at ? String(summary.last_failed_at) : null,
    successRate, totalJobs, successJobs, failedJobs,
    lastFailureType: latestFailure?.failure_type ? String(latestFailure.failure_type) : null,
    updatedAt: saved?.updated_at ? String(saved.updated_at) : null,
  };
}
