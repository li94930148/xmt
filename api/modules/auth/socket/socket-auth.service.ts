import { mapSocketAuthContext, mapSocketUser } from './socket-auth.mapper.js';
import { socketAuthHandshakeSchema } from './socket-auth.schema.js';
import { SocketAuthError } from './socket-auth.errors.js';
import type { JwtPayload } from '../token.service.js';
import type {
  SocketAuthDependencies,
  SocketAuthHandshake,
  SocketAuthIdentity,
  SocketRoomJoinInput,
} from './socket-auth.types.js';

export class SocketAuthService {
  constructor(private readonly dependencies: SocketAuthDependencies) {}

  async authenticate(handshake: unknown): Promise<SocketAuthIdentity> {
    const parsed = socketAuthHandshakeSchema.safeParse(handshake);
    if (!parsed.success) throw new SocketAuthError('HANDSHAKE_INVALID');
    return parsed.data.mode === 'legacy'
      ? this.authenticateLegacy(parsed.data)
      : this.authenticateV1(parsed.data);
  }

  async authenticateLegacy(input: SocketAuthHandshake): Promise<SocketAuthIdentity> {
    const payload = this.dependencies.verifyLegacyToken(input.token);
    if (!payload || typeof payload.userId !== 'number' || !Number.isInteger(payload.userId)) {
      throw new SocketAuthError('AUTH_INVALID', 'Invalid token');
    }
    const temporal = payload as JwtPayload & { iat?: number; exp?: number };
    return this.finishIdentity({
      userId: payload.userId,
      sessionId: null,
      tokenType: 'legacy',
      authMode: 'legacy',
      issuedAt: typeof temporal.iat === 'number' ? temporal.iat : 0,
      expiresAt: typeof temporal.exp === 'number' ? temporal.exp : 0,
    }, null);
  }

  async authenticateV1(input: SocketAuthHandshake): Promise<SocketAuthIdentity> {
    const payload = this.dependencies.verifyAccessTokenV1(input.token);
    if (!payload) throw new SocketAuthError('AUTH_INVALID', 'Invalid token');
    if (payload.exp <= Math.floor(Date.now() / 1000)) {
      throw new SocketAuthError('AUTH_EXPIRED', 'Access token expired');
    }

    const userId = Number(payload.sub);
    if (!Number.isInteger(userId) || userId <= 0) throw new SocketAuthError('AUTH_INVALID');
    const sessionResult = await this.dependencies.sessionService.getSession(payload.sid);
    if (sessionResult.state !== 'ACTIVE' || !sessionResult.session) {
      throw new SocketAuthError('SESSION_INACTIVE', 'Session is not active');
    }
    if (sessionResult.session.userId !== userId) {
      throw new SocketAuthError('IDENTITY_MISMATCH', 'Authentication identity mismatch');
    }

    return this.finishIdentity({
      userId,
      sessionId: payload.sid,
      tokenType: 'access',
      authMode: 'v1-web',
      issuedAt: payload.iat,
      expiresAt: payload.exp,
    }, sessionResult.session);
  }

  private async finishIdentity(
    contextInput: Parameters<typeof mapSocketAuthContext>[0],
    session: SocketAuthIdentity['session'],
  ): Promise<SocketAuthIdentity> {
    const user = await this.dependencies.findUserById(contextInput.userId);
    if (!user) throw new SocketAuthError('USER_NOT_FOUND', 'User not found');
    if (Number(user.enabled) !== 1) throw new SocketAuthError('USER_DISABLED', 'User disabled');
    return { auth: mapSocketAuthContext(contextInput), user: mapSocketUser(user), session };
  }
}

export function authorizeSocketRoomJoin(input: SocketRoomJoinInput): boolean {
  // Reserved policy boundary. Current business room permissions remain unchanged.
  return Number.isInteger(input.userId) && input.userId > 0 && input.roomId.trim().length > 0;
}
