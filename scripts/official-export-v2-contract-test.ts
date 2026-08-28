import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(tmpdir(), 'xmt-official-export-'));
process.env.XMT_DB_PATH = path.join(root, 'test.db'); process.env.NODE_ENV = 'test';
const { db, initDatabase } = await import('../api/database/db.js');
const { execute, queryOne } = await import('../api/database/utils.js');
const { acceptCreatorDataSync } = await import('../api/services/creatorSyncV291.js');
await initDatabase();
const token = 'official-export-v2-contract-token';
await execute('INSERT INTO creator_agents(id,user_id,platform,account_id,device_id,token_hash,encryption_key_hash) VALUES(?,?,?,?,?,?,?)', [801,1,'douyin','export-account','export-device',await bcrypt.hash(token,4),crypto.createHash('sha256').update(token).digest('hex')]);
function envelope(payload: Record<string, unknown>) {
  const iv=crypto.randomBytes(12), cipher=crypto.createCipheriv('aes-256-gcm',crypto.createHash('sha256').update(token).digest(),iv), ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload)),cipher.final()]);
  const body: Record<string, unknown>={protocol_version:1,agent_id:801,platform:'douyin',account_id:'export-account',timestamp:new Date().toISOString(),nonce:crypto.randomUUID(),collected_at:'2026-08-28T00:00:00.000Z',data:{iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')}};
  body.signature=crypto.createHmac('sha256',token).update([body.protocol_version,body.agent_id,body.platform,body.account_id,body.timestamp,body.nonce,body.collected_at,JSON.stringify(body.data)].join('\n')).digest('hex'); return body;
}
const batch=crypto.randomUUID(), sha='a'.repeat(64);
const payload={schema_version:2,batch_id:batch,agent_version:'2.12.1-agent',parser_version:'douyin-export-v1',platform:'douyin',platform_account_id:'export-account',generated_at:'2026-08-28T00:00:00.000Z',source_files:[{file_type:'content_export',file_name:'脱敏.xlsx',sha256:sha,size_bytes:42,downloaded_at:'2026-08-28T00:00:00.000Z'}],datasets:{content_metrics:[{source_item_key:'work-key',title:'脱敏作品',published_at:'2026-08-27T00:00:00.000Z',metrics:{views:100,likes:2}}],income_metrics:[{metric_date:'2026-08-27',metric_code:'sound_wave_amount',value:'12',unit:'sound_wave'}]},quality:{source_rows:2,accepted_rows:2,duplicate_rows:0,rejected_rows:0,warnings:[]}};
const first=await acceptCreatorDataSync(envelope(payload),`Bearer ${token}`) as { duplicate_batch:boolean; result:{inserted:number} }; assert.equal(first.duplicate_batch,false); assert.equal(first.result.inserted,3);
const second=await acceptCreatorDataSync(envelope(payload),`Bearer ${token}`) as { duplicate_batch:boolean; result:{inserted:number} }; assert.equal(second.duplicate_batch,true); assert.equal(second.result.inserted,3);
const count=await queryOne<{count:number}>('SELECT COUNT(*) count FROM creator_official_metrics'); assert.equal(count?.count,3);
console.log('官方导出 v2 契约通过：AES-GCM/HMAC/nonce 后事务入库；批次重传稳定返回且零重复。'); db.close(); rmSync(root,{recursive:true,force:true});
