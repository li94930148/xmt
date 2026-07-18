import { beijingNow, execute, executeInsert, queryAll, queryOne } from '../../database/utils.js';
import { classifyIngestionFailure, type IngestionFailureType } from './ingestionFailure.js';
import { createIngestionJob, getIngestionJob, getSocialAccount, runSocialCollection } from './runner.js';
import { markCredentialExpired } from './credentials.js';
import { refreshIngestionHealth } from './ingestionHealthService.js';
import { detectServerLogin } from './serverBrowserService.js';

const MAX_SCHEDULE_ATTEMPTS = 3;
let schedulerTimer: NodeJS.Timeout | null = null;

export type SocialScheduledJob = {
  id: number;
  account_id: number;
  schedule_type: 'daily';
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
};

function nextDailyRunAt(now = new Date()) {
  const [date] = now.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).split(' ');
  const next = new Date(`${date}T03:00:00+08:00`);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

function scheduleDto(row: Record<string, unknown>): SocialScheduledJob {
  return {
    id: Number(row.id), account_id: Number(row.account_id), schedule_type: 'daily',
    enabled: Number(row.enabled) === 1 || row.enabled === true,
    last_run_at: row.last_run_at ? String(row.last_run_at) : null,
    next_run_at: row.next_run_at ? String(row.next_run_at) : null,
    created_at: String(row.created_at || ''), updated_at: String(row.updated_at || ''),
  };
}

export async function getScheduledJob(scheduleId: number) {
  const row = await queryOne<Record<string, unknown>>(`SELECT id, account_id, schedule_type, enabled, last_run_at, next_run_at, created_at, updated_at
    FROM social_scheduled_jobs WHERE id = ?`, [scheduleId]);
  return row ? scheduleDto(row) : null;
}

export async function listScheduledJobs() {
  const rows = await queryAll<Record<string, unknown>>(`SELECT s.id, s.account_id, s.schedule_type, s.enabled, s.last_run_at, s.next_run_at, s.created_at, s.updated_at,
      a.platform, a.account_name, a.display_name, a.active
    FROM social_scheduled_jobs s JOIN social_accounts a ON a.id = s.account_id ORDER BY s.id DESC`);
  return rows.map((row) => ({ ...scheduleDto(row), account: { platform: row.platform, accountName: row.account_name, displayName: row.display_name, active: Number(row.active) === 1 } }));
}

export async function createDailySchedule(accountId: number, enabled = true) {
  const account = await getSocialAccount(accountId);
  if (!account) throw new Error('账号不存在。');
  const nextRunAt = nextDailyRunAt();
  await execute(`INSERT INTO social_scheduled_jobs (account_id, schedule_type, enabled, next_run_at, created_at, updated_at)
    VALUES (?, 'daily', ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
    ON CONFLICT(account_id, schedule_type) DO UPDATE SET enabled = excluded.enabled, next_run_at = excluded.next_run_at, updated_at = datetime('now', '+8 hours')`, [accountId, enabled ? 1 : 0, nextRunAt]);
  const row = await queryOne<Record<string, unknown>>(`SELECT id FROM social_scheduled_jobs WHERE account_id = ? AND schedule_type = 'daily'`, [accountId]);
  return getScheduledJob(Number(row?.id || 0));
}

export async function updateScheduleEnabled(scheduleId: number, enabled: boolean) {
  const affected = await execute(`UPDATE social_scheduled_jobs SET enabled = ?, next_run_at = CASE WHEN ? = 1 THEN ? ELSE next_run_at END,
    updated_at = datetime('now', '+8 hours') WHERE id = ?`, [enabled ? 1 : 0, enabled ? 1 : 0, nextDailyRunAt(), scheduleId]);
  if (!affected) throw new Error('采集计划不存在。');
  return getScheduledJob(scheduleId);
}

async function markScheduleRun(scheduleId: number) {
  await execute(`UPDATE social_scheduled_jobs SET last_run_at = ?, next_run_at = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?`, [beijingNow(), nextDailyRunAt(), scheduleId]);
}

export async function recordScheduledJobFailure(jobId: number, error: unknown) {
  const failureType = classifyIngestionFailure(error);
  const messages: Record<IngestionFailureType, string> = {
    credential_expired: '登录凭据已失效，请重新扫码登录。', download_failed: '官方导出下载失败，请稍后重试。',
    parse_failed: '导出数据解析失败，请检查文件结构。', network_failed: '页面加载失败，请稍后重试。', unknown: '采集失败，请稍后重试。',
  };
  await execute(`UPDATE social_ingestion_jobs SET status = 'failed', failure_type = ?, last_error = ?,
    finished_at = datetime('now', '+8 hours'), updated_at = datetime('now', '+8 hours') WHERE id = ?`, [failureType, messages[failureType], jobId]);
  if (failureType === 'credential_expired') {
    const job = await getIngestionJob(jobId);
    const account = job?.account_id == null ? null : await getSocialAccount(Number(job.account_id));
    if (account?.credential_ref) await markCredentialExpired(account.credential_ref, messages[failureType]);
  }
  const job = await getIngestionJob(jobId);
  if (job?.account_id != null) await refreshIngestionHealth(Number(job.account_id));
  return getIngestionJob(jobId);
}

export async function runScheduledJob(scheduleId: number, options: { dryRun?: boolean } = {}) {
  const schedule = await getScheduledJob(scheduleId);
  if (!schedule) throw new Error('采集计划不存在。');
  if (!schedule.enabled) throw new Error('采集计划未启用。');
  const account = await getSocialAccount(schedule.account_id);
  if (!account?.active) throw new Error('计划账号未启用。');

  const loginStatus = await detectServerLogin(account.id);
  if (loginStatus !== 'logged_in') {
    if (account.credential_ref) await markCredentialExpired(account.credential_ref, '服务器浏览器需要管理员扫码登录。');
    throw new Error('服务器浏览器需要管理员扫码登录。');
  }

  if (options.dryRun) {
    const job = await createIngestionJob(account, 'pending', 'scheduled');
    return { schedule, job, executed: false };
  }

  try {
    let result: Awaited<ReturnType<typeof runSocialCollection>> | null = null;
    for (let attempt = 0; attempt < MAX_SCHEDULE_ATTEMPTS; attempt += 1) {
      result = await runSocialCollection(account.id, { collectMode: 'official-export' }, 'scheduled', attempt);
      const failureType = 'errorMessage' in result && result.errorMessage ? classifyIngestionFailure(result.errorMessage) : null;
      if (!result.errorMessage || failureType === 'credential_expired') break;
    }
    await markScheduleRun(schedule.id);
    return { schedule: await getScheduledJob(schedule.id), job: result?.job || null, executed: true, result, maxAttempts: MAX_SCHEDULE_ATTEMPTS };
  } catch (error) {
    await markScheduleRun(schedule.id);
    throw error;
  }
}

export async function runDueScheduledJobs(options: { dryRun?: boolean } = {}) {
  const rows = await queryAll<Record<string, unknown>>(`SELECT id FROM social_scheduled_jobs
    WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at ASC`, [beijingNow()]);
  const results = [];
  for (const row of rows) results.push(await runScheduledJob(Number(row.id), options));
  return results;
}

export function startSocialIngestionScheduler() {
  if (process.env.SOCIAL_INGESTION_SCHEDULER_ENABLED !== 'true' || schedulerTimer) return false;
  const executeDue = async () => {
    try {
      await runDueScheduledJobs();
    } catch {
      console.warn('短视频采集调度执行失败。');
    }
  };
  void executeDue();
  schedulerTimer = setInterval(() => { void executeDue(); }, 15 * 60 * 1000);
  return true;
}
