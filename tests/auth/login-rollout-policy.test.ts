import assert from 'node:assert/strict';
import { createLoginRolloutPolicy } from '../../api/modules/auth/rollout/login-rollout-policy.js';

const policy = (env: NodeJS.ProcessEnv) => createLoginRolloutPolicy({ NODE_ENV: 'test', ...env });

assert.deepEqual(policy({}).decide({ id: 7, role: 'member' }), {
  mode: 'legacy', enabled: false, reason: 'login_rollout_disabled',
});
assert.equal(policy({ XMT_LOGIN_ROLLOUT_ENABLED: 'true', XMT_AUTH_ROLLOUT_MODE: 'legacy' }).decide({ id: 7 }).mode, 'legacy');
assert.equal(policy({
  XMT_LOGIN_ROLLOUT_ENABLED: 'true',
  XMT_AUTH_ROLLOUT_MODE: 'allowlist',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7',
}).decide({ id: 7, role: 'member' }).mode, 'v1-web');
assert.equal(policy({
  XMT_LOGIN_ROLLOUT_ENABLED: 'true',
  XMT_AUTH_ROLLOUT_MODE: 'allowlist',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7',
}).decide({ id: 7, role: 'admin' }).reason, 'protected_role');
assert.equal(policy({
  XMT_LOGIN_ROLLOUT_ENABLED: 'true',
  XMT_AUTH_ROLLOUT_MODE: 'allowlist',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7',
}).decide({ id: 8, role: 'member' }).reason, 'user_not_eligible');
assert.equal(policy({
  XMT_LOGIN_ROLLOUT_ENABLED: 'true',
  XMT_AUTH_ROLLOUT_MODE: 'percentage',
  XMT_AUTH_ROLLOUT_PERCENTAGE: '100',
}).decide({ id: 7, role: 'member' }).reason, 'percentage_approval_required');
assert.equal(policy({
  XMT_LOGIN_ROLLOUT_ENABLED: 'true',
  XMT_AUTH_ROLLOUT_MODE: 'allowlist',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7',
}).decide({ id: 7, role: 'member' }).mode, 'v1-web');

assert.equal(policy({
  NODE_ENV: 'production',
  XMT_LOGIN_ROLLOUT_ENABLED: 'true',
  XMT_AUTH_ROLLOUT_MODE: 'allowlist',
  XMT_AUTH_ROLLOUT_APPROVED: 'false',
  XMT_AUTH_WEB_ALLOWLIST_USER_IDS: '7',
}).decide({ id: 7, role: 'member' }).reason, 'production_approval_required');

console.log('login rollout policy tests passed');
