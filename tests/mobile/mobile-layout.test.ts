import assert from 'node:assert/strict';
import { mobileFallbackReturnPath, mobileNavigationPath, shouldUseMobileLayout } from '../../src/platform/mobile-layout';
import { describe, it } from 'vitest';

describe('mobile layout and navigation', () => {
  it('selects mobile layout by viewport and device capability', () => {
    assert.equal(shouldUseMobileLayout(false, 390), true);
    assert.equal(shouldUseMobileLayout(false, 767), true);
    assert.equal(shouldUseMobileLayout(false, 768), false);
    assert.equal(shouldUseMobileLayout(false, 1366), false);
    assert.equal(shouldUseMobileLayout(true, 1366), true);
    assert.equal(shouldUseMobileLayout(false, 0), false);
  });

  it('maps known mobile routes and rejects prefix collisions', () => {
    for (const path of ['/calendar', '/kanban', '/inspirations', '/shooting/42', '/production/content/42', '/daily-report/team']) {
      assert.equal(mobileNavigationPath(path), '/production', path);
    }
    assert.equal(mobileNavigationPath('/notification-settings'), '/me');
    assert.equal(mobileNavigationPath('/home'), '/');
    assert.equal(mobileNavigationPath('/topics/42'), '/topics');
    assert.equal(mobileNavigationPath('/topics-extra'), undefined);
  });

  it('chooses a safe mobile fallback return path', () => {
    assert.equal(mobileFallbackReturnPath('/asset-center/resources', undefined), '/asset-center');
    assert.equal(mobileFallbackReturnPath('/asset-center/knowledge', undefined), '/asset-center');
    assert.equal(mobileFallbackReturnPath('/asset-center', undefined), '/');
    assert.equal(mobileFallbackReturnPath('/asset-center/resources', '/topics'), '/asset-center');
    assert.equal(mobileFallbackReturnPath('/production/content/42', '/production'), '/production');
  });
});
