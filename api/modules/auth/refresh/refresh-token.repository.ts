import type { AuthRefreshTokenRecord, CreateRefreshTokenRecordInput } from '../session/session.types.js';

export type RefreshTokenRotationInput = {
  currentTokenHash: string;
  replacement: CreateRefreshTokenRecordInput;
  usedAt: string;
  nextIdleExpiresAt: string;
};

export type RefreshTokenRotationResult =
  | { status: 'SUCCESS'; previous: AuthRefreshTokenRecord }
  | { status: 'INVALID' }
  | { status: 'SESSION_INVALID'; sessionId: string }
  | { status: 'REUSE_DETECTED'; sessionId: string; tokenId: string };

export interface RefreshTokenRepository {
  createRefreshTokenRecord(input: CreateRefreshTokenRecordInput): Promise<void>;
  findRefreshTokenByHash(tokenHash: string): Promise<AuthRefreshTokenRecord | null>;
  rotateRefreshToken(input: RefreshTokenRotationInput): Promise<RefreshTokenRotationResult>;
  revokeRefreshTokenChain(sessionId: string, revokedAt: string, reason: string): Promise<number>;
}
