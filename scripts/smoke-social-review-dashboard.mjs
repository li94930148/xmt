import { apiRequest, login } from './social-review-test-utils.mjs';

async function main() {
  const token = await login();
  const dashboard = await apiRequest('GET', '/accounts/2/dashboard', token);
  const ranking = await apiRequest('GET', '/accounts/2/content-ranking', token);
  const growth = await apiRequest('GET', '/accounts/2/growth', token);
  const data = dashboard.payload?.data;
  const items = ranking.payload?.data?.items || [];
  if (dashboard.status !== 200 || ranking.status !== 200 || growth.status !== 200) throw new Error('账号 2 运营分析接口未正常返回。');
  if (!data?.health || typeof data.health.healthScore !== 'number') throw new Error('账号健康度结果无效。');
  if (!items.length) throw new Error('账号 2 暂无可分析的视频资产。');
  if (items[0]?.performance?.interactionRate !== null && typeof items[0]?.performance?.interactionRate !== 'number') throw new Error('内容表现指标格式无效。');
  if (typeof items[0]?.performance?.hotScore !== 'number') throw new Error('爆款评分未正常计算。');
  console.log(`账号 2 运营分析接口验证通过，视频资产 ${items.length} 条。`);
  console.log(`互动率：${items[0].performance.interactionRate ?? '暂无数据'}`);
  console.log(`爆款评分：${items[0].performance.hotScore}`);
  console.log(`健康度：${data.health.healthScore}`);
}

main().catch((error) => { console.error(`运营分析验证失败：${error.message}`); process.exit(1); });
