import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import bcrypt from 'bcrypt';

const root = mkdtempSync(path.join(tmpdir(), 'xmt-creator-replay-'));
process.env.XMT_DB_PATH = path.join(root, 'creator-replay.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'creator-agent-replay-security-test-secret';

const { db, initDatabase } = await import('../../api/database/db.js');
const { execute, queryOne } = await import('../../api/database/utils.js');
const { acceptCreatorDataSync } = await import('../../api/services/creatorSyncV291.js');
const { default: creatorAgentRouter } = await import('../../api/routes/creator-agent.js');

type Agent = { id: number; accountId: string; token: string };
type Body = Record<string, unknown>;
const uuid = () => crypto.randomUUID();
const canonical = (body: Body) => [body.protocol_version, body.agent_id, body.platform, body.account_id, body.timestamp, body.nonce, body.collected_at, JSON.stringify(body.data)].join('\n');
const legacyCanonical = (body: Body) => [body.agent_id, body.platform, body.account_id, body.collected_at, JSON.stringify(body.data)].join('\n');
function encryptedPayload(payload: Body, token: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.createHash('sha256').update(token).digest(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

function envelope(agent: Agent, options: Partial<Body> = {}): Body {
  const payload = { platform: 'douyin', account: { platform_uid: agent.accountId, nickname: '安全回归测试账号' }, contents: [] };
  const body: Body = {
    protocol_version: 1,
    agent_id: agent.id,
    platform: 'douyin',
    account_id: agent.accountId,
    timestamp: new Date().toISOString(),
    nonce: uuid(),
    collected_at: '2026-08-20T00:00:00.000Z',
    data: encryptedPayload(payload, agent.token),
    ...options,
  };
  body.signature = crypto.createHmac('sha256', agent.token).update(canonical(body)).digest('hex');
  return body;
}

async function expectStatus(action: () => Promise<unknown>, status: number) {
  await assert.rejects(action, (error: unknown) => Boolean(error && typeof error === 'object' && (error as { statusCode?: number }).statusCode === status));
}

async function nonceCount(agentId: number, nonce: string) {
  const row = await queryOne<{ count: number }>('SELECT COUNT(*) count FROM creator_agent_nonces WHERE agent_id=? AND nonce=?', [agentId, nonce]);
  return Number(row?.count || 0);
}

await initDatabase();
const agents: Agent[] = [
  { id: 701, accountId: 'replay-account-a', token: 'creator-replay-test-token-a' },
  { id: 702, accountId: 'replay-account-b', token: 'creator-replay-test-token-b' },
];
for (const agent of agents) {
  await execute('INSERT INTO creator_agents(id,user_id,platform,account_id,device_id,token_hash,encryption_key_hash) VALUES(?,?,?,?,?,?,?)', [agent.id, 1, 'douyin', agent.accountId, `device-${agent.id}`, await bcrypt.hash(agent.token, 4), crypto.createHash('sha256').update(agent.token).digest('hex')]);
}

const valid = envelope(agents[0]);
const validResult = await acceptCreatorDataSync(valid, `Bearer ${agents[0].token}`);
assert.equal(validResult.success, true, 'V1 valid upload must persist');
await expectStatus(() => acceptCreatorDataSync(valid, `Bearer ${agents[0].token}`), 409);
assert.equal(await nonceCount(agents[0].id, String(valid.nonce)), 1, 'replay must retain exactly one reservation');
const taskCountAfterReplay = await queryOne<{ count: number }>('SELECT COUNT(*) count FROM creator_sync_tasks WHERE agent_id=?', [agents[0].id]);
assert.equal(Number(taskCountAfterReplay?.count), 1, 'replay must not create a second business task');

for (const protocolVersion of [undefined, 0, 2]) {
  const legacy = envelope(agents[0], { protocol_version: protocolVersion });
  legacy.signature = crypto.createHmac('sha256', agents[0].token).update(legacyCanonical(legacy)).digest('hex');
  await expectStatus(() => acceptCreatorDataSync(legacy, `Bearer ${agents[0].token}`), 426);
  assert.equal(await nonceCount(agents[0].id, String(legacy.nonce)), 0, 'legacy protocol must not reserve a nonce');
}

for (const offset of [-299_000, 299_000]) assert.equal((await acceptCreatorDataSync(envelope(agents[0], { timestamp: new Date(Date.now() + offset).toISOString() }), `Bearer ${agents[0].token}`)).success, true);
for (const offset of [-301_000, 301_000]) {
  const stale = envelope(agents[0], { timestamp: new Date(Date.now() + offset).toISOString() });
  await expectStatus(() => acceptCreatorDataSync(stale, `Bearer ${agents[0].token}`), 408);
  assert.equal(await nonceCount(agents[0].id, String(stale.nonce)), 0, 'expired request must not reserve a nonce');
}

const invalidNonce = envelope(agents[0], { nonce: 'not-a-uuid' });
invalidNonce.signature = crypto.createHmac('sha256', agents[0].token).update(canonical(invalidNonce)).digest('hex');
await expectStatus(() => acceptCreatorDataSync(invalidNonce, `Bearer ${agents[0].token}`), 400);

const poisonNonce = uuid();
const invalidSignature = envelope(agents[0], { nonce: poisonNonce });
invalidSignature.signature = '0'.repeat(64);
await expectStatus(() => acceptCreatorDataSync(invalidSignature, `Bearer ${agents[0].token}`), 401);
assert.equal(await nonceCount(agents[0].id, poisonNonce), 0, 'invalid signature must not reserve a nonce');
assert.equal((await acceptCreatorDataSync(envelope(agents[0], { nonce: poisonNonce }), `Bearer ${agents[0].token}`)).success, true);

const expiredNonce = uuid();
await expectStatus(() => acceptCreatorDataSync(envelope(agents[0], { nonce: expiredNonce, timestamp: new Date(Date.now() - 301_000).toISOString() }), `Bearer ${agents[0].token}`), 408);
assert.equal((await acceptCreatorDataSync(envelope(agents[0], { nonce: expiredNonce }), `Bearer ${agents[0].token}`)).success, true, 'fresh request may reuse a nonce rejected as expired');

const sharedNonce = uuid();
assert.equal((await acceptCreatorDataSync(envelope(agents[0], { nonce: sharedNonce }), `Bearer ${agents[0].token}`)).success, true);
assert.equal((await acceptCreatorDataSync(envelope(agents[1], { nonce: sharedNonce }), `Bearer ${agents[1].token}`)).success, true, 'nonce namespace must be per agent');

const concurrent = envelope(agents[0]);
const concurrentResults = await Promise.allSettled([acceptCreatorDataSync(concurrent, `Bearer ${agents[0].token}`), acceptCreatorDataSync(concurrent, `Bearer ${agents[0].token}`)]);
assert.equal(concurrentResults.filter(result => result.status === 'fulfilled').length, 1, 'concurrent duplicate must accept exactly one request');
assert.equal(concurrentResults.filter(result => result.status === 'rejected' && (result.reason as { statusCode?: number }).statusCode === 409).length, 1, 'concurrent duplicate must reject exactly one request as replay');

for (const field of ['timestamp', 'nonce', 'agent_id', 'account_id', 'platform', 'collected_at', 'data'] as const) {
  const original = envelope(agents[0]);
  const tampered = { ...original, [field]: field === 'data' ? { ...original.data as Body, ciphertext: 'tampered' } : field === 'agent_id' ? 999 : `${String(original[field])}-tampered` };
  assert.notEqual(crypto.createHmac('sha256', agents[0].token).update(canonical(tampered)).digest('hex'), original.signature, `${field} must be HMAC-covered`);
  await assert.rejects(() => acceptCreatorDataSync(tampered, `Bearer ${agents[0].token}`));
}

const app = express();
app.use(express.json());
app.use('/api/creator-agent', creatorAgentRouter);
const server = await new Promise<ReturnType<typeof app.listen>>(resolve => { const instance = app.listen(0, () => resolve(instance)); });
const address = server.address();
assert(address && typeof address !== 'string');
const retiredBody = envelope(agents[0]);
retiredBody.signature = crypto.createHmac('sha256', agents[0].token).update(legacyCanonical(retiredBody)).digest('hex');
const reportResponse = await fetch(`http://127.0.0.1:${address.port}/api/creator-agent/report`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${agents[0].token}` }, body: JSON.stringify(retiredBody) });
assert.equal(reportResponse.status, 410, 'retired /report must reject even a valid legacy-authenticated request');
await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

console.log('Creator Agent 上传防重放安全测试通过：V1、时间窗、严格 nonce、验签、原子重放隔离、跨 Agent nonce、篡改与 /report 退役均已覆盖。');
db.close();
try { rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* 临时测试目录清理失败不影响断言结果 */ }
