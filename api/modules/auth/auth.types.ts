import type { User, UserRole } from '../../types/index.js';

export type AuthUserRecord = {
  id: number;
  username: string;
  password: string;
  email: string;
  role: UserRole;
  name: string;
  enabled: boolean;
  forceChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LegacyLoginInput = {
  username?: unknown;
  password?: unknown;
  remember?: unknown;
};

export type LegacyLoginResult = {
  user: Pick<User, 'id' | 'username' | 'name' | 'email' | 'role'> & {
    force_change_password: boolean;
  };
  token: string;
  forceChangePassword: boolean;
};

export type LegacyCurrentUserResult = Pick<
  User,
  'id' | 'username' | 'name' | 'email' | 'role' | 'enabled' | 'created_at' | 'updated_at'
> & {
  force_change_password: boolean;
};

export type LegacyChangePasswordInput = {
  userId?: number;
  oldPassword?: unknown;
  newPassword?: unknown;
};

export type LegacyUpdateProfileInput = {
  userId?: number;
  name?: unknown;
  email?: unknown;
};

export type AuthServiceErrorCode =
  | 'MISSING_CREDENTIALS'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED'
  | 'USER_NOT_FOUND'
  | 'MISSING_PASSWORDS'
  | 'NEW_PASSWORD_TOO_SHORT'
  | 'OLD_PASSWORD_INCORRECT'
  | 'INVALID_PROFILE';

export class AuthServiceError extends Error {
  constructor(public readonly code: AuthServiceErrorCode) {
    super(code);
    this.name = 'AuthServiceError';
  }
}
