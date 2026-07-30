import { mapLegacyLoginResult } from './auth.mapper.js';
import type { PasswordService } from './password.service.js';
import type { AuthRepository } from './auth.repository.js';
import type { TokenService } from './token.service.js';
import { AuthServiceError, type LegacyLoginInput, type LegacyLoginResult } from './auth.types.js';

export type AuthServiceDependencies = {
  repository: AuthRepository;
  passwordService: PasswordService;
  tokenService: TokenService;
};

export class AuthService {
  constructor(private readonly dependencies: AuthServiceDependencies) {}

  async login(input: LegacyLoginInput): Promise<LegacyLoginResult> {
    const { username, password } = input;
    if (!username || !password) {
      throw new AuthServiceError('MISSING_CREDENTIALS');
    }

    const user = await this.dependencies.repository.findUserByUsername(username);
    if (!user) {
      throw new AuthServiceError('INVALID_CREDENTIALS');
    }
    if (!user.enabled) {
      throw new AuthServiceError('ACCOUNT_DISABLED');
    }

    const isValid = await this.dependencies.passwordService.verify(password, user.password);
    if (!isValid) {
      throw new AuthServiceError('INVALID_CREDENTIALS');
    }

    const token = this.dependencies.tokenService.sign({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    await this.dependencies.repository.recordLogin(user);
    return mapLegacyLoginResult(user, token);
  }
}
