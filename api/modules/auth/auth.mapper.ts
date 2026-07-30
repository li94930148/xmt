import type { AuthUserRecord, LegacyCurrentUserResult, LegacyLoginResult } from './auth.types.js';

export function mapLegacyLoginResult(user: AuthUserRecord, token: string): LegacyLoginResult {
  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      force_change_password: user.forceChangePassword,
    },
    token,
    forceChangePassword: user.forceChangePassword,
  };
}

export function mapLegacyCurrentUser(user: AuthUserRecord): LegacyCurrentUserResult {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    enabled: true,
    force_change_password: user.forceChangePassword,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}
