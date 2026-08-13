import assert from 'node:assert/strict';

const { isPoorNetwork, resolveNetworkState } = await import('../../src/platform/network.js');

assert.equal(resolveNetworkState(false), 'offline');
assert.equal(resolveNetworkState(true, { connected: false }), 'offline');
assert.equal(resolveNetworkState(true, { poor: true }), 'poor_network');
assert.equal(isPoorNetwork({ effectiveType: '2g' }), true);
assert.equal(isPoorNetwork({ effectiveType: '4g', downlink: 0.5 }), true);
assert.equal(isPoorNetwork({ effectiveType: '4g', downlink: 10 }), false);
console.log('Mobile network state contract tests passed');
