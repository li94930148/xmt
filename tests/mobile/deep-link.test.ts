import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

describe('mobile deep links', () => {
  it('accepts supported app routes and rejects external or malformed URLs', async () => {
    const { resolveMobileDeepLink } = await import('../../src/platform/deep-link.js');

    assert.equal(resolveMobileDeepLink('xmt://topics/123'), '/topics/123');
    assert.equal(resolveMobileDeepLink('xmt://production/456'), '/production/456');
    assert.equal(resolveMobileDeepLink('xmt://messages'), '/messages');
    assert.equal(resolveMobileDeepLink('xmt://daily-report'), '/daily-report');
    assert.equal(resolveMobileDeepLink('https://xmt.example/topics/123'), null);
    assert.equal(resolveMobileDeepLink('not a URL'), null);
  });
});
