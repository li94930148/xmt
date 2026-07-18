import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EditorLeaveFailureDialog, {
  EditorLeaveFailureActionGate,
  getEditorLeaveFailureDialogView,
} from './EditorLeaveFailureDialog';
import type { EditorLeaveGuardResult, LeaveActionResult } from '../../hooks/useEditorLeaveGuard';

const proceeded = (): LeaveActionResult => ({ decision: 'proceeded', result: leaveResult('durable') });
const waitingConfirmation = (): LeaveActionResult => ({ decision: 'waiting_confirmation', result: leaveResult('not_durable') });
const cancelled = (): LeaveActionResult => ({ decision: 'cancelled' });

function leaveResult(outcome: 'durable' | 'not_durable' | 'interrupted'): EditorLeaveGuardResult {
  return {
    decision: outcome === 'durable' ? 'proceeded' : 'waiting_confirmation',
    disposeResult: {
      outcome,
      reason: 'route_transition',
      durability: {
        id: 'autosave',
        role: 'durability',
        status: outcome === 'not_durable' ? 'failed' : outcome === 'interrupted' ? 'cancelled' : 'synced',
      },
      bestEffort: [],
      latestRevision: 1,
      persistedRevision: outcome === 'durable' ? 1 : 0,
      degraded: false,
    },
  };
}

const notDurable = getEditorLeaveFailureDialogView(leaveResult('not_durable'));
assert.equal(notDurable?.title, '未能确认保存');
assert.equal(notDurable?.retryAvailable, true);

const failureDialogMarkup = renderToStaticMarkup(createElement(EditorLeaveFailureDialog, {
  open: true,
  state: 'waiting_confirmation',
  result: leaveResult('not_durable'),
  onContinueEditing: () => undefined,
  onRetry: proceeded,
  onDiscardAndLeave: proceeded,
}));
assert.match(failureDialogMarkup, /未能确认保存/);
assert.match(failureDialogMarkup, /重试保存/);
assert.match(failureDialogMarkup, /放弃离开/);

const interrupted = getEditorLeaveFailureDialogView(leaveResult('interrupted'));
assert.equal(interrupted?.title, '保存过程已中断');
assert.equal(interrupted?.retryAvailable, false);

assert.equal(getEditorLeaveFailureDialogView(leaveResult('durable')), null);

function deferred() {
  let resolve: ((value: LeaveActionResult) => void) | undefined;
  const promise = new Promise<LeaveActionResult>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve: () => resolve?.(proceeded()) };
}

function nextTask() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

// retry -> discard: retry is synchronously locked as the winner.
const retryFirstStates: string[] = [];
const retryFirstGate = new EditorLeaveFailureActionGate((snapshot) => retryFirstStates.push(snapshot.state));
const retryFirstDeferred = deferred();
let retryFirstCalls = 0;
let discardAfterRetryCalls = 0;
const retryFirst = retryFirstGate.run('retry', () => {
  retryFirstCalls += 1;
  return retryFirstDeferred.promise;
});
const discardAfterRetry = retryFirstGate.run('discard', () => {
  discardAfterRetryCalls += 1;
  return proceeded();
});
assert.deepEqual(await discardAfterRetry, { winner: 'retry', accepted: false, result: cancelled() });
assert.equal(retryFirstCalls, 0, 'winner is locked before its deferred callback starts');
assert.equal(discardAfterRetryCalls, 0);
await nextTask();
assert.equal(retryFirstCalls, 1);
retryFirstDeferred.resolve();
assert.deepEqual(await retryFirst, { winner: 'retry', accepted: true, result: proceeded() });
assert.deepEqual(retryFirstStates, ['action_pending', 'action_running', 'action_completed']);
assert.deepEqual(retryFirstGate.getSnapshot(), { state: 'action_completed', winner: 'retry' });

// discard -> retry: discard is synchronously locked as the winner.
const discardFirstGate = new EditorLeaveFailureActionGate();
const discardFirstDeferred = deferred();
let discardFirstCalls = 0;
let retryAfterDiscardCalls = 0;
const discardFirst = discardFirstGate.run('discard', () => {
  discardFirstCalls += 1;
  return discardFirstDeferred.promise;
});
const retryAfterDiscard = discardFirstGate.run('retry', () => {
  retryAfterDiscardCalls += 1;
  return proceeded();
});
assert.deepEqual(await retryAfterDiscard, { winner: 'discard', accepted: false, result: cancelled() });
assert.equal(discardFirstCalls, 0);
assert.equal(retryAfterDiscardCalls, 0);
await nextTask();
assert.equal(discardFirstCalls, 1);
discardFirstDeferred.resolve();
assert.deepEqual(await discardFirst, { winner: 'discard', accepted: true, result: proceeded() });

// Same-action repeats are also ignored after the first click.
for (const action of ['retry', 'discard'] as const) {
  const gate = new EditorLeaveFailureActionGate();
  const pending = deferred();
  let calls = 0;
  const first = gate.run(action, () => {
    calls += 1;
    return pending.promise;
  });
  const second = gate.run(action, () => {
    calls += 1;
    return proceeded();
  });
  assert.deepEqual(await second, { winner: action, accepted: false, result: cancelled() });
  assert.equal(calls, 0, `${action} is locked before its deferred callback`);
  await nextTask();
  assert.equal(calls, 1, `${action} executes once`);
  pending.resolve();
  assert.deepEqual(await first, { winner: action, accepted: true, result: proceeded() });
}

// A waiting confirmation releases the lock and keeps the dialog actionable.
const recoveryGate = new EditorLeaveFailureActionGate();
assert.deepEqual(await recoveryGate.run('retry', waitingConfirmation), {
  winner: 'retry', accepted: true, result: waitingConfirmation(),
});
assert.deepEqual(recoveryGate.getSnapshot(), { state: 'idle', winner: null });
assert.deepEqual(await recoveryGate.run('discard', proceeded), { winner: 'discard', accepted: true, result: proceeded() });

// A failed callback is a result, not an unhandled promise, and releases the lock.
const syncRecoveryGate = new EditorLeaveFailureActionGate();
const failed = await syncRecoveryGate.run('discard', () => { throw new Error('discard failed synchronously'); });
assert.equal(failed.result.decision, 'failed');
assert.deepEqual(syncRecoveryGate.getSnapshot(), { state: 'idle', winner: null });
assert.deepEqual(await syncRecoveryGate.run('retry', proceeded), { winner: 'retry', accepted: true, result: proceeded() });

// Continue editing does not enter the action gate.
let continueEditingCalls = 0;
const continueEditing = () => { continueEditingCalls += 1; };
continueEditing();
assert.equal(continueEditingCalls, 1);

process.stdout.write('EditorLeaveFailureDialog tests passed\n');
