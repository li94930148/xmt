import { apiRequest, login } from './social-review-test-utils.mjs';

async function main() {
  const token = await login();
  const first = await apiRequest('GET', '/accounts/2/suggestions', token);
  const second = await apiRequest('GET', '/accounts/2/suggestions', token);
  const firstItems = first.payload?.data?.items;
  const secondItems = second.payload?.data?.items;
  if (!Array.isArray(firstItems) || !Array.isArray(secondItems)) throw new Error('运营建议接口返回无效。');
  const unique = new Set(secondItems.map((item) => `${item.type}|${item.title}|${item.content}`));
  if (unique.size !== secondItems.length) throw new Error('运营建议存在重复数据。');
  console.log(`账号 2 运营建议数量：${secondItems.length}`);
  console.log(`账号 2 首次与再次读取数量：${firstItems.length}/${secondItems.length}`);
  console.log('运营建议生成与去重验证通过。');
}

main().catch((error) => {
  console.error(`运营建议验证失败：${error instanceof Error ? error.message : '未知错误'}`);
  process.exit(1);
});
