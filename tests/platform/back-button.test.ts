import assert from 'node:assert/strict';
import { handleBackButton } from '../../src/platform/runtime.js';

assert.deepEqual(handleBackButton('/topics/8', 0, 5_000), { action: 'navigate-back', nextBackAt: 0 });
assert.deepEqual(handleBackButton('/topics', 0, 5_000), { action: 'warn-exit', nextBackAt: 5_000 });
assert.deepEqual(handleBackButton('/topics', 5_000, 6_500), { action: 'exit-app', nextBackAt: 0 });
assert.deepEqual(handleBackButton('/topics', 5_000, 6_900), { action: 'warn-exit', nextBackAt: 6_900 });
console.log('Mobile back button contract tests passed');
