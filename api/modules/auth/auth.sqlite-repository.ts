import { execute, queryOne } from '../../database/utils.js';
import type { AuthRepository } from './auth.repository.js';
import type { AuthUserRecord } from './auth.types.js';

export class SqliteAuthRepository implements AuthRepository {
  async findUserByUsername(username: unknown): Promise<AuthUserRecord | null> {
    const result = await queryOne('SELECT * FROM users WHERE username = ?', [username]);
    if (!result) return null;

    const record = result as Record<string, unknown>;
    return {
      id: Number(record.id),
      username: String(record.username),
      password: String(record.password),
      email: String(record.email),
      role: String(record.role),
      name: String(record.name),
      enabled: Number(record.enabled) === 1,
      forceChangePassword: Number(record.force_change_password) === 1,
      createdAt: String(record.created_at),
      updatedAt: String(record.updated_at),
    };
  }

  async findUserById(userId: number): Promise<AuthUserRecord | null> {
    const result = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);
    if (!result) return null;

    const record = result as Record<string, unknown>;
    return {
      id: Number(record.id),
      username: String(record.username),
      password: String(record.password),
      email: String(record.email),
      role: String(record.role),
      name: String(record.name),
      enabled: Number(record.enabled) === 1,
      forceChangePassword: Number(record.force_change_password) === 1,
      createdAt: String(record.created_at),
      updatedAt: String(record.updated_at),
    };
  }

  async updatePassword(userId: number, passwordHash: string): Promise<void> {
    await execute("UPDATE users SET password = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?", [
      passwordHash,
      userId,
    ]);
  }

  async updateProfile(userId: number, profile: { name: string; email: string }): Promise<void> {
    await execute("UPDATE users SET name = ?, email = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?", [
      profile.name,
      profile.email,
      userId,
    ]);
  }

  async clearForceChangePassword(userId: number): Promise<void> {
    await execute('UPDATE users SET force_change_password = 0 WHERE id = ?', [userId]);
  }

  async writeActivityLog(userId: number, action: string, target: string, detail: string): Promise<void> {
    await execute('INSERT INTO activity_log (user_id, action, target, detail) VALUES (?, ?, ?, ?)', [
      userId,
      action,
      target,
      detail,
    ]);
  }

  async recordLogin(user: Pick<AuthUserRecord, 'id' | 'name'>): Promise<void> {
    await this.writeActivityLog(user.id, 'login', 'auth', `用户 ${user.name} 登录系统`);
  }
}
