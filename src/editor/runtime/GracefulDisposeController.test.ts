import assert from 'node:assert/strict';
import type { DisposeParticipant } from '../contracts/contentEditorAdapter';
import { RuntimeAutosaveCoordinator } from './AutosaveCoordinator';
import { GracefulDisposeController } from './GracefulDisposeController';

const options = { reason: 'route_transition' as const, timeoutMs: 100 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

function participant(
  id: string,
  dispose: DisposeParticipant['dispose'],
): DisposeParticipant {
  return { id, role: 'best_effort', dispose };
}

function autosave(persist: (content: string) => Promise<void>) {
  const coordinator = new RuntimeAutosaveCoordinator({ documentId: 'test:document', persist });
  coordinator.scheduleSave('latest content', 1);
  return coordinator;
}

async function caseAutosaveSuccessCollaborationFailure() {
  const coordinator = autosave(async () => undefined);
  const result = await new GracefulDisposeController(coordinator).gracefulDispose({
    ...options,
    participants: [participant('collaboration', async () => ({ id: 'ignored', role: 'best_effort', status: 'failed' }))],
  });

  assert.equal(result.outcome, 'durable');
  assert.equal(result.durability.status, 'synced');
  assert.equal(result.bestEffort[0].status, 'failed');
  assert.equal(result.degraded, true);
}

async function caseAutosaveSuccessCollaborationTimeout() {
  const pending = deferred<{ id: string; role: 'best_effort'; status: 'synced' }>();
  const coordinator = autosave(async () => undefined);
  const result = await new GracefulDisposeController(coordinator).gracefulDispose({
    ...options,
    timeoutMs: 5,
    participants: [participant('collaboration', () => pending.promise)],
  });
  pending.resolve({ id: 'collaboration', role: 'best_effort', status: 'synced' });

  assert.equal(result.outcome, 'durable');
  assert.equal(result.bestEffort[0].status, 'timed_out');
  assert.equal(result.degraded, true);
}

async function caseAutosaveFailureCollaborationSuccess() {
  const coordinator = autosave(async () => { throw new Error('persist failed'); });
  const result = await new GracefulDisposeController(coordinator).gracefulDispose({
    ...options,
    participants: [participant('collaboration', async () => ({
      id: 'collaboration', role: 'best_effort', status: 'synced', detail: 'local_outbound_flushed',
    }))],
  });

  assert.equal(result.outcome, 'not_durable');
  assert.equal(result.durability.status, 'failed');
  assert.equal(result.bestEffort[0].status, 'synced');
  assert.equal(coordinator.getLifecycleState(), 'active');
}

async function caseBothParticipantsTimeout() {
  const pendingPersist = deferred<void>();
  const pendingCollaboration = deferred<{ id: string; role: 'best_effort'; status: 'synced' }>();
  const coordinator = autosave(() => pendingPersist.promise);
  const result = await new GracefulDisposeController(coordinator).gracefulDispose({
    ...options,
    timeoutMs: 5,
    participants: [participant('collaboration', () => pendingCollaboration.promise)],
  });
  pendingPersist.resolve();
  pendingCollaboration.resolve({ id: 'collaboration', role: 'best_effort', status: 'synced' });

  assert.equal(result.outcome, 'not_durable');
  assert.equal(result.durability.status, 'timed_out');
  assert.equal(result.bestEffort[0].status, 'timed_out');
}

async function caseDuplicateDisposeReusesInFlight() {
  const pending = deferred<void>();
  const coordinator = autosave(() => pending.promise);
  const controller = new GracefulDisposeController(coordinator);
  const first = controller.gracefulDispose(options);
  const second = controller.gracefulDispose(options);
  assert.equal(first, second);
  pending.resolve();
  assert.equal((await first).outcome, 'durable');
}

async function caseRetrySuccessEntersDisposed() {
  let attempts = 0;
  const coordinator = autosave(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('first attempt failed');
  });
  const controller = new GracefulDisposeController(coordinator);

  assert.equal((await controller.gracefulDispose(options)).outcome, 'not_durable');
  assert.equal(coordinator.getLifecycleState(), 'active');
  assert.equal((await controller.gracefulDispose(options)).outcome, 'durable');
  assert.equal(coordinator.getLifecycleState(), 'disposed');
}

async function caseDisposedRejectsSaving() {
  const coordinator = autosave(async () => undefined);
  const controller = new GracefulDisposeController(coordinator);
  assert.equal((await controller.gracefulDispose(options)).outcome, 'durable');
  assert.equal(coordinator.scheduleSave('after dispose', 2), false);
}

async function main() {
  await caseAutosaveSuccessCollaborationFailure();
  await caseAutosaveSuccessCollaborationTimeout();
  await caseAutosaveFailureCollaborationSuccess();
  await caseBothParticipantsTimeout();
  await caseDuplicateDisposeReusesInFlight();
  await caseRetrySuccessEntersDisposed();
  await caseDisposedRejectsSaving();
  console.log('GracefulDisposeController aggregation tests passed');
}

void main();
