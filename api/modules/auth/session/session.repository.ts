import type {
  AuthRefreshTokenRecord,
  AuthSessionRecord,
  CreateRefreshTokenRecordInput,
  CreateSessionInput,
} from './session.types.js';

export interface SessionRepository {
  createSession(input: CreateSessionInput): Promise<void>;
  findSessionById(sessionId: string): Promise<AuthSessionRecord | null>;
  findActiveSessionsByUserId(userId: number, activeAt: string): Promise<AuthSessionRecord[]>;
  revokeSession(sessionId: string, revokedAt: string, reason: string): Promise<number>;
  revokeUserSessions(userId: number, revokedAt: string, reason: string): Promise<number>;
  createRefreshTokenRecord(input: CreateRefreshTokenRecordInput): Promise<void>;
  findRefreshTokenByHash(tokenHash: string): Promise<AuthRefreshTokenRecord | null>;
  consumeRefreshToken(
    tokenId: string,
    usedAt: string,
    replacedById: string,
  ): Promise<boolean>;
  revokeRefreshTokenChain(sessionId: string, revokedAt: string, reason: string): Promise<number>;
}
