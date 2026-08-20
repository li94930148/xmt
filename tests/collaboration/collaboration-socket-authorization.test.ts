import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { io as connect, type Socket } from 'socket.io-client';
import * as Y from 'yjs';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-collaboration-socket-'));
process.env.XMT_DB_PATH = path.join(temporaryDirectory, 'collaboration-socket.test.db');
process.env.JWT_SECRET = 'collaboration-socket-test-secret';
process.env.NODE_ENV = 'test';

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { execute, executeInsert } = await import('../../api/database/utils.js');
const { signToken } = await import('../../api/utils/jwt.js');
const { getRuntimeDocumentState } = await import('../../api/collaboration/yjs/documentStore.js');
const { io, server } = await import('../../api/app.js');

await initDatabase();
const ownerId = await executeInsert(`INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES (?,?,?,?,?,?,?)`, ['socket-owner', 'unused', 'socket-owner@example.invalid', 'member', 'Owner', 1, 0]);
const outsiderId = await executeInsert(`INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES (?,?,?,?,?,?,?)`, ['socket-outsider', 'unused', 'socket-outsider@example.invalid', 'member', 'Outsider', 1, 0]);
const readonlyId = await executeInsert(`INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES (?,?,?,?,?,?,?)`, ['socket-readonly', 'unused', 'socket-readonly@example.invalid', 'member', 'Readonly', 1, 0]);
const topicId = await executeInsert(`INSERT INTO topics (title,description,platform,creator_id,status) VALUES (?,?,?,?,?)`, ['Socket 授权', '', 'douyin', ownerId, 'pending']);
const productionId = await executeInsert(`INSERT INTO production (topic_id,version,content,status,operator_id) VALUES (?,?,?,?,?)`, [topicId, 1, '', 'draft', readonlyId]);
const roomId = `production:${productionId}`;

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
const baseUrl = `http://127.0.0.1:${address.port}`;

function waitFor(socket: Socket, event: string, timeout = 1_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timed out waiting for ${event}`)); }, timeout);
    const listener = (payload: unknown) => { clearTimeout(timer); resolve(payload); };
    socket.once(event, listener);
  });
}

function expectNoEvent(socket: Socket, event: string, timeout = 250): Promise<void> {
  return new Promise((resolve, reject) => {
    const listener = () => { clearTimeout(timer); reject(new Error(`Unexpected ${event}`)); };
    const timer = setTimeout(() => { socket.off(event, listener); resolve(); }, timeout);
    socket.once(event, listener);
  });
}

async function authenticatedSocket(userId: number) {
  const socket = connect(baseUrl, { auth: { token: signToken({ userId }) }, transports: ['websocket'], reconnection: false, forceNew: true });
  await waitFor(socket, 'connect');
  return socket;
}

async function join(socket: Socket, forgedUserId = ownerId, forgedRole = 'admin') {
  const sync = waitFor(socket, 'collaboration:sync');
  socket.emit('collaboration:join', { roomId, user: { id: forgedUserId, name: 'Forged', role: forgedRole, color: '#000000' } });
  return sync;
}

const sockets: Socket[] = [];
try {
  // A + H: real authenticated owner joins and client-provided identity is ignored.
  const ownerA = await authenticatedSocket(ownerId); sockets.push(ownerA);
  const ownerB = await authenticatedSocket(ownerId); sockets.push(ownerB);
  const syncA = await join(ownerA, outsiderId, 'admin') as { roomId?: string; update?: number[] };
  assert.equal(syncA.roomId, roomId);
  assert.ok(Array.isArray(syncA.update));
  await join(ownerB);
  const users = await waitFor(ownerA, 'collaboration:users') as { roomId?: string; users?: Array<{ id: number; role?: string }> };
  assert.equal(users.roomId, roomId);
  assert.ok(users.users?.every((user) => user.id === ownerId && user.role === 'member'));

  // C: a joined editor sends a real Yjs update which another joined socket receives.
  const document = new Y.Doc(); document.getText('content').insert(0, '授权更新');
  const receivedUpdate = waitFor(ownerB, 'collaboration:update') as Promise<{ roomId?: string; update?: number[] }>;
  ownerA.emit('collaboration:update', { roomId, update: Array.from(Y.encodeStateAsUpdate(document)) });
  assert.equal((await receivedUpdate).roomId, roomId);

  // B: a scoped-out member cannot join, see SYNC/users, or enter the adapter room.
  const outsider = await authenticatedSocket(outsiderId); sockets.push(outsider);
  const noOutsiderSync = expectNoEvent(outsider, 'collaboration:sync');
  const noOutsiderUsers = expectNoEvent(outsider, 'collaboration:users');
  outsider.emit('collaboration:join', { roomId, user: { id: ownerId, name: 'Forged Owner', role: 'admin', color: '#000000' } });
  await Promise.all([noOutsiderSync, noOutsiderUsers]);
  assert.equal(io.sockets.adapter.rooms.get(roomId)?.has(outsider.id) ?? false, false);

  // D: the production participant has view scope but not an edit grant.
  const readonly = await authenticatedSocket(readonlyId); sockets.push(readonly);
  await join(readonly, readonlyId, 'member');
  const stateBeforeReadonly = Array.from(getRuntimeDocumentState(roomId));
  const noReadonlyBroadcast = expectNoEvent(ownerA, 'collaboration:update');
  const readonlyDocument = new Y.Doc(); readonlyDocument.getText('content').insert(0, '只读写入');
  readonly.emit('collaboration:update', { roomId, update: Array.from(Y.encodeStateAsUpdate(readonlyDocument)) });
  await noReadonlyBroadcast;
  assert.deepEqual(Array.from(getRuntimeDocumentState(roomId)), stateBeforeReadonly);

  // E/F/G: an authenticated socket without JOIN cannot mutate or broadcast any realtime event.
  const unjoined = await authenticatedSocket(ownerId); sockets.push(unjoined);
  const stateBeforeUnjoined = Array.from(getRuntimeDocumentState(roomId));
  const noUpdate = expectNoEvent(ownerA, 'collaboration:update');
  const noAwareness = expectNoEvent(ownerA, 'collaboration:awareness-update');
  const noTyping = expectNoEvent(ownerA, 'collaboration:typing');
  unjoined.emit('collaboration:update', { roomId, update: Array.from(Y.encodeStateAsUpdate(new Y.Doc())) });
  unjoined.emit('collaboration:awareness-update', { roomId, update: [1, 2, 3] });
  unjoined.emit('collaboration:typing', { roomId, userId: outsiderId, typing: true });
  await Promise.all([noUpdate, noAwareness, noTyping]);
  assert.deepEqual(Array.from(getRuntimeDocumentState(roomId)), stateBeforeUnjoined);

  // Malformed but byte-shaped Yjs updates are rejected at the socket input boundary.
  const stateBeforeMalformed = Array.from(getRuntimeDocumentState(roomId));
  const noMalformedBroadcast = expectNoEvent(ownerB, 'collaboration:update');
  const rejected = waitFor(ownerA, 'collaboration:conflict-detected') as Promise<{ reason?: string }>;
  ownerA.emit('collaboration:update', { roomId, update: [1] }); // Y.applyUpdate would throw Unexpected end of array.
  assert.equal((await rejected).reason, 'Invalid collaboration update');
  await noMalformedBroadcast;
  assert.deepEqual(Array.from(getRuntimeDocumentState(roomId)), stateBeforeMalformed);

  // I/J: malformed and unknown documents cannot produce SYNC or join an adapter room.
  for (const invalidRoomId of ['production:abc', 'production:-1', 'production:0', 'shooting:abc', 'topic:1', 'admin:1', 'production:1:2', '', 'production:999999999']) {
    const candidate = await authenticatedSocket(ownerId); sockets.push(candidate);
    const noSync = expectNoEvent(candidate, 'collaboration:sync');
    candidate.emit('collaboration:join', { roomId: invalidRoomId, user: { id: ownerId, name: 'Owner', role: 'member', color: '#000000' } });
    await noSync;
    assert.equal(io.sockets.adapter.rooms.get(invalidRoomId)?.has(candidate.id) ?? false, false);
  }

  // K/L: a new connection reauthorizes; disabled users cannot regain an old room grant.
  ownerA.disconnect();
  await execute('UPDATE users SET enabled = 0 WHERE id = ?', [ownerId]);
  const disabled = connect(baseUrl, { auth: { token: signToken({ userId: ownerId }) }, transports: ['websocket'], reconnection: false, forceNew: true }); sockets.push(disabled);
  await waitFor(disabled, 'connect_error');
  await expectNoEvent(disabled, 'collaboration:sync');

  console.log('collaboration Socket.IO authorization black-box tests passed');
} finally {
  for (const socket of sockets) socket.disconnect();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  await closeDatabase();
}
