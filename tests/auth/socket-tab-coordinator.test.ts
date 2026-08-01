import assert from 'node:assert/strict';
import { readSocketCoordinatorEnabled } from '../../src/auth/socket/index.ts';

assert.equal(readSocketCoordinatorEnabled({}), false);
assert.equal(readSocketCoordinatorEnabled({ VITE_XMT_SOCKET_COORDINATOR_ENABLED: 'false' }), false);
assert.equal(readSocketCoordinatorEnabled({ VITE_XMT_SOCKET_COORDINATOR_ENABLED: 'true' }), true);
console.log('socket tab coordinator tests passed');
