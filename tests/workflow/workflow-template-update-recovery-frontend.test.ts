import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  createWorkflowTemplateUpdateFingerprint,
  createWorkflowTemplateUpdateRequestFingerprint,
  isWorkflowTemplateUpdatePayload,
  markWorkflowTemplateUpdateRecoveryRejected,
  persistWorkflowTemplateUpdateRecovery,
  readWorkflowTemplateUpdateRecovery,
  removeWorkflowTemplateUpdateRecovery,
  sameWorkflowTemplateUpdateRecovery,
  workflowTemplateUpdateRecoveryStorageKey,
  type SessionStorageLike,
  type WorkflowTemplateUpdateRecovery,
} from '../../src/pages/workflowTemplateUpdateRecovery';

class MemorySessionStorage implements SessionStorageLike {
  private readonly values = new Map<string, string>();
  failRemove = false;
  failSet = false;

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failSet) throw new Error('blocked'); this.values.set(key, value); }
  removeItem(key: string) { if (this.failRemove) throw new Error('blocked'); this.values.delete(key); }
}

const payload = {
  name: '隔离模板更新',
  description: '保留完整原提交内容',
  nodes: [{
    id: 14,
    name: '负责人审核',
    node_order: 1,
    status_from: 'pending',
    status_to: 'approved',
    approver_type: 'role' as const,
    approver_value: 'director',
    is_required: true,
  }],
};
const basePayload = { ...payload, name: '更新前模板', description: '加载详情时的完整快照' };

async function makeRecovery(actorId = 96, templateId = 961): Promise<WorkflowTemplateUpdateRecovery> {
  const baseFingerprint = await createWorkflowTemplateUpdateFingerprint(basePayload, webcrypto);
  const requestFingerprint = await createWorkflowTemplateUpdateRequestFingerprint(payload, baseFingerprint, webcrypto);
  return {
    version: 1,
    actorId,
    templateId,
    requestId: 'a3f6fdc1-5168-4698-b34e-8aed3e4a1c39',
    requestFingerprint,
    baseFingerprint,
    payload,
    basePayload,
    rejected: false,
  };
}

test('workflow template update recovery stores full actor and request scope in session storage', async () => {
  const storage = new MemorySessionStorage();
  const rejectedStorage = new MemorySessionStorage();
  const recovery = await makeRecovery();
  persistWorkflowTemplateUpdateRecovery(storage, rejectedStorage, recovery);

  assert.deepEqual(readWorkflowTemplateUpdateRecovery(storage, 96, rejectedStorage), recovery);
  assert.equal(readWorkflowTemplateUpdateRecovery(storage, 97, rejectedStorage), null, 'a different actor cannot read this recovery marker');
  assert.equal(storage.getItem(workflowTemplateUpdateRecoveryStorageKey(96))?.includes('负责人审核'), true, 'the complete original payload is retained');
  assert.equal(sameWorkflowTemplateUpdateRecovery(recovery, recovery), true);
  assert.equal(sameWorkflowTemplateUpdateRecovery({ ...recovery, templateId: 962 }, recovery), false, 'template scope is part of recovery identity');
  assert.equal(sameWorkflowTemplateUpdateRecovery({ ...recovery, requestId: 'd9826272-9603-4b84-8fd4-4a329458785c' }, recovery), false, 'request UUID is part of recovery identity');
  assert.equal(sameWorkflowTemplateUpdateRecovery({ ...recovery, requestFingerprint: 'f'.repeat(64) }, recovery), false, 'composite request fingerprint is part of recovery identity');
  assert.equal(sameWorkflowTemplateUpdateRecovery({ ...recovery, baseFingerprint: 'e'.repeat(64) }, recovery), false, 'baseline fingerprint is part of recovery identity');
  assert.equal(sameWorkflowTemplateUpdateRecovery({ ...recovery, actorId: 97 }, recovery), false, 'actor is part of recovery identity');
  assert.equal(sameWorkflowTemplateUpdateRecovery({ ...recovery, payload: { ...payload, name: '不同内容' } }, recovery), false, 'the full payload is part of recovery identity');
  assert.equal(sameWorkflowTemplateUpdateRecovery({ ...recovery, basePayload: { ...basePayload, name: '其他基线' } }, recovery), false, 'the full baseline snapshot is part of recovery identity');
});

test('workflow template update recovery rejects malformed and oversized session markers', async () => {
  const storage = new MemorySessionStorage();
  const rejectedStorage = new MemorySessionStorage();
  const recovery = await makeRecovery();
  const key = workflowTemplateUpdateRecoveryStorageKey(96);
  storage.setItem(key, JSON.stringify({ ...recovery, payload: { ...payload, nodes: [{ name: 'missing fields' }] } }));
  assert.equal(readWorkflowTemplateUpdateRecovery(storage, 96, rejectedStorage), 'invalid');
  storage.setItem(key, 'x'.repeat(400_001));
  assert.equal(readWorkflowTemplateUpdateRecovery(storage, 96, rejectedStorage), 'invalid');
  assert.equal(isWorkflowTemplateUpdatePayload(payload), true);
  assert.equal(isWorkflowTemplateUpdatePayload(null), false);
});

test('workflow template update fingerprint matches the API canonical contract', async () => {
  const fingerprint = await createWorkflowTemplateUpdateFingerprint(payload, webcrypto);
  const canonical = JSON.stringify([
    payload.name,
    payload.description,
    payload.nodes.map((node) => [node.name, node.status_from, node.status_to, node.approver_type, node.approver_value, true]),
  ]);
  assert.equal(fingerprint, createHash('sha256').update(canonical).digest('hex'));
  const changedOrderOnly = await createWorkflowTemplateUpdateFingerprint({
    ...payload,
    nodes: payload.nodes.map((node) => ({ ...node, id: 99, node_order: 8 })),
  }, webcrypto);
  assert.equal(changedOrderOnly, fingerprint, 'server canonicalization excludes database node IDs and submitted order fields');
  const baseFingerprint = await createWorkflowTemplateUpdateFingerprint(basePayload, webcrypto);
  const requestFingerprint = await createWorkflowTemplateUpdateRequestFingerprint(payload, baseFingerprint, webcrypto);
  assert.equal(requestFingerprint, createHash('sha256').update(JSON.stringify([baseFingerprint, fingerprint])).digest('hex'));
});

test('removing a recovery marker never removes a different request', async () => {
  const storage = new MemorySessionStorage();
  const rejectedStorage = new MemorySessionStorage();
  const recovery = await makeRecovery();
  persistWorkflowTemplateUpdateRecovery(storage, rejectedStorage, recovery);
  assert.equal(removeWorkflowTemplateUpdateRecovery(storage, rejectedStorage, { ...recovery, requestId: 'd9826272-9603-4b84-8fd4-4a329458785c' }), false);
  assert.deepEqual(readWorkflowTemplateUpdateRecovery(storage, 96, rejectedStorage), recovery);
  assert.equal(removeWorkflowTemplateUpdateRecovery(storage, rejectedStorage, recovery), true);
  assert.equal(readWorkflowTemplateUpdateRecovery(storage, 96, rejectedStorage), null);
});

test('a rejected request stays marked after session set and removal both fail', async () => {
  const storage = new MemorySessionStorage();
  const rejectedStorage = new MemorySessionStorage();
  const recovery = await makeRecovery();
  persistWorkflowTemplateUpdateRecovery(storage, rejectedStorage, recovery);
  storage.failSet = true;
  const rejected = markWorkflowTemplateUpdateRecoveryRejected(storage, rejectedStorage, recovery);
  assert(rejected, 'the rejected marker is persisted and verified before removal');
  storage.failRemove = true;
  assert.equal(removeWorkflowTemplateUpdateRecovery(storage, rejectedStorage, rejected), false);
  const reloaded = readWorkflowTemplateUpdateRecovery(storage, 96, rejectedStorage);
  assert(reloaded && reloaded !== 'invalid');
  assert.equal(reloaded.rejected, true, 'a reload can distinguish a rejected request from an ambiguous not-found result');
});

test('session rejected marker remains a fallback if localStorage writes fail', async () => {
  const storage = new MemorySessionStorage();
  const rejectedStorage = new MemorySessionStorage();
  const recovery = await makeRecovery();
  persistWorkflowTemplateUpdateRecovery(storage, rejectedStorage, recovery);
  rejectedStorage.failSet = true;
  const rejected = markWorkflowTemplateUpdateRecoveryRejected(storage, rejectedStorage, recovery);
  assert(rejected);
  const stored = readWorkflowTemplateUpdateRecovery(storage, 96, rejectedStorage);
  assert(stored && stored !== 'invalid');
  assert.equal(stored.rejected, true);
});
