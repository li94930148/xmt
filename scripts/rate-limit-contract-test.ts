import assert from 'node:assert/strict';
import express from 'express';
import { createRateLimiters, getRateLimitConfig, type RateLimitConfig } from '../api/middleware/rateLimit.js';
import { parseTrustProxy } from '../api/utils/trustProxy.js';

const config: RateLimitConfig = {
  api: { enabled: true, windowMs: 60_000, max: 2 },
  loginIp: { enabled: true, windowMs: 60_000, max: 3 },
  loginAccount: { enabled: true, windowMs: 60_000, max: 2 },
  diagnostics: false,
};

const { apiLimiter, loginIpLimiter, loginAccountLimiter } = createRateLimiters(config);
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.post('/api/auth/login', loginIpLimiter, loginAccountLimiter, (req, res) => {
  res.status(req.body.password === 'correct' ? 200 : 401).json({ success: req.body.password === 'correct' });
});
app.use('/api', apiLimiter);
app.get('/api/data', (_req, res) => res.json({ success: true }));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;

async function login(username: string, password: string, ip: string) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, 'x-request-id': 'rate-limit-contract-test' },
    body: JSON.stringify({ username, password }),
  });
}

try {
  // A successful login is removed from the per-account failed-attempt counter.
  assert.equal((await login('success-first', 'correct', '203.0.113.10')).status, 200);
  assert.equal((await login('success-first', 'wrong', '203.0.113.11')).status, 401);
  assert.equal((await login('success-first', 'wrong', '203.0.113.12')).status, 401);
  const accountLimited = await login('success-first', 'wrong', '203.0.113.13');
  assert.equal(accountLimited.status, 429);
  assert.equal((await accountLimited.json()).dimension, 'login_account');

  // Different accounts on one shared office IP do not share failed-attempt state.
  assert.equal((await login('alice', 'wrong', '203.0.113.2')).status, 401);
  assert.equal((await login('bob', 'wrong', '203.0.113.2')).status, 401);

  // The separate IP burst limiter counts all login requests, regardless of account.
  assert.equal((await login('ip-one', 'wrong', '203.0.113.3')).status, 401);
  assert.equal((await login('ip-two', 'wrong', '203.0.113.3')).status, 401);
  assert.equal((await login('ip-three', 'wrong', '203.0.113.3')).status, 401);
  const ipLimited = await login('ip-four', 'wrong', '203.0.113.3');
  assert.equal(ipLimited.status, 429);
  const ipBody = await ipLimited.json();
  assert.equal(ipBody.dimension, 'login_ip');
  assert.match(ipLimited.headers.get('retry-after') || '', /^\d+$/);
  assert.match(ipLimited.headers.get('ratelimit') || '', /limit=/i);
  assert.equal(typeof ipBody.retryAfterSeconds, 'number');

  // Auth requests do not consume the shared business API quota.
  assert.equal((await login('auth-isolated', 'wrong', '203.0.113.4')).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/data`, { headers: { 'x-forwarded-for': '203.0.113.4' } })).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/data`, { headers: { 'x-forwarded-for': '203.0.113.4' } })).status, 200);
  const apiLimited = await fetch(`${baseUrl}/api/data`, { headers: { 'x-forwarded-for': '203.0.113.4' } });
  assert.equal(apiLimited.status, 429);
  assert.equal((await apiLimited.json()).dimension, 'api');

  const fallback = getRateLimitConfig({ API_RATE_LIMIT_MAX: '-1', LOGIN_IP_RATE_LIMIT_WINDOW_MS: 'oops', LOGIN_ACCOUNT_RATE_LIMIT_ENABLED: 'yes' });
  assert.equal(fallback.api.max, 1200);
  assert.equal(fallback.loginIp.windowMs, 300_000);
  assert.equal(fallback.loginAccount.enabled, true);
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('true'), 1);
  assert.equal(parseTrustProxy('999'), 1);
  console.log('Rate-limit contract tests passed');
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
