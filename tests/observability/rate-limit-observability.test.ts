import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createLogFailedLogin, createRateLimiters, type RateLimitConfig } from '../../api/middleware/rateLimit.js';
import { requestId } from '../../api/middleware/request-id.js';

const records: Array<{ level: string; fields: Record<string, unknown>; message: string }> = [];
const logger = {
  debug: (fields: Record<string, unknown>, message: string) => records.push({ level: 'debug', fields, message }),
  info: (fields: Record<string, unknown>, message: string) => records.push({ level: 'info', fields, message }),
  warn: (fields: Record<string, unknown>, message: string) => records.push({ level: 'warn', fields, message }),
};
const config: RateLimitConfig = {
  api: { enabled: false, windowMs: 60_000, max: 100 },
  loginIp: { enabled: true, windowMs: 60_000, max: 1 },
  loginAccount: { enabled: false, windowMs: 60_000, max: 100 },
  diagnostics: false,
};
const { loginIpLimiter, loginAccountLimiter } = createRateLimiters(config, logger);

const app = express();
app.use(requestId);
app.use(express.json());
app.post('/api/auth/login', loginIpLimiter, loginAccountLimiter, createLogFailedLogin(logger), (_req, res) => {
  res.status(401).json({ success: false, message: '登录失败' });
});

const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');

try {
  const sendLogin = (requestIdValue: string) => fetch(`http://127.0.0.1:${address.port}/api/auth/login?next=do-not-log-query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'do-not-log-user-agent',
      'X-Request-ID': requestIdValue,
    },
    body: JSON.stringify({ username: 'do-not-log-user@example.test', password: 'do-not-log-password' }),
  });

  assert.equal((await sendLogin('failed-login-request')).status, 401);
  assert.equal((await sendLogin('rate-limited-request')).status, 429);
  assert.equal(records.length, 2, 'failed login and rate limiting should both be observable');
  assert.equal(records[0].message, 'api.authentication.failed');
  assert.equal(records[0].fields.requestId, 'failed-login-request');
  assert.equal(records[0].fields.operation, 'login.failed');
  assert.equal(records[1].message, 'api.request.rate_limited');
  assert.equal(records[1].fields.requestId, 'rate-limited-request');
  assert.equal(records[1].fields.limiter, 'login_ip');
  assert.deepEqual(records[1].fields.error, { code: 'RATE_LIMITED' });

  const serialized = JSON.stringify(records);
  for (const secret of [
    'do-not-log-query',
    'do-not-log-user-agent',
    'do-not-log-user@example.test',
    'do-not-log-password',
    'originalUrl',
    'usernameHash',
    'userAgent',
  ]) {
    assert.equal(serialized.includes(secret), false, `rate-limit logs exposed ${secret}`);
  }
  assert.equal(records.some((record) => Object.hasOwn(record.fields, 'ip')), false, 'rate-limit logs must not record client addresses');

  console.log('Rate-limit logging contract passed: request correlation without account, address, query, or user-agent data');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
