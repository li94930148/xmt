import type { JwtPayload } from '../token.service.js';
import type { AuthSessionRecord } from '../session/session.types.js';
import type { SessionService } from '../session/session.service.js';

export type SocketAuthMode = 'legacy' | 'v1-web';
export type SocketTokenType = 'legacy' | 'access';

export type SocketAuthContext = {
  userId: number;
  sessionId: string | null;
  tokenType: SocketTokenType;
  authMode: SocketAuthMode;
  issuedAt: number;
  expiresAt: number;
};

export type SocketAuthenticatedUser = {
  id: number;
  username: string;
  name: string;
  role: string;
};

export type SocketAuthIdentity = {
  auth: SocketAuthContext;
  user: SocketAuthenticatedUser;
  session: AuthSessionRecord | null;
};

export type SocketAuthDependencies = {
  verifyLegacyToken: (token: string) => JwtPayload | null;
  verifyAccessTokenV1: (token: string) => {
    sub: string;
    sid: string;
    iat: number;
    exp: number;
  } | null;
  findUserById: (userId: number) => Promise<SocketAuthenticatedUser & { enabled: number } | null>;
  sessionService: Pick<SessionService, 'getSession'>;
};

export type SocketAuthHandshake = {
  token: string;
  mode: SocketAuthMode;
  contractVersion?: number;
};

export type SocketRoomJoinInput = {
  userId: number;
  roomId: string;
  permission?: string | null;
  ownerId?: number | null;
  scope?: string | null;
};
