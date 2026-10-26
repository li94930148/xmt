import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(tmpdir(), 'xmt-agent-binding-'));
process.env.XMT_DB_PATH = path.join(root, 'binding.db');
process.env.NODE_ENV = 'test';
const recoverySecret = randomBytes(32).toString('base64');
process.env.XMT_CREATOR_AGENT_BINDING_KEY_V1 = recoverySecret;

const [{ db, initDatabase }, databaseUtils, creatorAgent] = await Promise.all([
  import('../api/database/db.js'),
  import('../api/database/utils.js'),
  import('../api/services/creatorAgent.js'),
]);
const { execute, queryOne } = databaseUtils;
const { acknowledgeCreatorAgentBindResult, bindCreatorAgent, createCreatorAgentBindingCode, getCreatorAgentBindingCodeRecovery, heartbeatCreatorAgent } = creatorAgent;

try {
  await initDatabase();

  const requestId = randomUUID();
  const issued = await createCreatorAgentBindingCode(1, 'safe-account', 5, requestId);
  assert.equal(issued.one_time, true);
  const replayed = await createCreatorAgentBindingCode(1, 'safe-account', 5, requestId);
  assert.equal(replayed.binding_code, issued.binding_code, 'same actor/account/request returns the exact original one-time code');
  assert.equal(replayed.expires_at, issued.expires_at, 'replay does not extend the original expiry');
  const issuedCount = await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM creator_agent_binding_codes WHERE user_id=1 AND account_id=?',
    ['safe-account'],
  );
  assert.equal(Number(issuedCount?.count), 1, 'same-key replay creates exactly one binding-code row');

  const stored = await queryOne<{
    code_hash: string; request_id_hash: string; ciphertext: string; iv: string; auth_tag: string; expires_at: string;
  }>(`SELECT c.code_hash,r.request_id_hash,r.ciphertext,r.iv,r.auth_tag,r.expires_at
    FROM creator_agent_binding_codes c JOIN creator_agent_binding_code_recovery r ON r.binding_code_id=c.id
    WHERE c.code_hash=?`, [createHash('sha256').update(issued.binding_code).digest('hex')]);
  assert(stored, 'the binding code and recovery receipt are committed together');
  assert.equal(stored.code_hash, createHash('sha256').update(issued.binding_code).digest('hex'));
  assert.notEqual(stored.request_id_hash, requestId, 'the raw client request UUID is not stored in the recovery table');
  for (const field of [stored.code_hash, stored.ciphertext, stored.iv, stored.auth_tag]) {
    assert(!field.includes(issued.binding_code), 'the plaintext one-time code is never persisted');
  }
  assert.equal((await getCreatorAgentBindingCodeRecovery(1, 'safe-account', requestId)).status, 'active');
  const activeReceipt = await getCreatorAgentBindingCodeRecovery(1, 'safe-account', requestId);
  assert.equal(activeReceipt.status, 'active');
  if (activeReceipt.status === 'active') assert.equal(activeReceipt.binding_code, issued.binding_code);
  assert.deepEqual(await getCreatorAgentBindingCodeRecovery(2, 'safe-account', requestId), { status: 'not_found' }, 'recovery is isolated to the creating actor');
  assert.deepEqual(await getCreatorAgentBindingCodeRecovery(1, 'other-account', requestId), { status: 'not_found' }, 'recovery is isolated to the requested creator account');
  await assert.rejects(() => createCreatorAgentBindingCode(1, 'other-account', 5, requestId), (error: unknown) => (error as { statusCode?: number }).statusCode === 409);
  await assert.rejects(() => createCreatorAgentBindingCode(1, 'safe-account', 10, requestId), (error: unknown) => (error as { statusCode?: number }).statusCode === 409);

  process.env.XMT_CREATOR_AGENT_BINDING_KEY_V1 = randomBytes(32).toString('base64');
  await assert.rejects(() => getCreatorAgentBindingCodeRecovery(1, 'safe-account', requestId), (error: unknown) => (error as { statusCode?: number }).statusCode === 503,
    'a wrong key cannot decrypt or silently replace a committed code');
  process.env.XMT_CREATOR_AGENT_BINDING_KEY_V1 = '';
  const beforeMissingKey = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM creator_agent_binding_codes');
  await assert.rejects(() => createCreatorAgentBindingCode(1, 'missing-key-account', 5, randomUUID()), (error: unknown) => (error as { statusCode?: number }).statusCode === 503,
    'a keyed request fails closed when the dedicated recovery key is missing');
  const afterMissingKey = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM creator_agent_binding_codes');
  assert.equal(Number(afterMissingKey?.count), Number(beforeMissingKey?.count), 'a missing recovery key creates no partial binding code');
  process.env.XMT_CREATOR_AGENT_BINDING_KEY_V1 = recoverySecret;

  const device = {
    device_id: 'safe-device', device_name: '测试 Mac', os: 'darwin arm64', agent_version: '2.11.0-agent',
    protocol_version: 1, browser_type: 'chrome', browser_version: '150.0', browser_engine: 'chromium',
    browser_runtime: 'system', session_mode: 'persistent', compatibility_status: 'compatible',
  };
  await execute(`CREATE TRIGGER fail_creator_agent_metadata BEFORE UPDATE ON creator_agents
    BEGIN SELECT RAISE(ABORT, 'injected metadata failure'); END`);
  await assert.rejects(() => bindCreatorAgent(issued.binding_code, device), /injected metadata failure/);
  const afterInjectedFailure = await queryOne<{ used_at: string | null }>('SELECT used_at FROM creator_agent_binding_codes WHERE code_hash=?', [stored.code_hash]);
  const agentAfterInjectedFailure = await queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM creator_agents WHERE user_id=1 AND device_id=?', ['safe-device']);
  assert.equal(afterInjectedFailure?.used_at, null, 'a failed device metadata write rolls back the one-time code claim');
  assert.equal(Number(agentAfterInjectedFailure?.count), 0, 'a failed device metadata write rolls back the partial agent registration');
  await execute('DROP TRIGGER fail_creator_agent_metadata');

  const bound = await bindCreatorAgent(issued.binding_code, device);
  assert.ok(bound.agent_token);
  const usedReceipt = await getCreatorAgentBindingCodeRecovery(1, 'safe-account', requestId);
  assert.equal(usedReceipt.status, 'used', 'a consumed binding code cannot be recovered');
  const clearedCiphertext = await queryOne<{ ciphertext: string | null; iv: string | null; auth_tag: string | null }>(
    'SELECT ciphertext,iv,auth_tag FROM creator_agent_binding_code_recovery WHERE binding_code_id=(SELECT id FROM creator_agent_binding_codes WHERE code_hash=?)',
    [stored.code_hash],
  );
  assert.deepEqual(clearedCiphertext, { ciphertext: null, iv: null, auth_tag: null }, 'successful device binding erases its recovery ciphertext');
  await assert.rejects(() => createCreatorAgentBindingCode(1, 'safe-account', 5, requestId), (error: unknown) => (error as { statusCode?: number }).statusCode === 410,
    'replay of a used request key cannot revive the consumed code');
  await assert.rejects(() => bindCreatorAgent(issued.binding_code, { device_id: 'other-device' }), /无效、已使用或已过期/);

  await heartbeatCreatorAgent({
    agent_id: bound.agent_id, account_id: 'safe-account', device_name: '测试 Mac', os: 'darwin arm64',
    agent_version: '2.11.0-agent', protocol_version: 1, browser_login_status: 'valid', browser_type: 'chrome',
    browser_version: '150.0', browser_engine: 'chromium', browser_runtime: 'system', session_mode: 'persistent', compatibility_status: 'compatible',
  }, `Bearer ${bound.agent_token}`);
  const agentRow = await queryOne<Record<string, unknown>>(
    'SELECT browser_type,browser_engine,browser_runtime,browser_session_mode,browser_compatibility,browser_login_status FROM creator_agents WHERE id=?',
    [bound.agent_id],
  );
  assert.deepEqual(agentRow, {
    browser_type: 'chrome', browser_engine: 'chromium', browser_runtime: 'system',
    browser_session_mode: 'persistent', browser_compatibility: 'compatible', browser_login_status: 'valid',
  });
  await assert.rejects(() => heartbeatCreatorAgent({ agent_id: bound.agent_id, account_id: 'safe-account', protocol_version: 2 }, `Bearer ${bound.agent_token}`), /协议版本不受支持/);

  const concurrentCode = await createCreatorAgentBindingCode(1, 'concurrent-account', 5, randomUUID());
  const concurrentBinding = await Promise.allSettled([
    bindCreatorAgent(concurrentCode.binding_code, { device_id: 'concurrent-device-a' }),
    bindCreatorAgent(concurrentCode.binding_code, { device_id: 'concurrent-device-b' }),
  ]);
  assert.equal(concurrentBinding.filter((result) => result.status === 'fulfilled').length, 1, 'concurrent consumers can claim a one-time code only once');
  assert.equal(concurrentBinding.filter((result) => result.status === 'rejected').length, 1);
  const concurrentAgentCount = await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM creator_agents WHERE user_id=1 AND account_id=?', ['concurrent-account'],
  );
  assert.equal(Number(concurrentAgentCount?.count), 1, 'concurrent code consumption registers exactly one device');

  const bindResultRequestId=randomUUID();
  const bindResultRecoverySecret=randomBytes(32).toString('base64url');
  const bindResultCode=await createCreatorAgentBindingCode(1,'bind-result-account',5,randomUUID());
  const bindResultDevice={device_id:'bind-result-device',device_name:'结果恢复测试设备',agent_version:'2.14.7-agent',protocol_version:1};
  const sameRequestResults=await Promise.all([
    bindCreatorAgent(bindResultCode.binding_code,bindResultDevice,{request_id:bindResultRequestId,recovery_secret:bindResultRecoverySecret}),
    bindCreatorAgent(bindResultCode.binding_code,bindResultDevice,{request_id:bindResultRequestId,recovery_secret:bindResultRecoverySecret}),
  ]);
  assert.equal(sameRequestResults.length,2,'concurrent idempotent calls both receive a result');
  assert.deepEqual(sameRequestResults[0],sameRequestResults[1],'concurrent same-key requests return one stable token result');
  assert.equal(sameRequestResults[0].recovery_supported,true);
  const bindResultReceipt=await queryOne<{ciphertext:string|null;recovery_secret_hash:string;staged_token_hash:string;acknowledged_at:string|null}>(
    'SELECT ciphertext,recovery_secret_hash,staged_token_hash,acknowledged_at FROM creator_agent_bind_result_recovery WHERE request_id_hash=?',
    [createHash('sha256').update(bindResultRequestId).digest('hex')],
  );
  assert(bindResultReceipt?.ciphertext);
  assert.notEqual(bindResultReceipt.recovery_secret_hash,bindResultRecoverySecret,'the capability is hashed at rest');
  assert.equal(bindResultReceipt.acknowledged_at,null);
  assert.notEqual(bindResultReceipt.staged_token_hash,sameRequestResults[0].agent_token,'the active credential column contains only a one-way hash');
  await assert.rejects(
    () => bindCreatorAgent(bindResultCode.binding_code,bindResultDevice,{request_id:bindResultRequestId,recovery_secret:randomBytes(32).toString('base64url')}),
    (error:unknown)=>(error as {statusCode?:number}).statusCode===404,
    'request ID alone or a wrong recovery capability cannot retrieve the staged token',
  );
  await assert.rejects(
    () => bindCreatorAgent(bindResultCode.binding_code,{...bindResultDevice,device_name:'different'},{request_id:bindResultRequestId,recovery_secret:bindResultRecoverySecret}),
    (error:unknown)=>(error as {statusCode?:number}).statusCode===409,
    'a recovery request cannot change its committed payload',
  );
  await acknowledgeCreatorAgentBindResult(bindResultRequestId,bindResultRecoverySecret);
  await acknowledgeCreatorAgentBindResult(bindResultRequestId,bindResultRecoverySecret);
  const acknowledgedReceipt=await queryOne<{ciphertext:string|null;acknowledged_at:string|null}>(
    'SELECT ciphertext,acknowledged_at FROM creator_agent_bind_result_recovery WHERE request_id_hash=?',
    [createHash('sha256').update(bindResultRequestId).digest('hex')],
  );
  assert.equal(acknowledgedReceipt?.ciphertext,null,'acknowledgement erases the recoverable credential ciphertext');
  assert.equal(typeof acknowledgedReceipt?.acknowledged_at,'string','acknowledgement is idempotently recorded');
  const recoveredAgent=await heartbeatCreatorAgent({agent_id:sameRequestResults[0].agent_id,account_id:'bind-result-account',protocol_version:1},`Bearer ${sameRequestResults[0].agent_token}`);
  assert.equal(recoveredAgent.success,true,'the acknowledged credential authenticates normally');
  await assert.rejects(
    () => bindCreatorAgent(bindResultCode.binding_code,bindResultDevice,{request_id:bindResultRequestId,recovery_secret:bindResultRecoverySecret}),
    (error:unknown)=>(error as {statusCode?:number}).statusCode===410,
    'an acknowledged token cannot be resurrected by replaying the consumed code',
  );

  const failedBindRequestId=randomUUID();
  const failedBindSecret=randomBytes(32).toString('base64url');
  const failedBindCode=await createCreatorAgentBindingCode(1,'bind-result-rollback-account',5,randomUUID());
  await execute(`CREATE TRIGGER fail_creator_agent_bind_receipt BEFORE INSERT ON creator_agent_bind_result_recovery
    BEGIN SELECT RAISE(ABORT, 'injected bind receipt failure'); END`);
  await assert.rejects(() => bindCreatorAgent(failedBindCode.binding_code,{device_id:'bind-result-rollback-device'},{request_id:failedBindRequestId,recovery_secret:failedBindSecret}),/injected bind receipt failure/);
  const failedBindState=await queryOne<{used_at:string|null;agent_count:number}>(`SELECT c.used_at,(SELECT COUNT(*) FROM creator_agents WHERE device_id='bind-result-rollback-device') agent_count
    FROM creator_agent_binding_codes c WHERE c.code_hash=?`,[createHash('sha256').update(failedBindCode.binding_code).digest('hex')]);
  assert.equal(failedBindState?.used_at,null,'receipt persistence failure rolls back one-time code consumption');
  assert.equal(Number(failedBindState?.agent_count),0,'receipt persistence failure rolls back the agent insert');
  await execute('DROP TRIGGER fail_creator_agent_bind_receipt');

  const missingKeyCode=await createCreatorAgentBindingCode(1,'bind-result-missing-key-account',5);
  const missingKeyRequestId=randomUUID();
  const missingKeyRecoverySecret=randomBytes(32).toString('base64url');
  process.env.XMT_CREATOR_AGENT_BINDING_KEY_V1='';
  await assert.rejects(
    () => bindCreatorAgent(missingKeyCode.binding_code,{device_id:'bind-result-missing-key-device'},{request_id:missingKeyRequestId,recovery_secret:missingKeyRecoverySecret}),
    (error:unknown)=>(error as {statusCode?:number}).statusCode===503,
    'a new keyed bind fails closed if result encryption is unavailable',
  );
  process.env.XMT_CREATOR_AGENT_BINDING_KEY_V1=recoverySecret;
  const missingKeyCodeState=await queryOne<{used_at:string|null;agent_count:number}>(`SELECT c.used_at,(SELECT COUNT(*) FROM creator_agents WHERE device_id='bind-result-missing-key-device') agent_count
    FROM creator_agent_binding_codes c WHERE c.code_hash=?`,[createHash('sha256').update(missingKeyCode.binding_code).digest('hex')]);
  assert.equal(missingKeyCodeState?.used_at,null,'a missing key does not consume the binding code');
  assert.equal(Number(missingKeyCodeState?.agent_count),0,'a missing key does not create an Agent record');

  const expiredBindCode=await createCreatorAgentBindingCode(1,'bind-result-expiry-account',5,randomUUID());
  const expiredBindRequestId=randomUUID();
  const expiredBindSecret=randomBytes(32).toString('base64url');
  const expiredBindResult=await bindCreatorAgent(expiredBindCode.binding_code,{device_id:'bind-result-expiry-device'},{request_id:expiredBindRequestId,recovery_secret:expiredBindSecret});
  await execute("UPDATE creator_agent_bind_result_recovery SET expires_at='2000-01-01T00:00:00.000Z' WHERE request_id_hash=?",[createHash('sha256').update(expiredBindRequestId).digest('hex')]);
  await assert.rejects(
    () => bindCreatorAgent(expiredBindCode.binding_code,{device_id:'bind-result-expiry-device'},{request_id:expiredBindRequestId,recovery_secret:expiredBindSecret}),
    (error:unknown)=>(error as {statusCode?:number}).statusCode===410,
    'expired bind-result receipts cannot return the credential again',
  );
  const expiredBindReceipt=await queryOne<{ciphertext:string|null}>(
    'SELECT ciphertext FROM creator_agent_bind_result_recovery WHERE request_id_hash=?',[createHash('sha256').update(expiredBindRequestId).digest('hex')],
  );
  assert.equal(expiredBindReceipt?.ciphertext,null,'expiration erases the encrypted token receipt');
  assert.ok(expiredBindResult.agent_token,'the original successful response remains available to the submitting client before expiry');

  const expiredRequestId = randomUUID();
  const expired = await createCreatorAgentBindingCode(1, 'expired-account', 5, expiredRequestId);
  await execute(`UPDATE creator_agent_binding_codes SET expires_at=datetime('now','-1 minute') WHERE code_hash=?`, [createHash('sha256').update(expired.binding_code).digest('hex')]);
  await execute(`UPDATE creator_agent_binding_code_recovery SET expires_at=datetime('now','-1 minute') WHERE request_id_hash=?`, [createHash('sha256').update(expiredRequestId).digest('hex')]);
  assert.equal((await getCreatorAgentBindingCodeRecovery(1, 'expired-account', expiredRequestId)).status, 'expired');
  await assert.rejects(() => createCreatorAgentBindingCode(1, 'expired-account', 5, expiredRequestId), (error: unknown) => (error as { statusCode?: number }).statusCode === 410,
    'an expired idempotency key cannot create a replacement code');

  delete process.env.XMT_CREATOR_AGENT_BINDING_KEY_V1;
  const legacy = await createCreatorAgentBindingCode(1, 'legacy-client-account', 5);
  assert.equal(legacy.one_time, true, 'legacy unkeyed clients remain compatible');
  const legacyReceipt = await queryOne<{ count: number }>(
    'SELECT COUNT(*) AS count FROM creator_agent_binding_code_recovery r JOIN creator_agent_binding_codes c ON c.id=r.binding_code_id WHERE c.account_id=?',
    ['legacy-client-account'],
  );
  assert.equal(Number(legacyReceipt?.count), 0, 'legacy unkeyed codes do not create incomplete recovery receipts');

  console.log('Creator Agent binding tests passed: encrypted same-key recovery, actor/account isolation, fail-closed key handling, atomic one-time consumption, device metadata, and legacy compatibility.');
} finally {
  db.close();
  try { rmSync(root, { recursive: true, force: true }); } catch { /* remove only the isolated temporary test directory */ }
}
