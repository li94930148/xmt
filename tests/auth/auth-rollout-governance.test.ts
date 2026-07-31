import assert from 'node:assert/strict';
import { AuthMigrationMetrics } from '../../api/modules/auth/rollout/auth-migration.metrics.js';
import { AuthMigrationMetricsService } from '../../api/modules/auth/rollout/auth-migration-metrics.service.js';
import { readAuthRolloutConfig } from '../../api/modules/auth/rollout/auth-rollout.config.js';
import { AuthRolloutAuditService } from '../../api/modules/auth/rollout/auth-rollout-audit.service.js';
import { AuthRolloutRiskService } from '../../api/modules/auth/rollout/auth-rollout-risk.service.js';
import { AuthRolloutStatusService } from '../../api/modules/auth/rollout/auth-rollout.status.service.js';
import { readAuthRolloutThresholdConfig } from '../../api/modules/auth/rollout/auth-rollout-threshold.config.js';

const percentageConfig = readAuthRolloutConfig({
  NODE_ENV: 'test',
  XMT_AUTH_ROLLOUT_MODE: 'percentage',
  XMT_AUTH_ROLLOUT_PERCENTAGE: '25',
  XMT_AUTH_ROLLOUT_HASH_SALT: 'governance-test',
});
const statusService = new AuthRolloutStatusService(percentageConfig);
const diagnostic = statusService.diagnose({ id: 42 });
assert.equal(diagnostic.mode, 'percentage');
assert.equal(typeof diagnostic.enabled, 'boolean');
assert(['percentage', 'none'].includes(diagnostic.matchedRule));
assert.match(diagnostic.reason, /稳定分桶/);
assert.deepEqual(statusService.current(), {
  mode: 'percentage',
  enabled: true,
  percentage: 25,
  allowlistCount: 0,
  internalCount: 0,
});

const metrics = new AuthMigrationMetrics();
const metricsService = new AuthMigrationMetricsService(metrics);
const now = new Date('2026-07-31T02:00:00.000Z');
metrics.increment('legacy_login_count', new Date('2026-07-31T01:30:00.000Z'));
metrics.increment('v1_login_count', new Date('2026-07-31T01:40:00.000Z'));
metrics.increment('refresh_success', new Date('2026-07-31T01:45:00.000Z'));
metrics.increment('refresh_failed', new Date('2026-07-31T01:46:00.000Z'));
metrics.increment('csrf_failed', new Date('2026-07-31T01:47:00.000Z'));
metrics.increment('logout_success', new Date('2026-07-31T01:50:00.000Z'));
metrics.increment('expired_count', new Date('2026-07-30T22:00:00.000Z'));

const lastHour = metricsService.aggregate(60, now);
assert.deepEqual(lastHour.categories, { login: 2, refresh: 1, logout: 1, failure: 2 });
assert.equal(lastHour.refreshFailureRate, 0.5);
assert.equal(lastHour.counters.expired_count, 0);
assert.equal(metricsService.aggregate(24 * 60, now).counters.expired_count, 1);

const audit = new AuthRolloutAuditService();
const before = statusService.current();
const legacyConfig = readAuthRolloutConfig({ NODE_ENV: 'test', XMT_AUTH_ROLLOUT_MODE: 'legacy' });
const after = new AuthRolloutStatusService(legacyConfig).current();
audit.record({
  actor: 'operator-7',
  action: 'rollback',
  before,
  after,
  reason: 'Refresh 失败率超过停止条件',
}, now);
assert.deepEqual(audit.list(1)[0], {
  actor: 'operator-7',
  action: 'rollback',
  before,
  after,
  reason: 'Refresh 失败率超过停止条件',
  created_at: now.toISOString(),
});
assert.equal(new AuthRolloutStatusService(legacyConfig).diagnose({ id: 42 }).enabled, false);

const thresholds = readAuthRolloutThresholdConfig({
  XMT_AUTH_ROLLOUT_THRESHOLD_WINDOW_MINUTES: '60',
  XMT_AUTH_ROLLOUT_MAX_REFRESH_FAILURE_RATE: '0.4',
  XMT_AUTH_ROLLOUT_MAX_CSRF_FAILURES: '0',
  XMT_AUTH_ROLLOUT_MAX_TOKEN_REUSE: '0',
  XMT_AUTH_ROLLOUT_MAX_EXPIRED: '0',
});
const risk = new AuthRolloutRiskService(metricsService, thresholds).evaluate(now);
assert.equal(risk.status, 'risk');
assert(risk.risks.some((event) => event.code === 'REFRESH_FAILURE_RATE'));
assert(risk.risks.some((event) => event.code === 'CSRF_FAILURES'));
assert.equal(JSON.stringify(risk).toLowerCase().includes('token原文'), false);

console.log('Auth rollout governance runtime tests passed');
