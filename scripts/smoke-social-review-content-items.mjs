import 'dotenv/config';
import { queryOne } from '../api/database/utils.ts';
import { runSocialCollection } from '../api/services/social-review/runner.ts';

const ACCOUNT_ID = 2;

async function videoCount() {
  const row = await queryOne('SELECT COUNT(*) AS count FROM social_videos WHERE account_id = ?', [ACCOUNT_ID]);
  return Number(row?.count || 0);
}

async function main() {
  const before = await videoCount();
  const result = await runSocialCollection(ACCOUNT_ID, { collectMode: 'creator-item-api' });
  if (result.errorMessage || result.job?.status !== 'success') {
    throw new Error('作品列表真实采集未成功完成。');
  }

  const after = await videoCount();
  const discovered = Number(result.videoCount || 0);
  const inserted = Number(result.insertCount || 0);
  const updated = Number(result.updateCount || 0);
  const skipped = Math.max(0, discovered - inserted - updated);
  console.log(`账号 2 发现作品数量：${discovered}`);
  console.log(`账号 2 新增数量：${inserted}`);
  console.log(`账号 2 更新数量：${updated}`);
  console.log(`账号 2 跳过数量：${skipped}`);
  console.log(`账号 2 当前作品总数：${after}`);
  console.log(`采集前作品总数：${before}`);
}

main().catch((error) => {
  console.error(`作品列表真实采集验证失败：${error instanceof Error ? error.message : '未知错误'}`);
  process.exit(1);
});
