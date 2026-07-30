export type AuthSessionRecord = {
  id: string;
  userId: number;
  clientType: string;
  deviceName: string | null;
  userAgentSummary: string | null;
  appVersion: string | null;
  createdAt: string;
  lastSeenAt: string;
  idleExpiresAt: string;
  absoluteExpiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  lastIpPrefix: string | null;
};

export type CreateSessionInput = AuthSessionRecord;

export type AuthRefreshTokenRecord = {
  id: string;
  sessionId: string;
  tokenHash: string;
  pepperVersion: number;
  generation: number;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  replacedById: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
};

export type CreateRefreshTokenRecordInput = AuthRefreshTokenRecord;
