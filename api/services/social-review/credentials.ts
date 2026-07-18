import { execute, queryOne } from '../../database/utils.js';
import { decryptCredentialPayload } from './credentialCrypto.js';

export type SocialCredentialRecord = {
  id: number;
  platform: string;
  account_id: number;
  credential_type: string;
  credential_ref: string;
  encrypted_payload: string | null;
  status: string;
  expires_at: string | null;
  last_verified_at: string | null;
  last_failed_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  last_check_time?: string | null;
  last_success_time?: string | null;
  last_failure_time?: string | null;
  failure_reason?: string | null;
  expire_detected_at?: string | null;
};

export type CredentialHealth = { status: 'active' | 'expired' | 'need_login' | 'checking'; code?: 'credential_expired' | 'need_login'; reason: string | null };

export async function credentialHealthCheck(accountId: number): Promise<CredentialHealth> {
  const credential = await queryOne<SocialCredentialRecord>(`SELECT status, encrypted_payload FROM social_credentials WHERE account_id = ? ORDER BY updated_at DESC LIMIT 1`, [accountId]);
  if (!credential) return { status: 'need_login', code: 'need_login', reason: '未配置登录状态' };
  await execute(`UPDATE social_credentials SET last_check_time = datetime('now', '+8 hours'), status = CASE WHEN status = 'active' THEN 'checking' ELSE status END, updated_at = datetime('now', '+8 hours') WHERE account_id = ?`, [accountId]);
  // Never inspect or persist browser cookie/storage values. A configured credential is
  // only declared active after the collector itself succeeds.
  if (credential.status === 'expired') return { status: 'expired', code: 'credential_expired', reason: '账号登录已失效，请扫码重新登录' };
  if (!credential.encrypted_payload) return { status: 'need_login', code: 'need_login', reason: '账号尚未完成登录恢复' };
  await execute(`UPDATE social_credentials SET status = 'active', last_success_time = datetime('now', '+8 hours'), last_verified_at = datetime('now', '+8 hours'), updated_at = datetime('now', '+8 hours') WHERE account_id = ?`, [accountId]);
  return { status: 'active', reason: null };
}

export async function getCredentialByRef(credentialRef: string) {
  return queryOne<SocialCredentialRecord>(
    `SELECT id, platform, account_id, credential_type, credential_ref, encrypted_payload, status,
            expires_at, last_verified_at, last_failed_at, last_error, last_check_time, last_success_time,
            last_failure_time, failure_reason, expire_detected_at, created_at, updated_at
       FROM social_credentials
      WHERE credential_ref = ?
      ORDER BY updated_at DESC
      LIMIT 1`,
    [credentialRef],
  );
}

export async function getActiveCredentialByRef(credentialRef: string) {
  const credential = await getCredentialByRef(credentialRef);
  if (!credential) {
    throw new Error('采集凭据不存在，请重新扫码登录。');
  }
  if (credential.status !== 'active' || !credential.encrypted_payload) {
    throw new Error('登录凭据已失效，请重新扫码登录。');
  }
  return credential;
}

export async function decryptCredentialStorageState(credential: SocialCredentialRecord) {
  if (!credential.encrypted_payload) {
    throw new Error('登录凭据已失效，请重新扫码登录。');
  }
  return decryptCredentialPayload(credential.encrypted_payload);
}

export async function markCredentialExpired(credentialRef: string, reason = '登录凭据已失效，请重新扫码登录。') {
  await execute(
    `UPDATE social_credentials
        SET status = 'expired',
            last_failed_at = datetime('now', '+8 hours'),
            last_error = ?,
            expired_reason = ?,
            last_failure_time = datetime('now', '+8 hours'),
            failure_reason = ?,
            expire_detected_at = datetime('now', '+8 hours'),
            updated_at = datetime('now', '+8 hours')
      WHERE credential_ref = ?`,
    [reason, reason, reason, credentialRef],
  );
}

export async function getCredentialSummaryByAccountId(accountId: number) {
  const credential = await queryOne<SocialCredentialRecord>(
    `SELECT id, platform, account_id, credential_type, credential_ref, encrypted_payload, status,
            expires_at, last_verified_at, last_failed_at, last_error, last_check_time, last_success_time,
            last_failure_time, failure_reason, expire_detected_at, created_at, updated_at
       FROM social_credentials
      WHERE account_id = ?
      ORDER BY updated_at DESC
      LIMIT 1`,
    [accountId],
  );

  if (!credential) {
    return {
      hasCredential: false,
      credentialRef: null,
      credentialType: null,
      status: null,
      lastVerifiedAt: null,
    };
  }

  return {
    hasCredential: Boolean(credential.encrypted_payload),
    credentialRef: credential.credential_ref,
    credentialType: credential.credential_type,
    status: credential.status,
    lastVerifiedAt: credential.last_verified_at,
    lastFailedAt: credential.last_failed_at,
    lastError: credential.last_error,
    lastCheckTime: credential.last_check_time || null,
    lastSuccessTime: credential.last_success_time || credential.last_verified_at || null,
    lastFailureTime: credential.last_failure_time || credential.last_failed_at || null,
    failureReason: credential.failure_reason || credential.last_error || null,
    expireDetectedAt: credential.expire_detected_at || null,
  };
}
