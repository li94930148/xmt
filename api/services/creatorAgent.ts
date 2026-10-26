import crypto from "node:crypto";
import bcrypt from "bcrypt";
import {
  execute,
  executeInsert,
  queryAll,
  queryOne,
  runInTransaction,
  type TransactionContext,
} from "../database/utils.js";
type AgentRow = {
  id: number;
  user_id: number;
  platform: string;
  account_id: string;
  token_hash: string;
};
const bindingHash=(code:string)=>crypto.createHash('sha256').update(code).digest('hex');
const key = (token: string) => crypto.createHash('sha256').update(token).digest();
const bindingRecoveryKeyVersion = 1;
const bindingRequestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bindRecoverySecretPattern = /^[A-Za-z0-9_-]{43}$/;
const bindResultReceiptLifetimeMs = 24 * 60 * 60_000;
const bindingRecoveryUnavailable = () => Object.assign(new Error('绑定码安全恢复暂不可用，请联系管理员完成服务配置'), { statusCode: 503 });
const bindingRecoveryKey = () => {
  const encoded = process.env.XMT_CREATOR_AGENT_BINDING_KEY_V1 || '';
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.byteLength !== 32 || decoded.toString('base64') !== encoded) throw bindingRecoveryUnavailable();
  return decoded;
};
const bindingRequestHash = (requestId: string) => crypto.createHash('sha256').update(requestId).digest('hex');
const bindRecoverySecretHash = (secret: string) => crypto.createHash('sha256').update(secret).digest('hex');
const sameHexDigest = (left: string, right: string) => {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === 32 && b.length === 32 && crypto.timingSafeEqual(a, b);
};
const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([name, item]) => `${JSON.stringify(name)}:${stableJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};
const bindResultPayloadHash = (codeHash: string, device: Record<string, unknown>) => crypto.createHash('sha256').update(stableJson({ codeHash, device })).digest('hex');
const bindResultAad = (requestHash: string, codeHash: string, payloadHash: string, agentId: number, expiresAt: string) => Buffer.from(`${requestHash}:${codeHash}:${payloadHash}:${agentId}:${expiresAt}`);
type BindResultRecoveryRow = {
  request_id_hash: string; recovery_secret_hash: string; payload_hash: string; code_hash: string;
  agent_id: number; previous_token_hash: string | null; staged_token_hash: string; staged_encryption_key_hash: string;
  key_version: number; iv: string | null; auth_tag: string | null; ciphertext: string | null;
  expires_at: string; acknowledged_at: string | null; active_token_hash?: string | null;
};
const encryptBindResult = (value: unknown, secret: Buffer, aad: Buffer) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
};
const decryptBindResult = (row: BindResultRecoveryRow, secret: Buffer) => {
  if (row.key_version !== bindingRecoveryKeyVersion || !row.iv || !row.auth_tag || !row.ciphertext) throw bindingRecoveryUnavailable();
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', secret, Buffer.from(row.iv, 'base64'));
    decipher.setAAD(bindResultAad(row.request_id_hash, row.code_hash, row.payload_hash, row.agent_id, row.expires_at));
    decipher.setAuthTag(Buffer.from(row.auth_tag, 'base64'));
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8')) as {
      response: { agent_id: number; agent_token: string; platform: string; account_id: string; device_id: string; recovery_supported: true };
      device: Record<string, unknown>;
    };
  } catch {
    throw bindingRecoveryUnavailable();
  }
};
const normalizeBindRequestId = (requestId: unknown) => {
  if (typeof requestId !== 'string' || !bindingRequestIdPattern.test(requestId.trim().toLowerCase())) {
    throw Object.assign(new Error('绑定请求编号无效'), { statusCode: 400 });
  }
  return requestId.trim().toLowerCase();
};
const validateBindRecoverySecret = (secret: unknown) => {
  if (typeof secret !== 'string' || !bindRecoverySecretPattern.test(secret)) {
    throw Object.assign(new Error('绑定恢复凭据无效'), { statusCode: 400 });
  }
  return secret;
};
const bindingPayloadHash = (accountId: string, ttlMinutes: number) => crypto.createHash('sha256').update(JSON.stringify({ accountId, ttlMinutes })).digest('hex');
const bindingRecoveryAad = (actorId: number, requestHash: string, accountId: string, expiresAt: string) => Buffer.from(`${actorId}:${requestHash}:${accountId}:${expiresAt}`);
const encryptBindingCode = (code: string, secret: Buffer, aad: Buffer) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secret, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
};
type BindingRecoveryRow = {
  actor_id:number; account_id:string; payload_hash:string; request_id_hash:string; key_version:number;
  iv:string|null; auth_tag:string|null; ciphertext:string|null; expires_at:string; code_expires_at:string; used_at:string|null;
};
const decryptBindingCode = (row: BindingRecoveryRow, secret: Buffer) => {
  if (row.key_version !== bindingRecoveryKeyVersion || !row.iv || !row.auth_tag || !row.ciphertext) throw bindingRecoveryUnavailable();
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', secret, Buffer.from(row.iv, 'base64'));
    decipher.setAAD(bindingRecoveryAad(row.actor_id, row.request_id_hash, row.account_id, row.expires_at));
    decipher.setAuthTag(Buffer.from(row.auth_tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(row.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw bindingRecoveryUnavailable();
  }
};
const normalizeBindingTtl = (ttlMinutes: number) => Math.max(1, Math.min(30, Math.floor(Number.isFinite(ttlMinutes) ? ttlMinutes : 10)));

async function createLegacyCreatorAgentBindingCode(userId:number,accountId:string,ttlMinutes=10){if(!accountId)throw Object.assign(new Error('account_id 必填'),{statusCode:400});const code=crypto.randomBytes(18).toString('base64url');const expiresAt=new Date(Date.now()+Math.max(1,Math.min(30,ttlMinutes))*60_000).toISOString();await executeInsert('INSERT INTO creator_agent_binding_codes(user_id,platform,account_id,code_hash,expires_at)VALUES(?,?,?,?,?)',[userId,'douyin',accountId,bindingHash(code),expiresAt]);return{binding_code:code,expires_at:expiresAt,one_time:true as const};}

export async function createCreatorAgentBindingCode(userId:number,accountId:string,ttlMinutes=10,requestId?:string){
  const normalizedAccountId = accountId.trim();
  if(!normalizedAccountId)throw Object.assign(new Error('account_id 必填'),{statusCode:400});
  const ttl = normalizeBindingTtl(ttlMinutes);
  if (requestId === undefined) return createLegacyCreatorAgentBindingCode(userId, normalizedAccountId, ttl);
  if (typeof requestId !== 'string' || !requestId.trim()) throw Object.assign(new Error('绑定码请求编号无效'), { statusCode: 400 });
  const normalizedRequestId = requestId.trim().toLowerCase();
  if (!bindingRequestIdPattern.test(normalizedRequestId)) throw Object.assign(new Error('绑定码请求编号无效'), { statusCode: 400 });

  const secret = bindingRecoveryKey();
  const requestHash = bindingRequestHash(normalizedRequestId);
  const payloadHash = bindingPayloadHash(normalizedAccountId, ttl);
  const code = crypto.randomBytes(18).toString('base64url');
  const expiresAt = new Date(Date.now() + ttl * 60_000).toISOString();
  const encrypted = encryptBindingCode(code, secret, bindingRecoveryAad(userId, requestHash, normalizedAccountId, expiresAt));

  const recoverExisting = async () => {
    const row = await queryOne<BindingRecoveryRow>(`SELECT r.actor_id,r.account_id,r.payload_hash,r.request_id_hash,r.key_version,r.iv,r.auth_tag,r.ciphertext,r.expires_at,c.expires_at code_expires_at,c.used_at
      FROM creator_agent_binding_code_recovery r JOIN creator_agent_binding_codes c ON c.id=r.binding_code_id
      WHERE r.request_id_hash=?`, [requestHash]);
    if (!row) return null;
    if (row.actor_id !== userId || row.account_id !== normalizedAccountId || row.payload_hash !== payloadHash) {
      throw Object.assign(new Error('该绑定码请求编号已用于其他账号或请求内容'), { statusCode: 409 });
    }
    if (row.used_at || Date.parse(row.expires_at) <= Date.now() || Date.parse(row.code_expires_at) <= Date.now()) {
      await execute(`UPDATE creator_agent_binding_code_recovery SET iv=NULL,auth_tag=NULL,ciphertext=NULL WHERE request_id_hash=?`, [requestHash]);
      throw Object.assign(new Error('原绑定码已使用或已过期，请发起新的绑定码请求'), { statusCode: 410 });
    }
    if (row.expires_at !== row.code_expires_at) throw bindingRecoveryUnavailable();
    return { binding_code: decryptBindingCode(row, secret), expires_at: row.expires_at, one_time: true as const };
  };

  try {
    return await runInTransaction(async (tx) => {
      const existing = await tx.queryOne<BindingRecoveryRow>(`SELECT r.actor_id,r.account_id,r.payload_hash,r.request_id_hash,r.key_version,r.iv,r.auth_tag,r.ciphertext,r.expires_at,c.expires_at code_expires_at,c.used_at
        FROM creator_agent_binding_code_recovery r JOIN creator_agent_binding_codes c ON c.id=r.binding_code_id
        WHERE r.request_id_hash=?`, [requestHash]);
      if (existing) {
        if (existing.actor_id !== userId || existing.account_id !== normalizedAccountId || existing.payload_hash !== payloadHash) {
          throw Object.assign(new Error('该绑定码请求编号已用于其他账号或请求内容'), { statusCode: 409 });
        }
        if (existing.used_at || Date.parse(existing.expires_at) <= Date.now() || Date.parse(existing.code_expires_at) <= Date.now()) {
          throw Object.assign(new Error('原绑定码已使用或已过期，请发起新的绑定码请求'), { statusCode: 410 });
        }
        if (existing.expires_at !== existing.code_expires_at) throw bindingRecoveryUnavailable();
        return { binding_code: decryptBindingCode(existing, secret), expires_at: existing.expires_at, one_time: true as const };
      }

      // Keep at most one outstanding code per creator account; prior one-time codes become terminal.
      await tx.execute(`UPDATE creator_agent_binding_code_recovery SET iv=NULL,auth_tag=NULL,ciphertext=NULL
        WHERE binding_code_id IN (SELECT id FROM creator_agent_binding_codes
          WHERE user_id=? AND platform='douyin' AND account_id=? AND used_at IS NULL)`, [userId, normalizedAccountId]);
      await tx.execute(`UPDATE creator_agent_binding_codes SET used_at=CURRENT_TIMESTAMP
        WHERE user_id=? AND platform='douyin' AND account_id=? AND used_at IS NULL`, [userId, normalizedAccountId]);
      const bindingCodeId = await tx.executeInsert('INSERT INTO creator_agent_binding_codes(user_id,platform,account_id,code_hash,expires_at)VALUES(?,?,?,?,?)',[userId,'douyin',normalizedAccountId,bindingHash(code),expiresAt]);
      await tx.execute(`INSERT INTO creator_agent_binding_code_recovery(request_id_hash,actor_id,account_id,payload_hash,binding_code_id,key_version,iv,auth_tag,ciphertext,expires_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)`, [requestHash,userId,normalizedAccountId,payloadHash,bindingCodeId,bindingRecoveryKeyVersion,encrypted.iv,encrypted.authTag,encrypted.ciphertext,expiresAt]);
      return { binding_code: code, expires_at: expiresAt, one_time: true as const };
    });
  } catch (error) {
    // A concurrent same-key request can win the unique insert; recover its committed result.
    const recovered = await recoverExisting();
    if (recovered) return recovered;
    throw error;
  }
}

export async function getCreatorAgentBindingCodeRecovery(actorId:number,accountId:string,requestId:string){
  const normalizedRequestId = typeof requestId === 'string' ? requestId.trim().toLowerCase() : '';
  if (!bindingRequestIdPattern.test(normalizedRequestId)) throw Object.assign(new Error('绑定码请求编号无效'), { statusCode: 400 });
  const requestHash = bindingRequestHash(normalizedRequestId);
  const row = await queryOne<BindingRecoveryRow>(`SELECT r.actor_id,r.account_id,r.payload_hash,r.request_id_hash,r.key_version,r.iv,r.auth_tag,r.ciphertext,r.expires_at,c.expires_at code_expires_at,c.used_at
    FROM creator_agent_binding_code_recovery r JOIN creator_agent_binding_codes c ON c.id=r.binding_code_id
    WHERE r.request_id_hash=? AND r.actor_id=? AND r.account_id=?`, [requestHash,actorId,accountId]);
  if (!row) return { status: 'not_found' as const };
  if (row.used_at) {
    await execute('UPDATE creator_agent_binding_code_recovery SET iv=NULL,auth_tag=NULL,ciphertext=NULL WHERE request_id_hash=? AND actor_id=? AND account_id=?', [requestHash,actorId,accountId]);
    return { status: 'used' as const, expires_at: row.expires_at };
  }
  if (Date.parse(row.expires_at) <= Date.now() || Date.parse(row.code_expires_at) <= Date.now()) {
    await execute('UPDATE creator_agent_binding_code_recovery SET iv=NULL,auth_tag=NULL,ciphertext=NULL WHERE request_id_hash=? AND actor_id=? AND account_id=?', [requestHash,actorId,accountId]);
    return { status: 'expired' as const, expires_at: row.expires_at };
  }
  if (row.expires_at !== row.code_expires_at) throw bindingRecoveryUnavailable();
  return { status: 'active' as const, binding_code: decryptBindingCode(row, bindingRecoveryKey()), expires_at: row.expires_at, one_time: true as const };
}

type AgentRegistrationCredentials = { token: string; tokenHash: string; encryptionKeyHash: string };
const createAgentRegistrationCredentials = async (): Promise<AgentRegistrationCredentials> => {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = await bcrypt.hash(token, 12);
  return { token, tokenHash, encryptionKeyHash: crypto.createHash('sha256').update(key(token)).digest('hex') };
};

async function registerCreatorAgentWith(
  writer: Pick<TransactionContext, 'queryOne' | 'execute' | 'executeInsert'>,
  userId: number,
  platform: string,
  accountId: string,
  deviceId: string,
  credentials: AgentRegistrationCredentials,
  preserveExistingCredentials = false,
) {
  if (platform !== "douyin" || !accountId || !deviceId)
    throw Object.assign(new Error("platform、account_id 和 device_id 必填"), {
      statusCode: 400,
    });
  const existing = await writer.queryOne<{ id: number; token_hash: string }>(
    "SELECT id,token_hash FROM creator_agents WHERE user_id=? AND platform=? AND device_id=?",
    [userId, platform, deviceId],
  );
  let id: number;
  if (existing) {
    id = existing.id;
    if (!preserveExistingCredentials) {
      await writer.execute(
        "UPDATE creator_agents SET account_id=?,token_hash=?,encryption_key_hash=?,last_active_at=CURRENT_TIMESTAMP WHERE id=?",
        [accountId, credentials.tokenHash, credentials.encryptionKeyHash, id],
      );
    }
  } else
    id = await writer.executeInsert(
      "INSERT INTO creator_agents(user_id,platform,account_id,device_id,token_hash,encryption_key_hash,last_active_at)VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)",
      [userId, platform, accountId, deviceId, credentials.tokenHash, credentials.encryptionKeyHash],
    );
  return {
    agent_id: id,
    agent_token: credentials.token,
    platform,
    account_id: accountId,
    device_id: deviceId,
  };
}

export async function registerCreatorAgent(userId: number, platform: string, accountId: string, deviceId: string) {
  const credentials = await createAgentRegistrationCredentials();
  return registerCreatorAgentWith({ queryOne, execute, executeInsert }, userId, platform, accountId, deviceId, credentials);
}

async function readAgentBindResultRecovery(requestId:string,recoverySecret:string,payloadHash:string,codeHash:string){
  const requestHash=bindingRequestHash(requestId);
  const row=await queryOne<BindResultRecoveryRow>(`SELECT r.request_id_hash,r.recovery_secret_hash,r.payload_hash,r.code_hash,r.agent_id,r.previous_token_hash,r.staged_token_hash,r.staged_encryption_key_hash,r.key_version,r.iv,r.auth_tag,r.ciphertext,r.expires_at,r.acknowledged_at,a.token_hash active_token_hash
    FROM creator_agent_bind_result_recovery r LEFT JOIN creator_agents a ON a.id=r.agent_id WHERE r.request_id_hash=?`,[requestHash]);
  if(!row)return null;
  if(!sameHexDigest(row.recovery_secret_hash,bindRecoverySecretHash(recoverySecret)))throw Object.assign(new Error('绑定请求不存在或恢复凭据无效'),{statusCode:404});
  if(row.payload_hash!==payloadHash||row.code_hash!==codeHash)throw Object.assign(new Error('该绑定请求编号已用于其他设备或请求内容'),{statusCode:409});
  if(row.acknowledged_at||Date.parse(row.expires_at)<=Date.now()){
    await execute('UPDATE creator_agent_bind_result_recovery SET iv=NULL,auth_tag=NULL,ciphertext=NULL WHERE request_id_hash=?',[requestHash]);
    throw Object.assign(new Error('绑定结果已确认或恢复期限已过，不能再次取回凭据'),{statusCode:410});
  }
  const activeTokenMatches=row.previous_token_hash?row.active_token_hash===row.previous_token_hash:row.active_token_hash===row.staged_token_hash;
  if(!activeTokenMatches){
    await execute('UPDATE creator_agent_bind_result_recovery SET iv=NULL,auth_tag=NULL,ciphertext=NULL WHERE request_id_hash=?',[requestHash]);
    throw Object.assign(new Error('该设备已完成其他绑定，原绑定结果不能再恢复'),{statusCode:410});
  }
  const secret=bindingRecoveryKey();
  const receipt=decryptBindResult(row,secret);
  return receipt.response;
}

export async function bindCreatorAgent(code:string,device:Record<string,unknown>,recovery?:{request_id:unknown;recovery_secret:unknown}){
  if(!code)throw Object.assign(new Error('绑定码必填'),{statusCode:400});
  const deviceId=String(device.device_id||'');
  if(!deviceId)throw Object.assign(new Error('设备标识必填'),{statusCode:400});
  const codeHash=bindingHash(code);
  const normalizedRequestId=recovery?normalizeBindRequestId(recovery.request_id):undefined;
  const recoverySecret=recovery?validateBindRecoverySecret(recovery.recovery_secret):undefined;
  const requestHash=normalizedRequestId?bindingRequestHash(normalizedRequestId):undefined;
  const payloadHash=normalizedRequestId?bindResultPayloadHash(codeHash,device):undefined;
  if(normalizedRequestId&&recoverySecret){
    const recovered=await readAgentBindResultRecovery(normalizedRequestId,recoverySecret,payloadHash!,codeHash);
    if(recovered)return recovered;
    // The receipt key protects the exact request payload; new keyed clients fail closed if the service key is absent.
    bindingRecoveryKey();
  }
  const candidate=await queryOne<{id:number;user_id:number;platform:string;account_id:string;expires_at:string;used_at:string|null}>(
    'SELECT id,user_id,platform,account_id,expires_at,used_at FROM creator_agent_binding_codes WHERE code_hash=?',[codeHash],
  );
  if(!candidate||candidate.used_at||Date.parse(candidate.expires_at)<=Date.now())throw Object.assign(new Error('绑定码无效、已使用或已过期'),{statusCode:410});
  const credentials=await createAgentRegistrationCredentials();

  try{return await runInTransaction(async(tx)=>{
    const row=await tx.queryOne<{id:number;user_id:number;platform:string;account_id:string;expires_at:string;used_at:string|null}>(
      'SELECT id,user_id,platform,account_id,expires_at,used_at FROM creator_agent_binding_codes WHERE code_hash=?',[codeHash],
    );
    if(!row||row.used_at||Date.parse(row.expires_at)<=Date.now())throw Object.assign(new Error('绑定码无效、已使用或已过期'),{statusCode:410});
    const claimed=await tx.execute('UPDATE creator_agent_binding_codes SET used_at=CURRENT_TIMESTAMP WHERE id=? AND used_at IS NULL',[row.id]);
    if(claimed!==1)throw Object.assign(new Error('绑定码已被使用'),{statusCode:410});
    const existingAgent=normalizedRequestId?await tx.queryOne<{id:number;token_hash:string}>('SELECT id,token_hash FROM creator_agents WHERE user_id=? AND platform=? AND device_id=?',[row.user_id,row.platform,deviceId]):null;
    const bound=await registerCreatorAgentWith(tx,row.user_id,row.platform,row.account_id,deviceId,credentials,Boolean(normalizedRequestId));
    if(!normalizedRequestId||!recoverySecret||!requestHash||!payloadHash){
      await tx.execute(`UPDATE creator_agents SET device_name=?,os=?,agent_version=?,protocol_version=?,browser_type=?,browser_version=?,browser_engine=?,browser_runtime=?,browser_session_mode=?,browser_compatibility=? WHERE id=?`,[String(device.device_name||''),String(device.os||''),String(device.agent_version||''),Number(device.protocol_version)||1,String(device.browser_type||''),String(device.browser_version||''),String(device.browser_engine||''),String(device.browser_runtime||''),String(device.session_mode||''),String(device.compatibility_status||'not_tested'),bound.agent_id]);
      await tx.execute('UPDATE creator_agent_binding_code_recovery SET iv=NULL,auth_tag=NULL,ciphertext=NULL WHERE binding_code_id=?',[row.id]);
      return bound;
    }
    const response={...bound,recovery_supported:true as const};
    const expiresAt=new Date(Date.now()+bindResultReceiptLifetimeMs).toISOString();
    const secret=bindingRecoveryKey();
    const encrypted=encryptBindResult({response,device},secret,bindResultAad(requestHash,codeHash,payloadHash,bound.agent_id,expiresAt));
    await tx.execute(`INSERT INTO creator_agent_bind_result_recovery(request_id_hash,recovery_secret_hash,payload_hash,code_hash,agent_id,previous_token_hash,staged_token_hash,staged_encryption_key_hash,key_version,iv,auth_tag,ciphertext,expires_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,[requestHash,bindRecoverySecretHash(recoverySecret),payloadHash,codeHash,bound.agent_id,existingAgent?.token_hash??null,credentials.tokenHash,credentials.encryptionKeyHash,bindingRecoveryKeyVersion,encrypted.iv,encrypted.authTag,encrypted.ciphertext,expiresAt]);
    if(!existingAgent)await tx.execute(`UPDATE creator_agents SET device_name=?,os=?,agent_version=?,protocol_version=?,browser_type=?,browser_version=?,browser_engine=?,browser_runtime=?,browser_session_mode=?,browser_compatibility=? WHERE id=?`,[String(device.device_name||''),String(device.os||''),String(device.agent_version||''),Number(device.protocol_version)||1,String(device.browser_type||''),String(device.browser_version||''),String(device.browser_engine||''),String(device.browser_runtime||''),String(device.session_mode||''),String(device.compatibility_status||'not_tested'),bound.agent_id]);
    await tx.execute('UPDATE creator_agent_binding_code_recovery SET iv=NULL,auth_tag=NULL,ciphertext=NULL WHERE binding_code_id=?',[row.id]);
    return response;
  });}catch(error){
    if(normalizedRequestId&&recoverySecret&&payloadHash){
      const recovered=await readAgentBindResultRecovery(normalizedRequestId,recoverySecret,payloadHash,codeHash);
      if(recovered)return recovered;
    }
    throw error;
  }
}

export async function acknowledgeCreatorAgentBindResult(requestIdValue:unknown,recoverySecretValue:unknown){
  const requestId=normalizeBindRequestId(requestIdValue);
  const recoverySecret=validateBindRecoverySecret(recoverySecretValue);
  const requestHash=bindingRequestHash(requestId);
  const outcome=await runInTransaction(async(tx)=>{
    const row=await tx.queryOne<BindResultRecoveryRow>(`SELECT r.request_id_hash,r.recovery_secret_hash,r.payload_hash,r.code_hash,r.agent_id,r.previous_token_hash,r.staged_token_hash,r.staged_encryption_key_hash,r.key_version,r.iv,r.auth_tag,r.ciphertext,r.expires_at,r.acknowledged_at,a.token_hash active_token_hash
      FROM creator_agent_bind_result_recovery r LEFT JOIN creator_agents a ON a.id=r.agent_id WHERE r.request_id_hash=?`,[requestHash]);
    if(!row||!sameHexDigest(row.recovery_secret_hash,bindRecoverySecretHash(recoverySecret)))return 'not_found' as const;
    if(row.acknowledged_at)return 'acknowledged' as const;
    if(Date.parse(row.expires_at)<=Date.now()){
      await tx.execute('UPDATE creator_agent_bind_result_recovery SET iv=NULL,auth_tag=NULL,ciphertext=NULL WHERE request_id_hash=?',[requestHash]);
      return 'expired' as const;
    }
    const secret=bindingRecoveryKey();
    const receipt=decryptBindResult(row,secret);
    const expectedCurrentTokenHash=row.previous_token_hash||row.staged_token_hash;
    if(row.active_token_hash!==expectedCurrentTokenHash){
      await tx.execute('UPDATE creator_agent_bind_result_recovery SET iv=NULL,auth_tag=NULL,ciphertext=NULL WHERE request_id_hash=?',[requestHash]);
      return 'conflict' as const;
    }
    const device=receipt.device;
    const applied=await tx.execute(`UPDATE creator_agents SET account_id=?,token_hash=?,encryption_key_hash=?,device_name=?,os=?,agent_version=?,protocol_version=?,browser_type=?,browser_version=?,browser_engine=?,browser_runtime=?,browser_session_mode=?,browser_compatibility=?,last_active_at=CURRENT_TIMESTAMP WHERE id=? AND token_hash=?`,[
      receipt.response.account_id,row.staged_token_hash,row.staged_encryption_key_hash,String(device.device_name||''),String(device.os||''),String(device.agent_version||''),Number(device.protocol_version)||1,String(device.browser_type||''),String(device.browser_version||''),String(device.browser_engine||''),String(device.browser_runtime||''),String(device.session_mode||''),String(device.compatibility_status||'not_tested'),row.agent_id,expectedCurrentTokenHash,
    ]);
    if(applied!==1){
      await tx.execute('UPDATE creator_agent_bind_result_recovery SET iv=NULL,auth_tag=NULL,ciphertext=NULL WHERE request_id_hash=?',[requestHash]);
      return 'conflict' as const;
    }
    await tx.execute('UPDATE creator_agent_bind_result_recovery SET acknowledged_at=CURRENT_TIMESTAMP,iv=NULL,auth_tag=NULL,ciphertext=NULL WHERE request_id_hash=?',[requestHash]);
    return 'acknowledged' as const;
  });
  if(outcome==='not_found')throw Object.assign(new Error('绑定请求不存在或恢复凭据无效'),{statusCode:404});
  if(outcome==='expired')throw Object.assign(new Error('绑定恢复期限已过'),{statusCode:410});
  if(outcome==='conflict')throw Object.assign(new Error('该设备绑定状态已变化，请重新创建绑定码'),{statusCode:409});
}
export async function heartbeatCreatorAgent(body:Record<string,unknown>,authorization?:string){
  const token=authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const agent=await queryOne<AgentRow>("SELECT id,user_id,platform,account_id,token_hash FROM creator_agents WHERE id=?",[Number(body.agent_id)]);
  if(!token||!agent||!(await bcrypt.compare(token,agent.token_hash)))throw Object.assign(new Error('Agent 身份认证失败'),{statusCode:401});
  if(String(body.account_id||'')!==agent.account_id)throw Object.assign(new Error('Agent 账号绑定不匹配'),{statusCode:403});
  if(body.protocol_version!==1)throw Object.assign(new Error('Agent 协议版本不受支持'),{statusCode:400});
  await execute(`UPDATE creator_agents SET device_name=?,os=?,agent_version=?,protocol_version=?,browser_login_status=?,browser_type=?,browser_version=?,browser_engine=?,browser_runtime=?,browser_session_mode=?,browser_compatibility=?,last_heartbeat_at=CURRENT_TIMESTAMP,last_active_at=CURRENT_TIMESTAMP WHERE id=?`,[String(body.device_name||''),String(body.os||''),String(body.agent_version||''),Number(body.protocol_version)||1,String(body.browser_login_status||'unknown'),String(body.browser_type||''),String(body.browser_version||''),String(body.browser_engine||''),String(body.browser_runtime||''),String(body.session_mode||''),String(body.compatibility_status||'not_tested'),agent.id]);
  return{success:true,server_time:new Date().toISOString(),protocol_version:1};
}
const parse = <T>(value: string | null | undefined, fallback: T): T => {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};
export async function getCreatorCenterData(userId: number, accountId?: string) {
  const filter = accountId ? " AND account_id=?" : "";
  const params: unknown[] = accountId ? [userId, accountId] : [userId];
  const account = await queryOne<{
    account_id: string;
    snapshot_time: string;
    account_json: string;
    source: string;
  }>(
    `SELECT account_id,snapshot_time,account_json,source FROM creator_center_data WHERE user_id=?${filter} ORDER BY snapshot_time DESC LIMIT 1`,
    params,
  );
  if (!account)
    return {
      account: null,
      works: [],
      dashboard: null,
      fans: null,
      history: [],
      data_sources: ["local_creator_center"],
    };
  const base = [userId, account.account_id];
  const [works, dashboard, fans, history] = await Promise.all([
    queryAll<{ work_json: string; detail_json: string; snapshot_time: string }>(
      "SELECT work_json,detail_json,snapshot_time FROM creator_work_data WHERE user_id=? AND account_id=? AND snapshot_time=(SELECT MAX(snapshot_time) FROM creator_work_data WHERE user_id=? AND account_id=?)",
      [...base, ...base],
    ),
    queryOne<{
      dashboard_json: string;
      content_analysis_json: string;
      snapshot_time: string;
    }>(
      "SELECT dashboard_json,content_analysis_json,snapshot_time FROM creator_dashboard_snapshots WHERE user_id=? AND account_id=? ORDER BY snapshot_time DESC LIMIT 1",
      base,
    ),
    queryOne<{ fans_json: string; snapshot_time: string }>(
      "SELECT fans_json,snapshot_time FROM creator_fans_snapshots WHERE user_id=? AND account_id=? ORDER BY snapshot_time DESC LIMIT 1",
      base,
    ),
    queryAll<{ snapshot_time: string; source: string }>(
      "SELECT snapshot_time,source FROM creator_data_snapshots WHERE user_id=? AND account_id=? ORDER BY snapshot_time DESC LIMIT 90",
      base,
    ),
  ]);
  return {
    account: {
      ...parse(account.account_json, {}),
      account_id: account.account_id,
      snapshot_time: account.snapshot_time,
      source: account.source,
    },
    works: works.map((row) => ({
      ...parse(row.work_json, {}),
      detail: parse(row.detail_json, null),
      snapshot_time: row.snapshot_time,
    })),
    dashboard: dashboard
      ? {
          ...parse(dashboard.dashboard_json, {}),
          content_analysis: parse(dashboard.content_analysis_json, {}),
          snapshot_time: dashboard.snapshot_time,
        }
      : null,
    fans: fans
      ? { ...parse(fans.fans_json, {}), snapshot_time: fans.snapshot_time }
      : null,
    history,
    data_sources: ["local_creator_center"],
  };
}
