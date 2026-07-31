import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-auth-rollout-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'auth-rollout.test.db');
process.env.JWT_SECRET = 'auth-rollout-legacy-jwt-secret';

const {
  readAuthRolloutConfig,
} = await import('../../api/modules/auth/rollout/auth-rollout.config.js');
const { AuthRolloutService } = await import('../../api/modules/auth/rollout/auth-rollout.service.js');
const {
  AuthMigrationMetrics,
  AUTH_MIGRATION_METRIC_NAMES,
} = await import('../../api/modules/auth/rollout/auth-migration.metrics.js');
const { AuthMigrationLogger } = await import('../../api/modules/auth/rollout/auth-migration.logger.js');
const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { executeInsert, queryOne } = await import('../../api/database/utils.js');
const { signToken, verifyToken } = await import('../../api/modules/auth/token.service.js');

function service(env: NodeJS.ProcessEnv) {
  return new AuthRolloutService(readAuthRolloutConfig({ NODE_ENV: 'test', ...env }));
}

assert.equal(service({ XMT_AUTH_ROLLOUT_MODE: 'disabled' }).shouldUseWebAuth({ id: 7 }), false);
assert.equal(service({ XMT_AUTH_ROLLOUT_MODE: 'legacy' }).shouldUseWebAuth({ id: 7 }), false);

const allowlist = service({
  XMT_AUTH_ROLLOUT_MODE: 'allowlist',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7,9',
});
assert.equal(allowlist.shouldUseWebAuth({ id: 7 }), true);
assert.equal(allowlist.shouldUseWebAuth({ id: 8 }), false);

const internal = service({
  XMT_AUTH_ROLLOUT_MODE: 'internal',
  XMT_AUTH_ROLLOUT_INTERNAL_USER_IDS: '11',
});
assert.equal(internal.shouldUseWebAuth({ id: 11 }), true);
assert.equal(internal.shouldUseWebAuth({ id: 12 }), false);
assert.equal(internal.shouldUseWebAuth({ id: 12, internal: true }), true);

const percentage = service({
  XMT_AUTH_ROLLOUT_MODE: 'percentage',
  XMT_AUTH_ROLLOUT_PERCENTAGE: '35',
  XMT_AUTH_ROLLOUT_HASH_SALT: 'stable-test-salt',
});
for (let userId = 1; userId <= 100; userId += 1) {
  assert.equal(
    percentage.shouldUseWebAuth({ id: userId }),
    percentage.shouldUseWebAuth({ id: userId }),
  );
}
const allocation = Array.from({ length: 100 }, (_, index) => percentage.shouldUseWebAuth({ id: index + 1 }));
assert(allocation.some(Boolean));
assert(allocation.some((eligible) => !eligible));

assert.equal(readAuthRolloutConfig({
  NODE_ENV: 'test',
  XMT_AUTH_V1_ENABLED: 'true',
  XMT_AUTH_WEB_ENABLED: 'true',
}).mode, 'allowlist');
assert.equal(readAuthRolloutConfig({
  NODE_ENV: 'production',
  XMT_AUTH_ROLLOUT_MODE: 'percentage',
  XMT_AUTH_ROLLOUT_PERCENTAGE: '100',
}).mode, 'legacy');

const metrics = new AuthMigrationMetrics();
for (const name of AUTH_MIGRATION_METRIC_NAMES) metrics.increment(name);
assert.deepEqual(Object.values(metrics.snapshot()), Array(AUTH_MIGRATION_METRIC_NAMES.length).fill(1));
metrics.reset();
assert.deepEqual(Object.values(metrics.snapshot()), Array(AUTH_MIGRATION_METRIC_NAMES.length).fill(0));

const events: Record<string, unknown>[] = [];
const logger = new AuthMigrationLogger((event) => events.push(event));
logger.record({
  event: 'auth.migration.rollback',
  requestId: 'rollout-test-request',
  userId: 7,
  mode: 'v1-web',
  outcome: 'success',
  reason: 'config_rollback',
});
assert.equal(events.length, 1);
assert.equal(JSON.stringify(events).includes('token'), false);

await initDatabase();
try {
  const userId = await executeInsert(
    `INSERT INTO users (username, password, email, role, name, enabled, force_change_password)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['rollout-user', 'unused-hash', 'rollout@example.invalid', 'member', 'Rollout User', 1, 0],
  );
  await executeInsert(
    `INSERT INTO auth_sessions (
      id, user_id, client_type, device_name, user_agent_summary, app_version,
      created_at, last_seen_at, idle_expires_at, absolute_expires_at
    ) VALUES (?, ?, 'web', NULL, NULL, NULL, datetime('now'), datetime('now'), datetime('now', '+1 day'), datetime('now', '+7 days'))`,
    ['rollout-session', userId],
  );

  assert.equal(service({
    XMT_AUTH_ROLLOUT_MODE: 'allowlist',
    XMT_AUTH_WEB_ALLOWLIST_USER_IDS: String(userId),
  }).shouldUseWebAuth({ id: userId }), true);
  assert.equal(service({ XMT_AUTH_ROLLOUT_MODE: 'legacy' }).shouldUseWebAuth({ id: userId }), false);

  const retained = await queryOne<{ id: string }>('SELECT id FROM auth_sessions WHERE id = ?', ['rollout-session']);
  assert.equal(retained?.id, 'rollout-session');
  const legacyToken = signToken({ userId, username: 'rollout-user', role: 'member' });
  assert.equal(verifyToken(legacyToken)?.userId, userId);
} finally {
  await closeDatabase();
  fs.rmSync(tempDirectory, { recursive: true, force: true });
}

console.log('Auth rollout governance tests passed');
