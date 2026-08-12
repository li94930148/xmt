import assert from 'node:assert/strict';
import { assessAuthReadiness, type AuthReadinessInput } from '../../api/modules/auth/rollout/auth-readiness-decision.js';

const thresholds = { minConnections: 50, maxUnknownRate: 0.01, maxRestarts: 2, maxRssBytes: 512 * 1024 * 1024, maxHeapRatio: 0.85, minSampleWindowMs: 24 * 60 * 60 * 1000 };
const ready: AuthReadinessInput = {
  pm2: { available: true, status: 'online', restartCount: 0, uptimeMs: thresholds.minSampleWindowMs },
  health: { available: true, ok: true }, database: { available: true, quickCheck: 'ok' },
  memory: { available: true, rss: 100, heapUsed: 40, heapTotal: 100 },
  socket: { available: true, connections: 50, unknownTotal: 0 }, thresholds,
};

assert.equal(assessAuthReadiness(ready).decision, 'GO');
assert.equal(assessAuthReadiness({ ...ready, pm2: { available: false } }).decision, 'INSUFFICIENT_DATA');
assert.equal(assessAuthReadiness({ ...ready, health: { available: false } }).decision, 'INSUFFICIENT_DATA');
assert.equal(assessAuthReadiness({ ...ready, health: { available: true, ok: false } }).decision, 'NO-GO');
assert.equal(assessAuthReadiness({ ...ready, database: { available: true, quickCheck: 'corrupt' } }).decision, 'NO-GO');
assert.equal(assessAuthReadiness({ ...ready, pm2: { ...ready.pm2!, restartCount: 3 } }).decision, 'NO-GO');
assert.equal(assessAuthReadiness({ ...ready, memory: { available: true, rss: thresholds.maxRssBytes + 1, heapUsed: 1, heapTotal: 2 } }).decision, 'NO-GO');
assert.equal(assessAuthReadiness({ ...ready, socket: { available: true, connections: 50, unknownTotal: 1 } }).decision, 'NO-GO');
assert.equal(assessAuthReadiness({ ...ready, socket: { available: true, connections: 49, unknownTotal: 0 } }).decision, 'INSUFFICIENT_DATA');
assert.equal(assessAuthReadiness({ ...ready, pm2: { ...ready.pm2!, uptimeMs: 1 } }).decision, 'INSUFFICIENT_DATA');
const output = JSON.stringify(assessAuthReadiness(ready));
assert.equal(/token|secret|password/i.test(output), false);
console.log('auth readiness decision tests passed');
