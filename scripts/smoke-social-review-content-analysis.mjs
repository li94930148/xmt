import { apiRequest, login } from './social-review-test-utils.mjs';

async function main() {
  const token = await login();
  const analysis = await apiRequest('GET', '/accounts/2/content-insights', token);
  const data = analysis.payload?.data || {};
  if (!Array.isArray(data.highPerformanceFeatures)) throw new Error('内容表现分析结果无效。');

  const performance = await apiRequest('GET', '/videos/performance?accountId=2', token);
  const videoId = Number(performance.payload?.data?.items?.[0]?.id || 0);
  if (!videoId) throw new Error('账号 2 没有可验证视频。');
  const features = await apiRequest('GET', `/videos/${videoId}/content-features`, token);
  const items = features.payload?.data?.items;
  if (!Array.isArray(items)) throw new Error('视频内容特征结果无效。');

  console.log(`账号 2 内容特征视频 ID：${videoId}`);
  console.log(`已生成内容特征数量：${items.length}`);
  console.log(`高表现特征数量：${data.highPerformanceFeatures.length}`);
  console.log('内容特征与表现分析接口验证通过。');
}

main().catch((error) => {
  console.error(`内容特征分析验证失败：${error instanceof Error ? error.message : '未知错误'}`);
  process.exit(1);
});
