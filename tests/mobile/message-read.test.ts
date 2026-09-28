import assert from 'node:assert/strict';
import { markMessagesReadIndividually } from '../../src/platform/mobile-message-read';

const result = await markMessagesReadIndividually([11, 12, 13], async (id) => {
  if (id === 12) throw new Error('simulated request failure');
  return { message: 'ok' };
});

assert.deepEqual(result, { succeededIds: [11, 13], failedIds: [12] });
assert.deepEqual(await markMessagesReadIndividually([], async () => undefined), { succeededIds: [], failedIds: [] });
console.log('Mobile message read partial-success contract passed');
