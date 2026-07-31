import { runInTransaction } from '../../../database/utils.js';
import type { AuthWebLoginRepository, CreateAuthWebLoginInput } from './auth-web-login.repository.js';

export class SqliteAuthWebLoginRepository implements AuthWebLoginRepository {
  createLogin(input: CreateAuthWebLoginInput): Promise<void> {
    return runInTransaction(async (tx) => {
      await tx.execute(
        `INSERT INTO auth_sessions (
          id, user_id, client_type, device_name, user_agent_summary, app_version,
          created_at, last_seen_at, idle_expires_at, absolute_expires_at,
          revoked_at, revoke_reason, last_ip_prefix
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.session.id,
          input.session.userId,
          input.session.clientType,
          input.session.deviceName,
          input.session.userAgentSummary,
          input.session.appVersion,
          input.session.createdAt,
          input.session.lastSeenAt,
          input.session.idleExpiresAt,
          input.session.absoluteExpiresAt,
          input.session.revokedAt,
          input.session.revokeReason,
          input.session.lastIpPrefix,
        ],
      );
      await tx.execute(
        `INSERT INTO auth_refresh_tokens (
          id, session_id, token_hash, pepper_version, generation, created_at,
          expires_at, used_at, replaced_by_id, revoked_at, revoke_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.refreshToken.id,
          input.refreshToken.sessionId,
          input.refreshToken.tokenHash,
          input.refreshToken.pepperVersion,
          input.refreshToken.generation,
          input.refreshToken.createdAt,
          input.refreshToken.expiresAt,
          input.refreshToken.usedAt,
          input.refreshToken.replacedById,
          input.refreshToken.revokedAt,
          input.refreshToken.revokeReason,
        ],
      );
      await tx.execute(
        'INSERT INTO activity_log (user_id, action, target, detail) VALUES (?, ?, ?, ?)',
        [input.user.id, 'login', 'auth', `用户 ${input.user.name} 登录系统`],
      );
    });
  }
}
