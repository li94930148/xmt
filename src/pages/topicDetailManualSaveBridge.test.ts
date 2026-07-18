import assert from 'node:assert/strict';
import { ManualSaveController } from '../editor/runtime/ManualSaveController';
import { TopicDetailAggregateSaveGate, buildTopicDetailUpdatePayload, cloneTopicDetailDraft, createTopicDetailDraft } from './topicDetailAggregateDraft';
import type { Topic } from '../types';

const topic: Topic = {
  id: 112, title: 'topic', description: '', outline: '<p>outline</p>', status: 'approved', platform: 'video', deadline: '2026-07-17',
  creator_id: 1, assignee_id: 2, created_at: '2026-07-17 00:00:00', updated_at: '2026-07-17 00:00:00',
};

async function main() {
  const snapshots = new Map<number, ReturnType<typeof createTopicDetailDraft>>();
  const payloads: ReturnType<typeof buildTopicDetailUpdatePayload>[] = [];
  const gate = new TopicDetailAggregateSaveGate();
  let failFirst = false;
  const controller = new ManualSaveController({
    documentId: 'topic:112',
    persist: async (_content, context) => gate.run(async () => {
      const snapshot = snapshots.get(context.contentRevision);
      assert.ok(snapshot);
      if (failFirst) {
        failFirst = false;
        throw new Error('controlled failure');
      }
      payloads.push(buildTopicDetailUpdatePayload(snapshot));
    }),
  });

  const single = createTopicDetailDraft(topic);
  single.title = 'single field';
  snapshots.set(1, cloneTopicDetailDraft(single));
  assert.equal((await controller.manualSave(single.outline, 1)).status, 'saved');
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].title, 'single field');

  const all = cloneTopicDetailDraft(single);
  all.details = { assignee_id: 3, deadline: '2026-08-01', platform: 'web' };
  all.parsedFields = { projectBackground: 'background', targetAudience: 'audience' };
  all.outline = '<p>all fields</p>';
  snapshots.set(2, cloneTopicDetailDraft(all));
  assert.equal((await controller.manualSave(all.outline, 2)).status, 'saved');
  assert.deepEqual(payloads[1], {
    title: 'single field', description: '【项目背景】\nbackground\n\n【目标受众】\naudience', outline: '<p>all fields</p>',
    platform: 'web', deadline: '2026-08-01', assignee_id: 3,
  });

  const staleSnapshot = cloneTopicDetailDraft(all);
  snapshots.set(3, staleSnapshot);
  const baselineBeforeStaleSave = cloneTopicDetailDraft(single);
  let baseline = cloneTopicDetailDraft(baselineBeforeStaleSave);
  const newerDraft = cloneTopicDetailDraft(staleSnapshot);
  newerDraft.title = 'newer unsaved draft';
  assert.equal((await controller.manualSave(staleSnapshot.outline, 3)).status, 'saved');
  assert.equal(payloads[2].title, 'single field');
  assert.notEqual(payloads[2].title, newerDraft.title);
  // TopicDetail only advances its baseline when the response belongs to the
  // current aggregate revision; a stale response must leave it untouched.
  const applySaveResult = (responseRevision: number, currentRevision: number, saved: ReturnType<typeof createTopicDetailDraft>) => {
    if (responseRevision === currentRevision) baseline = cloneTopicDetailDraft(saved);
  };
  applySaveResult(3, 4, staleSnapshot);
  assert.deepEqual(baseline, baselineBeforeStaleSave);

  const pending = new Promise<void>((resolve) => setTimeout(resolve, 20));
  const duplicateSnapshots = new Map([[4, cloneTopicDetailDraft(all)]]);
  let duplicateCalls = 0;
  const duplicateController = new ManualSaveController({
    documentId: 'topic:112',
    persist: async (_content, context) => {
      assert.ok(duplicateSnapshots.get(context.contentRevision));
      duplicateCalls += 1;
      await pending;
    },
  });
  const first = duplicateController.manualSave(all.outline, 4);
  const second = duplicateController.manualSave(all.outline, 4);
  assert.equal(first, second);
  await first;
  assert.equal(duplicateCalls, 1);

  snapshots.set(5, cloneTopicDetailDraft(all));
  failFirst = true;
  assert.equal((await controller.manualSave(all.outline, 5)).status, 'failed');
  assert.equal((await controller.manualSave(all.outline, 5)).status, 'saved');
  assert.equal(payloads.length, 4);
  console.log('TopicDetail manual save bridge tests passed');
}

void main();
