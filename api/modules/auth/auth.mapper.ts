import type { AuthUserRecord, LegacyLoginResult } from './auth.types.js';

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
