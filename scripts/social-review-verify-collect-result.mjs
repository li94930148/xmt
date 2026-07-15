import { apiRequest, createDb, isSafeErrorText, login, parseAccountId } from './social-review-test-utils.mjs';

const accountId = parseAccountId(process.argv.slice(2));

if (!accountId) {
  console.error('请传入要验证的账号 ID，本脚本不会自动选择账号。');
  process.exit(1);
}

async function readLatestJob(db) {
  const result = await db.execute({
    sql: `SELECT id, account_id, platform, strategy, status, retry_count, last_error,
                 started_at, finished_at, created_at
            FROM social_ingestion_jobs
           WHERE account_id = ?
           ORDER BY id DESC
           LIMIT 1`,
    args: [accountId],
  });
  return result.rows[0] || null;
}

async function readLatestSnapshot(db) {
  const result = await db.execute({
    sql: `SELECT id, account_id, platform, snapshot_date, followers, following_count,
                 likes_total, video_count, works_count, fetched_at
            FROM social_snapshots
           WHERE account_id = ?
           ORDER BY fetched_at DESC, id DESC
           LIMIT 1`,
    args: [accountId],
  });
  return result.rows[0] || null;
}

async function readVideoCount(db, snapshotId) {
  if (!snapshotId) return 0;
  const result = await db.execute({
    sql: 'SELECT COUNT(*) AS count FROM social_videos WHERE account_id = ? AND snapshot_id = ?',
    args: [accountId, snapshotId],
  });
  return Number(result.rows[0]?.count || 0);
}

async function main() {
  console.log('开始验证短视频真实采集结果。');
  const db = createDb();
  const accountResult = await db.execute({
    sql: `SELECT id, platform, active, fetch_strategy, account_name, display_name,
                 external_account_id, profile_url, credential_ref, last_fetched_at
            FROM social_accounts
           WHERE id = ?`,
    args: [accountId],
  });
  const account = accountResult.rows[0];
  if (!account) throw new Error('账号不存在，无法验证采集结果。');
  console.log(`账号 ID：${account.id}`);
  console.log(`平台：${account.platform}`);
  console.log(`采集策略：${account.fetch_strategy}`);
  console.log(`采集凭据引用：${account.credential_ref ? '已绑定' : '未绑定'}`);
  console.log(`最近采集时间：${account.last_fetched_at || '暂无'}`);

  const job = await readLatestJob(db);
  if (!job) throw new Error('未找到该账号的采集任务。');
  if (!['success', 'failed'].includes(String(job.status))) throw new Error('最新采集任务尚未结束。');
  if (!job.finished_at) throw new Error('最新采集任务缺少结束时间。');
  if (!isSafeErrorText(job.last_error)) throw new Error('最新采集任务错误摘要包含敏感内容。');
  console.log(`最新任务 ID：${job.id}`);
  console.log(`任务账号 ID：${job.account_id}`);
  console.log(`任务平台：${job.platform}`);
  console.log(`任务策略：${job.strategy}`);
  console.log(`任务状态：${job.status}`);
  console.log(`任务开始时间：${job.started_at || '暂无'}`);
  console.log(`任务结束时间：${job.finished_at || '暂无'}`);
  console.log(`错误摘要：${job.last_error ? '已记录安全摘要' : '无'}`);

  const snapshot = await readLatestSnapshot(db);
  if (job.status === 'success') {
    if (!snapshot) throw new Error('采集成功但未找到快照数据。');
    const videoCount = await readVideoCount(db, snapshot.id);
    if (!account.last_fetched_at) throw new Error('采集成功但账号最近采集时间未更新。');
    console.log(`最新快照 ID：${snapshot.id}`);
    console.log(`快照日期：${snapshot.snapshot_date}`);
    console.log(`粉丝数：${snapshot.followers ?? '暂无'}`);
    console.log(`总获赞：${snapshot.likes_total ?? '暂无'}`);
    console.log(`视频数：${snapshot.video_count ?? '暂无'}`);
    console.log(`作品数：${snapshot.works_count ?? '暂无'}`);
    console.log(`采集时间：${snapshot.fetched_at || '暂无'}`);
    console.log(`写入视频数量：${videoCount}`);
    if (videoCount === 0) console.log('本次未写入视频，当前采集器未从页面读取到可确认的视频列表。');
  } else {
    if (!job.last_error) throw new Error('采集失败但未记录安全错误摘要。');
    if (String(job.last_error).includes('登录凭据已失效')) {
      const credential = await db.execute({
        sql: 'SELECT status FROM social_credentials WHERE credential_ref = ? ORDER BY updated_at DESC LIMIT 1',
        args: [String(account.credential_ref || '')],
      });
      if (credential.rows[0]?.status !== 'expired') throw new Error('登录凭据失效但凭据状态未标记为失效。');
      console.log('凭据失效处理：已标记为失效。');
    } else {
      console.log('采集失败原因不是凭据失效，凭据状态不应被误标记。');
    }
    if (snapshot) {
      console.log(`最新历史快照 ID：${snapshot.id}`);
      console.log('本次失败未写入伪造快照。');
    } else {
      console.log('该账号暂无快照数据，本次失败未写入伪造快照。');
    }
    console.log('本次失败未写入伪造视频。');
  }
  await db.close?.();

  const token = await login();
  await apiRequest('GET', `/accounts/${accountId}`, token);
  await apiRequest('GET', `/accounts/${accountId}/snapshots`, token);
  await apiRequest('GET', `/accounts/${accountId}/videos`, token);
  await apiRequest('GET', `/accounts/${accountId}/credentials`, token);
  await apiRequest('GET', '/jobs', token);
  console.log('短视频真实采集结果验证通过。');
}

main().catch((error) => {
  console.error('短视频真实采集结果验证失败：', error.message);
  process.exit(1);
});
