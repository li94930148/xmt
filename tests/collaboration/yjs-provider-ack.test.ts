import assert from 'node:assert/strict';
import type { Socket } from 'socket.io-client';
import * as Y from 'yjs';
import {
  COLLABORATION_EVENTS,
  type CollaborationUpdateAcknowledgement,
  type CollaborationUpdatePayload,
} from '../../src/collaboration/core/events';
import type {
  CollaborationUpdateOutbox,
  PendingCollaborationUpdate,
} from '../../src/collaboration/yjs/IndexedDbUpdateOutbox';
import { SocketYjsProvider } from '../../src/collaboration/yjs/SocketYjsProvider';

type Listener = (payload: never) => void;

class FakeSocket {
  connected = true;
  readonly listeners = new Map<string, Set<Listener>>();
  readonly updates: Array<{
    payload: CollaborationUpdatePayload;
    acknowledge: (result: CollaborationUpdateAcknowledgement) => void;
  }> = [];

  on(event: string, listener: Listener) {
    const listeners = this.listeners.get(event) || new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: Listener) {
    this.listeners.get(event)?.delete(listener);
    return this;
  }

  emit(event: string, payload: unknown, acknowledge?: (result: CollaborationUpdateAcknowledgement) => void) {
    if (event === COLLABORATION_EVENTS.UPDATE && acknowledge) {
      this.updates.push({ payload: payload as CollaborationUpdatePayload, acknowledge });
    }
    return this;
  }

  receive<T>(event: string, payload: T) {
    this.listeners.get(event)?.forEach((listener) => listener(payload as never));
  }
}

class MemoryOutbox implements CollaborationUpdateOutbox {
  private nextId = 1;
  private readonly entries: Array<PendingCollaborationUpdate & { userId: number; roomId: string }> = [];

  async list(userId: number, roomId: string) {
    return this.entries
      .filter((entry) => entry.userId === userId && entry.roomId === roomId)
      .map(({ id, update, createdAt }) => ({ id, update: update.slice(), createdAt }));
  }

  async append(userId: number, roomId: string, update: Uint8Array) {
    const id = this.nextId++;
    this.entries.push({ id, userId, roomId, update: update.slice(), createdAt: Date.now() });
    return id;
  }

  async remove(userId: number, roomId: string, ids: number[]) {
    const idSet = new Set(ids);
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index]!;
      if (entry.userId === userId && entry.roomId === roomId && idSet.has(entry.id)) this.entries.splice(index, 1);
    }
  }
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const roomId = 'production:77@v1.0';
const fakeSocket = new FakeSocket();
const outbox = new MemoryOutbox();
let confirmedCount = 0;
const conflicts: Array<{ code?: string; reason?: string }> = [];
const provider = new SocketYjsProvider({
  socket: fakeSocket as unknown as Socket,
  roomId,
  user: { id: 7, name: 'QA', color: '#2563eb' },
  outbox,
  onUpdatesConfirmed: () => { confirmedCount += 1; },
  onConflict: (payload) => conflicts.push(payload),
});

const emptyDoc = new Y.Doc();
fakeSocket.receive(COLLABORATION_EVENTS.SYNC, {
  roomId,
  update: Array.from(Y.encodeStateAsUpdate(emptyDoc)),
});
emptyDoc.destroy();
await wait(0);
assert.equal(confirmedCount, 1, 'an initial SYNC with no pending local updates should clear prior recovery errors');
provider.doc.getText('provider-ack').insert(0, '保留待确认的更新');
await wait(80);
assert.equal(fakeSocket.updates.length, 1, 'provider should send one update batch after SYNC');
assert.equal((await outbox.list(7, roomId)).length, 1, 'provider should persist a local update before sending it');

fakeSocket.updates[0]!.acknowledge({ ok: false, code: 'DOCUMENT_LOCKED', reason: '审核锁定中' });
assert.deepEqual(conflicts, [{ code: 'DOCUMENT_LOCKED', reason: '审核锁定中' }]);
await wait(80);
assert.equal(fakeSocket.updates.length, 1, 'terminal lock rejection should retain but not aggressively retry the update');

fakeSocket.receive(COLLABORATION_EVENTS.DOC_UNLOCKED, { docId: roomId });
await wait(20);
assert.equal(fakeSocket.updates.length, 2, 'unlock notification should retry the retained update');
fakeSocket.updates[1]!.acknowledge({ ok: true, version: 1 });
await wait(0);
assert.equal(confirmedCount, 2, 'successful ACK should clear the retained batch');
assert.equal((await outbox.list(7, roomId)).length, 0, 'successful ACK should remove the durable local copy');

provider.destroy();

const transientSocket = new FakeSocket();
const transientOutbox = new MemoryOutbox();
const transientCodes: string[] = [];
const transientProvider = new SocketYjsProvider({
  socket: transientSocket as unknown as Socket,
  roomId: 'production:coordination-retry@v1.0',
  user: { id: 7, name: 'QA', color: '#2563eb' },
  outbox: transientOutbox,
  onConflict: ({ code }) => { if (code) transientCodes.push(code); },
});
transientSocket.receive(COLLABORATION_EVENTS.SYNC, { roomId: 'production:coordination-retry@v1.0', update: [0, 0] });
await wait(0);
transientProvider.doc.getText('coordination-retry').insert(0, 'coordination transient');
await wait(80);
assert.equal(transientSocket.updates.length, 1, 'the coordination fixture should send its first batch');
const transientBatch = transientSocket.updates[0]!.payload.update;
transientProvider.doc.getText('coordination-retry').insert(21, 'queued');
await wait(80);
transientSocket.updates[0]!.acknowledge({ ok: false, code: 'COORDINATION_UNAVAILABLE', reason: 'Redis temporarily unavailable' });
await wait(1100);
assert.equal(transientSocket.updates.length, 2, 'an unavailable coordinator should retry the retained batch');
assert.deepEqual(transientSocket.updates[1]!.payload.update, transientBatch, 'retry must resend the same in-flight batch');
transientSocket.updates[1]!.acknowledge({ ok: false, code: 'COORDINATION_CONFLICT', reason: 'SQLite writer conflict' });
await wait(2100);
assert.equal(transientSocket.updates.length, 3, 'a transient coordination conflict should also retry');
assert.deepEqual(transientSocket.updates[2]!.payload.update, transientBatch, 'the queued update must not replace the rejected in-flight batch');
transientSocket.updates[2]!.acknowledge({ ok: true, version: 1 });
await wait(100);
assert.equal(transientSocket.updates.length, 4, 'queued edits should flush after coordination recovers');
transientSocket.updates[3]!.acknowledge({ ok: true, version: 2 });
await wait(0);
assert.equal((await transientOutbox.list(7, 'production:coordination-retry@v1.0')).length, 0,
  'both transient and queued updates should be cleared only after successful acknowledgement');
assert.deepEqual(transientCodes, ['COORDINATION_UNAVAILABLE', 'COORDINATION_CONFLICT']);
transientProvider.destroy();

const recoveryOutbox = new MemoryOutbox();
const abandonedSocket = new FakeSocket();
const abandonedProvider = new SocketYjsProvider({
  socket: abandonedSocket as unknown as Socket,
  roomId,
  user: { id: 7, name: 'QA', color: '#2563eb' },
  outbox: recoveryOutbox,
});
const emptyRecoveryDoc = new Y.Doc();
abandonedSocket.receive(COLLABORATION_EVENTS.SYNC, {
  roomId,
  update: Array.from(Y.encodeStateAsUpdate(emptyRecoveryDoc)),
});
emptyRecoveryDoc.destroy();
await wait(0);
abandonedProvider.doc.getText('durable-recovery').insert(0, '刷新后恢复的协作内容');
await wait(80);
assert.equal(abandonedSocket.updates.length, 1, 'the first provider should have an unconfirmed batch before page close');
assert.equal((await recoveryOutbox.list(7, roomId)).length, 1, 'unconfirmed update should remain in durable outbox after the provider is destroyed');
abandonedProvider.destroy();

const resumedSocket = new FakeSocket();
let resumedConfirmedCount = 0;
const resumedProvider = new SocketYjsProvider({
  socket: resumedSocket as unknown as Socket,
  roomId,
  user: { id: 7, name: 'QA', color: '#2563eb' },
  outbox: recoveryOutbox,
  onUpdatesConfirmed: () => { resumedConfirmedCount += 1; },
});
const serverRecoveryDoc = new Y.Doc();
resumedSocket.receive(COLLABORATION_EVENTS.SYNC, {
  roomId,
  update: Array.from(Y.encodeStateAsUpdate(serverRecoveryDoc)),
});
serverRecoveryDoc.destroy();
await wait(80);
assert.equal(resumedProvider.doc.getText('durable-recovery').toString(), '刷新后恢复的协作内容', 'new provider should restore the pending local update after server SYNC');
assert.equal(resumedSocket.updates.length, 1, 'new provider should resend the restored local update');
resumedSocket.updates[0]!.acknowledge({ ok: true, version: 2 });
await wait(0);
assert.equal((await recoveryOutbox.list(7, roomId)).length, 0, 'recovered update should be removed only after the server confirms it');
assert.equal(resumedConfirmedCount, 1, 'recovered batch confirmation should clear the recovery warning');
resumedProvider.destroy();

const reconnectSocket = new FakeSocket();
let completeDeferredOutboxRead!: (entries: PendingCollaborationUpdate[]) => void;
const deferredOutboxRead = new Promise<PendingCollaborationUpdate[]>((resolve) => { completeDeferredOutboxRead = resolve; });
let reconnectSyncedCount = 0;
const reconnectProvider = new SocketYjsProvider({
  socket: reconnectSocket as unknown as Socket,
  roomId: 'production:outbox-reconnect@v1.0',
  user: { id: 7, name: 'QA', color: '#2563eb' },
  outbox: {
    list: async () => deferredOutboxRead,
    append: async () => 1,
    remove: async () => undefined,
  },
  onSynced: () => { reconnectSyncedCount += 1; },
});
reconnectSocket.receive(COLLABORATION_EVENTS.SYNC, { roomId: 'production:outbox-reconnect@v1.0', update: [0, 0] });
await wait(0);
assert.equal(reconnectProvider.hasSynced, false, 'provider should wait for the outbox read before enabling editing');
reconnectSocket.connected = false;
reconnectSocket.receive('disconnect', 'transport close');
reconnectSocket.connected = true;
reconnectSocket.receive('connect', undefined);
reconnectSocket.receive(COLLABORATION_EVENTS.SYNC, { roomId: 'production:outbox-reconnect@v1.0', update: [0, 0] });
completeDeferredOutboxRead([]);
await wait(10);
assert.equal(reconnectProvider.hasSynced, true, 'reconnect SYNC should resume initialization after an in-flight outbox read');
assert.equal(reconnectSyncedCount, 1, 'provider should publish readiness once for the new connection');
reconnectProvider.destroy();

const failedRestoreSocket = new FakeSocket();
const failedRestoreCodes: string[] = [];
let failedRestoreSynced = false;
const failedRestoreProvider = new SocketYjsProvider({
  socket: failedRestoreSocket as unknown as Socket,
  roomId: 'production:outbox-read-failure@v1.0',
  user: { id: 7, name: 'QA', color: '#2563eb' },
  outbox: {
    list: async () => { throw new Error('storage read blocked'); },
    append: async () => 1,
    remove: async () => undefined,
  },
  onSynced: () => { failedRestoreSynced = true; },
  onConflict: ({ code }) => { if (code) failedRestoreCodes.push(code); },
});
failedRestoreSocket.receive(COLLABORATION_EVENTS.SYNC, { roomId: 'production:outbox-read-failure@v1.0', update: [0, 0] });
await wait(0);
assert.deepEqual(failedRestoreCodes, ['LOCAL_OUTBOX_RESTORE_FAILED'], 'outbox restore failure should be explicit');
assert.equal(failedRestoreSynced, false, 'provider must not enable editing until local pending updates are restored');
failedRestoreProvider.destroy();

const failedWriteSocket = new FakeSocket();
const failedWriteCodes: string[] = [];
const failedWriteProvider = new SocketYjsProvider({
  socket: failedWriteSocket as unknown as Socket,
  roomId: 'production:outbox-write-failure@v1.0',
  user: { id: 7, name: 'QA', color: '#2563eb' },
  outbox: {
    list: async () => [],
    append: async () => { throw new Error('storage quota exceeded'); },
    remove: async () => undefined,
  },
  onConflict: ({ code }) => { if (code) failedWriteCodes.push(code); },
});
failedWriteSocket.receive(COLLABORATION_EVENTS.SYNC, { roomId: 'production:outbox-write-failure@v1.0', update: [0, 0] });
await wait(0);
failedWriteProvider.doc.getText('write-failure').insert(0, 'server still receives');
await wait(80);
assert.deepEqual(failedWriteCodes, ['LOCAL_OUTBOX_WRITE_FAILED'], 'outbox write failure should be explicit');
assert.equal(failedWriteSocket.updates.length, 1, 'provider should still attempt the server ACK path when local staging fails');
failedWriteSocket.updates[0]!.acknowledge({ ok: true, version: 1 });
await wait(0);
failedWriteProvider.destroy();
console.log('Yjs provider acknowledgement tests passed');
