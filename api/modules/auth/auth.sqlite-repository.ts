import { execute, queryOne, runInTransaction } from '../../database/utils.js';
import type { AuthRepository } from './auth.repository.js';
import type { AuthUserRecord } from './auth.types.js';
import { activityLogTimestamp } from '../../services/activity-log.js';

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
      authVersion: Number(record.auth_version ?? 1),
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
      authVersion: Number(record.auth_version ?? 1),
      createdAt: String(record.created_at),
      updatedAt: String(record.updated_at),
    };
  }

  async changePasswordAndAudit(userId: number, passwordHash: string): Promise<void> {
    await runInTransaction(async (tx) => {
      const updated = await tx.execute(
        "UPDATE users SET password = ?, force_change_password = 0, auth_version = auth_version + 1, updated_at = datetime('now', '+8 hours') WHERE id = ?",
        [passwordHash, userId],
      );
      if (!updated) throw new Error('AUTH_PASSWORD_TARGET_MISSING');
      await tx.execute('INSERT INTO activity_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)', [
        userId, 'change_password', 'auth', '用户修改了密码', activityLogTimestamp(),
      ]);
    });
  }

  async revokeLegacyTokens(userId: number): Promise<void> {
    await execute("UPDATE users SET auth_version = auth_version + 1, updated_at = datetime('now', '+8 hours') WHERE id = ?", [userId]);
  }

  async updateProfileAndAudit(userId: number, profile: { name: string; email: string }): Promise<void> {
    await runInTransaction(async (tx) => {
      const updated = await tx.execute(
        "UPDATE users SET name = ?, email = ?, updated_at = datetime('now', '+8 hours') WHERE id = ?",
        [profile.name, profile.email, userId],
      );
      if (!updated) throw new Error('AUTH_PROFILE_TARGET_MISSING');
      await tx.execute('INSERT INTO activity_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)', [
        userId, 'update_profile', 'auth', '用户更新了个人资料', activityLogTimestamp(),
      ]);
    });
  }

  async writeActivityLog(userId: number, action: string, target: string, detail: string): Promise<void> {
    await execute('INSERT INTO activity_log (user_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)', [
      userId,
      action,
      target,
      detail,
      activityLogTimestamp(),
    ]);
  }

  async recordLogin(user: Pick<AuthUserRecord, 'id' | 'name'>): Promise<void> {
    await this.writeActivityLog(user.id, 'login', 'auth', `用户 ${user.name} 登录系统`);
  }
}
