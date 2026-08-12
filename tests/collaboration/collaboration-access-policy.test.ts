import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-collaboration-access-'));
process.env.XMT_DB_PATH = path.join(tempDirectory, 'collaboration-access.test.db');

const { initDatabase, closeDatabase } = await import('../../api/database/db.js');
const { executeInsert } = await import('../../api/database/utils.js');
const { collaborationAccessPolicy, parseCollaborationRoom } = await import('../../api/collaboration/access/CollaborationAccessPolicy.js');
const { joinRoom, handleDocumentUpdate, handleAwarenessUpdate, handleTyping } = await import('../../api/collaboration/core/roomManager.js');

await initDatabase();

const ownerId = await executeInsert(`INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES (?,?,?,?,?,?,?)`, ['collaboration-owner', 'unused', 'owner@example.invalid', 'member', 'Owner', 1, 0]);
const outsiderId = await executeInsert(`INSERT INTO users (username,password,email,role,name,enabled,force_change_password) VALUES (?,?,?,?,?,?,?)`, ['collaboration-outsider', 'unused', 'outsider@example.invalid', 'member', 'Outsider', 1, 0]);
const topicId = await executeInsert(`INSERT INTO topics (title,description,platform,creator_id,status) VALUES (?,?,?,?,?)`, ['协作授权', '', 'douyin', ownerId, 'pending']);
const productionId = await executeInsert(`INSERT INTO production (topic_id,version,content,status,operator_id) VALUES (?,?,?,?,?)`, [topicId, 1, '', 'draft', ownerId]);
const shootingId = await executeInsert(`INSERT INTO shooting (topic_id,status,operator_id) VALUES (?,?,?)`, [topicId, 'planned', ownerId]);

const owner = { id: ownerId, role: 'member', enabled: true } as never;
const outsider = { id: outsiderId, role: 'member', enabled: true } as never;
const disabledOwner = { id: ownerId, role: 'member', enabled: false } as never;

assert.deepEqual(parseCollaborationRoom(`production:${productionId}`), { kind: 'production', id: productionId, roomId: `production:${productionId}` });
assert.equal(parseCollaborationRoom('production:0'), null);
assert.equal(parseCollaborationRoom('topic:1'), null);
assert.equal(await collaborationAccessPolicy.canViewDocument(owner, `production:${productionId}`), true);
assert.equal(await collaborationAccessPolicy.canEditDocument(owner, `production:${productionId}`), true);
assert.equal(await collaborationAccessPolicy.canViewDocument(owner, `shooting:${shootingId}`), true);
assert.equal(await collaborationAccessPolicy.canViewDocument(outsider, `production:${productionId}`), false);
assert.equal(await collaborationAccessPolicy.canEditDocument(outsider, `shooting:${shootingId}`), false);
assert.equal(await collaborationAccessPolicy.canViewDocument(disabledOwner, `production:${productionId}`), false);
assert.equal(await collaborationAccessPolicy.canViewDocument(owner, 'production:999999'), false);

const broadcasts: Array<{ event: string; payload: unknown }> = [];
const fakeIo = { to: () => ({ emit: (event: string, payload: unknown) => broadcasts.push({ event, payload }) }) } as never;
const emitted: Array<{ event: string; payload: unknown }> = [];
const fakeSocket = {
  id: 'collaboration-policy-test-socket', data: { user: { ...owner, name: 'Owner' }, auth: { userId: ownerId } },
  join: () => undefined, leave: () => undefined,
  emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
  to: () => ({ emit: (event: string, payload: unknown) => broadcasts.push({ event, payload }) }),
} as never;
const roomId = `production:${productionId}`;
await handleDocumentUpdate(fakeIo, fakeSocket, { roomId, update: [] });
handleAwarenessUpdate(fakeSocket, { roomId, update: [] });
handleTyping(fakeIo, fakeSocket, { roomId, typing: true });
assert.equal(broadcasts.some((item) => item.event === 'collaboration:update' || item.event === 'collaboration:awareness-update' || item.event === 'collaboration:typing'), false);
await joinRoom(fakeIo, fakeSocket, { roomId, user: { id: outsiderId, name: 'forged', role: 'admin', color: '#000' } });
assert.equal((fakeSocket.data.collaborationRooms as Set<string>).has(roomId), true);
assert.equal(emitted.some((item) => item.event === 'collaboration:sync'), true);
assert.equal(broadcasts.some((item) => item.event === 'collaboration:user-joined' && (item.payload as { user: { id: number; role: string } }).user.id === ownerId), true);
await joinRoom(fakeIo, fakeSocket, { roomId: 'production:not-a-number', user: { id: ownerId, name: 'Owner', role: 'member', color: '#000' } });
assert.equal((fakeSocket.data.collaborationRooms as Set<string>).has('production:not-a-number'), false);

console.log('collaboration access policy tests passed');
await closeDatabase();
