import assert from 'node:assert/strict';
import { getSmokePasswordForLogin, requireSmokePassword } from '../../scripts/require-smoke-password.mjs';

assert.throws(
  () => requireSmokePassword({}),
  /缺少必需的环境变量 SMOKE_PASSWORD/,
  'smoke scripts fail clearly when the password is absent',
);
assert.throws(
  () => requireSmokePassword({ SMOKE_PASSWORD: '   ' }),
  /缺少必需的环境变量 SMOKE_PASSWORD/,
  'blank passwords are not accepted',
);
assert.equal(requireSmokePassword({ SMOKE_PASSWORD: 'test-password' }), 'test-password');
assert.equal(getSmokePasswordForLogin({ TOKEN: 'provided-token' }), '', 'an existing token makes login password unnecessary');
assert.throws(
  () => getSmokePasswordForLogin({}),
  /缺少必需的环境变量 SMOKE_PASSWORD/,
  'password remains required when login must be performed',
);
console.log('Smoke password requirement tests passed');
