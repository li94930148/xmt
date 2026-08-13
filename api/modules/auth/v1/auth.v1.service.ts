import type { AuthRepository } from '../auth.repository.js';
import type { PasswordService } from '../password.service.js';
import type { RefreshTokenService } from '../refresh/refresh-token.service.js';
import type { SessionService } from '../session/session.service.js';
import type { AuthSessionRecord } from '../session/session.types.js';
import type { AuthWebLoginRepository } from '../web/auth-web-login.repository.js';
import type { AuthRolloutService } from '../rollout/auth-rollout.service.js';
import { createAccessTokenV1, verifyAccessTokenV1 } from '../token.service.js';
import type {
  AuthSessionSummary,
  LoginV1Data,
  LoginV1RequestInput,
  LoginV1WebData,
  RefreshData,
  RefreshWebData,
} from '../../../../shared/schema/auth.schema.js';

export type AuthV1ErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'AUTH_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'SESSION_REVOKED'
  | 'REFRESH_INVALID'
  | 'REFRESH_REUSED'
  | 'WEB_NOT_ALLOWED'
  | 'MOBILE_NOT_ALLOWED'
  | 'CLIENT_TYPE_MISMATCH';

export class AuthV1ServiceError extends Error {
  constructor(public readonly code: AuthV1ErrorCode) {
    super(code);
    this.name = 'AuthV1ServiceError';
  }
}

type AuthV1ServiceDependencies = {
  authRepository: AuthRepository;
  passwordService: PasswordService;
  sessionService: SessionService;
  refreshTokenService: RefreshTokenService;
  authWebLoginRepository?: AuthWebLoginRepository;
};

export type AuthV1Identity = {
  userId: number;
  sessionId: string;
  clientType: string;
};

const ACCESS_TOKEN_EXPIRES_IN = 900 as const;

function sessionSummary(session: AuthSessionRecord, currentSessionId: string): AuthSessionSummary {
  return {
    id: session.id,
    clientType: session.clientType,
    deviceName: session.deviceName,
    appVersion: session.appVersion,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    idleExpiresAt: session.idleExpiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    current: session.id === currentSessionId,
  };
}

export class AuthV1Service {
  constructor(private readonly dependencies: AuthV1ServiceDependencies) {}

  async login(input: LoginV1RequestInput, userAgentSummary: string | null): Promise<LoginV1Data> {
    const user = await this.validateCredentials(input);

    const sessionId = await this.dependencies.sessionService.createSession({
      userId: user.id,
      clientType: input.client.type,
      deviceName: input.client.deviceName,
      userAgentSummary,
      appVersion: input.client.appVersion,
    });
    const lookup = await this.dependencies.sessionService.getSession(sessionId);
    if (!lookup.session || lookup.state !== 'ACTIVE') {
      throw new AuthV1ServiceError('SESSION_EXPIRED');
    }

    try {
      const refreshToken = await this.dependencies.refreshTokenService.createRefreshToken({
        sessionId,
        generation: 0,
        expiresAt: lookup.session.absoluteExpiresAt,
      });
      const accessToken = createAccessTokenV1({ userId: user.id, sessionId });
      await this.dependencies.authRepository.recordLogin(user);
      return {
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          role: user.role,
          forceChangePassword: user.forceChangePassword,
        },
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
        session: sessionSummary(lookup.session, sessionId),
      };
    } catch (error) {
      await this.dependencies.sessionService.revokeSession(sessionId, 'security_event');
      throw error;
    }
  }

  async loginWeb(
    input: LoginV1RequestInput,
    userAgentSummary: string | null,
    rolloutService: AuthRolloutService,
  ): Promise<{ data: LoginV1WebData; refreshToken: string }> {
    const user = await this.validateCredentials(input);
    if (!rolloutService.shouldUseWebAuth({ id: user.id })) throw new AuthV1ServiceError('WEB_NOT_ALLOWED');
    const repository = this.dependencies.authWebLoginRepository;
    if (!repository) throw new Error('Auth Web login repository is not configured');

    const session = this.dependencies.sessionService.prepareSession({
      userId: user.id,
      clientType: input.client.type,
      deviceName: input.client.deviceName,
      userAgentSummary,
      appVersion: input.client.appVersion,
    });
    const prepared = this.dependencies.refreshTokenService.prepareRefreshToken({
      sessionId: session.id,
      generation: 0,
      expiresAt: session.absoluteExpiresAt,
    });
    await repository.createLogin({ user, session, refreshToken: prepared.record });

    try {
      return {
        refreshToken: prepared.refreshToken,
        data: {
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            role: user.role,
            forceChangePassword: user.forceChangePassword,
          },
          accessToken: createAccessTokenV1({ userId: user.id, sessionId: session.id }),
          expiresIn: ACCESS_TOKEN_EXPIRES_IN,
          session: sessionSummary(session, session.id),
        },
      };
    } catch (error) {
      await this.dependencies.sessionService.revokeSession(session.id, 'security_event');
      throw error;
    }
  }

  async loginMobile(input: LoginV1RequestInput, userAgentSummary: string | null, isEligible: (user: { id: number; enabled: boolean }) => boolean): Promise<LoginV1Data> {
    const user = await this.validateCredentials(input);
    // This check intentionally precedes any session or refresh-token creation.
    if (!isEligible(user)) throw new AuthV1ServiceError('MOBILE_NOT_ALLOWED');
    return this.createSessionForUser(user, input, userAgentSummary);
  }

  async refresh(refreshToken: string): Promise<RefreshData> {
    const provisional = await this.dependencies.refreshTokenService.consumeRefreshToken(refreshToken);
    if (provisional.status === 'SECURITY_EVENT') throw new AuthV1ServiceError('REFRESH_REUSED');
    if (provisional.status !== 'SUCCESS') throw new AuthV1ServiceError('REFRESH_INVALID');

    const lookup = await this.dependencies.sessionService.getSession(provisional.sessionId);
    if (!lookup.session || lookup.state !== 'ACTIVE') throw new AuthV1ServiceError('REFRESH_INVALID');
    const user = await this.dependencies.authRepository.findUserById(lookup.session.userId);
    if (!user || !user.enabled) {
      await this.dependencies.sessionService.revokeSession(provisional.sessionId, 'user_disabled');
      throw new AuthV1ServiceError('REFRESH_INVALID');
    }

    return {
      accessToken: createAccessTokenV1({ userId: user.id, sessionId: provisional.sessionId }),
      refreshToken: provisional.refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      session: sessionSummary(lookup.session, provisional.sessionId),
    };
  }

  async refreshMobile(refreshToken: string, isEligible: (user: { id: number; enabled: boolean }) => boolean): Promise<RefreshData> {
    const sessionId = await this.dependencies.refreshTokenService.findRefreshTokenSessionId(refreshToken);
    if (!sessionId) throw new AuthV1ServiceError('REFRESH_INVALID');
    const lookup = await this.dependencies.sessionService.getSession(sessionId);
    if (!lookup.session || lookup.state !== 'ACTIVE' || lookup.session.clientType !== 'android') {
      throw new AuthV1ServiceError('REFRESH_INVALID');
    }
    const user = await this.dependencies.authRepository.findUserById(lookup.session.userId);
    if (!user || !user.enabled || !isEligible(user)) {
      await this.dependencies.sessionService.revokeSession(sessionId, 'security_event');
      throw new AuthV1ServiceError('MOBILE_NOT_ALLOWED');
    }
    return this.refresh(refreshToken);
  }

  async resolveWebRefreshIdentity(refreshToken: string): Promise<AuthV1Identity> {
    const sessionId = await this.dependencies.refreshTokenService.findRefreshTokenSessionId(refreshToken);
    if (!sessionId) throw new AuthV1ServiceError('REFRESH_INVALID');
    const lookup = await this.dependencies.sessionService.getSession(sessionId);
    if (!lookup.session || lookup.state !== 'ACTIVE') throw new AuthV1ServiceError('REFRESH_INVALID');
    return { sessionId, userId: lookup.session.userId, clientType: lookup.session.clientType };
  }

  async refreshWeb(refreshToken: string): Promise<{ data: RefreshWebData; refreshToken: string }> {
    const result = await this.refresh(refreshToken);
    const { refreshToken: replacement, ...data } = result;
    return { data, refreshToken: replacement };
  }

  async authenticate(accessToken: string | null): Promise<AuthV1Identity> {
    if (!accessToken) throw new AuthV1ServiceError('AUTH_REQUIRED');
    const payload = verifyAccessTokenV1(accessToken);
    if (!payload) throw new AuthV1ServiceError('AUTH_REQUIRED');

    const lookup = await this.dependencies.sessionService.getSession(payload.sid);
    if (lookup.state === 'REVOKED') throw new AuthV1ServiceError('SESSION_REVOKED');
    if (lookup.state !== 'ACTIVE' || !lookup.session) throw new AuthV1ServiceError('SESSION_EXPIRED');
    if (String(lookup.session.userId) !== payload.sub) throw new AuthV1ServiceError('AUTH_REQUIRED');

    const user = await this.dependencies.authRepository.findUserById(lookup.session.userId);
    if (!user || !user.enabled) throw new AuthV1ServiceError('AUTH_REQUIRED');
    return { userId: user.id, sessionId: lookup.session.id, clientType: lookup.session.clientType };
  }

  async logout(identity: AuthV1Identity): Promise<void> {
    await this.dependencies.sessionService.revokeSession(identity.sessionId, 'logout');
  }

  async sessions(identity: AuthV1Identity): Promise<AuthSessionSummary[]> {
    const sessions = await this.dependencies.sessionService.findActiveSessionsByUserId(identity.userId);
    return sessions.map((session) => sessionSummary(session, identity.sessionId));
  }

  async mobileSession(identity: AuthV1Identity, isEligible: (user: { id: number; enabled: boolean }) => boolean): Promise<AuthSessionSummary[]> {
    const user = await this.dependencies.authRepository.findUserById(identity.userId);
    if (identity.clientType !== 'android' || !user || !isEligible(user)) throw new AuthV1ServiceError('MOBILE_NOT_ALLOWED');
    return this.sessions(identity);
  }

  private async createSessionForUser(user: Awaited<ReturnType<AuthV1Service['validateCredentials']>>, input: LoginV1RequestInput, userAgentSummary: string | null): Promise<LoginV1Data> {
    const sessionId = await this.dependencies.sessionService.createSession({
      userId: user.id, clientType: input.client.type, deviceName: input.client.deviceName, userAgentSummary, appVersion: input.client.appVersion,
    });
    const lookup = await this.dependencies.sessionService.getSession(sessionId);
    if (!lookup.session || lookup.state !== 'ACTIVE') throw new AuthV1ServiceError('SESSION_EXPIRED');
    try {
      const refreshToken = await this.dependencies.refreshTokenService.createRefreshToken({ sessionId, generation: 0, expiresAt: lookup.session.absoluteExpiresAt });
      const accessToken = createAccessTokenV1({ userId: user.id, sessionId });
      await this.dependencies.authRepository.recordLogin(user);
      return { user: { id: user.id, username: user.username, name: user.name, email: user.email, role: user.role, forceChangePassword: user.forceChangePassword }, accessToken, refreshToken, expiresIn: ACCESS_TOKEN_EXPIRES_IN, session: sessionSummary(lookup.session, sessionId) };
    } catch (error) { await this.dependencies.sessionService.revokeSession(sessionId, 'security_event'); throw error; }
  }

  private async validateCredentials(input: LoginV1RequestInput) {
    const user = await this.dependencies.authRepository.findUserByUsername(input.username);
    if (!user) throw new AuthV1ServiceError('INVALID_CREDENTIALS');
    if (!user.enabled) throw new AuthV1ServiceError('ACCOUNT_DISABLED');
    if (!await this.dependencies.passwordService.verify(input.password, user.password)) {
      throw new AuthV1ServiceError('INVALID_CREDENTIALS');
    }
    return user;
  }
}
