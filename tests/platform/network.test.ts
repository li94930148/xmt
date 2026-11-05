import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

describe('mobile network state', () => {
  it('classifies offline and poor connections', async () => {
    const { isPoorNetwork, resolveNetworkState } = await import('../../src/platform/network.js');

    assert.equal(resolveNetworkState(false), 'offline');
    assert.equal(resolveNetworkState(true, { connected: false }), 'offline');
    assert.equal(resolveNetworkState(true, { poor: true }), 'poor_network');
    assert.equal(isPoorNetwork({ effectiveType: '2g' }), true);
    assert.equal(isPoorNetwork({ effectiveType: '4g', downlink: 0.5 }), true);
    assert.equal(isPoorNetwork({ effectiveType: '4g', downlink: 10 }), false);
  });
});
