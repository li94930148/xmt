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
};

export async function getCredentialByRef(credentialRef: string) {
  return queryOne<SocialCredentialRecord>(
    `SELECT id, platform, account_id, credential_type, credential_ref, encrypted_payload, status,
            expires_at, last_verified_at, last_failed_at, last_error, created_at, updated_at
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
            updated_at = datetime('now', '+8 hours')
      WHERE credential_ref = ?`,
    [reason, reason, credentialRef],
  );
}

export async function getCredentialSummaryByAccountId(accountId: number) {
  const credential = await queryOne<SocialCredentialRecord>(
    `SELECT id, platform, account_id, credential_type, credential_ref, encrypted_payload, status,
            expires_at, last_verified_at, last_failed_at, last_error, created_at, updated_at
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
  };
}
