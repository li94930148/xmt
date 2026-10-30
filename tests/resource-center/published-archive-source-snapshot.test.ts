import assert from 'node:assert/strict';
import test from 'node:test';
import { findUniqueArchiveScriptSourceSnapshot } from '../../src/components/resource-center/findUniqueArchiveScriptSourceSnapshot.js';

const source = { topic_id: 71, production_id: 801, version: 'v1.0' };
const snapshot = { ...source, content: '<p>准确的 v1.0 来源正文</p>' };

test('archive source body requires exactly one same-topic production/version snapshot', () => {
  assert.equal(findUniqueArchiveScriptSourceSnapshot([snapshot], source), snapshot, 'one exact snapshot resolves');
  assert.equal(
    findUniqueArchiveScriptSourceSnapshot([snapshot, { ...snapshot, content: '<p>冲突副本</p>' }], source),
    undefined,
    'duplicate identities with conflicting bodies remain unresolved',
  );
  assert.equal(findUniqueArchiveScriptSourceSnapshot([], source), undefined, 'a missing snapshot remains unresolved');
  assert.equal(
    findUniqueArchiveScriptSourceSnapshot([{ ...snapshot, topic_id: 72 }], source),
    undefined,
    'a snapshot from another topic cannot resolve the source',
  );
});
