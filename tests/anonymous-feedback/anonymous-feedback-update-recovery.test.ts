import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import type { AnonymousFeedback } from '../../src/api/anonymousFeedback';
import {
  fingerprintAnonymousFeedbackUpdateRequest,
  markAnonymousFeedbackUpdateRecoveryRejected,
  persistAnonymousFeedbackUpdateRecovery,
  readAnonymousFeedbackUpdateRecovery,
  removeAnonymousFeedbackUpdateRecovery,
  type RecoveryStorage,
  type StoredAnonymousFeedbackUpdateRecovery,
} from '../../src/api/anonymousFeedbackUpdateRecovery';

class MemoryStorage implements RecoveryStorage {
  private values = new Map<string, string>();
  failSet = false;
  failRemove = false;

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failSet) throw new Error('storage set blocked');
    this.values.set(key, value);
  }
  removeItem(key: string) {
    if (this.failRemove) throw new Error('storage remove blocked');
    this.values.delete(key);
  }
}

function makeBaseline(): AnonymousFeedback {
  return {
    id: 981,
    type: 'process',
    content: '完整基线内容',
    need_reply: true,
    reply_content: null,
    status: 'pending',
    is_public: 1,
    created_at: '2026-10-08 09:00:00',
    updated_at: '2026-10-08 09:00:00',
    base_fingerprint: 'a'.repeat(64),
  };
}

async function makeRecovery(payload: StoredAnonymousFeedbackUpdateRecovery['payload'] = { reply_content: '原始回复  ', status: 'completed' }) {
  const baseline = makeBaseline();
  const requestFingerprint = await fingerprintAnonymousFeedbackUpdateRequest(baseline.id, baseline.base_fingerprint!, payload);
  return {
    schemaVersion: 1 as const,
    actorId: 98,
    targetId: baseline.id,
    requestId: 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a57',
    baseFingerprint: baseline.base_fingerprint!,
    requestFingerprint,
    payload,
    baseline: { id: baseline.id, base_fingerprint: baseline.base_fingerprint! },
    rejected: false,
  };
}

test('request fingerprint uses the fixed backend tuple and trims only its fingerprint copy', async () => {
  const payload = { reply_content: ' 原始回复 ', status: 'completed' as const };
  const actual = await fingerprintAnonymousFeedbackUpdateRequest(981, 'a'.repeat(64), payload);
  const expected = createHash('sha256')
    .update(JSON.stringify([981, 'a'.repeat(64), 'completed', '原始回复', null]))
    .digest('hex');
  assert.equal(actual, expected);
  assert.equal(payload.reply_content, ' 原始回复 ', 'the retained full payload stays unchanged for a same-key retry');
});

test('recovery persists actor, target, request, fingerprints, complete payload and baseline across storage reads', async () => {
  const recovery = await makeRecovery();
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  assert.equal(persistAnonymousFeedbackUpdateRecovery(recovery, session, local), true);
  const read = readAnonymousFeedbackUpdateRecovery(98, session, local);
  assert.equal(read.kind, 'ready');
  if (read.kind !== 'ready') return;
  assert.deepEqual(read.recovery, recovery);
  assert.equal(read.recovery.payload.reply_content, '原始回复  ');
  assert.deepEqual(read.recovery.baseline, { id: 981, base_fingerprint: 'a'.repeat(64) });
  assert.equal(session.getItem('xmt:anonymous-feedback-update-pending:actor:98')?.includes('完整基线内容'), false, 'the baseline fingerprint is stored without duplicating feedback text');
  assert.deepEqual(readAnonymousFeedbackUpdateRecovery(99, session, local), { kind: 'none' });
});

test('local rejected fallback survives session write and removal failures after reload', async () => {
  const recovery = await makeRecovery({ is_public: false });
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  assert.equal(persistAnonymousFeedbackUpdateRecovery(recovery, session, local), true);
  session.failSet = true;
  session.failRemove = true;
  assert.equal(markAnonymousFeedbackUpdateRecoveryRejected(recovery, session, local), true, 'local storage records the rejected state when sessionStorage cannot update');
  assert.equal(removeAnonymousFeedbackUpdateRecovery({ ...recovery, rejected: true }, session, local), false, 'failed removal remains fail closed');
  const afterReload = readAnonymousFeedbackUpdateRecovery(98, session, local);
  assert.equal(afterReload.kind, 'ready');
  if (afterReload.kind !== 'ready') return;
  assert.equal(afterReload.recovery.rejected, true, 'rejected fallback merges over the older pending session marker');
  assert.equal(afterReload.recovery.requestId, recovery.requestId);
  assert.deepEqual(afterReload.recovery.payload, recovery.payload);
});

test('marker removal verifies both stores and refuses mismatched request identity', async () => {
  const recovery = await makeRecovery({ is_public: true });
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  assert.equal(persistAnonymousFeedbackUpdateRecovery(recovery, session, local), true);
  const otherRequest = { ...recovery, requestId: 'c01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a57' };
  assert.equal(removeAnonymousFeedbackUpdateRecovery(otherRequest, session, local), false);
  assert.equal(readAnonymousFeedbackUpdateRecovery(98, session, local).kind, 'ready');
  assert.equal(removeAnonymousFeedbackUpdateRecovery(recovery, session, local), true);
  assert.deepEqual(readAnonymousFeedbackUpdateRecovery(98, session, local), { kind: 'none' });
});
