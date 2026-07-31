import assert from 'node:assert/strict';
import { AuthEventService } from '../../api/modules/auth/events/auth-event.service.js';
import { AuthMetricsService } from '../../api/modules/auth/events/auth-metrics.service.js';
import { MemoryAuthMetricsExporter } from '../../api/modules/auth/events/auth-metrics.memory.js';
import { AuthMetricsRegistry } from '../../api/modules/auth/metrics/auth-metrics.registry.js';
import { PrometheusAuthMetricsExporter } from '../../api/modules/auth/metrics/prometheus/prometheus-auth-metrics.exporter.js';
import {
  OpenTelemetryAuthExporter,
  type OpenTelemetryMeterAdapter,
} from '../../api/modules/auth/metrics/otel/opentelemetry-auth.exporter.js';

const memory = new MemoryAuthMetricsExporter();
const prometheus = new PrometheusAuthMetricsExporter('test-instance');
const otelCalls: Array<{ operation: string; name: string; value: number; labels: Readonly<Record<string, string>> }> = [];
const meter: OpenTelemetryMeterAdapter = {
  createCounter: (name) => ({ add: (value, labels = {}) => otelCalls.push({ operation: 'add', name, value, labels }) }),
  createHistogram: (name) => ({ record: (value, labels = {}) => otelCalls.push({ operation: 'record', name, value, labels }) }),
  createGauge: (name) => ({ record: (value, labels = {}) => otelCalls.push({ operation: 'gauge', name, value, labels }) }),
};
const otel = new OpenTelemetryAuthExporter(meter, 'test-instance');
const registry = new AuthMetricsRegistry([memory, prometheus, otel]);
const events = new AuthEventService([registry], () => undefined, () => 'event-id');
const metrics = new AuthMetricsService(events);

metrics.recordSessionCreated({ userId: 25, sessionId: 'session-1', mode: 'v1-web', clientType: 'web' });
metrics.countLoginSuccess({ userId: 25, sessionId: 'session-1', mode: 'v1-web', clientType: 'web' });
metrics.countRefreshSuccess({ userId: 25, sessionId: 'session-1', mode: 'v1-web', clientType: 'web', durationSeconds: 0.12 });
metrics.countCsrfFailed({ userId: 25, sessionId: 'session-1', mode: 'v1-web', clientType: 'web', reason: 'csrf_failed' });
metrics.countLogoutSuccess({ userId: 25, sessionId: 'session-1', mode: 'v1-web', clientType: 'web' });
metrics.recordSessionRevoked({ userId: 25, sessionId: 'session-1', mode: 'v1-web', clientType: 'web', reason: 'logout' });

assert.equal(memory.list().filter((point) => point.name === 'v1_login_count').length, 1, 'memory exporter stays compatible');
assert.equal(memory.list().filter((point) => point.name === 'security_events').length, 1);

const output = prometheus.metrics();
assert.match(output, /xmt_auth_login_total\{instance="test-instance",mode="v1-web"\} 1/);
assert.match(output, /xmt_auth_refresh_total\{instance="test-instance",mode="v1-web"\} 1/);
assert.match(output, /xmt_auth_refresh_failed_total\{instance="test-instance",mode="v1-web"\} 1/);
assert.match(output, /xmt_auth_logout_total\{instance="test-instance",mode="v1-web"\} 1/);
assert.match(output, /xmt_auth_security_events_total\{eventType="auth\.csrf\.failed",instance="test-instance",mode="v1-web",reason="csrf_failed"\} 1/);
assert.match(output, /xmt_auth_active_sessions\{instance="test-instance",mode="v1-web"\} 0/);
assert.match(output, /xmt_auth_refresh_duration_seconds_count\{instance="test-instance",mode="v1-web"\} 1/);
assert.match(output, /xmt_auth_refresh_duration_seconds_sum\{instance="test-instance",mode="v1-web"\} 0\.12/);

assert.equal(otelCalls.filter((call) => call.name === 'xmt_auth_login_total').length, 1);
assert.equal(otelCalls.filter((call) => call.name === 'xmt_auth_refresh_duration_seconds').length, 1);
assert.equal(otelCalls.filter((call) => call.name === 'xmt_auth_active_sessions').at(-1)?.value, 0);
assert.deepEqual(registry.source(), ['memory', 'prometheus', 'opentelemetry']);
assert.equal(registry.statuses().every((status) => status.healthy), true);

assert.equal(events.list().filter((event) => event.eventType === 'auth.login.success').length, 1);
assert.equal(memory.list().filter((point) => point.name === 'v1_login_count').length, 1, 'fan-out must not duplicate source metrics');

console.log('Auth metrics exporter tests passed');
