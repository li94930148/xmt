import type {
  AuthSessionRecord,
  CreateSessionInput,
} from './session.types.js';

export interface SessionRepository {
  createSession(input: CreateSessionInput): Promise<void>;
  findSessionById(sessionId: string): Promise<AuthSessionRecord | null>;
  findActiveSessionsByUserId(userId: number, activeAt: string): Promise<AuthSessionRecord[]>;
  revokeSession(sessionId: string, revokedAt: string, reason: string): Promise<number>;
  revokeUserSessions(userId: number, revokedAt: string, reason: string): Promise<number>;
}
