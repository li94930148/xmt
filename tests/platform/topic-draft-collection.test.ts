import assert from 'node:assert/strict';
import {
  clearTopicDraftCollection,
  legacyDesktopTopicDraftKey,
  persistTopicDraftCollection,
  readTopicDraftCollection,
  removeTopicDraftEntry,
  topicDraftKey,
  upsertTopicDraftEntry,
  type TopicDraft,
} from '../../src/utils/topicDraft.js';
import { readSafeDraftValue } from '../../src/platform/safe-draft.js';

const values = new Map<string, string>();
let storageWritesAvailable = true;
const unavailableDeleteKeys = new Set<string>();
const deleteAttempts: string[] = [];
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (!storageWritesAvailable) throw new Error('storage quota exceeded');
      values.set(key, value);
    },
    removeItem: (key: string) => {
      deleteAttempts.push(key);
      if (unavailableDeleteKeys.has(key)) throw new Error('storage deletion unavailable');
      values.delete(key);
    },
  },
  configurable: true,
});

const key = topicDraftKey(21);
const legacyKey = legacyDesktopTopicDraftKey(21);
assert(key && legacyKey);
const oldDraft: TopicDraft = {
  title: '旧版单草稿继续编辑', platform: '小红书', deadline: '', assignee_id: '3',
  projectBackground: '保留旧内容', targetAudience: '', expectedGoal: '', budget: '', outline: '大纲',
};

values.set(`xmt:safe-draft:v1:${key}`, JSON.stringify({ savedAt: Date.now(), value: oldDraft }));
let collection = readTopicDraftCollection(key, legacyKey);
assert.equal(collection.drafts.length, 1, 'the prior one-draft format migrates without dropping content');
assert.deepEqual(collection.drafts[0].draft, oldDraft);
assert.equal(collection.activeDraftId, collection.drafts[0].id);
assert.equal((readSafeDraftValue(key) as { schemaVersion?: number }).schemaVersion, 1, 'migration is persisted using the versioned collection format');

const firstId = collection.drafts[0].id;
const secondDraft = { ...oldDraft, title: '第二份独立草稿', platform: '抖音' };
collection = {
  ...collection,
  activeDraftId: firstId,
  drafts: upsertTopicDraftEntry(collection.drafts, firstId, { ...oldDraft, title: '续写后的第一份草稿' }, 200),
};
const secondId = 'draft-second';
collection.drafts = upsertTopicDraftEntry(collection.drafts, secondId, secondDraft, 300);
assert.equal(persistTopicDraftCollection(key, legacyKey, collection), true);
assert.deepEqual(collection.drafts.map((entry) => entry.draft.title), ['第二份独立草稿', '续写后的第一份草稿'], 'entries remain separately addressable and sort by latest save');

const restored = readTopicDraftCollection(key, legacyKey);
assert.equal(restored.activeDraftId, firstId, 'the selected draft remains selected after reload');
assert.equal(restored.drafts.length, 2);
assert.equal(restored.drafts.find((entry) => entry.id === firstId)?.draft.platform, '小红书');

const afterDelete = removeTopicDraftEntry(restored.drafts, secondId);
assert.deepEqual(afterDelete.map((entry) => entry.id), [firstId], 'deleting one draft preserves the other');

clearTopicDraftCollection(key, legacyKey);
values.set(`xmt:safe-draft:v1:${legacyKey}`, JSON.stringify({ savedAt: Date.now(), value: oldDraft }));
collection = readTopicDraftCollection(key, legacyKey);
assert.equal(collection.drafts[0]?.draft.title, oldDraft.title, 'legacy desktop drafts remain resumable');
assert.equal(readSafeDraftValue(legacyKey), null, 'legacy desktop content clears only after migration succeeds');

clearTopicDraftCollection(key, legacyKey);
values.set(`xmt:safe-draft:v1:${key}`, JSON.stringify({ savedAt: Date.now(), value: oldDraft }));
storageWritesAvailable = false;
collection = readTopicDraftCollection(key, legacyKey);
assert.equal(collection.drafts[0]?.draft.title, oldDraft.title, 'migration remains usable in the current session when storage is unavailable');
assert.equal((readSafeDraftValue(key) as TopicDraft).title, oldDraft.title, 'failed migration does not overwrite the last recoverable copy');
assert.equal(persistTopicDraftCollection(key, legacyKey, { ...collection, activeDraftId: 'new-active', drafts: [] }), false, 'storage failures are reported');
storageWritesAvailable = true;

assert.equal(clearTopicDraftCollection(key, legacyKey), true);
assert.equal(readTopicDraftCollection(key, legacyKey).drafts.length, 0, 'cleared collection starts empty');

const currentStorageKey = `xmt:safe-draft:v1:${key}`;
const legacyStorageKey = `xmt:safe-draft:v1:${legacyKey}`;
const seedSubmittedDraftCopies = () => {
  values.set(currentStorageKey, JSON.stringify({ savedAt: Date.now(), value: collection }));
  values.set(legacyStorageKey, JSON.stringify({ savedAt: Date.now(), value: oldDraft }));
};
seedSubmittedDraftCopies();
unavailableDeleteKeys.add(currentStorageKey);
deleteAttempts.length = 0;
assert.equal(clearTopicDraftCollection(key, legacyKey), false, 'failure to clear the submitted collection must be reported');
assert.deepEqual(deleteAttempts, [currentStorageKey, legacyStorageKey], 'legacy cleanup still runs when the current collection cannot be deleted');
assert.equal(readSafeDraftValue(key) !== null, true, 'the undeleted collection remains recoverable');
assert.equal(readSafeDraftValue(legacyKey), null, 'a failed current deletion does not skip a possible legacy cleanup');

unavailableDeleteKeys.clear();
seedSubmittedDraftCopies();
unavailableDeleteKeys.add(legacyStorageKey);
assert.equal(clearTopicDraftCollection(key, legacyKey), false, 'failure to clear a legacy submitted copy must be reported');
assert.equal(readSafeDraftValue(key), null, 'the current collection can be cleared even when legacy storage is unavailable');
assert.deepEqual(readSafeDraftValue(legacyKey), oldDraft, 'an undeleted legacy copy remains recoverable');

unavailableDeleteKeys.clear();
assert.equal(clearTopicDraftCollection(key, legacyKey), true, 'retry can clear the remaining submitted copy');
assert.equal(readTopicDraftCollection(key, legacyKey).drafts.length, 0, 'successful retry cannot restore a stale submitted draft');
assert.equal(clearTopicDraftCollection(null), true, 'an empty cleanup target requires no storage operation');

console.log('Topic draft collection tests passed');
