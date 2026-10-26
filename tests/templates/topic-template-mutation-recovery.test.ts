import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import {
  markTopicTemplateMutationRecoveryRejected,
  normalizeTopicTemplateCreatePayload,
  normalizeTopicTemplateData,
  normalizeTopicTemplateUpdatePayload,
  persistTopicTemplateMutationRecovery,
  readTopicTemplateMutationRecovery,
  removeTopicTemplateMutationRecovery,
  topicTemplateMutationFingerprint,
  type TopicTemplateMutationRecovery,
  type TopicTemplateRecoveryStorage,
} from '../../src/pages/topicTemplateMutationRecovery';

class MemoryStorage implements TopicTemplateRecoveryStorage {
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

const baseline = { id: 12, base_fingerprint: 'a'.repeat(64) };
const draft = { name: '  原始模板名称  ', platform: ' 抖音 ', description: ' 草稿说明 ', template_data: '原始正文\n' };

async function createRecovery() {
  const payload = normalizeTopicTemplateCreatePayload(draft);
  return {
    schemaVersion: 1 as const,
    actorId: 981,
    operation: 'create' as const,
    requestId: 'b01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a57',
    requestFingerprint: await topicTemplateMutationFingerprint('create', null, null, payload),
    targetId: null,
    baseFingerprint: null,
    payload,
    baseline: null,
    formSnapshot: { ...draft },
    rejected: false,
  } satisfies TopicTemplateMutationRecovery;
}

test('create normalization and fingerprint match the backend tuple and preserve form text separately', async () => {
  const payload = normalizeTopicTemplateCreatePayload({ ...draft, name: `${' 名'.repeat(70)}  `, is_default: 'false' });
  assert.equal(payload.name.length, 120);
  assert.equal(payload.platform, '抖音');
  assert.equal(payload.description, '草稿说明');
  assert.equal(payload.template_data, '原始正文\n');
  assert.equal(payload.is_default, true, 'Boolean coercion follows the server contract');
  assert.deepEqual(normalizeTopicTemplateCreatePayload({ ...draft, name: '名称', platform: '', description: '', template_data: '' }), {
    name: '名称', platform: '', description: '', template_data: '', is_default: false,
  });
  assert.equal(normalizeTopicTemplateData({ title: '对象正文' }), '{"title":"对象正文"}');
  assert.equal(normalizeTopicTemplateData(undefined), null);
  assert.equal(normalizeTopicTemplateData('按原样保留\n'), '按原样保留\n');
  const actual = await topicTemplateMutationFingerprint('create', null, null, payload);
  const expected = createHash('sha256').update(JSON.stringify(['create', payload]), 'utf8').digest('hex');
  assert.equal(actual, expected);
});

test('update fingerprint uses only present normalized fields in canonical order', async () => {
  const payload = normalizeTopicTemplateUpdatePayload({ name: ' 新名称 ', template_data: '新正文' });
  assert.deepEqual(Object.keys(payload), ['name', 'template_data']);
  assert.deepEqual(payload, { name: '新名称', template_data: '新正文' });
  const actual = await topicTemplateMutationFingerprint('update', baseline.id, baseline.base_fingerprint, payload);
  const expected = createHash('sha256')
    .update(JSON.stringify(['update', baseline.id, baseline.base_fingerprint, { name: '新名称', template_data: '新正文' }]), 'utf8')
    .digest('hex');
  assert.equal(actual, expected);
  const deleteFingerprint = await topicTemplateMutationFingerprint('delete', baseline.id, baseline.base_fingerprint, null);
  assert.equal(deleteFingerprint, createHash('sha256').update(JSON.stringify(['delete', 12, baseline.base_fingerprint]), 'utf8').digest('hex'));
});

test('recovery stores complete normalized request and exact form draft, scoped to actor', async () => {
  const recovery = await createRecovery();
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  assert.equal(persistTopicTemplateMutationRecovery(recovery, session, local), true);
  const read = readTopicTemplateMutationRecovery(981, session, local);
  assert.equal(read.kind, 'ready');
  if (read.kind !== 'ready') return;
  assert.deepEqual(read.recovery, recovery);
  assert.deepEqual(read.recovery.formSnapshot, draft, 'the exact pre-normalized form remains available after reload');
  assert.deepEqual(readTopicTemplateMutationRecovery(982, session, local), { kind: 'none' });
});

test('local rejected fallback survives session write and removal failure after reload', async () => {
  const recovery = await createRecovery();
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  assert.equal(persistTopicTemplateMutationRecovery(recovery, session, local), true);
  session.failSet = true;
  session.failRemove = true;
  assert.equal(markTopicTemplateMutationRecoveryRejected(recovery, session, local), true);
  const rejected = { ...recovery, rejected: true };
  assert.equal(removeTopicTemplateMutationRecovery(rejected, session, local), false, 'a failed primary removal cannot remove its local rejected fallback');
  const afterReload = readTopicTemplateMutationRecovery(981, session, local);
  assert.equal(afterReload.kind, 'ready');
  if (afterReload.kind !== 'ready') return;
  assert.equal(afterReload.recovery.rejected, true);
  assert.equal(afterReload.recovery.requestId, recovery.requestId);
  assert.deepEqual(afterReload.recovery.payload, recovery.payload);
});

test('recovery cleanup verifies exact request identity and both stores', async () => {
  const recovery = await createRecovery();
  const session = new MemoryStorage();
  const local = new MemoryStorage();
  assert.equal(persistTopicTemplateMutationRecovery(recovery, session, local), true);
  const otherId = { ...recovery, requestId: 'c01a2c3d-4e5f-4678-8a9b-0c1d2e3f4a57' };
  assert.equal(removeTopicTemplateMutationRecovery(otherId, session, local), false);
  assert.equal(readTopicTemplateMutationRecovery(981, session, local).kind, 'ready');
  assert.equal(removeTopicTemplateMutationRecovery(recovery, session, local), true);
  assert.deepEqual(readTopicTemplateMutationRecovery(981, session, local), { kind: 'none' });
});
