import assert from 'node:assert/strict';
import { createAuthRolloutRuntimeConfig, isMobileAuthEligibleUser } from '../../api/config/auth-rollout-runtime.js';

const approved: NodeJS.ProcessEnv = {
  NODE_ENV: 'production',
  XMT_AUTH_V1_ENABLED: 'true',
  XMT_MOBILE_AUTH_ENABLED: 'true',
  XMT_MOBILE_AUTH_APPROVED: 'true',
  XMT_MOBILE_AUTH_ALLOWLIST_USER_IDS: '41',
  XMT_MOBILE_SOCKET_ENABLED: 'true',
  XMT_MOBILE_SOCKET_APPROVED: 'true',
};

assert.equal(createAuthRolloutRuntimeConfig(approved).mobileAuthEnabled, true);
assert.equal(isMobileAuthEligibleUser({ id: 41, enabled: true }, approved), true);
assert.equal(isMobileAuthEligibleUser({ id: 42, enabled: true }, approved), false);
assert.equal(isMobileAuthEligibleUser({ id: 41, enabled: false }, approved), false);
assert.equal(createAuthRolloutRuntimeConfig({ ...approved, XMT_MOBILE_AUTH_APPROVED: 'false' }).mobileAuthEnabled, false);
assert.equal(createAuthRolloutRuntimeConfig({ ...approved, XMT_MOBILE_AUTH_ALLOWLIST_USER_IDS: '' }).mobileAllowlistedUserIds.size, 0);
assert.equal(createAuthRolloutRuntimeConfig({ ...approved, XMT_MOBILE_SOCKET_APPROVED: 'false' }).mobileSocketEnabled, false);

console.log('Mobile Auth production gate tests passed');
