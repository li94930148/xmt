import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isDirectLoopbackRequest } from '../../api/security/internal-access.js';

const request = (remoteAddress: string, headers: Record<string, string | string[] | undefined> = {}) => ({
  socket: { remoteAddress }, headers,
});

assert.equal(isDirectLoopbackRequest(request('127.0.0.1')), true);
assert.equal(isDirectLoopbackRequest(request('::1')), true);
assert.equal(isDirectLoopbackRequest(request('203.0.113.10')), false);
assert.equal(isDirectLoopbackRequest(request('127.0.0.1', { 'x-forwarded-for': '203.0.113.10' })), false);
assert.equal(isDirectLoopbackRequest(request('127.0.0.1', { 'x-forwarded-proto': 'https' })), false);
assert.equal(isDirectLoopbackRequest(request('127.0.0.1', { forwarded: 'for=203.0.113.10;proto=https' })), false);
assert.equal(isDirectLoopbackRequest(request('127.0.0.1', { 'x-real-ip': '203.0.113.10' })), false);
const appSource = fs.readFileSync(path.resolve('api/app.ts'), 'utf8');
assert.match(appSource, /app\.use\('\/internal', requireDirectLoopback\)/);
for (const endpoint of ['/internal/auth-rollout/runtime', '/internal/socket-lifecycle/summary', '/internal/ops/runtime', '/internal/metrics/auth']) {
  assert.ok(appSource.includes(endpoint), `internal route is registered: ${endpoint}`);
}

console.log('internal direct-loopback contract tests passed');
