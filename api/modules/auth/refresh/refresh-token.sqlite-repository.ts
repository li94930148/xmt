import { execute, queryOne, runInTransaction } from '../../../database/utils.js';
import type {
  RefreshTokenRepository,
  RefreshTokenRotationInput,
  RefreshTokenRotationResult,
} from './refresh-token.repository.js';
import type { AuthRefreshTokenRecord, CreateRefreshTokenRecordInput } from '../session/session.types.js';

type DatabaseRecord = Record<string, unknown>;

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
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

function refreshTokenValues(input: CreateRefreshTokenRecordInput): unknown[] {
  return [
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
  ];
}

const INSERT_REFRESH_TOKEN = `INSERT INTO auth_refresh_tokens (
  id, session_id, token_hash, pepper_version, generation, created_at,
  expires_at, used_at, replaced_by_id, revoked_at, revoke_reason
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export class SqliteRefreshTokenRepository implements RefreshTokenRepository {
  async createRefreshTokenRecord(input: CreateRefreshTokenRecordInput): Promise<void> {
    await execute(INSERT_REFRESH_TOKEN, refreshTokenValues(input));
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<AuthRefreshTokenRecord | null> {
    const record = await queryOne<DatabaseRecord>(
      'SELECT * FROM auth_refresh_tokens WHERE token_hash = ?',
      [tokenHash],
    );
    return record ? mapRefreshToken(record) : null;
  }

  rotateRefreshToken(input: RefreshTokenRotationInput): Promise<RefreshTokenRotationResult> {
    return runInTransaction(async (tx) => {
      const currentRecord = await tx.queryOne<DatabaseRecord>(
        'SELECT * FROM auth_refresh_tokens WHERE token_hash = ?',
        [input.currentTokenHash],
      );
      if (!currentRecord) return { status: 'INVALID' };

      const current = mapRefreshToken(currentRecord);
      if (current.usedAt) {
        await tx.execute(
          `UPDATE auth_sessions SET revoked_at = ?, revoke_reason = 'refresh_reuse'
           WHERE id = ? AND revoked_at IS NULL`,
          [input.usedAt, current.sessionId],
        );
        await tx.execute(
          `UPDATE auth_refresh_tokens SET revoked_at = ?, revoke_reason = 'refresh_reuse'
           WHERE session_id = ? AND revoked_at IS NULL`,
          [input.usedAt, current.sessionId],
        );
        return { status: 'REUSE_DETECTED', sessionId: current.sessionId, tokenId: current.id };
      }
      if (current.revokedAt || current.expiresAt <= input.usedAt) return { status: 'INVALID' };

      const session = await tx.queryOne<DatabaseRecord>('SELECT * FROM auth_sessions WHERE id = ?', [current.sessionId]);
      if (
        !session ||
        session.revoked_at ||
        String(session.idle_expires_at) <= input.usedAt ||
        String(session.absolute_expires_at) <= input.usedAt ||
        input.replacement.expiresAt > String(session.absolute_expires_at)
      ) {
        return { status: 'SESSION_INVALID', sessionId: current.sessionId };
      }

      await tx.execute(INSERT_REFRESH_TOKEN, refreshTokenValues(input.replacement));
      const consumed = await tx.execute(
        `UPDATE auth_refresh_tokens
         SET used_at = ?, replaced_by_id = ?
         WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL`,
        [input.usedAt, input.replacement.id, current.id],
      );
      if (consumed !== 1) {
        throw new Error('Refresh token atomic consumption conflict');
      }

      const sessionUpdated = await tx.execute(
        `UPDATE auth_sessions
         SET last_seen_at = ?, idle_expires_at = ?
         WHERE id = ? AND revoked_at IS NULL
           AND idle_expires_at > ? AND absolute_expires_at > ?`,
        [input.usedAt, input.nextIdleExpiresAt, current.sessionId, input.usedAt, input.usedAt],
      );
      if (sessionUpdated !== 1) {
        throw new Error('Refresh token session update conflict');
      }

      return { status: 'SUCCESS', previous: current };
    });
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
