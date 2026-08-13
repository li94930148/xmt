import { mapLegacyCurrentUser, mapLegacyLoginResult } from './auth.mapper.js';
import type { PasswordService } from './password.service.js';
import type { AuthRepository } from './auth.repository.js';
import type { TokenService } from './token.service.js';
import {
  AuthServiceError,
  type LegacyChangePasswordInput,
  type LegacyCurrentUserResult,
  type LegacyLoginInput,
  type LegacyLoginResult,
  type LegacyUpdateProfileInput,
} from './auth.types.js';

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

  async getCurrentUser(userId?: number): Promise<LegacyCurrentUserResult> {
    if (!userId) {
      throw new AuthServiceError('INVALID_CREDENTIALS');
    }

    const user = await this.dependencies.repository.findUserById(userId);
    if (!user) {
      throw new AuthServiceError('USER_NOT_FOUND');
    }
    if (!user.enabled) {
      throw new AuthServiceError('ACCOUNT_DISABLED');
    }

    return mapLegacyCurrentUser(user);
  }

  async changePassword(input: LegacyChangePasswordInput): Promise<void> {
    const { userId, oldPassword, newPassword } = input;
    if (!userId) {
      throw new AuthServiceError('INVALID_CREDENTIALS');
    }
    if (!oldPassword || !newPassword) {
      throw new AuthServiceError('MISSING_PASSWORDS');
    }
    if ((newPassword as { length?: number }).length! < 6) {
      throw new AuthServiceError('NEW_PASSWORD_TOO_SHORT');
    }

    const user = await this.dependencies.repository.findUserById(userId);
    if (!user) {
      throw new AuthServiceError('USER_NOT_FOUND');
    }

    const isValid = await this.dependencies.passwordService.verify(oldPassword, user.password);
    if (!isValid) {
      throw new AuthServiceError('OLD_PASSWORD_INCORRECT');
    }

    const passwordHash = await this.dependencies.passwordService.hash(newPassword);
    await this.dependencies.repository.updatePassword(userId, passwordHash);
    await this.dependencies.repository.clearForceChangePassword(userId);
    await this.dependencies.repository.writeActivityLog(userId, 'change_password', 'auth', '用户修改了密码');
  }

  async updateProfile(input: LegacyUpdateProfileInput): Promise<LegacyCurrentUserResult> {
    if (!input.userId) throw new AuthServiceError('INVALID_CREDENTIALS');
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const email = typeof input.email === 'string' ? input.email.trim() : '';
    if (!name || name.length > 100 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw new AuthServiceError('INVALID_PROFILE');
    }
    const user = await this.dependencies.repository.findUserById(input.userId);
    if (!user) throw new AuthServiceError('USER_NOT_FOUND');
    if (!user.enabled) throw new AuthServiceError('ACCOUNT_DISABLED');
    await this.dependencies.repository.updateProfile(user.id, { name, email });
    await this.dependencies.repository.writeActivityLog(user.id, 'update_profile', 'auth', '用户更新了个人资料');
    return this.getCurrentUser(user.id);
  }

  async logout(): Promise<void> {
    // Legacy logout intentionally has no server-side token or session state.
  }
}
