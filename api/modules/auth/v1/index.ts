import { SqliteAuthRepository } from '../auth.sqlite-repository.js';
import { BcryptPasswordService } from '../password.service.js';
import { RefreshTokenService } from '../refresh/refresh-token.service.js';
import { SqliteRefreshTokenRepository } from '../refresh/refresh-token.sqlite-repository.js';
import { SessionService } from '../session/session.service.js';
import { SqliteSessionRepository } from '../session/session.sqlite-repository.js';
import { AuthV1Controller } from './auth.v1.controller.js';
import { createAuthV1Router } from './auth.v1.routes.js';
import { AuthV1Service } from './auth.v1.service.js';

export function createAuthV1Module(refreshTokenPepper: string) {
  if (!refreshTokenPepper) throw new Error('XMT_AUTH_REFRESH_PEPPER must be configured when Auth v1 is enabled');
  const authRepository = new SqliteAuthRepository();
  const passwordService = new BcryptPasswordService();
  const sessionRepository = new SqliteSessionRepository();
  const refreshTokenRepository = new SqliteRefreshTokenRepository();
  const sessionService = new SessionService({ repository: sessionRepository });
  const refreshTokenService = new RefreshTokenService({
    repository: refreshTokenRepository,
    peppers: { 1: refreshTokenPepper },
    currentPepperVersion: 1,
  });
  const service = new AuthV1Service({ authRepository, passwordService, sessionService, refreshTokenService });
  const controller = new AuthV1Controller(service);
  return {
    service,
    controller,
    router: createAuthV1Router(controller, service),
  };
}

export function isAuthV1Enabled(env: NodeJS.ProcessEnv = process.env) {
  return env.XMT_AUTH_V1_ENABLED === 'true' && env.NODE_ENV !== 'production';
}

export { AuthV1Controller } from './auth.v1.controller.js';
export { createAuthV1Router } from './auth.v1.routes.js';
export { AuthV1Service, AuthV1ServiceError } from './auth.v1.service.js';
