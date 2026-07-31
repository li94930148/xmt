import type { AuthUserRecord } from '../auth.types.js';
import type { AuthRefreshTokenRecord, AuthSessionRecord } from '../session/session.types.js';

export type CreateAuthWebLoginInput = {
  user: Pick<AuthUserRecord, 'id' | 'name'>;
  session: AuthSessionRecord;
  refreshToken: AuthRefreshTokenRecord;
};

export interface AuthWebLoginRepository {
  createLogin(input: CreateAuthWebLoginInput): Promise<void>;
}
