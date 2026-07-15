import { apiRequest, login } from './social-review-test-utils.mjs';

async function main() {
  const token = await login();
  const generated = await apiRequest('POST', '/accounts/2/reports/generate', token, { period: '30d' });
  const reportJson = generated.payload?.data?.report;
  if (!reportJson?.summary || !reportJson?.contentDistribution || !reportJson?.performanceRanking || !reportJson?.contentPatterns) {
    throw new Error('生成的复盘报告结构无效。');
  }
  const latest = await apiRequest('GET', '/accounts/2/reports/latest', token);
  const report = latest.payload?.data;
  if (!report?.report?.summary || report.accountId !== 2) throw new Error('最新复盘报告无效。');
  console.log(`账号 2 报告作品数量：${reportJson.summary.videoCount}`);
  console.log(`账号 2 分类数量：${reportJson.contentDistribution.categoryCount}`);
  console.log(`账号 2 最高播放作品：${reportJson.performanceRanking.topViews ? '已生成' : '无周期数据'}`);
  console.log(`账号 2 内容规律数量：${reportJson.contentPatterns.highPerformanceCategories.length}`);
  console.log('账号周期复盘报告接口验证通过。');
}

main().catch((error) => {
  console.error(`账号周期复盘报告验证失败：${error instanceof Error ? error.message : '未知错误'}`);
  process.exit(1);
});
