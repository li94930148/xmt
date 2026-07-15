import { apiRequest, login } from './social-review-test-utils.mjs';

async function main() {
  const token = await login();
  const performance = await apiRequest('GET', '/videos/performance?accountId=2', token);
  const videoId = Number(performance.payload?.data?.items?.[0]?.id || 0);
  if (!videoId) throw new Error('账号 2 没有可验证的视频。');

  const lifecycle = await apiRequest('GET', `/videos/${videoId}/lifecycle`, token);
  const data = lifecycle.payload?.data || {};
  if (!['early', 'growth', 'stable', 'decline'].includes(data.growthStage)) throw new Error('生命周期阶段无效。');
  if (!Array.isArray(data.historicalTrend)) throw new Error('生命周期趋势无效。');

  const insights = await apiRequest('GET', `/videos/${videoId}/insights`, token);
  const items = insights.payload?.data?.items;
  if (!Array.isArray(items)) throw new Error('规则洞察接口返回无效。');

  console.log(`账号 2 验证视频 ID：${videoId}`);
  console.log(`生命周期阶段：${data.growthStage}`);
  console.log(`历史快照数量：${data.historicalTrend.length}`);
  console.log(`规则洞察数量：${items.length}`);
  console.log('生命周期与规则洞察接口验证通过。');
}

main().catch((error) => {
  console.error(`生命周期接口验证失败：${error instanceof Error ? error.message : '未知错误'}`);
  process.exit(1);
});
