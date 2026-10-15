import type { AuthUserRecord } from './auth.types.js';

export interface AuthRepository {
  findUserByUsername(username: unknown): Promise<AuthUserRecord | null>;
  findUserById(userId: number): Promise<AuthUserRecord | null>;
  changePasswordAndAudit(userId: number, passwordHash: string): Promise<void>;
  revokeLegacyTokens(userId: number): Promise<void>;
  updateProfileAndAudit(userId: number, profile: { name: string; email: string }): Promise<void>;
  writeActivityLog(userId: number, action: string, target: string, detail: string): Promise<void>;
  recordLogin(user: Pick<AuthUserRecord, 'id' | 'name'>): Promise<void>;
}
