import { apiRequest, login } from './social-review-test-utils.mjs';

const accountsToCreate = [
  { platform: 'douyin', externalAccountId: 'operations_smoke_account_a', accountName: '运营监控测试账号甲', profileUrl: 'https://www.douyin.com/user/operations_smoke_account_a', fetchStrategy: 'native_playwright', active: true, remark: '运营监控安全验证账号' },
  { platform: 'douyin', externalAccountId: 'operations_smoke_account_b', accountName: '运营监控测试账号乙', profileUrl: 'https://www.douyin.com/user/operations_smoke_account_b', fetchStrategy: 'native_playwright', active: true, remark: '运营监控安全验证账号' },
];

async function resolveAccountId(token, account, created) {
  const directId = Number(created.payload?.data?.account?.id || 0);
  if (directId) return directId;
  const listed = await apiRequest('GET', '/accounts?limit=100', token);
  return Number((listed.payload?.data?.items || []).find((item) => item.externalAccountId === account.externalAccountId)?.id || 0);
}

async function main() {
  const token = await login();
  const createdIds = [];
  try {
    const overview = await apiRequest('GET', '/accounts/overview', token);
    if (!(overview.payload?.data?.items || []).some((item) => item.accountId === 2)) throw new Error('账号概览未包含账号 2。');
    const health = await apiRequest('GET', '/accounts/2/health', token);
    if (typeof health.payload?.data?.health?.successRate !== 'number') throw new Error('采集健康状态无效。');
    const quality = await apiRequest('GET', '/accounts/2/data-quality', token);
    if (!Array.isArray(quality.payload?.data?.warnings) || !Array.isArray(quality.payload?.data?.errors)) throw new Error('数据质量结果无效。');
    const summary = await apiRequest('GET', '/accounts/2/daily-summary', token);
    if (typeof summary.payload?.data?.newVideoCount !== 'number') throw new Error('日报摘要结果无效。');

    const scheduled = [];
    for (const account of accountsToCreate) {
      const created = await apiRequest('POST', '/accounts', token, account, [200, 409]);
      const accountId = await resolveAccountId(token, account, created);
      if (!accountId) throw new Error('运营监控测试账号准备失败。');
      createdIds.push(accountId);
      const schedule = await apiRequest('POST', '/schedules', token, { accountId, scheduleType: 'daily', enabled: true });
      const scheduleId = Number(schedule.payload?.data?.schedule?.id || 0);
      const prepared = await apiRequest('POST', `/schedules/${scheduleId}/run`, token, { dryRun: true });
      const job = prepared.payload?.data?.job;
      const jobAccountId = Number(job?.accountId || job?.account_id || 0);
      const triggerSource = job?.triggerSource || job?.trigger_source;
      if (jobAccountId !== accountId || triggerSource !== 'scheduled') throw new Error('多账号计划任务未独立生成。');
      scheduled.push({ accountId, jobId: Number(job.id) });
    }
    if (new Set(scheduled.map((item) => item.jobId)).size !== accountsToCreate.length) throw new Error('多账号计划任务未保持独立。');
    console.log('账号概览、采集健康、数据质量、日报摘要和多账号计划验证通过。');
  } finally {
    for (const accountId of createdIds) await apiRequest('DELETE', `/accounts/${accountId}`, token).catch(() => undefined);
  }
}

main().catch((error) => { console.error(`运营监控验证失败：${error.message}`); process.exit(1); });
