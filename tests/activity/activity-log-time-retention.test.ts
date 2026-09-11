import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { activityLogTimeRetentionMigration } from '../../api/database/migrations/012_activity_log_time_retention';
import { activityLogCutoffTimestamp, serializeActivityLog } from '../../api/services/activity-log';
import { formatBjtDatabase } from '../../shared/time';

const DAY_MS = 24 * 60 * 60 * 1000;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-activity-log-'));
const dbPath = path.join(tempDir, 'activity-log.db');
const db = createClient({ url: `file:${dbPath}` });

try {
  await db.execute(`
    CREATE TABLE activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT,
      target TEXT,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute(`CREATE TABLE users (id INTEGER PRIMARY KEY)`);
  await db.execute(`INSERT INTO users(id) VALUES (1)`);

  const now = Date.now();
  const recentInstant = new Date(now - 2 * DAY_MS);
  const expiredInstant = new Date(now - 8 * DAY_MS);
  const sqliteUtc = (value: Date) => value.toISOString().slice(0, 19).replace('T', ' ');

  await db.execute({
    sql: `INSERT INTO activity_log(user_id, action, created_at) VALUES (1, 'login', ?), (1, 'expired', ?)`,
    args: [sqliteUtc(recentInstant), sqliteUtc(expiredInstant)],
  });

  await activityLogTimeRetentionMigration.up(db);

  const migrated = await db.execute(`SELECT action, created_at FROM activity_log ORDER BY id`);
  assert.equal(migrated.rows.length, 1, 'migration removes activity logs older than seven days');
  assert.equal(migrated.rows[0].action, 'login');
  assert.equal(migrated.rows[0].created_at, formatBjtDatabase(recentInstant));
  const loginDays = await db.execute(`SELECT user_id, login_date FROM user_login_days`);
  assert.deepEqual(loginDays.rows, [{ user_id: 1, login_date: formatBjtDatabase(recentInstant).slice(0, 10) }]);

  const latest = formatBjtDatabase(new Date(now));
  const tooOld = formatBjtDatabase(new Date(now - 8 * DAY_MS));
  await db.execute({
    sql: `INSERT INTO activity_log(user_id, action, created_at) VALUES (1, 'latest', ?), (1, 'too-old', ?)`,
    args: [latest, tooOld],
  });
  const retained = await db.execute(`SELECT action FROM activity_log ORDER BY id`);
  assert.deepEqual(retained.rows.map((row) => row.action), ['login', 'latest']);

  await db.execute({
    sql: `INSERT INTO activity_log(user_id, action, created_at) VALUES (1, 'login', ?)`,
    args: [latest],
  });
  const updatedLoginDays = await db.execute(`SELECT login_date FROM user_login_days ORDER BY login_date`);
  assert.deepEqual(updatedLoginDays.rows.map((row) => row.login_date), [
    formatBjtDatabase(recentInstant).slice(0, 10),
    latest.slice(0, 10),
  ]);

  const serialized = serializeActivityLog({ id: 1, created_at: '2026-09-11 16:00:00' });
  assert.equal(serialized.created_at, '2026-09-11T16:00:00+08:00');
  assert.ok(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(activityLogCutoffTimestamp()));
  assert.equal(serializeActivityLog({ created_at: null }).created_at, '');

  console.log('Activity log time and retention tests passed');
} finally {
  db.close();
  await new Promise((resolve) => setTimeout(resolve, 50));
  fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
}
