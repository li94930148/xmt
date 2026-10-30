import assert from 'node:assert/strict';
import { RuntimeAutosaveCoordinator } from './AutosaveCoordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function caseConfirmedFailedContentIsNotRetried() {
  let attempts = 0;
  const coordinator = new RuntimeAutosaveCoordinator({
    documentId: 'production:1',
    delay: 60_000,
    persist: async () => {
      attempts += 1;
      throw new Error('write response lost');
    },
  });
  coordinator.scheduleSave('confirmed body', 1);

  assert.equal((await coordinator.flush()).status, 'failed');
  assert.equal(coordinator.getStatus(), 'conflicted');
  assert.equal(coordinator.confirmPersistedContent('confirmed body'), true);
  assert.deepEqual(coordinator.getRevisions(), { latestRevision: 1, persistedRevision: 1 });
  assert.equal(coordinator.getStatus(), 'synced');
  assert.equal((await coordinator.flush()).status, 'synced');
  assert.equal(attempts, 1, 'read-back confirmation clears the matching failed retry');
}

async function caseMismatchedConfirmationKeepsFailedRetry() {
  let attempts = 0;
  const coordinator = new RuntimeAutosaveCoordinator({
    documentId: 'production:2',
    delay: 60_000,
    persist: async () => {
      attempts += 1;
      throw new Error('not saved');
    },
  });
  coordinator.scheduleSave('local body', 1);
  assert.equal((await coordinator.flush()).status, 'failed');

  assert.equal(coordinator.confirmPersistedContent('different server body'), false);
  assert.equal(coordinator.getRevisions().persistedRevision, -1);
  assert.equal((await coordinator.flush()).status, 'failed');
  assert.equal(attempts, 2, 'a mismatched read-back leaves the request available for explicit retry');
}

async function caseMatchingPendingContentCanBeConfirmedBeforeDispatch() {
  let attempts = 0;
  const coordinator = new RuntimeAutosaveCoordinator({
    documentId: 'production:3',
    delay: 60_000,
    persist: async () => { attempts += 1; },
  });
  coordinator.scheduleSave('already persisted', 4);

  assert.equal(coordinator.confirmPersistedContent('already persisted'), true);
  assert.deepEqual(coordinator.getRevisions(), { latestRevision: 4, persistedRevision: 4 });
  assert.equal((await coordinator.flush()).status, 'synced');
  assert.equal(attempts, 0, 'confirmed pending content is removed without a redundant request');
}

async function caseDiscardDropsQueuedAndFailedContent() {
  let attempts = 0;
  const coordinator = new RuntimeAutosaveCoordinator({
    documentId: 'production:4',
    delay: 60_000,
    persist: async () => {
      attempts += 1;
      throw new Error('not saved');
    },
  });
  coordinator.scheduleSave('outdated local body', 1);
  assert.equal((await coordinator.flush()).status, 'failed');
  assert.equal(coordinator.discardPendingSaves(), true);
  assert.equal(coordinator.getStatus(), 'idle');
  assert.equal(coordinator.getRevisions().persistedRevision, -1, 'discarding does not claim the request was saved');
  assert.equal((await coordinator.flush()).status, 'synced');
  assert.equal(attempts, 1, 'discarded content is not retried by a later flush');
}

async function caseInFlightDiscardDoesNotQueueItsLaterFailure() {
  const pendingWrite = deferred<void>();
  let attempts = 0;
  const coordinator = new RuntimeAutosaveCoordinator({
    documentId: 'production:5',
    delay: 60_000,
    persist: () => {
      attempts += 1;
      return pendingWrite.promise;
    },
  });
  coordinator.scheduleSave('outdated in-flight body', 1);
  const currentFlush = coordinator.flush();
  await Promise.resolve();
  assert.equal(attempts, 1);
  coordinator.scheduleSave('queued body', 2);

  assert.equal(coordinator.discardPendingSaves(), true);
  assert.equal(coordinator.getStatus(), 'conflicted', 'the current request remains visible as unresolved while it settles');
  pendingWrite.reject(new Error('read-back showed different content'));
  assert.equal((await currentFlush).status, 'failed');
  assert.equal((await coordinator.flush()).status, 'synced');
  assert.equal(attempts, 1, 'neither the rejected in-flight write nor the queued snapshot can replay');
  assert.deepEqual(coordinator.getRevisions(), { latestRevision: 2, persistedRevision: -1 });
}

async function main() {
  await caseConfirmedFailedContentIsNotRetried();
  await caseMismatchedConfirmationKeepsFailedRetry();
  await caseMatchingPendingContentCanBeConfirmedBeforeDispatch();
  await caseDiscardDropsQueuedAndFailedContent();
  await caseInFlightDiscardDoesNotQueueItsLaterFailure();
  console.log('AutosaveCoordinator recovery reconciliation tests passed');
}

void main();
