import { AuthController } from './auth.controller.js';
import { SqliteAuthRepository } from './auth.sqlite-repository.js';
import { createLegacyAuthRouter } from './auth.routes.js';
import { AuthService } from './auth.service.js';
import { BcryptPasswordService } from './password.service.js';
import { LegacyJwtTokenService } from './token.service.js';

export function createAuthModule() {
  const repository = new SqliteAuthRepository();
  const passwordService = new BcryptPasswordService();
  const tokenService = new LegacyJwtTokenService();
  const service = new AuthService({ repository, passwordService, tokenService });
  const controller = new AuthController(service);

  return {
    repository,
    passwordService,
    tokenService,
    service,
    controller,
    legacyRouter: createLegacyAuthRouter(controller),
  };
}

export { AuthController } from './auth.controller.js';
export type { AuthRepository } from './auth.repository.js';
export { SqliteAuthRepository } from './auth.sqlite-repository.js';
export { createLegacyAuthRouter } from './auth.routes.js';
export { AuthService } from './auth.service.js';
export { BcryptPasswordService } from './password.service.js';
export {
  LegacyJwtTokenService,
  createAccessTokenV1,
  signToken,
  verifyAccessTokenV1,
  verifyToken,
} from './token.service.js';
export { RefreshTokenService } from './refresh/refresh-token.service.js';
export type { RefreshTokenRepository } from './refresh/refresh-token.repository.js';
export { SqliteRefreshTokenRepository } from './refresh/refresh-token.sqlite-repository.js';
export { SessionService } from './session/session.service.js';
export type { SessionRepository } from './session/session.repository.js';
export { SqliteSessionRepository } from './session/session.sqlite-repository.js';
export { AuthServiceError } from './auth.types.js';
export { readAuthRolloutConfig, type AuthRolloutConfig, type AuthRolloutMode } from './rollout/auth-rollout.config.js';
export { AuthRolloutService } from './rollout/auth-rollout.service.js';
export { AuthMigrationMetrics, authMigrationMetrics } from './rollout/auth-migration.metrics.js';
export { AuthMigrationLogger, authMigrationLogger } from './rollout/auth-migration.logger.js';
export { AuthMigrationMetricsService } from './rollout/auth-migration-metrics.service.js';
export { AuthRolloutStatusService } from './rollout/auth-rollout.status.service.js';
export { AuthRolloutAuditService } from './rollout/auth-rollout-audit.service.js';
export { AuthRolloutRiskService } from './rollout/auth-rollout-risk.service.js';
export { readAuthRolloutThresholdConfig } from './rollout/auth-rollout-threshold.config.js';
export * from './events/index.js';
