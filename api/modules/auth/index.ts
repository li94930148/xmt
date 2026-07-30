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
export { LegacyJwtTokenService, signToken, verifyToken } from './token.service.js';
export { AuthServiceError } from './auth.types.js';
