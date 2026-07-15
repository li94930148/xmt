import { apiRequest, login } from './social-review-test-utils.mjs';

async function main() {
  const token = await login();
  const accountId = 2;
  const collected = await apiRequest('POST', `/accounts/${accountId}/collect`, token, { collectMode: 'creator-item-api' });
  if (collected.status !== 200 || !collected.payload?.success) throw new Error('作品采集与互动同步未完成。');
  const response = await apiRequest('GET', `/accounts/${accountId}/videos?page=1&limit=50`, token);
  const items = response.payload?.data?.items || [];
  const count = (key) => items.filter((item) => Number(item[key]) > 0).length;
  const summary = { accountId, videos: items.length, likes: count('likes'), comments: count('comments'), shares: count('shares'), collects: count('collects') };
  console.log(`互动同步验证：${JSON.stringify(summary)}`);
  if (!items.length || !summary.likes || !summary.comments || !summary.shares) throw new Error('未验证到真实点赞、评论或分享数据。');
}
main().catch((error) => { console.error(`互动同步验证失败：${error instanceof Error ? error.message : '未知错误'}`); process.exit(1); });
