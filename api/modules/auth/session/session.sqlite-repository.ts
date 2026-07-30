import { execute, queryAll, queryOne } from '../../../database/utils.js';
import type { SessionRepository } from './session.repository.js';
import type {
  AuthSessionRecord,
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

}
