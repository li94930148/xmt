import { apiRequest, login } from './social-review-test-utils.mjs';
import { getIngestionJob } from '../api/services/social-review/runner.js';
import { recordScheduledJobFailure } from '../api/services/social-review/socialIngestionScheduler.js';

const testAccount = {
  platform: 'douyin',
  externalAccountId: 'scheduler_smoke_account',
  accountName: '调度烟雾测试账号',
  profileUrl: 'https://www.douyin.com/user/scheduler_smoke_account',
  fetchStrategy: 'native_playwright',
  active: true,
  remark: '调度服务安全验证账号',
};

async function main() {
  const token = await login();
  let accountId = 0;
  try {
    await apiRequest('GET', '/schedules', token);
    const created = await apiRequest('POST', '/accounts', token, testAccount, [200, 409]);
    accountId = Number(created.payload?.data?.account?.id || 0);
    if (!accountId) {
      const accounts = await apiRequest('GET', '/accounts?limit=100', token);
      accountId = Number((accounts.payload?.data?.items || []).find((item: { externalAccountId?: string }) => item.externalAccountId === testAccount.externalAccountId)?.id || 0);
    }
    if (!accountId) throw new Error('调度测试账号准备失败。');
    const scheduleResponse = await apiRequest('POST', '/schedules', token, { accountId, scheduleType: 'daily', enabled: true });
    const scheduleId = Number(scheduleResponse.payload?.data?.schedule?.id || 0);
    if (!scheduleId) throw new Error('采集计划创建失败。');
    const prepared = await apiRequest('POST', `/schedules/${scheduleId}/run`, token, { dryRun: true });
    const jobId = Number(prepared.payload?.data?.job?.id || 0);
    if (!jobId || prepared.payload?.data?.executed !== false) throw new Error('计划任务生成状态无效。');
    const failed = await recordScheduledJobFailure(jobId, new Error('页面加载失败，请稍后重试。'));
    if (failed?.status !== 'failed' || failed.failure_type !== 'network_failed') throw new Error('计划失败分类未正确记录。');
    const job = await getIngestionJob(jobId);
    if (job?.last_error !== '页面加载失败，请稍后重试。') throw new Error('计划失败摘要未正确记录。');
    await apiRequest('PATCH', `/schedules/${scheduleId}`, token, { enabled: false });
    await apiRequest('POST', `/schedules/${scheduleId}/run`, token, { dryRun: true }, [400]);
    console.log('调度计划创建、任务生成和失败处理验证通过。');
  } finally {
    if (accountId) await apiRequest('DELETE', `/accounts/${accountId}`, token).catch(() => undefined);
  }
}

main().catch((error) => { console.error(`调度服务验证失败：${error.message}`); process.exit(1); });
