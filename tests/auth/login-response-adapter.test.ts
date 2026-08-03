import assert from 'node:assert/strict';
import {
  adaptLoginResponse,
  LoginResponseAdapterError,
  toAuthV1User,
} from '../../src/auth/web/login-response-adapter.js';

const legacy = adaptLoginResponse({
  user: {
    id: 7,
    username: 'legacy-member',
    password: 'never-used-by-client',
    email: 'legacy@example.invalid',
    role: 'member',
    name: 'Legacy Member',
    enabled: true,
    force_change_password: false,
    created_at: '2026-08-03T00:00:00.000Z',
    updated_at: '2026-08-03T00:00:00.000Z',
  },
  token: 'legacy-seven-day-jwt',
});
assert.equal(legacy.authMode, 'legacy');
assert.equal(legacy.accessToken, 'legacy-seven-day-jwt');
assert.equal(legacy.session, undefined);
assert.equal(legacy.user.force_change_password, false);

const v1 = adaptLoginResponse({
  success: true,
  data: {
    user: {
      id: 8,
      username: 'v1-member',
      email: 'v1@example.invalid',
      role: 'member',
      name: 'V1 Member',
      forceChangePassword: true,
    },
    accessToken: 'v1-memory-access-token',
    expiresIn: 900,
    session: {
      id: 'session-8',
      clientType: 'web',
      deviceName: 'Test browser',
      appVersion: null,
      createdAt: '2026-08-03T00:00:00.000Z',
      lastSeenAt: '2026-08-03T00:00:00.000Z',
      idleExpiresAt: '2026-08-04T00:00:00.000Z',
      absoluteExpiresAt: '2026-08-10T00:00:00.000Z',
      current: true,
    },
  },
  requestId: 'request-v1-8',
});
assert.equal(v1.authMode, 'v1-web');
assert.equal(v1.accessToken, 'v1-memory-access-token');
assert.equal(v1.session?.id, 'session-8');
assert.equal(v1.requestId, 'request-v1-8');
assert.equal(v1.user.force_change_password, true);
assert.deepEqual(toAuthV1User(v1.user), {
  id: 8,
  username: 'v1-member',
  email: 'v1@example.invalid',
  role: 'member',
  name: 'V1 Member',
  forceChangePassword: true,
});

await assert.rejects(
  async () => adaptLoginResponse({ success: true, data: { user: {} } }),
  LoginResponseAdapterError,
);
await assert.rejects(
  async () => adaptLoginResponse({ user: { id: 1 }, token: '' }),
  LoginResponseAdapterError,
);
await assert.rejects(
  async () => adaptLoginResponse({ success: true, data: { user: { id: 1 }, accessToken: 'token' } }),
  LoginResponseAdapterError,
);

// A refresh response has no user/session and must not be accepted as a login result.
await assert.rejects(
  async () => adaptLoginResponse({ success: true, data: { accessToken: 'refresh-access-token' } }),
  LoginResponseAdapterError,
);

console.log('login response adapter tests passed');
