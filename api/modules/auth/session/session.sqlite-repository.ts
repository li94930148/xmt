import { execute, queryAll, queryOne } from '../../../database/utils.js';
import type { SessionRepository } from './session.repository.js';
import type {
  AuthRefreshTokenRecord,
  AuthSessionRecord,
  CreateRefreshTokenRecordInput,
  CreateSessionInput,
} from './session.types.js';

type DatabaseRecord = Record<string, unknown>;

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function mapSession(record: DatabaseRecord): AuthSessionRecord {
  return {
    id: String(record.id),
    userId: Number(record.user_id),
    clientType: String(record.client_type),
    deviceName: nullableString(record.device_name),
    userAgentSummary: nullableString(record.user_agent_summary),
    appVersion: nullableString(record.app_version),
    createdAt: String(record.created_at),
    lastSeenAt: String(record.last_seen_at),
    idleExpiresAt: String(record.idle_expires_at),
    absoluteExpiresAt: String(record.absolute_expires_at),
    revokedAt: nullableString(record.revoked_at),
    revokeReason: nullableString(record.revoke_reason),
    lastIpPrefix: nullableString(record.last_ip_prefix),
  };
}

function mapRefreshToken(record: DatabaseRecord): AuthRefreshTokenRecord {
  return {
    id: String(record.id),
    sessionId: String(record.session_id),
    tokenHash: String(record.token_hash),
    pepperVersion: Number(record.pepper_version),
    generation: Number(record.generation),
    createdAt: String(record.created_at),
    expiresAt: String(record.expires_at),
    usedAt: nullableString(record.used_at),
    replacedById: nullableString(record.replaced_by_id),
    revokedAt: nullableString(record.revoked_at),
    revokeReason: nullableString(record.revoke_reason),
  };
}

export class SqliteSessionRepository implements SessionRepository {
  async createSession(input: CreateSessionInput): Promise<void> {
    await execute(
      `INSERT INTO auth_sessions (
        id, user_id, client_type, device_name, user_agent_summary, app_version,
        created_at, last_seen_at, idle_expires_at, absolute_expires_at,
        revoked_at, revoke_reason, last_ip_prefix
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.userId,
        input.clientType,
        input.deviceName,
        input.userAgentSummary,
        input.appVersion,
        input.createdAt,
        input.lastSeenAt,
        input.idleExpiresAt,
        input.absoluteExpiresAt,
        input.revokedAt,
        input.revokeReason,
        input.lastIpPrefix,
      ],
    );
  }

  async findSessionById(sessionId: string): Promise<AuthSessionRecord | null> {
    const record = await queryOne<DatabaseRecord>('SELECT * FROM auth_sessions WHERE id = ?', [sessionId]);
    return record ? mapSession(record) : null;
  }

  async findActiveSessionsByUserId(userId: number, activeAt: string): Promise<AuthSessionRecord[]> {
    const records = await queryAll<DatabaseRecord>(
      `SELECT * FROM auth_sessions
       WHERE user_id = ?
         AND revoked_at IS NULL
         AND idle_expires_at > ?
         AND absolute_expires_at > ?
       ORDER BY last_seen_at DESC, created_at DESC`,
      [userId, activeAt, activeAt],
    );
    return records.map(mapSession);
  }

  revokeSession(sessionId: string, revokedAt: string, reason: string): Promise<number> {
    return execute(
      `UPDATE auth_sessions
       SET revoked_at = ?, revoke_reason = ?
       WHERE id = ? AND revoked_at IS NULL`,
      [revokedAt, reason, sessionId],
    );
  }

  revokeUserSessions(userId: number, revokedAt: string, reason: string): Promise<number> {
    return execute(
      `UPDATE auth_sessions
       SET revoked_at = ?, revoke_reason = ?
       WHERE user_id = ? AND revoked_at IS NULL`,
      [revokedAt, reason, userId],
    );
  }

  async createRefreshTokenRecord(input: CreateRefreshTokenRecordInput): Promise<void> {
    await execute(
      `INSERT INTO auth_refresh_tokens (
        id, session_id, token_hash, pepper_version, generation, created_at,
        expires_at, used_at, replaced_by_id, revoked_at, revoke_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.sessionId,
        input.tokenHash,
        input.pepperVersion,
        input.generation,
        input.createdAt,
        input.expiresAt,
        input.usedAt,
        input.replacedById,
        input.revokedAt,
        input.revokeReason,
      ],
    );
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<AuthRefreshTokenRecord | null> {
    const record = await queryOne<DatabaseRecord>(
      'SELECT * FROM auth_refresh_tokens WHERE token_hash = ?',
      [tokenHash],
    );
    return record ? mapRefreshToken(record) : null;
  }

  async consumeRefreshToken(tokenId: string, usedAt: string, replacedById: string): Promise<boolean> {
    const rowsAffected = await execute(
      `UPDATE auth_refresh_tokens
       SET used_at = ?, replaced_by_id = ?
       WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL`,
      [usedAt, replacedById, tokenId],
    );
    return rowsAffected === 1;
  }

  revokeRefreshTokenChain(sessionId: string, revokedAt: string, reason: string): Promise<number> {
    return execute(
      `UPDATE auth_refresh_tokens
       SET revoked_at = ?, revoke_reason = ?
       WHERE session_id = ? AND revoked_at IS NULL`,
      [revokedAt, reason, sessionId],
    );
  }
}
