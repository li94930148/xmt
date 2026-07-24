import { execute, queryOne } from '../database/utils.js';

export type CreatorAccountScope = { id: number; user_id: number; platform_uid: string; access_level: 'view'|'manage' };

export async function resolveCreatorAccountScope(userId: number, role: string, platform: string, platformUid?: string): Promise<CreatorAccountScope | null> {
  if (role === 'admin') return queryOne<CreatorAccountScope>(`SELECT id,user_id,platform_uid,'manage' access_level FROM creator_platform_accounts WHERE platform=? ${platformUid ? 'AND platform_uid=?' : ''} ORDER BY updated_at DESC,id DESC LIMIT 1`, platformUid ? [platform,platformUid] : [platform]);
  return queryOne<CreatorAccountScope>(`SELECT a.id,a.user_id,a.platform_uid,CASE WHEN a.user_id=? THEN 'manage' ELSE x.access_level END access_level FROM creator_platform_accounts a LEFT JOIN creator_account_access x ON x.account_id=a.id AND x.user_id=? WHERE a.platform=? AND (a.user_id=? OR x.user_id=?) ${platformUid ? 'AND a.platform_uid=?' : ''} ORDER BY a.updated_at DESC,a.id DESC LIMIT 1`, platformUid ? [userId,userId,platform,userId,userId,platformUid] : [userId,userId,platform,userId,userId]);
}

export async function grantCreatorAccountAccess(accountId: number, userId: number, accessLevel: 'view'|'manage') {
  await execute(`INSERT INTO creator_account_access(account_id,user_id,access_level) VALUES(?,?,?) ON CONFLICT(account_id,user_id) DO UPDATE SET access_level=excluded.access_level`, [accountId,userId,accessLevel]);
  return { success: true, account_id: accountId, user_id: userId, access_level: accessLevel };
}

export async function canManageCreatorAccount(userId: number, role: string, accountId: number) {
  if (role === 'admin' || role === 'director') return true;
  const row = await queryOne<{ allowed: number }>(`SELECT 1 allowed FROM creator_platform_accounts a LEFT JOIN creator_account_access x ON x.account_id=a.id AND x.user_id=? WHERE a.id=? AND (a.user_id=? OR x.access_level='manage')`, [userId, accountId, userId]);
  return Boolean(row);
}
