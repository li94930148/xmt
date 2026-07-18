import assert from 'node:assert/strict';
import { createTopicDetailManualAdapter } from './topicDetailManualAdapter';
import { resolveContentEditorSaveStrategy } from '../contracts/contentEditorAdapter';
import { ManualSaveController } from '../runtime/ManualSaveController';
import { shouldScheduleRuntimeAutosave } from '../runtime/SaveStrategyDispatch';

async function main() {
  let persists = 0;
  const adapter = createTopicDetailManualAdapter({
    documentId: 'topic:112',
    initialContent: '<p>topic</p>',
    readonly: false,
    persist: async () => { persists += 1; },
  });

  assert.equal(resolveContentEditorSaveStrategy(adapter), 'manual');
  assert.equal(adapter.collaborationRoom, '');
  assert.equal(adapter.capabilities.collaboration, false);
  assert.equal(shouldScheduleRuntimeAutosave(resolveContentEditorSaveStrategy(adapter)), false);

  const controller = new ManualSaveController({
    documentId: adapter.documentId,
    persist: adapter.persist,
  });
  assert.equal(persists, 0);
  assert.deepEqual(await controller.manualSave(adapter.initialContent, 1), { status: 'saved', revision: 1 });
  assert.equal(persists, 1);
  controller.destroy();
  assert.deepEqual(await controller.manualSave(adapter.initialContent, 2), { status: 'already_destroyed', revision: 2 });
  console.log('TopicDetail manual adapter tests passed');
}

void main();
