import { beijingToday, queryAll, queryOne } from '../../database/utils.js';

export type DataQualityIssue = { level: 'warning' | 'error'; code: string; message: string };

export async function inspectSocialDataQuality(accountId: number) {
  const issues: DataQualityIssue[] = [];
  const snapshots = await queryAll<Record<string, unknown>>(`SELECT snapshot_date, fetched_at FROM social_snapshots
    WHERE account_id = ? ORDER BY snapshot_date DESC LIMIT 2`, [accountId]);
  const videos = await queryOne<Record<string, unknown>>(`SELECT COUNT(*) AS total,
    COUNT(CASE WHEN views IS NULL OR likes IS NULL OR comments IS NULL OR shares IS NULL OR collects IS NULL THEN 1 END) AS incomplete_metrics
    FROM social_videos WHERE account_id = ?`, [accountId]);
  const account = await queryOne<Record<string, unknown>>(`SELECT last_fetched_at FROM social_accounts WHERE id = ?`, [accountId]);
  const videoCount = Number(videos?.total || 0);
  const incompleteMetrics = Number(videos?.incomplete_metrics || 0);
  if (!snapshots.length) issues.push({ level: 'error', code: 'snapshot_missing', message: '暂无账号快照记录。' });
  else if (snapshots.length === 1) issues.push({ level: 'warning', code: 'snapshot_history_limited', message: '账号快照历史不足，暂无法判断连续性。' });
  else {
    const latest = new Date(`${String(snapshots[0].snapshot_date)}T00:00:00+08:00`).getTime();
    const previous = new Date(`${String(snapshots[1].snapshot_date)}T00:00:00+08:00`).getTime();
    if ((latest - previous) / 86400000 > 2) issues.push({ level: 'warning', code: 'snapshot_gap', message: '账号快照存在超过两天的采集间隔。' });
  }
  if (!videoCount) issues.push({ level: 'error', code: 'video_missing', message: '暂无视频资产数据。' });
  else if (videoCount < 3) issues.push({ level: 'warning', code: 'video_count_limited', message: '视频资产数量较少，分析结论仅供参考。' });
  if (incompleteMetrics) issues.push({ level: 'warning', code: 'metric_incomplete', message: `有 ${incompleteMetrics} 条视频缺少部分互动指标。` });
  const lastFetchedAt = account?.last_fetched_at ? String(account.last_fetched_at) : null;
  if (!lastFetchedAt) issues.push({ level: 'error', code: 'collection_missing', message: '暂无采集记录。' });
  else if (lastFetchedAt.slice(0, 10) < beijingToday()) issues.push({ level: 'warning', code: 'collection_stale', message: '最近采集时间不是当天。' });
  return { accountId, inspectedAt: beijingToday(), videoCount, incompleteMetrics, lastFetchedAt, warnings: issues.filter((item) => item.level === 'warning'), errors: issues.filter((item) => item.level === 'error') };
}
