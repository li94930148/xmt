import crypto from 'node:crypto';
import { DOUYIN_OAUTH_AUTHORIZE_URL, DEFAULT_DOUYIN_SCOPES, OAUTH_STATE_TTL_MS, getDouyinConfig } from './constants.js';
import { exchangeCodeForToken } from './client.js';
import { encryptToken } from './token.service.js';
import { decryptToken } from './token.service.js';
import { fetchAuthorizedUserProfile } from './user.service.js';
import { executeInsert, queryOne, runInTransaction } from '../../database/utils.js';
import type { OAuthState } from './types.js';

const states = new Map<string, OAuthState>();
export function createAuthorizationUrl(userId: number) {
  const { clientKey, redirectUri } = getDouyinConfig();
  if (!clientKey || !redirectUri) throw new Error('抖音 OAuth 尚未配置：请设置 DOUYIN_CLIENT_KEY 和 DOUYIN_REDIRECT_URI');
  const value = crypto.randomBytes(24).toString('hex'); states.set(value, { value, userId, expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
  const query = new URLSearchParams({ client_key: clientKey, response_type: 'code', scope: DEFAULT_DOUYIN_SCOPES.join(','), redirect_uri: redirectUri, state: value });
  return `${DOUYIN_OAUTH_AUTHORIZE_URL}?${query}`;
}
export async function completeAuthorization(code: string, state: string) {
  const saved = states.get(state); states.delete(state);
  if (!saved || saved.expiresAt < Date.now()) throw new Error('授权 state 无效或已过期，请重新发起绑定');
  const payload = await exchangeCodeForToken(code); const data = payload.data ?? payload;
  if (!data.access_token || !data.refresh_token || !data.open_id) throw new Error(payload.description || '抖音未返回完整授权令牌');
  const expiresAt = new Date(Date.now() + Number(data.expires_in || 0) * 1000).toISOString();
  const access = encryptToken(data.access_token); const refresh = encryptToken(data.refresh_token);
  const existing = await queryOne<{ id: number }>('SELECT id FROM douyin_accounts WHERE open_id = ?', [data.open_id]);
  // Token persistence must not be rolled back merely because the optional
  // user-info scope has not propagated yet; syncAccount retries it afterwards.
  let profile: { nickname?: string; avatar?: string; union_id?: string } = {};
  try { profile = await fetchAuthorizedUserProfile(decryptToken(access), data.open_id); } catch (error) { console.warn('[Douyin] initial profile sync deferred:', (error as Error).message); }
  const accountId = await runInTransaction(async (tx) => {
    const id = existing?.id ?? await tx.executeInsert(`INSERT INTO douyin_accounts (user_id, open_id, union_id, access_token_encrypt, refresh_token_encrypt, expires_at, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)`, [saved.userId, data.open_id, data.union_id ?? null, access, refresh, expiresAt]);
    if (existing) await tx.execute(`UPDATE douyin_accounts SET user_id=?, union_id=?, nickname=?, avatar=?, access_token_encrypt=?, refresh_token_encrypt=?, expires_at=?, status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?`, [saved.userId, profile.union_id ?? data.union_id ?? null, profile.nickname ?? null, profile.avatar ?? null, access, refresh, expiresAt, id]);
    else await tx.execute(`UPDATE douyin_accounts SET nickname=?, avatar=?, union_id=? WHERE id=?`, [profile.nickname ?? null, profile.avatar ?? null, profile.union_id ?? data.union_id ?? null, id]);
    await tx.execute(`INSERT INTO douyin_tokens (account_id, access_token, refresh_token, expires_at, last_refresh_time) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`, [id, access, refresh, expiresAt]);
    return id;
  });
  return { accountId, openId: data.open_id };
}
