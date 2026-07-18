import assert from 'node:assert/strict';
import { TopicLeaveGuardController } from './useTopicDetailLeaveGuard';

async function main() {
  let dirty = false;
  let saves = 0;
  let discards = 0;
  let navigations = 0;
  const states: string[] = [];
  const controller = new TopicLeaveGuardController({
    isDirty: () => dirty,
    save: async () => { saves += 1; dirty = false; },
    discard: () => { discards += 1; dirty = false; },
  }, (state) => states.push(state));

  // clean leave navigates immediately.
  assert.deepEqual(await controller.requestLeave(() => { navigations += 1; }), { decision: 'proceeded' });
  assert.equal(navigations, 1);

  // dirty save-and-leave persists once, clears dirty, then navigates once.
  dirty = true;
  assert.deepEqual(await controller.requestLeave(() => { navigations += 1; }), { decision: 'waiting_confirmation' });
  assert.deepEqual(await controller.saveAndLeave(), { decision: 'proceeded' });
  assert.equal(saves, 1);
  assert.equal(navigations, 2);

  // discard restores/discards locally and never calls save.
  const discardController = new TopicLeaveGuardController({
    isDirty: () => dirty,
    save: async () => { saves += 1; dirty = false; },
    discard: () => { discards += 1; dirty = false; },
  }, () => undefined);
  dirty = true;
  await discardController.requestLeave(() => { navigations += 1; });
  assert.deepEqual(await discardController.discardAndLeave(), { decision: 'proceeded' });
  assert.equal(discards, 1);
  assert.equal(saves, 1);
  assert.equal(navigations, 3);

  // failure retains the pending navigation and supports a later retry.
  let shouldFail = true;
  const retryController = new TopicLeaveGuardController({
    isDirty: () => dirty,
    save: async () => {
      if (shouldFail) throw new Error('controlled failure');
      dirty = false;
    },
    discard: () => { dirty = false; },
  }, () => undefined);
  dirty = true;
  await retryController.requestLeave(() => { navigations += 1; });
  assert.equal((await retryController.saveAndLeave()).decision, 'failed');
  assert.equal(navigations, 3);
  shouldFail = false;
  assert.deepEqual(await retryController.saveAndLeave(), { decision: 'proceeded' });
  assert.equal(navigations, 4);

  // Two save clicks share one in-flight save and navigation.
  let resolveSave!: () => void;
  const pendingSave = new Promise<void>((resolve) => { resolveSave = resolve; });
  let duplicateSaveCalls = 0;
  const duplicateController = new TopicLeaveGuardController({
    isDirty: () => dirty,
    save: async () => { duplicateSaveCalls += 1; await pendingSave; dirty = false; },
    discard: () => { dirty = false; },
  }, () => undefined);
  dirty = true;
  await duplicateController.requestLeave(() => { navigations += 1; });
  const first = duplicateController.saveAndLeave();
  const second = duplicateController.saveAndLeave();
  assert.equal(first, second);
  resolveSave();
  assert.deepEqual(await first, { decision: 'proceeded' });
  assert.equal(duplicateSaveCalls, 1);
  assert.equal(navigations, 5);

  // A concurrent edit keeps the dialog open after the completed save.
  const concurrentController = new TopicLeaveGuardController({
    isDirty: () => dirty,
    save: async () => { dirty = true; },
    discard: () => { dirty = false; },
  }, () => undefined);
  dirty = true;
  await concurrentController.requestLeave(() => { navigations += 1; });
  assert.deepEqual(await concurrentController.saveAndLeave(), { decision: 'waiting_confirmation' });
  assert.equal(navigations, 5);
  assert.ok(states.includes('clean'));
  console.log('TopicDetail leave guard tests passed');
}

void main();
