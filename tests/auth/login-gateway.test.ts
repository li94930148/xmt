import assert from 'node:assert/strict';
import { LoginGatewayController } from '../../api/modules/auth/rollout/login-gateway.controller.js';
import { createLoginRolloutPolicy } from '../../api/modules/auth/rollout/login-rollout-policy.js';
import type { Request, Response } from 'express';
import type { AuthUserRecord } from '../../api/modules/auth/auth.types.js';

type RequestLike = { body: Record<string, unknown> };
const user: AuthUserRecord = {
  id: 7, username: 'member', role: 'member', password: 'unused', email: 'member@example.invalid', name: 'Member',
  enabled: true, forceChangePassword: false, createdAt: '', updatedAt: '',
};
const admin: AuthUserRecord = { ...user, id: 9, username: 'admin', role: 'admin' };

function gateway(env: NodeJS.ProcessEnv, availableV1 = true) {
  const calls: string[] = [];
  const controller = new LoginGatewayController({
    repository: { findUserByUsername: async (username) => username === 'member' ? { ...user } : username === 'admin' ? { ...admin } : null },
    policy: createLoginRolloutPolicy({ NODE_ENV: 'test', ...env }),
    legacyLogin: async () => { calls.push('legacy'); },
    v1WebLogin: availableV1 ? async () => { calls.push('v1-web'); } : undefined,
  });
  return { controller, calls };
}

const request = (username = 'member'): RequestLike => ({ body: { username, password: 'password' } });
const response = {};

let fixture = gateway({});
await fixture.controller.login(request() as unknown as Request, response as Response);
assert.deepEqual(fixture.calls, ['legacy']);

fixture = gateway({ XMT_LOGIN_ROLLOUT_ENABLED: 'true', XMT_AUTH_ROLLOUT_MODE: 'legacy' });
await fixture.controller.login(request() as unknown as Request, response as Response);
assert.deepEqual(fixture.calls, ['legacy']);

fixture = gateway({ XMT_LOGIN_ROLLOUT_ENABLED: 'true', XMT_AUTH_ROLLOUT_MODE: 'allowlist', XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7' });
const v1Request = request();
await fixture.controller.login(v1Request as unknown as Request, response as Response);
assert.deepEqual(fixture.calls, ['v1-web']);
assert.deepEqual(v1Request.body.client, { type: 'web', deviceName: 'XMT Web Login Gateway' });

fixture = gateway({ XMT_LOGIN_ROLLOUT_ENABLED: 'true', XMT_AUTH_ROLLOUT_MODE: 'allowlist', XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '9' });
await fixture.controller.login(request('admin') as unknown as Request, response as Response);
assert.deepEqual(fixture.calls, ['legacy']);

fixture = gateway({ XMT_LOGIN_ROLLOUT_ENABLED: 'true', XMT_AUTH_ROLLOUT_MODE: 'allowlist', XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '8' });
await fixture.controller.login(request() as unknown as Request, response as Response);
assert.deepEqual(fixture.calls, ['legacy']);

fixture = gateway({
  XMT_LOGIN_ROLLOUT_ENABLED: 'true',
  XMT_AUTH_ROLLOUT_MODE: 'percentage',
  XMT_AUTH_ROLLOUT_PERCENTAGE: '100',
  XMT_LOGIN_ROLLOUT_PERCENTAGE_APPROVED: 'true',
});
await fixture.controller.login(request() as unknown as Request, response as Response);
assert.deepEqual(fixture.calls, ['legacy']);

fixture = gateway({ XMT_LOGIN_ROLLOUT_ENABLED: 'true', XMT_AUTH_ROLLOUT_MODE: 'allowlist', XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7' }, false);
await fixture.controller.login(request() as unknown as Request, response as Response);
assert.deepEqual(fixture.calls, ['legacy']);

console.log('login gateway tests passed');
