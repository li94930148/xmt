import { queryAll } from '../../database/utils.js';
import { requestSync } from './data.service.js';
import { processPendingWebhookEvents } from './webhook.service.js';

/**
 * Daily-sync seam. This intentionally uses no new dependency while the OpenAPI
 * application is under review; deployment can call it from node-cron or its
 * platform scheduler after scopes are approved.
 */
export async function runDailyDouyinSync() {
  const accounts = await queryAll<{ id: number }>(`SELECT id FROM douyin_accounts WHERE status = 'active'`);
  return Promise.all(accounts.map((account) => requestSync(account.id, 'daily')));
}

export function startDouyinDailyScheduler() {
  if (process.env.DOUYIN_SYNC_SCHEDULER_ENABLED !== 'true') return;
  const runIfMidnight = () => { const now = new Date(); void processPendingWebhookEvents(); if (now.getHours() === 0 && now.getMinutes() < 15) void runDailyDouyinSync(); };
  setInterval(runIfMidnight, 15 * 60 * 1000).unref();
}
