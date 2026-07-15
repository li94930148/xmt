import { apiRequest, login } from './social-review-test-utils.mjs';

function items(payload) {
  return Array.isArray(payload?.data?.items) ? payload.data.items : [];
}

async function main() {
  console.log('开始验证短视频复盘数据读取接口。');
  const token = await login();
  const accountsPayload = await apiRequest('GET', '/accounts?limit=100', token);
  const account = items(accountsPayload.payload).find((item) => item.platform === 'douyin');
  if (!account?.id) throw new Error('未读取到抖音统一账号，请先确认账号数据。');
  console.log(`已读取到抖音统一账号，账号 ID：${account.id}`);

  await apiRequest('GET', `/accounts/${account.id}`, token);
  const snapshotsPayload = await apiRequest('GET', `/accounts/${account.id}/snapshots`, token);
  if (items(snapshotsPayload.payload).length === 0) console.log('该账号暂无快照数据。');
  const videosPayload = await apiRequest('GET', `/accounts/${account.id}/videos`, token);
  if (items(videosPayload.payload).length === 0) console.log('该账号暂无视频数据。');
  await apiRequest('GET', '/metrics/overview', token);
  await apiRequest('GET', '/metrics/platforms', token);
  await apiRequest('GET', '/jobs', token);
  console.log('短视频复盘数据读取接口验证通过。');
}

main().catch((error) => {
  console.error('短视频复盘数据读取接口验证失败：', error.message);
  process.exit(1);
});
