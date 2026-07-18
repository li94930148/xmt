import assert from 'node:assert/strict';
import {
  TopicDetailAggregateSaveGate,
  buildTopicDetailUpdatePayload,
  cloneTopicDetailDraft,
  createTopicDetailDraft,
  topicDetailDraftEquals,
} from './topicDetailAggregateDraft';
import type { Topic } from '../types';

const topic: Topic = {
  id: 1, title: 'title', description: '【项目背景】\nbackground\n\n【目标受众】\naudience', outline: '<p>outline</p>',
  status: 'pending', platform: 'video', deadline: '2026-07-17', creator_id: 1, assignee_id: 2,
  created_at: '2026-07-17 00:00:00', updated_at: '2026-07-17 00:00:00',
};

async function main() {
  const baseline = createTopicDetailDraft(topic);
  const singleField = cloneTopicDetailDraft(baseline);
  singleField.title = 'changed';
  assert.equal(topicDetailDraftEquals(singleField, baseline), false);

  const allFields = cloneTopicDetailDraft(baseline);
  allFields.title = 'all'; allFields.details.platform = 'web'; allFields.details.deadline = '2026-08-01';
  allFields.details.assignee_id = 3; allFields.parsedFields.projectBackground = 'new background';
  allFields.parsedFields.targetAudience = 'new audience'; allFields.description = 'derived'; allFields.outline = '<p>new</p>';
  assert.deepEqual(buildTopicDetailUpdatePayload(allFields), {
    title: 'all', description: '【项目背景】\nnew background\n\n【目标受众】\nnew audience', outline: '<p>new</p>',
    platform: 'web', deadline: '2026-08-01', assignee_id: 3,
  });
  assert.equal(topicDetailDraftEquals(cloneTopicDetailDraft(baseline), baseline), true);

  const saveSnapshot = cloneTopicDetailDraft(singleField);
  const draftChangedDuringSave = cloneTopicDetailDraft(saveSnapshot);
  draftChangedDuringSave.outline = '<p>changed while saving</p>';
  assert.equal(topicDetailDraftEquals(draftChangedDuringSave, saveSnapshot), false);

  const gate = new TopicDetailAggregateSaveGate();
  let calls = 0;
  let resolve!: () => void;
  const pending = new Promise<void>((done) => { resolve = done; });
  const first = gate.run(async () => { calls += 1; await pending; });
  const second = gate.run(async () => { calls += 1; });
  assert.equal(first, second);
  assert.equal(gate.isSaving, true);
  resolve();
  await first;
  assert.equal(calls, 1);
  assert.equal(gate.isSaving, false);
  console.log('TopicDetail aggregate draft tests passed');
}

void main();
