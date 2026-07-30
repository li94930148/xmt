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

  async recordLogin(user: Pick<AuthUserRecord, 'id' | 'name'>): Promise<void> {
    await execute('INSERT INTO activity_log (user_id, action, target, detail) VALUES (?, ?, ?, ?)', [
      user.id,
      'login',
      'auth',
      `用户 ${user.name} 登录系统`,
    ]);
  }
}
