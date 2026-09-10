import assert from 'node:assert/strict';
import test from 'node:test';
import { managedBrowserLaunchArgs } from './browserSession.js';

test('managed Chrome sessions disable background mode so the profile lock is released', () => {
  assert.deepEqual(managedBrowserLaunchArgs([]), ['--disable-background-mode']);
  assert.deepEqual(managedBrowserLaunchArgs(['--disable-background-mode']), ['--disable-background-mode']);
  assert.deepEqual(managedBrowserLaunchArgs(['--fixture']), ['--fixture', '--disable-background-mode']);
});
