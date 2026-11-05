import assert from 'node:assert/strict';
import { assessCiStatus, unavailableCiStatus } from '../../api/modules/ops/ci-status-decision.js';
import { describe, it } from 'vitest';

describe('CI status decision', () => {
  it('distinguishes passing, failing, pending and unavailable checks', () => {
    const sha = 'abc1234'; const success = [{ head_sha: sha, name: 'CI', status: 'completed', conclusion: 'success', jobs: [{ name: 'fast-gate', status: 'completed', conclusion: 'success' }, { name: 'core-security-contract', status: 'completed', conclusion: 'success' }] }];
    assert.equal(assessCiStatus(sha, success).decision, 'PASS');
    assert.equal(assessCiStatus(sha, [{ ...success[0], jobs: [{ name: 'fast-gate', status: 'completed', conclusion: 'failure' }] }]).decision, 'FAIL');
    assert.equal(assessCiStatus(sha, [{ ...success[0], status: 'in_progress', conclusion: null, jobs: [] }]).decision, 'IN_PROGRESS');
    assert.equal(assessCiStatus(sha, [{ ...success[0], head_sha: 'other' }]).decision, 'NO_RUN');
    assert.equal(assessCiStatus(sha, null).decision, 'UNAVAILABLE');
    assert.equal(unavailableCiStatus('NETWORK_ERROR').checks.api, 'NETWORK_ERROR');
    assert.equal(unavailableCiStatus('RATE_LIMITED').checks.api, 'RATE_LIMITED');
  });
});
