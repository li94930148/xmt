import 'dotenv/config';
import { queryAll, queryOne } from '../api/database/utils.ts';
import { runSocialCollection } from '../api/services/social-review/runner.ts';

const ACCOUNT_ID = 2;

async function metricSummary() {
  const row = await queryOne(
    `SELECT COUNT(*) AS video_count,
            SUM(CASE WHEN views > 0 THEN 1 ELSE 0 END) AS nonzero_views,
            MAX(views) AS max_views
       FROM social_videos
      WHERE account_id = ?`,
    [ACCOUNT_ID],
  );
  return {
    videoCount: Number(row?.video_count || 0),
    nonzeroViews: Number(row?.nonzero_views || 0),
    maxViews: Number(row?.max_views || 0),
  };
}

async function main() {
  const before = await metricSummary();
  const result = await runSocialCollection(ACCOUNT_ID, { collectMode: 'creator-item-api' });
  if (result.errorMessage || result.job?.status !== 'success') throw new Error('作品性能指标同步未成功完成。');

  const after = await metricSummary();
  if (after.nonzeroViews === 0) throw new Error('未发现非零播放量，作品性能指标未写入。');

  const diagnostics = new Map((result.diagnostics || []).map((item) => [item.type, Number(item.count || 0)]));
  const examples = await queryAll(
    `SELECT id, external_video_id, views
       FROM social_videos
      WHERE account_id = ? AND views > 0
      ORDER BY views DESC, id ASC
      LIMIT 3`,
    [ACCOUNT_ID],
  );

  console.log(`账号 2 采集前非零播放作品：${before.nonzeroViews}`);
  console.log(`账号 2 采集后非零播放作品：${after.nonzeroViews}`);
  console.log(`性能接口调用次数：${diagnostics.get('performance_api_called') || 0}`);
  console.log(`性能接口作品数：${diagnostics.get('performance_item_count') || 0}`);
  console.log(`接收指标数：${diagnostics.get('performance_metric_received') || 0}`);
  console.log(`待更新指标数：${diagnostics.get('performance_update_count') || 0}`);
  console.log(`未匹配作品数：${diagnostics.get('performance_missing_item_count') || 0}`);
  for (const item of examples) console.log(`指标变化示例：作品 ${item.id}，播放 ${item.views}`);
}

main().catch((error) => {
  console.error(`作品性能指标同步验证失败：${error instanceof Error ? error.message : '未知错误'}`);
  process.exit(1);
});
