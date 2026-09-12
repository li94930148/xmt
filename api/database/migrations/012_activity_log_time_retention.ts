import { ACTIVITY_LOG_RETENTION_DAYS } from '../../services/activity-log';
import { formatBjtDatabase, nowBjt } from '../../../shared/time';
import type { DatabaseMigration } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const activityLogTimeRetentionMigration: DatabaseMigration = {
  version: '012',
  name: 'activity_log_time_retention',
  checksum: '012-activity-log-time-retention-v3',
  async up(executor) {
    // Every existing activity_log writer relied on SQLite CURRENT_TIMESTAMP, so
    // these offset-free historical values are known UTC values rather than
    // ambiguous Beijing civil time.
    await executor.execute(`
      UPDATE activity_log
      SET created_at = datetime(created_at, '+8 hours')
      WHERE created_at IS NOT NULL
    `);

    await executor.execute(`
      CREATE TABLE IF NOT EXISTS user_login_days (
        user_id INTEGER NOT NULL,
        login_date DATE NOT NULL,
        PRIMARY KEY (user_id, login_date),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await executor.execute(`
      INSERT OR IGNORE INTO user_login_days (user_id, login_date)
      SELECT al.user_id, date(al.created_at)
      FROM activity_log al
      INNER JOIN users u ON u.id = al.user_id
      WHERE al.action = 'login' AND al.user_id IS NOT NULL AND al.created_at IS NOT NULL
    `);

    const cutoff = formatBjtDatabase(new Date(nowBjt().getTime() - ACTIVITY_LOG_RETENTION_DAYS * DAY_MS));
    await executor.execute({
      sql: `DELETE FROM activity_log WHERE created_at < ?`,
      args: [cutoff],
    });

    // All current writers supply Beijing civil time explicitly. Basing cleanup
    // on the newest stored record also makes direct inserts obey the same limit
    // without depending on the host machine timezone.
    await executor.execute(`
      CREATE TRIGGER IF NOT EXISTS trg_activity_log_retain_7_days
      AFTER INSERT ON activity_log
      BEGIN
        DELETE FROM activity_log
        WHERE created_at < datetime(
          (SELECT MAX(created_at) FROM activity_log),
          '-${ACTIVITY_LOG_RETENTION_DAYS} days'
        );
      END
    `);
    await executor.execute(`
      CREATE TRIGGER IF NOT EXISTS trg_activity_log_login_day
      AFTER INSERT ON activity_log
      WHEN NEW.action = 'login' AND NEW.user_id IS NOT NULL AND NEW.created_at IS NOT NULL
      BEGIN
        INSERT OR IGNORE INTO user_login_days (user_id, login_date)
        VALUES (NEW.user_id, date(NEW.created_at));
      END
    `);
  },
};
