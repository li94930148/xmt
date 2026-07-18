import assert from 'node:assert/strict';
import type {
  AggregateDisposeResult,
  ContentEditorRuntimeHandle,
} from '../editor/contracts/contentEditorAdapter';
import { getEditorLeaveFailureDialogView } from '../components/editor/EditorLeaveFailureDialog';
import { EditorLeaveGuardController } from '../hooks/useEditorLeaveGuard';

function disposeResult(outcome: AggregateDisposeResult['outcome']): AggregateDisposeResult {
  return {
    outcome,
    reason: 'route_transition',
    durability: {
      id: 'autosave',
      role: 'durability',
      status: outcome === 'durable' ? 'synced' : outcome === 'not_durable' ? 'failed' : 'cancelled',
    },
    bestEffort: [],
    latestRevision: 2,
    persistedRevision: outcome === 'durable' ? 2 : 1,
    degraded: false,
  };
}

function handleFor(
  gracefulDispose: ContentEditorRuntimeHandle['gracefulDispose'],
  destroy: ContentEditorRuntimeHandle['destroy'] = async () => undefined,
): ContentEditorRuntimeHandle {
  return {
    scheduleSave: () => undefined,
    manualSave: async (_content, revision) => ({ status: 'cancelled', revision }),
    flush: async () => ({ status: 'synced', latestRevision: 2, persistedRevision: 2 }),
    gracefulDispose,
    cancel: () => undefined,
    getStatus: () => 'synced',
    destroy,
  };
}

function controllerFor(handle: ContentEditorRuntimeHandle) {
  return new EditorLeaveGuardController(
    () => handle,
    100,
    () => undefined,
  );
}

const request = (continuation: () => void) => ({ reason: 'route_transition' as const, continuation });

// Shooting normal leave and a flushed, last script_content revision both use the durable path.
let normalNavigations = 0;
const normalController = controllerFor(handleFor(async () => disposeResult('durable')));
assert.equal((await normalController.requestLeave(request(() => { normalNavigations += 1; }))).decision, 'proceeded');
assert.equal(normalNavigations, 1);

// A failed script_content persistence blocks navigation and maps to the shared dialog.
let blockedNavigations = 0;
const failedController = controllerFor(handleFor(async () => disposeResult('not_durable')));
const failedResult = await failedController.requestLeave(request(() => { blockedNavigations += 1; }));
assert.equal(failedResult.decision, 'waiting_confirmation');
assert.equal(blockedNavigations, 0);
assert.equal(getEditorLeaveFailureDialogView(failedResult)?.retryAvailable, true);

// Retry uses the original continuation and navigates exactly once after recovery.
let retryCalls = 0;
let retryNavigations = 0;
const retryController = controllerFor(handleFor(async () => {
  retryCalls += 1;
  return disposeResult(retryCalls === 1 ? 'not_durable' : 'durable');
}));
await retryController.requestLeave(request(() => { retryNavigations += 1; }));
assert.equal((await retryController.retry())?.decision, 'proceeded');
assert.equal(retryCalls, 2);
assert.equal(retryNavigations, 1);

// Discard retains the existing destroy-before-navigation contract.
const discardOrder: string[] = [];
const discardController = controllerFor(handleFor(
  async () => disposeResult('not_durable'),
  async () => { discardOrder.push('destroy'); },
));
await discardController.requestLeave(request(() => { discardOrder.push('navigate'); }));
await discardController.discardAndLeave();
assert.deepEqual(discardOrder, ['destroy', 'navigate']);

// Consecutive leave requests reuse the single in-flight graceful dispose and navigation.
let resolveDispose: (() => void) | undefined;
let disposeCalls = 0;
let duplicateNavigations = 0;
const pendingDispose = new Promise<AggregateDisposeResult>((resolve) => {
  resolveDispose = () => resolve(disposeResult('durable'));
});
const duplicateController = controllerFor(handleFor(() => {
  disposeCalls += 1;
  return pendingDispose;
}));
const firstLeave = duplicateController.requestLeave(request(() => { duplicateNavigations += 1; }));
const secondLeave = duplicateController.requestLeave(request(() => { duplicateNavigations += 1; }));
assert.equal(firstLeave, secondLeave);
resolveDispose?.();
await firstLeave;
assert.equal(disposeCalls, 1);
assert.equal(duplicateNavigations, 1);

process.stdout.write('Shooting leave-flow tests passed\n');
