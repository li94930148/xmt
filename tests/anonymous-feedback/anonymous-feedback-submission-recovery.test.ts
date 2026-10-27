import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  ANONYMOUS_FEEDBACK_SUBMISSION_RECOVERY_STORAGE_KEY,
  clearPendingAnonymousFeedbackSubmission,
  fingerprintAnonymousFeedbackSubmission,
  readPendingAnonymousFeedbackSubmission,
  savePendingAnonymousFeedbackSubmission,
  type PendingAnonymousFeedbackSubmission,
} from '../../src/features/anonymous-feedback/submissionRecovery.js';

class MemorySessionStorage {
  values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const storage = new MemorySessionStorage();
const pending: PendingAnonymousFeedbackSubmission = {
  clientRequestId: 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a66',
  requestFingerprint: 'a'.repeat(64),
  payload: { type: 'process', content: '仅保存在当前标签会话的待核实意见', needReply: false },
};

savePendingAnonymousFeedbackSubmission(storage, pending);
assert.deepEqual(readPendingAnonymousFeedbackSubmission(storage), pending, 'refresh recovery can restore the same request and payload');
assert.equal(storage.values.get(ANONYMOUS_FEEDBACK_SUBMISSION_RECOVERY_STORAGE_KEY)?.includes('userId'), false,
  'the local marker does not associate a submitter identity');
clearPendingAnonymousFeedbackSubmission(storage);
assert.equal(readPendingAnonymousFeedbackSubmission(storage), null, 'confirmed or explicitly cleared requests are removed');

storage.setItem(ANONYMOUS_FEEDBACK_SUBMISSION_RECOVERY_STORAGE_KEY, '{broken');
assert.throws(() => readPendingAnonymousFeedbackSubmission(storage), /JSON|position|property/i, 'corrupt recovery data is not treated as a new submission');
clearPendingAnonymousFeedbackSubmission(storage);

const payload = { type: 'process' as const, content: '保持服务端和浏览器指纹一致', needReply: true };
const expected = createHash('sha256').update(JSON.stringify([payload.type, payload.content, payload.needReply]), 'utf8').digest('hex');
assert.equal(await fingerprintAnonymousFeedbackSubmission(payload), expected, 'request fingerprint uses the canonical payload tuple');

console.log('Anonymous-feedback submission recovery storage tests passed.');
