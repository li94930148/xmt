import { apiRequest, login } from './social-review-test-utils.mjs';

async function main() {
  const token = await login();
  const before = await apiRequest('GET', '/accounts/2/videos?page=1&limit=50', token);
  const first = await apiRequest('POST', '/accounts/2/sync-export', token);
  const afterFirst = await apiRequest('GET', '/accounts/2/videos?page=1&limit=50', token);
  const second = await apiRequest('POST', '/accounts/2/sync-export', token);
  const afterSecond = await apiRequest('GET', '/accounts/2/videos?page=1&limit=50', token);
  const beforeCount = Number(before.payload?.data?.pagination?.total || 0);
  const firstCount = Number(afterFirst.payload?.data?.pagination?.total || 0);
  const secondCount = Number(afterSecond.payload?.data?.pagination?.total || 0);
  if (firstCount < beforeCount) throw new Error('同步后作品资产数量异常减少。');
  if (secondCount !== firstCount) throw new Error('重复同步产生了重复作品资产。');
  console.log(`首次同步：新增 ${first.payload?.data?.insertCount || 0} 条，更新 ${first.payload?.data?.updateCount || 0} 条，跳过 ${first.payload?.data?.skipCount || 0} 条。`);
  console.log(`首次同步后作品资产：${firstCount} 条。`);
  console.log(`重复同步：新增 ${second.payload?.data?.insertCount || 0} 条，更新 ${second.payload?.data?.updateCount || 0} 条，跳过 ${second.payload?.data?.skipCount || 0} 条。`);
  console.log(`重复同步后作品资产：${secondCount} 条，幂等验证通过。`);
}

main().catch((error) => { console.error(`官方导出同步验证失败：${error.message}`); process.exit(1); });
