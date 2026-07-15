import { apiRequest, login } from './social-review-test-utils.mjs';

async function main() {
  const token = await login();
  const performance = await apiRequest('GET', '/videos/performance?accountId=2', token);
  const items = performance.payload?.data?.items || [];
  if (!items.length) throw new Error('账号 2 暂无可分析的视频资产。');
  const first = items[0]?.performance;
  if (typeof first?.interactionRate !== 'number') throw new Error('互动率计算结果无效。');
  if (typeof first?.hotScore !== 'number') throw new Error('爆款评分结果无效。');
  await apiRequest('GET', '/videos/hot?accountId=2', token);
  await apiRequest('GET', '/accounts/2/trends', token);
  await apiRequest('GET', '/accounts/2/analysis', token);
  await apiRequest('GET', `/videos/${items[0].id}/tags`, token);
  console.log(`账号 2 分析视频数量：${items.length}`);
  console.log(`互动率计算：${first.interactionRate}`);
  console.log(`爆款评分计算：${first.hotScore}`);
  console.log('短视频内容复盘分析接口验证通过。');
}

main().catch((error) => { console.error('短视频内容复盘分析验证失败：', error.message); process.exit(1); });
