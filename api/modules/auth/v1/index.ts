import { SqliteAuthRepository } from '../auth.sqlite-repository.js';
import { BcryptPasswordService } from '../password.service.js';
import { RefreshTokenService } from '../refresh/refresh-token.service.js';
import { SqliteRefreshTokenRepository } from '../refresh/refresh-token.sqlite-repository.js';
import { SessionService } from '../session/session.service.js';
import { SqliteSessionRepository } from '../session/session.sqlite-repository.js';
import { readAuthWebConfig, type AuthWebConfig } from '../web/auth-web.config.js';
import { SqliteAuthWebLoginRepository } from '../web/auth-web-login.sqlite-repository.js';
import { CsrfService } from '../web/csrf.service.js';
import { readAuthRolloutConfig } from '../rollout/auth-rollout.config.js';
import { AuthRolloutService } from '../rollout/auth-rollout.service.js';
import { authMigrationMetrics } from '../rollout/auth-migration.metrics.js';
import { authMigrationLogger } from '../rollout/auth-migration.logger.js';
import { AuthV1Controller } from './auth.v1.controller.js';
import { createAuthV1Router } from './auth.v1.routes.js';
import { AuthV1Service } from './auth.v1.service.js';

export function createAuthV1Module(
  refreshTokenPepper: string,
  options: { webConfig?: AuthWebConfig } = {},
) {
  if (!refreshTokenPepper) throw new Error('XMT_AUTH_REFRESH_PEPPER must be configured when Auth v1 is enabled');
  const authRepository = new SqliteAuthRepository();
  const passwordService = new BcryptPasswordService();
  const sessionRepository = new SqliteSessionRepository();
  const refreshTokenRepository = new SqliteRefreshTokenRepository();
  const authWebLoginRepository = new SqliteAuthWebLoginRepository();
  const sessionService = new SessionService({ repository: sessionRepository });
  const refreshTokenService = new RefreshTokenService({
    repository: refreshTokenRepository,
    peppers: { 1: refreshTokenPepper },
    currentPepperVersion: 1,
  });
  const service = new AuthV1Service({
    authRepository,
    passwordService,
    sessionService,
    refreshTokenService,
    authWebLoginRepository,
  });
  const webConfig = options.webConfig ?? readAuthWebConfig();
  const rolloutConfig = webConfig.rolloutConfig ?? {
    mode: webConfig.enabled ? 'allowlist' as const : 'legacy' as const,
    allowlistedUserIds: webConfig.allowlistedUserIds,
    internalUserIds: new Set<number>(),
    percentage: 0,
    hashSalt: 'xmt-auth-rollout-v1',
  };
  if (webConfig.enabled && (!webConfig.csrfSecret || webConfig.allowedOrigins.size === 0)) {
    throw new Error('Auth Web requires XMT_AUTH_CSRF_SECRET and XMT_AUTH_WEB_ORIGINS');
  }
  const controller = new AuthV1Controller(service, webConfig.enabled ? {
    enabled: true,
    rolloutService: new AuthRolloutService(rolloutConfig),
    allowedOrigins: webConfig.allowedOrigins,
    cookieConfig: { secure: webConfig.secureCookies },
    csrfService: new CsrfService({ secret: webConfig.csrfSecret as string }),
    metrics: authMigrationMetrics,
    logger: authMigrationLogger,
  } : undefined);
  return {
    service,
    controller,
    router: createAuthV1Router(controller, service, webConfig.enabled),
  };
}

export function isAuthV1Enabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === 'production') return false;
  const rollout = readAuthRolloutConfig(env);
  return env.XMT_AUTH_V1_ENABLED === 'true'
    || (rollout.mode !== 'disabled' && rollout.mode !== 'legacy');
}

export { AuthV1Controller } from './auth.v1.controller.js';
export { createAuthV1Router } from './auth.v1.routes.js';
export { AuthV1Service, AuthV1ServiceError } from './auth.v1.service.js';
