import { db } from '../api/database/db.js';

const scalar = async (sql: string) => Number((await db.execute(sql)).rows[0]?.count || 0);
const accounts = await scalar('SELECT COUNT(*) count FROM douyin_accounts WHERE douyin_uid IS NOT NULL');
const works = await scalar('SELECT COUNT(*) count FROM douyin_works');
const snapshots = await scalar('SELECT COUNT(*) count FROM douyin_daily_snapshots');
const workSnapshots = await scalar('SELECT COUNT(*) count FROM douyin_work_snapshots');
const logs = await scalar('SELECT COUNT(*) count FROM douyin_sync_logs WHERE sync_time IS NOT NULL');
const invalid = await scalar("SELECT COUNT(*) count FROM douyin_works WHERE lower(trim(title)) IN ('react','flash_mod_modal','start_flash_mod')");
const metricRows = await scalar('SELECT COUNT(*) count FROM douyin_works WHERE play_count>0 OR like_count>0 OR comment_count>0 OR share_count>0');
const samples = (await db.execute('SELECT aweme_id,title,play_count,like_count,comment_count,share_count,publish_time FROM douyin_works ORDER BY publish_time DESC LIMIT 5')).rows;
console.log(JSON.stringify({ accounts, works, daily_snapshots: snapshots, work_snapshots: workSnapshots, sync_logs: logs, invalid_internal_titles: invalid, works_with_non_zero_metrics: metricRows, samples }, null, 2));
db.close();
if (invalid > 0) process.exitCode = 1;
