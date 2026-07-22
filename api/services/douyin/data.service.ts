import { execute, queryAll, queryOne } from '../../database/utils.js';
import { decryptToken } from './token.service.js';
import { fetchAuthorizedUserProfile } from './user.service.js';
import { fetchAccountDashboard, fetchFansSources } from './dashboard.service.js';

type Account = { id: number; user_id: number; open_id: string; access_token_encrypt: string };
const VIDEO_WARNING = '当前网站应用暂未开放单作品数据能力';

export async function recordSync(accountId: number | null, syncType: string, status: string, message: string) {
  await execute(`INSERT INTO douyin_sync_logs (account_id, sync_type, status, message) VALUES (?, ?, ?, ?)`, [accountId, syncType, status, message]);
}

async function account(id: number, userId?: number) {
  const row = await queryOne<Account>(`SELECT id,user_id,open_id,access_token_encrypt FROM douyin_accounts WHERE id=? AND status='active' ${userId ? 'AND user_id=?' : ''}`, userId ? [id, userId] : [id]);
  if (!row?.access_token_encrypt) throw new Error('未找到有效且属于当前用户的抖音授权账号');
  return { ...row, accessToken: decryptToken(row.access_token_encrypt) };
}

export async function syncAccount(id: number, userId?: number) {
  const item = await account(id, userId);
  const profile = await fetchAuthorizedUserProfile(item.accessToken, item.open_id);
  await execute(`UPDATE douyin_accounts SET nickname=?,avatar=?,union_id=COALESCE(?,union_id),douyin_data_source='oauth',updated_at=CURRENT_TIMESTAMP WHERE id=?`, [profile.nickname ?? null, profile.avatar ?? null, profile.union_id ?? null, id]);
  await recordSync(id, 'account', 'success', '已同步抖音账号公开信息');
  return profile;
}

export async function syncDashboard(id: number, userId?: number) {
  const item = await account(id, userId); const dashboard = await fetchAccountDashboard(item.accessToken, item.open_id);
  for (const row of dashboard.metrics) await execute(`INSERT INTO douyin_account_statistics (account_id,snapshot_date,play_count,new_fans,new_like_count,new_comment_count,profile_view_count,raw_data_json,douyin_data_source) VALUES (?,?,?,?,?,?,?,?, 'oauth') ON CONFLICT(account_id,snapshot_date) DO UPDATE SET play_count=excluded.play_count,new_fans=excluded.new_fans,new_like_count=excluded.new_like_count,new_comment_count=excluded.new_comment_count,profile_view_count=excluded.profile_view_count,raw_data_json=excluded.raw_data_json,douyin_data_source='oauth'`, [id,row.date,row.play_count,row.new_fans,row.new_like_count,row.new_comment_count,row.profile_view_count,JSON.stringify(row)]);
  await recordSync(id, 'dashboard', 'success', `已保存 ${dashboard.metrics.length} 个账号趋势快照`); return { count: dashboard.metrics.length };
}

export async function syncFansSource(id: number, userId?: number) {
  const item = await account(id, userId); const result = await fetchFansSources(item.accessToken, item.open_id);
  for (const row of result.sources) await execute(`INSERT INTO douyin_fans_source_statistics (account_id,snapshot_date,source_type,count,raw_data_json,douyin_data_source) VALUES (?,?,?,?,?,'oauth') ON CONFLICT(account_id,snapshot_date,source_type,douyin_data_source) DO UPDATE SET count=excluded.count,raw_data_json=excluded.raw_data_json`, [id,row.date,row.source_type,row.count,JSON.stringify(row.raw)]);
  await recordSync(id, 'fans_source', 'success', `已保存 ${result.sources.length} 个粉丝来源快照`); return { count: result.sources.length };
}

export async function syncVideos(id: number) { await recordSync(id, 'videos', 'unavailable', VIDEO_WARNING); return { status: 'unavailable', warning: VIDEO_WARNING }; }
export async function syncStatistics(id: number) { await recordSync(id, 'video_statistics', 'unavailable', VIDEO_WARNING); return { status: 'unavailable', warning: VIDEO_WARNING }; }

export async function requestSync(accountId: number, _syncType = 'full', userId?: number) {
  const results = { account: 'failed', dashboard: 'failed', fansSource: 'failed', videos: 'unavailable' } as Record<string, string>;
  const warnings = [VIDEO_WARNING];
  for (const [key, work] of [['account', () => syncAccount(accountId, userId)], ['dashboard', () => syncDashboard(accountId, userId)], ['fansSource', () => syncFansSource(accountId, userId)]] as const) {
    try { await work(); results[key] = 'success'; } catch (error) { results[key] = 'failed'; warnings.push(`${key}: ${error instanceof Error ? error.message : '同步失败'}`); await recordSync(accountId, key, 'failed', warnings.at(-1)!); }
  }
  return { success: true, results, warnings };
}

export async function getDashboard(accountId: number, userId: number) {
  await account(accountId, userId);
  const [accountInfo, trends, fansSources] = await Promise.all([
    queryOne(`SELECT id,nickname,avatar,open_id,douyin_data_source FROM douyin_accounts WHERE id=?`, [accountId]),
    queryAll(`SELECT snapshot_date,play_count,new_fans,new_like_count,new_comment_count,profile_view_count,douyin_data_source FROM douyin_account_statistics WHERE account_id=? ORDER BY snapshot_date ASC LIMIT 30`, [accountId]),
    queryAll(`SELECT snapshot_date,source_type,count,douyin_data_source FROM douyin_fans_source_statistics WHERE account_id=? ORDER BY snapshot_date DESC,count DESC`, [accountId]),
  ]);
  return { account: accountInfo, trends, fansSources, videoCapability: { available: false, status: 'deprecated_pending_business_auth', message: `${VIDEO_WARNING}，后续经营授权后支持。` }, sourcePriority: ['business_auth','local_agent','oauth'] };
}
