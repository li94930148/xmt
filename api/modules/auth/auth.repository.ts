import type { AuthUserRecord } from './auth.types.js';

export interface AuthRepository {
  findUserByUsername(username: unknown): Promise<AuthUserRecord | null>;
  recordLogin(user: Pick<AuthUserRecord, 'id' | 'name'>): Promise<void>;
}
