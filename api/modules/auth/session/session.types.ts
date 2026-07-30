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

export type SessionClientMetadata = {
  clientType: string;
  deviceName?: string | null;
  userAgentSummary?: string | null;
  appVersion?: string | null;
  lastIpPrefix?: string | null;
};

export type CreateSessionServiceInput = SessionClientMetadata & {
  userId: number;
};

export type SessionState = 'ACTIVE' | 'NOT_FOUND' | 'REVOKED' | 'IDLE_EXPIRED' | 'ABSOLUTE_EXPIRED';

export type SessionLookupResult = {
  state: SessionState;
  session: AuthSessionRecord | null;
};

export type SessionRevokeReason =
  | 'logout'
  | 'logout_all'
  | 'password_changed'
  | 'user_disabled'
  | 'refresh_reuse'
  | 'admin'
  | 'security_event';

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
