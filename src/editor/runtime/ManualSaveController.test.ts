import assert from 'node:assert/strict';
import { ManualSaveController } from './ManualSaveController';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function caseSuccess() {
  const reasons: string[] = [];
  const controller = new ManualSaveController({
    documentId: 'manual:success',
    persist: async (_content, context) => { reasons.push(context.reason); },
  });

  const result = await controller.manualSave('content', 1);
  assert.deepEqual(result, { status: 'saved', revision: 1 });
  assert.deepEqual(reasons, ['manual']);
  assert.equal(controller.getStatus(), 'synced');
}

async function caseFailureCanRetry() {
  let calls = 0;
  const controller = new ManualSaveController({
    documentId: 'manual:failure',
    persist: async () => {
      calls += 1;
      if (calls === 1) throw new Error('expected failure');
    },
  });

  assert.equal((await controller.manualSave('content', 1)).status, 'failed');
  assert.equal(controller.getStatus(), 'conflicted');
  assert.equal((await controller.manualSave('content', 1)).status, 'saved');
  assert.equal(calls, 2);
}

async function caseDuplicateRevisionReusesInFlightSave() {
  const pending = deferred<void>();
  let calls = 0;
  const controller = new ManualSaveController({
    documentId: 'manual:duplicate',
    persist: async () => { calls += 1; await pending.promise; },
  });

  const first = controller.manualSave('content', 3);
  const second = controller.manualSave('content', 3);
  assert.equal(first, second);
  assert.equal(calls, 1);
  pending.resolve();
  assert.equal((await first).status, 'saved');
}

async function caseStaleRevisionDoesNotOverrideLatestState() {
  const oldSave = deferred<void>();
  const newSave = deferred<void>();
  const controller = new ManualSaveController({
    documentId: 'manual:stale',
    persist: async (_content, context) => {
      if (context.contentRevision === 1) await oldSave.promise;
      if (context.contentRevision === 2) await newSave.promise;
    },
  });

  const first = controller.manualSave('old', 1);
  const second = controller.manualSave('new', 2);
  newSave.resolve();
  assert.equal((await second).status, 'saved');
  oldSave.resolve();
  assert.equal((await first).status, 'saved');
  assert.deepEqual(controller.getRevisions(), { latestRevision: 2, persistedRevision: 2 });
  assert.equal(controller.getStatus(), 'synced');
  assert.equal((await controller.manualSave('stale', 1)).status, 'cancelled');
}

async function caseDestroyRejectsNewSave() {
  const controller = new ManualSaveController({
    documentId: 'manual:destroy',
    persist: async () => undefined,
  });

  controller.destroy();
  assert.deepEqual(await controller.manualSave('content', 1), {
    status: 'already_destroyed',
    revision: 1,
  });
}

async function main() {
  await caseSuccess();
  await caseFailureCanRetry();
  await caseDuplicateRevisionReusesInFlightSave();
  await caseStaleRevisionDoesNotOverrideLatestState();
  await caseDestroyRejectsNewSave();
  console.log('ManualSaveController tests passed');
}

void main();
