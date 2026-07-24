import { queryOne } from '../database/utils.js';

export type CreatorDataScope = {
  id: number;
  user_id: number;
  platform_uid: string;
  access_level: 'view' | 'manage';
};

const managerRoles = new Set(['admin', 'director']);

export function canManageCreatorData(role: string) {
  return managerRoles.has(role);
}

export async function resolveViewScope(role: string, platform: string, platformUid?: string): Promise<CreatorDataScope | null> {
  const accessLevel = canManageCreatorData(role) ? 'manage' : 'view';
  if (platform === 'douyin') {
    return queryOne<CreatorDataScope>(`SELECT a.id,a.user_id,a.platform_uid,? access_level
      FROM creator_platform_accounts a
      JOIN douyin_accounts d ON d.creator_account_id=a.id
      WHERE a.platform='douyin' AND a.status='active' AND d.last_sync_time IS NOT NULL
      ${platformUid ? 'AND a.platform_uid=?' : ''}
      ORDER BY d.last_sync_time DESC,a.updated_at DESC,a.id DESC LIMIT 1`, platformUid ? [accessLevel, platformUid] : [accessLevel]);
  }
  return queryOne<CreatorDataScope>(`SELECT id,user_id,platform_uid,? access_level
    FROM creator_platform_accounts WHERE platform=? AND status='active'
    ${platformUid ? 'AND platform_uid=?' : ''}
    ORDER BY updated_at DESC,id DESC LIMIT 1`, platformUid ? [accessLevel, platform, platformUid] : [accessLevel, platform]);
}

export async function resolveManageScope(role: string, platform: string, platformUid?: string): Promise<CreatorDataScope | null> {
  if (!canManageCreatorData(role)) return null;
  return queryOne<CreatorDataScope>(`SELECT id,user_id,platform_uid,'manage' access_level
    FROM creator_platform_accounts WHERE platform=? AND status='active'
    ${platformUid ? 'AND platform_uid=?' : ''}
    ORDER BY updated_at DESC,id DESC LIMIT 1`, platformUid ? [platform, platformUid] : [platform]);
}
