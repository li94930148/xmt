import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import express from 'express';
import { AuthEventService } from '../../api/modules/auth/events/auth-event.service.js';
import { AuthMetricsService } from '../../api/modules/auth/events/auth-metrics.service.js';
import { MemoryAuthMetricsExporter } from '../../api/modules/auth/events/auth-metrics.memory.js';
import { AuthMetricsRegistry } from '../../api/modules/auth/metrics/auth-metrics.registry.js';
import { createAuthMetricsHttpRouter } from '../../api/modules/auth/metrics/auth-metrics-http.routes.js';
import { PrometheusAuthMetricsExporter } from '../../api/modules/auth/metrics/prometheus/prometheus-auth-metrics.exporter.js';
import {
  OpenTelemetryAuthExporter,
  type OpenTelemetryMeterAdapter,
} from '../../api/modules/auth/metrics/otel/opentelemetry-auth.exporter.js';

const memory = new MemoryAuthMetricsExporter();
const prometheus = new PrometheusAuthMetricsExporter('xmt-test-1');
const collectorCalls: Array<{ name: string; value: number; labels: Readonly<Record<string, string>> }> = [];
const collectorMeter: OpenTelemetryMeterAdapter = {
  createCounter: (name) => ({ add: (value, labels = {}) => collectorCalls.push({ name, value, labels }) }),
  createHistogram: (name) => ({ record: (value, labels = {}) => collectorCalls.push({ name, value, labels }) }),
  createGauge: (name) => ({ record: (value, labels = {}) => collectorCalls.push({ name, value, labels }) }),
};
const otel = new OpenTelemetryAuthExporter(collectorMeter, 'xmt-test-1');
const registry = new AuthMetricsRegistry([memory, prometheus, otel]);
const events = new AuthEventService([registry], () => undefined, () => 'observability-event');
const metrics = new AuthMetricsService(events);

metrics.recordSessionCreated({ userId: 987654, sessionId: 'sensitive-session-id', mode: 'v1-web', clientType: 'web' });
metrics.countLoginSuccess({ userId: 987654, sessionId: 'sensitive-session-id', mode: 'v1-web', clientType: 'web' });
metrics.countRefreshSuccess({ userId: 987654, sessionId: 'sensitive-session-id', mode: 'v1-web', clientType: 'web', durationSeconds: 0.08 });

const output = prometheus.metrics();
assert.match(output, /^# HELP xmt_auth_login_total/m);
assert.match(output, /^# TYPE xmt_auth_refresh_duration_seconds histogram/m);
assert.match(output, /instance="xmt-test-1"/);
for (const secret of ['987654', 'sensitive-session-id', 'accessToken', 'refreshToken', 'password', 'cookie']) {
  assert.equal(output.includes(secret), false, `metrics output must not expose ${secret}`);
}
assert.equal(memory.list().filter((point) => point.name === 'v1_login_count').length, 1);
assert.equal(collectorCalls.filter((call) => call.name === 'xmt_auth_login_total').length, 1);
assert.equal(collectorCalls.some((call) => call.labels.instance === 'xmt-test-1'), true, 'OTel collector adapter receives instance labels');

async function requestEndpoint(allowedCidrs: readonly string[], enabled = true) {
  const app = express();
  app.use('/internal/metrics/auth', createAuthMetricsHttpRouter(prometheus, { enabled, allowedCidrs }));
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    return await fetch(`http://127.0.0.1:${address.port}/internal/metrics/auth`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const scrape = await requestEndpoint(['127.0.0.1/32']);
assert.equal(scrape.status, 200);
assert.match(scrape.headers.get('content-type') ?? '', /text\/plain/);
assert.equal(scrape.headers.get('cache-control'), 'no-store');
assert.match(await scrape.text(), /xmt_auth_login_total/);
assert.equal((await requestEndpoint(['10.0.0.0/8'])).status, 403, 'non-monitoring networks are rejected');
assert.equal((await requestEndpoint(['127.0.0.1/32'], false)).status, 404, 'endpoint stays hidden when disabled');

const collectorConfig = fs.readFileSync('deploy/observability/otel-collector.auth.example.yaml', 'utf8');
assert.match(collectorConfig, /receivers:\n[ ]{2}otlp:/);
assert.match(collectorConfig, /pipelines:\n[ ]{4}metrics:/);
const alertRules = fs.readFileSync('deploy/observability/auth-alert-rules.example.yml', 'utf8');
assert.match(alertRules, /severity: warning/);
assert.match(alertRules, /severity: critical/);
assert.match(alertRules, /auth\.token\.reuse_detected/);

console.log('Auth observability integration tests passed');
