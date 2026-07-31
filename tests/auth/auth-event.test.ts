import assert from 'node:assert/strict';
import { AuthEventService } from '../../api/modules/auth/events/auth-event.service.js';
import { AuthMetricsService } from '../../api/modules/auth/events/auth-metrics.service.js';
import { MemoryAuthMetricsExporter } from '../../api/modules/auth/events/auth-metrics.memory.js';

const exported = new MemoryAuthMetricsExporter();
const logged: Record<string, unknown>[] = [];
let eventSequence = 0;
const events = new AuthEventService(
  [exported],
  (event) => logged.push(event),
  () => `auth-event-${++eventSequence}`,
);
const metrics = new AuthMetricsService(events);
const at = (minute: number) => new Date(`2026-07-31T06:${String(minute).padStart(2, '0')}:00.000Z`);

const login = metrics.countLoginSuccess({
  requestId: 'request-login', userId: 25, sessionId: 'session-25', mode: 'v1-web', clientType: 'web', createdAt: at(1),
});
assert.equal(login.eventType, 'auth.login.success');
metrics.recordSessionCreated({ userId: 25, sessionId: 'session-25', mode: 'v1-web', clientType: 'web', createdAt: at(1) });
metrics.recordRolloutDecision({ userId: 25, mode: 'v1-web', clientType: 'web', success: true, reason: 'allowlist', createdAt: at(1) });

let aggregate = metrics.aggregate(60, at(30));
assert.equal(aggregate.counters.v1_login_count, 1, 'session and rollout events must not duplicate login metrics');
assert.equal(aggregate.categories.login, 1);

metrics.countRefreshSuccess({ requestId: 'request-refresh', userId: 25, sessionId: 'session-25', mode: 'v1-web', clientType: 'web', createdAt: at(2) });
metrics.countLogoutSuccess({ requestId: 'request-logout', userId: 25, sessionId: 'session-25', mode: 'v1-web', clientType: 'web', createdAt: at(3) });
metrics.recordSessionRevoked({ userId: 25, sessionId: 'session-25', mode: 'v1-web', clientType: 'web', reason: 'logout', createdAt: at(3) });
metrics.countTokenReuse({ requestId: 'request-reuse', userId: 25, mode: 'v1-web', clientType: 'web', reason: 'refresh_reused', createdAt: at(4) });
metrics.countCsrfFailed({ requestId: 'request-csrf', userId: 25, mode: 'v1-web', clientType: 'web', reason: 'csrf_failed', createdAt: at(5) });

aggregate = metrics.aggregate(60, at(30));
assert.equal(aggregate.counters.refresh_success, 1);
assert.equal(aggregate.counters.refresh_failed, 2);
assert.equal(aggregate.counters.token_reuse_detected, 1);
assert.equal(aggregate.counters.csrf_failed, 1);
assert.equal(aggregate.counters.logout_success, 1);
assert.equal(aggregate.categories.securityEvents, 2);
assert.equal(metrics.aggregate(5, at(30)).counters.v1_login_count, 0);
assert.equal(metrics.aggregate(24 * 60, at(30)).counters.v1_login_count, 1);
assert.equal(exported.list().filter((point) => point.name === 'v1_login_count').length, 1);

events.record({
  eventType: 'auth.login.failed', mode: 'legacy', clientType: 'web', success: false, reason: 'invalid_credentials',
  createdAt: at(6), accessToken: 'must-not-appear', refreshToken: 'must-not-appear', password: 'must-not-appear', cookie: 'must-not-appear',
} as never);
const serialized = JSON.stringify(logged);
for (const secret of ['must-not-appear', 'accessToken', 'refreshToken', 'password', 'cookie']) {
  assert.equal(serialized.includes(secret), false);
}

events.reset();
exported.reset();
for (let index = 0; index < 6; index += 1) {
  const createdAt = new Date(at(10).getTime() + index * 1000);
  metrics.recordRolloutDecision({ userId: 25 + (index % 3), mode: 'v1-web', clientType: 'web', success: true, reason: 'allowlist', createdAt });
  metrics.recordSessionCreated({ userId: 25 + (index % 3), sessionId: `gray-session-${index}`, mode: 'v1-web', clientType: 'web', createdAt });
  metrics.countLoginSuccess({ userId: 25 + (index % 3), sessionId: `gray-session-${index}`, mode: 'v1-web', clientType: 'web', createdAt });
}
const grayRegression = metrics.aggregate(60, at(30));
assert.equal(grayRegression.counters.v1_login_count, 6);
assert.equal(events.list().filter((event) => event.eventType === 'auth.login.success').length, 6);
assert.equal(events.list().length, 18, 'business events stay distinct while login metric remains exact');

console.log('Auth unified event and metrics tests passed');
