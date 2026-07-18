import assert from 'node:assert/strict';
import type { ContentEditorRuntimeHandle } from '../contracts/contentEditorAdapter';
import { RuntimeHandleBridge } from './RuntimeHandleBridge';

function createHandle(): ContentEditorRuntimeHandle {
  return {
    scheduleSave: () => undefined,
    manualSave: async (_content, revision) => ({ status: 'cancelled', revision }),
    flush: async () => ({ status: 'synced', latestRevision: 0, persistedRevision: 0 }),
    gracefulDispose: async () => ({
      outcome: 'durable',
      reason: 'route_transition',
      durability: { id: 'autosave', role: 'durability', status: 'synced' },
      bestEffort: [],
      latestRevision: 0,
      persistedRevision: 0,
      degraded: false,
    }),
    cancel: () => undefined,
    getStatus: () => 'idle',
    destroy: async () => undefined,
  };
}

function caseRuntimeReadySendsHandle() {
  const received: Array<ContentEditorRuntimeHandle | null> = [];
  const handle = createHandle();
  const bridge = new RuntimeHandleBridge();
  bridge.setListener((nextHandle) => received.push(nextHandle));
  bridge.publish(handle);

  assert.deepEqual(received, [handle]);
}

function caseUnmountSendsNull() {
  const received: Array<ContentEditorRuntimeHandle | null> = [];
  const handle = createHandle();
  const bridge = new RuntimeHandleBridge();
  bridge.setListener((nextHandle) => received.push(nextHandle));
  bridge.publish(handle);
  bridge.dispose();

  assert.deepEqual(received, [handle, null]);
}

function caseNoListenerIsSafe() {
  const bridge = new RuntimeHandleBridge();
  const handle = createHandle();
  bridge.publish(handle);
  bridge.release(handle);
  bridge.dispose();
}

function caseHandleSwitchDoesNotLeakOldReference() {
  const received: Array<ContentEditorRuntimeHandle | null> = [];
  const oldHandle = createHandle();
  const newHandle = createHandle();
  const bridge = new RuntimeHandleBridge();
  bridge.setListener((nextHandle) => received.push(nextHandle));
  bridge.publish(oldHandle);
  bridge.release(oldHandle);
  bridge.publish(newHandle);
  bridge.release(oldHandle);

  assert.deepEqual(received, [oldHandle, null, newHandle]);
}

function caseReplacingListenerReleasesOldReference() {
  const first: Array<ContentEditorRuntimeHandle | null> = [];
  const second: Array<ContentEditorRuntimeHandle | null> = [];
  const handle = createHandle();
  const bridge = new RuntimeHandleBridge();
  bridge.setListener((nextHandle) => first.push(nextHandle));
  bridge.publish(handle);
  bridge.setListener((nextHandle) => second.push(nextHandle));

  assert.deepEqual(first, [handle, null]);
  assert.deepEqual(second, [handle]);
}

function main() {
  caseRuntimeReadySendsHandle();
  caseUnmountSendsNull();
  caseNoListenerIsSafe();
  caseHandleSwitchDoesNotLeakOldReference();
  caseReplacingListenerReleasesOldReference();
  console.log('RuntimeHandleBridge tests passed');
}

main();
