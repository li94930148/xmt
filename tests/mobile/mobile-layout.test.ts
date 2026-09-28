import assert from 'node:assert/strict';
import { mobileNavigationPath, shouldUseMobileLayout } from '../../src/platform/mobile-layout';

assert.equal(shouldUseMobileLayout(false, 390), true);
assert.equal(shouldUseMobileLayout(false, 767), true);
assert.equal(shouldUseMobileLayout(false, 768), false);
assert.equal(shouldUseMobileLayout(false, 1366), false);
assert.equal(shouldUseMobileLayout(true, 1366), true);
assert.equal(shouldUseMobileLayout(false, 0), false);
for (const path of ['/calendar', '/kanban', '/inspirations', '/shooting/42', '/production/content/42', '/daily-report/team']) {
  assert.equal(mobileNavigationPath(path), '/production', path);
}
assert.equal(mobileNavigationPath('/notification-settings'), '/me');
assert.equal(mobileNavigationPath('/home'), '/');
assert.equal(mobileNavigationPath('/topics/42'), '/topics');
assert.equal(mobileNavigationPath('/topics-extra'), undefined);
console.log('Mobile layout and navigation tests passed');
