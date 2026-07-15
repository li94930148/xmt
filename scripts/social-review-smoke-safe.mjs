import { apiRequest, login } from './social-review-test-utils.mjs';

const testAccount = {
  platform: 'douyin',
  externalAccountId: 'smoke_douyin_account',
  accountName: '短视频烟雾测试账号',
  profileUrl: 'https://www.douyin.com/user/smoke_douyin_account',
  fetchStrategy: 'native_playwright',
  active: true,
  remark: '短视频复盘接口烟雾测试账号',
};

function findTestAccount(accountsPayload) {
  const items = accountsPayload?.data?.items || [];
  return items.find((item) => item.externalAccountId === testAccount.externalAccountId);
}

async function main() {
  console.log('开始短视频复盘接口烟雾测试。');
  console.log('默认烟雾测试不会启动浏览器、不会访问抖音、不会执行真实采集。');
  const token = await login();

  await apiRequest('GET', '/options', token);
  await apiRequest('GET', '/metrics/overview', token);
  await apiRequest('GET', '/accounts', token);

  const created = await apiRequest('POST', '/accounts', token, testAccount, [200, 409]);
  let account = created.payload?.data?.account;
  if (created.status === 409) {
    const listed = await apiRequest('GET', '/accounts?limit=100', token);
    account = findTestAccount(listed.payload);
    if (!account?.id) throw new Error('测试账号已存在但列表中未找到，请检查账号数据。');
    await apiRequest('PATCH', `/accounts/${account.id}`, token, { active: true, remark: testAccount.remark });
  }

  const accountId = account?.id;
  if (!accountId) throw new Error('测试账号准备失败。');
  await apiRequest('GET', `/accounts/${accountId}`, token);
  await apiRequest('GET', `/accounts/${accountId}/snapshots`, token);
  await apiRequest('GET', `/accounts/${accountId}/snapshots/latest`, token);
  await apiRequest('GET', `/accounts/${accountId}/videos`, token);
  const job = await apiRequest('POST', `/accounts/${accountId}/jobs`, token, {});
  const jobId = job.payload?.data?.job?.id;
  if (!jobId) throw new Error('采集任务记录创建失败。');
  await apiRequest('GET', '/jobs', token);
  await apiRequest('GET', `/jobs/${jobId}`, token);
  await apiRequest('POST', '/jobs/batch', token, { accountIds: [accountId], runNow: false });
  await apiRequest('GET', '/metrics/platforms', token);
  await apiRequest('GET', '/metrics/jobs', token);
  await apiRequest('POST', '/metrics/rollups', token, {});
  await apiRequest('DELETE', `/accounts/${accountId}`, token);

  console.log('短视频复盘接口烟雾测试通过。');
}

main().catch((error) => {
  console.error('短视频复盘接口烟雾测试失败：', error.message);
  process.exit(1);
});
