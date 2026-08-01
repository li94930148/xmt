import assert from 'node:assert/strict';
import { assessAuthGrayReadiness } from '../../api/modules/auth/rollout/auth-gray-readiness.js';

const base = { authV1Enabled: true, authWebEnabled: true, loginRolloutEnabled: true, socketBridgeEnabled: true, socketBridgeApproved: true, mode: 'allowlist', browserFixture: true, rollbackReady: true, observationWindowMinutes: 30 };
assert.equal(assessAuthGrayReadiness({ ...base, authV1Enabled: false, users: [] }).overall, 'NOT_READY');
assert.equal(assessAuthGrayReadiness({ ...base, users: [] }).overall, 'NOT_READY');
assert.equal(assessAuthGrayReadiness({ ...base, users: [{ id: 1, role: 'member', enabled: true }, { id: 2, role: 'member', enabled: true }] }).overall, 'READY');
assert.equal(assessAuthGrayReadiness({ ...base, users: [{ id: 1, role: 'admin', enabled: true }, { id: 2, role: 'member', enabled: true }] }).overall, 'NOT_READY');
assert.equal(assessAuthGrayReadiness({ ...base, users: [{ id: 1, role: 'director', enabled: true }, { id: 2, role: 'member', enabled: true }] }).overall, 'NOT_READY');
console.log('auth gray readiness tests passed');
