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

export type AuthServiceErrorCode =
  | 'MISSING_CREDENTIALS'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_DISABLED';

export class AuthServiceError extends Error {
  constructor(public readonly code: AuthServiceErrorCode) {
    super(code);
    this.name = 'AuthServiceError';
  }
}
