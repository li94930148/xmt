import assert from 'node:assert/strict';
import { YjsRecoveryBridge } from '../../src/auth/socket/index.ts';

const calls: string[] = [];
const bridge = new YjsRecoveryBridge({ join: () => calls.push('join'), sync: () => calls.push('sync'), onResume: () => calls.push('resume') });
bridge.freeze();
bridge.recover();
assert.deepEqual(calls, []);
bridge.resume();
bridge.recover();
assert.deepEqual(calls, ['join', 'join', 'sync']);
bridge.markSynced();
assert.equal(bridge.getState().synced, true);
assert.equal(bridge.canSend(), true);
console.log('yjs auth recovery tests passed');
