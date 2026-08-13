import assert from 'node:assert/strict';
import { createAuthRolloutRuntimeConfig } from '../../api/config/auth-rollout-runtime.js';
import { assessAuthGrayReadiness } from '../../api/modules/auth/rollout/auth-gray-readiness.js';

const enabled: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  XMT_AUTH_V1_ENABLED: 'true', XMT_AUTH_WEB_ENABLED: 'true',
  XMT_AUTH_ROLLOUT_APPROVED: 'true', XMT_AUTH_ROLLOUT_MODE: 'allowlist',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '31,32', XMT_LOGIN_ROLLOUT_ENABLED: 'true',
  XMT_SOCKET_AUTH_BRIDGE_ENABLED: 'true', XMT_SOCKET_BRIDGE_APPROVED: 'true',
  XMT_AUTH_GRAY_WINDOW_MINUTES: '30',
  XMT_MOBILE_AUTH_ENABLED: 'true', XMT_MOBILE_AUTH_APPROVED: 'true',
  XMT_MOBILE_AUTH_ALLOWLIST_USER_IDS: '31', XMT_MOBILE_SOCKET_ENABLED: 'true', XMT_MOBILE_SOCKET_APPROVED: 'true',
};
const users = [{ id: 31, role: 'member', enabled: true }, { id: 32, role: 'member', enabled: true }];
const readiness = (runtime: ReturnType<typeof createAuthRolloutRuntimeConfig>) => assessAuthGrayReadiness({
  authV1Enabled: runtime.authV1Enabled, authWebEnabled: runtime.authWebEnabled,
  loginRolloutEnabled: runtime.loginRolloutEnabled, socketBridgeEnabled: runtime.socketBridgeEnabled,
  socketBridgeApproved: runtime.socketBridgeApproval, mode: runtime.effectiveRolloutMode,
  users: users.filter((user) => runtime.allowlistedUserIds.has(user.id)),
  browserFixture: true, rollbackReady: true, observationWindowMinutes: runtime.observationWindowMinutes,
});

// A changed .env is irrelevant until the PM2 process is restarted with it.
const runningLegacy = createAuthRolloutRuntimeConfig({ NODE_ENV: 'production' });
assert.equal(readiness(runningLegacy).overall, 'NOT_READY');

const runningEnabled = createAuthRolloutRuntimeConfig(enabled);
assert.equal(readiness(runningEnabled).overall, 'READY');
assert.equal(runningEnabled.source, 'pm2_process_env');
assert.equal(runningEnabled.allowlistedUserIds.size, 2);
assert.equal(runningEnabled.mobileAuthEnabled, true);
assert.equal(runningEnabled.mobileAllowlistedUserIds.size, 1);
assert.equal(runningEnabled.mobileSocketEnabled, true);

assert.equal(createAuthRolloutRuntimeConfig({ ...enabled, XMT_MOBILE_AUTH_APPROVED: 'false' }).mobileAuthEnabled, false);
assert.equal(createAuthRolloutRuntimeConfig({ ...enabled, XMT_MOBILE_AUTH_ENABLED: 'false' }).mobileAuthEnabled, false);
assert.equal(createAuthRolloutRuntimeConfig({ ...enabled, XMT_MOBILE_SOCKET_APPROVED: 'false' }).mobileSocketEnabled, false);

assert.equal(readiness(createAuthRolloutRuntimeConfig({ ...enabled, XMT_AUTH_V1_ENABLED: 'false' })).overall, 'NOT_READY');
assert.equal(readiness(createAuthRolloutRuntimeConfig({ ...enabled, XMT_SOCKET_AUTH_BRIDGE_ENABLED: 'false' })).overall, 'NOT_READY');
assert.equal(readiness(createAuthRolloutRuntimeConfig({ ...enabled, XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '' })).overall, 'NOT_READY');

console.log('auth runtime config tests passed');
