import assert from 'node:assert/strict';

const { resolveMobileDeepLink } = await import('../../src/platform/deep-link.js');

assert.equal(resolveMobileDeepLink('xmt://topics/123'), '/topics/123');
assert.equal(resolveMobileDeepLink('xmt://production/456'), '/production/456');
assert.equal(resolveMobileDeepLink('xmt://messages'), '/messages');
assert.equal(resolveMobileDeepLink('xmt://daily-report'), '/daily-report');
assert.equal(resolveMobileDeepLink('https://xmt.example/topics/123'), null);
assert.equal(resolveMobileDeepLink('not a URL'), null);
console.log('Mobile deep-link contract tests passed');
