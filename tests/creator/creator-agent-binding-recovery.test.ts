import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-agent-binding-recovery-api-'));
process.env.XMT_DB_PATH = path.join(directory, 'binding-recovery.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'creator-agent-binding-recovery-api-test-secret';
const recoverySecret = randomBytes(32).toString('base64');
process.env.XMT_CREATOR_AGENT_BINDING_KEY_V1 = recoverySecret;

const [{ default: app }, database, databaseUtils, { signToken }] = await Promise.all([
  import('../../api/app.js'),
  import('../../api/database/db.js'),
  import('../../api/database/utils.js'),
  import('../../api/utils/jwt.js'),
]);
const { execute, executeInsert, queryOne } = databaseUtils;
await database.initDatabase();

async function createAdmin(username: string) {
  const userId = await executeInsert('INSERT INTO users(username,password,role,name,enabled) VALUES(?,?,?,?,1)', [username, 'unused', 'admin', username]);
  await execute('INSERT OR IGNORE INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?', [userId, 'admin']);
  return { userId, token: signToken({ userId, username, role: 'admin' }) };
}

const admin = await createAdmin('binding-recovery-admin');
const otherAdmin = await createAdmin('binding-recovery-other-admin');
const adminRole = await queryOne<{ id: number }>("SELECT id FROM roles WHERE code='admin'");
const managePermission = await queryOne<{ id: number }>("SELECT id FROM permissions WHERE code='creator:data:manage'");
assert(adminRole && managePermission, 'fresh test DB includes the Creator management role and permission');
await execute('INSERT OR IGNORE INTO role_permissions(role_id,permission_id) VALUES(?,?)', [adminRole.id, managePermission.id]);
const memberRole = await queryOne<{ id: number }>("SELECT id FROM roles WHERE code='member'");
assert(memberRole);
await execute('INSERT OR IGNORE INTO role_permissions(role_id,permission_id) VALUES(?,?)', [memberRole.id, managePermission.id]);
const restrictedUserId = await executeInsert('INSERT INTO users(username,password,role,name,enabled) VALUES(?,?,?,?,1)', ['binding-recovery-member', 'unused', 'member', 'binding-recovery-member']);
await execute('INSERT OR IGNORE INTO user_roles(user_id,role_id) VALUES(?,?)', [restrictedUserId, memberRole.id]);
const restrictedToken = signToken({ userId: restrictedUserId, username: 'binding-recovery-member', role: 'member' });
await execute('INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,account_name,status) VALUES(?,?,?,?,?)', [admin.userId, 'douyin', 'binding-account', '绑定验收账号', 'active']);
await execute('INSERT INTO creator_platform_accounts(user_id,platform,platform_uid,account_name,status) VALUES(?,?,?,?,?)', [admin.userId, 'douyin', 'second-binding-account', '第二绑定验收账号', 'active']);

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/creator-agent/binding-codes`;
const bindEndpoint = base.replace(/\/binding-codes$/, '/bind');
const request = (url: string, token?: string, method = 'GET', body?: unknown) => fetch(url, {
  method,
  headers: {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
const noStore = (response: Response) => assert.match(response.headers.get('cache-control') || '', /no-store/i);

try {
  const unauthenticated = await request(base, undefined, 'POST', { account_id: 'binding-account', request_id: randomUUID() });
  assert.equal(unauthenticated.status, 401);
  noStore(unauthenticated);

  const invalidKey = await request(base, admin.token, 'POST', { account_id: 'binding-account', request_id: 'not-a-uuid' });
  assert.equal(invalidKey.status, 400);
  noStore(invalidKey);
  for (const requestIdValue of ['', null, 7]) {
    const invalidRequestId = await request(base, admin.token, 'POST', { account_id: 'binding-account', request_id: requestIdValue });
    assert.equal(invalidRequestId.status, 400, 'an explicitly supplied malformed request id must not fall back to the legacy non-recoverable path');
    noStore(invalidRequestId);
  }
  const roleDenied = await request(base, restrictedToken, 'POST', { account_id: 'binding-account', request_id: randomUUID() });
  assert.equal(roleDenied.status, 403, 'a role with only the permission bit cannot bypass the creator manager role boundary');
  noStore(roleDenied);

  const unknownAccount = await request(base, admin.token, 'POST', { account_id: 'not-managed', request_id: randomUUID() });
  assert.equal(unknownAccount.status, 404, 'binding-code creation requires an active manageable creator account');
  noStore(unknownAccount);

  const requestId = randomUUID();
  const createBody = { account_id: 'binding-account', ttl_minutes: 5, request_id: requestId };
  const createdResponse = await request(base, admin.token, 'POST', createBody);
  assert.equal(createdResponse.status, 201);
  noStore(createdResponse);
  const created = await createdResponse.json() as { binding_code: string; expires_at: string; one_time: true };
  assert.equal(created.one_time, true);

  const concurrentResponses = await Promise.all(Array.from({ length: 3 }, () => request(base, admin.token, 'POST', { ...createBody, request_id: requestId.toUpperCase() })));
  const concurrentPayloads = await Promise.all(concurrentResponses.map(async (response) => {
    assert.equal(response.status, 201);
    noStore(response);
    return response.json();
  }));
  assert(concurrentPayloads.every((payload) => JSON.stringify(payload) === JSON.stringify(created)), 'concurrent and case-normalized retries return the same committed code');

  const replayResponse = await request(base, admin.token, 'POST', createBody);
  assert.equal(replayResponse.status, 201);
  noStore(replayResponse);
  const replay = await replayResponse.json() as typeof created;
  assert.deepEqual(replay, created, 'same actor/account/payload/request id returns the original response');
  const count = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM creator_agent_binding_codes WHERE user_id=? AND account_id=?', [admin.userId, 'binding-account']);
  assert.equal(Number(count?.count), 1, 'the replay does not create another valid code');

  const recoveredResponse = await request(`${base}/requests/${encodeURIComponent(requestId.toUpperCase())}?account_id=binding-account`, admin.token);
  assert.equal(recoveredResponse.status, 200);
  noStore(recoveredResponse);
  assert.deepEqual(await recoveredResponse.json(), { status: 'active', ...created }, 'only the actor and requested account can recover the active code');

  const otherActorResponse = await request(`${base}/requests/${encodeURIComponent(requestId)}?account_id=binding-account`, otherAdmin.token);
  assert.equal(otherActorResponse.status, 200);
  noStore(otherActorResponse);
  assert.deepEqual(await otherActorResponse.json(), { status: 'not_found' }, 'another manager cannot recover the actor-scoped secret');
  const crossActorReplay = await request(base, otherAdmin.token, 'POST', createBody);
  assert.equal(crossActorReplay.status, 409, 'a request UUID cannot be reused by another actor');
  noStore(crossActorReplay);
  const crossAccountReplay = await request(base, admin.token, 'POST', { ...createBody, account_id: 'second-binding-account' });
  assert.equal(crossAccountReplay.status, 409, 'a request UUID cannot be reused for another account');
  noStore(crossAccountReplay);
  const changedPayloadReplay = await request(base, admin.token, 'POST', { ...createBody, ttl_minutes: 10 });
  assert.equal(changedPayloadReplay.status, 409, 'a request UUID cannot be reused for another expiry');
  noStore(changedPayloadReplay);

  const stored = await queryOne<{ code_hash: string; request_id_hash: string; ciphertext: string; iv: string; auth_tag: string }>(
    `SELECT c.code_hash,r.request_id_hash,r.ciphertext,r.iv,r.auth_tag
      FROM creator_agent_binding_codes c JOIN creator_agent_binding_code_recovery r ON r.binding_code_id=c.id
      WHERE c.user_id=? AND c.account_id=?`, [admin.userId, 'binding-account'],
  );
  assert(stored);
  assert.equal(stored.code_hash, createHash('sha256').update(created.binding_code).digest('hex'));
  for (const value of [stored.code_hash, stored.request_id_hash, stored.ciphertext, stored.iv, stored.auth_tag]) {
    assert(!value.includes(created.binding_code), 'database recovery material never contains the plaintext binding code');
  }
  assert.notEqual(stored.request_id_hash, requestId, 'the raw request key is not stored at rest');

  const secondRequestId = randomUUID();
  const secondCreatedResponse = await request(base, admin.token, 'POST', { account_id: 'binding-account', ttl_minutes: 5, request_id: secondRequestId });
  assert.equal(secondCreatedResponse.status, 201);
  noStore(secondCreatedResponse);
  const secondCreated = await secondCreatedResponse.json() as typeof created;
  assert.notEqual(secondCreated.binding_code, created.binding_code);
  const firstReceiptAfterRotation = await request(`${base}/requests/${encodeURIComponent(requestId)}?account_id=binding-account`, admin.token);
  assert.deepEqual(await firstReceiptAfterRotation.json(), { status: 'used', expires_at: created.expires_at }, 'issuing a new code invalidates the previous one');
  const secondReceipt = await request(`${base}/requests/${encodeURIComponent(secondRequestId)}?account_id=binding-account`, admin.token);
  assert.deepEqual(await secondReceipt.json(), { status: 'active', ...secondCreated });

  const initialBindResponse = await request(bindEndpoint, undefined, 'POST', {
    binding_code: secondCreated.binding_code,
    device: { device_id: 'response-loss-shared-device', device_name: '旧绑定设备' },
  });
  assert.equal(initialBindResponse.status, 201, 'legacy clients retain the original one-time bind contract');
  noStore(initialBindResponse);
  const initialBound = await initialBindResponse.json() as { agent_id: number; agent_token: string; account_id: string };

  const secondAccountCodeResponse = await request(base, admin.token, 'POST', {
    account_id: 'second-binding-account', ttl_minutes: 5, request_id: randomUUID(),
  });
  const secondAccountCode = await secondAccountCodeResponse.json() as typeof created;
  const bindRequestId = randomUUID();
  const bindRecoverySecret = randomBytes(32).toString('base64url');
  const keyedBindBody = {
    binding_code: secondAccountCode.binding_code,
    request_id: bindRequestId,
    recovery_secret: bindRecoverySecret,
    device: { device_id: 'response-loss-shared-device', device_name: '新绑定设备', os: 'darwin arm64', agent_version: '2.14.7-agent', protocol_version: 1 },
  };
  const committedResponse = await request(bindEndpoint, undefined, 'POST', keyedBindBody);
  assert.equal(committedResponse.status, 201);
  noStore(committedResponse);
  const committedResult = await committedResponse.json() as { agent_id: number; agent_token: string; account_id: string; recovery_supported: true };
  assert.equal(committedResult.recovery_supported, true, 'new servers advertise keyed response recovery');
  assert.equal(committedResult.agent_id, initialBound.agent_id, 'rebind stages a new credential for the existing device record');

  const idWithoutSecret = await request(bindEndpoint, undefined, 'POST', { ...keyedBindBody, recovery_secret: undefined });
  assert.equal(idWithoutSecret.status, 400, 'a request id by itself is not a credential-recovery capability');
  noStore(idWithoutSecret);
  const wrongSecret = await request(bindEndpoint, undefined, 'POST', { ...keyedBindBody, recovery_secret: randomBytes(32).toString('base64url') });
  assert.equal(wrongSecret.status, 404, 'only the client-held recovery capability can retrieve a committed result');
  noStore(wrongSecret);
  const changedDevice = await request(bindEndpoint, undefined, 'POST', { ...keyedBindBody, device: { ...keyedBindBody.device, device_name: '不可覆盖设备' } });
  assert.equal(changedDevice.status, 409, 'a request key cannot recover credentials for a changed device payload');
  noStore(changedDevice);

  const oldCredentialBeforeAck = await request(`${bindEndpoint.replace(/\/bind$/, '')}/heartbeat`, undefined, 'POST', {
    agent_id: initialBound.agent_id, account_id: initialBound.account_id, protocol_version: 1,
  });
  assert.equal(oldCredentialBeforeAck.status, 401, 'heartbeat without an Authorization token is rejected');
  const oldCredentialStillActive = await fetch(`${bindEndpoint.replace(/\/bind$/, '')}/heartbeat`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${initialBound.agent_token}` },
    body: JSON.stringify({ agent_id: initialBound.agent_id, account_id: initialBound.account_id, protocol_version: 1 }),
  });
  assert.equal(oldCredentialStillActive.status, 200, 'the previous credential remains active until the new client confirms persistence');
  const stagedCredentialRejected = await fetch(`${bindEndpoint.replace(/\/bind$/, '')}/heartbeat`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${committedResult.agent_token}` },
    body: JSON.stringify({ agent_id: committedResult.agent_id, account_id: committedResult.account_id, protocol_version: 1 }),
  });
  assert.equal(stagedCredentialRejected.status, 401, 'the staged replacement credential is not activated before acknowledgement');

  // Consume and discard the first successful body to model the client losing the committed HTTP response.
  const replayedBindResponse = await request(bindEndpoint, undefined, 'POST', keyedBindBody);
  assert.equal(replayedBindResponse.status, 201);
  noStore(replayedBindResponse);
  const recoveredResult = await replayedBindResponse.json();
  assert.deepEqual(recoveredResult, committedResult, 'same request and recovery capability recover the exact committed credentials');
  const receiptBeforeAck = await queryOne<{ ciphertext: string | null; recovery_secret_hash: string; acknowledged_at: string | null }>(
    'SELECT ciphertext,recovery_secret_hash,acknowledged_at FROM creator_agent_bind_result_recovery WHERE request_id_hash=?',
    [createHash('sha256').update(bindRequestId).digest('hex')],
  );
  assert(receiptBeforeAck?.ciphertext && receiptBeforeAck.recovery_secret_hash !== bindRecoverySecret);
  assert(!receiptBeforeAck.ciphertext.includes(committedResult.agent_token), 'the database stores only authenticated ciphertext for the one-time token');

  const ackEndpoint = `${bindEndpoint}/ack`;
  const ackBody = { request_id: bindRequestId, recovery_secret: bindRecoverySecret };
  const badAckResponse = await request(ackEndpoint, undefined, 'POST', { ...ackBody, recovery_secret: randomBytes(32).toString('base64url') });
  assert.equal(badAckResponse.status, 404, 'an incorrect capability cannot activate staged credentials');
  noStore(badAckResponse);
  const ackResponse = await request(ackEndpoint, undefined, 'POST', ackBody);
  assert.equal(ackResponse.status, 204);
  noStore(ackResponse);
  const ackReplay = await request(ackEndpoint, undefined, 'POST', ackBody);
  assert.equal(ackReplay.status, 204, 'acknowledgement can be retried after a lost response');
  noStore(ackReplay);
  const receiptAfterAck = await queryOne<{ ciphertext: string | null; acknowledged_at: string | null }>(
    'SELECT ciphertext,acknowledged_at FROM creator_agent_bind_result_recovery WHERE request_id_hash=?',
    [createHash('sha256').update(bindRequestId).digest('hex')],
  );
  assert.deepEqual(receiptAfterAck && { ciphertext: receiptAfterAck.ciphertext, acknowledged: Boolean(receiptAfterAck.acknowledged_at) }, { ciphertext: null, acknowledged: true }, 'acknowledgement erases the encrypted credential receipt');
  const replayAfterAck = await request(bindEndpoint, undefined, 'POST', keyedBindBody);
  assert.equal(replayAfterAck.status, 410, 'confirmed credentials cannot be resurrected');
  noStore(replayAfterAck);
  const newCredentialAfterAck = await fetch(`${bindEndpoint.replace(/\/bind$/, '')}/heartbeat`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${committedResult.agent_token}` },
    body: JSON.stringify({ agent_id: committedResult.agent_id, account_id: committedResult.account_id, protocol_version: 1 }),
  });
  assert.equal(newCredentialAfterAck.status, 200, 'acknowledgement activates the staged replacement credential');
  const priorCredentialAfterAck = await fetch(`${bindEndpoint.replace(/\/bind$/, '')}/heartbeat`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${initialBound.agent_token}` },
    body: JSON.stringify({ agent_id: initialBound.agent_id, account_id: initialBound.account_id, protocol_version: 1 }),
  });
  assert.equal(priorCredentialAfterAck.status, 401, 'the old credential is retired only after acknowledgement');

  const wrongKeyRequestId = randomUUID();
  const wrongKeyCodeResponse = await request(base, admin.token, 'POST', { account_id: 'second-binding-account', ttl_minutes: 5, request_id: wrongKeyRequestId });
  assert.equal(wrongKeyCodeResponse.status, 201);
  const beforeMissingKey = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM creator_agent_binding_codes');
  delete process.env.XMT_CREATOR_AGENT_BINDING_KEY_V1;
  const unavailableRequestId = randomUUID();
  const unavailableResponse = await request(base, admin.token, 'POST', { account_id: 'binding-account', ttl_minutes: 5, request_id: unavailableRequestId });
  assert.equal(unavailableResponse.status, 503, 'missing dedicated encryption key fails closed with a retryable configuration error');
  noStore(unavailableResponse);
  const afterMissingKey = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM creator_agent_binding_codes');
  assert.equal(Number(afterMissingKey?.count), Number(beforeMissingKey?.count), 'missing key creates no binding code or half receipt');
  process.env.XMT_CREATOR_AGENT_BINDING_KEY_V1 = randomBytes(32).toString('base64');
  const wrongKeyResponse = await request(`${base}/requests/${encodeURIComponent(wrongKeyRequestId)}?account_id=second-binding-account`, admin.token);
  assert.equal(wrongKeyResponse.status, 503, 'wrong or rotated-out key does not expose or replace a stored code');
  noStore(wrongKeyResponse);
  process.env.XMT_CREATOR_AGENT_BINDING_KEY_V1 = recoverySecret;

  const expiredRequestId = randomUUID();
  const expiredResponse = await request(base, admin.token, 'POST', { account_id: 'second-binding-account', ttl_minutes: 5, request_id: expiredRequestId });
  const expiredCode = await expiredResponse.json() as typeof created;
  const expiredHash = createHash('sha256').update(expiredCode.binding_code).digest('hex');
  const expiredId = await queryOne<{ id: number }>('SELECT id FROM creator_agent_binding_codes WHERE code_hash=?', [expiredHash]);
  assert(expiredId);
  await execute("UPDATE creator_agent_binding_codes SET expires_at=datetime('now','-1 minute') WHERE id=?", [expiredId.id]);
  await execute("UPDATE creator_agent_binding_code_recovery SET expires_at=datetime('now','-1 minute') WHERE binding_code_id=?", [expiredId.id]);
  const expiredStatus = await request(`${base}/requests/${encodeURIComponent(expiredRequestId)}?account_id=second-binding-account`, admin.token);
  const expiredPayload = await expiredStatus.json() as { status: string; expires_at?: string };
  assert.equal(expiredPayload.status, 'expired', 'an expired code is terminal and cannot be recovered');
  assert.equal(typeof expiredPayload.expires_at, 'string', 'terminal response retains an expiry timestamp');
  noStore(expiredStatus);
  const clearedExpiredCiphertext = await queryOne<{ ciphertext: string | null }>('SELECT ciphertext FROM creator_agent_binding_code_recovery WHERE binding_code_id=?', [expiredId.id]);
  assert.equal(clearedExpiredCiphertext?.ciphertext, null, 'expired recoverable plaintext is cryptographically erased while the terminal idempotency record remains');
  const expiredReplay = await request(base, admin.token, 'POST', { account_id: 'second-binding-account', ttl_minutes: 5, request_id: expiredRequestId });
  assert.equal(expiredReplay.status, 410, 'an expired idempotency key cannot mint a replacement code');
  noStore(expiredReplay);

  console.log('Creator Agent binding recovery API tests passed: auth/scope, no-store, same-key recovery, actor isolation, ciphertext storage, one-active-code policy, and missing-key fail-closed behavior.');
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  database.db.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
