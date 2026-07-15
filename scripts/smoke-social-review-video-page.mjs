import { apiRequest, login } from './social-review-test-utils.mjs';

async function main() {
  const token = await login();
  const list = await apiRequest('GET', '/accounts/2/videos?page=1&limit=20', token);
  const items = list.payload?.data?.items || [];
  if (!items.length) throw new Error('账号 2 暂无作品数据。');
  const first = items[0];
  if (typeof first.interactionRate !== 'number' || typeof first.hotScore !== 'number') throw new Error('作品指标未正常返回。');
  const detail = await apiRequest('GET', `/accounts/2/videos/${first.id}`, token);
  const video = detail.payload?.data?.video;
  if (!video || video.id !== first.id) throw new Error('作品详情未正常返回。');
  if (typeof video.views !== 'number' && video.views !== null) throw new Error('作品播放指标格式无效。');
  console.log(`账号 2 作品列表验证通过，共 ${items.length} 条。`);
  console.log(`作品详情验证通过，作品编号 ${first.id}。`);
}

main().catch((error) => { console.error(`作品页面验证失败：${error.message}`); process.exit(1); });
