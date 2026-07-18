import assert from 'node:assert/strict';
import type {
  AggregateDisposeResult,
  ContentEditorRuntimeHandle,
} from '../editor/contracts/contentEditorAdapter';
import { EditorLeaveGuardController } from './useEditorLeaveGuard';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

function disposeResult(outcome: AggregateDisposeResult['outcome'], degraded = false): AggregateDisposeResult {
  const status = outcome === 'durable' ? 'synced' : outcome === 'not_durable' ? 'failed' : 'cancelled';
  return {
    outcome,
    reason: 'route_transition',
    durability: { id: 'autosave', role: 'durability', status },
    bestEffort: [],
    latestRevision: 1,
    persistedRevision: outcome === 'durable' ? 1 : 0,
    degraded,
  };
}

function handleFor(
  gracefulDispose: ContentEditorRuntimeHandle['gracefulDispose'],
  destroy: ContentEditorRuntimeHandle['destroy'] = async () => undefined,
): ContentEditorRuntimeHandle {
  return {
    scheduleSave: () => undefined,
    manualSave: async (_content, revision) => ({ status: 'cancelled', revision }),
    flush: async () => ({ status: 'synced', latestRevision: 0, persistedRevision: 0 }),
    gracefulDispose,
    cancel: () => undefined,
    getStatus: () => 'idle',
    destroy,
  };
}

function controllerFor(handle: ContentEditorRuntimeHandle | null) {
  const snapshots: string[] = [];
  const ref = { current: handle };
  const controller = new EditorLeaveGuardController(
    () => ref.current,
    100,
    ({ state }) => snapshots.push(state),
  );
  return { controller, ref, snapshots };
}

const request = (continuation: () => void | Promise<void>) => ({
  reason: 'route_transition' as const,
  continuation,
});

async function caseDurableAutomaticallyLeaves() {
  let continued = 0;
  const { controller } = controllerFor(handleFor(async () => disposeResult('durable')));
  const result = await controller.requestLeave(request(() => { continued += 1; }));

  assert.equal(result.decision, 'proceeded');
  assert.equal(continued, 1);
}

async function caseDurableDegradedAutomaticallyLeaves() {
  let continued = 0;
  const { controller } = controllerFor(handleFor(async () => disposeResult('durable', true)));
  const result = await controller.requestLeave(request(() => { continued += 1; }));

  assert.equal(result.decision, 'proceeded');
  assert.equal(result.warning, 'collaboration_unconfirmed');
  assert.equal(continued, 1);
}

async function caseNotDurableBlocksLeaving() {
  let continued = 0;
  const { controller, snapshots } = controllerFor(handleFor(async () => disposeResult('not_durable')));
  const result = await controller.requestLeave(request(() => { continued += 1; }));

  assert.equal(result.decision, 'waiting_confirmation');
  assert.equal(continued, 0);
  assert.equal(snapshots.at(-1), 'waiting_confirmation');
}

async function caseRetrySucceeds() {
  let calls = 0;
  let continued = 0;
  const { controller } = controllerFor(handleFor(async () => {
    calls += 1;
    return disposeResult(calls === 1 ? 'not_durable' : 'durable');
  }));

  await controller.requestLeave(request(() => { continued += 1; }));
  const result = await controller.retry();

  assert.equal(result?.decision, 'proceeded');
  assert.equal(calls, 2);
  assert.equal(continued, 1);
}

async function caseDiscardDestroysBeforeLeaving() {
  const order: string[] = [];
  const { controller } = controllerFor(handleFor(
    async () => disposeResult('not_durable'),
    async () => { order.push('destroy'); },
  ));

  await controller.requestLeave(request(() => { order.push('continue'); }));
  const result = await controller.discardAndLeave();

  assert.equal(result?.decision, 'proceeded');
  assert.deepEqual(order, ['destroy', 'continue']);
}

async function caseDuplicateRequestReusesInFlight() {
  const pending = deferred<AggregateDisposeResult>();
  let disposeCalls = 0;
  let continued = 0;
  const { controller } = controllerFor(handleFor(() => {
    disposeCalls += 1;
    return pending.promise;
  }));
  const first = controller.requestLeave(request(() => { continued += 1; }));
  const second = controller.requestLeave(request(() => { continued += 1; }));
  assert.equal(first, second);
  pending.resolve(disposeResult('durable'));
  await first;

  assert.equal(disposeCalls, 1);
  assert.equal(continued, 1);
}

async function caseNoHandleProceedsImmediately() {
  let continued = 0;
  const { controller } = controllerFor(null);
  const result = await controller.requestLeave(request(() => { continued += 1; }));

  assert.equal(result.decision, 'proceeded');
  assert.equal(continued, 1);
}

async function main() {
  await caseDurableAutomaticallyLeaves();
  await caseDurableDegradedAutomaticallyLeaves();
  await caseNotDurableBlocksLeaving();
  await caseRetrySucceeds();
  await caseDiscardDestroysBeforeLeaving();
  await caseDuplicateRequestReusesInFlight();
  await caseNoHandleProceedsImmediately();
  console.log('useEditorLeaveGuard tests passed');
}

void main();
